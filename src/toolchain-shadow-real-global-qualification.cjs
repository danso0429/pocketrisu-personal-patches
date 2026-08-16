'use strict'

const fs = require('node:fs')
const path = require('node:path')
const {
    canonicalJson,
    sealDocument,
    verifyDocumentIntegrity,
    evaluateExecutionReceipt,
} = require('./verification-receipts.cjs')
const {
    BUILD_BOUNDARY_CLASS,
    compareBuildBoundaries,
} = require('./toolchain-shadow-boundaries.cjs')
const {
    provisionExactPnpm,
    runtimeObservation,
} = require('./operating-build-environment.cjs')
const {
    LOCAL_RECEIPT_SCHEMA,
    validateLocalShadowReceipt,
} = require('./toolchain-shadow-local.cjs')
const {
    COMPARISON_V2_SCHEMA,
    validateSameGlobalComparison,
} = require('./toolchain-shadow-same-global.cjs')
const {
    PROJECTION_SCHEMA,
    SEMANTIC_FIELD_SET_SHA256,
} = require('./toolchain-shadow-canonical-projection.cjs')
const {
    CANONICAL_PROTECTION,
    OPERATING_COUNTS,
    REAL_GLOBAL_QUALIFICATION_TYPE,
} = require('./qualification-registry.cjs')
const { EXCLUDED_PURPOSES } = require('./toolchain-shadow-qualification.cjs')
const { sha256 } = require('./qualification-object-store.cjs')

const PROVISIONING_SCHEMA = 'patch-toolchain-shadow-real-global-provisioning-v2'
const QUALIFICATION_SCHEMA = REAL_GLOBAL_QUALIFICATION_TYPE
const SHA256_PATTERN = /^[0-9a-f]{64}$/
const COMMIT_PATTERN = /^[0-9a-f]{40}$/

class RealGlobalQualificationError extends Error {
    constructor(code, message, details = null) {
        super(message)
        this.name = 'RealGlobalQualificationError'
        this.code = code
        this.details = details
    }
}

function fail(code, message, details = null) {
    throw new RealGlobalQualificationError(code, message, details)
}

function exactKeys(value, expected, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...expected].sort())) {
        fail('INVALID_REAL_GLOBAL_QUALIFICATION', `${label} keys differ`)
    }
}

function validateSubject(subject) {
    exactKeys(subject, [
        'implementationCommit', 'qualificationToolCommit', 'policySha256', 'contractSha256',
        'compiledDeclarationSha256', 'targetCommit', 'targetApplicationTreeSha256',
    ], 'real-Global qualification subject')
    if (!COMMIT_PATTERN.test(subject.implementationCommit ?? '')
        || !COMMIT_PATTERN.test(subject.qualificationToolCommit ?? '')
        || !COMMIT_PATTERN.test(subject.targetCommit ?? '')) {
        fail('INVALID_REAL_GLOBAL_QUALIFICATION', 'Qualification subject commit identity is invalid')
    }
    for (const key of [
        'policySha256', 'contractSha256', 'compiledDeclarationSha256',
        'targetApplicationTreeSha256',
    ]) if (!SHA256_PATTERN.test(subject[key] ?? '')) fail('INVALID_REAL_GLOBAL_QUALIFICATION', `${key} is invalid`)
    return subject
}

function productionProtection() {
    return {
        ...CANONICAL_PROTECTION,
        materialCohortCounted: false,
        stableReleaseCounted: false,
        productionDefectYieldCounted: false,
        candidateOperatingSampleCounted: false,
    }
}

