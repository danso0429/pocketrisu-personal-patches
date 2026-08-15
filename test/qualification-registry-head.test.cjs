'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const {
    OBJECT_DESCRIPTOR_SCHEMA,
    canonicalJsonBytes,
    contentAddressPath,
    durablePublishExact,
    initializeQualificationStore,
    sha256,
} = require('../src/qualification-object-store.cjs')
const {
    QUALIFICATION_REGISTRY_SCHEMA,
    SNAPSHOT_REF_SCHEMA,
    appendRegistryEntry,
    buildCurrentRef,
    effectiveRegistryEntry,
    publishRegistrySnapshot,
    qualificationRegistryId,
    resolveVerifiedQualificationRegistryHead,
    updateCurrentRef,
    validateRegistry,
} = require('../src/qualification-registry.cjs')
const { preflightOperatingCohort, EXPECTATION_SCHEMA } = require('../src/operating-cohort-preflight.cjs')
const { verifyQualificationRegistry } = require('../src/qualification-verifier.cjs')
const {
    COMPILED_DECLARATION_SHA256,
    CONTRACT_SHA256,
    POLICY_SHA256,
    SUBJECT_IMPLEMENTATION_COMMIT,
    TARGET_COMMIT,
    CANONICAL_TARGET_TREE_SHA256,
} = require('../src/toolchain-shadow-qualification.cjs')
const { sealDocument } = require('../src/verification-receipts.cjs')

const repositoryRoot = path.resolve(__dirname, '..')
const subjectRoot = '/home/ubuntu/nai-studio-2/.worktrees/toolchain-hardening-shadow-pilot'
const targetRoot = '/tmp/pocketrisu-v190-audit'
const quarantineRoot = '/home/ubuntu/.local/share/pocketrisu-patcher/evidence-quarantine'
const fixtureBase = '/home/ubuntu/.local/state/pocketrisu-patcher/qualification-registry-head-tests'
const TOOL_COMMIT = '3'.repeat(40)
const CREATED_AT = '2026-08-15T18:00:00.000Z'

function expectCode(action, codes) {
    const accepted = Array.isArray(codes) ? codes : [codes]
    assert.throws(action, (error) => accepted.includes(error?.code), `expected ${accepted.join(' or ')}`)
}

function subject(seed = '1') {
    return {
        implementationCommit: SUBJECT_IMPLEMENTATION_COMMIT,
        qualificationToolCommit: seed.repeat(40),
        policySha256: POLICY_SHA256,
        contractSha256: CONTRACT_SHA256,
        compiledDeclarationSha256: COMPILED_DECLARATION_SHA256,
        targetCommit: TARGET_COMMIT,
        targetApplicationTreeSha256: CANONICAL_TARGET_TREE_SHA256,
    }
}

function expectation(currentSubject) {
    return {
        schema: EXPECTATION_SCHEMA,
        subject: currentSubject,
        compatibility: {
            subjectSchemasSha256: '1'.repeat(64),
            qualificationSchemasSha256: '2'.repeat(64),
            localRouteSha256: '3'.repeat(64),
            globalProjectionRouteSha256: '4'.repeat(64),
        },
    }
}

function fixture(t) {
    fs.mkdirSync(fixtureBase, { recursive: true, mode: 0o700 })
    fs.chmodSync(fixtureBase, 0o700)
    const parent = fs.mkdtempSync(path.join(fixtureBase, 'head-'))
    const storeRoot = path.join(parent, 'store')
    const identity = initializeQualificationStore({
        storeRoot,
        forbiddenRoots: [repositoryRoot, subjectRoot, targetRoot, quarantineRoot],
        createdAt: CREATED_AT,
    })
    t.after(() => fs.rmSync(parent, { recursive: true, force: true }))
    return { parent, storeRoot, identity }
}

