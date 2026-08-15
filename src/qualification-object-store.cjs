'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { TextDecoder } = require('node:util')

const STORE_IDENTITY_SCHEMA = 'patch-evidence-store-identity-v1'
const OBJECT_DESCRIPTOR_SCHEMA = 'patch-evidence-object-descriptor-v1'
const STORE_IDENTITY_FILE = 'STORE-IDENTITY.json'
const OBJECT_MODELS = Object.freeze(['canonical-json', 'raw-blob'])
const MEDIA_TYPES = new Set([
    'application/json',
    'application/x-ndjson',
    'text/markdown; charset=utf-8',
    'application/vnd.pocketrisu.toolchain-shadow-pilot-closure+json',
    'application/vnd.pocketrisu.qualification-manifest+json',
    'application/vnd.pocketrisu.qualification-validation+json',
    'application/vnd.pocketrisu.qualification-registry+json',
])
const SIZE_LIMITS = Object.freeze({
    descriptor: 64 * 1024,
    machineCanonicalJson: 4 * 1024 * 1024,
    registrySnapshot: 16 * 1024 * 1024,
    rawPayload: 64 * 1024 * 1024,
    publicationBatch: 256 * 1024 * 1024,
})
const REQUIRED_DIRECTORIES = Object.freeze([
    'v2',
    'v2/payloads',
    'v2/payloads/sha256',
    'v2/descriptors',
    'v2/descriptors/sha256',
    'v2/registries',
    'v2/registries/qualification',
    'v2/refs',
    'v2/refs/qualification',
    'v2/tmp',
])
const SHA256_PATTERN = /^[0-9a-f]{64}$/
const ROLE_PATTERN = /^[a-z][a-z0-9-]{0,127}$/
const textDecoder = new TextDecoder('utf-8', { fatal: true })

class QualificationObjectStoreError extends Error {
    constructor(code, message, details = null) {
        super(message)
        this.name = 'QualificationObjectStoreError'
        this.code = code
        this.details = details
    }
}

function fail(code, message, details = null) {
    throw new QualificationObjectStoreError(code, message, details)
}

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex')
}

function exactKeys(value, expected, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        fail('INVALID_DOCUMENT', `${label} must be an object`)
    }
    const actual = Object.keys(value).sort()
    const wanted = [...expected].sort()
    if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
        fail('INVALID_DOCUMENT', `${label} keys differ`, { actual, expected: wanted })
    }
}

function canonicalValue(value, seen = new Set()) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) fail('UNSUPPORTED_JSON_VALUE', 'Canonical JSON requires finite numbers')
        return value
    }
    if (typeof value !== 'object') {
        fail('UNSUPPORTED_JSON_VALUE', `Canonical JSON cannot encode ${typeof value}`)
    }
    if (seen.has(value)) fail('UNSUPPORTED_JSON_VALUE', 'Canonical JSON cannot encode cycles')
    const prototype = Object.getPrototypeOf(value)
    if (Array.isArray(value)) {
        seen.add(value)
        try {
            return value.map((entry) => canonicalValue(entry, seen))
        } finally {
            seen.delete(value)
        }
    }
    if (prototype !== Object.prototype && prototype !== null) {
        fail('UNSUPPORTED_JSON_VALUE', 'Canonical JSON requires plain-object prototypes')
    }
    seen.add(value)
    try {
        const result = {}
        for (const key of Object.keys(value).sort()) result[key] = canonicalValue(value[key], seen)
        return result
    } finally {
        seen.delete(value)
    }
}

function canonicalJson(value) {
    return JSON.stringify(canonicalValue(value))
}

function canonicalJsonBytes(value) {
    return Buffer.from(canonicalJson(value), 'utf8')
}

function decodeUtf8(bytes, label) {
    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)
    if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
        fail('JSON_BOM_FORBIDDEN', `${label} contains a UTF-8 BOM`)
    }
    try {
        return textDecoder.decode(buffer)
    } catch (error) {
        fail('INVALID_UTF8', `${label} is not valid UTF-8`, { cause: error.message })
    }
}

