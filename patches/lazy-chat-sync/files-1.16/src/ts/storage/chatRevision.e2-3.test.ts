import { describe, expect, test, vi } from 'vitest'
import fs from 'node:fs'

const pluginHost = vi.hoisted(() => ({ api: null as any }))
const clientBoundary = vi.hoisted(() => ({
    fetchChatContent: vi.fn(),
    fetchChatContentDelta: vi.fn(),
    saveChatContentDelta: vi.fn(),
    saveChatContent: vi.fn(),
    notifyError: vi.fn(),
}))

vi.mock('src/lang', () => ({ language: {} }))
vi.mock('../alert', () => ({ alertInput: vi.fn(), waitAlert: vi.fn(), notifyError: clientBoundary.notifyError }))
vi.mock('../globalApi.svelte', () => ({ forageStorage: { realStorage: clientBoundary }, checkCharOrder: vi.fn(), getFetchLogs: vi.fn(), trackCharacterForSave: vi.fn() }))
vi.mock('../process/modules', () => ({ moduleUpdate: vi.fn(), getModuleLorebooks: vi.fn(() => []) }))
vi.mock('../plugins/apiV3/factory', () => ({
    SandboxHost: class { constructor(api: any) { pluginHost.api = api } run() {} terminate() {} },
}))
vi.mock('./database.svelte', () => ({
    appVer: 'test',
    nodeOnlyVer: 'test',
    normalizeChat: (chat: unknown) => chat,
}))
vi.mock('./risuSave', async () => {
    const { default: codec } = await import('../../../server/node/utils.cjs')
    return {
        encodeRisuSaveLegacy: codec.encodeRisuSaveLegacy,
        decodeRisuSave: codec.decodeRisuSave,
    }
})

async function optionalImport<T>(path: string): Promise<T | null> {
    try {
        return await import(/* @vite-ignore */ path) as T
    } catch {
        return null
    }
}

const message = (id: string, data: string) => ({ chatId: id, role: 'user', data })

// Stateful fake chat server behind a real NodeStorage, reached through the native
// chatStorage entry points. Revision = sha256 of the legacy encoding; an existing
// chat written without a base revision answers 428, a different base answers 409
// with currentRevision, and `If-None-Match: *` on an existing chat answers 412.
async function saveContextEnv(initial: any) {
    vi.resetModules()
    const storageModule = await import('./nodeStorage')
    const chatStorage = await import('./chatStorage')
    const fingerprints = await import('./chatFingerprint')
    const { forageStorage } = await import('../globalApi.svelte') as any
    const codec = (await import('../../../server/node/utils.cjs')).default
    const { createHash } = await import('node:crypto')
    const zlib = await import('node:zlib')
    const revisionOf = (chat: unknown) => createHash('sha256').update(Buffer.from(codec.encodeRisuSaveLegacy(chat))).digest('hex')
    const server = {
        chat: structuredClone(initial) as any,
        statuses: [] as number[],
        getHold: null as Promise<void> | null,
        postHold: null as Promise<void> | null,
    }
    const storage = new storageModule.NodeStorage({ invalidate: vi.fn() } as any)
    ;(storage as any).chatDeltaSupported = false
    ;(storage as any).authFetch = vi.fn(async (url: string, init: RequestInit = {}) => {
        if (!String(url).startsWith('/api/chat-content/')) return new Response('{}', { status: 404 })
        const headers: Record<string, string> = Object.fromEntries(
            Object.entries((init.headers ?? {}) as Record<string, string>).map(([key, value]) => [key.toLowerCase(), value]))
        if (!init.method || init.method === 'GET') {
            const bytes = new Uint8Array(codec.encodeRisuSaveLegacy(server.chat)).buffer
            const revision = revisionOf(server.chat)
            const hold = server.getHold
            server.getHold = null
            if (hold) await hold
            return new Response(bytes, { status: 200, headers: { 'x-chat-revision': revision } })
        }
        let body = Buffer.from(init.body as Uint8Array)
        if (headers['content-encoding'] === 'gzip') body = zlib.gunzipSync(body)
        const hold = server.postHold
        server.postHold = null
        if (hold) await hold
        const respond = (status: number, payload: unknown = {}, extra: Record<string, string> = {}) => {
            server.statuses.push(status)
            return new Response(JSON.stringify(payload), { status, headers: extra })
        }
        const sentBase = headers['x-chat-base-revision']
        if (headers['if-none-match'] === '*') {
            if (server.chat) return respond(412)
        } else if (server.chat) {
            if (sentBase === undefined) return respond(428)
            if (sentBase !== revisionOf(server.chat)) return respond(409, { currentRevision: revisionOf(server.chat) })
        }
        let next = await codec.decodeRisuSave(body)
        if (headers['x-chat-base-count'] !== undefined) {
            const count = Number(headers['x-chat-base-count'])
            const known = fingerprints.messageFingerprints(server.chat?.message ?? [])
            if (known.length < count || fingerprints.prefixFingerprint(known, count) !== headers['x-chat-base-fp']) {
                return respond(409, { code: 'CHAT_DELTA_BASE_MISMATCH' })
            }
            next = { ...next, message: server.chat.message.slice(0, count).concat(next.message) }
        }
        server.chat = next
        return respond(200, {}, { 'x-chat-revision': revisionOf(server.chat) })
    })
    forageStorage.realStorage = storage
    return {
        server,
        chatStorage,
        appendReply: (id: string, data: string) => {
            server.chat = { ...server.chat, message: [...server.chat.message, message(id, data)] }
        },
    }
}

