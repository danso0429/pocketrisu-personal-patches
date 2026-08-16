'use strict'

const fs = require('node:fs')
const path = require('node:path')
const {
    sha256,
} = require('./verification-evidence.cjs')
const {
    RECEIPT_DISPOSITIONS,
    canonicalJson,
    evaluateExecutionReceipt,
    sealDocument,
    verifyDocumentIntegrity,
    computeGlobalRunId,
} = require('./verification-receipts.cjs')
const {
    validateC0Decision,
} = require('./c0-policy.cjs')
const {
    evidenceObjectBytes,
    objectSha256: evidenceObjectSha256,
} = require('./c0-retention.cjs')
const {
    COHORT_IDENTITY_SCHEMA: OPERATING_COHORT_IDENTITY_SCHEMA,
    LEGACY_COHORT_IDENTITY_SCHEMA: LEGACY_OPERATING_COHORT_IDENTITY_SCHEMA,
    computeEvidenceBundleId,
    validateFrozenCohortDeclaration,
    validateGlobalLaunchClaim,
} = require('./operating-cohort-identity.cjs')
const { validateLocalShadowReceipt } = require('./toolchain-shadow-local.cjs')
const { validateOperatingGateEvidence } = require('./operating-cohort-gates.cjs')

const C0_EVIDENCE_SCHEMA = 'patch-c0-evidence-bundle-v1'
const C0_EVIDENCE_SCHEMA_V2 = 'patch-c0-evidence-bundle-v2'
const C0_COHORT_IDENTITY_SCHEMA = 'patch-c0-cohort-identity-v1'
const RESOURCE_MEASUREMENT_SCHEMA = 'patch-c0-resource-measurement-v1'
const RUN_KINDS = Object.freeze(['production-c0', 'synthetic-known-answer'])
const COHORT_CLASSES = Object.freeze(['stable-release', 'patch', 'relation', 'core', 'audit'])
const GATE_RESULTS = Object.freeze(['passed', 'failed', 'incomplete', 'not-run', 'not-applicable'])
const SHA256_PATTERN = /^[0-9a-f]{64}$/
const COMMIT_PATTERN = /^[0-9a-f]{40}$/
const OPERATING_COHORT_IDENTITY_SCHEMAS = Object.freeze([
    LEGACY_OPERATING_COHORT_IDENTITY_SCHEMA,
    OPERATING_COHORT_IDENTITY_SCHEMA,
])

function canonicalSha256(value) {
    return sha256(canonicalJson(value))
}

function validCanonicalTimestamp(value) {
    return typeof value === 'string'
        && !Number.isNaN(Date.parse(value))
        && new Date(value).toISOString() === value
}

function exactKeys(value, expected, label, errors) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        errors.push(`${label} is missing or is not an object`)
        return false
    }
    const actual = Object.keys(value).sort()
    const wanted = [...expected].sort()
    if (canonicalJson(actual) !== canonicalJson(wanted)) {
        errors.push(`${label} fields are missing or contain unknown fields`)
        return false
    }
    return true
}

function validateSha256(value, label, errors) {
    if (!SHA256_PATTERN.test(value ?? '')) errors.push(`${label} is not a SHA-256 digest`)
}

function validateNonnegativeNumber(value, label, errors, { integer = false } = {}) {
    if (!Number.isFinite(value) || value < 0 || (integer && !Number.isSafeInteger(value))) {
        errors.push(`${label} is not a nonnegative ${integer ? 'integer' : 'number'}`)
    }
}

function withoutRunIdAndIntegrity(bundle) {
    const { integrity, ...payload } = bundle
    return {
        ...payload,
        cohort: {
            ...payload.cohort,
            runId: null,
        },
    }
}

function computeCohortId(identity) {
    return canonicalSha256(identity)
}

function computeRunId(bundle) {
    return canonicalSha256(withoutRunIdAndIntegrity(bundle))
}

function finalizeEvidenceBundle(draft) {
    const cohortId = computeCohortId(draft.cohort.identity)
    const withCohort = {
        ...draft,
        cohort: {
            ...draft.cohort,
            cohortId,
            runId: null,
        },
    }
    const runId = computeRunId(withCohort)
    return sealDocument({
        ...withCohort,
        cohort: {
            ...withCohort.cohort,
            runId,
        },
    })
}

function finalizeOperatingEvidenceBundle(draft) {
    const withId = { ...draft, evidenceBundleId: null }
    const evidenceBundleId = computeEvidenceBundleId(withId)
    return sealDocument({ ...withId, evidenceBundleId })
}

function expectedCohortIdentity(authority) {
    return {
        governanceCommit: authority.governance.commit,
        implementationCommit: authority.implementation.commit,
        implementationStatusSha256: authority.implementation.statusSha256,
        policySha256: authority.policy.sha256,
        catalogSha256: authority.catalog.rootSha256,
        schemasSha256: authority.schemas.rootSha256,
        targetBeforeSha256: authority.target.beforeSha256,
        runtimeSemanticSha256: authority.environment.semanticSha256,
        commandSha256: authority.command.sha256,
        workerHistorySha256: authority.workerSchedule.sha256,
        cacheHistorySha256: authority.cacheHistory.sha256,
        operatingRouteSha256: authority.operatingRoute.sha256,
    }
}

function validateCohort(bundle, errors) {
    const cohort = bundle.cohort
    if (!exactKeys(cohort, [
        'identitySchema',
        'cohortId',
        'runId',
        'trialId',
        'cohortClass',
        'materiallyDistinct',
        'repeatedPerformanceTrial',
        'productionEligible',
        'syntheticMutation',
        'identity',
    ], 'cohort', errors)) return
    if (cohort.identitySchema !== C0_COHORT_IDENTITY_SCHEMA) {
        errors.push('cohort identity schema is missing or incompatible')
    }
    if (!COHORT_CLASSES.includes(cohort.cohortClass)) errors.push('unknown cohort class')
    for (const field of [
        'materiallyDistinct',
        'repeatedPerformanceTrial',
        'productionEligible',
        'syntheticMutation',
    ]) {
        if (typeof cohort[field] !== 'boolean') errors.push(`cohort ${field} is not boolean`)
    }
    if (typeof cohort.trialId !== 'string' || cohort.trialId.trim() === '') {
        errors.push('cohort trialId is missing')
    }
    if (bundle.runKind === 'production-c0') {
        if (cohort.productionEligible !== true) errors.push('production C0 run is not production eligible')
        if (cohort.syntheticMutation !== false) errors.push('synthetic mutation cannot be a production C0 run')
        if (cohort.materiallyDistinct === cohort.repeatedPerformanceTrial) {
            errors.push('production run must be either a materially distinct cohort or a repeated performance trial')
        }
    } else if (bundle.runKind === 'synthetic-known-answer') {
        if (cohort.productionEligible !== false) errors.push('synthetic known-answer run cannot be production eligible')
        if (cohort.materiallyDistinct !== false) errors.push('synthetic known-answer run cannot be a materially distinct cohort')
    }
    if (!exactKeys(cohort.identity, [
        'governanceCommit',
        'implementationCommit',
        'implementationStatusSha256',
        'policySha256',
        'catalogSha256',
        'schemasSha256',
        'targetBeforeSha256',
        'runtimeSemanticSha256',
        'commandSha256',
        'workerHistorySha256',
        'cacheHistorySha256',
        'operatingRouteSha256',
    ], 'cohort identity', errors)) return
    if (!COMMIT_PATTERN.test(cohort.identity.governanceCommit ?? '')) {
        errors.push('cohort governance commit is invalid')
    }
    if (!COMMIT_PATTERN.test(cohort.identity.implementationCommit ?? '')) {
        errors.push('cohort implementation commit is invalid')
    }
    for (const field of Object.keys(cohort.identity).filter((field) => field.endsWith('Sha256'))) {
        validateSha256(cohort.identity[field], `cohort identity ${field}`, errors)
    }
    try {
        if (canonicalJson(cohort.identity) !== canonicalJson(expectedCohortIdentity(bundle.authority))) {
            errors.push('cohort identity differs from bound authority')
        }
    } catch (error) {
        errors.push(`cohort authority identity cannot be canonicalized: ${error.message}`)
    }
    if (cohort.cohortId !== computeCohortId(cohort.identity)) errors.push('cohortId mismatch')
    if (cohort.runId !== computeRunId(bundle)) errors.push('runId mismatch')
}

