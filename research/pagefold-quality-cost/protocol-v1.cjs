'use strict'

const crypto = require('node:crypto')

const SCHEMA_VERSION = 1
const PROTOCOL_ID = 'pagefold-quality-cost-v1'
const HARD_CAP_USD = '10.00'
const COST_SCALE = 12
const COST_UNITS_PER_USD = 10n ** BigInt(COST_SCALE)
const TOKENS_PER_MILLION = 1_000_000n
const CANONICAL_MAX_DEPTH = 256
const CANONICAL_MAX_NODES = 2_000_000

const CALL_PURPOSES = Object.freeze(['annotation', 'generation', 'judge', 'retry'])
const PRICE_CATEGORIES = Object.freeze([
    'inputTextTokens',
    'inputMediaTokens',
    'outputTokens',
    'thinkingTokens',
    'cachedInputTokens',
    'toolUseTokens',
])
const AUTHORITY_CLASSES = Object.freeze([
    'deterministic-source-fact',
    'verified-source-anchored',
    'interpretive-axis',
    'global-unverified',
])
const VERIFICATION_STATES = Object.freeze(['deterministic', 'accepted', 'rejected', 'disputed', 'unverified'])
const COHORTS = Object.freeze(['calibration', 'locked'])
const CASE_KINDS = Object.freeze(['synthetic', 'real'])
const OBLIGATION_TYPES = Object.freeze([
    'fact',
    'relationship',
    'commitment',
    'prohibition',
    'causal-event',
    'resolved-hook',
    'unresolved-hook',
    'voice-behavior',
    'system-instruction',
    'current-user-request',
])
const EVALUATION_MODES = Object.freeze(['direct-retrieval', 'cued-use', 'spontaneous-use'])
const POLARITIES = Object.freeze(['positive', 'negative', 'not-applicable'])
const REVIEWER_DECISIONS = Object.freeze(['deterministic', 'user-accepted', 'user-accepted-axis', 'rejected', 'disputed', 'unverified'])

const FORBIDDEN_ARTIFACT_KEYS = new Set([
    'apikey',
    'api_key',
    'authorization',
    'client_email',
    'credential',
    'credentials',
    'inlinecredential',
    'private_key',
    'private_key_id',
    'privatekey',
    'project_id',
    'serviceaccountjson',
    'access_token',
])

class QualityCostProtocolError extends Error {
    constructor(code, detail) {
        super(detail ? `${code}: ${detail}` : code)
        this.name = 'QualityCostProtocolError'
        this.code = code
    }
}

function fail(code, detail) {
    throw new QualityCostProtocolError(code, detail)
}

function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false
    const proto = Object.getPrototypeOf(value)
    return proto === Object.prototype || proto === null
}

function canonicalize(value, state = { nodes: 0 }, depth = 0) {
    state.nodes++
    if (state.nodes > CANONICAL_MAX_NODES) fail('CANONICAL_NODE_LIMIT')
    if (depth > CANONICAL_MAX_DEPTH) fail('CANONICAL_DEPTH_LIMIT')
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) fail('CANONICAL_NUMBER_INVALID')
        return value
    }
    if (Array.isArray(value)) return value.map((child) => canonicalize(child, state, depth + 1))
    if (!isPlainObject(value)) fail('CANONICAL_VALUE_INVALID')
    const out = {}
    for (const key of Object.keys(value).sort()) {
        if (value[key] === undefined) fail('CANONICAL_UNDEFINED', key)
        out[key] = canonicalize(value[key], state, depth + 1)
    }
    return out
}

function canonicalJson(value) {
    return JSON.stringify(canonicalize(value))
}

function sha256Bytes(value) {
    return crypto.createHash('sha256').update(value).digest('hex')
}

function sha256Json(value) {
    return sha256Bytes(Buffer.from(canonicalJson(value), 'utf8'))
}

function assertSha256(value, code = 'SHA256_INVALID') {
    if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail(code)
    return value
}

function assertIdentifier(value, code = 'IDENTIFIER_INVALID') {
    if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) fail(code)
    return value
}

