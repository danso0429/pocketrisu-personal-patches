'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
    canonicalJson,
    sealDocument,
    verifyDocumentIntegrity,
} = require('./verification-receipts.cjs')
const {
    objectSha256,
    publishEvidenceObject,
} = require('./c0-retention.cjs')
const {
    validateMaterialDeclaration,
    validateRouteDecision,
} = require('./operating-cohort-route.cjs')
const { sha256 } = require('./verification-evidence.cjs')
const {
    OPERATING_PROVISIONING_BINDING_SCHEMA,
    operatingBuildEnvironmentContract,
    validateProvisioningReceipt,
} = require('./operating-build-environment.cjs')

const MATERIAL_INPUT_IDENTITY_SCHEMA = 'patch-operating-material-input-identity-v1'
const COHORT_IDENTITY_SCHEMA = 'patch-operating-cohort-identity-v2'
const EXECUTION_ATTEMPT_SCHEMA = 'patch-operating-execution-attempt-v1'
const FROZEN_DECLARATION_SCHEMA = 'patch-operating-cohort-frozen-declaration-v1'
const FROZEN_DECLARATION_REF_SCHEMA = 'patch-operating-cohort-frozen-declaration-ref-v1'
const GLOBAL_LAUNCH_CLAIM_SCHEMA = 'patch-operating-global-launch-claim-v1'
const EVIDENCE_BUNDLE_ID_SCHEMA = 'patch-operating-evidence-bundle-identity-v1'
const SHA256_PATTERN = /^[0-9a-f]{64}$/
const COMMIT_PATTERN = /^[0-9a-f]{40}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

class OperatingCohortIdentityError extends Error {
    constructor(code, message, details = null) {
        super(message)
        this.name = 'OperatingCohortIdentityError'
        this.code = code
        this.details = details
    }
}

function fail(code, message, details = null) {
    throw new OperatingCohortIdentityError(code, message, details)
}

function canonicalSha256(value) {
    return sha256(canonicalJson(value))
}

function exactKeys(value, expected, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...expected].sort())) {
        fail('INVALID_FROZEN_COHORT_IDENTITY', `${label} fields differ`)
    }
}

function validateSha(value, label) {
    if (!SHA256_PATTERN.test(value ?? '')) fail('INVALID_FROZEN_COHORT_IDENTITY', `${label} is not a SHA-256 digest`)
    return value
}

function validateCommit(value, label) {
    if (!COMMIT_PATTERN.test(value ?? '')) fail('INVALID_FROZEN_COHORT_IDENTITY', `${label} is not a commit`)
    return value
}

function fileSetIdentity(root, relativePaths, schema) {
    const files = [...new Set(relativePaths)].sort().map((relative) => ({
        path: relative,
        sha256: sha256(fs.readFileSync(path.join(root, relative))),
    }))
    return {
        schema,
        files,
        rootSha256: canonicalSha256(files),
    }
}

function buildMaterialInputIdentity({ declaration, governance }) {
    validateMaterialDeclaration(declaration)
    exactKeys(governance, ['repository', 'commit', 'statusVersion'], 'material governance authority')
    validateCommit(governance.commit, 'material governance commit')
    if (typeof governance.repository !== 'string' || governance.repository.length === 0
        || !Number.isSafeInteger(governance.statusVersion) || governance.statusVersion < 1) {
        fail('INVALID_MATERIAL_INPUT', 'Material governance authority is invalid')
    }
    const identity = {
        schema: MATERIAL_INPUT_IDENTITY_SCHEMA,
        materialDeclaration: structuredClone(declaration),
        classification: {
            changeClass: declaration.changeClass,
            stableRelease: declaration.stableRelease,
            releaseCandidate: declaration.releaseCandidate,
            materialReason: declaration.materialReason,
        },
        governance: {
            ...governance,
            policySha256: declaration.qualification.subject.policySha256,
        },
        qualifiedSubject: {
            implementationCommit: declaration.qualification.subject.implementationCommit,
        },
        target: {
            commit: declaration.qualification.subject.targetCommit,
            applicationTreeSha256: declaration.qualification.subject.targetApplicationTreeSha256,
        },
        candidateImpact: structuredClone(declaration.candidateImpact),
    }
    return {
        identity,
        materialInputKey: canonicalSha256(identity),
    }
}

