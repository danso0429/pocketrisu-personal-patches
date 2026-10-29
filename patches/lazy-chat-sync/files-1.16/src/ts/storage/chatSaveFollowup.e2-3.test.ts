import { afterEach, describe, expect, test, vi } from 'vitest'

vi.setConfig({ testTimeout: 60_000 })

const pluginHost = vi.hoisted(() => ({ api: null as any }))
const activeEnvironments = new Set<{ dispose: () => Promise<void> }>()

vi.mock('../process/modules', () => ({ moduleUpdate: vi.fn(), getModuleLorebooks: vi.fn(() => []) }))
vi.mock('../plugins/apiV3/factory', () => ({
    SandboxHost: class {
        constructor(api: any) { pluginHost.api = api }
        run() {}
        terminate() {}
    },
}))

afterEach(async () => {
    for (const env of activeEnvironments) await env.dispose()
    activeEnvironments.clear()
    pluginHost.api = null
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    vi.resetModules()
})

const delay = (ms = 20) => new Promise(resolve => setTimeout(resolve, ms))

async function waitFor(check: () => boolean, label: string, timeout = 3000) {
    const until = Date.now() + timeout
    while (!check()) {
        if (Date.now() >= until) throw new Error(`Timed out waiting for ${label}`)
        await delay(10)
    }
}

function deferred() {
    let resolve!: () => void
    const promise = new Promise<void>(done => { resolve = done })
    return { promise, resolve }
}

const message = (id: string, data: string, role = 'user') => ({ chatId: id, role, data })
const ids = (chat: any) => (chat?.message ?? []).map((entry: any) => entry.chatId)
const placeholder = (id: string) => ({ id, name: 'placeholder', message: [], _placeholder: true })

type ChatRequest = {
    method: 'GET' | 'POST'
    chaId: string
    chatId: string
    index: number
    headers: Record<string, string>
    sent?: any
    status?: number
}