function parseJsonStrict(bytes, label = 'JSON') {
    const source = typeof bytes === 'string' ? bytes : decodeUtf8(bytes, label)
    let index = 0

    function skipWhitespace() {
        while (index < source.length && /[\x20\x09\x0a\x0d]/.test(source[index])) index += 1
    }

    function parseString() {
        if (source[index] !== '"') fail('INVALID_JSON', `${label} expected a string at offset ${index}`)
        const start = index
        index += 1
        while (index < source.length) {
            const character = source[index]
            if (character === '"') {
                index += 1
                const token = source.slice(start, index)
                try { return JSON.parse(token) } catch (error) {
                    fail('INVALID_JSON', `${label} contains an invalid string`, { cause: error.message })
                }
            }
            if (character === '\\') {
                index += 1
                if (index >= source.length) break
                if (source[index] === 'u') {
                    const escape = source.slice(index + 1, index + 5)
                    if (!/^[0-9a-fA-F]{4}$/.test(escape)) {
                        fail('INVALID_JSON', `${label} contains an invalid Unicode escape at offset ${index}`)
                    }
                    index += 5
                } else {
                    if (!/["\\/bfnrt]/.test(source[index])) {
                        fail('INVALID_JSON', `${label} contains an invalid escape at offset ${index}`)
                    }
                    index += 1
                }
            } else {
                if (source.charCodeAt(index) < 0x20) {
                    fail('INVALID_JSON', `${label} contains a control character at offset ${index}`)
                }
                index += 1
            }
        }
        fail('INVALID_JSON', `${label} contains an unterminated string`)
    }

    function parseNumber() {
        const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(source.slice(index))
        if (!match) fail('INVALID_JSON', `${label} contains an invalid number at offset ${index}`)
        index += match[0].length
        const value = Number(match[0])
        if (!Number.isFinite(value)) fail('UNSUPPORTED_JSON_VALUE', `${label} contains a non-finite number`)
        return value
    }

    function parseArray() {
        index += 1
        const result = []
        skipWhitespace()
        if (source[index] === ']') { index += 1; return result }
        while (true) {
            result.push(parseValue())
            skipWhitespace()
            if (source[index] === ']') { index += 1; return result }
            if (source[index] !== ',') fail('INVALID_JSON', `${label} expected ',' or ']' at offset ${index}`)
            index += 1
            skipWhitespace()
        }
    }

    function parseObject() {
        index += 1
        const result = {}
        const keys = new Set()
        skipWhitespace()
        if (source[index] === '}') { index += 1; return result }
        while (true) {
            const key = parseString()
            if (keys.has(key)) fail('DUPLICATE_JSON_KEY', `${label} repeats object key ${JSON.stringify(key)}`)
            keys.add(key)
            skipWhitespace()
            if (source[index] !== ':') fail('INVALID_JSON', `${label} expected ':' at offset ${index}`)
            index += 1
            skipWhitespace()
            result[key] = parseValue()
            skipWhitespace()
            if (source[index] === '}') { index += 1; return result }
            if (source[index] !== ',') fail('INVALID_JSON', `${label} expected ',' or '}' at offset ${index}`)
            index += 1
            skipWhitespace()
        }
    }

    function parseValue() {
        skipWhitespace()
        const character = source[index]
        if (character === '"') return parseString()
        if (character === '{') return parseObject()
        if (character === '[') return parseArray()
        if (character === '-' || /\d/.test(character ?? '')) return parseNumber()
        for (const [token, value] of [['true', true], ['false', false], ['null', null]]) {
            if (source.startsWith(token, index)) { index += token.length; return value }
        }
        fail('INVALID_JSON', `${label} contains an invalid token at offset ${index}`)
    }

    const result = parseValue()
    skipWhitespace()
    if (index !== source.length) fail('TRAILING_JSON_DATA', `${label} contains trailing data at offset ${index}`)
    return result
}

function pathIsInside(candidate, parent) {
    const relative = path.relative(path.resolve(parent), path.resolve(candidate))
    return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

function existingRealpath(value) {
    const absolute = path.resolve(value)
    return fs.existsSync(absolute) ? fs.realpathSync(absolute) : absolute
}

function assertNoSymlinkComponents(absolutePath) {
    const absolute = path.resolve(absolutePath)
    const parsed = path.parse(absolute)
    let current = parsed.root
    for (const part of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
        current = path.join(current, part)
        if (!fs.existsSync(current)) continue
        if (fs.lstatSync(current).isSymbolicLink()) {
            fail('SYMLINK_STORE_ROOT', `Evidence store path traverses a symlink: ${current}`)
        }
    }
}

function assertOwnedPrivateDirectoryStat(stat, effectiveUid, label) {
    if (!stat.isDirectory()) fail('STORE_NOT_DIRECTORY', `${label} is not a directory`)
    if (stat.uid !== effectiveUid) fail('STORE_WRONG_OWNER', `${label} is owned by UID ${stat.uid}, expected ${effectiveUid}`)
    const mode = stat.mode & 0o777
    if ((mode & 0o020) !== 0) fail('STORE_GROUP_WRITABLE', `${label} is group-writable`)
    if ((mode & 0o002) !== 0) fail('STORE_WORLD_WRITABLE', `${label} is world-writable`)
    if (mode !== 0o700) fail('STORE_WRONG_MODE', `${label} mode must be 0700, observed ${mode.toString(8).padStart(4, '0')}`)
}

function assertSafeStoreLocation(storeRoot, forbiddenRoots = []) {
    if (!path.isAbsolute(storeRoot)) fail('STORE_PATH_NOT_ABSOLUTE', '--store must be an absolute path')
    const absolute = path.resolve(storeRoot)
    assertNoSymlinkComponents(absolute)
    for (const temporaryRoot of ['/tmp', '/var/tmp']) {
        if (pathIsInside(absolute, temporaryRoot)) fail('TEMPORARY_STORE_ROOT', `Accepted store cannot be under ${temporaryRoot}`)
    }
    for (const forbidden of forbiddenRoots) {
        if (!forbidden) continue
        const resolved = existingRealpath(forbidden)
        if (pathIsInside(absolute, resolved)) {
            fail('STORE_INSIDE_FORBIDDEN_ROOT', `Accepted store is inside forbidden root ${resolved}`)
        }
    }
    return absolute
}

function fsyncDirectory(directory) {
    const descriptor = fs.openSync(directory, fs.constants.O_RDONLY)
    try { fs.fsyncSync(descriptor) } finally { fs.closeSync(descriptor) }
}

function mkdirPrivate(directory) {
    if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, { mode: 0o700 })
        fsyncDirectory(path.dirname(directory))
    }
    const stat = fs.lstatSync(directory)
    if (stat.isSymbolicLink()) fail('SYMLINK_STORE_ROOT', `Store directory is a symlink: ${directory}`)
    assertOwnedPrivateDirectoryStat(stat, process.geteuid(), `Store directory ${directory}`)
}

