// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    readPendingMarkers,
    writePendingMarker as writeStoredPendingMarker,
} from './bgOrchestrationPending'
import { orchestrationChatRevision } from './bgOrchestrationMerge'
const CONFLICT_NOTICE = '서버에 저장된 답변과 현재 편집 내용을 함께 확인해야 해요. 현재 내용과 서버 결과를 보존하고 복구를 보류했어요.'

// Drives the generated bgOrchestrate.ts boot recovery and foreground watch against a scripted
// server. Only storage, UI and generation-lease leaves are replaced; the orchestration control
// flow, delivery classification and pending-marker ledger are the production modules.
const h = vi.hoisted(() => ({
    dbState: { db: {} as any },
    alerts: [] as string[],
    warnings: [] as string[],
    infos: [] as string[],
    warningFailure: false,
    durableScopes: [] as any[],
    scopesAtStart: [] as any[],
    requests: [] as Array<{ method: string, url: string }>,
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
}))

vi.mock('./stores.svelte', async () => {
    const { writable } = await import('svelte/store')
    return { DBState: h.dbState, selectedCharID: writable(0), ReloadChatPointer: writable(0) }
})
vi.mock('./globalApi.svelte', () => ({ requestDurableSave: async (scope: any) => {
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
vi.mock('./process/generationState', () => ({
    chatGenKey: (chatId: string) => `chat:${chatId}`,
    endGenerationIfOwned: () => true,
    startGeneration: () => {},
}))
vi.mock('./status/requestStatus', () => ({
    ingestRelayedStatuses: () => {},
    clearRelayedStatuses: () => {},
}))
vi.mock('./storage/clientBuildHandshake', () => ({
    clientBuildFetch: (url: string, init?: RequestInit) => scriptedFetch(url, init),
}))

async function scriptedFetch(url: string, init: RequestInit = {}) {
    const method = init.method || 'GET'
    h.requests.push({ method, url })
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : null
    const response = await h.route(method, url, body)
    return {
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        json: async () => response.body,
    }
}

const CHAR_ID = 'char-1'
const CHAT_ID = 'chat-1'
const BOOT_OPERATION_ID = 'operation-finished-1'
const RESULT_ID = 'result-finished-1'
const FAILURE_NOTICE = '백그라운드 생성이 답변 없이 끝났어요 (The operation was aborted due to timeout). 해당 채팅에서 다시 보내주세요.'
const RETAIN_NOTICE = '서버 소유 답변의 채팅 저장을 확인하지 못했어요. 결과와 작업 표식을 보존하고 다음 실행에서 다시 확인해요.'

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

function terminalError(operationId: string, overrides: Record<string, unknown> = {}) {
    return {
        found: true, operationId, resultId: RESULT_ID, publishSeq: 2,
        kind: 'terminal-error', outcome: 'error', final: true, chat: null,
        error: 'The operation was aborted due to timeout',
        staticsMessagesDelta: 0, globalChatVariables: {},
        serverChatCommitVersion: 1, serverChatCommit: null,
        ...overrides,
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

function committedWithoutRow(operationId: string) {
    return {
        found: false, stage: 0, operationState: 'chat-committed',
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
const count = (predicate: (method: string, url: string) => boolean) => (
    h.requests.filter(request => predicate(request.method, request.url)).length
)
const markers = () => readPendingMarkers(localStorage)

type Handler = (operationId: string, method: string, url: string) => { status: number, body: unknown } | undefined

function serve(handler: Handler, options: { serverChatCommit?: boolean } = {}) {
    let foregroundOperationId = BOOT_OPERATION_ID
    h.route = async (method, url, body) => {
        if (method === 'GET' && url === '/api/bg-orchestrate-capabilities') {
            return options.serverChatCommit === false
                ? { status: 404, body: null }
                : {
                    status: 200,
                    body: {
                        contract: 'bg_orchestration_capabilities.v1',
                        serverChatCommitVersion: 1,
                        chatExecutionProjectionVersion: 1,
                    },
                }
        }
        if (method === 'POST' && url === '/api/bg-orchestrate') {
            h.scopesAtStart = structuredClone(h.durableScopes)
            foregroundOperationId = body.operationId
            return { status: 200, body: { started: true, resultKeyVersion: 1 } }
        }
        return handler(foregroundOperationId, method, url) || { status: 404, body: null }
    }
}

const listeners: Array<[EventTarget, string, EventListenerOrEventListenerObject, any]> = []
beforeEach(async () => {
    vi.useFakeTimers()
    vi.resetModules()
    // Mock factories can survive resetModules; read the same current real busy
    // coordinator as bgOrchestrate, rather than retaining a prior test's store.
    h.doingChat = (await import('./generationBusy')).doingChat
    for (const target of [window, document]) {
        const add = target.addEventListener.bind(target)
        vi.spyOn(target, 'addEventListener').mockImplementation((type: string, listener: any, options: any) => {
            if (listener) listeners.push([target, type, listener, options])
            add(type, listener, options)
        })
    }
    localStorage.clear()
    h.dbState.db = { characters: [{ chaId: CHAR_ID, chatPage: 0, chats: [chatWith(2)] }], statics: {} }
    h.alerts = []
    h.warnings = []
    h.infos = []
    h.warningFailure = false
    h.durableScopes = []
    h.scopesAtStart = []
    h.requests = []
    h.adopt = vi.fn(async () => ({ adopted: false, reason: 'local-revision-conflict' }))
    h.sendChat = vi.fn(async () => true)
    h.sounds = 0
    h.holdSave = false
    h.failSave = false
    h.emitSaveEvidence = false
    h.releaseSave = null
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => scriptedFetch(url, init))
})

afterEach(() => {
    for (const [target, type, listener, options] of listeners.splice(0)) target.removeEventListener(type, listener, options)
    vi.restoreAllMocks()
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

async function bootWithMarker() {
    writeStoredPendingMarker(localStorage, {
        charId: CHAR_ID, chatId: CHAT_ID, baselineMsgs: 2, operationId: BOOT_OPERATION_ID,
        deliveryVersion: 3, resultKeyVersion: 1, staticsMessagesApplied: 0,
        deliveryChatId: CHAT_ID,
        expectedChatRevision: orchestrationChatRevision(h.dbState.db.characters[0].chats[0]),
        completionNotified: false, ts: Date.now(),
    })
    const module = await import('./bgOrchestrate')
    await vi.advanceTimersByTimeAsync(600)
    return module
}

async function startForeground() {
    const module = await import('./bgOrchestrate')
    const outcome = await module.runServerOrchestratedChat(0, {})
    expect(outcome.handled).toBe(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(markers()).toHaveLength(1)
    return module
}

describe('terminal recovery without temporary timing instrumentation', () => {

describe('G1.12a terminal decisions', () => {
    it('closes a warm legacy ACK-body-loss from exact delivered state without repeating the save', async () => {
        h.dbState.db.statics.messages = 0
        h.dbState.db.playMessage = true
        let removed = false
        serve((operationId, method, url) => {
            if (isResultPeek(method, url)) return { status: 200, body: removed
                ? { found: false, operationId, operationState: 'delivered', stage: 0 }
                : { ...committedResult(operationId), serverChatCommit: undefined, serverChatCommitVersion: undefined } }
            if (isResultAck(method, url)) { removed = true; return { status: 200, body: new Promise(() => {}) } }
        })
        await bootWithMarker()
        await vi.advanceTimersByTimeAsync(30_001)
        expect(h.durableScopes).toHaveLength(1)
        expect(h.sounds).toBe(1)
        expect(markers()).toHaveLength(1)
        window.dispatchEvent(new Event('online'))
        await vi.advanceTimersByTimeAsync(600)
        expect(markers()).toEqual([])
        expect(count(isResultAck)).toBe(1)
        expect(h.durableScopes).toHaveLength(1)
        expect(h.sounds).toBe(1)
        expect(h.infos).toEqual([])
    })

    it('wakes parked raw-input reconciliation through its own ledger', async () => {
        const ledger = await import('./bgServerInputLedger')
        ledger.writeServerInputMarker(localStorage, { operationId: BOOT_OPERATION_ID, charId: CHAR_ID, chatId: CHAT_ID,
            localRevision: orchestrationChatRevision(chatWith(2)), baseRevision: 'a'.repeat(64),
            state: 'accepted', createdAt: Date.now() })
        serve((operationId, method, url) => {
            if (isResultPeek(method, url)) return { status: 200, body: committedResult(operationId) }
            if (url.startsWith('/api/bg-orchestrate-chat-state/')) return { status: 200, body: projection(operationId) }
            if (isResultAck(method, url)) return { status: 200, body: { acked: true } }
        })
        const module = await import('./bgOrchestrate')
        await module.reconcileServerPendingInputCommands(CHAR_ID, CHAT_ID, chatWith(2))
        await module.reconcileServerPendingInputCommands(CHAR_ID, CHAT_ID, chatWith(2))
        expect(h.adopt).toHaveBeenCalledTimes(1)
        h.adopt.mockImplementation(async (chats: any[]) => {
            chats[0] = chatWith(3)
            return { adopted: true, chat: chats[0] }
        })
        window.dispatchEvent(new Event('online'))
        await vi.advanceTimersByTimeAsync(1)
        await module.reconcileServerPendingInputCommands(CHAR_ID, CHAT_ID, chatWith(2))
        expect(h.adopt).toHaveBeenCalledTimes(2)
        expect(count(isResultAck)).toBe(1)
        expect(ledger.readServerInputMarkers(localStorage)).toEqual([])
        expect(h.infos).toEqual([CONFLICT_NOTICE])
    })

    it('does not let a legacy recovery save wake itself repeatedly when ACK fails', async () => {
        h.dbState.db.statics.messages = 0
        h.emitSaveEvidence = true
        serve((operationId, method, url) => {
            if (isResultPeek(method, url)) return { status: 200, body: {
                ...committedResult(operationId), serverChatCommit: undefined, serverChatCommitVersion: undefined,
            } }
            if (isResultAck(method, url)) return { status: 503, body: {} }
        })
        await bootWithMarker()
        await vi.advanceTimersByTimeAsync(30_000)
        expect(count(isResultPeek)).toBe(1)
        expect(count(isResultAck)).toBe(1)
        expect(h.durableScopes).toHaveLength(1)
        window.dispatchEvent(new Event('online'))
        await vi.advanceTimersByTimeAsync(30_000)
        expect(count(isResultPeek)).toBe(2)
        expect(count(isResultAck)).toBe(2)
        expect(h.durableScopes).toHaveLength(2)
        expect(markers()).toHaveLength(1)
    })

    it('never upgrades unsaved in-memory legacy receipts to ACK proof on a warm wake', async () => {
        h.dbState.db.statics.messages = 0
        h.failSave = true
        serve((operationId, method, url) => {
            if (isResultPeek(method, url)) return { status: 200, body: {
                ...committedResult(operationId), serverChatCommit: undefined, serverChatCommitVersion: undefined,
            } }
            if (isResultAck(method, url)) return { status: 200, body: { acked: true } }
        })
        await bootWithMarker()
        vi.setSystemTime(Date.now() + 16 * 60_000)
        await vi.advanceTimersByTimeAsync(2_500)
        const saves = h.durableScopes.length
        window.dispatchEvent(new Event('online'))
        await vi.advanceTimersByTimeAsync(600)
        expect(h.durableScopes.length).toBeGreaterThan(saves)
        expect(count(isResultAck)).toBe(0)
        expect(markers()).toHaveLength(1)
        h.failSave = false
        await vi.advanceTimersByTimeAsync(2_500)
        expect(count(isResultAck)).toBe(1)
        expect(markers()).toEqual([])
    })

    it('can wake an existing marker when outcome annotation hits localStorage quota', async () => {
        let failedOnce = false
        h.adopt = vi.fn(async () => {
            if (!failedOnce) {
                failedOnce = true
                const storage = localStorage
                vi.stubGlobal('localStorage', {
                    get length() { return storage.length },
                    key: (index: number) => storage.key(index),
                    getItem: (key: string) => storage.getItem(key),
                    removeItem: (key: string) => storage.removeItem(key),
                    setItem: () => { throw new Error('synthetic quota') },
                })
                return { adopted: false, reason: 'local-revision-conflict' }
            }
            return { adopted: true, chat: chatWith(3) }
        })
        serve((operationId, method, url) => {
            if (isResultPeek(method, url)) return { status: 200, body: committedResult(operationId) }
            if (url.startsWith('/api/bg-orchestrate-chat-state/')) return { status: 200, body: projection(operationId) }
            if (isResultAck(method, url)) return { status: 200, body: { acked: true } }
        })
        await bootWithMarker()
        expect(markers()).toHaveLength(1)
        expect(markers()[0].recoveryOutcome).toBeUndefined()
        const characters = h.dbState.db.characters
        h.dbState.db.characters = []
        window.dispatchEvent(new Event('online'))
        await vi.advanceTimersByTimeAsync(1)
        expect(h.adopt).toHaveBeenCalledTimes(1)
        h.dbState.db.characters = characters
        window.dispatchEvent(new Event('online'))
        await vi.advanceTimersByTimeAsync(600)
        expect(h.adopt).toHaveBeenCalledTimes(2)
        expect(markers()).toEqual([])
        expect(h.infos).toEqual([CONFLICT_NOTICE])
    })

    it('does not repeat a legacy no-answer cleanup warning on event wake', async () => {
        serve((operationId, method, url) => {
            if (isResultPeek(method, url)) return { status: 200, body: terminalError(operationId, {
                serverChatCommitVersion: undefined, serverChatCommit: undefined,
            }) }
            if (isResultAck(method, url)) return { status: 503, body: {} }
        })
        await bootWithMarker()
        const notice = '백그라운드 생성은 답변 없이 끝났고 서버 정리 확인이 지연됐어요. 다음 실행 때 재확인해요.'
        expect(h.alerts).toEqual([notice])
        window.dispatchEvent(new Event('online'))
        await vi.advanceTimersByTimeAsync(600)
        expect(count(isResultAck)).toBe(2)
        expect(h.alerts).toEqual([notice])
        expect(markers()).toHaveLength(1)
    })

    it('does not advance a raw-input marker after its character was replaced during projection', async () => {
        const ledger = await import('./bgServerInputLedger')
        ledger.writeServerInputMarker(localStorage, { operationId: BOOT_OPERATION_ID, charId: CHAR_ID, chatId: CHAT_ID,
            localRevision: orchestrationChatRevision(chatWith(2)), baseRevision: 'a'.repeat(64),
            state: 'accepted', createdAt: Date.now() })
        const before = ledger.readServerInputMarkers(localStorage)
        let reads = 0
        serve((operationId, method, url) => {
            if (isResultPeek(method, url)) return { status: 200, body: committedResult(operationId) }
            if (url.startsWith('/api/bg-orchestrate-chat-state/')) {
                if (++reads === 2) h.dbState.db.characters[0] = structuredClone(h.dbState.db.characters[0])
                return { status: 200, body: projection(operationId) }
            }
        })
        const module = await import('./bgOrchestrate')
        await module.reconcileServerPendingInputCommands(CHAR_ID, CHAT_ID, chatWith(2))
        expect(reads).toBe(2)
        expect(ledger.readServerInputMarkers(localStorage)).toEqual(before)
        expect(h.adopt).not.toHaveBeenCalled()
        expect(count(isResultAck)).toBe(0)
    })

    it.each(['boot', 'watch'] as const)('does not close an active intermediate result carrying a receipt (%s)', async mode => {
        serve((operationId, method, url) => {
            if (isResultPeek(method, url)) return { status: 200, body: {
                ...committedResult(operationId), kind: 'intermediate', final: false,
                operationState: 'running-result-ready', stage: 3,
            } }
        })
        if (mode === 'boot') await bootWithMarker()
        else { await startForeground(); await vi.advanceTimersByTimeAsync(2_500) }
        const { get } = await import('svelte/store')
        const { chatProcessStage } = await import('./process/index.svelte')
        expect(get(h.doingChat)).toBe(true)
        expect(get(chatProcessStage)).toBe(3)
        expect(h.adopt).not.toHaveBeenCalled()
        expect(count(isResultAck)).toBe(0)
        expect(markers()).toHaveLength(1)
    })

    it('merges a deferred wake without discarding untouched cold-boot markers', async () => {
        const others = ['operation-second-2', 'operation-third-3']
        for (const operationId of others) writeStoredPendingMarker(localStorage, {
            charId: CHAR_ID, chatId: CHAT_ID, baselineMsgs: 2, operationId,
            deliveryVersion: 3, resultKeyVersion: 1, staticsMessagesApplied: 0,
            expectedChatRevision: orchestrationChatRevision(chatWith(2)), ts: Date.now(),
        })
        let current = '', sentEvidence = false
        serve((_operationId, method, url) => {
            if (isResultPeek(method, url)) {
                current = url.split('/')[3].split('?')[0]
                return { status: 200, body: committedResult(current) }
            }
            if (url.startsWith('/api/bg-orchestrate-chat-state/')) return { status: 200, body: projection(current) }
            if (isResultAck(method, url)) return { status: 200, body: { acked: true } }
        })
        h.adopt = vi.fn(async () => {
            if (current === BOOT_OPERATION_ID) {
                if (!sentEvidence) { sentEvidence = true; window.dispatchEvent(new Event('bg-recovery-evidence')) }
                return { adopted: false, reason: 'local-revision-conflict' }
            }
            return { adopted: true, chat: chatWith(3) }
        })
        await bootWithMarker()
        await vi.advanceTimersByTimeAsync(2_000)
        for (const operationId of others) expect(h.requests.some(r => isResultPeek(r.method, r.url) && r.url.includes(operationId))).toBe(true)
        expect(count(isResultAck)).toBe(2)
        expect(markers().map(marker => marker.operationId)).toEqual([BOOT_OPERATION_ID])
        expect(h.infos).toEqual([CONFLICT_NOTICE])
    })

    it.each(['boot', 'watch'] as const)('parks a repeatedly fast-failing legacy save after the recovery budget (%s)', async mode => {
        h.dbState.db.statics.messages = 0
        serve((operationId, method, url) => {
            if (isResultPeek(method, url)) return { status: 200, body: {
                ...committedResult(operationId), serverChatCommit: undefined, serverChatCommitVersion: undefined,
            } }
        })
        if (mode === 'boot') { h.failSave = true; await bootWithMarker() }
        else { await startForeground(); h.failSave = true; await vi.advanceTimersByTimeAsync(2_500) }
        vi.setSystemTime(Date.now() + 16 * 60_000)
        await vi.advanceTimersByTimeAsync(2_500)
        const seen = count(isResultPeek)
        expect(count(isResultAck)).toBe(0)
        expect(markers()).toHaveLength(1)
        expect(h.infos).toHaveLength(1)
        await vi.advanceTimersByTimeAsync(10_000)
        expect(count(isResultPeek)).toBe(seen)
        const { get } = await import('svelte/store')
        expect(get(h.doingChat)).toBe(false)
    })

    it.each(['boot', 'watch'] as const)('parks unconfirmed HTTP409 ownership after a resumed deadline (%s)', async mode => {
        serve((_operationId, method, url) => {
            if (isResultPeek(method, url)) return { status: 409, body: { reason: 'claimed' } }
        })
        if (mode === 'boot') await bootWithMarker()
        else await startForeground()
        vi.setSystemTime(Date.now() + 16 * 60_000)
        await vi.advanceTimersByTimeAsync(2_500)
        const seen = count(isResultPeek)
        expect(seen).toBeGreaterThan(0)
        expect(markers()).toEqual([expect.objectContaining({ recoveryOutcome: 'unverified-parked' })])
        expect(count(isResultAck)).toBe(0)
        expect(h.alerts).toEqual([])
        await vi.advanceTimersByTimeAsync(10_000)
        expect(count(isResultPeek)).toBe(seen)
        const { get } = await import('svelte/store')
        expect(get(h.doingChat)).toBe(false)
    })

    it('does not repeat a terminal failure notice while its ACK remains unavailable', async () => {
        serve((operationId, method, url) => {
            if (isResultPeek(method, url)) return { status: 200, body: terminalError(operationId) }
            if (isResultAck(method, url)) throw new TypeError('offline')
        })
        await bootWithMarker()
        expect(h.alerts).toEqual([FAILURE_NOTICE])
        window.dispatchEvent(new Event('online'))
        await vi.advanceTimersByTimeAsync(600)
        expect(count(isResultAck)).toBe(2)
        expect(h.alerts).toEqual([FAILURE_NOTICE])
        expect(markers()).toHaveLength(1)
    })

    it.each(['committed', 'unreachable'] as const)('queries after a long boot-recovery suspension (%s)', async state => {
        let resumed = false
        h.adopt.mockResolvedValue({ adopted: true, chat: chatWith(3) })
        serve((operationId, method, url) => {
            if (isResultPeek(method, url)) {
                if (resumed && state === 'unreachable') throw new TypeError('offline')
                return { status: 200, body: resumed ? committedResult(operationId)
                    : { found: false, stage: 1, operationState: 'running' } }
            }
            if (url.startsWith('/api/bg-orchestrate-chat-state/')) return { status: 200, body: projection(operationId) }
            if (isResultAck(method, url)) return { status: 200, body: { acked: true } }
        })
        await bootWithMarker()
        expect(count(isResultPeek)).toBe(1)
        resumed = true
        vi.setSystemTime(Date.now() + 16 * 60_000)
        await vi.advanceTimersByTimeAsync(2_500)
        expect(count(isResultPeek)).toBe(2)
        expect(h.alerts).toEqual([])
        expect(markers()).toHaveLength(state === 'committed' ? 0 : 1)
        const { get } = await import('svelte/store')
        expect(get(h.doingChat)).toBe(false)
        expect(h.infos).toHaveLength(state === 'unreachable' ? 1 : 0)
    })

    it('retains the legacy-save safety net and suppresses late ACK after release', async () => {
        h.dbState.db.statics.messages = 0
        serve((operationId, method, url) => {
            if (isResultPeek(method, url)) return { status: 200, body: {
                ...committedResult(operationId), serverChatCommit: undefined, serverChatCommitVersion: undefined,
            } }
            if (isResultAck(method, url)) return { status: 200, body: { acked: true } }
        })
        await startForeground()
        vi.setSystemTime(Date.now() + 16 * 60_000)
        h.holdSave = true
        await vi.advanceTimersByTimeAsync(2_500)
        expect(h.releaseSave).toBeTypeOf('function')
        expect(h.infos).toEqual([])
        await vi.advanceTimersByTimeAsync(15 * 60_000)
        expect(markers()).toHaveLength(1)
        expect(count(isResultAck)).toBe(0)
        expect(h.alerts).toEqual([])
        expect(h.infos).toHaveLength(1)
        const { get } = await import('svelte/store')
        expect(get(h.doingChat)).toBe(false)
        h.releaseSave!()
        await vi.advanceTimersByTimeAsync(1)
        expect(count(isResultAck)).toBe(0)
        expect(markers()).toHaveLength(1)
    })

    it('wakes a parked edited view on external evidence without repeating the notice', async () => {
        serve((operationId, method, url) => {
            if (isResultPeek(method, url)) return { status: 200, body: committedResult(operationId) }
            if (url.startsWith('/api/bg-orchestrate-chat-state/')) return { status: 200, body: projection(operationId) }
            if (isResultAck(method, url)) return { status: 200, body: { acked: true } }
        })
        await bootWithMarker()
        expect(markers()).toHaveLength(1)
        expect(h.infos).toEqual([CONFLICT_NOTICE])
        await vi.advanceTimersByTimeAsync(30_000)
        expect(count(isResultPeek)).toBe(1)
        h.adopt.mockResolvedValue({ adopted: true, chat: chatWith(3) })
        window.dispatchEvent(new Event('bg-recovery-evidence'))
        await vi.advanceTimersByTimeAsync(600)
        expect(count(isResultPeek)).toBe(2)
        expect(count(isResultAck)).toBe(1)
        expect(markers()).toEqual([])
        expect(h.infos).toEqual([CONFLICT_NOTICE])
    })

    it('revalidates after a lost ACK body without replaying completion', async () => {
        h.dbState.db.playMessage = true
        let removed = false
        h.adopt.mockResolvedValue({ adopted: true, chat: chatWith(3) })
        serve((operationId, method, url) => {
            if (isResultPeek(method, url)) return { status: 200, body: removed
                ? committedWithoutRow(operationId) : committedResult(operationId) }
            if (url.startsWith('/api/bg-orchestrate-chat-state/')) return { status: 200, body: projection(operationId) }
            if (isResultAck(method, url)) { removed = true; return { status: 200, body: new Promise(() => {}) } }
        })
        await startForeground()
        await vi.advanceTimersByTimeAsync(32_501)
        expect(count(isResultAck)).toBe(1)
        expect(markers()).toEqual([expect.objectContaining({ recoveryOutcome: 'ack-pending', completionNotified: true })])
        const sounds = h.sounds
        expect(sounds).toBe(1)
        window.dispatchEvent(new Event('online'))
        await vi.advanceTimersByTimeAsync(600)
        expect(h.adopt).toHaveBeenCalledTimes(2)
        expect(markers()).toEqual([])
        expect(count(isResultAck)).toBe(1)
        expect(h.sounds).toBe(sounds)
    })

    it.each(['boot', 'watch', 'input'] as const)('retires a both-source deleted target without ACK or notice (%s)', async mode => {
        serve((operationId, method, url) => {
            if (isResultPeek(method, url)) return { status: 200, body: committedResult(operationId) }
            if (url.startsWith('/api/bg-orchestrate-chat-state/')) {
                if (h.dbState.db.characters[0].chats.length) h.dbState.db.characters[0].chats = []
                return { status: 404, body: { found: false, currentRevision: null } }
            }
        })
        if (mode === 'boot') await bootWithMarker()
        else if (mode === 'watch') { await startForeground(); await vi.advanceTimersByTimeAsync(2_500) }
        else {
            const ledger = await import('./bgServerInputLedger')
            ledger.writeServerInputMarker(localStorage, { operationId: BOOT_OPERATION_ID, charId: CHAR_ID, chatId: CHAT_ID,
                localRevision: orchestrationChatRevision(chatWith(2)), baseRevision: 'a'.repeat(64),
                state: 'accepted', createdAt: Date.now() })
            const module = await import('./bgOrchestrate')
            await module.reconcileServerPendingInputCommands(CHAR_ID, CHAT_ID, chatWith(2))
            expect(ledger.readServerInputMarkers(localStorage)).toEqual([])
        }
        expect(h.adopt).not.toHaveBeenCalled()
        expect(count(isResultAck)).toBe(0)
        expect(h.alerts).toEqual([])
        expect(h.infos).toEqual([])
        expect(markers()).toEqual([])
    })

    it.each(['boot', 'watch'] as const)('does not mistake server-only absence for local deletion (%s)', async mode => {
        serve((operationId, method, url) => {
            if (isResultPeek(method, url)) return { status: 200, body: committedResult(operationId) }
            if (url.startsWith('/api/bg-orchestrate-chat-state/')) return { status: 404, body: { currentRevision: null } }
        })
        if (mode === 'boot') await bootWithMarker()
        else { await startForeground(); await vi.advanceTimersByTimeAsync(2_500) }
        expect(markers()).toHaveLength(1)
        expect(count(isResultAck)).toBe(0)
        expect(h.alerts).toEqual([])
        expect(h.infos).toEqual([])
    })

    it.each(['boot', 'watch'] as const)('retires superseded current content without ACK or completion replay (%s)', async mode => {
        h.adopt.mockResolvedValue({ adopted: true, chat: chatWith(2) })
        serve((operationId, method, url) => {
            if (isResultPeek(method, url)) return { status: 200, body: committedResult(operationId) }
            if (url.startsWith('/api/bg-orchestrate-chat-state/')) return { status: 200, body: {
                ...projection(operationId), chatRevision: 'newer', owners: [],
            } }
        })
        if (mode === 'boot') await bootWithMarker()
        else { await startForeground(); await vi.advanceTimersByTimeAsync(2_500) }
        expect(h.adopt).toHaveBeenCalledTimes(1)
        expect(h.adopt.mock.calls[0][7]).toMatchObject({ requireCurrent: true })
        expect(count(isResultAck)).toBe(0)
        expect(markers()).toEqual([])
        expect(h.infos).toEqual(['답변 저장 이후 대화가 변경됐어요. 현재 대화를 유지하고 이전 답변을 다시 덮어쓰지 않았어요.'])
        expect(h.alerts).toEqual([])
    })

    it.each(['running', 'committed', 'unreachable'] as const)('queries after a long watch suspension (%s)', async state => {
        h.adopt.mockResolvedValue({ adopted: true, chat: chatWith(3) })
        serve((operationId, method, url) => {
            if (isResultPeek(method, url)) {
                if (state === 'unreachable') throw new TypeError('offline')
                return { status: 200, body: state === 'running'
                    ? { found: false, operationState: 'running', stage: 1 }
                    : committedResult(operationId) }
            }
            if (url.startsWith('/api/bg-orchestrate-chat-state/')) return { status: 200, body: projection(operationId) }
            if (isResultAck(method, url)) return { status: 200, body: { acked: true } }
        })
        await startForeground()
        vi.setSystemTime(Date.now() + 16 * 60_000)
        await vi.advanceTimersByTimeAsync(2_500)
        expect(count(isResultPeek)).toBe(1)
        expect(h.alerts).toEqual([])
        expect(h.sendChat).not.toHaveBeenCalled()
        if (state === 'committed') {
            expect(h.adopt).toHaveBeenCalledTimes(1)
            expect(markers()).toEqual([])
        } else {
            expect(markers()).toHaveLength(1)
            const { doingChat } = await import('./process/index.svelte')
            const { get } = await import('svelte/store')
            expect(get(doingChat)).toBe(state === 'running')
            expect(h.infos).toHaveLength(state === 'unreachable' ? 1 : 0)
        }
    })

    it('does not retire a deleted local target from 404 headers with an unreadable body', async () => {
        serve((operationId, method, url) => {
            if (isResultPeek(method, url)) return { status: 200, body: committedResult(operationId) }
            if (url.startsWith('/api/bg-orchestrate-chat-state/')) {
                h.dbState.db.characters[0].chats = []
                return { status: 404, body: new Promise(() => {}) }
            }
        })
        await startForeground()
        await vi.advanceTimersByTimeAsync(32_501)
        expect(markers()).toHaveLength(1)
        expect(count(isResultAck)).toBe(0)
        expect(h.alerts).toEqual([])
    })
})

describe('anchored commit notices preserve finished-operation handling', () => {
    it('flushes root settings together with the selected chat before detached admission', async () => {
        serve(() => undefined)
        await startForeground()
        expect(h.scopesAtStart).toContainEqual({ root: true, chat: [CHAR_ID, CHAT_ID] })
    })

    it.each(['boot', 'watch'])('closes a versioned no-answer result with script-added messages in %s', async mode => {
        serve((operationId, method, url) => {
            if (isResultPeek(method, url)) return { status: 200, body: terminalError(operationId, {
                anchorResultVersion: 1, hasGeneratedAnswer: false, chat: chatWith(4),
            }) }
            if (isResultAck(method, url)) return { status: 200, body: { acked: true, state: 'deleted' } }
        })
        if (mode === 'boot') await bootWithMarker()
        else { await startForeground(); await vi.advanceTimersByTimeAsync(2_500) }
        expect(count(isResultAck)).toBe(1)
        expect(markers()).toEqual([])
        expect(h.alerts).toEqual([FAILURE_NOTICE])
    })

    it('stops a deterministic identity failure without acknowledging the generated answer', async () => {
        serve((operationId, method, url) => {
            if (isResultPeek(method, url)) return { status: 200, body: terminalError(operationId, {
                kind: 'terminal-success', outcome: 'success', chat: chatWith(3),
                anchorResultVersion: 1, hasGeneratedAnswer: true,
                serverChatCommit: { status: 'failed', reason: 'generated_identity_invalid' },
            }) }
        })
        await bootWithMarker()
        expect(count(isResultAck)).toBe(0)
        expect(markers()).toEqual([])
        expect(h.alerts[0]).toContain('식별정보')
        await vi.advanceTimersByTimeAsync(30_000)
        expect(h.alerts).toHaveLength(1)
    })

    it.each([['boot', 'terminal-success'], ['watch', 'terminal-success'],
        ['boot', 'terminal-error'], ['watch', 'terminal-error']])('closes a semantic conflict once with appropriate acknowledgement in %s/%s', async (mode, kind) => {
        serve((operationId, method, url) => {
            if (isResultPeek(method, url)) return { status: 200, body: terminalError(operationId, {
                kind, outcome: kind === 'terminal-success' ? 'success' : 'error', chat: kind === 'terminal-success' ? chatWith(3) : null,
                serverChatCommit: { status: 'conflict', reason: 'input_deleted' },
            }) }
            if (isResultAck(method, url)) return { status: 200, body: { acked: true, state: 'deleted' } }
        })
        if (mode === 'boot') await bootWithMarker()
        else { await startForeground(); await vi.advanceTimersByTimeAsync(2_500) }
        expect(h.alerts).toHaveLength(1)
        expect(h.alerts[0]).toContain('입력 메시지가 삭제')
        if (kind === 'terminal-error') expect(h.alerts[0]).toContain('생성을 시작하지 않았')
        else expect(h.alerts[0]).not.toContain('생성을 시작하지 않았')
        expect(markers()).toEqual([])
        expect(count(isResultAck)).toBe(kind === 'terminal-error' ? 1 : 0)
        await vi.advanceTimersByTimeAsync(30_000)
        expect(count(isResultPeek)).toBe(1)
        expect(h.sendChat).not.toHaveBeenCalled()
    })

    it.each(['boot', 'watch'])('reports skipped script edits after successful adoption in %s', async mode => {
        h.adopt.mockResolvedValue({ adopted: true, chat: chatWith(3) })
        serve((operationId, method, url) => {
            if (isResultPeek(method, url)) {
                const data: any = committedResult(operationId)
                data.serverChatCommit.receipt.effects.chat.reason = 'concurrent-chat-edit-preserved'
                return { status: 200, body: data }
            }
            if (method === 'GET' && url.startsWith('/api/bg-orchestrate-chat-state/')) return { status: 200, body: projection(operationId) }
            if (isResultAck(method, url)) return { status: 200, body: { acked: true, state: 'deleted' } }
        })
        if (mode === 'boot') await bootWithMarker()
        else { await startForeground(); await vi.advanceTimersByTimeAsync(2_500) }
        expect(h.warnings).toHaveLength(1)
        expect(h.alerts).toEqual([])
        expect(h.warnings[0]).toContain('서버 스크립트 수정 일부는 적용하지 않았')
        expect(markers()).toEqual([])
        await vi.advanceTimersByTimeAsync(30_000)
        expect(h.warnings).toHaveLength(1)
        expect(h.alerts).toEqual([])
    })
})

describe('boot recovery of a finished failure without an answer', () => {
    it('shows one notice, acknowledges the result and clears the marker', async () => {
        serve((operationId, method, url) => {
            if (isResultPeek(method, url)) return { status: 200, body: terminalError(operationId) }
            if (isResultAck(method, url)) return { status: 200, body: { acked: true, state: 'deleted' } }
        })
        await bootWithMarker()
        expect(h.alerts).toEqual([FAILURE_NOTICE])
        expect(count(isResultAck)).toBe(1)
        expect(h.requests.find(request => isResultAck(request.method, request.url))?.url)
            .toContain(`/${BOOT_OPERATION_ID}/${RESULT_ID}?`)
        expect(markers()).toEqual([])
        await vi.advanceTimersByTimeAsync(30_000)
        expect(count(isResultPeek)).toBe(1)
        expect(h.alerts).toHaveLength(1)
    })

    it('closes an error whose chat has no message beyond the delegation baseline', async () => {
        serve((operationId, method, url) => {
            if (isResultPeek(method, url)) return { status: 200, body: terminalError(operationId, { chat: chatWith(2) }) }
            if (isResultAck(method, url)) return { status: 200, body: { acked: true, state: 'deleted' } }
        })
        await bootWithMarker()
        expect(h.alerts).toEqual([FAILURE_NOTICE])
        expect(markers()).toEqual([])
    })

    it('keeps the marker for the next launch when the acknowledgement is unconfirmed', async () => {
        serve((operationId, method, url) => {
            if (isResultPeek(method, url)) return { status: 200, body: terminalError(operationId) }
            if (isResultAck(method, url)) return { status: 503, body: { acked: false } }
        })
        await bootWithMarker()
        expect(h.alerts).toEqual([FAILURE_NOTICE])
        expect(markers().map(marker => marker.operationId)).toEqual([BOOT_OPERATION_ID])
        await vi.advanceTimersByTimeAsync(30_000)
        expect(count(isResultPeek)).toBe(1)
    })

    it('keeps polling after a superseded acknowledgement and closes on the next revision', async () => {
        let acks = 0
        serve((operationId, method, url) => {
            if (isResultPeek(method, url)) return { status: 200, body: terminalError(operationId) }
            if (isResultAck(method, url)) {
                acks += 1
                return acks === 1
                    ? { status: 409, body: { acked: false, reason: 'superseded' } }
                    : { status: 200, body: { acked: true, state: 'deleted' } }
            }
        })
        await bootWithMarker()
        expect(h.alerts).toEqual([])
        expect(markers().map(marker => marker.operationId)).toEqual([BOOT_OPERATION_ID])
        await vi.advanceTimersByTimeAsync(2_500)
        expect(count(isResultAck)).toBe(2)
        expect(h.alerts).toEqual([FAILURE_NOTICE])
        expect(markers()).toEqual([])
    })

    it('still retains an uncommitted server-owned answer', async () => {
        serve((operationId, method, url) => {
            if (isResultPeek(method, url)) return { status: 200, body: terminalError(operationId, { chat: chatWith(3) }) }
        })
        await bootWithMarker()
        expect(h.alerts).toEqual([RETAIN_NOTICE])
        expect(count(isResultAck)).toBe(0)
        expect(markers().map(marker => marker.operationId)).toEqual([BOOT_OPERATION_ID])
    })
})

describe('boot recovery of a committed result that cannot be adopted', () => {
    it.each(['boot', 'watch'])('warns once before adoption and preserves the marker on failed ACK in %s', async mode => {
        serve((operationId, method, url) => {
            if (isResultPeek(method, url)) {
                const data: any = committedResult(operationId)
                data.serverChatCommit.receipt.promptInputsChanged = true
                return { status: 200, body: data }
            }
            if (method === 'GET' && url.startsWith('/api/bg-orchestrate-chat-state/')) return { status: 200, body: projection(operationId) }
            if (isResultAck(method, url)) return { status: 503, body: {} }
        })
        if (mode === 'boot') await bootWithMarker()
        else { await startForeground(); await vi.advanceTimersByTimeAsync(2_500) }
        expect(h.warnings).toHaveLength(1)
        expect(h.warnings[0]).toContain('생성 준비가 시작된 뒤')
        expect(markers()[0].promptChangeNotified).toBe(true)
        await vi.advanceTimersByTimeAsync(15_000)
        expect(h.warnings).toHaveLength(1)
        expect(markers()).toHaveLength(1)
        expect(h.sendChat).not.toHaveBeenCalled()
    })

    it.each([undefined, false, 'true'])('does not warn for absent, false or malformed notice metadata (%s)', async flag => {
        serve((operationId, method, url) => {
            if (isResultPeek(method, url)) {
                const data: any = committedResult(operationId)
                if (flag !== undefined) data.serverChatCommit.receipt.promptInputsChanged = flag
                return { status: 200, body: data }
            }
            if (method === 'GET' && url.startsWith('/api/bg-orchestrate-chat-state/')) return { status: 200, body: projection(operationId) }
        })
        await bootWithMarker()
        expect(h.warnings).toEqual([])
    })

    it('does not block adoption and ACK when the warning UI throws', async () => {
        h.warningFailure = true
        h.adopt.mockResolvedValue({ adopted: true, chat: chatWith(3) })
        serve((operationId, method, url) => {
            if (isResultPeek(method, url)) {
                const data: any = committedResult(operationId)
                data.serverChatCommit.receipt.promptInputsChanged = true
                return { status: 200, body: data }
            }
            if (method === 'GET' && url.startsWith('/api/bg-orchestrate-chat-state/')) return { status: 200, body: projection(operationId) }
            if (isResultAck(method, url)) return { status: 200, body: { acked: true, state: 'deleted' } }
        })
        await bootWithMarker()
        expect(h.adopt).toHaveBeenCalledTimes(1)
        expect(count(isResultAck)).toBe(1)
        expect(markers()).toEqual([])
    })

    it('parks an edited view immediately without ACK or repeated unchanged polling', async () => {
        serve((operationId, method, url) => {
            if (isResultPeek(method, url)) return { status: 200, body: committedResult(operationId) }
            if (method === 'GET' && url.startsWith('/api/bg-orchestrate-chat-state/')) {
                return { status: 200, body: projection(operationId) }
            }
            if (isResultAck(method, url)) return { status: 200, body: { acked: true, state: 'deleted' } }
        })
        await bootWithMarker()
        expect(h.adopt).toHaveBeenCalledTimes(1)
        expect(count(isResultAck)).toBe(0)
        await vi.advanceTimersByTimeAsync(2_500)
        expect(h.adopt).toHaveBeenCalledTimes(1)
        expect(h.alerts).toEqual([])
        await vi.advanceTimersByTimeAsync(2_500)
        expect(h.adopt).toHaveBeenCalledTimes(1)
        expect(count(isResultAck)).toBe(0)
        expect(h.infos).toEqual([CONFLICT_NOTICE])
        expect(h.alerts).toEqual([])
        expect(markers()).toEqual([expect.objectContaining({ recoveryOutcome: 'conflict-parked' })])
        await vi.advanceTimersByTimeAsync(30_000)
        expect(count(isResultPeek)).toBe(1)
        expect(h.infos).toHaveLength(1)
        expect(h.alerts).toEqual([])
    })

    it('retains unresolved reconciliation without a result row and sends no ACK', async () => {
        serve((operationId, method, url) => {
            if (isResultPeek(method, url)) return { status: 200, body: committedWithoutRow(operationId) }
            if (method === 'GET' && url.startsWith('/api/bg-orchestrate-chat-state/')) {
                return { status: 200, body: projection(operationId) }
            }
        })
        await bootWithMarker()
        await vi.advanceTimersByTimeAsync(5_000)
        expect(h.adopt).toHaveBeenCalledTimes(1)
        expect(count(isResultAck)).toBe(0)
        expect(h.infos).toEqual([CONFLICT_NOTICE])
        expect(h.alerts).toEqual([])
        expect(markers()).toHaveLength(1)
        await vi.advanceTimersByTimeAsync(30_000)
        expect(count(isResultPeek)).toBe(1)
    })

    it('reobserves a changed exact delivery after a superseded acknowledgement', async () => {
        h.adopt.mockResolvedValue({ adopted: true, chat: chatWith(3) })
        let acks = 0
        serve((operationId, method, url) => {
            if (isResultPeek(method, url)) return { status: 200, body: committedResult(operationId) }
            if (method === 'GET' && url.startsWith('/api/bg-orchestrate-chat-state/')) {
                return { status: 200, body: projection(operationId) }
            }
            if (isResultAck(method, url)) {
                acks += 1
                return acks === 1
                    ? { status: 409, body: { acked: false, reason: 'superseded' } }
                    : { status: 200, body: { acked: true, state: 'deleted' } }
            }
        })
        await bootWithMarker()
        expect(h.adopt).toHaveBeenCalledTimes(1)
        expect(count(isResultAck)).toBe(1)
        expect(h.alerts).toEqual([])
        expect(markers().map(marker => marker.operationId)).toEqual([BOOT_OPERATION_ID])
        await vi.advanceTimersByTimeAsync(2_500)
        expect(h.adopt).toHaveBeenCalledTimes(2)
        expect(count(isResultAck)).toBe(2)
        expect(h.infos).toEqual([])
        expect(h.alerts).toEqual([])
        expect(markers()).toEqual([])
    })

    it('keeps polling a possibly transient projection failure', async () => {
        serve((operationId, method, url) => {
            if (isResultPeek(method, url)) return { status: 200, body: committedResult(operationId) }
            if (method === 'GET' && url.startsWith('/api/bg-orchestrate-chat-state/')) {
                return { status: 503, body: { found: false } }
            }
        })
        await bootWithMarker()
        await vi.advanceTimersByTimeAsync(2_500 * 5)
        expect(count(isResultPeek)).toBe(6)
        expect(h.adopt).not.toHaveBeenCalled()
        expect(count(isResultAck)).toBe(0)
        expect(h.alerts).toEqual([])
        expect(markers().map(marker => marker.operationId)).toEqual([BOOT_OPERATION_ID])
    })

    it('keeps normal committed adoption unchanged', async () => {
        h.adopt = vi.fn(async () => ({ adopted: true, revision: 'server-revision', chat: chatWith(3) }))
        serve((operationId, method, url) => {
            if (isResultPeek(method, url)) return { status: 200, body: committedResult(operationId) }
            if (method === 'GET' && url.startsWith('/api/bg-orchestrate-chat-state/')) {
                return { status: 200, body: projection(operationId) }
            }
            if (isResultAck(method, url)) return { status: 200, body: { acked: true, state: 'deleted' } }
        })
        await bootWithMarker()
        expect(h.adopt).toHaveBeenCalledTimes(1)
        expect(count(isResultAck)).toBe(1)
        expect(h.alerts).toEqual([])
        expect(markers()).toEqual([])
    })
})

describe('foreground watch of finished server operations', () => {
    it.each([false, true])('does not apply a late body after cancellation with newer watch=%s', async newer => {
        let resolveBody!: (body: unknown) => void
        let oldOperation = ''
        serve((operationId, method, url) => {
            if (isResultPeek(method, url)) {
                oldOperation = operationId
                return { status: 200, body: new Promise(resolve => { resolveBody = resolve }) }
            }
            if (method === 'DELETE' && url.startsWith('/api/bg-orchestrate/')) {
                return { status: 200, body: { cancelled: true } }
            }
        })
        const module = await startForeground()
        await vi.advanceTimersByTimeAsync(2_500)
        expect(resolveBody).toBeTypeOf('function')
        expect(await module.cancelServerOrchestratedChat()).toBe(true)
        if (newer) await startForeground()
        const before = structuredClone(markers())
        resolveBody(committedResult(oldOperation))
        await vi.advanceTimersByTimeAsync(1)
        expect(markers()).toEqual(before)
        expect(markers()).toHaveLength(newer ? 1 : 0)
        expect(h.adopt).not.toHaveBeenCalled()
        expect(count(isResultAck)).toBe(0)
        expect(h.alerts).toEqual([])
        expect(h.sendChat).not.toHaveBeenCalled()
    })

    it('closes a finished failure without an answer once', async () => {
        serve((operationId, method, url) => {
            if (isResultPeek(method, url)) return { status: 200, body: terminalError(operationId) }
            if (isResultAck(method, url)) return { status: 200, body: { acked: true, state: 'deleted' } }
        })
        await startForeground()
        await vi.advanceTimersByTimeAsync(2_500)
        expect(h.alerts).toEqual([FAILURE_NOTICE])
        expect(count(isResultAck)).toBe(1)
        expect(markers()).toEqual([])
        expect(h.sendChat).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(30_000)
        expect(count(isResultPeek)).toBe(1)
    })

    it('parks a committed result on local conflict without deleting its delivery', async () => {
        serve((operationId, method, url) => {
            if (isResultPeek(method, url)) return { status: 200, body: committedResult(operationId) }
            if (method === 'GET' && url.startsWith('/api/bg-orchestrate-chat-state/')) {
                return { status: 200, body: projection(operationId) }
            }
            if (isResultAck(method, url)) return { status: 200, body: { acked: true, state: 'deleted' } }
        })
        await startForeground()
        await vi.advanceTimersByTimeAsync(2_500 * 2)
        expect(h.adopt).toHaveBeenCalledTimes(1)
        expect(count(isResultAck)).toBe(0)
        await vi.advanceTimersByTimeAsync(2_500)
        expect(h.adopt).toHaveBeenCalledTimes(1)
        expect(count(isResultAck)).toBe(0)
        expect(h.infos).toEqual([CONFLICT_NOTICE])
        expect(h.alerts).toEqual([])
        expect(markers()).toHaveLength(1)
        await vi.advanceTimersByTimeAsync(30_000)
        expect(count(isResultPeek)).toBe(1)
    })

    it('keeps polling after a superseded acknowledgement of a finished failure', async () => {
        let acks = 0
        serve((operationId, method, url) => {
            if (isResultPeek(method, url)) return { status: 200, body: terminalError(operationId) }
            if (isResultAck(method, url)) {
                acks += 1
                return acks === 1
                    ? { status: 409, body: { acked: false, reason: 'superseded' } }
                    : { status: 200, body: { acked: true, state: 'deleted' } }
            }
        })
        await startForeground()
        await vi.advanceTimersByTimeAsync(2_500)
        expect(h.alerts).toEqual([])
        expect(markers()).toHaveLength(1)
        await vi.advanceTimersByTimeAsync(2_500)
        expect(count(isResultAck)).toBe(2)
        expect(h.alerts).toEqual([FAILURE_NOTICE])
        expect(markers()).toEqual([])
    })

    it('keeps the marker when the committed-result acknowledgement throws', async () => {
        h.adopt.mockResolvedValue({ adopted: true, chat: chatWith(3) })
        serve((operationId, method, url) => {
            if (isResultPeek(method, url)) return { status: 200, body: committedResult(operationId) }
            if (method === 'GET' && url.startsWith('/api/bg-orchestrate-chat-state/')) {
                return { status: 200, body: projection(operationId) }
            }
            if (isResultAck(method, url)) throw new TypeError('Failed to fetch')
        })
        await startForeground()
        await vi.advanceTimersByTimeAsync(2_500 * 3)
        expect(count(isResultAck)).toBe(1)
        expect(h.infos).toEqual([])
        expect(h.alerts).toEqual([])
        expect(markers()).toEqual([expect.objectContaining({ recoveryOutcome: 'ack-pending' })])
        await vi.advanceTimersByTimeAsync(30_000)
        expect(count(isResultPeek)).toBe(1)
    })

    it('parks unresolved local edits even when a prior ACK already removed the row', async () => {
        serve((operationId, method, url) => {
            if (isResultPeek(method, url)) return { status: 200, body: committedWithoutRow(operationId) }
            if (method === 'GET' && url.startsWith('/api/bg-orchestrate-chat-state/')) {
                return { status: 200, body: projection(operationId) }
            }
        })
        await startForeground()
        await vi.advanceTimersByTimeAsync(2_500 * 3)
        expect(h.adopt).toHaveBeenCalledTimes(1)
        expect(count(isResultAck)).toBe(0)
        expect(h.infos).toEqual([CONFLICT_NOTICE])
        expect(h.alerts).toEqual([])
        expect(markers()).toHaveLength(1)
        await vi.advanceTimersByTimeAsync(30_000)
        expect(count(isResultPeek)).toBe(1)
    })

    it('keeps the legacy client fallback for a legacy error without an answer', async () => {
        serve((operationId, method, url) => {
            if (isResultPeek(method, url)) {
                return {
                    status: 200,
                    body: terminalError(operationId, { serverChatCommitVersion: undefined, serverChatCommit: undefined }),
                }
            }
            if (isResultAck(method, url)) return { status: 200, body: { acked: true, state: 'deleted' } }
        }, { serverChatCommit: false })
        await startForeground()
        await vi.advanceTimersByTimeAsync(2_500)
        expect(h.sendChat).toHaveBeenCalledTimes(1)
        expect(h.alerts).toEqual([])
        expect(count(isResultAck)).toBe(1)
    })

    it('keeps in-flight cancel unchanged', async () => {
        serve((_operationId, method, url) => {
            if (isResultPeek(method, url)) {
                return { status: 200, body: { found: false, stage: 2, operationState: 'running' } }
            }
            if (method === 'DELETE' && url.startsWith('/api/bg-orchestrate/')) {
                return { status: 200, body: { cancelled: true } }
            }
        })
        const module = await startForeground()
        await vi.advanceTimersByTimeAsync(2_500)
        await expect(module.cancelServerOrchestratedChat()).resolves.toBe(true)
        expect(h.alerts).toEqual([])
        expect(markers()).toEqual([])
        await vi.advanceTimersByTimeAsync(30_000)
        expect(count(isResultPeek)).toBe(1)
    })

    it('does not fall back to paid client work after authoritative same-chat rejection', async () => {
        serve(() => undefined)
        const previous = h.route
        h.route = async (method, url, body) => {
            if (method === 'POST' && url === '/api/bg-orchestrate') {
                return { status: 409, body: { handled: false, started: false,
                    operationId: body.operationId, reason: 'chat-generation-active' } }
            }
            return previous(method, url, body)
        }
        const module = await import('./bgOrchestrate')
        expect((await module.runServerOrchestratedChat(0, {})).handled).toBe(true)
        await vi.advanceTimersByTimeAsync(10_000)
        expect(h.sendChat).not.toHaveBeenCalled()
        expect(markers()).toEqual([])
        expect(h.warnings).toHaveLength(1)
        expect(h.warnings[0]).toContain('추가 생성을 시작하지 않았')
        expect(count(isResultPeek)).toBe(0)
    })

    it('reconciles an already-finished cancellation response through the normal result ACK', async () => {
        serve((operationId, method, url) => {
            if (isResultPeek(method, url)) return { status: 200, body: terminalError(operationId) }
            if (isResultAck(method, url)) return { status: 200, body: { acked: true, state: 'deleted' } }
            if (method === 'DELETE' && url.startsWith('/api/bg-orchestrate/')) {
                return { status: 200, body: { cancelled: false, finished: true, operationId, state: 'result-ready' } }
            }
        })
        const module = await startForeground()
        await expect(module.cancelServerOrchestratedChat()).resolves.toBe(false)
        expect(count(isResultAck)).toBe(1)
        expect(markers()).toEqual([])
        expect(h.alerts.some(message => message.includes('취소 대상을'))).toBe(false)
        expect(h.sendChat).not.toHaveBeenCalled()
    })
})
})