async function publicEnv(
    serverChats: Record<string, any | null>,
    characters?: any[],
) {
    vi.resetModules()
    pluginHost.api = null
    const boundaryRequests: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
        boundaryRequests.push(input instanceof Request ? input.url : String(input))
        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
    }))
    ;(globalThis as any).__PATCH_SYNC__ = true
    // Each test represents one browser tab. Do not let save loops from prior
    // module instances hand the writer role to the next test through jsdom's
    // process-wide BroadcastChannel implementation.
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
    for (const [key, chat] of Object.entries(serverChats)) {
        if (chat) bodies.set(key, structuredClone(chat))
    }
    const requests: ChatRequest[] = []
    const statuses: number[] = []
    let nextGetGate: { chatId?: string, promise: Promise<void>, resolve: () => void } | null = null
    let nextPostGate: { chatId?: string, promise: Promise<void>, resolve: () => void } | null = null
    let patchHandler: ((call: number) => Promise<Response> | Response) | null = null
    let writeHandler: ((call: number, init: RequestInit) => Promise<Response> | Response) | null = null
    let chatPostHandler: ((request: ChatRequest) => Promise<Response | null> | Response | null) | null = null
    let readDatabase: Uint8Array | null = null
    let patchCalls = 0
    let writeCalls = 0
    const listeners: Array<{
        target: EventTarget
        type: string
        listener: EventListenerOrEventListenerObject
        options?: boolean | AddEventListenerOptions
    }> = []
    const restoreAddEventListener = [window, document].map((target) => {
        const ownDescriptor = Object.getOwnPropertyDescriptor(target, 'addEventListener')
        const original = target.addEventListener
        Object.defineProperty(target, 'addEventListener', {
            configurable: true,
            writable: true,
            value(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) {
                listeners.push({ target, type, listener, options })
                return original.call(target, type, listener, options)
            },
        })
        return () => {
            if (ownDescriptor) Object.defineProperty(target, 'addEventListener', ownDescriptor)
            else delete (target as any).addEventListener
        }
    })

    const revisionOf = (chat: unknown) => createHash('sha256')
        .update(Buffer.from(codec.encodeRisuSaveLegacy(chat))).digest('hex')
    const lowerHeaders = (init: RequestInit) => Object.fromEntries(
        Object.entries((init.headers ?? {}) as Record<string, string>)
            .map(([key, value]) => [key.toLowerCase(), String(value)]),
    )
    const findChatId = (chaId: string, index: number, headers: Record<string, string>) => {
        if (headers['x-chat-id']) return headers['x-chat-id']
        const char = (stores.DBState.db.characters ?? []).find((item: any) => item?.chaId === chaId)
        return char?.chats?.[index]?.id ?? ''
    }
    const json = (status: number, body: unknown = {}, headers: Record<string, string> = {}) =>
        new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

    const storage = new storageModule.NodeStorage({ invalidate: vi.fn() } as any)
    ;(storage as any).chatDeltaSupported = false
    ;(storage as any).authFetch = vi.fn(async (url: string, init: RequestInit = {}) => {
        const path = String(url)
        const headers = lowerHeaders(init)
        if (path.startsWith('/api/chat-content/')) {
            const parts = path.split('?')[0].split('/')
            const chaId = decodeURIComponent(parts[3])
            const index = Number(parts[4])
            const chatId = findChatId(chaId, index, headers)
            const key = `${chaId}|${chatId}`
            const method = init.method === 'POST' ? 'POST' : 'GET'
            if (method === 'GET') {
                const request: ChatRequest = { method, chaId, chatId, index, headers }
                requests.push(request)
                const gate = nextGetGate && (!nextGetGate.chatId || nextGetGate.chatId === chatId) ? nextGetGate : null
                if (gate) {
                    nextGetGate = null
                    await gate.promise
                }
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
            const sent = await codec.decodeRisuSave(bytes)
            const request: ChatRequest = { method, chaId, chatId, index, headers, sent }
            requests.push(request)
            const gate = nextPostGate && (!nextPostGate.chatId || nextPostGate.chatId === chatId) ? nextPostGate : null
            if (gate) {
                nextPostGate = null
                await gate.promise
            }
            if (chatPostHandler) {
                const overridden = await chatPostHandler(request)
                if (overridden) {
                    request.status = overridden.status
                    statuses.push(overridden.status)
                    return overridden
                }
            }
            const current = bodies.get(key)
            const respond = (status: number, body: unknown = {}, extra: Record<string, string> = {}) => {
                request.status = status
                statuses.push(status)
                return json(status, body, extra)
            }
            if (headers['if-none-match'] === '*') {
                if (current) return respond(412)
            } else {
                const base = headers['x-chat-base-revision']
                if (!current && base !== undefined) return respond(409)
                if (!current) {
                    bodies.set(key, structuredClone(sent))
                    return respond(200, {}, { 'x-chat-revision': revisionOf(sent) })
                }
                if (base === undefined) return respond(428)
                if (base !== revisionOf(current)) return respond(409, { currentRevision: revisionOf(current) })
            }
            let next = sent
            if (headers['x-chat-base-count'] !== undefined && current) {
                const count = Number(headers['x-chat-base-count'])
                const known = fingerprints.messageFingerprints(current.message ?? [])
                if (known.length < count || fingerprints.prefixFingerprint(known, count) !== headers['x-chat-base-fp']) {
                    return respond(409, { code: 'CHAT_DELTA_BASE_MISMATCH' })
                }
                next = { ...sent, message: current.message.slice(0, count).concat(sent.message ?? []) }
            }
            bodies.set(key, structuredClone(next))
            return respond(200, {}, { 'x-chat-revision': revisionOf(next) })
        }
        if (path === '/api/patch') {
            patchCalls++
            return patchHandler ? patchHandler(patchCalls) : json(200, { etag: `patch-${patchCalls}` })
        }
        if (path === '/api/write') {
            writeCalls++
            return writeHandler ? writeHandler(writeCalls, init) : json(200, { etag: `write-${writeCalls}` })
        }
        if (path === '/api/read') {
            if (!readDatabase) return new Response(new Uint8Array(), { status: 200 })
            return new Response(readDatabase.slice().buffer, { status: 200, headers: { 'x-db-etag': 'foreign-etag' } })
        }
        return json(404)
    })
    api.forageStorage.realStorage = storage

    stores.DBState.db = {
        characters: characters ?? [],
        botPresets: [], modules: [], plugins: [], pluginCustomStorage: {},
    }
    stores.selectedCharID.set(0)

    const env = {
        api,
        stores,
        storage,
        chatStorage,
        codec,
        bodies,
        requests,
        statuses,
        holdNextGet(chatId?: string) {
            const gate = deferred()
            nextGetGate = { chatId, ...gate }
            return gate
        },
        holdNextPost(chatId?: string) {
            const gate = deferred()
            nextPostGate = { chatId, ...gate }
            return gate
        },
        setPatchHandler(handler: typeof patchHandler) { patchHandler = handler },
        setWriteHandler(handler: typeof writeHandler) { writeHandler = handler },
        setChatPostHandler(handler: typeof chatPostHandler) { chatPostHandler = handler },
        setReadDatabase(db: any) { readDatabase = new Uint8Array(codec.encodeRisuSaveLegacy(db)) },
        patchCallCount: () => patchCalls,
        writeCallCount: () => writeCalls,
        boundaryRequests,
        chat(chaId: string, chatId: string) { return bodies.get(`${chaId}|${chatId}`) },
        putChat(chaId: string, chatId: string, chat: any) { bodies.set(`${chaId}|${chatId}`, structuredClone(chat)) },
        async dispose() {
            nextGetGate?.resolve()
            nextPostGate?.resolve()
            window.dispatchEvent(new CustomEvent('risu-session-deactivated'))
            await api.flushSaves()
            for (const restore of restoreAddEventListener) restore()
            for (const { target, type, listener, options } of listeners) {
                target.removeEventListener(type, listener, options)
            }
            await delay(0)
        },
    }
    activeEnvironments.add(env)
    return env
}

