'use strict'

const {
    canonicalJson,
    sealDocument,
    verifyDocumentIntegrity,
} = require('./verification-receipts.cjs')
const {
    canonicalSha256,
    computeCohortId,
    computeRunId,
} = require('./c0-evidence.cjs')
const {
    objectSha256: evidenceObjectSha256,
} = require('./c0-retention.cjs')

const COHORT_LEDGER_SCHEMA = 'patch-c0-cohort-ledger-v1'
const STABLE_RELEASE_LEDGER_SCHEMA = 'patch-c0-stable-release-ledger-v1'
const INCIDENT_RECORD_SCHEMA = 'patch-c0-incident-record-v1'
const DEFECT_YIELD_SCHEMA = 'patch-c0-defect-yield-summary-v1'
const REVIEW_TRIGGER_SCHEMA = 'patch-c0-review-trigger-v1'

const DEFAULT_REVIEW_THRESHOLDS = Object.freeze({
    stableReleases: 3,
    patchCohorts: 4,
    relationCohorts: 3,
    coreCohorts: 2,
    auditCohorts: 3,
    performanceP95Trials: 20,
    performanceP99Trials: 100,
    maximumCorrectnessMismatches: 0,
    maximumIntegrityFailures: 0,
    maximumFalsePasses: 0,
})

const SHA256_PATTERN = /^[0-9a-f]{64}$/
const COMMIT_PATTERN = /^[0-9a-f]{40}$/

function objectSha256(document) {
    return evidenceObjectSha256(document)
}

function validTimestamp(value) {
    return typeof value === 'string'
        && !Number.isNaN(Date.parse(value))
        && new Date(value).toISOString() === value
}

function entrySha256(entry) {
    const { entrySha256: ignored, ...payload } = entry
    return canonicalSha256(payload)
}

function validateBundleLedgerInput(bundle) {
    const errors = []
    if (bundle?.schema !== 'patch-c0-evidence-bundle-v1') errors.push('unsupported C0 evidence bundle schema')
    if (!verifyDocumentIntegrity(bundle)) errors.push('C0 evidence bundle integrity mismatch')
    if (!SHA256_PATTERN.test(bundle?.cohort?.cohortId ?? '')) errors.push('bundle cohortId is invalid')
    if (!SHA256_PATTERN.test(bundle?.cohort?.runId ?? '')) errors.push('bundle runId is invalid')
    if (bundle?.cohort?.cohortId !== computeCohortId(bundle?.cohort?.identity)) errors.push('bundle cohortId mismatch')
    if (bundle?.cohort?.runId !== computeRunId(bundle)) errors.push('bundle runId mismatch')
    if (!validTimestamp(bundle?.recordedAt)) errors.push('bundle timestamp is invalid')
    if (errors.length > 0) throw new Error(`Cannot append invalid C0 bundle: ${errors.join('; ')}`)
}

function createCohortEntry(bundle, sequence, previousEntrySha256) {
    validateBundleLedgerInput(bundle)
    const payload = {
        sequence,
        previousEntrySha256,
        recordType: 'cohort',
        cohortId: bundle.cohort.cohortId,
        runId: bundle.cohort.runId,
        objectSha256: objectSha256(bundle),
        recordedAt: bundle.recordedAt,
        cohortClass: bundle.cohort.cohortClass,
        materiallyDistinct: bundle.cohort.materiallyDistinct,
        repeatedPerformanceTrial: bundle.cohort.repeatedPerformanceTrial,
        productionEligible: bundle.cohort.productionEligible,
        syntheticMutation: bundle.cohort.syntheticMutation,
        disposition: bundle.disposition,
        accepted: bundle.runKind === 'production-c0'
            && bundle.correctness?.status === 'passed'
            && bundle.globalReceipt?.accepted === true,
    }
    return { ...payload, entrySha256: canonicalSha256(payload) }
}