function buildVerificationIdentities(sourceRoot) {
    const root = fs.realpathSync(path.resolve(sourceRoot))
    return {
        canonicalGlobalVerifier: fileSetIdentity(root, [
            'scripts/verify-all-combinations.cjs',
            'src/verification-evidence.cjs',
            'src/verification-receipts.cjs',
        ], 'patch-operating-global-verifier-identity-v1'),
        candidateLocalVerifier: fileSetIdentity(root, [
            'scripts/run-toolchain-shadow-mask.cjs',
            'src/operating-build-environment.cjs',
            'src/toolchain-shadow-boundaries.cjs',
            'src/toolchain-shadow-local.cjs',
            'src/toolchain-shadow-same-global.cjs',
        ], 'patch-operating-local-verifier-identity-v1'),
    }
}

function localIsolationContract() {
    return {
        schema: 'patch-operating-local-isolation-contract-v1',
        target: 'fresh-target-projection-per-local-mask-and-boundary',
        process: 'fresh-process-per-local-mask-and-boundary',
        moduleGraph: 'fresh-process-module-graph',
        calculationCaches: 'empty-per-process',
        unmanagedHistory: 'unique-temporary-root-per-process',
        persistentLocalWorkers: false,
    }
}

function scheduleHistoryContract(declaration, jobs) {
    const effectiveJobs = jobs ?? (typeof os.availableParallelism === 'function'
        ? os.availableParallelism()
        : os.cpus().length)
    if (!Number.isSafeInteger(effectiveJobs) || effectiveJobs < 1) {
        fail('INVALID_GLOBAL_JOBS_CONTRACT', 'Effective Global worker count is invalid')
    }
    return {
        schema: 'patch-operating-global-schedule-history-contract-v1',
        schedule: declaration.globalContract.workerSchedule,
        workerHistory: declaration.globalContract.workerHistory,
        cacheMode: 'enabled-shared-per-worker-v1',
        moduleHistoryMode: 'persistent-per-worker-v1',
        unmanagedHistoryMode: 'persistent-per-worker-v1',
        jobs: {
            configured: jobs,
            resolution: jobs === null ? 'host-available-parallelism' : 'explicit',
            effective: effectiveJobs,
        },
    }
}

function qualificationIdentity(preflight) {
    const identity = preflight?.qualificationIdentity
    exactKeys(identity, [
        'storeIdentityHash', 'registryDescriptorSha256', 'registryRootSha256',
        'finalManifestDescriptorSha256', 'finalManifestPayloadSha256',
    ], 'accepted qualification identity')
    for (const key of Object.keys(identity)) validateSha(identity[key], `qualification ${key}`)
    return structuredClone(identity)
}

