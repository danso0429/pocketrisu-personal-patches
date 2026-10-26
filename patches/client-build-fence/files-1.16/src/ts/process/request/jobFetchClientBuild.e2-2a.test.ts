import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('src/ts/globalApi.svelte', () => ({
    forageStorage: { createAuth: vi.fn(async () => 'auth-token') },
}))

vi.mock('src/lang', () => ({
    language: { errors: { modelJobBusy: 'busy', modelJobConnectionLost: 'lost' } },
}))

import { makeJobFetch } from './jobFetch'
import {
    clientBuildStamp,
    resetClientBuildHandshakeForTests,
} from 'src/ts/storage/clientBuildHandshake'

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

    it('[new] aborted-create cleanup stamps the discovered job DELETE and handles its 426', async () => {
        const controller = new AbortController()
        const calls: [RequestInfo | URL, RequestInit | undefined][] = []
        const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            calls.push([input, init])
            const url = String(input)
            if (url === '/api/model-jobs') {
                return {
                    ok: true,
                    status: 200,
                    json: async () => {
                        controller.abort()
                        throw new DOMException('aborted while reading', 'AbortError')
                    },
                } as unknown as Response
            }
            if (url === '/api/model-jobs?active=1') {
                return new Response(JSON.stringify({
                    jobs: [{ id: 'job-7', chatId: 'chat-1', generationId: 'gen-1' }],
                }), { status: 200, headers: { 'content-type': 'application/json' } })
            }
            if (url === '/api/model-jobs/job-7') return upgrade()
            throw new Error(`unexpected fetch ${url}`)
        })
        vi.stubGlobal('fetch', fetcher)
        const jobFetch = makeJobFetch({
            realChatId: 'chat-1',
            generationId: 'gen-1',
            adapterKind: 'test',
            streaming: true,
            fallbackFetch: vi.fn(),
        })

        await expect(jobFetch('https://provider.invalid', { signal: controller.signal })).rejects.toThrow()
        await vi.waitFor(() => expect(calls.some(([url]) => String(url) === '/api/model-jobs/job-7')).toBe(true))
        const cleanup = calls.find(([url]) => String(url) === '/api/model-jobs/job-7')
        expect(new Headers(cleanup?.[1]?.headers).get('x-client-build')).toBe(clientBuildStamp)
        await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce())
    })
})
