'use strict'

const fs = require('node:fs')
const path = require('node:path')
const {
    canonicalJsonBytes,
    loadPublishedObject,
    loadStoreIdentity,
    sha256,
} = require('./qualification-object-store.cjs')
const {
    QUALIFICATION_MANIFEST_SCHEMA,
    QUALIFICATION_REGISTRY_SCHEMA,
    CONTENT_MANIFEST_SCHEMA,
    VALIDATION_RESULT_SCHEMA,
    resolveVerifiedQualificationRegistryHead,
} = require('./qualification-registry.cjs')
const {
    fullSchemaRegistry,
} = require('./qualification-verifier.cjs')
const { sealDocument } = require('./verification-receipts.cjs')

const RETENTION_SCHEMA = 'patch-qualification-retention-plan-v1'
const SHA256_PATTERN = /^[0-9a-f]{64}$/

class QualificationRetentionError extends Error {
    constructor(code, message, details = null) {
        super(message)
        this.name = 'QualificationRetentionError'
        this.code = code
        this.details = details
    }
}

function fail(code, message, details = null) {
    throw new QualificationRetentionError(code, message, details)
}

function listContentAddresses(root, namespace, suffix = '') {
    const base = path.join(root, 'v2', namespace, 'sha256')
    if (!fs.existsSync(base)) return []
    const records = []
    for (const shard of fs.readdirSync(base).sort()) {
        if (!/^[0-9a-f]{2}$/.test(shard)) fail('INVALID_CONTENT_SHARD', `Unexpected ${namespace} shard: ${shard}`)
        const shardRoot = path.join(base, shard)
        if (!fs.lstatSync(shardRoot).isDirectory()) fail('INVALID_CONTENT_SHARD', `${namespace} shard is not a directory: ${shardRoot}`)
        for (const name of fs.readdirSync(shardRoot).sort()) {
            const expression = suffix === '.json' ? /^([0-9a-f]{62})\.json$/ : /^([0-9a-f]{62})$/
            const match = expression.exec(name)
            if (!match) fail('INVALID_CONTENT_ENTRY', `Unexpected ${namespace} entry: ${path.join(shardRoot, name)}`)
            const digest = `${shard}${match[1]}`
            const file = path.join(shardRoot, name)
            const stat = fs.lstatSync(file)
            if (!stat.isFile() || stat.isSymbolicLink()) fail('INVALID_CONTENT_ENTRY', `${namespace} object is not a regular file: ${file}`)
            const bytes = fs.readFileSync(file)
            if (sha256(bytes) !== digest) fail('CONTENT_HASH_MISMATCH', `${namespace} object hash mismatch: ${digest}`)
            records.push({ sha256: digest, path: file, bytes: bytes.length })
        }
    }
    return records
}

function descriptorReferences(record) {
    const document = record.document
    if (document?.schema === QUALIFICATION_REGISTRY_SCHEMA) {
        return [
            document.baseRegistryDescriptorSha256,
            ...document.entries.map((entry) => entry.qualificationManifestDescriptorSha256),
        ].filter(Boolean)
    }
    if (document?.schema === QUALIFICATION_MANIFEST_SCHEMA) {
        return [document.contentManifestDescriptorSha256, document.validationResultDescriptorSha256]
    }
    if (document?.schema === CONTENT_MANIFEST_SCHEMA) {
        return Object.values(document.objects).filter(Boolean)
    }
    if (document?.schema === VALIDATION_RESULT_SCHEMA) {
        return [document.contentManifestDescriptorSha256, ...document.checkedDescriptors]
    }
    return []
}

function directorySummary(root) {
    if (!fs.existsSync(root)) return { exists: false, files: 0, bytes: 0, identitySha256: sha256(canonicalJsonBytes([])) }
    const entries = []
    function walk(directory, relative) {
        for (const name of fs.readdirSync(directory).sort()) {
            const absolute = path.join(directory, name)
            const child = relative === '' ? name : `${relative}/${name}`
            const stat = fs.lstatSync(absolute)
            if (stat.isDirectory()) walk(absolute, child)
            else if (stat.isFile()) entries.push({ path: child, bytes: stat.size, sha256: sha256(fs.readFileSync(absolute)) })
            else if (stat.isSymbolicLink()) entries.push({ path: child, symlink: fs.readlinkSync(absolute) })
            else fail('UNSUPPORTED_RETENTION_ENTRY', `Unsupported retained path: ${absolute}`)
        }
    }
    walk(root, '')
    return {
        exists: true,
        files: entries.filter((entry) => entry.sha256).length,
        bytes: entries.reduce((total, entry) => total + (entry.bytes ?? 0), 0),
        identitySha256: sha256(canonicalJsonBytes(entries)),
    }
}

