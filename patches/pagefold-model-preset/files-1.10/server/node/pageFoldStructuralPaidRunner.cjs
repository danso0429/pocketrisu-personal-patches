'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const {
    MODEL_ID,
    NORMAL_OUTPUT_TOKENS,
    OUTPUT_CAP_CONTROL_TOKENS,
    VERTEX_RATED_COST_CAP_USD,
    PageFoldStructuralError,
    chooseResolution,
    createHierarchyPlan,
    createLocalFixtures,
    createQualificationPlan,
    createScreeningPlan,
    createTextControl,
    evaluateObservation,
    expectedForClaim,
    promptForClaim,
    responseSchemaForClaim,
    sanitizeAnswer,
} = require('./pageFoldStructuralRequalification.cjs')
const {
    exchangeServiceAccount,
    extractUsage,
    loadVertexCredential,
    parseAnswerJson,
    rateUsage,
} = require('./pageFoldProviderFeasibility.cjs')

const MAX_CALLS = 23
const MAX_OUTPUT_CONTROLS = 2
const REQUEST_TIMEOUT_MS = 300_000
const MEDIA_RESOLUTION = Object.freeze({
    low: 'MEDIA_RESOLUTION_LOW',
    medium: 'MEDIA_RESOLUTION_MEDIUM',
})
const PROMPT_TOKEN_RESERVE = Object.freeze({
    text: 4_096,
    1: 4_096,
    2: 6_144,
    8: 16_384,
})
const RECORD_STATUSES = new Set([
    'pass',
    'fail',
    'inconclusive-output-cap',
    'terminal-error',
])

class PageFoldStructuralPaidError extends Error {
    constructor(code, message = code) {
        super(message)
        this.name = 'PageFoldStructuralPaidError'
        this.code = code
    }
}

async function runStructuralPaid(options = {}) {
    if (options.executionApproved !== true) {
        throw new PageFoldStructuralPaidError('PAID_EXECUTION_NOT_ENABLED')
    }
    const maxCostUsd = validateCostCap(options.maxCostUsd ?? VERTEX_RATED_COST_CAP_USD)
    const fixtures = options.fixtures || await (options.createFixtures || createLocalFixtures)({
        fontCacheRoot: options.fontCacheRoot,
        onProgress: options.onProgress,
    })
    validateFixtures(fixtures)
    const publicFixtures = summarizeFixtures(fixtures)

    const credentials = options.credentials || await (options.loadCredential || loadVertexCredential)({
        databasePath: options.databasePath,
        vertexNameHash: options.vertexNameHash,
    })
    validateCredentials(credentials)
    const secrets = [...credentials.secrets]
    const state = createState({
        maxCostUsd,
        records: [],
        controlsUsed: 0,
        ratedCostUsd: 0,
        selectedResolution: null,
        stopReason: null,
        stage: 'L1',
    })

    let screeningResults = []
    if (options.resumeSummary !== undefined) {
        const resumed = restoreDecisionState({
            resumeSummary: options.resumeSummary,
            fixtures,
            publicFixtures,
            maxCostUsd,
        })
        state.records = resumed.records
        state.controlsUsed = resumed.controlsUsed
        state.ratedCostUsd = resumed.ratedCostUsd
        screeningResults = resumed.screeningResults
        state.selectedResolution = requireResumeSelection(
            options.selectedResolution,
            resumed.decision,
        )
        state.stage = 'L3'
    } else {
        if (options.selectedResolution !== undefined) {
            throw new PageFoldStructuralPaidError('SELECTION_REQUIRES_RESUME')
        }
        const screening = createScreeningPlan()
        const textRecord = await runLogicalCell({
            cell: screening[0], fixtures, credentials, state, options, secrets,
        })
        if (state.stopReason || textRecord?.status !== 'pass') {
            if (!state.stopReason) state.stopReason = statusStopReason('text-oracle', textRecord)
            state.stage = 'L1'
            return buildSummary({ state, credentials, publicFixtures, screeningResults: effectiveResults(state.records), secrets })
        }

        state.stage = 'L2'
        for (const cell of screening.slice(1)) {
            await runLogicalCell({ cell, fixtures, credentials, state, options, secrets })
            if (state.stopReason) {
                return buildSummary({ state, credentials, publicFixtures, screeningResults: effectiveResults(state.records), secrets })
            }
        }
        screeningResults = effectiveResults(state.records)
        const decision = chooseResolution(screeningResults)
        if (decision.status === 'stop') {
            state.stopReason = decision.reason
            return buildSummary({ state, credentials, publicFixtures, screeningResults, decision, secrets })
        }
        if (decision.status === 'decision-required') {
            state.stage = 'decision-required'
            state.stopReason = decision.reason
            return buildSummary({ state, credentials, publicFixtures, screeningResults, decision, secrets })
        }
        state.selectedResolution = decision.resolution
        state.stage = 'L3'
    }

    for (const cell of createQualificationPlan(state.selectedResolution)) {
        const record = await runLogicalCell({ cell, fixtures, credentials, state, options, secrets })
        if (state.stopReason || record?.status !== 'pass') {
            if (!state.stopReason) state.stopReason = statusStopReason('qualification', record)
            return buildSummary({ state, credentials, publicFixtures, screeningResults, secrets })
        }
    }

    state.stage = 'L4'
    for (const cell of createHierarchyPlan(state.selectedResolution)) {
        const record = await runLogicalCell({ cell, fixtures, credentials, state, options, secrets })
        if (state.stopReason || record?.status !== 'pass') {
            if (!state.stopReason) state.stopReason = statusStopReason('hierarchy', record)
            return buildSummary({ state, credentials, publicFixtures, screeningResults, secrets })
        }
    }

    state.stage = 'complete'
    return buildSummary({ state, credentials, publicFixtures, screeningResults, secrets })
}