function validateAuthority(bundle, receipt, errors) {
    const authority = bundle.authority
    if (!exactKeys(authority, [
        'governance',
        'implementation',
        'policy',
        'catalog',
        'schemas',
        'target',
        'environment',
        'command',
        'workerSchedule',
        'cacheHistory',
        'operatingRoute',
    ], 'authority', errors)) return

    if (!exactKeys(authority.governance, ['repository', 'commit', 'statusVersion'], 'governance authority', errors)) return
    if (typeof authority.governance.repository !== 'string' || authority.governance.repository === '') {
        errors.push('governance repository is missing')
    }
    if (!COMMIT_PATTERN.test(authority.governance.commit ?? '')) errors.push('governance commit is invalid')
    if (!Number.isSafeInteger(authority.governance.statusVersion) || authority.governance.statusVersion < 1) {
        errors.push('governance status version is invalid')
    }

    if (!exactKeys(authority.implementation, [
        'repository',
        'commit',
        'branch',
        'statusSha256',
        'stagedDiffSha256',
        'unstagedDiffSha256',
    ], 'implementation authority', errors)) return
    if (!COMMIT_PATTERN.test(authority.implementation.commit ?? '')) errors.push('implementation commit is invalid')
    for (const field of ['statusSha256', 'stagedDiffSha256', 'unstagedDiffSha256']) {
        validateSha256(authority.implementation[field], `implementation ${field}`, errors)
    }

    if (!exactKeys(authority.policy, ['path', 'sha256'], 'policy authority', errors)) return
    validateSha256(authority.policy.sha256, 'policy hash', errors)
    if (!exactKeys(authority.catalog, ['rootSha256'], 'catalog authority', errors)) return
    validateSha256(authority.catalog.rootSha256, 'catalog root', errors)

    if (!exactKeys(authority.schemas, ['rootSha256', 'files'], 'schema authority', errors)) return
    if (!Array.isArray(authority.schemas.files) || authority.schemas.files.length === 0) {
        errors.push('schema authority file list is empty')
    } else {
        const paths = []
        for (const [index, file] of authority.schemas.files.entries()) {
            if (!exactKeys(file, ['path', 'sha256'], `schema authority file ${index}`, errors)) continue
            if (typeof file.path !== 'string' || file.path === '') errors.push(`schema authority file ${index} path is missing`)
            validateSha256(file.sha256, `schema authority file ${index} hash`, errors)
            paths.push(file.path)
        }
        if (new Set(paths).size !== paths.length || canonicalJson(paths) !== canonicalJson([...paths].sort())) {
            errors.push('schema authority files are not sorted and unique')
        }
        if (authority.schemas.rootSha256 !== canonicalSha256(authority.schemas.files)) {
            errors.push('schema authority root mismatch')
        }
    }

    if (!exactKeys(authority.target, [
        'commit',
        'beforeSha256',
        'afterSha256',
        'applicationBeforeSha256',
        'applicationAfterSha256',
    ], 'target authority', errors)) return
    if (!COMMIT_PATTERN.test(authority.target.commit ?? '')) errors.push('target commit is invalid')
    for (const field of ['beforeSha256', 'afterSha256', 'applicationBeforeSha256', 'applicationAfterSha256']) {
        validateSha256(authority.target[field], `target ${field}`, errors)
    }
    if (authority.target.beforeSha256 !== canonicalSha256(receipt?.before?.target)) {
        errors.push('target before hash differs from Global receipt')
    }
    if (authority.target.afterSha256 !== canonicalSha256(receipt?.after?.target)) {
        errors.push('target after hash differs from Global receipt')
    }
    if (authority.target.applicationBeforeSha256 !== receipt?.before?.target?.applicationTree?.rootSha256) {
        errors.push('target application before root differs from Global receipt')
    }
    if (authority.target.applicationAfterSha256 !== receipt?.after?.target?.applicationTree?.rootSha256) {
        errors.push('target application after root differs from Global receipt')
    }

    if (!exactKeys(authority.environment, ['beforeSha256', 'afterSha256', 'semanticSha256'], 'environment authority', errors)) return
    if (authority.environment.beforeSha256 !== canonicalSha256(receipt?.runtime?.before)) {
        errors.push('environment before hash differs from Global receipt')
    }
    if (authority.environment.afterSha256 !== canonicalSha256(receipt?.runtime?.after)) {
        errors.push('environment after hash differs from Global receipt')
    }
    validateSha256(authority.environment.semanticSha256, 'environment semantic hash', errors)

    if (!exactKeys(authority.command, ['argv', 'sha256'], 'command authority', errors)) return
    if (!Array.isArray(authority.command.argv) || authority.command.argv.some((value) => typeof value !== 'string')) {
        errors.push('command argv is invalid')
    } else {
        if (canonicalJson(authority.command.argv) !== canonicalJson(receipt?.command)) {
            errors.push('command argv differs from Global receipt')
        }
        if (authority.command.sha256 !== canonicalSha256(authority.command.argv)) {
            errors.push('command hash mismatch')
        }
    }

    if (!exactKeys(authority.workerSchedule, [
        'schedule',
        'workers',
        'orderedMasksSha256',
        'historyMode',
        'sha256',
    ], 'worker schedule authority', errors)) return
    const workerHistory = receipt?.verifierResult?.workerHistory
    const expectedSchedule = workerHistory?.schedule ?? 'stride-v1'
    const expectedWorkers = receipt?.verifierResult?.workers
        ?? receipt?.options?.jobs
        ?? receipt?.runtime?.before?.values?.availableParallelism
    const expectedOrderedMasks = workerHistory?.workers ?? []
    if (authority.workerSchedule.schedule !== expectedSchedule) errors.push('worker schedule differs from Global receipt or requested canonical schedule')
    if (authority.workerSchedule.workers !== expectedWorkers) errors.push('worker count differs from Global receipt or command options')
    if (authority.workerSchedule.orderedMasksSha256 !== canonicalSha256(expectedOrderedMasks)) {
        errors.push('ordered worker mask hash differs from Global receipt')
    }
    const { sha256: workerSha256, ...workerPayload } = authority.workerSchedule
    if (workerSha256 !== canonicalSha256(workerPayload)) errors.push('worker schedule authority hash mismatch')

    if (!exactKeys(authority.cacheHistory, [
        'cacheMode',
        'moduleHistoryMode',
        'unmanagedHistoryMode',
        'sha256',
    ], 'cache/history authority', errors)) return
    const { sha256: cacheSha256, ...cachePayload } = authority.cacheHistory
    if (cacheSha256 !== canonicalSha256(cachePayload)) errors.push('cache/history authority hash mismatch')

    if (!exactKeys(authority.operatingRoute, [
        'routeId', 'materialDeclarationSha256', 'decisionSha256',
        'globalExecutionsExpected', 'candidateShadowExpected', 'sha256',
    ], 'operating route authority', errors)) return
    const { sha256: routeSha256, ...routePayload } = authority.operatingRoute
    if (routeSha256 !== canonicalSha256(routePayload)) errors.push('operating route authority hash mismatch')
    if (authority.operatingRoute.routeId === null) {
        if (!(bundle.runKind === 'synthetic-known-answer' || bundle.cohort?.repeatedPerformanceTrial === true)
            || authority.operatingRoute.materialDeclarationSha256 !== null
            || authority.operatingRoute.decisionSha256 !== null
            || authority.operatingRoute.globalExecutionsExpected !== 1
            || authority.operatingRoute.candidateShadowExpected !== false) {
            errors.push('non-operating route authority is invalid')
        }
    } else {
        if (!['material-c0-global', 'material-c0-global-plus-toolchain-shadow'].includes(authority.operatingRoute.routeId)) {
            errors.push('operating route ID is invalid')
        }
        validateSha256(authority.operatingRoute.materialDeclarationSha256, 'material declaration hash', errors)
        validateSha256(authority.operatingRoute.decisionSha256, 'route decision hash', errors)
        if (authority.operatingRoute.globalExecutionsExpected !== 1
            || authority.operatingRoute.candidateShadowExpected
                !== (authority.operatingRoute.routeId === 'material-c0-global-plus-toolchain-shadow')) {
            errors.push('operating route execution counts are invalid')
        }
    }
}

