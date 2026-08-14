'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { jsonSha256 } = require('./capability-contract.cjs')
const { validateCompositionalTheoremReceipt } = require('./compositional-theorem.cjs')
const { validateFreshShadowReceipt } = require('./fresh-shadow-verifier.cjs')

const EXACT_CERTIFICATE_SCHEMA = 'patch-exact-component-certificate-v1'
const EXACT_KEY_SCHEMA = 'patch-exact-component-key-v1'
const EXACT_KEY_FIELDS = Object.freeze([
    'schema',
    'componentId',
    'componentVersionSha256',
    'componentSourceReadSetSha256',
    'targetProjectionSha256',
    'canonicalPolicySha256',
    'engineSha256',
    'effectManifestSha256',
    'actionSubgraphSha256',
    'boundaryClassesSha256',
    'localStateSha256',
    'runtimeEnvelopeSha256',
    'filesystemSemanticsSha256',
    'historyModelSha256',
])

class ExactCertificateError extends Error {
    constructor(code, message, details = {}) {
        super(message)
        this.name = 'ExactCertificateError'
        this.code = code
        this.details = details
    }
}

function hashPair(left, right) {
    return crypto.createHash('sha256')
        .update(Buffer.concat([Buffer.from(left, 'hex'), Buffer.from(right, 'hex')]))
        .digest('hex')
}

function merkleLevels(values) {
    const levels = [values]
    while (levels.at(-1).length > 1) {
        const current = levels.at(-1)
        const next = []
        for (let index = 0; index < current.length; index += 2) {
            next.push(hashPair(current[index], current[index + 1] ?? current[index]))
        }
        levels.push(next)
    }
    return levels
}

function merkleProof(levels, leafIndex) {
    const proof = []
    let index = leafIndex
    for (let level = 0; level < levels.length - 1; level += 1) {
        const values = levels[level]
        const sibling = index % 2 === 0 ? index + 1 : index - 1
        proof.push({
            position: index % 2 === 0 ? 'right' : 'left',
            sha256: values[sibling] ?? values[index],
        })
        index = Math.floor(index / 2)
    }
    return proof
}

function validateExactKey(key) {
    if (!key || JSON.stringify(Object.keys(key).sort()) !== JSON.stringify([...EXACT_KEY_FIELDS].sort())) {
        throw new ExactCertificateError('INCOMPLETE_EXACT_CERTIFICATE_KEY', 'Exact certificate key fields are incomplete or unknown')
    }
    if (key.schema !== EXACT_KEY_SCHEMA || typeof key.componentId !== 'string' || key.componentId.length === 0) {
        throw new ExactCertificateError('INVALID_EXACT_CERTIFICATE_KEY', 'Exact certificate key identity is invalid')
    }
    for (const field of EXACT_KEY_FIELDS.filter((field) => !['schema', 'componentId'].includes(field))) {
        if (!/^[0-9a-f]{64}$/.test(key[field])) {
            throw new ExactCertificateError('INVALID_EXACT_CERTIFICATE_KEY', `Exact certificate key ${field} is not SHA-256`)
        }
    }
    return key
}

function observationPayload(observation) {
    return {
        mask: observation.mask,
        selectedPackIds: observation.selectedPackIds,
        boundaryClassId: observation.boundaryClassId,
        initialChangeCount: observation.initialChangeCount,
        status: observation.status,
        repeatedChangeCount: observation.repeatedChangeCount,
        revertChangeCount: observation.revertChangeCount,
        restored: observation.restored,
    }
}

function generateExactCertificate({ key, theoremReceipt, shadowReceipt }) {
    validateExactKey(key)
    validateCompositionalTheoremReceipt(theoremReceipt)
    validateFreshShadowReceipt(shadowReceipt)
    if (theoremReceipt.outcome !== 'component-admitted' || shadowReceipt.status !== 'passed') {
        throw new ExactCertificateError('CERTIFICATE_ADMISSION_REJECTED', 'Only admitted fresh observations can become certificates')
    }
    if (key.componentId !== shadowReceipt.component.id) {
        throw new ExactCertificateError('CERTIFICATE_COMPONENT_MISMATCH', 'Certificate key and shadow component differ')
    }
    const keySha256 = jsonSha256(key)
    const leafPayloads = shadowReceipt.observations
        .map((observation) => {
            const observationSha256 = jsonSha256(observationPayload(observation))
            const payload = {
                id: `${observation.boundaryClassId}:${observation.mask}`,
                boundaryClassId: observation.boundaryClassId,
                mask: observation.mask,
                observationSha256,
                keySha256,
            }
            return { payload, leafSha256: jsonSha256(payload) }
        })
        .sort((left, right) => left.payload.id.localeCompare(right.payload.id))
    const levels = merkleLevels(leafPayloads.map((entry) => entry.leafSha256))
    const leaves = leafPayloads.map((entry, index) => ({
        ...entry.payload,
        leafSha256: entry.leafSha256,
        proof: merkleProof(levels, index),
    }))
    const certificatePayload = {
        schema: EXACT_CERTIFICATE_SCHEMA,
        mode: 'write-only-shadow',
        key,
        keySha256,
        componentManifest: {
            componentId: shadowReceipt.component.id,
            packIds: shadowReceipt.component.packIds,
            visiblePackIds: shadowReceipt.component.visiblePackIds,
            boundaryClasses: shadowReceipt.boundaryClasses,
            localMasks: shadowReceipt.coverage.localMasks,
            expectedLeaves: shadowReceipt.coverage.expectedExecutions,
        },
        leaves,
        merkleRoot: levels.at(-1)[0],
        sourceReceiptHashes: {
            theoremReceiptSha256: theoremReceipt.receiptSha256,
            shadowReceiptSha256: shadowReceipt.receiptSha256,
        },
        canonicalProtection: {
            canonicalGate: 'Global Exhaustive',
            canonicalWorkSkipped: false,
            productionCertificate: false,
            productionStateWritten: false,
            defaultChanged: false,
        },
    }
    return { ...certificatePayload, certificateSha256: jsonSha256(certificatePayload) }
}

function publishExactCertificate(storeRoot, certificate) {
    const root = path.resolve(storeRoot)
    fs.mkdirSync(root, { recursive: true, mode: 0o700 })
    const output = path.join(root, `${certificate.certificateSha256}.json`)
    const temporary = path.join(root, `.${certificate.certificateSha256}.${process.pid}.${crypto.randomUUID()}.tmp`)
    try {
        fs.writeFileSync(temporary, `${JSON.stringify(certificate, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
        fs.linkSync(temporary, output)
    } finally {
        try {
            fs.unlinkSync(temporary)
        } catch (error) {
            if (error.code !== 'ENOENT') throw error
        }
    }
    return output
}

function dryRunCertificateGc(storeRoot, retainedCertificateHashes) {
    const root = fs.realpathSync(path.resolve(storeRoot))
    const retained = new Set(retainedCertificateHashes)
    return fs.readdirSync(root).sort().flatMap((file) => {
        const match = /^([0-9a-f]{64})\.json$/.exec(file)
        if (!match || retained.has(match[1])) return []
        return [{ certificateSha256: match[1], file, action: 'would-delete' }]
    })
}

module.exports = {
    EXACT_CERTIFICATE_SCHEMA,
    EXACT_KEY_FIELDS,
    EXACT_KEY_SCHEMA,
    ExactCertificateError,
    dryRunCertificateGc,
    generateExactCertificate,
    hashPair,
    publishExactCertificate,
    validateExactKey,
}
