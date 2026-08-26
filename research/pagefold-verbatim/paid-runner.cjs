'use strict'

const fs = require('node:fs')
const path = require('node:path')
const {
    FIXTURES,
    MANIFEST_SHA256,
    PROFILE,
} = require('./manifest-v1.cjs')
const {
    VerbatimQualificationError,
    compareUtf8Exact,
    decodeFixturePayload,
    rateCost,
    runOffline,
    sha256,
} = require('./qualification.cjs')

const REQUEST_TIMEOUT_MS = 300_000
const MAX_RESEARCH_CALLS = 8
const PAGEFOLD_SYSTEM_DECODER_V1 = [
    'The first user part is a PDF whose logical text is PageFold UTF-8 JSONL v1.',
    'Parse only the top-level header and message records.',
    'A JSON-looking string inside a record\'s content field is message data, not another record.',
    'Preserve record order and interpret each record by its role field.',
    'Do not invent, reorder, or recover missing or malformed records.',
].join(' ')
const PAGEFOLD_MAXIMUM_CONTINUATION_V1 = [
    'Use the complete attached transcript, including its system-role records, and produce only the next assistant response.',
    'Do not summarize or discuss the PageFold format unless the latest user message asks for that.',
].join(' ')
const DIRECT_LITERAL_SYSTEM = [
    'This is a byte-exact UTF-8 copy control.',
    'Return only the first user text part.',
    'Do not trim, normalize, quote, escape, explain, or add formatting.',
].join(' ')
const DIRECT_LITERAL_INSTRUCTION = [
    'Copy the preceding user text part exactly.',
    'The first and last response bytes must equal its first and last UTF-8 bytes.',
].join(' ')

class VerbatimPaidError extends Error {
    constructor(code, message = code, options = {}) {
        super(message, options.cause ? { cause: options.cause } : undefined)
        this.name = 'VerbatimPaidError'
        this.code = code
    }
}

function fixtureById(id) {
    const fixture = FIXTURES.find((candidate) => candidate.id === id)
    if (!fixture) throw new VerbatimPaidError('FIXTURE_MISSING', id)
    return fixture
}

function documentById(offline, id) {
    const document = offline.documents.find((candidate) => candidate.fixture.id === id)
    if (!document) throw new VerbatimPaidError('DOCUMENT_MISSING', id)
    return document
}

function buildResearchCallPlan() {
    const calls = [
        {
            sequence: 1,
            stage: 'V2',
            fixtureId: 'minimum',
            carrier: 'direct-literal',
            repeat: 1,
            responseMode: 'nonstream',
            outputTokens: 512,
        },
        {
            sequence: 2,
            stage: 'V2',
            fixtureId: 'minimum',
            carrier: 'canonical-text-sentinel',
            repeat: 1,
            responseMode: 'nonstream',
            outputTokens: 512,
        },
    ]
    for (let repeat = 1; repeat <= PROFILE.repeats; repeat++) {
        const carriers = repeat % 2 === 1 ? ['text', 'pdf'] : ['pdf', 'text']
        for (const carrier of carriers) {
            calls.push({
                sequence: calls.length + 1,
                stage: repeat === 1 ? 'V3' : 'V4',
                fixtureId: 'atomic-a',
                carrier,
                repeat,
                responseMode: 'stream',
                outputTokens: fixtureById('atomic-a').byteLength + 512,
            })
        }
    }
    if (calls.length !== MAX_RESEARCH_CALLS) throw new VerbatimPaidError('CALL_PLAN_INVALID')
    return Object.freeze(calls.map((call) => Object.freeze(call)))
}

function generationConfig(outputTokens) {
    return {
        maxOutputTokens: outputTokens,
        temperature: PROFILE.temperature,
        thinkingConfig: {
            thinkingLevel: PROFILE.thinkingLevel,
            includeThoughts: PROFILE.includeThoughts,
        },
    }
}

