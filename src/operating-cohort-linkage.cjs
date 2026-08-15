'use strict'

const { canonicalJson, sealDocument, verifyDocumentIntegrity } = require('./verification-receipts.cjs')
const { objectSha256 } = require('./c0-retention.cjs')
const { validateLocalShadowReceipt } = require('./toolchain-shadow-local.cjs')
const { validateSameGlobalComparison } = require('./toolchain-shadow-same-global.cjs')
const {
    ROUTE_COMBINED,
    validateMaterialDeclaration,
    validateReusableGlobalAnchor,
} = require('./operating-cohort-route.cjs')
const {
    operatingCohortBinding,
    validateOperatingCohortBinding,
} = require('./operating-cohort-identity.cjs')

const LINKAGE_SCHEMA = 'patch-toolchain-shadow-operating-linkage-v1'
const LINKAGE_SCHEMA_V2 = 'patch-toolchain-shadow-operating-linkage-v2'

class OperatingCohortLinkageError extends Error {
    constructor(code, message) {
        super(message)
        this.name = 'OperatingCohortLinkageError'
        this.code = code
    }
}

function fail(code, message) {
    throw new OperatingCohortLinkageError(code, message)
}

function buildCandidateOperatingLinkageV1({
    bundle, globalReceipt, localReceipt, localReceiptObjectSha256, declaration, routeDecision,
}) {
    validateMaterialDeclaration(declaration)
    validateLocalShadowReceipt(localReceipt)
    if (routeDecision.routeId !== ROUTE_COMBINED || routeDecision.globalExecutionsExpected !== 1
        || routeDecision.materialDeclarationSha256 !== declaration.declarationSha256) {
        fail('INVALID_COMBINED_ROUTE', 'Candidate linkage requires the exact combined route decision')
    }
    const comparison = globalReceipt?.verifierResult?.toolchainShadowComparison
    validateSameGlobalComparison(comparison, globalReceipt.verifierResult)
    const globalReceiptObjectSha256 = objectSha256(globalReceipt)
    const anchor = {
        cohortId: bundle.cohort.cohortId,
        globalRunId: bundle.cohort.runId,
        subjectCommit: declaration.qualification.subject.implementationCommit,
        policySha256: bundle.authority.policy.sha256,
        targetCommit: bundle.authority.target.commit,
        targetApplicationTreeSha256: bundle.authority.target.applicationBeforeSha256,
        workerScheduleSha256: bundle.authority.workerSchedule.sha256,
        cacheHistorySha256: bundle.authority.cacheHistory.sha256,
        runtimeSemanticSha256: bundle.authority.environment.semanticSha256,
        materialDeclarationSha256: bundle.authority.operatingRoute.materialDeclarationSha256,
    }
    validateReusableGlobalAnchor(anchor, {
        ...anchor,
        subjectCommit: declaration.qualification.subject.implementationCommit,
        policySha256: declaration.qualification.subject.policySha256,
        targetCommit: declaration.qualification.subject.targetCommit,
        targetApplicationTreeSha256: declaration.qualification.subject.targetApplicationTreeSha256,
        materialDeclarationSha256: declaration.declarationSha256,
    })
    if (!/^[0-9a-f]{64}$/.test(localReceiptObjectSha256 ?? '')
        || bundle.globalReceipt.objectSha256 !== globalReceiptObjectSha256
        || comparison.localReceiptPayloadSha256 !== localReceipt.integrity.payloadSha256
        || comparison.materialDeclarationSha256 !== declaration.declarationSha256
        || comparison.candidateDeclarationSha256 !== localReceipt.declarationSha256
        || bundle.authority.policy.sha256 !== declaration.qualification.subject.policySha256
        || bundle.authority.target.commit !== declaration.qualification.subject.targetCommit
        || bundle.authority.target.applicationBeforeSha256
            !== declaration.qualification.subject.targetApplicationTreeSha256
        || bundle.authority.operatingRoute.routeId !== ROUTE_COMBINED
        || bundle.authority.operatingRoute.materialDeclarationSha256 !== declaration.declarationSha256
        || bundle.authority.operatingRoute.decisionSha256 !== routeDecision.decisionSha256) {
        fail('CROSS_COHORT_GLOBAL_RECEIPT', 'Candidate linkage inputs are not from one exact frozen cohort')
    }
    return sealDocument({
        schema: LINKAGE_SCHEMA,
        status: comparison.status === 'passed' && globalReceipt.accepted === true ? 'passed' : 'failed',
        routeId: ROUTE_COMBINED,
        cohortId: bundle.cohort.cohortId,
        globalRunId: bundle.cohort.runId,
        source: {
            qualifiedSubjectCommit: declaration.qualification.subject.implementationCommit,
            materialToolingCommit: bundle.authority.implementation.commit,
        },
        policySha256: bundle.authority.policy.sha256,
        target: {
            commit: bundle.authority.target.commit,
            applicationTreeSha256: bundle.authority.target.applicationBeforeSha256,
        },
        canonicalScheduleHistory: {
            schedule: bundle.authority.workerSchedule.schedule,
            workerScheduleSha256: bundle.authority.workerSchedule.sha256,
            cacheHistorySha256: bundle.authority.cacheHistory.sha256,
        },
        runtimeSemanticSha256: bundle.authority.environment.semanticSha256,
        materialDeclarationSha256: declaration.declarationSha256,
        routeDecisionSha256: routeDecision.decisionSha256,
        references: {
            localReceiptObjectSha256,
            localReceiptPayloadSha256: localReceipt.integrity.payloadSha256,
            globalReceiptObjectSha256,
            globalReceiptPayloadSha256: globalReceipt.integrity.payloadSha256,
            c0BundlePayloadSha256: bundle.integrity.payloadSha256,
        },
        comparison: {
            globalExecutionSource: comparison.globalExecutionSource,
            rawMasks: comparison.coverage.rawMasks,
            processedMasks: comparison.coverage.processedMasks,
            localMasks: 2,
            boundaryClasses: 4,
            totalLocalCases: 8,
            mismatches: comparison.mismatches,
        },
        canonicalProtection: {
            canonicalGate: 'Global Exhaustive',
            productionClass: 'G',
            shadowClass: 'B',
            productionCertificatesIssued: 0,
            canonicalMasksSkipped: 0,
            productionStateMigrated: false,
            c1RelaxationAuthorized: false,
        },
    })
}

