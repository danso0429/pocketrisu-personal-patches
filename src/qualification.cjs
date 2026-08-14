'use strict'

const { jsonSha256 } = require('./capability-contract.cjs')
const { evaluateExecutionReceipt } = require('./verification-receipts.cjs')

const QUALIFICATION_SCHEMA = 'patch-phase7-qualification-v1'

class QualificationError extends Error {
    constructor(code, message, details = {}) {
        super(message)
        this.name = 'QualificationError'
        this.code = code
        this.details = details
    }
}

function percentile(values, fraction) {
    if (!Array.isArray(values) || values.length === 0) throw new QualificationError('EMPTY_QUALIFICATION_SAMPLES', 'Qualification samples are empty')
    const sorted = [...values].sort((left, right) => left - right)
    return sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)]
}

function summarizeResources(samples, safetyFactor) {
    if (!Number.isFinite(safetyFactor) || safetyFactor < 1) throw new QualificationError('INVALID_SAFETY_FACTOR', 'Safety factor must be at least one')
    const classes = [...new Set(samples.map((sample) => sample.class))].sort()
    return classes.map((name) => {
        const current = samples.filter((sample) => sample.class === name)
        const walls = current.map((sample) => sample.wallMs)
        const p95 = percentile(walls, 0.95)
        const productionEligible = current.every((sample) => sample.productionEligible === true)
        return {
            class: name,
            lane: current[0].lane,
            productionEligible,
            samples: current.length,
            wallMs: {
                p50: percentile(walls, 0.5),
                p95,
                p99: percentile(walls, 0.99),
                safetyAdjustedP95: p95 * safetyFactor,
            },
            cpuMs: {
                p95: percentile(current.map((sample) => sample.cpuMs), 0.95),
            },
            maximumRssKiB: Math.max(...current.map((sample) => sample.maximumRssKiB)),
            maximumTemporaryKiB: Math.max(...current.map((sample) => sample.temporaryKiB)),
            maximumEvidenceBytes: Math.max(...current.map((sample) => sample.evidenceBytes)),
            budget: !productionEligible
                ? 'not-eligible'
                : (p95 * safetyFactor <= 60_000 ? 'passed' : 'over-budget'),
        }
    })
}

function oracleSummary(receipt) {
    const evaluation = evaluateExecutionReceipt(receipt)
    if (!evaluation.receiptValid || !evaluation.executionAccepted || receipt.disposition !== 'current-active') {
        throw new QualificationError('QUALIFICATION_ORACLE_REJECTED', 'Canonical oracle receipt is not current-active and accepted')
    }
    let result
    try {
        result = JSON.parse(receipt.execution.stdout)
    } catch (error) {
        throw new QualificationError('QUALIFICATION_ORACLE_OUTPUT_INVALID', 'Canonical oracle stdout is invalid JSON')
    }
    if (result.rawSelections !== 4096 || result.verifiedSelections !== 4096 || result.roundTrips !== 'passed') {
        throw new QualificationError('QUALIFICATION_ORACLE_COVERAGE_INVALID', 'Canonical oracle coverage is incomplete')
    }
    return {
        rawSelections: result.rawSelections,
        verifiedSelections: result.verifiedSelections,
        normalizedGraphs: result.normalizedGraphs,
        managedPaths: result.managedPaths,
        maximumResolvedUnits: result.maximumResolvedUnits,
        roundTrips: result.roundTrips,
        workers: result.workers,
        stdoutSha256: receipt.execution.stdoutSha256,
    }
}

function buildQualificationReceipt({
    referenceOracle,
    candidateOracle,
    shadowReceipt,
    theoremReceipt,
    certificateReport,
    samples,
    safetyFactor,
    adversarialResults,
}) {
    const reference = oracleSummary(referenceOracle)
    const candidate = oracleSummary(candidateOracle)
    const comparisonFields = ['rawSelections', 'verifiedSelections', 'normalizedGraphs', 'managedPaths', 'maximumResolvedUnits', 'roundTrips']
    const mismatches = comparisonFields.filter((field) => reference[field] !== candidate[field])
    const shadowValid = shadowReceipt.status === 'fallback-required'
        && shadowReceipt.coverage.processedExecutions === 0
        && shadowReceipt.canonicalProtection.canonicalExecutionSkipped === false
    const theoremValid = theoremReceipt.outcome === 'global-fallback'
    const certificateValid = certificateReport.recordsGenerated === 0
        && certificateReport.recordsAccepted === 0
        && certificateReport.masksSkipped === 0
    const resources = summarizeResources(samples, safetyFactor)
    const productionLocalClasses = resources.filter((entry) => entry.productionEligible && entry.lane === 'Local')
    const adversarialPassed = Object.values(adversarialResults).every((value) => value === 0 || value === 'passed')
    const passed = mismatches.length === 0
        && shadowValid
        && theoremValid
        && certificateValid
        && productionLocalClasses.length === 0
        && adversarialPassed
    const payload = {
        schema: QUALIFICATION_SCHEMA,
        status: passed ? 'passed-global-only' : 'failed',
        scope: 'conservative-global-only-C0',
        oracleComparison: { reference, candidate, mismatches },
        shadowResults: {
            currentLocalClaims: 0,
            shadowStatus: shadowReceipt.status,
            theoremOutcome: theoremReceipt.outcome,
            productionCertificates: certificateReport.recordsGenerated,
            concreteMasksSkipped: certificateReport.masksSkipped,
        },
        resourceClasses: resources,
        adversarialResults,
        canonicalProtection: {
            canonicalGate: 'Global Exhaustive',
            fallbackRetained: true,
            productionLocalClassesAdmitted: 0,
            policyChanged: false,
            defaultChanged: false,
            productionStateChanged: false,
        },
    }
    return { ...payload, receiptSha256: jsonSha256(payload) }
}

function validateQualificationReceipt(receipt) {
    if (!receipt || receipt.schema !== QUALIFICATION_SCHEMA) throw new QualificationError('INVALID_QUALIFICATION_RECEIPT', 'Qualification receipt schema is invalid')
    const { receiptSha256, ...payload } = receipt
    if (receiptSha256 !== jsonSha256(payload)) throw new QualificationError('QUALIFICATION_HASH_MISMATCH', 'Qualification receipt hash does not match')
    if (receipt.status === 'passed-global-only' && (
        receipt.oracleComparison.mismatches.length !== 0
        || receipt.shadowResults.currentLocalClaims !== 0
        || receipt.shadowResults.concreteMasksSkipped !== 0
        || receipt.canonicalProtection.productionLocalClassesAdmitted !== 0
    )) throw new QualificationError('INVALID_QUALIFICATION_PASS', 'Global-only qualification contains a contradictory success')
    return receipt
}

module.exports = {
    QUALIFICATION_SCHEMA,
    QualificationError,
    buildQualificationReceipt,
    percentile,
    summarizeResources,
    validateQualificationReceipt,
}
