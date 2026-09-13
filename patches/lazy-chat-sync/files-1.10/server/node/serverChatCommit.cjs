'use strict';

const crypto = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');

const SERVER_CHAT_COMMIT_CONTRACT = 'bg_server_chat_commit.v1';
const SERVER_CHAT_INPUT_RECEIPT_CONTRACT = 'bg_server_input_receipt.v1';
const HOST_CHANGE_INTENT_CONTRACT = 'pocketrisu_host_change_intent.v1';
const SERVER_CHAT_COMMIT_PREFIX = 'internal/server-chat-commit/v1/';
const CHAT_WRITE_JOURNAL_PREFIX = 'internal/chat-write/v1/';
const SERVER_CHAT_COMMIT_MAX_RECORD_BYTES = 1024 * 1024;
const SERVER_CHAT_COMMIT_MAX_DEPTH = 128;
const OPERATION_ID = /^[A-Za-z0-9_-]{8,128}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const COMMITTABLE_OPERATION_STATES = new Set([
    'running',
    'running-result-ready',
    'running-result-consumed',
    'result-ready',
]);
const EFFECT_STATUSES = new Set(['pending', 'committed', 'skipped', 'conflict', 'failed']);
const RESOLVED_EFFECT_STATUSES = new Set(['committed', 'skipped', 'conflict']);
const OWNER_AC_STATES = new Set(['pending', 'settled', 'skipped', 'invalidated', 'disabled']);
const STUB_METADATA_FIELDS = new Set(['id', 'name', '_stub', 'lastDate', 'folderId', 'modules']);

function commitStorageKey(operationId) {
    return `${SERVER_CHAT_COMMIT_PREFIX}${Buffer.from(operationId, 'utf8').toString('base64url')}`;
}

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function canonicalize(value, seen = new Set(), depth = 0) {
    if (depth > SERVER_CHAT_COMMIT_MAX_DEPTH) throw invalidCommit('value nesting is too deep');
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw invalidCommit('non-finite number');
        return value;
    }
    if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') {
        return undefined;
    }
    if (typeof value === 'bigint') throw invalidCommit('bigint is not serializable');
    if (typeof value !== 'object') throw invalidCommit('unsupported value');
    if (seen.has(value)) throw invalidCommit('cyclic value');
    seen.add(value);
    try {
        if (Array.isArray(value)) {
            return value.map((entry) => canonicalize(entry, seen, depth + 1) ?? null);
        }
        const prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null) {
            throw invalidCommit('non-plain object');
        }
        const result = {};
        for (const key of Object.keys(value).sort()) {
            const normalized = canonicalize(value[key], seen, depth + 1);
            if (normalized === undefined) continue;
            Object.defineProperty(result, key, {
                value: normalized,
                enumerable: true,
                configurable: true,
                writable: true,
            });
        }
        return result;
    } finally {
        seen.delete(value);
    }
}

function stableJSON(value) {
    return JSON.stringify(canonicalize(value));
}

function clonePlainValue(value, seen = new Set(), depth = 0) {
    if (depth > SERVER_CHAT_COMMIT_MAX_DEPTH) throw invalidCommit('value nesting is too deep');
    if (value === null || typeof value === 'string' || typeof value === 'boolean'
        || typeof value === 'undefined') return value;
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw invalidCommit('non-finite number');
        return value;
    }
    if (typeof value === 'bigint' || typeof value === 'function' || typeof value === 'symbol') {
        throw invalidCommit('unsupported value');
    }
    if (typeof value !== 'object') throw invalidCommit('unsupported value');
    if (seen.has(value)) throw invalidCommit('cyclic value');
    seen.add(value);
    try {
        if (Array.isArray(value)) {
            return value.map((entry) => clonePlainValue(entry, seen, depth + 1));
        }
        const prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null) {
            throw invalidCommit('non-plain object');
        }
        const result = {};
        for (const key of Object.keys(value)) {
            Object.defineProperty(result, key, {
                value: clonePlainValue(value[key], seen, depth + 1),
                enumerable: true,
                configurable: true,
                writable: true,
            });
        }
        return result;
    } finally {
        seen.delete(value);
    }
}

function invalidCommit(detail) {
    const error = new Error(`Invalid server chat commit: ${detail}`);
    error.code = 'SERVER_CHAT_COMMIT_INVALID';
    error.commitState = 'not_committed';
    return error;
}

function requireText(name, value, maxBytes = 4096, { empty = false } = {}) {
    if (typeof value !== 'string' || (!empty && value.length === 0)
        || Buffer.byteLength(value, 'utf8') > maxBytes
        || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) {
        throw invalidCommit(`${name} is missing or invalid`);
    }
    return value;
}

function requireIdentifier(name, value, maxBytes = 255) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized || normalized !== value
        || Buffer.byteLength(normalized, 'utf8') > maxBytes
        || /[\u0000-\u001f\u007f]/u.test(normalized)) {
        throw invalidCommit(`${name} is missing or invalid`);
    }
    return normalized;
}

function requireNullableIdentifier(name, value, maxBytes = 255) {
    return value === null ? null : requireIdentifier(name, value, maxBytes);
}

function requireRevision(name, value) {
    return requireIdentifier(name, value, 256);
}

function requirePlainObject(name, value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw invalidCommit(`${name} must be an object`);
    }
    return clonePlainValue(value);
}

function rejectUnexpectedKeys(name, value, allowed) {
    const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
    if (unexpected.length > 0) {
        throw invalidCommit(`${name} contains unsupported fields`);
    }
}

function requirePositiveInteger(name, value) {
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw invalidCommit(`${name} must be a positive integer`);
    }
    return value;
}

function requireCanonicalInstant(name, value) {
    const normalized = requireIdentifier(name, value, 64);
    const instant = new Date(normalized);
    if (!Number.isFinite(instant.getTime()) || instant.toISOString() !== normalized) {
        throw invalidCommit(`${name} must be a canonical ISO instant`);
    }
    return normalized;
}

