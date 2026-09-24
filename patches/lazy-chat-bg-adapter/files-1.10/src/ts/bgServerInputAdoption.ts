import {
    advanceServerInputMarkerRevisions,
    readServerInputMarkers,
    type ServerInputMarker,
} from './bgServerInputLedger'
import type { MarkerStorage } from './bgOrchestrationPending'
import type { ServerPendingInput } from './bgServerPendingProjection'

export async function adoptAttachedServerInputs(options: {
    storage: MarkerStorage
    charId: string
    chatId: string
    pendingInputs: ServerPendingInput[]
    readLocalRevision: () => string | null
    adopt: (revision: string, allowedCurrentRevision: string) => Promise<{
        adopted: boolean
        revision?: string
    }>
    isCurrent: () => boolean
    now?: () => number
}): Promise<number> {
    let adopted = 0
    const now = options.now || Date.now
    for (const input of [...options.pendingInputs].sort((a, b) => a.admissionSeq - b.admissionSeq)) {
        if (!options.isCurrent()) break
        const marker: ServerInputMarker | undefined = readServerInputMarkers(options.storage, now())
            .find(row => row.operationId === input.operationId
                && row.charId === options.charId && row.chatId === options.chatId
                && row.state === 'accepted')
        if (!marker || !input.attachedRevision || !input.inputReceiptId
            || (input.state !== 'attached' && input.state !== 'generating')) continue
        const localRevision = options.readLocalRevision()
        if (localRevision === input.attachedRevision) {
            advanceServerInputMarkerRevisions(
                options.storage, options.charId, options.chatId,
                marker.localRevision, input.attachedRevision, now(),
            )
            continue
        }
        if (localRevision !== marker.localRevision) continue
        let result: { adopted: boolean, revision?: string }
        try { result = await options.adopt(input.attachedRevision, localRevision) }
        catch { continue }
        if (!options.isCurrent() || !result.adopted
            || result.revision !== input.attachedRevision) continue
        advanceServerInputMarkerRevisions(
            options.storage, options.charId, options.chatId,
            localRevision, input.attachedRevision, now(),
        )
        adopted += 1
    }
    return adopted
}
