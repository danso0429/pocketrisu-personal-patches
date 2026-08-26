'use strict'

const fs = require('node:fs')
const { StringDecoder } = require('node:string_decoder')
const {
    QualityCostProtocolError,
    sha256Bytes,
} = require('./protocol-v1.cjs')
const {
    assertPrivateFile,
    openJsonlCheckpoint,
    resolvePrivateFile,
} = require('./artifact-store.cjs')

function fail(code) {
    throw new QualityCostProtocolError(code)
}

function readJsonl(runRoot, filename) {
    const records = []
    forEachJsonl(runRoot, filename, (record) => records.push(record))
    return records
}

function forEachJsonl(runRoot, filename, callback) {
    if (typeof callback !== 'function') fail('RUNNER_ARTIFACT_CALLBACK_INVALID')
    const target = resolvePrivateFile(runRoot, filename)
    assertPrivateFile(target)
    const fd = fs.openSync(target, 'r')
    const decoder = new StringDecoder('utf8')
    const chunk = Buffer.allocUnsafe(64 * 1024)
    let pending = ''
    try {
        while (true) {
            const bytes = fs.readSync(fd, chunk, 0, chunk.byteLength, null)
            if (bytes === 0) break
            pending += decoder.write(chunk.subarray(0, bytes))
            let newline
            while ((newline = pending.indexOf('\n')) >= 0) {
                const line = pending.slice(0, newline)
                pending = pending.slice(newline + 1)
                if (line.length === 0) fail('RUNNER_ARTIFACT_EMPTY_LINE')
                try { callback(JSON.parse(line)) } catch (error) {
                    if (error instanceof QualityCostProtocolError) throw error
                    fail('RUNNER_ARTIFACT_JSON_INVALID')
                }
            }
        }
        pending += decoder.end()
        if (pending.length !== 0) fail('RUNNER_ARTIFACT_TORN_LINE')
    } finally {
        fs.closeSync(fd)
    }
}

function inspectRunnerCheckpointState(runRoot) {
    const completed = new Set()
    let active = null
    let callRecordCount = 0
    let actualUsdUnits = 0n
    let expectedModelVersion = null
    let evidenceSplit = false
    let lastOperationalStatus = null
    forEachJsonl(runRoot, 'calls.jsonl', (record) => {
        callRecordCount++
        if (record?.phase === 'call-start') {
            if (active || completed.has(record.callId)) fail('RUNNER_CHECKPOINT_START_ORDER_INVALID')
            active = record.callId
            return
        }
        if (record?.phase === 'call-complete') {
            if (!active || active !== record.callId || completed.has(record.callId)) {
                fail('RUNNER_CHECKPOINT_COMPLETE_ORDER_INVALID')
            }
            if (!/^[0-9]+$/.test(record.ratedCostUsdUnits || '')
                || !/^[0-9]+$/.test(record.cumulativeRatedCostUsdUnits || '')) {
                fail('RUNNER_CHECKPOINT_COST_INVALID')
            }
            actualUsdUnits += BigInt(record.ratedCostUsdUnits)
            if (actualUsdUnits.toString() !== record.cumulativeRatedCostUsdUnits) {
                fail('RUNNER_CHECKPOINT_COST_SEQUENCE_INVALID')
            }
            if (record.status === 'complete') {
                if (!expectedModelVersion) expectedModelVersion = record.modelVersion
                else if (record.modelVersion !== expectedModelVersion) evidenceSplit = true
            }
            lastOperationalStatus = record.status
            completed.add(record.callId)
            active = null
            return
        }
        fail('RUNNER_CHECKPOINT_PHASE_INVALID')
    })
    const responseIds = new Set()
    let durableResponseBytes = 0
    forEachJsonl(runRoot, 'responses.jsonl', (response) => {
        if (response?.phase !== 'response-durable'
            || typeof response.callId !== 'string'
            || typeof response.rawResponseBase64 !== 'string'
            || !/^[a-f0-9]{64}$/.test(response.rawResponseSha256 || '')) fail('RUNNER_RESPONSE_ARTIFACT_INVALID')
        if (responseIds.has(response.callId)) fail('RUNNER_RESPONSE_ARTIFACT_DUPLICATE')
        const bytes = Buffer.from(response.rawResponseBase64, 'base64')
        if (!Number.isSafeInteger(response.rawResponseBytes) || response.rawResponseBytes !== bytes.byteLength
            || sha256Bytes(bytes) !== response.rawResponseSha256) fail('RUNNER_RESPONSE_ARTIFACT_HASH_INVALID')
        responseIds.add(response.callId)
        durableResponseBytes += bytes.byteLength
        if (!Number.isSafeInteger(durableResponseBytes)) fail('RUNNER_RESPONSE_ARTIFACT_SIZE_INVALID')
    })
    for (const callId of completed) {
        if (!responseIds.has(callId)) fail('RUNNER_COMPLETION_WITHOUT_RESPONSE')
    }
    if (active && responseIds.has(active)) {
        // Response durability succeeded but call-complete did not. The provider
        // call remains ambiguous for scheduling purposes and is never retried
        // automatically; the retained response is still evidence.
    }
    if ([...responseIds].some((callId) => !completed.has(callId) && callId !== active)) {
        fail('RUNNER_RESPONSE_WITHOUT_START')
    }
    return Object.freeze({
        completedCallIds: Object.freeze([...completed]),
        ambiguousStartedCallId: active,
        durableResponseCount: responseIds.size,
        durableResponseBytes,
        actualUsdUnits: actualUsdUnits.toString(),
        expectedModelVersion,
        evidenceSplit,
        lastOperationalStatus,
        callRecordCount,
    })
}

function createRunnerArtifactSink(runRoot, { resume = false } = {}) {
    const calls = openJsonlCheckpoint(runRoot, 'calls.jsonl', { resume })
    const responses = openJsonlCheckpoint(runRoot, 'responses.jsonl', { resume })
    let closed = false
    return Object.freeze({
        onCheckpoint(record) {
            if (closed) fail('RUNNER_ARTIFACT_SINK_CLOSED')
            calls.append(record)
        },
        onResponse(record) {
            if (closed) fail('RUNNER_ARTIFACT_SINK_CLOSED')
            if (typeof record?.callId !== 'string'
                || (!Buffer.isBuffer(record.rawResponse) && !(record.rawResponse instanceof Uint8Array))) {
                fail('RUNNER_ARTIFACT_RESPONSE_INVALID')
            }
            const bytes = Buffer.from(record.rawResponse)
            const durable = {
                schemaVersion: 1,
                phase: 'response-durable',
                callId: record.callId,
                rawResponseBytes: bytes.byteLength,
                rawResponseSha256: sha256Bytes(bytes),
                rawResponseBase64: bytes.toString('base64'),
            }
            responses.append(durable)
        },
        close() {
            if (closed) return
            responses.close()
            calls.close()
            closed = true
        },
        inspect() {
            if (!closed) fail('RUNNER_ARTIFACT_SINK_OPEN')
            return inspectRunnerCheckpointState(runRoot)
        },
    })
}

module.exports = {
    createRunnerArtifactSink,
    forEachJsonl,
    inspectRunnerCheckpointState,
    readJsonl,
}