function normalizeMetadata(value, chat) {
    const source = requirePlainObject('metadata', value);
    const unexpected = Object.keys(source).filter((key) => !STUB_METADATA_FIELDS.has(key));
    if (unexpected.length > 0) {
        throw invalidCommit('metadata contains non-stub fields');
    }
    if (source.id !== chat.id || source._stub !== true) {
        throw invalidCommit('metadata identity or stub marker is invalid');
    }
    const metadata = {
        id: chat.id,
        name: requireText('metadata.name', source.name, 4096, { empty: true }),
        _stub: true,
    };
    const presence = [];
    if (Object.prototype.hasOwnProperty.call(source, 'lastDate')) {
        presence.push('lastDate');
        if (source.lastDate !== null && source.lastDate !== undefined
            && (typeof source.lastDate !== 'number' || !Number.isFinite(source.lastDate))) {
            throw invalidCommit('metadata.lastDate is invalid');
        }
        metadata.lastDate = source.lastDate;
    }
    if (Object.prototype.hasOwnProperty.call(source, 'folderId')) {
        presence.push('folderId');
        if (source.folderId !== null && source.folderId !== undefined
            && typeof source.folderId !== 'string') {
            throw invalidCommit('metadata.folderId is invalid');
        }
        metadata.folderId = source.folderId;
    }
    if (Object.prototype.hasOwnProperty.call(source, 'modules')) {
        presence.push('modules');
        if (source.modules !== null && source.modules !== undefined
            && !Array.isArray(source.modules)) {
            throw invalidCommit('metadata.modules is invalid');
        }
        metadata.modules = source.modules;
    }
    const expected = {
        id: chat.id,
        name: chat.name ?? '',
        _stub: true,
    };
    for (const field of ['lastDate', 'folderId', 'modules']) {
        if (Object.prototype.hasOwnProperty.call(chat, field)) expected[field] = chat[field];
    }
    if (!isDeepStrictEqual(metadata, expected)) {
        throw invalidCommit('metadata does not match the committed chat stub');
    }
    return { metadata, presence };
}

function collectChatMessages(chat) {
    const messages = new Map();
    for (const message of chat.message) {
        if (!message || typeof message !== 'object' || Array.isArray(message)) continue;
        const messageId = typeof message.chatId === 'string' ? message.chatId : '';
        if (!messageId) continue;
        if (messages.has(messageId)) throw invalidCommit(`chat contains duplicate message identity ${messageId}`);
        messages.set(messageId, message);
    }
    return messages;
}

function normalizeInputReceipt(value, expected, messages) {
    const source = requirePlainObject('inputReceipt', value);
    rejectUnexpectedKeys('inputReceipt', source, new Set([
        'contractVersion', 'receiptId', 'inputCommandId', 'operationId', 'charId',
        'chatId', 'messageId', 'role', 'revision', 'hostChangeSeq',
    ]));
    if (source.contractVersion !== SERVER_CHAT_INPUT_RECEIPT_CONTRACT) {
        throw invalidCommit('inputReceipt contractVersion is unsupported');
    }
    const receipt = {
        contractVersion: SERVER_CHAT_INPUT_RECEIPT_CONTRACT,
        receiptId: requireIdentifier('inputReceipt.receiptId', source.receiptId),
        inputCommandId: requireIdentifier('inputReceipt.inputCommandId', source.inputCommandId),
        operationId: requireIdentifier('inputReceipt.operationId', source.operationId, 128),
        charId: requireIdentifier('inputReceipt.charId', source.charId),
        chatId: requireIdentifier('inputReceipt.chatId', source.chatId),
        messageId: requireIdentifier('inputReceipt.messageId', source.messageId),
        role: requireIdentifier('inputReceipt.role', source.role, 16),
        revision: requireRevision('inputReceipt.revision', source.revision),
        hostChangeSeq: requirePositiveInteger('inputReceipt.hostChangeSeq', source.hostChangeSeq),
    };
    if (receipt.operationId !== expected.operationId || receipt.charId !== expected.charId
        || receipt.chatId !== expected.chatId || receipt.revision !== expected.baseChatRevision
        || receipt.hostChangeSeq > expected.hostChangeSeq || receipt.role !== 'user') {
        throw invalidCommit('inputReceipt identity or revision is inconsistent');
    }
    if (messages.get(receipt.messageId)?.role !== 'user') {
        throw invalidCommit('inputReceipt does not reference the committed user message');
    }
    return receipt;
}

function normalizeOwner(value, index, operationId, messages) {
    const source = requirePlainObject(`owners[${index}]`, value);
    rejectUnexpectedKeys(`owners[${index}]`, source, new Set([
        'messageId', 'sourceRevision', 'sourceGeneration', 'operationId',
        'authority', 'acState', 'automaticBackfill',
    ]));
    const authority = requireIdentifier(`owners[${index}].authority`, source.authority, 32);
    if (authority !== 'server' && authority !== 'foreground') {
        throw invalidCommit(`owners[${index}].authority is unsupported`);
    }
    const acState = requireIdentifier(`owners[${index}].acState`, source.acState, 32);
    if (!OWNER_AC_STATES.has(acState)) {
        throw invalidCommit(`owners[${index}].acState is unsupported`);
    }
    const automaticBackfill = requireIdentifier(
        `owners[${index}].automaticBackfill`,
        source.automaticBackfill,
        32,
    );
    if (automaticBackfill !== 'excluded' && automaticBackfill !== 'eligible') {
        throw invalidCommit(`owners[${index}].automaticBackfill is unsupported`);
    }
    const owner = {
        messageId: requireIdentifier(`owners[${index}].messageId`, source.messageId),
        sourceRevision: requireIdentifier(`owners[${index}].sourceRevision`, source.sourceRevision),
        sourceGeneration: requireIdentifier(`owners[${index}].sourceGeneration`, source.sourceGeneration),
        operationId: requireIdentifier(`owners[${index}].operationId`, source.operationId, 128),
        authority,
        acState,
        automaticBackfill,
    };
    if (owner.operationId !== operationId || !messages.has(owner.messageId)) {
        throw invalidCommit(`owners[${index}] does not reference this operation and chat`);
    }
    return owner;
}