function validateGate(gate, label, errors) {
    if (!exactKeys(gate, ['name', 'result', 'receiptObjectSha256', 'detailsSha256'], label, errors)) return
    if (typeof gate.name !== 'string' || gate.name === '') errors.push(`${label} name is missing`)
    if (!GATE_RESULTS.includes(gate.result)) errors.push(`${label} result is invalid`)
    for (const field of ['receiptObjectSha256', 'detailsSha256']) {
        if (gate[field] !== null) validateSha256(gate[field], `${label} ${field}`, errors)
    }
}

function validateGates(bundle, errors) {
    const gates = bundle.gates
    if (!exactKeys(gates, ['focused', 'global', 'product'], 'gates', errors)) return
    if (!Array.isArray(gates.focused)) errors.push('focused gates are not an array')
    else gates.focused.forEach((gate, index) => validateGate(gate, `focused gate ${index}`, errors))
    if (!Array.isArray(gates.product)) errors.push('product gates are not an array')
    else gates.product.forEach((gate, index) => validateGate(gate, `product gate ${index}`, errors))
    validateGate(gates.global, 'Global gate', errors)
    if (gates.global?.name !== 'Global Exhaustive') errors.push('Global gate has the wrong identity')
    if (gates.global?.receiptObjectSha256 !== bundle.globalReceipt?.objectSha256) {
        errors.push('Global gate does not reference the bound Global receipt')
    }
}

function globalCoverageComplete(receipt) {
    const result = receipt?.verifierResult
    if (!Array.isArray(result?.visiblePacks)) return false
    const expected = 2 ** result.visiblePacks.length
    if (
        !Number.isSafeInteger(result.rawSelections)
        || result.rawSelections !== expected
        || result.verifiedSelections !== expected
        || !Array.isArray(result?.workerHistory?.workers)
    ) return false
    const masks = result.workerHistory.workers.flatMap((worker) => worker?.orderedMasks ?? [])
    return masks.length === expected
        && new Set(masks).size === expected
        && masks.every((mask) => Number.isSafeInteger(mask) && mask >= 0 && mask < expected)
}

const C0_SCHEMA_FILES = Object.freeze([
    'schemas/patch-c0-cohort-ledger-v1.schema.json',
    'schemas/patch-c0-cohort-ledger-v2.schema.json',
    'schemas/patch-c0-defect-yield-summary-v1.schema.json',
    'schemas/patch-c0-evidence-bundle-v1.schema.json',
    'schemas/patch-c0-evidence-bundle-v2.schema.json',
    'schemas/patch-c0-incident-record-v1.schema.json',
    'schemas/patch-c0-incident-record-v2.schema.json',
    'schemas/patch-c0-retention-plan-v1.schema.json',
    'schemas/patch-c0-review-trigger-v1.schema.json',
    'schemas/patch-c0-stable-release-ledger-v1.schema.json',
    'schemas/patch-c0-stable-release-ledger-v2.schema.json',
    'schemas/patch-operating-build-boundary-failure-v1.schema.json',
    'schemas/patch-operating-build-environment-binding-v1.schema.json',
    'schemas/patch-operating-build-environment-provisioning-v1.schema.json',
    'schemas/patch-operating-cohort-frozen-declaration-v1.schema.json',
    'schemas/patch-operating-cohort-gate-evidence-v1.schema.json',
    'schemas/patch-operating-cohort-material-declaration-v1.schema.json',
    'schemas/patch-operating-cohort-route-decision-v1.schema.json',
    'schemas/patch-operating-global-launch-claim-v1.schema.json',
    'schemas/patch-toolchain-shadow-operating-linkage-v1.schema.json',
    'schemas/patch-toolchain-shadow-operating-linkage-v2.schema.json',
    'schemas/patch-toolchain-shadow-operating-sample-ledger-v1.schema.json',
])

function schemaAuthority(sourceRoot) {
    const files = C0_SCHEMA_FILES.map((relative) => ({
        path: relative,
        sha256: sha256(fs.readFileSync(path.join(sourceRoot, relative))),
    }))
    return {
        rootSha256: canonicalSha256(files),
        files,
    }
}

function runtimeSemanticIdentity(envelope) {
    const values = {}
    for (const [field, definition] of Object.entries(envelope?.fieldPolicy ?? {})) {
        if (!['semantic', 'compatibility-critical'].includes(definition?.classification)) continue
        values[field] = envelope?.values?.[field]
    }
    return {
        schema: 'patch-c0-runtime-semantic-identity-v1',
        values,
    }
}

function workerScheduleAuthority(receipt) {
    const workerHistory = receipt?.verifierResult?.workerHistory
    const payload = {
        schedule: workerHistory?.schedule ?? 'stride-v1',
        workers: receipt?.verifierResult?.workers
            ?? receipt?.options?.jobs
            ?? receipt?.runtime?.before?.values?.availableParallelism,
        orderedMasksSha256: canonicalSha256(workerHistory?.workers ?? []),
        historyMode: 'persistent-per-worker-v1',
    }
    return { ...payload, sha256: canonicalSha256(payload) }
}

function cacheHistoryAuthority() {
    const payload = {
        cacheMode: 'enabled-shared-per-worker-v1',
        moduleHistoryMode: 'persistent-per-worker-v1',
        unmanagedHistoryMode: 'persistent-per-worker-v1',
    }
    return { ...payload, sha256: canonicalSha256(payload) }
}

function buildAuthority({
    sourceRoot,
    globalReceipt,
    governanceRepository,
    governanceCommit,
    governanceStatusVersion,
    implementationRepository,
    operatingRoute,
}) {
    const before = globalReceipt.before
    const after = globalReceipt.after
    const command = globalReceipt.command
    const semanticIdentity = runtimeSemanticIdentity(globalReceipt.runtime.before)
    const routePayload = operatingRoute === null ? {
        routeId: null,
        materialDeclarationSha256: null,
        decisionSha256: null,
        globalExecutionsExpected: 1,
        candidateShadowExpected: false,
    } : operatingRoute
    const authority = {
        governance: {
            repository: governanceRepository,
            commit: governanceCommit,
            statusVersion: governanceStatusVersion,
        },
        implementation: {
            repository: implementationRepository,
            commit: before.source.git.commit,
            branch: before.source.git.branch,
            statusSha256: sha256(before.source.git.status),
            stagedDiffSha256: before.source.git.stagedDiffSha256,
            unstagedDiffSha256: before.source.git.unstagedDiffSha256,
        },
        policy: {
            path: 'docs/patch-combination-verification-instructions.md',
            sha256: before.source.policy.sha256,
        },
        catalog: { rootSha256: before.source.catalog.rootSha256 },
        schemas: schemaAuthority(sourceRoot),
        target: {
            commit: before.target.provenance.commit,
            beforeSha256: canonicalSha256(before.target),
            afterSha256: canonicalSha256(after.target),
            applicationBeforeSha256: before.target.applicationTree.rootSha256,
            applicationAfterSha256: after.target.applicationTree.rootSha256,
        },
        environment: {
            beforeSha256: canonicalSha256(globalReceipt.runtime.before),
            afterSha256: canonicalSha256(globalReceipt.runtime.after),
            semanticSha256: canonicalSha256(semanticIdentity),
        },
        command: { argv: command, sha256: canonicalSha256(command) },
        workerSchedule: workerScheduleAuthority(globalReceipt),
        cacheHistory: cacheHistoryAuthority(),
        operatingRoute: { ...routePayload, sha256: canonicalSha256(routePayload) },
    }
    return authority
}

