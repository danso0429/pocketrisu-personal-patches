'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const {
    initializeQualificationStore,
    publishEvidenceBatch,
} = require('../src/qualification-object-store.cjs')
const {
    appendRegistryEntry,
    buildContentManifest,
    buildCurrentRef,
    buildQualificationManifest,
    buildValidationResult,
    publishRegistrySnapshot,
    updateCurrentRef,
} = require('../src/qualification-registry.cjs')
const { fullSchemaRegistry } = require('../src/qualification-verifier.cjs')
const {
    directorySummary,
    planQualificationRetention,
} = require('../src/qualification-retention.cjs')
const {
    CANONICAL_TARGET_TREE_SHA256,
    COMPILED_DECLARATION_SHA256,
    CONTRACT_SHA256,
    POLICY_SHA256,
    SUBJECT_IMPLEMENTATION_COMMIT,
    TARGET_COMMIT,
} = require('../src/toolchain-shadow-qualification.cjs')

const repositoryRoot = path.resolve(__dirname, '..')
const fixtureParent = path.resolve(repositoryRoot, '../..')
const quarantineRoot = '/home/ubuntu/.local/share/pocketrisu-patcher/evidence-quarantine/toolchain-shadow-closure-54c8307f87354ba1'
const localBytes = fs.readFileSync(path.join(quarantineRoot, 'local-synthetic-known-answer.json'))
const TOOL_COMMIT = '3'.repeat(40)
const CREATED_AT = '2026-08-15T12:00:00.000Z'
const DERIVATION = Object.freeze({
    freshProcess: true,
    processId: 12345,
    subjectCommit: SUBJECT_IMPLEMENTATION_COMMIT,
    subjectClean: true,
    inputDeclarationSha256: COMPILED_DECLARATION_SHA256,
    recipePath: 'src/toolchain-shadow-known-answer.cjs',
    recipeSha256: '506947855af39ebec2c61ffc69c8e66e9920d13fc4333a6da1f3a7c3ea2b94ed',
    outputFixtureDeclarationSha256: '6fd01efbc4f46fd9176f4385c4656b465e1b63a9eb623e1273dbb0fe5e76db59',
    outputSyntheticTargetTreeSha256: '575b83f54b46873b2d3c77b8354b5a39cb518c2a7a1d5cce203b7c8a7d255841',
    publisherFlagTrusted: false,
})

function storeFixture(t) {
    const parent = fs.mkdtempSync(path.join(fixtureParent, '.qualification-retention-test-'))
    t.after(() => fs.rmSync(parent, { recursive: true, force: true }))
    const storeRoot = path.join(parent, 'store')
    const identity = initializeQualificationStore({
        storeRoot,
        forbiddenRoots: [repositoryRoot, quarantineRoot],
        createdAt: CREATED_AT,
    })
    return { parent, storeRoot, identity }
}

function publish(storeRoot, entries) {
    return publishEvidenceBatch({
        storeRoot, entries, schemaRegistry: fullSchemaRegistry(),
        publisherToolIdentity: { qualificationToolCommit: TOOL_COMMIT },
        createdAt: CREATED_AT,
    }).objects
}

