'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const {
    canonicalJson,
    sealDocument,
    verifyDocumentIntegrity,
} = require('./verification-receipts.cjs')
const {
    canonicalJsonBytes,
    durablePublishExact,
    loadPublishedObject,
    loadStoreIdentity,
    parseJsonStrict,
    publishEvidenceBatch,
    sha256,
} = require('./qualification-object-store.cjs')
const {
    EXCLUDED_PURPOSES,
    QUALIFICATION_TYPE,
    SUBJECT_IMPLEMENTATION_COMMIT,
} = require('./toolchain-shadow-qualification.cjs')

const CONTENT_MANIFEST_SCHEMA = 'patch-qualification-content-manifest-v1'
const VALIDATION_RESULT_SCHEMA = 'patch-qualification-validation-result-v1'
const CONTENT_MANIFEST_V2_SCHEMA = 'patch-qualification-content-manifest-v2'
const VALIDATION_RESULT_V2_SCHEMA = 'patch-qualification-validation-result-v2'
const QUALIFICATION_MANIFEST_SCHEMA = 'patch-qualification-manifest-v1'
const QUALIFICATION_REGISTRY_SCHEMA = 'patch-qualification-evidence-registry-v1'
const CURRENT_REF_SCHEMA = 'patch-qualification-registry-current-ref-v1'
const REGISTRY_ID_SCHEMA = 'patch-qualification-registry-identity-v1'
const SNAPSHOT_REF_SCHEMA = 'patch-qualification-registry-snapshot-ref-v1'
const ACCEPTED_PURPOSE = 'prerequisite-for-material-shadow-cohort-collection'
const REAL_GLOBAL_QUALIFICATION_TYPE = 'patch-toolchain-shadow-real-global-qualification-v2'
const QUALIFICATION_TYPES = Object.freeze([QUALIFICATION_TYPE, REAL_GLOBAL_QUALIFICATION_TYPE])
const DISPOSITIONS = Object.freeze([
    'accepted-qualification', 'diagnostic', 'negative', 'incomplete', 'invalid', 'superseded',
])
const ACTIONS = Object.freeze(['accept', 'revoke', 'supersede'])
const SHA256_PATTERN = /^[0-9a-f]{64}$/
const OPERATING_COUNTS = Object.freeze({
    materialOperatingCohort: false,
    stableRelease: false,
    productionDefectYield: false,
    candidateOperatingSample: false,
})
const CANONICAL_PROTECTION = Object.freeze({
    canonicalGate: 'Global Exhaustive',
    productionClass: 'G',
    shadowClass: 'B',
    productionCertificatesIssued: 0,
    canonicalMasksSkipped: 0,
    productionStateMigrated: false,
    c1RelaxationAuthorized: false,
})

class QualificationRegistryError extends Error {
    constructor(code, message, details = null) {
        super(message)
        this.name = 'QualificationRegistryError'
        this.code = code
        this.details = details
    }
}

function fail(code, message, details = null) {
    throw new QualificationRegistryError(code, message, details)
}

function exactKeys(value, expected, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_QUALIFICATION_DOCUMENT', `${label} must be an object`)
    const actual = Object.keys(value).sort()
    const wanted = [...expected].sort()
    if (canonicalJson(actual) !== canonicalJson(wanted)) fail('INVALID_QUALIFICATION_DOCUMENT', `${label} keys differ`, { actual, expected: wanted })
}

function validateSha(value, label, nullable = false) {
    if (nullable && value === null) return value
    if (!SHA256_PATTERN.test(value ?? '')) fail('INVALID_QUALIFICATION_HASH', `${label} is not a SHA-256 digest`)
    return value
}

function qualificationRegistryId(storeIdentityHash) {
    validateSha(storeIdentityHash, 'registry identity store hash')
    return sha256(canonicalJsonBytes({
        schema: REGISTRY_ID_SCHEMA,
        storeIdentityHash,
        registryNamespace: 'v2/registries/qualification',
        registrySchema: QUALIFICATION_REGISTRY_SCHEMA,
        purpose: ACCEPTED_PURPOSE,
    }))
}

function validateSubject(subject) {
    exactKeys(subject, [
        'implementationCommit', 'qualificationToolCommit', 'policySha256', 'contractSha256',
        'compiledDeclarationSha256', 'targetCommit', 'targetApplicationTreeSha256',
    ], 'qualification subject')
    if (subject.implementationCommit !== SUBJECT_IMPLEMENTATION_COMMIT
        || !/^[0-9a-f]{40}$/.test(subject.qualificationToolCommit ?? '')
        || !/^[0-9a-f]{40}$/.test(subject.targetCommit ?? '')) {
        fail('STALE_QUALIFICATION_SUBJECT', 'Qualification subject commit identity is invalid')
    }
    for (const key of ['policySha256', 'contractSha256', 'compiledDeclarationSha256', 'targetApplicationTreeSha256']) {
        validateSha(subject[key], `qualification subject ${key}`)
    }
    return subject
}

function validateOperatingCounts(counts) {
    if (canonicalJson(counts) !== canonicalJson(OPERATING_COUNTS)) {
        fail('OPERATING_COUNT_ISOLATION_FAILED', 'Qualification evidence cannot increment operating counts')
    }
    return counts
}

function validateCanonicalProtection(protection) {
    if (canonicalJson(protection) !== canonicalJson(CANONICAL_PROTECTION)) {
        fail('CANONICAL_PROTECTION_WEAKENED', 'Qualification evidence weakens production protection')
    }
    return protection
}

function validatePurposes(acceptedPurpose, excludedPurposes) {
    if (acceptedPurpose !== ACCEPTED_PURPOSE
        || canonicalJson(excludedPurposes) !== canonicalJson([...EXCLUDED_PURPOSES])) {
        fail('INVALID_QUALIFICATION_PURPOSE', 'Qualification purpose or exclusions changed')
    }
}