function durablePublishExact(finalPath, bytes, temporaryDirectory) {
    const payload = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)
    mkdirPrivate(path.dirname(finalPath))
    mkdirPrivate(temporaryDirectory)
    const temporary = path.join(temporaryDirectory, `.${path.basename(finalPath)}.${process.pid}.${crypto.randomUUID()}.tmp`)
    let created = false
    try {
        const descriptor = fs.openSync(temporary, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o600)
        try {
            let offset = 0
            while (offset < payload.length) offset += fs.writeSync(descriptor, payload, offset)
            fs.fsyncSync(descriptor)
        } finally {
            fs.closeSync(descriptor)
        }
        const reread = fs.readFileSync(temporary)
        if (!reread.equals(payload)) fail('TEMPORARY_OBJECT_MISMATCH', `Temporary evidence object failed exact reread: ${temporary}`)
        fs.chmodSync(temporary, 0o444)
        try {
            fs.linkSync(temporary, finalPath)
            created = true
            fsyncDirectory(path.dirname(finalPath))
        } catch (error) {
            if (error.code !== 'EEXIST') throw error
            const existingStat = fs.lstatSync(finalPath)
            if (!existingStat.isFile() || existingStat.isSymbolicLink()) {
                fail('CORRUPT_OBJECT_PATH', `Existing content-addressed path is not a regular file: ${finalPath}`)
            }
            const existing = fs.readFileSync(finalPath)
            if (!existing.equals(payload)) {
                fail('CONTENT_ADDRESS_COLLISION', `Existing content-addressed path has different bytes: ${finalPath}`)
            }
        }
        const finalBytes = fs.readFileSync(finalPath)
        if (!finalBytes.equals(payload)) fail('FINAL_OBJECT_MISMATCH', `Published object failed exact reread: ${finalPath}`)
        const finalStat = fs.lstatSync(finalPath)
        if (!finalStat.isFile() || finalStat.isSymbolicLink() || (finalStat.mode & 0o222) !== 0) {
            fail('FINAL_OBJECT_MODE_INVALID', `Published object is not immutable: ${finalPath}`)
        }
        return { created, path: finalPath, bytes: payload.length, sha256: sha256(payload) }
    } finally {
        try {
            fs.unlinkSync(temporary)
            fsyncDirectory(temporaryDirectory)
        } catch (error) {
            if (error.code !== 'ENOENT') throw error
        }
    }
}

