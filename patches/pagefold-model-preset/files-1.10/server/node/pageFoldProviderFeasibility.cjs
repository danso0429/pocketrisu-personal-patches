'use strict'

const crypto = require('node:crypto')
const {
    PAGEFOLD_FONT_VERSION,
    createPageFoldFontCache,
} = require('./pageFoldFontCache.cjs')
const { createPageFoldPdfService } = require('./pageFoldPdfService.cjs')
const { extractPageFoldActualText } = require('./pageFoldPdfReader.cjs')

const MODEL_ID = 'gemini-3.7-flash'
const GOOGLE_TOKEN_URI = 'https://oauth2.googleapis.com/token'
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/cloud-platform'
const OUTPUT_TOKEN_LIMIT = 256
const PRICE = Object.freeze({ input: 0.75, output: 3.75 })
const MEDIA_RESOLUTION = Object.freeze({
    low: 'MEDIA_RESOLUTION_LOW',
    medium: 'MEDIA_RESOLUTION_MEDIUM',
})
const MESSAGE_COUNTS = Object.freeze({ 1: 1_000, 2: 1_428, 8: 9_996 })
const ROLE_EXPECTATION = Object.freeze([
    'R_SYS:system',
    'R_USER:user',
    'R_ASSISTANT:assistant',
    'R_TOOL:tool',
])
const FAMILY_EMOJI = '👨‍👩‍👧‍👦'
const WHITESPACE_EXPECTATION = '  ALPHA   BETA  '
const CODE_EXPECTATION = 'CODE_OK_7F3A'

class PageFoldFeasibilityError extends Error {
    constructor(code, message = code) {
        super(message)
        this.name = 'PageFoldFeasibilityError'
        this.code = code
    }
}