function buildCohortIdentity({
    declaration,
    governance,
    routeDecision,
    routeDecisionInputs,
    preflight,
    materialInput,
    tooling,
    verificationIdentities,
    jobs,
    localDomain,
}) {
    validateMaterialDeclaration(declaration)
    validateRouteDecision(routeDecision, { declaration, ...routeDecisionInputs })
    validateSha(materialInput?.materialInputKey, 'materialInputKey')
    if (canonicalSha256(materialInput.identity) !== materialInput.materialInputKey
        || materialInput.identity.schema !== MATERIAL_INPUT_IDENTITY_SCHEMA) {
        fail('MATERIAL_INPUT_KEY_MISMATCH', 'Material input identity differs from its key')
    }
    exactKeys(tooling, ['repository', 'commit', 'statusSha256'], 'verification tooling identity')
    validateCommit(tooling.commit, 'verification tooling commit')
    validateSha(tooling.statusSha256, 'verification tooling status')
    if (typeof tooling.repository !== 'string' || tooling.repository.length === 0) {
        fail('INVALID_VERIFICATION_TOOLING', 'Verification tooling repository is missing')
    }
    exactKeys(localDomain, [
        'candidateId', 'masks', 'boundaryClasses', 'totalLocalCases',
    ], 'candidate local domain')
    if (canonicalJson(localDomain.masks) !== canonicalJson(routeDecision.localMasksExpected === 0 ? [] : [0, 1])
        || !Array.isArray(localDomain.boundaryClasses)
        || localDomain.boundaryClasses.length !== routeDecision.boundaryClassesExpected
        || localDomain.totalLocalCases !== routeDecision.totalLocalCasesExpected) {
        fail('LOCAL_DOMAIN_MISMATCH', 'Frozen local domain differs from the machine route')
    }
    const identity = {
        schema: COHORT_IDENTITY_SCHEMA,
        materialInputKey: materialInput.materialInputKey,
        materialDeclarationSha256: declaration.declarationSha256,
        routeContract: {
            schema: routeDecision.schema,
            version: 1,
            routeId: routeDecision.routeId,
            decisionSha256: routeDecision.decisionSha256,
        },
        authority: {
            governance: structuredClone(governance),
            policySha256: declaration.qualification.subject.policySha256,
        },
        subject: {
            implementationCommit: declaration.qualification.subject.implementationCommit,
        },
        target: {
            commit: declaration.qualification.subject.targetCommit,
            applicationTreeSha256: declaration.qualification.subject.targetApplicationTreeSha256,
        },
        qualification: qualificationIdentity(preflight),
        candidate: {
            affected: routeDecision.candidateAffected,
            candidateId: routeDecision.candidateId,
            contractSha256: declaration.qualification.subject.contractSha256,
            compiledDeclarationSha256: declaration.qualification.subject.compiledDeclarationSha256,
            qualificationCompatibility: structuredClone(declaration.qualification.compatibility),
            localDomain: structuredClone(localDomain),
        },
        verification: {
            tooling: structuredClone(tooling),
            canonicalGlobalVerifier: structuredClone(verificationIdentities.canonicalGlobalVerifier),
            candidateLocalVerifier: structuredClone(verificationIdentities.candidateLocalVerifier),
            operatingBuildEnvironmentContract: operatingBuildEnvironmentContract(),
        },
        canonicalGlobalContract: {
            canonicalGate: declaration.globalContract.canonicalGate,
            scheduleHistoryContract: scheduleHistoryContract(declaration, jobs),
            globalExecutionsExpected: routeDecision.globalExecutionsExpected,
        },
        localIsolationContract: localIsolationContract(),
        environmentContract: structuredClone(declaration.environment),
    }
    return {
        identity,
        cohortId: canonicalSha256(identity),
    }
}

function createExecutionAttempt({
    cohortId,
    toolingCommit,
    createdAt = new Date().toISOString(),
    nonce = crypto.randomUUID(),
    creator = 'scripts/run-c0-evidence.cjs',
}) {
    validateSha(cohortId, 'attempt cohortId')
    validateCommit(toolingCommit, 'attempt tooling commit')
    if (!UUID_PATTERN.test(nonce) || Number.isNaN(Date.parse(createdAt))
        || new Date(createdAt).toISOString() !== createdAt
        || typeof creator !== 'string' || creator.length === 0) {
        fail('INVALID_EXECUTION_ATTEMPT', 'Execution attempt provenance is invalid')
    }
    const identity = {
        schema: EXECUTION_ATTEMPT_SCHEMA,
        cohortId,
        nonce,
        createdAt,
        provenance: { creator, toolingCommit },
    }
    return {
        identity,
        executionAttemptId: canonicalSha256(identity),
    }
}

