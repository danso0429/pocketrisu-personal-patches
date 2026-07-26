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

    async function stage(chaId, chatId, chat, { awaitingMetadata }) {
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
        // Persist before publishing to memory or acknowledging the request.
        kvSet(keyOnDisk, encoded);
        records.set(key, {
            ...record,
            storageKey: keyOnDisk,
            storageBytes: encoded.byteLength,
        });
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
        loaded = false;
        loadPromise = null;
    }

    return {
        prefix,
        ensureLoaded,
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
    createChatWriteJournal,
    hasChatMetadata,
};