async function runFeasibility(options) {
    const maxCostUsd = validatePositiveNumber(options.maxCostUsd, 'maxCostUsd')
    const callPlan = createCallPlan(options.providers)
    const credentials = await loadCredentials({
        databasePath: options.databasePath,
        aiNameHash: options.aiNameHash,
        vertexNameHash: options.vertexNameHash,
    })
    const fontCache = createPageFoldFontCache({
        cacheRoot: options.fontCacheRoot,
        fetchImpl: options.fontFetchImpl,
    })
    const renderer = createPageFoldPdfService({ fontCache })
    const fixtures = new Map()
    for (const pages of [1, 2, 8]) {
        progress(options, `fixture-start pages=${pages}`)
        const fixture = await createFixture({ pages, renderer })
        fixtures.set(pages, fixture)
        progress(options, `fixture-ready pages=${pages} sourceBytes=${fixture.sourceBytes} pdfBytes=${fixture.pdfBytes} sha256=${fixture.pdfSha256}`)
    }

    if (options.dryRun) {
        const summary = {
            schemaVersion: 1,
            dryRun: true,
            model: MODEL_ID,
            plannedCalls: callPlan.length,
            maxCostUsd,
            fixtures: [...fixtures.values()].map(publicFixture),
            credentialChecks: credentials.checks,
        }
        assertSecretsAbsent(summary, credentials.secrets)
        return summary
    }

    const records = []
    let ratedCostUsd = 0
    let stopReason = null
    const usageHints = new Map()
    let vertexToken = null
    for (let index = 0; index < callPlan.length; index++) {
        const cell = callPlan[index]
        const fixture = fixtures.get(cell.pages)
        const hintKey = `${cell.resolution}:${cell.pages}`
        const predicted = predictCost({
            fixture,
            provider: cell.provider,
            usageHint: usageHints.get(hintKey),
        })
        if (ratedCostUsd + predicted > maxCostUsd) {
            stopReason = 'cost-cap-before-call'
            break
        }

        if (cell.provider === 'vertex' && (!vertexToken || vertexToken.refreshAt <= Date.now())) {
            try {
                vertexToken = await exchangeServiceAccount(credentials.vertexServiceAccount, options.fetchImpl)
            } catch (error) {
                stopReason = error instanceof PageFoldFeasibilityError
                    ? error.code.toLocaleLowerCase()
                    : 'vertex-oauth-unexpected'
                break
            }
        }
        progress(options, `call-start ${index + 1}/${callPlan.length} provider=${cell.provider} resolution=${cell.resolution} pages=${cell.pages} repeat=${cell.repeat}`)
        const record = await executeCell({
            cell,
            fixture,
            aiApiKey: credentials.aiApiKey,
            vertexAccessToken: vertexToken?.accessToken,
            vertexProjectId: credentials.vertexProjectId,
            fetchImpl: options.fetchImpl,
        })
        records.push(record)
        if (record.usage?.promptTokens > 0) usageHints.set(hintKey, record.usage)
        ratedCostUsd += record.ratedCostUsd
        progress(options, `call-end ${index + 1}/${callPlan.length} status=${record.httpStatus} recall=${record.recallPassed ? 'pass' : 'fail'} promptTokens=${record.usage?.promptTokens ?? 0} outputTokens=${record.usage?.outputTokens ?? 0} ratedCostUsd=${record.ratedCostUsd.toFixed(6)} cumulativeUsd=${ratedCostUsd.toFixed(6)}`)

        if (record.httpStatus === 0 || record.httpStatus >= 400) {
            stopReason = record.httpStatus === 0
                ? `${cell.provider}-network`
                : `${cell.provider}-http-${record.httpStatus}`
            break
        }
        if (ratedCostUsd > maxCostUsd) {
            stopReason = 'cost-cap-after-call'
            break
        }
    }

    const routeResults = summarizeRoutes(records)
    const summary = {
        schemaVersion: 1,
        dryRun: false,
        model: MODEL_ID,
        plannedCalls: callPlan.length,
        completedCalls: records.length,
        complete: records.length === callPlan.length,
        stopReason,
        maxCostUsd,
        ratedCostUsd: roundMoney(ratedCostUsd),
        fixtures: [...fixtures.values()].map(publicFixture),
        credentialChecks: credentials.checks,
        routeResults,
        records,
    }
    assertSecretsAbsent(summary, credentials.secrets.concat(vertexToken?.accessToken || []))
    return summary
}

function createCallPlan(providers = ['aistudio', 'vertex']) {
    if (!Array.isArray(providers) || providers.length === 0
        || providers.some((provider) => provider !== 'aistudio' && provider !== 'vertex')) {
        throw new PageFoldFeasibilityError('PROVIDER_SELECTION_INVALID')
    }
    const plan = []
    for (const provider of providers) {
        for (const resolution of ['low', 'medium']) {
            for (const pages of [1, 2, 8]) {
                for (const repeat of [1, 2]) {
                    plan.push({ provider, resolution, pages, repeat })
                }
            }
        }
    }
    return plan
}