async function runLogicalCell({ cell, fixtures, credentials, state, options, secrets }) {
    const initial = await runPhysicalCell({
        cell,
        control: false,
        controlForCall: null,
        fixtures,
        credentials,
        state,
        options,
        secrets,
    })
    if (!initial || state.stopReason || initial.status !== 'inconclusive-output-cap') return initial
    if (state.controlsUsed >= MAX_OUTPUT_CONTROLS) return initial

    const controlCell = { ...cell, outputTokens: OUTPUT_CAP_CONTROL_TOKENS }
    const control = await runPhysicalCell({
        cell: controlCell,
        control: true,
        controlForCall: initial.call,
        fixtures,
        credentials,
        state,
        options,
        secrets,
    })
    if (control) state.controlsUsed++
    return control || initial
}

async function runPhysicalCell({
    cell,
    control,
    controlForCall,
    fixtures,
    credentials,
    state,
    options,
    secrets,
}) {
    if (state.records.length >= MAX_CALLS) {
        state.stopReason = 'maximum-calls-before-call'
        return null
    }
    const reservedCostUsd = reserveCost(cell)
    if (state.ratedCostUsd + reservedCostUsd > state.maxCostUsd) {
        state.stopReason = 'cost-cap-before-call'
        return null
    }

    let token
    try {
        token = await getVertexToken({ credentials, state, options })
    } catch (error) {
        state.stopReason = normalizeErrorCode(error, 'vertex-oauth-unexpected')
        return null
    }
    if (typeof token.accessToken === 'string') secrets.push(token.accessToken)

    const fixture = fixtureForCell(fixtures, cell)
    const call = state.records.length + 1
    progress(options, `call-start call=${call}/${MAX_CALLS} stage=${cell.stage} claim=${cell.claim} resolution=${cell.resolution || 'none'} pages=${cell.pages} repeat=${cell.repeat} outputTokens=${cell.outputTokens} control=${control}`)
    const started = performance.now()
    let raw
    try {
        raw = await (options.executeCell || executeVertexCell)({
            cell,
            fixture,
            vertexAccessToken: token.accessToken,
            vertexProjectId: credentials.vertexProjectId,
            fetchImpl: options.fetchImpl,
        })
    } catch {
        raw = {
            httpStatus: 0,
            latencyMs: Math.round(performance.now() - started),
            finishReason: null,
            usage: emptyUsage(),
            answer: null,
            answerHash: null,
            errorCode: 'network',
        }
    }
    const normalized = normalizeExecutionResult(raw, cell)
    const expected = expectedForClaim(cell.claim, fixture || {})
    const evaluation = normalized.httpStatus >= 200 && normalized.httpStatus < 300
        ? evaluateObservation({
            cell,
            answer: normalized.answer,
            expected,
            finishReason: normalized.finishReason,
            outputTokens: normalized.usage.outputTokens,
        })
        : {
            status: 'terminal-error',
            differences: [],
            observed: null,
        }
    const record = {
        call,
        cell: publicCell(cell),
        cellKey: logicalCellKey(cell),
        control,
        controlForCall,
        httpStatus: normalized.httpStatus,
        latencyMs: normalized.latencyMs,
        finishReason: normalized.finishReason,
        usage: normalized.usage,
        ratedCostUsd: normalized.ratedCostUsd,
        reservedCostUsd,
        status: evaluation.status,
        errorCode: normalized.errorCode,
        answerHash: normalized.answerHash,
        observed: evaluation.observed,
        differences: evaluation.differences,
    }
    state.records.push(record)
    state.ratedCostUsd = roundMoney(state.ratedCostUsd + record.ratedCostUsd)
    progress(options, `call-end call=${call}/${MAX_CALLS} http=${record.httpStatus} status=${record.status} finish=${record.finishReason || 'none'} promptTokens=${record.usage.promptTokens} outputTokens=${record.usage.outputTokens} ratedCostUsd=${record.ratedCostUsd.toFixed(9)} cumulativeUsd=${state.ratedCostUsd.toFixed(9)}`)

    if (record.httpStatus < 200 || record.httpStatus >= 300) {
        state.stopReason = record.httpStatus === 0
            ? 'vertex-network'
            : `vertex-http-${record.httpStatus}`
    } else if (state.ratedCostUsd > state.maxCostUsd) {
        state.stopReason = 'cost-cap-after-call'
    } else if (record.usage.promptTokens > promptTokenReserve(cell)) {
        state.stopReason = 'prompt-token-reserve-exceeded'
    }
    return record
}

