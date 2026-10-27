import fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import utilsPackage from '../../../server/node/utils.cjs'
import { spawnServer, type ServerHandle } from '../../../test/compat/helpers/spawnServer'
import { createClient, type RisuClient } from '../../../test/compat/helpers/client'
import { encodeBackup } from '../../../test/compat/helpers/encode'
import {
    DB_KEY, Harness, createMemoryStores, createNodeFetch, decodeDb, fromHexKey, hexKey, optionalImport, sleep,
    type MemoryStores, type RecordedRequest,
} from './startupCache.e2-3.helpers'

// Server-backed rows: the real server.cjs (own temp save folder, free
// loopback port, NODE_ENV=test) supplies the ETags and patch semantics. The
// client side is the real start function over the real NodeStorage. Every
// request goes through a node:http fetch bound to that server, so no other
// address is reachable.
const utils = utilsPackage as any

const h = vi.hoisted(() => ({
    db: null as any,
    dbState: { db: null as any },
    setDatabaseCalls: [] as any[],
    baselineCalls: [] as any[],
    events: [] as string[],
    themeCalls: [] as any[],
    languageCalls: [] as string[],
    backups: [] as string[],
    alerts: [] as any[],
    pluginHook: null as null | (() => Promise<void> | void),
}))

vi.mock('../characterArchive', () => ({ migrateLegacyTrash: vi.fn() }))
vi.mock('../util', () => ({ changeFullscreen: vi.fn(), checkNullish: (value: unknown) => value === undefined || value === null }))
vi.mock('../viewportHeight', () => ({ installDynamicViewportHeight: vi.fn() }))
vi.mock('./database.svelte', () => ({
    appVer: 'test',
    nodeOnlyVer: 'test',
    normalizeChat: (chat: any) => chat,
    defaultSdDataFunc: () => ({}),
    changeToThemePreset: (...args: any[]) => { h.themeCalls.push(args) },
    isChatStub: (chat: any) => chat?._stub === true && !Array.isArray(chat?.message),
    purgeUnsupportedGroupChats: () => 0,
    getDatabase: () => h.db,
    setDatabase: (db: any) => {
        h.setDatabaseCalls.push(structuredClone(db))
        h.events.push('setDatabase')
        db.characters ??= []
        h.db = db
        h.dbState.db = db
    },
}))
vi.mock('./chatDraft', () => ({ chatDraftKey: (chaId: string, chatId: string) => `${chaId}:${chatId}`, sweepOrphanDrafts: vi.fn() }))
vi.mock('./defaultPrompts', () => ({ defaultJailbreak: 'dj', defaultMainPrompt: 'dm', oldJailbreak: 'oj', oldMainPrompt: 'om' }))
vi.mock('../update', () => ({ checkRisuUpdate: vi.fn() }))
vi.mock('../publicStats', () => ({ fetchPublicStats: vi.fn() }))
vi.mock('../stores.svelte', async () => {
    const { writable } = await import('svelte/store')
    return {
        MobileGUI: writable(false),
        botMakerMode: writable(false),
        selectedCharID: writable(-1),
        loadedStore: writable(false),
        bootBackupPromptStore: writable(null),
        accountImportBlocking: writable(false),
        DBState: h.dbState,
        LoadingStatusState: { text: '' },
    }
})
vi.mock('../transferSize', () => ({ recordDbTransferSize: vi.fn() }))
vi.mock('../plugins/plugins.svelte', () => ({
    loadPlugins: async () => {
        h.events.push('loadPlugins')
        await h.pluginHook?.()
    },
}))
vi.mock('../alert', () => ({
    alertError: (error: unknown) => { h.alerts.push(error) },
    alertMd: vi.fn(), waitAlert: vi.fn(), alertConfirm: vi.fn(async () => false), alertInput: vi.fn(), notifyError: vi.fn(),
}))
vi.mock('../characterCards', () => ({ characterURLImport: vi.fn() }))
vi.mock('./risuSave', async () => {
    const { default: codec } = await import('../../../server/node/utils.cjs')
    return { encodeRisuSaveLegacy: codec.encodeRisuSaveLegacy, decodeRisuSave: codec.decodeRisuSave }
})
vi.mock('../gui/animation', () => ({ updateAnimationSpeed: vi.fn() }))
vi.mock('../gui/colorscheme', () => ({ updateColorScheme: vi.fn(), updateTextThemeAndCSS: vi.fn() }))
vi.mock('src/lang', () => {
    const deep = (): any => new Proxy(function () {}, { get: () => deep(), apply: () => '' })
    return {
        applyEarlyLanguage: vi.fn(),
        changeLanguage: (language: string) => { h.languageCalls.push(language) },
        language: deep(),
    }
})
vi.mock('../observer.svelte', () => ({ startObserveDom: vi.fn() }))
vi.mock('../gui/guisize', () => ({ updateGuisize: vi.fn() }))
vi.mock('../characters', () => ({ changeChar: vi.fn(), updateLorebooks: (value: unknown) => value }))
vi.mock('../hotkey', () => ({ initMobileGesture: vi.fn() }))
vi.mock('../process/modules', () => ({ moduleUpdate: vi.fn() }))
vi.mock('../model/modellist', () => ({ registerModelDynamic: vi.fn() }))
vi.mock('../process/request/jobRecovery', () => ({ initModelJobRecovery: vi.fn() }))
vi.mock('../globalApi.svelte', async () => {
    const { AutoStorage } = await import('./autoStorage')
    return {
        forageStorage: new AutoStorage(),
        setPatchSyncBaseline: (data: any) => { h.events.push('baseline'); h.baselineCalls.push(structuredClone(data)) },
        getDbBackups: async () => h.backups,
        saveDb: vi.fn(),
        checkCharOrder: vi.fn(),
    }
})

