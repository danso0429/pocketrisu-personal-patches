'use strict'

const crypto = require('node:crypto')
const {
    PROJECTION_SCHEMA,
    SEMANTIC_FIELD_SET_SHA256,
    candidateBoundaryConsensus,
    candidateMappingContract,
    candidateMaskForGlobalMask,
    validateGlobalCandidateMapping,
} = require('./toolchain-shadow-canonical-projection.cjs')

const REFERENCE_SCHEMA = 'patch-toolchain-shadow-same-global-reference-v1'
const COMPARISON_SCHEMA = 'patch-toolchain-shadow-same-global-comparison-v1'
const REFERENCE_V2_SCHEMA = 'patch-toolchain-shadow-same-global-reference-v2'
const COMPARISON_V2_SCHEMA = 'patch-toolchain-shadow-same-global-comparison-v2'
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
    if (!localReceipt || ![
        'patch-toolchain-shadow-local-receipt-v1',
        'patch-toolchain-shadow-local-receipt-v2',
    ].includes(localReceipt.schema)
        || !Array.isArray(localReceipt.observations)) {
        fail('INVALID_LOCAL_REFERENCE', 'Local shadow receipt is missing or incompatible')
    }
    if (localReceipt.schema === 'patch-toolchain-shadow-local-receipt-v2') {
        return candidateBoundaryConsensus(
            localReceipt.observations,
            localReceipt.boundaryClasses,
        ).references
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

function buildSameGlobalReference({ localReceipt, materialDeclarationSha256 = null }) {
    if (localReceipt?.schema === 'patch-toolchain-shadow-local-receipt-v2') {
        if (!SHA256_PATTERN.test(localReceipt?.integrity?.payloadSha256 ?? '')
            || !SHA256_PATTERN.test(localReceipt?.declarationSha256 ?? '')) {
            fail('INVALID_LOCAL_REFERENCE', 'V2 local receipt identity is invalid')
        }
        const operating = localReceipt.operatingCohort !== undefined
        if (operating !== (materialDeclarationSha256 !== null)
            || (operating && !SHA256_PATTERN.test(materialDeclarationSha256 ?? ''))) {
            fail('INVALID_LOCAL_REFERENCE', 'V2 reference context and material binding differ')
        }
        return validateSameGlobalReference({
            schema: REFERENCE_V2_SCHEMA,
            context: operating ? 'material-operating' : 'real-global-qualification',
            candidateId: 'toolchain-hardening',
            candidateDeclarationSha256: localReceipt.declarationSha256,
            projectionSchema: PROJECTION_SCHEMA,
            semanticFieldSetSha256: SEMANTIC_FIELD_SET_SHA256,
            localReceiptPayloadSha256: localReceipt.integrity.payloadSha256,
            ...(operating ? {
                materialDeclarationSha256,
                materialInputKey: localReceipt.operatingCohort.materialInputKey,
                cohortId: localReceipt.operatingCohort.cohortId,
                executionAttemptId: localReceipt.operatingCohort.executionAttemptId,
                frozenDeclarationSha256: localReceipt.operatingCohort.frozenDeclarationSha256,
                localRunId: localReceipt.localRunId,
            } : {}),
            references: localProjectionReferences(localReceipt),
        })
    }
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
        ...(localReceipt.operatingCohort === undefined ? {} : {
            materialInputKey: localReceipt.operatingCohort.materialInputKey,
            cohortId: localReceipt.operatingCohort.cohortId,
            executionAttemptId: localReceipt.operatingCohort.executionAttemptId,
            frozenDeclarationSha256: localReceipt.operatingCohort.frozenDeclarationSha256,
            localRunId: localReceipt.localRunId,
        }),
        references: localProjectionReferences(localReceipt),
    }
}

