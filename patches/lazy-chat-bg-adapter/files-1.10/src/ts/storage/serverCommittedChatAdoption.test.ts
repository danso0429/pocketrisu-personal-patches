import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import { orchestrationChatRevision } from '../bgOrchestrationMerge'
import { NodeStorage } from './nodeStorage'

const storageMock = vi.hoisted(() => ({ realStorage: null as any }))
const tickMock = vi.hoisted(() => vi.fn(async () => {}))
const rememberSnapshotMock = vi.hoisted(() => vi.fn())

vi.mock('../globalApi.svelte', () => ({ forageStorage: storageMock }))
vi.mock('src/lang', () => ({ language: {} }))
vi.mock('../alert', () => ({ alertInput: vi.fn(), waitAlert: vi.fn(), notifyError: vi.fn() }))
vi.mock('svelte', () => ({ tick: tickMock }))
vi.mock('./database.svelte', async () => {
    const { readFileSync } = await import('node:fs')
    const ts = await import('typescript')
    const { normalizePageFoldRoleOverrides } = await import('../pagefold/resolve')
    // Run the actual generated normalizer without importing the application's
    // unrelated database bootstrap. Its dependencies and function body stay real.
    const source = ts.createSourceFile('database.svelte.ts', readFileSync('src/ts/storage/database.svelte.ts', 'utf8'), ts.ScriptTarget.ES2022, true)
    const node = source.statements.find(entry => ts.isFunctionDeclaration(entry) && entry.name?.text === 'normalizeChat')
    if (!node) throw new Error('Native normalizeChat declaration missing')
    const emitted = ts.transpileModule(node.getText(source).replace('export function', 'function'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
    }).outputText
    const normalizeChat = new Function('normalizePageFoldRoleOverrides', emitted + '\nreturn normalizeChat')(normalizePageFoldRoleOverrides)
    return { appVer: 'test', nodeOnlyVer: 'test', normalizeChat,
        isChatStub: (value: any) => value?._stub === true && !Array.isArray(value?.message) }
})

const { adoptServerCommittedChat, ensureChatHydrated, isHydrating, peekServerChatSnapshot } = await import('./chatStorage')

function chat(data: string) {
    return {
        id: 'chat-1',
        name: 'Chat',
        message: [{ role: 'user', data, chatId: 'user-1' }],
    } as any
}

