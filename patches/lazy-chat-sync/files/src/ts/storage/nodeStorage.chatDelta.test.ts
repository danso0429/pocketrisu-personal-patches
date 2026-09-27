import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('src/lang', () => ({ language: {} }))
vi.mock('../alert', () => ({
    alertInput: vi.fn(),
    waitAlert: vi.fn(),
    notifyError: vi.fn(),
}))
vi.mock('./database.svelte', () => ({
    appVer: 'test-app',
    nodeOnlyVer: 'test-node',
    normalizeChat: (chat: any) => chat,
}))
vi.mock('./risuSave', () => ({
    encodeRisuSaveLegacy: (value: unknown) =>
        new TextEncoder().encode(JSON.stringify(value)),
    decodeRisuSave: async (bytes: Uint8Array) =>
        JSON.parse(new TextDecoder().decode(bytes)),
}))

const { ChatConflictError, NodeStorage } = await import('./nodeStorage')
const { classifyChatSaveIntent } = await import('./chatSaveIntent')
const chatDelta = (await import('../../../server/node/chatDelta.cjs')).default

const fakeStartupCache = {
    probe: vi.fn(async () => null),
    resolveNotModified: vi.fn(async () => null),
    storeAuthoritative: vi.fn(async () => ({ rawStored: true, decodedStored: true })),
    recordPatch: vi.fn(async () => 'recorded'),
    invalidate: vi.fn(async () => undefined),
}

function chat(messages: Array<{ role: string, data: string }>) {
    return { id: 'chat-1', name: 'Chat', message: messages }
}

function makeStorage(responses: Array<Response | Error>) {
    const storage = new NodeStorage(fakeStartupCache as any)
    const authFetch = vi.fn(async (
        _input: RequestInfo | URL,
        _init: RequestInit = {},
    ): Promise<Response> => {
        const response = responses.shift()
        if (!response) throw new Error('Unexpected request')
        if (response instanceof Error) throw response
        return response
    })
    ;(storage as any).authFetch = authFetch
    return { storage, authFetch }
}

function seedRevision(storage: InstanceType<typeof NodeStorage>, snapshot: any | null) {
    if (snapshot) {
        ;(storage as any).rememberChatSyncState('char-1|chat-1', 'revision-1', snapshot, JSON.stringify(snapshot).length)
        return
    }
    ;(storage as any).chatSyncStates.set('char-1|chat-1', {
        revision: 'revision-1',
        snapshot: snapshot ? structuredClone(snapshot) : null,
        encodedBytes: snapshot ? JSON.stringify(snapshot).length : 0,
    })
}

function serverChatResponse(value: unknown, revision: string, status = 200) {
    return new Response(JSON.stringify(value), {
        status,
        headers: {
            'content-type': 'application/octet-stream',
            'x-chat-revision': revision,
        },
    })
}

describe('NodeStorage database invariant metadata', () => {
    test('preserves an exact missing full-chat identity from a validation rejection', async () => {
        const { storage } = makeStorage([
            new Response(JSON.stringify({
                code: 'DB_INVARIANT_REJECTED',
                detail: 'missing payload',
                currentEtag: 'etag-current',
                missingFullChat: { chaId: 'char-1', chatId: 'chat-new' },
            }), { status: 409, headers: { 'content-type': 'application/json' } }),
        ])

        await expect(storage.patchItem('database/database.bin', {
            patch: [],
            expectedHash: 'etag-old',
        })).resolves.toMatchObject({
            success: false,
            validationRejected: true,
            conflict: false,
            missingFullChat: { chaId: 'char-1', chatId: 'chat-new' },
        })
    })

    test('drops malformed missing payload metadata while preserving the rejection', async () => {
        const { storage } = makeStorage([
            new Response(JSON.stringify({
                code: 'DB_INVARIANT_REJECTED',
                detail: 'missing payload',
                missingFullChat: { chaId: 1, chatId: null },
            }), { status: 409, headers: { 'content-type': 'application/json' } }),
        ])

        const result = await storage.patchItem('database/database.bin', {
            patch: [],
            expectedHash: 'etag-old',
        })
        expect(result.validationRejected).toBe(true)
        expect(result.missingFullChat).toBeUndefined()
    })
})