const { loadData } = await import('../bootstrap')
const { forageStorage } = await import('../globalApi.svelte')
const { loadedStore, accountImportBlocking } = await import('../stores.svelte')
const { NodeStorage } = await import('./nodeStorage')

function seedDatabase(over: Record<string, unknown> = {}) {
    return {
        apiType: 'openai',
        characters: [{
            chaId: 'cha-1', name: 'Alice', type: 'character', chatPage: 0, firstMessage: 'Hello',
            chats: [{
                id: 'chat-1', name: 'First', fmIndex: -1, note: '', localLore: [], lastDate: 1,
                message: [{ role: 'user', data: 'Hi', time: 1 }, { role: 'char', data: 'Hello', time: 2 }],
            }],
        }],
        personas: [{ id: 'persona-1', name: 'Default', personaPrompt: '', icon: '' }],
        modules: [{ id: 'm1', name: 'Pack', assets: [['a.png', 'assets/a', 'png']] }],
        theme: 'dark', language: 'ko', didFirstSetup: true, formatversion: 6, characterOrder: [], mainPrompt: 'main',
        ...over,
    }
}

let srv: ServerHandle
let client: RisuClient
const requests: RecordedRequest[] = []
const recordingFetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(String(input), `http://127.0.0.1:${srv.port}`)
    const headers: Record<string, string> = {}
    new Headers(init.headers).forEach((value, key) => { headers[key.toLowerCase()] = value })
    const record: RecordedRequest = {
        method: (init.method ?? 'GET').toUpperCase(),
        path: url.pathname,
        key: headers['file-path'] ? fromHexKey(headers['file-path']) : null,
        headers,
        status: 0,
        body: init.body,
    }
    requests.push(record)
    const response = await fetch(input, init)
    record.status = response.status
    return response
}
const server = { fetch: recordingFetch, requests }

let stores: MemoryStores
let harness: Harness
let cacheModule: any = null

// One server per test: a second import over a first one is not what these
// rows exercise, and a fresh server keeps every ETag history independent.
beforeEach(async () => {
    srv = await spawnServer({ env: { POCKETRISU_BACKUP_INTERVAL_MS: '0' } })
    vi.stubGlobal('fetch', createNodeFetch(`http://127.0.0.1:${srv.port}`))
    client = await createClient(srv.port, srv.password)
    cacheModule = await optionalImport<any>('./startupDatabaseCache')
    stores = createMemoryStores()
    requests.length = 0
    h.backups = []
    h.pluginHook = null
    harness = new Harness({ state: h as any, loadData, forageStorage, loadedStore, accountImportBlocking, NodeStorage, cacheModule })
    harness.authToken = client.token
    harness.install()
}, 30_000)

afterEach(async () => {
    harness.uninstall()
    vi.unstubAllGlobals()
    await srv?.cleanup()
})