async function installPlugin(name: string) {
    const v3 = await import('../plugins/apiV3/v3.svelte')
    await v3.executePluginV3({ name, script: '' } as any)
    return pluginHost.api
}

async function hydrate(env: Awaited<ReturnType<typeof publicEnv>>, chaId: string, index: number) {
    const char = env.stores.DBState.db.characters.find((item: any) => item.chaId === chaId)
    return env.chatStorage.ensureChatHydrated(char.chats, index, chaId)
}

function basicCharacter(chaId: string, chats: any[], chatPage = 0) {
    return { chaId, name: chaId, chatPage, chatFolders: [], chats }
}

async function startSaveLoop(env: Awaited<ReturnType<typeof publicEnv>>) {
    void env.api.saveDb()
    await delay(500)
}

async function beginDatabaseReplacementThroughFullWrite409(
    env: Awaited<ReturnType<typeof publicEnv>>,
    latestDb: any,
) {
    const previous = env.stores.DBState.db
    const responseGate = deferred()
    env.setReadDatabase(latestDb)
    env.setWriteHandler(async (call) => {
        if (call === 1) {
            await responseGate.promise
            return new Response(JSON.stringify({ error: 'foreign write', currentEtag: 'foreign-etag' }), {
            status: 409,
            headers: { 'content-type': 'application/json' },
        })
        }
        return new Response(JSON.stringify({ etag: `write-${call}` }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        })
    })
    const replacement = env.api.requestImmediateSave({ forceFullWrite: true })
    await waitFor(() => env.writeCallCount() === 1, 'in-flight whole-database write', 5000)
    return async () => {
        responseGate.resolve()
        await waitFor(() => env.stores.DBState.db !== previous, 'whole-database 409 replacement', 5000)
        await replacement
    }
}

