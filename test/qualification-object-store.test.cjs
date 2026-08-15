'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { after, test } = require('node:test')
const {
    SIZE_LIMITS,
    assertOwnedPrivateDirectoryStat,
    assertPayloadSizeWithinLimit,
    assertPublicationBatchSize,
    canonicalJsonBytes,
    contentAddressPath,
    initializeQualificationStore,
    loadPublishedObject,
    loadStoreIdentity,
    parseJsonStrict,
    publishEvidenceBatch,
} = require('../src/qualification-object-store.cjs')

const repositoryRoot = path.resolve(__dirname, '..')
const subjectRoot = '/home/ubuntu/nai-studio-2/.worktrees/toolchain-hardening-shadow-pilot'
const targetRoot = '/tmp/pocketrisu-v190-audit'
const quarantineRoot = '/home/ubuntu/.local/share/pocketrisu-patcher/evidence-quarantine'
const externalParent = path.resolve(repositoryRoot, '../..')
const integritySentinels = [
    path.join(repositoryRoot, 'scripts/verify-all-combinations.cjs'),
    path.join(repositoryRoot, 'src/c0-policy.cjs'),
    path.join(repositoryRoot, 'contracts/toolchain-hardening-shadow-v1.json'),
    path.join(targetRoot, 'package.json'),
].filter((file) => fs.existsSync(file))
const initialSentinelHashes = new Map(integritySentinels.map((file) => [file, fileSha256(file)]))

