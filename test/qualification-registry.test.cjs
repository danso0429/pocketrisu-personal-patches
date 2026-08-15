'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const { sealDocument } = require('../src/verification-receipts.cjs')
const {
    ACCEPTED_PURPOSE,
    CANONICAL_PROTECTION,
    CONTENT_MANIFEST_SCHEMA,
    OPERATING_COUNTS,
    appendRegistryEntry,
    buildContentManifest,
    buildQualificationManifest,
    buildValidationResult,
    effectiveRegistryEntry,
    validateContentManifest,
    validateQualificationManifest,
    validateRegistry,
} = require('../src/qualification-registry.cjs')
const {
    EXCLUDED_PURPOSES,
    QUALIFICATION_TYPE,
    SUBJECT_IMPLEMENTATION_COMMIT,
} = require('../src/toolchain-shadow-qualification.cjs')

const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)
const HASH_C = 'c'.repeat(64)
const TOOL_COMMIT = '3'.repeat(40)
const CREATED_AT = '2026-08-15T09:00:00.000Z'

function expectCode(action, code) {
    assert.throws(action, (error) => error?.code === code)
}

function subject(overrides = {}) {
    return {
        implementationCommit: SUBJECT_IMPLEMENTATION_COMMIT,
        qualificationToolCommit: TOOL_COMMIT,
        policySha256: '1'.repeat(64),
        contractSha256: '2'.repeat(64),
        compiledDeclarationSha256: '3'.repeat(64),
        targetCommit: '4'.repeat(40),
        targetApplicationTreeSha256: '5'.repeat(64),
        ...overrides,
    }
}

function objects(overrides = {}) {
    return {
        machineClosureDescriptorSha256: HASH_A,
        machineSupportDescriptorSha256: HASH_B,
        authorityEnvironmentDescriptorSha256: HASH_B,
        localReceiptDescriptorSha256: HASH_C,
        globalSyntheticReceiptDescriptorSha256: 'd'.repeat(64),
        closureNarrativeDescriptorSha256: null,
        sourceEventDescriptorSha256: null,
        environmentNarrativeDescriptorSha256: null,
        ...overrides,
    }
}

function initialRegistry(currentSubject = subject(), manifest = HASH_A) {
    return appendRegistryEntry({
        storeIdentityHash: HASH_B,
        action: 'accept',
        subject: currentSubject,
        qualificationManifestDescriptorSha256: manifest,
        reason: 'focused qualification fixture',
        timestamp: CREATED_AT,
    })
}

function reseal(document, mutation) {
    const copy = structuredClone(document)
    delete copy.integrity
    mutation(copy)
    return sealDocument(copy)
}

test('three-stage document builders retain strict qualification purposes and zero counts', () => {
    const currentSubject = subject()
    const content = buildContentManifest({ createdAt: CREATED_AT, subject: currentSubject, objects: objects() })
    const validation = buildValidationResult({
        validatedAt: CREATED_AT,
        qualificationToolCommit: TOOL_COMMIT,
        storeIdentityHash: HASH_A,
        contentManifestDescriptorSha256: HASH_B,
        checkedDescriptors: [HASH_A, HASH_B],
        checks: {
            storeIdentityValid: true,
            objectHashesValid: true,
            objectTypesValid: true,
            schemasValid: true,
            manifestReferencesComplete: true,
            receiptsValid: true,
            fixtureDerivationValid: true,
            authorityCompatible: true,
            operatingCountsIsolated: true,
            productionProtectionValid: true,
            quarantineNotAuthority: true,
        },
    })
    const final = buildQualificationManifest({
        createdAt: CREATED_AT,
        subject: currentSubject,
        contentManifestDescriptorSha256: HASH_B,
        validationResultDescriptorSha256: HASH_C,
    })
    assert.equal(content.schema, CONTENT_MANIFEST_SCHEMA)
    assert.equal(validation.result, 'passed')
    assert.equal(final.acceptedPurpose, ACCEPTED_PURPOSE)
    assert.deepEqual(final.operatingCounts, OPERATING_COUNTS)
    assert.deepEqual(final.canonicalProtection, CANONICAL_PROTECTION)
})

test('optional narrative objects may be absent but required machine children may not', () => {
    assert.equal(validateContentManifest(buildContentManifest({ createdAt: CREATED_AT, subject: subject(), objects: objects() })).objects.closureNarrativeDescriptorSha256, null)
    expectCode(() => buildContentManifest({
        createdAt: CREATED_AT,
        subject: subject(),
        objects: objects({ machineClosureDescriptorSha256: null, closureNarrativeDescriptorSha256: HASH_A }),
    }), 'INVALID_QUALIFICATION_HASH')
})

test('invalid disposition and any operating count fail closed', () => {
    const final = buildQualificationManifest({
        createdAt: CREATED_AT,
        subject: subject(),
        contentManifestDescriptorSha256: HASH_A,
        validationResultDescriptorSha256: HASH_B,
    })
    expectCode(() => validateQualificationManifest(reseal(final, (value) => { value.disposition = 'material-operating-cohort' })), 'INVALID_QUALIFICATION_DISPOSITION')
    for (const key of Object.keys(OPERATING_COUNTS)) {
        expectCode(() => validateQualificationManifest(reseal(final, (value) => { value.operatingCounts[key] = true })), 'OPERATING_COUNT_ISOLATION_FAILED')
    }
})