function storeIdentityHash(identity) {
    const { storeIdentityHash: ignored, ...payload } = identity
    return sha256(canonicalJsonBytes(payload))
}

function validateStoreIdentity(identity, expectedRoot = null) {
    exactKeys(identity, [
        'schema', 'storeUuid', 'createdAt', 'effectiveUid', 'rootRealpath', 'durabilityClass',
        'objectNamespaceVersion', 'supportedObjectModels', 'sizeLimits', 'publicationAlgorithm',
        'registryNamespace', 'storeIdentityHash',
    ], 'store identity')
    if (identity.schema !== STORE_IDENTITY_SCHEMA
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(identity.storeUuid ?? '')
        || !Number.isInteger(identity.effectiveUid) || identity.effectiveUid < 0
        || identity.durabilityClass !== 'server-local'
        || identity.objectNamespaceVersion !== 'v2'
        || canonicalJson(identity.supportedObjectModels) !== canonicalJson(OBJECT_MODELS)
        || canonicalJson(identity.sizeLimits) !== canonicalJson(SIZE_LIMITS)
        || identity.publicationAlgorithm !== 'write-fsync-reread-link-fsync-v1'
        || identity.registryNamespace !== 'v2/registries/qualification'
        || !SHA256_PATTERN.test(identity.storeIdentityHash ?? '')
        || identity.storeIdentityHash !== storeIdentityHash(identity)) {
        fail('INCOMPATIBLE_STORE_IDENTITY', 'Evidence store identity is invalid or incompatible')
    }
    if (Number.isNaN(Date.parse(identity.createdAt))) fail('INCOMPATIBLE_STORE_IDENTITY', 'Store creation timestamp is invalid')
    if (expectedRoot !== null && identity.rootRealpath !== expectedRoot) {
        fail('INCOMPATIBLE_STORE_IDENTITY', 'Store identity root differs from the resolved root')
    }
    return identity
}

