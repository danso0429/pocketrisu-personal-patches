import { afterEach, describe, expect, it, vi } from 'vitest'
import utilsPackage from '../../../server/node/utils.cjs'

vi.mock('src/lang', () => ({ language: {} }))
vi.mock('../alert', () => ({ alertInput: vi.fn(), waitAlert: vi.fn(), notifyError: vi.fn() }))
vi.mock('./database.svelte', () => ({ appVer: 'test', nodeOnlyVer: 'test', normalizeChat: (chat: any) => chat }))
vi.mock('./risuSave', async () => {
    const { default: codec } = await import('../../../server/node/utils.cjs')
    return { encodeRisuSaveLegacy: codec.encodeRisuSaveLegacy, decodeRisuSave: codec.decodeRisuSave }
})
// Only the HTTP transport is substituted. authFetch, both chat-save paths,
// their response-confirmation handlers and rebase logic execute unchanged.
const transport = vi.hoisted(() => vi.fn())
vi.mock('./clientBuildHandshake', () => ({ clientBuildFetch: transport }))
const { ChatConflictError, NodeStorage, PublicationSaveBlockedError } = await import('./nodeStorage')
const { encodeRisuSaveLegacy } = utilsPackage
afterEach(() => { transport.mockReset(); vi.restoreAllMocks() })

for (const delta of [false, true]) it(`retains the typed publication refusal without a GET or fallback; delta=${delta}`, async () => {
    const base = { id: 'chat-1', name: 'chat', message: [{ chatId: 'q', role: 'user', data: 'x'.repeat(10000) }] }
    const local = structuredClone(base); local.name = 'local edit'
    const storage = new NodeStorage({ invalidate: vi.fn() } as any)
    vi.spyOn(storage as any, 'checkAuth').mockResolvedValue(undefined)
    vi.spyOn(storage as any, 'createAuth').mockResolvedValue('synthetic-auth')
    ;(storage as any).chatDeltaSupported = delta
    ;(storage as any).rememberChatSyncState('char-1|chat-1', 'r1', base, encodeRisuSaveLegacy(base).byteLength)
    transport.mockResolvedValue(new Response(JSON.stringify({ code: 'BG_PUBLICATION_SAVE_BLOCKED' }), {
        status: 503, headers: { 'x-bg-save-blocked': 'BG_PUBLICATION_SAVE_BLOCKED' },
    }))
    await expect(storage.saveChatContent('char-1', 0, 'chat-1', local)).rejects.toBeInstanceOf(PublicationSaveBlockedError)
    expect(local.name).toBe('local edit')
    expect(transport).toHaveBeenCalledTimes(1)
    expect(transport.mock.calls[0][0]).toBe(`/api/chat-content/char-1/0${delta ? '/patch' : ''}`)
    expect((storage as any).chatSyncStates.get('char-1|chat-1').revision).toBe('r1')
    expect((storage as any).chatSyncStates.get('char-1|chat-1').snapshot).toEqual(base)
})

it('distinguishes a typed root refusal from an ordinary unavailable server', async () => {
    const storage = new NodeStorage({ invalidate: vi.fn() } as any)
    vi.spyOn(storage as any, 'checkAuth').mockResolvedValue(undefined)
    vi.spyOn(storage as any, 'createAuth').mockResolvedValue('synthetic-auth')
    transport.mockResolvedValueOnce(new Response('{}', { status: 503, headers: { 'x-bg-save-blocked': 'BG_PUBLICATION_SAVE_BLOCKED' } }))
    await expect(storage.setItem('database/database.bin', encodeRisuSaveLegacy({}))).rejects.toBeInstanceOf(PublicationSaveBlockedError)
    transport.mockResolvedValueOnce(new Response('{}', { status: 503 }))
    await expect(storage.setItem('database/database.bin', encodeRisuSaveLegacy({}))).rejects.not.toBeInstanceOf(PublicationSaveBlockedError)
})

describe('[B1a-3] Storage reset barrier foundation', () => {
    for (const delta of [false, true]) it(`treats reset 503 as retryable ordinary failure without conflict or publication notice; delta=${delta}`, async () => {
        const base = { id: 'chat-1', name: 'chat', message: [{ role: 'user', data: 'base'.repeat(3000) }] }
        const local = structuredClone(base)
        local.name = 'local edit retained for retry'
        const storage = new NodeStorage({ invalidate: vi.fn() } as any)
        vi.spyOn(storage as any, 'checkAuth').mockResolvedValue(undefined)
        vi.spyOn(storage as any, 'createAuth').mockResolvedValue('synthetic-auth')
        ;(storage as any).chatDeltaSupported = delta
        ;(storage as any).rememberChatSyncState('char-1|chat-1', 'r1', base, encodeRisuSaveLegacy(base).byteLength)
        transport.mockResolvedValue(new Response(JSON.stringify({
            code: 'STORAGE_RESET_IN_PROGRESS',
            retryable: true,
        }), { status: 503, headers: { 'content-type': 'application/json' } }))

        const outcome = storage.saveChatContent('char-1', 0, 'chat-1', local)
        await expect(outcome).rejects.not.toBeInstanceOf(ChatConflictError)
        await expect(outcome).rejects.not.toBeInstanceOf(PublicationSaveBlockedError)
        expect(local.name).toBe('local edit retained for retry')
        expect(transport).toHaveBeenCalledTimes(1)
        expect((storage as any).chatSyncStates.get('char-1|chat-1')).toMatchObject({
            revision: 'r1',
            snapshot: base,
        })
    })
})