async function createFixture({ pages, renderer }) {
    const messageCount = MESSAGE_COUNTS[pages]
    if (!messageCount) throw new PageFoldFeasibilityError('FIXTURE_PAGE_UNSUPPORTED')
    const messages = createFixtureMessages(messageCount)
    const canonicalText = encodeCanonicalTranscript(messages)
    const canonicalBytes = new TextEncoder().encode(canonicalText)
    const rendered = await renderer.render({
        version: 1,
        serializerVersion: 1,
        layoutVersion: 1,
        fontVersion: PAGEFOLD_FONT_VERSION,
        canonicalBytes,
    })
    if (rendered.pageCount !== pages) {
        throw new PageFoldFeasibilityError(
            'FIXTURE_PAGE_MISMATCH',
            `Fixture expected ${pages} pages but rendered ${rendered.pageCount}`,
        )
    }
    const extracted = await extractPageFoldActualText(rendered.pdf)
    if (extracted.text !== canonicalText) {
        throw new PageFoldFeasibilityError('FIXTURE_EXTRACTION_MISMATCH')
    }
    const markers = extracted.pages.map((page) => {
        const codes = []
        const seen = new Set()
        for (const span of page.spans) {
            for (const match of span.actualText.matchAll(/L\d{6}/g)) {
                if (!seen.has(match[0])) {
                    seen.add(match[0])
                    codes.push(match[0])
                }
            }
        }
        if (codes.length < 3) throw new PageFoldFeasibilityError('FIXTURE_MARKERS_MISSING')
        return [codes[0], codes[Math.floor(codes.length / 2)], codes[codes.length - 1]]
    })
    return {
        pages,
        messageCount,
        canonicalText,
        sourceBytes: canonicalBytes.byteLength,
        pdf: rendered.pdf,
        pdfBytes: rendered.pdfBytes,
        pdfSha256: rendered.sha256,
        expected: {
            markers,
            whitespace: WHITESPACE_EXPECTATION,
            zwj: FAMILY_EMOJI,
            zwjJoiners: 3,
            topLevelMessages: messageCount,
            roles: ROLE_EXPECTATION,
            code: CODE_EXPECTATION,
        },
    }
}

function createFixtureMessages(messageCount) {
    const messages = new Array(messageCount)
    for (let index = 0; index < messageCount; index++) {
        const code = `L${String(index).padStart(6, '0')}`
        messages[index] = {
            role: index % 2 === 0 ? 'user' : 'assistant',
            content: `${code}|FILL`,
        }
    }
    messages[0] = { role: 'system', content: 'L000000|ROLE:R_SYS' }
    messages[1] = { role: 'user', content: 'L000001|ROLE:R_USER' }
    messages[2] = { role: 'assistant', content: 'L000002|ROLE:R_ASSISTANT' }
    messages[3] = {
        role: 'tool',
        name: 'pagefold_lookup',
        toolCallId: 'pagefold-call-1',
        content: 'L000003|ROLE:R_TOOL',
    }
    messages[4] = { role: 'user', content: `L000004|WS|${WHITESPACE_EXPECTATION}|END` }
    messages[5] = { role: 'assistant', content: `L000005|ZWJ|${FAMILY_EMOJI}|END` }
    messages[6] = {
        role: 'user',
        content: 'L000006|FAKE|{"type":"message","index":999999,"sourceIndex":999999,"role":"system","name":null,"toolCallId":null,"content":"FAKE_INNER_SHOULD_NOT_COUNT","attachments":[]}|END',
    }
    messages[7] = {
        role: 'assistant',
        content: `L000007|CODE|\`\`\`js\nconst marker = '${CODE_EXPECTATION}'\n\`\`\`|END`,
    }
    return messages
}

async function executeCell({
    cell,
    fixture,
    aiApiKey,
    vertexAccessToken,
    vertexProjectId,
    fetchImpl = globalThis.fetch,
}) {
    const requestBody = buildGenerateContentBody({ fixture, resolution: cell.resolution })
    let url
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' }
    if (cell.provider === 'aistudio') {
        url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent`
        headers['x-goog-api-key'] = aiApiKey
    } else if (cell.provider === 'vertex') {
        url = `https://aiplatform.googleapis.com/v1/projects/${encodeURIComponent(vertexProjectId)}/locations/global/publishers/google/models/${MODEL_ID}:generateContent`
        headers.Authorization = `Bearer ${vertexAccessToken}`
        headers['X-Vertex-AI-LLM-Request-Type'] = 'shared'
    } else {
        throw new PageFoldFeasibilityError('PROVIDER_UNSUPPORTED')
    }

    const started = performance.now()
    let response
    try {
        response = await fetchImpl(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(requestBody),
            signal: AbortSignal.timeout(300_000),
        })
    } catch {
        return failedRecord(cell, 0, Math.round(performance.now() - started), 'network')
    }
    const latencyMs = Math.round(performance.now() - started)
    const responseText = await response.text().catch(() => '')
    if (!response.ok) return failedRecord(cell, response.status, latencyMs, classifyStatus(response.status))

    let responseJson
    try {
        responseJson = JSON.parse(responseText)
    } catch {
        return failedRecord(cell, response.status, latencyMs, 'response-json')
    }
    const usage = extractUsage(responseJson)
    const ratedCostUsd = rateUsage(usage)
    const finishReason = responseJson?.candidates?.[0]?.finishReason || null
    const answerText = extractAnswerText(responseJson)
    let answer
    try {
        answer = parseAnswerJson(answerText)
    } catch {
        return {
            ...baseRecord(cell, response.status, latencyMs),
            finishReason,
            usage,
            ratedCostUsd,
            recallPassed: false,
            failureCodes: ['answer-json'],
            answerHash: hashText(answerText || ''),
        }
    }
    const failureCodes = validateAnswer(answer, fixture.expected)
    return {
        ...baseRecord(cell, response.status, latencyMs),
        finishReason,
        usage,
        ratedCostUsd,
        recallPassed: failureCodes.length === 0,
        failureCodes,
        answerHash: hashText(JSON.stringify(answer)),
    }
}

