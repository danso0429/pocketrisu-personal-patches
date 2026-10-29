import { describe, expect, it, vi } from 'vitest'

const { createClientBuildFence } = require('./clientBuildFence.cjs')

describe('[E2-6a] Fence the native backup import and snapshot restore calls', () => {
    it('[unchanged] admits both native calls when the server build stamp is absent', () => {
        const warn = vi.fn()
        const fence = createClientBuildFence({
            distDir: '/definitely/missing-client-build-e2-6a',
            logger: { warn },
        })

        for (const requestPath of ['/api/backup/import', '/api/db/snapshots/restore']) {
            const next = vi.fn()
            const response = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn() }
            fence.middleware({
                method: 'POST',
                path: requestPath,
                headers: { 'x-client-build': 'any-client-build' },
            }, response, next)
            expect(next, requestPath).toHaveBeenCalledOnce()
            expect(response.status, requestPath).not.toHaveBeenCalled()
        }
        expect(warn).toHaveBeenCalledOnce()
    })
})
