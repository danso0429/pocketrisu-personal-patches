import Database from 'better-sqlite3'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'
const require = createRequire(import.meta.url)
const { createBgNotifications, OPERATION_PREFIX, NOTIFICATION_TTL_MS, MAX_ROWS } = require('./bgNotifications.cjs')
const { createBgOperationNotices, stateEvents, commitEvents, PREFIX } = require('./bgOperationNotices.cjs')
const cleanup: Array<() => void> = []
afterEach(() => { while (cleanup.length) cleanup.pop()!() })

function harness() {
    const db = new Database(':memory:')
    db.exec('CREATE TABLE kv(key TEXT PRIMARY KEY,value TEXT NOT NULL)')
    cleanup.push(() => db.close())
    let time = 1_000_000, failingKey = '', failingPrefix = ''
    const deps = { db, now: () => time,
        kvGet: (key: string) => (db.prepare('SELECT value FROM kv WHERE key=?').get(key) as any)?.value ?? null,
        kvSet: (key: string, value: string) => {
            if (key === failingKey || (failingPrefix && key.startsWith(failingPrefix))) throw new Error('injected-operation-notice-failure')
            db.prepare('INSERT OR REPLACE INTO kv VALUES (?,?)').run(key, value)
        },
        kvDel: (key: string) => db.prepare('DELETE FROM kv WHERE key=?').run(key),
        kvList: (prefix: string) => (db.prepare('SELECT key FROM kv WHERE substr(key,1,?)=? ORDER BY key').all(prefix.length, prefix) as any[]).map(row => row.key),
    }
    const outbox = createBgNotifications(deps)
    const makeOwner = () => createBgOperationNotices({ ...deps, publish: outbox.publish })
    return { deps, outbox, makeOwner, owner: makeOwner(),
        failKey: (key: string) => { failingKey = key }, failPrefix: (prefix: string) => { failingPrefix = prefix },
        advance: (ms: number) => { time += ms },
        event: (id = 'operation-source-one') => ({ operationId: id, eventKey: 'operation:terminal',
            code: 'operation_failed', reason: 'generation_failed', charId: 'char-1', chatId: 'chat-1',
            createdAt: time, effectsMayHaveOccurred: true }) }
}

