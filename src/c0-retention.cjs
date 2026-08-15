'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const {
    sha256,
} = require('./verification-evidence.cjs')
const {
    sealDocument,
} = require('./verification-receipts.cjs')

const RETENTION_SCHEMA = 'patch-c0-retention-plan-v1'
const SHA256_PATTERN = /^[0-9a-f]{64}$/
const PROTECTED_DISPOSITIONS = new Set([
    'historical',
    'incomplete',
    'invalid',
    'defect-reproduction',
])

function validateHash(value, label = 'object hash') {
    if (!SHA256_PATTERN.test(value ?? '')) throw new Error(`${label} is not a SHA-256 digest`)
    return value
}

function evidenceObjectBytes(document) {
    return Buffer.from(JSON.stringify(document))
}

function objectSha256(document) {
    return sha256(evidenceObjectBytes(document))
}

function objectPath(storeRoot, objectSha256) {
    validateHash(objectSha256)
    return path.join(
        path.resolve(storeRoot),
        'objects',
        'sha256',
        objectSha256.slice(0, 2),
        `${objectSha256.slice(2)}.json`,
    )
}

function ensureStore(storeRoot) {
    const root = path.resolve(storeRoot)
    fs.mkdirSync(path.join(root, 'objects', 'sha256'), { recursive: true, mode: 0o700 })
    return root
}

function publishEvidenceObject(storeRoot, document) {
    const root = ensureStore(storeRoot)
    const encoded = evidenceObjectBytes(document)
    const objectSha256 = sha256(encoded)
    const finalPath = objectPath(root, objectSha256)
    fs.mkdirSync(path.dirname(finalPath), { recursive: true, mode: 0o700 })
    const temporary = path.join(
        path.dirname(finalPath),
        `.${path.basename(finalPath)}.${process.pid}.${crypto.randomUUID()}.tmp`,
    )
    let created = false
    try {
        fs.writeFileSync(temporary, encoded, { mode: 0o600, flag: 'wx' })
        try {
            fs.linkSync(temporary, finalPath)
            created = true
            fs.chmodSync(finalPath, 0o444)
        } catch (error) {
            if (error.code !== 'EEXIST') throw error
            const existing = fs.readFileSync(finalPath)
            if (!existing.equals(encoded)) {
                throw new Error(`Content-address collision or corrupt existing object: ${objectSha256}`)
            }
        }
    } finally {
        try {
            fs.unlinkSync(temporary)
        } catch (error) {
            if (error.code !== 'ENOENT') throw error
        }
    }
    const stat = fs.lstatSync(finalPath)
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Evidence object is not a regular file: ${finalPath}`)
    return {
        objectSha256,
        bytes: encoded.length,
        physicalBytes: Number(stat.blocks ?? 0) * 512,
        newPhysicalBytes: created ? Number(stat.blocks ?? 0) * 512 : 0,
        created,
        path: finalPath,
    }
}

function loadEvidenceObject(storeRoot, objectSha256) {
    const file = objectPath(storeRoot, validateHash(objectSha256))
    const stat = fs.lstatSync(file)
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Evidence object is not a regular file: ${file}`)
    const encoded = fs.readFileSync(file)
    if (sha256(encoded) !== objectSha256) throw new Error(`Evidence object hash mismatch: ${objectSha256}`)
    let document
    try {
        document = JSON.parse(encoded)
    } catch (error) {
        throw new Error(`Evidence object JSON is corrupt (${objectSha256}): ${error.message}`)
    }
    if (!encoded.equals(evidenceObjectBytes(document))) {
        throw new Error(`Evidence object is not exact compact JSON: ${objectSha256}`)
    }
    return {
        document,
        objectSha256,
        bytes: encoded.length,
        physicalBytes: Number(stat.blocks ?? 0) * 512,
        path: file,
    }
}

function listEvidenceObjects(storeRoot) {
    const root = path.join(path.resolve(storeRoot), 'objects', 'sha256')
    if (!fs.existsSync(root)) return []
    const objects = []
    for (const shard of fs.readdirSync(root).sort()) {
        if (!/^[0-9a-f]{2}$/.test(shard)) throw new Error(`Unexpected evidence object shard: ${shard}`)
        const shardRoot = path.join(root, shard)
        if (!fs.lstatSync(shardRoot).isDirectory()) throw new Error(`Evidence shard is not a directory: ${shardRoot}`)
        for (const name of fs.readdirSync(shardRoot).sort()) {
            const match = /^([0-9a-f]{62})\.json$/.exec(name)
            if (!match) throw new Error(`Unexpected evidence object entry: ${path.join(shardRoot, name)}`)
            objects.push(loadEvidenceObject(storeRoot, `${shard}${match[1]}`))
        }
    }
    return objects
}

