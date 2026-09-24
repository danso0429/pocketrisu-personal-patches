import { classifyOrchestrationStatusResponse } from './bgOrchestrationStart'
import { chooseServerInputBase } from './bgServerInputAdmission'
import {
    clearServerInputMarker,
    readServerInputMarkers,
    updateServerInputMarker,
    writeServerInputMarker,
    type ServerInputMarker,
} from './bgServerInputLedger'
import { reconcileServerInputStart } from './bgServerInputStart'
import type { MarkerStorage } from './bgOrchestrationPending'
import type { ServerPendingInput } from './bgServerPendingProjection'

interface HttpOutcome {
    status: number
    body: unknown
}

interface Capability {
    contract?: unknown
    inputCommandVersion?: unknown
    serverChatCommitVersion?: unknown
    chatExecutionProjectionVersion?: unknown
}

export interface ServerInputClientDependencies {
    storage: MarkerStorage
    readCapability: () => Promise<Capability | null>
    flushSettings: () => Promise<void>
    readLocalRevision: () => string
    peekServerChat: () => Promise<{ revision: string } | null>
    readPendingInputs: (revision: string) => Promise<ServerPendingInput[]>
    start: (body: Record<string, unknown>, signal: AbortSignal) => Promise<HttpOutcome>
    status: (operationId: string, signal: AbortSignal) => Promise<HttpOutcome>
    newId: () => string
    isCurrent: () => boolean
    now?: () => number
    wait?: (ms: number) => Promise<void>
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

export async function submitServerInputCommand(
    deps: ServerInputClientDependencies,
    request: { charId: string, chatId: string, rawText: string },
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
        try { outcome = await deps.status(marker.operationId, new AbortController().signal) }
        catch { return { kind: 'blocked', reason: 'prior-operation-unavailable' } }
        const status = classifyOrchestrationStatusResponse(
            outcome.status, outcome.body, marker.operationId,
        )
        if (status === 'missing' && marker.state === 'uncertain') {
            clearServerInputMarker(deps.storage, marker.operationId)
            continue
        }
        if (status !== 'accepted') {
            return { kind: 'blocked', reason: 'prior-operation-unknown' }
        }
        const body = outcome.body as { state?: unknown }
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
        || capability.serverChatCommitVersion !== 1
        || capability.chatExecutionProjectionVersion !== 1) {
        return active.length > 0
            ? { kind: 'blocked', reason: 'capability-downgraded' }
            : { kind: 'unsupported' }
    }
    if (!deps.isCurrent()) return { kind: 'blocked', reason: 'selection-changed' }
    try { await deps.flushSettings() }
    catch { return { kind: 'blocked', reason: 'settings-save-failed' } }
    if (!deps.isCurrent()) return { kind: 'blocked', reason: 'selection-changed' }

    let localRevision: string
    let server: { revision: string } | null
    let pendingInputs: ServerPendingInput[]
    try {
        localRevision = deps.readLocalRevision()
        server = await deps.peekServerChat()
        pendingInputs = server ? await deps.readPendingInputs(server.revision) : []
    } catch {
        return { kind: 'blocked', reason: 'canonical-chat-unavailable' }
    }
    if (!deps.isCurrent()) return { kind: 'blocked', reason: 'selection-changed' }
    try {
        if (deps.readLocalRevision() !== localRevision) {
            return { kind: 'blocked', reason: 'local-chat-changed' }
        }
    } catch { return { kind: 'blocked', reason: 'local-chat-changed' } }
    const known = active.slice().reverse().find(marker => (
        marker.localRevision === localRevision
        && pendingInputs.some(pending => pending.operationId === marker.operationId)
    )) || null
    const base = chooseServerInputBase({
        charId: request.charId,
        chatId: request.chatId,
        localRevision,
        serverRevision: server?.revision || null,
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
            inputCommandId: deps.newId(),
            userMessageId: deps.newId(),
            rawText: request.rawText,
            submittedAt: createdAt,
        },
    }
    try {
        writeServerInputMarker(deps.storage, {
            operationId, charId: request.charId, chatId: request.chatId,
            localRevision, baseRevision: base.baseRevision,
            state: 'uncertain', createdAt,
        })
    } catch {
        return { kind: 'blocked', reason: 'recovery-marker-unavailable' }
    }
    const started = await reconcileServerInputStart({
        operationId,
        start: signal => deps.start(body, signal),
        status: signal => deps.status(operationId, signal),
        isCurrent: deps.isCurrent,
        deadlineAt: createdAt + 60_000,
        now,
        wait: deps.wait,
    })
    if (started.resolution === 'rejected') {
        clearServerInputMarker(deps.storage, operationId)
        return { kind: 'rejected', operationId }
    }
    if (started.resolution === 'unknown') return { kind: 'unknown', operationId }
    try {
        if (!updateServerInputMarker(deps.storage, operationId, marker => ({
            ...marker, state: 'accepted',
        }))) return { kind: 'unknown', operationId }
    } catch { return { kind: 'unknown', operationId } }
    return {
        kind: 'accepted', operationId, state: started.state,
        clearDraft: !started.state || !acceptedButBlocked.has(started.state),
    }
}