function fileSha256(file) {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function expectCode(action, code) {
    assert.throws(action, (error) => error?.code === code)
}

function fixture(t) {
    const root = fs.mkdtempSync(path.join(externalParent, '.qualification-evidence-test-'))
    t.after(() => fs.rmSync(root, { recursive: true, force: true }))
    return root
}

function forbiddenRoots() {
    return [repositoryRoot, subjectRoot, targetRoot, quarantineRoot]
}

function initializedFixture(t) {
    const parent = fixture(t)
    const storeRoot = path.join(parent, 'store')
    const identity = initializeQualificationStore({
        storeRoot,
        forbiddenRoots: forbiddenRoots(),
        createdAt: '2026-08-15T00:00:00.000Z',
        storeUuid: '11111111-1111-4111-8111-111111111111',
    })
    return { parent, storeRoot, identity }
}

function schemaRegistry() {
    return new Map([['qualification-test-document-v1', (document) => {
        assert.equal(document.schema, 'qualification-test-document-v1')
        assert.equal(typeof document.value, 'string')
    }]])
}

function publish(storeRoot, entry, options = {}) {
    return publishEvidenceBatch({
        storeRoot,
        entries: [entry],
        schemaRegistry: schemaRegistry(),
        publisherToolIdentity: { qualificationToolCommit: 'test-tool-commit' },
        createdAt: '2026-08-15T00:00:01.000Z',
        ...options,
    })
}

after(() => {
    for (const [file, expected] of initialSentinelHashes) {
        assert.equal(fileSha256(file), expected, `object-store tests changed integrity sentinel ${file}`)
    }
})

test('missing and unavailable stores fail closed while explicit initialization creates one', (t) => {
    const parent = fixture(t)
    const missing = path.join(parent, 'missing')
    expectCode(() => loadStoreIdentity(missing), 'STORE_MISSING')
    const blockingFile = path.join(parent, 'not-a-directory')
    fs.writeFileSync(blockingFile, 'x')
    expectCode(() => initializeQualificationStore({ storeRoot: blockingFile, forbiddenRoots: forbiddenRoots() }), 'STORE_NOT_DIRECTORY')
    const created = path.join(parent, 'created')
    assert.equal(initializeQualificationStore({ storeRoot: created, forbiddenRoots: forbiddenRoots() }).rootRealpath, created)
})

test('temporary, repository, target, and quarantine-contained roots are rejected', () => {
    expectCode(() => initializeQualificationStore({ storeRoot: '/tmp/qualification-store', forbiddenRoots: forbiddenRoots() }), 'TEMPORARY_STORE_ROOT')
    expectCode(() => initializeQualificationStore({ storeRoot: '/var/tmp/qualification-store', forbiddenRoots: forbiddenRoots() }), 'TEMPORARY_STORE_ROOT')
    expectCode(() => initializeQualificationStore({ storeRoot: path.join(repositoryRoot, '.store'), forbiddenRoots: forbiddenRoots() }), 'STORE_INSIDE_FORBIDDEN_ROOT')
    expectCode(() => initializeQualificationStore({ storeRoot: path.join(targetRoot, '.store'), forbiddenRoots: forbiddenRoots() }), 'TEMPORARY_STORE_ROOT')
    expectCode(() => initializeQualificationStore({ storeRoot: path.join(quarantineRoot, '.store'), forbiddenRoots: forbiddenRoots() }), 'STORE_INSIDE_FORBIDDEN_ROOT')
})

test('symlink roots and paths reached through symlinks are rejected', (t) => {
    const parent = fixture(t)
    const real = path.join(parent, 'real')
    fs.mkdirSync(real, { mode: 0o700 })
    const link = path.join(parent, 'link')
    fs.symlinkSync(real, link)
    expectCode(() => initializeQualificationStore({ storeRoot: link, forbiddenRoots: forbiddenRoots() }), 'SYMLINK_STORE_ROOT')
    expectCode(() => initializeQualificationStore({ storeRoot: path.join(link, 'nested'), forbiddenRoots: forbiddenRoots() }), 'SYMLINK_STORE_ROOT')
})

test('owner and private-mode validation rejects wrong owner and unsafe modes', (t) => {
    const fake = (uid, mode) => ({ uid, mode, isDirectory: () => true })
    expectCode(() => assertOwnedPrivateDirectoryStat(fake(process.geteuid() + 1, 0o40700), process.geteuid(), 'fake'), 'STORE_WRONG_OWNER')
    expectCode(() => assertOwnedPrivateDirectoryStat(fake(process.geteuid(), 0o40720), process.geteuid(), 'fake'), 'STORE_GROUP_WRITABLE')
    expectCode(() => assertOwnedPrivateDirectoryStat(fake(process.geteuid(), 0o40702), process.geteuid(), 'fake'), 'STORE_WORLD_WRITABLE')
    const { storeRoot } = initializedFixture(t)
    fs.chmodSync(storeRoot, 0o500)
    expectCode(() => loadStoreIdentity(storeRoot), 'STORE_WRONG_MODE')
    fs.chmodSync(storeRoot, 0o700)
})

test('store identity is canonical, private, idempotent, and incompatible identities fail', (t) => {
    const { storeRoot, identity } = initializedFixture(t)
    assert.equal(identity.schema, 'patch-evidence-store-identity-v1')
    assert.equal(identity.durabilityClass, 'server-local')
    assert.equal(fs.statSync(storeRoot).mode & 0o777, 0o700)
    const identityPath = path.join(storeRoot, 'STORE-IDENTITY.json')
    const encoded = fs.readFileSync(identityPath)
    assert.deepEqual(encoded, canonicalJsonBytes(parseJsonStrict(encoded)))
    assert.equal(fs.statSync(identityPath).mode & 0o222, 0)
    assert.equal(initializeQualificationStore({ storeRoot, forbiddenRoots: forbiddenRoots() }).storeIdentityHash, identity.storeIdentityHash)
    const altered = { ...identity, objectNamespaceVersion: 'v3' }
    fs.chmodSync(identityPath, 0o600)
    fs.writeFileSync(identityPath, canonicalJsonBytes(altered))
    fs.chmodSync(identityPath, 0o444)
    expectCode(() => initializeQualificationStore({ storeRoot, forbiddenRoots: forbiddenRoots() }), 'INCOMPATIBLE_STORE_IDENTITY')
})

test('exact raw blobs preserve every byte and exact JSON binds raw and semantic hashes', (t) => {
    const { storeRoot } = initializedFixture(t)
    const raw = Buffer.from('{\n  "value": "e\u0301",\n  "schema": "qualification-test-document-v1"\n}\n')
    const result = publish(storeRoot, {
        payloadModel: 'raw-blob',
        mediaType: 'application/json',
        role: 'local-exact-receipt',
        referencedSchema: 'qualification-test-document-v1',
        value: raw,
    })
    const loaded = loadPublishedObject({ storeRoot, descriptorSha256: result.objects[0].descriptorSha256, schemaRegistry: schemaRegistry() })
    assert.deepEqual(loaded.payload, raw)
    assert.equal(loaded.descriptor.payloadSha256, crypto.createHash('sha256').update(raw).digest('hex'))
    assert.match(loaded.descriptor.canonicalSemanticSha256, /^[0-9a-f]{64}$/)
})

test('canonical JSON sorts keys, retains array order, and round-trips', (t) => {
    const { storeRoot } = initializedFixture(t)
    const result = publish(storeRoot, {
        payloadModel: 'canonical-json',
        mediaType: 'application/json',
        role: 'machine-document',
        referencedSchema: 'qualification-test-document-v1',
        value: { value: 'ok', schema: 'qualification-test-document-v1' },
    })
    const loaded = loadPublishedObject({ storeRoot, descriptorSha256: result.objects[0].descriptorSha256, schemaRegistry: schemaRegistry() })
    assert.equal(loaded.payload.toString(), '{"schema":"qualification-test-document-v1","value":"ok"}')
    assert.deepEqual(loaded.document, { schema: 'qualification-test-document-v1', value: 'ok' })
})

test('strict JSON rejects duplicate keys, trailing data, BOM, and non-finite values', () => {
    expectCode(() => parseJsonStrict('{"a":1,"a":2}'), 'DUPLICATE_JSON_KEY')
    expectCode(() => parseJsonStrict('{"a":1} trailing'), 'TRAILING_JSON_DATA')
    expectCode(() => parseJsonStrict(Buffer.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d])), 'JSON_BOM_FORBIDDEN')
    expectCode(() => parseJsonStrict('{"a":1e999}'), 'UNSUPPORTED_JSON_VALUE')
})