function validateCohortLedger(ledger, { expectedKind = null } = {}) {
    const errors = []
    if (ledger?.schema !== COHORT_LEDGER_SCHEMA) errors.push('unsupported cohort ledger schema')
    if (!['cohort', 'incident-index'].includes(ledger?.ledgerKind)) errors.push('unknown cohort ledger kind')
    if (expectedKind !== null && ledger?.ledgerKind !== expectedKind) errors.push('cohort ledger kind mismatch')
    if (!validTimestamp(ledger?.generatedAt)) errors.push('cohort ledger timestamp is invalid')
    if (ledger?.baseLedgerObjectSha256 !== null && !SHA256_PATTERN.test(ledger?.baseLedgerObjectSha256 ?? '')) {
        errors.push('cohort ledger base hash is invalid')
    }
    if (!verifyDocumentIntegrity(ledger)) errors.push('cohort ledger integrity mismatch')
    if (!Array.isArray(ledger?.entries)) {
        errors.push('cohort ledger entries are missing')
        return { valid: false, errors }
    }
    const objectHashes = new Set()
    const runIds = new Set()
    for (let index = 0; index < ledger.entries.length; index += 1) {
        const entry = ledger.entries[index]
        if (entry?.sequence !== index) errors.push(`cohort ledger sequence mismatch at ${index}`)
        const expectedPrevious = index === 0 ? null : ledger.entries[index - 1].entrySha256
        if (entry?.previousEntrySha256 !== expectedPrevious) errors.push(`cohort ledger chain mismatch at ${index}`)
        if (entry?.entrySha256 !== entrySha256(entry)) errors.push(`cohort ledger entry hash mismatch at ${index}`)
        if (entry?.recordType !== (ledger.ledgerKind === 'cohort' ? 'cohort' : 'incident')) {
            errors.push(`cohort ledger record type mismatch at ${index}`)
        }
        for (const [field, values] of [['objectSha256', objectHashes], ['runId', runIds]]) {
            if (!SHA256_PATTERN.test(entry?.[field] ?? '')) errors.push(`cohort ledger ${field} is invalid at ${index}`)
            else if (values.has(entry[field])) errors.push(`duplicate cohort ledger ${field}: ${entry[field]}`)
            else values.add(entry[field])
        }
    }
    return { valid: errors.length === 0, errors }
}

function buildCohortLedger(bundles, {
    baseLedger = null,
    generatedAt = new Date().toISOString(),
} = {}) {
    if (!Array.isArray(bundles)) throw new Error('Cohort ledger bundles must be an array')
    let entries = []
    let baseLedgerObjectSha256 = null
    if (baseLedger !== null) {
        const evaluation = validateCohortLedger(baseLedger, { expectedKind: 'cohort' })
        if (!evaluation.valid) throw new Error(`Base cohort ledger is invalid: ${evaluation.errors.join('; ')}`)
        entries = structuredClone(baseLedger.entries)
        baseLedgerObjectSha256 = objectSha256(baseLedger)
    }
    const seenObjects = new Set(entries.map((entry) => entry.objectSha256))
    const seenRuns = new Set(entries.map((entry) => entry.runId))
    const ordered = [...bundles].sort((left, right) => {
        const time = left.recordedAt.localeCompare(right.recordedAt)
        return time === 0 ? left.cohort.runId.localeCompare(right.cohort.runId) : time
    })
    for (const bundle of ordered) {
        const objectHash = objectSha256(bundle)
        if (seenObjects.has(objectHash)) throw new Error(`Duplicate cohort bundle object: ${objectHash}`)
        if (seenRuns.has(bundle?.cohort?.runId)) throw new Error(`Duplicate cohort runId: ${bundle?.cohort?.runId}`)
        const previous = entries.length === 0 ? null : entries.at(-1).entrySha256
        const entry = createCohortEntry(bundle, entries.length, previous)
        entries.push(entry)
        seenObjects.add(objectHash)
        seenRuns.add(entry.runId)
    }
    const ledger = sealDocument({
        schema: COHORT_LEDGER_SCHEMA,
        ledgerKind: 'cohort',
        generatedAt,
        baseLedgerObjectSha256,
        entries,
    })
    const evaluation = validateCohortLedger(ledger, { expectedKind: 'cohort' })
    if (!evaluation.valid) throw new Error(`Generated cohort ledger is invalid: ${evaluation.errors.join('; ')}`)
    return ledger
}

