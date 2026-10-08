// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    writePendingMarker as writeStoredPendingMarker,
} from './bgOrchestrationPending'
import { orchestrationChatRevision } from './bgOrchestrationMerge'

// Drives the generated bgOrchestrate.ts boot recovery and foreground watch against a scripted
// server. Storage/UI/network leaves are controlled; native generation ownership is real; the orchestration control
// flow, delivery classification and pending-marker ledger are the production modules.
const h = vi.hoisted(() => ({
    dbState: { db: {} as any },
    forage: { realStorage: null as any },
    alerts: [] as string[],
    warnings: [] as string[],
    infos: [] as string[],
    warningFailure: false,
    durableScopes: [] as any[],
    requests: [] as Array<{ method: string, url: string, signal?: AbortSignal }>,
    route: (async () => ({ status: 404, body: null })) as (
        method: string, url: string, body: any,
    ) => Promise<{ status: number, body: unknown }>,
    adopt: null as any,
    sendChat: null as any,
    doingChat: null as any,
    sounds: 0,
    holdSave: false,
    failSave: false,
    emitSaveEvidence: false,
    releaseSave: null as null | (() => void),
    jsonReads: [] as string[],
    binaryReads: 0,
}))

vi.mock('./stores.svelte', async () => {
    const { writable } = await import('svelte/store')
    return { DBState: h.dbState, selectedCharID: writable(0), ReloadChatPointer: writable(0) }
})
vi.mock('./storage/database.svelte', async () => {
    const { readFileSync } = await import('node:fs')
    const ts = await import('typescript')
    const { normalizePageFoldRoleOverrides } = await import('./pagefold/resolve')
    const source = ts.createSourceFile('database.svelte.ts', readFileSync('src/ts/storage/database.svelte.ts', 'utf8'), ts.ScriptTarget.ES2022, true)
    const node = source.statements.find(entry => ts.isFunctionDeclaration(entry) && entry.name?.text === 'normalizeChat')
    if (!node) throw new Error('Native normalizeChat declaration missing')
    const emitted = ts.transpileModule(node.getText(source).replace('export function', 'function'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
    }).outputText
    const normalizeChat = new Function('normalizePageFoldRoleOverrides', emitted + '\nreturn normalizeChat')(normalizePageFoldRoleOverrides)
    return { getDatabase: () => h.dbState.db, createBotPresetTemplate: () => ({}), normalizeChat,
        appVer: 'test', nodeOnlyVer: 'test', isChatStub: (value: any) => value?._stub === true && !Array.isArray(value?.message) }
})
// Rendering is a UI leaf; storage publication and guarded slot checks stay real.
vi.mock('svelte', async () => ({ ...(await vi.importActual<typeof import('svelte')>('svelte')), tick: async () => {} }))
vi.mock('./globalApi.svelte', () => ({ forageStorage: h.forage, requestDurableSave: async (scope: any) => {
    h.durableScopes.push(scope)
    if (h.failSave) throw new Error('synthetic durable save failed')
    if (h.holdSave) await new Promise<void>(resolve => { h.releaseSave = resolve })
    if (h.emitSaveEvidence) window.dispatchEvent(new Event('bg-recovery-evidence'))
} }))
vi.mock('./storage/chatStorage', () => ({
    adoptServerCommittedChat: (...args: unknown[]) => h.adopt(...args),
    ensureChatHydrated: async () => true,
    fetchChatFromServer: async (_charId: string, index: number) => (
        JSON.parse(JSON.stringify(h.dbState.db.characters[0].chats[index]))
    ),
    peekServerChatSnapshot: async () => null,
}))
vi.mock('./alert', () => ({
    alertError: (message: unknown) => { h.alerts.push(String(message)) },
    notifyInfo: (message: unknown) => { h.infos.push(String(message)) },
    notifyWarning: (message: string) => {
        if (h.warningFailure) throw new Error('warning UI unavailable')
        h.warnings.push(message)
    },
}))
vi.mock('./notificationSound', () => ({ playNotificationSound: async () => { h.sounds++ } }))
vi.mock('./process/index.svelte', async () => {
    const { writable } = await import('svelte/store')
    return {
        chatProcessStage: writable(0),
        get doingChat() { return h.doingChat },
        sendChatWithDirectLifecycle: (...args: unknown[]) => h.sendChat(...args),
    }
})
vi.mock('./status/requestStatus', () => ({
    ingestRelayedStatuses: () => {},
    clearRelayedStatuses: () => {},
}))
vi.mock('./storage/clientBuildHandshake', () => ({
    setClientBuildGenerationActive: () => {},
    clientBuildFetch: (url: string, init?: RequestInit) => scriptedFetch(url, init),
}))

