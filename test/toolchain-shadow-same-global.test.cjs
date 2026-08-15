'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const { validateVerificationResult } = require('../src/verification-evidence.cjs')
const {
    buildSameGlobalComparison,
    buildSameGlobalReference,
    validateSameGlobalComparison,
} = require('../src/toolchain-shadow-same-global.cjs')

function localReceipt() {
    const observations = []
    for (const mask of [0, 1]) {
        for (let boundary = 0; boundary < 4; boundary += 1) {
            observations.push({
                mask,
                candidateProjection: { projectionSha256: String(mask + 1).repeat(64) },
            })
        }
    }
    return {
        schema: 'patch-toolchain-shadow-local-receipt-v1',
        declarationSha256: '3'.repeat(64),
        observations,
        integrity: { payloadSha256: '4'.repeat(64) },
    }
}

function canonicalResult(comparison) {
    return {
        visiblePacks: ['base', 'toolchain-hardening'],
        rawSelections: 4,
        verifiedSelections: 4,
        roundTrips: 'passed',
        workers: 1,
        workerHistory: {
            schema: 'patch-combination-worker-history-v1',
            schedule: 'stride-v1',
            workers: [{ workerIndex: 0, orderedMasks: [0, 1, 2, 3] }],
        },
        toolchainShadowComparison: comparison,
    }
}

test('same canonical Global observations compare against one local reference domain', () => {
    const reference = buildSameGlobalReference({
        localReceipt: localReceipt(),
        materialDeclarationSha256: '5'.repeat(64),
    })
    const observations = Array.from({ length: 4 }, (_, mask) => {
        const candidateMask = Math.floor(mask / 2) % 2
        return {
            mask,
            candidateMask,
            projectionSha256: reference.references[String(candidateMask)],
            matchesLocal: true,
        }
    })
    const comparison = buildSameGlobalComparison({
        reference,
        visiblePacks: ['base', 'toolchain-hardening'],
        observations,
    })
    assert.equal(comparison.status, 'passed')
    assert.equal(comparison.mismatches, 0)
    assert.equal(validateSameGlobalComparison(comparison, canonicalResult(comparison)), comparison)
    assert.deepEqual(validateVerificationResult('global-exhaustive', canonicalResult(comparison)), [])
})

test('same-Global mismatch remains an explicit failed candidate comparison', () => {
    const reference = buildSameGlobalReference({
        localReceipt: localReceipt(),
        materialDeclarationSha256: '5'.repeat(64),
    })
    const observations = Array.from({ length: 4 }, (_, mask) => {
        const candidateMask = Math.floor(mask / 2) % 2
        return {
            mask,
            candidateMask,
            projectionSha256: mask === 3 ? 'f'.repeat(64) : reference.references[String(candidateMask)],
            matchesLocal: mask !== 3,
        }
    })
    const comparison = buildSameGlobalComparison({
        reference,
        visiblePacks: ['base', 'toolchain-hardening'],
        observations,
    })
    assert.equal(comparison.status, 'failed')
    assert.equal(comparison.mismatches, 1)
    assert.deepEqual(validateVerificationResult('global-exhaustive', canonicalResult(comparison)), [])
})