function optionalReference(value, label, references) {
    if (value === null || value === undefined) return
    references.add(validateHash(value, label))
}

function extractObjectReferences(document) {
    const references = new Set()
    const schema = document?.schema
    if (schema === 'patch-c0-evidence-bundle-v1') {
        optionalReference(document.globalReceipt?.objectSha256, 'bundle Global receipt reference', references)
        for (const gate of [
            ...(document.gates?.focused ?? []),
            document.gates?.global,
            ...(document.gates?.product ?? []),
        ].filter(Boolean)) {
            optionalReference(gate.receiptObjectSha256, 'gate receipt reference', references)
            optionalReference(gate.detailsSha256, 'gate detail reference', references)
        }
    } else if (schema === 'patch-c0-cohort-ledger-v1') {
        optionalReference(document.baseLedgerObjectSha256, 'cohort base ledger reference', references)
        for (const entry of document.entries ?? []) optionalReference(entry.objectSha256, 'cohort ledger object reference', references)
    } else if (schema === 'patch-c0-stable-release-ledger-v1') {
        optionalReference(document.baseLedgerObjectSha256, 'stable-release base ledger reference', references)
        for (const entry of document.entries ?? []) {
            optionalReference(entry.bundleObjectSha256, 'stable-release bundle reference', references)
            optionalReference(entry.globalReceiptObjectSha256, 'stable-release Global receipt reference', references)
        }
    } else if (schema === 'patch-c0-incident-record-v1') {
        optionalReference(document.previousIncidentSha256, 'previous incident reference', references)
        optionalReference(document.bundleObjectSha256, 'incident bundle reference', references)
        optionalReference(document.firstFailure?.stdoutObjectSha256, 'incident stdout reference', references)
        optionalReference(document.firstFailure?.stderrObjectSha256, 'incident stderr reference', references)
        for (const hash of document.negativeEvidenceObjectSha256s ?? []) {
            optionalReference(hash, 'incident negative evidence reference', references)
        }
    } else if (schema === 'patch-c0-defect-yield-summary-v1') {
        optionalReference(document.cohortLedgerObjectSha256, 'defect-yield cohort ledger reference', references)
        for (const hash of document.incidentRecordObjectSha256s ?? []) {
            optionalReference(hash, 'defect-yield incident reference', references)
        }
    } else if (schema === RETENTION_SCHEMA) {
        for (const hash of [
            ...(document.protectedObjectSha256s ?? []),
            ...(document.referencedObjectSha256s ?? []),
            ...(document.rollbackManifest ?? []),
        ]) optionalReference(hash, 'retention plan reference', references)
    } else if (schema === 'patch-toolchain-shadow-pilot-receipt-v1') {
        optionalReference(document.references?.localReceiptObjectSha256, 'pilot local receipt reference', references)
        optionalReference(document.references?.globalProjectionObjectSha256, 'pilot Global projection reference', references)
        optionalReference(document.references?.globalReceiptObjectSha256, 'pilot Global receipt reference', references)
        optionalReference(document.references?.c0BundleObjectSha256, 'pilot C0 bundle reference', references)
    } else if (schema === 'patch-toolchain-shadow-incident-v1') {
        optionalReference(document.pilotReceiptObjectSha256, 'pilot incident receipt reference', references)
    }
    return [...references].sort()
}

function objectDisposition(document) {
    if (typeof document?.disposition === 'string') return document.disposition
    if (document?.schema === 'patch-c0-incident-record-v1') return document.disposition ?? 'unknown'
    if ([
        'patch-c0-cohort-ledger-v1',
        'patch-c0-stable-release-ledger-v1',
        'patch-c0-defect-yield-summary-v1',
        'patch-c0-review-trigger-v1',
        RETENTION_SCHEMA,
    ].includes(document?.schema)) return 'current-active'
    return 'unknown'
}

function automaticallyProtected(document) {
    return PROTECTED_DISPOSITIONS.has(objectDisposition(document))
        || document?.schema === 'patch-c0-incident-record-v1'
        || document?.schema === 'patch-toolchain-shadow-incident-v1'
        || document?.schema === 'patch-c0-stable-release-ledger-v1'
}

