import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    clientBuildFetch,
    clientBuildStamp,
    resetClientBuildHandshakeForTests,
    setClientBuildComposerDirty,
} from './clientBuildHandshake'

describe('[C-1] Fence the client input recovery routes', () => {
    const reload = vi.fn()
    const upgrade = () => new Response(JSON.stringify({
        code: 'CLIENT_UPGRADE_REQUIRED',
        expectedBuild: { version: '1.10.0', stamp: 'server-build-B' },
        commitOutcome: 'not-committed',
    }), { status: 426, headers: { 'content-type': 'application/json' } })

    beforeEach(() => {
        resetClientBuildHandshakeForTests()
        reload.mockReset()
        vi.stubGlobal('location', { reload })
        document.body.innerHTML = '<div id="app"><textarea>draft</textarea></div>'
    })

    afterEach(() => {
        resetClientBuildHandshakeForTests()
        vi.unstubAllGlobals()
        document.body.innerHTML = ''
    })

    it('sends the build stamp on claim and reloads a clean client after its 426', async () => {
        const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => upgrade())
        vi.stubGlobal('fetch', fetcher)
        const response = await clientBuildFetch('/api/bg-orchestrate-input/claim', {
            method: 'POST', body: '{}',
        })
        expect(response.status).toBe(426)
        const call = fetcher.mock.calls[0]
        if (!call) throw new Error('claim fetch was not called')
        const headers = new Headers(call[1]?.headers)
        expect(headers.get('x-client-build')).toBe(clientBuildStamp)
        expect(reload).toHaveBeenCalledOnce()
    })

    it('freezes and preserves a dirty draft without depending on abandon succeeding', async () => {
        setClientBuildComposerDirty(true, 'unsaved draft')
        const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => upgrade())
        vi.stubGlobal('fetch', fetcher)
        await clientBuildFetch('/api/bg-orchestrate-input/claim', { method: 'POST' })
        expect(fetcher).toHaveBeenCalledOnce()
        expect(reload).not.toHaveBeenCalled()
        expect(document.getElementById('risu-client-build-banner')?.textContent).toContain('Server updated')
        expect(document.querySelector<HTMLTextAreaElement>(
            '#risu-client-build-banner textarea[aria-label="Unsaved text recovery"]',
        )?.value).toBe('unsaved draft')
    })
})
