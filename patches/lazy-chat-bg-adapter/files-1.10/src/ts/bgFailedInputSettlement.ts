import type { ServerInputMarker } from './bgServerInputLedger'
import { isFinishedServerFailure } from './bgFinishedOperation'
import { orchestrationChatRevision } from './bgOrchestrationMerge'

export interface FailedInputProof {
    contractVersion: 'bg_failed_input_proof.v1'
    operationId: string; charId: string; chatId: string; inputReceiptId: string
    userMessageId: string; attachedRevision: string; currentRevision: string; allowEditedInput: boolean
    inputPresent?: boolean
}
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
export function parseFailedInputProof(value: unknown, marker: ServerInputMarker): FailedInputProof | null {
    const p = value as FailedInputProof
    return p?.contractVersion === 'bg_failed_input_proof.v1' && p.operationId === marker.operationId
        && p.charId === marker.charId && p.chatId === marker.chatId && hash(p.inputReceiptId)
        && hash(p.attachedRevision) && hash(p.currentRevision) && typeof p.allowEditedInput === 'boolean'
        && (p.inputPresent === undefined || typeof p.inputPresent === 'boolean')
        && typeof p.userMessageId === 'string' && p.userMessageId.length > 0 && p.userMessageId.length <= 255 ? p : null
}
function matchingAck(value: any, p: FailedInputProof, resultId?: string): boolean {
    return value?.contractVersion === 'bg_failed_input_ack.v1' && value.operationId === p.operationId
        && value.charId === p.charId && value.chatId === p.chatId && value.inputReceiptId === p.inputReceiptId
        && value.userMessageId === p.userMessageId && value.attachedRevision === p.attachedRevision
        && typeof value.resultId === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(value.resultId)
        && (!resultId || value.resultId === resultId)
}
export async function settleFailedInput(options: {
    marker: ServerInputMarker; data: any
    readProof: () => Promise<{ proof: unknown, acknowledgement: unknown } | null>
    readCanonical: () => Promise<{ chat: any, revision: string } | null>
    readLocal: () => any; savedBaseView: () => string | null; isCurrent: () => boolean
    hasUnconfirmedWrite?: () => boolean
    adopt: (revision: string, allowedView: string) => Promise<boolean>
    acknowledge: (resultId: string) => Promise<'acked' | 'superseded' | 'unconfirmed'>
    clear: () => void
}): Promise<'acked' | 'superseded' | 'unconfirmed'> {
    const { marker, data } = options
    const live = data?.operationId === marker.operationId && isFinishedServerFailure(data, -1)
        && data.kind === 'terminal-error' && data.outcome === 'error'
        && data.anchorResultVersion === 1 && data.hasGeneratedAnswer === false
        && !data.serverChatCommit
        && !['interrupted-before-result', 'interrupted-after-main', 'delivery-failed'].includes(data.operationState)
    const absent = data?.operationId === marker.operationId && data.found === false
        && data.operationState === 'delivered' && !data.serverChatCommit
        && data.hasGeneratedAnswer !== true && data.kind !== 'terminal-partial' && data.outcome !== 'partial'
    if (!live && !absent) return 'unconfirmed'
    const resultId = typeof data.resultId === 'string' ? data.resultId : undefined
    if ((live && !resultId) || (resultId !== undefined && !/^[A-Za-z0-9_-]{8,128}$/.test(resultId))) return 'unconfirmed'
    const evidence = await options.readProof()
    const p = parseFailedInputProof(evidence?.proof, marker)
    if (!p || !options.isCurrent()) return 'unconfirmed'
    const alreadyAcked = matchingAck(evidence?.acknowledgement, p, resultId)
    if (!live && !alreadyAcked) return 'unconfirmed'
    const canonical = await options.readCanonical()
    if (!canonical || canonical.revision !== p.currentRevision || !options.isCurrent()) return 'unconfirmed'
    if (p.inputPresent === false) {
        const missing = (chat: any) => Array.isArray(chat?.message)
            && !chat.message.some((message: any) => message?.chatId === p.userMessageId)
        if (!alreadyAcked || options.hasUnconfirmedWrite?.() !== false
            || !missing(canonical.chat) || !missing(options.readLocal())) return 'unconfirmed'
        const retry = await options.readProof()
        const fresh = parseFailedInputProof(retry?.proof, marker)
        if (!options.isCurrent() || !fresh || fresh.inputPresent !== false
            || fresh.currentRevision !== canonical.revision || fresh.inputReceiptId !== p.inputReceiptId
            || !matchingAck(retry?.acknowledgement, fresh, (evidence?.acknowledgement as any)?.resultId)
            || options.hasUnconfirmedWrite?.() !== false || !missing(options.readLocal())) return 'unconfirmed'
        options.clear()
        return 'acked'
    }
    const owned = (chat: any) => Array.isArray(chat?.message)
        ? chat.message.filter((message: any) => message?.chatId === p.userMessageId && message.role === 'user') : []
    const serverMessages = owned(canonical.chat)
    if (serverMessages.length !== 1) return 'unconfirmed'
    let local = options.readLocal()
    if (owned(local).length === 0) {
        // A saved, unchanged admission base distinguishes missing publication
        // from edits/deletion after a snapshot was already observed.
        if (marker.adoptedRevision || options.savedBaseView() !== marker.localRevision
            || orchestrationChatRevision(local) !== marker.localRevision
            || !await options.adopt(p.currentRevision, marker.localRevision) || !options.isCurrent()) return 'unconfirmed'
        local = options.readLocal()
    }
    const localMessages = owned(local)
    if (localMessages.length !== 1 || (!p.allowEditedInput
        && orchestrationChatRevision({ id: p.chatId, message: localMessages })
            !== orchestrationChatRevision({ id: p.chatId, message: serverMessages }))) return 'unconfirmed'
    let acknowledgement = alreadyAcked ? 'acked' as const
        : resultId ? await options.acknowledge(resultId) : 'unconfirmed' as const
    if (acknowledgement === 'superseded') return acknowledgement
    if (acknowledgement !== 'acked') {
        const retry = await options.readProof()
        const fresh = parseFailedInputProof(retry?.proof, marker)
        if (fresh && fresh.inputReceiptId === p.inputReceiptId && fresh.userMessageId === p.userMessageId
            && matchingAck(retry?.acknowledgement, fresh, resultId)) acknowledgement = 'acked'
    }
    if (acknowledgement !== 'acked') return 'unconfirmed'
    // Only operation metadata is removed; no current chat or edit is replaced.
    options.clear()
    return 'acked'
}