async function getVertexToken({ credentials, state, options }) {
    if (state.vertexToken && state.vertexToken.refreshAt > Date.now()) return state.vertexToken
    const exchange = options.getToken || exchangeServiceAccount
    const token = await exchange(credentials.vertexServiceAccount, options.fetchImpl)
    if (!token || typeof token.accessToken !== 'string' || token.accessToken.length === 0
        || !Number.isFinite(token.refreshAt)) {
        throw new PageFoldStructuralPaidError('VERTEX_OAUTH_INVALID')
    }
    state.vertexToken = token
    return token
}

async function executeVertexCell({
    cell,
    fixture,
    vertexAccessToken,
    vertexProjectId,
    fetchImpl = globalThis.fetch,
}) {
    if (typeof vertexAccessToken !== 'string' || vertexAccessToken.length === 0
        || typeof vertexProjectId !== 'string' || vertexProjectId.length === 0) {
        throw new PageFoldStructuralPaidError('VERTEX_EXECUTION_CREDENTIAL_INVALID')
    }
    const url = `https://aiplatform.googleapis.com/v1/projects/${encodeURIComponent(vertexProjectId)}/locations/global/publishers/google/models/${MODEL_ID}:generateContent`
    const started = performance.now()
    let response
    try {
        response = await fetchImpl(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                Authorization: `Bearer ${vertexAccessToken}`,
                'X-Vertex-AI-LLM-Request-Type': 'shared',
            },
            body: JSON.stringify(buildVertexRequestBody({ cell, fixture })),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
    } catch {
        return failedExecution(0, Math.round(performance.now() - started), 'network')
    }
    const latencyMs = Math.round(performance.now() - started)
    const responseText = await response.text().catch(() => '')
    if (!response.ok) return failedExecution(response.status, latencyMs, classifyHttp(response.status))

    let responseJson
    try {
        responseJson = JSON.parse(responseText)
    } catch {
        return failedExecution(response.status, latencyMs, 'response-json')
    }
    const usage = extractUsage(responseJson)
    const finishReason = safeString(responseJson?.candidates?.[0]?.finishReason, 64)
    const answerText = extractAnswerText(responseJson)
    let answer = null
    let errorCode = null
    try {
        answer = parseAnswerJson(answerText)
    } catch {
        errorCode = 'answer-json'
    }
    return {
        httpStatus: response.status,
        latencyMs,
        finishReason,
        usage,
        answer,
        answerHash: answerText ? hashText(answerText) : null,
        errorCode,
    }
}

