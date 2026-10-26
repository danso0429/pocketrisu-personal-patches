import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const handshake = vi.hoisted(() => ({
    advertised: vi.fn(),
    response: vi.fn(async (value: Response) => value),
}))

vi.mock('src/lang', () => ({ language: { errors: {} } }))
vi.mock('../alert', () => ({
    alertInput: vi.fn(),
    waitAlert: vi.fn(async () => undefined),
    notifyError: vi.fn(),
}))
vi.mock('./risuSave', () => ({
    decodeRisuSave: vi.fn(),
    encodeRisuSaveLegacy: vi.fn(),
}))
vi.mock('./database.svelte', () => ({ normalizeChat: vi.fn((value) => value) }))

vi.mock('./clientBuildHandshake', () => ({
    clientBuildStamp: 'build-1161',
    withClientBuildHeader(headers?: HeadersInit) {
        const next = new Headers(headers)
        next.set('x-client-build', 'build-1161')
        return next
    },
    handleAdvertisedClientBuild: handshake.advertised,
    handleClientBuildResponse: handshake.response,
}))

import { NodeStorage, type StorageFetch } from './nodeStorage'

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    })
}

function prepare(storage: NodeStorage) {
    const subject = storage as unknown as Record<string, any>
    subject.checkAuth = vi.fn(async () => undefined)
    subject.createAuth = vi.fn(async () => 'token')
    subject.cachedJwt = { token: 'token', expiresAt: Date.now() + 60_000 }
    return subject
}