function validateContentManifest(manifest) {
    if (!verifyDocumentIntegrity(manifest) || manifest.schema !== CONTENT_MANIFEST_SCHEMA) {
        fail('INVALID_CONTENT_MANIFEST', 'Qualification content manifest schema or integrity is invalid')
    }
    exactKeys(manifest, [
        'schema', 'createdAt', 'qualificationType', 'subject', 'objects', 'acceptedPurpose',
        'excludedPurposes', 'operatingCounts', 'integrity',
    ], 'content manifest')
    if (manifest.qualificationType !== QUALIFICATION_TYPE) {
        fail('INVALID_QUALIFICATION_TYPE', 'Content manifest qualification type is incompatible')
    }
    validateSubject(manifest.subject)
    validatePurposes(manifest.acceptedPurpose, manifest.excludedPurposes)
    validateOperatingCounts(manifest.operatingCounts)
    exactKeys(manifest.objects, [
        'machineClosureDescriptorSha256', 'machineSupportDescriptorSha256',
        'authorityEnvironmentDescriptorSha256', 'localReceiptDescriptorSha256',
        'globalSyntheticReceiptDescriptorSha256', 'closureNarrativeDescriptorSha256',
        'sourceEventDescriptorSha256', 'environmentNarrativeDescriptorSha256',
    ], 'content manifest objects')
    for (const key of [
        'machineClosureDescriptorSha256', 'machineSupportDescriptorSha256',
        'authorityEnvironmentDescriptorSha256', 'localReceiptDescriptorSha256',
        'globalSyntheticReceiptDescriptorSha256',
    ]) validateSha(manifest.objects[key], `content manifest ${key}`)
    for (const key of [
        'closureNarrativeDescriptorSha256', 'sourceEventDescriptorSha256', 'environmentNarrativeDescriptorSha256',
    ]) validateSha(manifest.objects[key], `content manifest ${key}`, true)
    if (manifest.objects.authorityEnvironmentDescriptorSha256 !== manifest.objects.machineSupportDescriptorSha256) {
        fail('AUTHORITY_ENVIRONMENT_REFERENCE_MISMATCH', 'Machine support must be the authority/environment record')
    }
    return manifest
}

function validateContentManifestV2(manifest) {
    if (!verifyDocumentIntegrity(manifest) || manifest.schema !== CONTENT_MANIFEST_V2_SCHEMA) {
        fail('INVALID_CONTENT_MANIFEST', 'Real-Global qualification content manifest schema or integrity is invalid')
    }
    exactKeys(manifest, [
        'schema', 'createdAt', 'qualificationType', 'subject', 'objects', 'acceptedPurpose',
        'excludedPurposes', 'operatingCounts', 'integrity',
    ], 'real-Global content manifest')
    if (manifest.qualificationType !== REAL_GLOBAL_QUALIFICATION_TYPE) {
        fail('INVALID_QUALIFICATION_TYPE', 'Real-Global content manifest qualification type is incompatible')
    }
    validateSubject(manifest.subject)
    validatePurposes(manifest.acceptedPurpose, manifest.excludedPurposes)
    validateOperatingCounts(manifest.operatingCounts)
    exactKeys(manifest.objects, [
        'qualificationRecordDescriptorSha256', 'provisioningReceiptDescriptorSha256',
        'localReceiptDescriptorSha256', 'globalReceiptDescriptorSha256',
    ], 'real-Global content manifest objects')
    for (const [key, value] of Object.entries(manifest.objects)) {
        validateSha(value, `real-Global content manifest ${key}`)
    }
    return manifest
}

function buildContentManifest({ createdAt, subject, objects }) {
    return validateContentManifest(sealDocument({
        schema: CONTENT_MANIFEST_SCHEMA,
        createdAt,
        qualificationType: QUALIFICATION_TYPE,
        subject,
        objects,
        acceptedPurpose: ACCEPTED_PURPOSE,
        excludedPurposes: [...EXCLUDED_PURPOSES],
        operatingCounts: { ...OPERATING_COUNTS },
    }))
}

function buildContentManifestV2({ createdAt, subject, objects }) {
    return validateContentManifestV2(sealDocument({
        schema: CONTENT_MANIFEST_V2_SCHEMA,
        createdAt,
        qualificationType: REAL_GLOBAL_QUALIFICATION_TYPE,
        subject,
        objects,
        acceptedPurpose: ACCEPTED_PURPOSE,
        excludedPurposes: [...EXCLUDED_PURPOSES],
        operatingCounts: { ...OPERATING_COUNTS },
    }))
}

function validateValidationResult(result) {
    if (!verifyDocumentIntegrity(result) || result.schema !== VALIDATION_RESULT_SCHEMA) {
        fail('INVALID_VALIDATION_RESULT', 'Qualification validation result schema or integrity is invalid')
    }
    exactKeys(result, [
        'schema', 'validatedAt', 'result', 'independentVerifier', 'storeIdentityHash',
        'contentManifestDescriptorSha256', 'checkedDescriptors', 'derivation', 'checks', 'failures', 'integrity',
    ], 'validation result')
    validateSha(result.storeIdentityHash, 'validation store identity')
    validateSha(result.contentManifestDescriptorSha256, 'validation content manifest')
    exactKeys(result.independentVerifier, [
        'qualificationToolCommit', 'freshProcess', 'publisherSuccessTrusted',
    ], 'independent verifier identity')
    exactKeys(result.checks, [
        'storeIdentityValid', 'objectHashesValid', 'objectTypesValid', 'schemasValid',
        'manifestReferencesComplete', 'receiptsValid', 'fixtureDerivationValid',
        'authorityCompatible', 'operatingCountsIsolated', 'productionProtectionValid',
        'quarantineNotAuthority',
    ], 'independent validation checks')
    exactKeys(result.derivation, [
        'freshProcess', 'processId', 'subjectCommit', 'subjectClean', 'inputDeclarationSha256',
        'recipePath', 'recipeSha256', 'outputFixtureDeclarationSha256',
        'outputSyntheticTargetTreeSha256', 'publisherFlagTrusted',
    ], 'independent fixture derivation')
    const qualification = require('./toolchain-shadow-qualification.cjs')
    if (result.derivation.freshProcess !== true
        || !Number.isInteger(result.derivation.processId) || result.derivation.processId <= 0
        || result.derivation.subjectCommit !== SUBJECT_IMPLEMENTATION_COMMIT
        || result.derivation.subjectClean !== true
        || result.derivation.inputDeclarationSha256 !== qualification.COMPILED_DECLARATION_SHA256
        || result.derivation.recipePath !== qualification.RECIPE_PATH
        || result.derivation.recipeSha256 !== qualification.RECIPE_SHA256
        || result.derivation.outputFixtureDeclarationSha256 !== qualification.FIXTURE_DECLARATION_SHA256
        || result.derivation.outputSyntheticTargetTreeSha256 !== qualification.SYNTHETIC_TARGET_TREE_SHA256
        || result.derivation.publisherFlagTrusted !== false) {
        fail('INVALID_VALIDATION_RESULT', 'Independent fixture derivation is incomplete')
    }
    if (!Array.isArray(result.checkedDescriptors) || new Set(result.checkedDescriptors).size !== result.checkedDescriptors.length) {
        fail('INVALID_VALIDATION_RESULT', 'Validation descriptor coverage is missing or duplicated')
    }
    for (const hash of result.checkedDescriptors) validateSha(hash, 'checked descriptor')
    if (!result.independentVerifier || !/^[0-9a-f]{40}$/.test(result.independentVerifier.qualificationToolCommit ?? '')
        || result.independentVerifier.freshProcess !== true
        || result.independentVerifier.publisherSuccessTrusted !== false
        || !['passed', 'failed'].includes(result.result)
        || !Array.isArray(result.failures)
        || (result.result === 'passed' && (result.failures.length !== 0 || !Object.values(result.checks).every((value) => value === true)))) {
        fail('INVALID_VALIDATION_RESULT', 'Independent validation result is incomplete')
    }
    return result
}