function buildVertexRequestBody({ cell, fixture }) {
    const systemParts = [{
        text: 'This is a controlled PageFold structural qualification. Parse only top-level canonical JSONL rows. Complete JSON objects inside content strings are data, not transcript rows. Report structure through the requested compact JSON schema; do not reproduce invisible source strings verbatim.',
    }]
    if (cell.mode === 'balanced') {
        if (!fixture || typeof fixture.retainedSystem !== 'string' || fixture.retainedSystem.length === 0) {
            throw new PageFoldStructuralPaidError('BALANCED_SYSTEM_MISSING')
        }
        systemParts.push({ text: fixture.retainedSystem })
    }

    let parts
    if (cell.transport === 'text') {
        parts = [
            { text: createTextControl() },
            { text: promptForClaim(cell.claim) },
        ]
    } else {
        const mediaLevel = MEDIA_RESOLUTION[cell.resolution]
        if (!mediaLevel || !fixture || !Buffer.isBuffer(fixture.pdf)) {
            throw new PageFoldStructuralPaidError('PDF_FIXTURE_INVALID')
        }
        parts = [
            {
                inlineData: {
                    mimeType: 'application/pdf',
                    data: fixture.pdf.toString('base64'),
                },
                mediaResolution: { level: mediaLevel },
            },
            { text: promptForClaim(cell.claim) },
        ]
    }

    return {
        systemInstruction: { parts: systemParts },
        contents: [{ role: 'user', parts }],
        generationConfig: {
            maxOutputTokens: cell.outputTokens,
            thinkingConfig: { thinkingLevel: 'low', includeThoughts: false },
            responseMimeType: 'application/json',
            responseSchema: responseSchemaForClaim(cell.claim),
        },
    }
}

function normalizeExecutionResult(raw, cell) {
    const httpStatus = integerInRange(raw?.httpStatus, 0, 599, 0)
    const usage = normalizeUsage(raw?.usage)
    const answer = raw?.answer && typeof raw.answer === 'object' && !Array.isArray(raw.answer)
        ? raw.answer
        : null
    return {
        httpStatus,
        latencyMs: integerInRange(raw?.latencyMs, 0, 3_600_000, 0),
        finishReason: safeString(raw?.finishReason, 64),
        usage,
        ratedCostUsd: rateUsage(usage),
        answer,
        answerHash: /^[a-f0-9]{64}$/.test(raw?.answerHash || '')
            ? raw.answerHash
            : answer ? hashText(JSON.stringify(sanitizeAnswer(cell.claim, answer))) : null,
        errorCode: safeCode(raw?.errorCode),
    }
}

function restoreDecisionState({ resumeSummary, fixtures, publicFixtures, maxCostUsd }) {
    if (!resumeSummary || typeof resumeSummary !== 'object' || Array.isArray(resumeSummary)
        || resumeSummary.schemaVersion !== 1
        || resumeSummary.provider !== 'vertex'
        || resumeSummary.model !== MODEL_ID
        || resumeSummary.complete !== false
        || resumeSummary.stage !== 'decision-required'
        || resumeSummary.selectedResolution !== null
        || resumeSummary.maxCostUsd !== maxCostUsd
        || JSON.stringify(resumeSummary.fixtures) !== JSON.stringify(publicFixtures)
        || !Array.isArray(resumeSummary.records)
        || resumeSummary.records.length < 5
        || resumeSummary.records.length > 7) {
        throw new PageFoldStructuralPaidError('RESUME_STATE_INVALID')
    }
    const records = resumeSummary.records.map((record, index) =>
        restoreRecord(record, index + 1, fixtures)
    )
    const controlsUsed = records.filter((record) => record.control).length
    if (controlsUsed > MAX_OUTPUT_CONTROLS) throw new PageFoldStructuralPaidError('RESUME_STATE_INVALID')
    const ratedCostUsd = roundMoney(records.reduce((sum, record) => sum + record.ratedCostUsd, 0))
    if (ratedCostUsd > maxCostUsd || ratedCostUsd !== resumeSummary.ratedCostUsd) {
        throw new PageFoldStructuralPaidError('RESUME_STATE_INVALID')
    }
    const screeningResults = effectiveResults(records)
    const decision = chooseResolution(screeningResults)
    if (decision.status !== 'decision-required') throw new PageFoldStructuralPaidError('RESUME_STATE_INVALID')
    const expectedKeys = createScreeningPlan().map(logicalCellKey)
    const actualKeys = screeningResults.map((result) => logicalCellKey(result.cell))
    if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
        throw new PageFoldStructuralPaidError('RESUME_STATE_INVALID')
    }
    return { records, controlsUsed, ratedCostUsd, screeningResults, decision }
}

