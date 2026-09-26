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
const SERVER_CHAT_SETTINGS_SNAPSHOT_REF_PREFIX = 'volatile/server-chat-settings/v1/';
const SERVER_CHAT_INPUT_MAX_RECORD_BYTES = 2 * 1024 * 1024;
const SERVER_CHAT_INPUT_MAX_TEXT_BYTES = 1024 * 1024;
const SERVER_CHAT_SETTINGS_SNAPSHOT_MAX_BYTES = 256 * 1024 * 1024;
const SERVER_CHAT_SETTINGS_SNAPSHOT_MAX_CONTEXTS = 2;
const SERVER_CHAT_INPUT_MAX_NONTERMINAL_PER_CHAT = 2;
const SERVER_CHAT_INPUT_RETIRE_AFTER_MS = 49 * 60 * 60 * 1000;
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

function settingsSnapshotKey(operationId) {
    return SERVER_CHAT_SETTINGS_SNAPSHOT_REF_PREFIX
        + Buffer.from(operationId, 'utf8').toString('base64url');
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

function normalizeCommand(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('server input command is invalid');
    }
    const command = {
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
        submittedAt: value.submittedAt,
    };
    if (!validOperationId(command.operationId)
        || !/^[a-f0-9]{64}$/.test(command.submittedBaseRevision)
        || !Number.isSafeInteger(command.submittedAt) || command.submittedAt <= 0
        || (value.replaceBlockedOperationId !== undefined
            && !validOperationId(value.replaceBlockedOperationId))) {
        throw new Error('server input command identity is invalid');
    }
    return {
        ...command,
        ...(value.replaceBlockedOperationId !== undefined ? {
            replaceBlockedOperationId: text(
                'replaceBlockedOperationId', value.replaceBlockedOperationId, 128,
            ),
        } : {}),
        rawTextHash: sha256(command.rawText),
    };
}

function normalizeAdmission(value) {
    const command = normalizeCommand(value);
    const admission = {
        ...command,
        settingsSnapshotRef: text('settingsSnapshotRef', value.settingsSnapshotRef, 255),
        settingsSnapshotMode: value.settingsSnapshotMode,
        settingsSnapshotBytes: value.settingsSnapshotBytes,
        settingsContextDigest: text(
            'settingsContextDigest',
            value.settingsContextDigest,
            64,
        ),
    };
    if (admission.settingsSnapshotRef !== settingsSnapshotKey(admission.operationId)
        || admission.settingsSnapshotMode !== 'volatile'
        || !Number.isSafeInteger(admission.settingsSnapshotBytes)
        || admission.settingsSnapshotBytes <= 0
        || admission.settingsSnapshotBytes > SERVER_CHAT_SETTINGS_SNAPSHOT_MAX_BYTES
        || !/^[a-f0-9]{64}$/.test(admission.settingsContextDigest)) {
        throw new Error('server input settings snapshot identity is invalid');
    }
    return admission;
}

function requestFingerprint(admission) {
    return sha256(stableJSON(admission));
}

function retiredChecksum(record) {
    const body = { ...record };
    delete body.retiredChecksum;
    return sha256(stableJSON(body));
}

function parseRetiredRecord(parsed, expectedOperationId) {
    if (parsed.recordVersion !== 5
        || parsed.contractVersion !== SERVER_CHAT_INPUT_COMMAND_CONTRACT
        || !validOperationId(parsed.operationId)
        || (expectedOperationId && parsed.operationId !== expectedOperationId)
        || !['completed', 'failed', 'cancelled', 'blocked_edit'].includes(parsed.inputState)
        || !Number.isSafeInteger(parsed.admissionSeq) || parsed.admissionSeq <= 0
        || (parsed.queuePredecessorId !== null
            && !validOperationId(parsed.queuePredecessorId))
        || parsed.executionPredecessorId !== null
        || parsed.predecessorResolution !== null
        || typeof parsed.effectiveBaseRevision !== 'string'
        || !/^[a-f0-9]{64}$/.test(parsed.effectiveBaseRevision)
        || !/^[a-f0-9]{64}$/.test(parsed.requestFingerprint)
        || parsed.rawTextHash !== null
        || parsed.retiredChecksum !== retiredChecksum(parsed)
        || !Number.isSafeInteger(parsed.retiredAt) || parsed.retiredAt <= 0
        || parsed.inputReceipt !== null || parsed.journal !== null
        || (parsed.inputReceiptId !== undefined && parsed.inputReceiptId !== null
            && !/^[a-f0-9]{64}$/.test(parsed.inputReceiptId))
        || parsed.globalIntent !== null || parsed.globalOutcomes !== null
        || parsed.inputMessageRevision !== null || parsed.baselineMessageCount !== null
        || parsed.admission?.rawText !== null
        || parsed.admission?.rawTextHash !== null
        || parsed.terminal?.state !== parsed.inputState
        || (parsed.inputState === 'blocked_edit'
            && (!Number.isSafeInteger(parsed.userResolvedAt)
                || parsed.userResolvedAt <= 0
                || !validOperationId(parsed.replacedByOperationId)))
        || (parsed.inputState !== 'blocked_edit'
            && (parsed.userResolvedAt !== undefined
                || parsed.replacedByOperationId !== undefined))
        || !Number.isSafeInteger(parsed.terminal?.at)
        || parsed.terminal.at <= 0 || parsed.retiredAt < parsed.terminal.at
        || (parsed.inputState === 'completed'
            && (parsed.terminal.publication !== 'published'
                || !/^[a-f0-9]{64}$/.test(parsed.terminal.resultRevision)))) {
        return null;
    }
    const admission = normalizeAdmission({ ...parsed.admission, rawText: 'retired' });
    if (admission.operationId !== parsed.operationId
        || (parsed.admissionSeq === 1 && parsed.queuePredecessorId !== null)) return null;
    return {
        ...parsed,
        inputReceiptId: parsed.inputReceiptId ?? null,
        admission: { ...admission, rawText: null, rawTextHash: null },
    };
}

