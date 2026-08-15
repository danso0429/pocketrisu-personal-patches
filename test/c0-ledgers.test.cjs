'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const {
    finalizeEvidenceBundle,
} = require('../src/c0-evidence.cjs')
const {
    buildCohortLedger,
    buildDefectYieldSummary,
    buildReviewTriggerReport,
    buildStableReleaseLedger,
    finalizeIncidentRecord,
    objectSha256,
    validateCohortLedger,
    validateIncidentChain,
    validateStableReleaseLedger,
} = require('../src/c0-ledgers.cjs')
const {
    sealDocument,
    verifyDocumentIntegrity,
} = require('../src/verification-receipts.cjs')

const COMMIT = 'a'.repeat(40)
const HASHES = Array.from({ length: 16 }, (_, index) => (index + 1).toString(16).repeat(64))

function identity(seed = 0) {
    return {
        governanceCommit: COMMIT,
        implementationCommit: COMMIT,
        implementationStatusSha256: HASHES[(seed + 0) % HASHES.length],
        policySha256: HASHES[(seed + 1) % HASHES.length],
        catalogSha256: HASHES[(seed + 2) % HASHES.length],
        schemasSha256: HASHES[(seed + 3) % HASHES.length],
        targetBeforeSha256: HASHES[(seed + 4) % HASHES.length],
        runtimeSemanticSha256: HASHES[(seed + 5) % HASHES.length],
        commandSha256: HASHES[(seed + 6) % HASHES.length],
        workerHistorySha256: HASHES[(seed + 7) % HASHES.length],
        cacheHistorySha256: HASHES[(seed + 8) % HASHES.length],
    }
}

function bundle({
    trialId = 'trial-1',
    cohortClass = 'audit',
    materiallyDistinct = true,
    repeatedPerformanceTrial = false,
    productionEligible = true,
    syntheticMutation = false,
    passed = true,
    seed = 0,
    recordedAt = '2000-01-01T00:00:00.000Z',
} = {}) {
    return finalizeEvidenceBundle({
        schema: 'patch-c0-evidence-bundle-v1',
        disposition: passed ? 'current-active' : 'defect-reproduction',
        runKind: productionEligible ? 'production-c0' : 'synthetic-known-answer',
        recordedAt,
        cohort: {
            identitySchema: 'patch-c0-cohort-identity-v1',
            cohortId: null,
            runId: null,
            trialId,
            cohortClass,
            materiallyDistinct,
            repeatedPerformanceTrial,
            productionEligible,
            syntheticMutation,
            identity: identity(seed),
        },
        authority: { implementation: { commit: COMMIT } },
        c0Decision: {},
        globalReceipt: { objectSha256: HASHES[14], accepted: passed },
        gates: {},
        correctness: { status: passed ? 'passed' : 'failed' },
        resources: {},
        canonicalProtection: {},
    })
}

function incidentDraft(bundleValue, {
    attribution = 'implementation-defect',
    syntheticMutation = false,
    productionDefectEligible = true,
    focused = 'missed',
    global = 'caught',
    product = 'missed',
    recordedAt = '2000-01-02T00:00:00.000Z',
} = {}) {
    return {
        schema: 'patch-c0-incident-record-v1',
        recordedAt,
        cohortId: bundleValue.cohort.cohortId,
        runId: bundleValue.cohort.runId,
        bundleObjectSha256: objectSha256(bundleValue),
        cohortClass: bundleValue.cohort.cohortClass,
        syntheticMutation,
        productionDefectEligible,
        firstFailure: {
            phase: 'transaction-apply',
            mask: 3,
            worker: 1,
            message: 'known-answer failure',
            stdoutObjectSha256: null,
            stderrObjectSha256: null,
        },
        detectors: { focused, global, product },
        attribution,
        rootCause: 'fixture root cause',
        fix: 'fixture fix',
        negativeEvidenceObjectSha256s: [objectSha256(bundleValue)],
        disposition: 'historical',
    }
}

test('cohort ledger is append-only, hash-chained, and rejects duplicates', () => {
    const first = bundle()
    const initial = buildCohortLedger([first], { generatedAt: '2000-01-03T00:00:00.000Z' })
    assert.deepEqual(validateCohortLedger(initial, { expectedKind: 'cohort' }), { valid: true, errors: [] })
    const second = bundle({ trialId: 'trial-2', seed: 1, recordedAt: '2000-01-04T00:00:00.000Z' })
    const appended = buildCohortLedger([second], {
        baseLedger: initial,
        generatedAt: '2000-01-05T00:00:00.000Z',
    })
    assert.equal(appended.baseLedgerObjectSha256, objectSha256(initial))
    assert.equal(appended.entries.length, 2)
    assert.deepEqual(appended.entries.slice(0, 1), initial.entries)
    assert.equal(appended.entries[1].previousEntrySha256, appended.entries[0].entrySha256)
    assert.throws(() => buildCohortLedger([first], { baseLedger: initial }), /Duplicate/)

    const tampered = structuredClone(appended)
    tampered.entries[1].previousEntrySha256 = null
    const resealed = sealDocument(tampered)
    const evaluation = validateCohortLedger(resealed, { expectedKind: 'cohort' })
    assert.equal(evaluation.valid, false)
    assert.match(evaluation.errors.join('\n'), /chain mismatch/)
})

