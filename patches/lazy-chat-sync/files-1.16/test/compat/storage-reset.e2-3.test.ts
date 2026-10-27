import { afterEach, describe, expect, test } from 'vitest'
import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnServer, type ServerHandle } from './helpers/spawnServer.js'
import { createClient, type RisuClient } from './helpers/client.js'
import { createSeedBackup } from './helpers/seed.js'
import { decodeBackup } from './helpers/decode.js'
import { encodeBackup } from './helpers/encode.js'
import { createFakeAccount, startFakeAccountServer } from './helpers/fakeRisuAccount.js'
import { spawnRestartableServer, type RestartableServer } from './restartableServer.e2-3.helper.js'
import { Packr } from 'msgpackr'
import Database from 'better-sqlite3'

const packr = new Packr({ useRecords: false })
const encodeChat = (value: unknown) => Buffer.concat([Buffer.from([0, 82, 73, 83, 85, 83, 65, 86, 69, 0, 7]), packr.encode(value)])

const utilsPkg = require('../../server/node/utils.cjs') as any
const utils = utilsPkg.default ?? utilsPkg
const DB_KEY_HEX = Buffer.from('database/database.bin').toString('hex')

let server: ServerHandle | undefined
let restartable: RestartableServer | undefined
let gateDir: string | undefined
let closeFake: (() => Promise<void>) | undefined

afterEach(async () => {
    await server?.cleanup()
    await restartable?.cleanup()
    restartable = undefined
    if (gateDir) await rm(gateDir, { recursive: true, force: true })
    await closeFake?.()
    server = undefined
    gateDir = undefined
    closeFake = undefined
})

async function waitFor(file: string, timeoutMs = 1_500) {
    const deadline = Date.now() + timeoutMs
    while (!existsSync(file)) {
        if (Date.now() > deadline) return false
        await new Promise(resolve => setTimeout(resolve, 20))
    }
    return true
}

async function postJson(client: RisuClient, url: string, body: unknown = {}) {
    return client.fetch(url, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    })
}

async function waitAccountState(client: RisuClient, excluded: string[]) {
    for (let i = 0; i < 400; i++) {
        const status = await (await client.fetch('/api/risu-account/status')).json() as any
        if (!excluded.includes(status.state)) return status
        await new Promise(resolve => setTimeout(resolve, 25))
    }
    throw new Error(`account state remained ${excluded.join('/')}`)
}

async function startPreparedAccount(extraEnv: Record<string, string> = {}) {
    const account = createFakeAccount()
    const fake = await startFakeAccountServer(account)
    closeFake = fake.close
    server = await spawnServer({ env: {
        POCKETRISU_RISU_ACCOUNT_URL: fake.url,
        POCKETRISU_RISU_ACCOUNT_GAP_MS: '0',
        ...extraEnv,
    } })
    const client = await createClient(server.port, server.password)
    expect((await postJson(client, '/api/risu-account/prepare', { token: account.token, id: account.id })).status).toBe(200)
    expect(await waitAccountState(client, ['preparing'])).toMatchObject({ state: 'ready' })
    return { account, client }
}

async function startDownloadedAccount(extraEnv: Record<string, string> = {}) {
    const result = await startPreparedAccount(extraEnv)
    const { client } = result
    expect((await postJson(client, '/api/risu-account/download')).status).toBe(200)
    expect(await waitAccountState(client, ['downloading'])).toMatchObject({ state: 'downloaded', blocking: true })
    return result
}

async function sessionCookie(client: RisuClient) {
    const response = await client.fetch('/api/session', { method: 'POST' })
    expect(response.status).toBe(200)
    return response.headers.get('set-cookie')!.split(';')[0]
}

async function heldReset(client: RisuClient, kind = 'backup-import') {
    const hold = path.join(gateDir!, `${kind}.apply.hold`)
    const entered = path.join(gateDir!, `${kind}.apply.entered`)
    await writeFile(hold, '')
    const promise = client.importBackup(createSeedBackup({ characterCount: 2 }))
    promise.catch(() => {})
    if (!await waitFor(entered)) {
        await promise
        return null
    }
    return { promise, release: () => unlink(hold).catch(() => {}) }
}

