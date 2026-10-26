import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const { createClientBuildFence, isWriterRoute } = require('./clientBuildFence.cjs')

const EXPECTED = { version: '1.16.1', stamp: 'build-1161' }
const WRITERS: [string, string][] = [
    ['POST', '/api/risu-account/prepare'],
    ['POST', '/api/risu-account/download'],
    ['POST', '/api/risu-account/cancel'],
    ['POST', '/api/risu-account/apply'],
    ['POST', '/api/characters/cha_123/archive'],
    ['POST', '/api/characters/archive-batch'],
    ['POST', '/api/characters/cha_123/activate'],
    ['DELETE', '/api/characters/cha_123/archive'],
    ['POST', '/api/db/archive/purge-orphans'],
    ['POST', '/api/db/assets/auto-sweep'],
    ['PATCH', '/api/asset-manifests/owner/character/own_456'],
]

async function stampedDist() {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'client-build-fence-e2-2a-'))
    await writeFile(path.join(dir, 'build-stamp.json'), JSON.stringify(EXPECTED))
    return dir
}

function response() {
    return {
        statusCode: 200,
        body: null as unknown,
        setHeader: vi.fn(),
        status(code: number) { this.statusCode = code; return this },
        json(body: unknown) { this.body = body; return this },
    }
}

describe('[E2-2a] Rebase the client build fence onto PocketRisu 1.16.1', () => {
    it('[new] rejects missing and stale builds on all eleven writers and admits the matching build', async () => {
        const fence = createClientBuildFence({ distDir: await stampedDist() })
        for (const [method, requestPath] of WRITERS) {
            expect(isWriterRoute({ method, path: requestPath }), `${method} ${requestPath}`).toBe(true)
            for (const headers of [{}, { 'x-client-build': 'build-old' }]) {
                const next = vi.fn()
                const res = response()
                fence.middleware({ method, path: requestPath, headers }, res, next)
                expect(next, `${method} ${requestPath}`).not.toHaveBeenCalled()
                expect(res.statusCode, `${method} ${requestPath}`).toBe(426)
                expect(res.body).toMatchObject({
                    code: 'CLIENT_UPGRADE_REQUIRED',
                    commitOutcome: 'not-committed',
                })
            }
            const next = vi.fn()
            fence.middleware({
                method,
                path: requestPath,
                headers: { 'x-client-build': EXPECTED.stamp },
            }, response(), next)
            expect(next, `${method} ${requestPath}`).toHaveBeenCalledOnce()
        }
    })

    it('[new] rejects a malformed archive-batch body before parsing or downstream handling', async () => {
        const fence = createClientBuildFence({ distDir: await stampedDist() })
        const parseBody = vi.fn(() => { throw new SyntaxError('malformed JSON') })
        const handler = vi.fn()
        const next = vi.fn(() => {
            parseBody('{bad')
            handler()
        })
        const res = response()
        expect(() => fence.middleware({
            method: 'POST',
            path: '/api/characters/archive-batch',
            headers: { 'x-client-build': 'stale', 'content-type': 'application/json' },
            body: '{bad',
        }, res, next)).not.toThrow()
        expect(res.statusCode).toBe(426)
        expect(res.body).toMatchObject({ code: 'CLIENT_UPGRADE_REQUIRED' })
        expect(parseBody).not.toHaveBeenCalled()
        expect(handler).not.toHaveBeenCalled()
    })

    it('[new] applies existing segment, method, case, slash, and query-string rules', () => {
        expect(isWriterRoute({ method: 'post', path: '/API/CHARACTERS/A%2FB-1_2.3~4/ARCHIVE/' })).toBe(true)
        expect(isWriterRoute({ method: 'patch', path: '/API/ASSET-MANIFESTS/OWNER/custom_kind/id-with-dashes/' })).toBe(true)
        expect(isWriterRoute({ method: 'POST', path: '/api/characters/archive-batch/archive' })).toBe(true)
        expect(isWriterRoute({ method: 'POST', path: '/api/characters//archive' })).toBe(false)
        expect(isWriterRoute({ method: 'PATCH', path: '/api/asset-manifests/owner/kindOnly' })).toBe(false)
        expect(isWriterRoute({ method: 'PATCH', path: '/api/asset-manifests/owner/k/o/extra' })).toBe(false)
        expect(isWriterRoute({ method: 'GET', path: '/api/risu-account/prepare' })).toBe(false)
        expect(isWriterRoute({ method: 'PUT', path: '/api/characters/123/archive' })).toBe(false)
        expect(isWriterRoute({ method: 'POST', path: '/api/asset-manifests/owner/k/o' })).toBe(false)
        expect(isWriterRoute({ method: 'DELETE', path: '/api/characters/123/activate' })).toBe(false)
        expect(isWriterRoute({ method: 'POST', path: '/api/db/assets/auto-sweep/' })).toBe(true)
        expect(isWriterRoute({ method: 'POST', path: '/api/DB/Assets/Auto-Sweep' })).toBe(true)
        expect(isWriterRoute({ method: 'POST', path: '/api/db/archive/purge-orphans?dryRun=false' })).toBe(false)
    })

    it('[unchanged] leaves explicit non-writers outside the fence', async () => {
        const fence = createClientBuildFence({ distDir: await stampedDist() })
        for (const [method, requestPath] of [
            ['POST', '/api/termux-notify'],
            ['POST', '/api/asset-manifests/resolve'],
            ['POST', '/api/db/flush'],
            ['POST', '/api/model-jobs'],
            ['POST', '/proxy2'],
        ]) {
            expect(isWriterRoute({ method, path: requestPath }), requestPath).toBe(false)
            const next = vi.fn()
            fence.middleware({ method, path: requestPath, headers: {} }, response(), next)
            expect(next, requestPath).toHaveBeenCalledOnce()
        }
    })

    it('[unchanged] fails open for old and new writers when the build artifact is absent', () => {
        const warn = vi.fn()
        const fence = createClientBuildFence({ distDir: '/definitely/missing', logger: { warn } })
        for (const [method, requestPath] of [...WRITERS, ['POST', '/api/write']]) {
            const next = vi.fn()
            fence.middleware({ method, path: requestPath, headers: {} }, response(), next)
            expect(next, `${method} ${requestPath}`).toHaveBeenCalledOnce()
        }
        expect(warn).toHaveBeenCalledOnce()
    })
})