describe('[E2-3d2] Capture the open chat autosave from its slot when the save runs', () => {
    test('[new] d2-1 queued autosave sends the last of two plugin writes from the live slot', async () => {
        const chaId = 'd2-1'
        const base = { id: 'chat-1', name: 'base', fmIndex: -1, message: [message('m0', 'base')] }
        const env = await publicEnv({ [`${chaId}|chat-1`]: base }, [basicCharacter(chaId, [placeholder('chat-1')])])
        const live = await hydrate(env, chaId, 0)
        live!.message.push(message('u1', 'user message') as any)
        const plugin = await installPlugin('d2-1-plugin')
        const gate = env.holdNextPost('chat-1')
        const blocker = env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', live!)
        await waitFor(() => env.requests.filter(r => r.method === 'POST').length === 1, 'the queue blocker')
        const queued = env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', live!, undefined, { live: true })

        const first = structuredClone(await plugin.getChatFromIndex(0, 0))
        first.message.push(message('p1', 'plugin one'))
        await plugin.setChatToIndex(0, 0, first)
        const second = structuredClone(await plugin.getChatFromIndex(0, 0))
        second.message.push(message('p2', 'plugin two'))
        await plugin.setChatToIndex(0, 0, second)

        gate.resolve()
        await Promise.all([blocker, queued])
        const posts = env.requests.filter(r => r.method === 'POST')
        expect(ids(posts.at(-1)?.sent), 'queued autosave request uses the current slot').toContain('p2')
        expect(ids(env.chat(chaId, 'chat-1'))).toEqual(expect.arrayContaining(['u1', 'p2']))
    }, 60000)

    test('[unchanged] d2-2 queued autosave includes an in-place user edit and the advanced base', async () => {
        const chaId = 'd2-2'
        const base = { id: 'chat-1', fmIndex: -1, message: [message('m0', 'base')] }
        const env = await publicEnv({ [`${chaId}|chat-1`]: base }, [basicCharacter(chaId, [placeholder('chat-1')])])
        await hydrate(env, chaId, 0)
        const live = env.stores.DBState.db.characters[0].chats[0]
        live.message.push(message('m1', 'first edit') as any)
        const gate = env.holdNextPost('chat-1')
        const first = env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', live)
        await waitFor(() => env.requests.filter(r => r.method === 'POST').length === 1, 'first autosave')
        const queued = env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', live, undefined, { live: true })
        live.message.push(message('m2', 'edit while queued') as any)
        gate.resolve()
        await Promise.all([first, queued])
        expect(ids(env.chat(chaId, 'chat-1'))).toEqual(['m0', 'm1', 'm2'])
        expect(env.statuses).not.toContain(409)
    })

    test.each([
        ['deleted', (chats: any[]) => { chats.splice(0, 1) }],
        ['placeholder', (chats: any[]) => { chats[0] = placeholder('chat-1') }],
    ])('[new] d2-3 queued autosave is skipped when the slot is %s', async (_variant, change) => {
        const chaId = `d2-3-${_variant}`
        const base = { id: 'chat-1', fmIndex: -1, message: [message('m0', 'base')] }
        const env = await publicEnv({ [`${chaId}|chat-1`]: base }, [basicCharacter(chaId, [placeholder('chat-1')])])
        const live = await hydrate(env, chaId, 0)
        live!.message.push(message('u1', 'queued content') as any)
        const gate = env.holdNextPost('chat-1')
        const first = env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', live!)
        await waitFor(() => env.requests.filter(r => r.method === 'POST').length === 1, 'queue blocker')
        const queued = env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', live!, undefined, { live: true }) as Promise<unknown>
        change(env.stores.DBState.db.characters[0].chats)
        gate.resolve()
        await first
        await expect(queued).resolves.toBe('skipped')
        expect(env.requests.filter(r => r.method === 'POST')).toHaveLength(1)
    })

    test('[new] d2-3b a queued first body save skips a new chat that became a placeholder', async () => {
        const chaId = 'd2-3b'
        const newChat = { id: 'new-chat', fmIndex: -1, message: [message('m1', 'new body')] }
        const env = await publicEnv({}, [basicCharacter(chaId, [])])
        await startSaveLoop(env)
        env.stores.DBState.db.characters[0].chats.push(newChat)
        const getGate = env.holdNextGet('new-chat')
        const blocker = env.chatStorage.saveChatToServer(chaId, 0, 'new-chat', newChat as any, 'update').catch(() => undefined)
        await waitFor(() => env.requests.some(r => r.method === 'GET' && r.chatId === 'new-chat'), 'queue blocker GET')
        env.setPatchHandler(() => new Response(JSON.stringify({
            code: 'DB_INVARIANT_REJECTED',
            detail: 'database lists a chat without a stored body',
            missingFullChat: { chaId, chatId: 'new-chat' },
        }), { status: 422, headers: { 'content-type': 'application/json' } }))
        env.api.trackCharacterForSave(chaId)
        const flushed = env.api.flushSaves()
        await delay(50)
        env.stores.DBState.db.characters[0].chats[0] = placeholder('new-chat')
        getGate.resolve()
        await blocker
        const flushResult = await flushed
        const { get } = await import('svelte/store')

        expect(env.requests.filter(r => r.method === 'POST' && r.chatId === 'new-chat'), 'no stale first body is sent').toHaveLength(0)
        expect(env.chat(chaId, 'new-chat'), 'server still has no chat body').toBeUndefined()
        expect(flushResult, 'the rejected save is not confirmed').toBe(false)
        expect(env.patchCallCount(), 'at least one metadata patch was sent and rejected').toBeGreaterThanOrEqual(1)
        expect(get(env.stores.alertStore), '422 recovery failure is shown to the user').toMatchObject({ type: 'error' })
    }, 60000)

    test('[unchanged] d2-4 back-to-back open-chat autosaves do not create a false conflict', async () => {
        const chaId = 'd2-4'
        const base = { id: 'chat-1', fmIndex: -1, message: [message('m0', 'base')] }
        const env = await publicEnv({ [`${chaId}|chat-1`]: base }, [basicCharacter(chaId, [placeholder('chat-1')])])
        await hydrate(env, chaId, 0)
        const live = env.stores.DBState.db.characters[0].chats[0]
        live.message.push(message('m1', 'one') as any)
        const gate = env.holdNextPost('chat-1')
        const a1 = env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', live, undefined, { live: true })
        await waitFor(() => env.requests.some(r => r.method === 'POST'), 'first autosave')
        live.message.push(message('m2', 'two') as any)
        const a2 = env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', live, undefined, { live: true })
        live.message.push(message('m3', 'three') as any)
        const a3 = env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', live, undefined, { live: true })
        gate.resolve()
        await Promise.all([a1, a2, a3])
        expect(ids(env.chat(chaId, 'chat-1'))).toEqual(['m0', 'm1', 'm2', 'm3'])
        expect(env.statuses).not.toContain(409)
    })

    test('[new] d2-5a queued autosave uses the object installed by real hydration', async () => {
        const chaId = 'd2-5a'
        const server = { id: 'chat-1', name: 'hydrated', fmIndex: -1, message: [message('m0', 'server')] }
        const old = { id: 'chat-1', name: 'old queued object', fmIndex: -1, message: [message('m0', 'server')] }
        const env = await publicEnv({ [`${chaId}|chat-1`]: server }, [basicCharacter(chaId, [old])])
        const blockerView = await env.chatStorage.fetchChatFromServer(chaId, 0, 'chat-1')
        const gate = env.holdNextPost('chat-1')
        const blocker = env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', blockerView!)
        await waitFor(() => env.requests.filter(r => r.method === 'POST').length === 1, 'queue blocker')
        const queued = env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', old as any, undefined, { live: true })
        env.stores.DBState.db.characters[0].chats[0] = placeholder('chat-1')
        const hydrated = await hydrate(env, chaId, 0)
        expect(hydrated).not.toBe(old)
        hydrated!.message.push(message('h1', 'content from the hydrated slot') as any)
        gate.resolve()
        await blocker
        await expect(Promise.resolve(queued).then(() => 'resolved'), 'queued save resolves without a conflict error').resolves.toBe('resolved')
        const posts = env.requests.filter(r => r.method === 'POST')
        const queuedPosts = posts.slice(1)
        expect(queuedPosts.some(request => ids(request.sent).includes('h1')), 'queued request uses hydrated slot content').toBe(true)
        expect(queuedPosts.some(request => request.sent?.name === 'old queued object'), 'queued request does not use the object supplied before hydration').toBe(false)
    })

    test('[new] d2-5b queued autosave addresses the chat at its current index', async () => {
        const chaId = 'd2-5b'
        const target = { id: 'target', fmIndex: -1, message: [message('m0', 'target')] }
        const filler = { id: 'filler', fmIndex: -1, message: [message('f0', 'filler')] }
        const env = await publicEnv({ [`${chaId}|target`]: target, [`${chaId}|filler`]: filler }, [
            basicCharacter(chaId, [placeholder('filler'), placeholder('target')], 1),
        ])
        const live = await hydrate(env, chaId, 1)
        live!.message.push(message('u1', 'edit') as any)
        const gate = env.holdNextPost('target')
        const blocker = env.chatStorage.saveChatToServer(chaId, 1, 'target', live!)
        await waitFor(() => env.requests.filter(r => r.method === 'POST').length === 1, 'queue blocker')
        const queued = env.chatStorage.saveChatToServer(chaId, 1, 'target', live!, undefined, { live: true })
        env.stores.DBState.db.characters[0].chats.splice(0, 1)
        env.stores.DBState.db.characters[0].chatPage = 0
        gate.resolve()
        await Promise.all([blocker, queued])
        const posts = env.requests.filter(r => r.method === 'POST' && r.chatId === 'target')
        expect(posts.at(-1)?.index, 'queued request uses the current slot index').toBe(0)
        expect(env.statuses).not.toContain(409)
    })

    test.each([
        ['known base', true],
        ['no known base', false],
    ])('[new] d2-6 an in-flight open save with %s cannot advance the replacement database base', async (_variant, knownBase) => {
        const chaId = `d2-6-${knownBase ? 'known' : 'unknown'}`
        const base = { id: 'chat-1', fmIndex: -1, message: [message('m0', 'base')] }
        let local: any = { ...structuredClone(base), message: [...base.message, message('u1', 'local before replacement')] }
        const initialSlot = knownBase ? placeholder('chat-1') : local
        const env = await publicEnv({ [`${chaId}|chat-1`]: base }, [basicCharacter(chaId, [initialSlot])])
        await startSaveLoop(env)
        if (knownBase) {
            local = (await hydrate(env, chaId, 0))!
            local.message.push(message('u1', 'local before replacement'))
        }
        const latestDb = {
            characters: [basicCharacter(chaId, [structuredClone(base)])],
            botPresets: [], modules: [], plugins: [], pluginCustomStorage: {},
        }
        const finishReplacement = await beginDatabaseReplacementThroughFullWrite409(env, latestDb)
        const gate = env.holdNextPost('chat-1')
        const oldSave = env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', local as any, 'update', { live: true })
        await waitFor(() => env.requests.some(r => r.method === 'POST'), 'old open-chat POST')
        env.putChat(chaId, 'chat-1', { ...structuredClone(base), message: [...base.message, message('o1', 'other device')] })
        await finishReplacement()
        gate.resolve()
        await oldSave

        const current = env.stores.DBState.db.characters.find((char: any) => char.chaId === chaId).chats[0]
        current.message.push(message('u2', 'edit after replacement'))
        await expect(
            env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', current, 'update', { live: true }),
            'the final save succeeds',
        ).resolves.not.toBe('skipped')

        expect(env.requests.some(r => r.method === 'POST' && r.status === 409), 'the pre-replacement save rebased').toBe(true)
        expect(ids(env.chat(chaId, 'chat-1')), 'the next save from the replacement database preserves the other device message').toContain('o1')
    }, 60000)

    test.each([
        ['with a read token', true],
        ['without a read token', false],
    ])('[new] d2-7 a non-open plugin save %s cannot advance the replacement database base', async (_variant, withToken) => {
        const chaId = `d2-7-${withToken ? 'token' : 'no-token'}`
        const open = { id: 'open', fmIndex: -1, message: [message('open-m0', 'open')] }
        const base = { id: 'target', fmIndex: -1, message: [message('m0', 'base')] }
        const env = await publicEnv({
            [`${chaId}|open`]: open,
            [`${chaId}|target`]: base,
        }, [basicCharacter(chaId, [open, placeholder('target')], 0)])
        await startSaveLoop(env)
        const plugin = await installPlugin(`d2-7-plugin-${withToken}`)
        const written = withToken
            ? structuredClone(await plugin.getChatFromIndex(0, 1))
            : structuredClone(base)
        const latestDb = {
            characters: [basicCharacter(chaId, [structuredClone(open), structuredClone(base)], 0)],
            botPresets: [], modules: [], plugins: [], pluginCustomStorage: {},
        }
        const finishReplacement = await beginDatabaseReplacementThroughFullWrite409(env, latestDb)
        written.message.push(message('p1', 'plugin before replacement'))
        const gate = env.holdNextPost('target')
        const pluginWrite = plugin.setChatToIndex(0, 1, written)
        await waitFor(() => env.requests.some(r => r.method === 'POST' && r.chatId === 'target'), 'non-open plugin POST')
        env.putChat(chaId, 'target', { ...structuredClone(base), message: [...base.message, message('o1', 'other device')] })
        await finishReplacement()
        gate.resolve()
        await pluginWrite

        const char = env.stores.DBState.db.characters.find((item: any) => item.chaId === chaId)
        char.chatPage = 1
        env.stores.selectedCharID.set(0)
        char.chats[1].message.push(message('u2', 'opened after replacement'))
        await expect(
            env.chatStorage.saveChatToServer(chaId, 1, 'target', char.chats[1], 'update', { live: true }),
            'the final save succeeds',
        ).resolves.not.toBe('skipped')

        expect(env.requests.some(r => r.method === 'POST' && r.chatId === 'target' && r.status === 409), 'plugin save rebased').toBe(true)
        expect(ids(env.chat(chaId, 'target')), 'opening and saving from the replacement database preserves the other device message').toContain('o1')
    }, 60000)

    test('[unchanged] non-live save captures content at call time while waiting', async () => {
        const chaId = 'd2-22'
        const base = { id: 'chat-1', name: 'base', fmIndex: -1, message: [message('m0', 'base')] }
        const env = await publicEnv({ [`${chaId}|chat-1`]: base }, [basicCharacter(chaId, [placeholder('chat-1')])])
        const live = await hydrate(env, chaId, 0)
        const gate = env.holdNextPost('chat-1')
        const blocker = env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', live!)
        await waitFor(() => env.requests.filter(r => r.method === 'POST').length === 1, 'queue blocker')
        live!.name = 'captured name'
        const queued = env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', live!)
        live!.name = 'mutated later'
        gate.resolve()
        await Promise.all([blocker, queued])
        expect(env.chat(chaId, 'chat-1').name).toBe('captured name')
    })
})