function restoreRecord(input, expectedCall, fixtures) {
    if (!input || typeof input !== 'object' || Array.isArray(input)
        || input.call !== expectedCall || typeof input.control !== 'boolean'
        || !RECORD_STATUSES.has(input.status)) {
        throw new PageFoldStructuralPaidError('RESUME_STATE_INVALID')
    }
    const cell = restoreCell(input.cell)
    const fixture = fixtureForCell(fixtures, cell)
    const usage = normalizeUsage(input.usage)
    const httpStatus = integerInRange(input.httpStatus, 0, 599, -1)
    const finishReason = safeString(input.finishReason, 64)
    const observed = sanitizeAnswer(cell.claim, input.observed)
    const evaluation = httpStatus >= 200 && httpStatus < 300
        ? evaluateObservation({
            cell,
            answer: observed,
            expected: expectedForClaim(cell.claim, fixture || {}),
            finishReason,
            outputTokens: usage.outputTokens,
        })
        : { status: 'terminal-error', differences: [], observed: null }
    if (evaluation.status !== input.status) throw new PageFoldStructuralPaidError('RESUME_STATE_INVALID')
    return {
        call: expectedCall,
        cell,
        cellKey: logicalCellKey(cell),
        control: input.control,
        controlForCall: input.controlForCall === null
            ? null
            : integerInRange(input.controlForCall, 1, expectedCall - 1, -1),
        httpStatus,
        latencyMs: integerInRange(input.latencyMs, 0, 3_600_000, 0),
        finishReason,
        usage,
        ratedCostUsd: rateUsage(usage),
        reservedCostUsd: reserveCost(cell),
        status: evaluation.status,
        errorCode: safeCode(input.errorCode),
        answerHash: /^[a-f0-9]{64}$/.test(input.answerHash || '') ? input.answerHash : null,
        observed: evaluation.observed,
        differences: evaluation.differences,
    }
}

function restoreCell(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new PageFoldStructuralPaidError('RESUME_STATE_INVALID')
    }
    const candidates = [
        ...createScreeningPlan(),
        ...createQualificationPlan('low'),
        ...createQualificationPlan('medium'),
        ...createHierarchyPlan('low'),
        ...createHierarchyPlan('medium'),
    ]
    const match = candidates.find((candidate) =>
        logicalCellKey(candidate) === logicalCellKey(input)
    )
    if (!match) throw new PageFoldStructuralPaidError('RESUME_STATE_INVALID')
    const outputTokens = input.outputTokens
    if (outputTokens !== NORMAL_OUTPUT_TOKENS && outputTokens !== OUTPUT_CAP_CONTROL_TOKENS) {
        throw new PageFoldStructuralPaidError('RESUME_STATE_INVALID')
    }
    return publicCell({ ...match, outputTokens })
}

function requireResumeSelection(selectedResolution, decision) {
    if (!decision.candidates.includes(selectedResolution)) {
        throw new PageFoldStructuralPaidError('RESUME_SELECTION_INVALID')
    }
    return selectedResolution
}

