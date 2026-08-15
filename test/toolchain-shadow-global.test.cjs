'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { loadCatalog } = require('../src/catalog.cjs')
const {
    syntheticGlobalProjection,
    validateGlobalProjectionReceipt,
} = require('../src/toolchain-shadow-global.cjs')
const { createToolchainKnownAnswerTarget } = require('../src/toolchain-shadow-known-answer.cjs')
const { runFreshLocalShadow } = require('../src/toolchain-shadow-local.cjs')
const { sealDocument } = require('../src/verification-receipts.cjs')

const ROOT = path.resolve(__dirname, '..')

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
    const visiblePacks = loadCatalog(ROOT)
        .filter((pack) => pack.userSelectable !== false)
        .map((pack) => pack.id)
        .sort()
    return { target, localReceipt, visiblePacks }
}

function reseal(receipt) {
    const { integrity: ignored, ...payload } = receipt
    return sealDocument(payload)
}

test('synthetic Global projection covers all 4,096 masks without material promotion', async () => {
    const value = await fixture()
    try {
        const receipt = syntheticGlobalProjection({
            localReceipt: value.localReceipt,
            visiblePacks: value.visiblePacks,
            recordedAt: '2026-08-15T00:00:01.000Z',
        })
        assert.equal(receipt.observations.length, 4096)
        assert.equal(receipt.coverage.candidateOffMasks, 2048)
        assert.equal(receipt.coverage.candidateOnMasks, 2048)
        assert.equal(receipt.materialEligibility, 'synthetic-only')
        assert.equal(receipt.canonicalProtection.productionClassification, 'G')
    } finally {
        fs.rmSync(value.target.root, { recursive: true, force: true })
    }
})

test('Global projection rejects missing masks, mismatches, and synthetic promotion', async () => {
    const value = await fixture()
    try {
        const receipt = syntheticGlobalProjection({ localReceipt: value.localReceipt, visiblePacks: value.visiblePacks })
        const missing = structuredClone(receipt)
        missing.observations.pop()
        missing.coverage.processedMasks -= 1
        assert.throws(() => validateGlobalProjectionReceipt(reseal(missing)), (error) => error.code === 'INCOMPLETE_GLOBAL_PROJECTION')
        const mismatch = structuredClone(receipt)
        mismatch.observations[0].matchesLocal = false
        assert.throws(() => validateGlobalProjectionReceipt(reseal(mismatch)), (error) => error.code === 'GLOBAL_LOCAL_MISMATCH')
        mismatch.status = 'failed'
        mismatch.comparison = { mismatches: 1, candidateAdmission: 'denied' }
        assert.equal(validateGlobalProjectionReceipt(reseal(mismatch)).status, 'failed')
        const promoted = structuredClone(receipt)
        promoted.materialEligibility = 'requires-bound-c0-global-receipt'
        assert.throws(() => validateGlobalProjectionReceipt(reseal(promoted)), (error) => error.code === 'SYNTHETIC_PROMOTION')
    } finally {
        fs.rmSync(value.target.root, { recursive: true, force: true })
    }
})

module.exports = { fixture }
