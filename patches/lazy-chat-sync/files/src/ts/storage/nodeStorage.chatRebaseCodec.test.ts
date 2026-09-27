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
    expect((storage as any).chatSyncStates.get('char-1|chat-1').viewDiverged).toBe(true)
    expect(local.message).toHaveLength(1)
})
