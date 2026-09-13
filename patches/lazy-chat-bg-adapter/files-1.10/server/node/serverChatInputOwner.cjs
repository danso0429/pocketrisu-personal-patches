'use strict';

const crypto = require('node:crypto');
const {
    SERVER_CHAT_INPUT_RECEIPT_CONTRACT,
    stableJSON,
} = require('./serverChatCommit.cjs');
const {
    operationResultKey,
    operationStateKey,
    readOperationState,
    validOperationId,
    writeOperationState,
} = require('./bgOrchestrationOperationStore.cjs');

const SERVER_CHAT_INPUT_COMMAND_CONTRACT = 'bg_server_input_command.v1';
const SERVER_CHAT_INPUT_COMMAND_PREFIX = 'internal/server-chat-input/v1/';
const SERVER_CHAT_INPUT_SEQUENCE_PREFIX = 'internal/server-chat-input-sequence/v1/';
const SERVER_CHAT_INPUT_MAX_RECORD_BYTES = 2 * 1024 * 1024;
const SERVER_CHAT_INPUT_MAX_TEXT_BYTES = 1024 * 1024;
const TERMINAL_INPUT_STATES = new Set(['completed', 'failed', 'cancelled', 'blocked_edit']);

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function commandKey(operationId) {
    return SERVER_CHAT_INPUT_COMMAND_PREFIX
        + Buffer.from(operationId, 'utf8').toString('base64url');
}

function sequenceKey(charId, chatId) {
    return SERVER_CHAT_INPUT_SEQUENCE_PREFIX
        + Buffer.from(stableJSON([charId, chatId]), 'utf8').toString('base64url');
}

function journalOperationId(operationId) {
    return `input_${sha256(operationId).slice(0, 32)}`;
}

function text(name, value, maxBytes = 4096) {
    if (typeof value !== 'string' || value.length === 0
        || Buffer.byteLength(value, 'utf8') > maxBytes
        || /[\u0000\u007f]/u.test(value)) {
        throw new Error(`${name} is invalid`);
    }
    return value;
}

function clone(value) {
    return structuredClone(value);
}

function normalizeAdmission(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('server input admission is invalid');
    }
    const admission = {
        operationId: text('operationId', value.operationId, 128),
        inputCommandId: text('inputCommandId', value.inputCommandId, 255),
        userMessageId: text('userMessageId', value.userMessageId, 255),
        charId: text('charId', value.charId, 255),
        chatId: text('chatId', value.chatId, 255),
        rawText: text('rawText', value.rawText, SERVER_CHAT_INPUT_MAX_TEXT_BYTES),
        submittedBaseRevision: text(
            'submittedBaseRevision',
            value.submittedBaseRevision,
            256,
        ),
        settingsSnapshotRef: text('settingsSnapshotRef', value.settingsSnapshotRef, 255),
        submittedAt: value.submittedAt,
    };
    if (!validOperationId(admission.operationId)
        || !Number.isSafeInteger(admission.submittedAt) || admission.submittedAt <= 0) {
        throw new Error('server input admission identity is invalid');
    }
    return {
        ...admission,
        rawTextHash: sha256(admission.rawText),
    };
}

function requestFingerprint(admission) {
    return sha256(stableJSON(admission));
}