describe('[E2-3c] Rebuild the storage reset barrier over native 1.16.1', () => {
    test('[new] c1 returns retryable 503 for storage writers while a reset is active', async () => {
        gateDir = await mkdtemp(path.join(tmpdir(), 'e2-3-reset-gate-'))
        server = await spawnServer({ env: { POCKETRISU_TEST_STORAGE_RESET_GATE_DIR: gateDir } })
        const client = await createClient(server.port, server.password)
        expect((await client.importBackup(createSeedBackup())).ok).toBe(true)
        const reset = await heldReset(client)
        expect(reset, 'backup-import reset gate entered').not.toBeNull()
        const cookie = await sessionCookie(client)
        const requests: Array<[string, RequestInit]> = [
            ['/api/db/flush', { method: 'POST', headers: { cookie } }],
            ['/api/db/optimize', { method: 'POST' }],
            ['/api/db/wal-checkpoint', { method: 'POST' }],
            ['/api/db/assets/purge-orphans', { method: 'POST' }],
            ['/api/remove', { method: 'GET', headers: { 'file-path': Buffer.from('assets/a').toString('hex') } }],
        ]
        const responses = []
        try {
            for (const [url, init] of requests) responses.push(await client.fetch(url, init))
        } finally {
            await reset!.release()
            await reset!.promise
        }
        for (const response of responses) {
            expect(response.status).toBe(503)
            expect(await response.json()).toMatchObject({ code: 'STORAGE_RESET_IN_PROGRESS', retryable: true })
        }
    })

    test('[new] c2 rejects a write admitted before a reset even after that reset finishes', async () => {
        gateDir = await mkdtemp(path.join(tmpdir(), 'e2-3-admission-gate-'))
        server = await spawnServer({ env: {
            POCKETRISU_TEST_STORAGE_ADMISSION_GATE_DIR: gateDir,
            POCKETRISU_TEST_STORAGE_RESET_GATE_DIR: gateDir,
        } })
        const client = await createClient(server.port, server.password)
        expect((await client.importBackup(createSeedBackup())).ok).toBe(true)

        await writeFile(path.join(gateDir, 'write.hold'), '')
        const read = await client.fetch('/api/read', { headers: { 'file-path': Buffer.from('database/database.bin').toString('hex') } })
        const admitted = client.fetch('/api/write', {
            method: 'POST',
            headers: {
                'content-type': 'application/octet-stream',
                'file-path': Buffer.from('database/database.bin').toString('hex'),
                'x-if-match': read.headers.get('x-db-etag')!,
            },
            body: new Uint8Array(await read.arrayBuffer()),
        })
        expect(await waitFor(path.join(gateDir, 'write.entered')), 'write admission gate entered').toBe(true)
        const reset = await heldReset(client)
        expect(reset, 'backup-import reset gate entered').not.toBeNull()
        await reset!.release()
        expect((await reset!.promise).ok).toBe(true)
        await unlink(path.join(gateDir, 'write.hold'))
        const response = await admitted
        expect(response.status).toBe(503)
        expect(await response.json()).toMatchObject({ code: 'STORAGE_RESET_IN_PROGRESS', retryable: true })
    })

    test('[new] c4a rolls back a pre-COMMIT reset failure and releases the barrier', async () => {
        server = await spawnServer({ env: {
            POCKETRISU_TEST_STORAGE_RESET_FAILPOINT: 'after-storage-epoch-write',
            POCKETRISU_TEST_STORAGE_RESET_FAILPOINT_ON_ATTEMPT: '2',
        } })
        const client = await createClient(server.port, server.password)
        expect((await client.importBackup(createSeedBackup({ characterCount: 1, messagesPerChat: 2 }))).ok).toBe(true)
        const hex = (value: string) => Buffer.from(value).toString('hex')
        const dbKey = hex('database/database.bin')
        const pluginKey = hex('plugin-storage/e2-c4a')
        const assetKey = hex('assets/e2-c4a.png')
        const pluginValue = Buffer.from(JSON.stringify({ kept: 'plugin value' }))
        const assetValue = Buffer.from('c4a asset bytes')
        for (const [key, body] of [[pluginKey, pluginValue], [assetKey, assetValue]] as const) {
            expect((await client.fetch('/api/write', {
                method: 'POST', headers: { 'content-type': 'application/octet-stream', 'file-path': key }, body,
            })).status).toBe(200)
        }
        const readChat = async () => client.fetch('/api/chat-content/test-char-0/0', { headers: { 'x-chat-id': 'chat-0-0' } })
        const seedRead = await readChat()
        const seedRevision = seedRead.headers.get('x-chat-revision')!
        const chat = await utils.decodeRisuSave(Buffer.from(await seedRead.arrayBuffer()))
        const dirty = { ...chat, message: [...chat.message, { role: 'user', data: 'pending journal entry', chatId: 'e2-c4a' }] }
        expect((await client.fetch('/api/chat-content/test-char-0/0', {
            method: 'POST', headers: { 'content-type': 'application/octet-stream', 'x-chat-id': dirty.id, 'x-chat-base-revision': seedRevision }, body: encodeChat(dirty),
        })).status).toBe(200)
        const journalRows = () => {
            const db = new Database(path.join(server!.cwd, 'save', 'risuai.db'), { readonly: true })
            try { return (db.prepare("SELECT count(*) AS count FROM kv WHERE key LIKE 'internal/chat-write/v1/%'").get() as any).count as number } finally { db.close() }
        }
        expect(journalRows(), 'pending journal row seeded').toBe(1)
        const snapshot = async () => ({
            db: Buffer.from(await (await client.fetch('/api/read', { headers: { 'file-path': dbKey } })).arrayBuffer()),
            plugin: Buffer.from(await (await client.fetch('/api/read', { headers: { 'file-path': pluginKey } })).arrayBuffer()),
            asset: Buffer.from(await (await client.fetch('/api/read', { headers: { 'file-path': assetKey } })).arrayBuffer()),
            chat: Buffer.from(await (await readChat()).arrayBuffer()),
        })
        const before = await snapshot()
        expect(before.plugin).toEqual(pluginValue)
        expect(before.asset).toEqual(assetValue)
        expect(before.db.byteLength).toBeGreaterThan(0)
        const cookie = await sessionCookie(client)
        const prepared = await postJson(client, '/api/backup/import/prepare', { size: createSeedBackup({ characterCount: 2 }).byteLength })
        expect(prepared.status).toBe(200)
        const failed = await client.fetch('/api/backup/import', {
            method: 'POST', headers: { 'content-type': 'application/x-risu-backup' }, body: new Uint8Array(createSeedBackup({ characterCount: 2 })),
        })
        expect(failed.ok).toBe(false)
        expect(failed.status).toBeGreaterThanOrEqual(400)
        const after = await snapshot()
        expect(after.db).toEqual(before.db)
        expect(after.plugin).toEqual(before.plugin)
        expect(after.asset).toEqual(before.asset)
        expect(after.chat).toEqual(before.chat)
        const next = Buffer.from('written after failed reset')
        expect((await client.fetch('/api/write', {
            method: 'POST', headers: { 'content-type': 'application/octet-stream', 'file-path': pluginKey }, body: next,
        })).status).toBe(200)
        const readBack = await client.fetch('/api/read', { headers: { 'file-path': pluginKey } })
        expect(Buffer.from(await readBack.arrayBuffer())).toEqual(next)
        const flush = await client.fetch('/api/db/flush', { method: 'POST', headers: { cookie } })
        expect(flush.status).toBe(200)
    })

    test('[new] c3 every competing reset is rejected with 409 while the held reset continues', async () => {
        gateDir = await mkdtemp(path.join(tmpdir(), 'e2-3-competing-reset-'))
        server = await spawnServer({ env: { POCKETRISU_TEST_STORAGE_RESET_GATE_DIR: gateDir } })
        const client = await createClient(server.port, server.password)
        const reset = await heldReset(client)
        expect(reset, 'backup-import reset gate entered').not.toBeNull()
        const dbKey = Buffer.from('database/database.bin').toString('hex')
        const requests: Array<Promise<Response>> = [
            postJson(client, '/api/backup/import/prepare', { size: 1 }),
            postJson(client, '/api/backup/server/restore', { filename: 'risu-backup-1.bin' }),
            postJson(client, '/api/migrate/save-folder/execute', { path: server.cwd }),
            client.fetch('/api/migrate/save-folder/upload', { method: 'POST', body: new Uint8Array() }),
            postJson(client, '/api/db/snapshots/restore', { key: 'missing' }),
            client.fetch('/api/remove', { headers: { 'file-path': dbKey } }),
        ]
        const responses = await Promise.all(requests)
        for (const response of responses) expect(response.status).toBe(409)
        expect(existsSync(path.join(gateDir, 'backup-import.apply.entered'))).toBe(true)
        await reset!.release()
        expect((await reset!.promise).ok).toBe(true)
    })

    test('[new] c3b account apply stays asynchronous but reports ACCOUNT_IMPORT_BUSY during a held reset', async () => {
        gateDir = await mkdtemp(path.join(tmpdir(), 'e2-3-account-reset-'))
        const { client } = await startPreparedAccount({ POCKETRISU_TEST_STORAGE_RESET_GATE_DIR: gateDir })
        const reset = await heldReset(client)
        expect(reset, 'backup-import reset gate entered').not.toBeNull()
        expect((await postJson(client, '/api/risu-account/download')).status).toBe(200)
        expect(await waitAccountState(client, ['downloading'])).toMatchObject({ state: 'downloaded', blocking: true })
        const apply = await postJson(client, '/api/risu-account/apply')
        expect(apply.status).toBe(200)
        const status = await waitAccountState(client, ['applying'])
        expect(status).toMatchObject({ state: 'downloaded', blocking: true, error: { code: 'ACCOUNT_IMPORT_BUSY' } })
        expect(existsSync(path.join(gateDir, 'backup-import.apply.entered'))).toBe(true)
        await reset!.release()
        expect((await reset!.promise).ok).toBe(true)
        expect((await client.fetch('/api/chat-content/acc-char-a/0', { headers: { 'x-chat-id': 'chat-a1' } })).status).toBe(404)
    })

    test('[new] c4b failed COMMIT and failed inlay reversal enter recovery-required mode', async () => {
        server = await spawnServer({ env: { POCKETRISU_TEST_STORAGE_RESET_FAILPOINT: 'reverse-inlay-rename' } })
        const client = await createClient(server.port, server.password)
        const original = createSeedBackup({ characterCount: 1 })
        const originalDb = decodeBackup(original).find(entry => entry.name === 'database.risudat')!.data
        const dbKey = Buffer.from('database/database.bin').toString('hex')
        expect((await client.fetch('/api/write', {
            method: 'POST', headers: { 'content-type': 'application/octet-stream', 'file-path': dbKey }, body: originalDb,
        })).status).toBe(200)
        const beforeFailure = await client.fetch('/api/read', { headers: { 'file-path': dbKey } })
        const beforeFailureBytes = Buffer.from(await beforeFailure.arrayBuffer())
        const cookie = await sessionCookie(client)
        const fixture = encodeBackup([
            ...decodeBackup(createSeedBackup({ characterCount: 2 })),
            { name: 'inlay/recovery-fixture.png', data: Buffer.from('inlay replacement') },
            { name: 'inlay_sidecar/recovery-fixture', data: Buffer.from(JSON.stringify({ ext: 'png', name: 'recovery-fixture.png', type: 'image' })) },
        ])
        expect((await postJson(client, '/api/backup/import/prepare', { size: fixture.byteLength })).status).toBe(200)
        const failed = await client.fetch('/api/backup/import', {
            method: 'POST', headers: { 'content-type': 'application/x-risu-backup' }, body: fixture,
        })
        expect(failed.status).toBe(503)
        expect(await failed.json()).toMatchObject({ code: 'STORAGE_RECOVERY_REQUIRED', retryable: false, recoveryPath: expect.any(String) })
        const stored = await client.fetch('/api/read', { headers: { 'file-path': dbKey } })
        expect(Buffer.from(await stored.arrayBuffer())).toEqual(beforeFailureBytes)
        for (const response of [
            await client.fetch('/api/db/flush', { method: 'POST', headers: { cookie } }),
            await client.fetch('/api/remove', { headers: { 'file-path': dbKey } }),
        ]) {
            expect(response.status).toBe(503)
            expect(await response.json()).toMatchObject({ code: 'STORAGE_RECOVERY_REQUIRED', retryable: false })
        }
    })

    test('[unchanged] c8 account import keeps its native write gate and flush exception', async () => {
        const { client } = await startDownloadedAccount()
        const ordinary = await client.fetch('/api/write', {
            method: 'POST',
            headers: { 'content-type': 'application/octet-stream', 'file-path': Buffer.from('test/c8').toString('hex') },
            body: Buffer.from('blocked'),
        })
        expect(ordinary.status).toBe(423)
        expect(await ordinary.json()).toMatchObject({ code: 'ACCOUNT_IMPORT_ACTIVE' })
        expect((await client.fetch('/api/db/flush', { method: 'POST', headers: { cookie: await sessionCookie(client) } })).status).toBe(200)
    })

    test('[new] c8b account-import gating wins over a simultaneously held reset', async () => {
        gateDir = await mkdtemp(path.join(tmpdir(), 'e2-3-double-gate-'))
        const { client } = await startPreparedAccount({ POCKETRISU_TEST_STORAGE_RESET_GATE_DIR: gateDir })
        await writeFile(path.join(gateDir, 'backup-import.apply.hold'), '')
        const reset = client.importBackup(createSeedBackup())
        reset.catch(() => {})
        expect(await waitFor(path.join(gateDir, 'backup-import.apply.entered')), 'backup-import reset gate entered').toBe(true)
        expect((await postJson(client, '/api/risu-account/download')).status).toBe(200)
        expect(await waitAccountState(client, ['downloading'])).toMatchObject({ state: 'downloaded', blocking: true })
        const ordinary = await client.fetch('/api/write', {
            method: 'POST',
            headers: { 'content-type': 'application/octet-stream', 'file-path': Buffer.from('test/c8b').toString('hex') },
            body: Buffer.from('blocked'),
        })
        expect(ordinary.status).toBe(423)
        expect(await ordinary.json()).toMatchObject({ code: 'ACCOUNT_IMPORT_ACTIVE' })
        const flush = await client.fetch('/api/db/flush', { method: 'POST', headers: { cookie: await sessionCookie(client) } })
        expect(flush.status).toBe(503)
        expect(await flush.json()).toMatchObject({ code: 'STORAGE_RESET_IN_PROGRESS' })
        await unlink(path.join(gateDir, 'backup-import.apply.hold'))
        await reset
    })

    test('[new] c7 reset cancels pending timers, waits for an in-flight persist, and remains authoritative', { timeout: 20_000 }, async () => {
        gateDir = await mkdtemp(path.join(tmpdir(), 'e2-3-persist-reset-'))
        const trace = path.join(gateDir, 'trace.ndjson')
        server = await spawnServer({ env: {
            POCKETRISU_TEST_STORAGE_PERSIST_GATE_DIR: gateDir,
            POCKETRISU_TEST_STORAGE_RESET_GATE_DIR: gateDir,
            POCKETRISU_TEST_STORAGE_RESET_TRACE_FILE: trace,
        } })
        const client = await createClient(server.port, server.password)
        expect((await client.importBackup(createSeedBackup({ characterCount: 1 }))).ok).toBe(true)
        await writeFile(path.join(gateDir, 'db-persist.hold'), '')
        await writeFile(path.join(gateDir, 'backup-import.apply.hold'), '')
        const current = await client.fetch('/api/read', { headers: { 'file-path': DB_KEY_HEX } })
        const currentDb = utils.normalizeJSON(await utils.decodeRisuSave(Buffer.from(await current.arrayBuffer())))
        expect((await client.fetch('/api/patch', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'file-path': DB_KEY_HEX },
            body: JSON.stringify({
                patch: [{ op: 'add', path: '/e2C7', value: 'must not overwrite reset' }],
                expectedHash: utils.calculateHash(currentDb).toString(16),
            }),
        })).status).toBe(200)
        expect(await waitFor(path.join(gateDir, 'db-persist.entered'), 7_000), 'db persist entered').toBe(true)
        const reset = client.importBackup(createSeedBackup({ characterCount: 2 }))
        await new Promise(resolve => setTimeout(resolve, 100))
        expect(existsSync(path.join(gateDir, 'backup-import.apply.entered'))).toBe(false)
        await unlink(path.join(gateDir, 'db-persist.hold'))
        expect(await waitFor(path.join(gateDir, 'backup-import.apply.entered')), 'reset entered only after persist finished').toBe(true)
        await unlink(path.join(gateDir, 'backup-import.apply.hold'))
        expect((await reset).ok).toBe(true)
        await new Promise(resolve => setTimeout(resolve, 5_200))
        const after = await client.fetch('/api/read', { headers: { 'file-path': DB_KEY_HEX } })
        const db = utils.normalizeJSON(await utils.decodeRisuSave(Buffer.from(await after.arrayBuffer())))
        expect(db.characters).toHaveLength(2)
        expect(db.e2C7).toBeUndefined()
        const events = (await readFile(trace, 'utf8')).trim().split('\n').map(line => JSON.parse(line).event)
        expect(events).toContain('cancel-persistence-timers')
    })

    test('[new] r4 a database read during a held database removal cannot resurrect the pending save', { timeout: 30_000 }, async () => {
        gateDir = await mkdtemp(path.join(tmpdir(), 'e2-3-remove-read-'))
        restartable = await spawnRestartableServer({ env: {
            POCKETRISU_TEST_STORAGE_RESET_GATE_DIR: gateDir,
            POCKETRISU_TEST_STORAGE_PERSIST_GATE_DIR: gateDir,
        } })
        let client = await createClient(restartable.port, restartable.password)
        expect((await client.importBackup(createSeedBackup({ characterCount: 1 }))).ok).toBe(true)
        const current = await client.fetch('/api/read', { headers: { 'file-path': DB_KEY_HEX } })
        const currentDb = utils.normalizeJSON(await utils.decodeRisuSave(Buffer.from(await current.arrayBuffer())))
        expect((await client.fetch('/api/patch', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'file-path': DB_KEY_HEX },
            body: JSON.stringify({
                patch: [{ op: 'add', path: '/e2R4', value: 'must not come back' }],
                expectedHash: utils.calculateHash(currentDb).toString(16),
            }),
        })).status).toBe(200)
        await writeFile(path.join(gateDir, 'database-remove.apply.hold'), '')
        const removal = client.fetch('/api/remove', { headers: { 'file-path': DB_KEY_HEX } })
        removal.catch(() => {})
        expect(await waitFor(path.join(gateDir, 'database-remove.apply.entered'), 7_000), 'database-remove reset gate entered').toBe(true)
        // The native read flushes the pending save outside the storage queue;
        // the persist gate keeps that flush in flight while the reset runs.
        await writeFile(path.join(gateDir, 'db-persist.hold'), '')
        const during = client.fetch('/api/read', { headers: { 'file-path': DB_KEY_HEX } }).then(response => response.arrayBuffer())
        during.catch(() => {})
        expect(await waitFor(path.join(gateDir, 'db-persist.entered'), 3_000), 'read-triggered flush entered the persist gate').toBe(true)
        await unlink(path.join(gateDir, 'database-remove.apply.hold'))
        const removed = await Promise.race([removal, new Promise<null>(resolve => setTimeout(() => resolve(null), 2_000))])
        await unlink(path.join(gateDir, 'db-persist.hold')).catch(() => {})
        await during.catch(() => {})
        expect((removed ?? await removal).status).toBe(200)
        const empty = async () => {
            const response = await client.fetch('/api/read', { headers: { 'file-path': DB_KEY_HEX } })
            return { status: response.status, bytes: (await response.arrayBuffer()).byteLength }
        }
        expect(await empty(), 'database stays removed right after the reset').toEqual({ status: 200, bytes: 0 })
        await new Promise(resolve => setTimeout(resolve, 5_500))
        expect(await empty(), 'database stays removed after the debounce window').toEqual({ status: 200, bytes: 0 })
        await restartable.restart()
        client = await createClient(restartable.port, restartable.password)
        expect(await empty(), 'database stays removed after a restart').toEqual({ status: 200, bytes: 0 })
    })

    test('[new] r5 server restore with failed COMMIT and failed inlay reversal reports recovery-required on its stream', async () => {
        server = await spawnServer({ env: {
            POCKETRISU_TEST_STORAGE_RESET_FAILPOINT: 'reverse-inlay-rename',
            POCKETRISU_TEST_STORAGE_RESET_FAILPOINT_ON_ATTEMPT: '2',
        } })
        const client = await createClient(server.port, server.password)
        expect((await client.importBackup(createSeedBackup({ characterCount: 1 }))).ok).toBe(true)
        const dbKey = Buffer.from('database/database.bin').toString('hex')
        const cookie = await sessionCookie(client)
        const beforeFailure = Buffer.from(await (await client.fetch('/api/read', { headers: { 'file-path': dbKey } })).arrayBuffer())
        const fixture = encodeBackup([
            ...decodeBackup(createSeedBackup({ characterCount: 2 })),
            { name: 'inlay/recovery-fixture.png', data: Buffer.from('inlay replacement') },
            { name: 'inlay_sidecar/recovery-fixture', data: Buffer.from(JSON.stringify({ ext: 'png', name: 'recovery-fixture.png', type: 'image' })) },
        ])
        await writeFile(path.join(server.cwd, 'backups', 'risu-backup-1.bin'), fixture)
        const response = await postJson(client, '/api/backup/server/restore', { filename: 'risu-backup-1.bin' })
        expect(response.status).toBe(200)
        const lines = (await response.text()).trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
        const last = lines.at(-1)
        expect(last).toMatchObject({ type: 'error', code: 'STORAGE_RECOVERY_REQUIRED', retryable: false, recoveryPath: expect.any(String) })
        const stored = Buffer.from(await (await client.fetch('/api/read', { headers: { 'file-path': dbKey } })).arrayBuffer())
        expect(stored).toEqual(beforeFailure)
        const write = await client.fetch('/api/db/flush', { method: 'POST', headers: { cookie } })
        expect(write.status).toBe(503)
        expect(await write.json()).toMatchObject({ code: 'STORAGE_RECOVERY_REQUIRED', retryable: false })
    })

    test.each([
        ['/api/risu-account/prepare', 409],
        ['/api/risu-account/download', 409],
        ['/api/risu-account/cancel', 200],
        ['/api/risu-account/apply', 200],
    ])('[unchanged] u4 account-import exception route %s preserves its native response', async (route, expected) => {
        const { account, client } = await startDownloadedAccount()
        const response = await postJson(client, route, route.endsWith('/prepare') ? { token: account.token, id: account.id } : {})
        expect(response.status).toBe(expected)
    })

    test('[unchanged] u2 plugin storage round-trips and a smaller plugin list cannot erase installed plugins', async () => {
        server = await spawnServer()
        const client = await createClient(server.port, server.password)
        expect((await client.importBackup(createSeedBackup())).ok).toBe(true)
        const pluginKey = 'plugin-storage/e2-u2'
        const pluginValue = Buffer.from(JSON.stringify({ durable: true }))
        expect((await client.fetch('/api/write', {
            method: 'POST',
            headers: { 'content-type': 'application/octet-stream', 'file-path': Buffer.from(pluginKey).toString('hex') },
            body: pluginValue,
        })).status).toBe(200)
        const readPlugin = await client.fetch('/api/read', { headers: { 'file-path': Buffer.from(pluginKey).toString('hex') } })
        expect(readPlugin.status).toBe(200)
        expect(Buffer.from(await readPlugin.arrayBuffer())).toEqual(pluginValue)

        const read = await client.fetch('/api/read', { headers: { 'file-path': DB_KEY_HEX } })
        const db = utils.normalizeJSON(await utils.decodeRisuSave(Buffer.from(await read.arrayBuffer())))
        db.plugins = [{ name: 'kept-a', script: '// a' }, { name: 'kept-b', script: '// b' }]
        const first = await client.fetch('/api/write', {
            method: 'POST',
            headers: { 'content-type': 'application/octet-stream', 'file-path': DB_KEY_HEX, 'x-if-match': read.headers.get('x-db-etag')! },
            body: Buffer.from(utils.encodeRisuSaveLegacy(db)),
        })
        expect(first.status).toBe(200)
        const baseline = await client.fetch('/api/read', { headers: { 'file-path': DB_KEY_HEX } })
        const smaller = utils.normalizeJSON(await utils.decodeRisuSave(Buffer.from(await baseline.clone().arrayBuffer())))
        smaller.plugins = [smaller.plugins[0]]
        expect((await client.fetch('/api/write', {
            method: 'POST',
            headers: { 'content-type': 'application/octet-stream', 'file-path': DB_KEY_HEX, 'x-if-match': baseline.headers.get('x-db-etag')! },
            body: Buffer.from(utils.encodeRisuSaveLegacy(smaller)),
        })).status).toBe(200)
        const finalRead = await client.fetch('/api/read', { headers: { 'file-path': DB_KEY_HEX } })
        const finalDb = utils.normalizeJSON(await utils.decodeRisuSave(Buffer.from(await finalRead.arrayBuffer())))
        expect(finalDb.plugins.map((plugin: any) => plugin.name)).toEqual(['kept-a'])
        const pluginAfterShrink = await client.fetch('/api/read', { headers: { 'file-path': Buffer.from(pluginKey).toString('hex') } })
        expect(Buffer.from(await pluginAfterShrink.arrayBuffer())).toEqual(pluginValue)
    })

    test('[unchanged] u6 snapshot restore protects its source while the internal flush rotates snapshots', async () => {
        server = await spawnServer({ env: { POCKETRISU_BACKUP_INTERVAL_MS: '0' } })
        const client = await createClient(server.port, server.password)
        expect((await client.importBackup(createSeedBackup({ characterCount: 1 }))).ok).toBe(true)
        await new Promise(resolve => setTimeout(resolve, 5))
        expect((await client.importBackup(createSeedBackup({ characterCount: 2 }))).ok).toBe(true)
        const listed = await (await client.fetch('/api/db/snapshots')).json() as any
        expect(listed.snapshots.length).toBeGreaterThan(0)
        const source = listed.snapshots.at(-1).key
        expect((await client.fetch('/api/db/snapshots/limits', {
            method: 'PUT', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ maxCount: 2, maxBytes: 500 * 1024 * 1024 }),
        })).status).toBe(200)
        const live = await client.fetch('/api/read', { headers: { 'file-path': DB_KEY_HEX } })
        const liveDb = utils.normalizeJSON(await utils.decodeRisuSave(Buffer.from(await live.arrayBuffer())))
        liveDb.e2U6Pending = Date.now()
        expect((await client.fetch('/api/write', {
            method: 'POST',
            headers: { 'content-type': 'application/octet-stream', 'file-path': DB_KEY_HEX, 'x-if-match': live.headers.get('x-db-etag')! },
            body: Buffer.from(utils.encodeRisuSaveLegacy(liveDb)),
        })).status).toBe(200)
        const restored = await postJson(client, '/api/db/snapshots/restore', { key: source })
        expect(restored.status).toBe(200)
        expect(await restored.json()).toMatchObject({ ok: true })
    })
})
