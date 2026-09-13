'use strict';

const crypto = require('node:crypto');
const { stableJSON } = require('./serverChatCommit.cjs');

const SERVER_CHAT_EXECUTION_STORE_CONTRACT = 'bg_chat_execution_store.v1';
const SERVER_CHAT_EXECUTION_PROJECTION_CONTRACT = 'bg_chat_execution_projection.v1';
const SERVER_CHAT_EXECUTION_FIELD = 'serverChatExecutionState';
const OPERATION_ID = /^[A-Za-z0-9_-]{8,128}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const AC_STATES = new Set(['pending', 'settled', 'skipped', 'invalidated', 'disabled']);

function own(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
}

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function requireIdentifier(name, value, maxBytes = 255) {
    if (typeof value !== 'string' || value.length === 0
        || Buffer.byteLength(value, 'utf8') > maxBytes
        || /[\u0000-\u001f\u007f]/u.test(value)) {
        throw new Error(`${name} is invalid`);
    }
    return value;
}

function normalizeOwner(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('server chat execution owner is invalid');
    }
    const owner = {
        messageId: requireIdentifier('owner.messageId', value.messageId),
        sourceRevision: requireIdentifier('owner.sourceRevision', value.sourceRevision),
        sourceGeneration: requireIdentifier('owner.sourceGeneration', value.sourceGeneration),
        operationId: requireIdentifier('owner.operationId', value.operationId, 128),
        authority: requireIdentifier('owner.authority', value.authority, 32),
        acState: requireIdentifier('owner.acState', value.acState, 32),
        automaticBackfill: requireIdentifier(
            'owner.automaticBackfill',
            value.automaticBackfill,
            32,
        ),
    };
    if (!SHA256.test(owner.sourceRevision) || !SHA256.test(owner.sourceGeneration)
        || !OPERATION_ID.test(owner.operationId)
        || (owner.authority !== 'server' && owner.authority !== 'foreground')
        || !AC_STATES.has(owner.acState)
        || (owner.automaticBackfill !== 'eligible'
            && owner.automaticBackfill !== 'excluded')) {
        throw new Error('server chat execution owner contract is invalid');
    }
    return owner;
}

function normalizeEntry(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || !Array.isArray(value.owners)) {
        throw new Error('server chat execution entry is invalid');
    }
    const entry = {
        charId: requireIdentifier('entry.charId', value.charId),
        chatId: requireIdentifier('entry.chatId', value.chatId),
        chatRevision: requireIdentifier('entry.chatRevision', value.chatRevision, 256),
        commitSequence: value.commitSequence,
        bindingEpoch: requireIdentifier('entry.bindingEpoch', value.bindingEpoch),
        hostChangeSeq: value.hostChangeSeq,
        owners: value.owners.map(normalizeOwner),
    };
    if (!Number.isSafeInteger(entry.commitSequence) || entry.commitSequence <= 0
        || !Number.isSafeInteger(entry.hostChangeSeq) || entry.hostChangeSeq <= 0
        || new Set(entry.owners.map((owner) => owner.messageId)).size !== entry.owners.length) {
        throw new Error('server chat execution entry identities are invalid');
    }
    return entry;
}

function readProjectionStore(database) {
    const value = database?.[SERVER_CHAT_EXECUTION_FIELD];
    if (value === undefined) {
        return { contractVersion: SERVER_CHAT_EXECUTION_STORE_CONTRACT, entries: [] };
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || value.contractVersion !== SERVER_CHAT_EXECUTION_STORE_CONTRACT
        || !Array.isArray(value.entries)) {
        throw new Error('server chat execution store is invalid');
    }
    const entries = value.entries.map(normalizeEntry);
    const identities = entries.map((entry) => stableJSON([entry.charId, entry.chatId]));
    if (new Set(identities).size !== identities.length) {
        throw new Error('server chat execution store contains duplicate chats');
    }
    return { contractVersion: SERVER_CHAT_EXECUTION_STORE_CONTRACT, entries };
}

function messageIndex(chat) {
    if (!chat || !Array.isArray(chat.message)) {
        throw new Error('server chat execution projection requires a full chat');
    }
    const messages = new Map();
    for (let index = 0; index < chat.message.length; index += 1) {
        const message = chat.message[index];
        if (!message || typeof message !== 'object' || Array.isArray(message)) continue;
        const messageId = typeof message.chatId === 'string' ? message.chatId : '';
        if (!messageId) continue;
        if (messages.has(messageId)) {
            throw new Error('server chat execution projection found duplicate message identities');
        }
        messages.set(messageId, {
            index,
            sourceRevision: sha256(stableJSON(message)),
        });
    }
    return messages;
}

function reconcileOwners(chat, ownerCandidates) {
    const messages = messageIndex(chat);
    const byMessage = new Map();
    for (const raw of ownerCandidates) {
        const owner = normalizeOwner(raw);
        const message = messages.get(owner.messageId);
        if (!message || message.sourceRevision !== owner.sourceRevision) continue;
        byMessage.set(owner.messageId, owner);
    }
    return [...byMessage.values()].sort((left, right) => (
        messages.get(left.messageId).index - messages.get(right.messageId).index
    ));
}

function matchingEntry(store, charId, chatId) {
    return store.entries.find((entry) => entry.charId === charId && entry.chatId === chatId) || null;
}