function parseRecord(value, expectedOperationId = null) {
    if (!value || Buffer.byteLength(value) > SERVER_CHAT_INPUT_MAX_RECORD_BYTES) return null;
    try {
        const parsed = JSON.parse(Buffer.isBuffer(value) ? value.toString('utf8') : String(value));
        if (parsed?.recordVersion === 5) {
            return parseRetiredRecord(parsed, expectedOperationId);
        }
        if (!parsed || parsed.recordVersion !== 4
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
            || typeof parsed.effectiveBaseRevision !== 'string'
            || !/^[a-f0-9]{64}$/.test(parsed.effectiveBaseRevision)
            || (parsed.queuePredecessorId !== null
                && !validOperationId(parsed.queuePredecessorId))
            || (parsed.executionPredecessorId !== null
                && !validOperationId(parsed.executionPredecessorId))) {
            return null;
        }
        if (parsed.userResolvedAt !== undefined || parsed.replacedByOperationId !== undefined) {
            if (parsed.inputState !== 'blocked_edit'
                || !Number.isSafeInteger(parsed.userResolvedAt)
                || parsed.userResolvedAt <= 0
                || !validOperationId(parsed.replacedByOperationId)) return null;
        }
        if (parsed.predecessorResolution !== null) {
            const resolution = parsed.predecessorResolution;
            if (!resolution || typeof resolution !== 'object' || Array.isArray(resolution)
                || parsed.executionPredecessorId === null
                || resolution.operationId !== parsed.executionPredecessorId
                || !['completed', 'failed', 'cancelled'].includes(resolution.state)
                || typeof resolution.revision !== 'string'
                || !/^[a-f0-9]{64}$/.test(resolution.revision)
                || resolution.revision !== parsed.effectiveBaseRevision
                || !Number.isSafeInteger(resolution.resolvedAt)
                || resolution.resolvedAt <= 0) {
                return null;
            }
        } else if (parsed.effectiveBaseRevision !== admission.submittedBaseRevision) {
            return null;
        }
        if (parsed.inputState === 'completed') {
            if (parsed.terminal?.state !== 'completed'
                || typeof parsed.terminal.resultRevision !== 'string'
                || !/^[a-f0-9]{64}$/.test(parsed.terminal.resultRevision)
                || !['pending', 'published'].includes(parsed.terminal.publication)
                || !Number.isSafeInteger(parsed.terminal.at)
                || parsed.terminal.at <= 0
                || (parsed.terminal.publication === 'published'
                    && (!Number.isSafeInteger(parsed.terminal.publishedAt)
                        || parsed.terminal.publishedAt <= 0))) {
                return null;
            }
        } else if (parsed.inputState === 'failed' || parsed.inputState === 'cancelled') {
            if (parsed.terminal?.state !== parsed.inputState
                || parsed.terminal.publication !== 'not_applicable'
                || !Number.isSafeInteger(parsed.terminal.at)
                || parsed.terminal.at <= 0) {
                return null;
            }
        } else if (parsed.inputState === 'blocked_edit') {
            if (parsed.terminal?.state !== 'blocked_edit'
                || !Number.isSafeInteger(parsed.terminal.at)
                || parsed.terminal.at <= 0) {
                return null;
            }
        } else if (parsed.terminal !== null) {
            return null;
        }
        if ((parsed.inputState === 'attached' && parsed.inputReceipt === null)
            || (parsed.inputReceipt !== null && (
            parsed.transformState !== 'completed'
            || parsed.inputReceipt?.contractVersion !== SERVER_CHAT_INPUT_RECEIPT_CONTRACT
            || parsed.inputReceipt?.operationId !== admission.operationId
            || parsed.inputReceipt?.inputCommandId !== admission.inputCommandId
            || parsed.inputReceipt?.messageId !== admission.userMessageId
            || parsed.inputReceipt?.revision !== parsed.executionBaseRevision
            || typeof parsed.inputMessageRevision !== 'string'
            || !/^[a-f0-9]{64}$/.test(parsed.inputMessageRevision)
            || !Number.isSafeInteger(parsed.baselineMessageCount)
            || parsed.baselineMessageCount <= 0
            || typeof parsed.journal?.storageKey !== 'string'
            || !parsed.globalIntent || !Array.isArray(parsed.globalOutcomes)
        ))) {
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
        if (outcome.status === 'committed'
            && !expectationMatches(current, outcome.key, intent.expected[outcome.key])
            && !desiredMatches(current, outcome.key, intent)) {
            throw new Error('attached input global variables changed before publication');
        }
    }
    for (const outcome of record.globalOutcomes) {
        if (outcome.status !== 'committed') continue;
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
    encodeSettingsSnapshot,
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
        encodeSettingsSnapshot,
    };
    for (const [name, value] of Object.entries(dependencies)) {
        if (value === undefined || value === null) {
            throw new Error(`server input owner dependency missing: ${name}`);
        }
    }

    const read = (operationId) => parseRecord(kvGet(commandKey(operationId)), operationId);
    const write = (record) => kvSet(commandKey(record.operationId), encodeRecord(record));
    const settingsSnapshots = new Map();
    const currentChat = (charId, chatId) => getFullChatStore()?.get(charId)?.get(chatId) || null;
    const currentRevision = (charId, chatId) => {
        const chat = currentChat(charId, chatId);
        return chat ? chatRevision(chat) : null;
    };

    function containsOwnedInput(record, chat) {
        if (!record.inputMessageRevision || !Array.isArray(chat?.message)) return false;
        const matches = chat.message.filter((message) => (
            message?.chatId === record.admission.userMessageId
            && message?.role === 'user'
            && sha256(stableJSON(message)) === record.inputMessageRevision
        ));
        return matches.length === 1;
    }

    function requiresExecutionPredecessor(record, chat) {
        if (record.recordVersion === 5) return false;
        if (record.inputState === 'blocked_edit') return !record.userResolvedAt;
        if (!TERMINAL_INPUT_STATES.has(record.inputState)) return true;
        if (record.inputState === 'completed') {
            const resultRevision = record.terminal?.resultRevision;
            const liveRevision = chat ? chatRevision(chat) : null;
            if (liveRevision === resultRevision) return false;
            return record.terminal?.publication !== 'published';
        }
        if ((record.inputState === 'failed' || record.inputState === 'cancelled')
            && record.inputReceipt) {
            return !containsOwnedInput(record, chat);
        }
        return false;
    }

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

    function readSettingsSnapshotRecord(record) {
        const snapshot = settingsSnapshots.get(record.operationId);
        if (!snapshot || snapshot.ref !== record.admission.settingsSnapshotRef
            || snapshot.contextDigest !== record.admission.settingsContextDigest) return null;
        const bytes = Buffer.from(snapshot.bytes);
        if (bytes.byteLength !== record.admission.settingsSnapshotBytes
            || sha256(bytes) !== snapshot.integrity) {
            return null;
        }
        return {
            ref: record.admission.settingsSnapshotRef,
            contextDigest: record.admission.settingsContextDigest,
            bytes,
        };
    }

    function loadSettingsSnapshot(operationId) {
        const record = read(operationId);
        if (!record) return { status: 'missing' };
        if (TERMINAL_INPUT_STATES.has(record.inputState)) {
            return { status: 'blocked', reason: record.inputState, record: clone(record) };
        }
        const snapshot = readSettingsSnapshotRecord(record);
        return snapshot
            ? { status: 'ready', ...snapshot, record: clone(record) }
            : { status: 'blocked', reason: 'settings_context_unavailable', record: clone(record) };
    }

    function settingsSnapshotStats() {
        let bytes = 0;
        for (const snapshot of settingsSnapshots.values()) bytes += snapshot.bytes.byteLength;
        return {
            contexts: settingsSnapshots.size,
            bytes,
            maxContexts: SERVER_CHAT_SETTINGS_SNAPSHOT_MAX_CONTEXTS,
            maxBytes: SERVER_CHAT_SETTINGS_SNAPSHOT_MAX_CONTEXTS
                * SERVER_CHAT_SETTINGS_SNAPSHOT_MAX_BYTES,
        };
    }

    async function advancePredecessor(operationId) {
        await ensureCanonicalState();
        const outcome = await queueStorageOperation(() => sqliteDb.transaction(() => {
            const record = read(operationId);
            if (!record) return { status: 'missing' };
            if (record.predecessorResolution !== null || record.inputState !== 'queued') {
                return { status: 'ready', record: clone(record) };
            }
            const previousAdmission = record.admissionSeq > 1
                && validOperationId(record.queuePredecessorId)
                ? read(record.queuePredecessorId)
                : null;
            if ((record.admissionSeq === 1 && record.queuePredecessorId !== null)
                || (record.admissionSeq > 1 && (
                    !previousAdmission
                    || previousAdmission.admission.charId !== record.admission.charId
                    || previousAdmission.admission.chatId !== record.admission.chatId
                    || previousAdmission.admissionSeq !== record.admissionSeq - 1
                ))) {
                return {
                    status: 'blocked',
                    reason: 'predecessor_identity_unavailable',
                    record: clone(record),
                };
            }
            const liveChat = currentChat(
                record.admission.charId,
                record.admission.chatId,
            );
            const unresolvedPredecessor = allRecords().filter((candidate) => (
                candidate.admission.charId === record.admission.charId
                && candidate.admission.chatId === record.admission.chatId
                && candidate.admissionSeq < record.admissionSeq
                && requiresExecutionPredecessor(candidate, liveChat)
            )).sort((left, right) => left.admissionSeq - right.admissionSeq).at(-1) || null;
            if (unresolvedPredecessor
                && unresolvedPredecessor.operationId !== record.executionPredecessorId) {
                return {
                    status: 'blocked',
                    reason: 'predecessor_identity_unavailable',
                    predecessorOperationId: unresolvedPredecessor.operationId,
                    record: clone(record),
                };
            }
            if (record.executionPredecessorId === null) {
                return { status: 'ready', record: clone(record) };
            }
            const predecessor = read(record.executionPredecessorId);
            if (!predecessor
                || predecessor.admission.charId !== record.admission.charId
                || predecessor.admission.chatId !== record.admission.chatId
                || predecessor.admissionSeq >= record.admissionSeq) {
                return {
                    status: 'blocked',
                    reason: 'predecessor_identity_unavailable',
                    record: clone(record),
                };
            }
            if (predecessor.transformState === 'unknown') {
                return {
                    status: 'blocked',
                    reason: 'predecessor_outcome_unknown',
                    predecessorOperationId: predecessor.operationId,
                    record: clone(record),
                };
            }
            if (!TERMINAL_INPUT_STATES.has(predecessor.inputState)) {
                return {
                    status: 'waiting',
                    reason: 'predecessor_active',
                    predecessorOperationId: predecessor.operationId,
                    record: clone(record),
                };
            }
            if (predecessor.inputState === 'blocked_edit') {
                const blocked = {
                    ...record,
                    inputState: 'blocked_edit',
                    terminal: {
                        state: 'blocked_edit',
                        reason: 'predecessor_blocked_edit',
                        at: Date.now(),
                    },
                };
                write(blocked);
                return {
                    status: 'blocked',
                    reason: 'predecessor_blocked_edit',
                    predecessorOperationId: predecessor.operationId,
                    record: clone(blocked),
                };
            }
            const resolvedRevision = predecessor.inputState === 'completed'
                ? predecessor.terminal?.resultRevision
                : predecessor.executionBaseRevision
                    || predecessor.admission.submittedBaseRevision;
            if (typeof resolvedRevision !== 'string'
                || !/^[a-f0-9]{64}$/.test(resolvedRevision)) {
                return {
                    status: 'blocked',
                    reason: 'predecessor_result_unavailable',
                    predecessorOperationId: predecessor.operationId,
                    record: clone(record),
                };
            }
            const liveRevision = currentRevision(
                record.admission.charId,
                record.admission.chatId,
            );
            if (liveRevision !== resolvedRevision) {
                const publicationPending = predecessor.inputState === 'completed'
                    && liveRevision === predecessor.executionBaseRevision;
                if (!publicationPending) {
                    const blocked = {
                        ...record,
                        inputState: 'blocked_edit',
                        terminal: {
                            state: 'blocked_edit',
                            reason: 'predecessor_revision_changed',
                            at: Date.now(),
                        },
                    };
                    write(blocked);
                    return {
                        status: 'blocked',
                        reason: 'predecessor_revision_changed',
                        predecessorOperationId: predecessor.operationId,
                        record: clone(blocked),
                    };
                }
                return {
                    status: 'waiting',
                    reason: 'predecessor_publication_pending',
                    predecessorOperationId: predecessor.operationId,
                    record: clone(record),
                };
            }
            const next = {
                ...record,
                effectiveBaseRevision: resolvedRevision,
                predecessorResolution: {
                    operationId: predecessor.operationId,
                    state: predecessor.inputState,
                    revision: resolvedRevision,
                    resolvedAt: Date.now(),
                },
            };
            write(next);
            const operation = writeOperationState(kvSet, operationId, {
                charId: next.admission.charId,
                chatId: next.admission.chatId,
                baseChatRevision: next.effectiveBaseRevision,
                serverChatCommitVersion: 1,
                serverBaseChatRevision: next.effectiveBaseRevision,
                inputCommandVersion: 1,
                inputCommandId: next.admission.inputCommandId,
                admissionSeq: next.admissionSeq,
            }, 'queued');
            if (!operation.written) throw operation.error || new Error('operation state write failed');
            return { status: 'ready', record: clone(next) };
        })());
        if (outcome.record?.inputState === 'blocked_edit') {
            settingsSnapshots.delete(operationId);
        }
        return outcome;
    }

    async function admit(value) {
        const command = normalizeCommand(value);
        await ensureCanonicalState();
        return queueStorageOperation(() => {
            let preparedSnapshot = null;
            const outcome = sqliteDb.transaction(() => {
            const existing = read(command.operationId);
            if (existing) {
                const replayAdmission = normalizeAdmission({
                    ...command,
                    settingsSnapshotRef: existing.admission.settingsSnapshotRef,
                    settingsSnapshotMode: existing.admission.settingsSnapshotMode,
                    settingsSnapshotBytes: existing.admission.settingsSnapshotBytes,
                    settingsContextDigest: existing.admission.settingsContextDigest,
                });
                return existing.requestFingerprint === requestFingerprint(replayAdmission)
                    ? { status: 'admitted', reused: true, record: clone(existing) }
                    : { status: 'conflict', reason: 'operation_fingerprint_conflict' };
            }
            if (kvGet(commandKey(command.operationId))) {
                return { status: 'conflict', reason: 'command_record_invalid' };
            }
            const records = allRecords();
            const replacement = command.replaceBlockedOperationId
                ? records.find((record) => record.operationId === command.replaceBlockedOperationId)
                : null;
            if (command.replaceBlockedOperationId && (
                !replacement || replacement.recordVersion !== 4
                || replacement.inputState !== 'blocked_edit'
                || replacement.userResolvedAt
                || !['not_run', 'completed'].includes(replacement.transformState)
                || replacement.inputReceipt !== null
                || replacement.admission.charId !== command.charId
                || replacement.admission.chatId !== command.chatId
                || replacement.admission.rawText !== command.rawText
                || replacement.admission.inputCommandId !== command.inputCommandId
                || replacement.admission.userMessageId === command.userMessageId
            )) {
                return { status: 'conflict', reason: 'blocked_input_retry_unavailable' };
            }
            const duplicateCommands = records.filter((record) => (
                record.admission.inputCommandId === command.inputCommandId
            ));
            if (duplicateCommands.length > 0 && (
                !replacement || duplicateCommands.length !== 1
                || duplicateCommands[0].operationId !== replacement.operationId
            )) {
                return {
                    status: 'conflict',
                    reason: 'input_command_identity_conflict',
                    existingOperationId: duplicateCommands.at(-1).operationId,
                };
            }
            if (currentRevision(command.charId, command.chatId)
                !== command.submittedBaseRevision) {
                return { status: 'conflict', reason: 'submitted_base_changed' };
            }
            const matching = records.filter((record) => (
                record.admission.charId === command.charId
                && record.admission.chatId === command.chatId
            )).sort((left, right) => left.admissionSeq - right.admissionSeq);
            const active = matching.filter((record) => (
                !TERMINAL_INPUT_STATES.has(record.inputState)
            ));
            if (active.length >= SERVER_CHAT_INPUT_MAX_NONTERMINAL_PER_CHAT) {
                return {
                    status: 'conflict',
                    reason: 'chat_input_queue_full',
                    blockingOperationIds: active.map((record) => record.operationId),
                };
            }
            const counterKey = sequenceKey(command.charId, command.chatId);
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
            if (settingsSnapshots.size >= SERVER_CHAT_SETTINGS_SNAPSHOT_MAX_CONTEXTS) {
                return { status: 'conflict', reason: 'settings_context_capacity' };
            }
            const snapshotDatabase = getDbCache()?.[databaseKey];
            if (!snapshotDatabase || typeof snapshotDatabase !== 'object') {
                throw new Error('server input settings snapshot source is unavailable');
            }
            const settingsSnapshotRef = settingsSnapshotKey(command.operationId);
            const settingsSnapshot = Buffer.from(encodeSettingsSnapshot(snapshotDatabase));
            if (settingsSnapshot.byteLength <= 0
                || settingsSnapshot.byteLength > SERVER_CHAT_SETTINGS_SNAPSHOT_MAX_BYTES) {
                throw new Error('server input settings snapshot is too large');
            }
            const admission = normalizeAdmission({
                ...command,
                settingsSnapshotRef,
                settingsSnapshotMode: 'volatile',
                settingsSnapshotBytes: settingsSnapshot.byteLength,
                settingsContextDigest: crypto.randomBytes(32).toString('hex'),
            });
            const fingerprint = requestFingerprint(admission);
            preparedSnapshot = {
                ref: settingsSnapshotRef,
                contextDigest: admission.settingsContextDigest,
                integrity: sha256(settingsSnapshot),
                bytes: settingsSnapshot,
            };
            const canonicalChat = currentChat(command.charId, command.chatId);
            const executionPredecessor = matching.filter((record) => (
                record.operationId !== replacement?.operationId
                && requiresExecutionPredecessor(record, canonicalChat)
            )).at(-1) || null;
            const record = {
                recordVersion: 4,
                contractVersion: SERVER_CHAT_INPUT_COMMAND_CONTRACT,
                operationId: admission.operationId,
                requestFingerprint: fingerprint,
                rawTextHash: admission.rawTextHash,
                admission,
                admissionSeq: counter.value + 1,
                queuePredecessorId: counter.lastOperationId,
                executionPredecessorId: executionPredecessor?.operationId || null,
                effectiveBaseRevision: admission.submittedBaseRevision,
                predecessorResolution: null,
                transformState: 'not_run',
                inputState: 'queued',
                inputReceipt: null,
                executionBaseRevision: null,
                inputMessageRevision: null,
                baselineMessageCount: null,
                journal: null,
                globalIntent: null,
                globalOutcomes: null,
                terminal: null,
            };
            if (replacement) write({
                ...replacement,
                userResolvedAt: Date.now(),
                replacedByOperationId: admission.operationId,
            });
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
            })();
            if (outcome.status === 'admitted' && !outcome.reused && preparedSnapshot) {
                settingsSnapshots.set(command.operationId, preparedSnapshot);
            }
            return outcome;
        });
    }

    async function beginTransform(operationId) {
        const predecessor = await advancePredecessor(operationId);
        if (predecessor.status !== 'ready') return predecessor;
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
                settingsSnapshots.delete(operationId);
                return { status: 'blocked', reason: 'cancelled' };
            }
            if (record.transformState === 'running' || record.transformState === 'unknown') {
                return { status: 'blocked', reason: 'transform_outcome_unknown' };
            }
            if (!readSettingsSnapshotRecord(record)) {
                return { status: 'blocked', reason: 'settings_context_unavailable' };
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
        const liveChat = currentChat(record.admission.charId, record.admission.chatId);
        const liveRevision = liveChat ? chatRevision(liveChat) : null;
        if (liveRevision !== record.effectiveBaseRevision
            && liveRevision !== record.executionBaseRevision) {
            const liveInput = liveChat?.message?.find((message) => (
                message?.chatId === record.admission.userMessageId
                && message?.role === 'user'
            ));
            if (liveInput && sha256(stableJSON(liveInput)) === record.inputMessageRevision) {
                return liveChat;
            }
            throw new Error('attached input publication revision conflict');
        }
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
        if (!chat) {
            if (liveRevision !== record.executionBaseRevision) {
                throw new Error('attached input chat is unavailable');
            }
            chat = currentChat(record.admission.charId, record.admission.chatId);
        }
        if (chatRevision(chat) !== record.executionBaseRevision
            || (liveRevision !== record.effectiveBaseRevision
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
                !== record.effectiveBaseRevision) {
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
            if (outcomes.some((entry) => entry.status === 'conflict')) {
                const blocked = {
                    ...record,
                    transformState: 'completed',
                    inputState: 'blocked_edit',
                    globalIntent,
                    globalOutcomes: outcomes,
                    terminal: { state: 'blocked_edit', at: Date.now() },
                };
                write(blocked);
                return {
                    status: 'blocked',
                    reason: 'global_variables_changed',
                    record: clone(blocked),
                };
            }
            const executionBaseRevision = chatRevision(chat);
            const inputMessageRevision = sha256(stableJSON(matches[0]));
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
                inputMessageRevision,
                baselineMessageCount: chat.message.length,
                journal,
                globalIntent,
                globalOutcomes: outcomes,
            };
            write(next);
            const operation = writeOperationState(kvSet, operationId, {
                charId: record.admission.charId,
                chatId: record.admission.chatId,
                baseChatRevision: record.effectiveBaseRevision,
                serverChatCommitVersion: 1,
                serverBaseChatRevision: executionBaseRevision,
                inputCommandVersion: 1,
                inputCommandId: record.admission.inputCommandId,
                admissionSeq: record.admissionSeq,
            }, 'queued');
            if (!operation.written) throw operation.error || new Error('operation state write failed');
            return { status: 'attached', reused: false, record: clone(next) };
        })());
        if (outcome.status !== 'attached' || outcome.reused) {
            if (outcome.record?.inputState === 'blocked_edit') {
                settingsSnapshots.delete(operationId);
            }
            return outcome;
        }
        const publicationErrors = [];
        try { chatWriteJournal.publishPreparedStage(prepared); } catch { publicationErrors.push('journal') }
        try { await publishAttached(outcome.record, chat); } catch { publicationErrors.push('canonical') }
        return {
            ...outcome,
            publication: publicationErrors.length === 0 ? 'published' : 'pending_recovery',
        };
    }

    async function loadExecution(operationId) {
        const predecessor = await advancePredecessor(operationId);
        if (predecessor.status !== 'ready') return predecessor;
        const record = predecessor.record;
        if (record.inputState === 'queued' && record.transformState === 'not_run') {
            if (!readSettingsSnapshotRecord(record)) {
                return {
                    status: 'blocked',
                    reason: 'settings_context_unavailable',
                    record: clone(record),
                };
            }
            await ensureCanonicalState();
            const chat = currentChat(record.admission.charId, record.admission.chatId);
            if (!chat || chatRevision(chat) !== record.effectiveBaseRevision) {
                const blocked = await queueStorageOperation(() => sqliteDb.transaction(() => {
                    const latest = read(operationId);
                    if (!latest || latest.inputState !== 'queued'
                        || latest.transformState !== 'not_run') {
                        return { status: 'blocked', reason: 'input_state_changed', record: latest };
                    }
                    const next = {
                        ...latest,
                        inputState: 'blocked_edit',
                        terminal: {
                            state: 'blocked_edit',
                            reason: 'base_revision_changed',
                            at: Date.now(),
                        },
                    };
                    write(next);
                    return { status: 'blocked', reason: 'base_revision_changed', record: clone(next) };
                })());
                if (blocked.record?.inputState === 'blocked_edit') {
                    settingsSnapshots.delete(operationId);
                }
                return blocked;
            }
            return { status: 'transform-required', record: clone(record), chat: clone(chat) };
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
            if (!readSettingsSnapshotRecord(record)) {
                return {
                    status: 'blocked',
                    reason: 'settings_context_unavailable',
                    record: clone(record),
                };
            }
            return { status: 'attached', record: clone(record), chat: clone(chat) };
        }
        return {
            status: 'blocked',
            reason: record.transformState === 'running' || record.transformState === 'unknown'
                ? 'transform_outcome_unknown'
                : record.inputState === 'blocked_edit'
                    ? record.terminal?.reason || 'blocked_edit'
                    : record.inputState,
            record: clone(record),
        };
    }

    function settleDurablySynchronously(operationId, state, resultRevision = null) {
        if (!['completed', 'failed', 'cancelled'].includes(state)) return false;
        if ((state === 'completed' && (typeof resultRevision !== 'string'
            || !/^[a-f0-9]{64}$/.test(resultRevision)))
            || (resultRevision !== null && (typeof resultRevision !== 'string'
                || !/^[a-f0-9]{64}$/.test(resultRevision)))) return false;
        const record = read(operationId);
        if (!record) return false;
        if (TERMINAL_INPUT_STATES.has(record.inputState)) {
            return record.inputState === state
                && (state !== 'completed' || record.terminal?.resultRevision === resultRevision);
        }
        write({
            ...record,
            inputState: state,
            terminal: {
                state,
                resultRevision,
                publication: state === 'completed' ? 'pending' : 'not_applicable',
                at: Date.now(),
            },
        });
        return true;
    }

    function markResultPublishedSynchronously(operationId, resultRevision) {
        if (typeof resultRevision !== 'string' || !/^[a-f0-9]{64}$/.test(resultRevision)) {
            return false;
        }
        const record = read(operationId);
        if (!record || record.inputState !== 'completed'
            || record.terminal?.state !== 'completed'
            || record.terminal.resultRevision !== resultRevision) {
            return false;
        }
        if (record.terminal.publication === 'published') return true;
        write({
            ...record,
            terminal: {
                ...record.terminal,
                publication: 'published',
                publishedAt: Date.now(),
            },
        });
        return true;
    }

    function releaseSettingsContext(operationId) {
        return settingsSnapshots.delete(operationId);
    }

    function blockEditSynchronously(operationId, reason) {
        if (typeof reason !== 'string' || !/^[a-z][a-z0-9_]{2,63}$/.test(reason)) {
            return false;
        }
        const record = read(operationId);
        if (!record || record.inputState !== 'queued'
            || record.transformState !== 'not_run') return false;
        write({
            ...record,
            inputState: 'blocked_edit',
            terminal: { state: 'blocked_edit', reason, at: Date.now() },
        });
        settingsSnapshots.delete(operationId);
        return true;
    }

    function settleSynchronously(operationId, state, resultRevision = null) {
        const settled = settleDurablySynchronously(operationId, state, resultRevision);
        if (settled) releaseSettingsContext(operationId);
        return settled;
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
        if (record.transformState === 'running') settingsSnapshots.delete(operationId);
        return true;
    }

    function pendingProjection(charId, chatId) {
        return allRecords().filter((record) => (
            record.admission.charId === charId
            && record.admission.chatId === chatId
            && (record.inputState === 'queued' || record.inputState === 'attached'
                || (record.inputState === 'blocked_edit' && !record.userResolvedAt))
        )).sort((left, right) => left.admissionSeq - right.admissionSeq).map((record) => {
            let state = 'queued';
            if (record.inputState === 'attached') {
                const operation = readOperationState(kvGet, record.operationId);
                state = !readSettingsSnapshotRecord(record)
                    ? 'execution_unknown'
                    : operation?.state === 'running'
                        ? 'generating'
                        : operation?.state === 'queued'
                            ? 'attached'
                            : 'execution_unknown';
            } else if (record.inputState === 'blocked_edit' || record.transformState === 'unknown'
                || !readSettingsSnapshotRecord(record)) {
                state = 'blocked_edit';
            } else if (record.executionPredecessorId && !record.predecessorResolution) {
                const predecessor = read(record.executionPredecessorId);
                state = !predecessor || predecessor.inputState === 'blocked_edit'
                    || predecessor.transformState === 'unknown'
                    ? 'blocked_edit'
                    : 'waiting_predecessor';
            }
            return {
                operationId: record.operationId,
                inputCommandId: record.admission.inputCommandId,
                admissionSeq: record.admissionSeq,
                predecessorOperationId: record.executionPredecessorId,
                rawText: record.admission.rawText,
                cancelAllowed: record.inputState === 'queued',
                retryAllowed: record.inputState === 'blocked_edit'
                    && ['not_run', 'completed'].includes(record.transformState)
                    && record.inputReceipt === null,
                state,
                ...(record.inputReceipt && record.executionBaseRevision ? {
                    attachedRevision: record.executionBaseRevision,
                    inputReceiptId: record.inputReceipt.receiptId,
                } : {}),
            };
        });
    }

    async function recoverAll() {
        const records = allRecords().sort((left, right) => (
            left.admission.charId.localeCompare(right.admission.charId)
            || left.admission.chatId.localeCompare(right.admission.chatId)
            || left.admissionSeq - right.admissionSeq
            || left.operationId.localeCompare(right.operationId)
        ));
        const attached = records.filter((record) => (
            record.inputReceipt && record.executionBaseRevision && record.journal
        ));
        if (attached.length > 0) await ensureCanonicalState();
        const results = [];
        for (const record of records) {
            if (record.transformState === 'running' && record.inputState === 'queued') {
                const updated = { ...record, transformState: 'unknown' };
                sqliteDb.transaction(() => write(updated))();
                settingsSnapshots.delete(record.operationId);
                results.push({ operationId: record.operationId, status: 'blocked', reason: 'transform_outcome_unknown' });
                continue;
            }
            if (record.inputState === 'queued' && !readSettingsSnapshotRecord(record)) {
                results.push({
                    operationId: record.operationId,
                    status: 'blocked',
                    reason: 'settings_context_unavailable',
                });
                continue;
            }
            if (!record.inputReceipt || !record.executionBaseRevision || !record.journal) continue;
            try {
                await publishAttached(record);
                results.push({ operationId: record.operationId, status: 'attached' });
            } catch {
                results.push({ operationId: record.operationId, status: 'pending_recovery' });
            }
        }
        return results;
    }

    async function retireTerminal(now = Date.now()) {
        if (!Number.isSafeInteger(now) || now <= 0) {
            throw new Error('server input retirement time is invalid');
        }
        await ensureCanonicalState();
        const retired = await queueStorageOperation(() => sqliteDb.transaction(() => {
            const records = allRecords();
            const referenced = new Set(records.filter((record) => (
                record.inputState === 'queued' || record.inputState === 'attached'
                || (record.inputState === 'blocked_edit' && !record.userResolvedAt)
            )).flatMap((record) => [
                record.queuePredecessorId, record.executionPredecessorId,
            ]).filter(Boolean));
            const eligible = [];
            for (const record of records) {
                if (record.recordVersion !== 4
                    || (!['completed', 'failed', 'cancelled'].includes(record.inputState)
                        && !(record.inputState === 'blocked_edit' && record.userResolvedAt))
                    || !record.terminal?.at
                    || now - record.terminal.at <= SERVER_CHAT_INPUT_RETIRE_AFTER_MS
                    || (record.inputState === 'completed'
                        && record.terminal.publication !== 'published')
                    || referenced.has(record.operationId)
                    || kvGet(operationResultKey(record.operationId)) != null
                    || kvGet(operationStateKey(record.operationId)) != null
                    || requiresExecutionPredecessor(
                        record,
                        currentChat(record.admission.charId, record.admission.chatId),
                    )) continue;
                eligible.push(record);
            }
            for (const record of eligible) {
                const retired = {
                    ...record,
                    recordVersion: 5,
                    admission: { ...record.admission, rawText: null, rawTextHash: null },
                    rawTextHash: null,
                    executionPredecessorId: null,
                    predecessorResolution: null,
                    inputReceipt: null,
                    inputReceiptId: record.inputReceipt?.receiptId || null,
                    inputMessageRevision: null,
                    baselineMessageCount: null,
                    journal: null,
                    globalIntent: null,
                    globalOutcomes: null,
                    retiredAt: now,
                };
                write({ ...retired, retiredChecksum: retiredChecksum(retired) });
            }
            return eligible.map((record) => record.operationId);
        })());
        for (const operationId of retired) settingsSnapshots.delete(operationId);
        return retired;
    }

    function discardRecovery() {
        for (const record of allRecords()) {
            kvDel(operationStateKey(record.operationId));
            kvDel(operationResultKey(record.operationId));
        }
        settingsSnapshots.clear();
        kvDelPrefix(SERVER_CHAT_INPUT_COMMAND_PREFIX);
        kvDelPrefix(SERVER_CHAT_INPUT_SEQUENCE_PREFIX);
    }

    return {
        admit,
        attachTransformed,
        beginTransform,
        discardRecovery,
        loadExecution,
        loadSettingsSnapshot,
        markResultPublishedSynchronously,
        markRunFailureSynchronously,
        pendingProjection,
        read: (operationId) => clone(read(operationId)),
        recoverAll,
        retireTerminal,
        releaseSettingsContext,
        blockEditSynchronously,
        settingsSnapshotStats,
        settleDurablySynchronously,
        settleSynchronously,
    };
}

module.exports = {
    SERVER_CHAT_INPUT_COMMAND_CONTRACT,
    SERVER_CHAT_INPUT_COMMAND_PREFIX,
    SERVER_CHAT_INPUT_SEQUENCE_PREFIX,
    SERVER_CHAT_SETTINGS_SNAPSHOT_REF_PREFIX,
    commandKey,
    createServerChatInputOwner,
    journalOperationId,
    parseRecord,
    settingsSnapshotKey,
};
