'use strict';
const fs = require('node:fs'), path = require('node:path');
module.exports = prior => {
    const units = [], targetVersions = { pocketrisu: ['1.10.0'] };
    const add = (name, file, anchor, content) => units.push({ id: 'lazy-chat-bg-adapter:failed-input:' + name + ':1.10',
        file, type: 'replace', anchor, content, targetVersions,
        after: [...prior, ...units].filter(u => u.file === file).map(u => u.id) });
    for (const file of ['server/node/bgFailedInputSettlement.cjs', 'src/ts/bgFailedInputSettlement.ts',
        'server/node/bgFailedInputSettlement.test.ts', 'src/ts/bgFailedInputSettlement.test.ts']) {
        units.push({ id: 'lazy-chat-bg-adapter:failed-input:owned:' + file + ':1.10', file, type: 'owned', targetVersions,
            content: fs.readFileSync(path.join(__dirname, 'files-1.10', file), 'utf8') });
    }
    const orch = 'src/ts/bgOrchestrate.ts', server = 'server/node/bgOrchestrator.cjs', store = 'server/node/bgOrchestrationOperationStore.cjs';
    add('server-import', server, "const { peekResult, consumeResult, acknowledgeResult, inheritDeliveryClaim } = require('./bgOrchestrationResultDelivery.cjs')",
        "const { peekResult, consumeResult, acknowledgeResult, inheritDeliveryClaim } = require('./bgOrchestrationResultDelivery.cjs')\nconst { failedInputSettlement, validFailedInputSettlement, invalidateFailedInputSettlement } = require('./bgFailedInputSettlement.cjs')");
    add('publication-invalidation', server, '    kvSet(key, JSON.stringify(record))\n', `    if (operationKeyed) {
      if (typeof opts?.kvGet !== 'function') throw new Error('operation publication state unavailable')
      invalidateFailedInputSettlement(kvSet, operationStateKey(record.operationId), readOperationState(opts.kvGet, record.operationId))
    }
    kvSet(key, JSON.stringify(record))
`);
    add('status-proof', server, "        inputCommandId: inputCommand.admission.inputCommandId,\n        admissionSeq: inputCommand.admissionSeq,",
        "        inputCommandId: inputCommand.admission.inputCommandId,\n        admissionSeq: inputCommand.admissionSeq,\n        failedInputProof: inputCommand.inputState === 'failed' && typeof serverChatInputOwner.readFailedInputProof === 'function' ? serverChatInputOwner.readFailedInputProof(operationId) : null,\n        failedInputAcknowledgement: inputCommand.inputState === 'failed' ? (() => { const state = readOperationState(kvGet, operationId); return state?.state === 'delivered' && validFailedInputSettlement(state.failedInputSettlement, operationId, charId, chatId) ? state.failedInputSettlement : null })() : null,");
    add('ack-receipt', server, "        const durable = writeOperationState(kvSet, operationId, stateMeta, nextState)",
        "        const failedReceipt = failedInputSettlement(delivery.record, serverChatInputOwner?.read(operationId))\n        const durable = writeOperationState(kvSet, operationId, { ...stateMeta, failedInputSettlement: failedReceipt }, nextState)");
    add('store-import', store, "const OPERATION_RESULT_PREFIX = 'bg-orch-result-op:'",
        "const { validFailedInputSettlement } = require('./bgFailedInputSettlement.cjs')\nconst OPERATION_RESULT_PREFIX = 'bg-orch-result-op:'");
    add('store-preserve', store, "      const previous = readOperationState(kvGet, operationId)",
        `      const previous = readOperationState(kvGet, operationId)
      if (state === 'delivered' && meta?.failedInputSettlement === undefined
        && previous?.state === 'delivered' && (!meta?.resultId || meta.resultId === previous.failedInputSettlement?.resultId)
        && validFailedInputSettlement(previous.failedInputSettlement,
          operationId, String(meta?.charId), String(meta?.chatId))) {
        meta = { ...meta, failedInputSettlement: previous.failedInputSettlement }
      }`);
    add('store-record', store, '    state,\n', `    state,
    ...(state === 'delivered' && validFailedInputSettlement(meta?.failedInputSettlement, operationId,
      String(meta?.charId), String(meta?.chatId)) ? { failedInputSettlement: meta.failedInputSettlement } : {}),
`);
    add('client-import', orch, "import { get } from 'svelte/store'", "import { get } from 'svelte/store'\nimport { settleFailedInput } from './bgFailedInputSettlement'");
    add('storage-import', orch, "import { requestDurableSave } from './globalApi.svelte'",
        "import { requestDurableSave, forageStorage } from './globalApi.svelte'");
    add('ack-exact-arg', orch, `    resultId: string,
): Promise<Exclude<OrchestrationAckState, 'legacy'>> {`, `    resultId: string,
    requireDeleted = false,
): Promise<Exclude<OrchestrationAckState, 'legacy'>> {`);
    add('ack-exact-result', orch, "    if (res.ok && data?.acked === true) return 'acked'",
        "    if (res.ok && data?.acked === true && (!requireDeleted || data.state === 'deleted')) return 'acked'");
    const oldAck = `    resultId: string | null,
): Promise<Exclude<OrchestrationAckState, 'legacy'>> {
    if (!resultId) return 'unconfirmed'
    try {
        return await acknowledgeResultRevision(
            charId, chatId, operationId, resultKeyVersion, resultId,
        )
    } catch {
        return 'unconfirmed'
    }
}`;
    add('finished-ack', orch, oldAck, `    resultId: string | null,
    data?: any,
): Promise<Exclude<OrchestrationAckState, 'legacy'>> {
    try {
    const marker = readServerInputMarkers(localStorage).find(row => row.operationId === operationId
      && row.charId === charId && row.chatId === chatId)
    if (!marker) return resultId ? await acknowledgeResultRevision(charId, chatId, operationId, resultKeyVersion, resultId) : 'unconfirmed'
    if (resultKeyVersion !== 1 || !data) return 'unconfirmed'
    const characters: any[] = (DBState as any)?.db?.characters
    const character = characters?.find(row => row.chaId === charId)
    const chats = character?.chats
    if (!Array.isArray(chats)) return 'unconfirmed'
    const currentChat = () => chats.find((row: any) => row.id === chatId)
    const isCurrent = () => (DBState as any)?.db?.characters?.find((row: any) => row.chaId === charId) === character
      && character.chats === chats && !!currentChat()
        return await settleFailedInput({ marker, data, isCurrent, readLocal: currentChat,
            readProof: async () => {
                const response = await fetchOrchestrationControl('/api/bg-orchestrate-status/' + encodeURIComponent(operationId)
                  + '?' + new URLSearchParams({ charId, chatId }), { method: 'GET', credentials: 'same-origin' })
                if (!response.ok) return null
                const state: any = await readRecoveryJson(response)
                return state?.accepted === true && state.operationId === operationId
                  ? { proof: state.failedInputProof, acknowledgement: state.failedInputAcknowledgement } : null
            },
            readCanonical: async () => {
                const response = await fetchOrchestrationControl('/api/bg-orchestrate-input-base/' + encodeURIComponent(charId)
                  + '/' + encodeURIComponent(chatId), { method: 'GET', credentials: 'same-origin' })
                if (!response.ok) return null
                return readRecoveryBody(response, async () => {
                    const { decodeRisuSave } = await import('./storage/risuSave')
                    const chat = await decodeRisuSave(new Uint8Array(await response.arrayBuffer()))
                    return chat?.id === chatId ? { chat, revision: response.headers.get('x-input-base-revision') || '' } : null
                })
            },
            savedBaseView: () => forageStorage.realStorage.hasUnconfirmedChatWrite?.(charId, chatId) === false
              ? forageStorage.realStorage.savedChatViewRevision?.(charId, chatId, marker.baseRevision, orchestrationChatRevision) || null : null,
            adopt: async (revision, allowed) => {
                const result = await adoptServerCommittedChat(chats, charId, chatId, revision, [allowed], orchestrationChatRevision,
                  undefined, { isCurrent })
                if (!isCurrent() || !result.adopted || result.revision !== revision) return false
                advanceServerInputMarkerRevisions(localStorage, charId, chatId, allowed, orchestrationChatRevision(currentChat()))
                return true
            },
            acknowledge: id => acknowledgeResultRevision(charId, chatId, operationId, 1, id, true),
            clear: () => { clearServerInputMarker(localStorage, operationId); parkedRecoveries.delete(operationId) },
        })
    } catch { return 'unconfirmed' }
}`);
    for (const [name, indent] of [['watch', '                '], ['boot', '                    ']]) {
        const call = `${indent}const acknowledgement = await acknowledgeFinishedServerResult(\n${indent}    charId, chatId, operationId, resultKeyVersion,\n${indent}    typeof data.resultId === 'string' ? data.resultId : null,\n${indent})`;
        add('finished-call-' + name, orch, call, call.replace(' : null,\n', ' : null, data,\n'));
    }
    add('raw-final', orch, '        if (!serverChatCommitReceipt(data)) {', `        if (!serverChatCommitReceipt(data)) {
            if (isFinishedServerFailure(data, -1) || (data.found === false && data.operationState === 'delivered')) {
                const acknowledgement = await acknowledgeFinishedServerResult(charId, chatId, marker.operationId, 1,
                  typeof data.resultId === 'string' ? data.resultId : null, data)
                if (isConfirmedOrchestrationAcknowledgement(acknowledgement) || acknowledgement === 'superseded') continue
            }`);
    add('prior-settlement', orch, '            storage: localStorage,\n            readCapability:', `            storage: localStorage,
            settleFinishedInput: async operationId => {
                const response = await fetchOrchestrationControl(orchestrationResultUrl(charId, chatId, operationId, 1),
                  { method: 'GET', credentials: 'same-origin' })
                if (!response.ok) return false
                const data: any = await readRecoveryJson(response)
                if (data?.operationId !== operationId) return false
                const acknowledgement = await acknowledgeFinishedServerResult(charId, chatId, operationId, 1,
                  typeof data.resultId === 'string' ? data.resultId : null, data)
                return isConfirmedOrchestrationAcknowledgement(acknowledgement)
                  && !readServerInputMarkers(localStorage).some(row => row.operationId === operationId)
            },
            readCapability:`);
    return units;
};
