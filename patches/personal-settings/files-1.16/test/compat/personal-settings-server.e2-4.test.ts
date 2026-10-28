import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)

function response() {
    return {
        statusCode: 200,
        body: null as unknown,
        setHeader: vi.fn(),
        status(code: number) { this.statusCode = code; return this },
        json(body: unknown) { this.body = body; return this },
    }
}

describe('[E2-4d] Rebase personal-settings onto PocketRisu 1.16.1', () => {
    it('[new] treats the external-header PUT as a build-fenced writer and rejects a stale build with 426', async () => {
        let fenceModule: Record<string, unknown> | null = null
        try { fenceModule = require('../../server/node/clientBuildFence.cjs') }
        catch { /* asserted below so a missing pre-rebase module is a behavior failure */ }
        expect(fenceModule, 'the already-rebased build-fence module is present').not.toBeNull()
        if (!fenceModule) return
        expect(fenceModule.createClientBuildFence).toEqual(expect.any(Function))
        expect(fenceModule.isWriterRoute).toEqual(expect.any(Function))

        const distDir = await mkdtemp(path.join(os.tmpdir(), 'personal-settings-fence-'))
        await writeFile(path.join(distDir, 'build-stamp.json'), JSON.stringify({ version: '1.16.1', stamp: 'current-build' }))
        const request = {
            method: 'PUT',
            path: '/api/external-request-headers',
            headers: { 'x-client-build': 'stale-build' },
        }
        expect((fenceModule.isWriterRoute as (req: typeof request) => boolean)(request)).toBe(true)
        const next = vi.fn()
        const res = response()
        const fence = (fenceModule.createClientBuildFence as (options: { distDir: string }) => {
            middleware: (req: typeof request, res: ReturnType<typeof response>, next: () => void) => void
        })({ distDir })
        fence.middleware(request, res, next)
        expect(next).not.toHaveBeenCalled()
        expect(res.statusCode).toBe(426)
        expect(res.body).toMatchObject({ code: 'CLIENT_UPGRADE_REQUIRED', commitOutcome: 'not-committed' })
    })

    it('[new] loads old-release external-header storage and applies its configured header', () => {
        let headersModule: Record<string, unknown> | null = null
        try { headersModule = require('../../server/node/externalRequestHeaders.cjs') }
        catch { /* asserted below so a missing pack module is a behavior failure */ }
        expect(headersModule, 'the rebased externalRequestHeaders module exists').not.toBeNull()
        if (!headersModule) return
        expect(headersModule.createExternalRequestHeaders).toEqual(expect.any(Function))

        const stored = JSON.stringify({
            version: 1,
            revision: 7,
            secret: 'ab'.repeat(32),
            rules: [{
                id: 'legacy-rule',
                name: 'Legacy',
                enabled: true,
                destination: 'https://api.example.test/v1',
                header: 'x-session',
                valueKind: 'conversation-session',
            }],
        })
        const owner = (headersModule.createExternalRequestHeaders as (dependencies: unknown) => {
            settings: () => { revision: number; rules: unknown[] }
            apply: (url: string, headers: Record<string, string>, conversation: string) => { headers: Record<string, string> }
        })({ kvGet: () => stored, kvSet: vi.fn() })
        expect(owner.settings()).toMatchObject({ revision: 7, rules: [expect.objectContaining({ id: 'legacy-rule' })] })
        expect(owner.apply('https://api.example.test/v1/chat', {}, 'chat-1').headers['x-session']).toMatch(/^[a-f0-9]{64}$/)
    })
})
