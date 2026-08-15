'use strict'

const {
    canonicalJson,
    sealDocument,
    verifyDocumentIntegrity,
} = require('./verification-receipts.cjs')
const {
    canonicalSha256,
    computeCohortId,
    computeEvidenceBundleId,
    computeRunId,
} = require('./c0-evidence.cjs')
const {
    objectSha256: evidenceObjectSha256,
} = require('./c0-retention.cjs')

const COHORT_LEDGER_SCHEMA = 'patch-c0-cohort-ledger-v1'
const COHORT_LEDGER_SCHEMA_V2 = 'patch-c0-cohort-ledger-v2'
const STABLE_RELEASE_LEDGER_SCHEMA = 'patch-c0-stable-release-ledger-v1'
const STABLE_RELEASE_LEDGER_SCHEMA_V2 = 'patch-c0-stable-release-ledger-v2'
const INCIDENT_RECORD_SCHEMA = 'patch-c0-incident-record-v1'
const INCIDENT_RECORD_SCHEMA_V2 = 'patch-c0-incident-record-v2'
const DEFECT_YIELD_SCHEMA = 'patch-c0-defect-yield-summary-v1'
const REVIEW_TRIGGER_SCHEMA = 'patch-c0-review-trigger-v1'
const CANDIDATE_OPERATING_SAMPLE_LEDGER_SCHEMA = 'patch-toolchain-shadow-operating-sample-ledger-v1'

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
    const v2 = bundle?.schema === 'patch-c0-evidence-bundle-v2'
    if (!['patch-c0-evidence-bundle-v1', 'patch-c0-evidence-bundle-v2'].includes(bundle?.schema)) {
        errors.push('unsupported C0 evidence bundle schema')
    }
    if (!verifyDocumentIntegrity(bundle)) errors.push('C0 evidence bundle integrity mismatch')
    if (!SHA256_PATTERN.test(bundle?.cohort?.cohortId ?? '')) errors.push('bundle cohortId is invalid')
    if (v2) {
        for (const field of ['materialInputKey', 'executionAttemptId']) {
            if (!SHA256_PATTERN.test(bundle?.cohort?.[field] ?? '')) errors.push(`bundle ${field} is invalid`)
        }
        if (!SHA256_PATTERN.test(bundle?.evidenceBundleId ?? '')) errors.push('bundle evidenceBundleId is invalid')
        if (!SHA256_PATTERN.test(bundle?.globalReceipt?.globalRunId ?? '')) errors.push('bundle globalRunId is invalid')
        if (bundle?.cohort?.cohortId !== canonicalSha256(bundle?.cohort?.identity)) errors.push('bundle cohortId mismatch')
        if (bundle?.evidenceBundleId !== computeEvidenceBundleId(bundle)) errors.push('bundle evidenceBundleId mismatch')
    } else {
        if (!SHA256_PATTERN.test(bundle?.cohort?.runId ?? '')) errors.push('bundle runId is invalid')
        if (bundle?.cohort?.cohortId !== computeCohortId(bundle?.cohort?.identity)) errors.push('bundle cohortId mismatch')
        if (bundle?.cohort?.runId !== computeRunId(bundle)) errors.push('bundle runId mismatch')
    }
    if (!validTimestamp(bundle?.recordedAt)) errors.push('bundle timestamp is invalid')
    if (errors.length > 0) throw new Error(`Cannot append invalid C0 bundle: ${errors.join('; ')}`)
}

