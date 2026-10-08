'use strict';

module.exports = prior => {
    const units = [], targetVersions = { pocketrisu: ['1.10.0'] };
    const related = ['bg-preserve', 'lazy-chat-sync', 'client-build-fence-bg-adapter', 'personal-settings',
        'client-build-fence', 'haejeok-persistence-safety-adapter', 'haejeok-chat-width-adapter',
        'kei-chat-render-bg-adapter', 'kei-partial-edit-bg-adapter']
        .flatMap(name => require(`../${name}/manifest.cjs`).units);
    const add = (name, file, anchor, content, first = false) => units.push({
        id: `lazy-chat-bg-adapter:recovery-read:${name}:1.10`, file, type: 'replace', anchor, content,
        ...(first ? { anchorPolicy: 'first' } : {}), targetVersions,
        after: [...prior, ...related, ...units].filter(unit => unit.file === file).map(unit => unit.id),
    });
    const orch = 'src/ts/bgOrchestrate.ts';
    add('observation-budget-comment', orch,
        `const ORCH_DEADLINE_MS = 900000 // 15 min — covers the worst flex-tier gen (main 2-5min + post);
                                // past this assume the gen was lost (server restart) and stop.`,
        `// Observation retry window and legacy-save safety budget, not a model deadline.
// Elapsed time alone never proves that server execution failed.
const ORCH_DEADLINE_MS = 900000`);
    add('control', orch, `async function fetchOrchestrationControl(
    url: string,
    init: RequestInit = {},
): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), ORCH_CONTROL_FETCH_TIMEOUT_MS)
    try {
/* POCKETRISU-PATCH:client-build-fence-bg-adapter:orchestration-control:1.9:START */
        return await clientBuildFetch(url, { ...init, signal: controller.signal })
/* POCKETRISU-PATCH:client-build-fence-bg-adapter:orchestration-control:1.9:END */    } finally {
        clearTimeout(timer)
    }
}`, `import { fetchRecoveryControl, readRecoveryJson } from './bgRecoveryRead'

async function fetchOrchestrationControl(url: string, init: RequestInit = {}): Promise<Response> {
    return fetchRecoveryControl(clientBuildFetch, url, init, ORCH_CONTROL_FETCH_TIMEOUT_MS)
}`);
    for (const [variable, count] of [['res', 7], ['response', 7], ['statusResponse', 1]]) {
        for (let index = 0; index < count; index++) {
            // This occurrence is a complete return statement. A multiline marker
            // around only its expression would turn it into a bare return (ASI).
            const wholeReturn = variable === 'response' && index === 2;
            const prefix = wholeReturn ? 'return ' : '';
            add(`body-${variable}-${index}`, orch,
                `${prefix}await ${variable}.json()`, `${prefix}await readRecoveryJson(${variable})`, !wholeReturn);
        }
    }
    const node = 'src/ts/storage/nodeStorage.ts';
    add('pending-save-proof', node, '    savedChatViewRevision(\n', `    chatReadProofToken(chaId: string, chatId: string): unknown {
        return this.chatSyncStates.get(this.chatSyncKey(chaId, chatId))
    }

    hasUnconfirmedChatWrite(chaId: string, chatId: string): boolean {
        const key = this.chatSyncKey(chaId, chatId)
        return this.chatSyncStates.get(key)?.unknownAck === true || this.chatSaveTails.has(key)
    }

    savedChatViewRevision(
`);
    add('snapshot-signal', node, `    private async readServerChatSnapshot(
        chaId: string,
        chatIndex: number,
        chatId: string,
    ): Promise<ServerChatSnapshot | null> {`, `    private async readServerChatSnapshot(
        chaId: string,
        chatIndex: number,
        chatId: string,
        signal?: AbortSignal,
    ): Promise<ServerChatSnapshot | null> {`);
    add('snapshot-fetch', node, `                cache: 'no-store',
                headers: { 'x-chat-id': chatId },`, `                cache: 'no-store',
                ...(signal ? { signal } : {}),
                headers: { 'x-chat-id': chatId },`);
    add('peek-signal', node, `    async peekChatContentSnapshot(
        chaId: string,
        chatIndex: number,
        chatId: string,
    ): Promise<ServerChatSnapshot | null> {
        return this.readServerChatSnapshot(chaId, chatIndex, chatId)
    }`, `    async peekChatContentSnapshot(
        chaId: string,
        chatIndex: number,
        chatId: string,
        signal?: AbortSignal,
    ): Promise<ServerChatSnapshot | null> {
        return this.readServerChatSnapshot(chaId, chatIndex, chatId, signal)
    }`);
    const chat = 'src/ts/storage/chatStorage.ts';
    add('snapshot-budget', chat, `export async function peekServerChatSnapshot(
    chaId: string,
    chatIndex: number,
    chatId: string,
) {
    return forageStorage.realStorage.peekChatContentSnapshot(chaId, chatIndex, chatId)
}`, `import { boundedRecoveryRead } from '../bgRecoveryRead'

export async function peekServerChatSnapshot(
    chaId: string,
    chatIndex: number,
    chatId: string,
) {
    return boundedRecoveryRead(signal => forageStorage.realStorage.peekChatContentSnapshot(chaId, chatIndex, chatId, signal))
}`);
    add('adoption-read', chat, `        const snapshot = await forageStorage.realStorage.peekChatContentSnapshot(
            chaId,
            initialIndex,
            chatId,
        )`, `        const snapshot = await peekServerChatSnapshot(chaId, initialIndex, chatId)`);
    add('terminal-helper', orch, 'async function pollOrchestrationResult(): Promise<void> {',
        require('./recovery-terminal-client.cjs') + '\nasync function pollOrchestrationResult(): Promise<void> {');
    const markers = 'src/ts/bgOrchestrationPending.ts';
    add('marker-fields', markers, '    promptChangeNotified?: boolean\n',
        '    promptChangeNotified?: boolean\n    recoveryOutcome?: string\n    recoveryNoticeKey?: string\n');
    add('marker-read', markers, '            promptChangeNotified: value.promptChangeNotified === true,\n',
        `            promptChangeNotified: value.promptChangeNotified === true,
            recoveryOutcome: typeof value.recoveryOutcome === 'string' && value.recoveryOutcome.length <= 64 ? value.recoveryOutcome : undefined,
            recoveryNoticeKey: typeof value.recoveryNoticeKey === 'string' && value.recoveryNoticeKey.length <= 1024 ? value.recoveryNoticeKey : undefined,
`);
    add('watch-query-before-expiry', orch, `        if (Date.now() > watchDeadline) {
            console.warn('[bg-orch] watch deadline, giving up', watchKey)
            stopWatch({ preservePendingMarker: true })
            // Deadline = the gen was likely lost to a server restart (its context is gone too), so
            // auto-regenerating could surprise the user with a stale-context reply — notify instead.
            try { alertError('백그라운드 생성이 시간 초과됐어요. 다시 보내주세요.') } catch { /* best-effort */ }
            return
        }
`, '');
    add('watch-timer-query', orch, `        console.warn('[bg-orch] watch deadline timer, giving up', watchKey)
        stopWatch({ preservePendingMarker: true })
        try { alertError('백그라운드 생성이 시간 초과됐어요. 다시 보내주세요.') } catch { /* best-effort */ }`,
        `        // Elapsed device time is not terminal evidence. Bounded reads
        // release the gate; legacy durable saves have their own safety net.
        void pollOrchestrationResult()`);
    add('watch-query-failed', orch, "        console.warn('[bg-orch] poll error', e) // network/save hiccup — keep polling until deadline", `        console.warn('[bg-orch] poll error', e)
        if (pollEpoch === watchEpoch && Date.now() > watchDeadline) {
            parkUnverifiedRecovery(activeOperationId, 'watch')
        }`);
    add('boot-query-before-expiry', orch,
        '    if (Date.now() > deadline) { deferBootRecovery(operationId); return }',
        '    // Query the authoritative server even after a long page suspension.');
    add('boot-query-failed', orch, `        } catch {
            setTimeout(() => bootRecoverPoll(charId, chatId, baselineMsgs, operationId, resultKeyVersion, deadline, emptyCount, epoch), ORCH_POLL_MS)
        }`, `        } catch {
            if (epoch !== bootRecoveryEpoch) return
            if (Date.now() > deadline) {
                parkUnverifiedRecovery(operationId, 'boot')
                return
            }
            setTimeout(() => bootRecoverPoll(charId, chatId, baselineMsgs, operationId, resultKeyVersion, deadline, emptyCount, epoch), ORCH_POLL_MS)
        }`);
    add('legacy-save-safety', orch, `    const stopClaimHeartbeat = startResultClaimHeartbeat(charId, chatId, operationId, resultKeyVersion)
    try {`, `    const stopClaimHeartbeat = startResultClaimHeartbeat(charId, chatId, operationId, resultKeyVersion)
    const savedWatchEpoch = watchEpoch, savedBootEpoch = bootRecoveryEpoch
    const current = () => savedWatchEpoch === watchEpoch && savedBootEpoch === bootRecoveryEpoch
    const legacyTimer = setTimeout(() => {
        if (!current()) return
        if (operationId) rememberRecoveryOutcome(operationId, data, 'unverified-parked', RECOVERY_UNVERIFIED_NOTICE)
        if (bootRecoveryActive) deferBootRecovery(operationId)
        else stopWatch({ preservePendingMarker: true })
    }, ORCH_DEADLINE_MS)
    try {`);
    add('legacy-save-late-guard', orch,
        '                await requestDurableSave({ chat: [charId, merge.savedChatId], root: true })',
        `                const endLegacySave = beginLegacyRecoverySave(operationId)
                try { await requestDurableSave({ chat: [charId, merge.savedChatId], root: true }) }
                finally { endLegacySave() }
                if (!current()) throw new Error('Legacy recovery ownership changed while saving')`);
    add('legacy-save-cleanup', orch, `    } finally {
        stopClaimHeartbeat()
    }
}`, `    } finally {
        clearTimeout(legacyTimer)
        stopClaimHeartbeat()
    }
}`);
    add('hydration-evidence', chat, `            return full
        } finally {`, `            try { window.dispatchEvent(new Event('bg-recovery-evidence')) } catch { /* non-browser */ }
            return full
        } finally {`);
    add('save-evidence', 'src/ts/globalApi.svelte.ts', `                if (result === 'saved') {
                    savetrys = 0`, `                if (result === 'saved') {
                    try { window.dispatchEvent(new Event('bg-recovery-evidence')) } catch { /* non-browser */ }
                    savetrys = 0`);
    add('ack-network-failure', orch,
        "    const res = await fetchOrchestrationControl(url, { method: 'DELETE', credentials: 'same-origin' })",
        `    let res: Response
    try { res = await fetchOrchestrationControl(url, { method: 'DELETE', credentials: 'same-origin' }) }
    catch {
        if (operationId) rememberRecoveryOutcome(operationId, { resultId }, 'ack-pending')
        return 'unconfirmed'
    }`);
    add('ack-body-failure', orch,
        "    if (res.status === 409 && data?.reason === 'superseded') return 'superseded'\n    return 'unconfirmed'",
        `    if (res.status === 409 && data?.reason === 'superseded') return 'superseded'
    if (operationId) rememberRecoveryOutcome(operationId, { resultId }, 'ack-pending')
    return 'unconfirmed'`);
    add('drain-idle-wake', orch, '    if (!marker) return\n    bootRecoveryActive = true',
        `    if (!marker) { if (recoveryWakePending) wakeParkedRecoveries(); return }
    bootRecoveryActive = true`);
    add('watch-unconfirmed-owner', orch,
        '        if (res.status === 409) return // another live PWA currently owns this exact result revision',
        `        if (res.status === 409) {
            if (Date.now() > watchDeadline) parkUnverifiedRecovery(activeOperationId, 'watch')
            return
        }`);
    add('watch-identity-mismatch', orch,
        '        if (operationId && data.operationId !== operationId) return',
        `        if (operationId && data.operationId !== operationId) {
            if (Date.now() > watchDeadline) parkUnverifiedRecovery(operationId, 'watch')
            return
        }`);
    add('watch-order-conflict', orch,
        "            console.error('[bg-orch] result sequence conflict; retaining server revision', {",
        `            if (Date.now() > watchDeadline) parkUnverifiedRecovery(operationId, 'watch')
            console.error('[bg-orch] result sequence conflict; retaining server revision', {`);
    add('boot-response-fence', orch,
        "            if (res.status === 409) {",
        `            if (res.status === 409) {
                if (Date.now() > deadline) { parkUnverifiedRecovery(operationId, 'boot'); return }`, true);
    add('boot-identity-mismatch', orch,
        '            if (operationId && data.operationId !== operationId) {',
        `            if (operationId && data.operationId !== operationId) {
                if (Date.now() > deadline) { parkUnverifiedRecovery(operationId, 'boot'); return }`);
    add('boot-order-conflict', orch,
        "                console.error('[bg-orch] boot result sequence conflict; retaining server revision', {",
        `                if (Date.now() > deadline) { parkUnverifiedRecovery(operationId, 'boot'); return }
                console.error('[bg-orch] boot result sequence conflict; retaining server revision', {`);
    add('boot-probe-failure', orch, '                    if (negotiated === null) {',
        `                    if (negotiated === null) {
                        if (Date.now() > deadline) { parkUnverifiedRecovery(operationId, 'boot'); return }`);
    add('watch-result-identity-missing', orch, '            if (!resultId) return\n            const acknowledgement',
        "            if (!resultId) { parkUnverifiedRecovery(operationId, 'watch'); return }\n            const acknowledgement");
    add('boot-result-identity-missing', orch, '                if (!resultId) return\n                const acknowledgement',
        "                if (!resultId) { parkUnverifiedRecovery(operationId, 'boot'); return }\n                const acknowledgement");
    add('watch-save-failed', orch,
        "                    console.warn('[bg-orch] merged result save failed; retaining server revision', delivery.error)",
        `                    console.warn('[bg-orch] merged result save failed; retaining server revision', delivery.error)
                    if (Date.now() > watchDeadline) parkUnverifiedRecovery(operationId, 'watch')`);
    add('boot-save-failed', orch,
        "                    console.warn('[bg-orch] boot merged result save failed; retaining server revision', delivery.error)",
        `                    console.warn('[bg-orch] boot merged result save failed; retaining server revision', delivery.error)
                    if (Date.now() > deadline) { parkUnverifiedRecovery(operationId, 'boot'); return }`);
    add('watch-unknown-empty', orch,
        "            // Relay the server's request-status snapshot into the local toast store.",
        `            if (!serverOwnedChatStillActive(data) && Date.now() > watchDeadline) {
                parkUnverifiedRecovery(operationId, 'watch')
                return
            }
            // Relay the server's request-status snapshot into the local toast store.`);
    add('deferred-marker-wake', orch,
        'function deferBootRecovery(operationId: string | null): void {',
        `function deferBootRecovery(operationId: string | null): void {
    if (operationId) {
        try { updatePendingMarker(localStorage, operationId, marker => ({
            ...marker, recoveryOutcome: marker.recoveryOutcome || 'unverified-parked',
        })) } catch { /* Keep the existing marker even if annotation fails. */ }
    }`);
    add('unloaded-character-marker', orch,
        '            appliedStaticsDeltaByOperation.clear()\n            bootRecoveryActive = false',
        `            if (operationId) rememberRecoveryOutcome(operationId, null, 'unverified-parked')
            appliedStaticsDeltaByOperation.clear()
            bootRecoveryActive = false`);
    add('legacy-failure-notice-once', orch,
        "                    try { alertError('백그라운드 생성은 답변 없이 끝났고 서버 정리 확인이 지연됐어요. 다음 실행 때 재확인해요.') } catch { /* best-effort */ }",
        "                    if (operationId) rememberRecoveryOutcome(operationId, data, 'terminal-error', '백그라운드 생성은 답변 없이 끝났고 서버 정리 확인이 지연됐어요. 다음 실행 때 재확인해요.', true)");
    add('warm-queue-type', orch, 'let bootRecoveryQueue: OrchestrationPendingMarker[] = []',
        `type RecoveryQueueMarker = OrchestrationPendingMarker & { verifyLegacySave?: boolean }
let bootRecoveryQueue: RecoveryQueueMarker[] = []`);
    add('warm-marker-type', orch, `async function beginBootRecoveryAfterHydration(
    marker: OrchestrationPendingMarker,`, `async function beginBootRecoveryAfterHydration(
    marker: RecoveryQueueMarker,`);
    add('warm-durability-proof', orch,
        '            const committed = readFullyCommittedDelivery(db, chats, operationId)',
        '            const committed = marker.verifyLegacySave ? null : readFullyCommittedDelivery(db, chats, operationId)');
    add('chat-reentry-evidence', 'src/lib/ChatScreens/DefaultChatScreen.svelte',
        `        const chatId = draftChatId
        if (!chaId || !chatId) return`,
        `        const chatId = draftChatId
        if (!chaId || !chatId) return
        untrack(() => window.dispatchEvent(new Event('bg-recovery-evidence')))`);
    add('manual-conflict-strict-save', 'src/ts/globalApi.svelte.ts',
        `                if (error instanceof ManualSaveConflictError) {
                    changed = false
                    savetrys = 0
                    alertError(error)
                    return
                }`,
        `                if (error instanceof ManualSaveConflictError) {
                    changed = false
                    savetrys = 0
                    alertError(error)
                    if ((options as any)?.rejectOnError) throw error
                    return
                }`);
    return units;
};
