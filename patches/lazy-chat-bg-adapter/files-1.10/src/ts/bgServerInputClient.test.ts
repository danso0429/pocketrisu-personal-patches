import { describe, expect, it, vi } from 'vitest'
import { submitServerInputCommand, type ServerInputClientDependencies } from './bgServerInputClient'
import { readServerInputMarkers } from './bgServerInputLedger'

const base = 'a'.repeat(64)
const next = 'b'.repeat(64)
const request = {
    charId: 'char-1', chatId: 'chat-1', rawText: 'next message',
    draftId: 'draft-original-1',
}
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
            inputCommand: { rawText: 'next message', inputCommandId: request.draftId },
        })
        expect(JSON.stringify(readServerInputMarkers(harness.deps.storage, 1002)))
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
        await expect(submitServerInputCommand(harness.deps, {
            ...request, draftId: 'draft-retyped-2',
        })).resolves.toEqual({
            kind: 'accepted', operationId: 'operation-3',
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

    it('blocks an enabled input command without a durable draft identity', async () => {
        const harness = makeHarness()
        await expect(submitServerInputCommand(harness.deps, {
            ...request, draftId: undefined,
        })).resolves.toEqual({ kind: 'blocked', reason: 'draft-identity-unavailable' })
        expect(harness.flushSettings).not.toHaveBeenCalled()
        expect(harness.start).not.toHaveBeenCalled()
    })

    it('keeps the visible draft after another tab submitted the same identity', async () => {
        const harness = makeHarness()
        harness.start.mockImplementationOnce(async body => ({
            status: 409,
            body: {
                operationId: body.operationId,
                started: false,
                reason: 'input_command_identity_conflict',
                existingOperationId: 'operation-other-tab-1',
            },
        }))
        await expect(submitServerInputCommand(harness.deps, request)).resolves.toEqual({
            kind: 'blocked', reason: 'draft-already-submitted',
        })
        expect(harness.start).toHaveBeenCalledTimes(1)
        expect(harness.status).not.toHaveBeenCalled()
        expect(readServerInputMarkers(harness.deps.storage, 1002)).toEqual([])
    })

    it('uses one shared draft identity when two tabs pass the marker check together', async () => {
        const harness = makeHarness()
        let reads = 0
        let release = () => {}
        const bothAtCapability = new Promise<void>(resolve => { release = resolve })
        harness.deps.readCapability = async () => {
            reads += 1
            if (reads === 2) release()
            await bothAtCapability
            return capability
        }
        harness.start.mockImplementation(async body => {
            if (harness.start.mock.calls.length === 1) {
                return { status: 200, body: { operationId: body.operationId, started: true } }
            }
            return {
                status: 409,
                body: {
                    operationId: body.operationId,
                    started: false,
                    reason: 'input_command_identity_conflict',
                },
            }
        })
        const [first, second] = await Promise.all([
            submitServerInputCommand(harness.deps, request),
            submitServerInputCommand(harness.deps, request),
        ])
        expect(first.kind).toBe('accepted')
        expect(second).toEqual({ kind: 'blocked', reason: 'draft-already-submitted' })
        const bodies = harness.start.mock.calls.map(call => call[0])
        expect(bodies).toHaveLength(2)
        expect(bodies[0].operationId).not.toBe(bodies[1].operationId)
        expect((bodies[0].inputCommand as Record<string, unknown>).inputCommandId)
            .toBe(request.draftId)
        expect((bodies[1].inputCommand as Record<string, unknown>).inputCommandId)
            .toBe(request.draftId)
    })

    it('retries only the attested blocked draft and clears its old marker after acceptance', async () => {
        const harness = makeHarness()
        const blockedId = 'operation-blocked-before-retry-1'
        harness.deps.storage.setItem(`bg-server-input-v1:${blockedId}`, JSON.stringify({
            operationId: blockedId, charId: request.charId, chatId: request.chatId,
            localRevision: base, baseRevision: base, state: 'accepted', createdAt: 1000,
        }))
        harness.status.mockImplementation(async operationId => ({
            status: 200,
            body: { operationId, accepted: true, state: 'input-blocked_edit' },
        }))
        harness.setPending([{
            operationId: blockedId, admissionSeq: 1, state: 'blocked_edit',
            retryAllowed: true,
            rawText: request.rawText, inputCommandId: request.draftId,
        }])
        await expect(submitServerInputCommand(harness.deps, {
            ...request, replaceBlockedOperationId: blockedId,
        })).resolves.toMatchObject({ kind: 'accepted', clearDraft: true })
        expect(harness.start.mock.calls[0][0]).toMatchObject({
            inputCommand: {
                inputCommandId: request.draftId,
                replaceBlockedOperationId: blockedId,
            },
        })
        expect(readServerInputMarkers(harness.deps.storage, 1002)
            .some(marker => marker.operationId === blockedId)).toBe(false)
    })

    it('clears a resolved marker from another tab before a genuinely new draft', async () => {
        const harness = makeHarness()
        const oldId = 'operation-retried-from-other-tab-1'
        harness.deps.storage.setItem(`bg-server-input-v1:${oldId}`, JSON.stringify({
            operationId: oldId, charId: request.charId, chatId: request.chatId,
            localRevision: base, baseRevision: base, state: 'accepted', createdAt: 1000,
        }))
        harness.status.mockImplementation(async operationId => ({
            status: 200,
            body: { operationId, accepted: true, state: 'input-retried' },
        }))
        await expect(submitServerInputCommand(harness.deps, {
            ...request, draftId: 'draft-new-after-retry-2',
        })).resolves.toMatchObject({ kind: 'accepted' })
        expect(readServerInputMarkers(harness.deps.storage, 1002)
            .some(marker => marker.operationId === oldId)).toBe(false)
        expect(harness.start).toHaveBeenCalledTimes(1)
    })
})
