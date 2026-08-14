'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const {
    percentile,
    summarizeResources,
    validateQualificationReceipt,
} = require('../src/qualification.cjs')

test('qualification percentiles use exact nearest-rank samples and a safety factor', () => {
    assert.equal(percentile([1, 2, 3, 4, 5], 0.5), 3)
    assert.equal(percentile([1, 2, 3, 4, 5], 0.95), 5)
    const resources = summarizeResources([
        { class: 'synthetic-local', lane: 'Local', productionEligible: false, wallMs: 100, cpuMs: 80, maximumRssKiB: 10, temporaryKiB: 2, evidenceBytes: 4 },
        { class: 'synthetic-local', lane: 'Local', productionEligible: false, wallMs: 200, cpuMs: 120, maximumRssKiB: 12, temporaryKiB: 3, evidenceBytes: 5 },
        { class: 'eligible-local', lane: 'Local', productionEligible: true, wallMs: 20_000, cpuMs: 10_000, maximumRssKiB: 20, temporaryKiB: 4, evidenceBytes: 6 },
    ], 2)
    assert.equal(resources.find((entry) => entry.class === 'synthetic-local').budget, 'not-eligible')
    assert.equal(resources.find((entry) => entry.class === 'eligible-local').budget, 'passed')
    assert.equal(resources.find((entry) => entry.class === 'eligible-local').wallMs.safetyAdjustedP95, 40_000)
})

test('qualification receipt integrity rejects contradictory or changed success', () => {
    const receipt = {
        schema: 'patch-phase7-qualification-v1',
        status: 'passed-global-only',
        scope: 'conservative-global-only-C0',
        oracleComparison: { mismatches: [] },
        shadowResults: { currentLocalClaims: 0, concreteMasksSkipped: 0 },
        resourceClasses: [],
        adversarialResults: {},
        canonicalProtection: { productionLocalClassesAdmitted: 0 },
    }
    const { jsonSha256 } = require('../src/capability-contract.cjs')
    receipt.receiptSha256 = jsonSha256(receipt)
    validateQualificationReceipt(receipt)
    const changed = structuredClone(receipt)
    changed.shadowResults.concreteMasksSkipped = 1
    const { receiptSha256: ignored, ...payload } = changed
    changed.receiptSha256 = jsonSha256(payload)
    assert.throws(() => validateQualificationReceipt(changed), (error) => error.code === 'INVALID_QUALIFICATION_PASS')
})