function parseRecord(value, expectedOperationId = null) {
    if (!value || Buffer.byteLength(value) > SERVER_CHAT_INPUT_MAX_RECORD_BYTES) return null;
    try {
        const parsed = JSON.parse(Buffer.isBuffer(value) ? value.toString('utf8') : String(value));
        if (!parsed || parsed.recordVersion !== 1
            || parsed.contractVersion !== SERVER_CHAT_INPUT_COMMAND_CONTRACT
            || !Number.isSafeInteger(parsed.admissionSeq) || parsed.admissionSeq <= 0
            || !['not_run', 'running', 'completed', 'unknown'].includes(parsed.transformState)
            || !['queued', 'attached', 'completed', 'failed', 'cancelled', 'blocked_edit']
                .includes(parsed.inputState)) {
            return null;
        }
        const admission = normalizeAdmission(parsed.admission);
        if (expectedOperationId && admission.operationId !== expectedOperationId) return null;
        if (parsed.operationId !== admission.operationId
            || parsed.requestFingerprint !== requestFingerprint(admission)
            || parsed.rawTextHash !== admission.rawTextHash
            || (parsed.queuePredecessorId !== null
                && !validOperationId(parsed.queuePredecessorId))) {
            return null;
        }
        if (parsed.inputState === 'attached' && (
            parsed.transformState !== 'completed'
            || parsed.inputReceipt?.contractVersion !== SERVER_CHAT_INPUT_RECEIPT_CONTRACT
            || parsed.inputReceipt?.operationId !== admission.operationId
            || parsed.inputReceipt?.inputCommandId !== admission.inputCommandId
            || parsed.inputReceipt?.messageId !== admission.userMessageId
            || parsed.inputReceipt?.revision !== parsed.executionBaseRevision
            || !Number.isSafeInteger(parsed.baselineMessageCount)
            || parsed.baselineMessageCount <= 0
            || typeof parsed.journal?.storageKey !== 'string'
            || !parsed.globalIntent || !Array.isArray(parsed.globalOutcomes)
        )) {
            return null;
        }
        return { ...parsed, admission };
    } catch {
        return null;
    }
}

function encodeRecord(record) {
    const encoded = Buffer.from(stableJSON(record), 'utf8');
    if (encoded.byteLength > SERVER_CHAT_INPUT_MAX_RECORD_BYTES) {
        throw new Error('server input command record is too large');
    }
    return encoded;
}

function normalizeGlobalIntent(value) {
    const changed = value?.changed;
    const deleted = value?.deleted;
    const expected = value?.expected;
    if (!changed || typeof changed !== 'object' || Array.isArray(changed)
        || !Array.isArray(deleted)
        || !expected || typeof expected !== 'object' || Array.isArray(expected)) {
        throw new Error('server input global intent is invalid');
    }
    return { changed: clone(changed), deleted: [...deleted], expected: clone(expected) };
}

function own(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
}

function expectationMatches(current, key, expectation) {
    if (!expectation || typeof expectation.present !== 'boolean') return false;
    const present = own(current, key);
    return present === expectation.present
        && (!present || stableJSON(current[key]) === stableJSON(expectation.value));
}

function desiredMatches(current, key, intent) {
    return own(intent.changed, key)
        ? own(current, key) && stableJSON(current[key]) === stableJSON(intent.changed[key])
        : !own(current, key);
}

function globalOutcomes(current, intent) {
    return [...new Set([...Object.keys(intent.changed), ...intent.deleted])]
        .sort()
        .map((key) => ({
            key,
            status: expectationMatches(current, key, intent.expected[key])
                || desiredMatches(current, key, intent) ? 'committed' : 'conflict',
        }));
}

function applyGlobals(database, record) {
    const current = database.globalChatVariables
        && typeof database.globalChatVariables === 'object'
        && !Array.isArray(database.globalChatVariables)
        ? { ...database.globalChatVariables }
        : {};
    const intent = record.globalIntent;
    for (const outcome of record.globalOutcomes) {
        if (outcome.status !== 'committed') continue;
        if (!expectationMatches(current, outcome.key, intent.expected[outcome.key])
            && !desiredMatches(current, outcome.key, intent)) {
            continue;
        }
        if (own(intent.changed, outcome.key)) current[outcome.key] = clone(intent.changed[outcome.key]);
        else delete current[outcome.key];
    }
    database.globalChatVariables = current;
}

function publishMetadata(database, charId, chat) {
    if (!Array.isArray(database.characters)) throw new Error('server input metadata owner unavailable');
    const characters = database.characters.slice();
    const characterIndex = characters.findIndex((character) => character?.chaId === charId);
    if (characterIndex < 0 || !Array.isArray(characters[characterIndex].chats)) {
        throw new Error('server input character metadata unavailable');
    }
    const character = { ...characters[characterIndex], chats: characters[characterIndex].chats.slice() };
    const chatIndex = character.chats.findIndex((candidate) => candidate?.id === chat.id);
    if (chatIndex < 0) throw new Error('server input chat metadata unavailable');
    const metadata = { id: chat.id, name: typeof chat.name === 'string' ? chat.name : '', _stub: true };
    for (const field of ['lastDate', 'folderId', 'modules']) {
        if (own(chat, field)) metadata[field] = clone(chat[field]);
    }
    character.chats[chatIndex] = metadata;
    characters[characterIndex] = character;
    database.characters = characters;
}

