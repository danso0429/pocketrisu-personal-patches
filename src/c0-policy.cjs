'use strict'

const { jsonSha256 } = require('./capability-contract.cjs')

const C0_POLICY_SCHEMA = 'patch-c0-policy-v1'
const C0_DECISION_SCHEMA = 'patch-c0-route-decision-v1'
const LANES = Object.freeze(['Local', 'Extended', 'Core', 'Audit', 'Emergency'])
const CORE_CHANGE_CATEGORIES = Object.freeze([
    'capability-enforcer',
    'catalog-loader',
    'certificate-store',
    'certificate-verifier',
    'compose',
    'global-exhaustive-checker',
    'hypergraph',
    'manager',
    'policy',
    'resolver',
    'revert',
    'scheduler-history',
    'state-migration',
    'state-schema',
    'status',
    'transaction',
])

class C0PolicyError extends Error {
    constructor(code, message, details = {}) {
        super(message)
        this.name = 'C0PolicyError'
        this.code = code
        this.details = details
    }
}

const CURRENT_C0_POLICY = Object.freeze({
    schema: C0_POLICY_SCHEMA,
    version: 1,
    profile: 'conservative-global-only-C0',
    supportContract: Object.freeze({
        L: Object.freeze({
            name: 'Local Certified',
            requirement: 'sealed local effects, complete theorem premises, fresh local coverage and exact verified evidence',
            currentAdmissions: 0,
        }),
        B: Object.freeze({
            name: 'Boundary Certified',
            requirement: 'typed complete boundary classes plus every Local requirement',
            currentAdmissions: 0,
        }),
        G: Object.freeze({
            name: 'Global',
            requirement: 'blocking Global Exhaustive',
            currentCatalogDisposition: 'all-current-packs',
        }),
        U: Object.freeze({
            name: 'Unsupported',
            requirement: 'admission rejection before mutation',
        }),
    }),
    lanes: Object.freeze({
        Local: Object.freeze({
            currentAdmission: 'none',
            unavailableAction: 'Global Exhaustive fallback',
        }),
        Extended: Object.freeze({ gate: 'Global Exhaustive', blocking: true }),
        Core: Object.freeze({ gate: 'Global Exhaustive', blocking: true }),
        Audit: Object.freeze({ gate: 'Global Exhaustive', blocking: true }),
        Emergency: Object.freeze({
            gate: 'Global Exhaustive',
            blocking: true,
            reducedGateApproved: false,
        }),
    }),
    currentAdmissions: Object.freeze({ local: 0, boundary: 0 }),
    currentCatalogTier: 'G',
    defaultVerification: Object.freeze({
        command: 'npm run verify:combinations -- --root PRISTINE_TARGET --json',
        gate: 'Global Exhaustive',
        changed: false,
    }),
    independentFallback: Object.freeze({
        command: 'npm run verify:combinations -- --root PRISTINE_TARGET --json',
        required: true,
    }),
    rollback: Object.freeze({
        action: 'remove the C0 routing layer and invoke the independent fallback',
        stateMigrationRequired: false,
        evidenceDeletionRequired: false,
    }),
})

function normalizeCategories(values) {
    if (!Array.isArray(values)) throw new C0PolicyError('INVALID_CHANGE_CATEGORIES', 'Change categories must be an array')
    const normalized = [...new Set(values)]
    if (normalized.some((value) => typeof value !== 'string' || value.length === 0)) {
        throw new C0PolicyError('INVALID_CHANGE_CATEGORY', 'Every change category must be a non-empty string')
    }
    return normalized.sort()
}