function validateValidationResultV2(result) {
    if (!verifyDocumentIntegrity(result) || result.schema !== VALIDATION_RESULT_V2_SCHEMA) {
        fail('INVALID_VALIDATION_RESULT', 'Real-Global qualification validation result schema or integrity is invalid')
    }
    exactKeys(result, [
        'schema', 'validatedAt', 'result', 'qualificationType', 'independentVerifier',
        'storeIdentityHash', 'contentManifestDescriptorSha256', 'checkedDescriptors',
        'checks', 'failures', 'integrity',
    ], 'real-Global validation result')
    if (result.qualificationType !== REAL_GLOBAL_QUALIFICATION_TYPE) {
        fail('INVALID_QUALIFICATION_TYPE', 'Real-Global validation result qualification type is incompatible')
    }
    exactKeys(result.independentVerifier, [
        'qualificationToolCommit', 'freshProcess', 'publisherSuccessTrusted',
    ], 'real-Global independent verifier identity')
    exactKeys(result.checks, [
        'storeIdentityValid', 'objectHashesValid', 'objectTypesValid', 'schemasValid',
        'manifestReferencesComplete', 'receiptsValid', 'realGlobalProjectionValid',
        'authorityCompatible', 'operatingCountsIsolated', 'productionProtectionValid',
        'quarantineNotAuthority',
    ], 'real-Global independent validation checks')
    validateSha(result.storeIdentityHash, 'real-Global validation store identity')
    validateSha(result.contentManifestDescriptorSha256, 'real-Global validation content manifest')
    if (!Array.isArray(result.checkedDescriptors)
        || new Set(result.checkedDescriptors).size !== result.checkedDescriptors.length) {
        fail('INVALID_VALIDATION_RESULT', 'Real-Global validation descriptor coverage is missing or duplicated')
    }
    for (const hash of result.checkedDescriptors) validateSha(hash, 'real-Global checked descriptor')
    if (!/^[0-9a-f]{40}$/.test(result.independentVerifier.qualificationToolCommit ?? '')
        || result.independentVerifier.freshProcess !== true
        || result.independentVerifier.publisherSuccessTrusted !== false
        || !['passed', 'failed'].includes(result.result)
        || !Array.isArray(result.failures)
        || (result.result === 'passed'
            && (result.failures.length !== 0 || !Object.values(result.checks).every((value) => value === true)))) {
        fail('INVALID_VALIDATION_RESULT', 'Real-Global independent validation result is incomplete')
    }
    return result
}

function buildValidationResult({
    validatedAt,
    qualificationToolCommit,
    storeIdentityHash,
    contentManifestDescriptorSha256,
    checkedDescriptors,
    derivation,
    checks,
    failures = [],
}) {
    return validateValidationResult(sealDocument({
        schema: VALIDATION_RESULT_SCHEMA,
        validatedAt,
        result: failures.length === 0 && Object.values(checks).every((value) => value === true) ? 'passed' : 'failed',
        independentVerifier: {
            qualificationToolCommit,
            freshProcess: true,
            publisherSuccessTrusted: false,
        },
        storeIdentityHash,
        contentManifestDescriptorSha256,
        checkedDescriptors: [...new Set(checkedDescriptors)].sort(),
        derivation,
        checks,
        failures,
    }))
}

function buildValidationResultV2({
    validatedAt,
    qualificationToolCommit,
    storeIdentityHash,
    contentManifestDescriptorSha256,
    checkedDescriptors,
    checks,
    failures = [],
}) {
    return validateValidationResultV2(sealDocument({
        schema: VALIDATION_RESULT_V2_SCHEMA,
        validatedAt,
        result: failures.length === 0 && Object.values(checks).every((value) => value === true)
            ? 'passed' : 'failed',
        qualificationType: REAL_GLOBAL_QUALIFICATION_TYPE,
        independentVerifier: {
            qualificationToolCommit,
            freshProcess: true,
            publisherSuccessTrusted: false,
        },
        storeIdentityHash,
        contentManifestDescriptorSha256,
        checkedDescriptors: [...new Set(checkedDescriptors)].sort(),
        checks,
        failures,
    }))
}

function validateQualificationManifest(manifest) {
    if (!verifyDocumentIntegrity(manifest) || manifest.schema !== QUALIFICATION_MANIFEST_SCHEMA) {
        fail('INVALID_QUALIFICATION_MANIFEST', 'Final qualification manifest schema or integrity is invalid')
    }
    exactKeys(manifest, [
        'schema', 'createdAt', 'qualificationType', 'subject', 'contentManifestDescriptorSha256',
        'validationResultDescriptorSha256', 'disposition', 'acceptedPurpose', 'excludedPurposes',
        'operatingCounts', 'canonicalProtection', 'integrity',
    ], 'qualification manifest')
    if (!QUALIFICATION_TYPES.includes(manifest.qualificationType)) {
        fail('INVALID_QUALIFICATION_TYPE', 'Final manifest qualification type is incompatible')
    }
    validateSubject(manifest.subject)
    validateSha(manifest.contentManifestDescriptorSha256, 'final content manifest')
    validateSha(manifest.validationResultDescriptorSha256, 'final validation result')
    if (!DISPOSITIONS.includes(manifest.disposition)) fail('INVALID_QUALIFICATION_DISPOSITION', 'Final qualification disposition is unsupported')
    validatePurposes(manifest.acceptedPurpose, manifest.excludedPurposes)
    validateOperatingCounts(manifest.operatingCounts)
    validateCanonicalProtection(manifest.canonicalProtection)
    return manifest
}

