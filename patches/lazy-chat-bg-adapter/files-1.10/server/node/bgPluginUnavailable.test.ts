import { createHash } from 'node:crypto'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import noticePackage from './bgNotifications.cjs'
import skippedPackage from './bgPluginUnavailable.cjs'
import metadataPackage from './bgPluginMetadata.cjs'
import { parseBgNotifications, notificationMessage } from '../../src/ts/bgNotifications'
const cleanup: Array<() => void> = []
afterEach(() => { while (cleanup.length) cleanup.pop()!() })
const plugin = { name: 'synthetic-plugin', version: '3.0', enabled: true, script: '//@version 1.2.3\nvoid 0;' }
const operation = { operationId: 'operation-one', charId: 'character-one', chatId: 'chat-one' }
function harness() {
    const db = new Database(':memory:'); db.exec('CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
    cleanup.push(() => db.close())
    let time = 1000000
    const deps = { db, now: () => time,
        kvGet: (key: string) => (db.prepare('SELECT value FROM kv WHERE key=?').get(key) as any)?.value ?? null,
        kvSet: (key: string, value: string) => db.prepare('INSERT OR REPLACE INTO kv VALUES (?,?)').run(key, value),
        kvDel: (key: string) => db.prepare('DELETE FROM kv WHERE key=?').run(key),
        kvList: (prefix: string) => (db.prepare('SELECT key FROM kv WHERE substr(key,1,?)=?').all(prefix.length, prefix) as any[]).map(row => row.key),
    }
    const owner = noticePackage.createBgNotifications(deps)
    const publish = vi.fn((event: unknown, identity: string) => owner.publishPluginFailure(event, identity))
    const run = (overrides: Record<string, unknown> = {}) => skippedPackage.publishSkippedServerPlugins({
        mode: 'full', operation, database: { plugins: [plugin] }, dependencies: { enabled: false, publishNotification: publish },
        control: { resultKeyVersion: 1, serverChatCommitVersion: 1 }, now: () => time, ...overrides,
    })
    return { db, deps, owner, run, publish, advance: (ms: number) => { time += ms } }
}
describe('server plugin omission with durable warning', () => {
    it('keeps existing failure identity and display-version semantics, excluding settings', () => {
        const legacy = createHash('sha256').update(JSON.stringify([plugin.name, plugin.version,
            createHash('sha256').update(plugin.script).digest('hex')])).digest('hex')
        expect(metadataPackage.identityOf(plugin)).toBe(legacy)
        expect(metadataPackage.identityOf({ ...plugin, realArg: { apiKey: 'synthetic-only' } })).toBe(legacy)
        expect(metadataPackage.pluginMetadata(plugin)).toEqual({ pluginName: plugin.name, pluginVersion: '1.2.3' })
    })
    it('stores a v1-compatible OFF reason without script execution or success promises', async () => {
        const h = harness(); await h.run()
        const rows = h.owner.claim('legacy-consumer', 1)
        expect(rows).toHaveLength(1)
        expect(rows[0].event).toMatchObject({ code: 'plugin_api_unsupported', api: 'server_plugin_host_disabled',
            phase: 'load', effectsMayHaveOccurred: false, pluginName: plugin.name, pluginVersion: '1.2.3' })
        expect(parseBgNotifications({ notifications: rows })).toHaveLength(1)
        expect(notificationMessage(rows[0])).toBe('synthetic-plugin (1.2.3): 호스트가 꺼져 있어 서버 플러그인 실행을 생략했어요.')
        expect(rows[0].event).not.toHaveProperty('script')
    })
    it('deduplicates across operations, ACK, recreating the owner and same-operation rechecks', async () => {
        const h = harness(); await h.run(); h.owner.acknowledge('consumer-one', h.owner.claim('consumer-one', 1))
        for (let index = 0; index < 20; index++) await h.run({ operation: { ...operation, operationId: `operation-next-${index}` } })
        const restarted = noticePackage.createBgNotifications(h.deps)
        await h.run({ dependencies: { enabled: false, publishNotification: (event: unknown, identity: string) => restarted.publishPluginFailure(event, identity) } })
        expect(h.deps.kvList(noticePackage.PREFIX)).toHaveLength(1)
        expect(h.deps.kvList('internal/bg-plugin-failure-receipts/v1/')).toHaveLength(1)
        h.advance(48 * 60 * 60 * 1000 + 1); await h.run({ operation: { ...operation, operationId: 'operation-after-expiry' } })
        expect(h.owner.claim('consumer-next', 1)).toHaveLength(1)
    })
    it.each(['bindings', 'ownership'])('records the actual unavailable reason: %s', async reason => {
        const h = harness(); await h.run({ dependencies: { enabled: true, publishNotification: h.publish },
            control: reason === 'ownership' ? {} : { resultKeyVersion: 1, serverChatCommitVersion: 1 } })
        expect(h.owner.claim('consumer-one', 1)[0].event.api).toBe('server_plugin_host_' + reason)
    })
    it('does not require negotiated commit ownership for a legacy warning', () => {
        expect(skippedPackage.canOmitServerPlugins('full', operation, { enabled: false, publishNotification() {} })).toBe(true)
        expect(skippedPackage.canOmitServerPlugins('full', { ...operation, operationId: undefined }, { publishNotification() {} })).toBe(false)
        expect(skippedPackage.canOmitServerPlugins('full', operation, {})).toBe(false)
    })
    it('does not invent full-pipeline omissions for non-full or disabled entries', async () => {
        const h = harness(); await h.run({ mode: 'llm' }); await h.run({ database: { plugins: [null, { ...plugin, enabled: false }] } })
        expect(h.publish).not.toHaveBeenCalled()
    })
    it.each(['capacity', 'throw', 'invalid'])('does not silently proceed when warning storage fails: %s', async fault => {
        const h = harness(); const publish = vi.fn(() => { if (fault === 'throw') throw Error('synthetic private failure'); return { status: fault } })
        await expect(h.run({ dependencies: { enabled: false, publishNotification: publish } })).rejects.toMatchObject({ code: 'plugin_notification_unavailable' })
    })
    it('warns for newly enabled entries at the latest assembly without duplicating the initial entry', async () => {
        const h = harness(); await h.run()
        await h.run({ database: { plugins: [plugin, { ...plugin, name: 'second-plugin' }] } })
        expect(h.owner.claim('consumer-one', 1).map((row: any) => row.event.pluginName).sort()).toEqual(['second-plugin', 'synthetic-plugin'])
    })
})