function normalizeHostChangeIntent(value, expected, messages, owners) {
    const source = requirePlainObject('hostChangeIntent', value);
    rejectUnexpectedKeys('hostChangeIntent', source, new Set([
        'contractVersion', 'eventId', 'hostInstanceId', 'charId', 'chatId',
        'bindingEpoch', 'seq', 'previousSeq', 'operationId', 'kind',
        'beforeRevision', 'afterRevision', 'messageIdentities', 'sourceGeneration',
        'committedAt', 'payloadRef', 'delivery',
    ]));
    if (source.contractVersion !== HOST_CHANGE_INTENT_CONTRACT) {
        throw invalidCommit('hostChangeIntent contractVersion is unsupported');
    }
    const messageIdentities = Array.isArray(source.messageIdentities)
        ? source.messageIdentities.map((entry, index) => (
            requireIdentifier(`hostChangeIntent.messageIdentities[${index}]`, entry)
        ))
        : null;
    if (!messageIdentities || messageIdentities.length === 0
        || new Set(messageIdentities).size !== messageIdentities.length
        || messageIdentities.some((messageId) => !messages.has(messageId))) {
        throw invalidCommit('hostChangeIntent message identities are invalid');
    }
    const intent = {
        contractVersion: HOST_CHANGE_INTENT_CONTRACT,
        eventId: requireIdentifier('hostChangeIntent.eventId', source.eventId),
        hostInstanceId: requireIdentifier('hostChangeIntent.hostInstanceId', source.hostInstanceId),
        charId: requireIdentifier('hostChangeIntent.charId', source.charId),
        chatId: requireIdentifier('hostChangeIntent.chatId', source.chatId),
        bindingEpoch: requireIdentifier('hostChangeIntent.bindingEpoch', source.bindingEpoch),
        seq: requirePositiveInteger('hostChangeIntent.seq', source.seq),
        previousSeq: source.previousSeq,
        operationId: requireIdentifier('hostChangeIntent.operationId', source.operationId, 128),
        kind: requireIdentifier('hostChangeIntent.kind', source.kind, 32),
        beforeRevision: requireRevision('hostChangeIntent.beforeRevision', source.beforeRevision),
        afterRevision: requireRevision('hostChangeIntent.afterRevision', source.afterRevision),
        messageIdentities,
        sourceGeneration: requireIdentifier('hostChangeIntent.sourceGeneration', source.sourceGeneration),
        committedAt: requireCanonicalInstant('hostChangeIntent.committedAt', source.committedAt),
        payloadRef: requireIdentifier('hostChangeIntent.payloadRef', source.payloadRef, 512),
        delivery: requireIdentifier('hostChangeIntent.delivery', source.delivery, 32),
    };
    if (!Number.isSafeInteger(intent.previousSeq) || intent.previousSeq !== intent.seq - 1
        || intent.operationId !== expected.operationId || intent.charId !== expected.charId
        || intent.chatId !== expected.chatId || intent.bindingEpoch !== expected.bindingEpoch
        || intent.seq !== expected.hostChangeSeq || intent.kind !== 'response_commit'
        || intent.beforeRevision !== expected.baseChatRevision
        || intent.afterRevision !== expected.storedRevision
        || intent.committedAt !== expected.committedAt
        || intent.payloadRef !== commitStorageKey(expected.operationId)
        || (intent.delivery !== 'pending' && intent.delivery !== 'settled')) {
        throw invalidCommit('hostChangeIntent identity, sequence, or payload reference is inconsistent');
    }
    if (!owners.some((owner) => owner.sourceGeneration === intent.sourceGeneration)) {
        throw invalidCommit('hostChangeIntent source generation has no owner');
    }
    return intent;
}

function assertNoUndefined(name, value, depth = 0) {
    if (depth > SERVER_CHAT_COMMIT_MAX_DEPTH) throw invalidCommit(`${name} nesting is too deep`);
    if (value === undefined) throw invalidCommit(`${name} cannot contain undefined`);
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
        for (let index = 0; index < value.length; index += 1) {
            if (!Object.prototype.hasOwnProperty.call(value, index)) {
                throw invalidCommit(`${name} cannot contain sparse arrays`);
            }
            assertNoUndefined(`${name}[${index}]`, value[index], depth + 1);
        }
        return;
    }
    for (const key of Object.keys(value)) {
        assertNoUndefined(`${name}.${key}`, value[key], depth + 1);
    }
}

function normalizeGlobalVariableIntent(value) {
    const source = requirePlainObject('effectIntents.globalVariables', value);
    rejectUnexpectedKeys('effectIntents.globalVariables', source, new Set([
        'changed', 'deleted', 'expected',
    ]));
    const changed = requirePlainObject('effectIntents.globalVariables.changed', source.changed);
    assertNoUndefined('effectIntents.globalVariables.changed', changed);
    const expected = requirePlainObject('effectIntents.globalVariables.expected', source.expected);
    if (!Array.isArray(source.deleted)) {
        throw invalidCommit('effectIntents.globalVariables.deleted must be an array');
    }
    const deleted = source.deleted.map((key, index) => (
        requireText(`effectIntents.globalVariables.deleted[${index}]`, key, 1024)
    ));
    if (new Set(deleted).size !== deleted.length
        || deleted.some((key) => Object.prototype.hasOwnProperty.call(changed, key))) {
        throw invalidCommit('global variable changed/deleted keys overlap or repeat');
    }
    const affected = new Set([...Object.keys(changed), ...deleted]);
    if (Object.keys(expected).length !== affected.size
        || [...affected].some((key) => !Object.prototype.hasOwnProperty.call(expected, key))) {
        throw invalidCommit('global variable expected values do not cover the exact delta');
    }
    const normalizedExpected = {};
    for (const key of affected) {
        const entry = requirePlainObject(`effectIntents.globalVariables.expected.${key}`, expected[key]);
        rejectUnexpectedKeys(
            `effectIntents.globalVariables.expected.${key}`,
            entry,
            new Set(['present', 'value']),
        );
        if (typeof entry.present !== 'boolean') {
            throw invalidCommit(`effectIntents.globalVariables.expected.${key}.present is invalid`);
        }
        let normalizedEntry;
        if (entry.present) {
            if (!Object.prototype.hasOwnProperty.call(entry, 'value')) {
                throw invalidCommit(`effectIntents.globalVariables.expected.${key}.value is missing`);
            }
            assertNoUndefined(`effectIntents.globalVariables.expected.${key}.value`, entry.value);
            normalizedEntry = { present: true, value: entry.value };
        } else {
            if (Object.prototype.hasOwnProperty.call(entry, 'value') && entry.value !== undefined) {
                throw invalidCommit(
                    `effectIntents.globalVariables.expected.${key}.value contradicts absent state`,
                );
            }
            normalizedEntry = { present: false };
        }
        Object.defineProperty(normalizedExpected, key, {
            value: normalizedEntry,
            enumerable: true,
            configurable: true,
            writable: true,
        });
    }
    return { changed, deleted, expected: normalizedExpected };
}

function normalizeEffectIntents(value) {
    const source = requirePlainObject('effectIntents', value);
    rejectUnexpectedKeys('effectIntents', source, new Set([
        'globalVariables', 'staticsMessagesDelta',
    ]));
    if (!Number.isSafeInteger(source.staticsMessagesDelta) || source.staticsMessagesDelta < 0) {
        throw invalidCommit('effectIntents.staticsMessagesDelta is invalid');
    }
    return {
        globalVariables: normalizeGlobalVariableIntent(source.globalVariables),
        staticsMessagesDelta: source.staticsMessagesDelta,
    };
}

