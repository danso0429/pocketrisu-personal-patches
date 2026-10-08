export interface ServerChatCommitReceiptV1 {
    contractVersion: 'bg_server_chat_commit.v1'
    commitReceiptId: string
    operationId: string
    resultId: string
    publishSeq: number
    requestedCharId: string
    requestedChatId: string
    storedChatId: string
    baseChatRevision: string
    anchoredBaseRevision?: string
    promptInputsChanged?: boolean
    storedRevision: string
    storageDisposition: 'original'
    chatCommitted: true
    finalContentHash: string
    effects: {
        chat: { status: 'committed', reason?: string }
        metadata: { status: 'committed' }
    }
}

export interface ChatExecutionProjectionV1 {
    contract: 'bg_chat_execution_projection.v1'
    charId: string
    chatId: string
    chatRevision: string
    coverage: 'authoritative'
    owners: unknown[]
    pendingInputCommands: unknown[]
}

function requiredText(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0 && value.length <= 4096
}

export function serverChatCommitReceipt(data: unknown): ServerChatCommitReceiptV1 | null {
    if (!data || typeof data !== 'object') return null
    const source = (data as any).serverChatCommit
    const receipt = source?.status === 'committed' ? source.receipt : source
    if (!receipt || typeof receipt !== 'object'
        || receipt.contractVersion !== 'bg_server_chat_commit.v1'
        || !requiredText(receipt.commitReceiptId)
        || !requiredText(receipt.operationId)
        || !requiredText(receipt.resultId)
        || !Number.isSafeInteger(receipt.publishSeq) || receipt.publishSeq <= 0
        || !requiredText(receipt.requestedCharId)
        || !requiredText(receipt.requestedChatId)
        || !requiredText(receipt.storedChatId)
        || !requiredText(receipt.baseChatRevision)
        || (receipt.promptInputsChanged !== undefined && typeof receipt.promptInputsChanged !== 'boolean')
        || (receipt.anchoredBaseRevision !== undefined
            && (typeof receipt.anchoredBaseRevision !== 'string'
                || !/^[a-f0-9]{64}$/.test(receipt.anchoredBaseRevision)))
        || !requiredText(receipt.storedRevision)
        || receipt.storageDisposition !== 'original'
        || receipt.storedChatId !== receipt.requestedChatId
        || receipt.chatCommitted !== true
        || receipt.finalContentHash !== receipt.storedRevision
        || receipt.effects?.chat?.status !== 'committed'
        || receipt.effects?.metadata?.status !== 'committed') {
        return null
    }
    return receipt as ServerChatCommitReceiptV1
}

export type ServerChatDeliveryDisposition =
    | 'legacy-client-owned'
    | 'server-committed'
    | 'server-owned-uncommitted'

export function serverChatDeliveryDisposition(
    data: unknown,
): ServerChatDeliveryDisposition {
    if (serverChatCommitReceipt(data)) return 'server-committed'
    if (!data || typeof data !== 'object') return 'legacy-client-owned'
    const source = (data as any).serverChatCommit
    return (data as any).serverChatCommitVersion === 1
        || (!!source && typeof source === 'object')
        ? 'server-owned-uncommitted'
        : 'legacy-client-owned'
}

function validProjection(
    value: unknown,
    receipt: ServerChatCommitReceiptV1,
): value is ChatExecutionProjectionV1 {
    if (!value || typeof value !== 'object') return false
    const projection = value as any
    return projection.contract === 'bg_chat_execution_projection.v1'
        && projection.charId === receipt.requestedCharId
        && projection.chatId === receipt.storedChatId
        && requiredText(projection.chatRevision)
        && projection.coverage === 'authoritative'
        && Array.isArray(projection.owners)
        && Array.isArray(projection.pendingInputCommands)
}

