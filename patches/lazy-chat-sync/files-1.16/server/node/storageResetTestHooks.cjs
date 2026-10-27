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

// Kind 'db-persist': a debounced database write has read the database and
// chat state it will write and has not written it yet.
function waitAtPersistGate(kind) {
    return waitAtGate('POCKETRISU_TEST_STORAGE_PERSIST_GATE_DIR', kind)
}

module.exports = {
    waitAtPersistGate,
}