function assertNonNegativeSafeInteger(value, code) {
    if (!Number.isSafeInteger(value) || value < 0) fail(code)
    return value
}

function assertPositiveSafeInteger(value, code) {
    if (!Number.isSafeInteger(value) || value < 1) fail(code)
    return value
}

function assertNoForbiddenArtifactKeys(value, path = '$', state = { nodes: 0 }, depth = 0) {
    state.nodes++
    if (state.nodes > CANONICAL_MAX_NODES) fail('ARTIFACT_SCAN_NODE_LIMIT')
    if (depth > CANONICAL_MAX_DEPTH) fail('ARTIFACT_SCAN_DEPTH_LIMIT')
    if (Array.isArray(value)) {
        value.forEach((item, index) => assertNoForbiddenArtifactKeys(item, `${path}[${index}]`, state, depth + 1))
        return true
    }
    if (!value || typeof value !== 'object') return true
    for (const [key, child] of Object.entries(value)) {
        if (FORBIDDEN_ARTIFACT_KEYS.has(key.toLowerCase())) {
            fail('PRIVATE_ARTIFACT_SECRET_FIELD', `${path}.${key}`)
        }
        assertNoForbiddenArtifactKeys(child, `${path}.${key}`, state, depth + 1)
    }
    return true
}

function buildCoreConditionMatrix() {
    const conditions = [{
        key: 'direct-structured-text',
        carrier: 'direct-text',
        mediaResolution: null,
        systemPlacement: 'native',
        currentUserPlacement: 'native',
    }]
    for (const mediaResolution of ['low', 'medium', 'high']) {
        for (const systemPlacement of ['pdf', 'native']) {
            for (const currentUserPlacement of ['pdf', 'native']) {
                conditions.push({
                    key: `pdf-${mediaResolution}-system-${systemPlacement}-current-user-${currentUserPlacement}`,
                    carrier: 'pdf',
                    mediaResolution,
                    systemPlacement,
                    currentUserPlacement,
                })
            }
        }
    }
    return Object.freeze(conditions.map((condition) => Object.freeze(condition)))
}

function createBlindMap(conditions, secret) {
    if (!Array.isArray(conditions) || conditions.length < 2) fail('BLIND_CONDITIONS_INVALID')
    const secretBytes = Buffer.isBuffer(secret) ? secret : Buffer.from(String(secret ?? ''), 'utf8')
    if (secretBytes.byteLength < 32) fail('BLIND_SECRET_TOO_SHORT')
    const seenKeys = new Set()
    const seenIds = new Set()
    const records = conditions.map((condition) => {
        assertIdentifier(condition?.key, 'CONDITION_KEY_INVALID')
        if (seenKeys.has(condition.key)) fail('CONDITION_KEY_DUPLICATE')
        seenKeys.add(condition.key)
        const digest = crypto.createHmac('sha256', secretBytes)
            .update(`${PROTOCOL_ID}\0condition\0${canonicalJson(condition)}`)
            .digest('hex')
        const opaqueId = `c-${digest.slice(0, 20)}`
        if (seenIds.has(opaqueId)) fail('BLIND_ID_COLLISION')
        seenIds.add(opaqueId)
        return Object.freeze({ opaqueId, condition: canonicalize(condition) })
    })
    return Object.freeze(records)
}

function deterministicOrder(items, seed, blockIdentity) {
    const seedBytes = Buffer.isBuffer(seed) ? seed : Buffer.from(String(seed ?? ''), 'utf8')
    if (seedBytes.byteLength < 32) fail('ORDER_SEED_TOO_SHORT')
    assertIdentifier(blockIdentity, 'BLOCK_ID_INVALID')
    return [...items].map((item, index) => ({
        item,
        index,
        rank: crypto.createHmac('sha256', seedBytes)
            .update(`${PROTOCOL_ID}\0${blockIdentity}\0${index}\0${canonicalJson(item)}`)
            .digest('hex'),
    })).sort((left, right) => left.rank.localeCompare(right.rank) || left.index - right.index)
        .map((ranked) => ranked.item)
}