function graphFixture(t, { withUnreachable = true } = {}) {
    const { storeRoot, identity } = storeFixture(t)
    const [leaf, narrative] = publish(storeRoot, [
        {
            payloadModel: 'raw-blob', mediaType: 'application/json', role: 'local-synthetic-exact-receipt',
            referencedSchema: 'patch-toolchain-shadow-local-receipt-v1', value: localBytes,
        },
        {
            payloadModel: 'raw-blob', mediaType: 'text/markdown; charset=utf-8',
            role: 'closure-narrative', referencedSchema: null, value: Buffer.from('# retained negative/supporting history\n'),
        },
    ])
    let unreachable = null
    if (withUnreachable) {
        ;[unreachable] = publish(storeRoot, [{
            payloadModel: 'raw-blob', mediaType: 'text/markdown; charset=utf-8',
            role: 'diagnostic-unreachable', referencedSchema: null, value: Buffer.from('unreachable fixture\n'),
        }])
    }
    const subject = {
        implementationCommit: SUBJECT_IMPLEMENTATION_COMMIT,
        qualificationToolCommit: TOOL_COMMIT,
        policySha256: POLICY_SHA256,
        contractSha256: CONTRACT_SHA256,
        compiledDeclarationSha256: COMPILED_DECLARATION_SHA256,
        targetCommit: TARGET_COMMIT,
        targetApplicationTreeSha256: CANONICAL_TARGET_TREE_SHA256,
    }
    const content = buildContentManifest({
        createdAt: CREATED_AT, subject,
        objects: {
            machineClosureDescriptorSha256: leaf.descriptorSha256,
            machineSupportDescriptorSha256: leaf.descriptorSha256,
            authorityEnvironmentDescriptorSha256: leaf.descriptorSha256,
            localReceiptDescriptorSha256: leaf.descriptorSha256,
            globalSyntheticReceiptDescriptorSha256: leaf.descriptorSha256,
            closureNarrativeDescriptorSha256: narrative.descriptorSha256,
            sourceEventDescriptorSha256: null,
            environmentNarrativeDescriptorSha256: null,
        },
    })
    const [contentObject] = publish(storeRoot, [{
        payloadModel: 'canonical-json', mediaType: 'application/vnd.pocketrisu.qualification-manifest+json',
        role: 'qualification-content-manifest', referencedSchema: content.schema, value: content,
    }])
    const validation = buildValidationResult({
        validatedAt: CREATED_AT, qualificationToolCommit: TOOL_COMMIT,
        storeIdentityHash: identity.storeIdentityHash,
        contentManifestDescriptorSha256: contentObject.descriptorSha256,
        checkedDescriptors: [contentObject.descriptorSha256, leaf.descriptorSha256, narrative.descriptorSha256],
        derivation: { ...DERIVATION },
        checks: {
            storeIdentityValid: true, objectHashesValid: true, objectTypesValid: true,
            schemasValid: true, manifestReferencesComplete: true, receiptsValid: true,
            fixtureDerivationValid: true, authorityCompatible: true,
            operatingCountsIsolated: true, productionProtectionValid: true,
            quarantineNotAuthority: true,
        },
    })
    const [validationObject] = publish(storeRoot, [{
        payloadModel: 'canonical-json', mediaType: 'application/vnd.pocketrisu.qualification-validation+json',
        role: 'independent-qualification-validation', referencedSchema: validation.schema, value: validation,
    }])
    const final = buildQualificationManifest({
        createdAt: CREATED_AT, subject,
        contentManifestDescriptorSha256: contentObject.descriptorSha256,
        validationResultDescriptorSha256: validationObject.descriptorSha256,
    })
    const [finalObject] = publish(storeRoot, [{
        payloadModel: 'canonical-json', mediaType: 'application/vnd.pocketrisu.qualification-manifest+json',
        role: 'final-qualification-manifest', referencedSchema: final.schema, value: final,
    }])
    const appended = appendRegistryEntry({
        storeIdentityHash: identity.storeIdentityHash, action: 'accept', subject,
        qualificationManifestDescriptorSha256: finalObject.descriptorSha256,
        reason: 'retention fixture', timestamp: CREATED_AT,
    })
    const registryObject = publishRegistrySnapshot({
        storeRoot, registry: appended.registry, qualificationToolCommit: TOOL_COMMIT, createdAt: CREATED_AT,
    })
    updateCurrentRef(storeRoot, buildCurrentRef({
        storeIdentityHash: identity.storeIdentityHash,
        registryId: appended.registry.registryId,
        registryDescriptorSha256: registryObject.descriptorSha256,
        snapshotSequence: appended.registry.snapshotSequence,
        registryRootSha256: appended.registry.registryRootSha256,
        updatedAt: CREATED_AT,
    }))
    return {
        storeRoot, identity, subject, leaf, narrative, unreachable,
        finalObject, registry: appended.registry, registryObject,
    }
}

test('retention is dry-run only, keeps the complete registered graph, and reports unreachable objects', (t) => {
    const fixture = graphFixture(t)
    const before = directorySummary(fixture.storeRoot)
    const plan = planQualificationRetention({
        storeRoot: fixture.storeRoot,
        quarantineRoots: [quarantineRoot],
        generatedAt: '2026-08-15T12:00:01.000Z',
    })
    assert.equal(plan.dryRun, true)
    assert.equal(plan.deletionImplemented, false)
    assert.equal(plan.deletionProposal.requiresSeparateApproval, true)
    assert.equal(plan.deletionProposal.objects.length, 2)
    assert.ok(plan.deletionProposal.objects.some((entry) => entry.sha256 === fixture.unreachable.descriptorSha256))
    assert.ok(plan.deletionProposal.objects.some((entry) => entry.sha256 === fixture.unreachable.descriptor.payloadSha256))
    assert.equal(plan.objects.find((entry) => entry.sha256 === fixture.narrative.descriptorSha256).action, 'retain')
    assert.deepEqual(directorySummary(fixture.storeRoot), before)
})