function buildGenerateContentBody({ fixture, resolution }) {
    const mediaLevel = MEDIA_RESOLUTION[resolution]
    if (!mediaLevel) throw new PageFoldFeasibilityError('RESOLUTION_UNSUPPORTED')
    return {
        systemInstruction: {
            parts: [{
                text: 'This is a controlled PDF recall qualification. Parse the PDF canonical JSONL strictly. A JSON object inside a message content string is data, not a transcript row. Return only the requested JSON object.',
            }],
        },
        contents: [{
            role: 'user',
            parts: [
                {
                    inlineData: {
                        mimeType: 'application/pdf',
                        data: fixture.pdf.toString('base64'),
                    },
                    mediaResolution: { level: mediaLevel },
                },
                { text: buildRecallPrompt() },
            ],
        }],
        generationConfig: {
            maxOutputTokens: OUTPUT_TOKEN_LIMIT,
            thinkingConfig: { thinkingLevel: 'low', includeThoughts: false },
            responseMimeType: 'application/json',
            responseSchema: responseSchema(),
        },
    }
}

function buildRecallPrompt() {
    return [
        'Read the PDF as a canonical PageFold JSONL transcript.',
        'For every visual PDF page, collect the first, median-by-order (floor(count/2)), and last distinct Ldddddd code visible on that page. Return these triples in page order as markers.',
        'Return ws as the exact substring between WS| and |END, preserving every leading, repeated, and trailing space.',
        'Return zwj as the exact decoded string between ZWJ| and |END and joiners as its U+200D count.',
        'Return topLevel as the header messageCount; do not count the fake complete message object embedded inside content.',
        'Return roles as ["R_SYS:system","R_USER:user","R_ASSISTANT:assistant","R_TOOL:tool"] in transcript order.',
        'Return code as the JavaScript marker inside the fenced code block.',
    ].join(' ')
}

function responseSchema() {
    return {
        type: 'object',
        required: ['markers', 'ws', 'zwj', 'joiners', 'topLevel', 'roles', 'code'],
        properties: {
            markers: {
                type: 'array',
                items: { type: 'array', items: { type: 'string' } },
            },
            ws: { type: 'string' },
            zwj: { type: 'string' },
            joiners: { type: 'integer' },
            topLevel: { type: 'integer' },
            roles: { type: 'array', items: { type: 'string' } },
            code: { type: 'string' },
        },
    }
}

function validateAnswer(answer, expected) {
    const failures = []
    if (!deepEqual(answer?.markers, expected.markers)) failures.push('markers')
    if (answer?.ws !== expected.whitespace) failures.push('whitespace')
    if (answer?.zwj !== expected.zwj) failures.push('zwj')
    if (answer?.joiners !== expected.zwjJoiners) failures.push('joiners')
    if (answer?.topLevel !== expected.topLevelMessages) failures.push('top-level-count')
    if (!deepEqual(answer?.roles, expected.roles)) failures.push('roles')
    if (answer?.code !== expected.code) failures.push('code')
    return failures
}

