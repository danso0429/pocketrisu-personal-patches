// Test support for the E2-3e startup cache tests: in-memory cache stores, a
// scripted fake server with real ETag semantics, a fake XMLHttpRequest and a
// harness that runs the real `loadData` start function. No test lives here.
import http from 'node:http'
import { createHash } from 'node:crypto'
import { applyPatch } from 'fast-json-patch'
import utilsPackage from '../../../server/node/utils.cjs'

export const DB_KEY = 'database/database.bin'
export const hexKey = (key: string) => Buffer.from(key, 'utf-8').toString('hex')
export const fromHexKey = (hex: string) => Buffer.from(hex, 'hex').toString('utf-8')
export const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
export const md5 = (bytes: Uint8Array) => createHash('md5').update(bytes).digest('hex')

const codec = utilsPackage as any
export const encodeDb = (database: unknown): Uint8Array => new Uint8Array(codec.encodeRisuSaveLegacy(database))
export const decodeDb = async (bytes: Uint8Array): Promise<any> => await codec.decodeRisuSave(Buffer.from(bytes))

export async function optionalImport<T>(path: string): Promise<T | null> {
    try {
        return await import(/* @vite-ignore */ path) as T
    } catch {
        return null
    }
}

// ── Node HTTP fetch ──────────────────────────────────────────────────────────
// The page environment's own fetch keeps an HTTP cache and would answer a
// repeated GET from it; server-backed tests need every request to reach the
// server, so they use this plain node:http implementation.
export function createNodeFetch(base: string) {
    return (input: RequestInfo | URL, init: RequestInit = {}) => new Promise<Response>((resolve, reject) => {
        const url = new URL(String(input), base)
        const headers: Record<string, string> = {}
        new Headers(init.headers).forEach((value, key) => { headers[key] = value })
        const body = init.body === undefined || init.body === null
            ? null
            : typeof init.body === 'string' ? Buffer.from(init.body) : Buffer.from(init.body as Uint8Array)
        if (body) headers['content-length'] = String(body.byteLength)
        const request = http.request(url, { method: init.method ?? 'GET', headers }, response => {
            const chunks: Buffer[] = []
            response.on('data', chunk => chunks.push(chunk))
            response.on('error', reject)
            response.on('end', () => {
                const status = response.statusCode ?? 0
                const responseHeaders = new Headers()
                for (const [name, value] of Object.entries(response.headers)) {
                    if (value !== undefined) responseHeaders.set(name, Array.isArray(value) ? value.join(', ') : value)
                }
                const bodyless = status === 204 || status === 205 || status === 304
                resolve(new Response(bodyless ? null : new Uint8Array(Buffer.concat(chunks)), { status, headers: responseHeaders }))
            })
        })
        request.on('error', error => reject(new TypeError('fetch failed', { cause: error })))
        if (body) request.write(body)
        request.end()
    })
}

// ── In-memory cache stores ───────────────────────────────────────────────────

export interface MemoryStores {
    raw: { etag: string, bytes: Uint8Array | null } | null
    record: any
    meta: any
    /** Every clear() waits this long before it takes effect. */
    clearDelayMs: number
    namespace: { value: string }
    rawStore: any
    decodedStore: any
    isEmpty(): boolean
    clearDecodedNow(): void
    holdsEtag(etag: string): boolean
}

export function createMemoryStores(): MemoryStores {
    const stores: MemoryStores = {
        raw: null,
        record: null,
        meta: null,
        clearDelayMs: 0,
        namespace: { value: '' },
        rawStore: null,
        decodedStore: null,
        isEmpty: () => !stores.raw && !stores.record && !stores.meta,
        clearDecodedNow: () => { stores.record = null; stores.meta = null },
        holdsEtag: (etag: string) => stores.raw?.etag === etag
            || stores.meta?.currentEtag === etag
            || stores.meta?.baseEtag === etag
            || stores.record?.baseEtag === etag,
    }
    stores.rawStore = {
        readMetadata: async () => stores.raw && stores.raw.etag
            ? { namespace: stores.namespace.value, etag: stores.raw.etag }
            : null,
        readBytes: async (etag: string) => stores.raw && stores.raw.etag === etag && stores.raw.bytes
            ? stores.raw.bytes.slice()
            : null,
        write: async (etag: string, bytes: Uint8Array) => { stores.raw = { etag, bytes: bytes.slice() }; return true },
        clear: async () => {
            if (stores.clearDelayMs) await sleep(stores.clearDelayMs)
            stores.raw = null
        },
    }
    stores.decodedStore = {
        readMeta: async () => stores.meta ? structuredClone(stores.meta) : null,
        readRecord: async () => stores.record ? structuredClone(stores.record) : null,
        writeBaseline: async (record: any, meta: any) => {
            stores.record = structuredClone(record)
            stores.meta = structuredClone(meta)
            return true
        },
        writeMeta: async (meta: any) => { stores.meta = structuredClone(meta); return true },
        clear: async () => {
            if (stores.clearDelayMs) await sleep(stores.clearDelayMs)
            stores.record = null
            stores.meta = null
        },
    }
    return stores
}