function buildPairedSchedule({ scheduleId, phase, taskClass, cases, blindMap, conditionIds, repeatBlocks, orderSeed }) {
    assertIdentifier(scheduleId, 'SCHEDULE_ID_INVALID')
    assertIdentifier(phase, 'PHASE_INVALID')
    assertIdentifier(taskClass, 'TASK_CLASS_INVALID')
    assertPositiveSafeInteger(repeatBlocks, 'REPEAT_BLOCKS_INVALID')
    if (!Array.isArray(cases) || cases.length === 0) fail('SCHEDULE_CASES_INVALID')
    if (!Array.isArray(blindMap) || blindMap.length < 1) fail('SCHEDULE_BLIND_MAP_INVALID')
    const availableConditionIds = blindMap.map((record) => assertIdentifier(record.opaqueId, 'OPAQUE_CONDITION_ID_INVALID'))
    if (new Set(availableConditionIds).size !== availableConditionIds.length) fail('OPAQUE_CONDITION_ID_DUPLICATE')
    const scheduledConditionIds = conditionIds === undefined ? availableConditionIds : [...conditionIds]
    if (scheduledConditionIds.length < 1
        || new Set(scheduledConditionIds).size !== scheduledConditionIds.length
        || scheduledConditionIds.some((conditionId) => !availableConditionIds.includes(conditionId))) {
        fail('SCHEDULE_CONDITION_SET_INVALID')
    }
    const calls = []
    for (const testCase of cases) {
        const caseId = assertIdentifier(testCase.opaqueId, 'OPAQUE_CASE_ID_INVALID')
        for (let repeat = 1; repeat <= repeatBlocks; repeat++) {
            const blockId = `${phase}:${taskClass}:${caseId}:r${repeat}`
            const ordered = deterministicOrder(scheduledConditionIds, orderSeed, blockId)
            for (let position = 0; position < ordered.length; position++) {
                calls.push(Object.freeze({
                    callId: `${scheduleId}-call-${String(calls.length + 1).padStart(5, '0')}`,
                    scheduleId,
                    blockId,
                    phase,
                    taskClass,
                    opaqueCaseId: caseId,
                    opaqueConditionId: ordered[position],
                    repeat,
                    position: position + 1,
                }))
            }
        }
    }
    verifyCompleteBlocks(calls, scheduledConditionIds)
    return Object.freeze(calls)
}

function verifyCompleteBlocks(calls, conditionIds) {
    if (!Array.isArray(calls) || calls.length === 0) fail('SCHEDULE_EMPTY')
    const expected = [...conditionIds].sort()
    const byBlock = new Map()
    for (const call of calls) {
        if (!byBlock.has(call.blockId)) byBlock.set(call.blockId, [])
        byBlock.get(call.blockId).push(call)
    }
    for (const block of byBlock.values()) {
        const observed = block.map((call) => call.opaqueConditionId).sort()
        if (canonicalJson(observed) !== canonicalJson(expected)) fail('SCHEDULE_BLOCK_INCOMPLETE')
        const positions = block.map((call) => call.position).sort((a, b) => a - b)
        if (canonicalJson(positions) !== canonicalJson(expected.map((_, index) => index + 1))) {
            fail('SCHEDULE_POSITION_INVALID')
        }
    }
    return { blockCount: byBlock.size, callsPerBlock: expected.length }
}