function initializeQualificationStore({
    storeRoot,
    forbiddenRoots = [],
    createdAt = new Date().toISOString(),
    storeUuid = crypto.randomUUID(),
}) {
    const absolute = assertSafeStoreLocation(storeRoot, forbiddenRoots)
    if (fs.existsSync(absolute)) {
        const stat = fs.lstatSync(absolute)
        if (stat.isSymbolicLink()) fail('SYMLINK_STORE_ROOT', 'Evidence store root cannot be a symlink')
        assertOwnedPrivateDirectoryStat(stat, process.geteuid(), 'Evidence store root')
    } else {
        if (!fs.existsSync(path.dirname(absolute))) fail('STORE_PARENT_MISSING', 'Evidence store parent does not exist')
        fs.mkdirSync(absolute, { mode: 0o700 })
        fsyncDirectory(path.dirname(absolute))
    }
    const root = fs.realpathSync(absolute)
    if (root !== absolute) fail('SYMLINK_STORE_ROOT', 'Evidence store realpath differs from the requested path')
    assertOwnedPrivateDirectoryStat(fs.lstatSync(root), process.geteuid(), 'Evidence store root')
    for (const relative of REQUIRED_DIRECTORIES) mkdirPrivate(path.join(root, relative))

    const identityPath = path.join(root, STORE_IDENTITY_FILE)
    if (fs.existsSync(identityPath)) return loadStoreIdentity(root)
    const identity = {
        schema: STORE_IDENTITY_SCHEMA,
        storeUuid,
        createdAt,
        effectiveUid: process.geteuid(),
        rootRealpath: root,
        durabilityClass: 'server-local',
        objectNamespaceVersion: 'v2',
        supportedObjectModels: [...OBJECT_MODELS],
        sizeLimits: { ...SIZE_LIMITS },
        publicationAlgorithm: 'write-fsync-reread-link-fsync-v1',
        registryNamespace: 'v2/registries/qualification',
        storeIdentityHash: null,
    }
    identity.storeIdentityHash = storeIdentityHash(identity)
    validateStoreIdentity(identity, root)
    durablePublishExact(identityPath, canonicalJsonBytes(identity), path.join(root, 'v2/tmp'))
    fsyncDirectory(root)
    return loadStoreIdentity(root)
}

function loadStoreIdentity(storeRoot) {
    const absolute = path.resolve(storeRoot)
    if (!fs.existsSync(absolute)) fail('STORE_MISSING', `Evidence store does not exist: ${absolute}`)
    assertNoSymlinkComponents(absolute)
    const root = fs.realpathSync(absolute)
    if (root !== absolute) fail('SYMLINK_STORE_ROOT', 'Evidence store realpath differs from requested path')
    assertOwnedPrivateDirectoryStat(fs.lstatSync(root), process.geteuid(), 'Evidence store root')
    for (const relative of REQUIRED_DIRECTORIES) {
        const directory = path.join(root, relative)
        if (!fs.existsSync(directory)) fail('STORE_NAMESPACE_MISSING', `Evidence store directory is missing: ${directory}`)
        assertOwnedPrivateDirectoryStat(fs.lstatSync(directory), process.geteuid(), `Store directory ${directory}`)
    }
    const identityPath = path.join(root, STORE_IDENTITY_FILE)
    if (!fs.existsSync(identityPath)) fail('STORE_UNINITIALIZED', `Evidence store identity is missing: ${identityPath}`)
    const encoded = fs.readFileSync(identityPath)
    const identity = parseJsonStrict(encoded, 'store identity')
    if (!encoded.equals(canonicalJsonBytes(identity))) fail('NONCANONICAL_STORE_IDENTITY', 'Store identity is not canonical JSON')
    return validateStoreIdentity(identity, root)
}

function baseSchemaRegistry() {
    return new Map([
        [STORE_IDENTITY_SCHEMA, (document) => validateStoreIdentity(document)],
        [OBJECT_DESCRIPTOR_SCHEMA, validateObjectDescriptor],
    ])
}

function mergedSchemaRegistry(schemaRegistry) {
    const registry = baseSchemaRegistry()
    if (schemaRegistry) {
        for (const [schema, validator] of schemaRegistry) {
            if (registry.has(schema)) fail('DUPLICATE_SCHEMA_VALIDATOR', `Schema validator already exists: ${schema}`)
            if (typeof validator !== 'function') fail('INVALID_SCHEMA_VALIDATOR', `Schema validator is not a function: ${schema}`)
            registry.set(schema, validator)
        }
    }
    return registry
}