function buildQualificationManifest({
    createdAt,
    subject,
    contentManifestDescriptorSha256,
    validationResultDescriptorSha256,
    disposition = 'accepted-qualification',
    qualificationType = QUALIFICATION_TYPE,
}) {
    return validateQualificationManifest(sealDocument({
        schema: QUALIFICATION_MANIFEST_SCHEMA,
        createdAt,
        qualificationType,
        subject,
        contentManifestDescriptorSha256,
        validationResultDescriptorSha256,
        disposition,
        acceptedPurpose: ACCEPTED_PURPOSE,
        excludedPurposes: [...EXCLUDED_PURPOSES],
        operatingCounts: { ...OPERATING_COUNTS },
        canonicalProtection: { ...CANONICAL_PROTECTION },
    }))
}

function entryHash(entry) {
    const { entrySha256: ignored, ...payload } = entry
    return sha256(canonicalJsonBytes(payload))
}

function entryIdentity(entry) {
    const { entryId: ignored, entrySha256: ignoredHash, ...payload } = entry
    return sha256(canonicalJsonBytes(payload))
}

function validateRegistryEntry(entry, expectedSequence, expectedPrevious) {
    exactKeys(entry, [
        'sequence', 'previousEntrySha256', 'entryId', 'action', 'qualificationType', 'subject',
        'qualificationManifestDescriptorSha256', 'disposition', 'acceptedPurpose', 'excludedPurposes',
        'operatingCounts', 'reason', 'timestamp', 'entrySha256',
    ], `qualification registry entry ${expectedSequence}`)
    if (entry.sequence !== expectedSequence || entry.previousEntrySha256 !== expectedPrevious
        || !ACTIONS.includes(entry.action) || !QUALIFICATION_TYPES.includes(entry.qualificationType)
        || !DISPOSITIONS.includes(entry.disposition) || typeof entry.reason !== 'string' || entry.reason.length === 0
        || Number.isNaN(Date.parse(entry.timestamp)) || entry.entryId !== entryIdentity(entry)
        || entry.entrySha256 !== entryHash(entry)) {
        fail('BROKEN_QUALIFICATION_REGISTRY_CHAIN', `Qualification registry entry ${expectedSequence} is invalid`)
    }
    validateSubject(entry.subject)
    validateSha(entry.qualificationManifestDescriptorSha256, 'registry qualification manifest')
    validatePurposes(entry.acceptedPurpose, entry.excludedPurposes)
    validateOperatingCounts(entry.operatingCounts)
    if ((entry.action === 'accept' || entry.action === 'supersede') && entry.disposition !== 'accepted-qualification') {
        fail('INVALID_QUALIFICATION_DISPOSITION', 'Accepted or superseding entry must use accepted-qualification')
    }
    if (entry.action === 'revoke' && entry.disposition !== 'invalid') {
        fail('INVALID_QUALIFICATION_DISPOSITION', 'Revocation entry must use invalid disposition')
    }
    return entry
}

function validateRegistry(registry) {
    if (!verifyDocumentIntegrity(registry) || registry.schema !== QUALIFICATION_REGISTRY_SCHEMA) {
        fail('INVALID_QUALIFICATION_REGISTRY', 'Qualification registry schema or integrity is invalid')
    }
    exactKeys(registry, [
        'schema', 'generatedAt', 'storeIdentityHash', 'registryId', 'snapshotSequence',
        'baseRegistryDescriptorSha256', 'entries', 'registryRootSha256', 'integrity',
    ], 'qualification registry')
    validateSha(registry.storeIdentityHash, 'registry store identity')
    validateSha(registry.registryId, 'registry ID')
    validateSha(registry.baseRegistryDescriptorSha256, 'base registry descriptor', true)
    if (registry.registryId !== qualificationRegistryId(registry.storeIdentityHash)
        || !Number.isSafeInteger(registry.snapshotSequence) || registry.snapshotSequence < 0
        || !Array.isArray(registry.entries) || registry.entries.length === 0
        || registry.snapshotSequence !== registry.entries.length - 1
        || Number.isNaN(Date.parse(registry.generatedAt))) {
        fail('INVALID_QUALIFICATION_REGISTRY', 'Qualification registry entries or timestamp are invalid')
    }
    if ((registry.snapshotSequence === 0) !== (registry.baseRegistryDescriptorSha256 === null)) {
        fail('BROKEN_QUALIFICATION_REGISTRY_ANCESTRY', 'Registry genesis and predecessor fields disagree')
    }
    let previous = null
    const entryIds = new Set()
    for (let index = 0; index < registry.entries.length; index += 1) {
        const entry = validateRegistryEntry(registry.entries[index], index + 1, previous)
        if (entryIds.has(entry.entryId)) fail('DUPLICATE_QUALIFICATION_ENTRY', `Duplicate registry entry: ${entry.entryId}`)
        entryIds.add(entry.entryId)
        previous = entry.entrySha256
    }
    if (registry.registryRootSha256 !== previous) fail('BROKEN_QUALIFICATION_REGISTRY_CHAIN', 'Registry root differs from the last entry')
    return registry
}

function subjectKey(subject, qualificationType = QUALIFICATION_TYPE) {
    if (!QUALIFICATION_TYPES.includes(qualificationType)) {
        fail('INVALID_QUALIFICATION_TYPE', 'Qualification subject key type is unsupported')
    }
    return sha256(canonicalJsonBytes({ qualificationType, subject }))
}

function effectiveRegistryEntry(registry, subject, qualificationType = QUALIFICATION_TYPE) {
    validateRegistry(registry)
    const key = subjectKey(subject, qualificationType)
    let current = null
    let state = 'not-found'
    for (const entry of registry.entries) {
        if (subjectKey(entry.subject, entry.qualificationType) !== key) continue
        if (entry.action === 'accept' || entry.action === 'supersede') {
            current = entry
            state = 'accepted'
        } else if (entry.action === 'revoke') {
            current = entry
            state = 'revoked'
        }
    }
    return { state, entry: current }
}

