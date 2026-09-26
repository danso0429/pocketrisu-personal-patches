export interface ServerPendingInput {
    operationId: string
    admissionSeq: number
    state: 'queued' | 'waiting_predecessor' | 'blocked_edit'
        | 'attached' | 'generating' | 'execution_unknown'
    attachedRevision?: string
    inputReceiptId?: string
    rawText?: string
    inputCommandId?: string
    retryAllowed?: boolean
}

const states = new Set<ServerPendingInput['state']>([
    'queued', 'waiting_predecessor', 'blocked_edit',
    'attached', 'generating', 'execution_unknown',
])

export function parseServerPendingInputs(projection: unknown): ServerPendingInput[] {
    if (projection === null) return []
    if (!projection || typeof projection !== 'object') {
        throw new Error('server pending input projection is invalid')
    }
    const source = projection as Record<string, unknown>
    if (source.found !== true || !Array.isArray(source.pendingInputCommands)) {
        throw new Error('server pending input projection is invalid')
    }
    const rows = source.pendingInputCommands as unknown[]
    const result: ServerPendingInput[] = []
    const seen = new Set<string>()
    for (const value of rows) {
        if (!value || typeof value !== 'object') {
            throw new Error('server pending input row is invalid')
        }
        const row = value as Record<string, unknown>
        if (typeof row.operationId !== 'string' || row.operationId.length === 0
            || row.operationId.length > 128 || seen.has(row.operationId)
            || !Number.isSafeInteger(row.admissionSeq) || Number(row.admissionSeq) <= 0
            || !states.has(row.state as ServerPendingInput['state'])
            || (row.retryAllowed !== undefined && typeof row.retryAllowed !== 'boolean')
            || (row.state === 'blocked_edit'
                && (row.rawText !== undefined || row.inputCommandId !== undefined)
                && (typeof row.rawText !== 'string' || row.rawText.length === 0
                    || row.rawText.length > 1024 * 1024
                    || typeof row.inputCommandId !== 'string'
                    || !/^[A-Za-z0-9_-]{8,128}$/.test(row.inputCommandId)))
            || ((row.attachedRevision !== undefined || row.inputReceiptId !== undefined)
                && (typeof row.attachedRevision !== 'string'
                    || !/^[a-f0-9]{64}$/.test(row.attachedRevision)
                    || typeof row.inputReceiptId !== 'string'
                    || !/^[a-f0-9]{64}$/.test(row.inputReceiptId)))) {
            throw new Error('server pending input row is invalid')
        }
        seen.add(row.operationId)
        result.push({
            operationId: row.operationId,
            admissionSeq: Number(row.admissionSeq),
            state: row.state as ServerPendingInput['state'],
            ...(typeof row.attachedRevision === 'string' ? {
                attachedRevision: row.attachedRevision,
                inputReceiptId: row.inputReceiptId as string,
            } : {}),
            ...(row.state === 'blocked_edit' && typeof row.rawText === 'string' ? {
                rawText: row.rawText,
                inputCommandId: row.inputCommandId as string,
                retryAllowed: row.retryAllowed === true,
            } : {}),
        })
    }
    return result.sort((left, right) => left.admissionSeq - right.admissionSeq)
}
