import { createRequire } from 'node:module'
import { describe, expect, test } from 'vitest'

const require = createRequire(import.meta.url)
const registerBgOrchestrator = require('./bgOrchestrator.cjs') as (
    app: Record<string, unknown>, deps: Record<string, unknown>,
) => void
const retention = require('./bgOrchestrationResultRetention.cjs') as {
    ORCH_RESULT_RETENTION_TTL_MS: number
    ORCH_RESULT_RETENTION_MAX_ROWS: number
    ORCH_RESULT_RETENTION_MAX_BYTES: number
    hasLiveDeliveryClaim: (record: Record<string, unknown>, now: number, ttlMs: number) => boolean
    planOrchestrationResultRetention: (
        entries: Array<{ key: string, value: string | Buffer, updatedAt: number | null }>,
        options?: Record<string, unknown>,
    ) => {
        actions: Array<{ key: string, reason: string, operationId: string | null }>
        normalizations: Array<{ key: string, value: string | Buffer, updatedAt: number }>
        stats: Record<string, number>
    }
    sweepOrchestrationResultRetention: (options: Record<string, unknown>) => {
        skipped: boolean
        deleted: Array<{ key: string }>
        retained: Array<{ key: string, reason: string }>
        normalized: string[]
        deletedStates: string[]
    }
}

const {
    ORCH_RESULT_RETENTION_TTL_MS,
    ORCH_RESULT_RETENTION_MAX_ROWS,
    ORCH_RESULT_RETENTION_MAX_BYTES,
    hasLiveDeliveryClaim,
    planOrchestrationResultRetention,
    sweepOrchestrationResultRetention,
} = retention

function result(operationId: string, options: Record<string, unknown> = {}) {
    return JSON.stringify({
        operationId,
        charId: 'char-1',
        chatId: 'chat-1',
        resultId: `result-${operationId}`,
        kind: 'terminal-success',
        final: true,
        chat: { message: [{ role: 'char', data: 'answer' }] },
        ...options,
    })
}

function routeHarness(initial: Record<string, string>) {
    const values = new Map(Object.entries(initial))
    const updated = new Map([...values.keys()].map((key) => [key, Date.now()]))
    const routes = new Map<string, (req: any, res: any) => unknown>()
    const app: Record<string, unknown> = {}
    for (const method of ['get', 'post', 'delete']) {
        app[method] = (path: string, ...handlers: Array<(req: any, res: any) => unknown>) => {
            routes.set(`${method.toUpperCase()} ${path}`, handlers[handlers.length - 1])
        }
    }
    const kvSet = (key: string, value: string) => {
        values.set(key, value)
        updated.set(key, Date.now())
    }
    registerBgOrchestrator(app, {
        sessionAuthMiddleware: () => {},
        kvSet,
        kvGet: (key: string) => values.get(key) ?? null,
        kvDel: (key: string) => { values.delete(key); updated.delete(key) },
        kvList: (prefix: string) => [...values.keys()].filter((key) => key.startsWith(prefix)),
        kvGetUpdatedAt: (key: string) => updated.get(key) ?? null,
    })
    const invoke = (method: string, path: string, req: Record<string, unknown>) => {
        const handler = routes.get(`${method} ${path}`)
        if (!handler) throw new Error(`missing route ${method} ${path}`)
        const response = { status: 200, body: null as any }
        const res = {
            status(code: number) { response.status = code; return this },
            json(body: unknown) { response.body = body; return this },
        }
        handler(req, res)
        return response
    }
    return { values, invoke }
}

