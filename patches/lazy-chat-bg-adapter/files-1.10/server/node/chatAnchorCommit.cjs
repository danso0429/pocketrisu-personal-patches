'use strict';

const { isDeepStrictEqual: equal } = require('node:util');
const { randomUUID } = require('node:crypto');
const { stableJSON } = require('./serverChatCommit.cjs');
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const identity = (message) => typeof message?.chatId === 'string' && message.chatId ? message.chatId : null;
const plain = (value) => value !== null && typeof value === 'object'
    && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));

function invalidAnchor() {
    return Object.assign(new Error('Generated chat message identity is invalid'), { code: 'BG_ANCHOR_IDENTITY_INVALID' });
}

function transportEqual(left, right) {
    return stableJSON(left) === stableJSON(right);
}

function indexed(messages) {
    const result = new Map();
    for (const message of messages) {
        const id = identity(message);
        if (!id) continue;
        if (result.has(id)) throw invalidAnchor();
        result.set(id, message);
    }
    return result;
}

function captureChatAnchor(chat, inputId = null, metadata = null) {
    if (!chat || !Array.isArray(chat.message)) throw invalidAnchor();
    const messages = indexed(chat.message);
    const id = inputId || identity(chat.message.findLast(message => message?.role === 'user'));
    if (!id || messages.get(id)?.role !== 'user') throw invalidAnchor();
    const capturedMetadata = metadata ? Object.fromEntries(
        ['name', 'lastDate', 'folderId', 'modules'].filter(key => own(metadata, key))
            .map(key => [key, structuredClone(metadata[key])]),
    ) : null;
    return { inputId: id, chat: structuredClone(chat), metadata: capturedMetadata };
}

// sendChat assigns IDs to legacy history. Do it on this isolated execution copy
// before capturing the basis, and retain the original identity-less values.
function captureExecutionChatAnchor(chat, inputId = null, metadata = null) {
    const legacy = [];
    for (const message of chat.message) {
        if (identity(message)) continue;
        const original = structuredClone(message);
        message.chatId = randomUUID();
        legacy.push({ id: message.chatId, original });
    }
    return { ...captureChatAnchor(chat, inputId, metadata), legacy };
}

function assignResultMessageIds(chat) {
    if (!chat || !Array.isArray(chat.message)) throw invalidAnchor();
    for (const message of chat.message) {
        if (!plain(message)) throw invalidAnchor();
        if (!identity(message)) message.chatId = randomUUID();
    }
    return chat;
}

function alignLegacyMessages(anchor, latest) {
    if (!latest || !Array.isArray(latest.message) || !anchor.legacy?.length) return latest;
    const available = new Map(), counts = new Map();
    for (const entry of anchor.legacy) {
        const key = stableJSON(entry.original);
        available.set(key, available.has(key) ? null : entry.id);
    }
    const keys = latest.message.map(message => identity(message) ? null : stableJSON(message));
    for (const key of keys) if (key !== null) counts.set(key, (counts.get(key) || 0) + 1);
    return { ...latest, message: latest.message.map((message, index) => {
        const key = keys[index], id = key === null ? null : available.get(key);
        return id && counts.get(key) === 1 ? { ...message, chatId: id } : message;
    }) };
}

function checkChatAnchor(anchor, latest) {
    if (!latest || latest.id !== anchor.chat.id || !Array.isArray(latest.message)) return 'chat_deleted';
    const current = indexed(latest.message);
    if (current.get(anchor.inputId)?.role !== 'user') return 'input_deleted';
    const baseIndex = anchor.chat.message.findIndex(message => identity(message) === anchor.inputId);
    const currentIndex = latest.message.findIndex(message => identity(message) === anchor.inputId);
    const known = anchor.chat.message.slice(baseIndex + 1);
    const knownIds = new Set(known.map(identity).filter(Boolean));
    const legacy = known.filter(message => !identity(message));
    for (const message of latest.message.slice(currentIndex + 1)) {
        const id = identity(message);
        if (id) { if (!knownIds.has(id)) return 'unknown_suffix'; }
        else {
            const index = legacy.findIndex(base => equal(base, message));
            if (index < 0) return 'unknown_suffix';
            legacy.splice(index, 1);
        }
    }
    return null;
}