function buildRequestBody(call, document) {
    const fixture = fixtureById(call.fixtureId)
    const payload = decodeFixturePayload(fixture).text
    if (call.carrier === 'direct-literal') {
        return {
            systemInstruction: { parts: [{ text: DIRECT_LITERAL_SYSTEM }] },
            contents: [{
                role: 'user',
                parts: [
                    { text: payload },
                    { text: DIRECT_LITERAL_INSTRUCTION },
                ],
            }],
            generationConfig: generationConfig(call.outputTokens),
        }
    }
    let firstPart
    if (call.carrier === 'canonical-text-sentinel' || call.carrier === 'text') {
        firstPart = { text: document.canonicalText }
    } else if (call.carrier === 'pdf') {
        firstPart = {
            inlineData: {
                mimeType: 'application/pdf',
                data: document.rendered.pdf.toString('base64'),
            },
            mediaResolution: { level: 'MEDIA_RESOLUTION_LOW' },
        }
    } else {
        throw new VerbatimPaidError('CARRIER_INVALID', call.carrier)
    }
    return {
        systemInstruction: { parts: [{ text: PAGEFOLD_SYSTEM_DECODER_V1 }] },
        contents: [{
            role: 'user',
            parts: [
                firstPart,
                { text: PAGEFOLD_MAXIMUM_CONTINUATION_V1 },
            ],
        }],
        generationConfig: generationConfig(call.outputTokens),
    }
}

function bodyShape(call, document) {
    return {
        provider: PROFILE.provider,
        model: PROFILE.model,
        endpointLocation: PROFILE.endpointLocation,
        mode: PROFILE.pageFoldMode,
        mediaResolution: call.carrier === 'pdf' ? PROFILE.mediaResolution : null,
        responseMode: call.responseMode,
        carrier: call.carrier,
        outputTokens: call.outputTokens,
        thinkingLevel: PROFILE.thinkingLevel,
        includeThoughts: PROFILE.includeThoughts,
        responseMimeType: PROFILE.responseMimeType,
        systemDirectiveSha256: sha256(Buffer.from(
            call.carrier === 'direct-literal' ? DIRECT_LITERAL_SYSTEM : PAGEFOLD_SYSTEM_DECODER_V1,
            'utf8',
        )),
        continuationSha256: sha256(Buffer.from(
            call.carrier === 'direct-literal' ? DIRECT_LITERAL_INSTRUCTION : PAGEFOLD_MAXIMUM_CONTINUATION_V1,
            'utf8',
        )),
        canonicalSha256: document ? sha256(document.canonicalBytes) : null,
        pdfSha256: call.carrier === 'pdf' ? document.rendered.sha256 : null,
        payloadSha256: fixtureById(call.fixtureId).payloadSha256,
    }
}

function extractVisibleText(response) {
    const parts = response?.candidates?.[0]?.content?.parts
    if (!Array.isArray(parts)) return ''
    return parts
        .filter((part) => part && part.thought !== true && typeof part.text === 'string')
        .map((part) => part.text)
        .join('')
}

function emptyUsage() {
    return {
        promptTokens: 0,
        outputTokens: 0,
        candidateTokens: 0,
        thoughtTokens: 0,
        totalTokens: 0,
    }
}

function mergeUsage(left, right) {
    return {
        promptTokens: Math.max(left.promptTokens, right.promptTokens),
        outputTokens: Math.max(left.outputTokens, right.outputTokens),
        candidateTokens: Math.max(left.candidateTokens, right.candidateTokens),
        thoughtTokens: Math.max(left.thoughtTokens, right.thoughtTokens),
        totalTokens: Math.max(left.totalTokens, right.totalTokens),
    }
}

function parseSseResponseText(text, extractUsage) {
    let answer = ''
    let finishReason = null
    let usage = emptyUsage()
    const events = text.split(/\r?\n\r?\n/)
    for (const event of events) {
        const data = event
            .split(/\r?\n/)
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trimStart())
            .join('\n')
        if (!data || data === '[DONE]') continue
        let parsed
        try {
            parsed = JSON.parse(data)
        } catch (error) {
            throw new VerbatimPaidError('SSE_JSON_INVALID', undefined, { cause: error })
        }
        answer += extractVisibleText(parsed)
        if (typeof parsed?.candidates?.[0]?.finishReason === 'string') {
            finishReason = parsed.candidates[0].finishReason
        }
        usage = mergeUsage(usage, extractUsage(parsed))
    }
    return { answer, finishReason, usage }
}

