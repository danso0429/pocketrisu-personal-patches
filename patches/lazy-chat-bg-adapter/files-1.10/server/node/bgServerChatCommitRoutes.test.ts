import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const registerBgOrchestrator = require('./bgOrchestrator.cjs') as (
    app: Record<string, unknown>,
    dependencies: Record<string, unknown>,
) => void
const { createChatWriteJournal } = require('./chatWriteJournal.cjs') as any
const { createServerChatCommitOwner } = require('./serverChatCommitOwner.cjs') as any
const { decodeRisuSave, encodeRisuSaveLegacy } = require('./utils.cjs') as any
const { operationStateKey, writeOperationState } = require('./bgOrchestrationOperationStore.cjs') as {
    operationStateKey: (operationId: string) => string
    writeOperationState: (
        kvSet: (key: string, value: string) => void,
        operationId: string,
        metadata: Record<string, unknown>,
        state: string,
    ) => { written: boolean }
}

function routeHarness() {
    const operationId = 'operation-c2-route-1'
    const receipt = {
        contractVersion: 'bg_server_chat_commit.v1',
        operationId,
        requestedCharId: 'char-1',
        requestedChatId: 'chat-1',
        storedChatId: 'chat-1',
        storedRevision: 'revision-1',
        chatCommitted: true,
    }
    const values = new Map<string, string>([[
        operationStateKey(operationId),
        JSON.stringify({
            operationId,
            charId: 'char-1',
            chatId: 'chat-1',
            state: 'delivered',
        }),
    ]])
    const routes = new Map<string, (request: any, response: any) => unknown>()
    const app: Record<string, unknown> = {}
    for (const method of ['get', 'post', 'delete']) {
        app[method] = (route: string, ...handlers: Array<(request: any, response: any) => unknown>) => {
            routes.set(`${method.toUpperCase()} ${route}`, handlers[handlers.length - 1])
        }
    }
    let cancelCalls = 0
    registerBgOrchestrator(app, {
        sessionAuthMiddleware: () => {},
        kvGet: (key: string) => values.get(key) ?? null,
        kvSet: (key: string, value: string) => values.set(key, value),
        kvDel: (key: string) => values.delete(key),
        kvList: (prefix: string) => [...values.keys()].filter(key => key.startsWith(prefix)),
        kvGetUpdatedAt: () => Date.now(),
        orchestrationRuns: {
            get: () => null,
            status: () => null,
            cancel: () => { cancelCalls += 1; return { cancelled: false, run: null } },
            markDelivered: () => {},
            isActive: () => false,
        },
        serverChatCommitOwner: {
            captureBase: async () => ({
                revision: 'canonical-server-revision',
                submittedRevision: 'stale-submission-revision',
                matches: false,
            }),
            readGenerationCommit: (candidate: string) => candidate === operationId
                ? { status: 'committed', receipt }
                : { status: 'missing', receipt: null },
        },
    })
    const invoke = (method: string, route: string, request: Record<string, unknown>) => {
        const handler = routes.get(`${method.toUpperCase()} ${route}`)
        if (!handler) throw new Error(`missing route ${method} ${route}`)
        const result = { status: 200, body: null as any }
        const response = {
            status(code: number) { result.status = code; return this },
            json(body: unknown) { result.body = body; return this },
        }
        handler(request, response)
        return result
    }
    const invokeAsync = async (
        method: string,
        route: string,
        request: Record<string, unknown>,
    ) => {
        const handler = routes.get(`${method.toUpperCase()} ${route}`)
        if (!handler) throw new Error(`missing route ${method} ${route}`)
        const result = { status: 200, body: null as any }
        const response = {
            status(code: number) { result.status = code; return this },
            json(body: unknown) { result.body = body; return this },
        }
        await handler(request, response)
        return result
    }
    return { operationId, receipt, invoke, invokeAsync, cancelCalls: () => cancelCalls }
}