function normalizeCommitRequest(value) {
    const source = requirePlainObject('request', value);
    rejectUnexpectedKeys('request', source, new Set([
        'contractVersion', 'operationId', 'resultId', 'publishSeq',
        'requestedCharId', 'requestedChatId', 'storedChatId', 'baseChatRevision',
        'storedRevision', 'settingsDigest', 'executionContextId',
        'archiveCenterRequestCorrelationId', 'prepareKey', 'prepareFingerprint',
        'bindingEpoch', 'hostChangeSeq', 'inputReceipt', 'claimEpoch', 'chat',
        'metadata', 'hostChangeIntent', 'owners', 'effectIntents', 'acOwner',
        'acState', 'readyForNextTurn', 'awaitingMetadata', 'committedAt',
    ]));
    if (source.contractVersion !== SERVER_CHAT_COMMIT_CONTRACT) {
        throw invalidCommit('contractVersion is unsupported');
    }
    const operationId = requireIdentifier('operationId', source.operationId, 128);
    if (!OPERATION_ID.test(operationId)) throw invalidCommit('operationId format is invalid');
    const requestedCharId = requireIdentifier('requestedCharId', source.requestedCharId);
    const requestedChatId = requireIdentifier('requestedChatId', source.requestedChatId);
    const storedChatId = requireIdentifier('storedChatId', source.storedChatId);
    if (storedChatId !== requestedChatId) {
        throw invalidCommit('C1 supports original-chat commits only');
    }
    const baseChatRevision = requireRevision('baseChatRevision', source.baseChatRevision);
    const storedRevision = requireRevision('storedRevision', source.storedRevision);
    const resultId = requireIdentifier('resultId', source.resultId, 128);
    const publishSeq = requirePositiveInteger('publishSeq', source.publishSeq);
    const settingsDigest = requireIdentifier('settingsDigest', source.settingsDigest, 64);
    if (!SHA256.test(settingsDigest)) throw invalidCommit('settingsDigest must be SHA-256');
    const executionContextId = requireNullableIdentifier('executionContextId', source.executionContextId);
    const archiveCenterRequestCorrelationId = requireNullableIdentifier(
        'archiveCenterRequestCorrelationId',
        source.archiveCenterRequestCorrelationId,
    );
    const prepareKey = requireNullableIdentifier('prepareKey', source.prepareKey, 512);
    const prepareFingerprint = requireNullableIdentifier(
        'prepareFingerprint',
        source.prepareFingerprint,
        64,
    );
    if (prepareFingerprint !== null && !SHA256.test(prepareFingerprint)) {
        throw invalidCommit('prepareFingerprint must be SHA-256');
    }
    const bindingEpoch = requireIdentifier('bindingEpoch', source.bindingEpoch);
    const hostChangeSeq = requirePositiveInteger('hostChangeSeq', source.hostChangeSeq);
    const committedAt = requireCanonicalInstant('committedAt', source.committedAt);
    const chat = requirePlainObject('chat', source.chat);
    if (chat.id !== storedChatId || !Array.isArray(chat.message)) {
        throw invalidCommit('chat identity or message array is invalid');
    }
    const messages = collectChatMessages(chat);
    const normalizedMetadata = normalizeMetadata(source.metadata, chat);
    if (!Array.isArray(source.owners) || source.owners.length === 0 || source.owners.length > 64) {
        throw invalidCommit('owners must contain 1..64 entries');
    }
    const owners = source.owners.map((owner, index) => (
        normalizeOwner(owner, index, operationId, messages)
    ));
    const ownerKeys = owners.map((owner) => `${owner.messageId}\u0000${owner.sourceGeneration}`);
    if (new Set(ownerKeys).size !== ownerKeys.length) {
        throw invalidCommit('owners contain duplicate message generations');
    }
    const acOwner = requireIdentifier('acOwner', source.acOwner, 32);
    if (acOwner !== 'server' && acOwner !== 'disabled') {
        throw invalidCommit('acOwner is unsupported');
    }
    const acState = requireIdentifier('acState', source.acState, 32);
    if (!OWNER_AC_STATES.has(acState)
        || (acOwner === 'disabled' && acState !== 'disabled')
        || (acOwner === 'server' && acState === 'disabled')) {
        throw invalidCommit('acOwner/acState are inconsistent');
    }
    if (owners.some((owner) => (
        acOwner === 'server'
            ? owner.automaticBackfill !== 'excluded' || owner.acState === 'disabled'
            : owner.automaticBackfill !== 'eligible' || owner.acState !== 'disabled'
    ))) {
        throw invalidCommit('owner automatic-backfill disposition is inconsistent');
    }
    const claimEpoch = source.claimEpoch === null
        ? null
        : requirePositiveInteger('claimEpoch', source.claimEpoch);
    if (typeof source.readyForNextTurn !== 'boolean' || typeof source.awaitingMetadata !== 'boolean') {
        throw invalidCommit('readyForNextTurn/awaitingMetadata must be boolean');
    }
    const expected = {
        operationId,
        charId: requestedCharId,
        chatId: storedChatId,
        baseChatRevision,
        storedRevision,
        settingsDigest,
        executionContextId,
        archiveCenterRequestCorrelationId,
        prepareKey,
        prepareFingerprint,
        bindingEpoch,
        hostChangeSeq,
        committedAt,
    };
    const inputReceipt = normalizeInputReceipt(source.inputReceipt, expected, messages);
    const hostChangeIntent = normalizeHostChangeIntent(
        source.hostChangeIntent,
        expected,
        messages,
        owners,
    );
    if (!hostChangeIntent.messageIdentities.includes(inputReceipt.messageId)
        || owners.some((owner) => !hostChangeIntent.messageIdentities.includes(owner.messageId))) {
        throw invalidCommit('hostChangeIntent does not cover the input and owner messages');
    }
    if ((acOwner === 'server' && hostChangeIntent.delivery !== 'pending')
        || (acOwner === 'disabled' && hostChangeIntent.delivery !== 'settled')) {
        throw invalidCommit('hostChangeIntent delivery is inconsistent with AC ownership');
    }
    return {
        contractVersion: SERVER_CHAT_COMMIT_CONTRACT,
        operationId,
        resultId,
        publishSeq,
        requestedCharId,
        requestedChatId,
        storedChatId,
        baseChatRevision,
        storedRevision,
        settingsDigest,
        executionContextId,
        archiveCenterRequestCorrelationId,
        prepareKey,
        prepareFingerprint,
        bindingEpoch,
        hostChangeSeq,
        inputReceipt,
        claimEpoch,
        chat,
        metadata: normalizedMetadata.metadata,
        metadataPresence: normalizedMetadata.presence,
        hostChangeIntent,
        owners,
        effectIntents: normalizeEffectIntents(source.effectIntents),
        acOwner,
        acState,
        readyForNextTurn: source.readyForNextTurn,
        awaitingMetadata: source.awaitingMetadata,
        committedAt,
    };
}