function createCohortEntry(bundle, sequence, previousEntrySha256) {
    validateBundleLedgerInput(bundle)
    const v2 = bundle.schema === 'patch-c0-evidence-bundle-v2'
    const combinedAccepted = bundle.frozenDeclaration?.route?.routeId
        !== 'material-c0-global-plus-toolchain-shadow'
        || (bundle.attemptEvidence?.sameGlobalStatus === 'passed'
            && bundle.attemptEvidence?.differentialUnexpectedMismatches === 0
            && SHA256_PATTERN.test(bundle.attemptEvidence?.localRunId ?? ''))
    const focusedAccepted = !v2 || bundle.gates?.focused?.every((gate) =>
        ['passed', 'not-applicable'].includes(gate?.result)) === true
    const payload = {
        sequence,
        previousEntrySha256,
        recordType: 'cohort',
        cohortId: bundle.cohort.cohortId,
        ...(v2 ? {
            materialInputKey: bundle.cohort.materialInputKey,
            executionAttemptId: bundle.cohort.executionAttemptId,
            evidenceBundleId: bundle.evidenceBundleId,
            globalRunId: bundle.globalReceipt.globalRunId,
            localRunId: bundle.attemptEvidence.localRunId,
        } : { runId: bundle.cohort.runId }),
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
            && bundle.globalReceipt?.accepted === true
            && focusedAccepted
            && combinedAccepted,
    }
    return { ...payload, entrySha256: canonicalSha256(payload) }
}

function validateCohortLedger(ledger, { expectedKind = null } = {}) {
    const errors = []
    const v2 = ledger?.schema === COHORT_LEDGER_SCHEMA_V2
    if (![COHORT_LEDGER_SCHEMA, COHORT_LEDGER_SCHEMA_V2].includes(ledger?.schema)) errors.push('unsupported cohort ledger schema')
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
    const executionIds = new Set()
    const acceptedMaterialInputs = new Set()
    for (let index = 0; index < ledger.entries.length; index += 1) {
        const entry = ledger.entries[index]
        if (entry?.sequence !== index) errors.push(`cohort ledger sequence mismatch at ${index}`)
        const expectedPrevious = index === 0 ? null : ledger.entries[index - 1].entrySha256
        if (entry?.previousEntrySha256 !== expectedPrevious) errors.push(`cohort ledger chain mismatch at ${index}`)
        if (entry?.entrySha256 !== entrySha256(entry)) errors.push(`cohort ledger entry hash mismatch at ${index}`)
        if (entry?.recordType !== (ledger.ledgerKind === 'cohort' ? 'cohort' : 'incident')) {
            errors.push(`cohort ledger record type mismatch at ${index}`)
        }
        const uniqueFields = v2
            ? [['objectSha256', objectHashes], ['evidenceBundleId', executionIds]]
            : [['objectSha256', objectHashes], ['runId', executionIds]]
        for (const [field, values] of uniqueFields) {
            if (!SHA256_PATTERN.test(entry?.[field] ?? '')) errors.push(`cohort ledger ${field} is invalid at ${index}`)
            else if (values.has(entry[field])) errors.push(`duplicate cohort ledger ${field}: ${entry[field]}`)
            else values.add(entry[field])
        }
        if (v2) {
            for (const field of ['materialInputKey', 'cohortId', 'executionAttemptId', 'globalRunId']) {
                if (!SHA256_PATTERN.test(entry?.[field] ?? '')) errors.push(`cohort ledger ${field} is invalid at ${index}`)
            }
            if (entry.localRunId !== null && !SHA256_PATTERN.test(entry.localRunId ?? '')) {
                errors.push(`cohort ledger localRunId is invalid at ${index}`)
            }
            if (entry.accepted && entry.materiallyDistinct && acceptedMaterialInputs.has(entry.materialInputKey)) {
                errors.push(`duplicate materially-distinct material input: ${entry.materialInputKey}`)
            }
            if (entry.accepted && entry.materiallyDistinct) acceptedMaterialInputs.add(entry.materialInputKey)
        }
    }
    return { valid: errors.length === 0, errors }
}