// The native v3 plugin API object, built by the native executePluginV3 (only the
// iframe sandbox host is replaced); the character list lives in the native DBState.
async function pluginApiEnv(chaId: string) {
    const v3 = await import('../plugins/apiV3/v3.svelte')
    const stores = await import('../stores.svelte') as any
    stores.DBState.db = { characters: { '0': { chaId, chatPage: 0, chats: [{ id: 'chat-1', name: 'placeholder', message: [], _placeholder: true }] } } }
    stores.selectedCharID.set(99)
    await v3.executePluginV3({ name: `plugin-${chaId}`, script: '' } as any)
    return { api: pluginHost.api, chats: () => stores.DBState.db.characters['0'].chats }
}

const chatIds = (chat: any) => (chat?.message ?? []).map((entry: any) => entry.chatId)
const placeholderSlot = () => ({ id: 'chat-1', name: 'placeholder', message: [], _placeholder: true })
const settle = (ms = 20) => new Promise(resolve => setTimeout(resolve, ms))

describe('[E2-3d] Rebuild the chat revision protocol over native 1.16.1', () => {
    test('[new] d6 stale-view rebase preserves an unseen server reply and the local edit', async () => {
        const subject = await optionalImport<any>('./chatSaveRebase')
        expect(subject, 'chatSaveRebase module exists').not.toBeNull()

        const base = { id: 'chat-1', name: 'before', message: [message('m1', 'question')] }
        const local = { ...structuredClone(base), name: 'local edit' }
        const remote = {
            ...structuredClone(base),
            message: [...base.message, { chatId: 'm2', role: 'char', data: 'unseen answer' }],
        }
        const result = subject!.rebaseChatSave(base, local, remote)
        expect(result).toEqual({ ok: true, chat: { ...remote, name: 'local edit' } })
    })

    test('[new] d7 repairs missing and duplicate chat ids on a server-unknown character', async () => {
        const subject = await optionalImport<any>('./chatIdentityRepair')
        expect(subject, 'chatIdentityRepair module exists').not.toBeNull()

        const candidate = {
            characters: [{
                chaId: 'new-character',
                chats: [
                    { id: 'dup-1', message: [] },
                    { id: 'dup-1', message: [] },
                    { id: '', message: [] },
                ],
            }],
        }
        const generated = ['fresh-1', 'fresh-2', 'fresh-3']
        subject!.assignMissingChatIdsToNewCharacters(candidate, { characters: [] }, () => generated.shift()!)
        const ids = candidate.characters[0].chats.map(chat => chat.id)
        expect(ids.every(Boolean)).toBe(true)
        expect(new Set(ids).size).toBe(3)
    })

    test('[new] d8 and d11 classify a new chat from the real fresh-bootstrap baseline as create', async () => {
        const subject = await optionalImport<any>('./chatSaveIntent')
        expect(subject, 'chatSaveIntent module exists').not.toBeNull()
        expect(subject!.classifyChatSaveIntent({}, 'new-character', 'first-chat')).toBe('create')
    })

    test('[new] d9 retains exactly the failed full payload as the recovery candidate', async () => {
        const subject = await optionalImport<any>('./chatSaveIntent')
        expect(subject, 'chatSaveIntent module exists').not.toBeNull()

        const baseline = { characters: [{ chaId: 'cha-1', chats: [] }] }
        const current = {
            characters: [{
                chaId: 'cha-1',
                chats: [
                    { id: 'failed-chat', message: [message('m1', 'kept draft')] },
                    { id: 'stub-only', _placeholder: true },
                ],
            }],
        }
        const pending = subject!.collectUnconfirmedChatPayloads(baseline, current)
        expect(pending).toEqual([{ chaId: 'cha-1', chatId: 'failed-chat' }])
        expect(subject!.findRecoverableChatPayload(current, pending[0])).toEqual(pending[0])
    })

    test('[new] d10 and d13 save a known view with its base revision and rebase after 409', async () => {
        const storageModule = await import('./nodeStorage')
        expect(typeof storageModule.NodeStorage, 'native NodeStorage remains importable').toBe('function')
        const codec = (await import('../../../server/node/utils.cjs')).default

        const base = { id: 'chat-1', name: 'before', message: [message('m1', 'question')] }
        const local = { ...structuredClone(base), name: 'plugin edit' }
        const remote = {
            ...structuredClone(base),
            message: [...base.message, { chatId: 'm2', role: 'char', data: 'concurrent reply' }],
        }
        const storage = new storageModule.NodeStorage({ invalidate: vi.fn() } as any)
        const remember = (storage as any).rememberChatSyncState
        expect(typeof remember, 'revision state can be attached on every acquisition path').toBe('function')
        remember.call(storage, 'cha-1|chat-1', 'revision-1', base, codec.encodeRisuSaveLegacy(base).byteLength)

        const responses = [
            new Response(JSON.stringify({ currentRevision: 'revision-2' }), { status: 409 }),
            new Response(new Uint8Array(codec.encodeRisuSaveLegacy(remote)).buffer, {
                status: 200,
                headers: { 'x-chat-revision': 'revision-2' },
            }),
            new Response('{}', { status: 200, headers: { 'x-chat-revision': 'revision-3' } }),
        ]
        const authFetch = vi.fn(async () => responses.shift()!)
        ;(storage as any).authFetch = authFetch
        ;(storage as any).chatDeltaSupported = false

        await storage.saveChatContent('cha-1', 0, 'chat-1', local)
        const calls = authFetch.mock.calls as any[]
        expect(calls[0][1]?.headers?.['x-chat-base-revision']).toBe('revision-1')
        expect(calls[2][1]?.headers?.['x-chat-base-revision']).toBe('revision-2')
        expect(local.message.map((entry: any) => entry.chatId)).toEqual(['m1', 'm2'])
        expect(local.name).toBe('plugin edit')
    })

    test('[new] d12 preserves the save and conflict symbols consumed by dependent packs', () => {
        const source = fs.readFileSync('src/ts/globalApi.svelte.ts', 'utf8')
        for (const symbol of [
            'markChatDirtyImpl',
            'readServerChatSnapshot',
            'confirmCurrentSnapshotOnServer',
            'ChatConflictError',
            'ManualSaveConflictError',
            'requestImportedCharacterSave',
            'requestImportedModuleSave',
        ]) expect(new RegExp(`\\b${symbol}\\b`).test(source), symbol).toBe(true)
    })

    test('[new] d14 unselected plugin chat writes enlist the owning character metadata', () => {
        const source = fs.readFileSync('src/ts/plugins/apiV3/v3.svelte.ts', 'utf8')
        expect(/trackCharacterForSave/.test(source)).toBe(true)
    })

    test('[unchanged] d5 missing payload hydration shows a notice and never posts an empty chat', async () => {
        const storageModule = await import('./nodeStorage')
        const storage = new storageModule.NodeStorage({ invalidate: vi.fn() } as any)
        const authFetch = vi.fn(async () => new Response(JSON.stringify({ code: 'CHAT_PAYLOAD_MISSING' }), {
            status: 404, headers: { 'content-type': 'application/json' },
        }))
        ;(storage as any).authFetch = authFetch
        clientBoundary.fetchChatContent.mockImplementation(storage.fetchChatContent.bind(storage))
        clientBoundary.fetchChatContentDelta.mockResolvedValue(null)
        clientBoundary.saveChatContentDelta.mockClear()
        clientBoundary.saveChatContent.mockClear()
        clientBoundary.notifyError.mockClear()
        const subject = await import('./chatStorage')
        const chats: any[] = [{ id: 'missing-chat', name: 'legacy stub', message: [], fmIndex: -1, _placeholder: true }]
        await expect(subject.ensureChatHydrated(chats, 0, 'cha-1')).resolves.toBeNull()
        let failures: ReadonlyMap<string, string> = new Map()
        const unsubscribe = subject.chatLoadFailures.subscribe(value => { failures = value })
        expect(failures.get('cha-1/missing-chat')).toBe('missing')
        unsubscribe()
        expect(clientBoundary.saveChatContent).not.toHaveBeenCalled()
        expect((authFetch.mock.calls as any[]).every(call => (call[1] as RequestInit | undefined)?.method !== 'POST')).toBe(true)
    })

    test('[new] d12 conflict and snapshot helpers execute their runtime transport contracts', async () => {
        const storageModule = await import('./nodeStorage') as any
        const codec = (await import('../../../server/node/utils.cjs')).default
        const storage = new storageModule.NodeStorage({ invalidate: vi.fn() } as any)
        const base = { id: 'chat-1', name: 'base', message: [message('m1', 'base')] }
        const encoded = new Uint8Array(codec.encodeRisuSaveLegacy(base)).buffer
        const authFetch = vi.fn()
            .mockResolvedValueOnce(new Response(encoded, { status: 200, headers: { 'x-chat-revision': 'rev-1' } }))
            .mockResolvedValueOnce(new Response(encoded, { status: 200, headers: { 'x-chat-revision': 'rev-1' } }))
        ;(storage as any).authFetch = authFetch
        const readSnapshot = (storage as any).readServerChatSnapshot?.bind(storage)
            ?? (async () => ({ revision: null, chat: null, encodedBytes: 0 }))
        const confirmSnapshot = (storage as any).confirmCurrentSnapshotOnServer?.bind(storage)
            ?? (async () => ({ confirmed: false, currentRevision: null }))
        const snapshot = await readSnapshot('cha-1', 0, 'chat-1')
        expect(snapshot).toMatchObject({ revision: 'rev-1', chat: base })
        const confirmed = await confirmSnapshot('cha-1', 0, 'chat-1', base, encoded.byteLength)
        expect(confirmed).toMatchObject({ confirmed: true, currentRevision: 'rev-1' })
        expect(authFetch).toHaveBeenCalledTimes(2)

        const conflicting = new storageModule.NodeStorage({ invalidate: vi.fn() } as any)
        ;(conflicting as any).rememberChatSyncState('cha-1|chat-1', 'rev-1', base, encoded.byteLength)
        ;(conflicting as any).chatDeltaSupported = false
        ;(conflicting as any).authFetch = vi.fn(async () => new Response(JSON.stringify({ currentRevision: 'rev-2' }), {
            status: 409, headers: { 'content-type': 'application/json' },
        }))
        await expect(conflicting.saveChatContent('cha-1', 0, 'chat-1', { ...base, name: 'local' }))
            .rejects.toBeInstanceOf(storageModule.ChatConflictError)
    })

    test('[new] d13 a view from an earlier full read never replaces a reply that arrived before a second read', async () => {
        const storageModule = await import('./nodeStorage')
        const codec = (await import('../../../server/node/utils.cjs')).default
        const { createHash } = await import('node:crypto')
        const revisionOf = (chat: unknown) => createHash('sha256').update(Buffer.from(codec.encodeRisuSaveLegacy(chat))).digest('hex')
        const server = { chat: { id: 'chat-1', name: 'base', message: [message('m1', 'question')] } as any }
        const storage = new storageModule.NodeStorage({ invalidate: vi.fn() } as any)
        ;(storage as any).chatDeltaSupported = false
        ;(storage as any).authFetch = vi.fn(async (_url: string, init?: RequestInit) => {
            if (!init?.method || init.method === 'GET') {
                const bytes = new Uint8Array(codec.encodeRisuSaveLegacy(server.chat)).buffer
                return new Response(bytes, { status: 200, headers: { 'x-chat-revision': revisionOf(server.chat) } })
            }
            const headers = init.headers as Record<string, string>
            const sentBase = headers['x-chat-base-revision']
            if (sentBase !== undefined && sentBase !== revisionOf(server.chat)) {
                return new Response(JSON.stringify({ currentRevision: revisionOf(server.chat) }), { status: 409 })
            }
            server.chat = await codec.decodeRisuSave(Buffer.from(init.body as Uint8Array))
            return new Response('{}', { status: 200, headers: { 'x-chat-revision': revisionOf(server.chat) } })
        })

        const firstView = await storage.fetchChatContent('cha-1', 0, 'chat-1')
        server.chat = { ...server.chat, message: [...server.chat.message, message('m2', 'reply from another device')] }
        await storage.fetchChatContent('cha-1', 0, 'chat-1')

        firstView.name = 'edited from the first view'
        await storage.saveChatContent('cha-1', 0, 'chat-1', firstView).catch(() => undefined)
        expect(server.chat.message.map((entry: any) => entry.chatId)).toContain('m2')
    })

    test.each(['full-fetch', 'delta-hydration', 'memory-resident', 'write-without-read'])('[new] d13 %s acquisition sends a valid base or fetches one before saving', async (pathName) => {
        const storageModule = await import('./nodeStorage')
        const codec = (await import('../../../server/node/utils.cjs')).default
        const base = { id: 'chat-1', name: 'base', message: [message('m1', 'base')] }
        const local = { ...structuredClone(base), name: `edited-${pathName}` }
        const bytes = new Uint8Array(codec.encodeRisuSaveLegacy(base)).buffer
        const storage = new storageModule.NodeStorage({ invalidate: vi.fn() } as any)
        const calls: any[] = []
        ;(storage as any).chatDeltaSupported = false
        ;(storage as any).authFetch = vi.fn(async (url: string, init?: RequestInit) => {
            calls.push([url, init])
            if (!init?.method || init.method === 'GET') {
                return new Response(bytes, { status: 200, headers: { 'x-chat-revision': 'acquired-revision' } })
            }
            return new Response('{}', { status: 200, headers: { 'x-chat-revision': 'saved-revision' } })
        })
        let savedView = local
        if (pathName === 'full-fetch') {
            savedView = await storage.fetchChatContent('cha-1', 0, 'chat-1')
            savedView.name = local.name
        }
        if (pathName === 'delta-hydration' || pathName === 'memory-resident') {
            ;((storage as any).rememberChatSyncState?.bind(storage) ?? (() => {}))('cha-1|chat-1', 'acquired-revision', base, bytes.byteLength)
        }
        await storage.saveChatContent('cha-1', 0, 'chat-1', savedView)
        const post = calls.find(([, init]) => init?.method === 'POST')
        expect(post, 'save POST reached the server boundary').toBeTruthy()
        expect((post[1].headers as any)['x-chat-base-revision']).toBe('acquired-revision')
        if (pathName === 'write-without-read') expect(calls[0][1]?.method).not.toBe('POST')
    })

    test('[new] d13 save context: a view from a full read is not saved over a reply once the chat was hydrated into a slot', async () => {
        const env = await saveContextEnv({ id: 'chat-1', name: 'base', message: [message('m1', 'question')] })
        const viewA = await env.chatStorage.fetchChatFromServer('cha-t1', 0, 'chat-1')
        env.appendReply('m2', 'reply from another device')
        const hydrated = await env.chatStorage.ensureChatHydrated([placeholderSlot()] as any, 0, 'cha-t1')
        expect(chatIds(hydrated)).toEqual(['m1', 'm2'])

        viewA!.name = 'edited from view A'
        await env.chatStorage.saveChatToServer('cha-t1', 0, 'chat-1', viewA!).catch(() => undefined)
        expect(chatIds(env.server.chat)).toContain('m2')
        expect(env.server.statuses).not.toContain(428)
    })

    test('[new] d13 save context: queued detached snapshots of an unopened chat never remove a reply the snapshots lack', async () => {
        const env = await saveContextEnv({ id: 'chat-1', name: 'base', message: [message('m1', 'question')] })
        const read = await env.chatStorage.fetchChatFromServer('cha-t2', 0, 'chat-1')
        const first = { ...structuredClone(read!), name: 'plugin write one' }
        const second = { ...structuredClone(read!), name: 'plugin write two' }
        env.appendReply('m2', 'reply the snapshots lack')

        let release!: () => void
        env.server.postHold = new Promise<void>(resolve => { release = resolve })
        const saves = [
            env.chatStorage.saveChatToServer('cha-t2', 0, 'chat-1', first as any),
            env.chatStorage.saveChatToServer('cha-t2', 0, 'chat-1', second as any),
        ]
        await settle()
        release()
        await Promise.allSettled(saves)
        expect(chatIds(env.server.chat)).toContain('m2')
        expect(env.server.statuses).not.toContain(428)
    })

    test('[new] d13 save context: successive autosaves of the open chat succeed without a false conflict', async () => {
        const env = await saveContextEnv({ id: 'chat-1', name: 'base', message: [message('m1', 'question')] })
        const live = await env.chatStorage.ensureChatHydrated([placeholderSlot()] as any, 0, 'cha-t3')
        expect(chatIds(live)).toEqual(['m1'])

        for (const text of ['edit one', 'edit two', 'edit three']) {
            live!.message.push(message(`id-${text}`, text) as any)
            await expect(env.chatStorage.saveChatToServer('cha-t3', 0, 'chat-1', live!)).resolves.toBeUndefined()
        }
        expect(env.server.statuses).toEqual([200, 200, 200])
        expect(env.server.chat.message.map((entry: any) => entry.data)).toEqual(['question', 'edit one', 'edit two', 'edit three'])
    })

    test('[new] d13 save context: a read-only full read between an edit and its save causes no conflict', async () => {
        const env = await saveContextEnv({ id: 'chat-1', name: 'base', message: [message('m1', 'question')] })
        const live = await env.chatStorage.ensureChatHydrated([placeholderSlot()] as any, 0, 'cha-t4')
        live!.message.push(message('m2', 'edit before export') as any)

        await env.chatStorage.fetchChatFromServer('cha-t4', 0, 'chat-1')
        await expect(env.chatStorage.saveChatToServer('cha-t4', 0, 'chat-1', live!)).resolves.toBeUndefined()
        expect(env.server.statuses).toEqual([200])
        expect(chatIds(env.server.chat)).toEqual(['m1', 'm2'])
    })

    test('[new] d13 save context: a discarded hydration does not move the base of the live view past a reply it lacks', async () => {
        const env = await saveContextEnv({ id: 'chat-1', name: 'base', message: [message('m1', 'question')] })
        const live = await env.chatStorage.ensureChatHydrated([placeholderSlot()] as any, 0, 'cha-t5a')
        env.appendReply('m2', 'reply only the discarded hydration saw')

        const discardedSlots: any[] = [placeholderSlot()]
        let release!: () => void
        env.server.getHold = new Promise<void>(resolve => { release = resolve })
        const discarded = env.chatStorage.ensureChatHydrated(discardedSlots, 0, 'cha-t5a')
        await settle()
        discardedSlots.length = 0
        release()
        expect(await discarded).toBeNull()

        live!.name = 'live edit'
        await env.chatStorage.saveChatToServer('cha-t5a', 0, 'chat-1', live!).catch(() => undefined)
        expect(chatIds(env.server.chat)).toContain('m2')
        expect(env.server.statuses).not.toContain(428)
    })

    test('[new] d13 save context: a discarded hydration of an unchanged chat leaves the live save conflict-free', async () => {
        const env = await saveContextEnv({ id: 'chat-1', name: 'base', message: [message('m1', 'question')] })
        const live = await env.chatStorage.ensureChatHydrated([placeholderSlot()] as any, 0, 'cha-t5b')

        const discardedSlots: any[] = [placeholderSlot()]
        let release!: () => void
        env.server.getHold = new Promise<void>(resolve => { release = resolve })
        const discarded = env.chatStorage.ensureChatHydrated(discardedSlots, 0, 'cha-t5b')
        await settle()
        discardedSlots.length = 0
        release()
        expect(await discarded).toBeNull()

        live!.name = 'live edit'
        await expect(env.chatStorage.saveChatToServer('cha-t5b', 0, 'chat-1', live!)).resolves.toBeUndefined()
        expect(env.server.statuses).toEqual([200])
        expect(env.server.chat.name).toBe('live edit')
    })

    test('[new] d6 plugin base: a plugin write of a cloned view does not erase a reply added elsewhere and hydrated into the slot meanwhile', async () => {
        const env = await saveContextEnv({ id: 'chat-1', name: 'base', message: [message('m1', 'question')] })
        const plugin = await pluginApiEnv('cha-p1')
        const read = await plugin.api.getChatFromIndex(0, 0)
        expect(chatIds(read)).toEqual(['m1'])
        env.appendReply('m2', 'reply from another device')
        const hydrated = await env.chatStorage.ensureChatHydrated(plugin.chats() as any, 0, 'cha-p1')
        expect(chatIds(hydrated)).toEqual(['m1', 'm2'])

        const written = structuredClone(read)
        written.message.push(message('p1', 'plugin message'))
        await plugin.api.setChatToIndex(0, 0, written).catch(() => undefined)
        expect(chatIds(env.server.chat)).toContain('m2')
        expect(chatIds(env.server.chat)).toContain('p1')
        expect(env.server.statuses).not.toContain(428)
    })

    test('[new] d6 plugin base: a plugin write after a plugin read with no remote change saves without conflict', async () => {
        const env = await saveContextEnv({ id: 'chat-1', name: 'base', message: [message('m1', 'question')] })
        const plugin = await pluginApiEnv('cha-p2')
        const read = await plugin.api.getChatFromIndex(0, 0)
        const written = structuredClone(read)
        written.message.push(message('p1', 'plugin message'))
        await expect(plugin.api.setChatToIndex(0, 0, written)).resolves.toBeUndefined()
        expect(env.server.statuses).toEqual([200])
        expect(chatIds(env.server.chat)).toEqual(['m1', 'p1'])
    })

    test('[new] d13 plugin base: a plugin write to a chat it never read adopts the server copy as base and saves without 428', async () => {
        const env = await saveContextEnv({ id: 'chat-1', name: 'base', message: [message('m1', 'question')] })
        const plugin = await pluginApiEnv('cha-p3')
        const written = { id: 'chat-1', name: 'base', message: [message('m1', 'question'), message('p1', 'plugin message')] }
        await expect(plugin.api.setChatToIndex(0, 0, written)).resolves.toBeUndefined()
        expect(env.server.statuses).not.toContain(428)
        expect(chatIds(env.server.chat)).toEqual(['m1', 'p1'])
    })

    // A server holding one chat per index of the character `chaId`, with the same
    // revision rules as saveContextEnv, and a plugin API over placeholder slots.
    async function multiChatPluginEnv(chaId: string, count: number) {
        vi.resetModules()
        const storageModule = await import('./nodeStorage')
        const chatStorage = await import('./chatStorage')
        const { forageStorage } = await import('../globalApi.svelte') as any
        const codec = (await import('../../../server/node/utils.cjs')).default
        const { createHash } = await import('node:crypto')
        const zlib = await import('node:zlib')
        const revisionOf = (chat: unknown) => createHash('sha256').update(Buffer.from(codec.encodeRisuSaveLegacy(chat))).digest('hex')
        const chats = new Map<number, any>()
        for (let index = 0; index < count; index++) {
            chats.set(index, { id: `chat-${index}`, name: `base-${index}`, message: [message(`m${index}`, `question ${index}`)] })
        }
        const statuses: number[] = []
        const storage = new storageModule.NodeStorage({ invalidate: vi.fn() } as any)
        ;(storage as any).chatDeltaSupported = false
        ;(storage as any).authFetch = vi.fn(async (url: string, init: RequestInit = {}) => {
            const index = Number(String(url).split('/').pop())
            const current = chats.get(index)
            if (!init.method || init.method === 'GET') {
                if (!current) return new Response('{}', { status: 404 })
                return new Response(new Uint8Array(codec.encodeRisuSaveLegacy(current)).buffer, { status: 200, headers: { 'x-chat-revision': revisionOf(current) } })
            }
            const headers: Record<string, string> = Object.fromEntries(
                Object.entries((init.headers ?? {}) as Record<string, string>).map(([key, value]) => [key.toLowerCase(), value]))
            let body = Buffer.from(init.body as Uint8Array)
            if (headers['content-encoding'] === 'gzip') body = zlib.gunzipSync(body)
            const respond = (status: number, payload: unknown = {}, extra: Record<string, string> = {}) => {
                statuses.push(status)
                return new Response(JSON.stringify(payload), { status, headers: extra })
            }
            const sentBase = headers['x-chat-base-revision']
            if (headers['if-none-match'] === '*') {
                if (current) return respond(412)
            } else if (current) {
                if (sentBase === undefined) return respond(428)
                if (sentBase !== revisionOf(current)) return respond(409, { currentRevision: revisionOf(current) })
            }
            const next = await codec.decodeRisuSave(body)
            chats.set(index, next)
            return respond(200, {}, { 'x-chat-revision': revisionOf(next) })
        })
        forageStorage.realStorage = storage
        const plugin = await pluginApiEnv(chaId)
        const stores = await import('../stores.svelte') as any
        stores.DBState.db.characters['0'].chats = Array.from({ length: count }, (_, index) => ({ id: `chat-${index}`, name: `slot-${index}`, message: [], _placeholder: true }))
        return {
            chats,
            statuses,
            chatStorage,
            plugin,
            appendReply: (index: number, id: string, data: string) => {
                const chat = chats.get(index)
                chats.set(index, { ...chat, message: [...chat.message, message(id, data)] })
            },
        }
    }

    test('[new] d6 plugin view: a stale clone written to the open chat never loses a reply hydrated into the open slot', async () => {
        const env = await saveContextEnv({ id: 'chat-1', name: 'base', message: [message('m1', 'question')] })
        const plugin = await pluginApiEnv('cha-r4a')
        const stores = await import('../stores.svelte') as any
        stores.selectedCharID.set(0)

        const read = structuredClone(await plugin.api.getChatFromIndex(0, 0))
        expect(chatIds(read)).toEqual(['m1'])
        env.appendReply('m2', 'reply from another device')
        const hydrated = await env.chatStorage.ensureChatHydrated(plugin.chats() as any, 0, 'cha-r4a')
        expect(chatIds(hydrated)).toEqual(['m1', 'm2'])

        const written = structuredClone(read)
        written.message.push(message('p1', 'plugin message'))
        await plugin.api.setChatToIndex(0, 0, written).catch(() => undefined)
        const open = plugin.chats()[0]
        await env.chatStorage.saveChatToServer('cha-r4a', 0, 'chat-1', open, undefined, { live: true }).catch(() => undefined)
        expect(chatIds(env.server.chat)).toContain('m2')
    })

    test('[new] d13 plugin view: a fresh view written after its merged server copy was evicted saves without a conflict', async () => {
        const env = await multiChatPluginEnv('cha-r4b', 8)
        const first = structuredClone(await env.plugin.api.getChatFromIndex(0, 0))
        env.appendReply(0, 'm-reply', 'reply from another device')
        const stale = structuredClone(first)
        stale.message.push(message('p1', 'first plugin message'))
        await env.plugin.api.setChatToIndex(0, 0, stale).catch(() => undefined)
        expect(chatIds(env.chats.get(0))).toContain('m-reply')

        for (let index = 1; index <= 6; index++) await env.plugin.api.getChatFromIndex(0, index)
        const fresh = structuredClone(await env.plugin.api.getChatFromIndex(0, 0))
        expect(chatIds(fresh)).toContain('m-reply')
        fresh.name = 'changed by the plugin'
        await expect(env.plugin.api.setChatToIndex(0, 0, fresh)).resolves.toBeUndefined()
        expect(env.chats.get(0).name).toBe('changed by the plugin')
        expect(chatIds(env.chats.get(0))).toContain('m-reply')
    })

    test('[new] d13 plugin view: a clone whose read record was evicted never replaces a reply added afterwards', async () => {
        const total = 300
        const env = await multiChatPluginEnv('cha-r4c', total)
        const held = structuredClone(await env.plugin.api.getChatFromIndex(0, 0))
        for (let index = 1; index < total; index++) await env.plugin.api.getChatFromIndex(0, index)
        env.appendReply(0, 'm-reply', 'reply from another device')

        held.message.push(message('p1', 'plugin message'))
        await env.plugin.api.setChatToIndex(0, 0, held).catch(() => undefined)
        expect(chatIds(env.chats.get(0))).toContain('m-reply')
    })

    test('[unchanged] d6 plugin view: a write of a read view with one change stores exactly that content', async () => {
        const env = await saveContextEnv({ id: 'chat-1', name: 'base', message: [message('m1', 'question'), message('m2', 'answer')] })
        const plugin = await pluginApiEnv('cha-r4d')
        const read = await plugin.api.getChatFromIndex(0, 0)
        const expected = structuredClone(env.server.chat)
        expected.message[1].data = 'changed answer'
        const written = structuredClone(read)
        written.message[1].data = 'changed answer'
        await plugin.api.setChatToIndex(0, 0, written)
        expect(env.server.chat).toEqual(expected)
    })

    test('[new] d6 plugin view: a stale clone written while the open chat autosave is in flight never loses the user message', async () => {
        const env = await saveContextEnv({ id: 'chat-1', name: 'base', message: [message('m1', 'question')] })
        const plugin = await pluginApiEnv('cha-r5a')
        const stores = await import('../stores.svelte') as any
        stores.selectedCharID.set(0)
        const live = await env.chatStorage.ensureChatHydrated(plugin.chats() as any, 0, 'cha-r5a')
        expect(chatIds(live)).toEqual(['m1'])

        const read = structuredClone(await plugin.api.getChatFromIndex(0, 0))
        const open = plugin.chats()[0]
        open.message.push(message('u1', 'message typed by the user'))
        let release!: () => void
        env.server.postHold = new Promise<void>(resolve => { release = resolve })
        const autosave = env.chatStorage.saveChatToServer('cha-r5a', 0, 'chat-1', open, undefined, { live: true }).catch(() => undefined)
        await settle()

        const written = structuredClone(read)
        written.message.push(message('p1', 'plugin message'))
        const pluginWrite = plugin.api.setChatToIndex(0, 0, written).catch(() => undefined)
        await settle()
        release()
        await autosave
        await pluginWrite
        await env.chatStorage.saveChatToServer('cha-r5a', 0, 'chat-1', plugin.chats()[0], undefined, { live: true }).catch(() => undefined)
        expect(chatIds(env.server.chat)).toContain('u1')
    })

    test('[new] d13 plugin view: writing the same read object twice to the open chat saves both writes without a conflict', async () => {
        const env = await saveContextEnv({ id: 'chat-1', name: 'base', message: [message('m1', 'question')] })
        const plugin = await pluginApiEnv('cha-r5b')
        const stores = await import('../stores.svelte') as any
        stores.selectedCharID.set(0)
        await env.chatStorage.ensureChatHydrated(plugin.chats() as any, 0, 'cha-r5b')

        const held = structuredClone(await plugin.api.getChatFromIndex(0, 0))
        held.name = 'first name'
        await plugin.api.setChatToIndex(0, 0, structuredClone(held))
        await expect(env.chatStorage.saveChatToServer('cha-r5b', 0, 'chat-1', plugin.chats()[0], undefined, { live: true })).resolves.toBeUndefined()
        expect(env.server.chat.name).toBe('first name')

        held.name = 'second name'
        await expect(plugin.api.setChatToIndex(0, 0, structuredClone(held))).resolves.toBeUndefined()
        await expect(env.chatStorage.saveChatToServer('cha-r5b', 0, 'chat-1', plugin.chats()[0], undefined, { live: true })).resolves.toBeUndefined()
        expect(env.server.statuses).not.toContain(409)
        expect(env.server.statuses).not.toContain(428)
        expect(env.server.chat.name).toBe('second name')
    })

    test('[new] d8 save intent: an update of a chat deleted elsewhere is rejected and never recreated', async () => {
        const env = await multiChatPluginEnv('cha-r5c', 1)
        env.chats.delete(0)
        const chat = { id: 'chat-0', name: 'edited', message: [message('m0', 'question 0')], fmIndex: -1 }
        await expect(env.chatStorage.saveChatToServer('cha-r5c', 0, 'chat-0', chat as any, 'update')).rejects.toBeDefined()
        expect(env.chats.has(0)).toBe(false)
    })

    test('[unchanged] d8 save intent: an unclassified save of a chat the server lacks still creates it', async () => {
        const env = await multiChatPluginEnv('cha-r5d', 1)
        env.chats.delete(0)
        const chat = { id: 'chat-0', name: 'brand new', message: [message('m0', 'question 0')], fmIndex: -1 }
        await env.chatStorage.saveChatToServer('cha-r5d', 0, 'chat-0', chat as any)
        expect(env.chats.get(0)?.name).toBe('brand new')
    })
})
