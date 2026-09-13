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

describe('server chat commit route precedence', () => {
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