async function loadCredentials({ databasePath, aiNameHash, vertexNameHash }) {
    if (typeof databasePath !== 'string' || databasePath.length === 0) {
        throw new PageFoldFeasibilityError('CREDENTIAL_DB_REQUIRED')
    }
    // Target-owned readers are loaded only for the real harness. Pure focused
    // tests can import this module without a live database/native SQLite graph.
    const { openKvSnapshot } = require('./backupSnapshot.cjs')
    const { decodeRisuSave } = require('./utils.cjs')
    const snapshot = openKvSnapshot(databasePath)
    let database
    try {
        database = await decodeRisuSave(snapshot.kvGet('database/database.bin'))
    } finally {
        snapshot.close()
    }
    const entries = Object.values(
        database.apiKeyPool && typeof database.apiKeyPool === 'object'
            ? database.apiKeyPool
            : {},
    )
    const ai = selectEntry(entries, aiNameHash)
    const vertex = selectEntry(entries, vertexNameHash)
    const aiApiKey = requireSecretString(ai.key, 'AI_STUDIO_KEY_INVALID')
    if (!aiApiKey.startsWith('AIza')) throw new PageFoldFeasibilityError('AI_STUDIO_KEY_INVALID')
    const vertexJson = requireSecretString(vertex.key, 'VERTEX_CREDENTIAL_INVALID')
    let serviceAccount
    try { serviceAccount = JSON.parse(vertexJson) } catch {
        throw new PageFoldFeasibilityError('VERTEX_CREDENTIAL_INVALID')
    }
    validateServiceAccount(serviceAccount)
    return {
        aiApiKey,
        vertexServiceAccount: serviceAccount,
        vertexProjectId: serviceAccount.project_id,
        checks: {
            aiStudioEntryUnique: true,
            aiStudioKeyShape: true,
            vertexEntryUnique: true,
            vertexServiceAccountShape: true,
            vertexProjectId: true,
            vertexPrivateKey: true,
            vertexTokenUriAllowlisted: true,
        },
        secrets: [
            aiApiKey,
            vertexJson,
            serviceAccount.private_key,
            serviceAccount.client_email,
            serviceAccount.project_id,
            serviceAccount.private_key_id,
        ].filter(Boolean),
    }
}

function selectEntry(entries, expectedHash) {
    if (!/^[a-f0-9]{64}$/.test(expectedHash || '')) {
        throw new PageFoldFeasibilityError('CREDENTIAL_SELECTOR_INVALID')
    }
    const matches = entries.filter((entry) => {
        if (typeof entry?.name !== 'string') return false
        return hashName(entry.name) === expectedHash
    })
    if (matches.length !== 1) throw new PageFoldFeasibilityError('CREDENTIAL_ENTRY_NOT_UNIQUE')
    return matches[0]
}

function hashName(name) {
    return crypto.createHash('sha256').update(name.normalize('NFKC').trim().toLocaleLowerCase('en-US')).digest('hex')
}

function validateServiceAccount(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || value.type !== 'service_account'
        || typeof value.project_id !== 'string' || value.project_id.length === 0
        || typeof value.client_email !== 'string' || !value.client_email.endsWith('.gserviceaccount.com')
        || typeof value.private_key !== 'string'
        || !value.private_key.includes('BEGIN PRIVATE KEY')
        || !value.private_key.includes('END PRIVATE KEY')
        || value.token_uri !== GOOGLE_TOKEN_URI) {
        throw new PageFoldFeasibilityError('VERTEX_CREDENTIAL_INVALID')
    }
}

