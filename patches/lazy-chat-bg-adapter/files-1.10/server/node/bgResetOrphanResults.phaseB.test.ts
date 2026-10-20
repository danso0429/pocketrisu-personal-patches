import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const registerBgOrchestrator = require('./bgOrchestrator.cjs') as (app: any, deps: any) => void
const { createOrchestrationRunRegistry } = require('./bgOrchestrationRunRegistry.cjs') as any
const { operationStateKey, operationResultKey } = require('./bgOrchestrationOperationStore.cjs') as any

const charId = 'char-1'
const chatId = 'chat-1'

function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>(done => { resolve = done })
    return { promise, resolve }
}

async function waitUntil(predicate: () => boolean, message: string) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        if (predicate()) return
        await new Promise(resolve => setTimeout(resolve, 0))
    }
    throw new Error(message)
}

function routeHarness(options: {
    epoch?: () => any,
    runs?: any,
    initial?: Record<string, string>,
    runServerPreview?: (...args: any[]) => any,
    commitOwner?: Record<string, any>,
} = {}) {
    const values = new Map(Object.entries(options.initial ?? {}))
    const writes: Array<{ key: string, value: string }> = []
    const deletes: string[] = []
    const routes = new Map<string, Array<(req: any, res: any, next?: () => void) => any>>()
    const app: any = {}
    for (const method of ['get', 'post', 'delete']) {
        app[method] = (route: string, ...handlers: any[]) => routes.set(`${method.toUpperCase()} ${route}`, handlers)
    }
    const runs = options.runs ?? createOrchestrationRunRegistry({ retainMs: 60_000 })
    const markDelivered = runs.markDelivered
    runs.markDelivered = vi.fn(markDelivered)
    const inputOwner = {
        read: () => null,
        pendingProjection: () => [],
        readCancelledInputProof: () => null,
        readFailedInputProof: () => null,
        readFailedInputAcknowledgement: () => null,
        hasPendingGeneration: () => false,
        settleSynchronously: vi.fn(),
        attachWaitingDrain: vi.fn(),
    }
    const commitOwner = {
        readGenerationCommit: () => null,
        currentStorageEpoch: options.epoch ?? (() => 0),
        ...options.commitOwner,
    }
    const registrationUpdatedAt = Date.now()
    registerBgOrchestrator(app, {
        sessionAuthMiddleware: (_req: any, _res: any, next: () => void) => next?.(),
        checkActiveSession: () => true,
        orchestrationRuns: runs,
        serverChatInputOwner: inputOwner,
        serverChatCommitOwner: commitOwner,
        runServerPreview: options.runServerPreview,
        kvGet: (key: string) => values.get(key) ?? null,
        kvSet: (key: string, value: string) => { writes.push({ key, value }); values.set(key, value) },
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
    return { values, writes, deletes, routes, runs, inputOwner, commitOwner, invoke }
}

function state(operationId: string, extra: Record<string, unknown> = {}) {
    return JSON.stringify({ operationId, charId, chatId, state: 'result-ready', ...extra })
}

function result(operationId: string, extra: Record<string, unknown> = {}) {
    return JSON.stringify({
        operationId, resultId: `result-${operationId}`, charId, chatId,
        kind: 'terminal-success', final: true,
        chat: { id: chatId, fmIndex: -1, message: [{ role: 'assistant', data: 'answer' }] },
        statics: null, staticsMessagesDelta: 0, globalChatVariables: {},
        ...extra,
    })
}

function detachedBody(operationId: string, resultKeyVersion: 0 | 1, serverChatCommitVersion = 0) {
    return {
        operationId, selectedCharId: charId, selectedChatId: chatId,
        currentChat: { id: chatId, fmIndex: -1, message: [] },
        detached: true, startAckVersion: 1, resultKeyVersion, serverChatCommitVersion,
        ...(serverChatCommitVersion === 1 ? { baseChatRevision: 'base-revision' } : {}),
    }
}

function operationResultRequest(operationId: string) {
    return {
        params: { operationId },
        query: { charId, chatId, consumerId: `consumer-${operationId}` },
    }
}

describe('[B3-4] Reset-orphaned results are not delivered', () => {
    it.each([
        ['operation-keyed own epoch', 'operation-b34-own', (id: string) => ({
            [operationResultKey(id)]: result(id, { storageEpoch: 1 }),
        })],
        ['operation-keyed durable epoch after restart', 'operation-b34-durable', (id: string) => ({
            [operationResultKey(id)]: result(id),
            [operationStateKey(id)]: state(id, { storageEpoch: 1 }),
        })],
        ['operation-keyed own epoch without durable metadata', 'operation-b34-no-meta', (id: string) => ({
            [operationResultKey(id)]: result(id, { storageEpoch: 1 }),
        })],
    ])('returns the existing no-result response for %s without a claim or mutation', async (_case, operationId, seed) => {
        const initial = seed(operationId)
        const h = routeHarness({ epoch: () => 2, initial })
        const response = await h.invoke('GET', '/api/bg-orchestrate-result/:operationId', operationResultRequest(operationId))
        expect(response.status).toBe(200)
        expect(response.body).toMatchObject({ found: false, operationId })
        expect(Object.fromEntries(h.values)).toEqual(initial)
        expect(h.writes).toEqual([])
        expect(h.deletes).toEqual([])
        expect(h.runs.markDelivered).not.toHaveBeenCalled()
    })

    it('uses an evicted run/durable epoch to suppress a legacy chat-keyed result before lease writes', async () => {
        const operationId = 'operation-b34-legacy-old'
        const key = `bg-orch-result:${charId}::${chatId}`
        const initial = { [key]: result(operationId), [operationStateKey(operationId)]: state(operationId, { storageEpoch: 1 }) }
        const h = routeHarness({ epoch: () => 2, initial })
        const response = await h.invoke('GET', '/api/bg-orchestrate-result/:charId/:chatId', {
            params: { charId, chatId }, query: { delivery: 'ack-v1', consumerId: 'consumer-b34-legacy' },
        })
        expect(response).toMatchObject({ status: 200, body: { found: false } })
        expect(Object.fromEntries(h.values)).toEqual(initial)
        expect(h.writes).toEqual([])
        expect(h.deletes).toEqual([])
    })

    it('uses a retained finished run epoch to suppress a result whose own epoch is absent', async () => {
        const operationId = 'operation-b34-finished-run'
        const runs = createOrchestrationRunRegistry({ retainMs: 60_000 })
        const started = runs.start(operationId, { charId, chatId, storageEpoch: 1, resultKeyVersion: 1 })
        runs.finish(operationId, started.run, 'finished')
        const initial = { [operationResultKey(operationId)]: result(operationId) }
        const h = routeHarness({ epoch: () => 2, runs, initial })
        const response = await h.invoke('GET', '/api/bg-orchestrate-result/:operationId', operationResultRequest(operationId))
        expect(response).toMatchObject({ status: 200, body: { found: false, operationId } })
        expect(Object.fromEntries(h.values)).toEqual(initial)
        expect(h.writes).toEqual([])
    })

    it.each([0, 2])('continues to serve epoch-less operation and legacy records at current epoch %s', async epoch => {
        const operationId = `operation-b34-epochless-${epoch}`
        const legacyChatId = `chat-epochless-${epoch}`
        const operationKey = operationResultKey(operationId)
        const legacyKey = `bg-orch-result:${charId}::${legacyChatId}`
        const operationRecord = JSON.parse(result(operationId))
        const legacyRecord = { ...operationRecord, chatId: legacyChatId,
            resultId: `legacy-result-${epoch}`, operationId: `legacy-operation-${epoch}` }
        const h = routeHarness({ epoch: () => epoch, initial: {
            [operationKey]: JSON.stringify(operationRecord), [legacyKey]: JSON.stringify(legacyRecord),
        } })

        await expect(h.invoke('GET', '/api/bg-orchestrate-result/:operationId', operationResultRequest(operationId)))
            .resolves.toMatchObject({ status: 200, body: { found: true, operationId } })
        await expect(h.invoke('GET', '/api/bg-orchestrate-result/:charId/:chatId', {
            params: { charId, chatId: legacyChatId },
            query: { delivery: 'ack-v1', consumerId: `consumer-legacy-${epoch}` },
        })).resolves.toMatchObject({ status: 200, body: { found: true, operationId: `legacy-operation-${epoch}` } })
        expect(h.writes.map(entry => entry.key)).toEqual(expect.arrayContaining([operationKey, legacyKey]))
        expect(h.deletes).toEqual([])
    })

    it.each([0, 1] as const)('writes captured epoch zero on newly published result-key version %s', async resultKeyVersion => {
        const operationId = `operation-b34-publish-${resultKeyVersion}`
        const h = routeHarness({
            epoch: () => 0,
            runServerPreview: async () => ({
                chat: { id: chatId, fmIndex: -1, message: [{ role: 'assistant', data: 'answer' }] },
                statics: null, staticsMessagesDelta: 0, globalChatVariables: {}, threw: null,
            }),
        })
        await expect(h.invoke('POST', '/api/bg-orchestrate', { body: detachedBody(operationId, resultKeyVersion) }))
            .resolves.toMatchObject({ status: 200, body: { handled: true, started: true } })
        const key = resultKeyVersion === 1 ? operationResultKey(operationId) : `bg-orch-result:${charId}::${chatId}`
        await waitUntil(() => h.values.has(key), 'detached result was not published')
        expect(JSON.parse(h.values.get(key)!)).toMatchObject({ operationId, storageEpoch: 0 })
    })

    it.each([
        ['successful reset', true, true],
        ['epoch change without registry cancellation', true, false],
        ['cancellation without epoch change', false, true],
    ])('publishes nothing after an awaited server commit when interrupted by %s', async (_case, changeEpoch, cancel) => {
        let epoch = 1
        const operationId = `operation-b34-commit-${String(_case).replaceAll(' ', '-')}`
        const commit = deferred<any>()
        const commitCalled = vi.fn()
        const runs = createOrchestrationRunRegistry({ retainMs: 60_000 })
        const h = routeHarness({
            epoch: () => epoch,
            runs,
            runServerPreview: async () => ({
                chat: { id: chatId, fmIndex: -1, message: [{ role: 'assistant', data: 'answer' }] },
                statics: null, staticsMessagesDelta: 0, globalChatVariables: {}, threw: null,
            }),
            commitOwner: {
                readGenerationCommit: () => ({ status: 'missing' }),
                captureBase: async () => ({ revision: 'base-revision', submittedRevision: 'base-revision', matches: true }),
                commitGenerationResult: (...args: any[]) => { commitCalled(...args); return commit.promise },
            },
        })
        await h.invoke('POST', '/api/bg-orchestrate', { body: detachedBody(operationId, 1, 1) })
        await waitUntil(() => commitCalled.mock.calls.length === 1, 'server commit was not reached')
        if (changeEpoch) epoch = 2
        if (cancel) runs.cancelAll('storage-reset')
        h.values.delete(operationStateKey(operationId))
        h.values.delete(operationResultKey(operationId))
        const writesBeforeRelease = h.writes.length
        commit.resolve({ status: changeEpoch ? 'missing' : 'committed', reason: 'storage_epoch_changed' })
        await waitUntil(() => runs.status(operationId) !== 'running', 'detached run did not finish')

        expect(h.values.has(operationResultKey(operationId))).toBe(false)
        expect(h.values.has(operationStateKey(operationId))).toBe(false)
        expect(h.writes.slice(writesBeforeRelease)).toEqual([])
    })

    it('suppresses a provider result that ignores abort and returns after reset', async () => {
        let epoch = 1
        const operationId = 'operation-b34-ignore-abort'
        const provider = deferred<any>()
        const runs = createOrchestrationRunRegistry({ retainMs: 60_000 })
        const h = routeHarness({ epoch: () => epoch, runs, runServerPreview: () => provider.promise })
        await h.invoke('POST', '/api/bg-orchestrate', { body: detachedBody(operationId, 1) })
        await waitUntil(() => runs.status(operationId) === 'running', 'run did not start')
        runs.cancelAll('storage-reset')
        epoch = 2
        h.values.clear()
        const writesBeforeRelease = h.writes.length
        provider.resolve({
            chat: { id: chatId, fmIndex: -1, message: [{ role: 'assistant', data: 'late answer' }] },
            statics: null, staticsMessagesDelta: 0, globalChatVariables: {}, threw: null,
        })
        await waitUntil(() => runs.status(operationId) !== 'running', 'cancelled run did not finish')
        expect(h.values.size).toBe(0)
        expect(h.writes.slice(writesBeforeRelease)).toEqual([])
    })

    it('guards non-detached full-preview intermediate and final writes with one captured epoch', () => {
        // runServerPreview is module-internal for non-detached requests, so this race boundary
        // cannot be held through the route harness. Pin the required publication structure here.
        const source = readFileSync('server/node/bgOrchestrator.cjs', 'utf8')
        const previewStart = source.indexOf('async function runServerPreview')
        const previewEnd = source.indexOf('\nmodule.exports = function registerBgOrchestrator', previewStart)
        const preview = source.slice(previewStart, previewEnd)
        expect(preview).toMatch(/storageEpoch/)
        expect(preview).toMatch(/currentStorageEpoch/)
        expect(preview).toMatch(/persistOrchResult[\s\S]*storageEpoch/)

        const nonDetachedStart = source.indexOf('if (runFull) {')
        const nonDetachedEnd = source.indexOf('} else if (runLLM)', nonDetachedStart)
        const nonDetached = source.slice(nonDetachedStart, nonDetachedEnd)
        expect(nonDetached).toMatch(/storageEpoch/)
        expect(nonDetached).toMatch(/currentStorageEpoch/)
        expect(nonDetached.indexOf('currentStorageEpoch')).toBeLessThan(nonDetached.indexOf('persistOrchResult'))
    })
})