function createServerChatInputOwner({
    chatWriteJournal,
    kvGet,
    kvSet,
    kvDel,
    kvDelPrefix,
    kvList,
    sqliteDb,
    queueStorageOperation,
    chatRevision,
    ensureCanonicalState,
    getDbCache,
    getFullChatStore,
    databaseKey,
    cacheStrippedDatabase,
    scheduleChatStorePersist,
}) {
    const dependencies = {
        chatWriteJournal,
        kvGet,
        kvSet,
        kvDel,
        kvDelPrefix,
        kvList,
        sqliteDb,
        queueStorageOperation,
        chatRevision,
        ensureCanonicalState,
        getDbCache,
        getFullChatStore,
        databaseKey,
        cacheStrippedDatabase,
        scheduleChatStorePersist,
    };
    for (const [name, value] of Object.entries(dependencies)) {
        if (value === undefined || value === null) {
            throw new Error(`server input owner dependency missing: ${name}`);
        }
    }

    const read = (operationId) => parseRecord(kvGet(commandKey(operationId)), operationId);
    const write = (record) => kvSet(commandKey(record.operationId), encodeRecord(record));
    const currentChat = (charId, chatId) => getFullChatStore()?.get(charId)?.get(chatId) || null;
    const currentRevision = (charId, chatId) => {
        const chat = currentChat(charId, chatId);
        return chat ? chatRevision(chat) : null;
    };

    function allRecords() {
        const records = [];
        for (const key of kvList(SERVER_CHAT_INPUT_COMMAND_PREFIX)) {
            const encoded = typeof key === 'string' && key.startsWith(SERVER_CHAT_INPUT_COMMAND_PREFIX)
                ? key.slice(SERVER_CHAT_INPUT_COMMAND_PREFIX.length)
                : '';
            let operationId = '';
            try { operationId = Buffer.from(encoded, 'base64url').toString('utf8'); } catch { /* invalid */ }
            const record = validOperationId(operationId) && commandKey(operationId) === key
                ? read(operationId)
                : null;
            if (!record) throw new Error('server input command store contains an invalid record');
            records.push(record);
        }
        return records;
    }

    async function admit(value) {
        const admission = normalizeAdmission(value);
        const fingerprint = requestFingerprint(admission);
        await ensureCanonicalState();
        return queueStorageOperation(() => sqliteDb.transaction(() => {
            const existing = read(admission.operationId);
            if (existing) {
                return existing.requestFingerprint === fingerprint
                    ? { status: 'admitted', reused: true, record: clone(existing) }
                    : { status: 'conflict', reason: 'operation_fingerprint_conflict' };
            }
            if (kvGet(commandKey(admission.operationId))) {
                return { status: 'conflict', reason: 'command_record_invalid' };
            }
            if (currentRevision(admission.charId, admission.chatId)
                !== admission.submittedBaseRevision) {
                return { status: 'conflict', reason: 'submitted_base_changed' };
            }
            const active = allRecords().find((record) => (
                record.admission.charId === admission.charId
                && record.admission.chatId === admission.chatId
                && !TERMINAL_INPUT_STATES.has(record.inputState)
            ));
            if (active) {
                return {
                    status: 'conflict',
                    reason: 'chat_input_busy',
                    blockingOperationId: active.operationId,
                };
            }
            const counterKey = sequenceKey(admission.charId, admission.chatId);
            const rawCounter = kvGet(counterKey);
            let counter = { version: 1, value: 0, lastOperationId: null };
            if (rawCounter) {
                try { counter = JSON.parse(Buffer.isBuffer(rawCounter) ? rawCounter.toString('utf8') : String(rawCounter)); }
                catch { throw new Error('server input sequence is invalid'); }
            }
            if (!counter || counter.version !== 1 || !Number.isSafeInteger(counter.value)
                || counter.value < 0 || counter.value >= Number.MAX_SAFE_INTEGER
                || (counter.lastOperationId !== null && !validOperationId(counter.lastOperationId))) {
                throw new Error('server input sequence is invalid');
            }
            const record = {
                recordVersion: 1,
                contractVersion: SERVER_CHAT_INPUT_COMMAND_CONTRACT,
                operationId: admission.operationId,
                requestFingerprint: fingerprint,
                rawTextHash: admission.rawTextHash,
                admission,
                admissionSeq: counter.value + 1,
                queuePredecessorId: counter.lastOperationId,
                transformState: 'not_run',
                inputState: 'queued',
                inputReceipt: null,
                executionBaseRevision: null,
                baselineMessageCount: null,
                journal: null,
                globalIntent: null,
                globalOutcomes: null,
                terminal: null,
            };
            write(record);
            kvSet(counterKey, JSON.stringify({
                version: 1,
                value: record.admissionSeq,
                lastOperationId: admission.operationId,
            }));
            const operation = writeOperationState(kvSet, admission.operationId, {
                charId: admission.charId,
                chatId: admission.chatId,
                baseChatRevision: admission.submittedBaseRevision,
                serverChatCommitVersion: 1,
                serverBaseChatRevision: admission.submittedBaseRevision,
                inputCommandVersion: 1,
                inputCommandId: admission.inputCommandId,
                admissionSeq: record.admissionSeq,
            }, 'queued');
            if (!operation.written) throw operation.error || new Error('operation state write failed');
            return { status: 'admitted', reused: false, record: clone(record) };
        })());
    }

    async function beginTransform(operationId) {
        return queueStorageOperation(() => sqliteDb.transaction(() => {
            const record = read(operationId);
            if (!record) return { status: 'missing' };
            if (record.inputState === 'attached') {
                return { status: 'attached', record: clone(record) };
            }
            if (record.inputState !== 'queued') {
                return { status: 'blocked', reason: record.inputState };
            }
            if (readOperationState(kvGet, operationId)?.state === 'cancelled') {
                const cancelled = {
                    ...record,
                    inputState: 'cancelled',
                    terminal: { state: 'cancelled', at: Date.now() },
                };
                write(cancelled);
                return { status: 'blocked', reason: 'cancelled' };
            }
            if (record.transformState === 'running' || record.transformState === 'unknown') {
                return { status: 'blocked', reason: 'transform_outcome_unknown' };
            }
            if (record.transformState !== 'not_run') {
                return { status: 'blocked', reason: 'transform_state_invalid' };
            }
            const next = { ...record, transformState: 'running' };
            write(next);
            return { status: 'started', record: clone(next) };
        })());
    }

    async function publishAttached(record, suppliedChat = null) {
        await ensureCanonicalState();
        let chat = suppliedChat;
        if (!chat) {
            const durable = await chatWriteJournal.restoreDurableStage(
                record.admission.charId,
                record.admission.chatId,
                {
                    expectedStorageKey: record.journal.storageKey,
                    validate: (candidate) => chatRevision(candidate.chat) === record.executionBaseRevision,
                },
            );
            chat = durable?.chat || null;
        }
        const liveRevision = currentRevision(record.admission.charId, record.admission.chatId);
        if (!chat) {
            if (liveRevision !== record.executionBaseRevision) {
                throw new Error('attached input chat is unavailable');
            }
            chat = currentChat(record.admission.charId, record.admission.chatId);
        }
        if (chatRevision(chat) !== record.executionBaseRevision
            || (liveRevision !== record.admission.submittedBaseRevision
                && liveRevision !== record.executionBaseRevision)) {
            throw new Error('attached input publication revision conflict');
        }
        const database = getDbCache()?.[databaseKey];
        if (!database || typeof database !== 'object') {
            throw new Error('attached input database cache unavailable');
        }
        const nextDatabase = { ...database };
        publishMetadata(nextDatabase, record.admission.charId, chat);
        applyGlobals(nextDatabase, record);
        cacheStrippedDatabase(nextDatabase);
        let chats = getFullChatStore()?.get(record.admission.charId);
        if (!chats) {
            chats = new Map();
            getFullChatStore().set(record.admission.charId, chats);
        }
        chats.set(record.admission.chatId, chat);
        scheduleChatStorePersist();
        return chat;
    }

    async function attachTransformed(operationId, value) {
        const before = read(operationId);
        if (!before) return { status: 'missing' };
        if (before.inputState === 'attached') {
            return {
                status: 'attached',
                reused: true,
                record: clone(before),
                publication: 'durable',
            };
        }
        const chat = clone(value?.chat);
        if (!chat || chat.id !== before.admission.chatId || !Array.isArray(chat.message)) {
            throw new Error('transformed input chat is invalid');
        }
        const matches = chat.message.filter((message) => (
            message?.chatId === before.admission.userMessageId && message?.role === 'user'
        ));
        if (matches.length !== 1) throw new Error('transformed input message identity is invalid');
        const globalIntent = normalizeGlobalIntent(value?.globalIntent);
        const prepared = await chatWriteJournal.prepareStage(
            before.admission.charId,
            before.admission.chatId,
            chat,
            { awaitingMetadata: false, commitOperationId: journalOperationId(operationId) },
        );
        const journal = chatWriteJournal.describePreparedStage(prepared);
        const outcome = await queueStorageOperation(() => sqliteDb.transaction(() => {
            const record = read(operationId);
            if (!record) return { status: 'missing' };
            if (record.inputState === 'attached') {
                return { status: 'attached', reused: true, record: clone(record) };
            }
            if (record.inputState !== 'queued' || record.transformState !== 'running') {
                return { status: 'blocked', reason: 'transform_not_owned' };
            }
            if (currentRevision(record.admission.charId, record.admission.chatId)
                !== record.admission.submittedBaseRevision) {
                const blocked = {
                    ...record,
                    transformState: 'completed',
                    inputState: 'blocked_edit',
                    terminal: { state: 'blocked_edit', at: Date.now() },
                };
                write(blocked);
                return { status: 'blocked', reason: 'base_revision_changed', record: clone(blocked) };
            }
            const database = getDbCache()?.[databaseKey];
            if (!database || typeof database !== 'object') throw new Error('input database cache unavailable');
            const currentGlobals = database.globalChatVariables
                && typeof database.globalChatVariables === 'object'
                && !Array.isArray(database.globalChatVariables)
                ? database.globalChatVariables
                : {};
            const outcomes = globalOutcomes(currentGlobals, globalIntent);
            const executionBaseRevision = chatRevision(chat);
            const inputReceipt = {
                contractVersion: SERVER_CHAT_INPUT_RECEIPT_CONTRACT,
                receiptId: sha256(stableJSON({
                    operationId,
                    inputCommandId: record.admission.inputCommandId,
                    messageId: record.admission.userMessageId,
                    revision: executionBaseRevision,
                })),
                inputCommandId: record.admission.inputCommandId,
                operationId,
                charId: record.admission.charId,
                chatId: record.admission.chatId,
                messageId: record.admission.userMessageId,
                role: 'user',
                revision: executionBaseRevision,
                hostChangeSeq: 1,
            };
            chatWriteJournal.writePreparedStage(prepared);
            const next = {
                ...record,
                transformState: 'completed',
                inputState: 'attached',
                inputReceipt,
                executionBaseRevision,
                baselineMessageCount: chat.message.length,
                journal,
                globalIntent,
                globalOutcomes: outcomes,
            };
            write(next);
            const operation = writeOperationState(kvSet, operationId, {
                charId: record.admission.charId,
                chatId: record.admission.chatId,
                baseChatRevision: record.admission.submittedBaseRevision,
                serverChatCommitVersion: 1,
                serverBaseChatRevision: executionBaseRevision,
                inputCommandVersion: 1,
                inputCommandId: record.admission.inputCommandId,
                admissionSeq: record.admissionSeq,
            }, 'queued');
            if (!operation.written) throw operation.error || new Error('operation state write failed');
            return { status: 'attached', reused: false, record: clone(next) };
        })());
        if (outcome.status !== 'attached' || outcome.reused) return outcome;
        const publicationErrors = [];
        try { chatWriteJournal.publishPreparedStage(prepared); } catch { publicationErrors.push('journal') }
        try { await publishAttached(outcome.record, chat); } catch { publicationErrors.push('canonical') }
        return {
            ...outcome,
            publication: publicationErrors.length === 0 ? 'published' : 'pending_recovery',
        };
    }

    async function loadExecution(operationId) {
        const record = read(operationId);
        if (!record) return { status: 'missing' };
        if (record.inputState === 'queued' && record.transformState === 'not_run') {
            return { status: 'transform-required', record: clone(record) };
        }
        if (record.inputState === 'attached') {
            await ensureCanonicalState();
            let chat = currentChat(record.admission.charId, record.admission.chatId);
            if (!chat || chatRevision(chat) !== record.executionBaseRevision) {
                try { chat = await publishAttached(record); } catch { /* reported below */ }
            }
            if (!chat || chatRevision(chat) !== record.executionBaseRevision) {
                return { status: 'blocked', reason: 'attached_chat_changed', record: clone(record) };
            }
            return { status: 'attached', record: clone(record), chat: clone(chat) };
        }
        return {
            status: 'blocked',
            reason: record.transformState === 'running' || record.transformState === 'unknown'
                ? 'transform_outcome_unknown'
                : record.inputState,
            record: clone(record),
        };
    }

    function settleSynchronously(operationId, state, resultRevision = null) {
        if (!['completed', 'failed', 'cancelled'].includes(state)) return false;
        const record = read(operationId);
        if (!record || TERMINAL_INPUT_STATES.has(record.inputState)) return !!record;
        write({
            ...record,
            inputState: state,
            terminal: { state, resultRevision, at: Date.now() },
        });
        return true;
    }

    function markRunFailureSynchronously(operationId, providerStarted = false) {
        const record = read(operationId);
        if (!record || TERMINAL_INPUT_STATES.has(record.inputState)) return !!record;
        if (record.inputState === 'attached') {
            if (!providerStarted) return true;
            return settleSynchronously(operationId, 'failed');
        }
        write({
            ...record,
            transformState: record.transformState === 'running' ? 'unknown' : record.transformState,
        });
        return true;
    }

    function pendingProjection(charId, chatId) {
        return allRecords().filter((record) => (
            record.admission.charId === charId
            && record.admission.chatId === chatId
            && (record.inputState === 'queued' || record.inputState === 'blocked_edit')
        )).sort((left, right) => left.admissionSeq - right.admissionSeq).map((record) => ({
            operationId: record.operationId,
            inputCommandId: record.admission.inputCommandId,
            admissionSeq: record.admissionSeq,
            rawText: record.admission.rawText,
            cancelAllowed: record.inputState === 'queued',
            state: record.inputState === 'blocked_edit' || record.transformState === 'unknown'
                ? 'blocked_edit'
                : 'queued',
        }));
    }

    async function recoverAll() {
        const records = allRecords();
        const attached = records.filter((record) => record.inputState === 'attached');
        if (attached.length > 0) await ensureCanonicalState();
        const results = [];
        for (const record of records) {
            if (record.transformState === 'running' && record.inputState === 'queued') {
                const updated = { ...record, transformState: 'unknown' };
                sqliteDb.transaction(() => write(updated))();
                results.push({ operationId: record.operationId, status: 'blocked', reason: 'transform_outcome_unknown' });
                continue;
            }
            if (record.inputState !== 'attached') continue;
            try {
                await publishAttached(record);
                results.push({ operationId: record.operationId, status: 'attached' });
            } catch {
                results.push({ operationId: record.operationId, status: 'pending_recovery' });
            }
        }
        return results;
    }

    function discardRecovery() {
        for (const record of allRecords()) {
            kvDel(operationStateKey(record.operationId));
            kvDel(operationResultKey(record.operationId));
        }
        kvDelPrefix(SERVER_CHAT_INPUT_COMMAND_PREFIX);
        kvDelPrefix(SERVER_CHAT_INPUT_SEQUENCE_PREFIX);
    }

    return {
        admit,
        attachTransformed,
        beginTransform,
        discardRecovery,
        loadExecution,
        markRunFailureSynchronously,
        pendingProjection,
        read: (operationId) => clone(read(operationId)),
        recoverAll,
        settleSynchronously,
    };
}

module.exports = {
    SERVER_CHAT_INPUT_COMMAND_CONTRACT,
    SERVER_CHAT_INPUT_COMMAND_PREFIX,
    SERVER_CHAT_INPUT_SEQUENCE_PREFIX,
    commandKey,
    createServerChatInputOwner,
    journalOperationId,
    parseRecord,
};