function commitProjectionInput(record) {
    const recovery = record?.recovery;
    if (!record || !Number.isSafeInteger(record.commitSequence) || record.commitSequence <= 0
        || !recovery || !Array.isArray(recovery.owners)) {
        throw new Error('server chat execution commit record is invalid');
    }
    return {
        commitSequence: record.commitSequence,
        charId: requireIdentifier('record.charId', recovery.requestedCharId),
        chatId: requireIdentifier('record.chatId', recovery.storedChatId),
        chatRevision: requireIdentifier('record.chatRevision', recovery.storedRevision, 256),
        bindingEpoch: requireIdentifier('record.bindingEpoch', recovery.bindingEpoch),
        hostChangeSeq: recovery.hostChangeSeq,
        owners: recovery.owners.map(normalizeOwner),
    };
}

function writeProjection(database, entry) {
    const store = readProjectionStore(database);
    const entries = store.entries.filter((candidate) => (
        candidate.charId !== entry.charId || candidate.chatId !== entry.chatId
    ));
    entries.push(normalizeEntry(entry));
    entries.sort((left, right) => (
        left.charId < right.charId ? -1
            : left.charId > right.charId ? 1
                : left.chatId < right.chatId ? -1
                    : left.chatId > right.chatId ? 1 : 0
    ));
    database[SERVER_CHAT_EXECUTION_FIELD] = {
        contractVersion: SERVER_CHAT_EXECUTION_STORE_CONTRACT,
        entries,
    };
    return database[SERVER_CHAT_EXECUTION_FIELD];
}

function applyCommitProjection(database, record, chat, currentChatRevision = null) {
    const input = commitProjectionInput(record);
    const store = readProjectionStore(database);
    const prior = matchingEntry(store, input.charId, input.chatId);
    const owners = reconcileOwners(chat, [
        ...(prior?.owners || []),
        ...input.owners,
    ]);
    const latest = prior && prior.commitSequence > input.commitSequence ? prior : input;
    writeProjection(database, {
        charId: input.charId,
        chatId: input.chatId,
        chatRevision: currentChatRevision || input.chatRevision,
        commitSequence: Math.max(prior?.commitSequence || 0, input.commitSequence),
        bindingEpoch: latest.bindingEpoch,
        hostChangeSeq: latest.hostChangeSeq,
        owners,
    });
    return matchingEntry(readProjectionStore(database), input.charId, input.chatId);
}

function projectChatExecution({
    database,
    records,
    chat,
    charId,
    chatId,
    chatRevision,
}) {
    const normalizedCharId = requireIdentifier('charId', charId);
    const normalizedChatId = requireIdentifier('chatId', chatId);
    const normalizedRevision = requireIdentifier('chatRevision', chatRevision, 256);
    const store = readProjectionStore(database);
    const prior = matchingEntry(store, normalizedCharId, normalizedChatId);
    const matchingRecords = (Array.isArray(records) ? records : [])
        .map(commitProjectionInput)
        .filter((record) => (
            record.charId === normalizedCharId && record.chatId === normalizedChatId
        ))
        .sort((left, right) => left.commitSequence - right.commitSequence);
    if (!prior && matchingRecords.length === 0) return null;
    const sequenceSet = new Set(matchingRecords.map((record) => record.commitSequence));
    if (sequenceSet.size !== matchingRecords.length) {
        throw new Error('server chat execution records contain duplicate sequences');
    }
    const latest = [
        ...(prior ? [prior] : []),
        ...matchingRecords,
    ].sort((left, right) => left.commitSequence - right.commitSequence).at(-1);
    const owners = reconcileOwners(chat, [
        ...(prior?.owners || []),
        ...matchingRecords.flatMap((record) => record.owners),
    ]);
    return {
        contract: SERVER_CHAT_EXECUTION_PROJECTION_CONTRACT,
        charId: normalizedCharId,
        chatId: normalizedChatId,
        chatRevision: normalizedRevision,
        bindingEpoch: latest.bindingEpoch,
        hostChangeSeq: latest.hostChangeSeq,
        coverage: 'authoritative',
        owners,
        pendingInputCommands: [],
    };
}

function copyServerOwnedRootState(currentDatabase, incomingDatabase) {
    if (!incomingDatabase || typeof incomingDatabase !== 'object' || Array.isArray(incomingDatabase)) {
        throw new Error('incoming database is invalid');
    }
    const current = currentDatabase && typeof currentDatabase === 'object' && !Array.isArray(currentDatabase)
        ? currentDatabase
        : {};
    const next = { ...incomingDatabase };
    for (const field of [
        'serverChatCommitApplied',
        'bgOrchestrationGlobalConflicts',
        SERVER_CHAT_EXECUTION_FIELD,
    ]) {
        if (own(current, field)) next[field] = structuredClone(current[field]);
        else delete next[field];
    }
    if (next.statics && typeof next.statics === 'object' && !Array.isArray(next.statics)) {
        next.statics = { ...next.statics };
        if (current.statics && typeof current.statics === 'object'
            && own(current.statics, 'bgOrchestrationApplied')) {
            next.statics.bgOrchestrationApplied = structuredClone(
                current.statics.bgOrchestrationApplied,
            );
        } else {
            delete next.statics.bgOrchestrationApplied;
        }
    }
    return next;
}

module.exports = {
    SERVER_CHAT_EXECUTION_FIELD,
    SERVER_CHAT_EXECUTION_PROJECTION_CONTRACT,
    SERVER_CHAT_EXECUTION_STORE_CONTRACT,
    applyCommitProjection,
    copyServerOwnedRootState,
    projectChatExecution,
    readProjectionStore,
    reconcileOwners,
};
