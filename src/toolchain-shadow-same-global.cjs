'use strict'

const crypto = require('node:crypto')

const REFERENCE_SCHEMA = 'patch-toolchain-shadow-same-global-reference-v1'
const COMPARISON_SCHEMA = 'patch-toolchain-shadow-same-global-comparison-v1'
const SHA256_PATTERN = /^[0-9a-f]{64}$/

class ToolchainShadowSameGlobalError extends Error {
    constructor(code, message, details = null) {
        super(message)
        this.name = 'ToolchainShadowSameGlobalError'
        this.code = code
        this.details = details
    }
}

function fail(code, message, details = null) {
    throw new ToolchainShadowSameGlobalError(code, message, details)
}

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex')
}

function canonicalValue(value) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (Array.isArray(value)) return value.map(canonicalValue)
    if (!value || typeof value !== 'object') fail('INVALID_SAME_GLOBAL_EVIDENCE', 'Unsupported canonical value')
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]))
}

function canonicalJson(value) {
    return JSON.stringify(canonicalValue(value))
}

function exactKeys(value, expected, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...expected].sort())) {
        fail('INVALID_SAME_GLOBAL_EVIDENCE', `${label} keys differ`)
    }
}

function localProjectionReferences(localReceipt) {
    if (!localReceipt || localReceipt.schema !== 'patch-toolchain-shadow-local-receipt-v1'
        || !Array.isArray(localReceipt.observations)) {
        fail('INVALID_LOCAL_REFERENCE', 'Local shadow receipt is missing or incompatible')
    }
    const references = {}
    for (const mask of [0, 1]) {
        const values = localReceipt.observations
            .filter((entry) => entry.mask === mask)
            .map((entry) => entry.candidateProjection?.projectionSha256)
        if (values.length !== 4 || values.some((value) => !SHA256_PATTERN.test(value ?? ''))
            || new Set(values).size !== 1) {
            fail('LOCAL_BOUNDARY_PROJECTION_MISMATCH', `Local mask ${mask} does not have one projection across four boundaries`)
        }
        references[String(mask)] = values[0]
    }
    return references
}

function buildSameGlobalReference({ localReceipt, materialDeclarationSha256 }) {
    if (!SHA256_PATTERN.test(materialDeclarationSha256 ?? '')
        || !SHA256_PATTERN.test(localReceipt?.integrity?.payloadSha256 ?? '')
        || !SHA256_PATTERN.test(localReceipt?.declarationSha256 ?? '')) {
        fail('INVALID_LOCAL_REFERENCE', 'Local or material declaration identity is invalid')
    }
    return {
        schema: REFERENCE_SCHEMA,
        candidateId: 'toolchain-hardening',
        candidateDeclarationSha256: localReceipt.declarationSha256,
        materialDeclarationSha256,
        localReceiptPayloadSha256: localReceipt.integrity.payloadSha256,
        references: localProjectionReferences(localReceipt),
    }
}

function validateSameGlobalReference(reference) {
    exactKeys(reference, [
        'schema', 'candidateId', 'candidateDeclarationSha256',
        'materialDeclarationSha256', 'localReceiptPayloadSha256', 'references',
    ], 'same-Global reference')
    if (reference.schema !== REFERENCE_SCHEMA || reference.candidateId !== 'toolchain-hardening') {
        fail('INVALID_LOCAL_REFERENCE', 'Same-Global reference candidate identity is invalid')
    }
    for (const key of ['candidateDeclarationSha256', 'materialDeclarationSha256', 'localReceiptPayloadSha256']) {
        if (!SHA256_PATTERN.test(reference[key] ?? '')) fail('INVALID_LOCAL_REFERENCE', `${key} is invalid`)
    }
    exactKeys(reference.references, ['0', '1'], 'same-Global projection references')
    if (Object.values(reference.references).some((value) => !SHA256_PATTERN.test(value ?? ''))) {
        fail('INVALID_LOCAL_REFERENCE', 'Same-Global projection hash is invalid')
    }
    return reference
}