function appendRegistryEntry({
    baseRegistry = null,
    baseRegistryDescriptorSha256 = null,
    storeIdentityHash,
    action,
    subject,
    qualificationManifestDescriptorSha256,
    qualificationType = QUALIFICATION_TYPE,
    reason,
    timestamp,
}) {
    if (!ACTIONS.includes(action)) fail('INVALID_REGISTRY_ACTION', `Unsupported registry action: ${action}`)
    validateSubject(subject)
    validateSha(qualificationManifestDescriptorSha256, 'qualification manifest descriptor')
    const entries = baseRegistry === null ? [] : [...validateRegistry(baseRegistry).entries]
    if (baseRegistry !== null && baseRegistry.storeIdentityHash !== storeIdentityHash) {
        fail('STORE_IDENTITY_MISMATCH', 'Base registry belongs to another store')
    }
    if (baseRegistry === null && baseRegistryDescriptorSha256 !== null) {
        fail('INVALID_BASE_REGISTRY_REFERENCE', 'Initial registry cannot name a base snapshot')
    }
    if (baseRegistry !== null) validateSha(baseRegistryDescriptorSha256, 'base registry descriptor')
    if (!QUALIFICATION_TYPES.includes(qualificationType)) {
        fail('INVALID_QUALIFICATION_TYPE', 'Registry append qualification type is unsupported')
    }
    const effective = baseRegistry === null
        ? { state: 'not-found', entry: null }
        : effectiveRegistryEntry(baseRegistry, subject, qualificationType)
    if (action === 'accept' && effective.state === 'accepted') {
        if (effective.entry.qualificationManifestDescriptorSha256 === qualificationManifestDescriptorSha256) {
            return { registry: baseRegistry, entry: effective.entry, idempotent: true }
        }
        fail('CONFLICTING_ACCEPTED_QUALIFICATION', 'Subject already has another accepted qualification manifest')
    }
    if (action === 'revoke' && effective.state !== 'accepted') fail('QUALIFICATION_NOT_ACCEPTED', 'Only an accepted qualification can be revoked')
    if (action === 'supersede' && effective.state !== 'accepted') fail('QUALIFICATION_NOT_ACCEPTED', 'Only an accepted qualification can be superseded')
    const entry = {
        sequence: entries.length + 1,
        previousEntrySha256: entries.at(-1)?.entrySha256 ?? null,
        entryId: null,
        action,
        qualificationType,
        subject,
        qualificationManifestDescriptorSha256,
        disposition: action === 'revoke' ? 'invalid' : 'accepted-qualification',
        acceptedPurpose: ACCEPTED_PURPOSE,
        excludedPurposes: [...EXCLUDED_PURPOSES],
        operatingCounts: { ...OPERATING_COUNTS },
        reason,
        timestamp,
        entrySha256: null,
    }
    entry.entryId = entryIdentity(entry)
    entry.entrySha256 = entryHash(entry)
    validateRegistryEntry(entry, entry.sequence, entry.previousEntrySha256)
    entries.push(entry)
    const registry = validateRegistry(sealDocument({
        schema: QUALIFICATION_REGISTRY_SCHEMA,
        generatedAt: timestamp,
        storeIdentityHash,
        registryId: qualificationRegistryId(storeIdentityHash),
        snapshotSequence: baseRegistry === null ? 0 : baseRegistry.snapshotSequence + 1,
        baseRegistryDescriptorSha256,
        entries,
        registryRootSha256: entry.entrySha256,
    }))
    return { registry, entry, idempotent: false }
}

function registrySchemaRegistry() {
    return new Map([
        [CONTENT_MANIFEST_SCHEMA, validateContentManifest],
        [CONTENT_MANIFEST_V2_SCHEMA, validateContentManifestV2],
        [VALIDATION_RESULT_SCHEMA, validateValidationResult],
        [VALIDATION_RESULT_V2_SCHEMA, validateValidationResultV2],
        [QUALIFICATION_MANIFEST_SCHEMA, validateQualificationManifest],
        [QUALIFICATION_REGISTRY_SCHEMA, validateRegistry],
    ])
}

function currentRefPath(storeRoot) {
    return path.join(path.resolve(storeRoot), 'v2/refs/qualification/current.json')
}

function buildCurrentRef({
    storeIdentityHash,
    registryId,
    registryDescriptorSha256,
    snapshotSequence,
    registryRootSha256,
    updatedAt,
}) {
    validateSha(storeIdentityHash, 'current ref store identity')
    validateSha(registryId, 'current ref registry ID')
    validateSha(registryDescriptorSha256, 'current ref registry descriptor')
    validateSha(registryRootSha256, 'current ref registry root')
    if (registryId !== qualificationRegistryId(storeIdentityHash)
        || !Number.isSafeInteger(snapshotSequence) || snapshotSequence < 0) {
        fail('INVALID_QUALIFICATION_CURRENT_REF', 'Qualification current ref registry identity or sequence is invalid')
    }
    return sealDocument({
        schema: CURRENT_REF_SCHEMA,
        storeIdentityHash,
        registryId,
        registrySchema: QUALIFICATION_REGISTRY_SCHEMA,
        registryDescriptorSha256,
        snapshotSequence,
        registryRootSha256,
        updatedAt,
    })
}

function validateCurrentRef(reference) {
    exactKeys(reference, [
        'schema', 'storeIdentityHash', 'registryId', 'registrySchema', 'registryDescriptorSha256',
        'snapshotSequence', 'registryRootSha256', 'updatedAt', 'integrity',
    ], 'qualification current ref')
    if (!verifyDocumentIntegrity(reference) || reference.schema !== CURRENT_REF_SCHEMA
        || !SHA256_PATTERN.test(reference.storeIdentityHash ?? '')
        || !SHA256_PATTERN.test(reference.registryId ?? '')
        || reference.registryId !== qualificationRegistryId(reference.storeIdentityHash)
        || reference.registrySchema !== QUALIFICATION_REGISTRY_SCHEMA
        || !SHA256_PATTERN.test(reference.registryDescriptorSha256 ?? '')
        || !Number.isSafeInteger(reference.snapshotSequence) || reference.snapshotSequence < 0
        || !SHA256_PATTERN.test(reference.registryRootSha256 ?? '')
        || Number.isNaN(Date.parse(reference.updatedAt))) {
        fail('INVALID_QUALIFICATION_CURRENT_REF', 'Qualification current ref is invalid')
    }
    return reference
}