test('revoked and prior accepted snapshots remain protected through the registry ancestry', (t) => {
    const fixture = graphFixture(t, { withUnreachable: false })
    const revoked = appendRegistryEntry({
        baseRegistry: fixture.registry,
        baseRegistryDescriptorSha256: fixture.registryObject.descriptorSha256,
        storeIdentityHash: fixture.identity.storeIdentityHash,
        action: 'revoke', subject: fixture.subject,
        qualificationManifestDescriptorSha256: fixture.finalObject.descriptorSha256,
        reason: 'retention revocation fixture', timestamp: '2026-08-15T12:01:00.000Z',
    })
    const revokedObject = publishRegistrySnapshot({
        storeRoot: fixture.storeRoot, registry: revoked.registry,
        qualificationToolCommit: TOOL_COMMIT, createdAt: '2026-08-15T12:01:00.000Z',
    })
    updateCurrentRef(fixture.storeRoot, buildCurrentRef({
        storeIdentityHash: fixture.identity.storeIdentityHash,
        registryId: revoked.registry.registryId,
        registryDescriptorSha256: revokedObject.descriptorSha256,
        snapshotSequence: revoked.registry.snapshotSequence,
        registryRootSha256: revoked.registry.registryRootSha256,
        updatedAt: '2026-08-15T12:01:01.000Z',
    }))
    const plan = planQualificationRetention({ storeRoot: fixture.storeRoot })
    assert.equal(plan.objects.find((entry) => entry.sha256 === fixture.registryObject.descriptorSha256).action, 'retain')
    assert.equal(plan.objects.find((entry) => entry.sha256 === fixture.finalObject.descriptorSha256).action, 'retain')
    assert.equal(plan.deletionProposal.objects.length, 0)
})

test('superseded snapshots and their prior manifest remain retained', (t) => {
    const fixture = graphFixture(t, { withUnreachable: false })
    const superseded = appendRegistryEntry({
        baseRegistry: fixture.registry,
        baseRegistryDescriptorSha256: fixture.registryObject.descriptorSha256,
        storeIdentityHash: fixture.identity.storeIdentityHash,
        action: 'supersede', subject: fixture.subject,
        qualificationManifestDescriptorSha256: fixture.finalObject.descriptorSha256,
        reason: 'retention supersession fixture', timestamp: '2026-08-15T12:02:00.000Z',
    })
    const supersededObject = publishRegistrySnapshot({
        storeRoot: fixture.storeRoot, registry: superseded.registry,
        qualificationToolCommit: TOOL_COMMIT, createdAt: '2026-08-15T12:02:00.000Z',
    })
    updateCurrentRef(fixture.storeRoot, buildCurrentRef({
        storeIdentityHash: fixture.identity.storeIdentityHash,
        registryId: superseded.registry.registryId,
        registryDescriptorSha256: supersededObject.descriptorSha256,
        snapshotSequence: superseded.registry.snapshotSequence,
        registryRootSha256: superseded.registry.registryRootSha256,
        updatedAt: '2026-08-15T12:02:01.000Z',
    }))
    const plan = planQualificationRetention({ storeRoot: fixture.storeRoot })
    assert.equal(plan.objects.find((entry) => entry.sha256 === fixture.registryObject.descriptorSha256).action, 'retain')
    assert.equal(plan.objects.find((entry) => entry.sha256 === fixture.finalObject.descriptorSha256).action, 'retain')
})

test('existing C0 legacy evidence and quarantine bytes are identity-stable', (t) => {
    const fixture = graphFixture(t, { withUnreachable: false })
    const legacy = path.join(fixture.storeRoot, 'objects/sha256/aa')
    fs.mkdirSync(legacy, { recursive: true, mode: 0o700 })
    fs.writeFileSync(path.join(legacy, `${'b'.repeat(62)}.json`), '{}', { mode: 0o444 })
    const legacyBefore = directorySummary(path.join(fixture.storeRoot, 'objects'))
    const quarantineBefore = directorySummary(quarantineRoot)
    const plan = planQualificationRetention({ storeRoot: fixture.storeRoot, quarantineRoots: [quarantineRoot] })
    assert.deepEqual(plan.protectedExternalEvidence.existingC0Legacy, legacyBefore)
    assert.deepEqual(directorySummary(path.join(fixture.storeRoot, 'objects')), legacyBefore)
    assert.deepEqual(directorySummary(quarantineRoot), quarantineBefore)
})

test('planner exposes no deletion operation and leaves eligible objects present', (t) => {
    const fixture = graphFixture(t)
    const plan = planQualificationRetention({ storeRoot: fixture.storeRoot })
    assert.equal(typeof require('../src/qualification-retention.cjs').deleteQualificationObjects, 'undefined')
    for (const entry of plan.deletionProposal.objects) assert.equal(fs.existsSync(entry.path), true)
})