function appendSnapshot(fixtureValue, {
    base = null,
    baseDescriptor = null,
    action = 'accept',
    currentSubject = subject(),
    manifest = 'a'.repeat(64),
    sequenceTime = CREATED_AT,
} = {}) {
    const appended = appendRegistryEntry({
        baseRegistry: base,
        baseRegistryDescriptorSha256: baseDescriptor,
        storeIdentityHash: fixtureValue.identity.storeIdentityHash,
        action,
        subject: currentSubject,
        qualificationManifestDescriptorSha256: manifest,
        reason: `registry head fixture ${action}`,
        timestamp: sequenceTime,
    })
    const object = appended.idempotent ? { descriptorSha256: baseDescriptor } : publishRegistrySnapshot({
        storeRoot: fixtureValue.storeRoot,
        registry: appended.registry,
        qualificationToolCommit: TOOL_COMMIT,
        createdAt: sequenceTime,
    })
    return { ...appended, object }
}

function pointCurrent(fixtureValue, snapshot, updatedAt = CREATED_AT) {
    return updateCurrentRef(fixtureValue.storeRoot, buildCurrentRef({
        storeIdentityHash: fixtureValue.identity.storeIdentityHash,
        registryId: snapshot.registry.registryId,
        registryDescriptorSha256: snapshot.object.descriptorSha256,
        snapshotSequence: snapshot.registry.snapshotSequence,
        registryRootSha256: snapshot.registry.registryRootSha256,
        updatedAt,
    }))
}

function descriptorFor(payload, overrides = {}) {
    const payloadSha256 = sha256(payload)
    const descriptor = {
        schema: OBJECT_DESCRIPTOR_SCHEMA,
        payloadSha256,
        payloadBytes: payload.length,
        payloadModel: 'canonical-json',
        mediaType: 'application/vnd.pocketrisu.qualification-registry+json',
        role: 'qualification-registry-snapshot',
        contentEncoding: 'identity',
        referencedSchema: QUALIFICATION_REGISTRY_SCHEMA,
        canonicalSemanticSha256: payloadSha256,
        publisherToolIdentity: { qualificationToolCommit: TOOL_COMMIT },
        createdAt: CREATED_AT,
        sizeLimitClass: 'registry-snapshot',
        ...overrides,
    }
    const bytes = canonicalJsonBytes(descriptor)
    return { descriptor, bytes, descriptorSha256: sha256(bytes) }
}

function publishAdversarialSnapshot(fixtureValue, registry, {
    descriptorOverrides = {},
    payloadBytes = null,
    markerMutation = null,
    publishMarker = true,
} = {}) {
    const canonicalPayload = canonicalJsonBytes(registry)
    const descriptorRecord = descriptorFor(canonicalPayload, descriptorOverrides)
    const temporary = path.join(fixtureValue.storeRoot, 'v2/tmp')
    const payload = payloadBytes ?? canonicalPayload
    durablePublishExact(
        contentAddressPath(fixtureValue.storeRoot, 'payloads', descriptorRecord.descriptor.payloadSha256),
        payload,
        temporary,
    )
    durablePublishExact(
        contentAddressPath(fixtureValue.storeRoot, 'descriptors', descriptorRecord.descriptorSha256, '.json'),
        descriptorRecord.bytes,
        temporary,
    )
    if (!publishMarker) return { descriptorSha256: descriptorRecord.descriptorSha256, markerPath: null }
    const markerPayload = {
        schema: SNAPSHOT_REF_SCHEMA,
        storeIdentityHash: fixtureValue.identity.storeIdentityHash,
        registryId: qualificationRegistryId(fixtureValue.identity.storeIdentityHash),
        registrySchema: QUALIFICATION_REGISTRY_SCHEMA,
        registryDescriptorSha256: descriptorRecord.descriptorSha256,
        snapshotSequence: registry.snapshotSequence,
        previousSnapshotSha256: registry.baseRegistryDescriptorSha256,
    }
    if (markerMutation) markerMutation(markerPayload)
    const marker = sealDocument(markerPayload)
    const markerPath = path.join(
        fixtureValue.storeRoot,
        'v2/registries/qualification',
        marker.registryId,
        'snapshots',
        `${descriptorRecord.descriptorSha256}.json`,
    )
    durablePublishExact(markerPath, canonicalJsonBytes(marker), temporary)
    return { descriptorSha256: descriptorRecord.descriptorSha256, markerPath }
}