// ── Fake server ──────────────────────────────────────────────────────────────

export interface RecordedRequest {
    method: string
    path: string
    key: string | null
    headers: Record<string, string>
    status: number
    body: any
}

export class FakeServer {
    db: Uint8Array | null = null
    files = new Map<string, Uint8Array>()
    chats = new Map<string, Uint8Array>()
    accountBlocking = false
    requests: RecordedRequest[] = []
    /** Called by every endpoint that replaces the whole database. */
    onReplace: (() => void) | null = null
    /** Next /api/patch answers 409 with this ETag (and applies nothing). */
    conflictNextPatch: string | null = null
    /** Next /api/patch result omits the ETag. */
    omitEtagNextPatch = false
    /** Next /api/patch sets the server database to this object instead of applying the patch. */
    nextPatchDatabase: any = null
    /** Status for the next /api/write (default 200). */
    writeStatus: Array<{ status: number, body: any }> = []
    private counter = 0

    get etag(): string {
        return this.db ? md5(this.db) : ''
    }

    async setDatabase(database: any): Promise<string> {
        this.db = encodeDb(database)
        return this.etag
    }

    setBytes(bytes: Uint8Array | null) {
        this.db = bytes ? bytes.slice() : null
    }

    async database(): Promise<any> {
        return this.db ? await decodeDb(this.db) : null
    }

    readRequests(): RecordedRequest[] {
        return this.requests.filter(request => request.method === 'GET' && request.path === '/api/read' && request.key === DB_KEY)
    }

    fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
        const url = new URL(String(input), 'http://fake.invalid')
        const method = (init.method ?? 'GET').toUpperCase()
        const headers: Record<string, string> = {}
        new Headers(init.headers).forEach((value, key) => { headers[key.toLowerCase()] = value })
        const record: RecordedRequest = {
            method,
            path: url.pathname,
            key: headers['file-path'] ? fromHexKey(headers['file-path']) : null,
            headers,
            status: 0,
            body: init.body,
        }
        this.requests.push(record)
        const response = await this.route(record, init)
        record.status = response.status
        return response
    }

    private json(status: number, body: unknown): Response {
        return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
    }

    private async route(request: RecordedRequest, init: RequestInit): Promise<Response> {
        const { method, path, key } = request
        if (method === 'GET' && path === '/api/read') {
            if (key === DB_KEY) {
                if (!this.db) return new Response(new Uint8Array(0), { status: 200 })
                const etag = this.etag
                if (request.headers['if-none-match'] && request.headers['if-none-match'] === etag) {
                    return new Response(null, { status: 304, headers: { 'x-db-etag': etag } })
                }
                return new Response(this.db.slice(), { status: 200, headers: { 'x-db-etag': etag } })
            }
            const file = key ? this.files.get(key) : undefined
            if (!file) return new Response('missing', { status: 404 })
            return new Response(file.slice(), { status: 200 })
        }
        if (method === 'GET' && path === '/api/risu-account/status') return this.json(200, { blocking: this.accountBlocking })
        if (method === 'GET' && path.startsWith('/api/chat-content/')) {
            const [, , , chaId, index] = path.split('/')
            const chat = this.chats.get(`${decodeURIComponent(chaId)}/${index}`)
            if (!chat) return new Response('missing', { status: 404 })
            return new Response(chat.slice(), { status: 200, headers: { 'x-chat-revision': 'rev-1' } })
        }
        if (method === 'POST' && path === '/api/write' && key === DB_KEY) {
            const scripted = this.writeStatus.shift()
            if (scripted) return this.json(scripted.status, scripted.body)
            const ifMatch = request.headers['x-if-match']
            if (ifMatch && ifMatch !== this.etag) return this.json(409, { error: 'etag mismatch', currentEtag: this.etag })
            this.db = new Uint8Array(init.body as Uint8Array).slice()
            return this.json(200, { success: true, etag: this.etag })
        }
        if (method === 'POST' && path === '/api/patch' && key === DB_KEY) {
            if (this.conflictNextPatch) {
                const currentEtag = this.conflictNextPatch
                this.conflictNextPatch = null
                return this.json(409, { error: 'Hash mismatch - data out of sync', code: 'HASH_MISMATCH', currentEtag })
            }
            if (this.nextPatchDatabase) {
                await this.setDatabase(this.nextPatchDatabase)
                this.nextPatchDatabase = null
            } else {
                const body = JSON.parse(String(init.body))
                const database = await this.database()
                applyPatch(database, body.patch)
                await this.setDatabase(database)
            }
            if (this.omitEtagNextPatch) {
                this.omitEtagNextPatch = false
                return this.json(200, { success: true })
            }
            return this.json(200, { success: true, etag: this.etag })
        }
        if (method === 'POST' && path === '/api/backup/import/prepare') return this.json(200, {})
        if (method === 'POST' && path === '/api/backup/server/restore') {
            this.onReplace?.()
            return new Response('{"type":"done","ok":true,"assetsRestored":0}\n', { status: 200 })
        }
        if (method === 'POST' && path === '/api/migrate/save-folder/execute') {
            this.onReplace?.()
            return this.json(200, { ok: true, imported: 1 })
        }
        if (method === 'POST' && path === '/api/risu-account/apply') {
            this.onReplace?.()
            return this.json(200, {})
        }
        return this.json(404, { error: `unscripted ${method} ${path}` })
    }

    /** Backing for the fake XMLHttpRequest. */
    handleXhr(method: string, path: string, headers: Record<string, string>): { status: number, text: string } {
        this.requests.push({ method, path, key: null, headers, status: 200, body: null })
        if (path === '/api/backup/import') {
            this.onReplace?.()
            return { status: 200, text: '{"type":"done","ok":true,"assetsRestored":0}\n' }
        }
        if (path === '/api/migrate/save-folder/upload') {
            this.onReplace?.()
            return { status: 200, text: '{"ok":true,"imported":1}' }
        }
        return { status: 404, text: '{}' }
    }
}

export function createFakeXhrClass(server: FakeServer) {
    return class FakeXhr {
        method = ''
        url = ''
        headers: Record<string, string> = {}
        status = 0
        responseText = ''
        upload: any = { onprogress: null, onload: null }
        onprogress: any = null
        onerror: any = null
        onload: any = null
        open(method: string, url: string) { this.method = method; this.url = url }
        setRequestHeader(name: string, value: string) { this.headers[name.toLowerCase()] = value }
        send() {
            setTimeout(() => {
                const result = server.handleXhr(this.method, this.url, this.headers)
                this.status = result.status
                this.responseText = result.text
                this.upload.onload?.()
                this.onload?.()
            }, 0)
        }
    }
}

// ── Boot harness ─────────────────────────────────────────────────────────────

export interface BootState {
    db: any
    dbState: { db: any }
    setDatabaseCalls: any[]
    baselineCalls: any[]
    events: string[]
    themeCalls: any[]
    languageCalls: string[]
    backups: string[]
    alerts: any[]
    pluginHook: null | (() => Promise<void> | void)
}

export function createBootState(): BootState {
    return {
        db: null,
        dbState: { db: null },
        setDatabaseCalls: [],
        baselineCalls: [],
        events: [],
        themeCalls: [],
        languageCalls: [],
        backups: [],
        alerts: [],
        pluginHook: null,
    }
}

export interface HarnessDeps {
    state: BootState
    loadData: () => Promise<void>
    forageStorage: any
    loadedStore: { set(value: boolean): void }
    accountImportBlocking: { set(value: boolean): void, subscribe: any }
    NodeStorage: any
    cacheModule: any | null
}

export interface BootResult {
    storage: any
    cache: any | null
    started: any
    requests: RecordedRequest[]
    reads: RecordedRequest[]
    state: BootState
}