function classifyResult({ httpStatus, finishReason, comparison, errorCode }) {
    if (errorCode || httpStatus < 200 || httpStatus >= 300) return 'inconclusive-infrastructure'
    if (finishReason === 'MAX_TOKENS') return 'inconclusive-output-cap'
    if (finishReason !== 'STOP') return 'copy-fail'
    return comparison.exact ? 'pass' : 'copy-fail'
}

function endpointUrl(projectId, responseMode) {
    const suffix = responseMode === 'stream'
        ? ':streamGenerateContent?alt=sse'
        : ':generateContent'
    return 'https://aiplatform.googleapis.com/v1/projects/'
        + encodeURIComponent(projectId)
        + '/locations/global/publishers/google/models/'
        + encodeURIComponent(PROFILE.model)
        + suffix
}

async function executeVertexCall({
    call,
    document,
    accessToken,
    projectId,
    extractUsage,
    fetchImpl = globalThis.fetch,
}) {
    const body = buildRequestBody(call, document)
    const started = performance.now()
    let response
    try {
        response = await fetchImpl(endpointUrl(projectId, call.responseMode), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: call.responseMode === 'stream' ? 'text/event-stream' : 'application/json',
                Authorization: 'Bearer ' + accessToken,
                'X-Vertex-AI-LLM-Request-Type': 'shared',
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
    } catch {
        return {
            httpStatus: 0,
            latencyMs: Math.round(performance.now() - started),
            finishReason: null,
            usage: emptyUsage(),
            answer: '',
            errorCode: 'network',
        }
    }
    const latencyMs = Math.round(performance.now() - started)
    const responseText = await response.text().catch(() => '')
    if (!response.ok) {
        return {
            httpStatus: response.status,
            latencyMs,
            finishReason: null,
            usage: emptyUsage(),
            answer: '',
            errorCode: 'http-' + response.status,
        }
    }
    try {
        if (call.responseMode === 'stream') {
            return {
                httpStatus: response.status,
                latencyMs,
                ...parseSseResponseText(responseText, extractUsage),
                errorCode: null,
            }
        }
        const parsed = JSON.parse(responseText)
        return {
            httpStatus: response.status,
            latencyMs,
            finishReason: typeof parsed?.candidates?.[0]?.finishReason === 'string'
                ? parsed.candidates[0].finishReason
                : null,
            usage: extractUsage(parsed),
            answer: extractVisibleText(parsed),
            errorCode: null,
        }
    } catch {
        return {
            httpStatus: response.status,
            latencyMs,
            finishReason: null,
            usage: emptyUsage(),
            answer: '',
            errorCode: 'response-parse',
        }
    }
}

function validateMaxCost(value) {
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > PROFILE.hardCapUsd) {
        throw new VerbatimPaidError('COST_CAP_INVALID')
    }
    return parsed
}

function reserveCost(call, document) {
    let promptTokens
    if (call.carrier === 'direct-literal') {
        promptTokens = 10_000
    } else if (call.carrier === 'pdf') {
        promptTokens = (document.rendered.pageCount * 5_000) + 5_000
    } else {
        promptTokens = document.canonicalBytes.byteLength + 5_000
    }
    return rateCost(promptTokens, call.outputTokens)
}

function sanitizeComparison(comparison) {
    return {
        exact: comparison.exact,
        classification: comparison.classification,
        expectedBytes: comparison.expectedBytes,
        observedBytes: comparison.observedBytes,
        expectedSha256: comparison.expectedSha256,
        observedSha256: comparison.observedSha256,
        firstByteOffset: comparison.firstByteOffset,
        firstScalarOffset: comparison.firstScalarOffset,
        expectedContext: comparison.expectedContext,
        observedContext: comparison.observedContext,
        expectedNormalization: comparison.expectedNormalization,
        observedNormalization: comparison.observedNormalization,
        expectedWhitespaceRuns: comparison.expectedWhitespaceRuns,
        observedWhitespaceRuns: comparison.observedWhitespaceRuns,
    }
}

