'use strict';

const DEFAULT_PREFIX = 'internal/chat-write/v1/';
const DEFAULT_MAX_AWAITING_RECORDS = 128;
const DEFAULT_MAX_AWAITING_BYTES = 256 * 1024 * 1024;

function pairKey(chaId, chatId) {
    return JSON.stringify([chaId, chatId]);
}

function storageKey(prefix, chaId, chatId) {
    return `${prefix}${Buffer.from(pairKey(chaId, chatId), 'utf8').toString('base64url')}`;
}

function hasChatMetadata(database, chaId, chatId) {
    if (!Array.isArray(database?.characters)) return false;
    const character = database.characters.find((entry) => entry?.chaId === chaId);
    return Array.isArray(character?.chats)
        && character.chats.some((chat) => chat?.id === chatId);
}

function commitSnapshotRestore({
    runTransaction,
    restoreDatabase,
    discardJournal,
    discardCommitRecovery = () => {},
    resetJournalMemory,
}) {
    runTransaction(() => {
        restoreDatabase()
        discardJournal()
        discardCommitRecovery()
    })
    // Reset only after the durable transaction commits. On rollback the
    // in-memory owner remains aligned with the still-present journal rows.
    resetJournalMemory()
}

/**
 * A small durable write-ahead journal for chat payloads.
 *
 * Chat content is saved before its database.bin stub. The journal makes the
 * server's success response durable without prematurely changing the stripped
 * database (which would invalidate the client's patch hash). Records for a new
 * chat remain until a database persist contains its stub; records for an
 * existing chat can be cleared after the next database persist, including when
 * that persist intentionally deletes the chat.
 */
