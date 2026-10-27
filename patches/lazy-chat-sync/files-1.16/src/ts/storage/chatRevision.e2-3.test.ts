import { describe, expect, test, vi } from 'vitest'
import fs from 'node:fs'

const clientBoundary = vi.hoisted(() => ({
    fetchChatContent: vi.fn(),
    fetchChatContentDelta: vi.fn(),
    saveChatContentDelta: vi.fn(),
    saveChatContent: vi.fn(),
    notifyError: vi.fn(),
}))

vi.mock('src/lang', () => ({ language: {} }))
vi.mock('../alert', () => ({ alertInput: vi.fn(), waitAlert: vi.fn(), notifyError: clientBoundary.notifyError }))
vi.mock('../globalApi.svelte', () => ({ forageStorage: { realStorage: clientBoundary } }))
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
        if (pathName === 'full-fetch') await storage.fetchChatContent('cha-1', 0, 'chat-1')
        if (pathName === 'delta-hydration' || pathName === 'memory-resident') {
            ;((storage as any).rememberChatSyncState?.bind(storage) ?? (() => {}))('cha-1|chat-1', 'acquired-revision', base, bytes.byteLength)
        }
        await storage.saveChatContent('cha-1', 0, 'chat-1', local)
        const post = calls.find(([, init]) => init?.method === 'POST')
        expect(post, 'save POST reached the server boundary').toBeTruthy()
        expect((post[1].headers as any)['x-chat-base-revision']).toBe('acquired-revision')
        if (pathName === 'write-without-read') expect(calls[0][1]?.method).not.toBe('POST')
    })
})
