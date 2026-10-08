'use strict';

module.exports = `
let readinessCheckQueued = false
let readinessCheckRunning = false
let readinessCheckAgain = false
let readinessExecutionRequested = false
function requestReadinessEvidence(): void {
    readinessExecutionRequested = true
    scheduleReadinessCheck()
}
function scheduleReadinessCheck(): void {
    if (readinessCheckRunning) { readinessCheckAgain = true; return }
    if (readinessCheckQueued) return
    readinessCheckQueued = true
    setTimeout(() => {
        readinessCheckQueued = false
        void recheckSelectedRecoveryReadiness().catch(() => { /* Initialization may precede stores. Keep readiness pending. */ })
    }, 0)
}

async function recheckSelectedRecoveryReadiness(): Promise<void> {
    if (readinessCheckRunning || recoveryAdmissionDepth || get(doingChat)) return
    if (!reconciliationReadiness.targets().length) return
    const character: any = (DBState as any)?.db?.characters?.[get(selectedCharID)]
    const chats = character?.chats
    const chat = chats?.[character?.chatPage]
    if (!character?.chaId || !chat?.id || chat._placeholder
        || !reconciliationReadiness.pending(character.chaId, chat.id)) return
    const charId = character.chaId, chatId = chat.id
    const epoch = reconciliationReadiness.capture(charId, chatId)
    const isCurrent = () => !recoveryAdmissionDepth && !get(doingChat)
        && reconciliationReadiness.capture(charId, chatId) === epoch
        && (DBState as any)?.db?.characters?.[get(selectedCharID)] === character
        && character.chats === chats && chats[character.chatPage] === chat
    readinessCheckRunning = true
    readinessCheckAgain = false
    try {
        // Parked/seeded markers contain no execution-completion authority. Re-read
        // their exact operation before accepting a current canonical chat view.
        for (const operation of reconciliationReadiness.operations(charId, chatId)) {
            if (operation.terminal) continue
            if (watchKey || bootRecoveryActive) return
            if (!readinessExecutionRequested) return
            readinessExecutionRequested = false
            const marker = readPendingMarkers(localStorage).find(value => value.operationId === operation.operationId
                && value.charId === charId && value.chatId === chatId)
            const input = readServerInputMarkers(localStorage).find(value => value.operationId === operation.operationId
                && value.charId === charId && value.chatId === chatId)
            if (!marker && !input) return
            const response = await fetchRecoveryControl(clientBuildFetch,
                orchestrationResultUrl(charId, chatId, operation.operationId, marker?.resultKeyVersion ?? 1),
                { method: 'GET', credentials: 'same-origin' })
            if (!response.ok || !isCurrent()) return
            const evidence = await readRecoveryJson(response)
            // A terminal legacy result still needs its client-owned merge/save.
            // Equality of the pre-result chat is not evidence of its publication.
            if (evidence?.found === true && serverChatDeliveryDisposition(evidence) === 'legacy-client-owned') return
            if (evidence?.found === true && serverChatDeliveryDisposition(evidence) !== 'server-committed'
                && !isFinishedServerFailure(evidence, marker?.baselineMsgs ?? 0)) return
            if (!isCurrent() || (evidence?.operationId ?? serverChatCommitReceipt(evidence)?.operationId) !== operation.operationId
                || !(isTerminalCommittedEvidence(evidence) || isFinishedServerFailure(evidence, marker?.baselineMsgs ?? 0)
                    || (evidence.found === false && evidence.stage === 0
                        && ['delivered', 'cancelled', 'start-retry-required', 'interrupted-before-result'].includes(evidence.operationState)))) return
            reconciliationReadiness.classifyTerminal(charId, chatId, operation.operationId)
            // Classification changes the epoch; retry the whole proof with that
            // captured epoch, never reinterpret an earlier snapshot as current.
            requestReadinessEvidence()
            return
        }
        if (!reconciliationReadiness.terminal(charId, chatId)) return
        const snapshot = await peekServerChatSnapshot(charId, character.chatPage, chatId)
        if (!snapshot?.revision || !isCurrent()) return
        const projection: any = await readServerChatExecutionProjection(charId, chatId, snapshot.revision)
        if (!isCurrent() || projection?.contract !== 'bg_chat_execution_projection.v1'
            || projection.charId !== charId || projection.chatId !== chatId
            || projection.coverage !== 'authoritative' || !Array.isArray(projection.owners)
            || !Array.isArray(projection.pendingInputCommands) || projection.pendingInputCommands.length
            || projection.chatRevision !== snapshot.revision) return
        // requireCurrent uses an independent fresh snapshot and rejects ambiguous
        // or in-flight saves. It never replaces a slot or broadens old-base proof.
        const result = await adoptServerCommittedChat(chats, charId, chatId, projection.chatRevision,
            [], orchestrationChatRevision, undefined, { requireCurrent: true, isCurrent })
        if (isCurrent() && result.adopted && result.chat === chat) {
            reconciliationReadiness.verifyTarget(charId, chatId, epoch)
        }
    } catch { /* Keep the observable pending reason; retry only on new evidence. */ }
    finally {
        readinessCheckRunning = false
        if (readinessCheckAgain) { readinessCheckAgain = false; scheduleReadinessCheck() }
    }
}

try {
    reconciliationReadiness.subscribe(scheduleReadinessCheck)
    doingChat.subscribe(busy => { if (!busy) scheduleReadinessCheck() })
    let previousSelection: number | undefined
    selectedCharID.subscribe(selection => {
        if (previousSelection !== undefined && previousSelection !== selection) requestReadinessEvidence()
        previousSelection = selection
    })
    if (typeof window !== 'undefined') {
        window.addEventListener('bg-recovery-evidence', requestReadinessEvidence)
        window.addEventListener('bg-reconciliation-request', requestReadinessEvidence)
        window.addEventListener('bg-server-input-updated', () => {
            seedReconciliationReadiness()
            scheduleReadinessCheck()
        })
        window.addEventListener('online', requestReadinessEvidence)
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') requestReadinessEvidence()
        })
    }
} catch { /* Server runtime does not own browser readiness. */ }
`;