test('content, final, and registry records require the exact qualification type', () => {
    const content = buildContentManifest({ createdAt: CREATED_AT, subject: subject(), objects: objects() })
    const final = buildQualificationManifest({
        createdAt: CREATED_AT,
        subject: subject(),
        contentManifestDescriptorSha256: HASH_A,
        validationResultDescriptorSha256: HASH_B,
    })
    assert.equal(content.qualificationType, QUALIFICATION_TYPE)
    assert.equal(final.qualificationType, QUALIFICATION_TYPE)
    expectCode(() => validateContentManifest(reseal(content, (value) => {
        value.qualificationType = 'other-supported-qualification'
    })), 'INVALID_QUALIFICATION_TYPE')
    expectCode(() => validateQualificationManifest(reseal(final, (value) => {
        value.qualificationType = 'other-supported-qualification'
    })), 'INVALID_QUALIFICATION_TYPE')
    expectCode(() => validateContentManifest(reseal(content, (value) => {
        delete value.qualificationType
    })), 'INVALID_QUALIFICATION_DOCUMENT')
    expectCode(() => validateQualificationManifest(reseal(final, (value) => {
        delete value.qualificationType
    })), 'INVALID_QUALIFICATION_DOCUMENT')
    const registry = initialRegistry().registry
    expectCode(() => validateRegistry(reseal(registry, (value) => {
        value.entries[0].qualificationType = 'other-supported-qualification'
    })), 'BROKEN_QUALIFICATION_REGISTRY_CHAIN')
})

test('initial accept is append-only and exact duplicate registration is idempotent', () => {
    const accepted = initialRegistry()
    assert.equal(accepted.registry.entries.length, 1)
    assert.equal(accepted.registry.baseRegistryDescriptorSha256, null)
    assert.equal(effectiveRegistryEntry(accepted.registry, subject()).state, 'accepted')
    const duplicate = appendRegistryEntry({
        baseRegistry: accepted.registry,
        baseRegistryDescriptorSha256: HASH_C,
        storeIdentityHash: HASH_B,
        action: 'accept',
        subject: subject(),
        qualificationManifestDescriptorSha256: HASH_A,
        reason: 'identical retry',
        timestamp: '2026-08-15T09:01:00.000Z',
    })
    assert.equal(duplicate.idempotent, true)
    assert.equal(duplicate.registry, accepted.registry)
})

test('conflicting duplicate requires explicit supersession', () => {
    const accepted = initialRegistry()
    expectCode(() => appendRegistryEntry({
        baseRegistry: accepted.registry,
        baseRegistryDescriptorSha256: HASH_C,
        storeIdentityHash: HASH_B,
        action: 'accept',
        subject: subject(),
        qualificationManifestDescriptorSha256: 'e'.repeat(64),
        reason: 'conflicting accept',
        timestamp: '2026-08-15T09:02:00.000Z',
    }), 'CONFLICTING_ACCEPTED_QUALIFICATION')
    const superseded = appendRegistryEntry({
        baseRegistry: accepted.registry,
        baseRegistryDescriptorSha256: HASH_C,
        storeIdentityHash: HASH_B,
        action: 'supersede',
        subject: subject(),
        qualificationManifestDescriptorSha256: 'e'.repeat(64),
        reason: 'reviewed replacement',
        timestamp: '2026-08-15T09:03:00.000Z',
    })
    assert.equal(superseded.registry.entries.length, 2)
    assert.equal(effectiveRegistryEntry(superseded.registry, subject()).entry.action, 'supersede')
})

test('revocation appends history and leaves no effective accepted qualification', () => {
    const accepted = initialRegistry()
    const revoked = appendRegistryEntry({
        baseRegistry: accepted.registry,
        baseRegistryDescriptorSha256: HASH_C,
        storeIdentityHash: HASH_B,
        action: 'revoke',
        subject: subject(),
        qualificationManifestDescriptorSha256: HASH_A,
        reason: 'qualification invalidated',
        timestamp: '2026-08-15T09:04:00.000Z',
    })
    assert.equal(revoked.registry.entries.length, 2)
    assert.equal(effectiveRegistryEntry(revoked.registry, subject()).state, 'revoked')
    assert.equal(revoked.registry.entries[0].entrySha256, accepted.registry.entries[0].entrySha256)
})

test('broken previous-entry hashes, duplicate entries, and missing base references are rejected', () => {
    const accepted = initialRegistry()
    const revoked = appendRegistryEntry({
        baseRegistry: accepted.registry,
        baseRegistryDescriptorSha256: HASH_C,
        storeIdentityHash: HASH_B,
        action: 'revoke', subject: subject(), qualificationManifestDescriptorSha256: HASH_A,
        reason: 'fixture revocation', timestamp: '2026-08-15T09:05:00.000Z',
    }).registry
    expectCode(() => validateRegistry(reseal(revoked, (value) => {
        value.entries[1].previousEntrySha256 = 'f'.repeat(64)
    })), 'BROKEN_QUALIFICATION_REGISTRY_CHAIN')
    expectCode(() => appendRegistryEntry({
        baseRegistry: accepted.registry,
        storeIdentityHash: HASH_B,
        action: 'revoke', subject: subject(), qualificationManifestDescriptorSha256: HASH_A,
        reason: 'missing base descriptor', timestamp: '2026-08-15T09:06:00.000Z',
    }), 'INVALID_QUALIFICATION_HASH')
})

test('subject identity is exact and stale implementation commits are rejected', () => {
    expectCode(() => initialRegistry(subject({ implementationCommit: 'f'.repeat(40) })), 'STALE_QUALIFICATION_SUBJECT')
    const content = buildContentManifest({ createdAt: CREATED_AT, subject: subject(), objects: objects() })
    assert.deepEqual(content.excludedPurposes, [...EXCLUDED_PURPOSES])
})
