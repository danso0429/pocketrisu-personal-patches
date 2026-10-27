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

const delay = (ms = 10) => new Promise(resolve => setTimeout(resolve, ms))

async function waitFor(check: () => boolean, label: string, timeout = 5000) {
    const until = Date.now() + timeout
    while (!check()) {
        if (Date.now() >= until) throw new Error(`Timed out waiting for ${label}`)
        await delay()
    }
}

function deferred<T = void>() {
    let resolve!: (value: T | PromiseLike<T>) => void
    const promise = new Promise<T>(done => { resolve = done })
    return { promise, resolve }
}

const message = (id: string, data: string, role = 'user') => ({ chatId: id, role, data })
const ids = (chat: any) => (chat?.message ?? []).map((entry: any) => entry.chatId)
const cloneView = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const placeholder = (id: string) => ({ id, name: 'placeholder', fmIndex: -1, message: [], _placeholder: true })
const character = (chaId: string, chats: any[], chatPage = 0) => ({
    chaId, name: chaId, chatPage, chatFolders: [], reloadKeys: 0, chats,
})

type ChatRequest = {
    method: 'GET' | 'POST'
    chatId: string
    index: number
    headers: Record<string, string>
    sent?: any
    status?: number
}

async function publicEnv(serverChats: Record<string, any>, characters: any[], delta = false) {
    vi.resetModules()
    pluginHost.api = null
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

    const bodies = new Map(Object.entries(serverChats).map(([key, value]) => [key, structuredClone(value)]))
    const requests: ChatRequest[] = []
    const statuses: number[] = []
    const postGates = new Map<number, ReturnType<typeof deferred>>()
    let postCount = 0
    const listeners: Array<{
        target: EventTarget
        type: string
        listener: EventListenerOrEventListenerObject
        options?: boolean | AddEventListenerOptions
    }> = []
    const restoreAddEventListener = [window, document].map((target) => {
        const own = Object.getOwnPropertyDescriptor(target, 'addEventListener')
        const original = target.addEventListener
        Object.defineProperty(target, 'addEventListener', {
            configurable: true,
            writable: true,
            value(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) {
                listeners.push({ target, type, listener, options })
                return original.call(target, type, listener, options)
            },
        })
        return () => own ? Object.defineProperty(target, 'addEventListener', own) : delete (target as any).addEventListener
    })

    const revisionOf = (chat: unknown) => createHash('sha256')
        .update(Buffer.from(codec.encodeRisuSaveLegacy(chat))).digest('hex')
    const json = (status: number, body: unknown = {}, headers: Record<string, string> = {}) =>
        new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
    const lowerHeaders = (init: RequestInit) => Object.fromEntries(
        Object.entries((init.headers ?? {}) as Record<string, string>)
            .map(([key, value]) => [key.toLowerCase(), String(value)]),
    )

    const storage = new storageModule.NodeStorage({ invalidate: vi.fn() } as any)
    ;(storage as any).chatDeltaSupported = delta
    ;(storage as any).authFetch = vi.fn(async (url: string, init: RequestInit = {}) => {
        const path = String(url)
        if (!path.startsWith('/api/chat-content/')) return json(404)
        const parts = path.split('?')[0].split('/')
        const chaId = decodeURIComponent(parts[3])
        const index = Number(parts[4])
        const headers = lowerHeaders(init)
        const chatId = headers['x-chat-id'] ?? stores.DBState.db.characters
            .find((item: any) => item?.chaId === chaId)?.chats?.[index]?.id ?? ''
        const key = `${chaId}|${chatId}`

        if (init.method !== 'POST') {
            const request: ChatRequest = { method: 'GET', chatId, index, headers }
            requests.push(request)
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
        const request: ChatRequest = { method: 'POST', chatId, index, headers, sent }
        requests.push(request)
        postCount++
        const gate = postGates.get(postCount)
        if (gate) await gate.promise

        const current = bodies.get(key)
        const respond = (status: number, body: unknown = {}, extra: Record<string, string> = {}) => {
            request.status = status
            statuses.push(status)
            return json(status, body, extra)
        }
        if (headers['if-none-match'] === '*') {
            if (current) return respond(412)
        } else if (current) {
            const base = headers['x-chat-base-revision']
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
    })
    api.forageStorage.realStorage = storage
    stores.DBState.db = { characters, botPresets: [], modules: [], plugins: [], pluginCustomStorage: {} }
    stores.selectedCharID.set(0)

    const env = {
        api,
        stores,
        storage,
        chatStorage,
        requests,
        statuses,
        holdPost(number: number) {
            const gate = deferred()
            postGates.set(number, gate)
            return gate
        },
        postCount: () => postCount,
        chat(chaId: string, chatId: string) { return bodies.get(`${chaId}|${chatId}`) },
        putChat(chaId: string, chatId: string, chat: any) { bodies.set(`${chaId}|${chatId}`, structuredClone(chat)) },
        async dispose() {
            for (const gate of postGates.values()) gate.resolve(undefined)
            window.dispatchEvent(new CustomEvent('risu-session-deactivated'))
            await api.flushSaves()
            for (const restore of restoreAddEventListener) restore()
            for (const { target, type, listener, options } of listeners) target.removeEventListener(type, listener, options)
            await delay(0)
        },
    }
    activeEnvironments.add(env)
    return env
}

async function hydrate(env: Awaited<ReturnType<typeof publicEnv>>, chaId: string, index: number) {
    const char = env.stores.DBState.db.characters.find((item: any) => item.chaId === chaId)
    await env.chatStorage.ensureChatHydrated(char.chats, index, chaId)
    return char.chats[index]
}

async function installPlugin(name: string) {
    const v3 = await import('../plugins/apiV3/v3.svelte')
    await v3.executePluginV3({ name, script: '' } as any)
    return pluginHost.api
}

const baseChat = () => ({ id: 'chat-0', name: 'base', fmIndex: -1, message: [message('m0', 'base')] })
const remoteChat = (base: any) => ({ ...structuredClone(base), message: [...base.message, message('o1', 'other device')] })

describe('[E2-3d5] Refuse chat save results once the slot holds another chat object', () => {
    async function runOpenReplacement(kind: 'trigger' | 'setCharacter' | 'setDatabaseLite', noBase = false) {
        const chaId = `open-${kind}-${noBase}`
        const base = baseChat()
        const initial = noBase ? structuredClone(base) : placeholder('chat-0')
        const env = await publicEnv({ [`${chaId}|chat-0`]: base }, [character(chaId, [initial])])
        const plugin = kind === 'trigger' ? null : await installPlugin(`${chaId}-plugin`)
        const live = noBase ? env.stores.DBState.db.characters[0].chats[0] : await hydrate(env, chaId, 0)
        live.message.push(message('l1', 'local one'))
        const gate = env.holdPost(1)
        const save = env.chatStorage.saveChatToServer(chaId, 0, 'chat-0', live)
        await waitFor(() => env.postCount() === 1, 'first open-chat POST')
        env.putChat(chaId, 'chat-0', remoteChat(base))

        if (kind === 'trigger') {
            const { setTriggerOriginChat } = await import('../process/triggerOrigin')
            const replacement = cloneView(live)
            replacement.message.push(message('l2', 'trigger edit'))
            expect(setTriggerOriginChat({ chaId, chat: live } as any, replacement)).toBe(true)
        } else if (kind === 'setCharacter') {
            const replacement = await plugin.getCharacter()
            replacement.chats[0].message.push(message('l2', 'plugin edit'))
            await plugin.setCharacter(replacement)
        } else {
            const replacement = JSON.parse(JSON.stringify(env.stores.DBState.db.characters))
            replacement[0].chats[0].message.push(message('l2', 'database edit'))
            await plugin.setDatabaseLite({ characters: replacement })
        }

        gate.resolve()
        await save
        const current = env.stores.DBState.db.characters[0].chats[0]
        await env.chatStorage.saveChatToServer(chaId, 0, 'chat-0', current)
        expect(ids(env.chat(chaId, 'chat-0'))).toEqual(expect.arrayContaining(['o1', 'l1', 'l2']))
    }

    test('[new] d5-1 trigger replacement during a merged open save preserves o1 on the follow-up save', async () => {
        await runOpenReplacement('trigger')
    })

    test('[new] d5-2 setCharacter replacement during a merged open save preserves o1', async () => {
        await runOpenReplacement('setCharacter')
    })

    test('[new] d5-3 a base acquired by the save is fenced across trigger replacement', async () => {
        await runOpenReplacement('trigger', true)
    })

    test('[new] d5-9 setDatabaseLite replacement during a merged open save preserves o1', async () => {
        await runOpenReplacement('setDatabaseLite')
    })

    async function runUnopenedPluginReplacement(noToken: boolean, remoteWrite: boolean) {
        const chaId = `unopened-${noToken}-${remoteWrite}`
        const open = { id: 'chat-open', fmIndex: -1, message: [message('open', 'open')] }
        const base = { id: 'chat-1', fmIndex: -1, message: [message('m0', 'base')] }
        const env = await publicEnv({
            [`${chaId}|chat-open`]: open,
            [`${chaId}|chat-1`]: base,
        }, [character(chaId, [open, placeholder('chat-1')], 0)])
        if (!noToken) await hydrate(env, chaId, 1)
        const plugin = await installPlugin(`${chaId}-plugin`)
        const written = noToken
            ? { ...structuredClone(base), message: [...base.message, message('l1', 'plugin one')] }
            : structuredClone(await plugin.getChatFromIndex(0, 1))
        if (!noToken) written.message.push(message('l1', 'plugin one'))
        const gate = env.holdPost(1)
        const write = plugin.setChatToIndex(0, 1, written)
        await waitFor(() => env.postCount() === 1, 'unopened plugin POST')
        if (remoteWrite) env.putChat(chaId, 'chat-1', remoteChat(base))
        const replacement = await plugin.getCharacter()
        replacement.chats[1].message.push(message('l2', 'replacement edit'))
        await plugin.setCharacter(replacement)
        gate.resolve()
        await write

        const current = env.stores.DBState.db.characters[0].chats[1]
        current.message.push(message('l3', 'opened edit'))
        env.stores.DBState.db.characters[0].chatPage = 1
        await env.chatStorage.saveChatToServer(chaId, 1, 'chat-1', current)
        return { env, chaId, current }
    }

    test('[new] d5-4 an unopened plugin save fenced by setCharacter preserves o1 when opened', async () => {
        const { env, chaId } = await runUnopenedPluginReplacement(false, true)
        expect(ids(env.chat(chaId, 'chat-1'))).toEqual(expect.arrayContaining(['o1', 'l2', 'l3']))
    })

    test('[new] d5-11 an unopened plugin save with no base or token preserves o1 after replacement', async () => {
        const { env, chaId } = await runUnopenedPluginReplacement(true, true)
        expect(ids(env.chat(chaId, 'chat-1'))).toEqual(expect.arrayContaining(['o1', 'l2', 'l3']))
    })

    test('[unchanged] d5-12 an unmerged unopened plugin replacement causes no later conflict', async () => {
        const { env, chaId, current } = await runUnopenedPluginReplacement(false, false)
        current.message.push(message('l4', 'second opened edit'))
        await env.chatStorage.saveChatToServer(chaId, 1, 'chat-1', current)
        expect(env.statuses).not.toContain(409)
    })

    test('[new] d5-10 removing the character prevents merge publication into the removed chat', async () => {
        const chaId = 'removed-character'
        const base = baseChat()
        const env = await publicEnv({ [`${chaId}|chat-0`]: base }, [character(chaId, [placeholder('chat-0')])])
        const live = await hydrate(env, chaId, 0)
        live.message.push(message('l1', 'local'))
        const gate = env.holdPost(1)
        const save = env.chatStorage.saveChatToServer(chaId, 0, 'chat-0', live)
        await waitFor(() => env.postCount() === 1, 'removed-character POST')
        env.putChat(chaId, 'chat-0', remoteChat(base))
        env.stores.DBState.db.characters.splice(0, 1)
        gate.resolve()
        await expect(save).resolves.toBeUndefined()
        expect(ids(live), 'removed chat is not published with the merge').not.toContain('o1')
    })

    test('[new] d5-13 replacement while the merged retry is pending preserves o1', async () => {
        const chaId = 'retry-window'
        const base = baseChat()
        const env = await publicEnv({ [`${chaId}|chat-0`]: base }, [character(chaId, [placeholder('chat-0')])])
        const live = await hydrate(env, chaId, 0)
        live.message.push(message('l1', 'local'))
        env.putChat(chaId, 'chat-0', remoteChat(base))
        const retryGate = env.holdPost(2)
        const save = env.chatStorage.saveChatToServer(chaId, 0, 'chat-0', live)
        await waitFor(() => env.postCount() === 2, 'merged retry POST')
        const { setTriggerOriginChat } = await import('../process/triggerOrigin')
        const replacement = { ...structuredClone(base), message: [...base.message, message('l1', 'local'), message('l2', 'replacement')] }
        expect(setTriggerOriginChat({ chaId, chat: live } as any, replacement as any)).toBe(true)
        retryGate.resolve()
        await save
        const current = env.stores.DBState.db.characters[0].chats[0]
        await env.chatStorage.saveChatToServer(chaId, 0, 'chat-0', current)
        expect(ids(env.chat(chaId, 'chat-0'))).toEqual(expect.arrayContaining(['o1', 'l2']))
    })

    test('[new] d5-13b replacement after the merged result is published, while the retry POST is pending, preserves o1', async () => {
        const chaId = 'retry-after-publish'
        const base = baseChat()
        const env = await publicEnv({ [`${chaId}|chat-0`]: base }, [character(chaId, [placeholder('chat-0')])])
        const live = await hydrate(env, chaId, 0)
        live.message.push(message('l1', 'local'))
        const snapshot = cloneView(live)
        snapshot.message.push(message('l2', 'trigger edit'))
        env.putChat(chaId, 'chat-0', remoteChat(base))
        const retryGate = env.holdPost(3)
        const save = env.chatStorage.saveChatToServer(chaId, 0, 'chat-0', live)
        await waitFor(() => env.postCount() === 3, 'merged retry POST')
        expect(ids(env.requests.filter(request => request.method === 'POST')[2].sent), 'retry carries the merged content').toContain('o1')
        const oldSlot = env.stores.DBState.db.characters[0].chats[0]
        expect(ids(oldSlot), 'merged result is already published into the slot').toContain('o1')
        const { setTriggerOriginChat } = await import('../process/triggerOrigin')
        expect(setTriggerOriginChat({ chaId, chat: oldSlot } as any, snapshot as any)).toBe(true)
        expect(env.stores.DBState.db.characters[0].chats[0]).not.toBe(oldSlot)
        retryGate.resolve()
        await save
        const current = env.stores.DBState.db.characters[0].chats[0]
        await env.chatStorage.saveChatToServer(chaId, 0, 'chat-0', current)
        expect(ids(env.chat(chaId, 'chat-0'))).toEqual(expect.arrayContaining(['o1', 'l2']))
    })

    test('[new] d5-14 job recovery fenced by setCharacter preserves o1 on the open-slot save', async () => {
        const chaId = 'job-recovery'
        const base = baseChat()
        const env = await publicEnv({ [`${chaId}|chat-0`]: base }, [character(chaId, [placeholder('chat-0')])])
        await hydrate(env, chaId, 0)
        const plugin = await installPlugin('job-recovery-plugin')
        env.storage.createAuth = vi.fn(async () => 'test-auth')
        const streamGate = deferred<Response>()
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input)
            if (url.endsWith('/stream')) return streamGate.promise
            if (url.endsWith('/claim') && init?.method === 'POST') return new Response('{"success":true}', { status: 200 })
            throw new Error(`unexpected fetch: ${url}`)
        }))
        const recovery = await import('../process/request/jobRecovery')
        const recovering = recovery.recoverTerminalJob({
            id: 'job-e2-3d5', chatId: 'chat-0', generationId: 'job-message',
            adapterKind: 'openai-compatible', streaming: true, status: 'done', upstreamStatus: 200,
        } as any)
        await waitFor(() => (fetch as any).mock.calls.some((call: any[]) => String(call[0]).endsWith('/stream')), 'job result read')
        const replacement = await plugin.getCharacter()
        replacement.chats[0].message.push(message('l2', 'replacement'))
        await plugin.setCharacter(replacement)
        env.putChat(chaId, 'chat-0', remoteChat(base))
        const encoder = new TextEncoder()
        streamGate.resolve(new Response(new ReadableStream({
            start(controller) {
                controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"job result"}}]}\n\ndata: [DONE]\n\n'))
                controller.close()
            },
        }), { status: 200, headers: { 'x-model-job-upstream-status': '200' } }))
        await recovering
        const current = env.stores.DBState.db.characters[0].chats[0]
        await env.chatStorage.saveChatToServer(chaId, 0, 'chat-0', current)
        expect(ids(env.chat(chaId, 'chat-0'))).toEqual(expect.arrayContaining(['o1', 'l2']))
    })

    test('[unchanged] d5-5 no replacement publishes the merge and advances the next save', async () => {
        const chaId = 'no-replacement'
        const base = baseChat()
        const env = await publicEnv({ [`${chaId}|chat-0`]: base }, [character(chaId, [placeholder('chat-0')])])
        const live = await hydrate(env, chaId, 0)
        live.message.push(message('l1', 'local one'))
        env.putChat(chaId, 'chat-0', remoteChat(base))
        await env.chatStorage.saveChatToServer(chaId, 0, 'chat-0', live)
        const conflictsBeforeFollowup = env.statuses.filter(status => status === 409).length
        live.message.push(message('l2', 'local two'))
        await env.chatStorage.saveChatToServer(chaId, 0, 'chat-0', live)
        expect(env.statuses.at(-1)).toBe(200)
        expect(env.statuses.filter(status => status === 409)).toHaveLength(conflictsBeforeFollowup)
        expect(ids(env.chat(chaId, 'chat-0'))).toEqual(expect.arrayContaining(['o1', 'l1', 'l2']))
    })

    test.each([
        ['d5-6 same-proxy reassignment', false],
        ['d5-7 reorder with the same chat proxies', true],
    ])('[unchanged] %s is not a replacement', async (_label, reorder) => {
        const chaId = `same-proxy-${reorder}`
        const base = baseChat()
        const other = { id: 'chat-other', fmIndex: -1, message: [message('x', 'other')] }
        const env = await publicEnv({ [`${chaId}|chat-0`]: base }, [character(chaId, [placeholder('chat-0'), other])])
        const live = await hydrate(env, chaId, 0)
        live.message.push(message('l1', 'local one'))
        const gate = env.holdPost(1)
        const save = env.chatStorage.saveChatToServer(chaId, 0, 'chat-0', live)
        await waitFor(() => env.postCount() === 1, 'same-proxy POST')
        env.putChat(chaId, 'chat-0', remoteChat(base))
        if (reorder) env.stores.DBState.db.characters[0].chats = [other, live]
        else env.stores.DBState.db.characters[0].chats[0] = live
        gate.resolve()
        await save
        const conflictsBeforeFollowup = env.statuses.filter(status => status === 409).length
        const index = reorder ? 1 : 0
        live.message.push(message('l2', 'local two'))
        await env.chatStorage.saveChatToServer(chaId, index, 'chat-0', live)
        expect(env.statuses.at(-1)).toBe(200)
        expect(env.statuses.filter(status => status === 409)).toHaveLength(conflictsBeforeFollowup)
        expect(ids(env.chat(chaId, 'chat-0'))).toEqual(expect.arrayContaining(['o1', 'l1', 'l2']))
    })

    test.each([
        ['delta', true],
        ['full', false],
    ])('[unchanged] d5-8 %s acceptance across replacement causes no false conflict', async (_variant, delta) => {
        const chaId = `unmerged-${delta}`
        const base = baseChat()
        const env = await publicEnv({ [`${chaId}|chat-0`]: base }, [character(chaId, [placeholder('chat-0')])], delta)
        const live = await hydrate(env, chaId, 0)
        if (!delta) live.message[0].data = 'edited base message forces full save'
        live.message.push(message('l1', 'first'))
        const gate = env.holdPost(1)
        const save = env.chatStorage.saveChatToServer(chaId, 0, 'chat-0', live)
        await waitFor(() => env.postCount() === 1, 'unmerged POST')
        const { setTriggerOriginChat } = await import('../process/triggerOrigin')
        const replacement = cloneView(live)
        replacement.message.push(message('l2', 'replacement'))
        setTriggerOriginChat({ chaId, chat: live } as any, replacement as any)
        gate.resolve()
        await save
        const current = env.stores.DBState.db.characters[0].chats[0]
        current.message.push(message('l3', 'follow-up one'))
        await env.chatStorage.saveChatToServer(chaId, 0, 'chat-0', current)
        current.message.push(message('l4', 'follow-up two'))
        await env.chatStorage.saveChatToServer(chaId, 0, 'chat-0', current)
        expect(env.statuses).not.toContain(409)
        expect(ids(env.chat(chaId, 'chat-0'))).toEqual(expect.arrayContaining(['l1', 'l2', 'l3', 'l4']))
        const first = env.requests.find(request => request.method === 'POST')!
        expect(first.headers['x-chat-base-count'] !== undefined).toBe(delta)
    })

    test('[unchanged] d5-8 oversized base-copy replacement remains conflict-free', async () => {
        const chaId = 'oversized-copy'
        const huge = new Uint8Array(8 * 1024 * 1024 + 512 * 1024)
        const base = { id: 'chat-0', fmIndex: -1, oversizedFixture: huge, message: [message('m0', 'base')] }
        const env = await publicEnv({ [`${chaId}|chat-0`]: base }, [character(chaId, [placeholder('chat-0')])])
        const live = await hydrate(env, chaId, 0)
        live.message.push(message('l1', 'first'))
        const gate = env.holdPost(1)
        const save = env.chatStorage.saveChatToServer(chaId, 0, 'chat-0', live)
        await waitFor(() => env.postCount() === 1, 'oversized POST', 15000)
        const { setTriggerOriginChat } = await import('../process/triggerOrigin')
        const replacement = { ...base, message: [...base.message, message('l1', 'first'), message('l2', 'replacement')] }
        setTriggerOriginChat({ chaId, chat: live } as any, replacement as any)
        gate.resolve()
        await save
        const current = env.stores.DBState.db.characters[0].chats[0]
        await env.chatStorage.saveChatToServer(chaId, 0, 'chat-0', current)
        await env.chatStorage.saveChatToServer(chaId, 0, 'chat-0', current)
        expect(env.statuses).not.toContain(409)
        expect(ids(env.chat(chaId, 'chat-0'))).toEqual(expect.arrayContaining(['l1', 'l2']))
    }, 60000)
})