function validateCaseManifest(manifest) {
    if (manifest?.schemaVersion !== SCHEMA_VERSION || manifest?.protocolId !== PROTOCOL_ID) {
        fail('CASE_MANIFEST_VERSION_INVALID')
    }
    if (!Array.isArray(manifest.cases) || manifest.cases.length < 2) fail('CASE_MANIFEST_CASES_INVALID')
    const ids = new Set()
    const snapshotOwners = new Map()
    const cohortCounts = Object.fromEntries(COHORTS.map((cohort) => [cohort, 0]))
    for (const testCase of manifest.cases) {
        assertIdentifier(testCase.id, 'CASE_ID_INVALID')
        assertIdentifier(testCase.opaqueId, 'OPAQUE_CASE_ID_INVALID')
        if (ids.has(testCase.id) || ids.has(testCase.opaqueId)) fail('CASE_ID_DUPLICATE')
        ids.add(testCase.id)
        ids.add(testCase.opaqueId)
        if (!COHORTS.includes(testCase.cohort)) fail('CASE_COHORT_INVALID')
        if (!CASE_KINDS.includes(testCase.kind)) fail('CASE_KIND_INVALID')
        assertSha256(testCase.sourceSnapshotSha256, 'CASE_SOURCE_SHA_INVALID')
        cohortCounts[testCase.cohort]++
        const prior = snapshotOwners.get(testCase.sourceSnapshotSha256)
        if (prior && prior !== testCase.cohort) fail('CALIBRATION_LOCKED_SOURCE_REUSE')
        snapshotOwners.set(testCase.sourceSnapshotSha256, testCase.cohort)
    }
    if (cohortCounts.calibration < 1 || cohortCounts.locked < 1) fail('CASE_COHORT_MISSING')
    return Object.freeze({ caseCount: manifest.cases.length, cohortCounts })
}

function sourceSnapshotIdentity(snapshot) {
    if (snapshot?.schemaVersion !== SCHEMA_VERSION || snapshot?.protocolId !== PROTOCOL_ID) {
        fail('SOURCE_SNAPSHOT_VERSION_INVALID')
    }
    assertIdentifier(snapshot.caseId, 'SOURCE_CASE_ID_INVALID')
    if (!Array.isArray(snapshot.sources) || snapshot.sources.length === 0) fail('SOURCE_RECORDS_INVALID')
    if (!Array.isArray(snapshot.effectiveMessages) || snapshot.effectiveMessages.length === 0) {
        fail('EFFECTIVE_MESSAGES_INVALID')
    }
    assertNoForbiddenArtifactKeys(snapshot)
    const sourceIds = new Set()
    for (const source of snapshot.sources) {
        assertIdentifier(source.id, 'SOURCE_ID_INVALID')
        if (sourceIds.has(source.id)) fail('SOURCE_ID_DUPLICATE')
        sourceIds.add(source.id)
        if (typeof source.kind !== 'string' || typeof source.content !== 'string') fail('SOURCE_RECORD_INVALID')
    }
    const effectiveIndices = new Set()
    for (let index = 0; index < snapshot.effectiveMessages.length; index++) {
        const message = snapshot.effectiveMessages[index]
        assertNonNegativeSafeInteger(message.sourceIndex, 'EFFECTIVE_SOURCE_INDEX_INVALID')
        if (message.sourceIndex !== index || effectiveIndices.has(message.sourceIndex)) {
            fail('EFFECTIVE_SOURCE_INDEX_SEQUENCE_INVALID')
        }
        effectiveIndices.add(message.sourceIndex)
        if (!['system', 'user', 'assistant', 'tool'].includes(message.role) || typeof message.content !== 'string') {
            fail('EFFECTIVE_MESSAGE_INVALID')
        }
    }
    return sha256Json(snapshot)
}