function queuedRetryHarness(
    storedServerChatCommitVersion: 0 | 1,
    requestedServerChatCommitVersion: 0 | 1,
    storedServerBaseChatRevision = 'canonical-base-revision',
) {
    const operationId = `operation-c2-retry-${storedServerChatCommitVersion}-${requestedServerChatCommitVersion}`
    const values = new Map<string, string>([[
        operationStateKey(operationId),
        JSON.stringify({
            operationId,
            charId: 'char-1',
            chatId: 'chat-1',
            state: 'queued',
            ...(storedServerChatCommitVersion === 1 ? {
                serverChatCommitVersion: 1,
                serverBaseChatRevision: storedServerBaseChatRevision,
            } : {}),
        }),
    ]])
    const routes = new Map<string, (request: any, response: any) => unknown>()
    const app: Record<string, unknown> = {}
    for (const method of ['get', 'post', 'delete']) {
        app[method] = (route: string, ...handlers: Array<(request: any, response: any) => unknown>) => {
            routes.set(`${method.toUpperCase()} ${route}`, handlers[handlers.length - 1])
        }
    }
    let startCalls = 0
    let captureCalls = 0
    registerBgOrchestrator(app, {
        sessionAuthMiddleware: () => {},
        kvGet: (key: string) => values.get(key) ?? null,
        kvSet: (key: string, value: string) => values.set(key, value),
        kvDel: (key: string) => values.delete(key),
        kvList: (prefix: string) => [...values.keys()].filter(key => key.startsWith(prefix)),
        kvGetUpdatedAt: () => Date.now(),
        orchestrationRuns: {
            get: () => null,
            start: () => {
                startCalls += 1
                throw new Error('queued protocol conflict reached provider scheduling')
            },
            status: () => null,
            isActive: () => false,
        },
        serverChatCommitOwner: {
            captureBase: async () => {
                captureCalls += 1
                return {
                    revision: 'canonical-base-revision',
                    submittedRevision: 'canonical-base-revision',
                    matches: true,
                }
            },
            readGenerationCommit: () => ({ status: 'missing', receipt: null }),
        },
    })
    const start = async () => {
        const handler = routes.get('POST /api/bg-orchestrate')
        if (!handler) throw new Error('missing queued retry start route')
        const response = { status: 200, body: null as any }
        const res = {
            status(code: number) { response.status = code; return this },
            json(body: unknown) { response.body = body; return this },
        }
        await handler({
            body: {
                detached: true,
                selectedCharId: 'char-1',
                selectedChatId: 'chat-1',
                currentChat: {
                    id: 'chat-1',
                    message: [{ role: 'user', data: 'hello', chatId: 'user-1' }],
                },
                operationId,
                resultKeyVersion: 1,
                startAckVersion: 1,
                serverChatCommitVersion: requestedServerChatCommitVersion,
            },
        }, res)
        return response
    }
    return {
        captureCalls: () => captureCalls,
        start,
        startCalls: () => startCalls,
    }
}