test('canonical JSON rejects undefined, functions, symbols, and unsupported prototypes', (t) => {
    const { storeRoot } = initializedFixture(t)
    for (const value of [
        { schema: 'qualification-test-document-v1', value: undefined },
        { schema: 'qualification-test-document-v1', value: () => null },
        { schema: 'qualification-test-document-v1', value: Symbol('x') },
        new Date(),
    ]) {
        expectCode(() => publish(storeRoot, {
            payloadModel: 'canonical-json', mediaType: 'application/json', role: 'unsupported-value',
            referencedSchema: 'qualification-test-document-v1', value,
        }), 'UNSUPPORTED_JSON_VALUE')
    }
})

test('unknown payload models, media types, and schemas fail before publication', (t) => {
    const { storeRoot } = initializedFixture(t)
    expectCode(() => publish(storeRoot, { payloadModel: 'mystery', mediaType: 'application/json', role: 'bad', value: Buffer.alloc(0) }), 'UNKNOWN_PAYLOAD_MODEL')
    expectCode(() => publish(storeRoot, { payloadModel: 'raw-blob', mediaType: 'application/octet-stream', role: 'bad', value: Buffer.alloc(0) }), 'UNKNOWN_MEDIA_TYPE')
    expectCode(() => publish(storeRoot, {
        payloadModel: 'raw-blob', mediaType: 'application/json', role: 'bad-schema',
        referencedSchema: 'unknown-v1', value: Buffer.from('{"schema":"unknown-v1"}'),
    }), 'UNKNOWN_REFERENCED_SCHEMA')
})

test('exact duplicate publication is idempotent and final objects are read-only', (t) => {
    const { storeRoot } = initializedFixture(t)
    const entry = {
        payloadModel: 'raw-blob', mediaType: 'text/markdown; charset=utf-8',
        role: 'closure-narrative', value: Buffer.from('exact\nbytes\n'),
    }
    const first = publish(storeRoot, entry)
    const second = publish(storeRoot, entry)
    assert.equal(first.objects[0].payloadCreated, true)
    assert.equal(second.objects[0].payloadCreated, false)
    assert.equal(second.objects[0].descriptorCreated, false)
    assert.equal(fs.statSync(first.objects[0].payloadPath).mode & 0o222, 0)
    assert.equal(fs.statSync(first.objects[0].descriptorPath).mode & 0o222, 0)
})