function buildSameGlobalComparison({ reference, visiblePacks, observations }) {
    validateSameGlobalReference(reference)
    if (!Array.isArray(visiblePacks) || visiblePacks[visiblePacks.indexOf('toolchain-hardening')] !== 'toolchain-hardening') {
        fail('INVALID_GLOBAL_DOMAIN', 'Toolchain candidate is absent from the Global domain')
    }
    const candidateBitIndex = visiblePacks.indexOf('toolchain-hardening')
    const expected = 2 ** visiblePacks.length
    if (!Array.isArray(observations) || observations.length !== expected) {
        fail('INCOMPLETE_SAME_GLOBAL_COMPARISON', 'Same-Global observations do not cover the Global domain')
    }
    const ordered = [...observations].sort((left, right) => left.mask - right.mask)
    let candidateOffMasks = 0
    let candidateOnMasks = 0
    let mismatches = 0
    for (let mask = 0; mask < expected; mask += 1) {
        const observation = ordered[mask]
        const candidateMask = Math.floor(mask / (2 ** candidateBitIndex)) % 2
        const matchesLocal = observation?.projectionSha256 === reference.references[String(candidateMask)]
        if (observation?.mask !== mask || observation.candidateMask !== candidateMask
            || !SHA256_PATTERN.test(observation.projectionSha256 ?? '')
            || observation.matchesLocal !== matchesLocal) {
            fail('INVALID_SAME_GLOBAL_OBSERVATION', `Same-Global observation ${mask} is invalid`)
        }
        if (candidateMask === 0) candidateOffMasks += 1
        else candidateOnMasks += 1
        if (!matchesLocal) mismatches += 1
    }
    return {
        schema: COMPARISON_SCHEMA,
        candidateId: reference.candidateId,
        candidateBitIndex,
        candidateDeclarationSha256: reference.candidateDeclarationSha256,
        materialDeclarationSha256: reference.materialDeclarationSha256,
        localReceiptPayloadSha256: reference.localReceiptPayloadSha256,
        localReferences: { ...reference.references },
        globalExecutionSource: 'canonical-global-exhaustive-same-execution',
        coverage: {
            rawMasks: expected,
            processedMasks: expected,
            candidateOffMasks,
            candidateOnMasks,
        },
        observations: ordered,
        mismatches,
        status: mismatches === 0 ? 'passed' : 'failed',
    }
}

function validateSameGlobalComparison(comparison, result) {
    if (comparison === undefined) return true
    exactKeys(comparison, [
        'schema', 'candidateId', 'candidateBitIndex', 'candidateDeclarationSha256',
        'materialDeclarationSha256', 'localReceiptPayloadSha256', 'localReferences', 'globalExecutionSource',
        'coverage', 'observations', 'mismatches', 'status',
    ], 'same-Global comparison')
    const reference = {
        schema: REFERENCE_SCHEMA,
        candidateId: comparison.candidateId,
        candidateDeclarationSha256: comparison.candidateDeclarationSha256,
        materialDeclarationSha256: comparison.materialDeclarationSha256,
        localReceiptPayloadSha256: comparison.localReceiptPayloadSha256,
        references: comparison.localReferences,
    }
    validateSameGlobalReference(reference)
    const rebuilt = buildSameGlobalComparison({
        reference,
        visiblePacks: result.visiblePacks,
        observations: comparison.observations,
    })
    if (canonicalJson(rebuilt) !== canonicalJson(comparison)
        || comparison.globalExecutionSource !== 'canonical-global-exhaustive-same-execution'
        || comparison.coverage.rawMasks !== result.rawSelections
        || comparison.coverage.processedMasks !== result.verifiedSelections) {
        fail('INVALID_SAME_GLOBAL_COMPARISON', 'Same-Global comparison contradicts canonical coverage')
    }
    return comparison
}

module.exports = {
    COMPARISON_SCHEMA,
    REFERENCE_SCHEMA,
    ToolchainShadowSameGlobalError,
    buildSameGlobalComparison,
    buildSameGlobalReference,
    localProjectionReferences,
    validateSameGlobalComparison,
    validateSameGlobalReference,
}
