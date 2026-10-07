// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    readPendingMarkers,
    writePendingMarker as writeStoredPendingMarker,
} from './bgOrchestrationPending'
import { orchestrationChatRevision } from './bgOrchestrationMerge'
import { COMMITTED_RESULT_KEPT_NOTICE } from './bgFinishedOperation'

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
}))

vi.mock('./stores.svelte', async () => {
    const { writable } = await import('svelte/store')
    return { DBState: h.dbState, selectedCharID: writable(0), ReloadChatPointer: writable(0) }
})
vi.mock('./globalApi.svelte', () => ({ requestDurableSave: async (scope: any) => { h.durableScopes.push(scope) } }))
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
vi.mock('./notificationSound', () => ({ playNotificationSound: async () => {} }))
vi.mock('./process/index.svelte', async () => {
    const { writable } = await import('svelte/store')
    return {
        chatProcessStage: writable(0),
        doingChat: writable(false),
        sendChatWithDirectLifecycle: (...args: unknown[]) => h.sendChat(...args),
    }
})
vi.mock('./process/generationState', () => ({
    chatGenKey: (chatId: string) => `chat:${chatId}`,
    endGenerationIfOwned: () => true,
    startGeneration: () => {},
}))
vi.mock('./generationBusy', async () => {
    const { writable } = await import('svelte/store')
    return {
        orchestrating: writable(false),
        setServerGenerationBusy: () => {},
        handoffServerGenerationToClient: () => {},
    }
})
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

beforeEach(() => {
    vi.useFakeTimers()
    vi.resetModules()
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
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => scriptedFetch(url, init))
})

afterEach(() => {
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

describe.each([false, true])('existing behavior with recovery timing enabled=%s', enabled => {
    let timing: typeof import('./bgRecoveryTiming').bgRecoveryTiming
    let restoreStart: (() => void) | undefined
    beforeEach(async () => {
        timing = (await import('./bgRecoveryTiming')).bgRecoveryTiming
        if (!enabled) {
            const spy = vi.spyOn(timing, 'start').mockImplementation(() => {})
            restoreStart = () => spy.mockRestore()
        }
    })
    afterEach(() => { timing?.dispose(); restoreStart?.(); restoreStart = undefined })

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

    it('stops after three permanent refusals with a result row', async () => {
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
        expect(h.adopt).toHaveBeenCalledTimes(2)
        expect(h.alerts).toEqual([])
        await vi.advanceTimersByTimeAsync(2_500)
        expect(h.adopt).toHaveBeenCalledTimes(3)
        expect(count(isResultAck)).toBe(1)
        expect(h.infos).toEqual([COMMITTED_RESULT_KEPT_NOTICE])
        expect(h.alerts).toEqual([])
        expect(markers()).toEqual([])
        await vi.advanceTimersByTimeAsync(30_000)
        expect(count(isResultPeek)).toBe(3)
        expect(h.infos).toHaveLength(1)
        expect(h.alerts).toEqual([])
    })

    it('stops after three permanent refusals without a result row and sends no acknowledgement', async () => {
        serve((operationId, method, url) => {
            if (isResultPeek(method, url)) return { status: 200, body: committedWithoutRow(operationId) }
            if (method === 'GET' && url.startsWith('/api/bg-orchestrate-chat-state/')) {
                return { status: 200, body: projection(operationId) }
            }
        })
        await bootWithMarker()
        await vi.advanceTimersByTimeAsync(5_000)
        expect(h.adopt).toHaveBeenCalledTimes(3)
        expect(count(isResultAck)).toBe(0)
        expect(h.infos).toEqual([COMMITTED_RESULT_KEPT_NOTICE])
        expect(h.alerts).toEqual([])
        expect(markers()).toEqual([])
        await vi.advanceTimersByTimeAsync(30_000)
        expect(count(isResultPeek)).toBe(3)
    })

    it('restarts the attempt count after a superseded acknowledgement', async () => {
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
        await vi.advanceTimersByTimeAsync(5_000)
        expect(h.adopt).toHaveBeenCalledTimes(3)
        expect(count(isResultAck)).toBe(1)
        expect(h.alerts).toEqual([])
        expect(markers().map(marker => marker.operationId)).toEqual([BOOT_OPERATION_ID])
        await vi.advanceTimersByTimeAsync(2_500 * 2)
        expect(h.adopt).toHaveBeenCalledTimes(5)
        expect(count(isResultAck)).toBe(1)
        await vi.advanceTimersByTimeAsync(2_500)
        expect(h.adopt).toHaveBeenCalledTimes(6)
        expect(count(isResultAck)).toBe(2)
        expect(h.infos).toEqual([COMMITTED_RESULT_KEPT_NOTICE])
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

    it('stops a committed result after three permanent refusals', async () => {
        serve((operationId, method, url) => {
            if (isResultPeek(method, url)) return { status: 200, body: committedResult(operationId) }
            if (method === 'GET' && url.startsWith('/api/bg-orchestrate-chat-state/')) {
                return { status: 200, body: projection(operationId) }
            }
            if (isResultAck(method, url)) return { status: 200, body: { acked: true, state: 'deleted' } }
        })
        await startForeground()
        await vi.advanceTimersByTimeAsync(2_500 * 2)
        expect(h.adopt).toHaveBeenCalledTimes(2)
        expect(count(isResultAck)).toBe(0)
        await vi.advanceTimersByTimeAsync(2_500)
        expect(h.adopt).toHaveBeenCalledTimes(3)
        expect(count(isResultAck)).toBe(1)
        expect(h.infos).toEqual([COMMITTED_RESULT_KEPT_NOTICE])
        expect(h.alerts).toEqual([])
        expect(markers()).toEqual([])
        await vi.advanceTimersByTimeAsync(30_000)
        expect(count(isResultPeek)).toBe(3)
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
        expect(h.infos).toEqual([COMMITTED_RESULT_KEPT_NOTICE])
        expect(h.alerts).toEqual([])
        expect(markers()).toHaveLength(1)
        await vi.advanceTimersByTimeAsync(30_000)
        expect(count(isResultPeek)).toBe(3)
    })

    it('stops a committed result without a row after three permanent refusals', async () => {
        serve((operationId, method, url) => {
            if (isResultPeek(method, url)) return { status: 200, body: committedWithoutRow(operationId) }
            if (method === 'GET' && url.startsWith('/api/bg-orchestrate-chat-state/')) {
                return { status: 200, body: projection(operationId) }
            }
        })
        await startForeground()
        await vi.advanceTimersByTimeAsync(2_500 * 3)
        expect(h.adopt).toHaveBeenCalledTimes(3)
        expect(count(isResultAck)).toBe(0)
        expect(h.infos).toEqual([COMMITTED_RESULT_KEPT_NOTICE])
        expect(h.alerts).toEqual([])
        expect(markers()).toEqual([])
        await vi.advanceTimersByTimeAsync(30_000)
        expect(count(isResultPeek)).toBe(3)
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