export class Harness {
    idleQueue: Array<() => void> = []
    longTimers: Array<ReturnType<typeof setTimeout>> = []
    private restoreHooks: Array<() => void> = []
    /** Value createAuth() returns (a real server needs its login token). */
    authToken = 'token'

    constructor(readonly deps: HarnessDeps) {}

    /** Installs the idle-callback queue and a guard that remembers long timers. */
    install() {
        const realSetTimeout = globalThis.setTimeout
        const queue = this.idleQueue
        const long = this.longTimers
        ;(globalThis as any).requestIdleCallback = (callback: () => void) => { queue.push(callback); return queue.length }
        ;(globalThis as any).cancelIdleCallback = (id: number) => { queue[id - 1] = () => {} }
        ;(globalThis as any).setTimeout = ((fn: any, ms?: number, ...args: any[]) => {
            const id = realSetTimeout(fn, ms, ...args)
            if ((ms ?? 0) >= 1000) long.push(id)
            return id
        }) as any
        this.restoreHooks.push(() => { globalThis.setTimeout = realSetTimeout })
    }

    uninstall() {
        for (const id of this.longTimers) clearTimeout(id)
        this.longTimers.length = 0
        this.idleQueue.length = 0
        delete (globalThis as any).requestIdleCallback
        delete (globalThis as any).cancelIdleCallback
        for (const restore of this.restoreHooks.splice(0)) restore()
    }

    /** Runs every queued idle callback, then lets pending store writes finish. */
    async flushIdle(settleMs = 50) {
        const queued = this.idleQueue.splice(0)
        for (const callback of queued) {
            try { callback() } catch { /* a cancelled callback may throw */ }
        }
        await sleep(settleMs)
    }

    createCache(stores: MemoryStores, limits?: { maxPatches?: number, maxPatchBytes?: number }) {
        if (!this.deps.cacheModule) return null
        const cache = new this.deps.cacheModule.StartupDatabaseCache({
            appVersion: 'test',
            schemaEpoch: 'schema-1',
            rawStore: stores.rawStore,
            decodedStore: stores.decodedStore,
            ...(limits ? { limits } : {}),
        })
        stores.namespace.value = cache.namespace
        return cache
    }

    createStorage(fetchFn: any, cache: any | null) {
        const { NodeStorage } = this.deps
        NodeStorage.sessionInitialized = true
        NodeStorage.sessionPending = null
        const storage = new NodeStorage(fetchFn, { baseDelayMs: 0, delay: async () => {}, random: () => 1 }, cache ?? undefined)
        if (cache) storage.startupDatabaseCache = cache
        storage.authChecked = true
        storage.createAuth = async () => this.authToken
        return storage
    }

    /** One application start (a page load) over the given server and stores. */
    async boot(options: {
        server: { fetch: any, requests: RecordedRequest[] }
        stores: MemoryStores
        limits?: { maxPatches?: number, maxPatchBytes?: number }
        /** Runs after the storage exists and before the start function (a page-load registration). */
        beforeLoad?: (storage: any) => Promise<void>
    }): Promise<BootResult> {
        const { state, loadData, forageStorage, loadedStore, accountImportBlocking } = this.deps
        state.db = null
        state.dbState.db = null
        state.setDatabaseCalls.length = 0
        state.baselineCalls.length = 0
        state.events.length = 0
        state.themeCalls.length = 0
        state.languageCalls.length = 0
        state.alerts.length = 0
        const cache = this.createCache(options.stores, options.limits)
        const storage = this.createStorage(options.server.fetch, cache)
        forageStorage.realStorage = storage
        await options.beforeLoad?.(storage)
        loadedStore.set(false)
        accountImportBlocking.set(false)
        const first = options.server.requests.length
        await loadData()
        const requests = options.server.requests.slice(first)
        return {
            storage,
            cache,
            started: state.setDatabaseCalls[0],
            requests,
            reads: requests.filter(request => request.method === 'GET' && request.path === '/api/read' && request.key === DB_KEY),
            state,
        }
    }
}

/** n patches, each replacing /theme with a value of equal length. */
export function themePatch(index: number) {
    return { patch: [{ op: 'replace', path: '/theme', value: `t-${String(index).padStart(3, '0')}` }], expectedHash: 'unused' }
}
