'use strict';

const crypto = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const {
    HOST_CHANGE_INTENT_CONTRACT,
    SERVER_CHAT_COMMIT_CONTRACT,
    SERVER_CHAT_COMMIT_PREFIX,
    SERVER_CHAT_INPUT_RECEIPT_CONTRACT,
    commitStorageKey,
    createServerChatCommitter,
    stableJSON,
} = require('./serverChatCommit.cjs');
const {
    operationResultKey,
    operationStateKey,
    readOperationState,
    validOperationId,
} = require('./bgOrchestrationOperationStore.cjs');
const {
    applyCommitProjection,
    copyServerOwnedRootState,
    projectChatExecution,
} = require('./serverChatExecutionProjection.cjs');

const SERVER_CHAT_COMMIT_SEQUENCE_KEY = 'internal/server-chat-commit-sequence/v1';
const SERVER_CHAT_COMMIT_APPLIED_FIELD = 'serverChatCommitApplied';
const SERVER_CHAT_COMMIT_GLOBAL_CONFLICT_FIELD = 'bgOrchestrationGlobalConflicts';

function own(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
}

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function setOwn(value, key, next) {
    Object.defineProperty(value, key, {
        value: next,
        enumerable: true,
        configurable: true,
        writable: true,
    });
}

function parseJson(value) {
    if (!value) return null;
    try {
        return JSON.parse(Buffer.isBuffer(value) ? value.toString('utf8') : String(value));
    } catch {
        return null;
    }
}

function operationIdFromCommitKey(key) {
    if (typeof key !== 'string' || !key.startsWith(SERVER_CHAT_COMMIT_PREFIX)) return null;
    let operationId = '';
    try {
        operationId = Buffer.from(
            key.slice(SERVER_CHAT_COMMIT_PREFIX.length),
            'base64url',
        ).toString('utf8');
    } catch {
        return null;
    }
    return validOperationId(operationId) && commitStorageKey(operationId) === key
        ? operationId
        : null;
}

function nextCommitSequence(kvGet, kvSet, appliedLedger) {
    const raw = kvGet(SERVER_CHAT_COMMIT_SEQUENCE_KEY);
    const record = raw ? parseJson(raw) : { version: 1, value: 0 };
    if (!record || record.version !== 1 || !Number.isSafeInteger(record.value)
        || record.value < 0 || record.value >= Number.MAX_SAFE_INTEGER) {
        throw new Error('server chat commit sequence is invalid');
    }
    const appliedFloor = appliedLedger.reduce(
        (maximum, entry) => Math.max(maximum, entry.commitSequence),
        0,
    );
    const previous = Math.max(record.value, appliedFloor);
    if (previous >= Number.MAX_SAFE_INTEGER) {
        throw new Error('server chat commit sequence is exhausted');
    }
    const value = previous + 1;
    kvSet(SERVER_CHAT_COMMIT_SEQUENCE_KEY, JSON.stringify({ version: 1, value }));
    return value;
}

function chatMetadata(chat) {
    const metadata = {
        id: chat.id,
        name: typeof chat.name === 'string' ? chat.name : '',
        _stub: true,
    };
    for (const field of ['lastDate', 'folderId', 'modules']) {
        if (own(chat, field)) setOwn(metadata, field, chat[field]);
    }
    return metadata;
}

function messageFingerprint(message) {
    return sha256(stableJSON(message));
}

function findCommitMessages(chat, baselineMessageCount) {
    if (!chat || !Array.isArray(chat.message)
        || !Number.isSafeInteger(baselineMessageCount)
        || baselineMessageCount <= 0 || baselineMessageCount > chat.message.length) {
        throw new Error('server chat commit message boundary is invalid');
    }
    const baseline = chat.message.slice(0, baselineMessageCount);
    const input = baseline.findLast((message) => message?.role === 'user');
    if (!input || typeof input.chatId !== 'string' || !input.chatId) {
        throw new Error('server chat commit input message identity is unavailable');
    }
    const assistants = chat.message.slice(baselineMessageCount).filter((message) => (
        (message?.role === 'char' || message?.role === 'assistant')
        && typeof message.chatId === 'string' && !!message.chatId
    ));
    if (assistants.length === 0) {
        throw new Error('server chat commit has no identified assistant result');
    }
    return { input, assistants };
}