describe('durable operation notice source', () => {
    it('derives interruption only from nonretryable or main-owned states and preserves prior notice ownership', () => {
        const h = harness(), event = h.event()
        const state = { ...event, notificationSourceVersion: 1, notificationCreatedAt: event.createdAt, state: 'queued' }
        expect(stateEvents(state)).toEqual([])
        expect(stateEvents(state, { outcome: { inputIrretryable: true } })).toMatchObject([{ code: 'operation_interrupted', reason: 'before_result' }])
        for (const stage of ['running', 'running-result-ready', 'running-result-consumed']) {
            expect(stateEvents({ ...state, state: stage })).toMatchObject([{ code: 'operation_interrupted',
                reason: stage === 'running' ? 'before_result' : 'after_main' }])
            for (const options of [{ active: true }, { outcome: { committed: true } }, { outcome: { final: true } },
                { outcome: { cancelled: true } }, { outcome: { noticeHandled: true } }]) {
                expect(stateEvents({ ...state, state: stage }, options)).toEqual([])
            }
        }
        for (const stage of ['cancelled', 'delivered', 'chat-committed']) expect(stateEvents({ ...state, state: stage })).toEqual([])
        expect(stateEvents({ ...state, state: 'running' }, { outcome: { final: true, failed: true } }))
            .toMatchObject([{ code: 'operation_failed', reason: 'generation_failed' }])
    })

    it('does not read outcomes for legacy, null or stamped states and bounds invalid-source retention by its fixed TTL', () => {
        const h = harness(), event = h.event(), unavailable = () => { throw Error('outcome read should not execute') }
        expect(h.owner.canRetireState(null, unavailable)).toBe(true)
        expect(h.owner.canRetireState({ state: 'running' }, unavailable)).toBe(true)
        const state = { ...event, state: 'result-ready', notificationSourceVersion: 1,
            notificationCreatedAt: event.createdAt, operationNotice: event }
        expect(stateEvents(state, unavailable)).toEqual([event])
        const invalid = { ...state, operationNotice: { ...event, chatId: 'different-chat' } }
        expect(h.owner.canRetireState(invalid, unavailable)).toBe(false)
        h.advance(NOTIFICATION_TTL_MS)
        expect(h.owner.canRetireState(invalid, unavailable)).toBe(true)
        expect(h.deps.kvList(OPERATION_PREFIX)).toEqual([])
    })

    it('derives fixed commit warnings and partial failure only from new immutable receipt facts', () => {
        const record = { operationId: 'operation-commit-source', notificationVersion: 3, notificationCreatedAt: 1_000_000,
            recovery: { requestedCharId: 'char-1', storedChatId: 'chat-1', notificationGenerationFailed: true },
            commitReceipt: { effects: { chat: { reason: 'concurrent-chat-edit-preserved' },
                globals: { status: 'conflict' }, stats: { status: 'failed' } } } }
        expect(commitEvents(record).map((e: any) => [e.code, e.reason])).toEqual([
            ['operation_failed', 'generation_failed'], ['chat_edit_unreflected', 'concurrent_edit'],
            ['commit_effect_conflict', 'globals'], ['commit_effect_conflict', 'stats'],
        ])
        expect(commitEvents({ ...record, notificationVersion: undefined })).toEqual([])
    })

    it('keeps future-clock intent pending and retains source authority when capacity is occupied by corrupt bytes', () => {
        const h = harness(), future = { ...h.event(), createdAt: h.event().createdAt + 1000 }
        expect(h.owner.capture(future)).toBe(false)
        expect(h.deps.kvList(PREFIX)).toHaveLength(1)
        h.advance(1000); h.owner.retry()
        expect(h.deps.kvList(OPERATION_PREFIX)).toHaveLength(1)
        const full = harness(), event = full.event()
        for (let index = 0; index < MAX_ROWS; index++) full.deps.kvSet(PREFIX + index.toString(16).padStart(64, '0'), 'corrupt')
        expect(full.owner.canRetire(event)).toBe(false)
        expect(full.deps.kvList(PREFIX)).toHaveLength(MAX_ROWS)
        full.advance(NOTIFICATION_TTL_MS)
        expect(full.owner.canRetire(event)).toBe(true)
        expect(full.deps.kvList(PREFIX)).toHaveLength(MAX_ROWS)
    })

    it('keeps primary failures intact and retries a durable intent after outbox failure and recreation', () => {
        const h = harness(), event = h.event()
        h.deps.kvSet('primary-outcome', JSON.stringify({ state: 'failed', rawText: 'retained input' }))
        h.failPrefix(OPERATION_PREFIX)
        expect(h.owner.capture(event)).toBe(false)
        expect(h.deps.kvList(PREFIX)).toHaveLength(1)
        expect(h.deps.kvList(OPERATION_PREFIX)).toHaveLength(0)
        expect(h.owner.canRetire(event)).toBe(true)
        expect(JSON.parse(h.deps.kvGet('primary-outcome')).state).toBe('failed')
        h.failPrefix(''); h.makeOwner().retry()
        expect(h.deps.kvList(OPERATION_PREFIX)).toHaveLength(1)
        const claimed = h.outbox.claim('consumer-source-one', 3)
        expect(claimed).toHaveLength(1)
        expect(h.outbox.acknowledge('consumer-source-one', claimed.map((row: any) => ({ id: row.id, token: row.token })))).toHaveLength(1)
        expect(h.makeOwner().capture(event)).toBe(true)
        expect(h.outbox.claim('consumer-source-two', 3)).toEqual([])
        expect(h.deps.kvGet('primary-outcome')).toContain('retained input')
    })

    it('refuses source retirement until retry authority is durable and rolls back a failed settlement', () => {
        const h = harness(), event = h.event()
        h.failPrefix(PREFIX)
        expect(h.owner.canRetire(event)).toBe(false)
        expect(h.deps.kvList(PREFIX)).toHaveLength(0)
        h.failPrefix(OPERATION_PREFIX)
        expect(h.owner.capture(event)).toBe(false)
        const key = h.deps.kvList(PREFIX)[0]
        h.failPrefix(''); h.failKey(key)
        expect(h.owner.capture(event)).toBe(false)
        expect(h.deps.kvList(OPERATION_PREFIX)).toHaveLength(0)
        expect(JSON.parse(h.deps.kvGet(key)).settled).toBeNull()
        h.failKey(''); h.owner.retry()
        expect(JSON.parse(h.deps.kvGet(key)).settled).toBe('published')
        expect(h.deps.kvList(OPERATION_PREFIX)).toHaveLength(1)
    })

    it('retains corrupt source bytes, isolates healthy intents and never recreates an expired source', () => {
        const h = harness(), badKey = PREFIX + 'd'.repeat(64), event = h.event()
        h.deps.kvSet(badKey, 'broken source')
        expect(h.owner.capture(event)).toBe(true)
        h.advance(NOTIFICATION_TTL_MS)
        h.owner.retry()
        expect(h.deps.kvGet(badKey)).toBe('broken source')
        expect(h.owner.capture(event)).toBe(true)
        expect(h.deps.kvList(PREFIX)).toEqual([badKey])
    })
})