function reseal(document, mutate) {
    const copy = structuredClone(document)
    delete copy.integrity
    mutate(copy)
    return sealDocument(copy)
}

test('verified head accepts genesis, linear chains, supersession, revocation, and exact duplicate registration', async (t) => {
    await t.test('genesis and exact duplicate', (t) => {
        const current = fixture(t)
        const a = appendSnapshot(current)
        pointCurrent(current, a)
        const verified = resolveVerifiedQualificationRegistryHead(current.storeRoot)
        assert.equal(verified.registryDescriptorSha256, a.object.descriptorSha256)
        assert.equal(verified.metrics.genesisCount, 1)
        assert.equal(verified.metrics.maximalHeadCount, 1)
        const duplicate = appendSnapshot(current, { base: a.registry, baseDescriptor: a.object.descriptorSha256 })
        assert.equal(duplicate.idempotent, true)
        assert.equal(duplicate.object.descriptorSha256, a.object.descriptorSha256)
        assert.equal(resolveVerifiedQualificationRegistryHead(current.storeRoot).metrics.snapshotsDiscovered, 1)
    })
    await t.test('three-snapshot linear chain', (t) => {
        const current = fixture(t)
        const a = appendSnapshot(current)
        const b = appendSnapshot(current, {
            base: a.registry, baseDescriptor: a.object.descriptorSha256,
            currentSubject: subject('2'), manifest: 'b'.repeat(64), sequenceTime: '2026-08-15T18:00:01.000Z',
        })
        const c = appendSnapshot(current, {
            base: b.registry, baseDescriptor: b.object.descriptorSha256,
            currentSubject: subject('4'), manifest: 'c'.repeat(64), sequenceTime: '2026-08-15T18:00:02.000Z',
        })
        pointCurrent(current, c)
        const verified = resolveVerifiedQualificationRegistryHead(current.storeRoot)
        assert.equal(verified.metrics.snapshotsDiscovered, 3)
        assert.equal(verified.metrics.verifiedMaximalHeadSequence, 2)
        assert.equal(verified.registryDescriptorSha256, c.object.descriptorSha256)
    })
    await t.test('supersession and revocation remain append-only effective actions', (t) => {
        const supersessionFixture = fixture(t)
        const a = appendSnapshot(supersessionFixture)
        const b = appendSnapshot(supersessionFixture, {
            base: a.registry, baseDescriptor: a.object.descriptorSha256, action: 'supersede',
            manifest: 'd'.repeat(64), sequenceTime: '2026-08-15T18:00:03.000Z',
        })
        pointCurrent(supersessionFixture, b)
        assert.equal(effectiveRegistryEntry(resolveVerifiedQualificationRegistryHead(supersessionFixture.storeRoot).registry, subject()).entry.action, 'supersede')

        const revocationFixture = fixture(t)
        const accepted = appendSnapshot(revocationFixture)
        const revoked = appendSnapshot(revocationFixture, {
            base: accepted.registry, baseDescriptor: accepted.object.descriptorSha256, action: 'revoke',
            sequenceTime: '2026-08-15T18:00:04.000Z',
        })
        pointCurrent(revocationFixture, revoked)
        assert.equal(effectiveRegistryEntry(resolveVerifiedQualificationRegistryHead(revocationFixture.storeRoot).registry, subject()).state, 'revoked')
    })
})

