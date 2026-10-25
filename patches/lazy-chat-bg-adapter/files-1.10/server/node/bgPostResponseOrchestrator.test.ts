import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const registerBgOrchestrator = require('./bgOrchestrator.cjs') as (app: any, deps: any) => void
const { createOrchestrationRunRegistry } = require('./bgOrchestrationRunRegistry.cjs') as any
const { operationResultKey } = require('./bgOrchestrationOperationStore.cjs') as any

const charId = 'character-d3'
const chatId = 'chat-d3'

async function waitTicks(count = 40) {
    for (let index = 0; index < count; index += 1) await new Promise(resolve => setTimeout(resolve, 0))
}

function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>(done => { resolve = done })
    return { promise, resolve }
}

function orchestratorHarness(options: {
    commit?: any,
    reflectError?: boolean,
    openError?: boolean,
    noticeError?: boolean,
    holdOpen?: boolean,
    includeLease?: boolean,
} = {}) {
    const operationId = `operation-d3-${Math.random().toString(36).slice(2, 10)}`
    const values = new Map<string, string>()
    const routes = new Map<string, Array<(req: any, res: any, next?: () => void) => any>>()
    const app: any = {}
    for (const method of ['get', 'post', 'delete']) {
        app[method] = (route: string, ...handlers: any[]) => routes.set(`${method.toUpperCase()} ${route}`, handlers)
    }
    const events: string[] = []
    const notices: any[] = []
    const controls: any[] = []
    const commitInputs: any[] = []
    const operationResultsAtOpen: Array<string | null> = []
    const openGate = deferred<any>()
    const runs = createOrchestrationRunRegistry({ retainMs: 60_000 })
    const actualFinish = runs.finish.bind(runs)
    runs.finish = (...args: any[]) => { events.push('finish'); return actualFinish(...args) }
    const committedChat = { id: chatId, fmIndex: -1, message: [
        { role: 'user', data: 'question', chatId: 'user-d3' },
        { role: 'char', data: 'partial but committed answer', chatId: 'answer-d3' },
    ] }
    const receipt = { contractVersion: 'bg_server_chat_commit.v1', operationId, commitReceiptId: `receipt-${operationId}`,
        requestedCharId: charId, requestedChatId: chatId, storedChatId: chatId,
        storedRevision: 'revision-d3', storageEpoch: 0, chatCommitted: true }
    let committed = false
    const lease = {
        participants: [{ index: 0, pluginName: 'memory-plugin', pluginVersion: '3.0' }],
        lockAcquiredAt: 0,
        reflectCommittedChat: vi.fn((_chat: any) => {
            events.push('reflect')
            if (options.reflectError) throw new Error('injected-reflection-failure')
            return 1_234
        }),
        open: vi.fn(async ({ signal }: any) => {
            operationResultsAtOpen.push(values.get(operationResultKey(operationId)) ?? null)
            events.push('open')
            if (options.openError) throw new Error('injected-open-failure')
            if (options.holdOpen) {
                signal.addEventListener('abort', () => openGate.resolve({ status: 'uncertain', reason: 'aborted' }), { once: true })
                return openGate.promise
            }
            return { status: 'drained' }
        }),
        release: vi.fn(async () => { events.push('release') }),
    }
    const inputOwner = {
        read: () => null, pendingProjection: () => [], readCancelledInputProof: () => null,
        readFailedInputProof: () => null, readFailedInputAcknowledgement: () => null,
        hasPendingGeneration: () => false, settleSynchronously: vi.fn(), attachWaitingDrain: vi.fn(),
    }
    const commitOwner = {
        currentStorageEpoch: () => 0,
        captureBase: async () => ({ revision: 'base-revision', submittedRevision: 'base-revision', matches: true }),
        readGenerationCommit: (candidate: string) => candidate === operationId && committed
            ? { status: 'committed', receipt } : { status: 'missing', receipt: null },
        commitGenerationResult: vi.fn(async (input: any) => {
            events.push('commit')
            commitInputs.push(input)
            committed = true
            const outcome = options.commit ?? { status: 'committed', reason: null, receipt, reused: false }
            if (outcome.status === 'committed') values.set(`bg-post-response-sync:${operationId}`, JSON.stringify({
                version: 1, operationId, charId, chatId, receiptId: receipt.commitReceiptId,
                storedRevision: receipt.storedRevision, storageEpoch: 0, createdAt: 1_700_000_000_000,
                entries: lease.participants, state: 'pending',
            }))
            return outcome
        }),
        readCommittedChat: vi.fn(() => { events.push('read'); return structuredClone(committedChat) }),
    }
    const publishNotification = vi.fn((event: any) => {
        events.push('notice')
        notices.push(event)
        if (options.noticeError) throw new Error('injected-notice-failure')
        return { status: 'stored', id: 'a'.repeat(64) }
    })
    registerBgOrchestrator(app, {
        sessionAuthMiddleware: (_req: any, _res: any, next: () => void) => next?.(),
        checkActiveSession: () => true,
        orchestrationRuns: runs,
        serverChatInputOwner: inputOwner,
        serverChatCommitOwner: commitOwner,
        bgPluginDependencies: { publishNotification },
        publishNotification,
        runServerPreview: async (_deps: any, _char: string, _chat: string, _preview: any, _mode: string, control: any) => {
            events.push('preview')
            controls.push(control)
            return { chat: committedChat, statics: null, staticsMessagesDelta: 0,
                globalChatVariables: {}, globalChatVariablesDeleted: [], globalChatVariablesExpected: {},
                settingsDigest: 'a'.repeat(64), threw: null,
                ...(options.includeLease === false ? {} : { postResponseLease: lease }) }
        },
        kvGet: (key: string) => values.get(key) ?? null,
        kvSet: (key: string, value: string) => {
            if (key.startsWith('bg-post-response-sync:')) {
                const record = JSON.parse(value)
                events.push(`sync-${record.state}`)
            }
            values.set(key, value)
        },
        kvDel: (key: string) => values.delete(key),
        kvList: (prefix: string) => [...values.keys()].filter(key => key.startsWith(prefix)),
        kvGetUpdatedAt: () => 1_700_000_000_000,
    })
    async function invoke(method: string, route: string, request: any) {
        const handlers = routes.get(`${method.toUpperCase()} ${route}`)
        if (!handlers) throw new Error(`missing route ${method} ${route}`)
        const result = { status: 200, body: null as any }
        const response = { status(code: number) { result.status = code; return this },
            json(body: any) { result.body = body; return this }, set() { return this }, type() { return this },
            send(body: any) { result.body = body; return this } }
        let index = -1
        const next = async (): Promise<void> => { index += 1; if (handlers[index]) await handlers[index](request, response, next) }
        await next()
        return result
    }
    const start = () => invoke('POST', '/api/bg-orchestrate', { body: {
        operationId, selectedCharId: charId, selectedChatId: chatId,
        currentChat: { id: chatId, fmIndex: -1, message: [{ role: 'user', data: 'question', chatId: 'user-d3' }] },
        detached: true, startAckVersion: 1, resultKeyVersion: 1, resultOrderVersion: 1,
        serverChatCommitVersion: 1, baseChatRevision: 'base-revision',
    } })
    const activity = () => invoke('GET', '/api/bg-chat-activity/:charId/:chatId', { params: { charId, chatId } })
    const result = (consumerId: string) => invoke('GET', '/api/bg-orchestrate-result/:operationId', {
        params: { operationId }, query: { charId, chatId, consumerId },
    })
    const acknowledge = (resultId: string, consumerId: string) => invoke(
        'DELETE', '/api/bg-orchestrate-result/:operationId/:resultId',
        { params: { operationId, resultId }, query: { consumerId } },
    )
    const cancel = () => invoke('DELETE', '/api/bg-orchestrate/:operationId', {
        params: { operationId }, query: { charId, chatId },
    })
    return { operationId, values, events, notices, controls, commitInputs, operationResultsAtOpen,
        runs, lease, receipt, committedChat,
        commitOwner, publishNotification, start, activity, result, acknowledge,
        finishWindow: (value: any = { status: 'drained' }) => openGate.resolve(value), cancel }
}