function normalizeEffectOutcome(name, value) {
    const source = requirePlainObject(`canonicalWrite.effects.${name}`, value);
    rejectUnexpectedKeys(
        `canonicalWrite.effects.${name}`,
        source,
        new Set(['status', 'reason']),
    );
    const status = requireIdentifier(`canonicalWrite.effects.${name}.status`, source.status, 32);
    if (!EFFECT_STATUSES.has(status)) {
        throw invalidCommit(`canonicalWrite.effects.${name}.status is unsupported`);
    }
    const outcome = { status };
    if (Object.prototype.hasOwnProperty.call(source, 'reason')) {
        outcome.reason = requireText(`canonicalWrite.effects.${name}.reason`, source.reason, 1024);
    }
    return outcome;
}

function normalizeGlobalVariableOutcomes(value, effectIntents, aggregateStatus) {
    if (!Array.isArray(value)) {
        throw invalidCommit('canonicalWrite.globalVariableOutcomes must be an array');
    }
    const affected = new Set([
        ...Object.keys(effectIntents.globalVariables.changed),
        ...effectIntents.globalVariables.deleted,
    ]);
    const outcomes = value.map((entry, index) => {
        const source = requirePlainObject(`canonicalWrite.globalVariableOutcomes[${index}]`, entry);
        rejectUnexpectedKeys(
            `canonicalWrite.globalVariableOutcomes[${index}]`,
            source,
            new Set(['key', 'status', 'reason']),
        );
        const outcome = normalizeEffectOutcome(
            `globalVariableOutcomes[${index}]`,
            {
                status: source.status,
                ...(Object.prototype.hasOwnProperty.call(source, 'reason')
                    ? { reason: source.reason }
                    : {}),
            },
        );
        return {
            key: requireText(`canonicalWrite.globalVariableOutcomes[${index}].key`, source.key, 1024),
            ...outcome,
        };
    }).sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0));
    if (new Set(outcomes.map((outcome) => outcome.key)).size !== outcomes.length
        || outcomes.length !== affected.size
        || outcomes.some((outcome) => !affected.has(outcome.key))) {
        throw invalidCommit('global variable outcomes do not cover the exact effect intent');
    }
    if (outcomes.length === 0) {
        if (aggregateStatus !== 'committed' && aggregateStatus !== 'skipped') {
            throw invalidCommit('empty global variable intent has an inconsistent effect status');
        }
        return outcomes;
    }
    const statuses = new Set(outcomes.map((outcome) => outcome.status));
    const expectedAggregate = statuses.has('failed')
        ? 'failed'
        : statuses.has('pending')
            ? 'pending'
            : statuses.has('conflict')
                ? 'conflict'
                : statuses.has('committed')
                    ? 'committed'
                    : 'skipped';
    if (aggregateStatus !== expectedAggregate) {
        throw invalidCommit('global variable aggregate status does not match key outcomes');
    }
    return outcomes;
}

function normalizeCanonicalWrite(value, effectIntents) {
    const source = requirePlainObject('canonicalWrite', value);
    rejectUnexpectedKeys(
        'canonicalWrite',
        source,
        new Set([
            'effects',
            'globalVariableOutcomes',
            'staticsMessagesAppliedDelta',
            'promptEffectsResolved',
            'commitSequence',
        ]),
    );
    const effectsSource = requirePlainObject('canonicalWrite.effects', source.effects);
    rejectUnexpectedKeys(
        'canonicalWrite.effects',
        effectsSource,
        new Set(['chat', 'metadata', 'globals', 'stats']),
    );
    const effects = {};
    for (const name of ['chat', 'metadata', 'globals', 'stats']) {
        effects[name] = normalizeEffectOutcome(name, effectsSource[name]);
    }
    if (effects.chat.status !== 'committed' || effects.metadata.status !== 'committed') {
        throw invalidCommit('chat and metadata effects must be committed atomically');
    }
    const globalVariableOutcomes = normalizeGlobalVariableOutcomes(
        source.globalVariableOutcomes,
        effectIntents,
        effects.globals.status,
    );
    if (!Number.isSafeInteger(source.staticsMessagesAppliedDelta)
        || source.staticsMessagesAppliedDelta < 0
        || (effects.stats.status === 'committed'
            ? source.staticsMessagesAppliedDelta !== effectIntents.staticsMessagesDelta
            : source.staticsMessagesAppliedDelta !== 0)) {
        throw invalidCommit('statics applied delta does not match its durable effect status');
    }
    if (typeof source.promptEffectsResolved !== 'boolean') {
        throw invalidCommit('canonicalWrite.promptEffectsResolved must be boolean');
    }
    if (source.promptEffectsResolved && !RESOLVED_EFFECT_STATUSES.has(effects.globals.status)) {
        throw invalidCommit('prompt effects cannot be resolved while globals remain unresolved');
    }
    return {
        commitSequence: requirePositiveInteger(
            'canonicalWrite.commitSequence',
            source.commitSequence,
        ),
        effects,
        globalVariableOutcomes,
        staticsMessagesAppliedDelta: source.staticsMessagesAppliedDelta,
        promptEffectsResolved: source.promptEffectsResolved,
    };
}

function fingerprintMaterial(normalized, finalContentHash) {
    const { chat: _chat, ...recovery } = normalized;
    return { ...recovery, finalContentHash };
}

function effectReceipt(operationId, name, outcome) {
    return {
        status: outcome.status,
        effectId: sha256(stableJSON({ operationId, effect: name })),
        ...(outcome.reason ? { reason: outcome.reason } : {}),
    };
}