describe('NodeStorage chat revision safety', () => {
    beforeEach(() => vi.clearAllMocks())

    test('does not serialize the private retry snapshot with an error', () => {
        const error = new ChatConflictError('conflict', 'revision-2', {
            revision: 'revision-2', chat: { privateText: 'private-chat-text' }, encodedBytes: 20,
        })
        expect(error.serverSnapshot).toBeDefined()
        expect(Object.keys(error)).not.toContain('serverSnapshot')
        expect(JSON.stringify(error)).not.toContain('private-chat-text')
    })

    test('does not retry a conflict when the authoritative chat revision did not advance', async () => {
        const original = chat([{ role: 'user', data: 'question' }])
        const { storage, authFetch } = makeStorage([
            new Response('{"error":"writer unavailable"}', { status: 409 }), serverChatResponse(original, 'revision-1'),
        ])
        seedRevision(storage, original)
        await expect(storage.saveChatContent('char-1', 0, 'chat-1', { ...original, name: 'edit' }))
            .rejects.toBeInstanceOf(ChatConflictError)
        expect(authFetch).toHaveBeenCalledTimes(2)
    })

    test('publishes a rebased server answer and preserves it on the next save', async () => {
        const original = { id: 'chat-1', name: 'Chat', message: [
            { role: 'char', chatId: 'earlier', data: 'before' },
            { role: 'user', chatId: 'input', data: 'x'.repeat(12_000) },
        ] }
        const local = structuredClone(original)
        local.message[0].data += ' edited'
        const remote = structuredClone(original)
        remote.message.push({ role: 'char', chatId: 'answer', data: 'server answer' })
        const success = (revision: string) => new Response(JSON.stringify({ revision }), { headers: { 'x-chat-revision': revision } })
        const { storage, authFetch } = makeStorage([
            new Response('{}', { status: 409 }), serverChatResponse(remote, 'revision-2'), success('revision-3'), success('revision-4'),
        ])
        seedRevision(storage, original)
        await storage.saveChatContent('char-1', 0, 'chat-1', local)
        const rebasedBody = JSON.parse(String(authFetch.mock.calls[2][1].body))
        expect(rebasedBody.baseRevision).toBe('revision-2')
        const first = chatDelta.applyChatDelta(remote, rebasedBody.patch, 'chat-1')
        expect(first.message.map((m: any) => m.chatId)).toEqual(['earlier', 'input', 'answer'])
        expect(first.message[0].data).toBe(local.message[0].data)
        expect(local.message).toHaveLength(3)
        local.message[0].data += ' again'
        await storage.saveChatContent('char-1', 0, 'chat-1', local)
        const nextBody = JSON.parse(String(authFetch.mock.calls[3][1].body))
        const second = chatDelta.applyChatDelta(first, nextBody.patch, 'chat-1')
        expect(nextBody.baseRevision).toBe('revision-3')
        expect(second.message.at(-1).chatId).toBe('answer')
        expect(second.message[0].data).toBe(local.message[0].data)
    })

    test('preserves an in-flight same-field edit after a lost ACK and remote append', async () => {
        const original = chat([{ role: 'user', data: 'question' }])
        const local = { ...structuredClone(original), name: 'sent edit' }
        const remote = { ...structuredClone(local), message: [...original.message, { role: 'char', data: 'answer' }] }
        const { storage, authFetch } = makeStorage([
            new Error('lost ACK'), serverChatResponse(remote, 'revision-2'), new Response('{"revision":"revision-3"}'),
        ])
        seedRevision(storage, original)
        ;(storage as any).chatDeltaSupported = false
        const fetch = authFetch.getMockImplementation()!
        authFetch.mockImplementation(async (...args) => {
            if (authFetch.mock.calls.length === 1) local.name = 'newer unsaved edit'
            return fetch(...args)
        })
        await storage.saveChatContent('char-1', 0, 'chat-1', local)
        expect(local.name).toBe('newer unsaved edit')
        expect(local.message).toEqual(remote.message)
        const saved = JSON.parse(new TextDecoder().decode(authFetch.mock.calls[2][1].body as Uint8Array))
        expect(saved.name).toBe('newer unsaved edit')
    })

    test.each(['streaming', 'detached slot'])('does not publish into a %s and can retry after it clears', async (condition) => {
        const original = chat([{ role: 'user', data: 'question' }])
        const local = { ...structuredClone(original), name: 'edit', isStreaming: condition === 'streaming' }
        const remote = chat([...original.message, { role: 'char', data: 'answer' }])
        const { storage } = makeStorage([
            new Response('{}', { status: 412 }), serverChatResponse(remote, 'revision-2'),
            new Response('{}', { status: 412 }), serverChatResponse(remote, 'revision-2'), new Response('{"revision":"revision-3"}'),
        ])
        seedRevision(storage, original)
        ;(storage as any).chatDeltaSupported = false
        await expect(storage.saveChatContent('char-1', 0, 'chat-1', local, 'update', () => condition !== 'detached slot')).rejects.toBeInstanceOf(ChatConflictError)
        expect(local.message).toEqual(original.message)
        expect((storage as any).chatSyncStates.get('char-1|chat-1').revision).toBe('revision-1')
        local.isStreaming = false
        await storage.saveChatContent('char-1', 0, 'chat-1', local)
        expect(local.message).toEqual(remote.message)
    })

    test('rebases the full-save 412 path while retaining CAS and a server append', async () => {
        const original = chat([{ role: 'user', data: 'question' }])
        const local = { ...original, name: 'local name' }
        const remote = chat([...original.message, { role: 'char', data: 'answer' }])
        const { storage, authFetch } = makeStorage([
            new Response('{}', { status: 412 }), serverChatResponse(remote, 'revision-2'),
            new Response('{"revision":"revision-3"}', { headers: { 'x-chat-revision': 'revision-3' } }),
        ])
        seedRevision(storage, original)
        ;(storage as any).chatDeltaSupported = false
        await storage.saveChatContent('char-1', 0, 'chat-1', local)
        const request = authFetch.mock.calls[2][1]
        expect((request.headers as any)['x-chat-base-revision']).toBe('revision-2')
        expect(JSON.parse(new TextDecoder().decode(request.body as Uint8Array)))
            .toMatchObject({ name: 'local name', message: remote.message })
    })

    test('recognizes a lost ACK followed by a server append without replaying the local addition', async () => {
        const original = { id: 'chat-1', name: 'Chat', message: [{ role: 'user', chatId: 'input', data: 'x'.repeat(12_000) }] }
        const local = structuredClone(original)
        local.message.push({ role: 'user', chatId: 'next', data: 'queued input' })
        const remote = structuredClone(local)
        remote.message.splice(1, 0, { role: 'char', chatId: 'answer', data: 'answer' })
        const { storage, authFetch } = makeStorage([new Error('lost ack'), serverChatResponse(remote, 'revision-2')])
        seedRevision(storage, original)
        await storage.saveChatContent('char-1', 0, 'chat-1', local)
        expect(authFetch).toHaveBeenCalledTimes(2)
        expect((storage as any).chatSyncStates.get('char-1|chat-1').snapshot.message)
            .toEqual(remote.message)
    })

    test('does not consume local edits when a rebased write fails', async () => {
        const original = { id: 'chat-1', name: 'Chat', message: [{ role: 'user', chatId: 'input', data: 'x'.repeat(12_000) }] }
        const local = { ...structuredClone(original), name: 'local edit' }
        const remote = structuredClone(original)
        remote.message.push({ role: 'char', chatId: 'answer', data: 'answer' })
        const { storage, authFetch } = makeStorage([
            new Response('{}', { status: 409 }), serverChatResponse(remote, 'revision-2'), new Response('{}', { status: 500 }),
            new Response('{"revision":"revision-3"}', { headers: { 'x-chat-revision': 'revision-3' } }),
        ])
        seedRevision(storage, original)
        await expect(storage.saveChatContent('char-1', 0, 'chat-1', local)).rejects.toThrow()
        await storage.saveChatContent('char-1', 0, 'chat-1', local)
        const body = JSON.parse(String(authFetch.mock.calls[3][1].body))
        const saved = chatDelta.applyChatDelta(remote, body.patch, 'chat-1')
        expect(saved.name).toBe('local edit')
        expect(saved.message.at(-1).chatId).toBe('answer')
    })

    test('continues saving the published answer after opening four other chats evicts the merge snapshot', async () => {
        const original = chat([{ role: 'user', data: 'old view' }])
        const local = { ...structuredClone(original), name: 'edit' }
        const remote = chat([...original.message, { role: 'char', data: 'answer' }])
        const { storage, authFetch } = makeStorage([
            new Response('{}', { status: 412 }), serverChatResponse(remote, 'revision-2'),
            new Response('{"revision":"revision-3"}'), new Response('{"revision":"revision-4"}'),
        ])
        seedRevision(storage, original)
        ;(storage as any).chatDeltaSupported = false
        await storage.saveChatContent('char-1', 0, 'chat-1', local)
        for (let i = 0; i < 5; i++) {
            const other = { ...local, id: 'other-' + i }
            ;(storage as any).rememberChatSyncState('char-1|other-' + i, 'other-revision', other, JSON.stringify(other).length)
        }
        expect((storage as any).chatSyncStates.get('char-1|chat-1')).toMatchObject({ snapshot: null, revision: 'revision-3' })
        local.name = 'next edit'
        await storage.saveChatContent('char-1', 0, 'chat-1', local)
        const request = authFetch.mock.calls[3][1]
        expect((request.headers as any)['x-chat-base-revision']).toBe('revision-3')
        expect(JSON.parse(new TextDecoder().decode(request.body as Uint8Array))).toMatchObject({ name: 'next edit', message: remote.message })
    })

    test('confirms a rebased save without revision metadata and continues saving', async () => {
        const original = chat([{ role: 'user', data: 'question' }])
        const local = { ...original, name: 'edited' }
        const remote = chat([...original.message, { role: 'char', data: 'answer' }])
        const { storage, authFetch } = makeStorage([
            new Response('{}', { status: 412 }), serverChatResponse(remote, 'revision-2'), new Response('{}'),
            serverChatResponse({ ...remote, name: 'edited' }, 'revision-3'), new Response('{"revision":"revision-4"}'),
        ])
        seedRevision(storage, original)
        ;(storage as any).chatDeltaSupported = false
        await storage.saveChatContent('char-1', 0, 'chat-1', local)
        local.name = 'again'
        await storage.saveChatContent('char-1', 0, 'chat-1', local)
        expect(local.message).toEqual(remote.message)
        expect(authFetch).toHaveBeenCalledTimes(5)
    })

    test.each(['create', 'update'] as const)('recovers an evicted unversioned %s acknowledgement after confirmation failed', async (intent) => {
        const original = chat([{ role: 'user', data: 'question' }])
        const local = { ...structuredClone(original), name: 'sent edit' }
        const responses = [new Response('{}'), new Error('confirmation unavailable'), serverChatResponse(local, 'revision-2'), new Response('{"revision":"revision-3"}')]
        if (intent === 'create') responses.unshift(new Response('{}', { status: 404 }))
        const { storage, authFetch } = makeStorage(responses)
        if (intent === 'update') seedRevision(storage, original)
        ;(storage as any).chatDeltaSupported = false
        await storage.saveChatContent('char-1', 0, 'chat-1', local, intent)
        for (let index = 0; index < 4; index++) {
            const other = { id: `other-${index}`, message: [] }
            ;(storage as any).rememberChatSyncState(`char-1|${other.id}`, 'other', other, 100)
        }
        const evicted = (storage as any).chatSyncStates.get('char-1|chat-1')
        expect(evicted.snapshot).toBeNull()
        expect(evicted.unknownAck).toBe(true)
        expect(evicted.acknowledgedViewFingerprint).toHaveLength(64)
        local.name = 'later edit'
        await storage.saveChatContent('char-1', 0, 'chat-1', local)
        const request = authFetch.mock.calls.at(-1)![1]
        expect((request.headers as any)['x-chat-base-revision']).toBe('revision-2')
        expect(JSON.parse(new TextDecoder().decode(request.body as Uint8Array)).name).toBe('later edit')
    })

    test('confirms an already stored unversioned payload without requiring view publication', async () => {
        const original = chat([{ role: 'user', data: 'question' }])
        const { storage, authFetch } = makeStorage([serverChatResponse(original, 'revision-2')])
        ;(storage as any).rememberChatSyncState('char-1|chat-1', '', original, JSON.stringify(original).length)
        ;(storage as any).chatSyncStates.get('char-1|chat-1').unknownAck = true
        await storage.saveChatContent('char-1', 0, 'chat-1', structuredClone(original), 'update', () => false)
        expect(authFetch).toHaveBeenCalledTimes(1)
        expect((storage as any).chatSyncStates.get('char-1|chat-1').revision).toBe('revision-2')
    })

    test('reconstructs an evicted unversioned view from unchanged local content before adopting a remote append', async () => {
        const original = chat([{ role: 'user', data: 'question' }])
        const local = { ...structuredClone(original), name: 'sent edit' }
        const remote = { ...structuredClone(local), message: [...original.message, { role: 'char', data: 'answer' }] }
        const { storage } = makeStorage([new Response('{}'), new Error('confirmation unavailable'), serverChatResponse(remote, 'revision-2'), new Response('{"revision":"revision-3"}')])
        seedRevision(storage, original)
        ;(storage as any).chatDeltaSupported = false
        await storage.saveChatContent('char-1', 0, 'chat-1', local)
        for (let index = 0; index < 4; index++) {
            ;(storage as any).rememberChatSyncState(`char-1|other-${index}`, 'other', { id: `other-${index}`, message: [] }, 100)
        }
        await storage.saveChatContent('char-1', 0, 'chat-1', local)
        expect(local.message).toEqual(remote.message)
    })

    test('uses the write acknowledgment rather than a concurrent cache refresh revision', async () => {
        const original = chat([{ role: 'user', data: 'question' }])
        const local = { ...original, name: 'edited' }
        const remote = chat([...original.message, { role: 'char', data: 'answer' }])
        const { storage } = makeStorage([
            new Response('{}', { status: 412 }), serverChatResponse(remote, 'revision-2'),
            new Response('{"revision":"revision-3"}', { headers: { 'x-chat-revision': 'revision-3' } }),
        ])
        seedRevision(storage, original)
        ;(storage as any).chatDeltaSupported = false
        const run = (storage as any).saveChatContentAttempt.bind(storage)
        ;(storage as any).saveChatContentAttempt = async (...args: any[]) => {
            const acknowledgment = await run(...args)
            const later = { ...local, message: [...remote.message, { role: 'char', data: 'later answer' }] }
            ;(storage as any).rememberChatSyncState('char-1|chat-1', 'revision-4', later, JSON.stringify(later).length)
            return acknowledgment
        }
        await storage.saveChatContent('char-1', 0, 'chat-1', local)
        const remembered = (storage as any).chatSyncStates.get('char-1|chat-1')
        expect(remembered.revision).toBe('revision-3')
        expect(remembered.snapshot).toEqual({ ...remote, name: 'edited' })
    })

    test('bounds retries when the server continues appending between every save attempt', async () => {
        const original = { id: 'chat-1', name: 'Chat', message: [{ role: 'user', chatId: 'input', data: 'x'.repeat(12_000) }] }
        const remote = structuredClone(original)
        const responses: Response[] = []
        for (let i = 0; i < 3; i++) {
            remote.message.push({ role: 'char', chatId: 'answer-' + i, data: 'answer' })
            responses.push(new Response('{}', { status: 409 }), serverChatResponse(remote, 'revision-' + (i + 2)))
        }
        const { storage, authFetch } = makeStorage(responses)
        seedRevision(storage, original)
        await expect(storage.saveChatContent('char-1', 0, 'chat-1', { ...original, name: 'local edit' }))
            .rejects.toBeInstanceOf(ChatConflictError)
        expect(authFetch).toHaveBeenCalledTimes(6)
    })

    test('a read-only fetch does not consume the old client view after rebase', async () => {
        const original = chat([{ role: 'user', data: 'question' }])
        const local = { ...original, name: 'edited' }
        const remote = chat([...original.message, { role: 'char', data: 'answer' }])
        const accepted = { ...remote, name: 'edited' }
        const { storage, authFetch } = makeStorage([
            new Response('{}', { status: 412 }), serverChatResponse(remote, 'revision-2'),
            new Response('{"revision":"revision-3"}', { headers: { 'x-chat-revision': 'revision-3' } }),
            serverChatResponse(accepted, 'revision-3'),
            new Response('{"revision":"revision-4"}', { headers: { 'x-chat-revision': 'revision-4' } }),
        ])
        seedRevision(storage, original)
        ;(storage as any).chatDeltaSupported = false
        await storage.saveChatContent('char-1', 0, 'chat-1', local)
        await storage.fetchChatContent('char-1', 0, 'chat-1')
        local.name = 'edited again'
        ;(storage as any).chatDeltaSupported = false
        await storage.saveChatContent('char-1', 0, 'chat-1', local)
        const saved = JSON.parse(new TextDecoder().decode(authFetch.mock.calls[4][1].body as Uint8Array))
        expect(saved.message).toEqual(remote.message)
        expect(saved.name).toBe('edited again')
    })

    test('preserves an intentional deletion after the UI adopts an answer during a save', async () => {
        const original = chat([{ role: 'user', data: 'question' }])
        const oldView = { ...structuredClone(original), name: 'old edit' }
        const remote = chat([...original.message, { role: 'char', data: 'answer' }])
        const firstSaved = { ...remote, name: 'old edit' }
        const { storage, authFetch } = makeStorage([
            new Response('{}', { status: 412 }), serverChatResponse(remote, 'revision-2'),
            new Response('{"revision":"revision-3"}', { headers: { 'x-chat-revision': 'revision-3' } }),
            new Response('{}', { status: 412 }), serverChatResponse(firstSaved, 'revision-3'),
            new Response('{"revision":"revision-4"}', { headers: { 'x-chat-revision': 'revision-4' } }),
        ])
        let release!: () => void, entered!: () => void, posts = 0
        const gate = new Promise<void>(resolve => { release = resolve })
        const pending = new Promise<void>(resolve => { entered = resolve })
        ;(storage as any).authFetch = async (url: RequestInfo | URL, init: RequestInit) => {
            if (init.method === 'POST' && ++posts === 2) { entered(); await gate }
            return authFetch(url, init)
        }
        seedRevision(storage, original)
        ;(storage as any).chatDeltaSupported = false
        const saving = storage.saveChatContent('char-1', 0, 'chat-1', oldView)
        const rejected = expect(saving).rejects.toThrow(/view changed/)
        await pending
        storage.rememberChatContentSnapshot('char-1', 'chat-1', { revision: 'revision-2', chat: remote, encodedBytes: JSON.stringify(remote).length })
        const displayed = structuredClone(remote)
        displayed.message.pop()
        release()
        await rejected
        ;(storage as any).chatDeltaSupported = false
        await storage.saveChatContent('char-1', 0, 'chat-1', displayed)
        const saved = JSON.parse(new TextDecoder().decode(authFetch.mock.calls[5][1].body as Uint8Array))
        expect(saved.message).toEqual(original.message)
        expect(saved.name).toBe('old edit')
        expect((storage as any).chatSaveAdoptions.size).toBe(0)
    })

    test.each(['database replacement', 'view adoption'])('does not rebase active or queued old saves across %s', async (transition) => {
        const { storage, authFetch } = makeStorage([])
        const original = chat([{ role: 'user', data: 'question' }])
        seedRevision(storage, original)
        ;(storage as any).chatDeltaSupported = false
        let release!: (value: Response) => void, entered!: () => void
        const pending = new Promise<void>(resolve => { entered = resolve })
        authFetch.mockImplementation(async () => { entered(); return new Promise<Response>(resolve => { release = resolve }) })
        const first = storage.saveChatContent('char-1', 0, 'chat-1', { ...original, name: 'first' })
        const firstRejected = expect(first).rejects.toThrow(/view changed/)
        const second = storage.saveChatContent('char-1', 0, 'chat-1', { ...original, name: 'second' })
        const secondRejected = expect(second).rejects.toThrow(/view changed/)
        await pending
        if (transition === 'database replacement') await (storage as any).invalidateAfterDatabaseReplacement()
        else storage.rememberChatContentSnapshot('char-1', 'chat-1', { revision: 'revision-new-view', chat: original, encodedBytes: JSON.stringify(original).length })
        release(new Response('{"revision":"revision-2"}', { headers: { 'x-chat-revision': 'revision-2' } }))
        await firstRejected; await secondRejected
        expect(authFetch).toHaveBeenCalledTimes(1)
        expect((storage as any).chatSaveAdoptions.size).toBe(0)
        if (transition === 'view adoption') expect((storage as any).chatSyncStates.get('char-1|chat-1').revision).toBe('revision-new-view')
    })

    test('a delta conflict never falls through to a full overwrite', async () => {
        const original = chat([{ role: 'char', data: 'x'.repeat(12_000) }])
        const changed = chat([
            ...original.message,
            { role: 'user', data: 'small append' },
        ])
        const remote = chat([
            ...original.message,
            { role: 'user', data: 'different remote append' },
        ])
        const conflict = new Response(JSON.stringify({
            error: 'Chat revision mismatch',
            currentRevision: 'revision-2',
        }), {
            status: 409,
            headers: {
                'content-type': 'application/json',
                'x-chat-revision': 'revision-2',
            },
        })
        const { storage, authFetch } = makeStorage([
            conflict,
            serverChatResponse(remote, 'revision-2'),
        ])
        seedRevision(storage, original)

        await expect(storage.saveChatContent('char-1', 0, 'chat-1', changed))
            .rejects.toBeInstanceOf(ChatConflictError)
        expect(authFetch).toHaveBeenCalledTimes(2)
        expect(String(authFetch.mock.calls[0]![0])).toContain('/patch')
        expect(String(authFetch.mock.calls[1]![0])).not.toContain('/patch')
    })

    test('a revision-only state uses CAS for a full save', async () => {
        const success = new Response(JSON.stringify({ revision: 'revision-2' }), {
            status: 200,
            headers: {
                'content-type': 'application/json',
                'x-chat-revision': 'revision-2',
            },
        })
        const { storage, authFetch } = makeStorage([success])
        seedRevision(storage, null)

        await storage.saveChatContent(
            'char-1',
            0,
            'chat-1',
            chat([{ role: 'user', data: 'full save' }]),
        )

        const [, request] = authFetch.mock.calls[0]!
        expect((request.headers as Record<string, string>)['x-chat-base-revision'])
            .toBe('revision-1')
        expect(String(authFetch.mock.calls[0]![0])).not.toContain('/patch')
    })

    test('an unsupported delta endpoint falls back once but keeps the base revision', async () => {
        const original = chat([{ role: 'char', data: 'x'.repeat(12_000) }])
        const changed = chat([
            ...original.message,
            { role: 'user', data: 'small append' },
        ])
        const unsupported = new Response('', { status: 405 })
        const success = new Response(JSON.stringify({ revision: 'revision-2' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        })
        const { storage, authFetch } = makeStorage([unsupported, success])
        seedRevision(storage, original)

        await storage.saveChatContent('char-1', 0, 'chat-1', changed)

        expect(authFetch).toHaveBeenCalledTimes(2)
        expect((authFetch.mock.calls[1]![1].headers as Record<string, string>)['x-chat-base-revision'])
            .toBe('revision-1')
    })

    test('recovers a lost delta acknowledgement when a fresh GET matches the desired snapshot', async () => {
        const original = chat([{ role: 'char', data: 'x'.repeat(12_000) }])
        const changed = chat([
            ...original.message,
            { role: 'user', data: 'small append' },
        ])
        const { storage, authFetch } = makeStorage([
            new TypeError('connection reset after commit'),
            serverChatResponse(changed, 'revision-2'),
        ])
        seedRevision(storage, original)

        await expect(storage.saveChatContent('char-1', 0, 'chat-1', changed))
            .resolves.toBeUndefined()
        expect(authFetch).toHaveBeenCalledTimes(2)
        expect(String(authFetch.mock.calls[0]![0])).toContain('/patch')
        expect(String(authFetch.mock.calls[1]![0])).not.toContain('/patch')
        expect((storage as any).chatSyncStates.get('char-1|chat-1').revision)
            .toBe('revision-2')
    })

    test('treats a delta 409 as a lost ACK when the authoritative chat already matches', async () => {
        const original = chat([{ role: 'char', data: 'x'.repeat(12_000) }])
        const changed = chat([
            ...original.message,
            { role: 'user', data: 'small append' },
        ])
        const conflict = new Response(JSON.stringify({
            error: 'Chat revision mismatch',
            currentRevision: 'revision-2',
        }), {
            status: 409,
            headers: { 'content-type': 'application/json' },
        })
        const { storage, authFetch } = makeStorage([
            conflict,
            serverChatResponse(changed, 'revision-2'),
        ])
        seedRevision(storage, original)

        await expect(storage.saveChatContent('char-1', 0, 'chat-1', changed))
            .resolves.toBeUndefined()
        expect(authFetch).toHaveBeenCalledTimes(2)
        expect((storage as any).chatSyncStates.get('char-1|chat-1').revision)
            .toBe('revision-2')
    })

    test('keeps a real delta conflict when the authoritative chat differs', async () => {
        const original = chat([{ role: 'char', data: 'x'.repeat(12_000) }])
        const changed = chat([
            ...original.message,
            { role: 'user', data: 'local append' },
        ])
        const remote = chat([
            ...original.message,
            { role: 'user', data: 'remote append' },
        ])
        const conflict = new Response(JSON.stringify({
            error: 'Chat revision mismatch',
            currentRevision: 'revision-2',
        }), {
            status: 409,
            headers: { 'content-type': 'application/json' },
        })
        const { storage, authFetch } = makeStorage([
            conflict,
            serverChatResponse(remote, 'revision-2'),
        ])
        seedRevision(storage, original)

        await expect(storage.saveChatContent('char-1', 0, 'chat-1', changed))
            .rejects.toBeInstanceOf(ChatConflictError)
        expect(authFetch).toHaveBeenCalledTimes(2)
        expect((storage as any).chatSyncStates.get('char-1|chat-1').revision)
            .toBe('revision-1')
    })

    test('preflights an unknown existing chat and saves it with a seeded revision', async () => {
        const original = chat([{ role: 'char', data: 'server copy' }])
        const changed = chat([{ role: 'char', data: 'local edit' }])
        const success = new Response(JSON.stringify({ revision: 'revision-2' }), {
            status: 200,
            headers: {
                'content-type': 'application/json',
                'x-chat-revision': 'revision-2',
            },
        })
        const { storage, authFetch } = makeStorage([
            serverChatResponse(original, 'revision-1'),
            success,
        ])

        await storage.saveChatContent('char-1', 0, 'chat-1', changed)

        expect(authFetch).toHaveBeenCalledTimes(2)
        const [, saveRequest] = authFetch.mock.calls[1]!
        expect((saveRequest.headers as Record<string, string>)['x-chat-base-revision'])
            .toBe('revision-1')
        expect((saveRequest.headers as Record<string, string>)['if-none-match'])
            .toBeUndefined()
    })

    test('uses an explicit create-only precondition after an authoritative 404', async () => {
        const created = chat([{ role: 'user', data: 'brand new chat' }])
        const success = new Response(JSON.stringify({ revision: 'revision-1' }), {
            status: 200,
            headers: {
                'content-type': 'application/json',
                'x-chat-revision': 'revision-1',
            },
        })
        const { storage, authFetch } = makeStorage([
            new Response('', { status: 404 }),
            success,
        ])

        await storage.saveChatContent('char-1', 0, 'chat-1', created, 'create')

        expect(authFetch).toHaveBeenCalledTimes(2)
        const [, saveRequest] = authFetch.mock.calls[1]!
        expect((saveRequest.headers as Record<string, string>)['if-none-match'])
            .toBe('*')
        expect((saveRequest.headers as Record<string, string>)['x-chat-base-revision'])
            .toBeUndefined()
    })

    test('blocks an update when the authoritative stable ID is absent', async () => {
        const changed = chat([{ role: 'user', data: 'local edit' }])
        const { storage, authFetch } = makeStorage([
            new Response('', { status: 404 }),
        ])

        await expect(storage.saveChatContent(
            'char-1',
            0,
            'chat-1',
            changed,
            'update',
        )).rejects.toBeInstanceOf(ChatConflictError)
        expect(authFetch).toHaveBeenCalledTimes(1)
    })

    test('blocks a create collision instead of converting it into a CAS update', async () => {
        const local = chat([{ role: 'user', data: 'local new chat' }])
        const remote = chat([{ role: 'user', data: 'different remote chat' }])
        const { storage, authFetch } = makeStorage([
            serverChatResponse(remote, 'revision-remote'),
        ])

        await expect(storage.saveChatContent(
            'char-1',
            0,
            'chat-1',
            local,
            'create',
        )).rejects.toBeInstanceOf(ChatConflictError)
        expect(authFetch).toHaveBeenCalledTimes(1)
    })

    test('creates an unshifted chat when index zero is occupied by old server metadata', async () => {
        const baseline = {
            characters: [{
                chaId: 'char-1',
                chats: [{ id: 'chat-old', _stub: true }],
            }],
        }
        const localChats = [
            { id: 'chat-new', name: 'New', message: [{ role: 'user', data: 'hello' }] },
            { id: 'chat-old', name: 'Old', message: [] },
        ]
        const intent = classifyChatSaveIntent(baseline, 'char-1', 'chat-new')
        const serverTarget = chatDelta.resolveChatReadTarget(
            baseline.characters[0],
            0,
            'chat-new',
        )
        const success = new Response(JSON.stringify({ revision: 'revision-new' }), {
            status: 200,
            headers: {
                'content-type': 'application/json',
                'x-chat-revision': 'revision-new',
            },
        })
        const { storage, authFetch } = makeStorage([
            new Response('', { status: serverTarget ? 200 : 404 }),
            success,
        ])

        expect(intent).toBe('create')
        expect(serverTarget).toBeNull()
        await storage.saveChatContent('char-1', 0, 'chat-new', localChats[0], intent)

        const [, saveRequest] = authFetch.mock.calls[1]!
        expect((saveRequest.headers as Record<string, string>)['if-none-match']).toBe('*')
    })

    test('confirms a create whose success acknowledgement was lost', async () => {
        const created = chat([{ role: 'user', data: 'brand new chat' }])
        const { storage, authFetch } = makeStorage([
            new Response('', { status: 404 }),
            new TypeError('connection reset after create commit'),
            serverChatResponse(created, 'revision-created'),
        ])

        await expect(storage.saveChatContent(
            'char-1',
            0,
            'chat-1',
            created,
            'create',
        )).resolves.toBeUndefined()
        expect(authFetch).toHaveBeenCalledTimes(3)
        const [, createRequest] = authFetch.mock.calls[1]!
        expect((createRequest.headers as Record<string, string>)['if-none-match']).toBe('*')
        expect((storage as any).chatSyncStates.get('char-1|chat-1').revision)
            .toBe('revision-created')
    })

    test('keeps a concurrent create collision after the initial 404', async () => {
        const local = chat([{ role: 'user', data: 'local create' }])
        const remote = chat([{ role: 'user', data: 'concurrent remote create' }])
        const collision = new Response(JSON.stringify({
            error: 'Chat already exists',
            currentRevision: 'revision-remote',
        }), {
            status: 412,
            headers: {
                'content-type': 'application/json',
                'x-chat-revision': 'revision-remote',
            },
        })
        const { storage, authFetch } = makeStorage([
            new Response('', { status: 404 }),
            collision,
            serverChatResponse(remote, 'revision-remote'),
        ])

        await expect(storage.saveChatContent(
            'char-1',
            0,
            'chat-1',
            local,
            'create',
        )).rejects.toBeInstanceOf(ChatConflictError)
        expect(authFetch).toHaveBeenCalledTimes(3)
        const [, createRequest] = authFetch.mock.calls[1]!
        expect((createRequest.headers as Record<string, string>)['if-none-match']).toBe('*')
        expect((storage as any).chatSyncStates.has('char-1|chat-1')).toBe(false)
    })

    test('recovers a lost full-save acknowledgement by verifying the server snapshot', async () => {
        const changed = chat([{ role: 'user', data: 'full save' }])
        const { storage, authFetch } = makeStorage([
            new TypeError('connection reset after commit'),
            serverChatResponse(changed, 'revision-2'),
        ])
        seedRevision(storage, null)

        await expect(storage.saveChatContent('char-1', 0, 'chat-1', changed))
            .resolves.toBeUndefined()
        expect(authFetch).toHaveBeenCalledTimes(2)
        expect((storage as any).chatSyncStates.get('char-1|chat-1').revision)
            .toBe('revision-2')
    })
})

describe('NodeStorage startup database revalidation', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        fakeStartupCache.probe.mockResolvedValue(null)
        fakeStartupCache.resolveNotModified.mockResolvedValue(null)
    })

    test('uses a decoded object only after the server confirms its ETag', async () => {
        const cachedDatabase = { characters: [], username: 'cached' }
        fakeStartupCache.probe.mockResolvedValue({ etag: 'db-etag-1', source: 'decoded' } as any)
        fakeStartupCache.resolveNotModified.mockResolvedValue({
            kind: 'decoded',
            etag: 'db-etag-1',
            database: cachedDatabase,
        } as any)
        const { storage, authFetch } = makeStorage([
            new Response(null, { status: 304 }),
        ])

        const loaded = await storage.loadDatabaseForStartup()

        expect(loaded).toMatchObject({
            decoded: cachedDatabase,
            bytes: null,
            etag: 'db-etag-1',
            fromCache: true,
        })
        const request = authFetch.mock.calls[0]![1]
        expect((request.headers as Record<string, string>)['if-none-match'])
            .toBe('db-etag-1')
    })

    test('retries unconditionally when a 304 has no matching cached body', async () => {
        fakeStartupCache.probe.mockResolvedValue({ etag: 'db-etag-1', source: 'raw' } as any)
        fakeStartupCache.resolveNotModified.mockResolvedValue(null)
        const authoritative = new TextEncoder().encode('{"characters":[]}')
        const { storage, authFetch } = makeStorage([
            new Response(null, { status: 304 }),
            new Response(authoritative, {
                status: 200,
                headers: { 'x-db-etag': 'db-etag-2' },
            }),
        ])

        const loaded = await storage.loadDatabaseForStartup()

        expect(authFetch).toHaveBeenCalledTimes(2)
        expect(fakeStartupCache.invalidate).toHaveBeenCalledTimes(1)
        expect(loaded.fromCache).toBe(false)
        expect(loaded.etag).toBe('db-etag-2')
        expect(loaded.bytes).toEqual(authoritative)
        const retryRequest = authFetch.mock.calls[1]![1]
        expect((retryRequest.headers as Record<string, string>)['if-none-match'])
            .toBeUndefined()
    })

    test('flushes pending database metadata and advances the known ETag', async () => {
        const { storage, authFetch } = makeStorage([
            new Response(JSON.stringify({ success: true, etag: 'db-etag-3' }), {
                status: 200,
                headers: {
                    'content-type': 'application/json',
                    'x-db-etag': 'db-etag-3',
                },
            }),
        ])

        await expect(storage.flushDatabase()).resolves.toBe('db-etag-3')
        expect(storage._lastDbEtag).toBe('db-etag-3')
        expect(authFetch).toHaveBeenCalledWith('/api/db/flush', {
            method: 'POST',
        })
    })
})
