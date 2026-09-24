import type { ServerPendingInput } from './bgServerPendingProjection'

export interface KnownServerInput {
    charId: string
    chatId: string
    operationId: string
    localRevision: string
}

export type ServerInputBaseDecision =
    | { ready: true, baseRevision: string }
    | { ready: false, reason: 'local-chat-changed' | 'server-chat-unavailable'
        | 'unresolved-server-input' }

const activeStates = new Set<ServerPendingInput['state']>([
    'queued', 'waiting_predecessor', 'attached', 'generating',
])

export function chooseServerInputBase(options: {
    charId: string
    chatId: string
    localRevision: string
    serverRevision: string | null
    pendingInputs: ServerPendingInput[]
    knownInput: KnownServerInput | null
}): ServerInputBaseDecision {
    if (!options.serverRevision || !/^[a-f0-9]{64}$/.test(options.serverRevision)) {
        return { ready: false, reason: 'server-chat-unavailable' }
    }
    if (options.pendingInputs.some(input => (
        input.state === 'blocked_edit' || input.state === 'execution_unknown'
    ))) {
        return { ready: false, reason: 'unresolved-server-input' }
    }
    if (options.localRevision === options.serverRevision) {
        return { ready: true, baseRevision: options.serverRevision }
    }
    const known = options.knownInput
    if (known?.charId !== options.charId || known.chatId !== options.chatId
        || known.localRevision !== options.localRevision
        || !options.pendingInputs.some(input => (
            input.operationId === known.operationId && activeStates.has(input.state)
        ))) {
        return { ready: false, reason: 'local-chat-changed' }
    }
    return { ready: true, baseRevision: options.serverRevision }
}