function buildSummary({
    state,
    credentials,
    publicFixtures,
    screeningResults,
    decision = null,
    secrets,
}) {
    const complete = state.stage === 'complete'
    const summary = {
        schemaVersion: 1,
        experiment: 'pagefold-structural-requalification',
        paidExecutionEnabled: true,
        provider: 'vertex',
        model: MODEL_ID,
        complete,
        supportQualified: complete,
        stage: state.stage,
        stopReason: complete ? null : state.stopReason,
        selectedResolution: state.selectedResolution,
        decision: decision?.status === 'decision-required'
            ? { status: decision.status, reason: decision.reason, candidates: [...decision.candidates] }
            : null,
        maxCalls: MAX_CALLS,
        completedCalls: state.records.length,
        maximumOutputControls: MAX_OUTPUT_CONTROLS,
        outputControlsUsed: state.controlsUsed,
        normalOutputTokens: NORMAL_OUTPUT_TOKENS,
        outputCapControlTokens: OUTPUT_CAP_CONTROL_TOKENS,
        maxCostUsd: state.maxCostUsd,
        ratedCostUsd: state.ratedCostUsd,
        credentialChecks: { ...credentials.checks },
        promptTokenReserve: { ...PROMPT_TOKEN_RESERVE },
        fixtures: publicFixtures,
        resolutionScreening: summarizeResolutionScreening(state.records),
        logicalResults: summarizeLogicalResults(effectiveResults(state.records)),
        records: state.records.map(publicRecord),
    }
    assertSecretsAbsent(summary, secrets)
    assertNoProhibitedResultKeys(summary)
    return summary
}

function effectiveResults(records) {
    const byKey = new Map()
    for (const record of records) {
        byKey.set(record.cellKey, { cell: record.cell, status: record.status })
    }
    return [...byKey.values()]
}

function summarizeLogicalResults(results) {
    return results.map((result) => ({
        cell: publicCell(result.cell),
        status: result.status,
    }))
}

function summarizeResolutionScreening(records) {
    return ['low', 'medium'].map((resolution) => {
        const selected = records.filter((record) =>
            record.cell.stage === 'L2' && record.cell.resolution === resolution
        )
        const logical = effectiveResults(selected)
        return {
            resolution,
            calls: selected.length,
            ratedCostUsd: roundMoney(selected.reduce((sum, record) => sum + record.ratedCostUsd, 0)),
            latencyMs: selected.reduce((sum, record) => sum + record.latencyMs, 0),
            byteStructure: logical.find((result) => result.cell.claim === 'byte-structure')?.status || 'not-run',
            grammarRole: logical.find((result) => result.cell.claim === 'grammar-role')?.status || 'not-run',
        }
    })
}

function publicRecord(record) {
    return {
        call: record.call,
        cell: publicCell(record.cell),
        cellKey: record.cellKey,
        control: record.control,
        controlForCall: record.controlForCall,
        httpStatus: record.httpStatus,
        latencyMs: record.latencyMs,
        finishReason: record.finishReason,
        usage: { ...record.usage },
        ratedCostUsd: record.ratedCostUsd,
        reservedCostUsd: record.reservedCostUsd,
        status: record.status,
        errorCode: record.errorCode,
        answerHash: record.answerHash,
        observed: record.observed,
        differences: record.differences,
    }
}

function publicCell(cell) {
    return {
        stage: cell.stage,
        claim: cell.claim,
        transport: cell.transport,
        resolution: cell.resolution,
        pages: cell.pages,
        repeat: cell.repeat,
        mode: cell.mode,
        outputTokens: cell.outputTokens,
    }
}

function logicalCellKey(cell) {
    return [
        cell.stage,
        cell.claim,
        cell.transport,
        cell.resolution || 'none',
        cell.pages,
        cell.repeat,
        cell.mode,
    ].join(':')
}

function fixtureForCell(fixtures, cell) {
    if (cell.transport === 'text') return null
    return fixtures[`${cell.mode}:${cell.pages}`]
}