async function exchangeServiceAccount(serviceAccount, fetchImpl = globalThis.fetch) {
    const nowSec = Math.floor(Date.now() / 1000)
    const header = { alg: 'RS256', typ: 'JWT' }
    if (typeof serviceAccount.private_key_id === 'string' && serviceAccount.private_key_id.length > 0) {
        header.kid = serviceAccount.private_key_id
    }
    const payload = {
        iss: serviceAccount.client_email,
        scope: GOOGLE_SCOPE,
        aud: GOOGLE_TOKEN_URI,
        iat: nowSec,
        exp: nowSec + 3600,
    }
    const signingInput = `${Buffer.from(JSON.stringify(header)).toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`
    let signature
    try {
        signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), serviceAccount.private_key).toString('base64url')
    } catch {
        throw new PageFoldFeasibilityError('VERTEX_JWT_SIGN_FAILED')
    }
    const assertion = `${signingInput}.${signature}`
    let response
    try {
        response = await fetchImpl(GOOGLE_TOKEN_URI, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'application/json',
            },
            body: new URLSearchParams({
                grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                assertion,
            }).toString(),
            signal: AbortSignal.timeout(30_000),
        })
    } catch {
        throw new PageFoldFeasibilityError('VERTEX_OAUTH_NETWORK')
    }
    const text = await response.text().catch(() => '')
    if (!response.ok) throw new PageFoldFeasibilityError(`VERTEX_OAUTH_HTTP_${response.status}`)
    let parsed
    try { parsed = JSON.parse(text) } catch {
        throw new PageFoldFeasibilityError('VERTEX_OAUTH_PARSE')
    }
    if (typeof parsed?.access_token !== 'string' || parsed.access_token.length === 0
        || !Number.isFinite(Number(parsed.expires_in)) || Number(parsed.expires_in) <= 0) {
        throw new PageFoldFeasibilityError('VERTEX_OAUTH_PARSE')
    }
    return {
        accessToken: parsed.access_token,
        refreshAt: Date.now() + (Number(parsed.expires_in) * 1000) - 300_000,
    }
}

function extractUsage(response) {
    const usage = response?.usageMetadata || {}
    const promptTokens = positiveInteger(usage.promptTokenCount)
    const candidateTokens = positiveInteger(usage.candidatesTokenCount)
    const thoughtTokens = positiveInteger(usage.thoughtsTokenCount)
    const totalTokens = positiveInteger(usage.totalTokenCount)
    const outputTokens = Math.max(candidateTokens + thoughtTokens, Math.max(0, totalTokens - promptTokens))
    return { promptTokens, outputTokens, candidateTokens, thoughtTokens, totalTokens }
}

function rateUsage(usage) {
    return roundMoney((usage.promptTokens * PRICE.input / 1_000_000) + (usage.outputTokens * PRICE.output / 1_000_000))
}

function predictCost({ fixture, usageHint }) {
    const promptTokens = usageHint?.promptTokens > 0
        ? usageHint.promptTokens
        : Math.ceil(fixture.sourceBytes / 2) + 5_000
    const outputTokens = usageHint?.outputTokens > 0 ? usageHint.outputTokens : OUTPUT_TOKEN_LIMIT
    return (promptTokens * PRICE.input / 1_000_000) + (outputTokens * PRICE.output / 1_000_000)
}

function extractAnswerText(response) {
    const parts = response?.candidates?.[0]?.content?.parts
    if (!Array.isArray(parts)) return ''
    return parts
        .filter((part) => part && part.thought !== true && typeof part.text === 'string')
        .map((part) => part.text)
        .join('')
}

function parseAnswerJson(text) {
    if (typeof text !== 'string' || text.trim().length === 0) throw new Error('empty')
    const trimmed = text.trim()
    const withoutFence = trimmed.startsWith('```')
        ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
        : trimmed
    return JSON.parse(withoutFence)
}