test('mutable current-ref rollback is rejected for supersession, acceptance, revocation, and multi-step descendants', async (t) => {
    async function rollbackCase({ action = 'supersede', descendantSubject = subject(), steps = 1 }) {
        const current = fixture(t)
        const a = appendSnapshot(current)
        pointCurrent(current, a)
        let parent = a
        const snapshots = [a]
        for (let index = 0; index < steps; index += 1) {
            parent = appendSnapshot(current, {
                base: parent.registry,
                baseDescriptor: parent.object.descriptorSha256,
                action: index === 0 ? action : 'accept',
                currentSubject: index === 0 ? descendantSubject : subject(String(index + 5)),
                manifest: String.fromCharCode(98 + index).repeat(64),
                sequenceTime: `2026-08-15T18:01:0${index}.000Z`,
            })
            snapshots.push(parent)
        }
        pointCurrent(current, steps === 1 ? a : snapshots.at(-2))
        expectCode(() => resolveVerifiedQualificationRegistryHead(current.storeRoot), 'QUALIFICATION_REGISTRY_HEAD_ROLLBACK')
        return { ...current, a, maximal: parent }
    }

    const superseded = await rollbackCase({ action: 'supersede' })
    const preflight = preflightOperatingCohort({ storeRoot: superseded.storeRoot, expectation: expectation(subject()), subjectRoot })
    assert.equal(preflight.toolchainPilotClosurePassed, false)
    assert.equal(preflight.reason, 'registry-head-rollback')
    expectCode(() => verifyQualificationRegistry({
        storeRoot: superseded.storeRoot,
        registryDescriptorSha256: superseded.a.object.descriptorSha256,
        expectedSubject: subject(),
        requireCurrentRef: false,
        subjectRoot,
    }), 'QUALIFICATION_REGISTRY_HEAD_ROLLBACK')
    await rollbackCase({ action: 'accept', descendantSubject: subject('2') })
    await rollbackCase({ action: 'revoke' })
    await rollbackCase({ action: 'accept', descendantSubject: subject('2'), steps: 2 })
})

test('published descendant crash window and forks fail closed without current-ref preference', async (t) => {
    await t.test('published descendant with stale ref', (t) => {
        const current = fixture(t)
        const a = appendSnapshot(current)
        pointCurrent(current, a)
        appendSnapshot(current, {
            base: a.registry, baseDescriptor: a.object.descriptorSha256,
            currentSubject: subject('2'), manifest: 'b'.repeat(64), sequenceTime: '2026-08-15T18:02:00.000Z',
        })
        expectCode(() => resolveVerifiedQualificationRegistryHead(current.storeRoot), 'QUALIFICATION_REGISTRY_HEAD_ROLLBACK')
    })
    await t.test('fork rejected with ref at either branch', (t) => {
        const current = fixture(t)
        const a = appendSnapshot(current)
        const b = appendSnapshot(current, {
            base: a.registry, baseDescriptor: a.object.descriptorSha256,
            currentSubject: subject('2'), manifest: 'b'.repeat(64), sequenceTime: '2026-08-15T18:02:01.000Z',
        })
        const c = appendSnapshot(current, {
            base: a.registry, baseDescriptor: a.object.descriptorSha256,
            currentSubject: subject('4'), manifest: 'c'.repeat(64), sequenceTime: '2026-08-15T18:02:02.000Z',
        })
        for (const branch of [b, c]) {
            pointCurrent(current, branch)
            expectCode(() => resolveVerifiedQualificationRegistryHead(current.storeRoot), 'QUALIFICATION_REGISTRY_FORK')
            const result = preflightOperatingCohort({ storeRoot: current.storeRoot, expectation: expectation(subject()), subjectRoot })
            assert.equal(result.toolchainPilotClosurePassed, false)
            assert.equal(result.reason, 'registry-fork')
        }
    })
})

