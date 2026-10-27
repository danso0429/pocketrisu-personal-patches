'use strict';
const { createHash } = require('node:crypto');
const digest = value => createHash('sha256').update(value).digest('hex');
class InvalidJournalRecord extends Error {
    constructor(message) { super(message); this.code = 'CHAT_JOURNAL_RECORD_INVALID'; }
}

const DEFAULT_PREFIX = 'internal/chat-write/v1/';
const DEFAULT_MAX_AWAITING_RECORDS = 128;
const DEFAULT_MAX_AWAITING_BYTES = 256 * 1024 * 1024;

function pairKey(chaId, chatId) {
    return JSON.stringify([chaId, chatId]);
}

function recordKey(chaId, chatId, commitOperationId = null) {
    return commitOperationId
        ? JSON.stringify([chaId, chatId, 'commit', commitOperationId])
        : pairKey(chaId, chatId);
}

function storageKey(prefix, chaId, chatId, commitOperationId = null) {
    return `${prefix}${Buffer.from(
        recordKey(chaId, chatId, commitOperationId),
        'utf8',
    ).toString('base64url')}`;
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
    let preparedRetirements = new WeakSet();
    let loadPromise = null;
    let loaded = false;

    function stats() {
        let awaitingRecords = 0;
        let awaitingBytes = 0;
        let operationRecords = 0;
        let operationBytes = 0;
        let residentChatRecords = 0;
        for (const record of records.values()) {
            if (record.chat) residentChatRecords += 1;
            if (record.commitOperationId) {
                operationRecords += 1;
                operationBytes += record.storageBytes || 0;
            }
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
            operationRecords,
            operationBytes,
            residentChatRecords,
        };
    }

    function cachedRecord(record, key, bytes) {
        const cached = { ...record, storageKey: key, storageBytes: bytes };
        // Operation consumers validate immutable payloads directly from KV.
        // Keep their identity/pressure metadata, not every historical chat body.
        if (record.commitOperationId) delete cached.chat;
        return cached;
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
            && typeof record.awaitingMetadata === 'boolean'
            && (record.retentionVersion === undefined
                || (record.retentionVersion === 1 && typeof record.commitOperationId === 'string'))
            && (record.commitOperationId === undefined
                || (typeof record.commitOperationId === 'string'
                    && /^[A-Za-z0-9_-]{8,128}$/.test(record.commitOperationId)));
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
                    records.set(recordKey(
                        record.chaId,
                        record.chatId,
                        record.commitOperationId || null,
                    ), cachedRecord(record, key, Buffer.byteLength(value)));
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

    async function prepareStage(
        chaId,
        chatId,
        chat,
        { awaitingMetadata, commitOperationId = null, retentionVersion = undefined },
    ) {
        await ensureLoaded();
        if (commitOperationId !== null
            && (typeof commitOperationId !== 'string'
                || !/^[A-Za-z0-9_-]{8,128}$/.test(commitOperationId))) {
            throw new Error('Refusing an invalid commit operation journal identity');
        }
        const key = recordKey(chaId, chatId, commitOperationId);
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
            ...(commitOperationId ? { commitOperationId } : {}),
            ...(retentionVersion !== undefined ? { retentionVersion } : {}),
        };
        if (!isValidRecord(record)) {
            throw new Error('Refusing to journal an invalid chat payload');
        }
        const keyOnDisk = storageKey(prefix, chaId, chatId, commitOperationId);
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
        records.set(prepared.key, cachedRecord(prepared.record,
            prepared.keyOnDisk, prepared.encoded.byteLength));
        preparedStages.delete(prepared);
    }

    // Rehydrate one transaction-committed record after a process restart or
    // after commit-before-publication failure. The caller remains responsible
    // for checking the chat hash/revision against its immutable commit record.
    async function readDurableStage(
        chaId,
        chatId,
        { validate = () => true, expectedStorageKey = null } = {},
    ) {
        const keyOnDisk = expectedStorageKey || storageKey(prefix, chaId, chatId);
        if (typeof keyOnDisk !== 'string' || !keyOnDisk.startsWith(prefix)) {
            throw new Error('Refusing an invalid durable chat journal storage key');
        }
        const raw = kvGet(keyOnDisk);
        if (!raw) return null;
        let value, record;
        try { value = Buffer.from(raw); record = await decode(value); }
        catch { throw new InvalidJournalRecord('Refusing an invalid encoded durable chat journal stage'); }
        if (!isValidRecord(record) || record.chaId !== chaId || record.chatId !== chatId) {
            throw new InvalidJournalRecord('Refusing to restore an invalid durable chat journal stage');
        }
        if (storageKey(prefix, chaId, chatId, record.commitOperationId || null) !== keyOnDisk) {
            throw new InvalidJournalRecord('Refusing a durable chat journal stage with a mismatched storage key');
        }
        const accepted = validate(record);
        if (accepted && typeof accepted.then === 'function') {
            throw new Error('Durable chat journal validation must be synchronous');
        }
        if (!accepted) {
            throw new InvalidJournalRecord('Refusing a durable chat journal stage rejected by its commit receipt');
        }
        return { record, value, keyOnDisk };
    }

    async function restoreDurableStage(chaId, chatId, options = {}) {
        const loaded = await readDurableStage(chaId, chatId, options);
        if (!loaded) return null;
        const { record, value, keyOnDisk } = loaded;
        const durable = {
            ...record,
            storageKey: keyOnDisk,
            storageBytes: Buffer.byteLength(value),
        };
        records.set(recordKey(chaId, chatId, record.commitOperationId || null),
            cachedRecord(record, keyOnDisk, durable.storageBytes));
        return durable;
    }

    async function prepareRetirement(chaId, chatId, options) {
        const loaded = await readDurableStage(chaId, chatId, options);
        if (!loaded || loaded.record.retentionVersion !== 1 || !loaded.record.commitOperationId) {
            throw new InvalidJournalRecord('Refusing to retire a missing or legacy operation journal');
        }
        if (!Number.isSafeInteger(loaded.record.updatedAt) || loaded.record.updatedAt <= 0) {
            throw new InvalidJournalRecord('Refusing an operation journal without a valid server write time');
        }
        const prepared = { keyOnDisk: loaded.keyOnDisk,
            record: cachedRecord(loaded.record, loaded.keyOnDisk, loaded.value.byteLength),
            storageHash: digest(loaded.value), writeCount: 0 };
        preparedRetirements.add(prepared);
        return prepared;
    }

    // Like writePreparedStage, this is synchronous and belongs inside the
    // source owner's SQLite transaction. Memory changes only after commit.
    function writeRetirement(prepared) {
        if (!preparedRetirements.has(prepared)) throw new Error('Unknown operation journal retirement');
        const current = kvGet(prepared.keyOnDisk);
        if (!current || digest(current) !== prepared.storageHash) {
            throw new Error('Operation journal changed before retirement');
        }
        kvDel(prepared.keyOnDisk);
        prepared.writeCount++;
    }

    function publishRetirement(prepared) {
        if (!preparedRetirements.has(prepared) || !prepared.writeCount) {
            throw new Error('Operation journal retirement is not committed');
        }
        const key = recordKey(prepared.record.chaId, prepared.record.chatId, prepared.record.commitOperationId);
        if (records.get(key)?.storageKey === prepared.keyOnDisk) records.delete(key);
        preparedRetirements.delete(prepared);
    }

    async function stage(chaId, chatId, chat, { awaitingMetadata }) {
        const prepared = await prepareStage(chaId, chatId, chat, { awaitingMetadata });
        // Persist before publishing to memory or acknowledging the request.
        writePreparedStage(prepared);
        publishPreparedStage(prepared);
    }

    async function restoreInto(chatStore) {
        await ensureLoaded();
        replayInto(chatStore);
    }

    // Synchronous replay of the records already in memory, for store
    // rebuilds that cannot await. The owner loads the journal once before it
    // serves requests (ensureLoaded); after resetMemory the durable rows are
    // gone too, so an empty memory replays nothing that disk still holds.
    function replayInto(chatStore) {
        for (const record of records.values()) {
            if (record.commitOperationId) continue;
            if (!chatStore.has(record.chaId)) {
                chatStore.set(record.chaId, new Map());
            }
            // Journal content is newer than database.bin (or byte-identical if
            // the process died after the DB commit but before journal cleanup).
            chatStore.get(record.chaId).set(record.chatId, record.chat);
        }
    }

    function samePayload(left, right) {
        if (left === right) return true;
        if (!left || !right) return false;
        try {
            return Buffer.from(encode(left)).equals(Buffer.from(encode(right)));
        } catch {
            return false;
        }
    }

    // `persisted` names the chat payloads the database persist wrote, read
    // when the persist read its chat state: a function (chaId, chatId) =>
    // chat, or one chat object, which answers for its own id only. Without
    // it every record the metadata rule allows is retired (a persist that
    // could not interleave with chat writes).
    function persistedPayloadLookup(persisted) {
        if (persisted === undefined || persisted === null) return null;
        if (typeof persisted === 'function') return persisted;
        return (_chaId, chatId) => (persisted.id === chatId ? persisted : undefined);
    }

    async function clearAfterDatabasePersist(strippedDatabase, persisted) {
        await ensureLoaded();
        const persistedPayload = persistedPayloadLookup(persisted);
        for (const [key, record] of [...records.entries()]) {
            if (record.commitOperationId) continue;
            const metadataCommitted = hasChatMetadata(
                strippedDatabase,
                record.chaId,
                record.chatId,
            );
            if (record.awaitingMetadata && !metadataCommitted) continue;
            // A chat write acknowledged after the persist read its state is
            // newer than what reached disk: keep it for the next persist and
            // for replay. A listed chat retires only when the persisted body
            // is the journaled one; an unlisted one was deleted by the persist.
            if (
                persistedPayload
                && metadataCommitted
                && !samePayload(persistedPayload(record.chaId, record.chatId), record.chat)
            ) continue;
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

    // The live database now lists these chats: a later persist that no
    // longer lists one deleted it, so the record stops waiting for its
    // entry. Memory only; after a restart the durable row waits again, which
    // keeps the body rather than dropping it.
    function markListedRecords(database) {
        for (const record of records.values()) {
            if (record.commitOperationId || !record.awaitingMetadata) continue;
            if (hasChatMetadata(database, record.chaId, record.chatId)) record.awaitingMetadata = false;
        }
    }

    async function isAwaitingMetadata(chaId, chatId) {
        await ensureLoaded();
        return records.get(pairKey(chaId, chatId))?.awaitingMetadata === true;
    }

    function resetMemory() {
        records.clear();
        preparedStages = new WeakSet();
        preparedRetirements = new WeakSet();
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
        prepareRetirement,
        writeRetirement,
        publishRetirement,
        stage,
        restoreInto,
        replayInto,
        clearAfterDatabasePersist,
        markListedRecords,
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