function assertSecretsAbsent(value, secrets) {
    const serialized = JSON.stringify(value)
    for (const secret of secrets) {
        if (typeof secret === 'string' && secret.length > 0 && serialized.includes(secret)) {
            throw new VerbatimPaidError('SECRET_IN_RESULT')
        }
    }
}

async function runResearchPaid(options = {}) {
    if (options.executionApproved !== true || options.researchContinuationApproved !== true) {
        throw new VerbatimPaidError('PAID_EXECUTION_NOT_ENABLED')
    }
    if (typeof options.onCheckpoint !== 'function') {
        throw new VerbatimPaidError('CHECKPOINT_REQUIRED')
    }
    const maxCostUsd = validateMaxCost(options.maxCostUsd)
    const offline = options.offline
    if (!offline || offline.profile.id !== PROFILE.id
        || offline.manifest.manifestSha256 !== MANIFEST_SHA256) {
        throw new VerbatimPaidError('OFFLINE_EVIDENCE_INVALID')
    }
    const credentials = options.credentials
    if (!credentials || typeof credentials.vertexProjectId !== 'string'
        || !credentials.vertexServiceAccount || !Array.isArray(credentials.secrets)) {
        throw new VerbatimPaidError('CREDENTIAL_INVALID')
    }
    const providerModule = options.providerModule
    if (!providerModule || typeof providerModule.extractUsage !== 'function') {
        throw new VerbatimPaidError('PROVIDER_MODULE_INVALID')
    }
    const secrets = [...credentials.secrets]
    const calls = buildResearchCallPlan()
    const records = []
    let ratedCostUsd = 0
    let token = null
    let stopReason = null

    for (const call of calls) {
        const document = call.carrier === 'direct-literal'
            ? documentById(offline, 'minimum')
            : documentById(offline, call.fixtureId)
        const reservedCostUsd = reserveCost(call, document)
        if (ratedCostUsd + reservedCostUsd > maxCostUsd) {
            stopReason = 'cost-cap-before-call'
            break
        }
        const shape = bodyShape(call, document)
        const start = {
            schemaVersion: 1,
            experiment: 'pagefold-verbatim-research-v1',
            profileId: PROFILE.id,
            manifestSha256: MANIFEST_SHA256,
            phase: 'call-start',
            attemptedCall: call.sequence,
            completedCalls: records.length,
            ratedCostUsd,
            reservedCostUsd,
            call,
            bodyShape: shape,
        }
        assertSecretsAbsent(start, secrets)
        await options.onCheckpoint(start)
        options.onProgress?.(
            'call-start=' + call.sequence
            + '/' + calls.length
            + ' fixture=' + call.fixtureId
            + ' carrier=' + call.carrier
            + ' repeat=' + call.repeat
        )

        try {
            if (!token || token.refreshAt <= Date.now()) {
                token = await (options.getToken || providerModule.exchangeServiceAccount)(
                    credentials.vertexServiceAccount,
                    options.fetchImpl,
                )
                if (typeof token?.accessToken !== 'string' || token.accessToken.length === 0) {
                    throw new VerbatimPaidError('VERTEX_OAUTH_INVALID')
                }
                secrets.push(token.accessToken)
            }
        } catch {
            stopReason = 'vertex-oauth'
            const complete = {
                ...start,
                phase: 'call-complete',
                status: 'inconclusive-infrastructure',
                errorCode: stopReason,
            }
            assertSecretsAbsent(complete, secrets)
            await options.onCheckpoint(complete)
            break
        }

        const raw = await (options.executeCall || executeVertexCall)({
            call,
            document,
            accessToken: token.accessToken,
            projectId: credentials.vertexProjectId,
            extractUsage: providerModule.extractUsage,
            fetchImpl: options.fetchImpl,
        })
        const expected = decodeFixturePayload(fixtureById(call.fixtureId)).text
        const comparison = compareUtf8Exact(expected, raw.answer)
        const status = classifyResult({
            httpStatus: raw.httpStatus,
            finishReason: raw.finishReason,
            comparison,
            errorCode: raw.errorCode,
        })
        const callCost = rateCost(raw.usage.promptTokens, raw.usage.outputTokens)
        ratedCostUsd = Math.round((ratedCostUsd + callCost) * 1_000_000_000) / 1_000_000_000
        if (ratedCostUsd > maxCostUsd) throw new VerbatimPaidError('COST_CAP_EXCEEDED')
        const record = {
            schemaVersion: 1,
            experiment: 'pagefold-verbatim-research-v1',
            profileId: PROFILE.id,
            manifestSha256: MANIFEST_SHA256,
            phase: 'call-complete',
            attemptedCall: call.sequence,
            completedCalls: records.length + 1,
            call,
            bodyShape: shape,
            httpStatus: raw.httpStatus,
            finishReason: raw.finishReason,
            latencyMs: raw.latencyMs,
            usage: raw.usage,
            ratedCostUsd: callCost,
            cumulativeRatedCostUsd: ratedCostUsd,
            answerSha256: raw.answer ? sha256(Buffer.from(raw.answer, 'utf8')) : null,
            comparison: sanitizeComparison(comparison),
            status,
            errorCode: raw.errorCode,
        }
        assertSecretsAbsent(record, secrets)
        await options.onCheckpoint(record)
        records.push(record)
        options.onProgress?.(
            'call-end=' + call.sequence
            + ' status=' + status
            + ' finish=' + (raw.finishReason || 'none')
            + ' cumulativeUsd=' + ratedCostUsd.toFixed(9)
        )
        if (status !== 'pass') {
            stopReason = call.stage.toLowerCase() + '-' + status
            break
        }
    }

    const completedPlan = records.length === calls.length
    const providerResearchPassed = completedPlan && records.every((record) => record.status === 'pass')
    const summary = {
        schemaVersion: 1,
        experiment: 'pagefold-verbatim-research-v1',
        profile: PROFILE,
        manifestSha256: MANIFEST_SHA256,
        executionMode: 'bounded-research-continuation',
        generalAdmissionBlockedByTransport: offline.public.transportNegatives,
        maximumCalls: calls.length,
        completedCalls: records.length,
        hardCapUsd: maxCostUsd,
        ratedCostUsd,
        stopReason,
        completedPlan,
        providerResearchPassed,
        supportQualified: false,
        records,
    }
    assertSecretsAbsent(summary, secrets)
    return summary
}