test('same content-address path with different bytes fails as corruption', (t) => {
    const { storeRoot } = initializedFixture(t)
    const entry = {
        payloadModel: 'raw-blob', mediaType: 'text/markdown; charset=utf-8',
        role: 'collision-test', value: Buffer.from('expected'),
    }
    const first = publish(storeRoot, entry)
    const payloadPath = first.objects[0].payloadPath
    fs.chmodSync(payloadPath, 0o600)
    fs.writeFileSync(payloadPath, 'different')
    fs.chmodSync(payloadPath, 0o444)
    expectCode(() => publish(storeRoot, entry), 'CONTENT_ADDRESS_COLLISION')
})

test('interrupted temporary files do not become objects', (t) => {
    const { storeRoot } = initializedFixture(t)
    const temporary = path.join(storeRoot, 'v2/tmp/.interrupted.tmp')
    fs.writeFileSync(temporary, 'partial', { mode: 0o600 })
    const result = publish(storeRoot, {
        payloadModel: 'raw-blob', mediaType: 'text/markdown; charset=utf-8',
        role: 'after-interruption', value: Buffer.from('complete'),
    })
    assert.equal(fs.readFileSync(result.objects[0].payloadPath, 'utf8'), 'complete')
    assert.equal(fs.existsSync(temporary), true)
})

test('partial batch publication cannot create registry or current refs', (t) => {
    const { storeRoot } = initializedFixture(t)
    const originalLink = fs.linkSync
    let links = 0
    fs.linkSync = (...args) => {
        links += 1
        if (links === 2) {
            const error = new Error('simulated interruption')
            error.code = 'EIO'
            throw error
        }
        return originalLink(...args)
    }
    try {
        assert.throws(() => publish(storeRoot, {
            payloadModel: 'raw-blob', mediaType: 'text/markdown; charset=utf-8',
            role: 'partial-batch', value: Buffer.from('orphan-safe-cas-payload'),
        }), /simulated interruption/)
    } finally {
        fs.linkSync = originalLink
    }
    assert.deepEqual(fs.readdirSync(path.join(storeRoot, 'v2/registries/qualification')), [])
    assert.deepEqual(fs.readdirSync(path.join(storeRoot, 'v2/refs/qualification')), [])
})

test('publication flushes files and containing directories', (t) => {
    const { storeRoot } = initializedFixture(t)
    const originalFsync = fs.fsyncSync
    let calls = 0
    fs.fsyncSync = (...args) => { calls += 1; return originalFsync(...args) }
    try {
        publish(storeRoot, {
            payloadModel: 'raw-blob', mediaType: 'text/markdown; charset=utf-8',
            role: 'fsync-test', value: Buffer.from('flush-me'),
        })
    } finally {
        fs.fsyncSync = originalFsync
    }
    assert.ok(calls >= 6, `expected file and directory fsync calls, observed ${calls}`)
})

test('payload, descriptor, and batch limits fail closed without large allocations', () => {
    assert.doesNotThrow(() => assertPayloadSizeWithinLimit(SIZE_LIMITS.machineCanonicalJson, 'machine-canonical-json'))
    expectCode(() => assertPayloadSizeWithinLimit(SIZE_LIMITS.machineCanonicalJson + 1, 'machine-canonical-json'), 'PAYLOAD_SIZE_LIMIT')
    expectCode(() => assertPayloadSizeWithinLimit(SIZE_LIMITS.registrySnapshot + 1, 'registry-snapshot'), 'PAYLOAD_SIZE_LIMIT')
    expectCode(() => assertPayloadSizeWithinLimit(SIZE_LIMITS.rawPayload + 1, 'raw-payload'), 'PAYLOAD_SIZE_LIMIT')
    assert.doesNotThrow(() => assertPublicationBatchSize(SIZE_LIMITS.publicationBatch))
    expectCode(() => assertPublicationBatchSize(SIZE_LIMITS.publicationBatch + 1), 'PUBLICATION_BATCH_SIZE_LIMIT')
    assert.ok(canonicalJsonBytes({ schema: 'x', value: 'x' }).length < SIZE_LIMITS.descriptor)
})

test('legacy C0 object namespace is not created or reinterpreted', (t) => {
    const { storeRoot } = initializedFixture(t)
    assert.equal(fs.existsSync(path.join(storeRoot, 'objects')), false)
    assert.equal(fs.existsSync(contentAddressPath(storeRoot, 'payloads', '0'.repeat(64))), false)
})
