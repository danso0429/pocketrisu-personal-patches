import { describe, expect, it, vi } from 'vitest'
import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const { createClientBuildFence, isWriterRoute } = require('./clientBuildFence.cjs')

const expectedBuild = { version: '1.10.0', stamp: 'build-B' }

async function stampedDist() {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'phase-c-fence-'))
    await writeFile(path.join(dir, 'build-stamp.json'), JSON.stringify(expectedBuild))
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

describe('[C-1] Fence the client input recovery routes', () => {
    const recoveryRoutes = [
        '/api/bg-orchestrate-input/claim',
        '/api/bg-orchestrate-input/attach',
        '/api/bg-orchestrate-input/abandon',
    ]

    it.each(recoveryRoutes)('classifies %s as a writer while preserving read and cancel routes', (route) => {
        expect(isWriterRoute({ method: 'POST', path: route })).toBe(true)
        expect(isWriterRoute({ method: 'POST', path: `${route}/` })).toBe(true)
        expect(isWriterRoute({ method: 'post', path: route.toUpperCase() })).toBe(true)
        expect(isWriterRoute({ method: 'GET', path: route })).toBe(false)
        expect(isWriterRoute({ method: 'DELETE', path: '/api/bg-orchestrate' })).toBe(false)
        expect(isWriterRoute({ method: 'GET', path: '/api/bg-orchestrate/status' })).toBe(false)
        expect(isWriterRoute({ method: 'GET', path: '/api/bg-orchestrate/base' })).toBe(false)
        expect(isWriterRoute({ method: 'GET', path: '/api/bg-orchestrate/result' })).toBe(false)
    })

    it.each(recoveryRoutes)('rejects stale and missing builds before %s can mutate input state', async (route) => {
        const fence = createClientBuildFence({ distDir: await stampedDist() })
        for (const headers of [{ 'x-client-build': 'build-A' }, {}]) {
            const next = vi.fn()
            const res = response()
            fence.middleware({ method: 'POST', path: route, headers }, res, next)
            expect(next).not.toHaveBeenCalled()
            expect(res.statusCode).toBe(426)
            expect(res.body).toMatchObject({
                code: 'CLIENT_UPGRADE_REQUIRED',
                commitOutcome: 'not-committed',
            })
        }
    })

    it.each(recoveryRoutes)('admits a matching build to %s exactly once', async (route) => {
        const fence = createClientBuildFence({ distDir: await stampedDist() })
        const next = vi.fn()
        fence.middleware({
            method: 'POST', path: route,
            headers: { 'x-client-build': expectedBuild.stamp },
        }, response(), next)
        expect(next).toHaveBeenCalledOnce()
    })
})
