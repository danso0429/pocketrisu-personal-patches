import { expect, it, vi } from 'vitest'
import utilsPackage from '../../../server/node/utils.cjs'

vi.mock('src/lang', () => ({ language: {} }))
vi.mock('../alert', () => ({ alertInput: vi.fn(), waitAlert: vi.fn(), notifyError: vi.fn() }))
vi.mock('./database.svelte', () => ({ appVer: 'test', nodeOnlyVer: 'test', normalizeChat: (chat: any) => chat }))
vi.mock('./risuSave', async () => {
    const { default: codec } = await import('../../../server/node/utils.cjs')
    return { encodeRisuSaveLegacy: codec.encodeRisuSaveLegacy, decodeRisuSave: codec.decodeRisuSave }
})
const { NodeStorage } = await import('./nodeStorage')
const { encodeRisuSaveLegacy, decodeRisuSave } = utilsPackage

it('keeps a 4.5 MiB chat editable after rebase and after the snapshot cache is evicted', async () => {
    const original = { id: 'chat-1', name: 'before', message: [{ chatId: 'q', role: 'user', data: 'x'.repeat(4.5 * 1024 * 1024) }] }
    const local = { ...structuredClone(original), name: 'edited' }
    const remote = { ...structuredClone(original), message: [...original.message, { chatId: 'a', role: 'char', data: 'answer' }] }
    const storage = new NodeStorage({ invalidate: vi.fn() } as any)
    ;(storage as any).rememberChatSyncState('char-1|chat-1', 'r1', original, encodeRisuSaveLegacy(original).byteLength)
    const responses = [
        new Response('{}', { status: 412 }),
        new Response(new Uint8Array(encodeRisuSaveLegacy(remote)).buffer, { headers: { 'x-chat-revision': 'r2' } }),
        new Response('{"revision":"r3"}'), new Response('{"revision":"r4"}'), new Response('{"revision":"r5"}'),
    ]
    const authFetch = vi.fn(async (_url: any, _init: any) => responses.shift()!)
    ;(storage as any).authFetch = authFetch
    ;(storage as any).chatDeltaSupported = false
    await storage.saveChatContent('char-1', 0, 'chat-1', local)
    expect(local.message.map(message => message.chatId)).toEqual(['q', 'a'])
    expect((storage as any).chatSyncStates.get('char-1|chat-1').snapshot).not.toBeNull()
    local.name = 'after first merge'
    await storage.saveChatContent('char-1', 0, 'chat-1', local)
    for (let index = 0; index < 4; index++) {
        const other = { id: `other-${index}`, message: [] }
        ;(storage as any).rememberChatSyncState(`char-1|${other.id}`, 'other-r', other, encodeRisuSaveLegacy(other).byteLength)
    }
    expect((storage as any).chatSyncStates.get('char-1|chat-1').snapshot).toBeNull()
    local.name = 'after browsing'
    await storage.saveChatContent('char-1', 0, 'chat-1', local)
    const request = authFetch.mock.calls[4][1]
    const saved = await decodeRisuSave(request.body)
    expect(request.headers['x-chat-base-revision']).toBe('r4')
    expect(saved.name).toBe('after browsing')
    expect(saved.message.map((message: any) => message.chatId)).toEqual(['q', 'a'])
    expect(saved.message[0].data.length).toBe(4.5 * 1024 * 1024)
})

it('preserves unseen answers after a successful save omits revision metadata', async () => {
    const original = { id: 'chat-1', name: 'before', message: [{ chatId: 'q', role: 'user', data: 'question' }] }
    const local = { ...structuredClone(original), name: 'edited' }
    const remote = { ...structuredClone(local), message: [...original.message, { chatId: 'a', role: 'char', data: 'answer' }] }
    const storage = new NodeStorage({ invalidate: vi.fn() } as any)
    ;(storage as any).rememberChatSyncState('char-1|chat-1', 'r1', original, encodeRisuSaveLegacy(original).byteLength)
    const responses = [new Response('{}'),
        new Response(new Uint8Array(encodeRisuSaveLegacy(remote)).buffer, { headers: { 'x-chat-revision': 'r2' } }),
        new Response('{"revision":"r3"}'), new Response('{"revision":"r4"}'),
    ]
    const authFetch = vi.fn(async (_url: any, _init: any) => responses.shift()!)
    ;(storage as any).authFetch = authFetch
    ;(storage as any).chatDeltaSupported = false
    await storage.saveChatContent('char-1', 0, 'chat-1', local)
    local.name = 'next edit'
    ;(storage as any).chatDeltaSupported = false
    await storage.saveChatContent('char-1', 0, 'chat-1', local)
    const saved = await decodeRisuSave(authFetch.mock.calls[3][1].body)
    expect(saved.message.map((message: any) => message.chatId)).toEqual(['q', 'a'])
    expect(saved.name).toBe('next edit')
})

it('rebases actual codec snapshots containing undefined without a JSON delta or lost answer', async () => {
    const original = { id: 'chat-1', name: 'Chat', optional: undefined,
        message: [{ chatId: 'input', role: 'user', data: 'question', generationInfo: { model: undefined } }] }
    const local = { ...structuredClone(original), name: 'edited' }
    const remote = structuredClone(original)
    remote.message.push({ chatId: 'answer', role: 'char', data: 'answer', generationInfo: { model: undefined } })
    const storage = new NodeStorage({ invalidate: vi.fn() } as any)
    ;(storage as any).rememberChatSyncState('char-1|chat-1', 'revision-1', original, encodeRisuSaveLegacy(original).byteLength)
    const responses = [
        new Response('{}', { status: 412 }),
        new Response(new Uint8Array(encodeRisuSaveLegacy(remote)).buffer, { headers: { 'x-chat-revision': 'revision-2' } }),
        new Response('{"revision":"revision-3"}', { headers: { 'x-chat-revision': 'revision-3' } }),
    ]
    const authFetch = vi.fn(async () => responses.shift()!)
    ;(storage as any).authFetch = authFetch
    await storage.saveChatContent('char-1', 0, 'chat-1', local)
    const request = (authFetch.mock.calls as any)[2][1]
    expect(request.headers['x-chat-base-revision']).toBe('revision-2')
    const saved = await decodeRisuSave(request.body)
    expect(saved.name).toBe('edited')
    expect(saved.message.map((m: any) => m.chatId)).toEqual(['input', 'answer'])
    expect(Object.hasOwn(saved, 'optional')).toBe(true)
    expect(Object.hasOwn(saved.message[0].generationInfo, 'model')).toBe(true)
    expect((storage as any).chatSyncStates.get('char-1|chat-1').snapshot).toEqual(saved)
    expect(local.message).toHaveLength(2)
})