function routeCurrentC0({
    requestedLane = null,
    changeCategories = [],
    stableRelease = false,
    dispute = false,
    evidenceConsistent = true,
    correctness = 'unknown',
    budget = 'unknown',
    unsupported = false,
} = {}) {
    if (requestedLane !== null && !LANES.includes(requestedLane)) {
        throw new C0PolicyError('UNKNOWN_C0_LANE', `Unknown C0 lane: ${requestedLane}`)
    }
    if (!['passed', 'failed', 'unknown'].includes(correctness)) {
        throw new C0PolicyError('INVALID_CORRECTNESS_RESULT', 'Correctness must be passed, failed or unknown')
    }
    if (!['passed', 'exceeded', 'unknown'].includes(budget)) {
        throw new C0PolicyError('INVALID_BUDGET_RESULT', 'Budget must be passed, exceeded or unknown')
    }
    const categories = normalizeCategories(changeCategories)
    if (unsupported) {
        const payload = {
            schema: C0_DECISION_SCHEMA,
            policyVersion: CURRENT_C0_POLICY.version,
            outcome: 'admission-rejected',
            requestedLane,
            effectiveLane: null,
            gate: null,
            blocking: true,
            reasons: ['unsupported-U-effect'],
            failureClass: correctness === 'failed' ? 'correctness' : null,
            changeCategories: categories,
            canonicalProtection: {
                globalFallbackRetained: true,
                defaultChanged: false,
                productionStateChanged: false,
                certificatesUsed: 0,
                masksSkipped: 0,
            },
        }
        return { ...payload, decisionSha256: jsonSha256(payload) }
    }

    const coreReasons = []
    if (stableRelease) coreReasons.push('stable-release-blocking-global')
    if (dispute) coreReasons.push('dispute-blocking-global')
    if (!evidenceConsistent) coreReasons.push('inconsistent-evidence-blocking-global')
    for (const category of categories) {
        if (CORE_CHANGE_CATEGORIES.includes(category)) coreReasons.push(`core-change:${category}`)
    }

    let effectiveLane = requestedLane ?? 'Extended'
    const reasons = [...coreReasons]
    if (coreReasons.length > 0) effectiveLane = 'Core'
    else if (requestedLane === 'Local') {
        effectiveLane = 'Extended'
        reasons.push('no-production-local-or-boundary-admission')
    } else if (requestedLane === 'Emergency') {
        reasons.push('emergency-reduced-gate-not-approved')
    }
    if (budget === 'exceeded') reasons.push('local-budget-exceeded')
    if (budget === 'unknown') reasons.push('local-budget-unknown')
    if (correctness === 'failed') reasons.push('correctness-failed')
    if (correctness === 'unknown') reasons.push('correctness-unknown')
    if (reasons.length === 0) reasons.push('current-catalog-tier-G')

    const payload = {
        schema: C0_DECISION_SCHEMA,
        policyVersion: CURRENT_C0_POLICY.version,
        outcome: 'global-exhaustive-required',
        requestedLane,
        effectiveLane,
        gate: 'Global Exhaustive',
        blocking: true,
        reasons: [...new Set(reasons)].sort(),
        failureClass: correctness === 'failed'
            ? 'correctness'
            : (budget === 'exceeded' ? 'budget' : null),
        changeCategories: categories,
        canonicalProtection: {
            globalFallbackRetained: true,
            defaultChanged: false,
            productionStateChanged: false,
            certificatesUsed: 0,
            masksSkipped: 0,
        },
    }
    return { ...payload, decisionSha256: jsonSha256(payload) }
}

function validateC0Decision(decision) {
    if (!decision || decision.schema !== C0_DECISION_SCHEMA) {
        throw new C0PolicyError('INVALID_C0_DECISION', 'C0 decision schema is invalid')
    }
    const { decisionSha256, ...payload } = decision
    if (decisionSha256 !== jsonSha256(payload)) {
        throw new C0PolicyError('C0_DECISION_HASH_MISMATCH', 'C0 decision hash does not match')
    }
    if (decision.outcome === 'global-exhaustive-required' && (
        decision.gate !== 'Global Exhaustive'
        || decision.blocking !== true
        || decision.canonicalProtection.globalFallbackRetained !== true
        || decision.canonicalProtection.masksSkipped !== 0
        || decision.canonicalProtection.certificatesUsed !== 0
    )) {
        throw new C0PolicyError('C0_GLOBAL_PROTECTION_MISMATCH', 'Global C0 decision weakens canonical protection')
    }
    if (decision.outcome === 'admission-rejected' && decision.gate !== null) {
        throw new C0PolicyError('C0_UNSUPPORTED_GATE_PRESENT', 'Unsupported admission must not select an execution gate')
    }
    if (!['global-exhaustive-required', 'admission-rejected'].includes(decision.outcome)) {
        throw new C0PolicyError('UNKNOWN_C0_OUTCOME', `Unknown C0 outcome: ${decision.outcome}`)
    }
    return decision
}

module.exports = {
    C0_DECISION_SCHEMA,
    C0_POLICY_SCHEMA,
    C0PolicyError,
    CORE_CHANGE_CATEGORIES,
    CURRENT_C0_POLICY,
    LANES,
    routeCurrentC0,
    validateC0Decision,
}