test('stable-release ledger binds release, cohort, Global receipt, and product gate', () => {
    const releaseBundle = bundle({ cohortClass: 'stable-release' })
    const ledger = buildStableReleaseLedger([{
        releaseId: 'release-1',
        releaseTag: 'v1.0.0',
        productGateResult: 'passed',
        bundle: releaseBundle,
    }], { generatedAt: '2000-01-03T00:00:00.000Z' })
    assert.deepEqual(validateStableReleaseLedger(ledger), { valid: true, errors: [] })
    assert.equal(ledger.entries[0].bundleObjectSha256, objectSha256(releaseBundle))
    assert.equal(ledger.entries[0].globalReceiptObjectSha256, releaseBundle.globalReceipt.objectSha256)
    assert.throws(() => buildStableReleaseLedger([{
        releaseId: 'release-1',
        releaseTag: 'v1.0.0',
        productGateResult: 'passed',
        bundle: bundle({ cohortClass: 'patch' }),
    }]), /stable-release cohort/)
})

test('incident chain retains original negative evidence after a later fixed cohort', () => {
    const failed = bundle({ passed: false })
    const fixed = bundle({ trialId: 'fixed', seed: 2, recordedAt: '2000-01-04T00:00:00.000Z' })
    const ledger = buildCohortLedger([failed, fixed], { generatedAt: '2000-01-05T00:00:00.000Z' })
    const firstIncident = finalizeIncidentRecord(incidentDraft(failed))
    const followup = finalizeIncidentRecord(incidentDraft(fixed, {
        attribution: 'environment-defect',
        productionDefectEligible: false,
        recordedAt: '2000-01-06T00:00:00.000Z',
    }), { previousRecord: firstIncident })
    assert.deepEqual(validateIncidentChain([firstIncident, followup]), { valid: true, errors: [] })
    assert.equal(followup.previousIncidentSha256, objectSha256(firstIncident))
    assert.ok(firstIncident.negativeEvidenceObjectSha256s.includes(objectSha256(failed)))
    assert.ok(ledger.entries.some((entry) => entry.objectSha256 === objectSha256(failed)))
})

test('defect yield excludes synthetic mutations and separates earlier detectors', () => {
    const production = bundle()
    const synthetic = bundle({
        trialId: 'synthetic',
        productionEligible: false,
        materiallyDistinct: false,
        syntheticMutation: true,
        seed: 3,
        recordedAt: '2000-01-01T00:00:01.000Z',
    })
    const ledger = buildCohortLedger([production, synthetic], { generatedAt: '2000-01-03T00:00:00.000Z' })
    const productionIncident = finalizeIncidentRecord(incidentDraft(production))
    const syntheticIncident = finalizeIncidentRecord(incidentDraft(synthetic, {
        attribution: 'synthetic-mutation',
        syntheticMutation: true,
        productionDefectEligible: true,
        recordedAt: '2000-01-02T00:00:01.000Z',
    }), { previousRecord: productionIncident })
    assert.equal(syntheticIncident.productionDefectEligible, false)
    const summary = buildDefectYieldSummary(ledger, [productionIncident, syntheticIncident], {
        generatedAt: '2000-01-07T00:00:00.000Z',
    })
    assert.equal(verifyDocumentIntegrity(summary), true)
    assert.equal(summary.productionCohorts, 1)
    assert.equal(summary.confirmedProductionDefects, 1)
    assert.equal(summary.syntheticIncidentsExcluded, 1)
    assert.equal(summary.globalCaught, 1)
    assert.equal(summary.globalUniqueYield, 1)
    assert.equal(summary.alsoCaughtByFocused, 0)
    assert.equal(summary.alsoCaughtByProduct, 0)
})

test('review trigger only recommends another read-only review and never authorizes C1', () => {
    const auditBundle = bundle()
    const cohortLedger = buildCohortLedger([auditBundle], { generatedAt: '2000-01-03T00:00:00.000Z' })
    const stableReleaseLedger = buildStableReleaseLedger([], { generatedAt: '2000-01-03T00:00:00.000Z' })
    const report = buildReviewTriggerReport({
        cohortLedger,
        stableReleaseLedger,
        incidentRecords: [],
        generatedAt: '2000-01-08T00:00:00.000Z',
    })
    assert.equal(verifyDocumentIntegrity(report), true)
    assert.equal(report.recommendation, 'not-ready')
    assert.equal(report.c1Authorized, false)
    assert.ok(report.conditions.some((condition) => !condition.satisfied))
})
