import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const registerBgOrchestrator = require('./bgOrchestrator.cjs') as (app: any, deps: any) => void
const { createOrchestrationRunRegistry } = require('./bgOrchestrationRunRegistry.cjs') as any
const { operationStateKey, operationResultKey } = require('./bgOrchestrationOperationStore.cjs') as any

const charId = 'char-1'
const chatId = 'chat-1'

function routeHarness(options: {
    epoch?: () => any,
    runs?: any,
    committed?: (operationId: string) => any,
    input?: (operationId: string) => any,
    admit?: (...args: any[]) => any,
    initial?: Record<string, string>,
} = {}) {
    const values = new Map(Object.entries(options.initial ?? {}))
    const writes: string[] = []
    const deletes: string[] = []
    const routes = new Map<string, Array<(req: any, res: any, next?: () => void) => any>>()
    const app: any = {}
    for (const method of ['get', 'post', 'delete']) {
        app[method] = (route: string, ...handlers: any[]) => routes.set(`${method.toUpperCase()} ${route}`, handlers)
    }
    const runs = options.runs ?? createOrchestrationRunRegistry({ retainMs: 60_000 })
    const admit = vi.fn(options.admit ?? (() => ({ status: 'blocked', reason: 'unexpected-admission' })))
    const inputOwner = {
        read: options.input ?? (() => null),
        admit,
        loadExecution: vi.fn(),
        loadSettingsSnapshot: vi.fn(),
        pendingProjection: () => [],
        readCancelledInputProof: () => null,
        readFailedInputProof: () => null,
        readFailedInputAcknowledgement: () => null,
        hasPendingGeneration: () => false,
        settleSynchronously: vi.fn(),
        attachWaitingDrain: vi.fn(),
    }
    const registrationUpdatedAt = Date.now()
    registerBgOrchestrator(app, {
        sessionAuthMiddleware: (_req: any, _res: any, next: () => void) => next?.(),
        checkActiveSession: () => true,
        orchestrationRuns: runs,
        serverChatInputOwner: inputOwner,
        serverChatCommitOwner: {
            readGenerationCommit: options.committed ?? (() => null),
            currentStorageEpoch: options.epoch ?? (() => 0),
        },
        kvGet: (key: string) => values.get(key) ?? null,
        kvSet: (key: string, value: string) => { writes.push(key); values.set(key, value) },
        kvDel: (key: string) => { deletes.push(key); values.delete(key) },
        kvList: (prefix: string) => [...values.keys()].filter(key => key.startsWith(prefix)),
        kvGetUpdatedAt: () => registrationUpdatedAt,
    })
    // Registration owns a retention sweep. Route assertions observe only mutations
    // after that lifecycle boundary, with a timestamp that cannot become future-dated.
    writes.length = 0
    deletes.length = 0
    async function invoke(method: string, route: string, request: any = {}) {
        const handlers = routes.get(`${method.toUpperCase()} ${route}`)
        if (!handlers) throw new Error(`missing route: ${method} ${route}`)
        const result = { status: 200, body: null as any }
        const response = {
            status(code: number) { result.status = code; return this },
            json(body: any) { result.body = body; return this },
            set() { return this }, type() { return this }, send(body: any) { result.body = body; return this },
        }
        let index = -1
        const next = async (): Promise<void> => {
            index += 1
            if (handlers[index]) await handlers[index](request, response, next)
        }
        await next()
        return result
    }
    const status = (operationId: string, query: any = { charId, chatId }) => invoke(
        'GET', '/api/bg-orchestrate-status/:operationId', { params: { operationId }, query },
    )
    return { values, writes, deletes, runs, admit, inputOwner, invoke, status }
}

function state(operationId: string, extra: Record<string, unknown> = {}) {
    return JSON.stringify({ operationId, charId, chatId, state: 'running', ...extra })
}

function result(operationId: string, extra: Record<string, unknown> = {}) {
    return JSON.stringify({
        operationId, resultId: `result-${operationId}`, charId, chatId,
        kind: 'terminal-success', final: true, chat: { id: chatId, fmIndex: -1, message: [] },
        ...extra,
    })
}

function detachedBody(operationId: string, inputCommandVersion = 0) {
    return {
        operationId, selectedCharId: charId, selectedChatId: chatId,
        currentChat: { id: chatId, fmIndex: -1, message: [] },
        detached: true, startAckVersion: 1, resultKeyVersion: 1,
        ...(inputCommandVersion === 1 ? {
            serverChatCommitVersion: 1, inputCommandVersion: 1,
            baseChatRevision: 'base-revision',
            inputCommand: {
                inputCommandId: `input-${operationId}`, userMessageId: `user-${operationId}`,
                rawText: 'draft survives', submittedAt: 1_700_000_000_000,
            },
        } : {}),
    }
}

