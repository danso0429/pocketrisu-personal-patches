'use strict'

const {
    canonicalJson,
    sealDocument,
    verifyDocumentIntegrity,
} = require('./verification-receipts.cjs')
const { sha256 } = require('./verification-evidence.cjs')
const {
    objectSha256,
} = require('./c0-retention.cjs')
const { evaluateC0EvidenceBundle } = require('./c0-evidence.cjs')
const { validateLocalShadowReceipt } = require('./toolchain-shadow-local.cjs')
const { validateGlobalProjectionReceipt } = require('./toolchain-shadow-global.cjs')

const PILOT_RECEIPT_SCHEMA = 'patch-toolchain-shadow-pilot-receipt-v1'
const PILOT_INCIDENT_SCHEMA = 'patch-toolchain-shadow-incident-v1'
const SHA256_PATTERN = /^[0-9a-f]{64}$/

class ToolchainShadowEvidenceError extends Error {
    constructor(code, message, details = {}) {
        super(message)
        this.name = 'ToolchainShadowEvidenceError'
        this.code = code
        this.details = details
    }
}

function canonicalSha256(value) {
    return sha256(canonicalJson(value))
}

function exactKeys(value, expected, code, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...expected].sort())) {
        throw new ToolchainShadowEvidenceError(code, `${label} fields are missing or unknown`)
    }
}

function pilotCohortIdentity(authority) {
    return {
        governanceCommit: authority.governanceCommit,
        implementationCommit: authority.implementationCommit,
        policySha256: authority.policySha256,
        catalogSha256: authority.catalogSha256,
        schemasSha256: authority.schemasSha256,
        targetSha256: authority.targetSha256,
        declarationSha256: authority.declarationSha256,
        environmentSha256: authority.environmentSha256,
        localRouteSha256: authority.localRouteSha256,
        globalRouteSha256: authority.globalRouteSha256,
        c0CohortId: authority.c0CohortId,
    }
}

function withoutPilotRunId(receipt) {
    const { integrity: ignored, ...payload } = receipt
    return { ...payload, cohort: { ...payload.cohort, runId: null } }
}

function finalizePilotReceipt(draft) {
    const identity = pilotCohortIdentity(draft.authority)
    const cohortId = canonicalSha256(identity)
    const withCohort = {
        ...draft,
        cohort: { ...draft.cohort, identity, cohortId, runId: null },
    }
    const runId = canonicalSha256(withoutPilotRunId(withCohort))
    return sealDocument({ ...withCohort, cohort: { ...withCohort.cohort, runId } })
}

function validateAuthority(authority) {
    exactKeys(authority, [
        'governanceCommit', 'implementationCommit', 'policySha256', 'catalogSha256',
        'schemasSha256', 'targetSha256', 'declarationSha256', 'environmentSha256',
        'localRouteSha256', 'globalRouteSha256', 'c0CohortId',
    ], 'INVALID_PILOT_AUTHORITY', 'pilot authority')
    if (!/^[0-9a-f]{40}$/.test(authority.governanceCommit ?? '')
        || !/^[0-9a-f]{40}$/.test(authority.implementationCommit ?? '')) {
        throw new ToolchainShadowEvidenceError('INVALID_PILOT_AUTHORITY', 'Pilot commits are invalid')
    }
    for (const [key, value] of Object.entries(authority)) {
        if (key.endsWith('Sha256') && !SHA256_PATTERN.test(value ?? '')) {
            throw new ToolchainShadowEvidenceError('INVALID_PILOT_AUTHORITY', `${key} is invalid`)
        }
    }
    if (authority.c0CohortId !== null && !SHA256_PATTERN.test(authority.c0CohortId)) {
        throw new ToolchainShadowEvidenceError('INVALID_PILOT_AUTHORITY', 'C0 cohort ID is invalid')
    }
}

