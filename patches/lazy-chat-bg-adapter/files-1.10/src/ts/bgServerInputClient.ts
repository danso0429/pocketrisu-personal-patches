import { classifyOrchestrationStatusResponse } from './bgOrchestrationStart'
import { chooseServerInputBase } from './bgServerInputAdmission'
import {
    clearServerInputMarker,
    readServerInputMarker,
    readServerInputMarkers,
    updateServerInputMarker,
    writeServerInputMarker,
    type ServerInputMarker,
} from './bgServerInputLedger'
import { reconcileServerInputStart, responseStorageEpoch, SERVER_INPUT_START_WINDOW_MS, SERVER_INPUT_START_ATTEMPT_TIMEOUT_MS } from './bgServerInputStart'
import { clearMarkerForStorageReset, isStorageResetMissing } from './bgStorageResetClearance'
import { serverChatCommitReceipt } from './bgServerCommitHydration'
import type { MarkerStorage } from './bgOrchestrationPending'
import type { ServerPendingInput } from './bgServerPendingProjection'
import { boundedRecoveryRead, RECOVERY_BODY_TIMEOUT_MS } from './bgRecoveryRead'

interface HttpOutcome {
    status: number
    body: unknown
}

interface Capability {
    serverPluginHostVersion?: unknown
    serverPluginMcpVersion?: unknown
    serverInputBaseVersion?: unknown
    clientInputPreparationVersion?: unknown
    contract?: unknown
    inputCommandVersion?: unknown
    serverChatCommitVersion?: unknown
    chatExecutionProjectionVersion?: unknown
}

export interface ServerInputClientDependencies {
    storage: MarkerStorage
    readCapability: () => Promise<Capability | null>
    configurationAllowed?: (capability: Capability) => boolean
    flushSettings: () => Promise<void>
    readLocalRevision: () => string
    peekServerChat: () => Promise<{ revision: string; viewRevision: string } | null>
    readPendingInputs: (revision: string) => Promise<ServerPendingInput[]>
    start: (body: Record<string, unknown>, signal: AbortSignal) => Promise<HttpOutcome>
    status: (operationId: string, signal: AbortSignal) => Promise<HttpOutcome>
    settleFinishedInput?: (operationId: string) => Promise<boolean>
    settleCancelledInput?: (operationId: string) => Promise<boolean>
    newId: () => string
    isCurrent: () => boolean
    now?: () => number
    wait?: (ms: number) => Promise<void>
    // Called once by the reader that removed a marker for a storage reset.
    onStorageResetCleared?: (operationId: string) => void
}

// Records the storage epoch of an accepted status of this operation on a marker
// that has none; an existing storageEpoch is never overwritten.
export function stampServerInputStorageEpoch(storage: MarkerStorage, marker: ServerInputMarker, body: unknown): void {
    const value = body as { accepted?: unknown; operationId?: unknown } | null
    if (value?.accepted !== true || value.operationId !== marker.operationId) return
    const storageEpoch = responseStorageEpoch(body)
    if (storageEpoch === null || marker.storageEpoch !== undefined) return
    try {
        updateServerInputMarker(storage, marker.operationId, current => current.storageEpoch !== undefined
            ? current : { ...current, epochVersion: 1, storageEpoch })
    } catch { /* The marker keeps its previous evidence. */ }
}

// Storage-reset clearance for a `missing` status of a stored marker.
function clearedForStorageReset(
    deps: Pick<ServerInputClientDependencies, 'storage' | 'onStorageResetCleared'>,
    marker: ServerInputMarker,
    body: unknown,
): boolean {
    if (!isStorageResetMissing(marker, body)) return false
    if (clearMarkerForStorageReset(deps.storage, 'server-input', marker.operationId, body)) {
        try { deps.onStorageResetCleared?.(marker.operationId) } catch { /* notice is best effort */ }
        return true
    }
    // Not removed here: absent means another reader cleared it; a marker that
    // no longer qualifies (an epoch was recorded meanwhile) keeps today's handling.
    return readServerInputMarker(deps.storage, marker.operationId) === null
}

export type ServerInputClientOutcome =
    | { kind: 'unsupported' }
    | { kind: 'blocked', reason: string }
    | { kind: 'rejected', operationId: string }
    | { kind: 'unknown', operationId: string }
    | { kind: 'accepted', operationId: string, state: string | null, clearDraft: boolean }