async function seed(over: Record<string, unknown> = {}) {
    const bin = encodeBackup([{ name: 'database.risudat', data: Buffer.from(utils.encodeRisuSaveLegacy(seedDatabase(over))) }])
    const imported = await client.importBackup(bin)
    expect(imported.ok).toBe(true)
}

async function readServer() {
    const response = await client.fetch('/api/read', { headers: { 'file-path': hexKey(DB_KEY) } })
    expect(response.status).toBe(200)
    const bytes = new Uint8Array(await response.arrayBuffer())
    const database = await decodeDb(bytes)
    return {
        etag: response.headers.get('x-db-etag') as string,
        database,
        hash: utils.calculateHash(utils.normalizeJSON(structuredClone(database))).toString(16) as string,
    }
}

async function otherDevicePatch(patch: unknown[]) {
    const current = await readServer()
    const response = await client.fetch('/api/patch', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'file-path': hexKey(DB_KEY) },
        body: JSON.stringify({ patch, expectedHash: current.hash }),
    })
    expect(response.status).toBe(200)
}

async function appPatch(storage: any, patch: unknown[]) {
    const current = await readServer()
    const result = await storage.patchItem(DB_KEY, { patch, expectedHash: current.hash })
    expect(result.success).toBe(true)
    return result
}

// The page-load registration of the writer session (what the app does once
// after login): without it the server treats this session as older than the
// seed import and refuses its writes with 423.
async function registerSession(storage: any) {
    const response = await client.fetch('/api/session', { method: 'POST', headers: { 'x-session-id': storage.getSessionId() } })
    expect(response.ok).toBe(true)
}
const boot = () => harness.boot({ server, stores, beforeLoad: registerSession })