describe('[E2-3d3] Keep a hash of plugin-written chat content', () => {
    test('[unchanged] d3-1 exact accepted autosave advances the plugin token', async () => {
        const chaId = 'd3-1'
        const base = { id: 'chat-1', fmIndex: -1, message: [message('m0', 'base')] }
        const env = await publicEnv({ [`${chaId}|chat-1`]: base }, [basicCharacter(chaId, [placeholder('chat-1')])])
        await hydrate(env, chaId, 0)
        const plugin = await installPlugin('d3-1-plugin')
        const held = structuredClone(await plugin.getChatFromIndex(0, 0))
        const first = structuredClone(held)
        first.message.push(message('p1', 'plugin one'))
        await plugin.setChatToIndex(0, 0, first)
        await env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', env.stores.DBState.db.characters[0].chats[0], undefined, { live: true })
        const second = structuredClone(held)
        second.message.push(message('p2', 'plugin two'))
        await plugin.setChatToIndex(0, 0, second)
        await env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', env.stores.DBState.db.characters[0].chats[0], undefined, { live: true })
        expect(env.statuses).not.toContain(409)
        expect(ids(env.chat(chaId, 'chat-1'))).toContain('p2')
    })

    test('[unchanged] d3-2 a user edit prevents token advance and survives the same-token rewrite', async () => {
        const chaId = 'd3-2'
        const base = { id: 'chat-1', fmIndex: -1, message: [message('m0', 'base')] }
        const env = await publicEnv({ [`${chaId}|chat-1`]: base }, [basicCharacter(chaId, [placeholder('chat-1')])])
        await hydrate(env, chaId, 0)
        const plugin = await installPlugin('d3-2-plugin')
        const held = structuredClone(await plugin.getChatFromIndex(0, 0))
        const first = structuredClone(held)
        first.message.push(message('p1', 'plugin one'))
        await plugin.setChatToIndex(0, 0, first)
        env.stores.DBState.db.characters[0].chats[0].message.push(message('u1', 'user edit'))
        await env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', env.stores.DBState.db.characters[0].chats[0], undefined, { live: true })
        const second = structuredClone(held)
        second.message.push(message('p1', 'plugin one'), message('p2', 'plugin two'))
        await plugin.setChatToIndex(0, 0, second)
        await env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', env.stores.DBState.db.characters[0].chats[0], undefined, { live: true }).catch(() => undefined)
        expect(ids(env.chat(chaId, 'chat-1'))).toEqual(expect.arrayContaining(['u1', 'p2']))
    })

    test('[unchanged] d3-2 same-length different content does not advance the token', async () => {
        const chaId = 'd3-2-hash'
        const base = { id: 'chat-1', fmIndex: -1, message: [message('m0', 'base')] }
        const env = await publicEnv({ [`${chaId}|chat-1`]: base }, [basicCharacter(chaId, [placeholder('chat-1')])])
        await hydrate(env, chaId, 0)
        const plugin = await installPlugin('d3-2-hash-plugin')
        const held = structuredClone(await plugin.getChatFromIndex(0, 0))
        const first = structuredClone(held)
        first.message.push(message('p1', 'Hello World 123'))
        await plugin.setChatToIndex(0, 0, first)
        env.stores.DBState.db.characters[0].chats[0].message.at(-1).data = 'Hello World 124'
        await env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', env.stores.DBState.db.characters[0].chats[0], undefined, { live: true })
        const second = structuredClone(held)
        second.message.push(message('p1', 'Hello World 123'))
        second.message.push(message('p2', 'plugin follow-up'))
        await plugin.setChatToIndex(0, 0, second)
        await env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', env.stores.DBState.db.characters[0].chats[0], undefined, { live: true }).catch(() => undefined)
        expect(env.chat(chaId, 'chat-1').message.find((entry: any) => entry.chatId === 'p1')?.data).toBe('Hello World 124')
    })

    test('[unchanged] exact plugin content accepted only after rebase does not advance the token', async () => {
        const chaId = 'd3-rebase'
        const base = { id: 'chat-1', fmIndex: -1, message: [message('m0', 'base')] }
        const env = await publicEnv({ [`${chaId}|chat-1`]: base }, [basicCharacter(chaId, [placeholder('chat-1')])])
        await hydrate(env, chaId, 0)
        const plugin = await installPlugin('d3-rebase-plugin')
        const held = structuredClone(await plugin.getChatFromIndex(0, 0))
        const first = structuredClone(held)
        first.message.push(message('p1', 'plugin one'))
        await plugin.setChatToIndex(0, 0, first)
        env.putChat(chaId, 'chat-1', { ...structuredClone(base), message: [...base.message, message('o1', 'other device')] })
        await env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', env.stores.DBState.db.characters[0].chats[0], undefined, { live: true })
        const second = structuredClone(held)
        second.message.push(message('p1', 'plugin one'), message('p2', 'plugin two'))
        await plugin.setChatToIndex(0, 0, second)
        await env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', env.stores.DBState.db.characters[0].chats[0], undefined, { live: true }).catch(() => undefined)
        expect(ids(env.chat(chaId, 'chat-1'))).toContain('o1')
    })
})