function validateFixtures(fixtures) {
    if (!fixtures || typeof fixtures !== 'object' || Array.isArray(fixtures)) {
        throw new PageFoldStructuralPaidError('FIXTURES_INVALID')
    }
    for (const [key, mode, pages] of [
        ['maximum:1', 'maximum', 1],
        ['maximum:2', 'maximum', 2],
        ['maximum:8', 'maximum', 8],
        ['balanced:2', 'balanced', 2],
    ]) {
        const fixture = fixtures[key]
        if (!fixture || fixture.mode !== mode || fixture.pages !== pages
            || !Buffer.isBuffer(fixture.pdf) || fixture.pdf.length !== fixture.pdfBytes
            || !Number.isSafeInteger(fixture.messageCount) || fixture.messageCount < 1
            || !Number.isSafeInteger(fixture.sourceBytes) || fixture.sourceBytes < 1
            || !/^[a-f0-9]{64}$/.test(fixture.pdfSha256 || '')
            || fixture.extractionExact !== true || !Array.isArray(fixture.markerTriples)
            || (mode === 'balanced' && (typeof fixture.retainedSystem !== 'string' || fixture.retainedSystem.length === 0))) {
            throw new PageFoldStructuralPaidError('FIXTURES_INVALID')
        }
    }
}

function summarizeFixtures(fixtures) {
    return ['maximum:1', 'maximum:2', 'maximum:8', 'balanced:2'].map((key) => {
        const fixture = fixtures[key]
        return {
            mode: fixture.mode,
            pages: fixture.pages,
            messageCount: fixture.messageCount,
            sourceBytes: fixture.sourceBytes,
            pdfBytes: fixture.pdfBytes,
            pdfSha256: fixture.pdfSha256,
            extractionExact: fixture.extractionExact,
            markerTriples: fixture.markerTriples.map((triple) => triple.slice(0, 3)),
            retainedSystemPresent: fixture.retainedSystem.length > 0,
        }
    })
}

function validateCredentials(credentials) {
    if (!credentials || typeof credentials !== 'object'
        || !credentials.vertexServiceAccount
        || typeof credentials.vertexProjectId !== 'string' || credentials.vertexProjectId.length === 0
        || !credentials.checks || typeof credentials.checks !== 'object'
        || !Array.isArray(credentials.secrets)) {
        throw new PageFoldStructuralPaidError('VERTEX_CREDENTIAL_INVALID')
    }
}

function createState(value) {
    return { ...value, vertexToken: null }
}

function promptTokenReserve(cell) {
    return cell.transport === 'text'
        ? PROMPT_TOKEN_RESERVE.text
        : PROMPT_TOKEN_RESERVE[cell.pages]
}

function reserveCost(cell) {
    return rateUsage({
        promptTokens: promptTokenReserve(cell),
        outputTokens: cell.outputTokens,
    })
}

function normalizeUsage(value) {
    return {
        promptTokens: positiveInteger(value?.promptTokens),
        outputTokens: positiveInteger(value?.outputTokens),
        candidateTokens: positiveInteger(value?.candidateTokens),
        thoughtTokens: positiveInteger(value?.thoughtTokens),
        totalTokens: positiveInteger(value?.totalTokens),
    }
}

function emptyUsage() {
    return { promptTokens: 0, outputTokens: 0, candidateTokens: 0, thoughtTokens: 0, totalTokens: 0 }
}

function failedExecution(httpStatus, latencyMs, errorCode) {
    return {
        httpStatus,
        latencyMs,
        finishReason: null,
        usage: emptyUsage(),
        answer: null,
        answerHash: null,
        errorCode,
    }
}

function extractAnswerText(response) {
    const parts = response?.candidates?.[0]?.content?.parts
    if (!Array.isArray(parts)) return ''
    return parts
        .filter((part) => part && part.thought !== true && typeof part.text === 'string')
        .map((part) => part.text)
        .join('')
}

function classifyHttp(status) {
    if (status === 401 || status === 403) return 'auth'
    if (status === 404) return 'not-found'
    if (status === 429) return 'rate-limit'
    if (status >= 500) return 'server'
    return 'http'
}

function statusStopReason(prefix, record) {
    if (!record) return `${prefix}-not-run`
    if (record.status === 'inconclusive-output-cap') return `${prefix}-inconclusive-output-cap`
    return `${prefix}-not-passed`
}