test('orphan, sequence, current-ref metadata, invalid trailing, cycle-shaped, and multiple-genesis states fail closed', async (t) => {
    await t.test('orphan and sequence mismatch', (t) => {
        for (const mode of ['orphan', 'sequence-jump', 'sequence-repeat']) {
            const current = fixture(t)
            const a = appendSnapshot(current)
            pointCurrent(current, a)
            const candidate = appendRegistryEntry({
                baseRegistry: a.registry,
                baseRegistryDescriptorSha256: a.object.descriptorSha256,
                storeIdentityHash: current.identity.storeIdentityHash,
                action: 'accept', subject: subject('2'), qualificationManifestDescriptorSha256: 'b'.repeat(64),
                reason: mode, timestamp: '2026-08-15T18:03:00.000Z',
            }).registry
            const invalid = reseal(candidate, (value) => {
                if (mode === 'orphan') value.baseRegistryDescriptorSha256 = 'f'.repeat(64)
                if (mode === 'sequence-jump') value.snapshotSequence = 2
                if (mode === 'sequence-repeat') value.snapshotSequence = 0
            })
            if (mode === 'sequence-repeat') {
                expectCode(() => validateRegistry(invalid), 'INVALID_QUALIFICATION_REGISTRY')
            } else {
                publishAdversarialSnapshot(current, invalid)
                expectCode(() => resolveVerifiedQualificationRegistryHead(current.storeRoot), [
                    'MISSING_QUALIFICATION_REGISTRY_BASE', 'QUALIFICATION_REGISTRY_SEQUENCE_MISMATCH',
                    'QUALIFICATION_REGISTRY_INTEGRITY_ERROR',
                ])
                assert.equal(preflightOperatingCohort({
                    storeRoot: current.storeRoot, expectation: expectation(subject()), subjectRoot,
                }).toolchainPilotClosurePassed, false)
            }
        }
        for (const value of [-1, Number.MAX_SAFE_INTEGER + 1]) {
            const current = fixture(t)
            const a = appendSnapshot(current)
            expectCode(() => validateRegistry(reseal(a.registry, (registry) => { registry.snapshotSequence = value })), 'INVALID_QUALIFICATION_REGISTRY')
        }
    })

    await t.test('current-ref metadata mismatch', (t) => {
        for (const mode of ['sequence', 'registry-id', 'registry-schema', 'store-id', 'missing-snapshot', 'non-snapshot']) {
            const current = fixture(t)
            const a = appendSnapshot(current)
            const valid = buildCurrentRef({
                storeIdentityHash: current.identity.storeIdentityHash,
                registryId: a.registry.registryId,
                registryDescriptorSha256: a.object.descriptorSha256,
                snapshotSequence: a.registry.snapshotSequence,
                registryRootSha256: a.registry.registryRootSha256,
                updatedAt: CREATED_AT,
            })
            let invalid
            if (mode === 'sequence') invalid = reseal(valid, (value) => { value.snapshotSequence = 1 })
            else if (mode === 'registry-id') invalid = reseal(valid, (value) => { value.registryId = 'f'.repeat(64) })
            else if (mode === 'registry-schema') invalid = reseal(valid, (value) => { value.registrySchema = 'unknown-registry-schema' })
            else if (mode === 'store-id') invalid = reseal(valid, (value) => { value.storeIdentityHash = 'e'.repeat(64) })
            else {
                const descriptorSha256 = mode === 'missing-snapshot'
                    ? 'd'.repeat(64)
                    : publishAdversarialSnapshot(current, a.registry, {
                        descriptorOverrides: { role: 'diagnostic-not-registry' },
                        publishMarker: false,
                    }).descriptorSha256
                invalid = reseal(valid, (value) => { value.registryDescriptorSha256 = descriptorSha256 })
            }
            const file = path.join(current.storeRoot, 'v2/refs/qualification/current.json')
            fs.writeFileSync(file, canonicalJsonBytes(invalid), { mode: 0o600 })
            expectCode(() => resolveVerifiedQualificationRegistryHead(current.storeRoot), [
                'INVALID_QUALIFICATION_CURRENT_REF', 'STORE_IDENTITY_MISMATCH', 'QUALIFICATION_REGISTRY_CURRENT_REF_MISMATCH',
            ])
            assert.equal(preflightOperatingCohort({
                storeRoot: current.storeRoot, expectation: expectation(subject()), subjectRoot,
            }).toolchainPilotClosurePassed, false)
        }
    })

    await t.test('invalid trailing snapshot variants', (t) => {
        for (const mode of ['truncated-marker', 'symlink-marker', 'corrupt-payload', 'descriptor-role', 'unknown-schema', 'wrong-predecessor', 'wrong-sequence']) {
            const current = fixture(t)
            const a = appendSnapshot(current)
            pointCurrent(current, a)
            if (mode === 'truncated-marker') {
                const markerPath = path.join(current.storeRoot, 'v2/registries/qualification', a.registry.registryId, 'snapshots', `${'f'.repeat(64)}.json`)
                durablePublishExact(markerPath, Buffer.from('{"truncated":'), path.join(current.storeRoot, 'v2/tmp'))
            } else if (mode === 'symlink-marker') {
                const markerPath = path.join(current.storeRoot, 'v2/registries/qualification', a.registry.registryId, 'snapshots', `${'f'.repeat(64)}.json`)
                fs.symlinkSync(path.join(current.storeRoot, 'v2/refs/qualification/current.json'), markerPath)
            } else {
                const candidate = appendRegistryEntry({
                    baseRegistry: a.registry, baseRegistryDescriptorSha256: a.object.descriptorSha256,
                    storeIdentityHash: current.identity.storeIdentityHash, action: 'accept', subject: subject('2'),
                    qualificationManifestDescriptorSha256: 'b'.repeat(64), reason: mode,
                    timestamp: '2026-08-15T18:04:00.000Z',
                }).registry
                if (mode === 'corrupt-payload') publishAdversarialSnapshot(current, candidate, { payloadBytes: Buffer.from('corrupt') })
                else if (mode === 'descriptor-role') publishAdversarialSnapshot(current, candidate, { descriptorOverrides: { role: 'diagnostic-not-registry' } })
                else if (mode === 'unknown-schema') publishAdversarialSnapshot(current, candidate, { descriptorOverrides: { referencedSchema: 'unknown-registry-schema' } })
                else if (mode === 'wrong-predecessor') publishAdversarialSnapshot(current, reseal(candidate, (value) => { value.baseRegistryDescriptorSha256 = 'e'.repeat(64) }))
                else publishAdversarialSnapshot(current, reseal(candidate, (value) => { value.snapshotSequence = 2 }))
            }
            expectCode(() => resolveVerifiedQualificationRegistryHead(current.storeRoot), [
                'QUALIFICATION_REGISTRY_INTEGRITY_ERROR', 'MISSING_QUALIFICATION_REGISTRY_BASE',
                'QUALIFICATION_REGISTRY_SEQUENCE_MISMATCH',
            ])
            assert.equal(preflightOperatingCohort({
                storeRoot: current.storeRoot, expectation: expectation(subject()), subjectRoot,
            }).toolchainPilotClosurePassed, false)
        }
    })

    await t.test('self-parent, cycle-shaped markers, and multiple genesis', (t) => {
        const selfParent = fixture(t)
        const a = appendSnapshot(selfParent)
        pointCurrent(selfParent, a)
        const markerPath = path.join(selfParent.storeRoot, 'v2/registries/qualification', a.registry.registryId, 'snapshots', `${'e'.repeat(64)}.json`)
        const marker = sealDocument({
            schema: SNAPSHOT_REF_SCHEMA,
            storeIdentityHash: selfParent.identity.storeIdentityHash,
            registryId: a.registry.registryId,
            registrySchema: QUALIFICATION_REGISTRY_SCHEMA,
            registryDescriptorSha256: 'e'.repeat(64),
            snapshotSequence: 1,
            previousSnapshotSha256: 'e'.repeat(64),
        })
        durablePublishExact(markerPath, canonicalJsonBytes(marker), path.join(selfParent.storeRoot, 'v2/tmp'))
        expectCode(() => resolveVerifiedQualificationRegistryHead(selfParent.storeRoot), 'QUALIFICATION_REGISTRY_INTEGRITY_ERROR')
        assert.equal(preflightOperatingCohort({
            storeRoot: selfParent.storeRoot, expectation: expectation(subject()), subjectRoot,
        }).toolchainPilotClosurePassed, false)

        const cycle = fixture(t)
        const cycleGenesis = appendSnapshot(cycle)
        pointCurrent(cycle, cycleGenesis)
        for (const [digest, predecessor] of [['c'.repeat(64), 'd'.repeat(64)], ['d'.repeat(64), 'c'.repeat(64)]]) {
            const cycleMarker = sealDocument({
                schema: SNAPSHOT_REF_SCHEMA,
                storeIdentityHash: cycle.identity.storeIdentityHash,
                registryId: cycleGenesis.registry.registryId,
                registrySchema: QUALIFICATION_REGISTRY_SCHEMA,
                registryDescriptorSha256: digest,
                snapshotSequence: 1,
                previousSnapshotSha256: predecessor,
            })
            const cycleMarkerPath = path.join(cycle.storeRoot, 'v2/registries/qualification', cycleGenesis.registry.registryId, 'snapshots', `${digest}.json`)
            durablePublishExact(cycleMarkerPath, canonicalJsonBytes(cycleMarker), path.join(cycle.storeRoot, 'v2/tmp'))
        }
        expectCode(() => resolveVerifiedQualificationRegistryHead(cycle.storeRoot), 'QUALIFICATION_REGISTRY_INTEGRITY_ERROR')
        assert.equal(preflightOperatingCohort({
            storeRoot: cycle.storeRoot, expectation: expectation(subject()), subjectRoot,
        }).toolchainPilotClosurePassed, false)

        const multiple = fixture(t)
        const first = appendSnapshot(multiple)
        const second = appendSnapshot(multiple, { currentSubject: subject('2'), manifest: 'b'.repeat(64), sequenceTime: '2026-08-15T18:05:00.000Z' })
        pointCurrent(multiple, first)
        assert.notEqual(first.object.descriptorSha256, second.object.descriptorSha256)
        expectCode(() => resolveVerifiedQualificationRegistryHead(multiple.storeRoot), 'QUALIFICATION_REGISTRY_GENESIS_COUNT')
        assert.equal(preflightOperatingCohort({
            storeRoot: multiple.storeRoot, expectation: expectation(subject()), subjectRoot,
        }).toolchainPilotClosurePassed, false)
    })
})