function buildCohortLedger(bundles, {
    baseLedger = null,
    generatedAt = new Date().toISOString(),
} = {}) {
    if (!Array.isArray(bundles)) throw new Error('Cohort ledger bundles must be an array')
    const requestedV2 = bundles.some((bundle) => bundle?.schema === 'patch-c0-evidence-bundle-v2')
        || baseLedger?.schema === COHORT_LEDGER_SCHEMA_V2
    if (baseLedger !== null && requestedV2 && baseLedger.schema !== COHORT_LEDGER_SCHEMA_V2) {
        throw new Error('Cohort ledger identity-version migration requires explicit review')
    }
    if (requestedV2 && bundles.some((bundle) => bundle?.schema !== 'patch-c0-evidence-bundle-v2')) {
        throw new Error('Cannot mix legacy and pre-execution identity bundles in one ledger')
    }
    let entries = []
    let baseLedgerObjectSha256 = null
    if (baseLedger !== null) {
        const evaluation = validateCohortLedger(baseLedger, { expectedKind: 'cohort' })
        if (!evaluation.valid) throw new Error(`Base cohort ledger is invalid: ${evaluation.errors.join('; ')}`)
        entries = structuredClone(baseLedger.entries)
        baseLedgerObjectSha256 = objectSha256(baseLedger)
    }
    const seenObjects = new Set(entries.map((entry) => entry.objectSha256))
    const seenRuns = new Set(entries.map((entry) => requestedV2 ? entry.evidenceBundleId : entry.runId))
    const ordered = [...bundles].sort((left, right) => {
        const time = left.recordedAt.localeCompare(right.recordedAt)
        const leftId = requestedV2 ? left.evidenceBundleId : left.cohort.runId
        const rightId = requestedV2 ? right.evidenceBundleId : right.cohort.runId
        return time === 0 ? leftId.localeCompare(rightId) : time
    })
    for (const bundle of ordered) {
        const objectHash = objectSha256(bundle)
        if (seenObjects.has(objectHash)) throw new Error(`Duplicate cohort bundle object: ${objectHash}`)
        const bundleExecutionId = requestedV2 ? bundle?.evidenceBundleId : bundle?.cohort?.runId
        if (seenRuns.has(bundleExecutionId)) throw new Error(`Duplicate cohort evidence identity: ${bundleExecutionId}`)
        const previous = entries.length === 0 ? null : entries.at(-1).entrySha256
        const entry = createCohortEntry(bundle, entries.length, previous)
        entries.push(entry)
        seenObjects.add(objectHash)
        seenRuns.add(requestedV2 ? entry.evidenceBundleId : entry.runId)
    }
    const ledger = sealDocument({
        schema: requestedV2 ? COHORT_LEDGER_SCHEMA_V2 : COHORT_LEDGER_SCHEMA,
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
    const v2 = bundle.schema === 'patch-c0-evidence-bundle-v2'
    const payload = {
        sequence,
        previousEntrySha256,
        releaseId: record.releaseId,
        releaseTag: record.releaseTag,
        implementationCommit: bundle.authority.implementation.commit,
        cohortId: bundle.cohort.cohortId,
        ...(v2 ? {
            materialInputKey: bundle.cohort.materialInputKey,
            executionAttemptId: bundle.cohort.executionAttemptId,
            evidenceBundleId: bundle.evidenceBundleId,
            globalRunId: bundle.globalReceipt.globalRunId,
            localRunId: bundle.attemptEvidence.localRunId,
        } : { runId: bundle.cohort.runId }),
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
    const v2 = ledger?.schema === STABLE_RELEASE_LEDGER_SCHEMA_V2
    if (![STABLE_RELEASE_LEDGER_SCHEMA, STABLE_RELEASE_LEDGER_SCHEMA_V2].includes(ledger?.schema)) {
        errors.push('unsupported stable-release ledger schema')
    }
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
        if (v2) {
            for (const field of ['materialInputKey', 'cohortId', 'executionAttemptId',
                'evidenceBundleId', 'globalRunId']) {
                if (!SHA256_PATTERN.test(entry?.[field] ?? '')) errors.push(`stable-release ${field} is invalid at ${index}`)
            }
            if (entry.localRunId !== null && !SHA256_PATTERN.test(entry.localRunId ?? '')) {
                errors.push(`stable-release localRunId is invalid at ${index}`)
            }
        }
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
    const requestedV2 = records.some((record) => record?.bundle?.schema === 'patch-c0-evidence-bundle-v2')
        || baseLedger?.schema === STABLE_RELEASE_LEDGER_SCHEMA_V2
    if (baseLedger !== null && requestedV2 && baseLedger.schema !== STABLE_RELEASE_LEDGER_SCHEMA_V2) {
        throw new Error('Stable-release ledger identity-version migration requires explicit review')
    }
    if (requestedV2 && records.some((record) => record?.bundle?.schema !== 'patch-c0-evidence-bundle-v2')) {
        throw new Error('Cannot mix legacy and pre-execution identity stable-release entries')
    }
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
        schema: requestedV2 ? STABLE_RELEASE_LEDGER_SCHEMA_V2 : STABLE_RELEASE_LEDGER_SCHEMA,
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
    const v2 = record?.schema === INCIDENT_RECORD_SCHEMA_V2
    if (![INCIDENT_RECORD_SCHEMA, INCIDENT_RECORD_SCHEMA_V2].includes(record?.schema)) {
        errors.push('unsupported incident record schema')
    }
    if (!verifyDocumentIntegrity(record)) errors.push('incident record integrity mismatch')
    const expectedSequence = previousRecord === null ? 0 : previousRecord.sequence + 1
    const expectedPrevious = previousRecord === null ? null : objectSha256(previousRecord)
    if (record?.sequence !== expectedSequence) errors.push('incident sequence mismatch')
    if (record?.previousIncidentSha256 !== expectedPrevious) errors.push('incident chain mismatch')
    if (record?.incidentId !== computeIncidentId(record)) errors.push('incidentId mismatch')
    const identityFields = v2
        ? ['materialInputKey', 'cohortId', 'executionAttemptId', 'evidenceBundleId',
            'globalRunId', 'bundleObjectSha256']
        : ['cohortId', 'runId', 'bundleObjectSha256']
    for (const field of identityFields) {
        if (!SHA256_PATTERN.test(record?.[field] ?? '')) errors.push(`incident ${field} is invalid`)
    }
    if (v2 && record.localRunId !== null && !SHA256_PATTERN.test(record.localRunId ?? '')) {
        errors.push('incident localRunId is invalid')
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

function validateIncidentBundleBinding(record, bundle, { previousRecord = null } = {}) {
    const evaluation = validateIncidentRecord(record, { previousRecord })
    if (!evaluation.valid) throw new Error(`Incident record is invalid: ${evaluation.errors.join('; ')}`)
    if (record.schema !== INCIDENT_RECORD_SCHEMA_V2) return true
    validateBundleLedgerInput(bundle)
    if (bundle.schema !== 'patch-c0-evidence-bundle-v2'
        || record.bundleObjectSha256 !== objectSha256(bundle)
        || record.materialInputKey !== bundle.cohort.materialInputKey
        || record.cohortId !== bundle.cohort.cohortId
        || record.executionAttemptId !== bundle.cohort.executionAttemptId
        || record.evidenceBundleId !== bundle.evidenceBundleId
        || record.globalRunId !== bundle.attemptEvidence.globalRunId
        || record.localRunId !== bundle.attemptEvidence.localRunId
        || record.cohortClass !== bundle.cohort.cohortClass
        || record.syntheticMutation !== bundle.cohort.syntheticMutation) {
        throw new Error('Operating incident does not bind its exact evidence bundle identities')
    }
    return true
}

function productionCohortEntries(ledger) {
    return ledger.entries.filter((entry) => entry.recordType === 'cohort'
        && entry.accepted
        && entry.productionEligible
        && !entry.syntheticMutation
        && entry.materiallyDistinct)
}

function materialCountKey(entry) {
    return entry.materialInputKey ?? entry.cohortId
}

function validateCandidateOperatingSampleLedger(ledger) {
    const errors = []
    if (ledger?.schema !== CANDIDATE_OPERATING_SAMPLE_LEDGER_SCHEMA) errors.push('unsupported candidate operating-sample ledger schema')
    if (!verifyDocumentIntegrity(ledger)) errors.push('candidate operating-sample ledger integrity mismatch')
    if (!validTimestamp(ledger?.generatedAt)) errors.push('candidate operating-sample ledger timestamp is invalid')
    if (ledger?.baseLedgerObjectSha256 !== null && !SHA256_PATTERN.test(ledger?.baseLedgerObjectSha256 ?? '')) {
        errors.push('candidate operating-sample base ledger hash is invalid')
    }
    if (!Array.isArray(ledger?.entries)) return { valid: false, errors: [...errors, 'candidate operating-sample entries are missing'] }
    const materialInputs = new Set()
    const linkageObjects = new Set()
    for (let index = 0; index < ledger.entries.length; index += 1) {
        const entry = ledger.entries[index]
        const previous = index === 0 ? null : ledger.entries[index - 1].entrySha256
        if (entry?.sequence !== index) errors.push(`candidate operating-sample sequence mismatch at ${index}`)
        if (entry?.previousEntrySha256 !== previous) errors.push(`candidate operating-sample chain mismatch at ${index}`)
        if (entry?.entrySha256 !== entrySha256(entry)) errors.push(`candidate operating-sample entry hash mismatch at ${index}`)
        for (const field of ['materialInputKey', 'cohortId', 'executionAttemptId',
            'evidenceBundleId', 'localRunId', 'globalRunId', 'linkageObjectSha256']) {
            if (!SHA256_PATTERN.test(entry?.[field] ?? '')) errors.push(`candidate operating-sample ${field} is invalid at ${index}`)
        }
        if (entry?.candidateId !== 'toolchain-hardening' || entry?.accepted !== true) {
            errors.push(`candidate operating-sample disposition is invalid at ${index}`)
        }
        for (const [label, value, values] of [
            ['materialInputKey', entry.materialInputKey, materialInputs],
            ['linkageObjectSha256', entry.linkageObjectSha256, linkageObjects],
        ]) {
            if (values.has(value)) errors.push(`duplicate candidate operating-sample ${label}: ${value}`)
            else values.add(value)
        }
    }
    return { valid: errors.length === 0, errors }
}

function buildCandidateOperatingSampleLedger(linkages, cohortLedger, {
    baseLedger = null,
    generatedAt = new Date().toISOString(),
} = {}) {
    const cohortEvaluation = validateCohortLedger(cohortLedger, { expectedKind: 'cohort' })
    if (!cohortEvaluation.valid || cohortLedger.schema !== COHORT_LEDGER_SCHEMA_V2) {
        throw new Error('Candidate operating samples require a valid material-input cohort ledger')
    }
    let entries = []
    let baseLedgerObjectSha256 = null
    if (baseLedger !== null) {
        const evaluation = validateCandidateOperatingSampleLedger(baseLedger)
        if (!evaluation.valid) throw new Error(`Base candidate operating-sample ledger is invalid: ${evaluation.errors.join('; ')}`)
        entries = structuredClone(baseLedger.entries)
        baseLedgerObjectSha256 = objectSha256(baseLedger)
    }
    const cohortByBundle = new Map(cohortLedger.entries.map((entry) => [entry.evidenceBundleId, entry]))
    const seenInputs = new Set(entries.map((entry) => entry.materialInputKey))
    const seenObjects = new Set(entries.map((entry) => entry.linkageObjectSha256))
    const ordered = [...linkages].sort((left, right) => left.linkage.cohortId.localeCompare(right.linkage.cohortId))
    for (const record of ordered) {
        const linkage = record?.linkage
        const linkageObjectSha256 = record?.linkageObjectSha256 ?? objectSha256(linkage)
        if (!verifyDocumentIntegrity(linkage)
            || linkage?.schema !== 'patch-toolchain-shadow-operating-linkage-v2'
            || linkage.status !== 'passed') throw new Error('Candidate operating-sample input is not a passing v2 linkage')
        if (objectSha256(linkage) !== linkageObjectSha256) throw new Error('Candidate operating linkage object identity mismatch')
        const cohort = cohortByBundle.get(linkage.evidenceBundleId)
        if (!cohort || cohort.accepted !== true || cohort.materiallyDistinct !== true
            || cohort.materialInputKey !== linkage.materialInputKey
            || cohort.cohortId !== linkage.cohortId
            || cohort.executionAttemptId !== linkage.executionAttemptId
            || cohort.localRunId !== linkage.localRunId
            || cohort.globalRunId !== linkage.globalRunId) {
            throw new Error('Candidate operating linkage lacks one exact accepted material cohort')
        }
        if (seenInputs.has(linkage.materialInputKey)) throw new Error(`Duplicate candidate operating material input: ${linkage.materialInputKey}`)
        if (seenObjects.has(linkageObjectSha256)) throw new Error(`Duplicate candidate operating linkage: ${linkageObjectSha256}`)
        const payload = {
            sequence: entries.length,
            previousEntrySha256: entries.length === 0 ? null : entries.at(-1).entrySha256,
            candidateId: 'toolchain-hardening',
            materialInputKey: linkage.materialInputKey,
            cohortId: linkage.cohortId,
            executionAttemptId: linkage.executionAttemptId,
            evidenceBundleId: linkage.evidenceBundleId,
            localRunId: linkage.localRunId,
            globalRunId: linkage.globalRunId,
            linkageObjectSha256,
            accepted: true,
        }
        entries.push({ ...payload, entrySha256: canonicalSha256(payload) })
        seenInputs.add(linkage.materialInputKey)
        seenObjects.add(linkageObjectSha256)
    }
    const ledger = sealDocument({
        schema: CANDIDATE_OPERATING_SAMPLE_LEDGER_SCHEMA,
        generatedAt,
        baseLedgerObjectSha256,
        entries,
    })
    const evaluation = validateCandidateOperatingSampleLedger(ledger)
    if (!evaluation.valid) throw new Error(`Generated candidate operating-sample ledger is invalid: ${evaluation.errors.join('; ')}`)
    return ledger
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
        productionCohorts: new Set(productionCohortEntries(cohortLedger).map(materialCountKey)).size,
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
        new Set(material.filter((entry) => entry.cohortClass === cohortClass).map(materialCountKey)).size,
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
    CANDIDATE_OPERATING_SAMPLE_LEDGER_SCHEMA,
    COHORT_LEDGER_SCHEMA,
    COHORT_LEDGER_SCHEMA_V2,
    DEFAULT_REVIEW_THRESHOLDS,
    DEFECT_YIELD_SCHEMA,
    INCIDENT_RECORD_SCHEMA,
    INCIDENT_RECORD_SCHEMA_V2,
    REVIEW_TRIGGER_SCHEMA,
    STABLE_RELEASE_LEDGER_SCHEMA,
    STABLE_RELEASE_LEDGER_SCHEMA_V2,
    buildCohortLedger,
    buildCandidateOperatingSampleLedger,
    buildDefectYieldSummary,
    buildReviewTriggerReport,
    buildStableReleaseLedger,
    computeIncidentId,
    finalizeIncidentRecord,
    objectSha256,
    productionDefect,
    validateCohortLedger,
    validateCandidateOperatingSampleLedger,
    validateIncidentChain,
    validateIncidentBundleBinding,
    validateIncidentRecord,
    validateStableReleaseLedger,
}