function validatePilotReceipt(receipt, {
    localReceipt,
    globalProjection,
    globalReceipt = null,
    c0Bundle = null,
} = {}) {
    if (!verifyDocumentIntegrity(receipt) || receipt.schema !== PILOT_RECEIPT_SCHEMA) {
        throw new ToolchainShadowEvidenceError('CORRUPT_PILOT_RECEIPT', 'Pilot receipt integrity or schema is invalid')
    }
    exactKeys(receipt, [
        'schema', 'mode', 'disposition', 'recordedAt', 'cohort', 'candidate', 'authority',
        'references', 'comparison', 'result', 'resources', 'retrySemantics', 'incidentRequired',
        'canonicalProtection', 'integrity',
    ], 'INVALID_PILOT_RECEIPT', 'pilot receipt')
    if (!['synthetic-dry-run', 'material-shadow'].includes(receipt.mode)) {
        throw new ToolchainShadowEvidenceError('INVALID_PILOT_MODE', 'Pilot mode is unsupported')
    }
    if (canonicalJson(receipt.candidate) !== canonicalJson({
        packId: 'toolchain-hardening', productionClass: 'G', shadowClass: 'B', label: 'shadow B candidate',
    })) throw new ToolchainShadowEvidenceError('PRODUCTION_CLASSIFICATION_CHANGED', 'Candidate class changed')
    validateAuthority(receipt.authority)
    exactKeys(receipt.cohort, [
        'identity', 'cohortId', 'runId', 'trialId', 'materiallyDistinct', 'repeatedPerformanceTrial',
    ], 'INVALID_PILOT_COHORT', 'pilot cohort')
    if (canonicalJson(receipt.cohort.identity) !== canonicalJson(pilotCohortIdentity(receipt.authority))
        || receipt.cohort.cohortId !== canonicalSha256(receipt.cohort.identity)
        || receipt.cohort.runId !== canonicalSha256(withoutPilotRunId(receipt))) {
        throw new ToolchainShadowEvidenceError('PILOT_IDENTITY_MISMATCH', 'Pilot cohort or run ID is invalid')
    }
    if (typeof receipt.cohort.trialId !== 'string' || receipt.cohort.trialId.length === 0
        || typeof receipt.cohort.materiallyDistinct !== 'boolean'
        || typeof receipt.cohort.repeatedPerformanceTrial !== 'boolean'
        || (receipt.mode === 'material-shadow'
            && receipt.cohort.materiallyDistinct === receipt.cohort.repeatedPerformanceTrial)
        || (receipt.mode === 'synthetic-dry-run'
            && (receipt.cohort.materiallyDistinct || receipt.cohort.repeatedPerformanceTrial))) {
        throw new ToolchainShadowEvidenceError('INVALID_PILOT_COHORT', 'Pilot trial classification is invalid')
    }
    validateLocalShadowReceipt(localReceipt)
    validateGlobalProjectionReceipt(globalProjection)
    if (receipt.references.localReceiptObjectSha256 !== objectSha256(localReceipt)
        || receipt.references.globalProjectionObjectSha256 !== objectSha256(globalProjection)
        || globalProjection.localReceiptPayloadSha256 !== localReceipt.integrity.payloadSha256
        || receipt.authority.declarationSha256 !== localReceipt.declarationSha256
        || receipt.authority.declarationSha256 !== globalProjection.declarationSha256
        || receipt.authority.targetSha256 !== localReceipt.target.applicationTreeSha256
        || globalProjection.target?.applicationTreeSha256 !== localReceipt.target.applicationTreeSha256) {
        throw new ToolchainShadowEvidenceError('PILOT_REFERENCE_MISMATCH', 'Local/Global projection references differ')
    }
    let globalAccepted = false
    if (receipt.mode === 'material-shadow') {
        if (!globalReceipt || !c0Bundle
            || globalProjection.sourceKind !== 'global-projection-one-worker'
            || localReceipt.disposition !== 'material-shadow') {
            throw new ToolchainShadowEvidenceError('MISSING_MATERIAL_GLOBAL', 'Material pilot requires concrete local, projection, C0, and Global evidence')
        }
        const evaluation = evaluateC0EvidenceBundle(c0Bundle, { globalReceipt })
        if (!evaluation.operatingEvidenceAccepted) {
            throw new ToolchainShadowEvidenceError('C0_GLOBAL_REJECTED', 'Bound C0/Global evidence was not accepted', evaluation)
        }
        if (receipt.references.globalReceiptObjectSha256 !== objectSha256(globalReceipt)
            || receipt.references.c0BundleObjectSha256 !== objectSha256(c0Bundle)
            || c0Bundle.globalReceipt.objectSha256 !== objectSha256(globalReceipt)
            || receipt.authority.c0CohortId !== c0Bundle.cohort.cohortId
            || receipt.authority.governanceCommit !== c0Bundle.authority.governance.commit
            || receipt.authority.implementationCommit !== c0Bundle.authority.implementation.commit
            || receipt.authority.policySha256 !== c0Bundle.authority.policy.sha256
            || receipt.authority.catalogSha256 !== c0Bundle.authority.catalog.rootSha256
            || c0Bundle.authority.target.commit !== localReceipt.target.commit
            || globalReceipt.verifierResult?.rawSelections !== 4096
            || globalReceipt.verifierResult?.verifiedSelections !== 4096
            || globalReceipt.verifierResult?.roundTrips !== 'passed'
            || globalReceipt.verifierResult?.workers !== 1
            || canonicalJson(globalReceipt.verifierResult.visiblePacks) !== canonicalJson(globalProjection.visiblePacks)
            || globalReceipt.before?.target?.applicationTree?.rootSha256 !== localReceipt.target.applicationTreeSha256
            || globalReceipt.after?.target?.applicationTree?.rootSha256 !== localReceipt.target.applicationTreeSha256) {
            throw new ToolchainShadowEvidenceError('MATERIAL_GLOBAL_MISMATCH', 'C0/Global cohort does not match the pilot')
        }
        globalAccepted = true
    } else {
        if (globalReceipt !== null || c0Bundle !== null
            || globalProjection.sourceKind !== 'synthetic-known-answer'
            || receipt.references.globalReceiptObjectSha256 !== null
            || receipt.references.c0BundleObjectSha256 !== null
            || receipt.authority.c0CohortId !== null) {
            throw new ToolchainShadowEvidenceError('SYNTHETIC_PROMOTION', 'Synthetic pilot cannot bind or imply production Global evidence')
        }
    }
    const mismatchCount = globalProjection.comparison.mismatches
    const passed = mismatchCount === 0 && globalProjection.status === 'passed'
        && (receipt.mode === 'synthetic-dry-run' || globalAccepted)
    const expectedResult = {
        pilotCorrectness: passed ? 'passed' : 'failed',
        candidateAdmission: passed ? 'not-authorized' : 'denied',
        productionClassification: 'G',
        canonicalGlobalResult: receipt.mode === 'material-shadow' ? 'preserved-separately' : 'not-run-synthetic-dry-run',
    }
    if (canonicalJson(receipt.result) !== canonicalJson(expectedResult)
        || receipt.comparison.mismatches !== mismatchCount
        || receipt.comparison.localMasks !== 2
        || receipt.comparison.boundaryClasses !== 4
        || receipt.comparison.globalMasks !== 4096
        || receipt.incidentRequired !== !passed) {
        throw new ToolchainShadowEvidenceError('PILOT_RESULT_MISMATCH', 'Pilot result differs from concrete evidence')
    }
    if (receipt.retrySemantics.sameExactInput !== 'same-cohort-new-run-and-trial'
        || receipt.retrySemantics.retryMayEraseFailure !== false) {
        throw new ToolchainShadowEvidenceError('INVALID_RETRY_SEMANTICS', 'Retry semantics can rewrite cohort history')
    }
    const protection = receipt.canonicalProtection
    if (protection.canonicalGate !== 'Global Exhaustive'
        || protection.globalFallbackRequired !== true
        || protection.globalMasksSkipped !== 0
        || protection.verifyCombinationsChanged !== false
        || protection.verifyC0Changed !== false
        || protection.productionClassification !== 'G'
        || protection.productionStateChanged !== false
        || protection.productionCertificates !== 0
        || protection.c1Authorized !== false) {
        throw new ToolchainShadowEvidenceError('CANONICAL_PROTECTION_WEAKENED', 'Pilot protection is weakened')
    }
    return receipt
}