function buildCorrectness(globalReceipt) {
    const evaluation = evaluateExecutionReceipt(globalReceipt)
    const coverageComplete = globalCoverageComplete(globalReceipt)
    const targetIntegrity = globalReceipt?.stability?.targetMatched === true
    const receiptIntegrity = evaluation.receiptValid
    const c0GlobalMatch = globalReceipt?.verificationKind === 'global-exhaustive'
    const missingOutput = (globalReceipt?.execution?.stdoutBytes ?? 0) === 0
    const spawnError = globalReceipt?.execution?.spawnError === null
        ? null
        : String(globalReceipt?.execution?.spawnError?.code
            ?? globalReceipt?.execution?.spawnError?.message
            ?? 'spawn-error')
    const signal = globalReceipt?.execution?.signal ?? null
    const reportedFailures = Array.isArray(globalReceipt?.verifierResult?.failures)
        ? globalReceipt.verifierResult.failures.length
        : 0
    const passed = evaluation.executionAccepted
        && coverageComplete
        && targetIntegrity
        && receiptIntegrity
        && c0GlobalMatch
        && !missingOutput
        && spawnError === null
        && signal === null
        && reportedFailures === 0
    return {
        status: passed ? 'passed' : (evaluation.receiptValid ? 'failed' : 'incomplete'),
        coverageComplete,
        targetIntegrity,
        receiptIntegrity,
        c0GlobalMatch,
        missingOutput,
        spawnError,
        signal,
        reportedFailures,
        errors: [
            ...evaluation.structuralErrors.map((error) => `receipt-structure: ${error}`),
            ...evaluation.acceptanceErrors.map((error) => `receipt-acceptance: ${error}`),
        ],
    }
}

function operatingBinding(frozenDeclaration, frozenDeclarationObjectSha256) {
    return {
        materialInputKey: frozenDeclaration.materialInputKey,
        cohortId: frozenDeclaration.cohortId,
        executionAttemptId: frozenDeclaration.executionAttemptId,
        frozenDeclarationSha256: frozenDeclarationObjectSha256,
    }
}

function buildOperatingEvidenceBundle({
    sourceRoot,
    globalReceipt,
    localReceipt,
    localReceiptObjectSha256,
    localFailure,
    localFailureObjectSha256,
    frozenDeclaration,
    frozenDeclarationObjectSha256,
    resources,
    governanceRepository,
    governanceCommit,
    governanceStatusVersion,
    implementationRepository,
    runKind,
    cohortClass,
    trialId,
    syntheticMutation,
    focusedGates,
    productGates,
    gateEvidence,
    globalLaunchClaimObjectSha256,
    c0Decision,
    referencedObjectsNewPhysicalBytes,
    operatingRoute,
    recordedAt,
}) {
    validateFrozenCohortDeclaration(frozenDeclaration)
    if (evidenceObjectSha256(frozenDeclaration) !== frozenDeclarationObjectSha256) {
        throw new Error('Frozen declaration object identity mismatch')
    }
    const binding = operatingBinding(frozenDeclaration, frozenDeclarationObjectSha256)
    const combined = operatingRoute?.candidateShadowExpected === true
    if (!gateEvidence || !/^[0-9a-f]{64}$/.test(gateEvidence.focused?.objectSha256 ?? '')
        || !/^[0-9a-f]{64}$/.test(gateEvidence.focused?.payloadSha256 ?? '')
        || !/^[0-9a-f]{64}$/.test(gateEvidence.product?.objectSha256 ?? '')
        || !/^[0-9a-f]{64}$/.test(gateEvidence.product?.payloadSha256 ?? '')) {
        throw new Error('Operating gate evidence does not bind the frozen attempt')
    }
    if (!/^[0-9a-f]{64}$/.test(globalLaunchClaimObjectSha256 ?? '')) {
        throw new Error('Operating evidence lacks its durable Global launch claim')
    }
    if (canonicalJson(globalReceipt?.options?.operatingRoute?.operatingCohort) !== canonicalJson(binding)
        || !/^[0-9a-f]{64}$/.test(globalReceipt?.globalRunId ?? '')
        || computeGlobalRunId(globalReceipt) !== globalReceipt.globalRunId
        || (combined && ((localReceipt === null) === (localFailure === null)
            || (localReceipt !== null && (canonicalJson(localReceipt.operatingCohort) !== canonicalJson(binding)
                || !/^[0-9a-f]{64}$/.test(localReceipt.localRunId ?? '')
                || localReceipt.declarationSha256 !== frozenDeclaration.candidate.compiledDeclarationSha256
                || localReceipt.target?.commit !== frozenDeclaration.target.commit
                || localReceipt.target?.applicationTreeSha256 !== frozenDeclaration.target.applicationTreeSha256
                || !/^[0-9a-f]{64}$/.test(localReceiptObjectSha256 ?? '')))
            || (localFailure !== null && (canonicalJson(localFailure.operatingCohort) !== canonicalJson(binding)
                || !/^[0-9a-f]{64}$/.test(localFailureObjectSha256 ?? '')))))
        || (!combined && (localReceipt !== null || localReceiptObjectSha256 !== null
            || localFailure !== null || localFailureObjectSha256 !== null))) {
        throw new Error('Execution receipts do not bind the exact frozen cohort attempt')
    }
    const authority = buildAuthority({
        sourceRoot,
        globalReceipt,
        governanceRepository,
        governanceCommit,
        governanceStatusVersion,
        implementationRepository,
        operatingRoute,
    })
    const correctness = buildCorrectness(globalReceipt)
    const receiptEncoded = evidenceObjectBytes(globalReceipt)
    const receiptObjectSha256 = evidenceObjectSha256(globalReceipt)
    const productionEligible = runKind === 'production-c0'
    const effectiveDisposition = correctness.status === 'passed'
        ? globalReceipt.disposition
        : (globalReceipt.disposition === 'current-active'
            ? (correctness.status === 'incomplete' ? 'incomplete' : 'defect-reproduction')
            : globalReceipt.disposition)
    const comparison = globalReceipt.verifierResult?.toolchainShadowComparison
    return finalizeOperatingEvidenceBundle({
        schema: C0_EVIDENCE_SCHEMA_V2,
        evidenceBundleId: null,
        disposition: effectiveDisposition,
        runKind,
        recordedAt,
        frozenDeclarationObjectSha256,
        frozenDeclaration: structuredClone(frozenDeclaration),
        cohort: {
            identitySchema: OPERATING_COHORT_IDENTITY_SCHEMA,
            materialInputKey: frozenDeclaration.materialInputKey,
            cohortId: frozenDeclaration.cohortId,
            executionAttemptId: frozenDeclaration.executionAttemptId,
            trialId,
            cohortClass,
            materiallyDistinct: frozenDeclaration.materialClassification.materiallyDistinct,
            repeatedPerformanceTrial: frozenDeclaration.materialClassification.repeatedPerformanceTrial,
            productionEligible,
            syntheticMutation,
            identity: structuredClone(frozenDeclaration.cohortIdentity),
        },
        authority,
        c0Decision,
        globalReceipt: {
            objectSha256: receiptObjectSha256,
            bytes: receiptEncoded.length,
            payloadSha256: globalReceipt.integrity.payloadSha256,
            globalRunId: globalReceipt.globalRunId,
            accepted: globalReceipt.accepted,
            disposition: globalReceipt.disposition,
        },
        attemptEvidence: {
            localEvidenceKind: combined ? (localReceipt === null ? 'failure' : 'receipt') : 'none',
            localEvidenceObjectSha256: localReceiptObjectSha256 ?? localFailureObjectSha256 ?? null,
            localEvidencePayloadSha256: localReceipt?.integrity?.payloadSha256
                ?? localFailure?.integrity?.payloadSha256 ?? null,
            localRunId: localReceipt?.localRunId ?? null,
            globalReceiptObjectSha256: receiptObjectSha256,
            globalReceiptPayloadSha256: globalReceipt.integrity.payloadSha256,
            globalRunId: globalReceipt.globalRunId,
            globalLaunchClaimObjectSha256,
            sameGlobalStatus: combined
                ? (localFailure === null ? (comparison?.status ?? 'failed') : 'failed-local')
                : 'not-applicable',
            differentialUnexpectedMismatches: combined ? (comparison?.mismatches ?? null) : null,
        },
        gateEvidence: structuredClone(gateEvidence),
        gates: {
            focused: focusedGates,
            global: {
                name: 'Global Exhaustive',
                result: correctness.status === 'passed' ? 'passed' : 'failed',
                receiptObjectSha256,
                detailsSha256: null,
            },
            product: productGates,
        },
        correctness,
        resources: {
            ...resources,
            evidenceStorage: {
                receiptBytes: receiptEncoded.length,
                referencedObjectsNewPhysicalBytes,
            },
        },
        canonicalProtection: {
            canonicalGate: 'Global Exhaustive',
            globalFallbackRetained: true,
            defaultChanged: false,
            productionCertificates: 0,
            canonicalMasksSkipped: 0,
            productionStateMigration: false,
            c1Authorized: false,
        },
    })
}