describe('[D3-1] Post-commit continuation for afterRequest timers', () => {
    it('[new] publishes the committed operation result before opening the post-response window', async () => {
        const h = orchestratorHarness()
        await h.start(); await waitTicks()
        expect(h.lease.open).toHaveBeenCalledTimes(1)
        expect(h.operationResultsAtOpen).toHaveLength(1)
        expect(JSON.parse(h.operationResultsAtOpen[0] ?? '{}')).toMatchObject({ kind: 'terminal-success', final: true })
    })

    it('[new] performs commit, canonical read, reflection, one shared deadline, release, then run finish', async () => {
        const h = orchestratorHarness()
        await expect(h.start()).resolves.toMatchObject({ status: 200, body: { handled: true, started: true } })
        await waitTicks()
        expect(h.controls[0]?.acceptPostResponseLease, 'S4b must explicitly accept the post-response lease').toBe(true)
        expect(h.commitInputs[0].postResponseSync).toEqual({ entries: h.lease.participants })
        expect(h.events).toEqual(['preview', 'commit', 'read', 'reflect', 'open', 'sync-drained', 'release', 'finish'])
        expect(h.lease.reflectCommittedChat).toHaveBeenCalledWith(h.committedChat)
        expect(h.lease.open).toHaveBeenCalledTimes(1)
        expect(h.lease.open.mock.calls[0][0].deadline).toBe(11_234)
        expect(h.lease.release).toHaveBeenCalledTimes(1)
        expect(h.values.get(operationResultKey(h.operationId))).not.toContain('postResponseLease')
        expect(h.notices).toEqual([])
    })

    it.each([
        ['conflict', { status: 'conflict', reason: 'revision_changed', receipt: null, reused: false }],
        ['failure', { status: 'failed', reason: 'commit_failed', receipt: null, reused: false }],
        ['cancelled', { status: 'cancelled', reason: 'cancelled', receipt: null, reused: false }],
    ])('[new] opens no window for a non-committed %s outcome and releases exactly once before finish', async (_case, commit) => {
        const h = orchestratorHarness({ commit })
        await h.start(); await waitTicks()
        expect(h.controls[0]?.acceptPostResponseLease).toBe(true)
        expect(h.lease.open).not.toHaveBeenCalled()
        expect(h.lease.reflectCommittedChat).not.toHaveBeenCalled()
        expect(h.lease.release).toHaveBeenCalledTimes(1)
        expect(h.events.indexOf('release')).toBeLessThan(h.events.indexOf('finish'))
    })

    it.each(['reflect', 'open', 'notice'] as const)(
        '[new] keeps the committed result and releases once when post-commit %s fails', async fault => {
            const h = orchestratorHarness({ reflectError: fault === 'reflect', openError: fault === 'open',
                noticeError: fault === 'notice' })
            if (fault === 'notice') h.lease.open.mockResolvedValueOnce({ status: 'uncertain', reason: 'error' })
            await h.start(); await waitTicks()
            expect(h.controls[0]?.acceptPostResponseLease).toBe(true)
            expect(h.lease.release).toHaveBeenCalledTimes(1)
            expect(h.events.at(-1)).toBe('finish')
            const stored = JSON.parse(h.values.get(operationResultKey(h.operationId)) || '{}')
            expect(stored).toMatchObject({ kind: 'terminal-success', final: true })
            expect(String(h.values.get(operationResultKey(h.operationId)))).not.toContain('postResponseLease')
        },
    )

    it('[new] reports chat-committed and busy during the window, aborts it on Stop, then releases before finish', async () => {
        const h = orchestratorHarness({ holdOpen: true })
        await h.start(); await waitTicks(10)
        expect(h.lease.open, 'the committed partial reply must open the window').toHaveBeenCalledTimes(1)
        await expect(h.activity()).resolves.toMatchObject({ status: 200, body: { busy: true } })
        await expect(h.cancel()).resolves.toMatchObject({ status: 200, body: {
            cancelled: false, finished: true, state: 'chat-committed', reason: 'already-committed',
        } })
        await waitTicks()
        expect(h.lease.open.mock.calls[0][0].signal.aborted).toBe(true)
        expect(h.lease.release).toHaveBeenCalledTimes(1)
        expect(h.events.indexOf('release')).toBeLessThan(h.events.indexOf('finish'))
        expect(h.notices).toEqual([expect.objectContaining({ code: 'plugin_post_response_uncertain',
            phase: 'post_response', reason: 'aborted', effectsMayHaveOccurred: true })])
        expect(h.events.indexOf('sync-uncertain')).toBeLessThan(h.events.indexOf('notice'))
    })

    it('[new] conditionally finalizes the sync record without resurrecting it after storage reset', async () => {
        const h = orchestratorHarness({ holdOpen: true })
        await h.start(); await waitTicks(10)
        expect(h.lease.open).toHaveBeenCalledTimes(1)
        h.values.clear()
        const run = h.runs.get(h.operationId)
        expect(run?.postResponseAbort, 'the active run must own the post-response abort controller').toBeInstanceOf(AbortController)
        run.postResponseAbort.abort()
        await waitTicks()
        expect([...h.values.keys()].some(key => key.startsWith('bg-post-response-sync:'))).toBe(false)
        expect(h.lease.release).toHaveBeenCalledTimes(1)
    })

    it('[new] preserves normal result ACK state when the ACK arrives during the post-response window', async () => {
        const consumerId = 'consumer-d3-ack'
        const baseline = orchestratorHarness({ includeLease: false })
        await baseline.start(); await waitTicks()
        expect(baseline.runs.status(baseline.operationId)).toBe('finished')
        const baselineResult = await baseline.result(consumerId)
        expect(baselineResult).toMatchObject({ status: 200, body: { found: true, final: true } })
        const baselineAck = await baseline.acknowledge(baselineResult.body.resultId, consumerId)
        const baselineStatus = baseline.runs.status(baseline.operationId)
        const baselineRestart = await baseline.start()

        const during = orchestratorHarness({ holdOpen: true })
        await during.start(); await waitTicks(10)
        expect(during.lease.open).toHaveBeenCalledTimes(1)
        expect(during.runs.status(during.operationId)).toBe('running')
        const duringResult = await during.result(consumerId)
        expect(duringResult).toMatchObject({ status: 200, body: { found: true, final: true } })
        const duringAck = await during.acknowledge(duringResult.body.resultId, consumerId)
        expect(duringAck).toEqual(baselineAck)
        during.finishWindow(); await waitTicks()
        expect(during.runs.status(during.operationId)).toBe(baselineStatus)
        const duringRestart = await during.start()
        expect({ status: duringRestart.status, reason: duringRestart.body?.reason, state: duringRestart.body?.state })
            .toEqual({ status: baselineRestart.status, reason: baselineRestart.body?.reason, state: baselineRestart.body?.state })
    })
})
