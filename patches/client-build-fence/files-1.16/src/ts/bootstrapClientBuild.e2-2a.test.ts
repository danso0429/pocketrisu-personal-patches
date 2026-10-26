import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    clientBuildFetch,
    clientBuildStamp,
    handleClientBuildResponse,
    resetClientBuildHandshakeForTests,
} from './storage/clientBuildHandshake'

function upgrade() {
    return new Response(JSON.stringify({
        code: 'CLIENT_UPGRADE_REQUIRED',
        expectedBuild: { version: '1.16.1', stamp: 'server-build' },
        commitOutcome: 'not-committed',
    }), { status: 426, headers: { 'content-type': 'application/json' } })
}

describe('[E2-2a] Rebase the client build fence onto PocketRisu 1.16.1', () => {
    const reload = vi.fn()

    beforeEach(() => {
        resetClientBuildHandshakeForTests()
        reload.mockReset()
        vi.stubGlobal('location', { reload })
    })

    afterEach(() => {
        resetClientBuildHandshakeForTests()
        vi.unstubAllGlobals()
    })

    it('[new] boot auto-sweep uses the stamped fetch path and handles its 426', async () => {
        const source = readFileSync(path.join(process.cwd(), 'src/ts/bootstrap.ts'), 'utf8')
        expect(source).toMatch(/clientBuildFetch\('\/api\/db\/assets\/auto-sweep',\s*\{/)

        const fetcher = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
            .mockResolvedValueOnce(new Response('{}', {
                status: 200,
                headers: { 'content-type': 'application/json' },
            }))
            .mockResolvedValueOnce(upgrade())
        vi.stubGlobal('fetch', fetcher)
        await expect(clientBuildFetch('/api/db/assets/auto-sweep', { method: 'POST' }))
            .resolves.toHaveProperty('status', 200)
        await expect(clientBuildFetch('/api/db/assets/auto-sweep', { method: 'POST' }))
            .resolves.toHaveProperty('status', 426)
        expect(fetcher).toHaveBeenCalledTimes(2)
        for (const call of fetcher.mock.calls) {
            expect(new Headers(call[1]?.headers).get('x-client-build')).toBe(clientBuildStamp)
        }
        expect(reload).toHaveBeenCalledOnce()
    })

    it('[unchanged] an unrelated 426 does not trigger reload or consume the downstream body', async () => {
        const response = new Response('protocol upgrade required', {
            status: 426,
            headers: { 'content-type': 'text/plain' },
        })
        await handleClientBuildResponse(response)
        expect(reload).not.toHaveBeenCalled()
        expect(await response.text()).toBe('protocol upgrade required')
    })
})
