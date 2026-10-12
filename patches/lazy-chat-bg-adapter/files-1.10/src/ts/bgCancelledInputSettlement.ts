import { orchestrationChatRevision } from './bgOrchestrationMerge'
import type { ServerInputMarker } from './bgServerInputLedger'

interface CancelledInputProof {
    contractVersion: 'bg_cancelled_input_proof.v1'
    operationId: string; charId: string; chatId: string; userMessageId: string
    attachment: 'attached' | 'none'; inputReceiptId: string | null
    attachedRevision: string | null; currentRevision: string; allowEditedInput: boolean
}
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
export function parseCancelledInputProof(value: any, marker: ServerInputMarker): CancelledInputProof | null {
    if (value?.contractVersion !== 'bg_cancelled_input_proof.v1' || marker.state !== 'accepted'
        || value.operationId !== marker.operationId || value.charId !== marker.charId || value.chatId !== marker.chatId
        || typeof value.userMessageId !== 'string' || !value.userMessageId || value.userMessageId.length > 255
        || !hash(value.currentRevision) || typeof value.allowEditedInput !== 'boolean') return null
    if (value.attachment === 'attached' && hash(value.inputReceiptId) && hash(value.attachedRevision)) return value
    if (value.attachment === 'none' && value.inputReceiptId === null && value.attachedRevision === null
        && value.allowEditedInput === false) return value
    return null
}

export async function settleCancelledInput(options: {
    marker: ServerInputMarker
    readProof(): Promise<unknown>; readCanonical(): Promise<{ chat: any; revision: string } | null>
    readLocal(): any; readMarker(): ServerInputMarker | null; isCurrent(): boolean
    savedBaseView(): string | null; hasUnconfirmedWrite(): boolean
    adopt(revision: string, allowedView: string): Promise<boolean>; clear(): void
}): Promise<boolean> {
    const { marker } = options
    try {
        if (!options.isCurrent()) return false
        const proof = parseCancelledInputProof(await options.readProof(), marker)
        if (!proof || !options.isCurrent()) return false
        const canonical = await options.readCanonical()
        if (!canonical || canonical.chat?.id !== marker.chatId || canonical.revision !== proof.currentRevision
            || !Array.isArray(canonical.chat.message) || !options.isCurrent()) return false
        const rows = (chat: any) => Array.isArray(chat?.message)
            ? chat.message.filter((message: any) => message?.chatId === proof.userMessageId) : null
        const validOwned = (chat: any) => {
            const owned = rows(chat)
            return chat?.id === marker.chatId && owned?.length === 1 && owned[0].role === 'user'
        }
        let local = options.readLocal(), expectedView = marker.localRevision
        if (proof.attachment === 'none') {
            if (rows(canonical.chat)?.length !== 0 || rows(local)?.length !== 0 || options.hasUnconfirmedWrite()
                || orchestrationChatRevision(local) !== orchestrationChatRevision(canonical.chat)) return false
        } else {
            if (!validOwned(canonical.chat) || !rows(local)) return false
            if (rows(local)!.length === 0) {
                if (marker.adoptedRevision || options.hasUnconfirmedWrite()
                    || options.savedBaseView() !== marker.localRevision
                    || orchestrationChatRevision(local) !== marker.localRevision
                    || !await options.adopt(proof.currentRevision, marker.localRevision)
                    || !options.isCurrent()) return false
                local = options.readLocal()
                expectedView = orchestrationChatRevision(local)
            }
            if (!validOwned(local) || (!proof.allowEditedInput
                && orchestrationChatRevision({ id: marker.chatId, message: rows(local) })
                    !== orchestrationChatRevision({ id: marker.chatId, message: rows(canonical.chat) }))) return false
        }
        // Recheck the cancellation/receipt, not a stale snapshot revision: an
        // ordinary save or a queued successor may have advanced the server.
        const fresh = parseCancelledInputProof(await options.readProof(), marker)
        if (!fresh || !options.isCurrent() || fresh.attachment !== proof.attachment
            || fresh.inputReceiptId !== proof.inputReceiptId || fresh.userMessageId !== proof.userMessageId
            || fresh.attachedRevision !== proof.attachedRevision) return false
        if (proof.attachment === 'attached' && !validOwned(options.readLocal())) return false
        if (proof.attachment === 'none' && (fresh.currentRevision !== canonical.revision
            || options.hasUnconfirmedWrite() || orchestrationChatRevision(options.readLocal()) !== orchestrationChatRevision(canonical.chat))) return false
        const current = options.readMarker()
        if (!current || current.state !== 'accepted' || current.operationId !== marker.operationId
            || current.charId !== marker.charId || current.chatId !== marker.chatId
            || current.createdAt !== marker.createdAt || current.baseRevision !== marker.baseRevision
            || current.localRevision !== expectedView) return false
        options.clear()
        return true
    } catch { return false }
}
