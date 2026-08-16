'use strict'

const crypto = require('node:crypto')
const { canonicalJson } = require('./verification-receipts.cjs')

const MATERIAL_DECLARATION_SCHEMA = 'patch-operating-cohort-material-declaration-v1'
const ROUTE_DECISION_SCHEMA = 'patch-operating-cohort-route-decision-v1'
const ROUTE_GLOBAL = 'material-c0-global'
const ROUTE_COMBINED = 'material-c0-global-plus-toolchain-shadow'
const TOOLCHAIN_CANDIDATE_ID = 'toolchain-hardening'
const TOOLCHAIN_IMPACT_REASON = 'exact-toolchain-hardening-frozen-subject-requires-matching-c0-global-bundle'
const SHA256_PATTERN = /^[0-9a-f]{64}$/
const COMMIT_PATTERN = /^[0-9a-f]{40}$/

class OperatingCohortRouteError extends Error {
    constructor(code, message, details = null) {
        super(message)
        this.name = 'OperatingCohortRouteError'
        this.code = code
        this.details = details
    }
}

function fail(code, message, details = null) {
    throw new OperatingCohortRouteError(code, message, details)
}

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex')
}

function exactKeys(value, expected, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...expected].sort())) {
        fail('INVALID_MATERIAL_DECLARATION', `${label} keys differ`)
    }
}

function declarationHash(declaration) {
    const { declarationSha256: ignored, ...payload } = declaration
    return sha256(canonicalJson(payload))
}

function validateHashes(value, commitKeys, hashKeys, label) {
    for (const key of commitKeys) {
        if (!COMMIT_PATTERN.test(value[key] ?? '')) fail('INVALID_MATERIAL_DECLARATION', `${label}.${key} is not a commit`)
    }
    for (const key of hashKeys) {
        if (!SHA256_PATTERN.test(value[key] ?? '')) fail('INVALID_MATERIAL_DECLARATION', `${label}.${key} is not a SHA-256 digest`)
    }
}

function validateMaterialDeclaration(declaration) {
    exactKeys(declaration, [
        'schema', 'version', 'declarationId', 'changeClass', 'materiallyDistinct',
        'stableRelease', 'releaseCandidate', 'materialReason', 'candidateImpact',
        'qualification', 'environment', 'globalContract', 'declarationSha256',
    ], 'material declaration')
    if (declaration.schema !== MATERIAL_DECLARATION_SCHEMA || declaration.version !== 1
        || !/^[a-z0-9][a-z0-9-]*-v1$/.test(declaration.declarationId ?? '')) {
        fail('INVALID_MATERIAL_DECLARATION', 'Material declaration identity is unsupported')
    }
    if (!['patch', 'relation', 'core', 'audit', 'stable-release'].includes(declaration.changeClass)
        || declaration.materiallyDistinct !== true || typeof declaration.stableRelease !== 'boolean'
        || typeof declaration.releaseCandidate !== 'string' || declaration.releaseCandidate.length === 0
        || typeof declaration.materialReason !== 'string' || declaration.materialReason.length === 0
        || (declaration.stableRelease !== (declaration.changeClass === 'stable-release'))) {
        fail('INVALID_MATERIAL_DECLARATION', 'Material cohort classification is unsupported')
    }
    exactKeys(declaration.candidateImpact, ['affected', 'candidateId', 'reason'], 'candidate impact')
    if (declaration.candidateImpact.affected === true) {
        if (declaration.candidateImpact.candidateId !== TOOLCHAIN_CANDIDATE_ID
            || declaration.candidateImpact.reason !== TOOLCHAIN_IMPACT_REASON) {
            fail('INVALID_CANDIDATE_IMPACT', 'Affected candidate declaration is not the exact admitted candidate')
        }
    } else if (declaration.candidateImpact.affected === false) {
        if (declaration.candidateImpact.candidateId !== null
            || declaration.candidateImpact.reason !== 'candidate-unaffected') {
            fail('INVALID_CANDIDATE_IMPACT', 'Unaffected candidate declaration is malformed')
        }
    } else fail('INVALID_CANDIDATE_IMPACT', 'candidateImpact.affected must be boolean')

    exactKeys(declaration.qualification, ['subject', 'compatibility'], 'qualification binding')
    exactKeys(declaration.qualification.subject, [
        'implementationCommit', 'qualificationToolCommit', 'policySha256', 'contractSha256',
        'compiledDeclarationSha256', 'targetCommit', 'targetApplicationTreeSha256',
    ], 'qualification subject')
    validateHashes(declaration.qualification.subject,
        ['implementationCommit', 'qualificationToolCommit', 'targetCommit'],
        ['policySha256', 'contractSha256', 'compiledDeclarationSha256', 'targetApplicationTreeSha256'],
        'qualification.subject')
    exactKeys(declaration.qualification.compatibility, [
        'subjectSchemasSha256', 'qualificationSchemasSha256', 'localRouteSha256',
        'globalProjectionRouteSha256',
    ], 'qualification compatibility')
    validateHashes(declaration.qualification.compatibility, [], Object.keys(declaration.qualification.compatibility), 'qualification.compatibility')

    exactKeys(declaration.environment, [
        'id', 'nodeVersion', 'platform', 'architecture', 'libc', 'pnpmVersion',
    ], 'qualified environment')
    if (Object.values(declaration.environment).some((value) => typeof value !== 'string' || value.length === 0)) {
        fail('INVALID_MATERIAL_DECLARATION', 'Qualified environment fields must be non-empty strings')
    }
    exactKeys(declaration.globalContract, [
        'canonicalGate', 'workerSchedule', 'workerHistory', 'globalExecutionsExpected',
    ], 'Global contract')
    if (declaration.globalContract.canonicalGate !== 'Global Exhaustive'
        || declaration.globalContract.workerSchedule !== 'stride-v1'
        || declaration.globalContract.workerHistory !== 'persistent-per-worker-v1'
        || declaration.globalContract.globalExecutionsExpected !== 1) {
        fail('INVALID_GLOBAL_CONTRACT', 'Material declaration changed the canonical Global contract')
    }
    if (!SHA256_PATTERN.test(declaration.declarationSha256 ?? '')
        || declarationHash(declaration) !== declaration.declarationSha256) {
        fail('MATERIAL_DECLARATION_HASH_MISMATCH', 'Material declaration SHA-256 does not match')
    }
    return declaration
}

