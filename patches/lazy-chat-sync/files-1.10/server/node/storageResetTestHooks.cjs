'use strict'

// Test-only hooks for storage resets. Every hook is inert unless NODE_ENV is
// 'test' and its POCKETRISU_TEST_STORAGE_* variable is set.

const fs = require('fs')
const path = require('path')

function testSetting(name) {
    if (process.env.NODE_ENV !== 'test') return ''
    return String(process.env[name] ?? '').trim()
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

// <dir>/<kind>.hold pauses the caller; it writes <kind>.entered and resumes
// once <kind>.release exists or the hold file is removed.
async function waitAtGate(variable, kind) {
    const configured = testSetting(variable)
    if (!configured) return
    const gateDir = path.resolve(configured)
    const holdPath = path.join(gateDir, `${kind}.hold`)
    if (!fs.existsSync(holdPath)) return
    fs.writeFileSync(path.join(gateDir, `${kind}.entered`), 'entered', 'utf-8')
    const releasePath = path.join(gateDir, `${kind}.release`)
    while (fs.existsSync(holdPath) && !fs.existsSync(releasePath)) {
        await sleep(10)
    }
}

function waitAtAdmissionGate(kind) {
    return waitAtGate('POCKETRISU_TEST_STORAGE_ADMISSION_GATE_DIR', kind)
}

function waitAtResetGate(kind) {
    return waitAtGate('POCKETRISU_TEST_STORAGE_RESET_GATE_DIR', `${kind}.apply`)
}

function attemptMatches(variable, attempt) {
    const configured = testSetting(variable)
    if (!configured) return true
    return Number(configured) === attempt
}

// POCKETRISU_TEST_STORAGE_RESET_FAILPOINT names one step; 'reverse-inlay-rename'
// also fails the commit after the inlay swap so the reverse path runs.
function failpointActive(name, attempt) {
    const configured = testSetting('POCKETRISU_TEST_STORAGE_RESET_FAILPOINT')
    if (!configured) return false
    if (!attemptMatches('POCKETRISU_TEST_STORAGE_RESET_FAILPOINT_ON_ATTEMPT', attempt)) return false
    if (configured === name) return true
    return name === 'commit-after-inlay-swap' && configured === 'reverse-inlay-rename'
}

function failpoint(name, attempt) {
    if (failpointActive(name, attempt)) {
        throw new Error(`Injected storage reset failure: ${name}`)
    }
}

// 'entry:<n>' fails while applying the n-th backup entry (1-based).
function entryFailpoint(entryNumber, attempt) {
    const configured = testSetting('POCKETRISU_TEST_STORAGE_RESET_FAILPOINT')
    if (!configured.startsWith('entry:')) return
    if (!attemptMatches('POCKETRISU_TEST_STORAGE_RESET_FAILPOINT_ON_ATTEMPT', attempt)) return
    if (Number(configured.slice('entry:'.length)) === entryNumber) {
        throw new Error(`Injected storage reset failure: entry ${entryNumber}`)
    }
}

function traceEnabled() {
    return testSetting('POCKETRISU_TEST_STORAGE_RESET_TRACE_FILE') !== ''
}

function trace(event, details = {}) {
    const file = testSetting('POCKETRISU_TEST_STORAGE_RESET_TRACE_FILE')
    if (!file) return
    fs.appendFileSync(file, JSON.stringify({ event, at: Date.now(), ...details }) + '\n')
}

// Records an 'event-loop-yield' trace event as soon as control returns to
// the event loop (microtask or macrotask) after this call.
function traceNextYield(details = {}) {
    if (!traceEnabled()) return
    let recorded = false
    const record = (via) => {
        if (recorded) return
        recorded = true
        trace('event-loop-yield', { via, ...details })
    }
    queueMicrotask(() => record('microtask'))
    setImmediate(() => record('immediate'))
}

function spoolDirectory() {
    const configured = testSetting('POCKETRISU_TEST_STORAGE_RESET_SPOOL_DIR')
    return configured ? path.resolve(configured) : null
}

function checkSpoolWrite(totalBytesAfterWrite, attempt) {
    const configured = testSetting('POCKETRISU_TEST_STORAGE_RESET_SPOOL_FAIL_AFTER_BYTES')
    if (!configured) return
    if (!attemptMatches('POCKETRISU_TEST_STORAGE_RESET_SPOOL_FAIL_ON_ATTEMPT', attempt)) return
    if (totalBytesAfterWrite > Number(configured)) {
        throw Object.assign(new Error('Injected spool failure: no space left on device'), {
            code: 'ENOSPC',
        })
    }
}

const METRICS_SAMPLER_SOURCE = `
const { parentPort, workerData } = require('worker_threads')
const fs = require('fs')
const path = require('path')
const http = require('http')
const peak = { wal: 0, rss: 0, temporary: 0, stall: 0 }
function sizeOf(target) {
    let stat
    try { stat = fs.statSync(target) } catch { return 0 }
    if (!stat.isDirectory()) return stat.size
    let total = 0
    let names = []
    try { names = fs.readdirSync(target) } catch { return 0 }
    for (const name of names) total += sizeOf(path.join(target, name))
    return total
}
let temporaryPaths = []
let stopped = false
function sample() {
    try { peak.wal = Math.max(peak.wal, fs.statSync(workerData.walPath).size) } catch {}
    peak.rss = Math.max(peak.rss, process.memoryUsage().rss)
    let temporary = 0
    for (const target of temporaryPaths) temporary += sizeOf(target)
    peak.temporary = Math.max(peak.temporary, temporary)
}
const sampler = setInterval(sample, 20)
function poll() {
    if (stopped || !workerData.port) return
    const started = Date.now()
    const request = http.get({ host: '127.0.0.1', port: workerData.port, path: '/api/test_auth' }, (response) => {
        response.resume()
        response.on('end', () => {
            peak.stall = Math.max(peak.stall, Date.now() - started)
            setTimeout(poll, 10)
        })
    })
    request.on('error', () => setTimeout(poll, 50))
}
poll()
parentPort.on('message', (message) => {
    if (message.type === 'paths') temporaryPaths = message.paths
    if (message.type === 'stop') {
        stopped = true
        sample()
        clearInterval(sampler)
        parentPort.postMessage({ type: 'result', peak })
    }
})
`

// Samples WAL size, process RSS and temporary disk use from a worker thread,
// and the latency of a cheap HTTP GET answered by the main event loop.
function startMetrics({ walPath, port }) {
    const file = testSetting('POCKETRISU_TEST_STORAGE_RESET_METRICS_FILE')
    if (!file) return null
    const { Worker } = require('worker_threads')
    const startedAt = Date.now()
    const worker = new Worker(METRICS_SAMPLER_SOURCE, {
        eval: true,
        workerData: { walPath, port: Number(port) || 0 },
    })
    worker.unref()
    return {
        setTemporaryPaths(paths) {
            worker.postMessage({ type: 'paths', paths })
        },
        // observed.walBytes: WAL size the caller measured itself (e.g. at
        // COMMIT, before a checkpoint can truncate it between samples).
        async stop(details, observed = {}) {
            const peak = await new Promise((resolve) => {
                const timer = setTimeout(() => resolve(null), 5000)
                worker.once('message', (message) => {
                    clearTimeout(timer)
                    resolve(message.peak)
                })
                worker.postMessage({ type: 'stop' })
            })
            await worker.terminate().catch(() => {})
            fs.writeFileSync(file, JSON.stringify({
                ...details,
                durationMs: Date.now() - startedAt,
                peakWalBytes: Math.max(peak?.wal ?? 0, observed.walBytes ?? 0),
                peakRssBytes: peak?.rss ?? 0,
                peakTemporaryDiskBytes: peak?.temporary ?? 0,
                maxExternalPollStallMs: peak?.stall ?? 0,
            }, null, 2))
        },
    }
}

module.exports = {
    checkSpoolWrite,
    entryFailpoint,
    failpoint,
    failpointActive,
    spoolDirectory,
    startMetrics,
    trace,
    traceNextYield,
    waitAtAdmissionGate,
    waitAtResetGate,
}
