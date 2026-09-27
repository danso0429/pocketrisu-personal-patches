import { describe, expect, it, vi } from 'vitest'
import ownerPackage from './externalRequestHeaders.cjs'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
const { KEY, createExternalRequestHeaders, withExternalHeaderConversation, registerExternalHeaderRoutes } = ownerPackage
const rule = { id: 'rule-one', name: 'Test', enabled: true, destination: 'https://api.example.test/v1', header: 'x-session', valueKind: 'conversation-session' }
function harness() {
    const values = new Map<string, string>()
    const log = vi.fn()
    const dependencies = { kvGet: (key: string) => values.get(key), kvSet: (key: string, value: string) => values.set(key, value), log }
    return { values, log, dependencies, owner: createExternalRequestHeaders(dependencies) }
}
describe('external request header rules', () => {
    it('applies the shared owner through the composed BG proxy shim with isolated conversation context', async () => {
        const h = harness()
        const owner = ownerPackage.configureExternalRequestHeaders(h.dependencies)
        owner.save({ revision: 0, rules: [rule] })
        const source = readFileSync(new URL('./bgOrchestrator.cjs', import.meta.url), 'utf8')
        const start = source.indexOf('function patchFetch(requestLogs) {')
        const end = source.indexOf('// DBState / selectedCharID', start)
        expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start)
        const fetcher = vi.fn(async (_url, init) => new Response(JSON.stringify(init.headers)))
        const sandbox: any = vm.createContext({ fetch: fetcher,
            fetchWithExternalHeaders: ownerPackage.fetchWithExternalHeaders,
            orchestrationAbortContext: { withSignal: (init: unknown) => init },
            llmMark: (_target: unknown, response: unknown) => response,
        })
        vm.runInContext(source.slice(start, end) + '\npatchFetch(null)', sandbox)
        const send = (key: string) => withExternalHeaderConversation(key, () => sandbox.fetch('/proxy2', {
            method: 'POST', body: 'unchanged', headers: { 'risu-url': encodeURIComponent(rule.destination), 'risu-header': encodeURIComponent('{"x-original":"kept"}') },
        }))
        const responses = await Promise.all([send('chat-a'), send('chat-b')])
        const headers = await Promise.all(responses.map(response => response.json()))
        expect(headers[0]['x-session']).not.toBe(headers[1]['x-session'])
        expect(headers[0]['x-original']).toBe('kept')
        expect(fetcher.mock.calls.every(([, init]) => init.body === 'unchanged')).toBe(true)
        ownerPackage.configureExternalRequestHeaders({ kvGet: () => null, kvSet: () => {} })
    })
    it('leaves absent and disabled rules byte/reference equivalent and makes no writes', async () => {
        const h = harness()
        const init = { method: 'POST', headers: { 'X-Original': 'value' }, body: 'exact body' }
        const fetcher = vi.fn(async () => new Response('ok'))
        await h.owner.fetchWithRules(fetcher, rule.destination, init)
        expect(fetcher.mock.calls[0][1]).toBe(init)
        expect(h.values.size).toBe(0)
        h.owner.save({ revision: 0, rules: [{ ...rule, enabled: false }] })
        await h.owner.fetchWithRules(fetcher, rule.destination, init)
        expect(fetcher.mock.calls[1][1]).toBe(init)
        expect(h.log).not.toHaveBeenCalled()
    })
    it.each(['http://api.example.test/v1', 'https://api.example.test.evil/v1', 'https://api.example.test:8443/v1', 'https://api.example.test/v10', 'https://other.test/v1'])('does not match %s', url => {
        const h = harness(); h.owner.save({ revision: 0, rules: [rule] })
        const headers = { Authorization: 'preserved' }
        expect(h.owner.apply(url, headers).headers).toBe(headers)
    })
    it('uses stable, isolated chat/rule identities without exposing them', async () => {
        const h = harness(); h.owner.save({ revision: 0, rules: [rule] })
        const get = () => h.owner.apply(rule.destination + '/chat?x=1', {}).headers['x-session']
        const [a, b] = await Promise.all(['private-chat-a', 'private-chat-b'].map(key => withExternalHeaderConversation(key, async () => {
            await new Promise(resolve => setTimeout(resolve, 2)); return get()
        })))
        expect(a).not.toBe(b)
        expect(a).toMatch(/^[a-f0-9]{64}$/)
        expect(withExternalHeaderConversation('private-chat-a', get)).toBe(a)
        const restarted = createExternalRequestHeaders(h.dependencies)
        expect(restarted.apply(rule.destination, {}, 'private-chat-a').headers['x-session']).toBe(a)
        expect(get()).not.toBe(a)
        expect(get()).toBe(get())
        expect(JSON.stringify(h.log.mock.calls)).not.toContain(a)
        expect(JSON.stringify(h.log.mock.calls)).not.toContain('private-chat')
        expect(h.owner.settings()).not.toHaveProperty('secret')
    })
    it.each(['Authorization', 'Cookie', 'HOST', 'Connection', 'Proxy-Authorization', 'X-Risu-Tk', 'risu-header', 'x-client-build', 'Content-Length', 'x-test\r\nevil'])('rejects forbidden header %s', header => {
        const h = harness()
        expect(() => h.owner.save({ revision: 0, rules: [{ ...rule, header }] })).toThrow()
        expect(h.values.size).toBe(0)
    })
    it.each(['http://a.test/', 'https://user:pass@a.test/', 'https://a.test/?secret=1', 'https://*.test/', 'https://a.test/#x'])('rejects invalid destination %s', destination => {
        expect(() => harness().owner.save({ revision: 0, rules: [{ ...rule, destination }] })).toThrow()
    })
    it('preserves existing case-insensitive headers and original objects', () => {
        const h = harness(); h.owner.save({ revision: 0, rules: [rule] })
        for (const headers of [{ 'X-SESSION': '' }, new Headers({ 'x-session': 'caller' }), [['X-Session', 'caller']]]) {
            expect(h.owner.apply(rule.destination, headers).headers).toBe(headers)
        }
        const original = { Authorization: 'caller' }
        const changed = h.owner.apply(rule.destination, original).headers
        expect(changed.Authorization).toBe('caller')
        expect(original).toEqual({ Authorization: 'caller' })
    })
    it('rejects stale writes, duplicates and failed persistence without reporting success', () => {
        const h = harness(); h.owner.save({ revision: 0, rules: [rule] })
        expect(() => h.owner.save({ revision: 0, rules: [] })).toThrow(/another device/)
        expect(() => h.owner.save({ revision: 1, rules: [rule, rule] })).toThrow()
        const failing = createExternalRequestHeaders({ ...h.dependencies, kvSet: () => { throw new Error('write failed') } })
        expect(() => failing.save({ revision: 1, rules: [] })).toThrow('write failed')
        expect(h.owner.settings().rules).toHaveLength(1)
        h.values.set(KEY, 'corrupt')
        expect(() => h.owner.settings()).toThrow(/unavailable/)
    })
    it('rechecks redirect scope and strips injected values and cross-origin credentials', async () => {
        const h = harness(); h.owner.save({ revision: 0, rules: [rule] })
        const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://other.test/end' } }))
            .mockResolvedValueOnce(new Response('done'))
        await h.owner.fetchWithRules(fetcher, rule.destination, { method: 'POST', body: 'body', headers: { Authorization: 'secret', 'content-type': 'text/plain' } })
        expect(fetcher.mock.calls[0][1].headers['x-session']).toMatch(/^[a-f0-9]{64}$/)
        expect(fetcher.mock.calls[1][1]).toMatchObject({ method: 'GET', body: undefined, headers: {} })
    })
    it('preserves same-scope 307 bodies and stops redirect loops', async () => {
        const h = harness(); h.owner.save({ revision: 0, rules: [rule] })
        const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 307, headers: { location: '/v1/next' } })).mockResolvedValueOnce(new Response('done'))
        await h.owner.fetchWithRules(fetcher, rule.destination, { method: 'POST', body: 'exact' })
        expect(fetcher.mock.calls[1][1].body).toBe('exact')
        expect(fetcher.mock.calls[1][1].headers['x-session']).toBe(fetcher.mock.calls[0][1].headers['x-session'])
        const loop = vi.fn(async () => new Response(null, { status: 307, headers: { location: '/v1' } }))
        await expect(h.owner.fetchWithRules(loop, rule.destination)).rejects.toThrow(/redirect/)
        expect(loop).toHaveBeenCalledTimes(21)
    })
    it('authenticates both settings routes before reading or writing', async () => {
        const h = harness(); const routes: Record<string, Function> = {}
        const app = { get: (p: string, f: Function) => { routes.GET = f }, put: (p: string, f: Function) => { routes.PUT = f } }
        registerExternalHeaderRoutes(app, async () => false, h.owner)
        const res = { json: vi.fn() }
        await routes.GET({}, res, vi.fn()); await routes.PUT({ body: { revision: 0, rules: [rule] } }, res, vi.fn())
        expect(res.json).not.toHaveBeenCalled(); expect(h.values.size).toBe(0)
    })
})
