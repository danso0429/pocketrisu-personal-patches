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
    storedRevision: string
    storageDisposition: 'original'
    chatCommitted: true
    finalContentHash: string
    effects: {
        chat: { status: 'committed' }
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
        && projection.owners.some((owner: unknown) => (
            !!owner && typeof owner === 'object'
            && (owner as any).operationId === receipt.operationId
        ))
        && Array.isArray(projection.pendingInputCommands)
}

export async function hydrateServerCommittedOrchestration(options: {
    data: unknown
    operationId: string
    charId: string
    chatId: string
    allowedCurrentRevisions: string[]
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
    }) => Promise<{ adopted: boolean, reason?: string, chat?: unknown }>
}) {
    const receipt = serverChatCommitReceipt(options.data)
    const transport = options.data as any
    if (!receipt
        || receipt.operationId !== options.operationId
        || receipt.requestedCharId !== options.charId
        || receipt.requestedChatId !== options.chatId
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
    if (!validProjection(projection, receipt)) {
        return { hydrated: false as const, reason: 'projection-invalid' }
    }
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
        })
    } catch {
        return { hydrated: false as const, reason: 'chat-readback-failed' }
    }
    if (!adoption.adopted) {
        return {
            hydrated: false as const,
            reason: adoption.reason || 'chat-adoption-refused',
        }
    }
    return {
        hydrated: true as const,
        receipt,
        projection,
        chat: adoption.chat,
    }
}
