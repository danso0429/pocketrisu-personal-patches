'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const {
    FREEZE_SCHEMA,
    TREE_SCHEMA,
    jsonSha256,
    sha256,
    validateVerificationResult,
} = require('../src/verification-evidence.cjs')
const {
    canonicalJson,
    sealDocument,
} = require('../src/verification-receipts.cjs')
const {
    RUNTIME_FIELD_POLICY,
    RUNTIME_SCHEMA_V2,
} = require('../src/verification-runtime.cjs')
const {
    routeCurrentC0,
} = require('../src/c0-policy.cjs')
const {
    canonicalSha256,
    evaluateC0EvidenceBundle,
    expectedCohortIdentity,
    finalizeEvidenceBundle,
    requiredExitCode,
} = require('../src/c0-evidence.cjs')

const FIXTURE_COMMIT = 'a'.repeat(40)
const TARGET_COMMIT = 'b'.repeat(40)

function tree(value) {
    const identity = {
        schema: TREE_SCHEMA,
        exclusions: [],
        entries: [{ path: '', type: 'directory', mode: 0o700, value }],
    }
    return {
        ...identity,
        entryCount: identity.entries.length,
        rootSha256: jsonSha256(identity),
    }
}

function freeze(sourceValue = 'source', targetValue = 'target') {
    return {
        schema: FREEZE_SCHEMA,
        source: {
            schema: FREEZE_SCHEMA,
            applicationTree: tree(sourceValue),
            catalog: tree(`catalog-${sourceValue}`),
        },
        target: {
            schema: FREEZE_SCHEMA,
            applicationTree: tree(targetValue),
            provenance: { kind: 'git', commit: TARGET_COMMIT },
        },
    }
}

function runtimeEnvelope() {
    return {
        schema: RUNTIME_SCHEMA_V2,
        fieldPolicy: RUNTIME_FIELD_POLICY,
        values: {
            nodeVersion: process.version,
            platform: 'linux',
            architecture: 'arm64',
            filesystemType: '0xef53',
            umask: 0o077,
            locale: 'C.UTF-8',
            timezone: 'UTC',
            kernel: 'fixture',
            cpuCount: 2,
            availableParallelism: 2,
            mountNamespaceId: 'mnt:[1]',
            temporaryDirectory: '/tmp',
            temporaryFilesystemType: '0xef53',
            nodeOptions: null,
        },
    }
}

function canonicalResult() {
    return {
        visiblePacks: ['a', 'b'],
        rawSelections: 4,
        verifiedSelections: 4,
        roundTrips: 'passed',
        workers: 2,
        workerHistory: {
            schema: 'patch-combination-worker-history-v1',
            schedule: 'stride-v1',
            workers: [
                { workerIndex: 0, orderedMasks: [0, 2] },
                { workerIndex: 1, orderedMasks: [1, 3] },
            ],
        },
    }
}

function globalReceipt({ spawnError = null, stdout = null, disposition = 'current-active' } = {}) {
    const result = canonicalResult()
    const actualStdout = stdout ?? `${JSON.stringify(result)}\n`
    const runtime = runtimeEnvelope()
    const before = freeze()
    const after = freeze()
    const verifierResult = (() => {
        try { return JSON.parse(actualStdout.trim()) } catch { return null }
    })()
    const verifierErrors = validateVerificationResult('global-exhaustive', verifierResult)
    const execution = {
        exitCode: 0,
        signal: null,
        spawnError,
        outputError: null,
        stdout: actualStdout,
        stderr: '',
        stdoutBytes: Buffer.byteLength(actualStdout),
        stdoutSha256: sha256(actualStdout),
        stderrBytes: 0,
        stderrSha256: sha256(''),
    }
    const accepted = spawnError === null && verifierErrors.length === 0
    return sealDocument({
        schema: 'patch-verification-execution-receipt-v2',
        verificationKind: 'global-exhaustive',
        disposition,
        timestamp: '2000-01-01T00:00:00.000Z',
        command: ['/usr/bin/node', '/repo/scripts/verify-all-combinations.cjs', '--root', '/tmp/target', '--json', '--jobs', '2'],
        options: { jobs: 2, allowReviewing: false, targetProvenance: null },
        before,
        after,
        execution,
        verifierResult,
        verifierErrors,
        stability: { sourceMatched: true, targetMatched: true, matched: true },
        runtime: { before: runtime, after: runtime, comparison: { errors: [], differences: [], matched: true } },
        accepted,
    })
}