function validateSameGlobalReference(reference) {
    if (reference?.schema === REFERENCE_V2_SCHEMA) {
        const qualificationKeys = [
            'schema', 'context', 'candidateId', 'candidateDeclarationSha256',
            'projectionSchema', 'semanticFieldSetSha256', 'localReceiptPayloadSha256',
            'references',
        ]
        const operatingKeys = [
            ...qualificationKeys, 'materialDeclarationSha256', 'materialInputKey', 'cohortId',
            'executionAttemptId', 'frozenDeclarationSha256', 'localRunId',
        ]
        const actualKeys = Object.keys(reference ?? {}).sort()
        const operating = reference.context === 'material-operating'
        const expectedKeys = operating ? operatingKeys : qualificationKeys
        if (canonicalJson(actualKeys) !== canonicalJson(expectedKeys.sort())
            || !['real-global-qualification', 'material-operating'].includes(reference.context)
            || reference.candidateId !== 'toolchain-hardening'
            || reference.projectionSchema !== PROJECTION_SCHEMA
            || reference.semanticFieldSetSha256 !== SEMANTIC_FIELD_SET_SHA256) {
            fail('INVALID_LOCAL_REFERENCE', 'V2 same-Global reference identity is invalid')
        }
        for (const key of [
            'candidateDeclarationSha256', 'semanticFieldSetSha256',
            'localReceiptPayloadSha256',
        ]) if (!SHA256_PATTERN.test(reference[key] ?? '')) fail('INVALID_LOCAL_REFERENCE', `${key} is invalid`)
        if (operating) {
            for (const key of [
                'materialDeclarationSha256', 'materialInputKey', 'cohortId', 'executionAttemptId',
                'frozenDeclarationSha256', 'localRunId',
            ]) if (!SHA256_PATTERN.test(reference[key] ?? '')) fail('INVALID_LOCAL_REFERENCE', `${key} is invalid`)
        }
        exactKeys(reference.references, ['0', '1'], 'V2 same-Global projection references')
        if (Object.values(reference.references).some((value) => !SHA256_PATTERN.test(value ?? ''))) {
            fail('INVALID_LOCAL_REFERENCE', 'V2 same-Global projection hash is invalid')
        }
        return reference
    }
    const legacyKeys = [
        'schema', 'candidateId', 'candidateDeclarationSha256',
        'materialDeclarationSha256', 'localReceiptPayloadSha256', 'references',
    ]
    const operatingKeys = [
        ...legacyKeys, 'materialInputKey', 'cohortId', 'executionAttemptId',
        'frozenDeclarationSha256', 'localRunId',
    ]
    const actualKeys = Object.keys(reference ?? {}).sort()
    const isOperating = canonicalJson(actualKeys) === canonicalJson(operatingKeys.sort())
    if (!isOperating && canonicalJson(actualKeys) !== canonicalJson(legacyKeys.sort())) {
        fail('INVALID_SAME_GLOBAL_EVIDENCE', 'same-Global reference keys differ')
    }
    if (reference.schema !== REFERENCE_SCHEMA || reference.candidateId !== 'toolchain-hardening') {
        fail('INVALID_LOCAL_REFERENCE', 'Same-Global reference candidate identity is invalid')
    }
    for (const key of ['candidateDeclarationSha256', 'materialDeclarationSha256', 'localReceiptPayloadSha256']) {
        if (!SHA256_PATTERN.test(reference[key] ?? '')) fail('INVALID_LOCAL_REFERENCE', `${key} is invalid`)
    }
    if (isOperating) {
        for (const key of [
            'materialInputKey', 'cohortId', 'executionAttemptId', 'frozenDeclarationSha256', 'localRunId',
        ]) if (!SHA256_PATTERN.test(reference[key] ?? '')) fail('INVALID_LOCAL_REFERENCE', `${key} is invalid`)
    }
    exactKeys(reference.references, ['0', '1'], 'same-Global projection references')
    if (Object.values(reference.references).some((value) => !SHA256_PATTERN.test(value ?? ''))) {
        fail('INVALID_LOCAL_REFERENCE', 'Same-Global projection hash is invalid')
    }
    return reference
}