function normalizeStaticsDelta(value) {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error('server chat commit statics delta is invalid');
    }
    return value;
}

function normalizeGlobalIntent(result) {
    const changed = result?.globalChatVariables;
    const deleted = result?.globalChatVariablesDeleted;
    const expected = result?.globalChatVariablesExpected;
    if (!changed || typeof changed !== 'object' || Array.isArray(changed)
        || !Array.isArray(deleted)
        || !expected || typeof expected !== 'object' || Array.isArray(expected)) {
        throw new Error('server chat commit global delta is invalid');
    }
    return { changed, deleted, expected };
}

function expectationMatches(current, key, expectation) {
    if (!expectation || typeof expectation.present !== 'boolean') return false;
    const present = own(current, key);
    return present === expectation.present
        && (!present || isDeepStrictEqual(current[key], expectation.value));
}

function desiredAlreadyPresent(current, key, intent) {
    if (own(intent.changed, key)) {
        return own(current, key) && isDeepStrictEqual(current[key], intent.changed[key]);
    }
    return !own(current, key);
}

function globalVariableOutcomes(current, intent) {
    const keys = [...new Set([...Object.keys(intent.changed), ...intent.deleted])].sort();
    return keys.map((key) => ({
        key,
        ...(expectationMatches(current, key, intent.expected[key])
            || desiredAlreadyPresent(current, key, intent)
            ? { status: 'committed' }
            : { status: 'conflict', reason: 'newer-value-preserved' }),
    }));
}

function globalAggregateStatus(outcomes) {
    if (outcomes.length === 0) return 'skipped';
    return outcomes.some((outcome) => outcome.status === 'conflict')
        ? 'conflict'
        : 'committed';
}

function currentAppliedLedger(database) {
    const value = database?.[SERVER_CHAT_COMMIT_APPLIED_FIELD];
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.some((entry) => (
        !entry || typeof entry !== 'object'
        || typeof entry.operationId !== 'string'
        || typeof entry.commitReceiptId !== 'string'
        || !Number.isSafeInteger(entry.commitSequence)
        || entry.commitSequence <= 0
    ))) {
        throw new Error('server chat commit applied ledger is invalid');
    }
    if (new Set(value.map((entry) => entry.operationId)).size !== value.length
        || new Set(value.map((entry) => entry.commitSequence)).size !== value.length) {
        throw new Error('server chat commit applied ledger contains duplicate identities');
    }
    return value;
}

function currentStaticsLedger(statics) {
    const value = statics?.bgOrchestrationApplied;
    if (value === undefined) return [];
    const entries = Array.isArray(value) ? value : [value];
    if (entries.some((entry) => (
        !entry || typeof entry !== 'object'
        || typeof entry.operationId !== 'string'
        || !Number.isSafeInteger(entry.cumulative) || entry.cumulative <= 0
    ))) {
        throw new Error('server chat commit statics ledger is invalid');
    }
    return entries;
}

