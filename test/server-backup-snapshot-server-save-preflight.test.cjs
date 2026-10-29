'use strict'

// Unit-level check of the server-save disk preflight in the adapter's
// installed route text. The compat harness cannot control the destination's
// free space, so the route is evaluated here with its server environment
// stubbed: statfs reports a chosen free size and the pinned source reports a
// compressed database blob that the rebuild expands.

const test = require('node:test')
const assert = require('node:assert/strict')
const nodePath = require('node:path')

const lazy = require('../patches/server-backup-snapshot-lazy-adapter/manifest.cjs')

const SERVER_SAVE_ID = 'server-backup-snapshot-lazy-adapter:server-save-export:1.9'

class BackupSourceError extends Error {
    constructor(code, message, statusCode) {
        super(message)
        this.code = code
        this.statusCode = statusCode
    }
}

function backupEntryFramedSize(entry) {
    return 8 + Buffer.byteLength(entry.backupName, 'utf-8') + entry.size
}

function loadServerSaveRoute(env) {
    const unit = lazy.units.find(({ id }) => id === SERVER_SAVE_ID)
    assert.ok(unit, 'the adapter owns the server-save route unit')
    let handler = null
    const app = { post: (route, fn) => { if (route === '/api/backup/server/save') handler = fn } }
    const names = Object.keys(env)
    new Function('app', ...names, unit.managed)(app, ...names.map((name) => env[name]))
    assert.equal(typeof handler, 'function')
    return handler
}

function createResponse() {
    const res = {
        statusCode: 200,
        body: null,
        headersSent: false,
        writableEnded: false,
        flushed: false,
        lines: [],
        status(code) { this.statusCode = code; return this },
        json(body) { this.body = body; this.headersSent = true; this.writableEnded = true; return this },
        setHeader() {},
        flushHeaders() { this.flushed = true; this.headersSent = true },
        write(chunk) { this.lines.push(String(chunk)); return true },
        end() { this.writableEnded = true },
    }
    return res
}

async function runServerSave({ free, pinnedBlobSize, rebuiltDbSize }) {
    const pluginRow = { key: 'plugin-storage/b3JkaW5hcnk', size: 64 }
    const pinned = {
        kvListWithSizes(prefix) {
            if (prefix === 'plugin-storage/') return [pluginRow]
            return []
        },
        kvSize(key) { return key === 'database/database.bin' ? pinnedBlobSize : null },
    }
    const pathsAllocated = []
    const env = {
        path: nodePath,
        checkAuth: async () => true,
        checkActiveSession: () => true,
        createBackupSourceAbortTracker: () => ({ signal: { aborted: false }, cleanup() {} }),
        capturePointInTimeBackupSource: async () => ({
            snapshot: pinned,
            filesystemEntries: [],
            close: async () => {},
        }),
        waitAtBackupSourceTestGate: async () => {},
        listColdStorageBackupEntries: () => [],
        BackupSourceError,
        totalBackupFramedSize: (entries) => entries.reduce((sum, entry) => sum + backupEntryFramedSize(entry), 0),
        backupEntryFramedSize,
        pluginStorage: { PREFIX: 'plugin-storage/', MIGRATED_MARKER_KEY: 'plugin-storage/__migrated__' },
        ARCHIVE_PREFIX: 'archive/',
        buildPinnedFullExportDbValue: async () => Buffer.alloc(rebuiltDbSize, 1),
        fs: {
            statfs: async () => ({ bsize: 1, bavail: free }),
            rename: async () => {},
            stat: async () => ({ size: 0 }),
            unlink: async () => {},
        },
        backupsDir: '/nonexistent-backups',
        allocatePointInTimeServerBackupPaths: () => {
            pathsAllocated.push(true)
            throw new BackupSourceError('TEST_STOP_AFTER_PREFLIGHT', 'stop after preflight', 500)
        },
        require,
        encodeBackupEntry: () => Buffer.alloc(0),
        waitForBackupDrain: async () => {},
        readPointInTimeBackupEntry: async () => Buffer.alloc(0),
        throwIfBackupSourceAborted: () => {},
        finishBackupWritable: async () => {},
        destroyBackupWritable: async () => {},
        backupSourceErrorPayload: (error) => ({ error: error.message, code: error.code }),
        console: { log() {}, warn() {} },
    }
    const handler = loadServerSaveRoute(env)
    const res = createResponse()
    let nextError = null
    await handler({}, res, (error) => { nextError = error })
    return { res, nextError, pathsAllocated: pathsAllocated.length }
}

test.describe('[E2-6b] Rebase the snapshot lazy adapter onto PocketRisu 1.16.1', () => {
    test('[new] server save with a compressed pinned DB and plugin rows is refused when free space is below the rebuilt DB frame', async () => {
        const rebuiltDbSize = 1_000_000
        const framedDb = 8 + Buffer.byteLength('database.risudat') + rebuiltDbSize
        const { res, nextError, pathsAllocated } = await runServerSave({
            free: Math.floor(framedDb / 2),
            pinnedBlobSize: 1_000,
            rebuiltDbSize,
        })
        assert.equal(nextError, null)
        assert.equal(res.flushed, false, 'no NDJSON headers before the refusal')
        assert.equal(pathsAllocated, 0, 'no temporary archive is created')
        assert.equal(res.statusCode, 400)
        assert.equal(res.body.code, 'insufficient_space')
        assert.equal(res.body.free, Math.floor(framedDb / 2))
        assert.ok(res.body.required >= framedDb, `required ${res.body.required} covers framed ${framedDb}`)
    })

    test('[unchanged] server save passes the preflight when free space covers the rebuilt DB frame', async () => {
        const rebuiltDbSize = 1_000_000
        const { res, pathsAllocated } = await runServerSave({
            free: rebuiltDbSize * 2,
            pinnedBlobSize: 1_000,
            rebuiltDbSize,
        })
        assert.equal(res.flushed, true)
        assert.equal(pathsAllocated, 1)
    })
})
