import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const handshake = vi.hoisted(() => ({
    response: vi.fn(async (value: Response) => value),
    xhr: vi.fn(),
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
    handleAdvertisedClientBuild: vi.fn(),
    handleClientBuildResponse: handshake.response,
    handleClientBuildXhr: handshake.xhr,
}))

import { NodeStorage, type StorageFetch } from './nodeStorage'

type XhrPlan = { status: number, responseText: string }

class FakeXMLHttpRequest {
    static plans: XhrPlan[] = []
    static instances: FakeXMLHttpRequest[] = []

    status = 0
    responseText = ''
    method = ''
    url = ''
    sent: unknown
    headers: [string, string][] = []
    upload: {
        onprogress: ((event: ProgressEvent) => void) | null
        onload: (() => void) | null
    } = { onprogress: null, onload: null }
    onprogress: (() => void) | null = null
    onerror: (() => void) | null = null
    onload: (() => void) | null = null

    constructor() {
        FakeXMLHttpRequest.instances.push(this)
    }

    open(method: string, url: string) {
        this.method = method
        this.url = url
    }

    setRequestHeader(name: string, value: string) {
        this.headers.push([name.toLowerCase(), value])
    }

    send(body: unknown) {
        this.sent = body
        const plan = FakeXMLHttpRequest.plans.shift()
        if (!plan) throw new Error('missing XHR plan')
        this.status = plan.status
        this.responseText = plan.responseText
        this.upload.onprogress?.({ lengthComputable: true, loaded: 4, total: 10 } as ProgressEvent)
        this.upload.onload?.()
        this.onprogress?.()
        this.onload?.()
    }
}

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
    return storage
}

function buildHeaders(xhr: FakeXMLHttpRequest) {
    return xhr.headers.filter(([name]) => name === 'x-client-build')
}

describe('[E2-6a] Fence the native backup import and snapshot restore calls', () => {
    beforeEach(() => {
        handshake.response.mockClear()
        handshake.xhr.mockClear()
        FakeXMLHttpRequest.plans = []
        FakeXMLHttpRequest.instances = []
        vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest)
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('[new] stamps and handles one successful native backup upload without changing its result', async () => {
        const fetcher = vi.fn<StorageFetch>(async () => json({ ok: true }))
        FakeXMLHttpRequest.plans.push({
            status: 200,
            responseText: '{"type":"done","ok":true,"assetsRestored":3}\n',
        })
        const progress = vi.fn()
        const result = await prepare(new NodeStorage(fetcher)).importBackup(new Blob(['data']), progress)

        expect(fetcher).toHaveBeenCalledOnce()
        expect(String(fetcher.mock.calls[0]?.[0])).toBe('/api/backup/import/prepare')
        expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('x-client-build')).toBe('build-1161')
        const xhr = FakeXMLHttpRequest.instances[0]
        expect([xhr.method, xhr.url]).toEqual(['POST', '/api/backup/import'])
        expect(buildHeaders(xhr)).toEqual([['x-client-build', 'build-1161']])
        expect(handshake.response).toHaveBeenCalledOnce()
        expect(handshake.xhr).toHaveBeenCalledOnce()
        expect(progress).toHaveBeenCalledWith(4, 10)
        expect(result).toEqual({ type: 'done', ok: true, assetsRestored: 3 })
    })

    it('[unchanged] rejects a 426 prepare response after upgrade handling and never creates the upload XHR', async () => {
        const fetcher = vi.fn<StorageFetch>(async () => json({
            code: 'CLIENT_UPGRADE_REQUIRED',
            expectedBuild: { version: '1.16.1', stamp: 'server-build' },
        }, 426))

        await expect(prepare(new NodeStorage(fetcher)).importBackup(new Blob(['data']))).rejects.toBeDefined()
        expect(handshake.response).toHaveBeenCalledOnce()
        expect(FakeXMLHttpRequest.instances).toHaveLength(0)
    })

    it('[new] handles an upload-time 426 once and rejects the import promise', async () => {
        const fetcher = vi.fn<StorageFetch>(async () => json({ ok: true }))
        FakeXMLHttpRequest.plans.push({
            status: 426,
            responseText: JSON.stringify({
                code: 'CLIENT_UPGRADE_REQUIRED',
                expectedBuild: { version: '1.16.1', stamp: 'server-build' },
            }),
        })

        await expect(prepare(new NodeStorage(fetcher)).importBackup(new Blob(['data']))).rejects.toBeDefined()
        const xhr = FakeXMLHttpRequest.instances[0]
        expect(buildHeaders(xhr)).toEqual([['x-client-build', 'build-1161']])
        expect(handshake.response).toHaveBeenCalledOnce()
        expect(handshake.xhr).toHaveBeenCalledTimes(1)
        expect(handshake.xhr).toHaveBeenCalledWith(xhr)
    })

    it('[unchanged] preserves prepare-before-XHR ordering and the native 507 rejection', async () => {
        const fetcher = vi.fn<StorageFetch>(async () => {
            expect(FakeXMLHttpRequest.instances).toHaveLength(0)
            return json({ available: 1024 }, 507)
        })

        await expect(prepare(new NodeStorage(fetcher)).importBackup(new Blob(['data']))).rejects.toBeDefined()
        expect(handshake.response).toHaveBeenCalledOnce()
        expect(handshake.xhr).not.toHaveBeenCalled()
        expect(FakeXMLHttpRequest.instances).toHaveLength(0)
    })

    it('[unchanged] preserves upload progress and the native success payload shape', async () => {
        const fetcher = vi.fn<StorageFetch>(async () => json({ ok: true }))
        FakeXMLHttpRequest.plans.push({
            status: 200,
            responseText: '{"type":"done","ok":true,"assetsRestored":7,"coldStorageFailed":2}\n',
        })
        const progress = vi.fn()

        await expect(prepare(new NodeStorage(fetcher)).importBackup(new Blob(['data']), progress)).resolves.toEqual({
            type: 'done',
            ok: true,
            assetsRestored: 7,
            coldStorageFailed: 2,
        })
        expect(progress).toHaveBeenCalledWith(4, 10)
    })
})