function validateObligationDossier(snapshot, dossier) {
    const snapshotSha256 = sourceSnapshotIdentity(snapshot)
    if (dossier?.schemaVersion !== SCHEMA_VERSION || dossier?.protocolId !== PROTOCOL_ID) {
        fail('DOSSIER_VERSION_INVALID')
    }
    if (dossier.caseId !== snapshot.caseId || dossier.sourceSnapshotSha256 !== snapshotSha256) {
        fail('DOSSIER_SOURCE_IDENTITY_INVALID')
    }
    if (!Array.isArray(dossier.obligations) || dossier.obligations.length === 0) fail('DOSSIER_OBLIGATIONS_INVALID')
    const sources = new Map(snapshot.sources.map((source) => [source.id, source]))
    const ids = new Set()
    const coverage = Object.fromEntries(AUTHORITY_CLASSES.map((authority) => [authority, 0]))
    let objectiveEligible = 0
    for (const obligation of dossier.obligations) {
        assertIdentifier(obligation.id, 'OBLIGATION_ID_INVALID')
        if (ids.has(obligation.id)) fail('OBLIGATION_ID_DUPLICATE')
        ids.add(obligation.id)
        if (!AUTHORITY_CLASSES.includes(obligation.authorityClass)) fail('OBLIGATION_AUTHORITY_INVALID')
        if (!VERIFICATION_STATES.includes(obligation.verificationState)) fail('OBLIGATION_VERIFICATION_INVALID')
        if (!OBLIGATION_TYPES.includes(obligation.obligationType)) fail('OBLIGATION_TYPE_INVALID')
        if (!EVALUATION_MODES.includes(obligation.evaluationMode)) fail('OBLIGATION_EVALUATION_MODE_INVALID')
        if (!POLARITIES.includes(obligation.polarity)) fail('OBLIGATION_POLARITY_INVALID')
        if (!REVIEWER_DECISIONS.includes(obligation.reviewerDecision)) fail('OBLIGATION_REVIEWER_DECISION_INVALID')
        if (typeof obligation.subject !== 'string' || obligation.subject.length === 0
            || typeof obligation.speakerEntity !== 'string' || obligation.speakerEntity.length === 0
            || !['system', 'user', 'assistant', 'tool', 'mixed'].includes(obligation.sourceRole)) {
            fail('OBLIGATION_SUBJECT_INVALID')
        }
        if (obligation.object !== null && obligation.object !== undefined && typeof obligation.object !== 'string') {
            fail('OBLIGATION_OBJECT_INVALID')
        }
        if (!Array.isArray(obligation.requiredObligationIds)
            || !Array.isArray(obligation.acceptableUses) || obligation.acceptableUses.length === 0
            || !Array.isArray(obligation.prohibitedContradictions) || obligation.prohibitedContradictions.length === 0
            || [...obligation.acceptableUses, ...obligation.prohibitedContradictions]
                .some((value) => typeof value !== 'string' || value.length === 0)) {
            fail('OBLIGATION_USE_CONTRACT_INVALID')
        }
        validateObligationDistance(obligation.distance)
        if (!Array.isArray(obligation.citations) || obligation.citations.length === 0) {
            fail('OBLIGATION_CITATIONS_INVALID')
        }
        for (const citation of obligation.citations) validateCitation(sources, citation)
        const latest = obligation.lastSourceMention
        if (!latest || typeof latest.sourceId !== 'string'
            || !Number.isSafeInteger(latest.endByte) || latest.endByte < 1
            || !obligation.citations.some((citation) => (
                citation.sourceId === latest.sourceId && citation.endByte === latest.endByte
            ))) fail('OBLIGATION_LAST_SOURCE_MENTION_INVALID')
        if (obligation.authorityClass === 'deterministic-source-fact'
            && (obligation.verificationState !== 'deterministic'
                || obligation.reviewerDecision !== 'deterministic')) fail('DETERMINISTIC_VERIFICATION_INVALID')
        if (obligation.authorityClass === 'verified-source-anchored'
            && (obligation.verificationState !== 'accepted'
                || obligation.reviewerDecision !== 'user-accepted')) fail('VERIFIED_OBLIGATION_NOT_ACCEPTED')
        if (obligation.authorityClass === 'interpretive-axis'
            && !['user-accepted-axis', 'disputed'].includes(obligation.reviewerDecision)) {
            fail('INTERPRETIVE_REVIEWER_DECISION_INVALID')
        }
        if (obligation.authorityClass === 'global-unverified'
            && (obligation.verificationState !== 'unverified'
                || obligation.reviewerDecision !== 'unverified')) fail('GLOBAL_UNVERIFIED_STATE_INVALID')
        const eligible = (obligation.authorityClass === 'deterministic-source-fact'
                && obligation.verificationState === 'deterministic')
            || (obligation.authorityClass === 'verified-source-anchored'
                && obligation.verificationState === 'accepted')
        if (eligible) objectiveEligible++
        coverage[obligation.authorityClass]++
    }
    for (const obligation of dossier.obligations) {
        if (obligation.requiredObligationIds.some((requiredId) => (
            typeof requiredId !== 'string' || requiredId === obligation.id || !ids.has(requiredId)
        ))) fail('OBLIGATION_DEPENDENCY_INVALID')
    }
    return Object.freeze({ snapshotSha256, obligationCount: dossier.obligations.length, objectiveEligible, coverage })
}

