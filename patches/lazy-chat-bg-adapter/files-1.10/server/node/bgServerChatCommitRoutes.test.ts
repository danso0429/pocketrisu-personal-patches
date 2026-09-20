import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import type { AddressInfo } from 'node:net'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { hydrateServerCommittedOrchestration } from '../../src/ts/bgServerCommitHydration'

const require = createRequire(import.meta.url)
const registerBgOrchestrator = require('./bgOrchestrator.cjs') as (
    app: Record<string, unknown>,
    dependencies: Record<string, unknown>,
) => void
const { createChatWriteJournal } = require('./chatWriteJournal.cjs') as any
const { createServerChatCommitOwner } = require('./serverChatCommitOwner.cjs') as any
const { createServerChatInputOwner } = require('./serverChatInputOwner.cjs') as any
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

const cleanup: Array<() => void | Promise<void>> = []
afterEach(async () => {
    while (cleanup.length > 0) await cleanup.pop()?.()
})

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

function detachedCommitHarness({
    commitFailure = false,
    previewGate = null as Promise<void> | null,
} = {}) {
    const operationId = 'operation-c2-detached-1'
    const sqliteDb = new Database(':memory:')
    sqliteDb.exec('CREATE TABLE kv (key TEXT PRIMARY KEY, value BLOB NOT NULL, updated_at INTEGER NOT NULL)')
    const get = sqliteDb.prepare('SELECT value FROM kv WHERE key = ?')
    const set = sqliteDb.prepare(`
        INSERT INTO kv(key, value, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `)
    const del = sqliteDb.prepare('DELETE FROM kv WHERE key = ?')
    const list = sqliteDb.prepare('SELECT key FROM kv WHERE key LIKE ? ORDER BY key')
    const delPrefix = sqliteDb.prepare("DELETE FROM kv WHERE key LIKE ? ESCAPE '\\'")
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
    const kvGet = (key: string) => (
        get.get(key) as { value?: string | Buffer } | undefined
    )?.value ?? null
    const kvSet = (key: string, value: string | Buffer | Uint8Array) => {
        set.run(key, typeof value === 'string' ? value : Buffer.from(value), Date.now())
    }
    const kvDel = (key: string) => del.run(key)
    const escaped = (prefix: string) => `${prefix.replace(/[\\%_]/g, '\\$&')}%`
    const kvList = (prefix: string) => (
        list.all(escaped(prefix)) as Array<{ key: string }>
    ).map(row => row.key)
    const kvDelPrefix = (prefix: string) => delPrefix.run(escaped(prefix))
    const values = {
        get: kvGet,
        delete: (key: string) => { kvDel(key); return true },
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
    const ownerDependencies = {
        chatWriteJournal: journal,
        kvGet,
        kvSet,
        kvDel,
        kvDelPrefix,
        kvList,
        sqliteDb,
        queueStorageOperation,
        chatRevision,
        ensureCanonicalState: async () => {},
        getDbCache: () => ({ database: runtime.database }),
        getFullChatStore: () => runtime.fullStore,
        databaseKey: 'database',
        cacheStrippedDatabase: (database: unknown) => { runtime.database = database },
        scheduleChatStorePersist: () => {},
        encodeSettingsSnapshot: encodeRisuSaveLegacy,
    }
    cleanup.push(() => sqliteDb.close())
    const inputOwner = createServerChatInputOwner(ownerDependencies)
    const actualOwner = createServerChatCommitOwner({
        ...ownerDependencies,
        serverChatInputOwner: inputOwner,
    })
    const commitCalls: any[] = []
    const inputSettingsSnapshots: any[] = []
    let previewCalls = 0
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
                if (commitFailure) throw new Error('injected-server-chat-commit-failure')
                const outcome = await actualOwner.commitGenerationResult(value)
                receipt = outcome.receipt
                return outcome
            },
        },
        serverChatInputOwner: inputOwner,
        runServerPreview: async (
            _dependencies: unknown,
            _charId: string,
            _chatId: string,
            previewChat: any,
            _mode: string,
            control: any,
        ) => {
            previewCalls += 1
            if (previewGate) await previewGate
            let resultChat = finalChat
            let settingsDigest = 'a'.repeat(64)
            if (control.inputCommandVersion === 1) {
                const settingsSnapshot = control.readInputSettingsSnapshot()
                inputSettingsSnapshots.push({
                    ...settingsSnapshot,
                    bytes: await decodeRisuSave(settingsSnapshot.bytes),
                })
                settingsDigest = settingsSnapshot.contextDigest
                const transform = await control.beginInputTransform()
                const command = transform.record.admission
                const inputChat = {
                    ...previewChat,
                    message: [
                        ...previewChat.message,
                        {
                            role: 'user',
                            data: command.rawText,
                            chatId: command.userMessageId,
                            time: command.submittedAt,
                            name: null,
                        },
                    ],
                }
                const attached = await control.attachInputTransform({
                    chat: inputChat,
                    globalIntent: { changed: {}, deleted: [], expected: {} },
                })
                control.onInputCommitted(attached.record)
                resultChat = {
                    ...inputChat,
                    message: [
                        ...inputChat.message,
                        { role: 'char', data: 'answer', chatId: 'assistant-input-1' },
                    ],
                }
            }
            control.onProviderStart?.()
            return {
                chat: resultChat,
                staticsMessagesDelta: 1,
                globalChatVariables: {},
                globalChatVariablesDeleted: [],
                globalChatVariablesExpected: {},
                settingsDigest,
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
    const inputBody = () => ({
        detached: true,
        selectedCharId: 'char-1',
        selectedChatId: 'chat-1',
        currentChat: {
            ...baseChat,
            message: [{ role: 'user', data: 'spoofed', chatId: 'user-spoofed' }],
        },
        operationId,
        baseChatRevision: chatRevision(baseChat),
        resultKeyVersion: 1,
        resultOrderVersion: 1,
        startAckVersion: 1,
        serverChatCommitVersion: 1,
        inputCommandVersion: 1,
        inputCommand: {
            inputCommandId: `input-${operationId}`,
            userMessageId: `user-${operationId}`,
            rawText: 'next input',
            settingsSnapshotRef: 'client-spoofed-settings-ref',
            submittedAt: 1_700_000_000_000,
        },
    })
    const startInput = async () => {
        const handler = routes.get('POST /api/bg-orchestrate')
        if (!handler) throw new Error('missing detached input start route')
        const response = { status: 200, body: null as any }
        const res = {
            status(code: number) { response.status = code; return this },
            json(body: unknown) { response.body = body; return this },
        }
        await handler({ body: inputBody() }, res)
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
    const readResult = async () => {
        const handler = routes.get('GET /api/bg-orchestrate-result/:operationId')
        if (!handler) throw new Error('missing result route')
        const response = { status: 200, body: null as any }
        const res = {
            status(code: number) { response.status = code; return this },
            json(body: unknown) { response.body = body; return this },
        }
        await handler({
            params: { operationId },
            query: {
                charId: 'char-1',
                chatId: 'chat-1',
                consumerId: 'consumer-server-owned-result-1',
            },
        }, res)
        return response
    }
    return {
        operationId,
        receipt: () => receipt,
        runtime,
        values,
        commitCalls,
        inputBody,
        inputSettingsSnapshots,
        inputOwner,
        project,
        readResult,
        routes,
        start,
        startInput,
        finished: () => finished,
        previewCalls: () => previewCalls,
    }
}

async function startHTTPBridge(harness: ReturnType<typeof detachedCommitHarness>) {
    const server = createServer(async (incoming, outgoing) => {
        const url = new URL(incoming.url || '/', 'http://127.0.0.1')
        if (incoming.method === 'GET' && url.pathname === '/test/chat/char-1/chat-1') {
            const chat = harness.runtime.fullStore.get('char-1')?.get('chat-1') || null
            outgoing.statusCode = chat ? 200 : 404
            outgoing.setHeader('content-type', 'application/json')
            outgoing.end(JSON.stringify({ found: !!chat, chat }))
            return
        }

        let key = ''
        let params: Record<string, string> = {}
        if (incoming.method === 'POST' && url.pathname === '/api/bg-orchestrate') {
            key = 'POST /api/bg-orchestrate'
        } else {
            const projection = url.pathname.match(
                /^\/api\/bg-orchestrate-chat-state\/([^/]+)\/([^/]+)$/,
            )
            const result = url.pathname.match(/^\/api\/bg-orchestrate-result\/([^/]+)$/)
            if (incoming.method === 'GET' && projection) {
                key = 'GET /api/bg-orchestrate-chat-state/:charId/:chatId'
                params = {
                    charId: decodeURIComponent(projection[1]),
                    chatId: decodeURIComponent(projection[2]),
                }
            } else if (incoming.method === 'GET' && result) {
                key = 'GET /api/bg-orchestrate-result/:operationId'
                params = { operationId: decodeURIComponent(result[1]) }
            }
        }
        const handler = harness.routes.get(key)
        if (!handler) {
            outgoing.statusCode = 404
            outgoing.end()
            return
        }

        let body: unknown = null
        if (incoming.method === 'POST') {
            const chunks: Buffer[] = []
            for await (const chunk of incoming) chunks.push(Buffer.from(chunk))
            body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        }
        const response = {
            status(code: number) { outgoing.statusCode = code; return this },
            json(value: unknown) {
                outgoing.setHeader('content-type', 'application/json')
                outgoing.end(JSON.stringify(value))
                return this
            },
        }
        try {
            await handler({
                body,
                params,
                query: Object.fromEntries(url.searchParams.entries()),
            }, response)
        } catch (error) {
            if (!outgoing.writableEnded) {
                outgoing.statusCode = 500
                outgoing.end(JSON.stringify({ error: String(error) }))
            }
        }
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    cleanup.push(async () => {
        server.closeAllConnections()
        if (server.listening) {
            await new Promise<void>((resolve) => server.close(() => resolve()))
        }
    })
    const address = server.address() as AddressInfo
    return `http://127.0.0.1:${address.port}`
}

describe('server chat commit route precedence', () => {
    it('acknowledges a durable N+1 command without scheduling before its predecessor', async () => {
        const routes = new Map<string, (request: any, response: any) => unknown>()
        const app: Record<string, unknown> = {}
        for (const method of ['get', 'post', 'delete']) {
            app[method] = (
                route: string,
                ...handlers: Array<(request: any, response: any) => unknown>
            ) => routes.set(`${method.toUpperCase()} ${route}`, handlers.at(-1)!)
        }
        const operationId = 'operation-input-waiting-route-2'
        const predecessorOperationId = 'operation-input-waiting-route-1'
        let startCalls = 0
        registerBgOrchestrator(app, {
            sessionAuthMiddleware: () => {},
            ensureChatStore: async () => {},
            getDbCache: () => ({ database: { characters: [] } }),
            getFullChatStore: () => new Map(),
            DB_HEX_KEY: 'database',
            kvGet: () => null,
            kvSet: () => {},
            kvDel: () => {},
            kvList: () => [],
            kvGetUpdatedAt: () => Date.now(),
            orchestrationRuns: {
                get: () => null,
                start: () => { startCalls += 1; return { started: false } },
                status: () => null,
                cancel: () => ({ cancelled: false, run: null }),
                isActive: () => false,
            },
            serverChatCommitOwner: {},
            serverChatInputOwner: {
                admit: async () => ({ status: 'admitted', reused: false }),
                loadExecution: async () => ({
                    status: 'waiting',
                    reason: 'predecessor_active',
                    predecessorOperationId,
                }),
            },
        })
        const response = { status: 200, body: null as any }
        const res = {
            status(code: number) { response.status = code; return this },
            json(body: unknown) { response.body = body; return this },
        }
        await routes.get('POST /api/bg-orchestrate')!({
            body: {
                detached: true,
                startAckVersion: 1,
                resultKeyVersion: 1,
                serverChatCommitVersion: 1,
                inputCommandVersion: 1,
                selectedCharId: 'char-1',
                selectedChatId: 'chat-1',
                currentChat: { id: 'chat-1', message: [] },
                baseChatRevision: 'a'.repeat(64),
                operationId,
                inputCommand: {
                    inputCommandId: 'input-waiting-route-2',
                    userMessageId: 'user-waiting-route-2',
                    rawText: 'next',
                    submittedAt: 1_700_000_000_000,
                },
            },
        }, res)

        expect(response).toEqual({
            status: 202,
            body: {
                handled: true,
                started: false,
                accepted: true,
                operationId,
                state: 'input-waiting-predecessor',
                predecessorOperationId,
                reason: 'predecessor_active',
                resultKeyVersion: 1,
                serverChatCommitVersion: 1,
                inputCommandVersion: 1,
            },
        })
        expect(startCalls).toBe(0)
    })

    it('admits, attaches, and commits a pre-canonical input through the detached route', async () => {
        const harness = detachedCommitHarness()
        await expect(harness.startInput()).resolves.toMatchObject({
            status: 200,
            body: {
                handled: true,
                started: true,
                serverChatCommitVersion: 1,
                inputCommandVersion: 1,
            },
        })
        expect(harness.runtime.fullStore.get('char-1')?.get('chat-1')?.message)
            .toMatchObject([
                { role: 'user', data: 'hello', chatId: 'user-1' },
                {
                    role: 'user',
                    data: 'next input',
                    chatId: `user-${harness.operationId}`,
                },
                { role: 'char', data: 'answer', chatId: 'assistant-input-1' },
            ])
        expect(harness.inputSettingsSnapshots).toHaveLength(1)
        expect(harness.inputSettingsSnapshots[0]).toMatchObject({
            status: 'ready',
            bytes: {
                characters: [{ chaId: 'char-1' }],
                statics: { messages: 10 },
            },
        })
        expect(harness.inputSettingsSnapshots[0].ref)
            .not.toBe('client-spoofed-settings-ref')
        expect(harness.commitCalls).toHaveLength(1)
        expect(harness.commitCalls[0]).toMatchObject({
            baselineMessageCount: 2,
            settingsDigest: harness.inputSettingsSnapshots[0].contextDigest,
            inputReceipt: {
                contractVersion: 'bg_server_input_receipt.v1',
                inputCommandId: `input-${harness.operationId}`,
                messageId: `user-${harness.operationId}`,
                hostChangeSeq: 1,
            },
        })
        expect(harness.inputOwner.read(harness.operationId)).toMatchObject({
            inputState: 'completed',
            admissionSeq: 1,
            terminal: { state: 'completed', publication: 'published' },
        })
        expect(harness.inputOwner.settingsSnapshotStats()).toMatchObject({ contexts: 0 })
        const projectionResponse = await harness.project(harness.receipt().storedRevision)
        expect(projectionResponse).toMatchObject({
            status: 200,
            body: {
                pendingInputCommands: [],
                owners: [{ messageId: 'assistant-input-1' }],
            },
        })
    })

    it('continues one AC-off turn after the HTTP start client has gone away', async () => {
        let releasePreview!: () => void
        const previewGate = new Promise<void>((resolve) => { releasePreview = resolve })
        const harness = detachedCommitHarness({ previewGate })
        const baseURL = await startHTTPBridge(harness)

        const startResponse = await fetch(`${baseURL}/api/bg-orchestrate`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(harness.inputBody()),
        })
        expect(startResponse.status).toBe(200)
        await expect(startResponse.json()).resolves.toMatchObject({
            handled: true,
            started: true,
            operationId: harness.operationId,
            serverChatCommitVersion: 1,
            inputCommandVersion: 1,
        })
        for (let attempt = 0; attempt < 20 && harness.previewCalls() === 0; attempt += 1) {
            await new Promise(resolve => setTimeout(resolve, 0))
        }
        expect(harness.previewCalls()).toBe(1)
        expect(harness.commitCalls).toHaveLength(0)
        expect(harness.finished()).toBe(false)

        releasePreview()
        for (let attempt = 0; attempt < 40 && !harness.finished(); attempt += 1) {
            await new Promise(resolve => setTimeout(resolve, 0))
        }
        expect(harness.finished()).toBe(true)
        expect(harness.previewCalls()).toBe(1)
        expect(harness.commitCalls).toHaveLength(1)

        const resultResponse = await fetch(
            `${baseURL}/api/bg-orchestrate-result/${harness.operationId}`
            + '?charId=char-1&chatId=chat-1&consumerId=consumer-process-boundary-1',
        )
        expect(resultResponse.status).toBe(200)
        const resultData = await resultResponse.json() as any
        expect(resultData).toMatchObject({
            found: true,
            operationId: harness.operationId,
            serverChatCommitVersion: 1,
            serverChatCommit: { status: 'committed' },
        })

        const storedRevision = resultData.serverChatCommit.receipt.storedRevision
        const projectionResponse = await fetch(
            `${baseURL}/api/bg-orchestrate-chat-state/char-1/chat-1`
            + `?revision=${encodeURIComponent(storedRevision)}`,
        )
        expect(projectionResponse.status).toBe(200)
        const projection = await projectionResponse.json()
        expect(projection).toMatchObject({
            found: true,
            coverage: 'authoritative',
            owners: [{ operationId: harness.operationId }],
        })

        const chatResponse = await fetch(`${baseURL}/test/chat/char-1/chat-1`)
        expect(chatResponse.status).toBe(200)
        const storedChat = (await chatResponse.json() as any).chat
        expect(storedChat.message).toMatchObject([
            { chatId: 'user-1' },
            { chatId: `user-${harness.operationId}` },
            { chatId: 'assistant-input-1' },
        ])
        await expect(hydrateServerCommittedOrchestration({
            data: resultData,
            operationId: harness.operationId,
            charId: 'char-1',
            chatId: 'chat-1',
            allowedCurrentRevisions: [],
            readProjection: async () => projection,
            adoptChat: async () => ({ adopted: true, chat: storedChat }),
        })).resolves.toMatchObject({
            hydrated: true,
            chat: storedChat,
            projection,
        })
        expect(harness.values.get(`bg-orch-result-op:${harness.operationId}`))
            .not.toBeNull()
    })

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
        const projectionResponse = await harness.project(harness.receipt().storedRevision)
        expect(projectionResponse).toMatchObject({
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
        await expect(hydrateServerCommittedOrchestration({
            data: resultRecord,
            operationId: harness.operationId,
            charId: 'char-1',
            chatId: 'chat-1',
            allowedCurrentRevisions: [],
            readProjection: async () => projectionResponse.body,
            adoptChat: async () => ({
                adopted: true,
                chat: structuredClone(
                    harness.runtime.fullStore.get('char-1')?.get('chat-1'),
                ),
            }),
        })).resolves.toMatchObject({
            hydrated: true,
            receipt: harness.receipt(),
            projection: projectionResponse.body,
            chat: {
                id: 'chat-1',
                message: expect.arrayContaining([
                    expect.objectContaining({ chatId: 'assistant-1' }),
                ]),
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

    it('retains server ownership and the generated result when chat commit fails', async () => {
        const harness = detachedCommitHarness({ commitFailure: true })
        await expect(harness.startInput()).resolves.toMatchObject({
            status: 200,
            body: {
                handled: true,
                started: true,
                serverChatCommitVersion: 1,
                inputCommandVersion: 1,
            },
        })
        expect(harness.commitCalls).toHaveLength(1)
        const resultRecord = JSON.parse(
            harness.values.get(`bg-orch-result-op:${harness.operationId}`)!.toString(),
        )
        expect(resultRecord).toMatchObject({
            operationId: harness.operationId,
            serverChatCommitVersion: 1,
            serverChatCommit: {
                status: 'failed',
                reason: 'commit_failed',
            },
            chat: {
                message: expect.arrayContaining([
                    expect.objectContaining({ chatId: `user-${harness.operationId}` }),
                    expect.objectContaining({ chatId: 'assistant-input-1' }),
                ]),
            },
        })
        expect(JSON.parse(
            harness.values.get(operationStateKey(harness.operationId))!.toString(),
        )).toMatchObject({
            state: 'result-ready',
            serverChatCommitVersion: 1,
        })
        expect(harness.inputOwner.read(harness.operationId)).toMatchObject({
            inputState: 'failed',
        })
        expect(harness.inputOwner.settingsSnapshotStats()).toMatchObject({ contexts: 0 })
        expect(harness.runtime.fullStore.get('char-1')?.get('chat-1')?.message)
            .not.toEqual(resultRecord.chat.message)

        harness.values.delete(`bg-orch-result-op:${harness.operationId}`)
        harness.values.delete(operationStateKey(harness.operationId))
        await expect(harness.readResult()).resolves.toMatchObject({
            status: 200,
            body: {
                found: false,
                operationId: harness.operationId,
                operationState: 'input-failed',
                serverChatCommitVersion: 1,
            },
        })
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
