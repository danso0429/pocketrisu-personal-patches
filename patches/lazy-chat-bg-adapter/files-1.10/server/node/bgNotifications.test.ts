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
