'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { jsonSha256 } = require('./capability-contract.cjs')
const { validateFreshShadowReceipt } = require('./fresh-shadow-verifier.cjs')
const {
    EXACT_CERTIFICATE_SCHEMA,
    ExactCertificateError,
    hashPair,
    validateExactKey,
} = require('./exact-certificate.cjs')

function verifyProof(leafSha256, proof, root) {
    let current = leafSha256
    for (const step of proof) {
        if (!step || !['left', 'right'].includes(step.position) || !/^[0-9a-f]{64}$/.test(step.sha256 ?? '')) {
            throw new ExactCertificateError('INVALID_CERTIFICATE_PROOF', 'Certificate Merkle proof is malformed')
        }
        current = step.position === 'left' ? hashPair(step.sha256, current) : hashPair(current, step.sha256)
    }
    return current === root
}

function validateExactCertificate(certificate, { expectedKey = null } = {}) {
    if (!certificate || certificate.schema !== EXACT_CERTIFICATE_SCHEMA || certificate.mode !== 'write-only-shadow') {
        throw new ExactCertificateError('UNKNOWN_CERTIFICATE_SCHEMA', 'Exact certificate schema or mode is unknown')
    }
    const { certificateSha256, ...certificatePayload } = certificate
    if (certificateSha256 !== jsonSha256(certificatePayload)) {
        throw new ExactCertificateError('CERTIFICATE_HASH_MISMATCH', 'Exact certificate content hash does not match')
    }
    validateExactKey(certificate.key)
    if (certificate.keySha256 !== jsonSha256(certificate.key)) {
        throw new ExactCertificateError('CERTIFICATE_KEY_HASH_MISMATCH', 'Exact certificate key hash does not match')
    }
    if (expectedKey !== null && jsonSha256(expectedKey) !== certificate.keySha256) {
        throw new ExactCertificateError('CERTIFICATE_EXACT_KEY_MISS', 'Retained certificate key is not exact')
    }
    const expectedLeaves = certificate.componentManifest.localMasks * certificate.componentManifest.boundaryClasses.length
    if (
        certificate.componentManifest.componentId !== certificate.key.componentId
        || certificate.componentManifest.expectedLeaves !== expectedLeaves
        || certificate.leaves.length !== expectedLeaves
    ) throw new ExactCertificateError('CERTIFICATE_COVERAGE_MISMATCH', 'Certificate leaf coverage is incomplete')
    const seen = new Set()
    for (const leaf of certificate.leaves) {
        const { leafSha256, proof, ...payload } = leaf
        if (
            payload.keySha256 !== certificate.keySha256
            || leafSha256 !== jsonSha256(payload)
            || seen.has(payload.id)
            || !verifyProof(leafSha256, proof, certificate.merkleRoot)
        ) throw new ExactCertificateError('CERTIFICATE_LEAF_INVALID', `Certificate leaf ${payload.id} is invalid`)
        seen.add(payload.id)
    }
    const expectedIds = certificate.componentManifest.boundaryClasses.flatMap((boundary) =>
        Array.from({ length: certificate.componentManifest.localMasks }, (_, mask) => `${boundary.id}:${mask}`)
    ).sort()
    if (JSON.stringify([...seen].sort()) !== JSON.stringify(expectedIds)) {
        throw new ExactCertificateError('CERTIFICATE_LEAF_DOMAIN_MISMATCH', 'Certificate leaves do not cover the exact mask and boundary domain')
    }
    if (
        certificate.canonicalProtection.canonicalGate !== 'Global Exhaustive'
        || certificate.canonicalProtection.canonicalWorkSkipped !== false
        || certificate.canonicalProtection.productionCertificate !== false
        || certificate.canonicalProtection.productionStateWritten !== false
        || certificate.canonicalProtection.defaultChanged !== false
    ) throw new ExactCertificateError('CERTIFICATE_PROTECTION_MISMATCH', 'Certificate claims unauthorized canonical use')
    return certificate
}

function loadExactCertificate(file, options = {}) {
    const absolute = path.resolve(file)
    if (!fs.lstatSync(absolute).isFile()) throw new ExactCertificateError('CERTIFICATE_TOPOLOGY_MISMATCH', 'Certificate is not a regular file')
    let certificate
    try {
        certificate = JSON.parse(fs.readFileSync(absolute, 'utf8'))
    } catch (error) {
        throw new ExactCertificateError('CERTIFICATE_PARSE_FAILED', 'Certificate is truncated or invalid JSON', { cause: error.message })
    }
    return validateExactCertificate(certificate, options)
}

function replayCertificate(certificate, shadowReceipt) {
    validateExactCertificate(certificate)
    validateFreshShadowReceipt(shadowReceipt)
    if (shadowReceipt.component.id !== certificate.componentManifest.componentId) {
        throw new ExactCertificateError('CERTIFICATE_REPLAY_COMPONENT_MISMATCH', 'Replay component differs')
    }
    const observations = new Map(shadowReceipt.observations.map((observation) => [
        `${observation.boundaryClassId}:${observation.mask}`,
        jsonSha256({
            mask: observation.mask,
            selectedPackIds: observation.selectedPackIds,
            boundaryClassId: observation.boundaryClassId,
            initialChangeCount: observation.initialChangeCount,
            status: observation.status,
            repeatedChangeCount: observation.repeatedChangeCount,
            revertChangeCount: observation.revertChangeCount,
            restored: observation.restored,
        }),
    ]))
    const mismatches = certificate.leaves.filter((leaf) => observations.get(leaf.id) !== leaf.observationSha256)
        .map((leaf) => leaf.id)
    return { status: mismatches.length === 0 ? 'passed' : 'failed', comparedLeaves: certificate.leaves.length, mismatches }
}

function decideExperimentalExactHit({ certificate, candidateKey, mode, independentlyVerified }) {
    if (mode !== 'frozen-audit-experimental' || independentlyVerified !== true) {
        return { recordsLoaded: 1, recordsAccepted: 0, recordsRejected: 1, masksSkipped: 0, reason: 'experimental-mode-or-independent-verification-missing' }
    }
    try {
        validateExactCertificate(certificate, { expectedKey: candidateKey })
        return {
            recordsLoaded: 1,
            recordsAccepted: 1,
            recordsRejected: 0,
            masksSkipped: certificate.leaves.length,
            reason: null,
        }
    } catch (error) {
        return { recordsLoaded: 1, recordsAccepted: 0, recordsRejected: 1, masksSkipped: 0, reason: error.code ?? 'certificate-rejected' }
    }
}

module.exports = {
    decideExperimentalExactHit,
    loadExactCertificate,
    replayCertificate,
    validateExactCertificate,
}