describe('[E2-2a] Rebase the client build fence onto PocketRisu 1.16.1', () => {
    beforeEach(() => {
        handshake.advertised.mockReset()
        handshake.response.mockClear()
        ;(NodeStorage as unknown as Record<string, unknown>).sessionInitialized = false
        ;(NodeStorage as unknown as Record<string, unknown>).sessionPending = null
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
    })

    it('[new] session init stamps both requests, advertises a successful build, and handles 426', async () => {
        const fetcher = vi.fn<StorageFetch>()
            .mockResolvedValueOnce(json({ build: { version: '1.16.2', stamp: 'build-1162' } }))
            .mockResolvedValueOnce(json({
                code: 'CLIENT_UPGRADE_REQUIRED',
                expectedBuild: { version: '1.16.2', stamp: 'build-1162' },
                commitOutcome: 'not-committed',
            }, 426))
        vi.stubGlobal('fetch', fetcher)
        const storage = prepare(new NodeStorage(fetcher))

        await storage._doInitSession()
        ;(NodeStorage as unknown as Record<string, unknown>).sessionInitialized = false
        await storage._doInitSession()

        expect(fetcher).toHaveBeenCalledTimes(2)
        for (const call of fetcher.mock.calls) {
            expect(String(call[0])).toBe('/api/session')
            expect(new Headers(call[1]?.headers).get('x-client-build')).toBe('build-1161')
        }
        expect(handshake.advertised).toHaveBeenCalledWith({ version: '1.16.2', stamp: 'build-1162' })
        expect(handshake.response).toHaveBeenCalledWith(expect.objectContaining({ status: 426 }))
    })

    it('[new] session response-body work remains inside the existing timeout race', async () => {
        vi.useFakeTimers()
        let releaseBody!: () => void
        const bodyGate = new Promise<void>((resolve) => { releaseBody = resolve })
        handshake.response.mockImplementationOnce(async (response: Response) => {
            await bodyGate
            return response
        })
        vi.stubGlobal('fetch', vi.fn(async () => json({ code: 'CLIENT_UPGRADE_REQUIRED' }, 426)))
        const storage = prepare(new NodeStorage())
        let settled = false
        const attempt = storage._doInitSession().finally(() => { settled = true })

        await Promise.resolve()
        await Promise.resolve()
        await vi.advanceTimersByTimeAsync(1)
        expect(settled).toBe(false)
        await vi.advanceTimersByTimeAsync(29_999)
        await attempt
        expect(settled).toBe(true)
        releaseBody()
    })

    it('[unchanged] network and non-426 failed sessions remain eligible for the next check', async () => {
        const fetcher = vi.fn<StorageFetch>()
            .mockRejectedValueOnce(new TypeError('network'))
            .mockResolvedValueOnce(json({ error: 'temporary' }, 500))
            .mockResolvedValueOnce(json({ ok: true }))
        vi.stubGlobal('fetch', fetcher)
        const storage = prepare(new NodeStorage(fetcher))
        await storage._doInitSession()
        await storage._doInitSession()
        await storage._doInitSession()
        expect(fetcher).toHaveBeenCalledTimes(3)
        expect((NodeStorage as unknown as Record<string, unknown>).sessionInitialized).toBe(true)
    })

    it('[new] authFetchOnce preserves caller headers, uses fetchFn, and handles 426 once', async () => {
        const fetcher = vi.fn<StorageFetch>(async () => json({
            code: 'CLIENT_UPGRADE_REQUIRED',
            expectedBuild: { version: '1.16.2', stamp: 'build-1162' },
        }, 426))
        const storage = prepare(new NodeStorage(fetcher))
        const response = await storage.authFetchOnce('/api/write', {
            method: 'POST',
            headers: { 'x-caller': 'kept' },
        })

        expect(response.status).toBe(426)
        expect(fetcher).toHaveBeenCalledOnce()
        const headers = new Headers(fetcher.mock.calls[0]?.[1]?.headers)
        expect(headers.get('x-caller')).toBe('kept')
        expect(headers.get('x-client-build')).toBe('build-1161')
        expect(handshake.response).toHaveBeenCalledOnce()
    })

    it('[unchanged] keeps 423 notification and authentication retry semantics with injected fetchFn', async () => {
        const events: unknown[] = []
        window.addEventListener('risu-session-deactivated', (event) => events.push((event as CustomEvent).detail))
        const fetcher = vi.fn<StorageFetch>()
            .mockResolvedValueOnce(json({ code: 'ACCOUNT_IMPORT_ACTIVE' }, 423))
            .mockResolvedValueOnce(json({ error: 'Token Expired' }, 401))
            .mockResolvedValueOnce(json({ ok: true }))
        const storage = prepare(new NodeStorage(fetcher))

        expect((await storage.authFetchOnce('/api/write')).status).toBe(423)
        expect((await storage.authFetchOnce('/api/write')).status).toBe(200)
        expect(fetcher).toHaveBeenCalledTimes(3)
        expect(events).toEqual([{ code: 'ACCOUNT_IMPORT_ACTIVE' }])
        expect(storage.checkAuth).toHaveBeenCalled()
    })

    it('[unchanged] keeps transient status and network retries on the injected fetchFn', async () => {
        const fetcher = vi.fn<StorageFetch>()
            .mockResolvedValueOnce(json({}, 502))
            .mockRejectedValueOnce(new TypeError('network'))
            .mockResolvedValueOnce(json({ ok: true }))
        const delay = vi.fn(async () => undefined)
        const storage = prepare(new NodeStorage(fetcher, {
            maxRetries: 3,
            baseDelayMs: 0,
            delay,
        }))

        expect((await storage.authFetch('/api/write')).status).toBe(200)
        expect(fetcher).toHaveBeenCalledTimes(3)
        expect(delay).toHaveBeenCalledTimes(2)
    })

    it('[new] stamps every 423, authentication, transient-status, and network retry attempt', async () => {
        const fetcher = vi.fn<StorageFetch>()
            .mockResolvedValueOnce(json({ code: 'ACCOUNT_IMPORT_ACTIVE' }, 423))
            .mockResolvedValueOnce(json({ error: 'Token Expired' }, 401))
            .mockResolvedValueOnce(json({}, 502))
            .mockRejectedValueOnce(new TypeError('network'))
            .mockResolvedValueOnce(json({ ok: true }))
        const storage = prepare(new NodeStorage(fetcher, {
            maxRetries: 3,
            baseDelayMs: 0,
            delay: async () => undefined,
        }))

        expect((await storage.authFetch('/api/write')).status).toBe(423)
        expect((await storage.authFetch('/api/write')).status).toBe(200)
        expect(fetcher).toHaveBeenCalledTimes(5)
        for (const call of fetcher.mock.calls) {
            expect(new Headers(call[1]?.headers).get('x-client-build')).toBe('build-1161')
        }
    })
})