async function scriptedFetch(url: string, init: RequestInit = {}) {
    const method = init.method || 'GET'
    h.requests.push({ method, url, signal: init.signal as AbortSignal })
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : null
    const response = await h.route(method, url, body)
    return {
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
    json: async () => {
        h.jsonReads.push(url)
        if ((response as any).jsonError) throw new SyntaxError('synthetic invalid JSON')
        return response.body
    },
    headers: new Headers((response as any).headers || {}),
    arrayBuffer: async () => { h.binaryReads++; return await (response as any).binary },
    }
}

const CHAR_ID = 'char-1'
const CHAT_ID = 'chat-1'
const BOOT_OPERATION_ID = 'operation-finished-1'
const RESULT_ID = 'result-finished-1'

function chatWith(count: number) {
    return {
        id: CHAT_ID,
        message: Array.from({ length: count }, (_, index) => ({
            role: index % 2 === 0 ? 'user' : 'char',
            data: `message ${index}`,
            chatId: `message-${index}`,
        })),
    }
}

function receipt(operationId: string) {
    return {
        contractVersion: 'bg_server_chat_commit.v1',
        commitReceiptId: 'commit-receipt-1',
        operationId,
        resultId: RESULT_ID,
        publishSeq: 2,
        requestedCharId: CHAR_ID,
        requestedChatId: CHAT_ID,
        storedChatId: CHAT_ID,
        baseChatRevision: 'base-revision',
        storedRevision: 'stored-revision',
        storageDisposition: 'original',
        chatCommitted: true,
        finalContentHash: 'stored-revision',
        effects: { chat: { status: 'committed' }, metadata: { status: 'committed' } },
    }
}

function committedResult(operationId: string) {
    return {
        found: true, operationId, resultId: RESULT_ID, publishSeq: 2,
        kind: 'terminal-success', outcome: 'success', final: true, chat: chatWith(3),
        staticsMessagesDelta: 1, globalChatVariables: {},
        serverChatCommitVersion: 1,
        serverChatCommit: { status: 'committed', receipt: receipt(operationId) },
    }
}

function projection(operationId: string) {
    return {
        found: true,
        contract: 'bg_chat_execution_projection.v1',
        charId: CHAR_ID, chatId: CHAT_ID, chatRevision: 'server-revision',
        coverage: 'authoritative', owners: [{ operationId }], pendingInputCommands: [],
    }
}