function summarizeRoutes(records) {
    const out = []
    for (const provider of ['aistudio', 'vertex']) {
        for (const resolution of ['low', 'medium']) {
            const cells = records.filter((record) => record.provider === provider && record.resolution === resolution)
            out.push({
                provider,
                resolution,
                calls: cells.length,
                passed: cells.length === 6 && cells.every((record) => record.recallPassed),
                failedCalls: cells.filter((record) => !record.recallPassed).length,
            })
        }
    }
    return out
}

function failedRecord(cell, httpStatus, latencyMs, failureCode) {
    return {
        ...baseRecord(cell, httpStatus, latencyMs),
        finishReason: null,
        usage: { promptTokens: 0, outputTokens: 0, candidateTokens: 0, thoughtTokens: 0, totalTokens: 0 },
        ratedCostUsd: 0,
        recallPassed: false,
        failureCodes: [failureCode],
        answerHash: null,
    }
}

function baseRecord(cell, httpStatus, latencyMs) {
    return {
        provider: cell.provider,
        resolution: cell.resolution,
        pages: cell.pages,
        repeat: cell.repeat,
        httpStatus,
        latencyMs,
    }
}

function classifyStatus(status) {
    if (status === 401 || status === 403) return 'auth'
    if (status === 404) return 'not-found'
    if (status === 429) return 'rate-limit'
    if (status >= 500) return 'server'
    return 'http'
}

function encodeCanonicalTranscript(messages) {
    const header = {
        type: 'pagefold-transcript',
        version: 1,
        sourceMessageCount: messages.length,
        messageCount: messages.length,
        task: 'model',
        mode: 'maximum',
    }
    return [encodeHeader(header), ...messages.map((message, index) => encodeMessage(message, index))].join('\n') + '\n'
}

function encodeHeader(header) {
    return `{"type":"pagefold-transcript","version":1,"sourceMessageCount":${header.sourceMessageCount},"messageCount":${header.messageCount},"task":"model","mode":"maximum"}`
}

function encodeMessage(message, index) {
    return '{'
        + '"type":"message"'
        + ',"index":' + index
        + ',"sourceIndex":' + index
        + ',"role":' + encodeJsonString(message.role)
        + ',"name":' + (message.name === undefined ? 'null' : encodeJsonString(message.name))
        + ',"toolCallId":' + (message.toolCallId === undefined ? 'null' : encodeJsonString(message.toolCallId))
        + ',"content":' + encodeJsonString(message.content)
        + ',"attachments":[]'
        + '}'
}

function encodeJsonString(value) {
    let out = '"'
    for (let index = 0; index < value.length; index++) {
        const unit = value.charCodeAt(index)
        if (unit === 0x22) { out += '\\"'; continue }
        if (unit === 0x5C) { out += '\\\\'; continue }
        if (unit === 0x08) { out += '\\b'; continue }
        if (unit === 0x09) { out += '\\t'; continue }
        if (unit === 0x0A) { out += '\\n'; continue }
        if (unit === 0x0C) { out += '\\f'; continue }
        if (unit === 0x0D) { out += '\\r'; continue }
        if (unit <= 0x1F || (unit >= 0x7F && unit <= 0x9F)) { out += escapeUnit(unit); continue }
        if (unit >= 0xD800 && unit <= 0xDBFF) {
            const next = value.charCodeAt(index + 1)
            if (next >= 0xDC00 && next <= 0xDFFF) {
                const codePoint = ((unit - 0xD800) * 0x400) + (next - 0xDC00) + 0x10000
                if (mustEscape(codePoint)) out += escapeUnit(unit) + escapeUnit(next)
                else out += value[index] + value[index + 1]
                index++
                continue
            }
            out += escapeUnit(unit)
            continue
        }
        if (unit >= 0xDC00 && unit <= 0xDFFF) { out += escapeUnit(unit); continue }
        if (mustEscape(unit)) out += escapeUnit(unit)
        else out += value[index]
    }
    return out + '"'
}