/** Apply server-only edits; concurrent user edits win, including deletion. */
function resolveChatAnchor(anchor, result, latest, metadata = null) {
    latest = alignLegacyMessages(anchor, latest);
    const reason = checkChatAnchor(anchor, latest);
    if (reason) return { status: 'conflict', reason };
    if (!result || result.id !== anchor.chat.id || !Array.isArray(result.message)) {
        throw invalidAnchor();
    }
    const base = anchor.chat;
    if (anchor.metadata && metadata) {
        latest = { ...latest };
        for (const key of ['name', 'lastDate', 'folderId', 'modules']) {
            if (own(anchor.metadata, key) === own(metadata, key)
                && equal(anchor.metadata[key], metadata[key])) continue;
            if (own(metadata, key)) Object.defineProperty(latest, key, {
                value: structuredClone(metadata[key]), enumerable: true, writable: true, configurable: true,
            });
            else delete latest[key];
        }
    }
    const bases = indexed(base.message);
    const results = indexed(result.message);
    const currents = indexed(latest.message);
    if (results.get(anchor.inputId)?.role !== 'user') throw invalidAnchor();
    let unreflected = false;
    const merge = (before, after, current) => {
        if (equal(before, after)) return structuredClone(current);
        if (equal(before, current) || equal(after, current)) return structuredClone(after);
        if (plain(before) && plain(after) && plain(current)) {
            const merged = {};
            for (const key of new Set([...Object.keys(before), ...Object.keys(after), ...Object.keys(current)])) {
                const b = own(before, key), a = own(after, key), c = own(current, key);
                let present = c, value;
                if (b === a && equal(before[key], after[key])) value = structuredClone(current[key]);
                else if (b === c && equal(before[key], current[key])) { present = a; value = structuredClone(after[key]); }
                else if (a === c && equal(after[key], current[key])) value = structuredClone(current[key]);
                else if (b && a && c) value = merge(before[key], after[key], current[key]);
                else { unreflected = true; value = structuredClone(current[key]); }
                if (present) Object.defineProperty(merged, key, { value, enumerable: true, writable: true, configurable: true });
            }
            return merged;
        }
        unreflected = true;
        return structuredClone(current);
    };
    const fields = value => Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'message'));
    const chat = merge(fields(base), fields(result), fields(latest));
    if (equal(base.message, latest.message)) {
        chat.message = structuredClone(result.message);
    } else {
        const retained = [];
        for (const current of latest.message) {
            const id = identity(current);
            if (!id || !bases.has(id)) { retained.push(structuredClone(current)); continue; }
            if (!results.has(id)) {
                if (!transportEqual(current, bases.get(id)) || id === anchor.inputId) {
                    retained.push(structuredClone(current)); unreflected = true;
                }
            } else retained.push(merge(bases.get(id), results.get(id), current));
        }
        for (const [id, before] of bases) {
            if (!currents.has(id) && results.has(id) && !equal(before, results.get(id))) unreflected = true;
        }
        // Legacy messages cannot be matched through concurrent structural edits by
        // position. Keep the user's sequence and report skipped server changes.
        if (!equal(base.message.filter(m => !identity(m)), result.message.filter(m => !identity(m)))) unreflected = true;
        const retainedIds = new Set(retained.map(identity).filter(Boolean));
        const beforeId = new Map();
        let nextId = anchor.inputId;
        const resultAnchorIndex = result.message.findIndex(message => identity(message) === anchor.inputId);
        for (let index = resultAnchorIndex - 1; index >= 0; index -= 1) {
            const message = result.message[index], id = identity(message);
            if (id && bases.has(id)) { if (retainedIds.has(id)) nextId = id; continue; }
            if (!id || currents.has(id)) { if (id && !equal(currents.get(id), message)) unreflected = true; continue; }
            const group = beforeId.get(nextId) || [];
            group.push(structuredClone(message)); beforeId.set(nextId, group);
        }
        chat.message = [];
        for (const message of retained) {
            const additions = beforeId.get(identity(message));
            if (additions) for (const addition of additions.reverse()) chat.message.push(addition);
            chat.message.push(message);
        }
        const baseOrder = base.message.map(identity).filter(id => id && results.has(id));
        const serverOrder = result.message.map(identity).filter(id => id && bases.has(id));
        if (!equal(baseOrder, serverOrder)) unreflected = true;
    }
    // Only newly generated suffix messages belong immediately after the input.
    const resultAnchorIndex = result.message.findIndex(message => identity(message) === anchor.inputId);
    const generated = result.message.slice(resultAnchorIndex + 1).filter(message => !bases.has(identity(message)));
    const generatedIds = new Set();
    for (const message of generated) {
        const id = identity(message);
        if (!id || generatedIds.has(id)) throw invalidAnchor();
        if (currents.has(id)) throw invalidAnchor();
        generatedIds.add(id);
    }
    chat.message = chat.message.filter(message => !generatedIds.has(identity(message)));
    const at = chat.message.findIndex(message => identity(message) === anchor.inputId);
    chat.message = [...chat.message.slice(0, at + 1), ...structuredClone(generated), ...chat.message.slice(at + 1)];
    return { status: 'resolved', chat, unreflected };
}

function anchoredAssistantMessages(anchor, chat) {
    if (!anchor || !Array.isArray(chat?.message)) return [];
    const inputIndex = chat.message.findIndex(message => identity(message) === anchor.inputId && message?.role === 'user');
    const oldIds = new Set(anchor.chat.message.map(identity).filter(Boolean));
    return chat.message.slice(inputIndex < 0 ? 0 : inputIndex + 1).filter(message => (
        (message?.role === 'char' || message?.role === 'assistant')
        && !oldIds.has(identity(message))
    ));
}

module.exports = { captureChatAnchor, captureExecutionChatAnchor, assignResultMessageIds, checkChatAnchor, resolveChatAnchor, anchoredAssistantMessages, invalidAnchor };
