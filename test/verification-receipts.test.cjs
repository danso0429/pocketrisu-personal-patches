'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { sha256, writeJsonAtomic } = require('../src/verification-evidence.cjs')
const {
    requiredExitCode,
} = require('../scripts/verify-verification-receipt.cjs')
const {
    RECEIPT_DISPOSITIONS,
    buildReceiptRegistry,
    evaluateExecutionReceipt,
    sealDocument,
    verifyDocumentIntegrity,
} = require('../src/verification-receipts.cjs')
const {
    RUNTIME_FIELD_POLICY,
} = require('../src/verification-runtime.cjs')

function canonicalResult() {
    return {
        rawSelections: 4,
        verifiedSelections: 4,
        roundTrips: 'passed',
        workers: 2,
        workerHistory: {
            schema: 'patch-combination-worker-history-v1',
            schedule: 'stride-v1',
            workers: [
                { workerIndex: 0, orderedMasks: [0, 2] },
                { workerIndex: 1, orderedMasks: [1, 3] },
            ],
        },
    }
}

function executionReceipt({
    disposition = 'current-active',
    result = canonicalResult(),
    execution = {},
    stability = { sourceMatched: true, targetMatched: true, matched: true },
} = {}) {
    const stdout = execution.stdout ?? `${JSON.stringify(result)}\n`
    const stderr = execution.stderr ?? ''
    const completeExecution = {
        exitCode: 0,
        signal: null,
        spawnError: null,
        outputError: null,
        stdout,
        stderr,
        stdoutBytes: Buffer.byteLength(stdout),
        stdoutSha256: sha256(stdout),
        stderrBytes: Buffer.byteLength(stderr),
        stderrSha256: sha256(stderr),
        ...execution,
    }
    const parsed = stdout.trim() ? (() => {
        try { return JSON.parse(stdout) } catch { return null }
    })() : null
    const verifierErrors = parsed ? [] : ['stdout is not one non-empty JSON object']
    const accepted = completeExecution.spawnError === null
        && completeExecution.outputError === null
        && completeExecution.exitCode === 0
        && completeExecution.signal === null
        && verifierErrors.length === 0
        && stability.matched
    const runtimeEnvelope = {
        schema: 'patch-verification-runtime-envelope-v1',
        fieldPolicy: RUNTIME_FIELD_POLICY,
        values: {
            nodeVersion: 'v25.9.0',
            platform: 'linux',
            architecture: 'arm64',
            filesystemType: '0xef53',
            umask: 0o077,
            locale: 'C.UTF-8',
            timezone: 'UTC',
            kernel: '6.17.0',
            cpuCount: 2,
            availableParallelism: 2,
            mountNamespaceId: 'mnt:[1]',
        },
    }
    return sealDocument({
        schema: 'patch-verification-execution-receipt-v2',
        disposition,
        execution: completeExecution,
        verifierResult: parsed,
        verifierErrors,
        stability,
        runtime: {
            before: runtimeEnvelope,
            after: runtimeEnvelope,
            comparison: { errors: [], differences: [], matched: true },
        },
        accepted,
    })
}

test('receipt dispositions include positive, negative, and diagnostic evidence', () => {
    assert.deepEqual(RECEIPT_DISPOSITIONS, [
        'current-active',
        'historical',
        'incomplete',
        'invalid',
        'superseded',
        'diagnostic-only',
        'defect-reproduction',
    ])
})

test('sealed accepted receipt verifies independently', () => {
    const receipt = executionReceipt()
    assert.equal(verifyDocumentIntegrity(receipt), true)
    assert.deepEqual(evaluateExecutionReceipt(receipt), {
        structuralErrors: [],
        acceptanceErrors: [],
        receiptValid: true,
        executionAccepted: true,
    })
    receipt.execution.stdout = '{}\n'
    assert.equal(verifyDocumentIntegrity(receipt), false)
    assert.equal(evaluateExecutionReceipt(receipt).receiptValid, false)
})

test('status zero with EPERM and empty stdout cannot pass', () => {
    const receipt = executionReceipt({
        disposition: 'defect-reproduction',
        execution: {
            exitCode: 0,
            signal: null,
            spawnError: { code: 'EPERM', message: 'spawn EPERM' },
            stdout: '',
        },
    })
    const evaluation = evaluateExecutionReceipt(receipt)
    assert.equal(evaluation.receiptValid, true)
    assert.equal(evaluation.executionAccepted, false)
    assert.match(evaluation.acceptanceErrors.join('\n'), /spawn error/)
    assert.match(evaluation.acceptanceErrors.join('\n'), /stdout is empty/)
})

test('malformed output, incomplete coverage, and target drift cannot pass', () => {
    for (const receipt of [
        executionReceipt({ execution: { stdout: 'not-json\n' } }),
        executionReceipt({ result: { ...canonicalResult(), verifiedSelections: 3 } }),
        executionReceipt({
            stability: { sourceMatched: true, targetMatched: false, matched: false },
        }),
    ]) assert.equal(evaluateExecutionReceipt(receipt).executionAccepted, false)
})

test('registry preserves receipt dispositions and hashes', (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'patch-verification-registry-test-'))
    t.after(() => fs.rmSync(root, { recursive: true, force: true }))
    const acceptedFile = path.join(root, 'accepted.json')
    const defectFile = path.join(root, 'defect.json')
    writeJsonAtomic(acceptedFile, executionReceipt())
    writeJsonAtomic(defectFile, executionReceipt({
        disposition: 'defect-reproduction',
        execution: {
            exitCode: 0,
            signal: null,
            spawnError: { code: 'EPERM', message: 'spawn EPERM' },
            stdout: '',
        },
    }))
    const registry = buildReceiptRegistry([defectFile, acceptedFile])
    assert.equal(verifyDocumentIntegrity(registry), true)
    assert.equal(registry.counts['current-active'], 1)
    assert.equal(registry.counts['defect-reproduction'], 1)
    assert.equal(registry.entries[0].executionAccepted, true)
    assert.equal(registry.entries[1].executionAccepted, false)
})

test('unknown disposition is never registered as success', () => {
    const receipt = executionReceipt({ disposition: 'unknown' })
    const evaluation = evaluateExecutionReceipt(receipt)
    assert.equal(evaluation.receiptValid, false)
    assert.match(evaluation.structuralErrors.join('\n'), /unknown receipt disposition/)
})

test('standalone verifier requires both receipt validity and execution acceptance', () => {
    assert.equal(requiredExitCode({ receiptValid: true, executionAccepted: true }), 0)
    assert.equal(requiredExitCode({ receiptValid: true, executionAccepted: false }), 1)
    assert.equal(requiredExitCode({ receiptValid: false, executionAccepted: true }), 1)
    assert.equal(requiredExitCode({ receiptValid: false, executionAccepted: false }), 1)
})