describe('[E2-3d4] Scope chat recreation to the invariant recovery retry', () => {
    const invariant422 = (chaId: string, chatId: string) => new Response(JSON.stringify({
        code: 'DB_INVARIANT_REJECTED',
        detail: 'database lists a chat without a stored body',
        missingFullChat: { chaId, chatId },
    }), { status: 422, headers: { 'content-type': 'application/json' } })

    test.each(['patch', 'full write'])('[unchanged] d4-1 %s 422 recovery creates the named missing chat before metadata', async (route) => {
        const chaId = `d4-1-${route.replace(' ', '-')}`
        const chat = { id: 'missing', fmIndex: -1, message: [message('m1', 'client body')] }
        const env = await publicEnv({}, [basicCharacter(chaId, [chat])])
        await startSaveLoop(env)
        if (route === 'patch') {
            env.setPatchHandler(call => call === 1
                ? invariant422(chaId, 'missing')
                : new Response(JSON.stringify({ etag: 'patch-recovered' }), {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                }))
            env.api.trackCharacterForSave(chaId)
            expect(await env.api.flushSaves()).toBe(true)
            expect(env.patchCallCount()).toBe(2)
        } else {
            env.setWriteHandler(call => call === 1
                ? invariant422(chaId, 'missing')
                : new Response(JSON.stringify({ etag: 'write-recovered' }), {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                }))
            env.setPatchHandler(() => new Response(JSON.stringify({ etag: 'patch-recovered' }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            }))
            env.api.trackCharacterForSave(chaId)
            await env.api.requestImmediateSave({ forceFullWrite: true })
            expect(await env.api.flushSaves()).toBe(true)
            expect(env.writeCallCount()).toBe(1)
        }
        expect(ids(env.chat(chaId, 'missing'))).toEqual(['m1'])
        const create = env.requests.find(r => r.method === 'POST' && r.chatId === 'missing')
        expect(create?.headers['if-none-match']).toBe('*')
    }, 60000)

    test.each(['direct save', 'next database save'])('[new] d4-2 skipped recovery permission expires before the %s', async (laterPath) => {
        const chaId = `d4-2-${laterPath.replaceAll(' ', '-')}`
        const chat = { id: 'missing', fmIndex: -1, message: [message('m1', 'client body')] }
        const env = await publicEnv({}, [basicCharacter(chaId, [chat])])
        await startSaveLoop(env)
        const getGate = env.holdNextGet('missing')
        const blocker = env.chatStorage.saveChatToServer(chaId, 0, 'missing', chat as any, 'update').catch(() => undefined)
        await waitFor(() => env.requests.some(r => r.method === 'GET' && r.chatId === 'missing'), 'recovery queue blocker')
        env.setPatchHandler(call => {
            return call <= 2
                ? invariant422(chaId, 'missing')
                : new Response(JSON.stringify({ etag: `patch-${call}` }), {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                })
        })
        env.api.trackCharacterForSave(chaId)
        const initialRecovery = env.api.flushSaves()
        await waitFor(() => env.patchCallCount() === 1, 'first invariant rejection')
        env.stores.DBState.db.characters[0].chats[0] = placeholder('missing')
        getGate.resolve()
        await blocker
        await initialRecovery
        env.stores.DBState.db.characters[0].chats[0] = structuredClone(chat)

        if (laterPath === 'direct save') {
            await expect(env.chatStorage.saveChatToServer(chaId, 0, 'missing', chat as any, 'update'))
                .rejects.toBeDefined()
        } else {
            env.api.trackChatForSave(chaId, 'missing')
            await env.api.flushSaves()
        }
        expect(env.chat(chaId, 'missing'), 'an update after the retry must not create the missing body').toBeUndefined()
    }, 60000)

    test('[unchanged] d4-2 failed recovery body save consumes permission before a later update', async () => {
        const chaId = 'd4-2-failed'
        const chat = { id: 'missing', fmIndex: -1, message: [message('m1', 'client body')] }
        const env = await publicEnv({}, [basicCharacter(chaId, [chat])])
        await startSaveLoop(env)
        env.setPatchHandler(() => invariant422(chaId, 'missing'))
        let failed = false
        env.setChatPostHandler(request => {
            if (request.chatId === 'missing' && !failed) {
                failed = true
                return new Response('{}', { status: 500, headers: { 'content-type': 'application/json' } })
            }
            return null
        })
        env.api.trackCharacterForSave(chaId)
        expect(await env.api.flushSaves()).toBe(false)
        await expect(env.chatStorage.saveChatToServer(chaId, 0, 'missing', chat as any, 'update'))
            .rejects.toBeDefined()
        expect(failed, 'the recovery body save reached the server and failed').toBe(true)
        expect(env.chat(chaId, 'missing')).toBeUndefined()
    }, 60000)

    test('[unchanged] d4-3 recovery permission for one chat never permits creation of another chat', async () => {
        const chaId = 'd4-3'
        const chatA = { id: 'chat-a', fmIndex: -1, message: [message('a1', 'A body')] }
        const chatB = { id: 'chat-b', fmIndex: -1, message: [message('b1', 'B body')] }
        const env = await publicEnv({}, [basicCharacter(chaId, [chatA, chatB])])
        await startSaveLoop(env)
        env.setPatchHandler(call => call === 1
            ? invariant422(chaId, 'chat-a')
            : new Response(JSON.stringify({ etag: 'recovered' }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            }))
        const gate = env.holdNextPost('chat-a')
        env.api.trackCharacterForSave(chaId)
        const recovery = env.api.flushSaves()
        await waitFor(() => env.requests.some(r => r.method === 'POST' && r.chatId === 'chat-a'), 'named chat recovery POST', 10000)

        await expect(env.chatStorage.saveChatToServer(chaId, 1, 'chat-b', chatB as any, 'update'))
            .rejects.toBeDefined()
        expect(env.chat(chaId, 'chat-b')).toBeUndefined()
        gate.resolve()
        expect(await recovery).toBe(true)
        expect(ids(env.chat(chaId, 'chat-a'))).toEqual(['a1'])
    }, 60000)
})

