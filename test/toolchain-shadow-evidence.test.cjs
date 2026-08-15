'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { loadCatalog } = require('../src/catalog.cjs')
const {
    buildPilotIncident,
    buildPilotReceipt,
    validatePilotIncident,
    validatePilotReceipt,
} = require('../src/toolchain-shadow-evidence.cjs')
const {
    syntheticGlobalProjection,
} = require('../src/toolchain-shadow-global.cjs')
const { createToolchainKnownAnswerTarget } = require('../src/toolchain-shadow-known-answer.cjs')
const { runFreshLocalShadow } = require('../src/toolchain-shadow-local.cjs')
const {
    loadEvidenceObject,
    objectSha256,
    planC0EvidenceRetention,
    publishEvidenceObject,
} = require('../src/c0-retention.cjs')
const { canonicalJson, sealDocument } = require('../src/verification-receipts.cjs')

const ROOT = path.resolve(__dirname, '..')
const HASH = (value) => value.repeat(64)

function authority(localReceipt) {
    return {
        governanceCommit: 'a'.repeat(40),
        implementationCommit: 'b'.repeat(40),
        policySha256: HASH('1'),
        catalogSha256: HASH('2'),
        schemasSha256: HASH('3'),
        targetSha256: localReceipt.target.applicationTreeSha256,
        declarationSha256: localReceipt.declarationSha256,
        environmentSha256: HASH('4'),
        localRouteSha256: HASH('5'),
        globalRouteSha256: HASH('6'),
        c0CohortId: null,
    }
}

async function fixture() {
    const target = createToolchainKnownAnswerTarget(ROOT)
    const localReceipt = await runFreshLocalShadow({
        sourceRoot: ROOT,
        targetRoot: target.root,
        targetProvenance: target.provenance,
        disposition: 'synthetic-known-answer',
        compiledContract: target.compiled,
        recordedAt: '2026-08-15T00:00:00.000Z',
    })
    const visiblePacks = loadCatalog(ROOT).filter((pack) => pack.userSelectable !== false)
        .map((pack) => pack.id).sort()
    const globalProjection = syntheticGlobalProjection({
        localReceipt,
        visiblePacks,
        recordedAt: '2026-08-15T00:00:01.000Z',
    })
    return { target, localReceipt, globalProjection }
}

function dryRun(value, overrides = {}) {
    return buildPilotReceipt({
        mode: 'synthetic-dry-run',
        localReceipt: value.localReceipt,
        globalProjection: value.globalProjection,
        authority: authority(value.localReceipt),
        trialId: overrides.trialId ?? 'trial-1',
        recordedAt: overrides.recordedAt ?? '2026-08-15T00:00:02.000Z',
        wrapperResources: { wallMs: 1, cpuMs: 1, maximumRssKiB: 1 },
        storageResources: { receiptBytes: 1, newPhysicalBytes: 1 },
    })
}

test('synthetic pilot stays nonmaterial and retries retain one cohort identity', async () => {
    const value = await fixture()
    try {
        const first = dryRun(value)
        const retry = dryRun(value, { trialId: 'trial-2', recordedAt: '2026-08-15T00:00:03.000Z' })
        assert.equal(first.result.pilotCorrectness, 'passed')
        assert.equal(first.result.candidateAdmission, 'not-authorized')
        assert.equal(first.result.productionClassification, 'G')
        assert.equal(first.references.globalReceiptObjectSha256, null)
        assert.equal(first.cohort.cohortId, retry.cohort.cohortId)
        assert.notEqual(first.cohort.runId, retry.cohort.runId)
    } finally {
        fs.rmSync(value.target.root, { recursive: true, force: true })
    }
})

test('local/Global mismatch fails pilot, denies admission, and creates an immutable incident', async () => {
    const value = await fixture()
    try {
        const failedProjection = structuredClone(value.globalProjection)
        failedProjection.status = 'failed'
        failedProjection.observations[0].matchesLocal = false
        failedProjection.comparison = { mismatches: 1, candidateAdmission: 'denied' }
        const { integrity: ignored, ...projectionPayload } = failedProjection
        value.globalProjection = sealDocument(projectionPayload)
        const pilot = dryRun(value)
        assert.deepEqual(pilot.result, {
            pilotCorrectness: 'failed',
            candidateAdmission: 'denied',
            productionClassification: 'G',
            canonicalGlobalResult: 'not-run-synthetic-dry-run',
        })
        const incident = buildPilotIncident({
            pilotReceipt: pilot,
            pilotReceiptObjectSha256: objectSha256(pilot),
            recordedAt: '2026-08-15T00:00:03.000Z',
        })
        assert.equal(validatePilotIncident(incident).failure.candidateAdmission, 'denied')
        const corrupt = structuredClone(incident)
        corrupt.preservation.negativeEvidenceDeleted = true
        assert.throws(() => validatePilotIncident(corrupt), (error) => error.code === 'CORRUPT_PILOT_INCIDENT')
    } finally {
        fs.rmSync(value.target.root, { recursive: true, force: true })
    }
})

test('content-addressed pilot objects retain logical references and reject corruption', async () => {
    const value = await fixture()
    const store = fs.mkdtempSync(path.join(os.tmpdir(), 'toolchain-pilot-store-'))
    try {
        const local = publishEvidenceObject(store, value.localReceipt)
        const global = publishEvidenceObject(store, value.globalProjection)
        const pilot = dryRun(value)
        const publication = publishEvidenceObject(store, pilot)
        const loaded = loadEvidenceObject(store, publication.objectSha256).document
        assert.equal(validatePilotReceipt(loaded, {
            localReceipt: loadEvidenceObject(store, local.objectSha256).document,
            globalProjection: loadEvidenceObject(store, global.objectSha256).document,
        }).cohort.runId, pilot.cohort.runId)
        const plan = planC0EvidenceRetention({ storeRoot: store, rootObjectSha256s: [publication.objectSha256] })
        assert.equal(plan.summary.referencedObjects, 3)
        const corrupt = structuredClone(pilot)
        corrupt.result.productionClassification = 'B'
        assert.throws(() => validatePilotReceipt(corrupt, {
            localReceipt: value.localReceipt,
            globalProjection: value.globalProjection,
        }), (error) => error.code === 'CORRUPT_PILOT_RECEIPT')
        assert.notEqual(canonicalJson(corrupt), canonicalJson(pilot))
    } finally {
        fs.rmSync(value.target.root, { recursive: true, force: true })
        fs.rmSync(store, { recursive: true, force: true })
    }
})

test('material mode fails closed without a bound accepted C0 Global cohort', async () => {
    const value = await fixture()
    try {
        assert.throws(() => buildPilotReceipt({
            mode: 'material-shadow',
            localReceipt: value.localReceipt,
            globalProjection: value.globalProjection,
            authority: { ...authority(value.localReceipt), c0CohortId: HASH('7') },
            trialId: 'trial-1',
            materiallyDistinct: true,
        }), (error) => error.code === 'MISSING_MATERIAL_GLOBAL')
    } finally {
        fs.rmSync(value.target.root, { recursive: true, force: true })
    }
})

module.exports = { authority, dryRun, fixture }