describe('server-committed chat adoption', () => {
    it.each(['older-first', 'newer-first', 'edit-between'])('CAP concurrent adoption (%s)', async order => {
        const local = { ...chat('base'), note: '', localLore: [], isStreaming: false }
        const chats = [local]
        const storage = new NodeStorage({ invalidate: vi.fn() } as any)
        storageMock.realStorage = storage
        const pendingReads: Array<(value: any) => void> = []
        vi.spyOn(storage, 'peekChatContentSnapshot').mockImplementation(() => new Promise(resolve => pendingReads.push(resolve)))
        const initial = orchestrationChatRevision(local)
        const older = { ...structuredClone(local), message: [...local.message, { role: 'char', data: 'older', chatId: 'a1' }] }
        const newer = { ...structuredClone(older), message: [...older.message, { role: 'char', data: 'newer', chatId: 'a2' }] }
        const first = adoptServerCommittedChat(chats, 'char-1', 'chat-1', 'r1', [initial], orchestrationChatRevision)
        const second = adoptServerCommittedChat(chats, 'char-1', 'chat-1', 'r2', [initial], orchestrationChatRevision)
        expect(pendingReads).toHaveLength(2)
        if (order === 'newer-first') {
            pendingReads[1]({ chat: newer, revision: 'r2', encodedBytes: 300 })
            expect((await second).adopted).toBe(true)
            pendingReads[0]({ chat: older, revision: 'r1', encodedBytes: 200 })
            expect((await first).adopted).toBe(false)
            expect(chats[0].message).toHaveLength(3)
        } else if (order === 'edit-between') {
            local.note = 'unsaved edit'
            pendingReads[0]({ chat: older, revision: 'r1', encodedBytes: 200 })
            pendingReads[1]({ chat: newer, revision: 'r2', encodedBytes: 300 })
            expect((await first).adopted).toBe(false)
            expect((await second).adopted).toBe(false)
            expect(chats[0]).toBe(local)
            expect(chats[0].note).toBe('unsaved edit')
        } else {
            pendingReads[0]({ chat: older, revision: 'r1', encodedBytes: 200 })
            expect((await first).adopted).toBe(true)
            pendingReads[1]({ chat: newer, revision: 'r2', encodedBytes: 300 })
            expect((await second).adopted).toBe(false)
            expect(chats[0].message).toHaveLength(2)
        }
        expect(isHydrating('char-1', 'chat-1')).toBe(false)
    })
    afterEach(() => vi.useRealTimers())
    it('returns the published slot when a reactive array wraps the assigned object', async () => {
        const before = chat('before')
        const chats = new Proxy([before], {
            set(target, key, value) { return Reflect.set(target, key, key === '0' ? new Proxy(value, {}) : value) },
        })
        storageMock.realStorage = {
            peekChatContentSnapshot: vi.fn(async () => ({ chat: chat('after'), revision: 'current', encodedBytes: 200 })),
            rememberChatContentSnapshot: rememberSnapshotMock,
        }
        const outcome = await adoptServerCommittedChat(chats, 'char-1', 'chat-1', 'current',
            [orchestrationChatRevision(before)], orchestrationChatRevision)
        expect(outcome.adopted).toBe(true)
        expect(outcome.chat).toBe(chats[0])
        expect(outcome.chat).not.toBe(before)
    })

    it.each(['equal', 'edit-during-read', 'save-during-read', 'stale-epoch', 'slot-replaced'])
    ('uses fresh canonical proof without a remembered snapshot (%s)', async state => {
        const local = { ...chat('saved answer'), note: '', localLore: [], isStreaming: false }
        const storage = new NodeStorage({ invalidate: vi.fn() } as any)
        storageMock.realStorage = storage
        const chats = [local]
        let current = true
        const peek = vi.spyOn(storage, 'peekChatContentSnapshot').mockImplementation(async () => {
            const canonical = structuredClone(local)
            if (state === 'edit-during-read') local.note = 'unsaved edit'
            if (state === 'save-during-read') (storage as any).chatSaveTails.set('char-1|chat-1', new Promise(() => {}))
            if (state === 'stale-epoch') current = false
            if (state === 'slot-replaced') chats[0] = structuredClone(local)
            return { chat: canonical, revision: 'current', encodedBytes: 200 }
        })
        const remember = vi.spyOn(storage, 'rememberChatContentSnapshot')
        const outcome = await adoptServerCommittedChat(chats, 'char-1', 'chat-1', 'current',
            ['older'], orchestrationChatRevision, undefined, { isCurrent: () => current })
        expect(outcome.adopted).toBe(state === 'equal')
        if (state === 'equal') expect(outcome.chat).toBe(local)
        if (state !== 'slot-replaced') expect(chats[0]).toBe(local)
        expect(peek).toHaveBeenCalledTimes(1)
        expect(remember).not.toHaveBeenCalled()
        expect(tickMock).not.toHaveBeenCalled()
        expect(isHydrating('char-1', 'chat-1')).toBe(false)
    })

    it('releases hydration on a bounded read and ignores its late snapshot', async () => {
        vi.useFakeTimers()
        const local = chat('old')
        const chats = [local]
        let resolve!: (value: any) => void
        let signal: AbortSignal | undefined
        const storage = new NodeStorage({ invalidate: vi.fn() } as any)
        storageMock.realStorage = storage
        vi.spyOn(storage, 'peekChatContentSnapshot').mockImplementation((_char, _index, _chat, abort) => {
            signal = abort
            return new Promise(r => { resolve = r })
        })
        const remember = vi.spyOn(storage, 'rememberChatContentSnapshot')
        const pending = adoptServerCommittedChat(chats, 'char-1', 'chat-1', 'current',
            [orchestrationChatRevision(local)], orchestrationChatRevision)
        const rejected = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' })
        await vi.advanceTimersByTimeAsync(30_000)
        await rejected
        expect(isHydrating('char-1', 'chat-1')).toBe(false)
        expect(signal?.aborted).toBe(true)
        resolve({ chat: chat('late answer'), revision: 'current', encodedBytes: 200 })
        await Promise.resolve()
        expect(chats[0]).toBe(local)
        expect(remember).not.toHaveBeenCalled()
        expect(tickMock).not.toHaveBeenCalled()
    })

    it.each([false, true])('recognizes an actual cold-hydrated current view without replacing it (stale display flags=%s)', async staleFlags => {
        const { chatRevision } = createRequire(import.meta.url)('../../../server/node/chatDelta.cjs')
        const { encodeRisuSaveLegacy, decodeRisuSave } = createRequire(import.meta.url)('../../../server/node/utils.cjs')
        const base = { ...chat('question'), note: '', localLore: [] }
        const completed = { ...structuredClone(base), message: [...base.message, { role: 'char', chatId: 'answer', data: 'saved answer' }],
            ...(staleFlags ? { isStreaming: true, activeStreamingDisplayOptimizationMode: 'enabled' } : {}) }
        const bytes = encodeRisuSaveLegacy(completed)
        const wire = await decodeRisuSave(bytes)
        const revision = chatRevision(wire)
        const storage = new NodeStorage({ invalidate: vi.fn() } as any)
        const fetch = vi.fn(async (_url: string, init: RequestInit) => {
            expect(init.signal).toBeUndefined() // ordinary hydration is not given a BG read budget
            return new Response(new Uint8Array(bytes).buffer, { headers: { 'x-chat-revision': revision } })
        })
        ;(storage as any).authFetch = fetch
        storageMock.realStorage = storage
        const chats = [{ id: 'chat-1', name: 'Chat', message: [], _placeholder: true }] as any[]
        await ensureChatHydrated(chats, 0, 'char-1')
        const slot = chats[0]
        const saved = (storage as any).chatSyncStates.get('char-1|chat-1')
        expect(slot.isStreaming).toBe(false)
        expect(slot.activeStreamingDisplayOptimizationMode).toBeUndefined()
        expect(saved.snapshot.activeStreamingDisplayOptimizationMode).toBe(staleFlags ? 'enabled' : undefined)
        const remember = vi.spyOn(storage, 'rememberChatContentSnapshot')
        fetch.mockClear(); tickMock.mockClear()
        const result = await adoptServerCommittedChat(chats, 'char-1', 'chat-1', revision,
            [orchestrationChatRevision(base)], orchestrationChatRevision, chatRevision(base))
        expect(result.adopted).toBe(true)
        expect(result.chat).toBe(slot)
        expect(result.revision).toBe(revision)
        expect(chats[0]).toBe(slot)
        expect((storage as any).chatSyncStates.get('char-1|chat-1')).toBe(saved)
        expect(fetch).not.toHaveBeenCalled()
        expect(remember).not.toHaveBeenCalled()
        expect(tickMock).not.toHaveBeenCalled()
        expect(isHydrating('char-1', 'chat-1')).toBe(false)
    })

    it.each(['edit', 'wrong-revision', 'wrong-character', 'unknown-ack', 'evicted', 'over-budget', 'mutated-source', 'streaming', 'throwing-revision'])
    ('does not accept unproven current views (%s)', async state => {
        const { chatRevision } = createRequire(import.meta.url)('../../../server/node/chatDelta.cjs')
        const base = { ...chat('question'), note: '', localLore: [] }
        const completed = { ...structuredClone(base), message: [...base.message, { role: 'char', chatId: 'answer', data: 'saved answer' }] }
        const revision = chatRevision(completed)
        const storage = new NodeStorage({ invalidate: vi.fn() } as any)
        storage.rememberChatContentSnapshot('char-1', 'chat-1', { chat: completed, revision,
            encodedBytes: state === 'over-budget' ? 8 * 1024 * 1024 + 1 : 300 })
        if (state === 'unknown-ack') (storage as any).chatSyncStates.get('char-1|chat-1').unknownAck = true
        if (state === 'evicted') for (let i = 0; i < 4; i++) storage.rememberChatContentSnapshot('char-1', `other-${i}`,
            { chat: { ...base, id: `other-${i}` }, revision: `other-${i}`, encodedBytes: 300 })
        if (state === 'mutated-source') completed.message[0].data = 'changed source after independent snapshot'
        const local = structuredClone(completed)
        if (state === 'edit') local.message[0].data = 'unsaved edit'
        if (state === 'streaming') { local.isStreaming = true; local.activeStreamingDisplayOptimizationMode = undefined }
        const peek = vi.spyOn(storage, 'peekChatContentSnapshot').mockResolvedValue(null)
        const remember = vi.spyOn(storage, 'rememberChatContentSnapshot')
        storageMock.realStorage = storage
        const chats = [local]
        const revisionOf = state === 'throwing-revision'
            ? (value: any) => { if (value === local) throw new Error('unavailable local revision'); return orchestrationChatRevision(value) }
            : orchestrationChatRevision
        const result = await adoptServerCommittedChat(chats, state === 'wrong-character' ? 'other-character' : 'char-1',
            'chat-1', state === 'wrong-revision' ? 'other-revision' : revision,
            [orchestrationChatRevision(base)], revisionOf, chatRevision(base))
        expect(result.adopted).toBe(false)
        expect(chats[0]).toBe(local)
        expect(chats[0]).toEqual(local)
        expect(peek).toHaveBeenCalledTimes(['unknown-ack', 'streaming'].includes(state) ? 0 : 1)
        expect(remember).not.toHaveBeenCalled()
    })

    it.each([[false, false], [false, true], [true, false], [true, true]])
    ('recognizes an accepted save after rebase publishes defaults (missing defaults=%s, first delta=%s)', async (missingDefaults, firstDelta) => {
        const { chatRevision, applyChatDelta } = createRequire(import.meta.url)('../../../server/node/chatDelta.cjs')
        const { encodeRisuSaveLegacy, decodeRisuSave } = createRequire(import.meta.url)('../../../server/node/utils.cjs')
        const base = { ...chat('question ' + 'x'.repeat(2048)), note: '', localLore: [] }
        const remote = { ...structuredClone(base), message: [...base.message, { role: 'char', chatId: 'answer', data: 'saved answer' }] }
        const local = missingDefaults
            ? { id: 'chat-1', name: 'Chat', message: structuredClone(base.message) } as any
            : { ...structuredClone(base), note: 'user edit saved after server answer' }
        const revision0 = chatRevision(base), revision1 = chatRevision(remote)
        let acceptedRevision = '', writes = 0, reads = 0, canonical = remote
        const acceptedRevisions: string[] = []
        const storage = new NodeStorage({ invalidate: vi.fn() } as any)
        storage.rememberChatContentSnapshot('char-1', 'chat-1', { chat: base, revision: revision0, encodedBytes: encodeRisuSaveLegacy(base).byteLength })
        if (!firstDelta) (storage as any).chatDeltaSupported = false
        ;(storage as any).authFetch = vi.fn(async (_url: string, init: RequestInit = {}) => {
            if (init.method === 'PUT' || init.method === 'POST') {
                writes++
                if (writes === 1) {
                    expect(_url.endsWith('/patch')).toBe(firstDelta)
                    return new Response('{}', { status: 412 })
                }
                const delta = typeof init.body === 'string' ? JSON.parse(init.body) : null
                const submitted = delta ? applyChatDelta(canonical, delta.patch, 'chat-1') : await decodeRisuSave(init.body)
                expect(submitted.message.map((message: any) => message.chatId)).toEqual(['user-1', 'answer'])
                expect(delta ? delta.baseRevision : (init.headers as any)['x-chat-base-revision']).toBe(writes === 2 ? revision1 : acceptedRevision)
                canonical = submitted
                acceptedRevision = chatRevision(submitted)
                return Response.json({ revision: acceptedRevision }, { headers: { 'x-chat-revision': acceptedRevision } })
            }
            reads++
            return new Response(new Uint8Array(encodeRisuSaveLegacy(remote)).buffer, { headers: { 'x-chat-revision': revision1 } })
        })
        storageMock.realStorage = storage
        const chats = [local]
        for (const name of ['renamed before rebase', 'renamed after successful rebase']) {
            local.name = name
            await storage.saveChatContent('char-1', 0, 'chat-1', local)
            acceptedRevisions.push(acceptedRevision)
            expect(local.message.map((message: any) => message.chatId)).toEqual(['user-1', 'answer'])
            const authFetch = (storage as any).authFetch
            const callsBefore = authFetch.mock.calls.length
            const saved = (storage as any).chatSyncStates.get('char-1|chat-1')
            tickMock.mockClear()
            const result = await adoptServerCommittedChat(chats, 'char-1', 'chat-1', acceptedRevision,
                [orchestrationChatRevision(base)], orchestrationChatRevision, revision0)
            expect(result.adopted).toBe(true)
            expect(result.chat).toBe(local)
            expect(chats[0]).toBe(local)
            expect((storage as any).chatSyncStates.get('char-1|chat-1')).toBe(saved)
            expect(authFetch).toHaveBeenCalledTimes(callsBefore)
            expect(tickMock).not.toHaveBeenCalled()
        }
        expect(reads).toBe(1)
        expect(writes).toBe(3)
        expect(local.note).toBe(missingDefaults ? '' : 'user edit saved after server answer')
        expect(local.localLore).toEqual([])
        expect(acceptedRevisions[0]).not.toBe(acceptedRevisions[1])
        expect((await adoptServerCommittedChat(chats, 'char-1', 'chat-1', acceptedRevisions[0],
            [orchestrationChatRevision(base)], orchestrationChatRevision, revision0)).adopted).toBe(false)
        expect(chats[0]).toBe(local)
    })

    it('conservatively refuses absent live defaults after a create accepted without rebase publication', async () => {
        const { chatRevision } = createRequire(import.meta.url)('../../../server/node/chatDelta.cjs')
        const { decodeRisuSave } = createRequire(import.meta.url)('../../../server/node/utils.cjs')
        const local = chat('saved without defaults')
        const storage = new NodeStorage({ invalidate: vi.fn() } as any)
        let acceptedRevision = ''
        ;(storage as any).authFetch = vi.fn(async (_url: string, init: RequestInit = {}) => {
            if (!init.method || init.method === 'GET') return new Response(null, { status: 404 })
            const saved = await decodeRisuSave(init.body)
            acceptedRevision = chatRevision(saved)
            return Response.json({ revision: acceptedRevision }, { headers: { 'x-chat-revision': acceptedRevision } })
        })
        storageMock.realStorage = storage
        await storage.saveChatContent('char-1', 0, 'chat-1', local, 'create')
        const state = (storage as any).chatSyncStates.get('char-1|chat-1')
        expect(state.revision).toBe(acceptedRevision)
        const remembered = state.snapshot
        expect(remembered.note).toBe(''); expect(remembered.localLore).toEqual([])
        expect(local.note).toBeUndefined(); expect(local.localLore).toBeUndefined()
        const peek = vi.spyOn(storage, 'peekChatContentSnapshot')
        const result = await adoptServerCommittedChat([local], 'char-1', 'chat-1', acceptedRevision,
            ['older-view'], orchestrationChatRevision)
        expect(result.adopted).toBe(false)
        expect(peek).toHaveBeenCalledTimes(1)
        expect(local.note).toBeUndefined(); expect(local.localLore).toBeUndefined()
    })

    it('retains the identical read-only local proxy and its delivery metadata when current and anchored revisions coincide', async () => {
        const { chatRevision } = createRequire(import.meta.url)('../../../server/node/chatDelta.cjs')
        const { ORCHESTRATION_CHAT_DELIVERY_FIELD } = await import('../bgOrchestrationDelivery')
        const canonical = { ...chat('saved answer'), note: '', localLore: [] }
        const revision = chatRevision(canonical)
        const storage = new NodeStorage({ invalidate: vi.fn() } as any)
        storage.rememberChatContentSnapshot('char-1', 'chat-1', { chat: canonical, revision, encodedBytes: 300 })
        const metadata = { version: 1, operationId: 'older-operation', resultId: 'older-result' }
        const raw = { ...structuredClone(canonical), [ORCHESTRATION_CHAT_DELIVERY_FIELD]: metadata }
        const write = vi.fn(() => { throw new Error('unexpected local chat mutation') })
        const local = new Proxy(raw, { set: write, defineProperty: write, deleteProperty: write })
        storageMock.realStorage = storage
        const peek = vi.spyOn(storage, 'peekChatContentSnapshot')
        const result = await adoptServerCommittedChat([local], 'char-1', 'chat-1', revision,
            ['older-delegation'], orchestrationChatRevision, revision)
        expect(result.adopted).toBe(true)
        expect(result.chat).toBe(local)
        expect(local[ORCHESTRATION_CHAT_DELIVERY_FIELD]).toBe(metadata)
        expect(write).not.toHaveBeenCalled()
        expect(peek).not.toHaveBeenCalled()
    })

    it('does not invalidate a real in-flight save when recognizing its unchanged current view', async () => {
        const { chatRevision } = createRequire(import.meta.url)('../../../server/node/chatDelta.cjs')
        const local = { ...chat('unchanged'), note: '', localLore: [] }
        const revision = chatRevision(local)
        const storage = new NodeStorage({ invalidate: vi.fn() } as any)
        storage.rememberChatContentSnapshot('char-1', 'chat-1', { chat: local, revision, encodedBytes: 300 })
        ;(storage as any).chatDeltaSupported = false
        let entered!: () => void, release!: (response: Response) => void
        const sent = new Promise<void>(resolve => { entered = resolve })
        const fetch = vi.fn(() => new Promise<Response>(resolve => { release = resolve; entered() }))
        ;(storage as any).authFetch = fetch
        storageMock.realStorage = storage
        const saving = storage.saveChatContent('char-1', 0, 'chat-1', local)
        await sent
        const observation = (storage as any).chatSaveAdoptions.get('char-1|chat-1')
        const view = observation.view
        const result = await adoptServerCommittedChat([local], 'char-1', 'chat-1', revision,
            ['older-view'], orchestrationChatRevision, revision)
        expect(result.adopted).toBe(true)
        expect(observation.view).toBe(view)
        expect(observation.activeView).toBe(view)
        expect(fetch).toHaveBeenCalledTimes(1)
        release(Response.json({ revision: 'next-revision' }, { headers: { 'x-chat-revision': 'next-revision' } }))
        await saving
        expect((storage as any).chatSyncStates.get('char-1|chat-1').revision).toBe('next-revision')
    })

    it('preserves the attached-input caller revision and marker contract without replacing a current slot', async () => {
        const { adoptAttachedServerInputs } = await import('../bgServerInputAdoption')
        const { writeServerInputMarker, readServerInputMarkers } = await import('../bgServerInputLedger')
        const { chatRevision } = createRequire(import.meta.url)('../../../server/node/chatDelta.cjs')
        const local = { ...chat('attached input'), note: '', localLore: [] }
        const revision = chatRevision(local), view = orchestrationChatRevision(local)
        const storage = new NodeStorage({ invalidate: vi.fn() } as any)
        storage.rememberChatContentSnapshot('char-1', 'chat-1', { chat: local, revision, encodedBytes: 300 })
        storageMock.realStorage = storage
        const values = new Map<string, string>()
        const markers = { get length() { return values.size }, key: (index: number) => [...values.keys()][index] ?? null,
            getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) },
            removeItem: (key: string) => { values.delete(key) } }
        writeServerInputMarker(markers, { operationId: 'input-operation', charId: 'char-1', chatId: 'chat-1',
            localRevision: view, baseRevision: revision, state: 'accepted', createdAt: 1000 })
        const peek = vi.spyOn(storage, 'peekChatContentSnapshot')
        const chats = [local]
        const options = { storage: markers, charId: 'char-1', chatId: 'chat-1', now: () => 1001,
            pendingInputs: [{ operationId: 'input-operation', admissionSeq: 1, state: 'generating' as const,
                attachedRevision: revision, inputReceiptId: 'a'.repeat(64) }],
            readLocalRevision: () => orchestrationChatRevision(chats[0]), isCurrent: () => true,
            adopt: (serverRevision: string, allowed: string) => adoptServerCommittedChat(chats, 'char-1', 'chat-1', serverRevision, [allowed], orchestrationChatRevision) }
        expect(await adoptAttachedServerInputs(options)).toBe(1)
        expect(await adoptAttachedServerInputs(options)).toBe(0)
        expect(chats[0]).toBe(local)
        expect(peek).not.toHaveBeenCalled()
        expect(readServerInputMarkers(markers, 1001)[0]).toMatchObject({ adoptedRevision: revision, localRevision: view })
    })

    it.each(['saved', 'unsaved', 'evicted', 'during-read'])('bridges actual wire and view revisions only for an acknowledged %s snapshot', async state => {
        const { chatRevision } = createRequire(import.meta.url)('../../../server/node/chatDelta.cjs')
        const saved = chat('edited and saved')
        const before = structuredClone(saved)
        const after = { ...saved, message: [...saved.message, { role: 'char', chatId: 'answer', data: 'response' }] }
        const storage = new NodeStorage()
        storage.rememberChatContentSnapshot('char-1', 'chat-1', { chat: saved, revision: chatRevision(saved), encodedBytes: 200 })
        expect(orchestrationChatRevision(saved)).not.toBe(chatRevision(saved))
        if (state === 'unsaved') before.message[0].data = 'later unsaved edit'
        if (state === 'evicted') for (let i = 0; i < 4; i++) {
            storage.rememberChatContentSnapshot('char-1', `other-${i}`, { chat: { ...saved, id: `other-${i}` }, revision: `other-${i}`, encodedBytes: 200 })
        }
        const peek = vi.spyOn(storage, 'peekChatContentSnapshot').mockImplementation(async () => {
            if (state === 'during-read') before.message[0].data = 'edited during read'
            return { chat: after, revision: chatRevision(after), encodedBytes: 300 }
        })
        storageMock.realStorage = storage
        const chats = [before]
        const outcome = await adoptServerCommittedChat(chats, 'char-1', 'chat-1', chatRevision(after),
            ['original-delegation-display-revision'], orchestrationChatRevision, chatRevision(saved))
        expect(outcome.adopted).toBe(state === 'saved')
        if (state === 'saved') expect(chats[0].message.map((m: any) => m.data)).toEqual(['edited and saved', 'response'])
        else { expect(chats[0]).toBe(before) }
        expect(peek).toHaveBeenCalledTimes(1)
    })

    beforeEach(() => {
        tickMock.mockClear()
        rememberSnapshotMock.mockClear()
    })

    it('peeks at the canonical chat without advancing the client save baseline', async () => {
        const snapshot = { chat: chat('server'), revision: 'server-revision', encodedBytes: 123 }
        const peekChatContentSnapshot = vi.fn().mockResolvedValue(snapshot)
        storageMock.realStorage = {
            peekChatContentSnapshot,
            rememberChatContentSnapshot: rememberSnapshotMock,
        }
        await expect(peekServerChatSnapshot('char-1', 0, 'chat-1')).resolves.toBe(snapshot)
        expect(peekChatContentSnapshot).toHaveBeenCalledWith('char-1', 0, 'chat-1', expect.any(AbortSignal))
        expect(rememberSnapshotMock).not.toHaveBeenCalled()
    })

    it('replaces an unchanged full slot and adopts the server revision baseline', async () => {
        const before = chat('before')
        const after = chat('after')
        after.isStreaming = true
        after.activeStreamingDisplayOptimizationMode = 'enabled'
        const chats = [before]
        const snapshot = {
            chat: after,
            revision: 'stored-revision',
            encodedBytes: 123,
        }
        const peekChatContentSnapshot = vi.fn().mockResolvedValue(snapshot)
        storageMock.realStorage = {
            peekChatContentSnapshot,
            rememberChatContentSnapshot: rememberSnapshotMock,
        }

        await expect(adoptServerCommittedChat(
            chats,
            'char-1',
            'chat-1',
            'stored-revision',
            ['base-revision'],
            (value) => value === before ? 'base-revision' : 'unexpected',
        )).resolves.toMatchObject({ adopted: true, revision: 'stored-revision', chat: { ...after, isStreaming: false, activeStreamingDisplayOptimizationMode: undefined } })
        expect(chats[0]).not.toBe(after)
        expect(after.isStreaming).toBe(true)
        expect(after.activeStreamingDisplayOptimizationMode).toBe('enabled')
        expect(peekChatContentSnapshot).toHaveBeenCalledWith('char-1', 0, 'chat-1', expect.any(AbortSignal))
        expect(rememberSnapshotMock).toHaveBeenCalledWith('char-1', 'chat-1', snapshot)
        expect(tickMock).toHaveBeenCalledTimes(1)
        expect(isHydrating('char-1', 'chat-1')).toBe(false)
    })

    it('refuses an unanchored local slot when storage cannot prove save quiescence', async () => {
        const chats = [chat('local edit')]
        const peekChatContentSnapshot = vi.fn()
        storageMock.realStorage = {
            peekChatContentSnapshot,
            rememberChatContentSnapshot: rememberSnapshotMock,
        }

        await expect(adoptServerCommittedChat(
            chats,
            'char-1',
            'chat-1',
            'stored-revision',
            ['base-revision'],
            () => 'local-edit-revision',
        )).resolves.toEqual({ adopted: false, reason: 'save-unconfirmed' })
        expect(peekChatContentSnapshot).not.toHaveBeenCalled()
        expect(rememberSnapshotMock).not.toHaveBeenCalled()
    })

    it('keeps the local slot when the fetched server revision differs from the receipt', async () => {
        const before = chat('before')
        const chats = [before]
        storageMock.realStorage = {
            peekChatContentSnapshot: vi.fn().mockResolvedValue({
                chat: chat('newer'),
                revision: 'newer-revision',
                encodedBytes: 123,
            }),
            rememberChatContentSnapshot: rememberSnapshotMock,
        }

        await expect(adoptServerCommittedChat(
            chats,
            'char-1',
            'chat-1',
            'stored-revision',
            ['base-revision'],
            () => 'base-revision',
        )).resolves.toEqual({
            adopted: false,
            reason: 'server-revision-mismatch',
            currentRevision: 'newer-revision',
        })
        expect(chats[0]).toBe(before)
        expect(rememberSnapshotMock).not.toHaveBeenCalled()
    })

    it('does not overwrite a slot replaced while canonical fetch is in flight', async () => {
        const before = chat('before')
        const replacement = chat('replacement')
        const chats = [before]
        let resolveFetch!: (value: unknown) => void
        storageMock.realStorage = {
            peekChatContentSnapshot: vi.fn().mockReturnValue(new Promise(resolve => {
                resolveFetch = resolve
            })),
            rememberChatContentSnapshot: rememberSnapshotMock,
        }
        const adopting = adoptServerCommittedChat(
            chats,
            'char-1',
            'chat-1',
            'stored-revision',
            ['base-revision'],
            () => 'base-revision',
        )
        chats[0] = replacement
        resolveFetch({ chat: chat('server'), revision: 'stored-revision', encodedBytes: 123 })

        await expect(adopting).resolves.toEqual({
            adopted: false,
            reason: 'local-slot-replaced',
        })
        expect(chats[0]).toBe(replacement)
        expect(rememberSnapshotMock).not.toHaveBeenCalled()
    })

    it('hydrates a placeholder because it cannot contain an unsaved local edit', async () => {
        const placeholder = { id: 'chat-1', name: 'Chat', message: [], _placeholder: true } as any
        const after = chat('server')
        const chats = [placeholder]
        storageMock.realStorage = {
            peekChatContentSnapshot: vi.fn().mockResolvedValue({
                chat: after,
                revision: 'stored-revision',
                encodedBytes: 123,
            }),
            rememberChatContentSnapshot: rememberSnapshotMock,
        }

        await expect(adoptServerCommittedChat(
            chats,
            'char-1',
            'chat-1',
            'stored-revision',
            ['base-revision'],
            () => 'placeholder-revision',
        )).resolves.toMatchObject({ adopted: true, chat: after })
        expect(rememberSnapshotMock).toHaveBeenCalledTimes(1)
    })
})
