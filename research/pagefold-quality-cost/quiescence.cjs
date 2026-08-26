'use strict'

const path = require('node:path')
const { QualityCostProtocolError } = require('./protocol-v1.cjs')

const ACTIVE_BG_STATES = new Set([
    'queued',
    'running',
    'running-result-consumed',
    'running-result-ready',
])
const INACTIVE_BG_STATES = new Set(['result-ready', 'delivery-failed', 'cancelled', 'delivered'])
const BG_STATE_PREFIX = 'bg-orch-state-op:'
const BG_RESULT_PREFIX = 'bg-orch-result-op:'
const LEGACY_BG_RESULT_PREFIX = 'bg-orch-result:'
const BG_DRAFT_PREFIX = 'bg-stream-draft:'

function fail(code) {
    throw new QualityCostProtocolError(code)
}

function parseJson(value) {
    if (Buffer.isBuffer(value)) value = value.toString('utf8')
    if (typeof value !== 'string' || value.length === 0) return null
    try {
        const parsed = JSON.parse(value)
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
    } catch {
        return null
    }
}

function matchesCase(record, characterId, chatId) {
    return String(record?.charId ?? '') === characterId && String(record?.chatId ?? '') === chatId
}

function inspectKvQuiescence(reader, characterId, chatId) {
    if (!reader || typeof reader.kvList !== 'function' || typeof reader.kvGet !== 'function') {
        fail('QUIESCENCE_KV_READER_INVALID')
    }
    let backgroundActive = 0
    let selectedBackgroundActive = 0
    let selectedResultReady = false
    for (const key of reader.kvList(BG_STATE_PREFIX)) {
        const record = parseJson(reader.kvGet(key))
        if (!record || (!ACTIVE_BG_STATES.has(record.state) && !INACTIVE_BG_STATES.has(record.state))) {
            fail('QUIESCENCE_BG_STATE_INVALID')
        }
        if (matchesCase(record, characterId, chatId) && record.state === 'result-ready') selectedResultReady = true
        if (!ACTIVE_BG_STATES.has(record.state)) continue
        backgroundActive++
        if (matchesCase(record, characterId, chatId)) selectedBackgroundActive++
    }
    let pendingPayloads = 0
    for (const prefix of [BG_RESULT_PREFIX, LEGACY_BG_RESULT_PREFIX, BG_DRAFT_PREFIX]) {
        for (const key of reader.kvList(prefix)) {
            const record = parseJson(reader.kvGet(key))
            if (!record) fail('QUIESCENCE_BG_PAYLOAD_INVALID')
            if (matchesCase(record, characterId, chatId)) pendingPayloads++
        }
    }
    if (selectedResultReady && pendingPayloads === 0) pendingPayloads = 1
    return { backgroundActive, selectedBackgroundActive, pendingPayloads }
}

function inspectJobsDatabase(db, chatId) {
    if (!db || typeof db.prepare !== 'function') fail('QUIESCENCE_JOBS_DB_INVALID')
    const running = db.prepare("SELECT COUNT(*) AS count FROM model_jobs WHERE status = 'running'").get().count
    const pendingSends = db.prepare('SELECT COUNT(*) AS count FROM pending_sends').get().count
    const selectedRunning = db.prepare(
        "SELECT COUNT(*) AS count FROM model_jobs WHERE status = 'running' AND chat_id = ?",
    ).get(chatId).count
    const selectedPendingSends = db.prepare(
        'SELECT COUNT(*) AS count FROM pending_sends WHERE chat_id = ?',
    ).get(chatId).count
    const selectedUnclaimed = db.prepare(
        "SELECT COUNT(*) AS count FROM model_jobs WHERE status IN ('done', 'failed') AND claimed = 0 AND kind = 'main' AND chat_id = ?",
    ).get(chatId).count
    return {
        nativeActive: Number(running) + Number(pendingSends),
        selectedNativeActive: Number(selectedRunning) + Number(selectedPendingSends),
        selectedUnclaimed: Number(selectedUnclaimed),
    }
}

function combineQuiescence({ kv, jobs, characterId, chatId, observedAt = Date.now() }) {
    for (const value of [
        kv?.backgroundActive,
        kv?.selectedBackgroundActive,
        kv?.pendingPayloads,
        jobs?.nativeActive,
        jobs?.selectedNativeActive,
        jobs?.selectedUnclaimed,
    ]) {
        if (!Number.isSafeInteger(value) || value < 0) fail('QUIESCENCE_COUNT_INVALID')
    }
    const proof = {
        schemaVersion: 1,
        source: 'read-only-preflight',
        characterId,
        chatId,
        observedAt,
        nativeActive: jobs.nativeActive,
        backgroundActive: kv.backgroundActive,
        selectedNativeActive: jobs.selectedNativeActive,
        selectedBackgroundActive: kv.selectedBackgroundActive,
        pendingPayloads: kv.pendingPayloads + jobs.selectedUnclaimed,
    }
    return Object.freeze({ ...proof, quiescent: proof.nativeActive === 0
        && proof.backgroundActive === 0
        && proof.pendingPayloads === 0 })
}

async function inspectReadOnlyQuiescence({ targetRoot, databasePath, modelJobsPath, characterId, chatId }) {
    if (typeof targetRoot !== 'string' || !path.isAbsolute(targetRoot)
        || typeof databasePath !== 'string' || !path.isAbsolute(databasePath)
        || typeof modelJobsPath !== 'string' || !path.isAbsolute(modelJobsPath)
        || typeof characterId !== 'string' || characterId.length === 0
        || typeof chatId !== 'string' || chatId.length === 0) fail('QUIESCENCE_INPUT_INVALID')
    const { openKvSnapshot } = require(path.join(targetRoot, 'server/node/backupSnapshot.cjs'))
    const Database = require(require.resolve('better-sqlite3', { paths: [targetRoot] }))
    const kvSnapshot = openKvSnapshot(databasePath)
    const jobsDb = new Database(modelJobsPath, { readonly: true, fileMustExist: true })
    try {
        jobsDb.pragma('busy_timeout = 5000')
        jobsDb.exec('BEGIN')
        jobsDb.prepare('SELECT 1 FROM sqlite_master LIMIT 1').get()
        const kv = inspectKvQuiescence(kvSnapshot, characterId, chatId)
        const jobs = inspectJobsDatabase(jobsDb, chatId)
        return combineQuiescence({ kv, jobs, characterId, chatId })
    } finally {
        try { jobsDb.exec('ROLLBACK') } catch {}
        try { jobsDb.close() } catch {}
        kvSnapshot.close()
    }
}

module.exports = {
    ACTIVE_BG_STATES,
    BG_DRAFT_PREFIX,
    BG_RESULT_PREFIX,
    BG_STATE_PREFIX,
    LEGACY_BG_RESULT_PREFIX,
    INACTIVE_BG_STATES,
    combineQuiescence,
    inspectJobsDatabase,
    inspectKvQuiescence,
    inspectReadOnlyQuiescence,
    parseJson,
}