function applyGlobalOutcomes(database, record) {
    const current = database.globalChatVariables && typeof database.globalChatVariables === 'object'
        && !Array.isArray(database.globalChatVariables)
        ? { ...database.globalChatVariables }
        : {};
    const intent = record.recovery.effectIntents.globalVariables;
    const conflicts = [];
    for (const outcome of record.canonicalWrite.globalVariableOutcomes) {
        const key = outcome.key;
        const action = own(intent.changed, key) ? 'set' : 'delete';
        if (outcome.status === 'conflict') {
            conflicts.push({
                key,
                action,
                ...(action === 'set' ? { serverValue: intent.changed[key] } : {}),
            });
            continue;
        }
        if (outcome.status !== 'committed') continue;
        // Initial publication sees the expected value. Recovery may instead see
        // this operation's desired value or a later user edit. Reapply only the
        // first two; never overwrite a later value merely because an old receipt
        // is being replayed.
        if (!expectationMatches(current, key, intent.expected[key])
            && !desiredAlreadyPresent(current, key, intent)) {
            throw new Error('server chat commit global publication lost its expected base');
        }
        if (action === 'set') setOwn(current, key, intent.changed[key]);
        else delete current[key];
    }
    database.globalChatVariables = current;
    if (conflicts.length > 0) {
        const old = Array.isArray(database[SERVER_CHAT_COMMIT_GLOBAL_CONFLICT_FIELD])
            ? database[SERVER_CHAT_COMMIT_GLOBAL_CONFLICT_FIELD].filter((entry) => (
                entry && typeof entry === 'object'
                && entry.operationId !== record.operationId
            ))
            : [];
        database[SERVER_CHAT_COMMIT_GLOBAL_CONFLICT_FIELD] = [...old, {
            operationId: record.operationId,
            time: Date.parse(record.recovery.committedAt),
            conflicts,
        }].slice(-20);
    }
}

function applyStaticsOutcome(database, record) {
    const appliedDelta = record.canonicalWrite.staticsMessagesAppliedDelta;
    if (record.canonicalWrite.effects.stats.status !== 'committed' || appliedDelta <= 0) return;
    if (!database.statics || typeof database.statics !== 'object') {
        throw new Error('server chat commit statics owner is unavailable');
    }
    const statics = { ...database.statics };
    const ledger = currentStaticsLedger(statics);
    const prior = ledger.find((entry) => entry.operationId === record.operationId)?.cumulative || 0;
    if (prior < appliedDelta) {
        statics.messages = (Number.isFinite(statics.messages) ? statics.messages : 0)
            + (appliedDelta - prior);
    }
    const withoutOperation = ledger.filter((entry) => entry.operationId !== record.operationId);
    withoutOperation.push({ operationId: record.operationId, cumulative: appliedDelta });
    statics.bgOrchestrationApplied = withoutOperation;
    database.statics = statics;
}

function publishMetadata(database, charId, metadata) {
    if (!Array.isArray(database.characters)) {
        throw new Error('server chat commit database characters are unavailable');
    }
    const characters = database.characters.slice();
    const index = characters.findIndex((character) => character?.chaId === charId);
    if (index < 0 || !Array.isArray(characters[index].chats)) {
        throw new Error('server chat commit character metadata is unavailable');
    }
    const character = { ...characters[index], chats: characters[index].chats.slice() };
    const chatIndex = character.chats.findIndex((chat) => chat?.id === metadata.id);
    if (chatIndex >= 0) character.chats[chatIndex] = { ...metadata };
    else character.chats.push({ ...metadata });
    characters[index] = character;
    database.characters = characters;
}

function pendingInputRecovery(results) {
    return results.filter((entry) => (
        entry.status === 'pending_recovery' || entry.status === 'blocked'
    ));
}

function pendingCommitRecovery(results) {
    return results.filter((entry) => (
        entry.status !== 'committed' || entry.publication === 'pending_recovery'
    ));
}

function recoveryPendingSignature(inputs, commits) {
    return stableJSON({
        inputs: inputs.map((entry) => ({
            operationId: entry.operationId || null,
            status: entry.status || null,
            reason: entry.reason || null,
        })),
        commits: commits.map((entry) => ({
            key: entry.key || null,
            operationId: entry.receipt?.operationId || null,
            status: entry.status || null,
            reason: entry.reason || null,
            publication: entry.publication || null,
        })),
    });
}

