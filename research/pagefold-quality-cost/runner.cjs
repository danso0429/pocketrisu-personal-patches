'use strict'

const {
    PRICE_CATEGORIES,
    QualityCostProtocolError,
    formatUsdUnits,
    parseUsdUnits,
    reserveCallCost,
    sha256Bytes,
} = require('./protocol-v1.cjs')

const FAKE_SIMULATION_TRANSPORTS = new WeakSet()

function fail(code) {
    throw new QualityCostProtocolError(code)
}

function validateSimulation(options) {
    if (options.simulation !== true || options.transportKind !== 'fake'
        || typeof options.executeCall !== 'function'
        || !FAKE_SIMULATION_TRANSPORTS.has(options.executeCall)) fail('RUNNER_SIMULATION_INVALID')
    return true
}

function createFakeSimulationTransport(steps) {
    if (!Array.isArray(steps) || steps.length === 0) fail('FAKE_TRANSPORT_STEPS_INVALID')
    const frozenSteps = steps.map((step) => {
        if (step?.kind === 'wait-for-abort') return Object.freeze({ kind: 'wait-for-abort' })
        if (step?.kind !== 'response') fail('FAKE_TRANSPORT_STEP_INVALID')
        return Object.freeze({ kind: 'response', response: validateCallResponse(step.response) })
    })
    let index = 0
    const callIds = []
    const transport = async ({ callId, signal }) => {
        const step = frozenSteps[index++]
        if (!step) fail('FAKE_TRANSPORT_EXHAUSTED')
        callIds.push(callId)
        if (step.kind === 'wait-for-abort') {
            return await new Promise((resolve, reject) => {
                if (signal.aborted) return reject(new QualityCostProtocolError('FAKE_TRANSPORT_ABORTED'))
                signal.addEventListener('abort', () => reject(new QualityCostProtocolError('FAKE_TRANSPORT_ABORTED')), { once: true })
            })
        }
        return { ...step.response, usage: { ...step.response.usage }, rawResponse: Buffer.from(step.response.rawResponse) }
    }
    transport.inspect = () => Object.freeze({ calls: index, callIds: Object.freeze([...callIds]), remaining: frozenSteps.length - index })
    FAKE_SIMULATION_TRANSPORTS.add(transport)
    return transport
}

function validateCallResponse(response) {
    if (!response || !Number.isSafeInteger(response.httpStatus)
        || response.httpStatus < 0 || response.httpStatus > 599
        || !Number.isSafeInteger(response.latencyMs) || response.latencyMs < 0
        || typeof response.parserStatus !== 'string'
        || !response.usage || typeof response.usage !== 'object'
        || (!Buffer.isBuffer(response.rawResponse) && !(response.rawResponse instanceof Uint8Array))) {
        fail('RUNNER_RESPONSE_INVALID')
    }
    const usage = {}
    for (const category of PRICE_CATEGORIES) {
        const tokens = response.usage[category] ?? 0
        if (!Number.isSafeInteger(tokens) || tokens < 0) fail('RUNNER_USAGE_INVALID')
        usage[category] = tokens
    }
    return { ...response, usage, rawResponse: Buffer.from(response.rawResponse) }
}

function costEntryMap(manifest) {
    const entries = manifest?.costLedger?.entries
    if (!Array.isArray(entries) || entries.length === 0) fail('RUNNER_COST_LEDGER_INVALID')
    const map = new Map()
    for (const entry of entries) {
        if (map.has(entry.callId)) fail('RUNNER_COST_CALL_DUPLICATE')
        map.set(entry.callId, entry)
    }
    return map
}

function reservationUnits(entry) {
    if (!entry || !/^[0-9]+$/.test(entry.totalUsdUnits || '')) fail('RUNNER_RESERVATION_INVALID')
    return BigInt(entry.totalUsdUnits)
}

function actualCost(call, response, priceBasis, reservation) {
    for (const category of PRICE_CATEGORIES) {
        const maximum = reservation.categories?.[category]?.tokens
        if (!Number.isSafeInteger(maximum) || response.usage[category] > maximum) {
            fail('RUNNER_USAGE_EXCEEDS_RESERVATION')
        }
    }
    return reserveCallCost({
        callId: call.callId,
        purpose: reservation.purpose,
        reservation: response.usage,
    }, priceBasis)
}

function operationalStatus(response, expectedModelVersion) {
    if (response.httpStatus < 200 || response.httpStatus >= 300) return 'http-failure'
    if (response.parserStatus !== 'ok') return 'parser-failure'
    if (typeof response.modelVersion !== 'string' || response.modelVersion.length === 0) return 'model-version-missing'
    if (expectedModelVersion && response.modelVersion !== expectedModelVersion) return 'model-version-split'
    return 'complete'
}