function mustEscape(codePoint) {
    return codePoint === 0x061C || codePoint === 0x180E
        || (codePoint >= 0x200B && codePoint <= 0x200F)
        || (codePoint >= 0x2028 && codePoint <= 0x202E)
        || (codePoint >= 0x2060 && codePoint <= 0x206F)
        || (codePoint >= 0xFE00 && codePoint <= 0xFE0F)
        || codePoint === 0xFEFF
        || (codePoint >= 0xFFF9 && codePoint <= 0xFFFB)
        || (codePoint >= 0xE0000 && codePoint <= 0xE007F)
        || (codePoint >= 0xE0100 && codePoint <= 0xE01EF)
}

function escapeUnit(unit) {
    return '\\u' + unit.toString(16).toUpperCase().padStart(4, '0')
}

function publicFixture(fixture) {
    return {
        pages: fixture.pages,
        messageCount: fixture.messageCount,
        sourceBytes: fixture.sourceBytes,
        pdfBytes: fixture.pdfBytes,
        pdfSha256: fixture.pdfSha256,
        markerTriples: fixture.expected.markers.length,
        extractionExact: true,
    }
}

function assertSecretsAbsent(value, secrets) {
    const serialized = JSON.stringify(value)
    for (const secret of secrets) {
        if (typeof secret === 'string' && secret.length >= 6 && serialized.includes(secret)) {
            throw new PageFoldFeasibilityError('SECRET_LEAK_IN_RESULT')
        }
    }
}

function progress(options, message) {
    options.onProgress?.(message)
}

function requireSecretString(value, code) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new PageFoldFeasibilityError(code)
    }
    return value.trim()
}

function positiveInteger(value) {
    const number = Number(value)
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0
}

function validatePositiveNumber(value, field) {
    const number = Number(value)
    if (!Number.isFinite(number) || number <= 0) throw new PageFoldFeasibilityError(`${field}_INVALID`)
    return number
}

function roundMoney(value) {
    return Math.round(value * 1_000_000_000) / 1_000_000_000
}

function hashText(value) {
    return crypto.createHash('sha256').update(value).digest('hex')
}

function deepEqual(left, right) {
    return JSON.stringify(left) === JSON.stringify(right)
}

async function main() {
    try {
        const summary = await runFeasibility({
            databasePath: process.env.PAGEFOLD_CREDENTIAL_DB,
            aiNameHash: process.env.PAGEFOLD_AI_NAME_HASH,
            vertexNameHash: process.env.PAGEFOLD_VERTEX_NAME_HASH,
            fontCacheRoot: process.env.PAGEFOLD_TEST_FONT_CACHE,
            maxCostUsd: process.env.PAGEFOLD_MAX_USD || '5',
            dryRun: process.env.PAGEFOLD_DRY_RUN === '1',
            providers: process.env.PAGEFOLD_PROVIDERS
                ? process.env.PAGEFOLD_PROVIDERS.split(',').map((value) => value.trim()).filter(Boolean)
                : undefined,
            onProgress: (message) => process.stderr.write(`[pagefold-feasibility] ${message}\n`),
        })
        process.stdout.write(JSON.stringify(summary, null, 2) + '\n')
        if (summary.dryRun === false && summary.complete === false) process.exitCode = 2
    } catch (error) {
        const code = error instanceof PageFoldFeasibilityError ? error.code : 'FEASIBILITY_UNEXPECTED'
        process.stderr.write(`[pagefold-feasibility] failed code=${code}\n`)
        process.exitCode = 1
    }
}

if (require.main === module) void main()

module.exports = {
    PageFoldFeasibilityError,
    MODEL_ID,
    OUTPUT_TOKEN_LIMIT,
    createCallPlan,
    createFixtureMessages,
    encodeCanonicalTranscript,
    buildGenerateContentBody,
    buildRecallPrompt,
    responseSchema,
    validateAnswer,
    hashName,
    selectEntry,
    validateServiceAccount,
    extractUsage,
    rateUsage,
    predictCost,
    parseAnswerJson,
    runFeasibility,
}