function detachedCommitHarness() {
    const operationId = 'operation-c2-detached-1'
    const values = new Map<string, string | Buffer>()
    const routes = new Map<string, (request: any, response: any) => unknown>()
    const app: Record<string, unknown> = {}
    for (const method of ['get', 'post', 'delete']) {
        app[method] = (route: string, ...handlers: Array<(request: any, response: any) => unknown>) => {
            routes.set(`${method.toUpperCase()} ${route}`, handlers[handlers.length - 1])
        }
    }
    const baseChat = {
        id: 'chat-1',
        name: 'Chat',
        message: [{ role: 'user', data: 'hello', chatId: 'user-1' }],
    }
    const finalChat = {
        ...baseChat,
        message: [
            ...baseChat.message,
            { role: 'char', data: 'answer', chatId: 'assistant-1' },
        ],
    }
    const runtime = {
        database: {
            characters: [{
                chaId: 'char-1',
                chats: [{ id: 'chat-1', name: 'Chat', _stub: true }],
            }],
            globalChatVariables: {},
            statics: { messages: 10 },
        } as any,
        fullStore: new Map([['char-1', new Map([['chat-1', baseChat]])]]),
    }
    const kvGet = (key: string) => values.get(key) ?? null
    const kvSet = (key: string, value: string | Buffer | Uint8Array) => {
        values.set(key, typeof value === 'string' ? value : Buffer.from(value))
    }
    const kvDel = (key: string) => values.delete(key)
    const kvList = (prefix: string) => [...values.keys()].filter(key => key.startsWith(prefix))
    const kvDelPrefix = (prefix: string) => {
        for (const key of kvList(prefix)) values.delete(key)
    }
    const chatRevision = (chat: unknown) => createHash('sha256')
        .update(Buffer.from(encodeRisuSaveLegacy(chat)))
        .digest('hex')
    let storageQueue = Promise.resolve<unknown>(undefined)
    const queueStorageOperation = <T>(operation: () => T | Promise<T>): Promise<T> => {
        const run = storageQueue.then(operation, operation)
        storageQueue = run.catch(() => undefined)
        return run
    }
    const journal = createChatWriteJournal({
        kvGet,
        kvSet,
        kvDel,
        kvList,
        encode: encodeRisuSaveLegacy,
        decode: decodeRisuSave,
    })
    const actualOwner = createServerChatCommitOwner({
        chatWriteJournal: journal,
        kvGet,
        kvSet,
        kvDel,
        kvDelPrefix,
        kvList,
        sqliteDb: { transaction: (operation: () => unknown) => () => operation() },
        queueStorageOperation,
        chatRevision,
        ensureCanonicalState: async () => {},
        getDbCache: () => ({ database: runtime.database }),
        getFullChatStore: () => runtime.fullStore,
        databaseKey: 'database',
        cacheStrippedDatabase: (database: unknown) => { runtime.database = database },
        scheduleChatStorePersist: () => {},
    })
    const commitCalls: any[] = []
    let receipt: any = null
    let finished = false
    registerBgOrchestrator(app, {
        sessionAuthMiddleware: () => {},
        kvGet,
        kvSet,
        kvDel,
        kvList,
        kvGetUpdatedAt: () => Date.now(),
        orchestrationRuns: {
            get: () => null,
            start: (_candidate: string, metadata: Record<string, unknown>) => ({
                started: true,
                run: {
                    ...metadata,
                    controller: new AbortController(),
                    cancelled: false,
                    state: 'running',
                },
            }),
            discard: () => {},
            nextPublishSequence: () => 2,
            finish: () => { finished = true },
            status: () => 'running',
            isActive: () => false,
        },
        serverChatCommitOwner: {
            ...actualOwner,
            commitGenerationResult: async (value: unknown) => {
                commitCalls.push(value)
                const outcome = await actualOwner.commitGenerationResult(value)
                receipt = outcome.receipt
                return outcome
            },
        },
        runServerPreview: async (
            _dependencies: unknown,
            _charId: string,
            _chatId: string,
            _chat: unknown,
            _mode: string,
            control: { onProviderStart?: () => void },
        ) => {
            control.onProviderStart?.()
            return {
                chat: finalChat,
                staticsMessagesDelta: 1,
                globalChatVariables: {},
                globalChatVariablesDeleted: [],
                globalChatVariablesExpected: {},
                settingsDigest: 'a'.repeat(64),
                threw: null,
            }
        },
    })
    const start = async () => {
        const handler = routes.get('POST /api/bg-orchestrate')
        if (!handler) throw new Error('missing detached start route')
        const response = { status: 200, body: null as any }
        const res = {
            status(code: number) { response.status = code; return this },
            json(body: unknown) { response.body = body; return this },
        }
        await handler({
            body: {
                detached: true,
                selectedCharId: 'char-1',
                selectedChatId: 'chat-1',
                currentChat: baseChat,
                operationId,
                resultKeyVersion: 1,
                resultOrderVersion: 1,
                startAckVersion: 1,
                serverChatCommitVersion: 1,
            },
        }, res)
        for (let attempt = 0; attempt < 20
            && (commitCalls.length === 0 || !finished); attempt += 1) {
            await new Promise(resolve => setTimeout(resolve, 0))
        }
        return response
    }
    const project = async (revision: string) => {
        const handler = routes.get('GET /api/bg-orchestrate-chat-state/:charId/:chatId')
        if (!handler) throw new Error('missing chat projection route')
        const response = { status: 200, body: null as any }
        const res = {
            status(code: number) { response.status = code; return this },
            json(body: unknown) { response.body = body; return this },
        }
        await handler({
            params: { charId: 'char-1', chatId: 'chat-1' },
            query: { revision },
        }, res)
        return response
    }
    return {
        operationId,
        receipt: () => receipt,
        runtime,
        values,
        commitCalls,
        project,
        start,
        finished: () => finished,
    }
}