function buildPilotReceipt({
    mode,
    localReceipt,
    globalProjection,
    globalReceipt = null,
    c0Bundle = null,
    authority,
    trialId,
    materiallyDistinct = false,
    repeatedPerformanceTrial = false,
    wrapperResources = {},
    storageResources = {},
    recordedAt = new Date().toISOString(),
}) {
    const mismatchCount = globalProjection.comparison.mismatches
    const globalAccepted = mode === 'material-shadow'
        && globalReceipt !== null && c0Bundle !== null
        && evaluateC0EvidenceBundle(c0Bundle, { globalReceipt }).operatingEvidenceAccepted
    const passed = mismatchCount === 0 && globalProjection.status === 'passed'
        && (mode === 'synthetic-dry-run' || globalAccepted)
    const receipt = finalizePilotReceipt({
        schema: PILOT_RECEIPT_SCHEMA,
        mode,
        disposition: passed ? (mode === 'material-shadow' ? 'material-shadow' : 'dry-run') : 'defect-reproduction',
        recordedAt,
        cohort: { identity: null, cohortId: null, runId: null, trialId, materiallyDistinct, repeatedPerformanceTrial },
        candidate: { packId: 'toolchain-hardening', productionClass: 'G', shadowClass: 'B', label: 'shadow B candidate' },
        authority,
        references: {
            localReceiptObjectSha256: objectSha256(localReceipt),
            globalProjectionObjectSha256: objectSha256(globalProjection),
            globalReceiptObjectSha256: globalReceipt === null ? null : objectSha256(globalReceipt),
            c0BundleObjectSha256: c0Bundle === null ? null : objectSha256(c0Bundle),
        },
        comparison: {
            localMasks: 2,
            boundaryClasses: 4,
            globalMasks: 4096,
            mismatches: mismatchCount,
        },
        result: {
            pilotCorrectness: passed ? 'passed' : 'failed',
            candidateAdmission: passed ? 'not-authorized' : 'denied',
            productionClassification: 'G',
            canonicalGlobalResult: mode === 'material-shadow' ? 'preserved-separately' : 'not-run-synthetic-dry-run',
        },
        resources: {
            local: localReceipt.resources,
            globalProjection: globalProjection.resources,
            canonicalGlobal: c0Bundle?.resources ?? null,
            wrapper: wrapperResources,
            evidenceStorage: storageResources,
        },
        retrySemantics: {
            sameExactInput: 'same-cohort-new-run-and-trial',
            retryMayEraseFailure: false,
        },
        incidentRequired: !passed,
        canonicalProtection: {
            canonicalGate: 'Global Exhaustive', globalFallbackRequired: true, globalMasksSkipped: 0,
            verifyCombinationsChanged: false, verifyC0Changed: false, productionClassification: 'G',
            productionStateChanged: false, productionCertificates: 0, c1Authorized: false,
        },
    })
    return validatePilotReceipt(receipt, { localReceipt, globalProjection, globalReceipt, c0Bundle })
}