function validateProvisioningReceipt(receipt, { requireExecutable = false } = {}) {
    if (!verifyDocumentIntegrity(receipt) || receipt?.schema !== PROVISIONING_SCHEMA
        || receipt.version !== 2 || receipt.qualificationType !== REAL_GLOBAL_QUALIFICATION_TYPE
        || receipt.status !== 'passed') {
        fail('INVALID_REAL_GLOBAL_PROVISIONING', 'Qualification provisioning receipt schema or status is invalid')
    }
    exactKeys(receipt, [
        'schema', 'version', 'qualificationType', 'recordedAt', 'status', 'method', 'requested',
        'node', 'pnpm', 'runtime', 'resolution', 'expectedBoundary', 'observedBoundary',
        'boundaryComparison', 'identities', 'cleanup', 'canonicalProtection', 'integrity',
    ], 'real-Global provisioning receipt')
    exactKeys(receipt.method, [
        'name', 'version', 'repositoryMutationAllowed', 'lockfileMutationAllowed',
    ], 'real-Global provisioning method')
    exactKeys(receipt.requested, ['nodeVersion', 'pnpmVersion'], 'real-Global requested runtime')
    exactKeys(receipt.node, ['version', 'executable', 'executableSha256'], 'real-Global Node observation')
    exactKeys(receipt.pnpm, [
        'requestedVersion', 'observedVersion', 'launcherExecutable', 'resolvedExecutable',
        'executableSha256',
    ], 'real-Global pnpm observation')
    exactKeys(receipt.runtime, [
        'platform', 'architecture', 'libc', 'libcVersionRuntime',
    ], 'real-Global runtime observation')
    exactKeys(receipt.resolution, [
        'temporaryRoot', 'temporaryInstanceSha256', 'provisionedBinDirectory',
        'pathPrepend', 'ambientPathSha256', 'effectivePathSha256',
    ], 'real-Global executable resolution')
    exactKeys(receipt.expectedBoundary, [
        'id', 'nodeVersion', 'platform', 'architecture', 'libc', 'pnpmVersion',
    ], 'real-Global expected boundary')
    exactKeys(receipt.observedBoundary, [
        'id', 'nodeVersion', 'platform', 'architecture', 'libc', 'pnpmVersion',
    ], 'real-Global observed boundary')
    exactKeys(receipt.identities, [
        'implementationCommit', 'qualificationToolCommit', 'targetCommit',
        'targetApplicationTreeSha256',
    ], 'real-Global provisioning identities')
    exactKeys(receipt.cleanup, [
        'requiredAfterQualification', 'durableReceiptSurvivesCleanup',
    ], 'real-Global provisioning cleanup')
    if (receipt.method?.name !== 'unique-task-scoped-temporary-installation'
        || receipt.method?.version !== 'exact-task-scoped-pnpm-v1'
        || receipt.method.repositoryMutationAllowed !== false
        || receipt.method.lockfileMutationAllowed !== false
        || receipt.requested?.nodeVersion !== BUILD_BOUNDARY_CLASS.nodeVersion
        || receipt.requested?.pnpmVersion !== BUILD_BOUNDARY_CLASS.pnpmVersion
        || canonicalJson(receipt.expectedBoundary) !== canonicalJson(BUILD_BOUNDARY_CLASS)
        || canonicalJson(receipt.boundaryComparison)
            !== canonicalJson(compareBuildBoundaries(receipt.expectedBoundary, receipt.observedBoundary))
        || receipt.boundaryComparison.equal !== true
        || receipt.pnpm?.observedVersion !== BUILD_BOUNDARY_CLASS.pnpmVersion
        || receipt.node?.version !== BUILD_BOUNDARY_CLASS.nodeVersion
        || receipt.runtime?.platform !== BUILD_BOUNDARY_CLASS.platform
        || receipt.runtime?.architecture !== BUILD_BOUNDARY_CLASS.architecture
        || receipt.runtime?.libc !== BUILD_BOUNDARY_CLASS.libc
        || !SHA256_PATTERN.test(receipt.node?.executableSha256 ?? '')
        || !SHA256_PATTERN.test(receipt.pnpm?.executableSha256 ?? '')
        || !SHA256_PATTERN.test(receipt.resolution?.ambientPathSha256 ?? '')
        || !SHA256_PATTERN.test(receipt.resolution?.effectivePathSha256 ?? '')
        || !SHA256_PATTERN.test(receipt.resolution?.temporaryInstanceSha256 ?? '')
        || [
            receipt.node?.executable, receipt.pnpm?.launcherExecutable,
            receipt.pnpm?.resolvedExecutable, receipt.resolution?.temporaryRoot,
            receipt.resolution?.provisionedBinDirectory, receipt.resolution?.pathPrepend,
        ].some((value) => typeof value !== 'string' || value.length === 0)
        || !COMMIT_PATTERN.test(receipt.identities?.implementationCommit ?? '')
        || !COMMIT_PATTERN.test(receipt.identities?.qualificationToolCommit ?? '')
        || !COMMIT_PATTERN.test(receipt.identities?.targetCommit ?? '')
        || !SHA256_PATTERN.test(receipt.identities?.targetApplicationTreeSha256 ?? '')
        || receipt.cleanup.requiredAfterQualification !== true
        || receipt.cleanup.durableReceiptSurvivesCleanup !== true
        || canonicalJson(receipt.canonicalProtection) !== canonicalJson(productionProtection())) {
        fail('INVALID_REAL_GLOBAL_PROVISIONING', 'Qualification provisioning facts are incompatible')
    }
    if (requireExecutable) {
        for (const [label, executable, expected] of [
            ['Node', receipt.node.executable, receipt.node.executableSha256],
            ['pnpm', receipt.pnpm.resolvedExecutable, receipt.pnpm.executableSha256],
        ]) {
            const resolved = fs.realpathSync(path.resolve(executable))
            if (!fs.lstatSync(resolved).isFile() || sha256(fs.readFileSync(resolved)) !== expected) {
                fail('REAL_GLOBAL_PROVISIONING_DRIFT', `${label} executable identity changed`)
            }
        }
    }
    return receipt
}