function buildEvidenceBundle({
    sourceRoot,
    globalReceipt,
    resources,
    governanceRepository,
    governanceCommit,
    governanceStatusVersion,
    implementationRepository,
    runKind,
    cohortClass,
    trialId,
    materiallyDistinct,
    repeatedPerformanceTrial,
    syntheticMutation = false,
    focusedGates = [],
    productGates = [],
    gateEvidence = null,
    globalLaunchClaimObjectSha256 = null,
    c0Decision,
    referencedObjectsNewPhysicalBytes = 0,
    operatingRoute = null,
    frozenDeclaration = null,
    frozenDeclarationObjectSha256 = null,
    localReceipt = null,
    localReceiptObjectSha256 = null,
    localFailure = null,
    localFailureObjectSha256 = null,
    recordedAt = new Date().toISOString(),
}) {
    if (frozenDeclaration !== null) {
        return buildOperatingEvidenceBundle({
            sourceRoot, globalReceipt, localReceipt, localReceiptObjectSha256,
            localFailure, localFailureObjectSha256,
            frozenDeclaration, frozenDeclarationObjectSha256, resources,
            governanceRepository, governanceCommit, governanceStatusVersion,
            implementationRepository, runKind, cohortClass, trialId,
            syntheticMutation, focusedGates, productGates, gateEvidence,
            globalLaunchClaimObjectSha256, c0Decision,
            referencedObjectsNewPhysicalBytes, operatingRoute, recordedAt,
        })
    }
    const authority = buildAuthority({
        sourceRoot,
        globalReceipt,
        governanceRepository,
        governanceCommit,
        governanceStatusVersion,
        implementationRepository,
        operatingRoute,
    })
    const correctness = buildCorrectness(globalReceipt)
    const receiptEncoded = evidenceObjectBytes(globalReceipt)
    const receiptObjectSha256 = evidenceObjectSha256(globalReceipt)
    const productionEligible = runKind === 'production-c0'
    const effectiveDisposition = correctness.status === 'passed'
        ? globalReceipt.disposition
        : (globalReceipt.disposition === 'current-active'
            ? (correctness.status === 'incomplete' ? 'incomplete' : 'defect-reproduction')
            : globalReceipt.disposition)
    return finalizeEvidenceBundle({
        schema: C0_EVIDENCE_SCHEMA,
        disposition: effectiveDisposition,
        runKind,
        recordedAt,
        cohort: {
            identitySchema: C0_COHORT_IDENTITY_SCHEMA,
            cohortId: null,
            runId: null,
            trialId,
            cohortClass,
            materiallyDistinct,
            repeatedPerformanceTrial,
            productionEligible,
            syntheticMutation,
            identity: expectedCohortIdentity(authority),
        },
        authority,
        c0Decision,
        globalReceipt: {
            objectSha256: receiptObjectSha256,
            bytes: receiptEncoded.length,
            payloadSha256: globalReceipt.integrity.payloadSha256,
            accepted: globalReceipt.accepted,
            disposition: globalReceipt.disposition,
        },
        gates: {
            focused: focusedGates,
            global: {
                name: 'Global Exhaustive',
                result: correctness.status === 'passed' ? 'passed' : 'failed',
                receiptObjectSha256,
                detailsSha256: null,
            },
            product: productGates,
        },
        correctness,
        resources: {
            ...resources,
            evidenceStorage: {
                receiptBytes: receiptEncoded.length,
                referencedObjectsNewPhysicalBytes,
            },
        },
        canonicalProtection: {
            canonicalGate: 'Global Exhaustive',
            globalFallbackRetained: true,
            defaultChanged: false,
            productionCertificates: 0,
            canonicalMasksSkipped: 0,
            productionStateMigration: false,
            c1Authorized: false,
        },
    })
}

function validateCorrectness(bundle, receipt, receiptEvaluation, errors, acceptanceErrors) {
    const correctness = bundle.correctness
    if (!exactKeys(correctness, [
        'status',
        'coverageComplete',
        'targetIntegrity',
        'receiptIntegrity',
        'c0GlobalMatch',
        'missingOutput',
        'spawnError',
        'signal',
        'reportedFailures',
        'errors',
    ], 'correctness', errors)) return
    if (!['passed', 'failed', 'incomplete'].includes(correctness.status)) errors.push('correctness status is invalid')
    for (const field of ['coverageComplete', 'targetIntegrity', 'receiptIntegrity', 'c0GlobalMatch', 'missingOutput']) {
        if (typeof correctness[field] !== 'boolean') errors.push(`correctness ${field} is not boolean`)
    }
    if (!Array.isArray(correctness.errors) || correctness.errors.some((value) => typeof value !== 'string')) {
        errors.push('correctness errors are invalid')
    }
    validateNonnegativeNumber(correctness.reportedFailures, 'reported failures', errors, { integer: true })
    const expected = {
        coverageComplete: globalCoverageComplete(receipt),
        targetIntegrity: receipt?.stability?.targetMatched === true,
        receiptIntegrity: receiptEvaluation.receiptValid,
        c0GlobalMatch: bundle.c0Decision?.outcome === 'global-exhaustive-required'
            && bundle.c0Decision?.gate === 'Global Exhaustive'
            && receipt?.verificationKind === 'global-exhaustive',
        missingOutput: (receipt?.execution?.stdoutBytes ?? 0) === 0,
        spawnError: receipt?.execution?.spawnError === null
            ? null
            : String(receipt?.execution?.spawnError?.code ?? receipt?.execution?.spawnError?.message ?? 'spawn-error'),
        signal: receipt?.execution?.signal ?? null,
        reportedFailures: Array.isArray(receipt?.verifierResult?.failures)
            ? receipt.verifierResult.failures.length
            : 0,
    }
    for (const field of Object.keys(expected)) {
        if (correctness[field] !== expected[field]) errors.push(`recorded correctness ${field} contradicts Global receipt`)
    }
    const calculatedPassed = receiptEvaluation.executionAccepted
        && expected.coverageComplete
        && expected.targetIntegrity
        && expected.receiptIntegrity
        && expected.c0GlobalMatch
        && !expected.missingOutput
        && expected.spawnError === null
        && expected.signal === null
        && expected.reportedFailures === 0
    if ((correctness.status === 'passed') !== calculatedPassed) {
        errors.push('recorded correctness status contradicts Global receipt')
    }
    if (bundle.gates?.global?.result !== (calculatedPassed ? 'passed' : 'failed')) {
        errors.push('Global gate result contradicts Global receipt')
    }
    if (!calculatedPassed) acceptanceErrors.push('C0 Global evidence did not pass')
    if (correctness.status !== 'passed' && bundle.disposition === 'current-active') {
        errors.push('failed or incomplete evidence cannot use current-active disposition')
    }
}