export function isTerminalCommittedEvidence(data: any): boolean {
    if (!data || (typeof data.stage === 'number' && data.stage > 0)
        || ['queued', 'running', 'running-result-ready', 'running-result-consumed',
            'input-queued', 'input-attached', 'input-waiting-predecessor'].includes(data.operationState)) return false
    return (data.found === false && data.operationState === 'chat-committed' && data.stage === 0)
        || (data.final === true && ['terminal-success', 'terminal-partial'].includes(data.kind))
}

export async function hydrateServerCommittedOrchestration(options: {
    data: unknown
    operationId: string
    charId: string
    chatId: string
    allowedCurrentRevisions: string[]
    localTarget?: () => 'present' | 'absent' | 'character-missing'
    isCurrent?: () => boolean
    readProjection: (
        charId: string,
        chatId: string,
        revision: string,
    ) => Promise<unknown>
    adoptChat: (input: {
        charId: string
        chatId: string
        expectedServerRevision: string
        allowedCurrentRevisions: string[]
        savedServerRevision?: string
        requireCurrent?: boolean
    }) => Promise<{ adopted: boolean, reason?: string, chat?: unknown }>
}) {
    const receipt = serverChatCommitReceipt(options.data)
    const transport = options.data as any
    if (!receipt
        || receipt.operationId !== options.operationId
        || receipt.requestedCharId !== options.charId
        || receipt.requestedChatId !== options.chatId
        || (requiredText(transport?.operationId) && transport.operationId !== options.operationId)
        || (transport?.found === true && (!requiredText(transport.resultId)
            || !Number.isSafeInteger(transport.publishSeq)))
        || (requiredText(transport?.resultId) && transport.resultId !== receipt.resultId)
        || (Number.isSafeInteger(transport?.publishSeq)
            && transport.publishSeq !== receipt.publishSeq)) {
        return { hydrated: false as const, reason: 'commit-receipt-invalid' }
    }
    let projection: unknown
    try {
        projection = await options.readProjection(
            receipt.requestedCharId,
            receipt.storedChatId,
            receipt.storedRevision,
        )
    } catch {
        return { hydrated: false as const, reason: 'projection-unavailable' }
    }
    if (options.isCurrent?.() === false) return { hydrated: false as const, reason: 'stale-recovery' }
    if ((projection as any)?.kind === 'chat-missing'
        && (projection as any).currentRevision === null) {
        return { hydrated: false as const, reason: isTerminalCommittedEvidence(transport)
            && options.localTarget?.() === 'absent' ? 'target-deleted' : 'server-chat-missing' }
    }
    if (!validProjection(projection, receipt)) {
        return { hydrated: false as const, reason: 'projection-invalid' }
    }
    const ownsResult = projection.owners.some((owner: any) => owner?.operationId === receipt.operationId)
    const superseded = !ownsResult && projection.chatRevision !== receipt.storedRevision
        && isTerminalCommittedEvidence(transport)
    if (!ownsResult && !superseded) return { hydrated: false as const, reason: 'projection-invalid' }
    const projectionRevision = projection.chatRevision
    const allowedCurrentRevisions = [...new Set(
        options.allowedCurrentRevisions.filter(requiredText),
    )]
    let adoption: { adopted: boolean, reason?: string, chat?: unknown }
    try {
        adoption = await options.adoptChat({
            charId: receipt.requestedCharId,
            chatId: receipt.storedChatId,
            expectedServerRevision: projectionRevision,
            allowedCurrentRevisions,
            ...(receipt.anchoredBaseRevision ? { savedServerRevision: receipt.anchoredBaseRevision } : {}),
            ...(superseded ? { requireCurrent: true } : {}),
        })
    } catch {
        return { hydrated: false as const, reason: 'chat-readback-failed' }
    }
    if (options.isCurrent?.() === false) return { hydrated: false as const, reason: 'stale-recovery' }
    if (!adoption.adopted) {
        return {
            hydrated: false as const,
            reason: adoption.reason || 'chat-adoption-refused',
        }
    }
    if (superseded) return { hydrated: false as const, reason: 'superseded-current', receipt, projection }
    return {
        hydrated: true as const,
        receipt,
        projection,
        chat: adoption.chat,
    }
}
