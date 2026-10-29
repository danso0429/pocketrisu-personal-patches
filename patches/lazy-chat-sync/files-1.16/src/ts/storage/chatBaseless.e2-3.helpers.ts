import { vi } from 'vitest'

const pluginHost = () => (globalThis as any).__d6PluginHost as { api: any }

export const delay = (ms = 10) => new Promise(resolve => setTimeout(resolve, ms))

export async function waitFor(check: () => boolean, label: string, timeout = 5000) {
    const until = Date.now() + timeout
    while (!check()) {
        if (Date.now() >= until) throw new Error(`Timed out waiting for ${label}`)
        await delay()
    }
}

export function deferred<T = void>() {
    let resolve!: (value: T | PromiseLike<T>) => void
    const promise = new Promise<T>(done => { resolve = done })
    return { promise, resolve }
}

export const message = (chatId: any, data: string, role = 'user') => ({ chatId, role, data })
export const ids = (chat: any) => (chat?.message ?? []).map((entry: any) => entry.chatId)
export const placeholder = (id: string) => ({ id, name: 'placeholder', fmIndex: -1, message: [], _placeholder: true })
export const character = (chaId: string, chats: any[], chatPage = 0) => ({
    chaId, name: chaId, chatPage, chatFolders: [], reloadKeys: 0, chats,
})

export type ChatRequest = {
    ordinal: number
    method: 'GET' | 'POST'
    chaId: string
    chatId: string
    index: number
    headers: Record<string, string>
    sent?: any
    status?: number
}

export const activeEnvironments = new Set<{ dispose: () => Promise<void> }>()

