'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const {
    runFreshLocalShadow,
    validateLocalShadowReceipt,
} = require('../src/toolchain-shadow-local.cjs')
const { createToolchainKnownAnswerTarget } = require('../src/toolchain-shadow-known-answer.cjs')
const { COHERENT_OBSERVATION_PHASE } = require('../src/toolchain-shadow-canonical-projection.cjs')
const { loadCatalog } = require('../src/catalog.cjs')
const {
    buildSameGlobalComparison,
    buildSameGlobalReference,
    validateSameGlobalComparison,
} = require('../src/toolchain-shadow-same-global.cjs')
const { canonicalJson, sealDocument } = require('../src/verification-receipts.cjs')

const ROOT = path.resolve(__dirname, '..')

function syntheticTarget() {
    return createToolchainKnownAnswerTarget(ROOT)
}

function resealReceipt(receipt) {
    const { integrity: ignored, ...payload } = receipt
    return sealDocument(payload)
}

test('known-answer local route executes exact off/on masks across all boundaries', async () => {
    const target = syntheticTarget()
    try {
        const operatingCohort = {
            materialInputKey: '1'.repeat(64),
            cohortId: '2'.repeat(64),
            executionAttemptId: '3'.repeat(64),
            frozenDeclarationSha256: '4'.repeat(64),
        }
        const receipt = await runFreshLocalShadow({
            sourceRoot: ROOT,
            targetRoot: target.root,
            targetProvenance: target.provenance,
            disposition: 'synthetic-known-answer',
            compiledContract: target.compiled,
            recordedAt: '2026-08-15T00:00:00.000Z',
            operatingCohort,
        })
        assert.equal(receipt.status, 'passed')
        assert.deepEqual(receipt.coverage, {
            localMasks: 2, boundaryClasses: 4, expectedExecutions: 8, processedExecutions: 8,
        })
        assert.equal(new Set(receipt.observations.map((entry) => entry.processInstanceId)).size, 8)
        assert.equal(new Set(receipt.observations.map((entry) => entry.projectionId)).size, 8)
        assert.ok(receipt.observations.every((entry) => entry.restoration.restored))
        assert.ok(receipt.observations.every((entry) =>
            entry.projectionObservationPhase === COHERENT_OBSERVATION_PHASE))
        const active = receipt.observations.find((entry) => entry.mask === 1)
        const outputs = new Map(active.candidateProjection.candidateState.persistedFiles
            .map((file) => [file.path, [file.outputSha256, file.outputMode]]))
        assert.deepEqual(active.candidateProjection.managedFiles.map((file) =>
            [file.path, file.sha256, file.mode]), [
            ['package.json', ...outputs.get('package.json')],
            ['pnpm-lock.yaml', ...outputs.get('pnpm-lock.yaml')],
            ['vitest.setup.ts', ...outputs.get('vitest.setup.ts')],
        ])
        assert.ok(receipt.observations.every((entry) => entry.restoration.remainingArtifacts.length === 0))
        assert.equal(receipt.candidate.productionClass, 'G')
        assert.equal(receipt.canonicalProtection.canonicalMasksSkipped, 0)
        assert.deepEqual(receipt.operatingCohort, operatingCohort)
        assert.match(receipt.localRunId, /^[0-9a-f]{64}$/)
        assert.equal(validateLocalShadowReceipt(receipt), receipt)
        const reference = buildSameGlobalReference({
            localReceipt: receipt,
            materialDeclarationSha256: '5'.repeat(64),
        })
        assert.deepEqual(Object.keys(reference.referenceProjections), ['0', '1'])
        const visiblePacks = loadCatalog(ROOT).filter((pack) => pack.userSelectable !== false)
            .map((pack) => pack.id).sort()
        const globalObservations = Array.from({ length: 4096 }, (_, mask) => {
            const candidateMask = Math.floor(mask / (2 ** 11)) % 2
            return {
                mask,
                candidateMask,
                projectionSha256: reference.references[String(candidateMask)],
                projectionObservationPhase: COHERENT_OBSERVATION_PHASE,
                ...([0, 2048].includes(mask) ? {
                    candidateProjection: reference.referenceProjections[String(candidateMask)],
                } : {}),
                matchesLocal: true,
            }
        })
        const comparison = buildSameGlobalComparison({
            reference,
            visiblePacks,
            observations: globalObservations,
        })
        assert.deepEqual(Object.keys(comparison.projectionPreimages.globalSamples), ['0', '1'])
        assert.equal(validateSameGlobalComparison(comparison, {
            visiblePacks, rawSelections: 4096, verifiedSelections: 4096,
        }), comparison)
    } finally {
        fs.rmSync(target.root, { recursive: true, force: true })
    }
})

test('local receipt rejects missing, duplicate, and out-of-range masks', async () => {
    const target = syntheticTarget()
    try {
        const receipt = await runFreshLocalShadow({
            sourceRoot: ROOT, targetRoot: target.root, targetProvenance: target.provenance,
            disposition: 'synthetic-known-answer', compiledContract: target.compiled,
        })
        const missing = structuredClone(receipt)
        missing.observations.pop()
        missing.coverage.processedExecutions -= 1
        assert.throws(() => validateLocalShadowReceipt(resealReceipt(missing)), (error) => error.code === 'INCOMPLETE_LOCAL_COVERAGE')
        const duplicate = structuredClone(receipt)
        duplicate.observations[1] = structuredClone(duplicate.observations[0])
        assert.throws(() => validateLocalShadowReceipt(resealReceipt(duplicate)), (error) => error.code === 'DUPLICATE_LOCAL_COVERAGE')
        const range = structuredClone(receipt)
        range.observations[0].mask = 2
        assert.throws(() => validateLocalShadowReceipt(resealReceipt(range)), (error) => error.code === 'OUT_OF_RANGE_LOCAL_COVERAGE')
    } finally {
        fs.rmSync(target.root, { recursive: true, force: true })
    }
})

test('target baseline drift is rejected before a local process starts', async () => {
    const target = syntheticTarget()
    try {
        fs.appendFileSync(path.join(target.root, 'package.json'), ' ')
        await assert.rejects(
            () => runFreshLocalShadow({
                sourceRoot: ROOT, targetRoot: target.root, targetProvenance: target.provenance,
                disposition: 'synthetic-known-answer', compiledContract: target.compiled,
            }),
            (error) => ['TARGET_BASELINE_DRIFT', 'DECLARATION_INPUT_MISMATCH'].includes(error.code),
        )
    } finally {
        fs.rmSync(target.root, { recursive: true, force: true })
    }
})

test('corrupt receipt and weakened production classification are rejected', async () => {
    const target = syntheticTarget()
    try {
        const receipt = await runFreshLocalShadow({
            sourceRoot: ROOT, targetRoot: target.root, targetProvenance: target.provenance,
            disposition: 'synthetic-known-answer', compiledContract: target.compiled,
        })
        const corrupt = structuredClone(receipt)
        corrupt.observations[0].restoration.restored = false
        assert.throws(() => validateLocalShadowReceipt(corrupt), (error) => error.code === 'CORRUPT_LOCAL_RECEIPT')
        const promoted = structuredClone(receipt)
        promoted.candidate.productionClass = 'B'
        assert.throws(() => validateLocalShadowReceipt(resealReceipt(promoted)), (error) => error.code === 'PRODUCTION_CLASSIFICATION_CHANGED')
        assert.notEqual(canonicalJson(promoted), canonicalJson(receipt))
    } finally {
        fs.rmSync(target.root, { recursive: true, force: true })
    }
})

module.exports = { syntheticTarget }