function stableReleaseEntry(record, sequence, previousEntrySha256) {
    const bundle = record?.bundle
    validateBundleLedgerInput(bundle)
    if (bundle.cohort.cohortClass !== 'stable-release') {
        throw new Error('Stable-release ledger input does not reference a stable-release cohort')
    }
    if (typeof record.releaseId !== 'string' || record.releaseId === '') throw new Error('Stable releaseId is missing')
    if (typeof record.releaseTag !== 'string' || record.releaseTag === '') throw new Error('Stable releaseTag is missing')
    if (!['passed', 'failed', 'incomplete', 'not-run'].includes(record.productGateResult)) {
        throw new Error('Stable product-gate result is invalid')
    }
    const payload = {
        sequence,
        previousEntrySha256,
        releaseId: record.releaseId,
        releaseTag: record.releaseTag,
        implementationCommit: bundle.authority.implementation.commit,
        cohortId: bundle.cohort.cohortId,
        runId: bundle.cohort.runId,
        bundleObjectSha256: objectSha256(bundle),
        globalReceiptObjectSha256: bundle.globalReceipt.objectSha256,
        productGateResult: record.productGateResult,
        recordedAt: bundle.recordedAt,
        disposition: bundle.disposition,
    }
    return { ...payload, entrySha256: canonicalSha256(payload) }
}

function validateStableReleaseLedger(ledger) {
    const errors = []
    if (ledger?.schema !== STABLE_RELEASE_LEDGER_SCHEMA) errors.push('unsupported stable-release ledger schema')
    if (!validTimestamp(ledger?.generatedAt)) errors.push('stable-release ledger timestamp is invalid')
    if (ledger?.baseLedgerObjectSha256 !== null && !SHA256_PATTERN.test(ledger?.baseLedgerObjectSha256 ?? '')) {
        errors.push('stable-release base ledger hash is invalid')
    }
    if (!verifyDocumentIntegrity(ledger)) errors.push('stable-release ledger integrity mismatch')
    if (!Array.isArray(ledger?.entries)) {
        errors.push('stable-release ledger entries are missing')
        return { valid: false, errors }
    }
    const releaseIds = new Set()
    const releaseTags = new Set()
    for (let index = 0; index < ledger.entries.length; index += 1) {
        const entry = ledger.entries[index]
        const previous = index === 0 ? null : ledger.entries[index - 1].entrySha256
        if (entry?.sequence !== index) errors.push(`stable-release sequence mismatch at ${index}`)
        if (entry?.previousEntrySha256 !== previous) errors.push(`stable-release chain mismatch at ${index}`)
        if (entry?.entrySha256 !== entrySha256(entry)) errors.push(`stable-release entry hash mismatch at ${index}`)
        if (!COMMIT_PATTERN.test(entry?.implementationCommit ?? '')) errors.push(`stable-release commit is invalid at ${index}`)
        for (const [field, values] of [['releaseId', releaseIds], ['releaseTag', releaseTags]]) {
            if (typeof entry?.[field] !== 'string' || entry[field] === '') errors.push(`stable-release ${field} is missing at ${index}`)
            else if (values.has(entry[field])) errors.push(`duplicate stable-release ${field}: ${entry[field]}`)
            else values.add(entry[field])
        }
    }
    return { valid: errors.length === 0, errors }
}

function buildStableReleaseLedger(records, {
    baseLedger = null,
    generatedAt = new Date().toISOString(),
} = {}) {
    if (!Array.isArray(records)) throw new Error('Stable release records must be an array')
    let entries = []
    let baseLedgerObjectSha256 = null
    if (baseLedger !== null) {
        const evaluation = validateStableReleaseLedger(baseLedger)
        if (!evaluation.valid) throw new Error(`Base stable-release ledger is invalid: ${evaluation.errors.join('; ')}`)
        entries = structuredClone(baseLedger.entries)
        baseLedgerObjectSha256 = objectSha256(baseLedger)
    }
    const releaseIds = new Set(entries.map((entry) => entry.releaseId))
    const releaseTags = new Set(entries.map((entry) => entry.releaseTag))
    const ordered = [...records].sort((left, right) => left.bundle.recordedAt.localeCompare(right.bundle.recordedAt))
    for (const record of ordered) {
        if (releaseIds.has(record.releaseId)) throw new Error(`Duplicate stable releaseId: ${record.releaseId}`)
        if (releaseTags.has(record.releaseTag)) throw new Error(`Duplicate stable releaseTag: ${record.releaseTag}`)
        const previous = entries.length === 0 ? null : entries.at(-1).entrySha256
        const entry = stableReleaseEntry(record, entries.length, previous)
        entries.push(entry)
        releaseIds.add(entry.releaseId)
        releaseTags.add(entry.releaseTag)
    }
    const ledger = sealDocument({
        schema: STABLE_RELEASE_LEDGER_SCHEMA,
        generatedAt,
        baseLedgerObjectSha256,
        entries,
    })
    const evaluation = validateStableReleaseLedger(ledger)
    if (!evaluation.valid) throw new Error(`Generated stable-release ledger is invalid: ${evaluation.errors.join('; ')}`)
    return ledger
}