const activeInputStates = new Set([
    'input-queued', 'input-waiting-predecessor',
    'input-attached', 'input-generating',
])
const acceptedButBlocked = new Set([
    'input-blocked_edit', 'input-execution-unknown',
    'input-transform-unknown', 'input-failed', 'input-cancelled',
    'result-ready', 'delivery-failed',
])

// A lost admission reply can leave an uncertain marker after the server has
// committed. Transfer only that proven terminal operation to the existing
// accepted-marker hydration/ACK owner; promotion never acknowledges a result.
export async function reconcileCommittedServerInputMarkers(
    deps: Pick<ServerInputClientDependencies, 'storage' | 'status' | 'isCurrent' | 'now' | 'onStorageResetCleared'> & { isIdle: () => boolean },
    target: { charId: string; chatId: string },
): Promise<number> {
    const now = deps.now || Date.now
    const grace = SERVER_INPUT_START_WINDOW_MS + SERVER_INPUT_START_ATTEMPT_TIMEOUT_MS
    if (!deps.isCurrent() || !deps.isIdle()) return 0
    let promoted = 0
    for (const marker of readServerInputMarkers(deps.storage, now()).filter(row => (
        row.charId === target.charId && row.chatId === target.chatId && row.state === 'uncertain'
    ))) {
        if (!deps.isCurrent() || !deps.isIdle()) break
        if (now() - marker.createdAt < grace) continue
        try {
            const response = await boundedRecoveryRead(
                signal => deps.status(marker.operationId, signal), RECOVERY_BODY_TIMEOUT_MS,
            )
            if (!deps.isCurrent() || !deps.isIdle()) continue
            const body = response.body as Record<string, unknown> | null
            const classified = classifyOrchestrationStatusResponse(response.status, body, marker.operationId)
            if (classified === 'missing' && clearedForStorageReset(deps, marker, body)) continue
            if (classified === 'accepted') stampServerInputStorageEpoch(deps.storage, marker, body)
            const receipt = serverChatCommitReceipt(body)
            if (classified !== 'accepted'
                || body?.state !== 'chat-committed' || !receipt
                || receipt.operationId !== marker.operationId
                || receipt.requestedCharId !== target.charId
                || receipt.requestedChatId !== target.chatId) continue
            let changed = false
            const updated = updateServerInputMarker(deps.storage, marker.operationId, current => {
                if (!deps.isCurrent() || !deps.isIdle() || current.state !== 'uncertain'
                    || current.charId !== marker.charId || current.chatId !== marker.chatId
                    || current.createdAt !== marker.createdAt || current.localRevision !== marker.localRevision
                    || current.baseRevision !== marker.baseRevision || current.adoptedRevision !== marker.adoptedRevision
                    || now() - current.createdAt < grace) return current
                changed = true
                const storageEpoch = responseStorageEpoch(body)
                return {
                    ...current, state: 'accepted',
                    ...(storageEpoch !== null && current.storageEpoch === undefined
                        ? { epochVersion: 1 as const, storageEpoch } : {}),
                }
            })
            if (updated && changed) promoted++
        } catch { /* Keep ownership until exact status and marker storage are available. */ }
    }
    return promoted
}