function createChatWriteJournal({
    kvGet,
    kvSet,
    kvDel,
    kvList,
    encode,
    decode,
    prefix = DEFAULT_PREFIX,
    onInvalid = () => {},
    onBacklog = () => {},
    onPressure = () => {},
    maxAwaitingRecords = DEFAULT_MAX_AWAITING_RECORDS,
    maxAwaitingBytes = DEFAULT_MAX_AWAITING_BYTES,
}) {
    const records = new Map();
    let preparedStages = new WeakSet();
    let loadPromise = null;
    let loaded = false;

    function stats() {
        let awaitingRecords = 0;
        let awaitingBytes = 0;
        for (const record of records.values()) {
            if (!record.awaitingMetadata) continue;
            awaitingRecords += 1;
            awaitingBytes += record.storageBytes || 0;
        }
        return {
            records: records.size,
            awaitingRecords,
            awaitingBytes,
            maxAwaitingRecords,
            maxAwaitingBytes,
        };
    }

    function isValidRecord(record) {
        return record
            && record.version === 1
            && typeof record.chaId === 'string'
            && record.chaId.length > 0
            && typeof record.chatId === 'string'
            && record.chatId.length > 0
            && record.chat
            && typeof record.chat === 'object'
            && record.chat.id === record.chatId
            && Array.isArray(record.chat.message)
            && typeof record.awaitingMetadata === 'boolean';
    }

    async function ensureLoaded() {
        if (loaded) return;
        if (loadPromise) return loadPromise;
        loadPromise = (async () => {
            for (const key of kvList(prefix)) {
                try {
                    const value = kvGet(key);
                    if (!value) continue;
                    const record = await decode(value);
                    if (!isValidRecord(record)) {
                        onInvalid(key, new Error('invalid chat write journal record'));
                        continue;
                    }
                    records.set(pairKey(record.chaId, record.chatId), {
                        ...record,
                        storageKey: key,
                        storageBytes: Buffer.byteLength(value),
                    });
                } catch (error) {
                    onInvalid(key, error);
                }
            }
            loaded = true;
            const loadedStats = stats();
            if (loadedStats.awaitingRecords > 0) onBacklog(loadedStats);
        })();
        try {
            await loadPromise;
        } finally {
            loadPromise = null;
        }
    }

    async function prepareStage(chaId, chatId, chat, { awaitingMetadata }) {
        await ensureLoaded();
        const key = pairKey(chaId, chatId);
        const previous = records.get(key);
        const record = {
            version: 1,
            chaId,
            chatId,
            chat,
            // Once a payload is waiting for its first stub, later updates must
            // keep waiting until that stub is durably committed.
            awaitingMetadata: previous?.awaitingMetadata === true || awaitingMetadata === true,
            updatedAt: Date.now(),
        };
        if (!isValidRecord(record)) {
            throw new Error('Refusing to journal an invalid chat payload');
        }
        const keyOnDisk = storageKey(prefix, chaId, chatId);
        const encoded = Buffer.from(encode(record));
        if (record.awaitingMetadata) {
            const currentStats = stats();
            const previousAwaitingRecords = previous?.awaitingMetadata ? 1 : 0;
            const previousAwaitingBytes = previous?.awaitingMetadata
                ? (previous.storageBytes || 0)
                : 0;
            const proposed = {
                ...currentStats,
                awaitingRecords: currentStats.awaitingRecords - previousAwaitingRecords + 1,
                awaitingBytes: currentStats.awaitingBytes - previousAwaitingBytes + encoded.byteLength,
            };
            if (
                proposed.awaitingRecords > maxAwaitingRecords
                || proposed.awaitingBytes > maxAwaitingBytes
            ) {
                const error = new Error(
                    'Chat write journal awaiting-metadata capacity reached; '
                    + 'existing recoverable payloads were retained'
                );
                error.code = 'CHAT_JOURNAL_CAPACITY';
                error.stats = proposed;
                onPressure(proposed);
                throw error;
            }
        }
        const prepared = {
            key,
            previous,
            record,
            keyOnDisk,
            encoded,
            writeCount: 0,
        };
        preparedStages.add(prepared);
        return prepared;
    }

    function requirePreparedStage(prepared) {
        if (!prepared || typeof prepared !== 'object' || !preparedStages.has(prepared)) {
            throw new Error('Refusing an unknown or already-published chat journal stage');
        }
        if (records.get(prepared.key) !== prepared.previous) {
            throw new Error('Refusing a stale prepared chat journal stage');
        }
    }

    function describePreparedStage(prepared) {
        requirePreparedStage(prepared);
        return {
            storageKey: prepared.keyOnDisk,
            storageBytes: prepared.encoded.byteLength,
        };
    }

    // Synchronous by design: callers may compose this exact write with other
    // already-prepared KV writes inside better-sqlite3's transaction callback.
    // Repeating it before publication is safe and supports retry after rollback.
    function writePreparedStage(prepared) {
        requirePreparedStage(prepared);
        kvSet(prepared.keyOnDisk, prepared.encoded);
        prepared.writeCount += 1;
        return describePreparedStage(prepared);
    }

    // Publish only after the surrounding durable transaction returns. This
    // method performs no I/O and consumes the prepared token exactly once.
    function publishPreparedStage(prepared) {
        requirePreparedStage(prepared);
        if (prepared.writeCount < 1) {
            throw new Error('Refusing to publish an unwritten chat journal stage');
        }
        records.set(prepared.key, {
            ...prepared.record,
            storageKey: prepared.keyOnDisk,
            storageBytes: prepared.encoded.byteLength,
        });
        preparedStages.delete(prepared);
    }

    // Rehydrate one transaction-committed record after a process restart or
    // after commit-before-publication failure. The caller remains responsible
    // for checking the chat hash/revision against its immutable commit record.
    async function restoreDurableStage(chaId, chatId, { validate = () => true } = {}) {
        const keyOnDisk = storageKey(prefix, chaId, chatId);
        const value = kvGet(keyOnDisk);
        if (!value) return null;
        const record = await decode(value);
        if (!isValidRecord(record) || record.chaId !== chaId || record.chatId !== chatId) {
            throw new Error('Refusing to restore an invalid durable chat journal stage');
        }
        const accepted = validate(record);
        if (accepted && typeof accepted.then === 'function') {
            throw new Error('Durable chat journal validation must be synchronous');
        }
        if (!accepted) {
            throw new Error('Refusing a durable chat journal stage rejected by its commit receipt');
        }
        const durable = {
            ...record,
            storageKey: keyOnDisk,
            storageBytes: Buffer.byteLength(value),
        };
        records.set(pairKey(chaId, chatId), durable);
        return durable;
    }

    async function stage(chaId, chatId, chat, { awaitingMetadata }) {
        const prepared = await prepareStage(chaId, chatId, chat, { awaitingMetadata });
        // Persist before publishing to memory or acknowledging the request.
        writePreparedStage(prepared);
        publishPreparedStage(prepared);
    }

    async function restoreInto(chatStore) {
        await ensureLoaded();
        for (const record of records.values()) {
            if (!chatStore.has(record.chaId)) {
                chatStore.set(record.chaId, new Map());
            }
            // Journal content is newer than database.bin (or byte-identical if
            // the process died after the DB commit but before journal cleanup).
            chatStore.get(record.chaId).set(record.chatId, record.chat);
        }
    }

    async function clearAfterDatabasePersist(strippedDatabase) {
        await ensureLoaded();
        for (const [key, record] of [...records.entries()]) {
            const metadataCommitted = hasChatMetadata(
                strippedDatabase,
                record.chaId,
                record.chatId,
            );
            if (record.awaitingMetadata && !metadataCommitted) continue;
            try {
                kvDel(record.storageKey);
                records.delete(key);
            } catch (error) {
                // Keeping a byte-identical journal record is safe. It will be
                // replayed on restart and cleanup can succeed on a later flush.
                onInvalid(record.storageKey, error);
            }
        }
    }

    async function isAwaitingMetadata(chaId, chatId) {
        await ensureLoaded();
        return records.get(pairKey(chaId, chatId))?.awaitingMetadata === true;
    }

    function resetMemory() {
        records.clear();
        preparedStages = new WeakSet();
        loaded = false;
        loadPromise = null;
    }

    return {
        prefix,
        ensureLoaded,
        prepareStage,
        describePreparedStage,
        writePreparedStage,
        publishPreparedStage,
        restoreDurableStage,
        stage,
        restoreInto,
        clearAfterDatabasePersist,
        isAwaitingMetadata,
        resetMemory,
        size: () => records.size,
        stats,
    };
}

module.exports = {
    DEFAULT_MAX_AWAITING_BYTES,
    DEFAULT_MAX_AWAITING_RECORDS,
    DEFAULT_PREFIX,
    commitSnapshotRestore,
    createChatWriteJournal,
    hasChatMetadata,
};