const isResultPeek = (method: string, url: string) => method === 'GET' && url.startsWith('/api/bg-orchestrate-result/')
const isResultAck = (method: string, url: string) => method === 'DELETE' && url.startsWith('/api/bg-orchestrate-result/')
const listeners: Array<[EventTarget, string, EventListenerOrEventListenerObject, any]> = []
beforeEach(async () => {
    vi.useFakeTimers()
    vi.resetModules()
    // Mock factories can survive resetModules; read the same current real busy
    // coordinator as bgOrchestrate, rather than retaining a prior test's store.
    h.doingChat = (await import('./generationBusy')).doingChat
    ;(await import('./stores.svelte')).selectedCharID.set(0)
    for (const target of [window, document]) {
        const add = target.addEventListener.bind(target)
        vi.spyOn(target, 'addEventListener').mockImplementation((type: string, listener: any, options: any) => {
            if (listener) listeners.push([target, type, listener, options])
            add(type, listener, options)
        })
    }
    localStorage.clear()
    h.dbState.db = { characters: [{ chaId: CHAR_ID, chatPage: 0, chats: [chatWith(2)] }], statics: {} }
    h.forage.realStorage = null
    h.alerts = []
    h.warnings = []
    h.infos = []
    h.warningFailure = false
    h.durableScopes = []
    h.requests = []
    h.adopt = vi.fn(async () => ({ adopted: false, reason: 'local-revision-conflict' }))
    h.sendChat = vi.fn(async () => true)
    h.sounds = 0
    h.holdSave = false
    h.failSave = false
    h.emitSaveEvidence = false
    h.releaseSave = null
    h.jsonReads = []
    h.binaryReads = 0
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => scriptedFetch(url, init))
})