function validateCostCap(value) {
    const number = Number(value)
    if (!Number.isFinite(number) || number <= 0 || number > VERTEX_RATED_COST_CAP_USD) {
        throw new PageFoldStructuralPaidError('COST_CAP_INVALID')
    }
    return number
}

function assertSecretsAbsent(value, secrets) {
    const serialized = JSON.stringify(value)
    for (const secret of secrets) {
        if (typeof secret === 'string' && secret.length >= 6 && serialized.includes(secret)) {
            throw new PageFoldStructuralPaidError('SECRET_LEAK_IN_RESULT')
        }
    }
}

function assertNoProhibitedResultKeys(value) {
    const prohibited = new Set([
        'pdf',
        'requestBody',
        'responseBody',
        'accessToken',
        'privateKey',
        'serviceAccount',
        'vertexProjectId',
    ])
    const visit = (current) => {
        if (!current || typeof current !== 'object') return
        for (const [key, child] of Object.entries(current)) {
            if (prohibited.has(key)) throw new PageFoldStructuralPaidError('PROHIBITED_RESULT_FIELD')
            visit(child)
        }
    }
    visit(value)
}

function normalizeErrorCode(error, fallback) {
    const value = typeof error?.code === 'string' ? error.code.toLocaleLowerCase('en-US') : fallback
    return safeCode(value) || fallback
}

function safeCode(value) {
    return typeof value === 'string' && /^[a-z0-9_-]{1,96}$/i.test(value) ? value : null
}

function safeString(value, maxLength) {
    return typeof value === 'string' ? value.slice(0, maxLength) : null
}

function positiveInteger(value) {
    const number = Number(value)
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0
}

function integerInRange(value, minimum, maximum, fallback) {
    const number = Number(value)
    return Number.isSafeInteger(number) && number >= minimum && number <= maximum ? number : fallback
}

function roundMoney(value) {
    return Math.round(value * 1_000_000_000) / 1_000_000_000
}

function hashText(value) {
    return crypto.createHash('sha256').update(value).digest('hex')
}

function progress(options, message) {
    options.onProgress?.(message)
}

async function main() {
    if (process.env.PAGEFOLD_STRUCTURAL_PAID !== '1') {
        process.stderr.write('[pagefold-structural-paid] disabled; explicit reviewed execution flag required\n')
        process.exitCode = 2
        return
    }
    try {
        const resumeSummary = process.env.PAGEFOLD_RESUME_FILE
            ? JSON.parse(fs.readFileSync(process.env.PAGEFOLD_RESUME_FILE, 'utf8'))
            : undefined
        const summary = await runStructuralPaid({
            executionApproved: true,
            databasePath: process.env.PAGEFOLD_CREDENTIAL_DB,
            vertexNameHash: process.env.PAGEFOLD_VERTEX_NAME_HASH,
            fontCacheRoot: process.env.PAGEFOLD_TEST_FONT_CACHE,
            maxCostUsd: process.env.PAGEFOLD_MAX_USD || VERTEX_RATED_COST_CAP_USD,
            selectedResolution: process.env.PAGEFOLD_SELECTED_RESOLUTION || undefined,
            resumeSummary,
            onProgress: (message) => process.stderr.write(`[pagefold-structural-paid] ${message}\n`),
        })
        process.stdout.write(JSON.stringify(summary, null, 2) + '\n')
        if (!summary.complete) process.exitCode = 2
    } catch (error) {
        const code = error instanceof PageFoldStructuralPaidError || error instanceof PageFoldStructuralError
            ? error.code
            : 'STRUCTURAL_PAID_UNEXPECTED'
        process.stderr.write(`[pagefold-structural-paid] failed code=${code}\n`)
        process.exitCode = 1
    }
}

if (require.main === module) void main()

module.exports = {
    MAX_CALLS,
    MAX_OUTPUT_CONTROLS,
    PROMPT_TOKEN_RESERVE,
    PageFoldStructuralPaidError,
    buildVertexRequestBody,
    executeVertexCell,
    effectiveResults,
    logicalCellKey,
    restoreDecisionState,
    runStructuralPaid,
    summarizeFixtures,
}