async function provisionRealGlobalQualificationEnvironment({
    context,
    temporaryParent,
    env = process.env,
    recordedAt = new Date().toISOString(),
    dependencies = {},
}) {
    validateSubject(context)
    const provisioned = await (dependencies.provisionExactPnpm ?? provisionExactPnpm)({
        temporaryParent,
        purpose: 'qualification',
        runChildImpl: dependencies.runChildImpl,
    })
    const ambientPath = env.PATH ?? ''
    const effectivePath = `${provisioned.binDirectory}${path.delimiter}${ambientPath}`
    const effectiveEnv = { ...env, PATH: effectivePath }
    const observation = (dependencies.runtimeObservation ?? runtimeObservation)({
        pnpmExecutable: provisioned.executable,
        env: effectiveEnv,
    })
    const receipt = sealDocument({
        schema: PROVISIONING_SCHEMA,
        version: 2,
        qualificationType: REAL_GLOBAL_QUALIFICATION_TYPE,
        recordedAt,
        status: observation.comparison.equal ? 'passed' : 'failed',
        method: {
            name: provisioned.receipt.method,
            version: provisioned.receipt.methodVersion,
            repositoryMutationAllowed: provisioned.receipt.repositoryMutationAllowed,
            lockfileMutationAllowed: provisioned.receipt.lockfileMutationAllowed,
        },
        requested: {
            nodeVersion: BUILD_BOUNDARY_CLASS.nodeVersion,
            pnpmVersion: BUILD_BOUNDARY_CLASS.pnpmVersion,
        },
        node: observation.node,
        pnpm: observation.pnpm,
        runtime: observation.runtime,
        resolution: {
            temporaryRoot: provisioned.root,
            temporaryInstanceSha256: sha256(canonicalJson({
                purpose: REAL_GLOBAL_QUALIFICATION_TYPE,
                root: provisioned.root,
            })),
            provisionedBinDirectory: provisioned.binDirectory,
            pathPrepend: provisioned.binDirectory,
            ambientPathSha256: sha256(ambientPath),
            effectivePathSha256: sha256(effectivePath),
        },
        expectedBoundary: { ...BUILD_BOUNDARY_CLASS },
        observedBoundary: observation.observedBoundary,
        boundaryComparison: observation.comparison,
        identities: {
            implementationCommit: context.implementationCommit,
            qualificationToolCommit: context.qualificationToolCommit,
            targetCommit: context.targetCommit,
            targetApplicationTreeSha256: context.targetApplicationTreeSha256,
        },
        cleanup: {
            requiredAfterQualification: true,
            durableReceiptSurvivesCleanup: true,
        },
        canonicalProtection: productionProtection(),
    })
    validateProvisioningReceipt(receipt, { requireExecutable: true })
    return { ...provisioned, env: effectiveEnv, receipt }
}

