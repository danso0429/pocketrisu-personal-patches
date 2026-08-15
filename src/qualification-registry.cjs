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
const QUALIFICATION_MANIFEST_SCHEMA = 'patch-qualification-manifest-v1'
const QUALIFICATION_REGISTRY_SCHEMA = 'patch-qualification-evidence-registry-v1'
const CURRENT_REF_SCHEMA = 'patch-qualification-registry-current-ref-v1'
const ACCEPTED_PURPOSE = 'prerequisite-for-material-shadow-cohort-collection'
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

function validateValidationResult(result) {
    if (!verifyDocumentIntegrity(result) || result.schema !== VALIDATION_RESULT_SCHEMA) {
        fail('INVALID_VALIDATION_RESULT', 'Qualification validation result schema or integrity is invalid')
    }
    exactKeys(result, [
        'schema', 'validatedAt', 'result', 'independentVerifier', 'storeIdentityHash',
        'contentManifestDescriptorSha256', 'checkedDescriptors', 'checks', 'failures', 'integrity',
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

function buildValidationResult({
    validatedAt,
    qualificationToolCommit,
    storeIdentityHash,
    contentManifestDescriptorSha256,
    checkedDescriptors,
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
}) {
    return validateQualificationManifest(sealDocument({
        schema: QUALIFICATION_MANIFEST_SCHEMA,
        createdAt,
        qualificationType: QUALIFICATION_TYPE,
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
        || !ACTIONS.includes(entry.action) || entry.qualificationType !== QUALIFICATION_TYPE
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
        'schema', 'generatedAt', 'storeIdentityHash', 'baseRegistryDescriptorSha256',
        'entries', 'registryRootSha256', 'integrity',
    ], 'qualification registry')
    validateSha(registry.storeIdentityHash, 'registry store identity')
    validateSha(registry.baseRegistryDescriptorSha256, 'base registry descriptor', true)
    if (!Array.isArray(registry.entries) || Number.isNaN(Date.parse(registry.generatedAt))) {
        fail('INVALID_QUALIFICATION_REGISTRY', 'Qualification registry entries or timestamp are invalid')
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

function subjectKey(subject) {
    return sha256(canonicalJsonBytes({ qualificationType: QUALIFICATION_TYPE, subject }))
}

function effectiveRegistryEntry(registry, subject) {
    validateRegistry(registry)
    const key = subjectKey(subject)
    let current = null
    let state = 'not-found'
    for (const entry of registry.entries) {
        if (subjectKey(entry.subject) !== key) continue
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
    const effective = baseRegistry === null ? { state: 'not-found', entry: null } : effectiveRegistryEntry(baseRegistry, subject)
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
        qualificationType: QUALIFICATION_TYPE,
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
        baseRegistryDescriptorSha256,
        entries,
        registryRootSha256: entry.entrySha256,
    }))
    return { registry, entry, idempotent: false }
}

function registrySchemaRegistry() {
    return new Map([
        [CONTENT_MANIFEST_SCHEMA, validateContentManifest],
        [VALIDATION_RESULT_SCHEMA, validateValidationResult],
        [QUALIFICATION_MANIFEST_SCHEMA, validateQualificationManifest],
        [QUALIFICATION_REGISTRY_SCHEMA, validateRegistry],
    ])
}

function currentRefPath(storeRoot) {
    return path.join(path.resolve(storeRoot), 'v2/refs/qualification/current.json')
}

function buildCurrentRef({ storeIdentityHash, registryDescriptorSha256, registryRootSha256, updatedAt }) {
    validateSha(storeIdentityHash, 'current ref store identity')
    validateSha(registryDescriptorSha256, 'current ref registry descriptor')
    validateSha(registryRootSha256, 'current ref registry root')
    return sealDocument({
        schema: CURRENT_REF_SCHEMA,
        storeIdentityHash,
        registryDescriptorSha256,
        registryRootSha256,
        updatedAt,
    })
}

function validateCurrentRef(reference) {
    if (!verifyDocumentIntegrity(reference) || reference.schema !== CURRENT_REF_SCHEMA
        || !SHA256_PATTERN.test(reference.storeIdentityHash ?? '')
        || !SHA256_PATTERN.test(reference.registryDescriptorSha256 ?? '')
        || !SHA256_PATTERN.test(reference.registryRootSha256 ?? '')
        || Number.isNaN(Date.parse(reference.updatedAt))) {
        fail('INVALID_QUALIFICATION_CURRENT_REF', 'Qualification current ref is invalid')
    }
    return reference
}

function readCurrentRegistry(storeRoot) {
    const identity = loadStoreIdentity(storeRoot)
    const file = currentRefPath(storeRoot)
    if (!fs.existsSync(file)) return { identity, reference: null, registry: null, registryDescriptorSha256: null }
    const encoded = fs.readFileSync(file)
    const reference = validateCurrentRef(parseJsonStrict(encoded, 'qualification current ref'))
    if (!encoded.equals(canonicalJsonBytes(reference))) fail('NONCANONICAL_CURRENT_REF', 'Qualification current ref is not canonical JSON')
    if (reference.storeIdentityHash !== identity.storeIdentityHash) fail('STORE_IDENTITY_MISMATCH', 'Qualification current ref belongs to another store')
    const loaded = loadPublishedObject({
        storeRoot,
        descriptorSha256: reference.registryDescriptorSha256,
        schemaRegistry: registrySchemaRegistry(),
    })
    const registry = validateRegistry(loaded.document)
    if (registry.registryRootSha256 !== reference.registryRootSha256) fail('BROKEN_QUALIFICATION_REGISTRY_CHAIN', 'Current ref registry root mismatch')
    return { identity, reference, registry, registryDescriptorSha256: reference.registryDescriptorSha256 }
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
    return publication.objects[0]
}

module.exports = {
    ACCEPTED_PURPOSE,
    ACTIONS,
    CANONICAL_PROTECTION,
    CONTENT_MANIFEST_SCHEMA,
    CURRENT_REF_SCHEMA,
    DISPOSITIONS,
    OPERATING_COUNTS,
    QUALIFICATION_MANIFEST_SCHEMA,
    QUALIFICATION_REGISTRY_SCHEMA,
    QualificationRegistryError,
    VALIDATION_RESULT_SCHEMA,
    appendRegistryEntry,
    buildContentManifest,
    buildCurrentRef,
    buildQualificationManifest,
    buildValidationResult,
    effectiveRegistryEntry,
    publishRegistrySnapshot,
    readCurrentRegistry,
    registrySchemaRegistry,
    updateCurrentRef,
    validateContentManifest,
    validateCurrentRef,
    validateQualificationManifest,
    validateRegistry,
    validateRegistryEntry,
    validateValidationResult,
}
