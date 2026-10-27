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

const utilsPkg = require('../../server/node/utils.cjs') as any
const utils = utilsPkg.default ?? utilsPkg
const DB_KEY_HEX = Buffer.from('database/database.bin').toString('hex')

let server: ServerHandle | undefined
let gateDir: string | undefined
let closeFake: (() => Promise<void>) | undefined

afterEach(async () => {
    await server?.cleanup()
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
        } })
        const client = await createClient(server.port, server.password)
        const cookie = await sessionCookie(client)
        const dbKey = Buffer.from('database/database.bin').toString('hex')
        const before = await client.fetch('/api/read', { headers: { 'file-path': dbKey } })
        const beforeBytes = Buffer.from(await before.arrayBuffer())
        const prepared = await postJson(client, '/api/backup/import/prepare', { size: createSeedBackup({ characterCount: 2 }).byteLength })
        expect(prepared.status).toBe(200)
        const failed = await client.fetch('/api/backup/import', {
            method: 'POST', headers: { 'content-type': 'application/x-risu-backup' }, body: new Uint8Array(createSeedBackup({ characterCount: 2 })),
        })
        expect(failed.ok).toBe(false)
        expect(failed.status).toBeGreaterThanOrEqual(400)
        const after = await client.fetch('/api/read', { headers: { 'file-path': dbKey } })
        expect(Buffer.from(await after.arrayBuffer())).toEqual(beforeBytes)
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