function validateRealGlobalQualificationRecord(record, evidence = null) {
    if (!verifyDocumentIntegrity(record) || record?.schema !== QUALIFICATION_SCHEMA
        || record.version !== 2 || record.qualificationType !== REAL_GLOBAL_QUALIFICATION_TYPE
        || record.result !== 'passed') {
        fail('INVALID_REAL_GLOBAL_QUALIFICATION', 'Real-Global qualification record schema or result is invalid')
    }
    exactKeys(record, [
        'schema', 'version', 'recordedAt', 'result', 'qualificationType', 'subject',
        'sourceIdentity', 'targetIdentity', 'environment', 'projection', 'observations',
        'receiptBindings', 'checks', 'acceptedPurpose', 'excludedPurposes', 'operatingCounts',
        'canonicalProtection', 'integrity',
    ], 'real-Global qualification record')
    validateSubject(record.subject)
    exactKeys(record.sourceIdentity, [
        'subjectSchemasSha256', 'qualificationSchemasSha256', 'localRouteSha256',
        'globalProjectionRouteSha256', 'contractSha256', 'compiledDeclarationSha256',
        'projectionSchema',
    ], 'real-Global source identity')
    exactKeys(record.targetIdentity, [
        'role', 'commit', 'applicationTreeSha256',
    ], 'real-Global target identity')
    exactKeys(record.environment, [
        'admittedBoundary', 'provisioningReceiptPayloadSha256',
    ], 'real-Global environment identity')
    exactKeys(record.projection, [
        'schema', 'semanticFieldSetSha256',
    ], 'real-Global projection identity')
    exactKeys(record.observations, [
        'localCasesExpected', 'localCasesCompleted', 'boundaryConsensusPassed',
        'globalMasksExpected', 'globalMasksCompleted', 'globalExecutionCount',
        'comparisons', 'matches', 'mismatches',
    ], 'real-Global observations')
    exactKeys(record.receiptBindings, [
        'provisioningReceiptPayloadSha256', 'localReceiptPayloadSha256',
        'globalRunId', 'globalReceiptPayloadSha256',
    ], 'real-Global receipt bindings')
    exactKeys(record.checks, [
        'admittedBuildBoundary', 'independentLocalGeneration',
        'independentCanonicalGlobalGeneration', 'sharedCanonicalProjection',
        'completeMapping', 'boundaryConsensus', 'allComparisonsMatched',
        'targetIntegrity', 'receiptIntegrity',
    ], 'real-Global checks')
    for (const key of [
        'subjectSchemasSha256', 'qualificationSchemasSha256', 'localRouteSha256',
        'globalProjectionRouteSha256',
    ]) if (!SHA256_PATTERN.test(record.sourceIdentity?.[key] ?? '')) fail('INVALID_REAL_GLOBAL_QUALIFICATION', `${key} is invalid`)
    if (record.sourceIdentity.contractSha256 !== record.subject.contractSha256
        || record.sourceIdentity.compiledDeclarationSha256 !== record.subject.compiledDeclarationSha256
        || record.sourceIdentity.projectionSchema !== PROJECTION_SCHEMA
        || record.targetIdentity?.role !== 'canonical-audited-target'
        || record.targetIdentity?.commit !== record.subject.targetCommit
        || record.targetIdentity?.applicationTreeSha256 !== record.subject.targetApplicationTreeSha256
        || canonicalJson(record.environment?.admittedBoundary) !== canonicalJson(BUILD_BOUNDARY_CLASS)
        || !SHA256_PATTERN.test(record.environment?.provisioningReceiptPayloadSha256 ?? '')
        || record.projection?.schema !== PROJECTION_SCHEMA
        || record.projection?.semanticFieldSetSha256 !== SEMANTIC_FIELD_SET_SHA256
        || record.observations?.localCasesExpected !== 8
        || record.observations?.localCasesCompleted !== 8
        || record.observations?.boundaryConsensusPassed !== true
        || record.observations?.globalMasksExpected !== 4096
        || record.observations?.globalMasksCompleted !== 4096
        || record.observations?.globalExecutionCount !== 1
        || record.observations?.comparisons !== 4096
        || record.observations?.matches !== 4096
        || record.observations?.mismatches !== 0
        || Object.values(record.receiptBindings ?? {}).some((value) => !SHA256_PATTERN.test(value ?? ''))
        || Object.values(record.checks ?? {}).some((value) => value !== true)
        || record.acceptedPurpose !== 'prerequisite-for-material-shadow-cohort-collection'
        || canonicalJson(record.excludedPurposes) !== canonicalJson([...EXCLUDED_PURPOSES])
        || canonicalJson(record.operatingCounts) !== canonicalJson(OPERATING_COUNTS)
        || canonicalJson(record.canonicalProtection) !== canonicalJson(CANONICAL_PROTECTION)) {
        fail('INVALID_REAL_GLOBAL_QUALIFICATION', 'Real-Global qualification machine facts are incompatible')
    }
    if (evidence !== null) {
        const { provisioningReceipt, localReceipt, globalReceipt } = evidence
        validateProvisioningReceipt(provisioningReceipt)
        validateLocalShadowReceipt(localReceipt)
        const evaluation = evaluateExecutionReceipt(globalReceipt)
        const comparison = globalReceipt.verifierResult?.toolchainShadowComparison
        validateSameGlobalComparison(comparison, globalReceipt.verifierResult)
        if (localReceipt.schema !== LOCAL_RECEIPT_SCHEMA
            || localReceipt.disposition !== 'qualification-v2'
            || globalReceipt.disposition !== 'diagnostic-only'
            || globalReceipt.options?.qualificationRoute?.qualificationType !== REAL_GLOBAL_QUALIFICATION_TYPE
            || !evaluation.receiptValid || !evaluation.executionAccepted
            || comparison?.schema !== COMPARISON_V2_SCHEMA
            || comparison.context !== 'real-global-qualification'
            || comparison.status !== 'passed' || comparison.matches !== 4096 || comparison.mismatches !== 0
            || localReceipt.declarationSha256 !== record.subject.compiledDeclarationSha256
            || comparison.candidateDeclarationSha256 !== record.subject.compiledDeclarationSha256
            || globalReceipt.globalRunId !== record.receiptBindings.globalRunId
            || localReceipt.target.commit !== record.subject.targetCommit
            || localReceipt.target.applicationTreeSha256 !== record.subject.targetApplicationTreeSha256
            || provisioningReceipt.integrity.payloadSha256
                !== record.receiptBindings.provisioningReceiptPayloadSha256
            || provisioningReceipt.identities.implementationCommit !== record.subject.implementationCommit
            || provisioningReceipt.identities.qualificationToolCommit !== record.subject.qualificationToolCommit
            || provisioningReceipt.identities.targetCommit !== record.subject.targetCommit
            || provisioningReceipt.identities.targetApplicationTreeSha256
                !== record.subject.targetApplicationTreeSha256
            || localReceipt.integrity.payloadSha256 !== record.receiptBindings.localReceiptPayloadSha256
            || globalReceipt.integrity.payloadSha256 !== record.receiptBindings.globalReceiptPayloadSha256) {
            fail('REAL_GLOBAL_QUALIFICATION_REFERENCE_MISMATCH', 'Qualification record and independently generated evidence differ')
        }
    }
    return record
}