describe('server chat commit route precedence', () => {
    it('routes a synthetic detached final result through the server commit owner', async () => {
        const harness = detachedCommitHarness()
        const response = await harness.start()
        expect(response).toMatchObject({
            status: 200,
            body: {
                handled: true,
                started: true,
                serverChatCommitVersion: 1,
            },
        })
        expect(harness.commitCalls).toHaveLength(1)
        expect(harness.commitCalls[0]).toMatchObject({
            operationId: harness.operationId,
            baseChatRevision: expect.stringMatching(/^[a-f0-9]{64}$/),
            baselineMessageCount: 1,
            settingsDigest: 'a'.repeat(64),
        })
        const resultRecord = JSON.parse(
            harness.values.get(`bg-orch-result-op:${harness.operationId}`)!.toString(),
        )
        expect(resultRecord).toMatchObject({
            operationId: harness.operationId,
            serverChatCommit: {
                status: 'committed',
                receipt: harness.receipt(),
            },
        })
        expect(harness.runtime.fullStore.get('char-1')?.get('chat-1')).toEqual({
            id: 'chat-1',
            name: 'Chat',
            message: [
                { role: 'user', data: 'hello', chatId: 'user-1' },
                { role: 'char', data: 'answer', chatId: 'assistant-1' },
            ],
        })
        expect(harness.runtime.database.statics.messages).toBe(11)
        expect(JSON.parse(
            harness.values.get(operationStateKey(harness.operationId))!.toString(),
        )).toMatchObject({ state: 'chat-committed' })
        await expect(harness.project(harness.receipt().storedRevision)).resolves.toMatchObject({
            status: 200,
            body: {
                found: true,
                contract: 'bg_chat_execution_projection.v1',
                charId: 'char-1',
                chatId: 'chat-1',
                chatRevision: harness.receipt().storedRevision,
                coverage: 'authoritative',
                owners: [{
                    messageId: 'assistant-1',
                    operationId: harness.operationId,
                    authority: 'server',
                    automaticBackfill: 'eligible',
                }],
                pendingInputCommands: [],
            },
        })
        await expect(harness.project('stale-revision')).resolves.toMatchObject({
            status: 409,
            body: {
                found: false,
                state: 'revision_mismatch',
                currentRevision: harness.receipt().storedRevision,
            },
        })
        expect(harness.finished()).toBe(true)
    })

    it('rejects a stale submitted chat before provider work', async () => {
        const harness = routeHarness()
        const start = await harness.invokeAsync('post', '/api/bg-orchestrate', {
            body: {
                detached: true,
                selectedCharId: 'char-1',
                selectedChatId: 'chat-1',
                currentChat: {
                    id: 'chat-1',
                    message: [{ role: 'user', data: 'stale', chatId: 'user-1' }],
                },
                operationId: 'operation-c2-stale-1',
                resultKeyVersion: 1,
                startAckVersion: 1,
                serverChatCommitVersion: 1,
            },
        })
        expect(start).toMatchObject({
            status: 409,
            body: {
                handled: false,
                started: false,
                reason: 'server-chat-commit-input-stale',
            },
        })
    })

    it.each([
        { stored: 1 as const, requested: 0 as const },
        { stored: 0 as const, requested: 1 as const },
    ])('rejects a queued server-commit negotiation change from $stored to $requested', async ({
        stored,
        requested,
    }) => {
        const harness = queuedRetryHarness(stored, requested)
        await expect(harness.start()).resolves.toMatchObject({
            status: 409,
            body: {
                handled: false,
                started: false,
                reason: 'operation-protocol-conflict',
            },
        })
        expect(harness.startCalls()).toBe(0)
    })

    it('rejects a queued retry whose canonical server base changed', async () => {
        const harness = queuedRetryHarness(1, 1, 'older-canonical-base-revision')
        await expect(harness.start()).resolves.toMatchObject({
            status: 409,
            body: {
                handled: false,
                started: false,
                reason: 'operation-protocol-conflict',
            },
        })
        expect(harness.captureCalls()).toBe(1)
        expect(harness.startCalls()).toBe(0)
    })

    it('retains server commit negotiation and canonical base in operation state', () => {
        const values = new Map<string, string>()
        const operationId = 'operation-c2-state-1'
        expect(writeOperationState(
            (key, value) => values.set(key, value),
            operationId,
            {
                charId: 'char-1',
                chatId: 'chat-1',
                baseChatRevision: 'client-semantic-revision',
                serverChatCommitVersion: 1,
                serverBaseChatRevision: 'canonical-server-revision',
            },
            'queued',
        ).written).toBe(true)
        expect(JSON.parse(values.get(operationStateKey(operationId))!)).toMatchObject({
            state: 'queued',
            serverChatCommitVersion: 1,
            serverBaseChatRevision: 'canonical-server-revision',
        })
    })

    it('reports, protects, and rediscovers a committed chat after result cleanup', () => {
        const harness = routeHarness()
        const query = { charId: 'char-1', chatId: 'chat-1' }
        const status = harness.invoke('get', '/api/bg-orchestrate-status/:operationId', {
            params: { operationId: harness.operationId },
            query,
        })
        expect(status).toMatchObject({
            status: 200,
            body: {
                accepted: true,
                state: 'chat-committed',
                serverChatCommit: harness.receipt,
            },
        })

        const cancel = harness.invoke('delete', '/api/bg-orchestrate/:operationId', {
            params: { operationId: harness.operationId },
            query,
        })
        expect(cancel).toMatchObject({
            status: 409,
            body: { cancelled: false, reason: 'already-committed' },
        })
        expect(harness.cancelCalls()).toBe(0)

        const result = harness.invoke('get', '/api/bg-orchestrate-result/:operationId', {
            params: { operationId: harness.operationId },
            query: { ...query, consumerId: 'consumer-c2-route-1' },
        })
        expect(result).toMatchObject({
            status: 200,
            body: {
                found: false,
                operationState: 'chat-committed',
                serverChatCommit: harness.receipt,
            },
        })
    })
})
