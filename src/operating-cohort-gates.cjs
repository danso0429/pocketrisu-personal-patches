'use strict'

const { canonicalJson, sealDocument, verifyDocumentIntegrity } = require('./verification-receipts.cjs')
const { objectSha256 } = require('./c0-retention.cjs')
const {
    operatingCohortBinding,
    validateFrozenCohortDeclaration,
} = require('./operating-cohort-identity.cjs')

const OPERATING_GATE_EVIDENCE_SCHEMA = 'patch-operating-cohort-gate-evidence-v1'
const SHA256_PATTERN = /^[0-9a-f]{64}$/
const RESULTS = new Set(['passed', 'failed', 'incomplete', 'not-run', 'not-applicable'])

function validateGate(gate, index) {
    if (!gate || typeof gate !== 'object' || Array.isArray(gate)
        || canonicalJson(Object.keys(gate).sort()) !== canonicalJson([
            'detailsSha256', 'name', 'receiptObjectSha256', 'result',
        ])) throw new Error(`Operating gate ${index} fields differ`)
    if (typeof gate.name !== 'string' || gate.name.length === 0 || !RESULTS.has(gate.result)) {
        throw new Error(`Operating gate ${index} name or result is invalid`)
    }
    for (const field of ['receiptObjectSha256', 'detailsSha256']) {
        if (gate[field] !== null && !SHA256_PATTERN.test(gate[field] ?? '')) {
            throw new Error(`Operating gate ${index} ${field} is invalid`)
        }
    }
    return gate
}

function buildOperatingGateEvidence({
    gateKind,
    gates,
    frozenDeclaration,
    frozenDeclarationObjectSha256,
    recordedAt = new Date().toISOString(),
}) {
    validateFrozenCohortDeclaration(frozenDeclaration)
    if (!['focused', 'product'].includes(gateKind) || !Array.isArray(gates)
        || gates.length === 0 || Number.isNaN(Date.parse(recordedAt))
        || new Date(recordedAt).toISOString() !== recordedAt
        || objectSha256(frozenDeclaration) !== frozenDeclarationObjectSha256) {
        throw new Error('Operating gate evidence source is invalid')
    }
    gates.forEach(validateGate)
    return sealDocument({
        schema: OPERATING_GATE_EVIDENCE_SCHEMA,
        gateKind,
        ...operatingCohortBinding(frozenDeclaration, frozenDeclarationObjectSha256),
        recordedAt,
        gates: structuredClone(gates),
        disposition: 'attempt-gate-evidence',
    })
}

function validateOperatingGateEvidence(document, {
    gateKind,
    frozenDeclaration,
    frozenDeclarationObjectSha256,
}) {
    if (!verifyDocumentIntegrity(document) || document?.schema !== OPERATING_GATE_EVIDENCE_SCHEMA
        || document.gateKind !== gateKind || document.disposition !== 'attempt-gate-evidence') {
        throw new Error('Operating gate evidence integrity or kind is invalid')
    }
    const expected = buildOperatingGateEvidence({
        gateKind,
        gates: document.gates,
        frozenDeclaration,
        frozenDeclarationObjectSha256,
        recordedAt: document.recordedAt,
    })
    if (canonicalJson(document) !== canonicalJson(expected)) {
        throw new Error('Operating gate evidence differs from the exact frozen attempt')
    }
    return document
}

module.exports = {
    OPERATING_GATE_EVIDENCE_SCHEMA,
    buildOperatingGateEvidence,
    validateOperatingGateEvidence,
}