async function reconcileServerChatRecovery({
    serverChatInputOwner,
    serverChatCommitOwner,
}) {
    if (!serverChatInputOwner || typeof serverChatInputOwner.recoverAll !== 'function'
        || !serverChatCommitOwner || typeof serverChatCommitOwner.recoverAll !== 'function') {
        throw new Error('server chat recovery owners are unavailable');
    }
    let previousPendingSignature = null;
    let passLimit = 2;
    let inputResults = [];
    let commitResults = [];
    let pendingInputs = [];
    let pendingCommits = [];
    for (let pass = 1; pass <= passLimit; pass += 1) {
        inputResults = await serverChatInputOwner.recoverAll();
        commitResults = await serverChatCommitOwner.recoverAll();
        if (pass === 1) {
            passLimit = Math.max(2, inputResults.length + commitResults.length + 1);
        }
        pendingInputs = pendingInputRecovery(inputResults);
        pendingCommits = pendingCommitRecovery(commitResults);
        if (pendingInputs.length === 0 && pendingCommits.length === 0) {
            return {
                passes: pass,
                stalled: false,
                inputResults,
                commitResults,
                pendingInputs,
                pendingCommits,
            };
        }
        const signature = recoveryPendingSignature(pendingInputs, pendingCommits);
        if (signature === previousPendingSignature) {
            return {
                passes: pass,
                stalled: true,
                inputResults,
                commitResults,
                pendingInputs,
                pendingCommits,
            };
        }
        previousPendingSignature = signature;
    }
    return {
        passes: passLimit,
        stalled: true,
        inputResults,
        commitResults,
        pendingInputs,
        pendingCommits,
    };
}