function buildPilotIncident({ pilotReceipt, pilotReceiptObjectSha256, recordedAt = new Date().toISOString() }) {
    if (!pilotReceipt.incidentRequired || pilotReceipt.result.pilotCorrectness !== 'failed') {
        throw new ToolchainShadowEvidenceError('INCIDENT_NOT_REQUIRED', 'A passing pilot cannot create a failure incident')
    }
    const payload = {
        schema: PILOT_INCIDENT_SCHEMA,
        disposition: 'defect-reproduction',
        recordedAt,
        incidentId: null,
        cohortId: pilotReceipt.cohort.cohortId,
        runId: pilotReceipt.cohort.runId,
        pilotReceiptObjectSha256,
        failure: {
            kind: 'local-global-mismatch-or-gate-failure',
            mismatches: pilotReceipt.comparison.mismatches,
            candidateAdmission: 'denied',
        },
        preservation: {
            originalFailureRetained: true,
            retryMaySupersede: false,
            negativeEvidenceDeleted: false,
        },
        canonicalProtection: {
            productionClassification: 'G', canonicalGlobalResult: pilotReceipt.result.canonicalGlobalResult,
            globalMasksSkipped: 0, productionCertificates: 0, productionStateChanged: false,
        },
    }
    payload.incidentId = canonicalSha256({ ...payload, incidentId: null })
    return validatePilotIncident(sealDocument(payload))
}

function validatePilotIncident(incident) {
    if (!verifyDocumentIntegrity(incident) || incident.schema !== PILOT_INCIDENT_SCHEMA) {
        throw new ToolchainShadowEvidenceError('CORRUPT_PILOT_INCIDENT', 'Pilot incident integrity or schema is invalid')
    }
    exactKeys(incident, [
        'schema', 'disposition', 'recordedAt', 'incidentId', 'cohortId', 'runId',
        'pilotReceiptObjectSha256', 'failure', 'preservation', 'canonicalProtection', 'integrity',
    ], 'INVALID_PILOT_INCIDENT', 'pilot incident')
    const { integrity: ignored, ...payload } = incident
    if (incident.disposition !== 'defect-reproduction'
        || incident.incidentId !== canonicalSha256({ ...payload, incidentId: null })
        || !SHA256_PATTERN.test(incident.cohortId ?? '')
        || !SHA256_PATTERN.test(incident.runId ?? '')
        || !SHA256_PATTERN.test(incident.pilotReceiptObjectSha256 ?? '')
        || incident.failure?.candidateAdmission !== 'denied'
        || incident.preservation?.originalFailureRetained !== true
        || incident.preservation?.retryMaySupersede !== false
        || incident.preservation?.negativeEvidenceDeleted !== false
        || incident.canonicalProtection?.productionClassification !== 'G'
        || incident.canonicalProtection?.globalMasksSkipped !== 0
        || incident.canonicalProtection?.productionCertificates !== 0
        || incident.canonicalProtection?.productionStateChanged !== false) {
        throw new ToolchainShadowEvidenceError('INVALID_PILOT_INCIDENT', 'Pilot incident can erase or promote a failure')
    }
    return incident
}

module.exports = {
    PILOT_INCIDENT_SCHEMA,
    PILOT_RECEIPT_SCHEMA,
    ToolchainShadowEvidenceError,
    buildPilotIncident,
    buildPilotReceipt,
    finalizePilotReceipt,
    pilotCohortIdentity,
    validatePilotIncident,
    validatePilotReceipt,
}