function readCurrentRef(storeRoot) {
    const identity = loadStoreIdentity(storeRoot)
    const file = currentRefPath(storeRoot)
    if (!fs.existsSync(file)) return { identity, reference: null }
    const stat = fs.lstatSync(file)
    if (!stat.isFile() || stat.isSymbolicLink()) fail('INVALID_QUALIFICATION_CURRENT_REF', 'Qualification current ref is not a regular file')
    const encoded = fs.readFileSync(file)
    const reference = validateCurrentRef(parseJsonStrict(encoded, 'qualification current ref'))
    if (!encoded.equals(canonicalJsonBytes(reference))) fail('NONCANONICAL_CURRENT_REF', 'Qualification current ref is not canonical JSON')
    if (reference.storeIdentityHash !== identity.storeIdentityHash) fail('STORE_IDENTITY_MISMATCH', 'Qualification current ref belongs to another store')
    return { identity, reference }
}

function fsyncDirectory(directory) {
    const descriptor = fs.openSync(directory, fs.constants.O_RDONLY)
    try { fs.fsyncSync(descriptor) } finally { fs.closeSync(descriptor) }
}

function updateCurrentRef(storeRoot, reference) {
    validateCurrentRef(reference)
    const identity = loadStoreIdentity(storeRoot)
    if (reference.storeIdentityHash !== identity.storeIdentityHash) fail('STORE_IDENTITY_MISMATCH', 'Current ref store identity mismatch')
    const file = currentRefPath(storeRoot)
    const directory = path.dirname(file)
    const temporary = path.join(directory, `.current.${process.pid}.${crypto.randomUUID()}.tmp`)
    const bytes = canonicalJsonBytes(reference)
    try {
        const descriptor = fs.openSync(temporary, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o600)
        try {
            let offset = 0
            while (offset < bytes.length) offset += fs.writeSync(descriptor, bytes, offset)
            fs.fsyncSync(descriptor)
        } finally { fs.closeSync(descriptor) }
        if (!fs.readFileSync(temporary).equals(bytes)) fail('CURRENT_REF_REREAD_FAILED', 'Qualification current ref temporary reread failed')
        fs.renameSync(temporary, file)
        fs.chmodSync(file, 0o600)
        fsyncDirectory(directory)
    } finally {
        try { fs.unlinkSync(temporary) } catch (error) { if (error.code !== 'ENOENT') throw error }
    }
    return reference
}

function snapshotNamespaceRoot(identity, registryId = qualificationRegistryId(identity.storeIdentityHash)) {
    validateSha(registryId, 'snapshot namespace registry ID')
    return path.join(identity.rootRealpath, identity.registryNamespace, registryId, 'snapshots')
}

function snapshotRefPath(identity, registryDescriptorSha256, registryId = qualificationRegistryId(identity.storeIdentityHash)) {
    validateSha(registryDescriptorSha256, 'snapshot descriptor')
    return path.join(snapshotNamespaceRoot(identity, registryId), `${registryDescriptorSha256}.json`)
}

function buildSnapshotRef({ identity, registry, registryDescriptorSha256 }) {
    validateRegistry(registry)
    if (registry.storeIdentityHash !== identity.storeIdentityHash
        || registry.registryId !== qualificationRegistryId(identity.storeIdentityHash)) {
        fail('STORE_IDENTITY_MISMATCH', 'Registry snapshot belongs to another store or registry')
    }
    validateSha(registryDescriptorSha256, 'snapshot descriptor')
    return sealDocument({
        schema: SNAPSHOT_REF_SCHEMA,
        storeIdentityHash: identity.storeIdentityHash,
        registryId: registry.registryId,
        registrySchema: QUALIFICATION_REGISTRY_SCHEMA,
        registryDescriptorSha256,
        snapshotSequence: registry.snapshotSequence,
        previousSnapshotSha256: registry.baseRegistryDescriptorSha256,
    })
}

function validateSnapshotRef(reference, identity, expectedDescriptorSha256) {
    exactKeys(reference, [
        'schema', 'storeIdentityHash', 'registryId', 'registrySchema', 'registryDescriptorSha256',
        'snapshotSequence', 'previousSnapshotSha256', 'integrity',
    ], 'qualification registry snapshot ref')
    if (!verifyDocumentIntegrity(reference) || reference.schema !== SNAPSHOT_REF_SCHEMA
        || reference.storeIdentityHash !== identity.storeIdentityHash
        || reference.registryId !== qualificationRegistryId(identity.storeIdentityHash)
        || reference.registrySchema !== QUALIFICATION_REGISTRY_SCHEMA
        || reference.registryDescriptorSha256 !== expectedDescriptorSha256
        || !Number.isSafeInteger(reference.snapshotSequence) || reference.snapshotSequence < 0) {
        fail('INVALID_QUALIFICATION_REGISTRY_SNAPSHOT', 'Qualification registry snapshot ref is invalid')
    }
    validateSha(reference.previousSnapshotSha256, 'snapshot ref predecessor', true)
    if (reference.previousSnapshotSha256 === expectedDescriptorSha256) {
        fail('CYCLIC_QUALIFICATION_REGISTRY', 'Registry snapshot ref is self-parented')
    }
    return reference
}

function publishSnapshotRef(storeRoot, registry, registryDescriptorSha256) {
    const identity = loadStoreIdentity(storeRoot)
    const reference = buildSnapshotRef({ identity, registry, registryDescriptorSha256 })
    const registryDirectory = path.dirname(snapshotNamespaceRoot(identity, registry.registryId))
    if (!fs.existsSync(registryDirectory)) {
        try {
            fs.mkdirSync(registryDirectory, { mode: 0o700 })
            fsyncDirectory(path.dirname(registryDirectory))
        } catch (error) {
            if (error.code !== 'EEXIST') throw error
        }
    }
    const registryDirectoryStat = fs.lstatSync(registryDirectory)
    if (!registryDirectoryStat.isDirectory() || registryDirectoryStat.isSymbolicLink()
        || registryDirectoryStat.uid !== process.geteuid() || (registryDirectoryStat.mode & 0o077) !== 0) {
        fail('INVALID_QUALIFICATION_REGISTRY_NAMESPACE', 'Registry identity namespace is not an owned private directory')
    }
    const file = snapshotRefPath(identity, registryDescriptorSha256, registry.registryId)
    durablePublishExact(file, canonicalJsonBytes(reference), path.join(identity.rootRealpath, 'v2/tmp'))
    return { path: file, reference }
}