function buildFrozenCohortDeclaration({
    materialInput,
    cohort,
    attempt,
    declaration,
    routeDecision,
    materialClassification,
}) {
    validateMaterialDeclaration(declaration)
    validateSha(materialInput.materialInputKey, 'frozen materialInputKey')
    validateSha(cohort.cohortId, 'frozen cohortId')
    validateSha(attempt.executionAttemptId, 'frozen executionAttemptId')
    if (canonicalSha256(materialInput.identity) !== materialInput.materialInputKey
        || canonicalSha256(cohort.identity) !== cohort.cohortId
        || canonicalSha256(attempt.identity) !== attempt.executionAttemptId
        || cohort.identity.materialInputKey !== materialInput.materialInputKey
        || attempt.identity.cohortId !== cohort.cohortId) {
        fail('FROZEN_IDENTITY_CHAIN_MISMATCH', 'Frozen material, cohort and attempt identities do not form one chain')
    }
    return sealDocument({
        schema: FROZEN_DECLARATION_SCHEMA,
        disposition: 'declared-pending',
        materialInputKey: materialInput.materialInputKey,
        cohortId: cohort.cohortId,
        executionAttemptId: attempt.executionAttemptId,
        materialDeclarationSha256: declaration.declarationSha256,
        materialClassification: structuredClone(materialClassification),
        materialInputIdentity: structuredClone(materialInput.identity),
        cohortIdentity: structuredClone(cohort.identity),
        executionAttempt: structuredClone(attempt.identity),
        route: {
            routeId: routeDecision.routeId,
            decisionSha256: routeDecision.decisionSha256,
            globalExecutionsExpected: routeDecision.globalExecutionsExpected,
        },
        authority: structuredClone(cohort.identity.authority),
        subject: structuredClone(cohort.identity.subject),
        target: structuredClone(cohort.identity.target),
        candidate: structuredClone(cohort.identity.candidate),
        environmentContract: structuredClone(cohort.identity.environmentContract),
        canonicalGlobalContract: {
            verifierIdentity: structuredClone(cohort.identity.verification.canonicalGlobalVerifier),
            scheduleHistoryContract: structuredClone(cohort.identity.canonicalGlobalContract.scheduleHistoryContract),
            jobs: structuredClone(cohort.identity.canonicalGlobalContract.scheduleHistoryContract.jobs),
        },
        candidateLocalContract: {
            verifierIdentity: structuredClone(cohort.identity.verification.candidateLocalVerifier),
            isolation: structuredClone(cohort.identity.localIsolationContract),
        },
        createdBeforeExecution: true,
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

function validateFrozenCohortDeclaration(document) {
    if (!verifyDocumentIntegrity(document) || document?.schema !== FROZEN_DECLARATION_SCHEMA
        || document.disposition !== 'declared-pending' || document.createdBeforeExecution !== true) {
        fail('INVALID_FROZEN_DECLARATION', 'Frozen cohort declaration integrity or state is invalid')
    }
    exactKeys(document, [
        'schema', 'disposition', 'materialInputKey', 'cohortId', 'executionAttemptId',
        'materialDeclarationSha256', 'materialClassification', 'materialInputIdentity',
        'cohortIdentity', 'executionAttempt', 'route', 'authority', 'subject', 'target',
        'candidate', 'environmentContract', 'canonicalGlobalContract',
        'candidateLocalContract', 'createdBeforeExecution', 'canonicalProtection', 'integrity',
    ], 'frozen cohort declaration')
    for (const key of ['materialInputKey', 'cohortId', 'executionAttemptId', 'materialDeclarationSha256']) {
        validateSha(document[key], `frozen declaration ${key}`)
    }
    validateMaterialDeclaration(document.materialInputIdentity?.materialDeclaration)
    if (document.materialInputIdentity?.schema !== MATERIAL_INPUT_IDENTITY_SCHEMA
        || document.cohortIdentity?.schema !== COHORT_IDENTITY_SCHEMA
        || document.executionAttempt?.schema !== EXECUTION_ATTEMPT_SCHEMA
        || canonicalSha256(document.materialInputIdentity) !== document.materialInputKey
        || canonicalSha256(document.cohortIdentity) !== document.cohortId
        || canonicalSha256(document.executionAttempt) !== document.executionAttemptId
        || document.cohortIdentity.materialInputKey !== document.materialInputKey
        || document.executionAttempt.cohortId !== document.cohortId
        || document.cohortIdentity.materialDeclarationSha256 !== document.materialDeclarationSha256
        || document.materialInputIdentity.materialDeclaration.declarationSha256
            !== document.materialDeclarationSha256
        || typeof document.materialClassification?.sameInputCohortFound !== 'boolean'
        || typeof document.materialClassification?.materiallyDistinct !== 'boolean'
        || typeof document.materialClassification?.repeatedPerformanceTrial !== 'boolean'
        || document.materialClassification.materiallyDistinct
            === document.materialClassification.repeatedPerformanceTrial
        || document.materialClassification.materiallyDistinct
            !== !document.materialClassification.sameInputCohortFound
        || document.materialClassification.repeatedPerformanceTrial
            !== document.materialClassification.sameInputCohortFound
        || document.route?.routeId !== document.cohortIdentity.routeContract.routeId
        || document.route?.decisionSha256 !== document.cohortIdentity.routeContract.decisionSha256
        || document.route?.globalExecutionsExpected !== 1) {
        fail('FROZEN_IDENTITY_CHAIN_MISMATCH', 'Frozen cohort declaration identity chain is inconsistent')
    }
    if (canonicalJson(document.authority) !== canonicalJson(document.cohortIdentity.authority)
        || canonicalJson(document.subject) !== canonicalJson(document.cohortIdentity.subject)
        || canonicalJson(document.target) !== canonicalJson(document.cohortIdentity.target)
        || canonicalJson(document.candidate) !== canonicalJson(document.cohortIdentity.candidate)
        || canonicalJson(document.environmentContract)
            !== canonicalJson(document.cohortIdentity.environmentContract)
        || canonicalJson(document.canonicalGlobalContract.verifierIdentity)
            !== canonicalJson(document.cohortIdentity.verification.canonicalGlobalVerifier)
        || canonicalJson(document.canonicalGlobalContract.scheduleHistoryContract)
            !== canonicalJson(document.cohortIdentity.canonicalGlobalContract.scheduleHistoryContract)
        || canonicalJson(document.candidateLocalContract.verifierIdentity)
            !== canonicalJson(document.cohortIdentity.verification.candidateLocalVerifier)
        || canonicalJson(document.candidateLocalContract.isolation)
            !== canonicalJson(document.cohortIdentity.localIsolationContract)) {
        fail('FROZEN_DECLARATION_PROJECTION_MISMATCH', 'Frozen declaration projections differ from cohort identity')
    }
    const protection = document.canonicalProtection
    if (canonicalJson(protection) !== canonicalJson({
        canonicalGate: 'Global Exhaustive',
        productionClass: 'G',
        shadowClass: 'B',
        productionCertificatesIssued: 0,
        canonicalMasksSkipped: 0,
        productionStateMigrated: false,
        c1RelaxationAuthorized: false,
    })) fail('FROZEN_PRODUCTION_PROTECTION_WEAKENED', 'Frozen declaration production protections differ')
    return document
}

function operatingCohortBinding(document, frozenDeclarationSha256) {
    validateFrozenCohortDeclaration(document)
    validateSha(frozenDeclarationSha256, 'frozen declaration object hash')
    return {
        materialInputKey: document.materialInputKey,
        cohortId: document.cohortId,
        executionAttemptId: document.executionAttemptId,
        frozenDeclarationSha256,
    }
}

function validateOperatingCohortBinding(actual, expected, label = 'execution receipt') {
    exactKeys(actual, [
        'materialInputKey', 'cohortId', 'executionAttemptId', 'frozenDeclarationSha256',
    ], `${label} frozen attempt binding`)
    exactKeys(expected, [
        'materialInputKey', 'cohortId', 'executionAttemptId', 'frozenDeclarationSha256',
    ], `expected ${label} frozen attempt binding`)
    for (const [field, code] of [
        ['materialInputKey', 'CROSS_MATERIAL_INPUT_RECEIPT'],
        ['cohortId', 'CROSS_COHORT_RECEIPT'],
        ['executionAttemptId', 'CROSS_ATTEMPT_RECEIPT'],
        ['frozenDeclarationSha256', 'FROZEN_DECLARATION_MISMATCH'],
    ]) {
        validateSha(actual[field], `${label} ${field}`)
        validateSha(expected[field], `expected ${label} ${field}`)
        if (actual[field] !== expected[field]) fail(code, `${label} ${field} differs from the frozen attempt`)
    }
    return actual
}

function attemptDirectory(storeRoot, executionAttemptId) {
    validateSha(executionAttemptId, 'attempt directory ID')
    return path.join(path.resolve(storeRoot), 'attempts', executionAttemptId)
}

function writeAppendOnlyJson(file, document) {
    const encoded = Buffer.from(JSON.stringify(document))
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
    let descriptor
    try {
        descriptor = fs.openSync(file, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o600)
        let offset = 0
        while (offset < encoded.length) offset += fs.writeSync(descriptor, encoded, offset)
        fs.fsyncSync(descriptor)
    } finally {
        if (descriptor !== undefined) fs.closeSync(descriptor)
    }
    fs.chmodSync(file, 0o444)
    const directory = fs.openSync(path.dirname(file), fs.constants.O_RDONLY)
    try { fs.fsyncSync(directory) } finally { fs.closeSync(directory) }
    if (!fs.readFileSync(file).equals(encoded)) fail('APPEND_ONLY_RECORD_MISMATCH', `Append-only record reread failed: ${file}`)
    const stat = fs.statSync(file)
    return {
        path: file,
        bytes: encoded.length,
        physicalBytes: Number(stat.blocks ?? 0) * 512,
        sha256: sha256(encoded),
    }
}

function publishFrozenCohortDeclaration(storeRoot, declaration) {
    validateFrozenCohortDeclaration(declaration)
    const publication = publishEvidenceObject(storeRoot, declaration)
    const reference = sealDocument({
        schema: FROZEN_DECLARATION_REF_SCHEMA,
        materialInputKey: declaration.materialInputKey,
        cohortId: declaration.cohortId,
        executionAttemptId: declaration.executionAttemptId,
        frozenDeclarationObjectSha256: publication.objectSha256,
        disposition: 'declared-pending',
    })
    const refFile = path.join(attemptDirectory(storeRoot, declaration.executionAttemptId), 'frozen-declaration.ref.json')
    let refPublication
    try {
        refPublication = writeAppendOnlyJson(refFile, reference)
    } catch (error) {
        if (error.code !== 'EEXIST') throw error
        const existing = fs.readFileSync(refFile)
        if (!existing.equals(Buffer.from(JSON.stringify(reference)))) {
            fail('ATTEMPT_ALREADY_FROZEN', 'Execution attempt already has another frozen declaration')
        }
        const stat = fs.statSync(refFile)
        refPublication = {
            path: refFile,
            bytes: existing.length,
            physicalBytes: Number(stat.blocks ?? 0) * 512,
            sha256: sha256(existing),
        }
    }
    return { publication, reference, refPublication }
}

function operatingEnvironmentRefPath(storeRoot, executionAttemptId) {
    return path.join(attemptDirectory(storeRoot, executionAttemptId), 'operating-environment.ref.json')
}

function publishOperatingEnvironmentForAttempt({
    storeRoot,
    frozenDeclaration,
    frozenDeclarationObjectSha256,
    provisioningReceipt,
}) {
    validateFrozenCohortDeclaration(frozenDeclaration)
    validateSha(frozenDeclarationObjectSha256, 'operating environment frozen declaration hash')
    validateProvisioningReceipt(provisioningReceipt, { requireExecutable: true })
    if (provisioningReceipt.status !== 'passed') {
        fail('OPERATING_BUILD_BOUNDARY_NOT_ADMITTED', 'A failed operating environment cannot be bound as execution-ready')
    }
    if (objectSha256(frozenDeclaration) !== frozenDeclarationObjectSha256
        || provisioningReceipt.identities.subjectCommit !== frozenDeclaration.subject.implementationCommit
        || provisioningReceipt.identities.toolingCommit
            !== frozenDeclaration.executionAttempt.provenance.toolingCommit
        || provisioningReceipt.identities.toolingStatusSha256
            !== frozenDeclaration.cohortIdentity.verification.tooling.statusSha256
        || provisioningReceipt.identities.targetCommit !== frozenDeclaration.target.commit
        || provisioningReceipt.identities.targetApplicationTreeSha256
            !== frozenDeclaration.target.applicationTreeSha256) {
        fail('OPERATING_ENVIRONMENT_IDENTITY_MISMATCH', 'Operating environment does not bind the frozen attempt identities')
    }
    const receiptPublication = publishEvidenceObject(storeRoot, provisioningReceipt)
    const binding = sealDocument({
        schema: OPERATING_PROVISIONING_BINDING_SCHEMA,
        materialInputKey: frozenDeclaration.materialInputKey,
        cohortId: frozenDeclaration.cohortId,
        executionAttemptId: frozenDeclaration.executionAttemptId,
        frozenDeclarationObjectSha256,
        provisioningReceiptObjectSha256: receiptPublication.objectSha256,
        state: 'provisioned-boundary-passed-before-execution',
    })
    const bindingPublication = publishEvidenceObject(storeRoot, binding)
    const file = operatingEnvironmentRefPath(storeRoot, frozenDeclaration.executionAttemptId)
    const appendOnlyPublication = writeAppendOnlyJson(file, binding)
    return {
        receipt: provisioningReceipt,
        receiptPublication,
        binding,
        bindingPublication,
        appendOnlyPublication,
    }
}

function loadOperatingEnvironmentForAttempt({
    storeRoot,
    frozenDeclaration,
    frozenDeclarationObjectSha256,
    requireExecutable = true,
}) {
    validateFrozenCohortDeclaration(frozenDeclaration)
    const file = operatingEnvironmentRefPath(storeRoot, frozenDeclaration.executionAttemptId)
    let binding
    try { binding = JSON.parse(fs.readFileSync(file, 'utf8')) } catch (error) {
        fail('OPERATING_ENVIRONMENT_BINDING_MISSING', 'Frozen execution attempt has no operating environment binding', {
            file,
            cause: error.message,
        })
    }
    exactKeys(binding, [
        'schema', 'materialInputKey', 'cohortId', 'executionAttemptId',
        'frozenDeclarationObjectSha256', 'provisioningReceiptObjectSha256',
        'state', 'integrity',
    ], 'operating environment binding')
    if (!verifyDocumentIntegrity(binding)
        || binding.schema !== OPERATING_PROVISIONING_BINDING_SCHEMA
        || binding.materialInputKey !== frozenDeclaration.materialInputKey
        || binding.cohortId !== frozenDeclaration.cohortId
        || binding.executionAttemptId !== frozenDeclaration.executionAttemptId
        || binding.frozenDeclarationObjectSha256 !== frozenDeclarationObjectSha256
        || !SHA256_PATTERN.test(binding.provisioningReceiptObjectSha256 ?? '')
        || binding.state !== 'provisioned-boundary-passed-before-execution') {
        fail('INVALID_OPERATING_ENVIRONMENT_BINDING', 'Operating environment binding differs from the frozen attempt')
    }
    const bindingObjectSha256 = objectSha256(binding)
    const bindingRecord = require('./c0-retention.cjs').loadEvidenceObject(
        storeRoot,
        bindingObjectSha256,
    )
    if (canonicalJson(bindingRecord.document) !== canonicalJson(binding)) {
        fail('INVALID_OPERATING_ENVIRONMENT_BINDING', 'Append-only environment binding differs from its evidence object')
    }
    const receiptRecord = require('./c0-retention.cjs').loadEvidenceObject(
        storeRoot,
        binding.provisioningReceiptObjectSha256,
    )
    try {
        validateProvisioningReceipt(receiptRecord.document, { requireExecutable })
    } catch (error) {
        error.details = {
            ...(error.details ?? {}),
            provisioningReceiptObjectSha256: receiptRecord.objectSha256,
            operatingEnvironmentBindingObjectSha256: objectSha256(binding),
            phase: 'pre-material-operating-environment-binding-validation',
            casesStarted: 0,
            globalLaunchClaimState: 'absent',
            globalExecutions: 0,
        }
        throw error
    }
    if (receiptRecord.document.status !== 'passed') {
        fail('OPERATING_BUILD_BOUNDARY_NOT_ADMITTED', 'Bound operating environment did not pass admission')
    }
    return {
        binding,
        bindingObjectSha256,
        bindingPath: file,
        receipt: receiptRecord.document,
        receiptObjectSha256: receiptRecord.objectSha256,
    }
}

function globalLaunchClaimPath(storeRoot, executionAttemptId) {
    return path.join(attemptDirectory(storeRoot, executionAttemptId), 'global-launch-1.claim.json')
}

function claimGlobalLaunch({
    storeRoot,
    frozenDeclaration,
    frozenDeclarationObjectSha256,
    claimedAt = new Date().toISOString(),
}) {
    validateFrozenCohortDeclaration(frozenDeclaration)
    validateSha(frozenDeclarationObjectSha256, 'frozen declaration object hash')
    if (objectSha256(frozenDeclaration) !== frozenDeclarationObjectSha256
        || Number.isNaN(Date.parse(claimedAt)) || new Date(claimedAt).toISOString() !== claimedAt) {
        fail('INVALID_GLOBAL_LAUNCH_CLAIM', 'Global launch claim source identity is invalid')
    }
    const claim = sealDocument({
        schema: GLOBAL_LAUNCH_CLAIM_SCHEMA,
        materialInputKey: frozenDeclaration.materialInputKey,
        cohortId: frozenDeclaration.cohortId,
        executionAttemptId: frozenDeclaration.executionAttemptId,
        frozenDeclarationObjectSha256,
        globalLaunchOrdinal: 1,
        state: 'claimed-before-spawn',
        claimedAt,
    })
    const file = globalLaunchClaimPath(storeRoot, frozenDeclaration.executionAttemptId)
    try {
        const appendOnlyPublication = writeAppendOnlyJson(file, claim)
        const objectPublication = publishEvidenceObject(storeRoot, claim)
        return {
            claim,
            objectPublication,
            appendOnlyPublication,
        }
    } catch (error) {
        if (error.code === 'EEXIST') {
            fail('SECOND_GLOBAL_LAUNCH_FORBIDDEN', 'Global launch is already claimed for this execution attempt', { file })
        }
        throw error
    }
}

function validateGlobalLaunchClaim(claim, frozenDeclaration, frozenDeclarationObjectSha256) {
    validateFrozenCohortDeclaration(frozenDeclaration)
    if (!verifyDocumentIntegrity(claim) || claim?.schema !== GLOBAL_LAUNCH_CLAIM_SCHEMA
        || claim.materialInputKey !== frozenDeclaration.materialInputKey
        || claim.cohortId !== frozenDeclaration.cohortId
        || claim.executionAttemptId !== frozenDeclaration.executionAttemptId
        || claim.frozenDeclarationObjectSha256 !== frozenDeclarationObjectSha256
        || claim.globalLaunchOrdinal !== 1 || claim.state !== 'claimed-before-spawn'
        || Number.isNaN(Date.parse(claim.claimedAt))
        || new Date(claim.claimedAt).toISOString() !== claim.claimedAt) {
        fail('INVALID_GLOBAL_LAUNCH_CLAIM', 'Global launch claim differs from the frozen attempt')
    }
    return claim
}

function computeEvidenceBundleId(bundle) {
    const { integrity, evidenceBundleId: ignored, ...payload } = bundle
    return canonicalSha256({
        schema: EVIDENCE_BUNDLE_ID_SCHEMA,
        executionAttemptId: bundle?.cohort?.executionAttemptId,
        evidence: payload,
    })
}

function classifyMaterialDistinctness({
    materialInputKey,
    acceptedEntries = [],
    requestedMateriallyDistinct,
    requestedRepeatedPerformanceTrial,
}) {
    validateSha(materialInputKey, 'material classification key')
    const sameInputCohortFound = acceptedEntries.some((entry) => entry.accepted === true
        && entry.productionEligible === true
        && entry.materialInputKey === materialInputKey)
    if (sameInputCohortFound && requestedMateriallyDistinct) {
        fail('SAME_INPUT_NOT_MATERIALLY_DISTINCT', 'An accepted identical material input cannot be counted as another materially distinct cohort')
    }
    if (!sameInputCohortFound && requestedRepeatedPerformanceTrial) {
        fail('REPEAT_WITHOUT_ACCEPTED_INPUT', 'A repeated trial requires an accepted identical material input')
    }
    return {
        sameInputCohortFound,
        materiallyDistinct: !sameInputCohortFound && requestedMateriallyDistinct === true,
        repeatedPerformanceTrial: sameInputCohortFound && requestedRepeatedPerformanceTrial === true,
    }
}

module.exports = {
    COHORT_IDENTITY_SCHEMA,
    EVIDENCE_BUNDLE_ID_SCHEMA,
    EXECUTION_ATTEMPT_SCHEMA,
    FROZEN_DECLARATION_REF_SCHEMA,
    FROZEN_DECLARATION_SCHEMA,
    GLOBAL_LAUNCH_CLAIM_SCHEMA,
    MATERIAL_INPUT_IDENTITY_SCHEMA,
    OperatingCohortIdentityError,
    buildCohortIdentity,
    buildFrozenCohortDeclaration,
    buildMaterialInputIdentity,
    buildVerificationIdentities,
    canonicalSha256,
    claimGlobalLaunch,
    classifyMaterialDistinctness,
    computeEvidenceBundleId,
    createExecutionAttempt,
    globalLaunchClaimPath,
    loadOperatingEnvironmentForAttempt,
    localIsolationContract,
    operatingCohortBinding,
    operatingEnvironmentRefPath,
    publishFrozenCohortDeclaration,
    publishOperatingEnvironmentForAttempt,
    scheduleHistoryContract,
    validateFrozenCohortDeclaration,
    validateGlobalLaunchClaim,
    validateOperatingCohortBinding,
}