function validateObligationDistance(distance) {
    if (!distance || typeof distance.tokenAuthority !== 'string' || distance.tokenAuthority.length === 0) {
        fail('OBLIGATION_DISTANCE_INVALID')
    }
    for (const key of [
        'sourceTokenDistance',
        'messageTurnDistance',
        'distanceSinceLastMention',
        'sceneTransitions',
        'remoteObligationCount',
    ]) {
        if (!Number.isSafeInteger(distance[key]) || distance[key] < 0) fail('OBLIGATION_DISTANCE_INVALID')
    }
    if (distance.remoteObligationCount < 1) fail('OBLIGATION_DISTANCE_INVALID')
    return true
}

function validateCitation(sources, citation) {
    const source = sources.get(citation?.sourceId)
    if (!source) fail('CITATION_SOURCE_MISSING')
    const bytes = Buffer.from(source.content, 'utf8')
    const startByte = assertNonNegativeSafeInteger(citation.startByte, 'CITATION_START_INVALID')
    const endByte = assertNonNegativeSafeInteger(citation.endByte, 'CITATION_END_INVALID')
    if (endByte <= startByte || endByte > bytes.byteLength) fail('CITATION_RANGE_INVALID')
    const selected = bytes.subarray(startByte, endByte)
    let decoded
    try {
        decoded = new TextDecoder('utf-8', { fatal: true }).decode(selected)
    } catch {
        fail('CITATION_UTF8_BOUNDARY_INVALID')
    }
    if (!Buffer.from(decoded, 'utf8').equals(selected)) fail('CITATION_UTF8_BOUNDARY_INVALID')
    if (sha256Bytes(selected) !== assertSha256(citation.sha256, 'CITATION_SHA_INVALID')) {
        fail('CITATION_BYTES_MISMATCH')
    }
    return true
}

function escapeJsonPointer(value) {
    return String(value).replaceAll('~', '~0').replaceAll('/', '~1')
}

function diffJsonPaths(left, right, path = '') {
    if (Object.is(left, right)) return []
    const current = path || '/'
    const leftArray = Array.isArray(left)
    const rightArray = Array.isArray(right)
    if (leftArray || rightArray) {
        if (!leftArray || !rightArray) return [current]
        const out = left.length === right.length ? [] : [`${current === '/' ? '' : current}/#length`]
        const length = Math.max(left.length, right.length)
        for (let index = 0; index < length; index++) {
            const childPath = `${current === '/' ? '' : current}/${index}`
            if (index >= left.length || index >= right.length) out.push(childPath)
            else out.push(...diffJsonPaths(left[index], right[index], childPath))
        }
        return [...new Set(out)].sort()
    }
    const leftObject = isPlainObject(left)
    const rightObject = isPlainObject(right)
    if (leftObject || rightObject) {
        if (!leftObject || !rightObject) return [current]
        const out = []
        const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()
        for (const key of keys) {
            const childPath = `${current === '/' ? '' : current}/${escapeJsonPointer(key)}`
            if (!(key in left) || !(key in right)) out.push(childPath)
            else out.push(...diffJsonPaths(left[key], right[key], childPath))
        }
        return [...new Set(out)].sort()
    }
    return [current]
}

function pathMatches(pattern, observed) {
    if (typeof pattern !== 'string' || !pattern.startsWith('/')) fail('DIFF_PATTERN_INVALID')
    const patternParts = pattern.split('/').slice(1)
    const observedParts = observed.split('/').slice(1)
    let p = 0
    let o = 0
    while (p < patternParts.length && o < observedParts.length) {
        if (patternParts[p] === '**') return p === patternParts.length - 1
        if (patternParts[p] !== '*' && patternParts[p] !== observedParts[o]) return false
        p++
        o++
    }
    if (p === patternParts.length && o === observedParts.length) return true
    return p === patternParts.length - 1 && patternParts[p] === '**'
}