function enumerateRegistrySnapshots(storeRoot) {
    const identity = loadStoreIdentity(storeRoot)
    const registryId = qualificationRegistryId(identity.storeIdentityHash)
    const registryNamespace = path.join(identity.rootRealpath, identity.registryNamespace)
    for (const name of fs.readdirSync(registryNamespace).sort()) {
        if (!SHA256_PATTERN.test(name)) {
            fail('QUALIFICATION_REGISTRY_INTEGRITY_ERROR', `Unexpected registry identity namespace entry: ${name}`, { invalidSnapshotCount: 1 })
        }
        const directory = path.join(registryNamespace, name)
        const stat = fs.lstatSync(directory)
        if (!stat.isDirectory() || stat.isSymbolicLink()) {
            fail('QUALIFICATION_REGISTRY_INTEGRITY_ERROR', `Registry identity namespace is not a regular directory: ${directory}`, { invalidSnapshotCount: 1 })
        }
    }
    const namespace = snapshotNamespaceRoot(identity, registryId)
    if (!fs.existsSync(namespace)) return { identity, registryId, snapshots: new Map() }
    const namespaceStat = fs.lstatSync(namespace)
    if (!namespaceStat.isDirectory() || namespaceStat.isSymbolicLink()) {
        fail('QUALIFICATION_REGISTRY_INTEGRITY_ERROR', 'Qualification snapshot namespace is not a regular directory', { invalidSnapshotCount: 1 })
    }
    const snapshots = new Map()
    for (const name of fs.readdirSync(namespace).sort()) {
        const match = /^([0-9a-f]{64})\.json$/.exec(name)
        if (!match) fail('QUALIFICATION_REGISTRY_INTEGRITY_ERROR', `Unexpected qualification snapshot entry: ${name}`, { invalidSnapshotCount: 1 })
        const descriptorSha256 = match[1]
        const file = path.join(namespace, name)
        const stat = fs.lstatSync(file)
        if (!stat.isFile() || stat.isSymbolicLink()) {
            fail('QUALIFICATION_REGISTRY_INTEGRITY_ERROR', `Qualification snapshot ref is not a regular file: ${file}`, { invalidSnapshotCount: 1 })
        }
        try {
            const bytes = fs.readFileSync(file)
            const reference = validateSnapshotRef(parseJsonStrict(bytes, 'qualification registry snapshot ref'), identity, descriptorSha256)
            if (!bytes.equals(canonicalJsonBytes(reference))) fail('NONCANONICAL_REGISTRY_SNAPSHOT_REF', 'Registry snapshot ref is not canonical JSON')
            const loaded = loadPublishedObject({
                storeRoot,
                descriptorSha256,
                schemaRegistry: registrySchemaRegistry(),
            })
            for (const [label, objectPath] of [
                ['descriptor', loaded.descriptorPath],
                ['payload', loaded.payloadPath],
            ]) {
                const objectStat = fs.lstatSync(objectPath)
                if (!objectStat.isFile() || objectStat.isSymbolicLink()) {
                    fail('INVALID_QUALIFICATION_REGISTRY_SNAPSHOT', `Registry snapshot ${label} is not a regular file`)
                }
            }
            if (loaded.descriptor.role !== 'qualification-registry-snapshot'
                || loaded.descriptor.payloadModel !== 'canonical-json'
                || loaded.descriptor.mediaType !== 'application/vnd.pocketrisu.qualification-registry+json'
                || loaded.descriptor.referencedSchema !== QUALIFICATION_REGISTRY_SCHEMA) {
                fail('INVALID_QUALIFICATION_REGISTRY_SNAPSHOT', 'Registry snapshot descriptor role or type is invalid')
            }
            const registry = validateRegistry(loaded.document)
            if (registry.storeIdentityHash !== identity.storeIdentityHash
                || registry.registryId !== registryId
                || registry.snapshotSequence !== reference.snapshotSequence
                || registry.baseRegistryDescriptorSha256 !== reference.previousSnapshotSha256) {
                fail('INVALID_QUALIFICATION_REGISTRY_SNAPSHOT', 'Registry snapshot and immutable ref disagree')
            }
            snapshots.set(descriptorSha256, { descriptorSha256, file, reference, registry, loaded })
        } catch (error) {
            if (error.code === 'QUALIFICATION_REGISTRY_INTEGRITY_ERROR') throw error
            fail('QUALIFICATION_REGISTRY_INTEGRITY_ERROR', `Invalid qualification registry snapshot ${descriptorSha256}`, {
                invalidSnapshotCount: 1,
                causeCode: error.code ?? null,
                causeMessage: error.message,
            })
        }
    }
    return { identity, registryId, snapshots }
}