function incidentPayloadWithoutId(record) {
    const { integrity, ...payload } = record
    return { ...payload, incidentId: null }
}

function computeIncidentId(record) {
    return canonicalSha256(incidentPayloadWithoutId(record))
}

function finalizeIncidentRecord(draft, { previousRecord = null } = {}) {
    const sequence = previousRecord === null ? 0 : previousRecord.sequence + 1
    const previousIncidentSha256 = previousRecord === null ? null : objectSha256(previousRecord)
    const negativeEvidence = [...new Set(draft.negativeEvidenceObjectSha256s ?? [])].sort()
    if (!negativeEvidence.includes(draft.bundleObjectSha256)) negativeEvidence.push(draft.bundleObjectSha256)
    negativeEvidence.sort()
    const syntheticMutation = draft.syntheticMutation === true || draft.attribution === 'synthetic-mutation'
    const payload = {
        ...draft,
        incidentId: null,
        sequence,
        previousIncidentSha256,
        syntheticMutation,
        productionDefectEligible: syntheticMutation ? false : draft.productionDefectEligible === true,
        negativeEvidenceObjectSha256s: negativeEvidence,
    }
    const incidentId = computeIncidentId(payload)
    const record = sealDocument({ ...payload, incidentId })
    const evaluation = validateIncidentRecord(record, { previousRecord })
    if (!evaluation.valid) throw new Error(`Generated incident record is invalid: ${evaluation.errors.join('; ')}`)
    return record
}

function validateIncidentRecord(record, { previousRecord = null } = {}) {
    const errors = []
    if (record?.schema !== INCIDENT_RECORD_SCHEMA) errors.push('unsupported incident record schema')
    if (!verifyDocumentIntegrity(record)) errors.push('incident record integrity mismatch')
    const expectedSequence = previousRecord === null ? 0 : previousRecord.sequence + 1
    const expectedPrevious = previousRecord === null ? null : objectSha256(previousRecord)
    if (record?.sequence !== expectedSequence) errors.push('incident sequence mismatch')
    if (record?.previousIncidentSha256 !== expectedPrevious) errors.push('incident chain mismatch')
    if (record?.incidentId !== computeIncidentId(record)) errors.push('incidentId mismatch')
    for (const field of ['cohortId', 'runId', 'bundleObjectSha256']) {
        if (!SHA256_PATTERN.test(record?.[field] ?? '')) errors.push(`incident ${field} is invalid`)
    }
    if (!validTimestamp(record?.recordedAt)) errors.push('incident timestamp is invalid')
    if (!Array.isArray(record?.negativeEvidenceObjectSha256s)
        || record.negativeEvidenceObjectSha256s.length === 0
        || record.negativeEvidenceObjectSha256s.some((value) => !SHA256_PATTERN.test(value))
        || new Set(record.negativeEvidenceObjectSha256s).size !== record.negativeEvidenceObjectSha256s.length
        || canonicalJson(record.negativeEvidenceObjectSha256s) !== canonicalJson([...record.negativeEvidenceObjectSha256s].sort())) {
        errors.push('incident negative evidence references are invalid')
    } else if (!record.negativeEvidenceObjectSha256s.includes(record.bundleObjectSha256)) {
        errors.push('incident negative evidence does not retain the original bundle')
    }
    if (record?.syntheticMutation === true && record?.productionDefectEligible !== false) {
        errors.push('synthetic mutation is incorrectly eligible for production defect yield')
    }
    if (!['caught', 'missed', 'not-run', 'not-applicable', 'unknown'].includes(record?.detectors?.focused)
        || !['caught', 'missed', 'not-run', 'not-applicable', 'unknown'].includes(record?.detectors?.global)
        || !['caught', 'missed', 'not-run', 'not-applicable', 'unknown'].includes(record?.detectors?.product)) {
        errors.push('incident detector evidence is invalid')
    }
    return { valid: errors.length === 0, errors }
}