function planQualificationRetention({
    storeRoot,
    quarantineRoots = [],
    generatedAt = new Date().toISOString(),
}) {
    const identity = loadStoreIdentity(storeRoot)
    const root = identity.rootRealpath
    const legacyBefore = directorySummary(path.join(root, 'objects'))
    const quarantineBefore = quarantineRoots.map((value) => ({ root: path.resolve(value), ...directorySummary(path.resolve(value)) }))
    const current = resolveVerifiedQualificationRegistryHead(root)
    if (current.registry === null) fail('QUALIFICATION_REGISTRY_MISSING', 'Qualification retention requires an independently rooted current registry')
    const descriptorInventory = listContentAddresses(root, 'descriptors', '.json')
    const payloadInventory = listContentAddresses(root, 'payloads')
    const descriptors = new Map()
    for (const inventory of descriptorInventory) {
        const record = loadPublishedObject({ storeRoot: root, descriptorSha256: inventory.sha256, schemaRegistry: fullSchemaRegistry() })
        descriptors.set(inventory.sha256, { ...inventory, record, references: descriptorReferences(record) })
    }
    const reachableDescriptors = new Set()
    const pending = current.snapshotRecords.map((record) => record.descriptorSha256)
    while (pending.length > 0) {
        const digest = pending.pop()
        if (!SHA256_PATTERN.test(digest ?? '')) fail('INVALID_RETENTION_REFERENCE', `Invalid descriptor reference: ${digest}`)
        if (reachableDescriptors.has(digest)) continue
        const descriptor = descriptors.get(digest)
        if (!descriptor) fail('MISSING_RETENTION_REFERENCE', `Qualification history references a missing descriptor: ${digest}`)
        reachableDescriptors.add(digest)
        for (const reference of descriptor.references) pending.push(reference)
    }
    const reachablePayloads = new Set([...reachableDescriptors].map((digest) => descriptors.get(digest).record.descriptor.payloadSha256))
    const descriptorObjects = descriptorInventory.map((record) => ({
        namespace: 'descriptor', sha256: record.sha256, bytes: record.bytes,
        path: record.path, reachable: reachableDescriptors.has(record.sha256),
        action: reachableDescriptors.has(record.sha256) ? 'retain' : 'eligible-for-separate-approved-deletion',
    }))
    const payloadObjects = payloadInventory.map((record) => ({
        namespace: 'payload', sha256: record.sha256, bytes: record.bytes,
        path: record.path, reachable: reachablePayloads.has(record.sha256),
        action: reachablePayloads.has(record.sha256) ? 'retain' : 'eligible-for-separate-approved-deletion',
    }))
    const unreachableObjects = [...descriptorObjects, ...payloadObjects]
        .filter((record) => !record.reachable)
        .map(({ namespace, sha256: digest, bytes, path: file }) => ({ namespace, sha256: digest, bytes, path: file }))
        .sort((left, right) => `${left.namespace}:${left.sha256}`.localeCompare(`${right.namespace}:${right.sha256}`))
    const temporaryRoot = path.join(root, 'v2/tmp')
    const temporaryFiles = fs.existsSync(temporaryRoot)
        ? fs.readdirSync(temporaryRoot).sort().map((name) => path.join(temporaryRoot, name))
        : []
    const legacyAfter = directorySummary(path.join(root, 'objects'))
    const quarantineAfter = quarantineRoots.map((value) => ({ root: path.resolve(value), ...directorySummary(path.resolve(value)) }))
    if (!canonicalJsonBytes(legacyBefore).equals(canonicalJsonBytes(legacyAfter))
        || !canonicalJsonBytes(quarantineBefore).equals(canonicalJsonBytes(quarantineAfter))) {
        fail('RETENTION_PLANNER_MUTATED_PROTECTED_EVIDENCE', 'Retention planning changed legacy or quarantine evidence')
    }
    return sealDocument({
        schema: RETENTION_SCHEMA,
        generatedAt,
        storeRoot: root,
        storeIdentityHash: identity.storeIdentityHash,
        dryRun: true,
        deletionImplemented: false,
        currentRegistryDescriptorSha256: current.registryDescriptorSha256,
        currentRegistryRootSha256: current.registry.registryRootSha256,
        objects: [...descriptorObjects, ...payloadObjects].sort((left, right) => `${left.namespace}:${left.sha256}`.localeCompare(`${right.namespace}:${right.sha256}`)),
        deletionProposal: {
            requiresSeparateApproval: true,
            objects: unreachableObjects,
            proposalSha256: sha256(canonicalJsonBytes(unreachableObjects)),
        },
        protectedExternalEvidence: {
            existingC0Legacy: legacyAfter,
            quarantines: quarantineAfter,
        },
        temporaryFiles,
        summary: {
            descriptors: descriptorObjects.length,
            payloads: payloadObjects.length,
            reachableDescriptors: reachableDescriptors.size,
            reachablePayloads: reachablePayloads.size,
            unreachableObjects: unreachableObjects.length,
        },
    })
}

module.exports = {
    QualificationRetentionError,
    RETENTION_SCHEMA,
    descriptorReferences,
    directorySummary,
    listContentAddresses,
    planQualificationRetention,
}