export async function publicEnv(
    serverChats: Record<string, any | null>,
    characters: any[],
    options: { delta?: boolean } = {},
) {
    vi.resetModules()
    pluginHost().api = null
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
    })))
    ;(globalThis as any).__PATCH_SYNC__ = true
    Object.defineProperty(window, 'BroadcastChannel', { value: undefined, configurable: true, writable: true })

    const api = await import('../globalApi.svelte') as any
    const stores = await import('../stores.svelte') as any
    const storageModule = await import('./nodeStorage')
    const chatStorage = await import('./chatStorage')
    const fingerprints = await import('./chatFingerprint')
    const codec = (await import('../../../server/node/utils.cjs')).default
    const { createHash } = await import('node:crypto')
    const zlib = await import('node:zlib')

    const bodies = new Map<string, any>()
    for (const [key, chat] of Object.entries(serverChats)) if (chat) bodies.set(key, structuredClone(chat))
    const requests: ChatRequest[] = []
    const gates = new Map<string, ReturnType<typeof deferred>>()
    let requestOrdinal = 0
    let postHandler: ((request: ChatRequest) => Promise<Response | null> | Response | null) | null = null
    let patchHandler: ((call: number) => Promise<Response> | Response) | null = null
    let writeHandler: ((call: number) => Promise<Response> | Response) | null = null
    let readDatabase: Uint8Array | null = null
    let patchCalls = 0
    let writeCalls = 0
    const listeners: Array<{ target: EventTarget, type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions }> = []
    const restoreAddEventListener = [window, document].map((target) => {
        const own = Object.getOwnPropertyDescriptor(target, 'addEventListener')
        const original = target.addEventListener
        Object.defineProperty(target, 'addEventListener', {
            configurable: true,
            writable: true,
            value(type: string, listener: EventListenerOrEventListenerObject, listenerOptions?: boolean | AddEventListenerOptions) {
                listeners.push({ target, type, listener, options: listenerOptions })
                return original.call(target, type, listener, listenerOptions)
            },
        })
        return () => own ? Object.defineProperty(target, 'addEventListener', own) : delete (target as any).addEventListener
    })

    const revisionOf = (chat: unknown) => createHash('sha256')
        .update(Buffer.from(codec.encodeRisuSaveLegacy(chat))).digest('hex')
    const json = (status: number, body: unknown = {}, headers: Record<string, string> = {}) =>
        new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
    const lowerHeaders = (init: RequestInit) => Object.fromEntries(
        Object.entries((init.headers ?? {}) as Record<string, string>).map(([key, value]) => [key.toLowerCase(), String(value)]),
    )
    const waitAtGate = async (request: ChatRequest) => {
        const exact = `${request.method}:${request.chatId}:${request.ordinal}`
        const broad = `${request.method}:${request.chatId}`
        const gate = gates.get(exact) ?? gates.get(broad)
        if (gate) {
            gates.delete(exact)
            gates.delete(broad)
            await gate.promise
        }
    }

    const storage = new storageModule.NodeStorage({ invalidate: vi.fn() } as any)
    ;(storage as any).chatDeltaSupported = options.delta === true
    ;(storage as any).authFetch = vi.fn(async (url: string, init: RequestInit = {}) => {
        const path = String(url)
        if (path === '/api/patch') {
            patchCalls++
            return patchHandler ? patchHandler(patchCalls) : json(200, { etag: `patch-${patchCalls}` })
        }
        if (path === '/api/write') {
            writeCalls++
            return writeHandler ? writeHandler(writeCalls) : json(200, { etag: `write-${writeCalls}` })
        }
        if (path === '/api/read') return new Response(readDatabase?.slice().buffer ?? new Uint8Array(), {
            status: 200,
            headers: readDatabase ? { 'x-db-etag': 'foreign-etag' } : {},
        })
        if (!path.startsWith('/api/chat-content/')) return json(404)
        const parts = path.split('?')[0].split('/')
        const chaId = decodeURIComponent(parts[3])
        const index = Number(parts[4])
        const headers = lowerHeaders(init)
        const chatId = headers['x-chat-id'] ?? stores.DBState.db.characters
            .find((entry: any) => entry?.chaId === chaId)?.chats?.[index]?.id ?? ''
        const key = `${chaId}|${chatId}`
        const method = init.method === 'POST' ? 'POST' : 'GET'
        const request: ChatRequest = { ordinal: ++requestOrdinal, method, chaId, chatId, index, headers }
        requests.push(request)

        if (method === 'GET') {
            await waitAtGate(request)
            const current = bodies.get(key)
            if (!current) {
                request.status = 404
                return json(404)
            }
            request.status = 200
            return new Response(new Uint8Array(codec.encodeRisuSaveLegacy(current)).buffer, {
                status: 200,
                headers: { 'x-chat-revision': revisionOf(current) },
            })
        }

        let bytes = Buffer.from(init.body as Uint8Array)
        if (headers['content-encoding'] === 'gzip') bytes = zlib.gunzipSync(bytes)
        request.sent = await codec.decodeRisuSave(bytes)
        await waitAtGate(request)
        if (postHandler) {
            const overridden = await postHandler(request)
            if (overridden) {
                request.status = overridden.status
                return overridden
            }
        }
        const current = bodies.get(key)
        const respond = (status: number, body: unknown = {}, extra: Record<string, string> = {}) => {
            request.status = status
            return json(status, body, extra)
        }
        if (headers['if-none-match'] === '*') {
            if (current) return respond(412)
        } else if (current) {
            const base = headers['x-chat-base-revision']
            if (base === undefined) return respond(428)
            if (base !== revisionOf(current)) return respond(409, { currentRevision: revisionOf(current) })
        } else if (headers['x-chat-base-revision'] !== undefined) {
            return respond(409)
        }
        let next = request.sent
        if (headers['x-chat-base-count'] !== undefined && current) {
            const count = Number(headers['x-chat-base-count'])
            const known = fingerprints.messageFingerprints(current.message ?? [])
            if (known.length < count || fingerprints.prefixFingerprint(known, count) !== headers['x-chat-base-fp']) {
                return respond(409, { code: 'CHAT_DELTA_BASE_MISMATCH' })
            }
            next = { ...request.sent, message: current.message.slice(0, count).concat(request.sent.message ?? []) }
        }
        bodies.set(key, structuredClone(next))
        return respond(200, {}, { 'x-chat-revision': revisionOf(next) })
    })

    api.forageStorage.realStorage = storage
    stores.DBState.db = { characters, botPresets: [], modules: [], plugins: [], pluginCustomStorage: {} }
    stores.selectedCharID.set(0)

    const env = {
        api, stores, storage, chatStorage, requests,
        chat(chaId: string, chatId: string) { return bodies.get(`${chaId}|${chatId}`) },
        putChat(chaId: string, chatId: string, chat: any) { bodies.set(`${chaId}|${chatId}`, structuredClone(chat)) },
        deleteChat(chaId: string, chatId: string) { bodies.delete(`${chaId}|${chatId}`) },
        hold(method: 'GET' | 'POST', chatId: string, ordinal?: number) {
            const gate = deferred()
            gates.set(ordinal ? `${method}:${chatId}:${ordinal}` : `${method}:${chatId}`, gate)
            return gate
        },
        setPostHandler(handler: typeof postHandler) { postHandler = handler },
        setPatchHandler(handler: typeof patchHandler) { patchHandler = handler },
        setWriteHandler(handler: typeof writeHandler) { writeHandler = handler },
        setReadDatabase(db: any) { readDatabase = new Uint8Array(codec.encodeRisuSaveLegacy(db)) },
        patchCallCount: () => patchCalls,
        writeCallCount: () => writeCalls,
        async dispose() {
            for (const gate of gates.values()) gate.resolve(undefined)
            window.dispatchEvent(new CustomEvent('risu-session-deactivated'))
            await api.flushSaves()
            for (const restore of restoreAddEventListener) restore()
            for (const item of listeners) item.target.removeEventListener(item.type, item.listener, item.options)
            await delay(0)
        },
    }
    activeEnvironments.add(env)
    return env
}

export async function hydrate(env: Awaited<ReturnType<typeof publicEnv>>, chaId: string, index: number) {
    const char = env.stores.DBState.db.characters.find((entry: any) => entry.chaId === chaId)
    await env.chatStorage.ensureChatHydrated(char.chats, index, chaId)
    return char.chats[index]
}

export async function installPlugin(name: string) {
    const v3 = await import('../plugins/apiV3/v3.svelte')
    await v3.executePluginV3({ name, script: '' } as any)
    return pluginHost().api
}

