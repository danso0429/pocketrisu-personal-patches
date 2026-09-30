'use strict';

const { randomUUID } = require('node:crypto');
const { captureExecutionChatAnchor, assignResultMessageIds, alignLegacyMessages,
    resolveChatAnchor, invalidAnchor } = require('./chatAnchorCommit.cjs');
const idOf = message => typeof message?.chatId === 'string' && message.chatId ? message.chatId : null;

// The sentinel is an in-process merge boundary, never an application message.
function captureInputTransformBase(chat, metadata, inputId) {
    const ids = new Set(chat.message.map(idOf));
    ids.add(inputId);
    let id;
    do { id = randomUUID(); } while (ids.has(id));
    const sentinel = { role: 'user', chatId: id, data: '' };
    const view = { ...chat, message: [...chat.message, sentinel] };
    const basis = captureExecutionChatAnchor(view, id, metadata);
    chat.message = view.message.slice(0, -1);
    return { basis, sentinel, inputId };
}

function resolveInputAttachment(captured, transformed, latest, metadata) {
    if (!latest || latest.id !== captured.basis.chat.id || !Array.isArray(latest.message)) {
        return { status: 'conflict', reason: 'chat_deleted' };
    }
    const { basis, sentinel, inputId } = captured;
    const current = alignLegacyMessages(basis, latest);
    const baseIds = new Set(basis.chat.message.slice(0, -1).map(idOf));
    let lastKnown = -1;
    for (let index = 0; index < current.message.length; index++) {
        if (baseIds.has(idOf(current.message[index]))) lastKnown = index;
    }
    if (current.message.slice(lastKnown + 1).length > 0) {
        return { status: 'conflict', reason: 'unknown_suffix' };
    }
    const prepared = structuredClone(transformed);
    assignResultMessageIds(prepared);
    if (prepared.message.at(-1)?.chatId !== inputId
        || prepared.message.filter(message => idOf(message) === inputId && message.role === 'user').length !== 1
        || [...current.message, ...prepared.message].some(message => idOf(message) === sentinel.chatId)) {
        throw invalidAnchor();
    }
    prepared.message.splice(prepared.message.length - 1, 0, structuredClone(sentinel));
    const outcome = resolveChatAnchor(basis, prepared,
        { ...current, message: [...current.message, structuredClone(sentinel)] }, metadata);
    if (outcome.status !== 'resolved') return outcome;
    outcome.chat.message = outcome.chat.message.filter(message => idOf(message) !== sentinel.chatId);
    if (outcome.chat.message.at(-1)?.chatId !== inputId
        || outcome.chat.message.filter(message => idOf(message) === inputId).length !== 1) throw invalidAnchor();
    return outcome;
}

module.exports = { captureInputTransformBase, resolveInputAttachment };