function createCommitReceipt(material, requestFingerprint, canonicalWrite) {
    const effects = {};
    for (const name of ['chat', 'metadata', 'globals', 'stats']) {
        effects[name] = effectReceipt(material.operationId, name, canonicalWrite.effects[name]);
    }
    const commitReceiptId = sha256(stableJSON({
        contractVersion: SERVER_CHAT_COMMIT_CONTRACT,
        operationId: material.operationId,
        requestFingerprint,
        canonicalWrite,
    }));
    return {
        contractVersion: SERVER_CHAT_COMMIT_CONTRACT,
        commitReceiptId,
        operationId: material.operationId,
        resultId: material.resultId,
        publishSeq: material.publishSeq,
        requestedCharId: material.requestedCharId,
        requestedChatId: material.requestedChatId,
        storedChatId: material.storedChatId,
        baseChatRevision: material.baseChatRevision,
        storedRevision: material.storedRevision,
        bindingEpoch: material.bindingEpoch,
        hostChangeSeq: material.hostChangeSeq,
        inputReceiptId: material.inputReceipt.receiptId,
        claimEpoch: material.claimEpoch,
        storageDisposition: 'original',
        conflictReason: null,
        finalContentHash: material.finalContentHash,
        chatCommitted: true,
        effects,
        promptEffectsResolved: canonicalWrite.promptEffectsResolved,
        acOwner: material.acOwner,
        acState: material.acState,
        readyForNextTurn: material.readyForNextTurn && canonicalWrite.promptEffectsResolved,
    };
}

function normalizeStoredRecord(value, expectedOperationId = null) {
    if (!value || Buffer.byteLength(value) > SERVER_CHAT_COMMIT_MAX_RECORD_BYTES) return null;
    try {
        const parsed = JSON.parse(Buffer.isBuffer(value) ? value.toString('utf8') : String(value));
        const record = requirePlainObject('storedRecord', parsed);
        if (record.recordVersion !== 1 || record.contractVersion !== SERVER_CHAT_COMMIT_CONTRACT
            || !OPERATION_ID.test(record.operationId) || !SHA256.test(record.requestFingerprint)
            || !Number.isSafeInteger(record.commitSequence) || record.commitSequence <= 0) {
            return null;
        }
        if (expectedOperationId && record.operationId !== expectedOperationId) return null;
        const material = requirePlainObject('storedRecord.recovery', record.recovery);
        if (material.contractVersion !== SERVER_CHAT_COMMIT_CONTRACT
            || material.operationId !== record.operationId
            || !SHA256.test(material.finalContentHash)
            || material.finalContentHash !== material.storedRevision
            || material.requestedChatId !== material.storedChatId
            || material.metadata?.id !== material.storedChatId
            || material.metadata?._stub !== true
            || typeof material.metadata?.name !== 'string'
            || sha256(stableJSON(material)) !== record.requestFingerprint) {
            return null;
        }
        if (!Array.isArray(material.metadataPresence)
            || new Set(material.metadataPresence).size !== material.metadataPresence.length
            || material.metadataPresence.some((field) => !['lastDate', 'folderId', 'modules'].includes(field))
            || ['lastDate', 'folderId', 'modules'].some((field) => (
                Object.prototype.hasOwnProperty.call(material.metadata, field)
                && !material.metadataPresence.includes(field)
            ))) {
            return null;
        }
        for (const field of material.metadataPresence) {
            if (!Object.prototype.hasOwnProperty.call(material.metadata, field)) {
                Object.defineProperty(material.metadata, field, {
                    value: undefined,
                    enumerable: true,
                    configurable: true,
                    writable: true,
                });
            }
        }
        const journal = requirePlainObject('storedRecord.journal', record.journal);
        if (journal.storageKey !== `${CHAT_WRITE_JOURNAL_PREFIX}${Buffer.from(
            JSON.stringify([
                material.requestedCharId,
                material.storedChatId,
                'commit',
                material.operationId,
            ]),
            'utf8',
        ).toString('base64url')}`
            || !Number.isSafeInteger(journal.storageBytes) || journal.storageBytes <= 0
            || journal.chatHash !== material.finalContentHash) {
            return null;
        }
        if (material.hostChangeIntent?.payloadRef !== commitStorageKey(record.operationId)) return null;
        const canonicalWrite = normalizeCanonicalWrite(
            record.canonicalWrite,
            material.effectIntents,
        );
        if (canonicalWrite.commitSequence !== record.commitSequence) return null;
        const expectedReceipt = createCommitReceipt(material, record.requestFingerprint, canonicalWrite);
        if (stableJSON(record.commitReceipt) !== stableJSON(expectedReceipt)) return null;
        return {
            ...record,
            recovery: material,
            journal,
            canonicalWrite,
            commitReceipt: expectedReceipt,
        };
    } catch {
        return null;
    }
}

function ensureSynchronous(name, value) {
    if (value && typeof value.then === 'function') {
        const error = invalidCommit(`${name} returned a Promise inside a synchronous transaction`);
        error.code = 'SERVER_CHAT_COMMIT_ASYNC_TRANSACTION_WRITE';
        throw error;
    }
}

function publicError(error) {
    const candidateCode = typeof error?.code === 'string' ? error.code : '';
    return {
        code: /^[A-Z][A-Z0-9_]{2,63}$/.test(candidateCode)
            ? candidateCode
            : 'SERVER_CHAT_COMMIT_PUBLICATION_FAILED',
        message: 'Post-commit publication requires recovery',
    };
}

function committedResult(record, reason, reused, publication, publicationErrors = []) {
    return {
        status: 'committed',
        reason,
        receipt: record.commitReceipt,
        reused,
        publication,
        ...(publicationErrors.length > 0 ? { publicationErrors } : {}),
    };
}