function mismatchReason(declaration, qualificationState, candidateDomain) {
    if (qualificationState?.registryIntegrity !== true) return qualificationState?.reason ?? 'qualification-registry-integrity-failure'
    if (qualificationState?.accepted !== true) return qualificationState?.reason ?? 'accepted-qualification-unavailable'
    if (canonicalJson(qualificationState.subject) !== canonicalJson(declaration.qualification.subject)) {
        const expected = declaration.qualification.subject
        const actual = qualificationState.subject ?? {}
        if (actual.targetCommit !== expected.targetCommit || actual.targetApplicationTreeSha256 !== expected.targetApplicationTreeSha256) {
            return 'stale-qualified-target'
        }
        if (actual.policySha256 !== expected.policySha256) return 'stale-qualified-policy'
        if (actual.contractSha256 !== expected.contractSha256) return 'stale-qualified-contract'
        return 'stale-qualified-subject'
    }
    if (canonicalJson(qualificationState.compatibility) !== canonicalJson(declaration.qualification.compatibility)) {
        return 'stale-qualified-compatibility'
    }
    if (canonicalJson(qualificationState.environment) !== canonicalJson(declaration.environment)) {
        return 'stale-qualified-environment'
    }
    const expectedDomain = {
        candidateId: TOOLCHAIN_CANDIDATE_ID,
        localMasksExpected: 2,
        boundaryClassesExpected: 4,
        totalLocalCasesExpected: 8,
        compiledDeclarationSha256: declaration.qualification.subject.compiledDeclarationSha256,
    }
    if (canonicalJson(candidateDomain) !== canonicalJson(expectedDomain)) return 'candidate-local-domain-mismatch'
    return null
}

function decisionPayload(result) {
    const { decisionSha256: ignored, ...payload } = result
    return payload
}

