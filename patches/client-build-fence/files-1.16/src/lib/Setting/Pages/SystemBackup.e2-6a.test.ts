import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    clientBuildFetch,
    clientBuildStamp,
    resetClientBuildHandshakeForTests,
} from 'src/ts/storage/clientBuildHandshake'

function sourceSection() {
    const source = readFileSync(path.join(process.cwd(), 'src/lib/Setting/Pages/SystemBackup.svelte'), 'utf8')
    const start = source.indexOf('    async function restoreSnapshot(')
    const end = source.indexOf('    // ── Snapshot limits', start)
    expect(start).toBeGreaterThanOrEqual(0)
    expect(end).toBeGreaterThan(start)
    return { source, restore: source.slice(start, end) }
}

describe('[E2-6a] Fence the native backup import and snapshot restore calls', () => {
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

    it('[new] routes each native snapshot restore through one stamped response-handling fetch', async () => {
        const fetcher = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
            .mockResolvedValueOnce(new Response('{"ok":true}', {
                status: 200,
                headers: { 'content-type': 'application/json' },
            }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                code: 'CLIENT_UPGRADE_REQUIRED',
                expectedBuild: { version: '1.16.1', stamp: 'server-build' },
                commitOutcome: 'not-committed',
            }), { status: 426, headers: { 'content-type': 'application/json' } }))
        vi.stubGlobal('fetch', fetcher)

        await expect(clientBuildFetch('/api/db/snapshots/restore', { method: 'POST' }))
            .resolves.toHaveProperty('status', 200)
        await expect(clientBuildFetch('/api/db/snapshots/restore', { method: 'POST' }))
            .resolves.toHaveProperty('status', 426)
        expect(fetcher).toHaveBeenCalledTimes(2)
        for (const call of fetcher.mock.calls) {
            expect(new Headers(call[1]?.headers).get('x-client-build')).toBe(clientBuildStamp)
        }
        expect(reload).toHaveBeenCalledOnce()

        const { restore } = sourceSection()
        expect(restore).toMatch(/await clientBuildFetch\('\/api\/db\/snapshots\/restore',\s*\{/)
    })

    it('[unchanged] preserves snapshot restore non-426 failure and success UI outcomes', () => {
        const { restore } = sourceSection()
        expect(restore).toMatch(/if \(!res\.ok\) throw new Error\(json\?\.error \|\| `HTTP \$\{res\.status\}`\)/)
        expect(restore).toContain("notifySuccess('Loaded backup')")
        expect(restore).toContain("location.search = ''")
        expect(restore).toContain('location.reload()')
        expect(restore).toMatch(/catch \(err\) \{\s*alertError\(err instanceof Error \? err\.message : String\(err\)\)/)
    })

    it('[unchanged] leaves non-writer snapshot reads on the native bare fetch path', () => {
        const { source } = sourceSection()
        expect(source).toMatch(/fetch\('\/api\/db\/snapshots', \{ headers: \{ 'risu-auth': auth \} \}\)/)
        expect(source).toMatch(/fetch\('\/api\/db\/snapshots\/limits', \{ headers: \{ 'risu-auth': auth \} \}\)/)
    })
})