function assertSecretsAbsentFromResponse(bytes, secrets) {
    if (!Array.isArray(secrets)) fail('RUNNER_SECRET_SET_INVALID')
    for (const secret of secrets) {
        if (typeof secret !== 'string' || secret.length === 0) continue
        if (bytes.includes(Buffer.from(secret, 'utf8'))) fail('RUNNER_SECRET_IN_RESPONSE')
    }
    return true
}

async function executeCallWithTimeout(executeCall, call, timeoutMs) {
    const controller = new AbortController()
    let timer
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
            reject(new QualityCostProtocolError('RUNNER_CALL_TIMEOUT'))
            controller.abort()
        }, timeoutMs)
    })
    try {
        return await Promise.race([
            Promise.resolve().then(() => executeCall(Object.freeze({ ...call, signal: controller.signal }))),
            timeout,
        ])
    } finally {
        clearTimeout(timer)
    }
}

function contentFreeCallRecord(call, response, actual, cumulativeUnits, status) {
    return Object.freeze({
        schemaVersion: 1,
        phase: 'call-complete',
        callId: call.callId,
        scheduleId: call.scheduleId,
        blockId: call.blockId,
        opaqueCaseId: call.opaqueCaseId,
        opaqueConditionId: call.opaqueConditionId,
        repeat: call.repeat,
        position: call.position,
        httpStatus: response.httpStatus,
        modelVersion: response.modelVersion || null,
        responseId: response.responseId || null,
        createTime: response.createTime || null,
        finishReason: response.finishReason || null,
        parserStatus: response.parserStatus,
        latencyMs: response.latencyMs,
        usage: response.usage,
        ratedCostUsd: actual.totalUsd,
        ratedCostUsdUnits: actual.totalUsdUnits,
        cumulativeRatedCostUsd: formatUsdUnits(cumulativeUnits),
        cumulativeRatedCostUsdUnits: cumulativeUnits.toString(),
        rawResponseBytes: response.rawResponse.byteLength,
        rawResponseSha256: sha256Bytes(response.rawResponse),
        status,
    })
}