afterEach(() => {
    for (const [target, type, listener, options] of listeners.splice(0)) target.removeEventListener(type, listener, options)
    vi.restoreAllMocks()
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

describe('CAP generated admission and preparation', () => {
    const capability = { contract: 'bg_orchestration_capabilities.v1', inputCommandVersion: 1,
        serverInputBaseVersion: 1, clientInputPreparationVersion: 1, serverChatCommitVersion: 1,
        chatExecutionProjectionVersion: 1 }
    let posted: any[], baseBytes: ArrayBuffer
    beforeEach(async () => {
        posted = []
        Object.assign(h.dbState.db, { aiModel: 'gpt-4o', subModel: 'gpt-4o', nodeOnlyModelModeLock: 'legacy', plugins: [] })
        const { encodeRisuSaveLegacy } = await import('./storage/risuSave')
        const encoded = encodeRisuSaveLegacy(h.dbState.db.characters[0].chats[0])
        baseBytes = encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer
        h.route = async (method, url, body) => {
            if (url.endsWith('capabilities')) return { status: 200, body: capability }
            if (url.startsWith('/api/bg-orchestrate-input-base/')) return {
                status: 200, body: null, binary: baseBytes, headers: { 'x-input-base-revision': 'a'.repeat(64) },
            } as any
            if (url.startsWith('/api/bg-orchestrate-chat-state/')) return { status: 200, body: {
                ...projection('unused'), owners: [], chatRevision: 'a'.repeat(64),
                pendingInputCommands: posted.map((value, index) => ({ operationId: value.operationId,
                    admissionSeq: index + 1, state: 'generating' })),
            } }
            if (url.startsWith('/api/bg-orchestrate-status/')) return { status: 200, body: {
                operationId: decodeURIComponent(url.split('/').at(-1)!.split('?')[0]), accepted: true, state: 'input-generating',
            } }
            if (url === '/api/bg-orchestrate' && method === 'POST') {
                posted.push(body)
                return { status: 202, body: { operationId: body.operationId, started: true, state: 'input-queued' } }
            }
            return { status: 404, body: null }
        }
        // Import/transform time is not transport time. Load the actual module
        // before starting deterministic deadline observations.
        await import('./bgOrchestrate')
    })
    async function submit(draft = 'draft-synthetic-001') {
        return (await import('./bgOrchestrate')).tryRunServerOwnedInput(0, 'synthetic request', draft)
    }
    function holdRoute(kind: 'capability' | 'base' | 'status', headers = false) {
        let release!: (value: any) => void
        const route = h.route
        h.route = async (method, url, body) => {
            const match = kind === 'capability' ? url.endsWith('capabilities')
                : kind === 'base' ? url.includes('input-base/') : url.includes('orchestrate-status/')
            if (!match) return route(method, url, body)
            const value = await route(method, url, body)
            const held = new Promise<any>(resolve => { release = resolve })
            return headers ? held : { ...value, ...(kind === 'base' ? { binary: held } : { body: held }) }
        }
        return (value: any) => release(value)
    }
    it('returns actual consumed capability and accepts eligible input once', async () => {
        expect(await submit()).toMatchObject({ kind: 'accepted', clearDraft: true })
        expect(h.jsonReads.filter(url => url.endsWith('capabilities'))).toHaveLength(1)
        expect(h.binaryReads).toBe(1)
        expect(h.durableScopes).toEqual([{ root: true }])
        expect(posted).toHaveLength(1)
    })
    it.each(['404', '500', 'malformed', 'incompatible'] as const)('preserves capability %s classification', async mode => {
        const route = h.route
        h.route = async (method, url, body) => url.endsWith('capabilities') ? {
            status: mode === '404' ? 404 : mode === '500' ? 500 : 200,
            body: mode === 'incompatible' ? {} : capability, jsonError: mode === 'malformed',
        } as any : route(method, url, body)
        expect(await submit()).toMatchObject(mode === '500' || mode === 'malformed'
            ? { kind: 'blocked', reason: 'capability-unavailable' } : { kind: 'unsupported' })
        expect(posted).toHaveLength(0)
    })
    it('bounds capability body and rejects late admission', async () => {
        const release = holdRoute('capability')
        const pending = submit()
        await vi.advanceTimersByTimeAsync(30_001)
        expect(await pending).toEqual({ kind: 'blocked', reason: 'capability-unavailable' })
        release(capability)
        await vi.advanceTimersByTimeAsync(1)
        expect(posted).toHaveLength(0)
    })
    it('bounds original binary body and rejects its late admission', async () => {
        const release = holdRoute('base')
        let result: any
        const pending = submit().then(value => { result = value })
        await vi.advanceTimersByTimeAsync(1)
        expect(h.binaryReads).toBe(1)
        await vi.advanceTimersByTimeAsync(30_001)
        expect(result).toEqual({ kind: 'blocked', reason: 'canonical-chat-unavailable' })
        await pending
        release(baseBytes)
        await vi.advanceTimersByTimeAsync(1)
        expect(posted).toHaveLength(0)
        expect((await import('./bgServerInputLedger')).readServerInputMarkers(localStorage)).toEqual([])
    })
    it('retains two-command capacity and does not admit a third', async () => {
        expect(await submit()).toMatchObject({ kind: 'accepted' })
        expect(await submit('draft-synthetic-002')).toMatchObject({ kind: 'accepted' })
        expect(await submit('draft-synthetic-003')).toEqual({ kind: 'blocked', reason: 'input-queue-full' })
        expect(posted).toHaveLength(2)
    })
    it('retains a marker on downgraded capability rather than falling back', async () => {
        expect(await submit()).toMatchObject({ kind: 'accepted' })
        const route = h.route
        h.route = async (m, u, b) => u.endsWith('capabilities')
            ? { status: 200, body: { ...capability, inputCommandVersion: 0 } } : route(m, u, b)
        expect(await submit('draft-synthetic-002')).toEqual({ kind: 'blocked', reason: 'capability-downgraded' })
        expect(posted).toHaveLength(1)
    })
    it.each([true, false])('bounds prior marker status headers=%s and discards late missing', async headers => {
        const ledger = await import('./bgServerInputLedger')
        ledger.writeServerInputMarker(localStorage, { operationId: BOOT_OPERATION_ID, charId: CHAR_ID,
            chatId: CHAT_ID, localRevision: orchestrationChatRevision(h.dbState.db.characters[0].chats[0]),
            baseRevision: 'a'.repeat(64), state: 'uncertain', createdAt: Date.now() })
        const release = holdRoute('status', headers)
        let result: any
        const pending = submit().then(value => { result = value })
        await vi.advanceTimersByTimeAsync(1)
        expect(h.requests.some(request => request.url.includes('orchestrate-status/'))).toBe(true)
        await vi.advanceTimersByTimeAsync(30_001)
        expect(result).toEqual({ kind: 'blocked', reason: 'prior-operation-unavailable' })
        expect(h.requests.find(request => request.url.includes('orchestrate-status/'))?.signal?.aborted).toBe(true)
        await pending
        release(headers ? { status: 404, body: { operationId: BOOT_OPERATION_ID, state: 'missing' } }
            : { operationId: BOOT_OPERATION_ID, state: 'missing' })
        await vi.advanceTimersByTimeAsync(1)
        expect(ledger.readServerInputMarkers(localStorage)).toHaveLength(1)
        expect(posted).toHaveLength(0)
    })
    it.each([true, false])('prepared Stop releases actual native owner during headers=%s', async headers => {
        const release = holdRoute('capability', headers)
        const module = await import('./bgOrchestrate')
        const native = await import('./process/generationState')
        const { get } = await import('svelte/store')
        const controller = new AbortController()
        native.registerAbort(CHAT_ID, controller)
        let result: any
        const pending = module.runServerOrchestratedChat(-1, { signal: controller.signal }).then(value => { result = value })
        await vi.advanceTimersByTimeAsync(1)
        expect(get(native.doingChat)).toBe(true)
        expect(native.abortGeneration(CHAT_ID)).toBe(true)
        await vi.advanceTimersByTimeAsync(1)
        expect(result).toEqual({ handled: true, result: false })
        expect(get(native.doingChat)).toBe(false)
        expect(posted).toHaveLength(0)
        expect(h.requests.find(request => request.url.endsWith('capabilities'))?.signal?.aborted).toBe(true)
        await pending
        expect(h.alerts).toEqual([])
        // A new owner must survive the old transport's late completion.
        native.startGeneration(native.chatGenKey(CHAT_ID), 'new-owner')
        const stage = (await import('./process/index.svelte')).chatProcessStage
        stage.set(2)
        release(headers ? { status: 200, body: capability } : capability)
        await vi.advanceTimersByTimeAsync(1)
        expect(get(native.doingChat)).toBe(true)
        expect(get(stage)).toBe(2)
        expect(posted).toHaveLength(0)
    })
    it.each(['timeout', '500', '404', 'malformed'] as const)('prepared %s preserves legacy start payload', async mode => {
        const release = mode === 'timeout' ? holdRoute('capability') : null
        if (mode !== 'timeout') {
            const route = h.route
            h.route = async (m, u, b) => u.endsWith('capabilities') ? { status: mode === 'malformed' ? 200 : Number(mode),
                body: null, jsonError: mode === 'malformed' } as any : route(m, u, b)
        }
        const module = await import('./bgOrchestrate')
        let result: any
        const pending = module.runServerOrchestratedChat(-1, {}).then(value => { result = value })
        await vi.advanceTimersByTimeAsync(30_001)
        expect(result).toEqual({ handled: true })
        await pending
        await vi.advanceTimersByTimeAsync(1)
        expect(posted).toHaveLength(1)
        expect(posted[0]).not.toHaveProperty('serverChatCommitVersion')
        const { operationId, ...payload } = posted[0]
        expect(operationId).toBeTypeOf('string')
        const currentChat = JSON.parse(JSON.stringify(h.dbState.db.characters[0].chats[0]))
        expect(payload).toEqual({ selectedCharId: CHAR_ID, selectedChatId: CHAT_ID, chatProcessIndex: -1,
            currentChat, currentGlobalChatVariables: {}, globalVariablesVersion: 1, detached: true,
            baseChatRevision: orchestrationChatRevision(currentChat), resultOrderVersion: 1,
            startAckVersion: 1, resultKeyVersion: 1 })
        release?.(capability)
        await vi.advanceTimersByTimeAsync(1)
        expect(posted).toHaveLength(1)
    })
    it('prepared normal negotiation includes v1 exactly once', async () => {
        const module = await import('./bgOrchestrate')
        expect(await module.runServerOrchestratedChat(-1, {})).toEqual({ handled: true })
        await vi.advanceTimersByTimeAsync(1)
        expect(posted).toHaveLength(1)
        expect(posted[0].serverChatCommitVersion).toBe(1)
    })
    it('reconciles a lost start body without replaying the provider admission', async () => {
        const route = h.route
        h.route = async (m, u, b) => {
            const response = await route(m, u, b)
            return u === '/api/bg-orchestrate' && m === 'POST'
                ? { ...response, jsonError: true } as any : response
        }
        let result: any
        const pending = submit().then(value => { result = value })
        await vi.advanceTimersByTimeAsync(1500)
        await pending
        expect(result.kind).toBe('accepted')
        expect(posted).toHaveLength(1)
        expect(result.operationId).toBe(posted[0].operationId)
    })
    it('prepared header timeout preserves legacy negotiation', async () => {
        const release = holdRoute('capability', true)
        const module = await import('./bgOrchestrate')
        let result: any
        const pending = module.runServerOrchestratedChat(-1, {}).then(value => { result = value })
        await vi.advanceTimersByTimeAsync(1)
        await vi.advanceTimersByTimeAsync(15_001)
        expect(result).toEqual({ handled: true })
        await pending
        expect(posted).toHaveLength(1)
        expect(posted[0]).not.toHaveProperty('serverChatCommitVersion')
        release({ status: 200, body: capability })
        await vi.advanceTimersByTimeAsync(1)
        expect(posted).toHaveLength(1)
    })
    it('already aborted preparation never negotiates or starts', async () => {
        const module = await import('./bgOrchestrate')
        const controller = new AbortController()
        controller.abort()
        expect(await module.runServerOrchestratedChat(-1, { signal: controller.signal }))
            .toEqual({ handled: true, result: false })
        expect(h.requests).toEqual([])
        expect(posted).toHaveLength(0)
        expect(h.alerts).toEqual([])
    })
    it('timely exact missing clears an uncertain prior marker and permits a new input', async () => {
        const ledger = await import('./bgServerInputLedger')
        ledger.writeServerInputMarker(localStorage, { operationId: BOOT_OPERATION_ID, charId: CHAR_ID,
            chatId: CHAT_ID, localRevision: orchestrationChatRevision(h.dbState.db.characters[0].chats[0]),
            baseRevision: 'a'.repeat(64), state: 'uncertain', createdAt: Date.now() })
        const route = h.route
        h.route = async (m, u, b) => u.includes(BOOT_OPERATION_ID) && u.includes('orchestrate-status/')
            ? { status: 404, body: { operationId: BOOT_OPERATION_ID, state: 'missing' } } : route(m, u, b)
        expect(await submit()).toMatchObject({ kind: 'accepted' })
        expect(ledger.readServerInputMarkers(localStorage).some(marker => marker.operationId === BOOT_OPERATION_ID)).toBe(false)
        expect(posted).toHaveLength(1)
    })
    it('missing binary revision fails closed without changing base policy', async () => {
        const route = h.route
        h.route = async (m, u, b) => {
            const response = await route(m, u, b)
            return u.includes('input-base/') ? { ...response, headers: {} } as any : response
        }
        expect(await submit()).toEqual({ kind: 'blocked', reason: 'server-chat-unavailable' })
        expect(posted).toHaveLength(0)
    })
    it('lost attach body retains the exact input without admission replay', async () => {
        const route = h.route
        let release!: (value: any) => void
        h.route = async (m, u, b) => u.endsWith('bg-orchestrate-input/attach')
            ? { status: 200, body: new Promise(resolve => { release = resolve }) } : route(m, u, b)
        const ledger = await import('./bgServerInputLedger')
        const chat = h.dbState.db.characters[0].chats[0]
        ledger.writeServerInputMarker(localStorage, { operationId: BOOT_OPERATION_ID, charId: CHAR_ID,
            chatId: CHAT_ID, localRevision: orchestrationChatRevision(chat), baseRevision: 'a'.repeat(64),
            state: 'accepted', createdAt: Date.now() })
        const module = await import('./bgOrchestrate')
        const recovery: any = { operationId: BOOT_OPERATION_ID, charId: CHAR_ID, chatId: CHAT_ID, token: 'synthetic-claim' }
        const pending = module.attachClientInputRecovery(recovery, chat, {}).then(
            () => null, error => error,
        )
        await vi.advanceTimersByTimeAsync(1)
        expect(release).toBeTypeOf('function')
        // Attach ambiguity must not turn into a new admission or discard the raw input.
        await vi.advanceTimersByTimeAsync(30_001)
        const error = await pending
        expect(error).toBeInstanceOf(Error)
        expect(error.message).toContain('이미 서버에서 생성 중일 수 있으니')
        expect(ledger.readServerInputMarkers(localStorage)).toHaveLength(1)
        expect(posted).toHaveLength(0)
        release({ status: 'attached', operationId: BOOT_OPERATION_ID })
        await vi.advanceTimersByTimeAsync(1)
        expect(posted).toHaveLength(0)
    })
    it('attach and pending refresh converge through actual native adoption', async () => {
        const { NodeStorage } = await import('./storage/nodeStorage')
        const nativeAdoption = await vi.importActual<typeof import('./storage/chatStorage')>('./storage/chatStorage')
        const storage = new NodeStorage({ invalidate: vi.fn() } as any)
        h.forage.realStorage = storage
        h.adopt = vi.fn(nativeAdoption.adoptServerCommittedChat)
        const local = h.dbState.db.characters[0].chats[0]
        Object.assign(local, { note: '', localLore: [], isStreaming: false })
        const snapshots: Array<(value: any) => void> = []
        const peek = vi.spyOn(storage, 'peekChatContentSnapshot').mockImplementation(() => new Promise(resolve => snapshots.push(resolve)))
        const canonical = structuredClone(local)
        canonical.message.push({ role: 'char', data: 'synthetic paid result', chatId: 'paid-result' })
        const ledger = await import('./bgServerInputLedger')
        ledger.writeServerInputMarker(localStorage, { operationId: BOOT_OPERATION_ID, charId: CHAR_ID,
            chatId: CHAT_ID, localRevision: orchestrationChatRevision(local), baseRevision: 'a'.repeat(64),
            state: 'accepted', createdAt: Date.now() })
        const route = h.route
        h.route = async (m, u, b) => {
            if (u.endsWith('bg-orchestrate-input/attach')) return { status: 200, body: { status: 'attached', operationId: BOOT_OPERATION_ID } }
            if (isResultPeek(m, u)) return { status: 200, body: { ...committedResult(BOOT_OPERATION_ID), chat: canonical } }
            if (u.includes('orchestrate-chat-state/')) return { status: 200, body: projection(BOOT_OPERATION_ID) }
            if (isResultAck(m, u)) return { status: 200, body: { acked: true } }
            return route(m, u, b)
        }
        const module = await import('./bgOrchestrate')
        const attached = module.attachClientInputRecovery({ operationId: BOOT_OPERATION_ID, charId: CHAR_ID,
            chatId: CHAT_ID, token: 'synthetic-claim' } as any, local, {})
        const refresh = module.reconcileServerPendingInputCommands(CHAR_ID, CHAT_ID, local)
        await vi.advanceTimersByTimeAsync(1)
        expect(snapshots).toHaveLength(2)
        // A refused late adoption may reobserve current canonical evidence. Do
        // not leave those subsequent transport reads permanently unresolved.
        peek.mockResolvedValue({ chat: canonical, revision: 'server-revision', encodedBytes: 300 })
        snapshots[0]({ chat: canonical, revision: 'server-revision', encodedBytes: 300 })
        snapshots[1]({ chat: canonical, revision: 'server-revision', encodedBytes: 300 })
        // Native adoption yields for paint with an existing 50ms fallback. A
        // fake clock must drive it before awaiting publication/slot rechecks.
        await vi.advanceTimersByTimeAsync(51)
        await Promise.all([attached, refresh])
        const current = h.dbState.db.characters[0].chats[0]
        expect(current.message.filter((message: any) => message.chatId === 'paid-result')).toHaveLength(1)
        expect(ledger.readServerInputMarkers(localStorage)).toEqual([])
        expect(h.sendChat).not.toHaveBeenCalled()
        expect(h.durableScopes).toEqual([])
        expect(h.sounds).toBe(0)
        // The UI's next observation is a no-op after both exact callbacks settle.
        await module.reconcileServerPendingInputCommands(CHAR_ID, CHAT_ID, current)
        expect(current.message.filter((message: any) => message.chatId === 'paid-result')).toHaveLength(1)
    })
    it('old classic probe cleanup preserves an accepted raw marker and current paid view', async () => {
        const local = h.dbState.db.characters[0].chats[0]
        local.message.push({ role: 'char', data: 'previous paid result', chatId: 'old-paid-result' })
        const { encodeRisuSaveLegacy } = await import('./storage/risuSave')
        const bytes = encodeRisuSaveLegacy(local)
        baseBytes = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
        h.adopt = vi.fn(async () => ({ adopted: true, chat: local }))
        let release!: (value: any) => void
        const route = h.route
        h.route = async (m, u, b) => {
            if (isResultPeek(m, u) && u.includes(BOOT_OPERATION_ID)) return new Promise(resolve => { release = resolve })
            if (u.includes('orchestrate-chat-state/')) return { status: 200,
                body: { ...projection(BOOT_OPERATION_ID), chatRevision: 'a'.repeat(64) } }
            if (isResultAck(m, u)) return { status: 200, body: { acked: true } }
            return route(m, u, b)
        }
        writeStoredPendingMarker(localStorage, { charId: CHAR_ID, chatId: CHAT_ID, baselineMsgs: 2,
            operationId: BOOT_OPERATION_ID, resultKeyVersion: 1, deliveryVersion: 3, staticsMessagesApplied: 0,
            expectedChatRevision: orchestrationChatRevision(local), recoveryOutcome: 'unverified-parked', ts: Date.now() })
        window.dispatchEvent(new Event('bg-recovery-evidence'))
        await vi.advanceTimersByTimeAsync(501)
        expect(release).toBeTypeOf('function')
        // Canonical paid content is already current; this is a valid raw base,
        // rather than pretending a stale pre-answer view can be admitted.
        const outcome = await submit()
        expect(outcome).toMatchObject({ kind: 'accepted' })
        release({ status: 200, body: { ...committedResult(BOOT_OPERATION_ID), chat: local } })
        await vi.advanceTimersByTimeAsync(1)
        const rawMarkers = (await import('./bgServerInputLedger')).readServerInputMarkers(localStorage)
        expect(rawMarkers).toHaveLength(1)
        expect(rawMarkers[0].operationId).toBe((outcome as any).operationId)
        expect(local.message.some((message: any) => message.chatId === 'old-paid-result')).toBe(true)
        expect(h.sendChat).not.toHaveBeenCalled()
        expect(posted).toHaveLength(1)
    })
    it('preserves ordinary plugin exclusion and explicit client recovery qualification', async () => {
        h.dbState.db.aiModel = 'pluginmodel:::synthetic'
        expect(await submit()).toEqual({ kind: 'unsupported' })
        expect(h.jsonReads).toEqual([])
        expect(await (await import('./bgOrchestrate')).tryRunServerOwnedInput(0, 'synthetic recovery',
            'draft-client-001', undefined, 'client')).toMatchObject({ kind: 'accepted' })
        expect(posted[0].inputCommand.inputPreparation).toBe('client')
    })
})
