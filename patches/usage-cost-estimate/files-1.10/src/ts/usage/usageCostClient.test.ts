import { afterEach, describe, it, expect, vi } from 'vitest'
import { createRequire } from 'node:module'
vi.mock('src/ts/globalApi.svelte', () => ({ forageStorage: { createAuth: async () => 'synthetic-auth' } }))
vi.mock('src/ts/storage/database.svelte', () => ({ getDatabase: () => ({ requestLogEnabled: true }) }))
vi.mock('src/ts/log', () => ({ getClientId: () => 'synthetic-client' }))
import { createRequestLogScope, fetchUsageEntries } from '../requestLog'
const require = createRequire(import.meta.url)
const { captureUsageCostContext } = require('../../../server/node/usageCostStore.cjs')
afterEach(() => vi.unstubAllGlobals())

describe('actual usage metadata collector and list transport', () => {
    it('retains accounting and served tier through the real log scope and final server context', async () => {
        const posted: any[] = []
        vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
            posted.push(JSON.parse(String(init.body)))
            return Response.json({ success: true })
        }))
        const scope = createRequestLogScope({ category: 'llm', source: 'main', model: 'gemini-4-argon', provider: 'google' })
        const transport = scope.wrap(async () => Response.json({ candidates: [] }))
        await (await transport('https://aiplatform.googleapis.com/v1/projects/test/locations/global/publishers/google/models/gemini-4-argon:generateContent')).text()
        scope.setUsage({ inputTokens: 100, outputTokens: 15, cachedTokens: 80, reasoningTokens: 5,
            trafficType: 'ON_DEMAND_PRIORITY', usageAccountingVersion: 1 })
        await scope.close()
        expect(posted).toHaveLength(1)
        const row = posted[0][0]
        expect(row).toMatchObject({ trafficType: 'ON_DEMAND_PRIORITY', usageAccountingVersion: 1, outputTokens: 15 })
        expect(JSON.parse(captureUsageCostContext(row))).toMatchObject({ product: 'vertex', region: 'global',
            tier: 'priority', tierSource: 'reported', accounting: true, valid: true })
    })
    it('sends the same filters and exact cursor with authenticated bounded reads', async () => {
        const fetcher = vi.fn(async () => Response.json({ costVersion: 1, entries: [], nextCursor: null }))
        vi.stubGlobal('fetch', fetcher)
        await fetchUsageEntries({ sources: ['sub'], models: ['gemini-4-argon'], since: 10, until: 20, successOnly: true }, { timestamp: 19, id: 7 })
        const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
        const params = new URL(url, 'https://synthetic.invalid').searchParams
        expect(Object.fromEntries(params)).toEqual({ limit: '50', sources: 'sub', models: 'gemini-4-argon', since: '10', until: '20',
            success: '1', before_timestamp: '19', before_id: '7' })
        expect(init.headers).toMatchObject({ 'risu-auth': 'synthetic-auth' })
    })
    it('treats old/error servers as unavailable rather than a known zero', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))
        expect(await fetchUsageEntries()).toBeNull()
        vi.stubGlobal('fetch', vi.fn(async () => Response.json({ total: 0 })))
        expect(await fetchUsageEntries()).toBeNull()
    })
})