test('other registry IDs are isolated while malformed subject-registry objects fail closed', (t) => {
    const current = fixture(t)
    const a = appendSnapshot(current)
    pointCurrent(current, a)
    const otherId = 'f'.repeat(64)
    const otherDirectory = path.join(current.storeRoot, 'v2/registries/qualification', otherId, 'snapshots')
    fs.mkdirSync(otherDirectory, { recursive: true, mode: 0o700 })
    fs.writeFileSync(path.join(otherDirectory, 'ignored'), 'not this registry', { mode: 0o600 })
    assert.equal(resolveVerifiedQualificationRegistryHead(current.storeRoot).registryDescriptorSha256, a.object.descriptorSha256)

    const subjectDirectory = path.join(current.storeRoot, 'v2/registries/qualification', a.registry.registryId, 'snapshots')
    fs.writeFileSync(path.join(subjectDirectory, 'malformed'), 'subject registry corruption', { mode: 0o600 })
    expectCode(() => resolveVerifiedQualificationRegistryHead(current.storeRoot), 'QUALIFICATION_REGISTRY_INTEGRITY_ERROR')
    assert.equal(preflightOperatingCohort({
        storeRoot: current.storeRoot, expectation: expectation(subject()), subjectRoot,
    }).toolchainPilotClosurePassed, false)
})

test('known first failure remains immutable non-authoritative defect evidence', () => {
    const file = '/home/ubuntu/.local/share/pocketrisu-patcher/evidence-quarantine/qualification-negative-matrix-superseded-current-ref-3eadadc/qualification-negative-matrix-v2-first-failure.json'
    const bytes = fs.readFileSync(file)
    assert.equal(bytes.length, 4342)
    assert.equal(sha256(bytes), '941e8abb0397569925587ed1325493d895dbf0706c777a521002994da403b321')
    const parsed = JSON.parse(bytes)
    assert.equal(parsed.authoritative, false)
    assert.equal(parsed.productionDefectYield, false)
})