function validateObjectDescriptor(descriptor) {
    exactKeys(descriptor, [
        'schema', 'payloadSha256', 'payloadBytes', 'payloadModel', 'mediaType', 'role',
        'contentEncoding', 'referencedSchema', 'canonicalSemanticSha256',
        'publisherToolIdentity', 'createdAt', 'sizeLimitClass',
    ], 'object descriptor')
    if (descriptor.schema !== OBJECT_DESCRIPTOR_SCHEMA
        || !SHA256_PATTERN.test(descriptor.payloadSha256 ?? '')
        || !Number.isSafeInteger(descriptor.payloadBytes) || descriptor.payloadBytes < 0
        || !OBJECT_MODELS.includes(descriptor.payloadModel)
        || !MEDIA_TYPES.has(descriptor.mediaType)
        || !ROLE_PATTERN.test(descriptor.role ?? '')
        || descriptor.contentEncoding !== 'identity'
        || (descriptor.referencedSchema !== null && typeof descriptor.referencedSchema !== 'string')
        || (descriptor.canonicalSemanticSha256 !== null && !SHA256_PATTERN.test(descriptor.canonicalSemanticSha256 ?? ''))
        || !descriptor.publisherToolIdentity || typeof descriptor.publisherToolIdentity !== 'object'
        || Array.isArray(descriptor.publisherToolIdentity)
        || Number.isNaN(Date.parse(descriptor.createdAt))
        || !['machine-canonical-json', 'registry-snapshot', 'raw-payload'].includes(descriptor.sizeLimitClass)) {
        fail('INVALID_OBJECT_DESCRIPTOR', 'Evidence object descriptor is invalid')
    }
    return descriptor
}

function assertPayloadSizeWithinLimit(bytes, sizeLimitClass) {
    const limit = {
        'machine-canonical-json': SIZE_LIMITS.machineCanonicalJson,
        'registry-snapshot': SIZE_LIMITS.registrySnapshot,
        'raw-payload': SIZE_LIMITS.rawPayload,
    }[sizeLimitClass]
    if (limit === undefined) fail('UNKNOWN_SIZE_LIMIT_CLASS', `Unknown size-limit class: ${sizeLimitClass}`)
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > limit) {
        fail('PAYLOAD_SIZE_LIMIT', `Payload exceeds ${sizeLimitClass} limit`)
    }
}

function assertPublicationBatchSize(bytes) {
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > SIZE_LIMITS.publicationBatch) {
        fail('PUBLICATION_BATCH_SIZE_LIMIT', 'Evidence publication batch exceeds limit')
    }
}

function contentAddressPath(storeRoot, namespace, digest, suffix = '') {
    if (!SHA256_PATTERN.test(digest ?? '')) fail('INVALID_CONTENT_HASH', 'Content address requires a SHA-256 digest')
    return path.join(storeRoot, 'v2', namespace, 'sha256', digest.slice(0, 2), `${digest.slice(2)}${suffix}`)
}