function validateIncidentChain(records) {
    const errors = []
    if (!Array.isArray(records)) return { valid: false, errors: ['incident chain is not an array'] }
    const ids = new Set()
    for (let index = 0; index < records.length; index += 1) {
        const evaluation = validateIncidentRecord(records[index], {
            previousRecord: index === 0 ? null : records[index - 1],
        })
        errors.push(...evaluation.errors.map((error) => `incident ${index}: ${error}`))
        if (ids.has(records[index]?.incidentId)) errors.push(`duplicate incidentId at ${index}`)
        ids.add(records[index]?.incidentId)
    }
    return { valid: errors.length === 0, errors }
}

function productionCohortEntries(ledger) {
    return ledger.entries.filter((entry) => entry.recordType === 'cohort'
        && entry.productionEligible
        && !entry.syntheticMutation
        && entry.materiallyDistinct)
}

function productionDefect(record) {
    return record.productionDefectEligible === true
        && record.syntheticMutation === false
        && ['implementation-defect', 'target-defect'].includes(record.attribution)
}

function buildDefectYieldSummary(cohortLedger, incidentRecords, {
    generatedAt = new Date().toISOString(),
} = {}) {
    const cohortEvaluation = validateCohortLedger(cohortLedger, { expectedKind: 'cohort' })
    if (!cohortEvaluation.valid) throw new Error(`Cohort ledger is invalid: ${cohortEvaluation.errors.join('; ')}`)
    const incidentEvaluation = validateIncidentChain(incidentRecords)
    if (!incidentEvaluation.valid) throw new Error(`Incident chain is invalid: ${incidentEvaluation.errors.join('; ')}`)
    const eligible = incidentRecords.filter(productionDefect)
    const syntheticIncidentsExcluded = incidentRecords.filter((record) =>
        record.syntheticMutation === true || record.attribution === 'synthetic-mutation').length
    const globalCaughtRecords = eligible.filter((record) => record.detectors.global === 'caught')
    const globalUnique = globalCaughtRecords.filter((record) =>
        ['missed', 'not-applicable'].includes(record.detectors.focused)
        && ['missed', 'not-applicable'].includes(record.detectors.product))
    const unknownEarlier = globalCaughtRecords.filter((record) =>
        ['unknown', 'not-run'].includes(record.detectors.focused)
        || ['unknown', 'not-run'].includes(record.detectors.product))
    return sealDocument({
        schema: DEFECT_YIELD_SCHEMA,
        generatedAt,
        cohortLedgerObjectSha256: objectSha256(cohortLedger),
        incidentRecordObjectSha256s: incidentRecords.map(objectSha256),
        productionCohorts: new Set(productionCohortEntries(cohortLedger).map((entry) => entry.cohortId)).size,
        confirmedProductionDefects: eligible.length,
        syntheticIncidentsExcluded,
        globalCaught: globalCaughtRecords.length,
        globalUniqueYield: globalUnique.length,
        alsoCaughtByFocused: globalCaughtRecords.filter((record) => record.detectors.focused === 'caught').length,
        alsoCaughtByProduct: globalCaughtRecords.filter((record) => record.detectors.product === 'caught').length,
        unknownEarlierGateResult: unknownEarlier.length,
    })
}

function triggerCondition(id, observed, required, mode = 'minimum') {
    return {
        id,
        satisfied: mode === 'minimum' ? observed >= required : observed <= required,
        required,
        observed,
    }
}