function assertAllowedRequestDiff(base, variant, allowedPatterns) {
    if (!Array.isArray(allowedPatterns) || allowedPatterns.length === 0) fail('DIFF_ALLOWLIST_EMPTY')
    const paths = diffJsonPaths(base, variant)
    if (paths.length === 0) fail('REQUEST_VARIANT_NO_DIFF')
    const blocked = paths.filter((path) => !allowedPatterns.some((pattern) => pathMatches(pattern, path)))
    if (blocked.length > 0) fail('REQUEST_DIFF_OUTSIDE_ALLOWLIST', blocked.join(','))
    return Object.freeze({
        baseSha256: sha256Json(base),
        variantSha256: sha256Json(variant),
        paths: Object.freeze(paths),
    })
}

function parseUsdUnits(value) {
    if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value)) fail('USD_DECIMAL_INVALID')
    const [whole, fraction = ''] = value.split('.')
    if (fraction.length > COST_SCALE) fail('USD_DECIMAL_PRECISION_EXCEEDED')
    return (BigInt(whole) * COST_UNITS_PER_USD) + BigInt((fraction + '0'.repeat(COST_SCALE)).slice(0, COST_SCALE))
}

function formatUsdUnits(value) {
    const units = typeof value === 'bigint' ? value : BigInt(value)
    if (units < 0n) fail('USD_UNITS_NEGATIVE')
    const whole = units / COST_UNITS_PER_USD
    const fraction = (units % COST_UNITS_PER_USD).toString().padStart(COST_SCALE, '0').replace(/0+$/, '')
    return fraction ? `${whole}.${fraction}` : whole.toString()
}

function ceilDivide(numerator, denominator) {
    if (numerator < 0n || denominator <= 0n) fail('COST_DIVISION_INVALID')
    return numerator === 0n ? 0n : ((numerator - 1n) / denominator) + 1n
}

function validatePriceBasis(priceBasis) {
    if (priceBasis?.schemaVersion !== SCHEMA_VERSION) fail('PRICE_BASIS_VERSION_INVALID')
    if (typeof priceBasis.source !== 'string' || priceBasis.source.length === 0) fail('PRICE_SOURCE_INVALID')
    if (typeof priceBasis.effectiveDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(priceBasis.effectiveDate)) {
        fail('PRICE_DATE_INVALID')
    }
    if (!isPlainObject(priceBasis.usdPerMillionTokens)) fail('PRICE_RATES_INVALID')
    const rates = {}
    for (const category of PRICE_CATEGORIES) {
        const value = priceBasis.usdPerMillionTokens[category]
        if (value !== undefined) rates[category] = parseUsdUnits(value)
    }
    return rates
}

function reserveCallCost(call, priceBasis) {
    assertIdentifier(call?.callId, 'COST_CALL_ID_INVALID')
    if (!CALL_PURPOSES.includes(call.purpose)) fail('CALL_PURPOSE_INVALID')
    if (!isPlainObject(call.reservation)) fail('CALL_RESERVATION_INVALID')
    const rates = validatePriceBasis(priceBasis)
    let totalUnits = 0n
    let totalTokens = 0
    const categories = {}
    for (const category of PRICE_CATEGORIES) {
        const tokens = assertNonNegativeSafeInteger(call.reservation[category] ?? 0, 'RESERVATION_TOKENS_INVALID')
        totalTokens += tokens
        if (tokens > 0 && rates[category] === undefined) fail('RESERVATION_PRICE_MISSING', category)
        const units = tokens === 0 ? 0n : ceilDivide(BigInt(tokens) * rates[category], TOKENS_PER_MILLION)
        categories[category] = {
            tokens,
            usdUnits: units.toString(),
            usd: formatUsdUnits(units),
        }
        totalUnits += units
    }
    if (!Number.isSafeInteger(totalTokens) || totalTokens < 1) fail('CALL_RESERVATION_EMPTY')
    return Object.freeze({
        callId: call.callId,
        purpose: call.purpose,
        categories: Object.freeze(categories),
        totalUsdUnits: totalUnits.toString(),
        totalUsd: formatUsdUnits(totalUnits),
    })
}