function buildSameGlobalComparison({ reference, visiblePacks, observations }) {
    validateSameGlobalReference(reference)
    if (reference.schema === REFERENCE_V2_SCHEMA) {
        const mapping = candidateMappingContract(visiblePacks)
        if (!Array.isArray(observations) || observations.length !== mapping.rawMasks) {
            fail('INCOMPLETE_SAME_GLOBAL_COMPARISON', 'V2 observations do not cover the Global domain')
        }
        const ordered = [...observations].sort((left, right) => left.mask - right.mask)
        const normalized = ordered.map((observation, mask) => {
            const candidateMask = candidateMaskForGlobalMask(mask, mapping)
            const matchesLocal = observation?.projectionSha256 === reference.references[String(candidateMask)]
            if (observation?.mask !== mask || observation.candidateMask !== candidateMask
                || !SHA256_PATTERN.test(observation.projectionSha256 ?? '')
                || observation.matchesLocal !== matchesLocal) {
                fail('INVALID_SAME_GLOBAL_OBSERVATION', `V2 same-Global observation ${mask} is invalid`)
            }
            return observation
        })
        validateGlobalCandidateMapping({ visiblePacks, observations: normalized })
        const mismatches = normalized.filter((observation) => observation.matchesLocal !== true).length
        return {
            schema: COMPARISON_V2_SCHEMA,
            context: reference.context,
            candidateId: reference.candidateId,
            projectionSchema: reference.projectionSchema,
            semanticFieldSetSha256: reference.semanticFieldSetSha256,
            candidateBitIndex: mapping.candidateBitIndex,
            candidateDeclarationSha256: reference.candidateDeclarationSha256,
            localReceiptPayloadSha256: reference.localReceiptPayloadSha256,
            ...(reference.context === 'material-operating' ? {
                materialDeclarationSha256: reference.materialDeclarationSha256,
                materialInputKey: reference.materialInputKey,
                cohortId: reference.cohortId,
                executionAttemptId: reference.executionAttemptId,
                frozenDeclarationSha256: reference.frozenDeclarationSha256,
                localRunId: reference.localRunId,
            } : {}),
            localReferences: { ...reference.references },
            globalExecutionSource: 'canonical-global-exhaustive-same-execution',
            coverage: {
                rawMasks: mapping.rawMasks,
                processedMasks: mapping.rawMasks,
                candidateOffMasks: mapping.candidateOffMasks,
                candidateOnMasks: mapping.candidateOnMasks,
            },
            observations: normalized,
            matches: normalized.length - mismatches,
            mismatches,
            status: mismatches === 0 ? 'passed' : 'failed',
        }
    }
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
        ...(reference.cohortId === undefined ? {} : {
            materialInputKey: reference.materialInputKey,
            cohortId: reference.cohortId,
            executionAttemptId: reference.executionAttemptId,
            frozenDeclarationSha256: reference.frozenDeclarationSha256,
            localRunId: reference.localRunId,
        }),
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
    if (comparison?.schema === COMPARISON_V2_SCHEMA) {
        const qualificationKeys = [
            'schema', 'context', 'candidateId', 'projectionSchema', 'semanticFieldSetSha256',
            'candidateBitIndex', 'candidateDeclarationSha256', 'localReceiptPayloadSha256',
            'localReferences', 'globalExecutionSource', 'coverage', 'observations', 'matches',
            'mismatches', 'status',
        ]
        const operatingKeys = [
            ...qualificationKeys, 'materialDeclarationSha256', 'materialInputKey', 'cohortId',
            'executionAttemptId', 'frozenDeclarationSha256', 'localRunId',
        ]
        const operating = comparison.context === 'material-operating'
        if (canonicalJson(Object.keys(comparison ?? {}).sort())
            !== canonicalJson((operating ? operatingKeys : qualificationKeys).sort())) {
            fail('INVALID_SAME_GLOBAL_EVIDENCE', 'V2 same-Global comparison keys differ')
        }
        const reference = {
            schema: REFERENCE_V2_SCHEMA,
            context: comparison.context,
            candidateId: comparison.candidateId,
            candidateDeclarationSha256: comparison.candidateDeclarationSha256,
            projectionSchema: comparison.projectionSchema,
            semanticFieldSetSha256: comparison.semanticFieldSetSha256,
            localReceiptPayloadSha256: comparison.localReceiptPayloadSha256,
            ...(operating ? {
                materialDeclarationSha256: comparison.materialDeclarationSha256,
                materialInputKey: comparison.materialInputKey,
                cohortId: comparison.cohortId,
                executionAttemptId: comparison.executionAttemptId,
                frozenDeclarationSha256: comparison.frozenDeclarationSha256,
                localRunId: comparison.localRunId,
            } : {}),
            references: comparison.localReferences,
        }
        const rebuilt = buildSameGlobalComparison({
            reference,
            visiblePacks: result.visiblePacks,
            observations: comparison.observations,
        })
        if (canonicalJson(rebuilt) !== canonicalJson(comparison)
            || comparison.coverage.rawMasks !== result.rawSelections
            || comparison.coverage.processedMasks !== result.verifiedSelections) {
            fail('INVALID_SAME_GLOBAL_COMPARISON', 'V2 comparison contradicts canonical coverage')
        }
        return comparison
    }
    const legacyKeys = [
        'schema', 'candidateId', 'candidateBitIndex', 'candidateDeclarationSha256',
        'materialDeclarationSha256', 'localReceiptPayloadSha256', 'localReferences', 'globalExecutionSource',
        'coverage', 'observations', 'mismatches', 'status',
    ]
    const operatingKeys = [
        ...legacyKeys, 'materialInputKey', 'cohortId', 'executionAttemptId',
        'frozenDeclarationSha256', 'localRunId',
    ]
    const actualKeys = Object.keys(comparison ?? {}).sort()
    const isOperating = canonicalJson(actualKeys) === canonicalJson(operatingKeys.sort())
    if (!isOperating && canonicalJson(actualKeys) !== canonicalJson(legacyKeys.sort())) {
        fail('INVALID_SAME_GLOBAL_EVIDENCE', 'same-Global comparison keys differ')
    }
    const reference = {
        schema: REFERENCE_SCHEMA,
        candidateId: comparison.candidateId,
        candidateDeclarationSha256: comparison.candidateDeclarationSha256,
        materialDeclarationSha256: comparison.materialDeclarationSha256,
        localReceiptPayloadSha256: comparison.localReceiptPayloadSha256,
        ...(isOperating ? {
            materialInputKey: comparison.materialInputKey,
            cohortId: comparison.cohortId,
            executionAttemptId: comparison.executionAttemptId,
            frozenDeclarationSha256: comparison.frozenDeclarationSha256,
            localRunId: comparison.localRunId,
        } : {}),
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

function sameGlobalReferenceFromComparison(comparison) {
    if (comparison?.schema === COMPARISON_V2_SCHEMA) {
        const operating = comparison.context === 'material-operating'
        return validateSameGlobalReference({
            schema: REFERENCE_V2_SCHEMA,
            context: comparison.context,
            candidateId: comparison.candidateId,
            candidateDeclarationSha256: comparison.candidateDeclarationSha256,
            projectionSchema: comparison.projectionSchema,
            semanticFieldSetSha256: comparison.semanticFieldSetSha256,
            localReceiptPayloadSha256: comparison.localReceiptPayloadSha256,
            ...(operating ? {
                materialDeclarationSha256: comparison.materialDeclarationSha256,
                materialInputKey: comparison.materialInputKey,
                cohortId: comparison.cohortId,
                executionAttemptId: comparison.executionAttemptId,
                frozenDeclarationSha256: comparison.frozenDeclarationSha256,
                localRunId: comparison.localRunId,
            } : {}),
            references: comparison.localReferences,
        })
    }
    const operating = comparison?.cohortId !== undefined
    return validateSameGlobalReference({
        schema: REFERENCE_SCHEMA,
        candidateId: comparison?.candidateId,
        candidateDeclarationSha256: comparison?.candidateDeclarationSha256,
        materialDeclarationSha256: comparison?.materialDeclarationSha256,
        localReceiptPayloadSha256: comparison?.localReceiptPayloadSha256,
        ...(operating ? {
            materialInputKey: comparison.materialInputKey,
            cohortId: comparison.cohortId,
            executionAttemptId: comparison.executionAttemptId,
            frozenDeclarationSha256: comparison.frozenDeclarationSha256,
            localRunId: comparison.localRunId,
        } : {}),
        references: comparison?.localReferences,
    })
}

module.exports = {
    COMPARISON_SCHEMA,
    COMPARISON_V2_SCHEMA,
    REFERENCE_SCHEMA,
    REFERENCE_V2_SCHEMA,
    ToolchainShadowSameGlobalError,
    buildSameGlobalComparison,
    buildSameGlobalReference,
    localProjectionReferences,
    sameGlobalReferenceFromComparison,
    validateSameGlobalComparison,
    validateSameGlobalReference,
}