describe('[E2-3e] Rebuild client startup safety over native 1.16.1', () => {
    test('[new] e1a several patch writes after a start are replayed from the stored copy: the next start gets 304 and the server database', async () => {
        expect(cacheModule, 'startupDatabaseCache module exists').not.toBeNull()
        await seed()
        const first = await boot()
        await harness.flushIdle()
        for (const index of [1, 2, 3]) {
            await appPatch(first.storage, [{ op: 'replace', path: '/theme', value: `theme-${index}` }])
        }
        await sleep(80)
        const serverNow = await readServer()

        const second = await boot()
        expect(second.reads[0].headers['if-none-match']).toBe(serverNow.etag)
        expect(second.reads[0].status).toBe(304)
        expect(second.started).toEqual(serverNow.database)
        expect(second.started.theme).toBe('theme-3')
    })

    test('[new] e9 a patch after a 409 rebase leaves the next start on the server database, not the stored baseline plus that patch', async () => {
        expect(cacheModule, 'startupDatabaseCache module exists').not.toBeNull()
        await seed()
        const first = await boot()
        await harness.flushIdle()
        const staleHash = (await readServer()).hash
        await otherDevicePatch([{ op: 'replace', path: '/language', value: 'en' }])
        const otherEtag = (await readServer()).etag

        const rejected = await first.storage.patchItem(DB_KEY, { patch: [{ op: 'replace', path: '/theme', value: 'mine' }], expectedHash: staleHash })
        expect(rejected.success).toBe(false)
        expect(rejected.etag).toBe(otherEtag)
        // The rebase of the save path: adopt the server ETag, read the latest, write on it.
        first.storage.setDbEtag(rejected.etag)
        await first.storage.getItem(DB_KEY)
        await appPatch(first.storage, [{ op: 'replace', path: '/theme', value: 'mine' }])
        await sleep(80)

        const serverNow = await readServer()
        const second = await boot()
        expect(second.started).toEqual(serverNow.database)
        expect(second.started.language).toBe('en')
        expect(second.started.theme).toBe('mine')
        await harness.flushIdle()
        expect(stores.holdsEtag(serverNow.etag)).toBe(true)
    })

    test('[new] e1f a full write after a 409 rebase leaves the next start on the server database', async () => {
        expect(cacheModule, 'startupDatabaseCache module exists').not.toBeNull()
        await seed()
        const first = await boot()
        await harness.flushIdle()
        const staleHash = (await readServer()).hash
        await otherDevicePatch([{ op: 'replace', path: '/language', value: 'en' }])

        const rejected = await first.storage.patchItem(DB_KEY, { patch: [{ op: 'replace', path: '/theme', value: 'mine' }], expectedHash: staleHash })
        expect(rejected.success).toBe(false)
        first.storage.setDbEtag(rejected.etag)
        const latest = await decodeDb(await first.storage.getItem(DB_KEY))
        latest.theme = 'full-write'
        await first.storage.setItem(DB_KEY, new Uint8Array(utils.encodeRisuSaveLegacy(latest)), first.storage._lastDbEtag ?? undefined)
        await sleep(80)

        const serverNow = await readServer()
        expect(serverNow.database.theme).toBe('full-write')
        const second = await boot()
        expect(second.started).toEqual(serverNow.database)
        expect(second.started.language).toBe('en')
        await harness.flushIdle()
        expect(stores.holdsEtag(serverNow.etag)).toBe(true)
    })

    test('[new] e8 a patch after an asset manifest edit leaves the next start on the server database', async () => {
        expect(cacheModule, 'startupDatabaseCache module exists').not.toBeNull()
        await seed()
        const first = await boot()
        await harness.flushIdle()
        const descriptor = (await readServer()).database.modules[0].assetManifest
        expect(descriptor?.id).toBeTruthy()
        await first.storage.editAssetManifest('module', 'm1', descriptor.id, [{ type: 'append', item: ['b.png', 'assets/b', 'png'] }])
        await appPatch(first.storage, [{ op: 'replace', path: '/theme', value: 'after-manifest' }])
        await sleep(80)

        const serverNow = await readServer()
        expect(serverNow.database.modules[0].assetManifest.count).toBe(2)
        const second = await boot()
        expect(second.started).toEqual(serverNow.database)
        expect(second.started.modules[0].assetManifest.count).toBe(2)
        expect(second.started.theme).toBe('after-manifest')
        await harness.flushIdle()
        expect(stores.holdsEtag(serverNow.etag)).toBe(true)
    })

    test('[new] e10 after a snapshot restore the next start uses the restored database, not the copy from before', async () => {
        expect(cacheModule, 'startupDatabaseCache module exists').not.toBeNull()
        await seed({ theme: 'first' })
        const first = await boot()
        expect(first.started.theme).toBe('first')
        await harness.flushIdle()
        expect(stores.holdsEtag((await readServer()).etag)).toBe(true)

        await otherDevicePatch([{ op: 'replace', path: '/theme', value: 'second' }])
        await otherDevicePatch([{ op: 'replace', path: '/theme', value: 'third' }])
        await sleep(100)
        const live = await readServer()
        expect(live.database.theme).toBe('third')

        const listed = await (await client.fetch('/api/db/snapshots')).json() as { snapshots: Array<{ key: string }> }
        expect(listed.snapshots.length).toBeGreaterThan(0)
        let restoredTheme = 'third'
        for (const snapshot of listed.snapshots) {
            const response = await client.fetch('/api/db/snapshots/restore', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ key: snapshot.key }),
            })
            expect(response.status).toBe(200)
            restoredTheme = (await readServer()).database.theme
            if (restoredTheme !== 'third') break
        }
        expect(restoredTheme).not.toBe('third')

        const serverNow = await readServer()
        const second = await boot()
        expect(second.started).toEqual(serverNow.database)
        expect(second.started.theme).toBe(restoredTheme)
        await harness.flushIdle()
        expect(stores.holdsEtag(serverNow.etag)).toBe(true)
    })

    test('[new] e10 the snapshot restore call site drops the stored startup copy', () => {
        const source = fs.readFileSync('src/lib/Setting/Pages/SystemBackup.svelte', 'utf8')
        const start = source.indexOf('async function restoreSnapshot')
        expect(start).toBeGreaterThanOrEqual(0)
        const end = source.indexOf('// ── Snapshot limits', start)
        const restoreFunction = source.slice(start, end > start ? end : undefined)
        const restoreCall = restoreFunction.indexOf('/api/db/snapshots/restore')
        const invalidation = restoreFunction.indexOf('invalidateStartupDatabaseCache')
        expect(restoreCall).toBeGreaterThanOrEqual(0)
        expect(invalidation).toBeGreaterThan(restoreCall)
        expect(invalidation).toBeLessThan(restoreFunction.indexOf('location.reload'))
    })
})
