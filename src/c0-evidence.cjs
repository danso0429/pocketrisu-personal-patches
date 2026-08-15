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
} = require('./verification-receipts.cjs')
const {
    validateC0Decision,
} = require('./c0-policy.cjs')
const {
    evidenceObjectBytes,
    objectSha256: evidenceObjectSha256,
} = require('./c0-retention.cjs')

const C0_EVIDENCE_SCHEMA = 'patch-c0-evidence-bundle-v1'
const C0_COHORT_IDENTITY_SCHEMA = 'patch-c0-cohort-identity-v1'
const RESOURCE_MEASUREMENT_SCHEMA = 'patch-c0-resource-measurement-v1'
const RUN_KINDS = Object.freeze(['production-c0', 'synthetic-known-answer'])
const COHORT_CLASSES = Object.freeze(['stable-release', 'patch', 'relation', 'core', 'audit'])
const GATE_RESULTS = Object.freeze(['passed', 'failed', 'incomplete', 'not-run', 'not-applicable'])
const SHA256_PATTERN = /^[0-9a-f]{64}$/
const COMMIT_PATTERN = /^[0-9a-f]{40}$/

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
    'schemas/patch-c0-defect-yield-summary-v1.schema.json',
    'schemas/patch-c0-evidence-bundle-v1.schema.json',
    'schemas/patch-c0-incident-record-v1.schema.json',
    'schemas/patch-c0-retention-plan-v1.schema.json',
    'schemas/patch-c0-review-trigger-v1.schema.json',
    'schemas/patch-c0-stable-release-ledger-v1.schema.json',
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
}) {
    const before = globalReceipt.before
    const after = globalReceipt.after
    const command = globalReceipt.command
    const semanticIdentity = runtimeSemanticIdentity(globalReceipt.runtime.before)
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
    c0Decision,
    referencedObjectsNewPhysicalBytes = 0,
    recordedAt = new Date().toISOString(),
}) {
    const authority = buildAuthority({
        sourceRoot,
        globalReceipt,
        governanceRepository,
        governanceCommit,
        governanceStatusVersion,
        implementationRepository,
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

function evaluateC0EvidenceBundle(bundle, { globalReceipt } = {}) {
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
    COHORT_CLASSES,
    RESOURCE_MEASUREMENT_SCHEMA,
    RUN_KINDS,
    canonicalSha256,
    buildAuthority,
    buildCorrectness,
    buildEvidenceBundle,
    cacheHistoryAuthority,
    computeCohortId,
    computeRunId,
    evaluateC0EvidenceBundle,
    expectedCohortIdentity,
    finalizeEvidenceBundle,
    globalCoverageComplete,
    requiredExitCode,
    runtimeSemanticIdentity,
    schemaAuthority,
    workerScheduleAuthority,
}