describe('BG orchestration result retention', () => {
    test('publishes the bounded overnight policy constants', () => {
        expect(ORCH_RESULT_RETENTION_TTL_MS).toBe(48 * 60 * 60 * 1000)
        expect(ORCH_RESULT_RETENTION_MAX_ROWS).toBe(128)
        expect(ORCH_RESULT_RETENTION_MAX_BYTES).toBe(256 * 1024 * 1024)
    })

    test('retains the exact 48-hour boundary and expires an older unclaimed result', () => {
        const now = ORCH_RESULT_RETENTION_TTL_MS + 1
        const plan = planOrchestrationResultRetention([
            { key: 'at-boundary', value: result('operation-boundary'), updatedAt: 1 },
            { key: 'expired', value: result('operation-expired'), updatedAt: 0 },
        ], { now })

        expect(plan.actions).toEqual([{
            key: 'expired',
            reason: 'expired',
            operationId: 'operation-expired',
            record: expect.any(Object),
            bytes: expect.any(Number),
            updatedAt: 0,
        }])
        expect(plan.stats.keptRows).toBe(1)
    })

    test('never evicts an active operation or a live delivery claim', () => {
        const now = ORCH_RESULT_RETENTION_TTL_MS * 2
        const plan = planOrchestrationResultRetention([
            { key: 'active', value: result('operation-active'), updatedAt: 0 },
            {
                key: 'claimed',
                value: result('operation-claimed', {
                    deliveryClaim: { consumerId: 'consumer-1', claimedAt: now - 1 },
                }),
                updatedAt: 0,
            },
        ], {
            now,
            maxRows: 1,
            maxBytes: 1,
            claimTtlMs: 2 * 60 * 1000,
            isOperationActive: (operationId: string) => operationId === 'operation-active',
        })

        expect(plan.actions).toEqual([])
        expect(plan.stats.protectedRows).toBe(2)
        expect(plan.stats.overRows).toBe(1)
        expect(plan.stats.overBytes).toBeGreaterThan(0)
    })

    test('uses exact claim TTL boundaries and one bounded future-skew window', () => {
        const claimTtlMs = 2 * 60 * 1000
        const claimedAt = 10
        const record = { deliveryClaim: { consumerId: 'consumer-1', claimedAt } }
        expect(hasLiveDeliveryClaim(record, claimedAt + claimTtlMs - 1, claimTtlMs)).toBe(true)
        expect(hasLiveDeliveryClaim(record, claimedAt + claimTtlMs, claimTtlMs)).toBe(false)
        expect(hasLiveDeliveryClaim(record, claimedAt + claimTtlMs + 1, claimTtlMs)).toBe(false)
        expect(hasLiveDeliveryClaim(record, claimedAt - claimTtlMs, claimTtlMs)).toBe(true)
        expect(hasLiveDeliveryClaim(record, claimedAt - claimTtlMs - 1, claimTtlMs)).toBe(false)
    })

    test('deduplicates repeated physical keys before row and byte accounting', () => {
        const value = result('operation-duplicate')
        const plan = planOrchestrationResultRetention([
            { key: 'bg-orch-result-op:operation-duplicate', value, updatedAt: 1 },
            { key: 'bg-orch-result-op:operation-duplicate', value, updatedAt: 1 },
        ], {
            now: 10,
            ttlMs: 100,
            maxRows: 1,
            maxBytes: Buffer.byteLength(value),
        })

        expect(plan.actions).toEqual([])
        expect(plan.stats.inputRows).toBe(1)
        expect(plan.stats.inputBytes).toBe(Buffer.byteLength(value))
        expect(plan.stats.keptRows).toBe(1)
    })

    test('derives active identity from a malformed operation-keyed row', () => {
        const plan = planOrchestrationResultRetention([{
            key: 'bg-orch-result-op:operation-active', value: '{', updatedAt: 0,
        }], {
            now: ORCH_RESULT_RETENTION_TTL_MS + 1,
            maxRows: 1,
            maxBytes: 1,
            isOperationActive: (operationId: string) => operationId === 'operation-active',
        })
        expect(plan.actions).toEqual([])
        expect(plan.stats.protectedRows).toBe(1)
    })

    test('bounds future clock skew instead of protecting a corrupt claim forever', () => {
        const claimTtlMs = 2 * 60 * 1000
        expect(hasLiveDeliveryClaim({
            deliveryClaim: { consumerId: 'consumer-1', claimedAt: claimTtlMs },
        }, 0, claimTtlMs)).toBe(true)
        expect(hasLiveDeliveryClaim({
            deliveryClaim: { consumerId: 'consumer-1', claimedAt: claimTtlMs + 1 },
        }, 0, claimTtlMs)).toBe(false)

        const plan = planOrchestrationResultRetention([{
            key: 'far-future',
            value: result('operation-future', {
                deliveryClaim: { consumerId: 'consumer-1', claimedAt: claimTtlMs + 1 },
            }),
            updatedAt: 0,
        }], {
            now: ORCH_RESULT_RETENTION_TTL_MS + 1,
            claimTtlMs,
        })
        expect(plan.actions.map((action) => action.key)).toEqual(['far-future'])
    })

    test('gives a refreshed rolling char-chat row one bounded claim window', () => {
        const claimTtlMs = 2 * 60 * 1000
        const now = ORCH_RESULT_RETENTION_TTL_MS + 1
        const key = 'bg-orch-result:char-1::chat-1'
        const value = result('operation-legacy')
        const live = planOrchestrationResultRetention([{
            key, value, updatedAt: now - claimTtlMs + 1,
        }], { now, claimTtlMs, maxRows: 1, maxBytes: 1 })
        expect(live.actions).toEqual([])
        expect(live.stats.protectedRows).toBe(1)

        const stale = planOrchestrationResultRetention([{
            key, value, updatedAt: now - claimTtlMs,
        }], { now, claimTtlMs, maxRows: 1, maxBytes: 1 })
        expect(stale.actions.map((action) => action.key)).toEqual([key])
    })

    test('evicts invalid and orphaned intermediate rows before oldest terminal rows', () => {
        const rows = [
            { key: 'terminal-old', value: result('operation-old'), updatedAt: 1 },
            { key: 'invalid', value: '{', updatedAt: 2 },
            {
                key: 'intermediate',
                value: result('operation-mid', { kind: 'intermediate', final: false }),
                updatedAt: 3,
            },
            { key: 'terminal-new', value: result('operation-new'), updatedAt: 4 },
        ]

        const plan = planOrchestrationResultRetention(rows, {
            now: 10,
            ttlMs: 100,
            maxRows: 2,
            maxBytes: 1024 * 1024,
        })
        expect(plan.actions.map((action) => action.key)).toEqual(['invalid', 'intermediate'])

        const terminalPressure = planOrchestrationResultRetention(rows, {
            now: 10,
            ttlMs: 100,
            maxRows: 1,
            maxBytes: 1024 * 1024,
        })
        expect(terminalPressure.actions.map((action) => action.key)).toEqual([
            'invalid', 'intermediate', 'terminal-old',
        ])
    })

    test('treats parsed unknown rolling schemas like paid terminal rows under pressure', () => {
        const unknown = JSON.stringify({
            operationId: 'operation-unknown', charId: 'char-1', chatId: 'chat-1', future: true,
        })
        const intermediate = result('operation-mid', { kind: 'intermediate', final: false })
        const plan = planOrchestrationResultRetention([
            { key: 'unknown', value: unknown, updatedAt: 1 },
            { key: 'intermediate', value: intermediate, updatedAt: 2 },
        ], { now: 10, ttlMs: 100, maxRows: 1, maxBytes: 1024 * 1024 })

        expect(plan.actions.map((action) => action.key)).toEqual(['intermediate'])
    })

    test('uses serialized payload bytes and oldest-first pressure to reach the byte budget', () => {
        const first = result('operation-first', { padding: 'x'.repeat(100) })
        const second = Buffer.from(result('operation-second', { padding: 'y'.repeat(100) }))
        const plan = planOrchestrationResultRetention([
            { key: 'first', value: first, updatedAt: 1 },
            { key: 'second', value: second, updatedAt: 2 },
        ], {
            now: 10,
            ttlMs: 100,
            maxRows: 10,
            maxBytes: second.byteLength,
        })

        expect(plan.actions.map((action) => action.key)).toEqual(['first'])
        expect(plan.stats.keptBytes).toBe(second.byteLength)
        expect(plan.stats.overBytes).toBe(0)
    })

    test('keeps 128 rows and evicts only the oldest row at 129', () => {
        const rows = Array.from({ length: ORCH_RESULT_RETENTION_MAX_ROWS + 1 }, (_, index) => ({
            key: `bg-orch-result-op:operation-row-${String(index).padStart(3, '0')}`,
            value: result(`operation-row-${String(index).padStart(3, '0')}`),
            updatedAt: index + 1,
        }))
        const atCap = planOrchestrationResultRetention(rows.slice(1), {
            now: 1000, ttlMs: 10_000, maxBytes: ORCH_RESULT_RETENTION_MAX_BYTES,
        })
        expect(atCap.actions).toEqual([])

        const overCap = planOrchestrationResultRetention(rows, {
            now: 1000, ttlMs: 10_000, maxBytes: ORCH_RESULT_RETENTION_MAX_BYTES,
        })
        expect(overCap.actions.map((action) => action.key)).toEqual([rows[0].key])
        expect(overCap.stats.keptRows).toBe(ORCH_RESULT_RETENTION_MAX_ROWS)
    })

    test('retains an exact byte cap and evicts at one byte over', () => {
        const value = result('operation-byte-boundary', { padding: 'z'.repeat(50) })
        const bytes = Buffer.byteLength(value)
        const row = [{ key: 'bg-orch-result-op:operation-byte-boundary', value, updatedAt: 1 }]
        expect(planOrchestrationResultRetention(row, {
            now: 10, ttlMs: 100, maxRows: 10, maxBytes: bytes,
        }).actions).toEqual([])
        expect(planOrchestrationResultRetention(row, {
            now: 10, ttlMs: 100, maxRows: 10, maxBytes: bytes - 1,
        }).actions.map((action) => action.key)).toEqual([row[0].key])
    })

    test('fails closed when the active-run owner cannot answer', () => {
        const plan = planOrchestrationResultRetention([
            { key: 'uncertain', value: result('operation-uncertain'), updatedAt: 0 },
        ], {
            now: ORCH_RESULT_RETENTION_TTL_MS + 1,
            maxRows: 1,
            maxBytes: 1,
            isOperationActive: () => { throw new Error('registry unavailable') },
        })

        expect(plan.actions).toEqual([])
        expect(plan.stats.protectedRows).toBe(1)
    })

    test('normalizes future KV timestamps once instead of retaining them indefinitely', () => {
        const plan = planOrchestrationResultRetention([{
            key: 'future-time', value: result('operation-clock'), updatedAt: 1000,
        }], { now: 10, ttlMs: 100, maxRows: 10, maxBytes: 1024 * 1024 })
        expect(plan.actions).toEqual([])
        expect(plan.normalizations).toMatchObject([{ key: 'future-time', updatedAt: 1000 }])
    })

    test('writes an existing-owner tombstone before deletion and retries delete failure safely', () => {
        const values = new Map<string, string>([[
            'bg-orch-result-op:operation-delete', result('operation-delete'),
        ]])
        const updated = new Map<string, number>([['bg-orch-result-op:operation-delete', 0]])
        const events: string[] = []
        let failDelete = true
        const options = {
            now: ORCH_RESULT_RETENTION_TTL_MS + 1,
            resultPrefixes: ['bg-orch-result:', 'bg-orch-result-op:'],
            statePrefix: 'bg-orch-state-op:',
            kvList: (prefix: string) => [...values.keys()].filter((key) => key.startsWith(prefix)),
            kvGet: (key: string) => values.get(key) ?? null,
            kvGetUpdatedAt: (key: string) => updated.get(key) ?? null,
            kvSet: (key: string, value: string) => { values.set(key, value); updated.set(key, ORCH_RESULT_RETENTION_TTL_MS + 1) },
            kvDel: (key: string) => {
                events.push(`delete:${key}`)
                if (failDelete && key.startsWith('bg-orch-result')) throw new Error('disk busy')
                values.delete(key)
            },
            readOperationState: () => ({ charId: 'durable-char', chatId: 'durable-chat' }),
            writeOperationState: (_kvSet: unknown, operationId: string, meta: any, state: string) => {
                events.push(`state:${operationId}:${meta.charId}:${state}`)
                return { written: true }
            },
            isOperationActive: () => false,
        }

        const first = sweepOrchestrationResultRetention(options)
        expect(first.deleted).toEqual([])
        expect(first.retained).toMatchObject([{
            key: 'bg-orch-result-op:operation-delete', reason: 'payload-delete-failed',
        }])
        expect(events).toEqual([
            'state:operation-delete:durable-char:result-expired',
            'delete:bg-orch-result-op:operation-delete',
        ])
        expect(values.has('bg-orch-result-op:operation-delete')).toBe(true)

        failDelete = false
        events.length = 0
        const second = sweepOrchestrationResultRetention(options)
        expect(second.deleted.map((action) => action.key)).toEqual([
            'bg-orch-result-op:operation-delete',
        ])
        expect(events[0]).toBe('state:operation-delete:durable-char:result-expired')
        expect(values.has('bg-orch-result-op:operation-delete')).toBe(false)
    })

    test('keeps a paid payload when its durable tombstone cannot be written', () => {
        const key = 'bg-orch-result-op:operation-keep'
        const values = new Map([[key, result('operation-keep')]])
        const outcome = sweepOrchestrationResultRetention({
            now: ORCH_RESULT_RETENTION_TTL_MS + 1,
            resultPrefixes: ['bg-orch-result:', 'bg-orch-result-op:'],
            statePrefix: 'bg-orch-state-op:',
            kvList: (prefix: string) => [...values.keys()].filter((value) => value.startsWith(prefix)),
            kvGet: (value: string) => values.get(value) ?? null,
            kvGetUpdatedAt: () => 0,
            kvSet: () => {},
            kvDel: (value: string) => values.delete(value),
            readOperationState: () => ({ charId: 'char-1', chatId: 'chat-1' }),
            writeOperationState: () => ({ written: false }),
            isOperationActive: () => false,
        })
        expect(outcome.deleted).toEqual([])
        expect(outcome.retained).toMatchObject([{ key, reason: 'tombstone-write-failed' }])
        expect(values.has(key)).toBe(true)
    })

    test('never replaces a delivered ACK tombstone when payload cleanup fails', () => {
        const key = 'bg-orch-result-op:operation-delivered'
        const values = new Map([[key, result('operation-delivered')]])
        let stateWrites = 0
        const outcome = sweepOrchestrationResultRetention({
            now: ORCH_RESULT_RETENTION_TTL_MS + 1,
            resultPrefixes: ['bg-orch-result-op:'], statePrefix: 'bg-orch-state-op:',
            kvList: (prefix: string) => [...values.keys()].filter((value) => value.startsWith(prefix)),
            kvGet: (value: string) => values.get(value) ?? null,
            kvGetUpdatedAt: () => 0,
            kvSet: () => {},
            kvDel: () => { throw new Error('disk busy') },
            readOperationState: () => ({ state: 'delivered', charId: 'char-1', chatId: 'chat-1' }),
            writeOperationState: () => { stateWrites += 1; return { written: true } },
            isOperationActive: () => false,
        })
        expect(stateWrites).toBe(0)
        expect(outcome.retained).toMatchObject([{ key, reason: 'payload-delete-failed' }])
        expect(values.has(key)).toBe(true)
    })

    test('keeps old operation state while a live claim protects its newer payload', () => {
        const now = ORCH_RESULT_RETENTION_TTL_MS + 1
        const operationId = 'operation-claimed-state'
        const resultKey = `bg-orch-result-op:${operationId}`
        const stateKey = `bg-orch-state-op:${operationId}`
        const values = new Map([
            [resultKey, result(operationId, {
                deliveryClaim: { consumerId: 'consumer-1', claimedAt: now - 1 },
            })],
            [stateKey, JSON.stringify({
                operationId, charId: 'char-1', chatId: 'chat-1', state: 'result-ready',
            })],
        ])
        const updated = new Map([[resultKey, now - 1], [stateKey, 0]])
        const outcome = sweepOrchestrationResultRetention({
            now,
            resultPrefixes: ['bg-orch-result-op:'], statePrefix: 'bg-orch-state-op:',
            claimTtlMs: 2 * 60 * 1000,
            kvList: (prefix: string) => [...values.keys()].filter((value) => value.startsWith(prefix)),
            kvGet: (value: string) => values.get(value) ?? null,
            kvGetUpdatedAt: (value: string) => updated.get(value) ?? null,
            kvSet: () => {},
            kvDel: (value: string) => { values.delete(value) },
            readOperationState: () => ({ state: 'result-ready', charId: 'char-1', chatId: 'chat-1' }),
            writeOperationState: () => ({ written: true }),
            isOperationActive: () => false,
        })
        expect(outcome.deleted).toEqual([])
        expect(outcome.deletedStates).toEqual([])
        expect(values.has(resultKey)).toBe(true)
        expect(values.has(stateKey)).toBe(true)
    })

    test('deletes expired operation state after its exact result payload is absent', () => {
        const operationId = 'operation-state-only'
        const stateKey = `bg-orch-state-op:${operationId}`
        const values = new Map([[stateKey, JSON.stringify({
            operationId, charId: 'char-1', chatId: 'chat-1', state: 'result-expired',
        })]])
        const outcome = sweepOrchestrationResultRetention({
            now: ORCH_RESULT_RETENTION_TTL_MS + 1,
            resultPrefixes: ['bg-orch-result-op:'], statePrefix: 'bg-orch-state-op:',
            kvList: (prefix: string) => [...values.keys()].filter((value) => value.startsWith(prefix)),
            kvGet: (value: string) => values.get(value) ?? null,
            kvGetUpdatedAt: () => 0,
            kvSet: () => {},
            kvDel: (value: string) => { values.delete(value) },
            readOperationState: () => null,
            writeOperationState: () => ({ written: true }),
            isOperationActive: () => false,
        })
        expect(outcome.deletedStates).toEqual([stateKey])
        expect(values.has(stateKey)).toBe(false)
    })

    test('operation route exposes retention tombstones as terminal owner state', () => {
        const operationId = 'operation-expired-route'
        const { invoke } = routeHarness({
            [`bg-orch-state-op:${operationId}`]: JSON.stringify({
                operationId, charId: 'char-1', chatId: 'chat-1', state: 'result-expired',
            }),
        })
        const response = invoke('GET', '/api/bg-orchestrate-result/:operationId', {
            params: { operationId },
            query: { charId: 'char-1', chatId: 'chat-1', consumerId: 'consumer-route-1' },
        })
        expect(response).toMatchObject({
            status: 200,
            body: { found: false, operationId, operationState: 'result-expired' },
        })
    })

    test('rolling explicit ACK claims, heartbeats, and repeated deletion stay owner-safe', () => {
        const operationId = 'operation-legacy-route'
        const key = 'bg-orch-result:char-1::chat-1'
        const { values, invoke } = routeHarness({ [key]: result(operationId) })
        const path = '/api/bg-orchestrate-result/:charId/:chatId'
        const first = invoke('GET', path, {
            params: { charId: 'char-1', chatId: 'chat-1' },
            query: { delivery: 'ack-v1', consumerId: 'consumer-route-1' },
        })
        expect(first).toMatchObject({ status: 200, body: { found: true, operationId } })
        expect(JSON.parse(values.get(key) || '{}').deliveryClaim.consumerId).toBe('consumer-route-1')

        const conflict = invoke('GET', path, {
            params: { charId: 'char-1', chatId: 'chat-1' },
            query: { delivery: 'ack-v1', consumerId: 'consumer-route-2' },
        })
        expect(conflict).toMatchObject({ status: 409, body: { found: false, error: 'result-claimed' } })

        const heartbeat = invoke('GET', path, {
            params: { charId: 'char-1', chatId: 'chat-1' },
            query: { delivery: 'ack-v1', heartbeat: '1', consumerId: 'consumer-route-1' },
        })
        expect(heartbeat).toMatchObject({ status: 200, body: { found: true, resultKeyVersion: 0 } })

        const resultId = JSON.parse(values.get(key) || '{}').resultId
        const ackPath = '/api/bg-orchestrate-result/:charId/:chatId/:resultId'
        const ack = invoke('DELETE', ackPath, {
            params: { charId: 'char-1', chatId: 'chat-1', resultId },
            query: { consumerId: 'consumer-route-1' },
        })
        expect(ack).toMatchObject({ status: 200, body: { acked: true, state: 'deleted' } })
        expect(values.has(key)).toBe(false)

        const repeated = invoke('DELETE', ackPath, {
            params: { charId: 'char-1', chatId: 'chat-1', resultId },
            query: { consumerId: 'consumer-route-1' },
        })
        expect(repeated).toMatchObject({ status: 200, body: { acked: true, state: 'absent' } })
    })
})
