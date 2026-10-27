'use strict'

// Test-only hooks for chat persistence and storage resets. Every hook is
// inert unless NODE_ENV is 'test' and its POCKETRISU_TEST_STORAGE_* variable
// is set.

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
// once <kind>.release exists or the hold file is removed. Returns null when
// there is nothing to wait for, so an inert gate adds no asynchronous step.
function waitAtGate(variable, kind) {
    const configured = testSetting(variable)
    if (!configured) return null
    const gateDir = path.resolve(configured)
    const holdPath = path.join(gateDir, `${kind}.hold`)
    if (!fs.existsSync(holdPath)) return null
    fs.writeFileSync(path.join(gateDir, `${kind}.entered`), 'entered', 'utf-8')
    const releasePath = path.join(gateDir, `${kind}.release`)
    return (async () => {
        while (fs.existsSync(holdPath) && !fs.existsSync(releasePath)) {
            await sleep(10)
        }
    })()
}

// Kind 'db-persist': a debounced database write has read the database and
// chat state it will write and has not written it yet.
function waitAtPersistGate(kind) {
    return waitAtGate('POCKETRISU_TEST_STORAGE_PERSIST_GATE_DIR', kind)
}

// A writer passed the entry checks and recorded the reset generation; it has
// not entered the storage queue yet. Kinds name the writer route.
function waitAtAdmissionGate(kind) {
    return waitAtGate('POCKETRISU_TEST_STORAGE_ADMISSION_GATE_DIR', kind)
}

// A reset is in progress (writers are refused) and has not replaced anything
// yet. The gate file is <kind>.apply.
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
// POCKETRISU_TEST_STORAGE_RESET_FAILPOINT_ON_ATTEMPT limits it to the n-th
// reset of the process.
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

// Appends one JSON line per reset event to POCKETRISU_TEST_STORAGE_RESET_TRACE_FILE.
function trace(event, details = {}) {
    const file = testSetting('POCKETRISU_TEST_STORAGE_RESET_TRACE_FILE')
    if (!file) return
    fs.appendFileSync(file, JSON.stringify({ event, at: Date.now(), ...details }) + '\n')
}

module.exports = {
    entryFailpoint,
    failpoint,
    failpointActive,
    trace,
    waitAtAdmissionGate,
    waitAtPersistGate,
    waitAtResetGate,
}