function loadProviderModule(targetRoot) {
    const modulePath = path.join(targetRoot, 'server/node/pageFoldProviderFeasibility.cjs')
    return require(modulePath)
}

async function loadFrozenPresetCredential({ targetRoot, databasePath, providerModule }) {
    if (typeof databasePath !== 'string' || databasePath.length === 0) {
        throw new VerbatimPaidError('CREDENTIAL_DB_REQUIRED')
    }
    const { openKvSnapshot } = require(path.join(targetRoot, 'server/node/backupSnapshot.cjs'))
    const { decodeRisuSave } = require(path.join(targetRoot, 'server/node/utils.cjs'))
    const snapshot = openKvSnapshot(databasePath)
    let database
    try {
        database = await decodeRisuSave(snapshot.kvGet('database/database.bin'))
    } finally {
        snapshot.close()
    }
    const matches = (Array.isArray(database.modelPresets) ? database.modelPresets : []).filter((preset) => (
        preset?.pageFold?.enabled === true
        && preset.pageFold.mode === PROFILE.pageFoldMode
        && preset?.userValues?.modelId === PROFILE.model
        && preset?.userValues?.location === PROFILE.endpointLocation
        && typeof preset?.userValues?.serviceAccountJson === 'string'
    ))
    if (matches.length !== 1) throw new VerbatimPaidError('FROZEN_PRESET_NOT_UNIQUE')
    const sourceJson = matches[0].userValues.serviceAccountJson
    let serviceAccount
    try {
        serviceAccount = JSON.parse(sourceJson)
    } catch {
        throw new VerbatimPaidError('VERTEX_CREDENTIAL_INVALID')
    }
    providerModule.validateServiceAccount(serviceAccount)
    if (typeof matches[0].userValues.projectId === 'string'
        && matches[0].userValues.projectId.length > 0
        && matches[0].userValues.projectId !== serviceAccount.project_id) {
        throw new VerbatimPaidError('VERTEX_PROJECT_MISMATCH')
    }
    return {
        vertexServiceAccount: serviceAccount,
        vertexProjectId: serviceAccount.project_id,
        checks: {
            frozenPresetUnique: true,
            routeModelExact: true,
            routeLocationExact: true,
            routeModeExact: true,
            serviceAccountShape: true,
            projectIdExact: true,
        },
        secrets: [
            sourceJson,
            serviceAccount.private_key,
            serviceAccount.client_email,
            serviceAccount.project_id,
            serviceAccount.private_key_id,
        ].filter(Boolean),
    }
}