function referenceClosure(seeds, objects, label) {
    const visited = new Set()
    const pending = [...seeds]
    while (pending.length > 0) {
        const hash = pending.pop()
        validateHash(hash, `${label} reference`)
        if (visited.has(hash)) continue
        const record = objects.get(hash)
        if (!record) throw new Error(`${label} references missing evidence object: ${hash}`)
        visited.add(hash)
        for (const reference of record.references) pending.push(reference)
    }
    return visited
}

function planC0EvidenceRetention({
    storeRoot,
    rootObjectSha256s = [],
    rootDocuments = [],
    explicitlyProtectedObjectSha256s = [],
    generatedAt = new Date().toISOString(),
}) {
    const inventory = listEvidenceObjects(storeRoot)
    const objects = new Map(inventory.map((record) => [record.objectSha256, {
        ...record,
        references: extractObjectReferences(record.document),
        disposition: objectDisposition(record.document),
        automaticallyProtected: automaticallyProtected(record.document),
    }]))
    for (const record of objects.values()) {
        for (const reference of record.references) {
            if (!objects.has(reference)) {
                throw new Error(`Evidence object ${record.objectSha256} has a missing reference: ${reference}`)
            }
        }
    }
    const rootSeeds = new Set(rootObjectSha256s.map((hash) => validateHash(hash, 'root object hash')))
    const referenceRoots = rootObjectSha256s.map((hash) => `object:${hash}`)
    for (const [index, root] of rootDocuments.entries()) {
        const document = root.document ?? root
        const label = root.label ?? `document:${index}`
        referenceRoots.push(label)
        const documentHash = objectSha256(document)
        if (objects.has(documentHash)) rootSeeds.add(documentHash)
        for (const reference of extractObjectReferences(document)) rootSeeds.add(reference)
    }
    const protectedSeeds = new Set(explicitlyProtectedObjectSha256s.map((hash) =>
        validateHash(hash, 'protected object hash')))
    for (const record of objects.values()) {
        if (record.automaticallyProtected) protectedSeeds.add(record.objectSha256)
    }
    const referenced = referenceClosure(rootSeeds, objects, 'retention root')
    const protectedObjects = referenceClosure(protectedSeeds, objects, 'protected evidence')
    const entries = [...objects.values()].sort((left, right) =>
        left.objectSha256.localeCompare(right.objectSha256)).map((record) => {
        const isReferenced = referenced.has(record.objectSha256)
        const isProtected = protectedObjects.has(record.objectSha256)
        const reasons = []
        if (rootSeeds.has(record.objectSha256)) reasons.push('explicit-reference-root')
        else if (isReferenced) reasons.push('reachable-from-reference-root')
        if (protectedSeeds.has(record.objectSha256)) reasons.push('protected-retention-root')
        else if (isProtected) reasons.push('reachable-from-protected-evidence')
        if (!isReferenced && !isProtected) reasons.push('unreferenced-and-unprotected')
        return {
            sha256: record.objectSha256,
            bytes: record.bytes,
            referenced: isReferenced,
            protected: isProtected,
            disposition: record.disposition,
            action: isReferenced || isProtected ? 'retain' : 'eligible-for-future-review',
            reasons,
        }
    })
    const candidates = entries.filter((entry) => entry.action === 'eligible-for-future-review')
    return sealDocument({
        schema: RETENTION_SCHEMA,
        generatedAt,
        storeRoot: path.resolve(storeRoot),
        dryRun: true,
        referenceRoots,
        protectedObjectSha256s: [...protectedObjects].sort(),
        referencedObjectSha256s: [...referenced].sort(),
        objects: entries,
        rollbackManifest: candidates.map((entry) => entry.sha256),
        summary: {
            objects: entries.length,
            bytes: entries.reduce((total, entry) => total + entry.bytes, 0),
            referencedObjects: entries.filter((entry) => entry.referenced).length,
            protectedObjects: entries.filter((entry) => entry.protected).length,
            futureReviewCandidates: candidates.length,
            candidateBytes: candidates.reduce((total, entry) => total + entry.bytes, 0),
            deletedObjects: 0,
            deletedBytes: 0,
        },
    })
}

module.exports = {
    RETENTION_SCHEMA,
    evidenceObjectBytes,
    extractObjectReferences,
    listEvidenceObjects,
    loadEvidenceObject,
    objectSha256,
    objectPath,
    planC0EvidenceRetention,
    publishEvidenceObject,
}
