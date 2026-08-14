'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const {
    CORE_CHANGE_CATEGORIES,
    CURRENT_C0_POLICY,
    routeCurrentC0,
    validateC0Decision,
} = require('../src/c0-policy.cjs')

test('current conservative C0 admits no Local or Boundary class', () => {
    assert.equal(CURRENT_C0_POLICY.profile, 'conservative-global-only-C0')
    assert.equal(CURRENT_C0_POLICY.currentAdmissions.local, 0)
    assert.equal(CURRENT_C0_POLICY.currentAdmissions.boundary, 0)
    assert.equal(CURRENT_C0_POLICY.currentCatalogTier, 'G')
    assert.equal(CURRENT_C0_POLICY.defaultVerification.gate, 'Global Exhaustive')
    assert.equal(CURRENT_C0_POLICY.defaultVerification.changed, false)
})

test('every current lane request retains blocking Global Exhaustive', () => {
    for (const requestedLane of ['Local', 'Extended', 'Core', 'Audit', 'Emergency']) {
        const decision = validateC0Decision(routeCurrentC0({
            requestedLane,
            correctness: 'passed',
            budget: 'passed',
        }))
        assert.equal(decision.outcome, 'global-exhaustive-required')
        assert.equal(decision.gate, 'Global Exhaustive')
        assert.equal(decision.blocking, true)
        assert.equal(decision.canonicalProtection.certificatesUsed, 0)
        assert.equal(decision.canonicalProtection.masksSkipped, 0)
    }
})

test('stable releases and every core change category select Core Global', () => {
    const stable = routeCurrentC0({ stableRelease: true })
    assert.equal(stable.effectiveLane, 'Core')
    assert(stable.reasons.includes('stable-release-blocking-global'))
    for (const category of CORE_CHANGE_CATEGORIES) {
        const decision = routeCurrentC0({ changeCategories: [category] })
        assert.equal(decision.effectiveLane, 'Core')
        assert(decision.reasons.includes(`core-change:${category}`))
    }
})

test('correctness failure and budget overrun remain separate global reasons', () => {
    const correctness = routeCurrentC0({ correctness: 'failed', budget: 'passed' })
    const budget = routeCurrentC0({ correctness: 'passed', budget: 'exceeded' })
    assert.equal(correctness.failureClass, 'correctness')
    assert.equal(budget.failureClass, 'budget')
    assert.equal(correctness.gate, 'Global Exhaustive')
    assert.equal(budget.gate, 'Global Exhaustive')
})

test('unsupported U effects reject admission before any gate or mutation', () => {
    const decision = validateC0Decision(routeCurrentC0({ unsupported: true }))
    assert.equal(decision.outcome, 'admission-rejected')
    assert.equal(decision.gate, null)
    assert.equal(decision.canonicalProtection.productionStateChanged, false)
    assert.equal(decision.canonicalProtection.masksSkipped, 0)
})

test('changed or contradictory decisions fail independent validation', () => {
    const decision = routeCurrentC0({ requestedLane: 'Local' })
    const changed = structuredClone(decision)
    changed.canonicalProtection.masksSkipped = 1
    assert.throws(
        () => validateC0Decision(changed),
        (error) => error.code === 'C0_DECISION_HASH_MISMATCH',
    )
    const { decisionSha256: ignored, ...payload } = changed
    const { jsonSha256 } = require('../src/capability-contract.cjs')
    changed.decisionSha256 = jsonSha256(payload)
    assert.throws(
        () => validateC0Decision(changed),
        (error) => error.code === 'C0_GLOBAL_PROTECTION_MISMATCH',
    )
})