export async function submitServerInputCommand(
    deps: ServerInputClientDependencies,
    request: {
        charId: string
        chatId: string
        rawText: string
        draftId?: string
        replaceBlockedOperationId?: string
        inputPreparation?: 'client'
    },
): Promise<ServerInputClientOutcome> {
    const now = deps.now || Date.now
    if (!request.charId || !request.chatId || !request.rawText) {
        return { kind: 'blocked', reason: 'input-invalid' }
    }
    const stored = readServerInputMarkers(deps.storage, now())
        .filter(marker => marker.charId === request.charId && marker.chatId === request.chatId)
    const active: ServerInputMarker[] = []
    for (const marker of stored) {
        let outcome: HttpOutcome
        try {
            // This pre-admission observation is outside the POST reconciler's
            // attempt budget. Bound its headers/body without changing that owner.
            outcome = await boundedRecoveryRead(
                signal => deps.status(marker.operationId, signal), RECOVERY_BODY_TIMEOUT_MS,
            )
        }
        catch { return { kind: 'blocked', reason: 'prior-operation-unavailable' } }
        const status = classifyOrchestrationStatusResponse(
            outcome.status, outcome.body, marker.operationId,
        )
        // A storage reset removed the operation: clear with a notice and send.
        if (status === 'missing' && clearedForStorageReset(deps, marker, outcome.body)) continue
        if (status === 'missing' && marker.state === 'uncertain') {
            clearServerInputMarker(deps.storage, marker.operationId)
            continue
        }
        if (status !== 'accepted') {
            return { kind: 'blocked', reason: 'prior-operation-unknown' }
        }
        stampServerInputStorageEpoch(deps.storage, marker, outcome.body)
        const body = outcome.body as { state?: unknown; blockedByOperationId?: unknown }
        if (body.state === 'input-cancelled' && deps.settleCancelledInput) {
            try { if (await deps.settleCancelledInput(marker.operationId)) continue }
            catch { return { kind: 'blocked', reason: 'prior-operation-unavailable' } }
        }
        if (body.state === 'input-failed'
            && deps.settleFinishedInput) {
            try { if (await deps.settleFinishedInput(marker.operationId)) continue }
            catch { return { kind: 'blocked', reason: 'prior-operation-unavailable' } }
        }
        if (body.state === 'input-retried') {
            clearServerInputMarker(deps.storage, marker.operationId)
            continue
        }
        if (marker.operationId === request.replaceBlockedOperationId
            && body.state === 'input-blocked_edit') continue
        if (request.replaceBlockedOperationId && body.state === 'input-blocked_edit'
            && body.blockedByOperationId === request.replaceBlockedOperationId) continue
        if (typeof body.state !== 'string' || !activeInputStates.has(body.state)) {
            return { kind: 'blocked', reason: 'prior-operation-needs-reconciliation' }
        }
        if (marker.state === 'uncertain') {
            // The previous draft may still be visible because its POST response was lost.
            // Confirm ownership, but do not reinterpret that same draft as N+1.
            return { kind: 'blocked', reason: 'prior-operation-accepted' }
        }
        active.push({ ...marker, state: 'accepted' })
    }
    if (active.length >= 2) return { kind: 'blocked', reason: 'input-queue-full' }

    let capability: Capability | null
    try { capability = await deps.readCapability() }
    catch { return { kind: 'blocked', reason: 'capability-unavailable' } }
    if (!capability || capability.contract !== 'bg_orchestration_capabilities.v1'
        || capability.inputCommandVersion !== 1
        || capability.serverInputBaseVersion !== 1
        || (request.inputPreparation === 'client' && capability.clientInputPreparationVersion !== 1)
        || capability.serverChatCommitVersion !== 1
        || capability.chatExecutionProjectionVersion !== 1) {
        return active.length > 0
            ? { kind: 'blocked', reason: 'capability-downgraded' }
            : { kind: 'unsupported' }
    }
    if (deps.configurationAllowed && !deps.configurationAllowed(capability)) {
        return { kind: 'blocked', reason: 'capability-downgraded' }
    }
    if (typeof request.draftId !== 'string'
        || !/^[A-Za-z0-9_-]{8,128}$/.test(request.draftId)) {
        return { kind: 'blocked', reason: 'draft-identity-unavailable' }
    }
    if (!deps.isCurrent()) return { kind: 'blocked', reason: 'selection-changed' }
    try { await deps.flushSettings() }
    catch { return { kind: 'blocked', reason: 'settings-save-failed' } }
    if (!deps.isCurrent()) return { kind: 'blocked', reason: 'selection-changed' }

    let localRevision: string
    let server: { revision: string; viewRevision: string } | null
    let pendingInputs: ServerPendingInput[]
    let canonicalReadStage: 'local-revision' | 'server-chat' | 'pending-inputs' = 'local-revision'
    try {
        localRevision = deps.readLocalRevision()
        canonicalReadStage = 'server-chat'
        server = await deps.peekServerChat()
        canonicalReadStage = 'pending-inputs'
        pendingInputs = server ? await deps.readPendingInputs(server.revision) : []
    } catch (error) {
        // Fixed categories only: errors may contain chat text, URLs or credentials.
        // Diagnostics must never change the existing admission/draft outcome.
        try {
            const errorName = error instanceof Error ? error.name : 'UnknownError'
            const errorKind = [
                'Error', 'TypeError', 'RangeError', 'SyntaxError', 'AbortError', 'TimeoutError',
            ].includes(errorName) ? errorName : 'UnknownError'
            console.warn('[bg-input] canonical read failed:' + canonicalReadStage + ':' + errorKind)
        } catch { /* Logging is observational. */ }
        return { kind: 'blocked', reason: 'canonical-chat-unavailable' }
    }
    if (!deps.isCurrent()) return { kind: 'blocked', reason: 'selection-changed' }
    try {
        if (deps.readLocalRevision() !== localRevision) {
            return { kind: 'blocked', reason: 'local-chat-changed' }
        }
    } catch { return { kind: 'blocked', reason: 'local-chat-changed' } }
    if (request.replaceBlockedOperationId) {
        const blocked = pendingInputs.find(input => (
            input.operationId === request.replaceBlockedOperationId
            && input.state === 'blocked_edit'
            && input.retryAllowed === true
            && input.rawText === request.rawText
            && input.inputCommandId === request.draftId
        ))
        if (!blocked) return { kind: 'blocked', reason: 'blocked-input-unavailable' }
        pendingInputs = pendingInputs.filter(input => input !== blocked
            && input.blockedByOperationId !== blocked.operationId)
    }
    const known = active.slice().reverse().find(marker => (
        marker.localRevision === localRevision
        && pendingInputs.some(pending => pending.operationId === marker.operationId)
    )) || null
    const base = chooseServerInputBase({
        charId: request.charId,
        chatId: request.chatId,
        localRevision,
        serverRevision: server?.revision || null,
        serverViewRevision: server?.viewRevision || null,
        pendingInputs,
        knownInput: known,
    })
    if (base.ready === false) return { kind: 'blocked', reason: base.reason }

    const operationId = deps.newId()
    const createdAt = now()
    const body: Record<string, unknown> = {
        selectedCharId: request.charId,
        selectedChatId: request.chatId,
        chatProcessIndex: -1,
        currentChat: { id: request.chatId, message: [] },
        detached: true,
        operationId,
        baseChatRevision: base.baseRevision,
        resultOrderVersion: 1,
        startAckVersion: 1,
        resultKeyVersion: 1,
        serverChatCommitVersion: 1,
        inputCommandVersion: 1,
        inputCommand: {
            ...(request.inputPreparation === 'client' ? { inputPreparation: 'client' } : {}),
            inputCommandId: request.draftId,
            userMessageId: deps.newId(),
            rawText: request.rawText,
            submittedAt: createdAt,
            ...(request.replaceBlockedOperationId ? {
                replaceBlockedOperationId: request.replaceBlockedOperationId,
            } : {}),
        },
    }
    try {
        writeServerInputMarker(deps.storage, {
            operationId, charId: request.charId, chatId: request.chatId,
            localRevision, baseRevision: base.baseRevision,
            state: 'uncertain', createdAt, epochVersion: 1,
        })
    } catch {
        return { kind: 'blocked', reason: 'recovery-marker-unavailable' }
    }
    const started = await reconcileServerInputStart({
        operationId,
        start: signal => deps.start(body, signal),
        status: signal => deps.status(operationId, signal),
        isCurrent: deps.isCurrent,
        deadlineAt: createdAt + SERVER_INPUT_START_WINDOW_MS,
        now,
        wait: deps.wait,
    })
    if (started.resolution === 'rejected') {
        clearServerInputMarker(deps.storage, operationId)
        if (started.rejectedReason === 'input_command_identity_conflict') {
            return { kind: 'blocked', reason: 'draft-already-submitted' }
        }
        return { kind: 'rejected', operationId }
    }
    if (started.resolution === 'unknown') return { kind: 'unknown', operationId }
    try {
        if (!updateServerInputMarker(deps.storage, operationId, marker => ({
            ...marker, state: 'accepted',
            ...(started.storageEpoch !== undefined ? { epochVersion: 1 as const, storageEpoch: started.storageEpoch } : {}),
        }))) return { kind: 'unknown', operationId }
    } catch { return { kind: 'unknown', operationId } }
    if (request.replaceBlockedOperationId) {
        clearServerInputMarker(deps.storage, request.replaceBlockedOperationId)
    }
    return {
        kind: 'accepted', operationId, state: started.state,
        clearDraft: !started.state || !acceptedButBlocked.has(started.state),
    }
}
