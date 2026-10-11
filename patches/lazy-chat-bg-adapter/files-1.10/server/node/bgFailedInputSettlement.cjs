'use strict';
const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(value);
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 255;
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function validFailedInputSettlement(value, operationId, charId, chatId) {
    return !!value && value.contractVersion === 'bg_failed_input_ack.v1'
        && value.operationId === operationId && value.charId === charId && value.chatId === chatId
        && id(value.operationId) && id(value.resultId) && text(value.charId) && text(value.chatId)
        && hash(value.inputReceiptId) && hash(value.attachedRevision) && text(value.userMessageId);
}
function failedInputSettlement(result, input) {
    if (!result || result.final !== true || result.kind !== 'terminal-error' || result.outcome !== 'error'
        || result.anchorResultVersion !== 1 || result.hasGeneratedAnswer !== false
        || result.serverChatCommit || !input || input.inputState !== 'failed'
        || input.transformState !== 'completed' || !input.inputReceipt
        || input.terminal?.publication !== 'not_applicable' || input.terminal.resultRevision != null
        || result.operationId !== input.operationId || result.operationId !== input.admission.operationId
        || result.charId !== input.admission.charId || result.chatId !== input.admission.chatId) return null;
    const receipt = { contractVersion: 'bg_failed_input_ack.v1', operationId: result.operationId,
        charId: result.charId, chatId: result.chatId, resultId: result.resultId,
        inputReceiptId: input.inputReceipt.receiptId, userMessageId: input.admission.userMessageId,
        attachedRevision: input.executionBaseRevision };
    return validFailedInputSettlement(receipt, result.operationId, result.charId, result.chatId) ? receipt : null;
}
function invalidateFailedInputSettlement(kvSet, key, state) {
    if (!state?.failedInputSettlement) return;
    const next = { ...state };
    delete next.failedInputSettlement;
    kvSet(key, JSON.stringify(next));
}
module.exports = { validFailedInputSettlement, failedInputSettlement, invalidateFailedInputSettlement };