async function runFrozenSchedule(options) {
    const { activationManifest: manifest, schedule } = options
    if (!schedule || !Array.isArray(schedule.calls) || schedule.calls.length === 0) fail('RUNNER_SCHEDULE_INVALID')
    if (options.simulation === true) validateSimulation(options)
    else fail('RUNNER_PAID_EXECUTION_NOT_IMPLEMENTED')
    if (typeof options.executeCall !== 'function'
        || typeof options.onCheckpoint !== 'function'
        || typeof options.onResponse !== 'function') fail('RUNNER_CALLBACK_INVALID')
    const reservations = costEntryMap(manifest)
    const resumeState = options.resumeState || {
        completedCallIds: options.completedCallIds || [],
        ambiguousStartedCallId: options.ambiguousStartedCallId || null,
        actualUsdUnits: options.priorActualUsdUnits || '0',
        durableResponseBytes: options.priorRawResponseBytes || 0,
        expectedModelVersion: options.expectedModelVersion || null,
        evidenceSplit: false,
        lastOperationalStatus: null,
    }
    if (!Array.isArray(resumeState.completedCallIds)
        || !/^[0-9]+$/.test(resumeState.actualUsdUnits || '')
        || !Number.isSafeInteger(resumeState.durableResponseBytes)
        || resumeState.durableResponseBytes < 0) fail('RUNNER_RESUME_STATE_INVALID')
    const completedIds = new Set(resumeState.completedCallIds)
    if (completedIds.size !== resumeState.completedCallIds.length) fail('RUNNER_RESUME_DUPLICATE')
    if (resumeState.ambiguousStartedCallId) {
        return Object.freeze({
            status: 'incomplete-ambiguous-start',
            stopReason: 'ambiguous-start-requires-explicit-retry-decision',
            completedCalls: completedIds.size,
            newCompletedCalls: 0,
            providerCallsAuthorized: options.simulation !== true,
        })
    }
    if (resumeState.evidenceSplit === true
        || (resumeState.lastOperationalStatus && resumeState.lastOperationalStatus !== 'complete')) {
        return Object.freeze({
            status: 'incomplete-existing-operational-stop',
            stopReason: resumeState.evidenceSplit ? 'model-version-split' : resumeState.lastOperationalStatus,
            completedCalls: completedIds.size,
            newCompletedCalls: 0,
            providerCallsAuthorized: options.simulation !== true,
        })
    }
    for (const callId of completedIds) {
        if (!schedule.calls.some((call) => call.callId === callId)) fail('RUNNER_RESUME_UNKNOWN_CALL')
    }
    const capUnits = parseUsdUnits(manifest.costLedger.capUsd)
    let cumulativeUnits = BigInt(resumeState.actualUsdUnits)
    if (cumulativeUnits < 0n || cumulativeUnits > capUnits) fail('RUNNER_PRIOR_COST_INVALID')
    let expectedModelVersion = resumeState.expectedModelVersion || null
    const runtime = manifest.runtime
    if (!runtime || !Number.isSafeInteger(runtime.callTimeoutMs)
        || !Number.isSafeInteger(runtime.maxRawResponseBytesPerCall)
        || !Number.isSafeInteger(runtime.maxRawResponseBytesTotal)) fail('RUNNER_RUNTIME_CONTRACT_INVALID')
    let cumulativeRawResponseBytes = resumeState.durableResponseBytes
    if (!Number.isSafeInteger(cumulativeRawResponseBytes) || cumulativeRawResponseBytes < 0
        || cumulativeRawResponseBytes > runtime.maxRawResponseBytesTotal) fail('RUNNER_PRIOR_RESPONSE_BYTES_INVALID')
    let stopReason = null
    const records = []
    const pending = schedule.calls.filter((call) => !completedIds.has(call.callId))
    for (let index = 0; index < pending.length; index++) {
        const call = pending[index]
        const reservation = reservations.get(call.callId)
        if (!reservation) fail('RUNNER_CALL_RESERVATION_MISSING')
        const remainingReservationUnits = pending.slice(index)
            .reduce((sum, future) => sum + reservationUnits(reservations.get(future.callId)), 0n)
        if (cumulativeUnits + remainingReservationUnits > capUnits) {
            stopReason = 'complete-block-cost-reservation-lost'
            break
        }
        const start = Object.freeze({
            schemaVersion: 1,
            phase: 'call-start',
            callId: call.callId,
            scheduleId: call.scheduleId,
            blockId: call.blockId,
            opaqueCaseId: call.opaqueCaseId,
            opaqueConditionId: call.opaqueConditionId,
            repeat: call.repeat,
            position: call.position,
            cumulativeRatedCostUsd: formatUsdUnits(cumulativeUnits),
            cumulativeRatedCostUsdUnits: cumulativeUnits.toString(),
            reservedCostUsd: reservation.totalUsd,
            reservedCostUsdUnits: reservation.totalUsdUnits,
        })
        await options.onCheckpoint(start)
        const response = validateCallResponse(await executeCallWithTimeout(
            options.executeCall,
            call,
            runtime.callTimeoutMs,
        ))
        if (response.rawResponse.byteLength > runtime.maxRawResponseBytesPerCall
            || cumulativeRawResponseBytes + response.rawResponse.byteLength > runtime.maxRawResponseBytesTotal) {
            fail('RUNNER_RESPONSE_ARTIFACT_LIMIT')
        }
        assertSecretsAbsentFromResponse(response.rawResponse, options.secretValues || [])
        const actual = actualCost(call, response, manifest.priceBasis, reservation)
        cumulativeUnits += BigInt(actual.totalUsdUnits)
        if (cumulativeUnits > capUnits) fail('RUNNER_COST_CAP_EXCEEDED')
        const status = operationalStatus(response, expectedModelVersion)
        if (!expectedModelVersion && status === 'complete') expectedModelVersion = response.modelVersion
        await options.onResponse(Object.freeze({
            callId: call.callId,
            rawResponse: response.rawResponse,
            rawResponseSha256: sha256Bytes(response.rawResponse),
        }))
        cumulativeRawResponseBytes += response.rawResponse.byteLength
        const complete = contentFreeCallRecord(call, response, actual, cumulativeUnits, status)
        await options.onCheckpoint(complete)
        records.push(complete)
        completedIds.add(call.callId)
        options.onProgress?.(Object.freeze({
            callId: call.callId,
            status,
            httpStatus: response.httpStatus,
            finishReason: response.finishReason || null,
            cumulativeRatedCostUsd: complete.cumulativeRatedCostUsd,
        }))
        if (status !== 'complete') {
            stopReason = status
            break
        }
    }
    const complete = schedule.calls.every((call) => completedIds.has(call.callId))
    return Object.freeze({
        status: complete ? 'complete' : 'incomplete',
        stopReason,
        completedCalls: completedIds.size,
        newCompletedCalls: records.length,
        expectedModelVersion,
        cumulativeRatedCostUsd: formatUsdUnits(cumulativeUnits),
        cumulativeRatedCostUsdUnits: cumulativeUnits.toString(),
        cumulativeRawResponseBytes,
        providerCallsAuthorized: options.simulation !== true,
        semanticInspectionDuringBlock: false,
        automaticRetries: 0,
        records: Object.freeze(records),
    })
}

module.exports = {
    actualCost,
    assertSecretsAbsentFromResponse,
    contentFreeCallRecord,
    createFakeSimulationTransport,
    operationalStatus,
    executeCallWithTimeout,
    runFrozenSchedule,
    validateCallResponse,
    validateSimulation,
}