function validateResources(bundle, receipt, errors) {
    const resources = bundle.resources
    if (!exactKeys(resources, [
        'measurementSchema',
        'wallMs',
        'cpu',
        'maximumRssKiB',
        'temporary',
        'evidenceStorage',
    ], 'resources', errors)) return
    if (resources.measurementSchema !== RESOURCE_MEASUREMENT_SCHEMA) errors.push('resource measurement schema is invalid')
    validateNonnegativeNumber(resources.wallMs, 'wall time', errors)
    if (exactKeys(resources.cpu, ['wrapperMs', 'childrenMs', 'totalMs'], 'CPU resources', errors)) {
        for (const field of ['wrapperMs', 'childrenMs', 'totalMs']) {
            validateNonnegativeNumber(resources.cpu[field], `CPU ${field}`, errors)
        }
        if (Math.abs(resources.cpu.totalMs - resources.cpu.wrapperMs - resources.cpu.childrenMs) > 0.001) {
            errors.push('total CPU does not equal wrapper plus child-inclusive CPU')
        }
    }
    validateNonnegativeNumber(resources.maximumRssKiB, 'maximum RSS', errors, { integer: true })
    if (exactKeys(resources.temporary, [
        'root',
        'baselineBytes',
        'sampledPeakBytes',
        'postRunResidueBytes',
        'sampleIntervalMs',
        'retained',
    ], 'temporary resources', errors)) {
        for (const field of ['baselineBytes', 'sampledPeakBytes', 'postRunResidueBytes', 'sampleIntervalMs']) {
            validateNonnegativeNumber(resources.temporary[field], `temporary ${field}`, errors, { integer: true })
        }
        if (resources.temporary.sampleIntervalMs < 10) errors.push('temporary sample interval is too small')
        if (resources.temporary.sampledPeakBytes < resources.temporary.baselineBytes
            || resources.temporary.sampledPeakBytes < resources.temporary.postRunResidueBytes) {
            errors.push('temporary sampled peak is below baseline or post-run residue')
        }
        if (typeof resources.temporary.retained !== 'boolean') errors.push('temporary retained flag is invalid')
    }
    if (exactKeys(resources.evidenceStorage, [
        'receiptBytes',
        'referencedObjectsNewPhysicalBytes',
    ], 'evidence storage resources', errors)) {
        validateNonnegativeNumber(resources.evidenceStorage.receiptBytes, 'receipt bytes', errors, { integer: true })
        validateNonnegativeNumber(resources.evidenceStorage.referencedObjectsNewPhysicalBytes, 'new physical evidence bytes', errors, { integer: true })
        const receiptBytes = evidenceObjectBytes(receipt).length
        if (resources.evidenceStorage.receiptBytes !== receiptBytes) errors.push('receipt byte measurement mismatch')
    }
}

function validateCanonicalProtection(bundle, errors) {
    const protection = bundle.canonicalProtection
    if (!exactKeys(protection, [
        'canonicalGate',
        'globalFallbackRetained',
        'defaultChanged',
        'productionCertificates',
        'canonicalMasksSkipped',
        'productionStateMigration',
        'c1Authorized',
    ], 'canonical protection', errors)) return
    const expected = {
        canonicalGate: 'Global Exhaustive',
        globalFallbackRetained: true,
        defaultChanged: false,
        productionCertificates: 0,
        canonicalMasksSkipped: 0,
        productionStateMigration: false,
        c1Authorized: false,
    }
    for (const [field, value] of Object.entries(expected)) {
        if (protection[field] !== value) errors.push(`canonical protection ${field} is weakened`)
    }
}

function validateOperatingCohort(bundle, receipt, localEvidence, globalLaunchClaim, errors, acceptanceErrors) {
    const cohort = bundle.cohort
    if (!exactKeys(cohort, [
        'identitySchema', 'materialInputKey', 'cohortId', 'executionAttemptId',
        'trialId', 'cohortClass', 'materiallyDistinct', 'repeatedPerformanceTrial',
        'productionEligible', 'syntheticMutation', 'identity',
    ], 'operating cohort', errors)) return
    if (!OPERATING_COHORT_IDENTITY_SCHEMAS.includes(cohort.identitySchema)) {
        errors.push('operating cohort identity schema is invalid')
    }
    for (const key of ['materialInputKey', 'cohortId', 'executionAttemptId']) {
        validateSha256(cohort[key], `operating cohort ${key}`, errors)
    }
    try {
        validateFrozenCohortDeclaration(bundle.frozenDeclaration)
    } catch (error) {
        errors.push(`frozen declaration is invalid: ${error.code ?? error.message}`)
        return
    }
    const frozen = bundle.frozenDeclaration
    if (bundle.frozenDeclarationObjectSha256 !== evidenceObjectSha256(frozen)) errors.push('frozen declaration object hash mismatch')
    if (cohort.materialInputKey !== frozen.materialInputKey
        || cohort.cohortId !== frozen.cohortId
        || cohort.executionAttemptId !== frozen.executionAttemptId
        || canonicalJson(cohort.identity) !== canonicalJson(frozen.cohortIdentity)
        || cohort.materiallyDistinct !== frozen.materialClassification.materiallyDistinct
        || cohort.repeatedPerformanceTrial !== frozen.materialClassification.repeatedPerformanceTrial) {
        errors.push('bundle cohort differs from the frozen declaration')
    }
    if (bundle.evidenceBundleId !== computeEvidenceBundleId(bundle)) errors.push('evidenceBundleId mismatch')
    const binding = operatingBinding(frozen, bundle.frozenDeclarationObjectSha256)
    if (canonicalJson(receipt?.options?.operatingRoute?.operatingCohort) !== canonicalJson(binding)
        || receipt?.globalRunId !== bundle.globalReceipt?.globalRunId
        || receipt?.globalRunId !== bundle.attemptEvidence?.globalRunId
        || computeGlobalRunId(receipt) !== receipt?.globalRunId) {
        errors.push('Global receipt differs from the frozen execution attempt')
    }
    const attempt = bundle.attemptEvidence
    if (!exactKeys(attempt, [
        'localEvidenceKind', 'localEvidenceObjectSha256', 'localEvidencePayloadSha256', 'localRunId',
        'globalReceiptObjectSha256', 'globalReceiptPayloadSha256', 'globalRunId',
        'globalLaunchClaimObjectSha256', 'sameGlobalStatus', 'differentialUnexpectedMismatches',
    ], 'attempt evidence', errors)) return
    for (const key of ['globalReceiptObjectSha256', 'globalReceiptPayloadSha256', 'globalRunId']) {
        validateSha256(attempt[key], `attempt evidence ${key}`, errors)
    }
    validateSha256(attempt.globalLaunchClaimObjectSha256, 'Global launch claim object', errors)
    try {
        validateGlobalLaunchClaim(globalLaunchClaim, frozen, bundle.frozenDeclarationObjectSha256)
        if (evidenceObjectSha256(globalLaunchClaim) !== attempt.globalLaunchClaimObjectSha256) {
            errors.push('Global launch claim object hash mismatch')
        }
    } catch (error) {
        errors.push(`Global launch claim is invalid: ${error.code ?? error.message}`)
    }
    const combined = frozen.route.routeId === 'material-c0-global-plus-toolchain-shadow'
    if (combined) {
        for (const key of ['localEvidenceObjectSha256', 'localEvidencePayloadSha256']) {
            validateSha256(attempt[key], `attempt evidence ${key}`, errors)
        }
        const comparison = receipt?.verifierResult?.toolchainShadowComparison
        if (attempt.localEvidenceKind === 'receipt') {
            validateSha256(attempt.localRunId, 'attempt evidence localRunId', errors)
            try { validateLocalShadowReceipt(localEvidence) } catch (error) {
                errors.push(`local receipt is invalid: ${error.code ?? error.message}`)
            }
            if (evidenceObjectSha256(localEvidence) !== attempt.localEvidenceObjectSha256
                || localEvidence?.integrity?.payloadSha256 !== attempt.localEvidencePayloadSha256
                || localEvidence?.localRunId !== attempt.localRunId
                || canonicalJson(localEvidence?.operatingCohort) !== canonicalJson(binding)
                || localEvidence?.declarationSha256 !== frozen.candidate.compiledDeclarationSha256
                || localEvidence?.target?.commit !== frozen.target.commit
                || localEvidence?.target?.applicationTreeSha256 !== frozen.target.applicationTreeSha256
                || attempt.sameGlobalStatus !== comparison?.status
                || attempt.differentialUnexpectedMismatches !== comparison?.mismatches
                || comparison?.materialInputKey !== frozen.materialInputKey
                || comparison?.cohortId !== frozen.cohortId
                || comparison?.executionAttemptId !== frozen.executionAttemptId
                || comparison?.frozenDeclarationSha256 !== bundle.frozenDeclarationObjectSha256
                || comparison?.localRunId !== attempt.localRunId) {
                errors.push('same-Global comparison differs from frozen attempt evidence')
            }
            if (attempt.sameGlobalStatus !== 'passed'
                || attempt.differentialUnexpectedMismatches !== 0) {
                acceptanceErrors.push('candidate same-Global differential did not pass')
            }
        } else if (attempt.localEvidenceKind === 'failure') {
            const buildBoundaryFailure = localEvidence?.code === 'BUILD_BOUNDARY_MISMATCH'
            if (!verifyDocumentIntegrity(localEvidence)
                || localEvidence?.schema !== 'patch-toolchain-shadow-local-failure-v1'
                || localEvidence?.status !== 'failed'
                || evidenceObjectSha256(localEvidence) !== attempt.localEvidenceObjectSha256
                || localEvidence?.integrity?.payloadSha256 !== attempt.localEvidencePayloadSha256
                || canonicalJson(localEvidence?.operatingCohort) !== canonicalJson(binding)
                || attempt.localRunId !== null || attempt.sameGlobalStatus !== 'failed-local'
                || attempt.differentialUnexpectedMismatches !== null || comparison !== undefined) {
                errors.push('local failure evidence differs from the frozen attempt')
            }
            if (buildBoundaryFailure && (
                localEvidence?.details?.expected === undefined
                || localEvidence?.details?.observed === undefined
                || localEvidence?.details?.comparison === undefined
                || typeof localEvidence?.details?.nodeExecutable !== 'string'
                || !SHA256_PATTERN.test(localEvidence?.details?.nodeExecutableSha256 ?? '')
                || typeof localEvidence?.details?.pnpmExecutable !== 'string'
                || !SHA256_PATTERN.test(localEvidence?.details?.pnpmExecutableSha256 ?? '')
                || localEvidence?.details?.resolution === undefined
                || !SHA256_PATTERN.test(
                    localEvidence?.details?.provisioningIdentity?.integrityPayloadSha256 ?? '',
                )
                || localEvidence?.executionState?.casesStarted !== 0
                || localEvidence?.executionState?.casesCompleted !== 0
                || localEvidence?.executionState?.globalLaunchClaim !== 'absent'
                || localEvidence?.executionState?.globalExecutions !== 0
            )) errors.push('local build-boundary failure diagnostics were not retained')
            acceptanceErrors.push('candidate local shadow failed')
        } else {
            errors.push('attempt local evidence kind is invalid')
        }
    } else if (localEvidence !== null || attempt.localEvidenceKind !== 'none'
        || attempt.localEvidenceObjectSha256 !== null
        || attempt.localEvidencePayloadSha256 !== null || attempt.localRunId !== null
        || attempt.sameGlobalStatus !== 'not-applicable'
        || attempt.differentialUnexpectedMismatches !== null) {
        errors.push('Global-only attempt contains local evidence')
    }
    const identity = frozen.cohortIdentity
    if (bundle.authority.governance.commit !== identity.authority.governance.commit
        || bundle.authority.governance.statusVersion !== identity.authority.governance.statusVersion
        || bundle.authority.policy.sha256 !== identity.authority.policySha256
        || bundle.authority.implementation.commit !== identity.verification.tooling.commit
        || bundle.authority.target.commit !== identity.target.commit
        || bundle.authority.target.applicationBeforeSha256 !== identity.target.applicationTreeSha256
        || bundle.authority.workerSchedule.schedule
            !== identity.canonicalGlobalContract.scheduleHistoryContract.schedule
        || bundle.authority.workerSchedule.workers
            !== identity.canonicalGlobalContract.scheduleHistoryContract.jobs.effective
        || bundle.authority.workerSchedule.historyMode
            !== identity.canonicalGlobalContract.scheduleHistoryContract.workerHistory
        || bundle.authority.cacheHistory.cacheMode
            !== identity.canonicalGlobalContract.scheduleHistoryContract.cacheMode
        || bundle.authority.cacheHistory.moduleHistoryMode
            !== identity.canonicalGlobalContract.scheduleHistoryContract.moduleHistoryMode
        || bundle.authority.cacheHistory.unmanagedHistoryMode
            !== identity.canonicalGlobalContract.scheduleHistoryContract.unmanagedHistoryMode
        || receipt?.runtime?.before?.values?.nodeVersion !== identity.environmentContract.nodeVersion
        || receipt?.runtime?.before?.values?.platform !== identity.environmentContract.platform
        || receipt?.runtime?.before?.values?.architecture !== identity.environmentContract.architecture) {
        errors.push('post-execution authority differs from the frozen verification contract')
    }
}