describe('[B3-3] Reset-orphaned operations report missing', () => {
    it('reports a retained reset-cancelled registry run as missing without mutating its tombstone', async () => {
        const runs = createOrchestrationRunRegistry({ retainMs: 60_000 })
        const started = runs.start('operation-b33-live', { charId, chatId, resultKeyVersion: 1, storageEpoch: 1 })
        runs.cancelAll('storage-reset')
        const before = { ...started.run, controller: started.run.controller }
        const h = routeHarness({ epoch: () => 2, runs })

        await expect(h.status('operation-b33-live')).resolves.toEqual({
            status: 404,
            body: { accepted: false, operationId: 'operation-b33-live', state: 'missing', storageEpoch: 2 },
        })
        expect(runs.get('operation-b33-live')).toEqual(before)
        expect(h.writes).toEqual([])
        expect(h.deletes).toEqual([])
    })

    it('reports a finished pre-reset registry tombstone as missing without evicting it', async () => {
        const operationId = 'operation-b33-finished'
        const runs = createOrchestrationRunRegistry({ retainMs: 60_000 })
        const started = runs.start(operationId, { charId, chatId, resultKeyVersion: 1, storageEpoch: 1 })
        runs.finish(operationId, started.run, 'finished')
        const retained = runs.get(operationId)
        const h = routeHarness({ epoch: () => 2, runs })
        await expect(h.status(operationId)).resolves.toEqual({
            status: 404, body: { accepted: false, operationId, state: 'missing', storageEpoch: 2 },
        })
        expect(runs.get(operationId)).toBe(retained)
        expect(h.writes).toEqual([])
        expect(h.deletes).toEqual([])
    })

    it('reports a durable-only old row as missing on repeated observational reads', async () => {
        const operationId = 'operation-b33-durable'
        const key = operationStateKey(operationId)
        const h = routeHarness({ epoch: () => 2, initial: { [key]: state(operationId, { storageEpoch: 1 }) } })
        const expected = { status: 404, body: { accepted: false, operationId, state: 'missing', storageEpoch: 2 } }

        await expect(h.status(operationId)).resolves.toEqual(expected)
        await expect(h.status(operationId)).resolves.toEqual(expected)
        expect(h.values.get(key)).toBe(state(operationId, { storageEpoch: 1 }))
        expect(h.writes).toEqual([])
        expect(h.deletes).toEqual([])
    })

    it.each([
        ['operation-keyed own epoch', 'operation-b33-result-a', (id: string) => ({
            [operationResultKey(id)]: result(id, { storageEpoch: 2 }),
        })],
        ['legacy own epoch after registry eviction', 'operation-b33-result-b', (id: string) => ({
            [`bg-orch-result:${charId}::${chatId}`]: result(id, { storageEpoch: 2 }),
        })],
        ['operation-keyed durable epoch', 'operation-b33-result-c', (id: string) => ({
            [operationResultKey(id)]: result(id),
            [operationStateKey(id)]: state(id, { storageEpoch: 2 }),
        })],
        ['legacy durable epoch after restart', 'operation-b33-result-d', (id: string) => ({
            [`bg-orch-result:${charId}::${chatId}`]: result(id),
            [operationStateKey(id)]: state(id, { storageEpoch: 2 }),
        })],
    ])('reports a parked %s result as missing and leaves it parked', async (_case, operationId, seed) => {
        const initial = seed(operationId)
        const h = routeHarness({ epoch: () => 3, initial })
        await expect(h.status(operationId)).resolves.toEqual({
            status: 404, body: { accepted: false, operationId, state: 'missing', storageEpoch: 3 },
        })
        expect(Object.fromEntries(h.values)).toEqual(initial)
        expect(h.writes).toEqual([])
        expect(h.deletes).toEqual([])
    })

    it('keeps a mismatched reset-orphaned registry run on the existing final-missing fallthrough', async () => {
        const operationId = 'operation-b33-conflict-registry'
        const runs = createOrchestrationRunRegistry({ retainMs: 60_000 })
        runs.start(operationId, { charId, chatId, storageEpoch: 1, resultKeyVersion: 1 })
        const h = routeHarness({ epoch: () => 2, runs })
        await expect(h.status(operationId, { charId, chatId: 'wrong-chat' })).resolves.toEqual({
            status: 404,
            body: { accepted: false, operationId, state: 'missing', storageEpoch: 2 },
        })
        expect(h.writes).toEqual([])
        expect(h.deletes).toEqual([])
    })

    it.each(['durable', 'parked'])(
        'keeps the %s coordinate-conflict 409 ahead of orphan inference', async branch => {
            const operationId = `operation-b33-conflict-${branch}`
            const runs = createOrchestrationRunRegistry({ retainMs: 60_000 })
            const initial: Record<string, string> = {}
            if (branch === 'durable') initial[operationStateKey(operationId)] = state(operationId, { storageEpoch: 1 })
            if (branch === 'parked') initial[operationResultKey(operationId)] = result(operationId, { storageEpoch: 1 })
            const h = routeHarness({ epoch: () => 2, runs, initial })
            await expect(h.status(operationId, { charId, chatId: 'wrong-chat' })).resolves.toMatchObject({
                status: 409, body: { accepted: false, operationId, state: 'coordinate-conflict' },
            })
            expect(h.writes).toEqual([])
            expect(h.deletes).toEqual([])
        },
    )

    it('stamps a DELETE-before-start tombstone with the current epoch and hides it after reset', async () => {
        let epoch = 4
        const operationId = 'operation-b33-delete'
        const key = operationStateKey(operationId)
        const h = routeHarness({ epoch: () => epoch })
        await expect(h.invoke('DELETE', '/api/bg-orchestrate/:operationId', {
            params: { operationId }, query: { charId, chatId },
        })).resolves.toMatchObject({ status: 200, body: { cancelled: true } })
        expect(JSON.parse(h.values.get(key)!)).toMatchObject({ state: 'cancelled', storageEpoch: 4 })
        await expect(h.status(operationId)).resolves.toMatchObject({ status: 200, body: { state: 'cancelled' } })

        epoch = 5
        await expect(h.status(operationId)).resolves.toEqual({
            status: 404, body: { accepted: false, operationId, state: 'missing', storageEpoch: 5 },
        })

        const afterResetId = 'operation-b33-delete-after-reset'
        await h.invoke('DELETE', '/api/bg-orchestrate/:operationId', {
            params: { operationId: afterResetId }, query: { charId, chatId },
        })
        expect(JSON.parse(h.values.get(operationStateKey(afterResetId))!))
            .toMatchObject({ state: 'cancelled', storageEpoch: 5 })
    })

    it('refuses a same-id server-input retry before admission and persistence', async () => {
        const operationId = 'operation-b33-input'
        const runs = createOrchestrationRunRegistry({ retainMs: 60_000 })
        runs.start(operationId, { charId, chatId, storageEpoch: 1, resultKeyVersion: 1,
            serverChatCommitVersion: 1, inputCommandVersion: 1 })
        runs.cancelAll('storage-reset')
        const h = routeHarness({ epoch: () => 2, runs, committed: () => ({ status: 'missing' }) })

        await expect(h.invoke('POST', '/api/bg-orchestrate', { body: detachedBody(operationId, 1) }))
            .resolves.toEqual({ status: 409, body: {
                handled: false, started: false, operationId, reason: 'input_command_identity_conflict',
            } })
        expect(h.admit).not.toHaveBeenCalled()
        expect(h.inputOwner.loadSettingsSnapshot).not.toHaveBeenCalled()
        expect(h.writes).toEqual([])
    })

    it('refuses a same-id legacy retry before any admission write or provider scheduling', async () => {
        const operationId = 'operation-b33-legacy'
        const runs = createOrchestrationRunRegistry({ retainMs: 60_000 })
        runs.start(operationId, { charId, chatId, storageEpoch: 1, resultKeyVersion: 1 })
        runs.cancelAll('storage-reset')
        const h = routeHarness({ epoch: () => 2, runs })

        await expect(h.invoke('POST', '/api/bg-orchestrate', { body: detachedBody(operationId) }))
            .resolves.toEqual({ status: 409, body: {
                handled: false, started: false, operationId, reason: 'operation-reset',
            } })
        expect(h.admit).not.toHaveBeenCalled()
        expect(h.writes).toEqual([])
    })

    it.each([0, 1])('keeps same-id POST coordinate conflicts ahead of orphan refusal (input=%s)', async input => {
        const operationId = `operation-b33-post-conflict-${input}`
        const runs = createOrchestrationRunRegistry({ retainMs: 60_000 })
        runs.start(operationId, { charId, chatId, storageEpoch: 1, resultKeyVersion: 1,
            serverChatCommitVersion: input, inputCommandVersion: input })
        runs.cancelAll('storage-reset')
        const h = routeHarness({ epoch: () => 2, runs, committed: () => ({ status: 'missing' }) })
        const body = { ...detachedBody(operationId, input), selectedChatId: 'wrong-chat',
            currentChat: { id: 'wrong-chat', fmIndex: -1, message: [] } }

        await expect(h.invoke('POST', '/api/bg-orchestrate', { body })).resolves.toMatchObject({
            status: 409, body: { handled: false, started: false, operationId, reason: 'operation-coordinate-conflict' },
        })
        expect(h.admit).not.toHaveBeenCalled()
        expect(h.writes).toEqual([])
    })

    it.each([
        ['absent registry epoch at current epoch zero', undefined, () => 0],
        ['absent registry epoch after reset', undefined, () => 2],
        ['non-integer registry epoch', 1.5, () => 2],
        ['unreadable current epoch', 1, () => { throw new Error('epoch unavailable') }],
        ['malformed current epoch', 1, () => Number.NaN],
    ])('does not infer orphaning for %s', async (_case, storageEpoch, epoch) => {
        const operationId = `operation-b33-unknown-${String(_case).replaceAll(' ', '-')}`
        const runs = createOrchestrationRunRegistry({ retainMs: 60_000 })
        runs.start(operationId, { charId, chatId, resultKeyVersion: 1, storageEpoch })
        const h = routeHarness({ epoch, runs })
        const response = await h.status(operationId)
        expect(response).toMatchObject({ status: 200, body: { accepted: true, operationId, state: 'running' } })
        if (_case === 'malformed current epoch' || _case === 'unreadable current epoch') {
            expect(response.body).not.toHaveProperty('storageEpoch')
        }
    })

    it('keeps committed and input-command branches ahead of an old registry tombstone', async () => {
        const operationId = 'operation-b33-precedence'
        const runs = createOrchestrationRunRegistry({ retainMs: 60_000 })
        runs.start(operationId, { charId, chatId, storageEpoch: 1, resultKeyVersion: 1 })
        runs.cancelAll('storage-reset')
        const receipt = { requestedCharId: charId, requestedChatId: chatId }
        const committed = routeHarness({ epoch: () => 2, runs,
            committed: () => ({ status: 'committed', receipt }) })
        await expect(committed.status(operationId)).resolves.toMatchObject({
            status: 200, body: { accepted: true, state: 'chat-committed', serverChatCommit: receipt },
        })

        const inputRecord = { admission: { charId, chatId, inputCommandId: 'input-precedence' },
            admissionSeq: 1, inputState: 'queued', transformState: 'pending' }
        const input = routeHarness({ epoch: () => 2, runs,
            committed: () => null, input: () => inputRecord })
        await expect(input.status(operationId)).resolves.toMatchObject({
            status: 200, body: { accepted: true, state: 'input-queued', inputCommandVersion: 1 },
        })
    })

    it.each([
        ['result-ready', 'result-ready', 'delivery-failed'],
        ['delivered', 'delivered', 'delivered'],
        ['failed', 'failed', 'failed'],
    ])('keeps current-epoch durable %s status unchanged', async (_case, storedState, visibleState) => {
        const operationId = `operation-b33-current-${storedState}`
        const h = routeHarness({ epoch: () => 2, initial: {
            [operationStateKey(operationId)]: state(operationId, { state: storedState, storageEpoch: 2 }),
        } })
        await expect(h.status(operationId)).resolves.toMatchObject({
            status: 200, body: { accepted: true, operationId, state: visibleState, storageEpoch: 2 },
        })
    })

    it.each(['accepted', 'running', 'cancelled'])('keeps current-epoch registry %s status unchanged', async visibleState => {
        const operationId = `operation-b33-current-${visibleState}`
        const runs = createOrchestrationRunRegistry({ retainMs: 60_000 })
        const started = runs.start(operationId, { charId, chatId, resultKeyVersion: 1, storageEpoch: 2 })
        if (visibleState === 'accepted') {
            started.run.state = 'accepted'
            started.run.finishedAt = Date.now()
        } else if (visibleState === 'cancelled') {
            started.run.cancelled = true
        }
        const h = routeHarness({ epoch: () => 2, runs })
        await expect(h.status(operationId)).resolves.toMatchObject({
            status: 200, body: { accepted: true, operationId, state: visibleState, storageEpoch: 2 },
        })
    })
})