function createServerChatCommitOwner({
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
    serverChatInputOwner = null,
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
            throw new Error(`server chat commit owner dependency is missing: ${name}`);
        }
    }
    if (serverChatInputOwner && (
        typeof serverChatInputOwner.read !== 'function'
        || typeof serverChatInputOwner.settleDurablySynchronously !== 'function'
        || typeof serverChatInputOwner.releaseSettingsContext !== 'function'
        || typeof serverChatInputOwner.markResultPublishedSynchronously !== 'function'
    )) {
        throw new Error('server chat input owner lifecycle dependency is incomplete');
    }

    const committer = createServerChatCommitter({
        journal: chatWriteJournal,
        kvGet,
        kvSet,
        kvList,
        queueStorageOperation,
        runTransaction: (operation) => sqliteDb.transaction(operation)(),
        readCurrentRevision: (charId, chatId) => {
            const chat = getFullChatStore()?.get(charId)?.get(chatId) || null;
            return chat ? chatRevision(chat) : null;
        },
        readOperationState: (operationId) => readOperationState(kvGet, operationId),
        calculateRevision: chatRevision,
        writeCanonicalState: ({ request }) => {
            const database = getDbCache()?.[databaseKey];
            if (!database || typeof database !== 'object') {
                throw new Error('server chat commit database cache is unavailable');
            }
            const appliedLedger = currentAppliedLedger(database);
            const currentGlobals = database.globalChatVariables
                && typeof database.globalChatVariables === 'object'
                && !Array.isArray(database.globalChatVariables)
                ? database.globalChatVariables
                : {};
            const outcomes = globalVariableOutcomes(
                currentGlobals,
                request.effectIntents.globalVariables,
            );
            const staticsDelta = request.effectIntents.staticsMessagesDelta;
            const hasStatics = database.statics && typeof database.statics === 'object';
            const inputCommand = serverChatInputOwner?.read(request.operationId) || null;
            if (inputCommand) {
                if (inputCommand.inputReceipt?.receiptId !== request.inputReceipt.receiptId
                    || inputCommand.executionBaseRevision !== request.baseChatRevision
                    || typeof serverChatInputOwner.settleDurablySynchronously !== 'function'
                    || !serverChatInputOwner.settleDurablySynchronously(
                        request.operationId,
                        'completed',
                        request.storedRevision,
                    )) {
                    throw new Error('server chat commit input receipt is inconsistent');
                }
            }
            return {
                commitSequence: nextCommitSequence(kvGet, kvSet, appliedLedger),
                effects: {
                    chat: { status: 'committed' },
                    metadata: { status: 'committed' },
                    globals: { status: globalAggregateStatus(outcomes) },
                    stats: staticsDelta === 0
                        ? { status: 'skipped' }
                        : hasStatics
                            ? { status: 'committed' }
                            : { status: 'failed', reason: 'statics-owner-unavailable' },
                },
                globalVariableOutcomes: outcomes,
                staticsMessagesAppliedDelta: hasStatics ? staticsDelta : 0,
                promptEffectsResolved: true,
            };
        },
        writeCommittedOperationState: (operationId, state) => {
            kvSet(operationStateKey(operationId), JSON.stringify(state));
            return { written: true };
        },
        publishCanonicalState: async (record, context) => {
            await ensureCanonicalState();
            const current = getDbCache()?.[databaseKey];
            if (!current || typeof current !== 'object') {
                throw new Error('server chat commit database cache is unavailable');
            }
            const ledger = currentAppliedLedger(current);
            const existing = ledger.find((entry) => entry.operationId === record.operationId);
            if (existing && existing.commitReceiptId !== record.commitReceipt.commitReceiptId) {
                throw new Error('server chat commit applied ledger conflicts with receipt');
            }
            if (existing) {
                const currentChat = getFullChatStore()?.get(record.recovery.requestedCharId)
                    ?.get(record.recovery.storedChatId)
                    || null;
                if (!currentChat) {
                    throw new Error('server chat execution projection chat is unavailable');
                }
                const projectedDatabase = { ...current };
                const priorProjection = stableJSON(projectedDatabase.serverChatExecutionState);
                applyCommitProjection(
                    projectedDatabase,
                    record,
                    currentChat,
                    chatRevision(currentChat),
                );
                if (stableJSON(projectedDatabase.serverChatExecutionState) !== priorProjection) {
                    cacheStrippedDatabase(projectedDatabase);
                    scheduleChatStorePersist();
                }
                return;
            }
            const durableChat = context.chat
                || getFullChatStore()?.get(record.recovery.requestedCharId)
                    ?.get(record.recovery.storedChatId)
                || null;
            if (!durableChat || chatRevision(durableChat) !== record.recovery.storedRevision) {
                throw new Error('server chat commit publication chat is unavailable');
            }
            const nextDatabase = { ...current };
            publishMetadata(
                nextDatabase,
                record.recovery.requestedCharId,
                record.recovery.metadata,
            );
            applyGlobalOutcomes(nextDatabase, record);
            applyStaticsOutcome(nextDatabase, record);
            applyCommitProjection(nextDatabase, record, durableChat);
            nextDatabase[SERVER_CHAT_COMMIT_APPLIED_FIELD] = [...ledger, {
                operationId: record.operationId,
                commitReceiptId: record.commitReceipt.commitReceiptId,
                commitSequence: record.commitSequence,
            }];
            cacheStrippedDatabase(nextDatabase);
            let characterChats = getFullChatStore()?.get(record.recovery.requestedCharId);
            if (!characterChats) {
                characterChats = new Map();
                getFullChatStore().set(record.recovery.requestedCharId, characterChats);
            }
            characterChats.set(record.recovery.storedChatId, durableChat);
            scheduleChatStorePersist();
        },
    });

    function finalizeInputCommit(outcome) {
        if (!serverChatInputOwner || outcome?.status !== 'committed'
            || !outcome.receipt || typeof outcome.receipt.operationId !== 'string'
            || outcome.receipt.operationId.length === 0) {
            return;
        }
        serverChatInputOwner.releaseSettingsContext(outcome.receipt.operationId);
        if (outcome.publication !== 'published') return;
        try {
            serverChatInputOwner.markResultPublishedSynchronously(
                outcome.receipt.operationId,
                outcome.receipt.storedRevision,
            );
        } catch {
            // The durable commit remains authoritative. Startup reconciliation retries the marker.
        }
    }

    async function currentRevision(charId, chatId) {
        await ensureCanonicalState();
        const chat = getFullChatStore()?.get(charId)?.get(chatId) || null;
        return chat ? chatRevision(chat) : null;
    }

    async function captureBase(charId, chatId, submittedChat) {
        const revision = await currentRevision(charId, chatId);
        const submittedRevision = submittedChat && typeof submittedChat === 'object'
            ? chatRevision(submittedChat)
            : null;
        return {
            revision,
            submittedRevision,
            matches: !!revision && submittedRevision === revision,
        };
    }

    async function commitGenerationResult({
        operationId,
        resultId,
        publishSeq,
        charId,
        chatId,
        baseChatRevision,
        baselineMessageCount,
        settingsDigest,
        result,
        committedAt,
        inputReceipt = null,
    }) {
        await ensureCanonicalState();
        if (!result?.chat || result.chat.id !== chatId || !Array.isArray(result.chat.message)) {
            throw new Error('server chat commit result chat is invalid');
        }
        const { input, assistants } = findCommitMessages(result.chat, baselineMessageCount);
        const storedRevision = chatRevision(result.chat);
        const owners = assistants.map((message) => {
            const sourceRevision = messageFingerprint(message);
            return {
                messageId: message.chatId,
                sourceRevision,
                sourceGeneration: sha256(stableJSON({
                    operationId,
                    messageId: message.chatId,
                    sourceRevision,
                })),
                operationId,
                authority: 'server',
                acState: 'disabled',
                automaticBackfill: 'eligible',
            };
        });
        const bindingEpoch = `ac-disabled-${operationId}`;
        const committedInputReceipt = inputReceipt || {
            contractVersion: SERVER_CHAT_INPUT_RECEIPT_CONTRACT,
            receiptId: sha256(stableJSON({
                operationId,
                messageId: input.chatId,
                revision: baseChatRevision,
            })),
            inputCommandId: `input-${operationId}`,
            operationId,
            charId,
            chatId,
            messageId: input.chatId,
            role: 'user',
            revision: baseChatRevision,
            hostChangeSeq: 1,
        };
        if (inputReceipt && (
            inputReceipt.operationId !== operationId
            || inputReceipt.charId !== charId
            || inputReceipt.chatId !== chatId
            || inputReceipt.messageId !== input.chatId
            || inputReceipt.role !== 'user'
            || inputReceipt.revision !== baseChatRevision
            || !Number.isSafeInteger(inputReceipt.hostChangeSeq)
            || inputReceipt.hostChangeSeq <= 0
        )) {
            throw new Error('server chat commit input receipt does not match the result base');
        }
        const hostChangeSeq = inputReceipt ? committedInputReceipt.hostChangeSeq + 1 : 1;
        const hostChangeIntent = {
            contractVersion: HOST_CHANGE_INTENT_CONTRACT,
            eventId: `${bindingEpoch}-response-${hostChangeSeq}`,
            hostInstanceId: 'pocketrisu-server-unbound',
            charId,
            chatId,
            bindingEpoch,
            seq: hostChangeSeq,
            previousSeq: hostChangeSeq - 1,
            operationId,
            kind: 'response_commit',
            beforeRevision: baseChatRevision,
            afterRevision: storedRevision,
            messageIdentities: [...new Set([input.chatId, ...owners.map((owner) => owner.messageId)])],
            sourceGeneration: owners[0].sourceGeneration,
            committedAt,
            payloadRef: commitStorageKey(operationId),
            delivery: 'settled',
        };
        const outcome = await committer.commit({
            contractVersion: SERVER_CHAT_COMMIT_CONTRACT,
            operationId,
            resultId,
            publishSeq,
            requestedCharId: charId,
            requestedChatId: chatId,
            storedChatId: chatId,
            baseChatRevision,
            storedRevision,
            settingsDigest,
            executionContextId: null,
            archiveCenterRequestCorrelationId: null,
            prepareKey: null,
            prepareFingerprint: null,
            bindingEpoch,
            hostChangeSeq,
            inputReceipt: committedInputReceipt,
            claimEpoch: null,
            chat: result.chat,
            metadata: chatMetadata(result.chat),
            hostChangeIntent,
            owners,
            effectIntents: {
                globalVariables: normalizeGlobalIntent(result),
                staticsMessagesDelta: normalizeStaticsDelta(result.staticsMessagesDelta),
            },
            acOwner: 'disabled',
            acState: 'disabled',
            readyForNextTurn: true,
            awaitingMetadata: false,
            committedAt,
        });
        if (inputReceipt) {
            await queueStorageOperation(() => finalizeInputCommit(outcome));
        }
        return outcome;
    }

    async function recover(operationId) {
        const status = committer.status(operationId);
        if (status.status !== 'committed') return status;
        await ensureCanonicalState();
        const outcome = await committer.recover(operationId);
        await queueStorageOperation(() => finalizeInputCommit(outcome));
        return outcome;
    }

    async function recoverAll() {
        if (kvList(SERVER_CHAT_COMMIT_PREFIX).length === 0) return [];
        await ensureCanonicalState();
        const outcomes = await committer.recoverAll();
        await queueStorageOperation(() => {
            for (const outcome of outcomes) finalizeInputCommit(outcome);
        });
        return outcomes;
    }

    async function readChatProjection(charId, chatId, requestedRevision) {
        await ensureCanonicalState();
        const chat = getFullChatStore()?.get(charId)?.get(chatId) || null;
        if (!chat) return { status: 'missing', currentRevision: null, projection: null };
        const currentRevision = chatRevision(chat);
        if (requestedRevision !== currentRevision) {
            return { status: 'revision_mismatch', currentRevision, projection: null };
        }
        const records = [];
        try {
            for (const key of kvList(SERVER_CHAT_COMMIT_PREFIX)) {
                const operationId = operationIdFromCommitKey(key);
                const record = operationId ? committer.readRecovery(operationId) : null;
                if (!record) {
                    return { status: 'conflict', currentRevision, projection: null };
                }
                records.push(record);
            }
            const database = getDbCache()?.[databaseKey];
            if (!database || typeof database !== 'object') {
                return { status: 'unavailable', currentRevision, projection: null };
            }
            const projection = projectChatExecution({
                database,
                records,
                chat,
                charId,
                chatId,
                chatRevision: currentRevision,
            });
            return projection
                ? { status: 'ok', currentRevision, projection }
                : { status: 'missing', currentRevision, projection: null };
        } catch {
            return { status: 'conflict', currentRevision, projection: null };
        }
    }

    function preserveDatabaseState(currentDatabase, incomingDatabase) {
        return copyServerOwnedRootState(currentDatabase, incomingDatabase);
    }

    function discardRecovery() {
        for (const key of kvList(SERVER_CHAT_COMMIT_PREFIX)) {
            const operationId = operationIdFromCommitKey(key);
            if (!operationId) continue;
            kvDel(operationStateKey(operationId));
            kvDel(operationResultKey(operationId));
        }
        kvDelPrefix(SERVER_CHAT_COMMIT_PREFIX);
        kvDel(SERVER_CHAT_COMMIT_SEQUENCE_KEY);
    }

    return {
        commitGenerationResult,
        captureBase,
        currentRevision,
        discardRecovery,
        preserveDatabaseState,
        readChatProjection,
        readGenerationCommit: committer.status,
        readGenerationRecovery: committer.readRecovery,
        recover,
        recoverAll,
    };
}

module.exports = {
    SERVER_CHAT_COMMIT_APPLIED_FIELD,
    SERVER_CHAT_COMMIT_SEQUENCE_KEY,
    createServerChatCommitOwner,
    reconcileServerChatRecovery,
};