function validateOperatingGateReferences(bundle, gateEvidenceDocuments, errors) {
    if (!exactKeys(bundle.gateEvidence, ['focused', 'product'], 'operating gate evidence references', errors)) return
    for (const gateKind of ['focused', 'product']) {
        const reference = bundle.gateEvidence[gateKind]
        if (!exactKeys(reference, ['objectSha256', 'payloadSha256'], `${gateKind} gate evidence reference`, errors)) continue
        validateSha256(reference.objectSha256, `${gateKind} gate object`, errors)
        validateSha256(reference.payloadSha256, `${gateKind} gate payload`, errors)
        const document = gateEvidenceDocuments?.[gateKind]
        try {
            validateOperatingGateEvidence(document, {
                gateKind,
                frozenDeclaration: bundle.frozenDeclaration,
                frozenDeclarationObjectSha256: bundle.frozenDeclarationObjectSha256,
            })
            if (evidenceObjectSha256(document) !== reference.objectSha256
                || document.integrity.payloadSha256 !== reference.payloadSha256
                || canonicalJson(document.gates) !== canonicalJson(bundle.gates[gateKind])) {
                errors.push(`${gateKind} gate evidence differs from bundle gates`)
            }
        } catch (error) {
            errors.push(`${gateKind} gate evidence is invalid: ${error.code ?? error.message}`)
        }
    }
}