function createServerChatCommitter({
    journal,
    kvGet,
    kvSet,
    kvList,
    queueStorageOperation,
    runTransaction,
    readCurrentRevision,
    readOperationState,
    calculateRevision,
    writeCanonicalState,
    writeCommittedOperationState,
    publishCanonicalState,
}) {
    if (!journal || typeof journal.prepareStage !== 'function'
        || typeof journal.describePreparedStage !== 'function'
        || typeof journal.writePreparedStage !== 'function'
        || typeof journal.publishPreparedStage !== 'function'
        || typeof journal.restoreDurableStage !== 'function'
        || typeof kvGet !== 'function' || typeof kvSet !== 'function' || typeof kvList !== 'function'
        || typeof queueStorageOperation !== 'function' || typeof runTransaction !== 'function'
        || typeof readCurrentRevision !== 'function' || typeof readOperationState !== 'function'
        || typeof calculateRevision !== 'function' || typeof writeCanonicalState !== 'function'
        || typeof writeCommittedOperationState !== 'function'
        || typeof publishCanonicalState !== 'function') {
        throw invalidCommit('committer dependencies are incomplete');
    }

    function readStored(operationId) {
        const value = kvGet(commitStorageKey(operationId));
        if (value === null || value === undefined) return { state: 'missing', record: null };
        const record = normalizeStoredRecord(value, operationId);
        return record
            ? { state: 'found', record }
            : { state: 'invalid', record: null };
    }

    function replayOrConflict(stored, fingerprint) {
        if (!stored || stored.state === 'missing') return null;
        if (stored.state !== 'found') {
            return { status: 'conflict', reason: 'commit_record_invalid', receipt: null, reused: false };
        }
        if (stored.record.requestFingerprint !== fingerprint) {
            return {
                status: 'conflict',
                reason: 'operation_fingerprint_conflict',
                receipt: null,
                reused: false,
            };
        }
        return committedResult(stored.record, 'commit_replayed', true, 'durable');
    }

    function operationGate(normalized) {
        const operationState = readOperationState(normalized.operationId);
        ensureSynchronous('readOperationState', operationState);
        if (!operationState || typeof operationState !== 'object') {
            return { status: 'conflict', reason: 'operation_state_missing', receipt: null, reused: false };
        }
        if (operationState.operationId !== normalized.operationId
            || operationState.charId !== normalized.requestedCharId
            || operationState.chatId !== normalized.requestedChatId) {
            return { status: 'conflict', reason: 'operation_coordinate_conflict', receipt: null, reused: false };
        }
        if (operationState.state === 'cancelled') {
            return { status: 'cancelled', reason: 'cancel_won', receipt: null, reused: false };
        }
        if (!COMMITTABLE_OPERATION_STATES.has(operationState.state)) {
            return { status: 'conflict', reason: 'operation_state_not_committable', receipt: null, reused: false };
        }
        if (operationState.claimEpoch !== undefined
            && operationState.claimEpoch !== normalized.claimEpoch) {
            return { status: 'conflict', reason: 'operation_claim_conflict', receipt: null, reused: false };
        }
        return null;
    }

    async function commitQueued(normalized, material, requestFingerprint) {
        const outsideExisting = replayOrConflict(readStored(normalized.operationId), requestFingerprint);
        if (outsideExisting) return outsideExisting;

        const preparedChat = await journal.prepareStage(
            normalized.requestedCharId,
            normalized.storedChatId,
            normalized.chat,
            {
                awaitingMetadata: normalized.awaitingMetadata,
                commitOperationId: normalized.operationId,
            },
        );
        const journalInfo = journal.describePreparedStage(preparedChat);

        let transactionResult;
        try {
            transactionResult = runTransaction(() => {
                const existing = replayOrConflict(readStored(normalized.operationId), requestFingerprint);
                if (existing) return existing;
                const gated = operationGate(normalized);
                if (gated) return gated;
                const currentRevision = readCurrentRevision(
                    normalized.requestedCharId,
                    normalized.requestedChatId,
                );
                ensureSynchronous('readCurrentRevision', currentRevision);
                if (currentRevision !== normalized.baseChatRevision) {
                    return {
                        status: 'conflict',
                        reason: 'base_revision_changed',
                        currentRevision,
                        receipt: null,
                        reused: false,
                    };
                }

                ensureSynchronous('writePreparedStage', journal.writePreparedStage(preparedChat));
                const canonicalWriteValue = writeCanonicalState({
                    request: normalized,
                    requestFingerprint,
                    finalContentHash: material.finalContentHash,
                    journal: journalInfo,
                });
                ensureSynchronous('writeCanonicalState', canonicalWriteValue);
                const canonicalWrite = normalizeCanonicalWrite(
                    canonicalWriteValue,
                    normalized.effectIntents,
                );
                if (normalized.readyForNextTurn && !canonicalWrite.promptEffectsResolved) {
                    throw invalidCommit('readyForNextTurn requires resolved prompt effects');
                }
                const commitReceipt = createCommitReceipt(
                    material,
                    requestFingerprint,
                    canonicalWrite,
                );
                const record = {
                    recordVersion: 1,
                    contractVersion: SERVER_CHAT_COMMIT_CONTRACT,
                    operationId: normalized.operationId,
                    commitSequence: canonicalWrite.commitSequence,
                    requestFingerprint,
                    journal: {
                        storageKey: journalInfo.storageKey,
                        storageBytes: journalInfo.storageBytes,
                        chatHash: material.finalContentHash,
                    },
                    recovery: material,
                    canonicalWrite,
                    commitReceipt,
                };
                const encodedRecord = Buffer.from(stableJSON(record), 'utf8');
                if (encodedRecord.byteLength > SERVER_CHAT_COMMIT_MAX_RECORD_BYTES) {
                    throw invalidCommit('commit recovery record is too large');
                }
                const stateWrite = writeCommittedOperationState(normalized.operationId, {
                    operationId: normalized.operationId,
                    charId: normalized.requestedCharId,
                    chatId: normalized.requestedChatId,
                    state: 'chat-committed',
                    resultId: normalized.resultId,
                    publishSeq: normalized.publishSeq,
                    baseChatRevision: normalized.baseChatRevision,
                    commitReceiptId: commitReceipt.commitReceiptId,
                    storedChatId: normalized.storedChatId,
                    storedRevision: normalized.storedRevision,
                    settingsDigest: normalized.settingsDigest,
                    executionContextId: normalized.executionContextId,
                    archiveCenterRequestCorrelationId:
                        normalized.archiveCenterRequestCorrelationId,
                    prepareKey: normalized.prepareKey,
                    prepareFingerprint: normalized.prepareFingerprint,
                    bindingEpoch: normalized.bindingEpoch,
                    hostChangeSeq: normalized.hostChangeSeq,
                    inputReceiptId: normalized.inputReceipt.receiptId,
                    claimEpoch: normalized.claimEpoch,
                    acOwner: normalized.acOwner,
                    acState: normalized.acState,
                    commitSequence: canonicalWrite.commitSequence,
                });
                ensureSynchronous('writeCommittedOperationState', stateWrite);
                if (stateWrite === false || stateWrite?.written === false) {
                    throw invalidCommit('operation committed-state write was rejected');
                }
                ensureSynchronous(
                    'kvSet',
                    kvSet(commitStorageKey(normalized.operationId), encodedRecord),
                );
                return {
                    status: 'committed',
                    reason: 'commit_written',
                    record,
                    receipt: commitReceipt,
                    reused: false,
                };
            });
            ensureSynchronous('runTransaction', transactionResult);
        } catch (cause) {
            const error = new Error('Server chat commit transaction failed');
            error.code = cause?.code || 'SERVER_CHAT_COMMIT_TRANSACTION_FAILED';
            error.commitState = 'not_committed';
            error.cause = cause;
            throw error;
        }
        if (!transactionResult || transactionResult.status !== 'committed'
            || transactionResult.reused) {
            return transactionResult;
        }

        const publicationErrors = [];
        try {
            journal.publishPreparedStage(preparedChat);
        } catch (error) {
            publicationErrors.push(publicError(error));
        }
        try {
            await publishCanonicalState(transactionResult.record, {
                chat: normalized.chat,
                recovery: false,
            });
        } catch (error) {
            publicationErrors.push(publicError(error));
        }
        return committedResult(
            transactionResult.record,
            'commit_written',
            false,
            publicationErrors.length > 0 ? 'pending_recovery' : 'published',
            publicationErrors,
        );
    }

    async function commit(request) {
        const normalized = normalizeCommitRequest(request);
        const calculatedRevision = calculateRevision(normalized.chat);
        ensureSynchronous('calculateRevision', calculatedRevision);
        if (calculatedRevision !== normalized.storedRevision) {
            throw invalidCommit('storedRevision does not match chat payload');
        }
        // chatRevision is calculated by the existing canonical chat encoder.
        // Reuse that exact digest so key-presence and encoder semantics are not
        // weakened by JSON fingerprinting (notably explicit undefined fields).
        const finalContentHash = calculatedRevision;
        const material = fingerprintMaterial(normalized, finalContentHash);
        const requestFingerprint = sha256(stableJSON(material));
        return queueStorageOperation(() => commitQueued(
            normalized,
            material,
            requestFingerprint,
        ));
    }

    function status(operationId) {
        const normalized = requireIdentifier('operationId', operationId, 128);
        if (!OPERATION_ID.test(normalized)) throw invalidCommit('operationId format is invalid');
        const stored = readStored(normalized);
        if (stored.state === 'invalid') {
            return { status: 'conflict', reason: 'commit_record_invalid', receipt: null, reused: false };
        }
        return stored.state === 'found'
            ? committedResult(stored.record, 'commit_found', true, 'durable')
            : { status: 'missing', reason: 'commit_not_found', receipt: null, reused: false };
    }

    async function recoverStored(record) {
        const publicationErrors = [];
        let durableChat = null;
        try {
            durableChat = await journal.restoreDurableStage(
                record.recovery.requestedCharId,
                record.recovery.storedChatId,
                {
                    expectedStorageKey: record.journal.storageKey,
                    validate: (candidate) => {
                        const revision = calculateRevision(candidate.chat);
                        ensureSynchronous('calculateRevision', revision);
                        return revision === record.journal.chatHash
                            && revision === record.recovery.storedRevision;
                    },
                },
            );
            if (!durableChat) {
                const currentRevision = readCurrentRevision(
                    record.recovery.requestedCharId,
                    record.recovery.storedChatId,
                );
                ensureSynchronous('readCurrentRevision', currentRevision);
                if (currentRevision !== record.recovery.storedRevision) {
                    throw invalidCommit('commit payload is absent from journal and canonical storage');
                }
            }
        } catch (error) {
            publicationErrors.push(publicError(error));
        }
        if (publicationErrors.length === 0) {
            try {
                await publishCanonicalState(record, {
                    chat: durableChat?.chat || null,
                    recovery: true,
                });
            } catch (error) {
                publicationErrors.push(publicError(error));
            }
        }
        return committedResult(
            record,
            publicationErrors.length > 0 ? 'commit_recovery_pending' : 'commit_recovered',
            true,
            publicationErrors.length > 0 ? 'pending_recovery' : 'published',
            publicationErrors,
        );
    }

    async function recover(operationId) {
        const normalized = requireIdentifier('operationId', operationId, 128);
        if (!OPERATION_ID.test(normalized)) throw invalidCommit('operationId format is invalid');
        return queueStorageOperation(async () => {
            const stored = readStored(normalized);
            if (stored.state === 'invalid') {
                return { status: 'conflict', reason: 'commit_record_invalid', receipt: null, reused: false };
            }
            if (stored.state === 'missing') {
                return { status: 'missing', reason: 'commit_not_found', receipt: null, reused: false };
            }
            return recoverStored(stored.record);
        });
    }

    async function recoverAll() {
        return queueStorageOperation(async () => {
            const keys = kvList(SERVER_CHAT_COMMIT_PREFIX);
            ensureSynchronous('kvList', keys);
            const results = [];
            const recoverable = [];
            for (const key of [...keys].sort()) {
                const record = normalizeStoredRecord(kvGet(key));
                if (!record || commitStorageKey(record.operationId) !== key) {
                    results.push({
                        key,
                        status: 'conflict',
                        reason: 'commit_record_invalid',
                        receipt: null,
                        reused: false,
                    });
                    continue;
                }
                recoverable.push({ key, record });
            }
            recoverable.sort((left, right) => (
                left.record.commitSequence - right.record.commitSequence
                || (left.record.operationId < right.record.operationId
                    ? -1
                    : left.record.operationId > right.record.operationId ? 1 : 0)
            ));
            const sequenceCounts = new Map();
            for (const { record } of recoverable) {
                sequenceCounts.set(
                    record.commitSequence,
                    (sequenceCounts.get(record.commitSequence) || 0) + 1,
                );
            }
            for (const { key, record } of recoverable) {
                if (sequenceCounts.get(record.commitSequence) !== 1) {
                    results.push({
                        key,
                        status: 'conflict',
                        reason: 'commit_sequence_conflict',
                        receipt: null,
                        reused: false,
                    });
                    continue;
                }
                results.push({ key, ...(await recoverStored(record)) });
            }
            return results;
        });
    }

    function readRecovery(operationId) {
        const normalized = requireIdentifier('operationId', operationId, 128);
        if (!OPERATION_ID.test(normalized)) throw invalidCommit('operationId format is invalid');
        const stored = readStored(normalized);
        return stored.state === 'found'
            ? clonePlainValue(stored.record)
            : null;
    }

    return { commit, status, recover, recoverAll, readRecovery };
}

module.exports = {
    HOST_CHANGE_INTENT_CONTRACT,
    SERVER_CHAT_COMMIT_CONTRACT,
    SERVER_CHAT_COMMIT_MAX_DEPTH,
    SERVER_CHAT_COMMIT_MAX_RECORD_BYTES,
    SERVER_CHAT_COMMIT_PREFIX,
    SERVER_CHAT_INPUT_RECEIPT_CONTRACT,
    commitStorageKey,
    createServerChatCommitter,
    normalizeCommitRequest,
    normalizeStoredRecord,
    stableJSON,
};
