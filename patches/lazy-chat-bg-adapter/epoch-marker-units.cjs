'use strict';
// Epoch-stamped BG markers and storage-reset clearance (client).
// Legacy pending markers keep their key and gain optional epochVersion and
// storageEpoch; the legacy start records the epoch of the response that
// established acceptance. Every status reader of a stored marker clears the
// marker with one notice when a `missing` status carries a newer storage epoch
// (shared rule in bgStorageResetClearance.ts). readServerOperationStatus, the
// cancellation-proof read, is unchanged.
module.exports = prior => {
    const units = [], targetVersions = { pocketrisu: ['1.10.0'] };
    const add = (name, file, anchor, content, type = 'replace', where) => units.push({
        id: 'lazy-chat-bg-adapter:epoch-marker:' + name + ':1.10',
        file, type, anchor, content, ...(where ? { where } : {}), targetVersions,
        ...(name === 'import' ? { requires: ['lazy-chat-bg-adapter:owned:bgStorageResetClearance.ts:1.10'] } : {}),
        after: [...prior, ...units].filter(unit => unit.file === file).map(unit => unit.id),
    });
    const pending = 'src/ts/bgOrchestrationPending.ts';
    add('pending-type', pending, '    recoveryNoticeKey?: string\n',
        `    recoveryNoticeKey?: string
    // Written by the epoch-aware client; storageEpoch is the server storage
    // epoch observed when the start was accepted.
    epochVersion?: 1
    storageEpoch?: number
`);
    add('pending-read', pending,
        "            recoveryNoticeKey: typeof value.recoveryNoticeKey === 'string' && value.recoveryNoticeKey.length <= 1024 ? value.recoveryNoticeKey : undefined,\n",
        `            recoveryNoticeKey: typeof value.recoveryNoticeKey === 'string' && value.recoveryNoticeKey.length <= 1024 ? value.recoveryNoticeKey : undefined,
            epochVersion: value.epochVersion === 1 ? 1 : undefined,
            storageEpoch: value.epochVersion === 1 && Number.isSafeInteger(value.storageEpoch)
                && Number(value.storageEpoch) >= 0 ? value.storageEpoch : undefined,
`);

    const orch = 'src/ts/bgOrchestrate.ts';
    add('import', orch,
        "import { writerSessionHeaders, notifySessionDeactivated } from './storage/writerSession'\n",
        "import { clearMarkerForStorageReset, isStorageResetMissing } from './bgStorageResetClearance'\n"
        + "import { responseStorageEpoch } from './bgServerInputStart'\n"
        + "import { stampServerInputStorageEpoch } from './bgServerInputClient'\n",
        'insert', 'after');
    add('pending-write', orch,
        '            deliveryChatId: chatId, expectedChatRevision, completionNotified: false, ts: Date.now(),\n',
        '            deliveryChatId: chatId, expectedChatRevision, completionNotified: false, ts: Date.now(),\n'
        + '            epochVersion: 1,\n');
    add('helpers', orch,
        `function rememberResultKeyVersion(operationId: string, resultKeyVersion: 0 | 1): void {
    watchResultKeyVersion = resultKeyVersion
    try {
        updatePendingMarker(localStorage, operationId, (marker) => ({ ...marker, resultKeyVersion }))
`,
        `function noticeStorageResetCleared(): void {
    try { notifyWarning('백업 복원으로 이 입력은 처리되지 않았어요', { source: 'bg-input' }) }
    catch { /* best-effort notice */ }
}
// Legacy pending marker: true when the status proves a storage reset removed the
// operation (the marker is then gone); the notice only from the removing reader.
function clearPendingMarkerForStorageReset(operationId: string, status: number, body: unknown): boolean {
    if (classifyOrchestrationStatusResponse(status, body, operationId) !== 'missing') return false
    let marker: OrchestrationPendingMarker | undefined
    try { marker = readPendingMarkers(localStorage).find(row => row.operationId === operationId) }
    catch { return false }
    if (!marker || !isStorageResetMissing(marker, body)) return false
    let removed = false
    try { removed = clearMarkerForStorageReset(localStorage, 'legacy', operationId, body) }
    catch { return false }
    if (removed) noticeStorageResetCleared()
    return removed
}
// Legacy pending marker: records the storage epoch of an accepted status of this
// operation when the marker has none; an existing storageEpoch is kept.
function stampPendingMarkerStorageEpoch(operationId: string, body: any): void {
    const storageEpoch = responseStorageEpoch(body)
    if (storageEpoch === null || body?.accepted !== true || body.operationId !== operationId) return
    try {
        updatePendingMarker(localStorage, operationId, (marker) => marker.storageEpoch !== undefined
            ? marker : { ...marker, epochVersion: 1, storageEpoch })
    } catch { /* The marker keeps its previous evidence. */ }
}
// The storage epoch is recorded once, from the response that established acceptance.
function rememberResultKeyVersion(operationId: string, resultKeyVersion: 0 | 1, storageEpoch: number | null = null): void {
    watchResultKeyVersion = resultKeyVersion
    try {
        updatePendingMarker(localStorage, operationId, (marker) => ({
            ...marker, resultKeyVersion,
            ...(storageEpoch !== null && marker.storageEpoch === undefined
                ? { epochVersion: 1 as const, storageEpoch } : {}),
        }))
`);
    add('legacy-start-epoch', orch,
        '                    rememberResultKeyVersion(operationId, data.resultKeyVersion === 1 ? 1 : 0)\n',
        '                    rememberResultKeyVersion(operationId, data.resultKeyVersion === 1 ? 1 : 0, responseStorageEpoch(data))\n');
    add('legacy-status-epoch', orch,
        '                    rememberResultKeyVersion(operationId, data?.resultKeyVersion === 1 ? 1 : 0)\n',
        '                    rememberResultKeyVersion(operationId, data?.resultKeyVersion === 1 ? 1 : 0, responseStorageEpoch(data))\n');
    // Legacy boot recovery, version-0 markers: the probe's 404 body.
    add('probe-type', orch, '): Promise<0 | 1 | null> {\n', "): Promise<0 | 1 | null | 'storage-reset'> {\n");
    add('probe-accepted', orch,
        `        if (res.ok && data?.accepted === true && data.operationId === operationId) {
            return data.resultKeyVersion === 1 ? 1 : 0
`,
        `        if (res.ok && data?.accepted === true && data.operationId === operationId) {
            stampPendingMarkerStorageEpoch(operationId, data)
            return data.resultKeyVersion === 1 ? 1 : 0
`);
    add('probe-missing', orch, '        if (res.status === 404) return 0\n',
        `        if (res.status === 404) {
            if (clearPendingMarkerForStorageReset(operationId, res.status, data)) return 'storage-reset'
            return 0
        }
`);
    add('probe-caller', orch,
        `                    const negotiated = await probeOperationResultKeyVersion(charId, chatId, operationId)
                    if (epoch !== bootRecoveryEpoch) return
`,
        `                    const negotiated = await probeOperationResultKeyVersion(charId, chatId, operationId)
                    if (epoch !== bootRecoveryEpoch) return
                    if (negotiated === 'storage-reset') {
                        finishBootRecovery(operationId)
                        return
                    }
`);
    // Legacy boot recovery, version-1 markers: one exact status read before the
    // silent finish on the result route's missing.
    add('boot-v1-status', orch,
        `                if (resultKeyVersion === 1 && operationState === 'missing' && stage === 0) {
                    finishBootRecovery(operationId)
`,
        `                if (resultKeyVersion === 1 && operationState === 'missing' && stage === 0) {
                    if (operationId) {
                        try {
                            const query = new URLSearchParams({ charId, chatId })
                            const statusResponse = await fetchOrchestrationControl('/api/bg-orchestrate-status/'
                                + encodeURIComponent(operationId) + '?' + query.toString(),
                            { method: 'GET', credentials: 'same-origin' })
                            let statusData: unknown = null
                            try { statusData = await readRecoveryJson(statusResponse) } catch { /* silent finish */ }
                            if (epoch !== bootRecoveryEpoch) return
                            if (statusResponse.ok) stampPendingMarkerStorageEpoch(operationId, statusData)
                            clearPendingMarkerForStorageReset(operationId, statusResponse.status, statusData)
                        } catch { /* Without exact status the finish stays silent. */ }
                    }
                    finishBootRecovery(operationId)
`);
    // Server-input markers: notice from the client admission and promotion readers.
    add('admission-notice', orch, '            newId: v4,\n',
        '            newId: v4,\n            onStorageResetCleared: noticeStorageResetCleared,\n');
    add('promotion-notice', orch, '        isIdle: () => recoveryAdmissionDepth === 0,\n',
        '        isIdle: () => recoveryAdmissionDepth === 0,\n        onStorageResetCleared: noticeStorageResetCleared,\n');
    // Accepted server-input markers without a pending projection.
    add('accepted-marker-status', orch,
        '                if (statusResponse.ok) applyRequestProgress({ operationId: marker.operationId, charId, chatId }, statusData)\n',
        `                if (classifyOrchestrationStatusResponse(statusResponse.status, statusData, marker.operationId) === 'missing'
                    && isStorageResetMissing(marker, statusData)) {
                    if (clearMarkerForStorageReset(localStorage, 'server-input', marker.operationId, statusData)) noticeStorageResetCleared()
                    // Still stored: an epoch was recorded meanwhile; keep today's handling.
                    if (!readServerInputMarker(localStorage, marker.operationId)) continue
                }
                if (statusResponse.ok) stampServerInputStorageEpoch(localStorage, marker, statusData)
                if (statusResponse.ok) applyRequestProgress({ operationId: marker.operationId, charId, chatId }, statusData)
`);
    // Failed-input and cancelled-input settlement proof reads: clearance before
    // the 404 -> null return; a null proof stops the settlement.
    const settlementClearance = `                if (response.status === 404) {
                    let missing: unknown = null
                    try { missing = await readRecoveryJson(response) } catch { /* no proof */ }
                    if (classifyOrchestrationStatusResponse(response.status, missing, operationId) === 'missing'
                        && isStorageResetMissing(marker, missing)
                        && clearMarkerForStorageReset(localStorage, 'server-input', operationId, missing)) noticeStorageResetCleared()
                    return null
                }
`;
    add('failed-proof', orch,
        `                if (!response.ok) return null
                const state: any = await readRecoveryJson(response)
                return state?.accepted === true && state.operationId === operationId
                  ? { proof: state.failedInputProof, acknowledgement: state.failedInputAcknowledgement } : null
`,
        settlementClearance + `                if (!response.ok) return null
                const state: any = await readRecoveryJson(response)
                stampServerInputStorageEpoch(localStorage, marker, state)
                return state?.accepted === true && state.operationId === operationId
                  ? { proof: state.failedInputProof, acknowledgement: state.failedInputAcknowledgement } : null
`);
    add('cancelled-proof', orch,
        `                if (!response.ok) return null
                const state: any = await readRecoveryJson(response)
                return state?.accepted === true && state.operationId === operationId && state.state === 'input-cancelled'
`,
        settlementClearance + `                if (!response.ok) return null
                const state: any = await readRecoveryJson(response)
                stampServerInputStorageEpoch(localStorage, marker, state)
                return state?.accepted === true && state.operationId === operationId && state.state === 'input-cancelled'
`);
    return units;
};
