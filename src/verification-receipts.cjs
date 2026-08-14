'use strict'

const fs = require('node:fs')
const path = require('node:path')
const {
    parseCanonicalOutput,
    sha256,
    validateCanonicalResult,
} = require('./verification-evidence.cjs')

const RECEIPT_DISPOSITIONS = Object.freeze([
    'current-active',
    'historical',
    'incomplete',
    'invalid',
    'superseded',
    'diagnostic-only',
    'defect-reproduction',
])
const INTEGRITY_SCHEMA = 'patch-verification-receipt-integrity-v1'

function canonicalValue(value, seen = new Set()) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') {
        return value
    }
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new Error('Receipt contains a non-finite number')
        return value
    }
    if (Array.isArray(value)) return value.map((entry) => canonicalValue(entry, seen))
    if (!value || typeof value !== 'object') {
        throw new Error(`Receipt contains unsupported value type: ${typeof value}`)
    }
    if (seen.has(value)) throw new Error('Receipt contains a cycle')
    seen.add(value)
    try {
        return Object.fromEntries(Object.keys(value).sort().map((key) => [
            key,
            canonicalValue(value[key], seen),
        ]))
    } finally {
        seen.delete(value)
    }
}

function canonicalJson(value) {
    return JSON.stringify(canonicalValue(value))
}

function withoutIntegrity(document) {
    const { integrity, ...payload } = document
    return payload
}

function sealDocument(document) {
    const payload = withoutIntegrity(document)
    return {
        ...payload,
        integrity: {
            schema: INTEGRITY_SCHEMA,
            algorithm: 'sha256-over-canonical-json-v1',
            payloadSha256: sha256(canonicalJson(payload)),
        },
    }
}

function verifyDocumentIntegrity(document) {
    const integrity = document?.integrity
    if (
        !integrity
        || integrity.schema !== INTEGRITY_SCHEMA
        || integrity.algorithm !== 'sha256-over-canonical-json-v1'
        || !/^[0-9a-f]{64}$/.test(integrity.payloadSha256 ?? '')
    ) return false
    return integrity.payloadSha256 === sha256(canonicalJson(withoutIntegrity(document)))
}

function validateDisposition(disposition) {
    return RECEIPT_DISPOSITIONS.includes(disposition)
}

function evaluateExecutionReceipt(receipt) {
    const structuralErrors = []
    const acceptanceErrors = []
    if (receipt?.schema !== 'patch-verification-execution-receipt-v1') {
        structuralErrors.push('unsupported execution receipt schema')
    }
    if (!validateDisposition(receipt?.disposition)) {
        structuralErrors.push('unknown receipt disposition')
    }
    if (!verifyDocumentIntegrity(receipt)) {
        structuralErrors.push('receipt integrity mismatch')
    }
    const execution = receipt?.execution
    if (!execution || typeof execution !== 'object') {
        structuralErrors.push('execution record is missing')
        return {
            structuralErrors,
            acceptanceErrors: ['execution record is missing'],
            receiptValid: false,
            executionAccepted: false,
        }
    }
    const stdout = typeof execution.stdout === 'string' ? execution.stdout : ''
    const stderr = typeof execution.stderr === 'string' ? execution.stderr : ''
    if (execution.stdoutBytes !== Buffer.byteLength(stdout)) {
        structuralErrors.push('stdout byte count mismatch')
    }
    if (execution.stdoutSha256 !== sha256(stdout)) {
        structuralErrors.push('stdout hash mismatch')
    }
    if (execution.stderrBytes !== Buffer.byteLength(stderr)) {
        structuralErrors.push('stderr byte count mismatch')
    }
    if (execution.stderrSha256 !== sha256(stderr)) {
        structuralErrors.push('stderr hash mismatch')
    }
    const parsed = parseCanonicalOutput(stdout)
    const verifierErrors = validateCanonicalResult(parsed)
    try {
        if (canonicalJson(receipt.verifierResult) !== canonicalJson(parsed)) {
            structuralErrors.push('recorded verifier result differs from stdout')
        }
        if (canonicalJson(receipt.verifierErrors) !== canonicalJson(verifierErrors)) {
            structuralErrors.push('recorded verifier errors differ from recomputation')
        }
    } catch (error) {
        structuralErrors.push(`verifier evidence is not canonicalizable: ${error.message}`)
    }
    const stability = receipt?.stability
    if (
        !stability
        || stability.matched !== (stability.sourceMatched && stability.targetMatched)
    ) structuralErrors.push('stability summary is missing or inconsistent')

    if (execution.spawnError !== null) acceptanceErrors.push('spawn error is present')
    if (execution.outputError !== null) acceptanceErrors.push('output capture failed')
    if (execution.exitCode !== 0) acceptanceErrors.push('exit code is not zero')
    if (execution.signal !== null) acceptanceErrors.push('child terminated by signal')
    if (Buffer.byteLength(stdout) === 0) acceptanceErrors.push('stdout is empty')
    acceptanceErrors.push(...verifierErrors)
    if (!stability?.sourceMatched) acceptanceErrors.push('source pre/post root mismatch')
    if (!stability?.targetMatched) acceptanceErrors.push('target pre/post root mismatch')
    const calculatedAccepted = structuralErrors.length === 0 && acceptanceErrors.length === 0
    if (receipt?.accepted !== calculatedAccepted) {
        structuralErrors.push('recorded accepted flag contradicts receipt evidence')
    }
    return {
        structuralErrors,
        acceptanceErrors,
        receiptValid: structuralErrors.length === 0,
        executionAccepted: calculatedAccepted && structuralErrors.length === 0,
    }
}

function buildReceiptRegistry(receiptFiles) {
    const entries = receiptFiles.map((file) => {
        const absolute = path.resolve(file)
        const encoded = fs.readFileSync(absolute)
        const receipt = JSON.parse(encoded)
        const evaluation = evaluateExecutionReceipt(receipt)
        if (!evaluation.receiptValid) {
            throw new Error(
                `Cannot register invalid receipt ${absolute}: `
                + evaluation.structuralErrors.join('; '),
            )
        }
        return {
            file: absolute,
            bytes: encoded.length,
            sha256: sha256(encoded),
            schema: receipt.schema,
            disposition: receipt.disposition,
            executionAccepted: evaluation.executionAccepted,
            receiptPayloadSha256: receipt.integrity.payloadSha256,
        }
    }).sort((left, right) => left.file < right.file ? -1 : left.file > right.file ? 1 : 0)
    const counts = Object.fromEntries(RECEIPT_DISPOSITIONS.map((value) => [value, 0]))
    for (const entry of entries) counts[entry.disposition] += 1
    return sealDocument({
        schema: 'patch-verification-receipt-registry-v1',
        generatedAt: new Date().toISOString(),
        counts,
        entries,
    })
}

module.exports = {
    INTEGRITY_SCHEMA,
    RECEIPT_DISPOSITIONS,
    buildReceiptRegistry,
    canonicalJson,
    evaluateExecutionReceipt,
    sealDocument,
    validateDisposition,
    verifyDocumentIntegrity,
}
