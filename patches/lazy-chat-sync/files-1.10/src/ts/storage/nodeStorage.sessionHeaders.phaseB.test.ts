import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('src/lang', () => ({ language: {} }))
vi.mock('../alert', () => ({ alertInput: vi.fn(), waitAlert: vi.fn(), notifyError: vi.fn() }))
vi.mock('./database.svelte', () => ({ appVer: 'test', nodeOnlyVer: 'test', normalizeChat: (chat: any) => chat }))
vi.mock('./risuSave', async () => {
    const { default: codec } = await import('../../../server/node/utils.cjs')
    return { encodeRisuSaveLegacy: codec.encodeRisuSaveLegacy, decodeRisuSave: codec.decodeRisuSave }
})
const transport = vi.hoisted(() => vi.fn())
vi.mock('./clientBuildHandshake', () => ({
    clientBuildFetch: transport,
    clientBuildStamp: vi.fn(),
    handleAdvertisedClientBuild: vi.fn(),
    handleClientBuildXhr: vi.fn(),
}))

let nodeStorageModule: any

beforeAll(async () => {
    sessionStorage.setItem('risu-writer-session-id', 'tab-123')
    nodeStorageModule = await import('./nodeStorage')
})

afterEach(() => {
    transport.mockReset()
    vi.restoreAllMocks()
    vi.useRealTimers()
})

describe('[B2-1] Writer session header helper', () => {
    it('returns the writer id and active bit after a recent gesture', () => {
        vi.useFakeTimers()
        vi.setSystemTime(20_000)
        window.dispatchEvent(new Event('pointerdown'))
        vi.setSystemTime(24_999)
        expect(nodeStorageModule.writerSessionHeaders()).toEqual({
            'x-session-id': 'tab-123',
            'x-user-active': '1',
        })
    })

    it.each([15_000, 15_001])('omits x-user-active at the inactive boundary +%dms', elapsed => {
        vi.useFakeTimers()
        vi.setSystemTime(40_000)
        window.dispatchEvent(new Event('keydown'))
        vi.setSystemTime(40_000 + elapsed)
        expect(nodeStorageModule.writerSessionHeaders()).toEqual({ 'x-session-id': 'tab-123' })
        expect(nodeStorageModule.writerSessionHeaders()).not.toHaveProperty('x-user-active')
    })

    it('dispatches the deactivation event for 423 and no other response', () => {
        const listener = vi.fn()
        window.addEventListener('risu-session-deactivated', listener)
        try {
            for (const status of [423, 200, 409, 426, 503]) {
                nodeStorageModule.notifySessionDeactivated(new Response(null, { status }))
            }
            expect(listener).toHaveBeenCalledTimes(1)
        } finally {
            window.removeEventListener('risu-session-deactivated', listener)
        }
    })

    it('keeps authFetch header and 423 event behavior identical through the helpers', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(60_000)
        window.dispatchEvent(new Event('pointerdown'))
        const listener = vi.fn()
        window.addEventListener('risu-session-deactivated', listener)
        transport.mockResolvedValue(new Response('{}', { status: 423 }))
        const storage = new nodeStorageModule.NodeStorage({ invalidate: vi.fn() })
        vi.spyOn(storage, 'checkAuth').mockResolvedValue(undefined)
        vi.spyOn(storage, 'createAuth').mockResolvedValue('auth-token')
        try {
            await (storage as any).authFetch('/api/write', {
                method: 'POST', headers: { 'content-type': 'application/octet-stream' },
            })
            const headers = new Headers(transport.mock.calls[0][1].headers)
            expect(Object.fromEntries(headers.entries())).toMatchObject({
                'content-type': 'application/octet-stream',
                'risu-auth': 'auth-token',
                'x-session-id': 'tab-123',
                'x-user-active': '1',
            })
            expect(listener).toHaveBeenCalledTimes(1)
        } finally {
            window.removeEventListener('risu-session-deactivated', listener)
        }
    })
})
