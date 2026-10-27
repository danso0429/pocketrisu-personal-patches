import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { get } from 'svelte/store'
import {
    DB_KEY, FakeServer, Harness, createFakeXhrClass, createMemoryStores, decodeDb, encodeDb, md5,
    optionalImport, sleep, themePatch, type MemoryStores,
} from './startupCache.e2-3.helpers'

// The real start function (bootstrap.loadData) runs here over the real
// NodeStorage and AutoStorage; everything around them is replaced. The server
// is a scripted fake with real ETag semantics (md5 of the stored bytes).
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
const { fetchChatFromServer } = await import('./chatStorage')

function database(over: Record<string, unknown> = {}) {
    return {
        characters: [{
            chaId: 'cha-1', name: 'Alice', type: 'character', chatPage: 0,
            chats: [{ id: 'chat-1', name: 'First', _stub: true }],
        }],
        theme: 'dark', language: 'ko', didFirstSetup: true, formatversion: 6,
        characterOrder: [], modules: [], personas: [], mainPrompt: 'main',
        ...over,
    }
}

let cacheModule: any = null
let server: FakeServer
let stores: MemoryStores
let harness: Harness

beforeEach(async () => {
    cacheModule = await optionalImport<any>('./startupDatabaseCache')
    server = new FakeServer()
    stores = createMemoryStores()
    h.backups = []
    h.pluginHook = null
    harness = new Harness({ state: h as any, loadData, forageStorage, loadedStore, accountImportBlocking, NodeStorage, cacheModule })
    harness.install()
    // Nothing in these tests may reach a real network address.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})

afterEach(() => {
    harness.uninstall()
    vi.unstubAllGlobals()
})

const boot = (limits?: { maxPatches?: number, maxPatchBytes?: number }) => harness.boot({ server, stores, limits })
const dbWrites = <T extends { method: string, path: string, key: string | null }>(requests: T[]): T[] =>
    requests.filter(request => request.method === 'POST' && request.path === '/api/write' && request.key === DB_KEY)

async function cachedCopyOf(database_: unknown): Promise<string> {
    await server.setDatabase(database_)
    const etag = server.etag
    const first = await boot()
    expect(first.reads).toHaveLength(1)
    await harness.flushIdle()
    return etag
}

describe('[E2-3e] Rebuild client startup safety over native 1.16.1', () => {
    // ── start with the stored copy (e1, e1a-style journal, e1b, e4, e5) ─────
    test('[new] e1 the second start sends the stored validator and starts from the copy on 304; a 200 replaces the copy', async () => {
        expect(cacheModule, 'startupDatabaseCache module exists').not.toBeNull()
        await server.setDatabase(database())
        const etag1 = server.etag

        const first = await boot()
        expect(first.reads).toHaveLength(1)
        expect(first.reads[0].headers['if-none-match']).toBeUndefined()
        expect(first.reads[0].status).toBe(200)
        await harness.flushIdle()
        expect(stores.holdsEtag(etag1)).toBe(true)

        const second = await boot()
        expect(second.reads[0].headers['if-none-match']).toBe(etag1)
        expect(second.reads[0].status).toBe(304)
        expect(second.started).toEqual(await decodeDb(server.db!))

        await server.setDatabase(database({ theme: 'light' }))
        const etag2 = server.etag
        const third = await boot()
        expect(third.reads[0].headers['if-none-match']).toBe(etag1)
        expect(third.reads[0].status).toBe(200)
        expect(third.started).toEqual(await decodeDb(server.db!))
        await harness.flushIdle()
        expect(stores.raw?.etag).toBe(etag2)
        expect(stores.meta?.currentEtag).toBe(etag2)
    })

    test('[new] e1b a database written by another device is served as a 200 and replaces the stored copy', async () => {
        expect(cacheModule, 'startupDatabaseCache module exists').not.toBeNull()
        const etag1 = await cachedCopyOf(database())
        expect(stores.holdsEtag(etag1)).toBe(true)

        await server.setDatabase(database({ theme: 'light', characters: [] }))
        const etag2 = server.etag
        const result = await boot()
        expect(result.reads[0].headers['if-none-match']).toBe(etag1)
        expect(result.reads[0].status).toBe(200)
        expect(result.started).toEqual(await decodeDb(server.db!))
        await harness.flushIdle()
        expect(stores.raw?.etag).toBe(etag2)
        expect(stores.meta).toMatchObject({ baseEtag: etag2, currentEtag: etag2, patches: [] })
        expect(stores.record?.database).toEqual(await decodeDb(server.db!))
    })

    test('[new] e1 the stored raw bytes start the app when only the decoded copy is missing', async () => {
        expect(cacheModule, 'startupDatabaseCache module exists').not.toBeNull()
        const etag1 = await cachedCopyOf(database())
        stores.clearDecodedNow()

        const result = await boot()
        expect(result.reads).toHaveLength(1)
        expect(result.reads[0].headers['if-none-match']).toBe(etag1)
        expect(result.reads[0].status).toBe(304)
        expect(result.started).toEqual(await decodeDb(server.db!))
    })

    test('[new] e4 a start from the stored copy writes nothing, reads no backup and keeps theme and language', async () => {
        expect(cacheModule, 'startupDatabaseCache module exists').not.toBeNull()
        await cachedCopyOf(database())

        const result = await boot()
        expect(result.reads[0].status).toBe(304)
        expect(dbWrites(result.requests)).toHaveLength(0)
        expect(result.requests.some(request => request.key?.startsWith('database/dbbackup-'))).toBe(false)
        expect(h.themeCalls).toHaveLength(0)
        expect(h.languageCalls).toHaveLength(0)
        expect(result.started).toEqual(await decodeDb(server.db!))
        // The original order: sync baseline first, then the database is set.
        expect(h.events.indexOf('baseline')).toBeGreaterThanOrEqual(0)
        expect(h.events.indexOf('baseline')).toBeLessThan(h.events.indexOf('setDatabase'))
        expect(h.baselineCalls[0]).toEqual(result.started)
    })

    test('[unchanged] a cold start syncs the baseline before the database is set and reads the database once', async () => {
        await server.setDatabase(database())
        const result = await boot()
        expect(result.reads).toHaveLength(1)
        expect(h.events.indexOf('baseline')).toBeGreaterThanOrEqual(0)
        expect(h.events.indexOf('baseline')).toBeLessThan(h.events.indexOf('setDatabase'))
        expect(result.started).toEqual(await decodeDb(server.db!))
        expect(h.baselineCalls[0]).toEqual(result.started)
    })

    test('[new] e5 the first full write after a 304 start sends the 304 ETag as x-if-match', async () => {
        expect(cacheModule, 'startupDatabaseCache module exists').not.toBeNull()
        const etag1 = await cachedCopyOf(database())

        const result = await boot()
        expect(result.reads[0].status).toBe(304)
        const currentEtag = forageStorage.getDbEtag()
        expect(currentEtag).toBe(etag1)
        await forageStorage.setItem(DB_KEY, encodeDb(database({ theme: 'light' })), currentEtag ?? undefined)
        const writes = dbWrites(server.requests)
        expect(writes.at(-1)?.headers['x-if-match']).toBe(etag1)
        expect(writes.at(-1)?.status).toBe(200)
    })

    // ── e1c / e7 / e11: bad copies fall back, never start from them ───────────
    test('[new] e1c a stored copy that cannot be decoded is cleared and the server body is read without a validator', async () => {
        expect(cacheModule, 'startupDatabaseCache module exists').not.toBeNull()
        const etag1 = await cachedCopyOf(database())
        stores.record.database = 'broken'
        stores.raw = { etag: etag1, bytes: new TextEncoder().encode('not a database') }

        const result = await boot()
        expect(result.reads).toHaveLength(2)
        expect(result.reads[0].headers['if-none-match']).toBe(etag1)
        expect(result.reads[0].status).toBe(304)
        expect(result.reads[1].headers['if-none-match']).toBeUndefined()
        expect(result.reads[1].status).toBe(200)
        expect(result.started).toEqual(await decodeDb(server.db!))
        await harness.flushIdle()
        const rawIsGarbage = stores.raw !== null && md5(stores.raw.bytes ?? new Uint8Array()) !== etag1
        expect(rawIsGarbage).toBe(false)
    })

    test('[new] e1c a bad stored copy and a bad server body fall through to the backup order and store nothing', async () => {
        expect(cacheModule, 'startupDatabaseCache module exists').not.toBeNull()
        await cachedCopyOf(database())
        const garbage = new TextEncoder().encode('not a database either')
        server.setBytes(garbage)
        const garbageEtag = server.etag
        stores.raw = { etag: garbageEtag, bytes: garbage.slice() }
        stores.clearDecodedNow()
        const backup = database({ theme: 'backup-theme' })
        server.files.set('database/dbbackup-b1.bin', encodeDb(backup))
        h.backups = ['b1']

        const result = await boot()
        expect(result.reads[0].headers['if-none-match']).toBe(garbageEtag)
        expect(result.reads[0].status).toBe(304)
        expect(result.requests.some(request => request.key === 'database/dbbackup-b1.bin')).toBe(true)
        expect(result.started).toEqual(backup)
        await harness.flushIdle()
        expect(stores.isEmpty()).toBe(true)
    })

    test('[new] e11 a start that ends on a backup clears the stored copy and stores no baseline', async () => {
        expect(cacheModule, 'startupDatabaseCache module exists').not.toBeNull()
        const etag1 = await cachedCopyOf(database())
        expect(stores.holdsEtag(etag1)).toBe(true)
        server.setBytes(new TextEncoder().encode('the server database is damaged'))
        const backup = database({ theme: 'backup-theme' })
        server.files.set('database/dbbackup-b1.bin', encodeDb(backup))
        h.backups = ['b1']

        const first = await boot()
        expect(first.reads[0].headers['if-none-match']).toBe(etag1)
        expect(first.reads[0].status).toBe(200)
        expect(first.started).toEqual(backup)
        await harness.flushIdle()
        expect(stores.isEmpty()).toBe(true)

        const second = await boot()
        expect(second.started).toEqual(backup)
        await harness.flushIdle()
        expect(stores.isEmpty()).toBe(true)
    })

    test('[new] e7 a 304 whose stored journal cannot be replayed clears the copy and reads again without a validator', async () => {
        expect(cacheModule, 'startupDatabaseCache module exists').not.toBeNull()
        await cachedCopyOf(database())
        const first = await boot()
        // The server accepts a patch the stored baseline cannot take
        // (character 5 does not exist there) and moves to a new database.
        server.nextPatchDatabase = database({ theme: 'after-patch' })
        const result = await first.storage.patchItem(DB_KEY, { patch: [{ op: 'replace', path: '/characters/5/name', value: 'x' }], expectedHash: 'unused' })
        expect(result.success).toBe(true)
        await sleep(50)
        const patchedEtag = server.etag

        const second = await boot()
        expect(second.reads).toHaveLength(2)
        expect(second.reads[0].headers['if-none-match']).toBe(patchedEtag)
        expect(second.reads[0].status).toBe(304)
        expect(second.reads[1].headers['if-none-match']).toBeUndefined()
        expect(second.reads[1].status).toBe(200)
        expect(second.started).toEqual(await decodeDb(server.db!))
        await harness.flushIdle()
        expect(stores.raw?.etag).toBe(patchedEtag)
    })

    test('[new] e7 a 304 whose stored raw bytes are gone clears the copy and reads again without a validator', async () => {
        expect(cacheModule, 'startupDatabaseCache module exists').not.toBeNull()
        const etag1 = await cachedCopyOf(database())
        stores.clearDecodedNow()
        stores.raw = { etag: etag1, bytes: null }

        const result = await boot()
        expect(result.reads).toHaveLength(2)
        expect(result.reads[0].headers['if-none-match']).toBe(etag1)
        expect(result.reads[0].status).toBe(304)
        expect(result.reads[1].headers['if-none-match']).toBeUndefined()
        expect(result.started).toEqual(await decodeDb(server.db!))
        await harness.flushIdle()
        expect(stores.raw?.bytes).not.toBeNull()
    })

    // ── e13 / e1e / e12: unchanged startup behaviour ──────────────────────────
    test('[unchanged] e1e a first start with no database on the server creates an empty one like the original', async () => {
        const result = await boot()
        const writes = dbWrites(result.requests)
        expect(writes).toHaveLength(1)
        expect(writes[0].headers['x-if-match']).toBeUndefined()
        expect(await decodeDb(writes[0].body as Uint8Array)).toEqual({})
        expect(result.started).toEqual({})
        expect(h.themeCalls).toEqual([[0, false]])
        expect(result.requests.some(request => request.key?.startsWith('database/dbbackup-'))).toBe(false)
    })

    test('[unchanged] e13 a stored copy does not stop a start from creating an empty database when the server has none', async () => {
        stores.raw = { etag: 'stale-etag', bytes: encodeDb(database()) }
        const result = await boot()
        expect(dbWrites(result.requests)).toHaveLength(1)
        expect(result.started).toEqual({})
        expect(h.themeCalls).toEqual([[0, false]])
    })

    test('[unchanged] e12 an account import in progress blocks the start before the database is read', async () => {
        await server.setDatabase(database())
        stores.raw = { etag: server.etag, bytes: server.db!.slice() }
        server.accountBlocking = true

        const result = await boot()
        expect(get(accountImportBlocking)).toBe(true)
        expect(result.reads).toHaveLength(0)
        expect(dbWrites(result.requests)).toHaveLength(0)
        expect(h.setDatabaseCalls).toHaveLength(0)
    })

    // ── idle storing of the copy (design: re-decoded bytes, cancelled by writes) ──
    test('[new] the copy stored at idle is the received server bytes decoded again, not the live database', async () => {
        expect(cacheModule, 'startupDatabaseCache module exists').not.toBeNull()
        await server.setDatabase(database())
        const etag1 = server.etag
        const bytes = server.db!.slice()

        const result = await boot()
        // The app keeps changing the live object before the idle work runs.
        h.db.theme = 'live-change'
        h.db.characters[0].name = 'live-change'
        await harness.flushIdle()
        expect(stores.raw?.etag).toBe(etag1)
        expect(Array.from(stores.raw?.bytes ?? [])).toEqual(Array.from(bytes))
        expect(stores.record?.database).toEqual(await decodeDb(bytes))
        expect(stores.record?.database.theme).toBe('dark')
        expect(result.started.theme).toBe('dark')
    })

    test('[new] a database write before the idle work keeps the start copy from being stored', async () => {
        expect(cacheModule, 'startupDatabaseCache module exists').not.toBeNull()
        await server.setDatabase(database())
        const etag1 = server.etag
        // Control: with no write the copy is stored.
        await boot()
        await harness.flushIdle()
        expect(stores.holdsEtag(etag1)).toBe(true)
        stores.raw = null
        stores.clearDecodedNow()

        const result = await boot()
        await result.storage.setItem(DB_KEY, encodeDb(database({ theme: 'written' })), result.storage._lastDbEtag ?? undefined)
        await harness.flushIdle()
        expect(stores.holdsEtag(etag1)).toBe(false)
    })

    test('[new] a patch write before the idle work keeps the start copy from being stored', async () => {
        expect(cacheModule, 'startupDatabaseCache module exists').not.toBeNull()
        await server.setDatabase(database())
        const etag1 = server.etag
        await boot()
        await harness.flushIdle()
        expect(stores.holdsEtag(etag1)).toBe(true)
        stores.raw = null
        stores.clearDecodedNow()

        const result = await boot()
        const patched = await result.storage.patchItem(DB_KEY, themePatch(1))
        expect(patched.success).toBe(true)
        await harness.flushIdle()
        expect(stores.holdsEtag(etag1)).toBe(false)
    })

    test('[new] an invalidation before the idle work keeps the start copy from being stored', async () => {
        expect(cacheModule, 'startupDatabaseCache module exists').not.toBeNull()
        await server.setDatabase(database())
        const etag1 = server.etag
        await boot()
        await harness.flushIdle()
        expect(stores.holdsEtag(etag1)).toBe(true)
        stores.raw = null
        stores.clearDecodedNow()

        const result = await boot()
        await result.storage.invalidateStartupDatabaseCache()
        await harness.flushIdle()
        expect(stores.isEmpty()).toBe(true)
    })

    // ── journal chain (e6, Argon 8-11) ────────────────────────────────────────
    test('[new] e6 patches within the journal count limit are replayed on 304; one more drops the journal', async () => {
        expect(cacheModule, 'startupDatabaseCache module exists').not.toBeNull()
        const limits = { maxPatches: 2 }
        await server.setDatabase(database())
        const first = await boot(limits)
        await harness.flushIdle()
        for (const index of [1, 2]) expect((await first.storage.patchItem(DB_KEY, themePatch(index))).success).toBe(true)
        await sleep(50)

        const second = await boot(limits)
        expect(second.reads[0].headers['if-none-match']).toBe(server.etag)
        expect(second.reads[0].status).toBe(304)
        expect(second.started).toEqual(await decodeDb(server.db!))
        expect(second.started.theme).toBe('t-002')

        expect((await second.storage.patchItem(DB_KEY, themePatch(3))).success).toBe(true)
        await sleep(50)
        const third = await boot(limits)
        expect(third.reads.at(-1)?.status).toBe(200)
        expect(third.started).toEqual(await decodeDb(server.db!))
        expect(third.started.theme).toBe('t-003')
        await harness.flushIdle()
        expect(stores.raw?.etag).toBe(server.etag)
    })

    test('[new] e6 patches within the journal byte limit are replayed on 304; the patch past it drops the journal', async () => {
        expect(cacheModule, 'startupDatabaseCache module exists').not.toBeNull()
        const patchBytes = JSON.stringify(themePatch(1).patch).length
        const limits = { maxPatchBytes: patchBytes * 2 }
        await server.setDatabase(database())
        const first = await boot(limits)
        await harness.flushIdle()
        for (const index of [1, 2]) expect((await first.storage.patchItem(DB_KEY, themePatch(index))).success).toBe(true)
        await sleep(50)

        const second = await boot(limits)
        expect(second.reads[0].status).toBe(304)
        expect(second.started.theme).toBe('t-002')
        expect((await second.storage.patchItem(DB_KEY, themePatch(3))).success).toBe(true)
        await sleep(50)

        const third = await boot(limits)
        expect(third.reads.at(-1)?.status).toBe(200)
        expect(third.started).toEqual(await decodeDb(server.db!))
        expect(third.started.theme).toBe('t-003')
    })

    test('[new] e6 a patch whose previous ETag is not the journal end drops the journal, so an unseen change is not lost', async () => {
        expect(cacheModule, 'startupDatabaseCache module exists').not.toBeNull()
        await server.setDatabase(database())
        const first = await boot()
        await harness.flushIdle()
        // Another device changes the database; this client rebases onto it.
        await server.setDatabase(database({ language: 'en' }))
        first.storage.setDbEtag(server.etag)
        const patched = await first.storage.patchItem(DB_KEY, themePatch(1))
        expect(patched.success).toBe(true)
        await sleep(50)

        const second = await boot()
        expect(second.started).toEqual(await decodeDb(server.db!))
        expect(second.started.language).toBe('en')
        expect(second.started.theme).toBe('t-001')
        await harness.flushIdle()
        expect(stores.holdsEtag(server.etag)).toBe(true)
    })

    test('[new] e6 a patch result without a new ETag drops the journal, so a later patch is not replayed alone', async () => {
        expect(cacheModule, 'startupDatabaseCache module exists').not.toBeNull()
        await server.setDatabase(database())
        const first = await boot()
        await harness.flushIdle()
        server.omitEtagNextPatch = true
        expect((await first.storage.patchItem(DB_KEY, { patch: [{ op: 'replace', path: '/language', value: 'en' }], expectedHash: 'unused' })).success).toBe(true)
        expect((await first.storage.patchItem(DB_KEY, themePatch(1))).success).toBe(true)
        await sleep(50)

        const second = await boot()
        expect(second.started).toEqual(await decodeDb(server.db!))
        expect(second.started.language).toBe('en')
        expect(second.started.theme).toBe('t-001')
        await harness.flushIdle()
        expect(stores.holdsEtag(server.etag)).toBe(true)
    })

    test('[new] e6 a full write between patches drops the journal, so the written database is what starts', async () => {
        expect(cacheModule, 'startupDatabaseCache module exists').not.toBeNull()
        await server.setDatabase(database())
        const first = await boot()
        await harness.flushIdle()
        expect((await first.storage.patchItem(DB_KEY, themePatch(1))).success).toBe(true)
        await first.storage.setItem(DB_KEY, encodeDb(database({ language: 'full-write', theme: 'full-write' })), first.storage._lastDbEtag ?? undefined)
        expect((await first.storage.patchItem(DB_KEY, { patch: [{ op: 'replace', path: '/mainPrompt', value: 'after' }], expectedHash: 'unused' })).success).toBe(true)
        await sleep(50)

        const second = await boot()
        expect(second.started).toEqual(await decodeDb(server.db!))
        expect(second.started.language).toBe('full-write')
        expect(second.started.mainPrompt).toBe('after')
        await harness.flushIdle()
        expect(stores.holdsEtag(server.etag)).toBe(true)
    })

    // ── e1d: whole-database replacements ──────────────────────────────────────
    const replacements: Array<[string, (storage: any) => Promise<unknown>]> = [
        ['importBackup', storage => storage.importBackup(new Blob(['backup']))],
        ['restoreServerBackup', storage => storage.restoreServerBackup('backup.bin')],
        ['uploadSaveFolderZip', storage => storage.uploadSaveFolderZip(new Blob(['zip']))],
        ['executeSaveFolderImport', storage => storage.executeSaveFolderImport('/import/folder')],
        ['applyRisuAccountImport', storage => storage.applyRisuAccountImport()],
    ]
    test.each(replacements)('[new] e1d %s empties the stored copy before it resolves and the next start does not use the old copy', async (_name, replace) => {
        expect(cacheModule, 'startupDatabaseCache module exists').not.toBeNull()
        vi.stubGlobal('XMLHttpRequest', createFakeXhrClass(server))
        const etag1 = await cachedCopyOf(database())
        expect(stores.holdsEtag(etag1)).toBe(true)
        const replaced = database({ theme: 'replaced', characters: [] })
        server.onReplace = () => { void server.setDatabase(replaced) }
        stores.clearDelayMs = 40

        const first = await boot()
        await replace(first.storage)
        expect(server.etag).not.toBe(etag1)
        // Nothing may be left to remove after the call resolved.
        expect(stores.isEmpty()).toBe(true)

        stores.clearDelayMs = 0
        const second = await boot()
        expect(second.reads[0].headers['if-none-match']).toBeUndefined()
        expect(second.started).toEqual(await decodeDb(server.db!))
        expect(second.started.theme).toBe('replaced')
    })

    // ── e2 / e2a: plugins load after stubs became placeholders ─────────────────
    function installPluginProbe() {
        const seen: Array<{ slot: any, read: any, writeRefused: boolean }> = []
        h.pluginHook = async () => {
            const slot = h.db.characters[0].chats[0]
            // What the v3 plugin API does for this slot: an unopened chat
            // (placeholder) is answered with the server copy and its write-back
            // is refused; any other slot is handed out as it is.
            const read = slot._placeholder
                ? await fetchChatFromServer('cha-1', 0, slot.id)
                : structuredClone(slot)
            seen.push({ slot: structuredClone(slot), read, writeRefused: slot._placeholder === true })
        }
        server.chats.set('cha-1/0', encodeDb({
            id: 'chat-1', name: 'First', fmIndex: -1, note: '', localLore: [],
            message: [{ role: 'user', data: 'Hello' }, { role: 'char', data: 'World' }],
        }))
        return seen
    }

    function expectProtectedPlaceholder(entry: { slot: any, writeRefused: boolean }) {
        expect(entry.slot._placeholder).toBe(true)
        expect(entry.slot._stub).toBeUndefined()
        expect(entry.slot.message).toEqual([])
        expect(entry.writeRefused).toBe(true)
    }
    const messagesOf = (entry: { read: any }) => entry.read?.message?.map((message: any) => message.data)

    test('[new] e2 a plugin loaded at start sees the stub chat as a protected placeholder', async () => {
        const seen = installPluginProbe()
        await server.setDatabase(database())
        await boot()
        expect(h.events.indexOf('loadPlugins')).toBeGreaterThan(h.events.indexOf('setDatabase'))
        expect(seen).toHaveLength(1)
        expectProtectedPlaceholder(seen[0])
    })

    test('[new] e2a a plugin reading a chat while plugins load receives the server copy with its messages', async () => {
        const seen = installPluginProbe()
        await server.setDatabase(database())
        await boot()
        expect(seen).toHaveLength(1)
        expect(messagesOf(seen[0])).toEqual(['Hello', 'World'])
    })

    test('[new] e2 e2a the same holds when the start is served from the stored copy', async () => {
        expect(cacheModule, 'startupDatabaseCache module exists').not.toBeNull()
        const seen = installPluginProbe()
        await server.setDatabase(database())
        await boot()
        await harness.flushIdle()
        const warm = await boot()
        expect(warm.reads[0].status).toBe(304)
        expect(seen).toHaveLength(2)
        expectProtectedPlaceholder(seen[1])
        expect(messagesOf(seen[1])).toEqual(['Hello', 'World'])
    })

    // ── writer session helper and the 423 event (e3, e3a, e3b, e14) ────────────
    function listenDeactivated() {
        const details: any[] = []
        const listener = (event: Event) => { details.push((event as CustomEvent).detail) }
        window.addEventListener('risu-session-deactivated', listener)
        return { details, stop: () => window.removeEventListener('risu-session-deactivated', listener) }
    }

    test('[new] e3 the writer-session helper headers equal the headers of an ordinary write', async () => {
        const writer = await optionalImport<any>('./writerSession')
        expect(writer, 'writerSession helper exists').not.toBeNull()
        window.dispatchEvent(new Event('pointerdown'))
        const storage = harness.createStorage(server.fetch, null)
        await server.setDatabase(database())
        await storage.setItem(DB_KEY, encodeDb(database({ theme: 'written' })))
        const sent = dbWrites(server.requests).at(-1)!.headers
        const helperHeaders = writer.writerSessionHeaders()
        expect(helperHeaders['x-session-id']).toBeTruthy()
        for (const [name, value] of Object.entries(helperHeaders)) expect(sent[name]).toBe(value)
        expect(sent['x-session-id']).toBe(writer.writerSessionId)
    })

    test('[unchanged] e3a a write answered 423 fires one risu-session-deactivated event with detail { code }; other statuses fire none', async () => {
        const events = listenDeactivated()
        try {
            const storage = harness.createStorage(server.fetch, null)
            server.writeStatus.push({ status: 423, body: { code: 'ACCOUNT_IMPORT_ACTIVE' } })
            await expect(storage.setItem(DB_KEY, new Uint8Array([1]))).rejects.toBeTruthy()
            expect(events.details).toEqual([{ code: 'ACCOUNT_IMPORT_ACTIVE' }])

            events.details.length = 0
            server.writeStatus.push({ status: 500, body: { error: 'boom' } })
            await expect(storage.setItem(DB_KEY, new Uint8Array([1]))).rejects.toBeTruthy()
            server.writeStatus.push({ status: 409, body: { error: 'conflict', currentEtag: 'x' } })
            await expect(storage.setItem(DB_KEY, new Uint8Array([1]))).rejects.toBeTruthy()
            expect(events.details).toEqual([])
        } finally {
            events.stop()
        }
    })

    test('[new] e3b the helper and the NodeStorage path send the same one event with the response body code', async () => {
        const writer = await optionalImport<any>('./writerSession')
        expect(writer, 'writerSession helper exists').not.toBeNull()
        const events = listenDeactivated()
        try {
            const storage = harness.createStorage(server.fetch, null)
            server.writeStatus.push({ status: 423, body: { code: 'OTHER_WRITER_ACTIVE' } })
            await expect(storage.setItem(DB_KEY, new Uint8Array([1]))).rejects.toBeTruthy()
            const viaStorage = events.details.splice(0)
            expect(viaStorage).toEqual([{ code: 'OTHER_WRITER_ACTIVE' }])

            const locked = new Response(JSON.stringify({ code: 'OTHER_WRITER_ACTIVE' }), { status: 423 })
            await writer.notifySessionDeactivated(locked)
            expect(events.details.splice(0)).toEqual(viaStorage)
            // The caller can still read the body it passed in.
            expect(await locked.json()).toEqual({ code: 'OTHER_WRITER_ACTIVE' })

            await writer.notifySessionDeactivated(new Response(JSON.stringify({ code: 'OTHER_WRITER_ACTIVE' }), { status: 409 }))
            expect(events.details).toEqual([])

            await expect(writer.notifySessionDeactivated(new Response('not json', { status: 423 }))).resolves.not.toThrow()
            expect(events.details).toHaveLength(1)
        } finally {
            events.stop()
        }
    })

    test('[new] e14 every write path and the helper send the same session id when sessionStorage is unavailable', async () => {
        const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
        Object.defineProperty(globalThis, 'sessionStorage', {
            configurable: true,
            get() { throw new DOMException('denied', 'SecurityError') },
        })
        try {
            vi.resetModules()
            const writer = await optionalImport<any>('./writerSession')
            expect(writer, 'writerSession helper exists').not.toBeNull()
            const { NodeStorage: FreshNodeStorage } = await import('./nodeStorage')
            vi.stubGlobal('XMLHttpRequest', createFakeXhrClass(server))
            await server.setDatabase(database())
            const FreshClass = FreshNodeStorage as any
            FreshClass.sessionInitialized = true
            const storage = new FreshClass(server.fetch, { baseDelayMs: 0, delay: async () => {}, random: () => 1 })
            storage.authChecked = true
            storage.createAuth = async () => 'token'

            await storage.setItem(DB_KEY, encodeDb(database({ theme: 'written' })))
            await storage.patchItem(DB_KEY, themePatch(1))
            await storage.restoreServerBackup('backup.bin')
            await storage.importBackup(new Blob(['backup']))
            await storage.uploadSaveFolderZip(new Blob(['zip']))
            const sessionIds = server.requests
                .filter(request => request.method !== 'GET')
                .map(request => request.headers['x-session-id'])
            expect(sessionIds.length).toBeGreaterThanOrEqual(6)
            sessionIds.push(storage.getSessionId(), writer.writerSessionHeaders()['x-session-id'])

            const id = writer.writerSessionId
            expect(typeof id).toBe('string')
            expect(id.length).toBeGreaterThan(0)
            expect(new Set(sessionIds)).toEqual(new Set([id]))
        } finally {
            if (descriptor) Object.defineProperty(globalThis, 'sessionStorage', descriptor)
            else delete (globalThis as any).sessionStorage
        }
    })
})
