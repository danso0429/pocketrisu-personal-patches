import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const registerBgOrchestrator = require('./bgOrchestrator.cjs') as (
    app: Record<string, unknown>,
    dependencies: Record<string, unknown>,
) => void
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
    const values = new Map<string, string>()
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
    const receipt = {
        contractVersion: 'bg_server_chat_commit.v1',
        operationId,
        requestedCharId: 'char-1',
        requestedChatId: 'chat-1',
        storedChatId: 'chat-1',
        storedRevision: 'stored-revision',
        chatCommitted: true,
    }
    const commitCalls: any[] = []
    let finished = false
    registerBgOrchestrator(app, {
        sessionAuthMiddleware: () => {},
        kvGet: (key: string) => values.get(key) ?? null,
        kvSet: (key: string, value: string) => values.set(key, value),
        kvDel: (key: string) => values.delete(key),
        kvList: (prefix: string) => [...values.keys()].filter(key => key.startsWith(prefix)),
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
            captureBase: async () => ({
                revision: 'canonical-base-revision',
                submittedRevision: 'canonical-base-revision',
                matches: true,
            }),
            commitGenerationResult: async (value: unknown) => {
                commitCalls.push(value)
                return { status: 'committed', receipt, publication: 'published' }
            },
            readGenerationCommit: () => ({ status: 'missing', receipt: null }),
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
    return {
        operationId,
        receipt,
        values,
        commitCalls,
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
            baseChatRevision: 'canonical-base-revision',
            baselineMessageCount: 1,
            settingsDigest: 'a'.repeat(64),
        })
        const resultRecord = JSON.parse(
            harness.values.get(`bg-orch-result-op:${harness.operationId}`)!,
        )
        expect(resultRecord).toMatchObject({
            operationId: harness.operationId,
            serverChatCommit: {
                status: 'committed',
                receipt: harness.receipt,
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