function buildCostLedger({ calls, priceBasis, capUsd = HARD_CAP_USD }) {
    if (!Array.isArray(calls) || calls.length === 0) fail('COST_CALLS_INVALID')
    const ids = new Set()
    const entries = []
    let totalUnits = 0n
    for (const call of calls) {
        if (ids.has(call.callId)) fail('COST_CALL_ID_DUPLICATE')
        ids.add(call.callId)
        const entry = reserveCallCost(call, priceBasis)
        entries.push(entry)
        totalUnits += BigInt(entry.totalUsdUnits)
    }
    const capUnits = parseUsdUnits(capUsd)
    if (totalUnits > capUnits) fail('COST_CAP_INSUFFICIENT')
    return Object.freeze({
        schemaVersion: SCHEMA_VERSION,
        arithmetic: `integer-picodollar-ceiling-per-call-category-${COST_SCALE}`,
        capUsd,
        capUsdUnits: capUnits.toString(),
        reservedUsd: formatUsdUnits(totalUnits),
        reservedUsdUnits: totalUnits.toString(),
        remainingUsd: formatUsdUnits(capUnits - totalUnits),
        remainingUsdUnits: (capUnits - totalUnits).toString(),
        entries: Object.freeze(entries),
        priceBasisSha256: sha256Json(priceBasis),
    })
}

function buildActivationDraft() {
    return Object.freeze({
        schemaVersion: SCHEMA_VERSION,
        protocolId: PROTOCOL_ID,
        status: 'draft-offline-only',
        providerCallsAuthorized: false,
        activatedPhases: [],
        recordedConstraints: {
            providerRoute: 'vertex-ai-global-standard-shared',
            requestedModel: 'gemini-3.7-flash',
            thinking: { level: 'low', includeThoughts: false },
            tools: 'absent',
            grounding: 'absent',
            explicitCache: 'absent',
            otherMedia: 'absent',
            researchMediaResolutions: ['low', 'medium', 'high'],
            automaticRetry: 'none',
            hardCapUsd: HARD_CAP_USD,
        },
        unresolved: [
            'private-case-identities-and-source-quiescence',
            'privacy-retention-and-deletion-boundary',
            'current-official-price-record',
            'calibration-and-locked-case-manifest',
            'verified-obligation-dossiers',
            'final-condition-manifest-and-request-diff-allowlists',
            'complete-call-order-and-cost-proof',
            'independent-judge-identity-prompt-and-calibration',
            'practical-difference-and-uncertainty-requirements',
            'explicit-phase-activation',
        ],
    })
}

module.exports = {
    AUTHORITY_CLASSES,
    CANONICAL_MAX_DEPTH,
    CANONICAL_MAX_NODES,
    CALL_PURPOSES,
    CASE_KINDS,
    COHORTS,
    COST_SCALE,
    COST_UNITS_PER_USD,
    FORBIDDEN_ARTIFACT_KEYS,
    HARD_CAP_USD,
    PRICE_CATEGORIES,
    EVALUATION_MODES,
    OBLIGATION_TYPES,
    POLARITIES,
    PROTOCOL_ID,
    QualityCostProtocolError,
    SCHEMA_VERSION,
    VERIFICATION_STATES,
    REVIEWER_DECISIONS,
    assertAllowedRequestDiff,
    assertNoForbiddenArtifactKeys,
    buildActivationDraft,
    buildCoreConditionMatrix,
    buildCostLedger,
    buildPairedSchedule,
    canonicalJson,
    createBlindMap,
    deterministicOrder,
    diffJsonPaths,
    formatUsdUnits,
    parseUsdUnits,
    pathMatches,
    reserveCallCost,
    sha256Bytes,
    sha256Json,
    sourceSnapshotIdentity,
    validateCaseManifest,
    validateCitation,
    validateObligationDossier,
    validateObligationDistance,
    verifyCompleteBlocks,
}