function preparePublication(entry, schemaRegistry, publisherToolIdentity, defaultCreatedAt) {
    if (!entry || typeof entry !== 'object') fail('INVALID_PUBLICATION', 'Evidence publication entry must be an object')
    if (!OBJECT_MODELS.includes(entry.payloadModel)) fail('UNKNOWN_PAYLOAD_MODEL', `Unknown payload model: ${entry.payloadModel}`)
    if (!MEDIA_TYPES.has(entry.mediaType)) fail('UNKNOWN_MEDIA_TYPE', `Unknown media type: ${entry.mediaType}`)
    if (!ROLE_PATTERN.test(entry.role ?? '')) fail('INVALID_OBJECT_ROLE', `Invalid evidence object role: ${entry.role}`)
    const referencedSchema = entry.referencedSchema ?? null
    let payload
    let parsed = null
    let canonicalSemanticSha256 = null
    let sizeLimitClass
    if (entry.payloadModel === 'canonical-json') {
        if (referencedSchema === null) fail('MISSING_REFERENCED_SCHEMA', 'Canonical JSON evidence requires a schema')
        const validator = schemaRegistry.get(referencedSchema)
        if (!validator) fail('UNKNOWN_REFERENCED_SCHEMA', `Unknown evidence schema: ${referencedSchema}`)
        if (Buffer.isBuffer(entry.value) || typeof entry.value === 'string') {
            const source = Buffer.isBuffer(entry.value) ? entry.value : Buffer.from(entry.value)
            parsed = parseJsonStrict(source, `canonical JSON ${entry.role}`)
            payload = canonicalJsonBytes(parsed)
            if (!source.equals(payload)) fail('NONCANONICAL_JSON', `Canonical JSON payload is not in canonical byte form: ${entry.role}`)
        } else {
            parsed = canonicalValue(entry.value)
            payload = canonicalJsonBytes(parsed)
        }
        validator(parsed)
        canonicalSemanticSha256 = sha256(payload)
        sizeLimitClass = entry.sizeLimitClass ?? (entry.mediaType === 'application/vnd.pocketrisu.qualification-registry+json'
            ? 'registry-snapshot' : 'machine-canonical-json')
        assertPayloadSizeWithinLimit(payload.length, sizeLimitClass)
    } else {
        payload = Buffer.isBuffer(entry.value) ? Buffer.from(entry.value) : Buffer.from(entry.value ?? '')
        sizeLimitClass = 'raw-payload'
        assertPayloadSizeWithinLimit(payload.length, sizeLimitClass)
        if (entry.mediaType === 'application/json') {
            if (referencedSchema === null) fail('MISSING_REFERENCED_SCHEMA', 'Exact JSON evidence requires a schema')
            const validator = schemaRegistry.get(referencedSchema)
            if (!validator) fail('UNKNOWN_REFERENCED_SCHEMA', `Unknown exact JSON schema: ${referencedSchema}`)
            parsed = parseJsonStrict(payload, `exact JSON ${entry.role}`)
            validator(parsed)
            canonicalSemanticSha256 = sha256(canonicalJsonBytes(parsed))
        } else if (referencedSchema !== null) {
            fail('UNSUPPORTED_RAW_SCHEMA', `Raw media type ${entry.mediaType} cannot declare schema ${referencedSchema}`)
        }
    }
    assertPayloadSizeWithinLimit(payload.length, sizeLimitClass)
    const payloadSha256 = sha256(payload)
    const descriptor = {
        schema: OBJECT_DESCRIPTOR_SCHEMA,
        payloadSha256,
        payloadBytes: payload.length,
        payloadModel: entry.payloadModel,
        mediaType: entry.mediaType,
        role: entry.role,
        contentEncoding: 'identity',
        referencedSchema,
        canonicalSemanticSha256,
        publisherToolIdentity: canonicalValue(entry.publisherToolIdentity ?? publisherToolIdentity),
        createdAt: entry.createdAt ?? defaultCreatedAt,
        sizeLimitClass,
    }
    validateObjectDescriptor(descriptor)
    const descriptorBytes = canonicalJsonBytes(descriptor)
    if (descriptorBytes.length > SIZE_LIMITS.descriptor) fail('DESCRIPTOR_SIZE_LIMIT', `${entry.role} descriptor exceeds limit`)
    return {
        payload,
        payloadSha256,
        parsed,
        descriptor,
        descriptorBytes,
        descriptorSha256: sha256(descriptorBytes),
    }
}

function publishEvidenceBatch({
    storeRoot,
    entries,
    schemaRegistry = null,
    publisherToolIdentity,
    createdAt = new Date().toISOString(),
}) {
    if (!Array.isArray(entries) || entries.length === 0) fail('EMPTY_PUBLICATION_BATCH', 'Evidence publication batch is empty')
    const identity = loadStoreIdentity(storeRoot)
    const root = identity.rootRealpath
    const registry = mergedSchemaRegistry(schemaRegistry)
    const prepared = entries.map((entry) => preparePublication(entry, registry, publisherToolIdentity, createdAt))
    const total = prepared.reduce((sum, entry) => sum + entry.payload.length + entry.descriptorBytes.length, 0)
    assertPublicationBatchSize(total)
    const temporaryDirectory = path.join(root, 'v2/tmp')
    const publications = []
    for (const record of prepared) {
        const payloadPath = contentAddressPath(root, 'payloads', record.payloadSha256)
        const payloadPublication = durablePublishExact(payloadPath, record.payload, temporaryDirectory)
        const descriptorPath = contentAddressPath(root, 'descriptors', record.descriptorSha256, '.json')
        const descriptorPublication = durablePublishExact(descriptorPath, record.descriptorBytes, temporaryDirectory)
        const payloadReread = fs.readFileSync(payloadPath)
        const descriptorReread = fs.readFileSync(descriptorPath)
        if (sha256(payloadReread) !== record.payloadSha256 || !payloadReread.equals(record.payload)
            || sha256(descriptorReread) !== record.descriptorSha256
            || !descriptorReread.equals(record.descriptorBytes)) {
            fail('POST_PUBLICATION_VERIFICATION_FAILED', 'Published evidence batch failed independent reread')
        }
        publications.push({
            payloadSha256: record.payloadSha256,
            payloadBytes: record.payload.length,
            payloadPath,
            payloadCreated: payloadPublication.created,
            descriptorSha256: record.descriptorSha256,
            descriptorBytes: record.descriptorBytes.length,
            descriptorPath,
            descriptorCreated: descriptorPublication.created,
            descriptor: record.descriptor,
        })
    }
    return {
        storeIdentityHash: identity.storeIdentityHash,
        totalBytes: total,
        objects: publications,
    }
}

