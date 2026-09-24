import { describe, expect, it, vi } from 'vitest'
import { submitServerInputCommand, type ServerInputClientDependencies } from './bgServerInputClient'
import { readServerInputMarkers } from './bgServerInputLedger'

const base = 'a'.repeat(64)
const next = 'b'.repeat(64)
const request = { charId: 'char-1', chatId: 'chat-1', rawText: 'next message' }
const capability = {
    contract: 'bg_orchestration_capabilities.v1',
    inputCommandVersion: 1,
    serverChatCommitVersion: 1,
    chatExecutionProjectionVersion: 1,
}

function makeHarness() {
    const values = new Map<string, string>()
    const storage = {
        get length() { return values.size },
        key(index: number) { return [...values.keys()][index] ?? null },
        getItem(key: string) { return values.get(key) ?? null },
        setItem(key: string, value: string) { values.set(key, value) },
        removeItem(key: string) { values.delete(key) },
    }
    let localRevision = base
    let serverRevision = base
    let pendingInputs: Awaited<ReturnType<ServerInputClientDependencies['readPendingInputs']>> = []
    let id = 0
    const start = vi.fn(async (body: Record<string, unknown>) => ({
        status: 200,
        body: { operationId: body.operationId, started: true },
    }))
    const status = vi.fn(async (operationId: string) => ({
        status: 200,
        body: { operationId, accepted: true, state: 'input-generating' },
    }))
    const flushSettings = vi.fn(async () => {})
    const deps: ServerInputClientDependencies = {
        storage,
        readCapability: async () => capability,
        flushSettings,
        readLocalRevision: () => localRevision,
        peekServerChat: async () => ({ revision: serverRevision }),
        readPendingInputs: async () => pendingInputs,
        start,
        status,
        newId: () => `operation-${++id}`,
        isCurrent: () => true,
        now: () => 1000 + id,
        wait: async () => {},
    }
    return {
        deps, start, status, flushSettings,
        setLocalRevision(value: string) { localRevision = value },
        setServerRevision(value: string) { serverRevision = value },
        setPending(value: typeof pendingInputs) { pendingInputs = value },
    }
}

describe('server-owned input client admission', () => {
    it('persists only an operation marker before the paid start and accepts 202 N+1', async () => {
        const harness = makeHarness()
        await expect(submitServerInputCommand(harness.deps, request)).resolves.toEqual({
            kind: 'accepted', operationId: 'operation-1', state: null, clearDraft: true,
        })
        const firstBody = harness.start.mock.calls[0][0]
        expect(firstBody).toMatchObject({
            inputCommandVersion: 1, serverChatCommitVersion: 1,
            baseChatRevision: base,
            inputCommand: { rawText: 'next message' },
        })
        expect(JSON.stringify(readServerInputMarkers(harness.deps.storage, 1003)))
            .not.toContain('next message')

        harness.setServerRevision(next)
        harness.setPending([{
            operationId: 'operation-1', admissionSeq: 1, state: 'generating',
        }])
        harness.start.mockImplementationOnce(async body => ({
            status: 202,
            body: {
                operationId: body.operationId, accepted: true, started: false,
                state: 'input-waiting-predecessor',
            },
        }))
        await expect(submitServerInputCommand(harness.deps, request)).resolves.toEqual({
            kind: 'accepted', operationId: 'operation-4',
            state: 'input-waiting-predecessor', clearDraft: true,
        })
        expect(harness.start.mock.calls[1][0]).toMatchObject({ baseChatRevision: next })
        expect(harness.flushSettings).toHaveBeenCalledTimes(2)
    })

    it('blocks local edits made during canonical read and never starts paid work', async () => {
        const harness = makeHarness()
        let reads = 0
        harness.deps.readLocalRevision = () => ++reads === 1 ? base : next
        await expect(submitServerInputCommand(harness.deps, request)).resolves.toEqual({
            kind: 'blocked', reason: 'local-chat-changed',
        })
        expect(harness.start).not.toHaveBeenCalled()
    })

    it('does not spend or discard a draft when settings or marker persistence fails', async () => {
        const settings = makeHarness()
        settings.deps.flushSettings = async () => { throw new Error('write failed') }
        await expect(submitServerInputCommand(settings.deps, request)).resolves.toEqual({
            kind: 'blocked', reason: 'settings-save-failed',
        })
        expect(settings.start).not.toHaveBeenCalled()

        const marker = makeHarness()
        marker.deps.storage.setItem = () => { throw new Error('quota') }
        await expect(submitServerInputCommand(marker.deps, request)).resolves.toEqual({
            kind: 'blocked', reason: 'recovery-marker-unavailable',
        })
        expect(marker.start).not.toHaveBeenCalled()
    })

    it('keeps an ambiguous accepted command owned by the server without client fallback', async () => {
        const harness = makeHarness()
        harness.start.mockRejectedValueOnce(new Error('POST response lost'))
        await expect(submitServerInputCommand(harness.deps, request)).resolves.toEqual({
            kind: 'accepted', operationId: 'operation-1',
            state: 'input-generating', clearDraft: true,
        })
        expect(harness.start).toHaveBeenCalledTimes(1)
        expect(harness.status).toHaveBeenCalledWith('operation-1', expect.any(AbortSignal))
    })

    it('retains an uncertain prior operation when status is unavailable', async () => {
        const harness = makeHarness()
        harness.start.mockRejectedValueOnce(new Error('POST response lost'))
        harness.deps.isCurrent = () => false
        // A distinct prior operation was already written before this page lost its response.
        harness.deps.storage.setItem('bg-server-input-v1:operation-old', JSON.stringify({
            operationId: 'operation-old', charId: 'char-1', chatId: 'chat-1',
            localRevision: base, baseRevision: base,
            state: 'uncertain', createdAt: 1000,
        }))
        harness.status.mockRejectedValueOnce(new Error('offline'))
        await expect(submitServerInputCommand(harness.deps, request)).resolves.toEqual({
            kind: 'blocked', reason: 'prior-operation-unavailable',
        })
        expect(harness.start).not.toHaveBeenCalled()
    })

    it('does not reinterpret the visible draft as N+1 after a lost ACK is confirmed', async () => {
        const harness = makeHarness()
        harness.deps.storage.setItem('bg-server-input-v1:operation-old', JSON.stringify({
            operationId: 'operation-old', charId: 'char-1', chatId: 'chat-1',
            localRevision: base, baseRevision: base,
            state: 'uncertain', createdAt: 1000,
        }))
        await expect(submitServerInputCommand(harness.deps, request)).resolves.toEqual({
            kind: 'blocked', reason: 'prior-operation-accepted',
        })
        expect(harness.start).not.toHaveBeenCalled()
        expect(readServerInputMarkers(harness.deps.storage, 1000))
            .toMatchObject([{ operationId: 'operation-old', state: 'uncertain' }])
    })

    it('leaves the old client path available when input capability is zero', async () => {
        const harness = makeHarness()
        harness.deps.readCapability = async () => ({ ...capability, inputCommandVersion: 0 })
        await expect(submitServerInputCommand(harness.deps, request)).resolves.toEqual({
            kind: 'unsupported',
        })
        expect(harness.flushSettings).not.toHaveBeenCalled()
        expect(harness.start).not.toHaveBeenCalled()
    })
})