function evaluateOperatingEvidenceBundle(bundle, globalReceipt, localEvidence,
    gateEvidenceDocuments, globalLaunchClaim) {
    const structuralErrors = []
    const acceptanceErrors = []
    if (!exactKeys(bundle, [
        'schema', 'evidenceBundleId', 'disposition', 'runKind', 'recordedAt',
        'frozenDeclarationObjectSha256', 'frozenDeclaration', 'cohort', 'authority',
        'c0Decision', 'globalReceipt', 'attemptEvidence', 'gateEvidence', 'gates', 'correctness',
        'resources', 'canonicalProtection', 'integrity',
    ], 'C0 operating evidence bundle', structuralErrors)) {
        return { structuralErrors, acceptanceErrors: ['bundle structure is invalid'], bundleValid: false, operatingEvidenceAccepted: false }
    }
    if (bundle.schema !== C0_EVIDENCE_SCHEMA_V2) structuralErrors.push('unsupported operating evidence schema')
    if (!RECEIPT_DISPOSITIONS.includes(bundle.disposition)) structuralErrors.push('unknown C0 evidence disposition')
    if (!RUN_KINDS.includes(bundle.runKind)) structuralErrors.push('unknown C0 evidence run kind')
    if (!validCanonicalTimestamp(bundle.recordedAt)) structuralErrors.push('C0 evidence timestamp is missing or noncanonical')
    if (!verifyDocumentIntegrity(bundle)) structuralErrors.push('C0 evidence integrity mismatch')
    validateSha256(bundle.evidenceBundleId, 'evidenceBundleId', structuralErrors)
    validateSha256(bundle.frozenDeclarationObjectSha256, 'frozen declaration object hash', structuralErrors)
    if (!globalReceipt || typeof globalReceipt !== 'object') {
        structuralErrors.push('referenced Global receipt is missing')
        return { structuralErrors, acceptanceErrors: ['Global receipt is missing'], bundleValid: false, operatingEvidenceAccepted: false }
    }
    if (!exactKeys(bundle.globalReceipt, [
        'objectSha256', 'bytes', 'payloadSha256', 'globalRunId', 'accepted', 'disposition',
    ], 'Global receipt reference', structuralErrors)) {
        return { structuralErrors, acceptanceErrors: ['Global receipt reference is invalid'], bundleValid: false, operatingEvidenceAccepted: false }
    }
    const encodedReceipt = evidenceObjectBytes(globalReceipt)
    if (bundle.globalReceipt.objectSha256 !== evidenceObjectSha256(globalReceipt)) structuralErrors.push('Global receipt object hash mismatch')
    if (bundle.globalReceipt.bytes !== encodedReceipt.length) structuralErrors.push('Global receipt object byte count mismatch')
    if (bundle.globalReceipt.payloadSha256 !== globalReceipt?.integrity?.payloadSha256) structuralErrors.push('Global receipt payload hash mismatch')
    if (bundle.globalReceipt.disposition !== globalReceipt?.disposition) structuralErrors.push('Global receipt disposition mismatch')
    const receiptEvaluation = evaluateExecutionReceipt(globalReceipt)
    if (bundle.globalReceipt.accepted !== receiptEvaluation.executionAccepted) structuralErrors.push('Global receipt accepted flag mismatch')
    structuralErrors.push(...receiptEvaluation.structuralErrors.map((error) => `Global receipt: ${error}`))
    try { validateC0Decision(bundle.c0Decision) } catch (error) {
        structuralErrors.push(`C0 decision is invalid: ${error.code ?? error.message}`)
    }
    validateAuthority(bundle, globalReceipt, structuralErrors)
    validateOperatingCohort(bundle, globalReceipt, localEvidence, globalLaunchClaim,
        structuralErrors, acceptanceErrors)
    validateOperatingGateReferences(bundle, gateEvidenceDocuments, structuralErrors)
    validateGates(bundle, structuralErrors)
    if (bundle.gates?.focused?.some((gate) =>
        !['passed', 'not-applicable'].includes(gate?.result))) {
        acceptanceErrors.push('focused gates did not satisfy the material execution contract')
    }
    validateCorrectness(bundle, globalReceipt, receiptEvaluation, structuralErrors, acceptanceErrors)
    validateResources(bundle, globalReceipt, structuralErrors)
    validateCanonicalProtection(bundle, structuralErrors)
    if (bundle.runKind === 'synthetic-known-answer') acceptanceErrors.push('synthetic known-answer is not production operating evidence')
    const bundleValid = structuralErrors.length === 0
    return {
        structuralErrors,
        acceptanceErrors,
        bundleValid,
        operatingEvidenceAccepted: bundleValid && acceptanceErrors.length === 0,
    }
}

function evaluateC0EvidenceBundle(bundle, {
    globalReceipt,
    localReceipt = null,
    localFailure = null,
    gateEvidenceDocuments = null,
    globalLaunchClaim = null,
} = {}) {
    if (bundle?.schema === C0_EVIDENCE_SCHEMA_V2) {
        if (localReceipt !== null && localFailure !== null) {
            return {
                structuralErrors: ['both local receipt and local failure were supplied'],
                acceptanceErrors: ['local evidence is ambiguous'],
                bundleValid: false,
                operatingEvidenceAccepted: false,
            }
        }
        return evaluateOperatingEvidenceBundle(bundle, globalReceipt,
            localReceipt ?? localFailure, gateEvidenceDocuments, globalLaunchClaim)
    }
    const structuralErrors = []
    const acceptanceErrors = []
    if (!exactKeys(bundle, [
        'schema',
        'disposition',
        'runKind',
        'recordedAt',
        'cohort',
        'authority',
        'c0Decision',
        'globalReceipt',
        'gates',
        'correctness',
        'resources',
        'canonicalProtection',
        'integrity',
    ], 'C0 evidence bundle', structuralErrors)) {
        return { structuralErrors, acceptanceErrors: ['bundle structure is invalid'], bundleValid: false, operatingEvidenceAccepted: false }
    }
    if (bundle.schema !== C0_EVIDENCE_SCHEMA) structuralErrors.push('unsupported C0 evidence schema')
    if (!RECEIPT_DISPOSITIONS.includes(bundle.disposition)) structuralErrors.push('unknown C0 evidence disposition')
    if (!RUN_KINDS.includes(bundle.runKind)) structuralErrors.push('unknown C0 evidence run kind')
    if (!validCanonicalTimestamp(bundle.recordedAt)) structuralErrors.push('C0 evidence timestamp is missing or noncanonical')
    if (!verifyDocumentIntegrity(bundle)) structuralErrors.push('C0 evidence integrity mismatch')
    if (!globalReceipt || typeof globalReceipt !== 'object') {
        structuralErrors.push('referenced Global receipt is missing')
        return { structuralErrors, acceptanceErrors: ['Global receipt is missing'], bundleValid: false, operatingEvidenceAccepted: false }
    }
    if (!exactKeys(bundle.globalReceipt, ['objectSha256', 'bytes', 'payloadSha256', 'accepted', 'disposition'], 'Global receipt reference', structuralErrors)) {
        return { structuralErrors, acceptanceErrors: ['Global receipt reference is invalid'], bundleValid: false, operatingEvidenceAccepted: false }
    }
    const encodedReceipt = evidenceObjectBytes(globalReceipt)
    if (bundle.globalReceipt.objectSha256 !== evidenceObjectSha256(globalReceipt)) structuralErrors.push('Global receipt object hash mismatch')
    if (bundle.globalReceipt.bytes !== encodedReceipt.length) structuralErrors.push('Global receipt object byte count mismatch')
    if (bundle.globalReceipt.payloadSha256 !== globalReceipt?.integrity?.payloadSha256) structuralErrors.push('Global receipt payload hash mismatch')
    if (bundle.globalReceipt.disposition !== globalReceipt?.disposition) structuralErrors.push('Global receipt disposition mismatch')
    const receiptEvaluation = evaluateExecutionReceipt(globalReceipt)
    if (bundle.globalReceipt.accepted !== receiptEvaluation.executionAccepted) structuralErrors.push('Global receipt accepted flag mismatch')
    structuralErrors.push(...receiptEvaluation.structuralErrors.map((error) => `Global receipt: ${error}`))

    try {
        validateC0Decision(bundle.c0Decision)
    } catch (error) {
        structuralErrors.push(`C0 decision is invalid: ${error.code ?? error.message}`)
    }
    validateAuthority(bundle, globalReceipt, structuralErrors)
    validateCohort(bundle, structuralErrors)
    validateGates(bundle, structuralErrors)
    validateCorrectness(bundle, globalReceipt, receiptEvaluation, structuralErrors, acceptanceErrors)
    validateResources(bundle, globalReceipt, structuralErrors)
    validateCanonicalProtection(bundle, structuralErrors)

    if (bundle.runKind === 'synthetic-known-answer') {
        acceptanceErrors.push('synthetic known-answer is not production operating evidence')
    }
    const bundleValid = structuralErrors.length === 0
    return {
        structuralErrors,
        acceptanceErrors,
        bundleValid,
        operatingEvidenceAccepted: bundleValid && acceptanceErrors.length === 0,
    }
}

function requiredExitCode(evaluation, { allowSynthetic = false } = {}) {
    if (!evaluation.bundleValid) return 1
    if (evaluation.operatingEvidenceAccepted) return 0
    if (
        allowSynthetic
        && evaluation.acceptanceErrors.length === 1
        && evaluation.acceptanceErrors[0] === 'synthetic known-answer is not production operating evidence'
    ) return 0
    return 1
}

module.exports = {
    C0_COHORT_IDENTITY_SCHEMA,
    C0_EVIDENCE_SCHEMA,
    C0_EVIDENCE_SCHEMA_V2,
    COHORT_CLASSES,
    RESOURCE_MEASUREMENT_SCHEMA,
    RUN_KINDS,
    canonicalSha256,
    buildAuthority,
    buildCorrectness,
    buildEvidenceBundle,
    cacheHistoryAuthority,
    computeCohortId,
    computeEvidenceBundleId,
    computeRunId,
    evaluateC0EvidenceBundle,
    expectedCohortIdentity,
    finalizeEvidenceBundle,
    finalizeOperatingEvidenceBundle,
    globalCoverageComplete,
    requiredExitCode,
    runtimeSemanticIdentity,
    schemaAuthority,
    workerScheduleAuthority,
}