function buildRealGlobalQualificationRecord({
    recordedAt = new Date().toISOString(),
    subject,
    sourceIdentity,
    provisioningReceipt,
    localReceipt,
    globalReceipt,
}) {
    validateSubject(subject)
    validateProvisioningReceipt(provisioningReceipt)
    validateLocalShadowReceipt(localReceipt)
    const evaluation = evaluateExecutionReceipt(globalReceipt)
    const comparison = globalReceipt.verifierResult?.toolchainShadowComparison
    if (!evaluation.receiptValid || !evaluation.executionAccepted) {
        fail('REAL_GLOBAL_EXECUTION_NOT_ACCEPTED', 'Canonical Global qualification receipt did not pass', evaluation)
    }
    validateSameGlobalComparison(comparison, globalReceipt.verifierResult)
    const record = sealDocument({
        schema: QUALIFICATION_SCHEMA,
        version: 2,
        recordedAt,
        result: 'passed',
        qualificationType: REAL_GLOBAL_QUALIFICATION_TYPE,
        subject,
        sourceIdentity,
        targetIdentity: {
            role: 'canonical-audited-target',
            commit: subject.targetCommit,
            applicationTreeSha256: subject.targetApplicationTreeSha256,
        },
        environment: {
            admittedBoundary: { ...BUILD_BOUNDARY_CLASS },
            provisioningReceiptPayloadSha256: provisioningReceipt.integrity.payloadSha256,
        },
        projection: {
            schema: PROJECTION_SCHEMA,
            semanticFieldSetSha256: SEMANTIC_FIELD_SET_SHA256,
        },
        observations: {
            localCasesExpected: 8,
            localCasesCompleted: localReceipt.coverage.processedExecutions,
            boundaryConsensusPassed: true,
            globalMasksExpected: 4096,
            globalMasksCompleted: globalReceipt.verifierResult.verifiedSelections,
            globalExecutionCount: 1,
            comparisons: comparison.coverage.processedMasks,
            matches: comparison.matches,
            mismatches: comparison.mismatches,
        },
        receiptBindings: {
            provisioningReceiptPayloadSha256: provisioningReceipt.integrity.payloadSha256,
            localReceiptPayloadSha256: localReceipt.integrity.payloadSha256,
            globalRunId: globalReceipt.globalRunId,
            globalReceiptPayloadSha256: globalReceipt.integrity.payloadSha256,
        },
        checks: {
            admittedBuildBoundary: true,
            independentLocalGeneration: true,
            independentCanonicalGlobalGeneration: true,
            sharedCanonicalProjection: true,
            completeMapping: true,
            boundaryConsensus: true,
            allComparisonsMatched: true,
            targetIntegrity: true,
            receiptIntegrity: true,
        },
        acceptedPurpose: 'prerequisite-for-material-shadow-cohort-collection',
        excludedPurposes: [
            'canonical-mask-skipping', 'c1-relaxation', 'material-operating-cohort-count',
            'production-admission', 'production-certificate', 'production-defect-yield',
            'production-routing', 'stable-release',
        ],
        operatingCounts: { ...OPERATING_COUNTS },
        canonicalProtection: { ...CANONICAL_PROTECTION },
    })
    return validateRealGlobalQualificationRecord(record, {
        provisioningReceipt, localReceipt, globalReceipt,
    })
}

function schemaRegistry() {
    return new Map([
        [PROVISIONING_SCHEMA, validateProvisioningReceipt],
        [QUALIFICATION_SCHEMA, validateRealGlobalQualificationRecord],
    ])
}

module.exports = {
    PROVISIONING_SCHEMA,
    QUALIFICATION_SCHEMA,
    RealGlobalQualificationError,
    buildRealGlobalQualificationRecord,
    productionProtection,
    provisionRealGlobalQualificationEnvironment,
    schemaRegistry,
    validateProvisioningReceipt,
    validateRealGlobalQualificationRecord,
}