function buildCandidateOperatingLinkageV2({
    bundle, globalReceipt, localReceipt, localReceiptObjectSha256, declaration, routeDecision,
}) {
    validateMaterialDeclaration(declaration)
    validateLocalShadowReceipt(localReceipt)
    if (bundle?.schema !== 'patch-c0-evidence-bundle-v2'
        || routeDecision.routeId !== ROUTE_COMBINED
        || routeDecision.globalExecutionsExpected !== 1
        || routeDecision.materialDeclarationSha256 !== declaration.declarationSha256) {
        fail('INVALID_COMBINED_ROUTE', 'Candidate linkage requires one frozen combined-route attempt')
    }
    const frozen = bundle.frozenDeclaration
    const binding = operatingCohortBinding(frozen, bundle.frozenDeclarationObjectSha256)
    const comparison = globalReceipt?.verifierResult?.toolchainShadowComparison
    validateSameGlobalComparison(comparison, globalReceipt.verifierResult)
    const globalReceiptObjectSha256 = objectSha256(globalReceipt)
    validateOperatingCohortBinding(localReceipt.operatingCohort, binding, 'local receipt')
    validateOperatingCohortBinding(globalReceipt.options?.operatingRoute?.operatingCohort, binding, 'Global receipt')
    if (!/^[0-9a-f]{64}$/.test(localReceiptObjectSha256 ?? '')
        || comparison.materialInputKey !== frozen.materialInputKey
        || comparison.cohortId !== frozen.cohortId
        || comparison.executionAttemptId !== frozen.executionAttemptId
        || comparison.frozenDeclarationSha256 !== bundle.frozenDeclarationObjectSha256
        || comparison.localRunId !== localReceipt.localRunId
        || bundle.cohort.materialInputKey !== frozen.materialInputKey
        || bundle.cohort.cohortId !== frozen.cohortId
        || bundle.cohort.executionAttemptId !== frozen.executionAttemptId
        || bundle.globalReceipt.objectSha256 !== globalReceiptObjectSha256
        || bundle.globalReceipt.globalRunId !== globalReceipt.globalRunId
        || bundle.attemptEvidence.localRunId !== localReceipt.localRunId
        || bundle.attemptEvidence.globalRunId !== globalReceipt.globalRunId
        || comparison.localReceiptPayloadSha256 !== localReceipt.integrity.payloadSha256
        || comparison.materialDeclarationSha256 !== declaration.declarationSha256
        || comparison.candidateDeclarationSha256 !== localReceipt.declarationSha256
        || frozen.materialDeclarationSha256 !== declaration.declarationSha256
        || frozen.route.routeId !== ROUTE_COMBINED
        || frozen.route.decisionSha256 !== routeDecision.decisionSha256) {
        fail('CROSS_ATTEMPT_OR_COHORT_RECEIPT', 'Candidate linkage inputs do not belong to one frozen execution attempt')
    }
    return sealDocument({
        schema: LINKAGE_SCHEMA_V2,
        status: comparison.status === 'passed' && globalReceipt.accepted === true ? 'passed' : 'failed',
        routeId: ROUTE_COMBINED,
        materialInputKey: frozen.materialInputKey,
        cohortId: frozen.cohortId,
        executionAttemptId: frozen.executionAttemptId,
        frozenDeclarationSha256: bundle.frozenDeclarationObjectSha256,
        localRunId: localReceipt.localRunId,
        globalRunId: globalReceipt.globalRunId,
        evidenceBundleId: bundle.evidenceBundleId,
        source: {
            qualifiedSubjectCommit: declaration.qualification.subject.implementationCommit,
            materialToolingCommit: bundle.authority.implementation.commit,
        },
        policySha256: bundle.authority.policy.sha256,
        target: {
            commit: bundle.authority.target.commit,
            applicationTreeSha256: bundle.authority.target.applicationBeforeSha256,
        },
        canonicalScheduleHistoryObservation: {
            schedule: bundle.authority.workerSchedule.schedule,
            workers: bundle.authority.workerSchedule.workers,
            orderedMasksSha256: bundle.authority.workerSchedule.orderedMasksSha256,
            workerScheduleSha256: bundle.authority.workerSchedule.sha256,
            cacheHistorySha256: bundle.authority.cacheHistory.sha256,
        },
        runtimeSemanticSha256: bundle.authority.environment.semanticSha256,
        materialDeclarationSha256: declaration.declarationSha256,
        routeDecisionSha256: routeDecision.decisionSha256,
        references: {
            frozenDeclarationObjectSha256: bundle.frozenDeclarationObjectSha256,
            localReceiptObjectSha256,
            localReceiptPayloadSha256: localReceipt.integrity.payloadSha256,
            globalReceiptObjectSha256,
            globalReceiptPayloadSha256: globalReceipt.integrity.payloadSha256,
            c0BundleObjectSha256: objectSha256(bundle),
            c0BundlePayloadSha256: bundle.integrity.payloadSha256,
        },
        comparison: {
            globalExecutionSource: comparison.globalExecutionSource,
            rawMasks: comparison.coverage.rawMasks,
            processedMasks: comparison.coverage.processedMasks,
            localMasks: frozen.candidate.localDomain.masks.length,
            boundaryClasses: frozen.candidate.localDomain.boundaryClasses.length,
            totalLocalCases: frozen.candidate.localDomain.totalLocalCases,
            mismatches: comparison.mismatches,
        },
        canonicalProtection: {
            canonicalGate: 'Global Exhaustive',
            productionClass: 'G',
            shadowClass: 'B',
            productionCertificatesIssued: 0,
            canonicalMasksSkipped: 0,
            productionStateMigrated: false,
            c1RelaxationAuthorized: false,
        },
    })
}