function authority(receipt) {
    const schemaFiles = [
        'schemas/patch-c0-cohort-ledger-v1.schema.json',
        'schemas/patch-c0-defect-yield-summary-v1.schema.json',
        'schemas/patch-c0-evidence-bundle-v1.schema.json',
        'schemas/patch-c0-incident-record-v1.schema.json',
        'schemas/patch-c0-retention-plan-v1.schema.json',
        'schemas/patch-c0-review-trigger-v1.schema.json',
        'schemas/patch-c0-stable-release-ledger-v1.schema.json',
    ].map((file, index) => ({ path: file, sha256: String(index + 1).padStart(64, '0') }))
    const workerPayload = {
        schedule: receipt.verifierResult?.workerHistory?.schedule ?? 'stride-v1',
        workers: receipt.verifierResult?.workers ?? receipt.options.jobs,
        orderedMasksSha256: canonicalSha256(receipt.verifierResult?.workerHistory?.workers ?? []),
        historyMode: 'persistent-per-worker-v1',
    }
    const cachePayload = {
        cacheMode: 'enabled-shared-per-worker-v1',
        moduleHistoryMode: 'persistent-per-worker-v1',
        unmanagedHistoryMode: 'persistent-per-worker-v1',
    }
    return {
        governance: { repository: 'https://example.invalid/governance', commit: FIXTURE_COMMIT, statusVersion: 12 },
        implementation: {
            repository: 'fixture',
            commit: FIXTURE_COMMIT,
            branch: 'fixture',
            statusSha256: 'c'.repeat(64),
            stagedDiffSha256: 'd'.repeat(64),
            unstagedDiffSha256: 'e'.repeat(64),
        },
        policy: { path: 'docs/patch-combination-verification-instructions.md', sha256: 'f'.repeat(64) },
        catalog: { rootSha256: receipt.before.source.catalog.rootSha256 },
        schemas: { rootSha256: canonicalSha256(schemaFiles), files: schemaFiles },
        target: {
            commit: TARGET_COMMIT,
            beforeSha256: canonicalSha256(receipt.before.target),
            afterSha256: canonicalSha256(receipt.after.target),
            applicationBeforeSha256: receipt.before.target.applicationTree.rootSha256,
            applicationAfterSha256: receipt.after.target.applicationTree.rootSha256,
        },
        environment: {
            beforeSha256: canonicalSha256(receipt.runtime.before),
            afterSha256: canonicalSha256(receipt.runtime.after),
            semanticSha256: canonicalSha256({ node: process.version, platform: 'linux', architecture: 'arm64' }),
        },
        command: { argv: receipt.command, sha256: canonicalSha256(receipt.command) },
        workerSchedule: { ...workerPayload, sha256: canonicalSha256(workerPayload) },
        cacheHistory: { ...cachePayload, sha256: canonicalSha256(cachePayload) },
    }
}