function decideOperatingCohortRoute({
    declaration,
    qualificationState = null,
    freshVerification = 'not-required',
    candidateDomain = null,
    operatingEnvironmentProvisioned = false,
    operatingBuildBoundaryVerification = 'not-checked',
}) {
    validateMaterialDeclaration(declaration)
    const affected = declaration.candidateImpact.affected
    const incompatibleReason = affected
        ? mismatchReason(declaration, qualificationState, candidateDomain)
        : null
    const compatible = affected && incompatibleReason === null
    const routeId = compatible ? ROUTE_COMBINED : ROUTE_GLOBAL
    const environmentBlocker = compatible && freshVerification !== 'passed'
        ? (freshVerification === 'environment-unavailable'
            ? 'fresh-qualification-verification-environment-unavailable'
            : 'fresh-qualification-verification-failed')
        : null
    const operatingProvisioningBlocker = compatible && operatingEnvironmentProvisioned !== true
        ? 'operating-environment-not-provisioned'
        : null
    const operatingBoundaryBlocker = compatible && operatingEnvironmentProvisioned === true
        && operatingBuildBoundaryVerification !== 'passed'
        ? (operatingBuildBoundaryVerification === 'failed'
            ? 'operating-build-boundary-verification-failed'
            : 'operating-build-boundary-verification-not-checked')
        : null
    const blockers = [
        environmentBlocker,
        operatingProvisioningBlocker,
        operatingBoundaryBlocker,
    ].filter((value) => value !== null)
    const result = {
        schema: ROUTE_DECISION_SCHEMA,
        routeId,
        cohortType: routeId,
        changeClass: declaration.changeClass,
        materiallyDistinct: declaration.materiallyDistinct,
        stableRelease: declaration.stableRelease,
        candidateAffected: affected,
        candidateId: affected ? declaration.candidateImpact.candidateId : null,
        candidateQualificationCompatible: compatible,
        candidateExecutionReason: compatible ? declaration.candidateImpact.reason : null,
        candidateExecutionSkipped: affected && !compatible,
        candidateOperatingSampleEligible: compatible && blockers.length === 0,
        candidateSkipReason: affected && !compatible ? incompatibleReason : null,
        localMasksExpected: compatible ? 2 : 0,
        boundaryClassesExpected: compatible ? 4 : 0,
        totalLocalCasesExpected: compatible ? 8 : 0,
        globalExecutionsExpected: 1,
        qualificationFreshVerification: freshVerification,
        operatingEnvironmentProvisioned: compatible ? operatingEnvironmentProvisioned === true : null,
        operatingBuildBoundaryVerification: compatible ? operatingBuildBoundaryVerification : 'not-required',
        materialDeclarationSha256: declaration.declarationSha256,
        safeToExecute: blockers.length === 0,
        blockers,
        decisionSha256: null,
    }
    result.decisionSha256 = sha256(canonicalJson(decisionPayload(result)))
    return result
}

function validateRouteDecision(decision, inputs) {
    const expected = decideOperatingCohortRoute(inputs)
    if (canonicalJson(decision) !== canonicalJson(expected)) {
        fail('STALE_ROUTE_DECISION', 'Operating route decision differs from shared route contract')
    }
    return decision
}

function createOneGlobalExecutionGuard(executeGlobal) {
    if (typeof executeGlobal !== 'function') fail('INVALID_GLOBAL_EXECUTOR', 'Global executor must be a function')
    let executions = 0
    return {
        async execute(...args) {
            if (executions !== 0) fail('SECOND_GLOBAL_EXECUTION_FORBIDDEN', 'One frozen cohort cannot execute Global Exhaustive twice')
            executions += 1
            return executeGlobal(...args)
        },
        executions() { return executions },
    }
}

function rejectLegacyOperatingInstruction(value) {
    if (value && typeof value === 'object' && ['6A', '6B'].includes(value.instruction)) {
        fail('LEGACY_OPERATING_ROUTE_REJECTED', 'Canonical policy section identifiers are not operating route decisions')
    }
    return true
}

function validateReusableGlobalAnchor(anchor, expected) {
    const keys = [
        'cohortId', 'globalRunId', 'subjectCommit', 'policySha256', 'targetCommit',
        'targetApplicationTreeSha256', 'workerScheduleSha256', 'cacheHistorySha256',
        'runtimeSemanticSha256', 'materialDeclarationSha256',
    ]
    exactKeys(anchor, keys, 'Global comparison anchor')
    exactKeys(expected, keys, 'expected Global comparison anchor')
    if (anchor.cohortId !== expected.cohortId) {
        fail('CROSS_COHORT_GLOBAL_RECEIPT', 'Global receipt belongs to another frozen cohort')
    }
    if (anchor.globalRunId !== expected.globalRunId) {
        fail('GLOBAL_RUN_ID_MISMATCH', 'Candidate comparison received another Global run ID')
    }
    if (canonicalJson(anchor) !== canonicalJson(expected)) {
        fail('GLOBAL_ANCHOR_IDENTITY_MISMATCH', 'Global comparison anchor is not an exact identity match')
    }
    return anchor
}

module.exports = {
    MATERIAL_DECLARATION_SCHEMA,
    OperatingCohortRouteError,
    ROUTE_COMBINED,
    ROUTE_DECISION_SCHEMA,
    ROUTE_GLOBAL,
    TOOLCHAIN_CANDIDATE_ID,
    TOOLCHAIN_IMPACT_REASON,
    createOneGlobalExecutionGuard,
    declarationHash,
    decideOperatingCohortRoute,
    rejectLegacyOperatingInstruction,
    validateMaterialDeclaration,
    validateReusableGlobalAnchor,
    validateRouteDecision,
}