function resolveVerifiedQualificationRegistryHead(storeRoot, { allowEmpty = false } = {}) {
    const { identity, registryId, snapshots } = enumerateRegistrySnapshots(storeRoot)
    const { reference } = readCurrentRef(storeRoot)
    const metrics = {
        registryId,
        currentRefSnapshotSha256: reference?.registryDescriptorSha256 ?? null,
        currentRefSequence: reference?.snapshotSequence ?? null,
        verifiedMaximalHeadSha256: null,
        verifiedMaximalHeadSequence: null,
        snapshotsDiscovered: snapshots.size,
        snapshotsValidated: snapshots.size,
        genesisCount: 0,
        maximalHeadCount: 0,
        rollbackDetected: false,
        forkDetected: false,
        invalidSnapshotCount: 0,
    }
    if (snapshots.size === 0) {
        if (reference !== null) fail('QUALIFICATION_REGISTRY_HEAD_MISSING', 'Current ref names a registry with no immutable snapshot', metrics)
        if (allowEmpty) return { identity, reference: null, registryId, registry: null, registryDescriptorSha256: null, snapshotRecords: [], metrics }
        fail('QUALIFICATION_REGISTRY_MISSING', 'Qualification registry has no immutable snapshots', metrics)
    }
    const children = new Map([...snapshots.keys()].map((digest) => [digest, []]))
    const genesis = []
    for (const record of snapshots.values()) {
        const predecessor = record.registry.baseRegistryDescriptorSha256
        if (predecessor === record.descriptorSha256) fail('CYCLIC_QUALIFICATION_REGISTRY', 'Registry snapshot is its own predecessor', metrics)
        if (predecessor === null) {
            genesis.push(record)
            if (record.registry.snapshotSequence !== 0) fail('QUALIFICATION_REGISTRY_SEQUENCE_MISMATCH', 'Genesis snapshot sequence is not zero', metrics)
            continue
        }
        const parent = snapshots.get(predecessor)
        if (!parent) fail('MISSING_QUALIFICATION_REGISTRY_BASE', 'Registry snapshot predecessor is missing', { ...metrics, snapshot: record.descriptorSha256, predecessor })
        if (record.registry.snapshotSequence !== parent.registry.snapshotSequence + 1) {
            fail('QUALIFICATION_REGISTRY_SEQUENCE_MISMATCH', 'Registry snapshot sequence is not predecessor sequence plus one', metrics)
        }
        if (parent.registry.entries.length + 1 !== record.registry.entries.length
            || !canonicalJsonBytes(parent.registry.entries).equals(canonicalJsonBytes(record.registry.entries.slice(0, -1)))) {
            fail('BROKEN_QUALIFICATION_REGISTRY_ANCESTRY', 'Registry snapshot is not the exact append-only successor', metrics)
        }
        children.get(predecessor).push(record.descriptorSha256)
    }
    metrics.genesisCount = genesis.length
    if (genesis.length !== 1) fail('QUALIFICATION_REGISTRY_GENESIS_COUNT', 'Registry history must contain exactly one genesis', metrics)
    const visited = new Set()
    const visiting = new Set()
    function visit(digest) {
        if (visiting.has(digest)) fail('CYCLIC_QUALIFICATION_REGISTRY', 'Qualification registry contains a cycle', metrics)
        if (visited.has(digest)) return
        visiting.add(digest)
        for (const child of children.get(digest)) visit(child)
        visiting.delete(digest)
        visited.add(digest)
    }
    visit(genesis[0].descriptorSha256)
    if (visited.size !== snapshots.size) fail('DISCONNECTED_QUALIFICATION_REGISTRY', 'Registry snapshot is not connected to the unique genesis', metrics)
    const heads = [...snapshots.values()].filter((record) => children.get(record.descriptorSha256).length === 0)
    metrics.maximalHeadCount = heads.length
    if (heads.length !== 1) {
        metrics.forkDetected = heads.length > 1
        fail('QUALIFICATION_REGISTRY_FORK', 'Qualification registry does not have one unique maximal head', metrics)
    }
    const head = heads[0]
    metrics.verifiedMaximalHeadSha256 = head.descriptorSha256
    metrics.verifiedMaximalHeadSequence = head.registry.snapshotSequence
    if (reference === null) fail('STALE_QUALIFICATION_CURRENT_REF', 'Immutable registry snapshot exists without a current ref', metrics)
    if (reference.registryId !== registryId || reference.storeIdentityHash !== identity.storeIdentityHash
        || reference.registrySchema !== QUALIFICATION_REGISTRY_SCHEMA) {
        fail('INVALID_QUALIFICATION_CURRENT_REF', 'Current ref registry identity is incompatible', metrics)
    }
    if (!snapshots.has(reference.registryDescriptorSha256)) {
        fail('INVALID_QUALIFICATION_CURRENT_REF', 'Current ref does not name an immutable registry snapshot', metrics)
    }
    if (reference.registryDescriptorSha256 !== head.descriptorSha256) {
        metrics.rollbackDetected = true
        fail('QUALIFICATION_REGISTRY_HEAD_ROLLBACK', 'Qualification current ref does not name the unique maximal head', metrics)
    }
    if (reference.snapshotSequence !== head.registry.snapshotSequence
        || reference.registryRootSha256 !== head.registry.registryRootSha256) {
        fail('QUALIFICATION_REGISTRY_CURRENT_REF_MISMATCH', 'Current ref metadata differs from the maximal head', metrics)
    }
    return {
        identity,
        reference,
        registryId,
        registry: head.registry,
        registryDescriptorSha256: head.descriptorSha256,
        snapshotRecords: [...snapshots.values()],
        metrics,
    }
}

function readCurrentRegistry(storeRoot) {
    return resolveVerifiedQualificationRegistryHead(storeRoot, { allowEmpty: true })
}

function publishRegistrySnapshot({ storeRoot, registry, qualificationToolCommit, createdAt }) {
    validateRegistry(registry)
    const publication = publishEvidenceBatch({
        storeRoot,
        entries: [{
            payloadModel: 'canonical-json',
            mediaType: 'application/vnd.pocketrisu.qualification-registry+json',
            role: 'qualification-registry-snapshot',
            referencedSchema: QUALIFICATION_REGISTRY_SCHEMA,
            sizeLimitClass: 'registry-snapshot',
            value: registry,
        }],
        schemaRegistry: registrySchemaRegistry(),
        publisherToolIdentity: { qualificationToolCommit },
        createdAt,
    })
    const object = publication.objects[0]
    publishSnapshotRef(storeRoot, registry, object.descriptorSha256)
    return object
}

module.exports = {
    ACCEPTED_PURPOSE,
    ACTIONS,
    CANONICAL_PROTECTION,
    CONTENT_MANIFEST_SCHEMA,
    CONTENT_MANIFEST_V2_SCHEMA,
    CURRENT_REF_SCHEMA,
    DISPOSITIONS,
    OPERATING_COUNTS,
    QUALIFICATION_MANIFEST_SCHEMA,
    QUALIFICATION_REGISTRY_SCHEMA,
    QUALIFICATION_TYPES,
    REAL_GLOBAL_QUALIFICATION_TYPE,
    REGISTRY_ID_SCHEMA,
    SNAPSHOT_REF_SCHEMA,
    QualificationRegistryError,
    VALIDATION_RESULT_SCHEMA,
    VALIDATION_RESULT_V2_SCHEMA,
    appendRegistryEntry,
    buildContentManifest,
    buildContentManifestV2,
    buildCurrentRef,
    buildSnapshotRef,
    buildQualificationManifest,
    buildValidationResult,
    buildValidationResultV2,
    effectiveRegistryEntry,
    enumerateRegistrySnapshots,
    publishRegistrySnapshot,
    qualificationRegistryId,
    readCurrentRegistry,
    resolveVerifiedQualificationRegistryHead,
    registrySchemaRegistry,
    updateCurrentRef,
    validateContentManifest,
    validateContentManifestV2,
    validateCurrentRef,
    validateSnapshotRef,
    validateQualificationManifest,
    validateRegistry,
    validateRegistryEntry,
    validateValidationResult,
    validateValidationResultV2,
}