function bundleFixture({ receipt = globalReceipt(), runKind = 'production-c0', trialId = 'trial-1' } = {}) {
    const boundAuthority = authority(receipt)
    const receiptEncoded = canonicalJson(receipt)
    const production = runKind === 'production-c0'
    return finalizeEvidenceBundle({
        schema: 'patch-c0-evidence-bundle-v1',
        disposition: receipt.accepted ? 'current-active' : 'defect-reproduction',
        runKind,
        recordedAt: '2000-01-01T00:00:01.000Z',
        cohort: {
            identitySchema: 'patch-c0-cohort-identity-v1',
            cohortId: null,
            runId: null,
            trialId,
            cohortClass: 'audit',
            materiallyDistinct: production,
            repeatedPerformanceTrial: false,
            productionEligible: production,
            syntheticMutation: false,
            identity: expectedCohortIdentity(boundAuthority),
        },
        authority: boundAuthority,
        c0Decision: routeCurrentC0({ correctness: receipt.accepted ? 'passed' : 'failed', budget: 'passed' }),
        globalReceipt: {
            objectSha256: sha256(receiptEncoded),
            bytes: Buffer.byteLength(receiptEncoded),
            payloadSha256: receipt.integrity.payloadSha256,
            accepted: receipt.accepted,
            disposition: receipt.disposition,
        },
        gates: {
            focused: [{ name: 'fixture-focused', result: 'not-run', receiptObjectSha256: null, detailsSha256: null }],
            global: { name: 'Global Exhaustive', result: receipt.accepted ? 'passed' : 'failed', receiptObjectSha256: sha256(receiptEncoded), detailsSha256: null },
            product: [{ name: 'fixture-product', result: 'not-run', receiptObjectSha256: null, detailsSha256: null }],
        },
        correctness: {
            status: receipt.accepted ? 'passed' : 'failed',
            coverageComplete: receipt.accepted,
            targetIntegrity: true,
            receiptIntegrity: true,
            c0GlobalMatch: true,
            missingOutput: receipt.execution.stdoutBytes === 0,
            spawnError: receipt.execution.spawnError?.code ?? null,
            signal: null,
            reportedFailures: 0,
            errors: receipt.accepted ? [] : ['fixture failure'],
        },
        resources: {
            measurementSchema: 'patch-c0-resource-measurement-v1',
            wallMs: 10,
            cpu: { wrapperMs: 1, childrenMs: 2, totalMs: 3 },
            maximumRssKiB: 1024,
            temporary: {
                root: '/tmp/fixture',
                baselineBytes: 0,
                sampledPeakBytes: 100,
                postRunResidueBytes: 0,
                sampleIntervalMs: 50,
                retained: false,
            },
            evidenceStorage: {
                receiptBytes: Buffer.byteLength(receiptEncoded),
                referencedObjectsNewPhysicalBytes: Buffer.byteLength(receiptEncoded),
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

function reseal(bundle, changes) {
    const { integrity, ...payload } = bundle
    return finalizeEvidenceBundle({ ...payload, ...changes })
}

test('all seven C0 evidence schemas parse and keep distinct canonical IDs', () => {
    const schemaRoot = path.join(__dirname, '..', 'schemas')
    const names = fs.readdirSync(schemaRoot).filter((name) => /^patch-c0-(evidence-bundle|cohort-ledger|stable-release-ledger|incident-record|defect-yield-summary|retention-plan|review-trigger)-v1\.schema\.json$/.test(name)).sort()
    assert.equal(names.length, 7)
    const ids = names.map((name) => JSON.parse(fs.readFileSync(path.join(schemaRoot, name), 'utf8')).$id)
    assert.equal(new Set(ids).size, 7)
    assert.ok(ids.every((id) => typeof id === 'string' && id.endsWith('.schema.json')))
})

test('independent validator accepts a sealed production C0 known answer', () => {
    const receipt = globalReceipt()
    const bundle = bundleFixture({ receipt })
    const evaluation = evaluateC0EvidenceBundle(bundle, { globalReceipt: receipt })
    assert.deepEqual(evaluation, {
        structuralErrors: [],
        acceptanceErrors: [],
        bundleValid: true,
        operatingEvidenceAccepted: true,
    })
    assert.equal(requiredExitCode(evaluation), 0)
})

test('cohortId is stable across trials while runId is trial-specific', () => {
    const receipt = globalReceipt()
    const first = bundleFixture({ receipt, trialId: 'trial-1' })
    const repeat = bundleFixture({ receipt, trialId: 'trial-2' })
    assert.equal(first.cohort.cohortId, repeat.cohort.cohortId)
    assert.notEqual(first.cohort.runId, repeat.cohort.runId)

    const changedAuthority = structuredClone(first.authority)
    changedAuthority.policy.sha256 = '0'.repeat(64)
    const changed = reseal(first, {
        authority: changedAuthority,
        cohort: {
            ...first.cohort,
            identity: expectedCohortIdentity(changedAuthority),
        },
    })
    assert.notEqual(first.cohort.cohortId, changed.cohort.cohortId)
})

test('synthetic known answers are valid diagnostics but never production evidence', () => {
    const receipt = globalReceipt()
    const bundle = bundleFixture({ receipt, runKind: 'synthetic-known-answer' })
    const evaluation = evaluateC0EvidenceBundle(bundle, { globalReceipt: receipt })
    assert.equal(evaluation.bundleValid, true)
    assert.equal(evaluation.operatingEvidenceAccepted, false)
    assert.deepEqual(evaluation.acceptanceErrors, ['synthetic known-answer is not production operating evidence'])
    assert.equal(requiredExitCode(evaluation), 1)
    assert.equal(requiredExitCode(evaluation, { allowSynthetic: true }), 0)
})

test('tampered IDs, incomplete coverage, and weakened protection fail closed', () => {
    const receipt = globalReceipt()
    const original = bundleFixture({ receipt })
    const cases = [
        sealDocument({ ...original, integrity: undefined, cohort: { ...original.cohort, cohortId: '0'.repeat(64) } }),
        reseal(original, { correctness: { ...original.correctness, coverageComplete: false } }),
        reseal(original, { canonicalProtection: { ...original.canonicalProtection, canonicalMasksSkipped: 1 } }),
        reseal(original, { c0Decision: routeCurrentC0({ unsupported: true }) }),
    ]
    for (const bundle of cases) {
        const evaluation = evaluateC0EvidenceBundle(bundle, { globalReceipt: receipt })
        assert.equal(evaluation.operatingEvidenceAccepted, false)
        assert.equal(requiredExitCode(evaluation), 1)
        assert.notEqual(evaluation.structuralErrors.length, 0)
    }
})

test('missing output plus spawn error cannot become accepted evidence', () => {
    const receipt = globalReceipt({
        spawnError: { code: 'EPERM', message: 'spawn EPERM' },
        stdout: '',
        disposition: 'defect-reproduction',
    })
    const bundle = bundleFixture({ receipt })
    const evaluation = evaluateC0EvidenceBundle(bundle, { globalReceipt: receipt })
    assert.equal(evaluation.bundleValid, true)
    assert.equal(evaluation.operatingEvidenceAccepted, false)
    assert.match(evaluation.acceptanceErrors.join('\n'), /did not pass/)
})

test('corrupt Global receipt and corrupt bundle integrity are rejected', () => {
    const receipt = globalReceipt()
    const bundle = bundleFixture({ receipt })
    const corruptReceipt = structuredClone(receipt)
    corruptReceipt.execution.stdout = '{}\n'
    assert.equal(evaluateC0EvidenceBundle(bundle, { globalReceipt: corruptReceipt }).bundleValid, false)
    const corruptBundle = structuredClone(bundle)
    corruptBundle.resources.wallMs = 999
    assert.equal(evaluateC0EvidenceBundle(corruptBundle, { globalReceipt: receipt }).bundleValid, false)
})
