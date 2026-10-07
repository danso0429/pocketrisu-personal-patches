import Database from 'better-sqlite3'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'
const require = createRequire(import.meta.url)
const { createBgNotifications, PREFIX, LEASE_MS, MAX_ROWS } = require('./bgNotifications.cjs')
const cleanup: Array<() => void> = []
afterEach(() => { while (cleanup.length) cleanup.pop()!() })

function harness() {
    const db = new Database(':memory:')
    db.exec('CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
    cleanup.push(() => db.close())
    let time = 1_000_000, writes = 0, failAt = 0
    const deps = { db, now: () => time,
        kvGet: (key: string) => (db.prepare('SELECT value FROM kv WHERE key=?').get(key) as any)?.value ?? null,
        kvSet: (key: string, value: string) => {
            if (++writes === failAt) throw new Error('injected write failure')
            db.prepare('INSERT OR REPLACE INTO kv VALUES (?, ?)').run(key, value)
        },
        kvDel: (key: string) => db.prepare('DELETE FROM kv WHERE key=?').run(key),
        kvList: (prefix: string) => (db.prepare('SELECT key FROM kv WHERE substr(key,1,?)=?').all(prefix.length, prefix) as any[]).map(row => row.key),
    }
    return { deps, owner: createBgNotifications(deps), advance: (ms: number) => { time += ms },
        fail: (at: number) => { writes = 0; failAt = at },
        event: (id = 'operation-one') => ({ operationId: id, eventKey: 'input-host-unsupported',
            code: 'input_host_unsupported', charId: 'character-1', chatId: 'chat-1',
            createdAt: time, effectsMayHaveOccurred: true, api: 'interactive_ui' }) }
}

describe('durable BG notification owner', () => {
    it('retains unrelated corrupt failure receipts without blocking healthy groups', () => {
        const h = harness(), prefix = 'internal/bg-plugin-failure-receipts/v1/'
        const brokenKey = prefix + 'f'.repeat(64)
        h.deps.kvSet(brokenKey, '{broken json')
        const event = { ...h.event(), code: 'plugin_hook_failed', pluginName: 'synthetic', pluginVersion: '1', phase: 'input' }
        expect(h.owner.publishPluginFailure(event, 'a'.repeat(64)).status).toBe('stored')
        expect(h.deps.kvGet(brokenKey)).toBe('{broken json')
        const ownKey = h.deps.kvList(prefix).find(key => key !== brokenKey)!
        h.deps.kvSet(ownKey, '{broken own receipt')
        expect(() => h.owner.publishPluginFailure(event, 'a'.repeat(64))).toThrow()
        for (let index = 2; index < MAX_ROWS; index++) h.deps.kvSet(prefix + `broken-${index}`, 'retained')
        expect(h.owner.publishPluginFailure({ ...event, operationId: 'another-operation' }, 'b'.repeat(64)).status).toBe('capacity')
    })

    it('coalesces recurring plugin failures across operations without changing v1 input receipts', () => {
        const h = harness(), identity = 'a'.repeat(64)
        const event = { ...h.event(), code: 'plugin_api_unsupported', pluginName: 'synthetic',
            pluginVersion: '1', phase: 'load', api: 'plugin_runtime', effectsMayHaveOccurred: false }
        const first = h.owner.publishPluginFailure(event, identity)
        h.owner.acknowledge('consumer-one', h.owner.claim('consumer-one'))
        const restarted = createBgNotifications(h.deps)
        for (let index = 0; index < 1100; index++) {
            expect(restarted.publishPluginFailure({ ...event, operationId: `operation-repeat-${index}` }, identity))
                .toEqual({ status: 'duplicate', id: first.id })
        }
        expect(h.deps.kvList(PREFIX)).toHaveLength(1)
        expect(h.deps.kvList('internal/bg-plugin-failure-receipts/v1/')).toHaveLength(1)
        expect(h.owner.publish(h.event('ordinary-input-operation')).status).toBe('stored')
        expect(restarted.publishPluginFailure({ ...event, operationId: 'new-script-operation' }, 'b'.repeat(64)).status).toBe('stored')
        expect(restarted.publishPluginFailure({ ...event, operationId: 'partial-effect-operation', effectsMayHaveOccurred: true }, identity).status).toBe('stored')
        h.advance(48 * 60 * 60 * 1000 + 1)
        expect(restarted.publishPluginFailure({ ...event, operationId: 'expired-group-operation', createdAt: h.event().createdAt }, identity).status).toBe('stored')
    })

    it('atomically writes the first plugin failure and its coalescing receipt', () => {
        const h = harness()
        const event = { ...h.event(), code: 'plugin_hook_failed', pluginName: 'synthetic', pluginVersion: '1', phase: 'input' }
        h.fail(2)
        expect(() => h.owner.publishPluginFailure(event, 'a'.repeat(64))).toThrow('injected write failure')
        expect(h.deps.kvList(PREFIX)).toEqual([])
        expect(h.deps.kvList('internal/bg-plugin-failure-receipts/v1/')).toEqual([])
        h.fail(0)
        expect(h.owner.publishPluginFailure(event, 'a'.repeat(64)).status).toBe('stored')
    })

    it('reserves capacity for failures when informational messages reach their sub-cap', () => {
        const h = harness()
        const event = { ...h.event(), code: 'plugin_message', pluginName: 'synthetic', pluginVersion: '1',
            phase: 'load', message: 'synthetic', level: 'info' }
        for (let index = 0; index < 256; index++) {
            expect(h.owner.publish({ ...event, eventKey: `message-${index}` }).status).toBe('stored')
        }
        expect(h.owner.publish({ ...event, eventKey: 'over-limit' }).status).toBe('capacity')
        expect(h.owner.publish(h.event()).status).toBe('stored')
        expect(h.owner.claim('legacy-consumer').map((row: any) => row.event.code)).toEqual(['input_host_unsupported'])
    })

    it('reclaims only acknowledged v2 receipts at total capacity', () => {
        const h = harness()
        const v2 = h.owner.publish({ ...h.event(), eventKey: 'message', code: 'plugin_message', pluginName: 'synthetic',
            pluginVersion: '1', phase: 'load', message: 'synthetic', level: 'info' })
        h.owner.acknowledge('modern-consumer', h.owner.claim('modern-consumer', 2))
        const v1 = h.owner.publish(h.event())
        h.owner.acknowledge('legacy-consumer', h.owner.claim('legacy-consumer'))
        for (let index = 0; index < MAX_ROWS - 2; index++) h.deps.kvSet(PREFIX + `malformed-${index}`, 'retained')
        expect(h.owner.publish(h.event('new-failure-operation')).status).toBe('stored')
        expect(h.deps.kvGet(PREFIX + v2.id)).toBeNull()
        expect(h.deps.kvGet(PREFIX + v1.id)).not.toBeNull()
        expect(h.deps.kvGet(PREFIX + 'malformed-0')).toBe('retained')
        expect(h.owner.publish(h.event('another-failure-operation')).status).toBe('capacity')
    })

    it('keeps v1 delivery compatible while v2 messages require an explicit reader capability', () => {
        const h = harness()
        h.owner.publish(h.event())
        const message = { ...h.event(), eventKey: 'plugin-message', code: 'plugin_message',
            pluginName: 'synthetic', pluginVersion: '1', phase: 'before_request',
            message: 'line one\nline two', level: 'info' }
        const published = h.owner.publish(message)
        expect(JSON.parse(h.deps.kvGet(PREFIX + published.id)!).version).toBe(2)
        expect(h.owner.claim('legacy-consumer').map((row: any) => row.event.code)).toEqual(['input_host_unsupported'])
        const modern = h.owner.claim('modern-consumer', 2)
        expect(modern.map((row: any) => row.event.message)).toEqual(['line one\nline two'])
        expect(h.owner.acknowledge('modern-consumer', modern)).toEqual([published.id])
        expect(createBgNotifications(h.deps).claim('another-modern', 2)).toEqual([])
        expect(() => h.owner.publish({ ...message, eventKey: 'bad-message', message: '\u0000' })).toThrow()
    })

    it('preserves corrupted records while claiming and publishing healthy notices', () => {
        const h = harness(), brokenKey = PREFIX + 'f'.repeat(64)
        h.deps.kvSet(brokenKey, '{broken json')
        h.deps.kvSet(PREFIX + 'invalid-key', 'preserved bytes')
        expect(h.owner.publish(h.event()).status).toBe('stored')
        expect(h.owner.claim('consumer-one')).toHaveLength(1)
        expect(h.deps.kvGet(brokenKey)).toBe('{broken json')
        expect(h.deps.kvGet(PREFIX + 'invalid-key')).toBe('preserved bytes')
    })

    it('accepts a late ACK only if no replacement lease exists and bounds the lease by event expiry', () => {
        const h = harness()
        h.owner.publish(h.event())
        const [first] = h.owner.claim('consumer-one')
        h.advance(LEASE_MS + 1)
        expect(h.owner.acknowledge('consumer-one', [first])).toEqual([first.id])
        h.owner.publish(h.event('operation-late-expiry'))
        h.advance(48 * 60 * 60 * 1000 - 5000)
        expect(h.owner.claim('consumer-two')[0].leaseMs).toBe(5000)
    })
    it('deduplicates stable source intent, preserves ACK tombstones, and excludes arbitrary payload fields', () => {
        const h = harness(), event = { ...h.event(), rawText: 'must not persist', credential: 'must not persist' }
        const first = h.owner.publish(event)
        expect(first.status).toBe('stored')
        expect(h.owner.publish(event)).toEqual({ status: 'duplicate', id: first.id })
        expect(h.deps.kvGet(PREFIX + first.id)).not.toContain('must not persist')
        const [claimed] = h.owner.claim('consumer-one')
        expect(h.owner.acknowledge('consumer-wrong', [{ id: claimed.id, token: claimed.token }])).toEqual([])
        expect(h.owner.acknowledge('consumer-one', [{ id: claimed.id, token: claimed.token }])).toEqual([claimed.id])
        expect(h.owner.acknowledge('consumer-one', [{ id: claimed.id, token: claimed.token }])).toEqual([claimed.id])
        expect(createBgNotifications(h.deps).claim('consumer-two')).toEqual([])
        expect(h.owner.publish(event).status).toBe('duplicate')
        expect(h.owner.publish({ ...event, chatId: 'other-chat' }).status).toBe('conflict')
        expect(h.owner.claim('consumer-one')).toEqual([])
    })

    it('allows one live consumer, reclaims after lease expiry, and rejects stale ACK', () => {
        const h = harness()
        h.owner.publish(h.event())
        const [first] = h.owner.claim('consumer-one')
        expect(h.owner.claim('consumer-two')).toEqual([])
        expect(h.owner.claim('consumer-one')[0].token).toBe(first.token)
        h.advance(LEASE_MS + 1)
        const [next] = createBgNotifications(h.deps).claim('consumer-two')
        expect(next.token).not.toBe(first.token)
        expect(h.owner.acknowledge('consumer-one', [first])).toEqual([])
        expect(h.owner.acknowledge('consumer-two', [next])).toEqual([next.id])
    })

    it('rolls back partial claim and ACK batches on actual SQLite transaction failure', () => {
        const h = harness()
        h.owner.publish(h.event('operation-one')); h.owner.publish(h.event('operation-two'))
        h.fail(2)
        expect(() => h.owner.claim('consumer-one')).toThrow('injected write failure')
        for (const key of h.deps.kvList(PREFIX)) expect(JSON.parse(h.deps.kvGet(key)!).claim).toBeNull()
        h.fail(0)
        const claimed = h.owner.claim('consumer-two')
        h.fail(2)
        expect(() => h.owner.acknowledge('consumer-two', claimed)).toThrow('injected write failure')
        for (const key of h.deps.kvList(PREFIX)) expect(JSON.parse(h.deps.kvGet(key)!).deliveredAt).toBeNull()
    })

    it('expires only its own records and does not recreate an expired source event', () => {
        const h = harness(), event = h.event()
        h.deps.kvSet('unrelated-input-record', 'preserved')
        h.owner.publish(event)
        h.advance(48 * 60 * 60 * 1000)
        expect(h.owner.claim('consumer-one')).toEqual([])
        expect(h.owner.publish(event).status).toBe('expired')
        expect(h.deps.kvGet('unrelated-input-record')).toBe('preserved')
        expect(h.deps.kvList(PREFIX)).toEqual([])
    })

    it('does not evict unexpired events at capacity and limits each claim to eight', () => {
        const h = harness()
        for (let i = 0; i < MAX_ROWS; i++) expect(h.owner.publish(h.event('operation-' + i)).status).toBe('stored')
        expect(h.owner.publish(h.event('operation-overflow')).status).toBe('capacity')
        expect(h.deps.kvList(PREFIX)).toHaveLength(MAX_ROWS)
        expect(h.owner.claim('consumer-one')).toHaveLength(8)
    })

    it('validates plugin metadata and separates caller-assigned hook invocations', () => {
        const h = harness()
        const plugin = { ...h.event(), code: 'plugin_permission_missing', effectsMayHaveOccurred: false,
            pluginName: 'Synthetic plugin', pluginVersion: '1.0', phase: 'before_request', eventKey: 'main:attempt-1:before:plugin-1' }
        expect(h.owner.publish(plugin).status).toBe('stored')
        expect(h.owner.publish({ ...plugin, eventKey: 'ax:attempt-1:before:plugin-1' }).status).toBe('stored')
        expect(() => h.owner.publish({ ...plugin, effectsMayHaveOccurred: true })).toThrow('notification_plugin_invalid')
        expect(() => h.owner.publish({ ...plugin, pluginName: '' })).toThrow('notification_plugin_invalid')
        expect(() => h.owner.acknowledge('consumer-one', [{ id: 'invalid', token: 'token-valid' }])).toThrow()
    })
})