function loadPublishedObject({ storeRoot, descriptorSha256, schemaRegistry = null }) {
    const identity = loadStoreIdentity(storeRoot)
    const root = identity.rootRealpath
    const descriptorPath = contentAddressPath(root, 'descriptors', descriptorSha256, '.json')
    const descriptorBytes = fs.readFileSync(descriptorPath)
    if (sha256(descriptorBytes) !== descriptorSha256) fail('DESCRIPTOR_HASH_MISMATCH', 'Descriptor hash mismatch')
    const descriptor = parseJsonStrict(descriptorBytes, 'object descriptor')
    if (!descriptorBytes.equals(canonicalJsonBytes(descriptor))) fail('NONCANONICAL_DESCRIPTOR', 'Object descriptor is not canonical JSON')
    validateObjectDescriptor(descriptor)
    const payloadPath = contentAddressPath(root, 'payloads', descriptor.payloadSha256)
    const payload = fs.readFileSync(payloadPath)
    if (payload.length !== descriptor.payloadBytes || sha256(payload) !== descriptor.payloadSha256) {
        fail('PAYLOAD_HASH_MISMATCH', 'Evidence payload size or hash mismatch')
    }
    let document = null
    if (descriptor.payloadModel === 'canonical-json' || descriptor.mediaType === 'application/json') {
        document = parseJsonStrict(payload, `payload ${descriptor.role}`)
        const semanticHash = sha256(canonicalJsonBytes(document))
        if (semanticHash !== descriptor.canonicalSemanticSha256) fail('SEMANTIC_HASH_MISMATCH', 'Evidence semantic hash mismatch')
        if (descriptor.payloadModel === 'canonical-json' && !payload.equals(canonicalJsonBytes(document))) {
            fail('NONCANONICAL_JSON', 'Canonical evidence payload bytes are not canonical')
        }
        const registry = mergedSchemaRegistry(schemaRegistry)
        const validator = registry.get(descriptor.referencedSchema)
        if (!validator) fail('UNKNOWN_REFERENCED_SCHEMA', `Unknown evidence schema: ${descriptor.referencedSchema}`)
        validator(document)
    }
    return { identity, descriptor, descriptorSha256, descriptorPath, payload, payloadPath, document }
}

module.exports = {
    MEDIA_TYPES,
    OBJECT_DESCRIPTOR_SCHEMA,
    OBJECT_MODELS,
    QualificationObjectStoreError,
    REQUIRED_DIRECTORIES,
    SIZE_LIMITS,
    STORE_IDENTITY_FILE,
    STORE_IDENTITY_SCHEMA,
    assertOwnedPrivateDirectoryStat,
    assertPayloadSizeWithinLimit,
    assertPublicationBatchSize,
    assertSafeStoreLocation,
    canonicalJson,
    canonicalJsonBytes,
    contentAddressPath,
    initializeQualificationStore,
    loadPublishedObject,
    loadStoreIdentity,
    parseJsonStrict,
    pathIsInside,
    publishEvidenceBatch,
    sha256,
    validateObjectDescriptor,
    validateStoreIdentity,
}