async function main() {
    if (process.env.PAGEFOLD_VERBATIM_PAID !== '1'
        || process.env.PAGEFOLD_VERBATIM_RESEARCH_CONTINUE !== '1') {
        process.stderr.write('[pagefold-verbatim-paid] disabled; explicit paid/research flags required\n')
        process.exitCode = 2
        return
    }
    let checkpointFd = null
    try {
        const checkpointFile = process.env.PAGEFOLD_CHECKPOINT_FILE
        const resultFile = process.env.PAGEFOLD_RESULT_FILE
        if (!checkpointFile || !resultFile) throw new VerbatimPaidError('EVIDENCE_FILE_REQUIRED')
        checkpointFd = fs.openSync(checkpointFile, 'wx', 0o600)
        fs.fsyncSync(checkpointFd)
        const offline = await runOffline({
            targetRoot: process.env.PAGEFOLD_TARGET_ROOT,
            fontCacheRoot: process.env.PAGEFOLD_TEST_FONT_CACHE,
            onProgress: (message) => process.stderr.write('[pagefold-verbatim-paid] ' + message + '\n'),
        })
        const providerModule = loadProviderModule(process.env.PAGEFOLD_TARGET_ROOT)
        const credentials = await loadFrozenPresetCredential({
            targetRoot: process.env.PAGEFOLD_TARGET_ROOT,
            databasePath: process.env.PAGEFOLD_CREDENTIAL_DB,
            providerModule,
        })
        const summary = await runResearchPaid({
            executionApproved: true,
            researchContinuationApproved: true,
            maxCostUsd: process.env.PAGEFOLD_MAX_USD,
            offline,
            credentials,
            providerModule,
            onCheckpoint: async (record) => {
                fs.writeSync(checkpointFd, JSON.stringify(record) + '\n')
                fs.fsyncSync(checkpointFd)
            },
            onProgress: (message) => process.stderr.write('[pagefold-verbatim-paid] ' + message + '\n'),
        })
        const resultFd = fs.openSync(resultFile, 'wx', 0o600)
        try {
            fs.writeSync(resultFd, JSON.stringify(summary, null, 2) + '\n')
            fs.fsyncSync(resultFd)
        } finally {
            fs.closeSync(resultFd)
        }
        process.stdout.write(JSON.stringify(summary, null, 2) + '\n')
        if (!summary.completedPlan) process.exitCode = 2
    } catch (error) {
        const code = error instanceof VerbatimPaidError || error instanceof VerbatimQualificationError
            ? error.code
            : 'VERBATIM_PAID_UNEXPECTED'
        process.stderr.write('[pagefold-verbatim-paid] failed code=' + code + '\n')
        process.exitCode = 1
    } finally {
        if (checkpointFd !== null) {
            try { fs.closeSync(checkpointFd) } catch {}
        }
    }
}

if (require.main === module) void main()

module.exports = {
    DIRECT_LITERAL_INSTRUCTION,
    DIRECT_LITERAL_SYSTEM,
    MAX_RESEARCH_CALLS,
    PAGEFOLD_MAXIMUM_CONTINUATION_V1,
    PAGEFOLD_SYSTEM_DECODER_V1,
    VerbatimPaidError,
    bodyShape,
    buildRequestBody,
    buildResearchCallPlan,
    classifyResult,
    executeVertexCall,
    loadFrozenPresetCredential,
    parseSseResponseText,
    reserveCost,
    runResearchPaid,
    validateMaxCost,
}
