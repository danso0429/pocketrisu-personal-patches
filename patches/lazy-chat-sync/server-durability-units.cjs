'use strict'

// E2-3b: durable chat writes over the native PocketRisu 1.16.1 server.
// A full or delta chat POST records the chat body in the write journal
// (chatWriteJournal.cjs) before the response; a database.bin write retires
// the records it holds; every store rebuild replays what is left. Each native
// reset path drops the journal rows in the transaction that replaces the
// database and clears the journal memory after COMMIT. The native delta
// protocol, recordChatPost and the asset manifest hydrate stay as they are.

const serverFile = 'server/node/server.cjs'

const units = [
    {
        name: 'journal-owner',
        type: 'insert',
        where: 'after',
        anchor: `const databasePatchHashCache = createPatchHashCache(calculateHash);
`,
        content: `// Durable chat write journal (chatWriteJournal.cjs): a chat body is recorded
// before its POST is acknowledged and retired once a database.bin write
// holds it, so a restart inside the debounce window replays it.
const {
    DEFAULT_PREFIX: CHAT_WRITE_JOURNAL_PREFIX,
    commitSnapshotRestore,
    createChatWriteJournal,
} = require('./chatWriteJournal.cjs');
const storageResetTestHooks = require('./storageResetTestHooks.cjs');
const chatWriteJournal = createChatWriteJournal({
    kvGet,
    kvSet,
    kvDel,
    kvList,
    encode: encodeRisuSaveLegacy,
    decode: decodeRisuSave,
    onInvalid: (key, error) => {
        logger.warn(\`[ChatJournal] Could not process \${key}:\`, error?.message || error);
    },
    onBacklog: (stats) => {
        logger.warn(
            \`[ChatJournal] Retained awaiting-metadata backlog: \`
            + \`\${stats.awaitingRecords} record(s), \${stats.awaitingBytes} byte(s)\`
        );
    },
    onPressure: (stats) => {
        logger.error(
            \`[ChatJournal] Awaiting-metadata capacity reached; existing payloads retained. \`
            + \`records=\${stats.awaitingRecords}/\${stats.maxAwaitingRecords} \`
            + \`bytes=\${stats.awaitingBytes}/\${stats.maxAwaitingBytes}\`
        );
    },
});

// The chat bodies a database.bin write is about to persist, captured when it
// reads the chat store. Store entries are replaced, never edited, on a POST.
function captureChatStorePayloads() {
    const snapshot = new Map();
    if (!fullChatStore) return snapshot;
    for (const [chaId, chats] of fullChatStore) snapshot.set(chaId, new Map(chats));
    return snapshot;
}

// After a committed database.bin write: retire the journal records it holds.
// A chat POST acknowledged after the capture keeps its record. A failure
// keeps records, which replay as the content already on disk.
async function retireChatJournalAfterPersist(strippedDb, persistedChats) {
    try {
        await chatWriteJournal.clearAfterDatabasePersist(
            strippedDb,
            (chaId, chatId) => persistedChats.get(chaId)?.get(chatId),
        );
    } catch (error) {
        logger.warn('[ChatJournal] Could not retire persisted records:', error?.message || error);
    }
}
`,
    },
    {
        name: 'journal-load',
        type: 'insert',
        where: 'after',
        anchor: `async function startServer() {
    try {
`,
        content: `        // Store rebuilds replay the journal synchronously from memory.
        await chatWriteJournal.ensureLoaded();
`,
    },
    {
        name: 'journal-replay',
        type: 'replace',
        anchor: `function initChatStore(dbObj) {
`,
        content: `function initChatStore(dbObj) {
    initChatStoreFromDatabase(dbObj);
    // Acknowledged chat writes newer than the database replay over every
    // rebuild of the store: cold load, persist refresh, full write.
    chatWriteJournal.replayInto(fullChatStore);
}

function initChatStoreFromDatabase(dbObj) {
`,
    },
    {
        name: 'journal-replay-empty',
        type: 'replace',
        anchor: `        fullChatStore = new Map();
        return;
`,
        content: `        fullChatStore = new Map();
        chatWriteJournal.replayInto(fullChatStore);
        return;
`,
    },
    {
        name: 'journal-forget-listed',
        type: 'insert',
        where: 'after',
        anchor: `function forgetListedChatPosts(dbObj) {
`,
        content: `    // Same rule for the journal: a listed chat that a later persist does
    // not list was deleted, and its record must not bring it back.
    chatWriteJournal.markListedRecords(dbObj);
`,
    },
    {
        name: 'chat-post-validate',
        type: 'insert',
        where: 'after',
        anchor: `            if (!chatData || !expectedChatId) {
                return res.status(400).json({ error: 'Chat data and x-chat-id required' });
            }
`,
        content: `            // A body naming another chat would be stored under the wrong id.
            // A full save carries the whole message array; a delta keeps its
            // native 409 below.
            if (chatData.id && chatData.id !== expectedChatId) {
                return res.status(409).json({ error: 'Chat ID mismatch' });
            }
            if (!readChatDeltaBase(req) && !Array.isArray(chatData.message)) {
                return res.status(400).json({ error: 'Full chat payload must contain a message array' });
            }
`,
    },
    {
        name: 'chat-post-journal',
        type: 'insert',
        where: 'before',
        anchor: `            // Update fullChatStore
`,
        content: `            // Durable before it is visible or acknowledged. A chat without a
            // body here waits for its database entry before it retires.
            const hadChatBody = fullChatStore.get(chaId)?.has(expectedChatId) === true;
            const wasAwaitingMetadata = await chatWriteJournal.isAwaitingMetadata(chaId, expectedChatId);
            chatData.id = expectedChatId;
            await chatWriteJournal.stage(chaId, expectedChatId, chatData, {
                awaitingMetadata: !hadChatBody || wasAwaitingMetadata,
            });
            if (!fullChatStore) await ensureChatStore();
`,
    },
    {
        name: 'chat-post-cold-persist',
        type: 'replace',
        anchor: `                            const fullDb = hydrateDatabaseForDisk(stripDatabaseForClient(dbObj, { reconcileManifests: true }));
                            const encoded = Buffer.from(encodeRisuSaveLegacy(fullDb));
                            try {
                                kvSet('database/database.bin', encoded);
                            } catch (err) {
                                if (err && typeof err === 'object') {
                                    try { err.attemptedSize = encoded.length; } catch {}
                                }
                                throw err;
                            }
`,
        content: `                            const strippedDb = stripDatabaseForClient(dbObj, { reconcileManifests: true });
                            const fullDb = hydrateDatabaseForDisk(strippedDb);
                            const persistedChats = captureChatStorePayloads();
                            const encoded = Buffer.from(encodeRisuSaveLegacy(fullDb));
                            await storageResetTestHooks.waitAtPersistGate('db-persist');
                            try {
                                kvSet('database/database.bin', encoded);
                            } catch (err) {
                                if (err && typeof err === 'object') {
                                    try { err.attemptedSize = encoded.length; } catch {}
                                }
                                throw err;
                            }
                            await retireChatJournalAfterPersist(strippedDb, persistedChats);
`,
    },
    {
        name: 'flush-cold-persist',
        type: 'replace',
        anchor: `                const fullDb = hydrateDatabaseForDisk(stripDatabaseForClient(dbObj, { reconcileManifests: true }));
                kvSet('database/database.bin', Buffer.from(encodeRisuSaveLegacy(fullDb)));
`,
        content: `                const strippedDb = stripDatabaseForClient(dbObj, { reconcileManifests: true });
                const fullDb = hydrateDatabaseForDisk(strippedDb);
                const persistedChats = captureChatStorePayloads();
                await storageResetTestHooks.waitAtPersistGate('db-persist');
                kvSet('database/database.bin', Buffer.from(encodeRisuSaveLegacy(fullDb)));
                await retireChatJournalAfterPersist(strippedDb, persistedChats);
`,
    },
    {
        name: 'persist-capture',
        type: 'insert',
        where: 'after',
        anchor: `    let fullDb = hydrateDatabaseForDisk(strippedDb);
`,
        content: `    const persistedChats = captureChatStorePayloads();
`,
    },
    {
        name: 'persist-gate',
        type: 'insert',
        where: 'before',
        anchor: `    const data = Buffer.from(encodeRisuSaveLegacy(fullDb));
`,
        content: `    await storageResetTestHooks.waitAtPersistGate('db-persist');
`,
    },
    {
        name: 'persist-retire',
        type: 'insert',
        where: 'before',
        anchor: `        initChatStore(fullDb);
        lastDbPersistMs = Math.round(performance.now() - persistStartedAt);
`,
        content: `        await retireChatJournalAfterPersist(strippedDb, persistedChats);
`,
    },
    {
        name: 'write-capture',
        type: 'insert',
        where: 'after',
        anchor: `                    let fullDb = hydrateDatabaseForDisk(incomingDb);
`,
        content: `                    const persistedChats = captureChatStorePayloads();
`,
    },
    {
        name: 'write-retire',
        type: 'insert',
        where: 'after',
        anchor: `                    kvSet(key, mergedContent);
`,
        content: `                    await retireChatJournalAfterPersist(incomingDb, persistedChats);
`,
    },
    {
        name: 'backup-import-journal',
        type: 'replace',
        anchor: `        clearEntities();
        sqliteDb.exec('COMMIT');
    } catch (error) {
        try { sqliteDb.exec('ROLLBACK'); } catch (_) {}
`,
        content: `        storageResetTestHooks.failpoint('after-destructive-deletes', reset.attempt);
        // Neither a previous nor an imported journal row may replay over
        // the imported database, and the storage epoch advances: both in
        // the import transaction.
        finishStorageResetTransaction(reset);
        clearEntities();
        // The inlay directory swap runs before COMMIT, so a failed COMMIT
        // can still put the previous directory back.
        swapResetInlayDir(reset, stagingDir);
        storageResetTestHooks.failpoint('commit-after-inlay-swap', reset.attempt);
        sqliteDb.exec('COMMIT');
        reset.committed = true;
    } catch (error) {
        try { sqliteDb.exec('ROLLBACK'); } catch (_) {}
        reverseResetInlaySwap(reset, stagingDir, error);
`,
    },
    {
        name: 'backup-import-journal-memory',
        type: 'insert',
        where: 'after',
        anchor: `    // and a store left behind would be flushed back over the import.
    invalidateDbCache();
`,
        content: `    chatWriteJournal.resetMemory();
`,
    },
    {
        name: 'save-folder-dir-journal',
        type: 'insert',
        where: 'after',
        anchor: `            const value = readFileSync(path.join(dirPath, hexFile));
            // Chunk the DB blob so an oversized database.bin imports instead of
            // failing the BLOB bind limit; other keys keep the bulk fast path.
            if (key === DB_BLOB_KEY) { kvSet(key, value); continue; }
            insert.run(key, value, now);
        }
`,
        content: `        // Neither a previous nor an imported journal row may replay over
        // the imported database, and the storage epoch advances: both in
        // its transaction.
        finishStorageResetTransaction(reset);
`,
    },
    {
        name: 'save-folder-dir-journal-memory',
        type: 'insert',
        where: 'before',
        anchor: `    writeFileSync(migrationMarkerPath, new Date().toISOString(), 'utf-8');
    return { imported: hexFiles.length };
`,
        content: `    reset.committed = true;
    chatWriteJournal.resetMemory();
`,
    },
    {
        name: 'save-folder-entries-journal',
        type: 'insert',
        where: 'after',
        anchor: `        for (const { key, value } of entries) {
            // Chunk the DB blob so an oversized database.bin imports instead of
            // failing the BLOB bind limit; other keys keep the bulk fast path.
            if (key === DB_BLOB_KEY) { kvSet(key, value); continue; }
            insert.run(key, value, now);
        }
`,
        content: `        // Neither a previous nor an imported journal row may replay over
        // the imported database, and the storage epoch advances: both in
        // its transaction.
        finishStorageResetTransaction(reset);
`,
    },
    {
        name: 'save-folder-entries-journal-memory',
        type: 'insert',
        where: 'before',
        anchor: `    writeFileSync(migrationMarkerPath, new Date().toISOString(), 'utf-8');
    return { imported: entries.length };
`,
        content: `    reset.committed = true;
    chatWriteJournal.resetMemory();
`,
    },
    {
        name: 'snapshot-restore-journal',
        type: 'replace',
        anchor: `            sqliteDb.transaction(() => {
                kvCopyValue(key, DB_BLOB_KEY);
                pluginStorage.restoreFrom(snapshotPluginId(key));
            })();
`,
        content: `            // The journal describes the replaced database: its rows go in the
            // same transaction as the storage epoch, its memory only after
            // COMMIT.
            commitSnapshotRestore({
                runTransaction: (operation) => sqliteDb.transaction(operation)(),
                restoreDatabase: () => {
                    kvCopyValue(key, DB_BLOB_KEY);
                    pluginStorage.restoreFrom(snapshotPluginId(key));
                },
                discardJournal: () => finishStorageResetTransaction(reset),
                resetJournalMemory: () => chatWriteJournal.resetMemory(),
            });
            reset.committed = true;
`,
    },
    {
        name: 'database-remove-journal',
        type: 'replace',
        anchor: `        kvDel(key);
        res.send({ success: true });
`,
        content: `        if (key === 'database/database.bin') {
            // Removing database.bin is a storage reset. The journal describes
            // the removed database: its rows go in the same transaction as
            // the storage epoch, its memory only after COMMIT. The cached
            // database, chat store and pending save timer go too, or the
            // scheduled save writes the removed database back.
            if (importInProgress) {
                return res.status(409).json({ error: 'Another import is already in progress' });
            }
            importInProgress = true;
            try {
                await runStorageReset('database-remove', async (reset) => {
                    sqliteDb.transaction(() => {
                        kvDel(key);
                        finishStorageResetTransaction(reset);
                    })();
                    reset.committed = true;
                    invalidateDbCache();
                    chatWriteJournal.resetMemory();
                });
            } finally {
                importInProgress = false;
            }
        } else {
            kvDel(key);
        }
        res.send({ success: true });
`,
    },
    {
        name: 'cold-storage-fallback-fm-index',
        type: 'replace',
        anchor: `        char.chats = [{ message: [], note: '', name: 'Chat 1', localLore: [] }];
`,
        content: `        char.chats = [{ message: [], note: '', name: 'Chat 1', localLore: [], fmIndex: char.firstMsgIndex ?? -1 }];
`,
    },
]

module.exports = units.map(({ name, ...unit }) => ({
    id: `lazy-chat-sync:server-${name}:1.16`,
    file: serverFile,
    ...unit,
}))