function buildCandidateOperatingLinkage(inputs) {
    return inputs.bundle?.schema === 'patch-c0-evidence-bundle-v2'
        ? buildCandidateOperatingLinkageV2(inputs)
        : buildCandidateOperatingLinkageV1(inputs)
}

function validateCandidateOperatingLinkage(linkage, inputs) {
    if (!verifyDocumentIntegrity(linkage)
        || ![LINKAGE_SCHEMA, LINKAGE_SCHEMA_V2].includes(linkage.schema)) {
        fail('CORRUPT_OPERATING_LINKAGE', 'Candidate operating linkage integrity is invalid')
    }
    const expected = buildCandidateOperatingLinkage(inputs)
    if (canonicalJson(linkage) !== canonicalJson(expected)) {
        fail('OPERATING_LINKAGE_MISMATCH', 'Candidate operating linkage differs from exact source evidence')
    }
    return linkage
}

function validateCandidateOperatingLinkageRecord(linkage, inputs = null) {
    const v2 = linkage?.schema === LINKAGE_SCHEMA_V2
    if (!verifyDocumentIntegrity(linkage) || ![LINKAGE_SCHEMA, LINKAGE_SCHEMA_V2].includes(linkage.schema)
        || !['passed', 'failed'].includes(linkage.status)
        || linkage.routeId !== ROUTE_COMBINED
        || !/^[0-9a-f]{64}$/.test(linkage.cohortId ?? '')
        || !/^[0-9a-f]{64}$/.test(linkage.globalRunId ?? '')
        || !/^[0-9a-f]{64}$/.test(linkage.materialDeclarationSha256 ?? '')
        || !/^[0-9a-f]{64}$/.test(linkage.routeDecisionSha256 ?? '')) {
        fail('CORRUPT_OPERATING_LINKAGE', 'Candidate operating linkage record is invalid')
    }
    if (v2 && (['materialInputKey', 'executionAttemptId', 'frozenDeclarationSha256',
        'evidenceBundleId'].some((field) => !/^[0-9a-f]{64}$/.test(linkage[field] ?? ''))
        || (linkage.status === 'passed' && !/^[0-9a-f]{64}$/.test(linkage.localRunId ?? ''))
        || (linkage.status === 'failed' && linkage.localRunId !== null
            && !/^[0-9a-f]{64}$/.test(linkage.localRunId ?? '')))) {
        fail('CORRUPT_OPERATING_LINKAGE', 'Candidate operating linkage attempt identity is invalid')
    }
    if (inputs !== null) return validateCandidateOperatingLinkage(linkage, inputs)
    if (linkage.status === 'passed') fail('LINKAGE_INPUTS_REQUIRED', 'Passing linkage requires exact source inputs')
    if (typeof linkage.reason !== 'string' || linkage.reason.length === 0
        || !/^[0-9a-f]{64}$/.test(linkage.globalReceiptObjectSha256 ?? '')
        || !/^[0-9a-f]{64}$/.test(linkage.localEvidenceObjectSha256 ?? '')) {
        fail('CORRUPT_OPERATING_LINKAGE', 'Failed candidate linkage lacks immutable negative evidence references')
    }
    return linkage
}

module.exports = {
    LINKAGE_SCHEMA,
    LINKAGE_SCHEMA_V2,
    OperatingCohortLinkageError,
    buildCandidateOperatingLinkage,
    validateCandidateOperatingLinkage,
    validateCandidateOperatingLinkageRecord,
}