function buildReviewTriggerReport({
    cohortLedger,
    stableReleaseLedger,
    incidentRecords,
    thresholds = DEFAULT_REVIEW_THRESHOLDS,
    generatedAt = new Date().toISOString(),
}) {
    const cohortEvaluation = validateCohortLedger(cohortLedger, { expectedKind: 'cohort' })
    if (!cohortEvaluation.valid) throw new Error(`Cohort ledger is invalid: ${cohortEvaluation.errors.join('; ')}`)
    const stableEvaluation = validateStableReleaseLedger(stableReleaseLedger)
    if (!stableEvaluation.valid) throw new Error(`Stable-release ledger is invalid: ${stableEvaluation.errors.join('; ')}`)
    const incidentEvaluation = validateIncidentChain(incidentRecords)
    if (!incidentEvaluation.valid) throw new Error(`Incident chain is invalid: ${incidentEvaluation.errors.join('; ')}`)
    const material = productionCohortEntries(cohortLedger).filter((entry) => entry.accepted)
    const distinctByClass = Object.fromEntries(['patch', 'relation', 'core', 'audit'].map((cohortClass) => [
        cohortClass,
        new Set(material.filter((entry) => entry.cohortClass === cohortClass).map((entry) => entry.cohortId)).size,
    ]))
    const performanceTrials = cohortLedger.entries.filter((entry) => entry.productionEligible
        && entry.repeatedPerformanceTrial
        && !entry.syntheticMutation
        && entry.accepted).length
    const correctnessMismatches = cohortLedger.entries.filter((entry) => entry.productionEligible
        && !entry.syntheticMutation
        && !entry.accepted).length
    const integrityFailures = incidentRecords.filter((record) => record.attribution === 'harness-defect'
        && record.productionDefectEligible).length
    const falsePasses = incidentRecords.filter((record) => productionDefect(record)
        && record.detectors.global === 'missed').length
    const unresolvedIncidents = incidentRecords.filter((record) => productionDefect(record)
        && (record.rootCause === null || record.fix === null || record.disposition === 'current-active')).length
    const observed = {
        stableReleases: new Set(stableReleaseLedger.entries.filter((entry) =>
            entry.productGateResult === 'passed'
            && entry.disposition === 'current-active').map((entry) => entry.releaseId)).size,
        patchCohorts: distinctByClass.patch,
        relationCohorts: distinctByClass.relation,
        coreCohorts: distinctByClass.core,
        auditCohorts: distinctByClass.audit,
        performanceTrials,
        correctnessMismatches,
        integrityFailures,
        falsePasses,
        unresolvedIncidents,
    }
    const conditions = [
        triggerCondition('stable-releases', observed.stableReleases, thresholds.stableReleases),
        triggerCondition('patch-cohorts', observed.patchCohorts, thresholds.patchCohorts),
        triggerCondition('relation-cohorts', observed.relationCohorts, thresholds.relationCohorts),
        triggerCondition('core-cohorts', observed.coreCohorts, thresholds.coreCohorts),
        triggerCondition('audit-cohorts', observed.auditCohorts, thresholds.auditCohorts),
        triggerCondition('performance-p95-trials', observed.performanceTrials, thresholds.performanceP95Trials),
        triggerCondition('performance-p99-trials', observed.performanceTrials, thresholds.performanceP99Trials),
        triggerCondition('correctness-mismatches', observed.correctnessMismatches, thresholds.maximumCorrectnessMismatches, 'maximum'),
        triggerCondition('integrity-failures', observed.integrityFailures, thresholds.maximumIntegrityFailures, 'maximum'),
        triggerCondition('false-passes', observed.falsePasses, thresholds.maximumFalsePasses, 'maximum'),
        triggerCondition('unresolved-incidents', observed.unresolvedIncidents, 0, 'maximum'),
    ]
    return sealDocument({
        schema: REVIEW_TRIGGER_SCHEMA,
        generatedAt,
        thresholds: { ...thresholds },
        observed,
        conditions,
        recommendation: conditions.every((condition) => condition.satisfied)
            ? 'ready-for-read-only-phase-9-review'
            : 'not-ready',
        c1Authorized: false,
    })
}

module.exports = {
    COHORT_LEDGER_SCHEMA,
    DEFAULT_REVIEW_THRESHOLDS,
    DEFECT_YIELD_SCHEMA,
    INCIDENT_RECORD_SCHEMA,
    REVIEW_TRIGGER_SCHEMA,
    STABLE_RELEASE_LEDGER_SCHEMA,
    buildCohortLedger,
    buildDefectYieldSummary,
    buildReviewTriggerReport,
    buildStableReleaseLedger,
    computeIncidentId,
    finalizeIncidentRecord,
    objectSha256,
    productionDefect,
    validateCohortLedger,
    validateIncidentChain,
    validateIncidentRecord,
    validateStableReleaseLedger,
}
