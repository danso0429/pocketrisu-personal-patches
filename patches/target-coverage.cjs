'use strict'

// Unit coverage for every PocketRisu target a pack declares besides the frozen
// 1.10.0 baseline (test/fixtures/target-baseline-1.10.0.json). Maintainer data:
// read by scripts/lib/target-coverage.cjs, scripts/qualify-subset.cjs and the
// catalog test, never by the installer.
//
// Shape:
// {
//     [packId]: {
//         [target]: {
//             from: '1.10.0',
//             retained: [oldUnitId, ...] | 'all',
//             replaced: { [oldUnitId]: [newUnitId, ...] },
//             added: { [newUnitId]: 'reason' },
//             retired: { [oldUnitId]: 'evidence' },
//         },
//     },
// }
const unchangedFrom1100 = () => ({
    from: '1.10.0',
    retained: 'all',
    replaced: {},
    added: {},
    retired: {},
})

module.exports = {
    'charx-archive-integrity': { '1.16.1': unchangedFrom1100() },
    'parser-hardening': { '1.16.1': unchangedFrom1100() },
    'log-load-performance': { '1.16.1': unchangedFrom1100() },
    'kei-prompt-role-compat-core': { '1.16.1': unchangedFrom1100() },
    'kei-text-theme-normalization-core': { '1.16.1': unchangedFrom1100() },
    'kei-fullscreen-image-viewer-core': { '1.16.1': unchangedFrom1100() },
    'client-build-fence': {
        '1.16.1': {
            from: '1.10.0',
            retained: 'all',
            replaced: {},
            rewritten: {
                'client-build-fence:server-helper:1.9':
                    'The owned fence helper also fences the eleven data-writing routes PocketRisu 1.16.1 adds (RisuAI account import, character archive and activate, archive and asset orphan cleanup, asset manifest owner PATCH).',
                'client-build-fence:node-storage-import:1.9':
                    'nodeStorage also imports withClientBuildHeader and handleClientBuildResponse for the 1.16.1 session start and authFetchOnce.',
                'client-build-fence:node-session-fetch:1.9':
                    'PocketRisu 1.16.1 starts the session through authRequest; the build header is added to its request headers.',
                'client-build-fence:node-session-accept:1.9':
                    'PocketRisu 1.16.1 reads the session response only inside the authRequest read callback; 426 handling and the advertised build move into that callback, within its timeout.',
                'client-build-fence:node-auth-fetch:1.9':
                    'PocketRisu 1.16.1 authFetchOnce calls the injectable this.fetchFn; the build header is added to its headers and the response goes through handleClientBuildResponse.',
                'client-build-fence:global-import:1.9':
                    'globalApi also imports hasPendingPluginStorageWrites for the dirty probe.',
                'client-build-fence:global-dirty-probe:1.9':
                    'PocketRisu 1.16.1 hasTrackedChanges no longer checks pluginCustomStorage; plugin values live in pluginStorageStore, whose pending writes now count as dirty.',
            },
            added: {
                'client-build-fence:server-helper-e2-2a-tests:1.16':
                    'Server tests for the 1.16.1 writer routes.',
                'client-build-fence:node-storage-tests:1.16':
                    'Client tests for the 1.16.1 session start and authFetchOnce.',
                'client-build-fence:plugin-storage-pending:1.16':
                    'Read-only pluginStorageStore export reporting queued, in-flight and retry-waiting plugin writes.',
                'client-build-fence:plugin-storage-pending-tests:1.16':
                    'Client tests for hasPendingPluginStorageWrites.',
                'client-build-fence:plugin-storage-dirty-tests:1.16':
                    'Client test that pending plugin writes block the 426 reload.',
                'client-build-fence:job-fetch-orphan-delete:1.16':
                    'PocketRisu 1.16.1 adds a bare DELETE /api/model-jobs/:id when an aborted create finds its job; it now carries the build header.',
                'client-build-fence:job-fetch-tests:1.16':
                    'Client test for the aborted-create job DELETE.',
                'client-build-fence:bootstrap-import:1.16':
                    'bootstrap imports clientBuildFetch for the auto-sweep request.',
                'client-build-fence:bootstrap-auto-sweep:1.16':
                    'PocketRisu 1.16.1 boot cleanup calls POST /api/db/assets/auto-sweep with a bare fetch; it now carries the build header.',
                'client-build-fence:bootstrap-tests:1.16':
                    'Client test for the auto-sweep request.',
                'client-build-fence:system-dashboard-archive-purge:1.16':
                    'PocketRisu 1.16.1 dashboard calls POST /api/db/archive/purge-orphans with a bare fetch; it now carries the build header.',
                'client-build-fence:system-dashboard-archive-purge-tests:1.16':
                    'Client test for the archive orphan purge request.',
            },
            retired: {},
        },
    },
    'lazy-chat-sync': {
        '1.16.1': {
            from: '1.10.0',
            retained: [
                'lazy-chat-sync:owned:server:node:chatWriteJournal-cjs',
                'lazy-chat-sync:owned:server:node:serverChatCommit-cjs:1.10',
                'lazy-chat-sync:owned:server:node:serverChatCommit-test-ts:1.10',
                'lazy-chat-sync:owned:server:node:storageResetPrepare-cjs:1.10',
                'lazy-chat-sync:owned:server:node:storageResetPrepare-test-ts:1.10',
                'lazy-chat-sync:owned:server:node:storageResetPrepare-phaseC-test-ts:1.10',
                'lazy-chat-sync:owned:server:node:storageResetTestHooks-cjs:1.10',
                'lazy-chat-sync:session-lock:invalidate-before:1.10',
                'lazy-chat-sync:owned:server:node:chatDelta-cjs',
                'lazy-chat-sync:owned:server:node:chatDelta-test-ts',
                'lazy-chat-sync:owned:server:node:chatWriteJournal-test-ts',
                'lazy-chat-sync:owned:src:ts:storage:conflictRebase-ts',
                'lazy-chat-sync:owned:src:ts:storage:conflictRebase-test-ts',
                'lazy-chat-sync:owned:src:ts:storage:chatSaveRebase-ts',
                'lazy-chat-sync:owned:src:ts:storage:chatSaveRebase-test-ts',
                'lazy-chat-sync:owned:src:ts:storage:chatIdentityRepair-ts',
                'lazy-chat-sync:owned:src:ts:storage:chatIdentityRepair-test-ts',
                'lazy-chat-sync:owned:src:ts:storage:chatSaveIntent-ts',
                'lazy-chat-sync:owned:src:ts:storage:nodeStorage-chatRebaseCodec-test-ts',
                'lazy-chat-sync:chat-missing-payload-notice',
            ],
            rewritten: {
                'lazy-chat-sync:owned:server:node:chatWriteJournal-cjs':
                    'PocketRisu 1.16.1 writes the database outside the storage queue, so a chat POST can land between the read and the write of a persist. clearAfterDatabasePersist takes the payloads the persist read and keeps a record whose chat changed since; replayInto replays the loaded records synchronously for the native store rebuilds; markListedRecords ends the wait for an entry once the live database lists the chat.',
                'lazy-chat-sync:owned:server:node:storageResetTestHooks-cjs:1.10':
                    'Holds the db-persist gate of the durable chat writes and the E2-3c storage reset hooks (admission and reset gates, failpoints, trace). An inert gate returns synchronously so it adds no step to the storage queue. The spool and metrics hooks are gone with the 1.10.0 spool (E2-3c decision: the native import reads its body inside its transaction).',
                'lazy-chat-sync:owned:src:ts:storage:chatIdentityRepair-ts':
                    'Also repairs a chat id repeated within a character the confirmed baseline proves new (the server stores bodies per character by chat id); a repeated id on a known character is left as it is (E2-3d, d7).',
                'lazy-chat-sync:owned:src:ts:storage:chatSaveIntent-ts':
                    'A confirmed baseline without a characters key is the empty database a fresh install starts from ({}), so its chats classify as create instead of update (E2-3d, d8 and d11).',
                'lazy-chat-sync:session-lock:invalidate-before:1.10':
                    'invalidateBefore(t) is rewritten over the PocketRisu 1.16.1 revokeAll meaning: nobody holds the lock afterwards and a session that booted at or before t is stale, while a later one gets the native fresh, passive and tookOver states. The 1.10.0 watermark units are retired.',
            },
            replaced: {},
            added: {
                'lazy-chat-sync:server-journal-owner:1.16':
                    'Creates the chat write journal and the persist helpers on the native server.',
                'lazy-chat-sync:server-journal-load:1.16':
                    'Loads the journal before the server listens.',
                'lazy-chat-sync:server-journal-replay:1.16':
                    'Replays acknowledged chat writes over every chat store rebuild.',
                'lazy-chat-sync:server-journal-replay-empty:1.16':
                    'Replays acknowledged chat writes when no database exists yet.',
                'lazy-chat-sync:server-journal-forget-listed:1.16':
                    'Once a database patch lists a posted chat, its journal record stops waiting for the entry, so deleting the chat before the next persist keeps it deleted (as the native recordChatPost does).',
                'lazy-chat-sync:server-chat-post-validate:1.16':
                    'A chat POST whose body names another chat gets 409; a full POST without a message array gets 400.',
                'lazy-chat-sync:server-chat-post-journal:1.16':
                    'A chat POST is journaled before the store update and the response.',
                'lazy-chat-sync:server-chat-post-cold-persist:1.16':
                    'The chat POST persist with a cold database cache retires the records it wrote and stops at the db-persist test gate.',
                'lazy-chat-sync:server-flush-cold-persist:1.16':
                    'The flush with a cold database cache retires the records it wrote and stops at the db-persist test gate.',
                'lazy-chat-sync:server-persist-capture:1.16':
                    'persistDbCacheWithChats captures the chat payloads it merges.',
                'lazy-chat-sync:server-persist-gate:1.16':
                    'persistDbCacheWithChats stops at the db-persist test gate before writing.',
                'lazy-chat-sync:server-persist-retire:1.16':
                    'persistDbCacheWithChats retires the records it wrote before refreshing the store.',
                'lazy-chat-sync:server-write-capture:1.16':
                    'The full database write captures the chat payloads it merges.',
                'lazy-chat-sync:server-write-retire:1.16':
                    'The full database write retires the records it wrote.',
                'lazy-chat-sync:server-backup-import-journal:1.16':
                    'Backup import, server restore and account apply finish their single transaction: the journal rows go and the storage epoch advances, the inlay directory is swapped before COMMIT, and a failure puts the previous inlay directory back (or enters recovery-required mode).',
                'lazy-chat-sync:server-backup-import-journal-memory:1.16':
                    'Backup import, server restore and account apply clear the journal memory after COMMIT.',
                'lazy-chat-sync:server-save-folder-dir-journal:1.16':
                    'Save-folder execute drops the journal rows and advances the storage epoch in its import transaction.',
                'lazy-chat-sync:server-save-folder-dir-journal-memory:1.16':
                    'Save-folder execute marks its reset committed and clears the journal memory after COMMIT.',
                'lazy-chat-sync:server-save-folder-entries-journal:1.16':
                    'Save-folder upload drops the journal rows and advances the storage epoch in its import transaction.',
                'lazy-chat-sync:server-save-folder-entries-journal-memory:1.16':
                    'Save-folder upload marks its reset committed and clears the journal memory after COMMIT.',
                'lazy-chat-sync:server-snapshot-restore-journal:1.16':
                    'Snapshot restore commits the database, plugin rows, journal deletion and storage epoch together (commitSnapshotRestore), then clears the journal memory.',
                'lazy-chat-sync:server-database-remove-journal:1.16':
                    'Removing database.bin is a storage reset: it takes the import exclusion (409 while another reset runs), drops the journal rows and advances the storage epoch in the same transaction, then clears the caches and the journal memory.',
                'lazy-chat-sync:server-cold-storage-fallback-fm-index:1.16':
                    'The chat the server creates for a cold-storage character it cannot restore carries fmIndex.',
                'lazy-chat-sync:owned:server:node:chatDurability-e2-3-test-ts:1.16':
                    'Server tests for the journal replay, the persist interleaving rule, the snapshot transaction order and the fallback chat fmIndex.',
                'lazy-chat-sync:owned:test:compat:restartableServer-e2-3-helper-ts:1.16':
                    'Compat helper that restarts a server process on the same save folder.',
                'lazy-chat-sync:owned:test:compat:restart-durability-e2-3-test-ts:1.16':
                    'Compat tests for a chat acknowledged before a kill, the native reset paths across a restart and the archive state across a restart.',
                'lazy-chat-sync:server-barrier-state:1.16':
                    'Storage reset barrier state, admission (generation recorded at entry, rechecked when queued work is queued and when it runs), debounced-write tracking around a reset, storage epoch, the NDJSON error line of a reset refusal, and the reset runner (a second wait for running writes and flushes after its test gate, then the applying mark and apply context) with the inlay swap helpers.',
                'lazy-chat-sync:server-check-active-session-options:1.16':
                    'checkActiveSession takes storageReset (routes that start a reset) and storageResetExempt (log routes).',
                'lazy-chat-sync:server-check-active-session-gate:1.16':
                    'checkActiveSession applies the storage reset gate after the native account import gate; the account import routes skip it.',
                'lazy-chat-sync:server-flush-gate:1.16':
                    '/api/db/flush, which does not call checkActiveSession, applies the same storage reset gate.',
                'lazy-chat-sync:server-logs-exempt:1.16':
                    'Clearing the server logs stays outside the storage reset gate.',
                'lazy-chat-sync:server-request-logs-exempt:1.16':
                    'The request log routes stay outside the storage reset gate.',
                'lazy-chat-sync:server-remove-gate:1.16':
                    '/api/remove passes the gate as a reset start for database.bin and as a writer for other keys.',
                'lazy-chat-sync:server-backup-import-prepare-gate:1.16':
                    'Backup import preparation is a reset start: a competing reset gets the native 409.',
                'lazy-chat-sync:server-backup-import-gate:1.16':
                    'Backup import is a reset start: a competing reset gets the native 409.',
                'lazy-chat-sync:server-server-restore-gate:1.16':
                    'Server restore is a reset start: a competing reset gets the native 409.',
                'lazy-chat-sync:server-server-restore-kind:1.16':
                    'Server restore runs its import as the server-restore reset.',
                'lazy-chat-sync:server-account-apply-kind:1.16':
                    'Account apply runs its import as the account-apply reset.',
                'lazy-chat-sync:server-save-folder-execute-gate:1.16':
                    'Save-folder execute is a reset start: a competing reset gets the native 409.',
                'lazy-chat-sync:server-save-folder-upload-gate:1.16':
                    'Save-folder upload is a reset start: a competing reset gets the native 409.',
                'lazy-chat-sync:server-save-folder-upload-begin:1.16':
                    'Save-folder upload starts its reset before it reads the upload.',
                'lazy-chat-sync:server-save-folder-upload-end:1.16':
                    'Save-folder upload ends its reset when the route ends, including an aborted upload.',
                'lazy-chat-sync:server-snapshot-restore-gate:1.16':
                    'Snapshot restore is a reset start and takes the import exclusion (409 while another reset runs).',
                'lazy-chat-sync:server-snapshot-restore-runner:1.16':
                    'Snapshot restore runs in the reset runner instead of a plain storage queue slot; its native flush with restoringSnapshotKey stays.',
                'lazy-chat-sync:server-snapshot-restore-end:1.16':
                    'Snapshot restore releases the import exclusion.',
                'lazy-chat-sync:server-backup-import-runner:1.16':
                    'importBackupFromSource runs as one storage reset for every caller.',
                'lazy-chat-sync:server-backup-import-single-transaction:1.16':
                    'Backup import keeps all entries in one transaction (no commit every 5,000 entries) and has the entry failpoint.',
                'lazy-chat-sync:server-backup-import-inlay-swap-after-commit:1.16':
                    'The inlay swap after COMMIT is removed (it runs before COMMIT); the previous directory is removed and the marker written after COMMIT.',
                'lazy-chat-sync:server-save-folder-dir-runner:1.16':
                    'Save-folder execute runs as one storage reset.',
                'lazy-chat-sync:server-save-folder-entries-runner:1.16':
                    'Save-folder upload applies its entries in the reset its route began.',
                'lazy-chat-sync:server-inlay-compress-generation:1.16':
                    'Bulk inlay compression writes no image after a storage reset started, and a reset waits for a write already started.',
                'lazy-chat-sync:server-patch-persist-timer:1.16':
                    'The /api/patch debounce timer is tracked around a reset.',
                'lazy-chat-sync:server-patch-persist-timer-end:1.16':
                    'Closes the tracked /api/patch debounce timer.',
                'lazy-chat-sync:server-chat-persist-timer:1.16':
                    'The chat POST debounce timer is tracked around a reset.',
                'lazy-chat-sync:server-chat-persist-timer-end:1.16':
                    'Closes the tracked chat POST debounce timer.',
                'lazy-chat-sync:server-error-refusal:1.16':
                    'The error handler answers a storage reset refusal with its status and payload.',
                'lazy-chat-sync:server-flush-wait-reset-apply:1.16':
                    'flushPendingDb outside a running reset apply() waits for it while a database save is pending, so a read or export cannot write the database from before the reset over its result. kei-backup-restore-safety-core replaces the flushPendingDb header on 1.10.0 and has no 1.16.1 target; a 1.16.1 port must compose with this unit.',
                'lazy-chat-sync:server-backup-import-stream-refusal:1.16':
                    'The NDJSON backup import error line of a storage reset refusal carries its code, retryable and recoveryPath.',
                'lazy-chat-sync:server-server-restore-stream-refusal:1.16':
                    'The server restore error line of a storage reset refusal (its stream has already started) carries its code, retryable and recoveryPath.',
                'lazy-chat-sync:owned:server:node:storageBarrier-e2-3-test-ts:1.16':
                    'Server tests for post-reset session invalidation, the epoch-aware commit owner and the reset hook surface.',
                'lazy-chat-sync:owned:test:compat:storage-reset-e2-3-test-ts:1.16':
                    'Compat tests for the storage reset barrier, competing resets, rollback and recovery-required mode, and the account import gate order.',
                'lazy-chat-sync:owned:test:compat:storage-reset-b1a-lazy-chat-sync-test-ts:1.16':
                    'Cases of the server-backup-snapshot-core storage-reset-b1a compat test that run with this pack alone, moved verbatim.',
                'lazy-chat-sync:owned:test:compat:session-reset-b2-lazy-chat-sync-test-ts:1.16':
                    'Cases of the server-backup-snapshot-core session-reset-b2 compat test that run with this pack alone, moved verbatim.',
                'lazy-chat-sync:server-revision-helpers:1.16':
                    'Chat revision helpers on the native server: revision match for If-None-Match, the chat POST precondition (428 without a base revision, 409 with currentRevision, 412 for If-None-Match: * on an existing chat; a delta without a base revision keeps the native prefix check alone), and the stripped database invariant check (a body counts in the chat store, inline in the write, or in an archive row of that character).',
                'lazy-chat-sync:server-chat-get-revision:1.16':
                    'A chat GET returns x-chat-revision for the whole chat (also with a delta) and answers 304 to a matching If-None-Match.',
                'lazy-chat-sync:server-chat-get-payload-missing:1.16':
                    'A chat GET for metadata without a body answers 404 CHAT_PAYLOAD_MISSING instead of an empty chat.',
                'lazy-chat-sync:server-chat-post-precondition:1.16':
                    'A chat POST checks the revision precondition before the native delta splice and the journal.',
                'lazy-chat-sync:server-chat-post-revision:1.16':
                    'A saved chat POST answers with its new x-chat-revision and x-chat-save-mode.',
                'lazy-chat-sync:server-write-invariant:1.16':
                    '/api/write refuses with 422 DB_INVARIANT_REJECTED a database that breaks the stripped database invariants (a new chat without a body, an empty or repeated id); the database stays as it was.',
                'lazy-chat-sync:server-patch-invariant:1.16':
                    '/api/patch refuses with 422 a patched database that breaks the stripped database invariants; the cache, the hash baseline and the etag stay as they were.',
                'lazy-chat-sync:node-storage-imports:1.16':
                    'nodeStorage imports the stale view rebase and the save intent type.',
                'lazy-chat-sync:node-storage-errors:1.16':
                    'ChatConflictError, DatabaseInvariantError, the server chat snapshot type and the chat save base and save context types.',
                'lazy-chat-sync:node-storage-patch-result-fields:1.16':
                    'The patch result reports a 422 invariant refusal and the chat it names.',
                'lazy-chat-sync:node-storage-chat-sync-state:1.16':
                    'Chat save contexts (the content a save sends and the base it was derived from, captured together and never replaced by a base found later by chat, with the database replacement generation at capture: a save captured before a whole-database replacement never publishes a rebase into the chat or moves the slot base; once accepted it installs the base it started from as the slot base when the chat holds none; with the chat\'s slot object the caller found in the current database at capture, looked up again by chaId and chatId when the save is settled: while the slot holds another object, or the chat is gone, the save publishes no rebase into the chat, a rebase result is not adopted as the slot base (the base the save started from is installed when the chat holds none), and a result without a rebase is adopted as before; a slot save handed another object than its slot holds is replaced from capture), the bases they come from (a handed-out view\'s own base; the chat\'s slot base, set when fetched content is installed or a plugin write puts content into the slot and moved by a save of that content only while nothing replaced it meanwhile; for a plugin write only the base of the read its read token names, never the slot base; bounded server copies), bounded plugin read tokens (a forgotten token refuses the write instead of becoming a write without a read; a token\'s base advances only after a write saved without a rebase; an open-chat plugin write keeps only the length and a 64-bit hash of the content it wrote, never a copy, and its token advances when the slot\'s next save sends content of the same length and hash), readServerChatSnapshot, confirmCurrentSnapshotOnServer and the full chat POST under the revision protocol (the context\'s base revision; without a known one the server copy and its revision are read and taken as the base; create-only; an update the server has no copy of is a conflict, never a create, unless the context carries the recreate option of a 422 invariant recovery retry; a 422 recovery drops the named chat\'s slot base (forgetChatSaveBase) and keeps no storage-wide recreate state; confirmation after a refusal or a lost answer).',
                'lazy-chat-sync:node-storage-fetch-chat-content:1.16':
                    'A full chat fetch hands out its view with that read\'s base, so the view is saved on the revision it was read at; the read becomes the chat\'s slot base only when none is held (a copy of the view saved as the slot\'s content then has that base; plugin writes do not use it) and never replaces a held one.',
                'lazy-chat-sync:node-storage-fetch-chat-delta-revision:1.16':
                    'The native delta fetch returns the chat revision.',
                'lazy-chat-sync:node-storage-fetch-chat-delta-revision-return:1.16':
                    'The native delta fetch reads x-chat-revision.',
                'lazy-chat-sync:node-storage-save-chat-content:1.16':
                    'The native delta save sends the base revision of its save context (nothing is sent without one) and falls back to the full save with the same context on any 409; the full save sends the context\'s content, rebases it on the server copy from the context\'s own base (chatSaveRebase.ts), publishes the result into the chat being saved only while that may still show it, and saves again, or throws ChatConflictError.',
                'lazy-chat-sync:node-storage-patch-item-invariant:1.16':
                    'A 422 from /api/patch is returned as an invariant refusal, not retried as a full write.',
                'lazy-chat-sync:node-storage-set-item-invariant:1.16':
                    'A 422 from /api/write throws DatabaseInvariantError.',
                'lazy-chat-sync:chat-delta-sync-imports:1.16':
                    'chatDeltaSync imports the save intent and save context types.',
                'lazy-chat-sync:chat-delta-sync-transport:1.16':
                    'The delta transport takes the whole chat, the save intent and the save context, captures save contexts (with the recreate option of a 422 invariant recovery retry), records the revision of a delta load and locates the chat now in its slot for an open chat\'s autosave.',
                'lazy-chat-sync:chat-delta-sync-fetch-adopt:1.16':
                    'A chat assembled from a delta load records its revision as that object\'s own base; it becomes the chat\'s base only when installed.',
                'lazy-chat-sync:chat-delta-sync-save-intent:1.16':
                    'saveChat passes the save intent and the recreate option and captures the save context at the call (or takes the caller\'s); the open chat\'s autosave queues no chat object and resolves \'skipped\' when it sends nothing.',
                'lazy-chat-sync:chat-delta-sync-save-now-intent:1.16':
                    'saveChatNow takes the save intent, the save context and the recreate option, capturing a context with that option when none was taken at the call; for an open chat\'s autosave it first looks the chat up in its slot (object and index) and captures the content, its base, the fingerprints and the delta from that object, or sends nothing and resolves \'skipped\' when the chat is gone or a placeholder.',
                'lazy-chat-sync:chat-delta-sync-save-delta-full-chat:1.16':
                    'A delta save passes the whole chat it was cut from, the save intent and the save context.',
                'lazy-chat-sync:chat-delta-sync-save-full-intent:1.16':
                    'A full save passes the whole chat, the save intent and the same save context as the delta before it.',
                'lazy-chat-sync:chat-storage-imports:1.16':
                    'chatStorage imports the save intent and save context types.',
                'lazy-chat-sync:chat-storage-transport:1.16':
                    'The chat storage transport forwards the save options, save context capture (recording the chat\'s slot object found in the current database by chaId and chatId, with the lookup that finds it again) and the revision of a delta load, and finds the chat in its slot in the current database (null when the character or chat is gone or the slot is a placeholder); the database state module is loaded when the first chat save that captures its own context is requested, not with chatStorage.',
                'lazy-chat-sync:chat-storage-save-intent:1.16':
                    'saveChatToServer takes the save intent and the save options (live autosave, or a context the caller captured, and the recreate option of a 422 invariant recovery retry) and resolves \'skipped\' when a live autosave sent nothing; the database state is loaded before a save captures its own context.',
                'lazy-chat-sync:chat-storage-install-base:1.16':
                    'When hydration installs fetched content into the chat\'s slot, its revision becomes the slot\'s base; a fetch that is not installed changes no base.',
                'lazy-chat-sync:global-api-imports:1.16':
                    'globalApi imports the save errors, the save intent and the chat id repair.',
                'lazy-chat-sync:global-api-save-contract-state:1.16':
                    'The import save hooks, the markChatDirtyImpl hook and ManualSaveConflictError.',
                'lazy-chat-sync:global-api-save-contract-exports:1.16':
                    'trackChatForSave goes through markChatDirtyImpl; requestImportedCharacterSave, requestImportedModuleSave, readServerChatSnapshot and confirmCurrentSnapshotOnServer are exported for dependent packs.',
                'lazy-chat-sync:global-api-confirmed-chat-baseline:1.16':
                    'The confirmed chat baseline of the save intent and the chat id repair, the one-chat recovery slot, and the chat a 422 invariant recovery named waiting for that recovery\'s retry.',
                'lazy-chat-sync:global-api-persist-recreate-permission:1.16':
                    'Each database save attempt takes the chat a 422 invariant recovery named when it starts, so only the recovery\'s retry may create that chat; the permission ends with that attempt whether it saved, skipped or failed the chat.',
                'lazy-chat-sync:global-api-collect-unconfirmed:1.16':
                    'Chat bodies the server has not confirmed are saved with the database metadata even without a tracker entry.',
                'lazy-chat-sync:global-api-invariant-retry:1.16':
                    'A 422 invariant refusal that names a chat this client holds drops that chat\'s slot base, enlists it once and retries body first, the retry alone saving it with permission to create the body when the server has none even when classified as an update; otherwise the save stops with a visible error and keeps the edits queued.',
                'lazy-chat-sync:global-api-chat-save-loop:1.16':
                    'The chat save loop repairs chat ids of new characters, saves each chat with its save intent as the live chat of its slot (a chat skipped at its turn is not counted as posted; the chat a 422 invariant recovery named is saved with the recreate option in that recovery\'s retry) and stops before the metadata after a failed body (ManualSaveConflictError for a revision conflict).',
                'lazy-chat-sync:global-api-patch-invariant:1.16':
                    'A patch invariant refusal goes to the invariant retry.',
                'lazy-chat-sync:global-api-full-write-invariant:1.16':
                    'A full write invariant refusal goes to the invariant retry.',
                'lazy-chat-sync:global-api-database-replaced-generation:1.16':
                    'Right after the native 409 rebase replaces the whole database (setDatabase(mergedDb), nothing awaited between), the chat storage database replacement generation is incremented.',
                'lazy-chat-sync:global-api-confirmed-after-save:1.16':
                    'The chats a save posted are confirmed with its metadata and leave the recovery slot.',
                'lazy-chat-sync:global-api-imported-save:1.16':
                    'Imported characters (with every chat body) and modules reach the server before the import reports success.',
                'lazy-chat-sync:plugin-api-import:1.16':
                    'Plugin API v3 imports trackCharacterForSave and the stale view rebase helpers and names the read token field.',
                'lazy-chat-sync:plugin-api-chat-read-token:1.16':
                    'getChatFromIndex hands out every chat with a read token for that single read (the full read\'s own base for an unopened chat, the slot base for a loaded one), carried as a field of the handed-out object, since the chat crosses to the plugin as a clone without a base of its own.',
                'lazy-chat-sync:plugin-api-set-chat-take-token:1.16':
                    'setChatToIndex removes the read token field before anything else, so it is never normalized, put into the slot or saved.',
                'lazy-chat-sync:plugin-api-unopened-chat-character:1.16':
                    'A plugin write saves on the base of the read its token names, never the slot\'s base; without a token, or with one for another chat, the server copy is read first (d13), and a token the host no longer knows refuses the write before the slot changes. On the open chat the plugin content is installed with that base as a new slot base entry, even at the same revision, so its autosave rebases from it and a save already running never moves it; when the autosave saves that content as written without a rebase, the token advances to its result (a token base without its server copy must be the slot\'s own base, otherwise the write is refused first). A write to a chat that is not open also saves its character entry, so its name, folder and modules survive the next database save (d14); its save context is captured before the save is queued, with the slot object holding the written content, and becomes the slot\'s base; the slot, found again in the current database by chaId and chatId, takes a result without a rebase as its base whether or not it still holds that object; a merge with another device\'s change is published together with edits made meanwhile and becomes the slot\'s base only while the slot still holds that object, otherwise the slot keeps its base (or gets the base the save started from when it holds none). A write saved without a rebase advances its token\'s base to its result.',
                'lazy-chat-sync:native-test-duplicate-ids-seed-db:1.16':
                    'Native duplicateIds test setup: the first seedDb writes the database already on disk to the store before the server starts (the invariant refuses repeated ids through /api/write); later calls stay /api/write. No assertion changes.',
                'lazy-chat-sync:native-test-archive-batch-seed-db:1.16':
                    'Native archiveBatch test setup: the first seedDb writes the database already on disk to the store before the server starts (the invariant refuses a new chat without a body through /api/write); later calls stay /api/write. No assertion changes.',
                'lazy-chat-sync:native-test-archive-restore-seed-db:1.16':
                    'Native archiveRestore test setup: the first seedDb writes the database already on disk to the store before the server starts and loads it into the server cache, as the native first write left it; later calls are the client writes under test and stay /api/write. No assertion changes.',
                'lazy-chat-sync:native-test-archive-restore-revision-helper:1.16':
                    'Native archiveRestore test helper that reads a chat revision right before an overwrite.',
                'lazy-chat-sync:native-test-archive-restore-persist-post:1.16':
                    'Native archiveRestore test setup: the chat POST sends the revision it read first. No assertion changes.',
                'lazy-chat-sync:native-test-archive-restore-restart-post:1.16':
                    'Native archiveRestore test setup: the chat POST sends the revision it read first. No assertion changes.',
                'lazy-chat-sync:native-test-archive-restore-activate-edit-back:1.16':
                    'Native archiveRestore test setup: the chat POST sends the revision it read first. No assertion changes.',
                'lazy-chat-sync:native-test-archive-restore-activate-edit-other:1.16':
                    'Native archiveRestore test setup: the chat POST sends the revision it read first. No assertion changes.',
                'lazy-chat-sync:native-test-chat-delta-sync-get-revision:1.16':
                    'Native chat-delta-sync test helper also returns the chat revision.',
                'lazy-chat-sync:native-test-chat-delta-sync-full-post:1.16':
                    'Native chat-delta-sync test setup: the full save sends the revision it read first. No assertion changes.',
                'lazy-chat-sync:native-test-chat-store-cold-load-get-revision:1.16':
                    'Native chat-store-cold-load test helper also returns the chat revision.',
                'lazy-chat-sync:native-test-chat-store-cold-load-post-headers:1.16':
                    'Native chat-store-cold-load test helper takes the revision headers of the POST.',
                'lazy-chat-sync:native-test-chat-store-cold-load-save-revision:1.16':
                    'Native chat-store-cold-load test setup: an overwrite sends the revision it read first. No assertion changes.',
                'lazy-chat-sync:native-test-chat-store-cold-load-create-only:1.16':
                    'Native chat-store-cold-load test setup: a new chat is created with If-None-Match: *. No assertion changes.',
                'lazy-chat-sync:native-test-character-archive-chat-post:1.16':
                    'Native character-archive test setup: the chat POST sends the revision its GET returned. No assertion changes.',
                'lazy-chat-sync:owned:test:compat:chat-contract-e2-3-test-ts:1.16':
                    'Compat tests for the chat revision protocol, the payload-missing answer and the stripped database invariants on the native server.',
                'lazy-chat-sync:owned:src:ts:storage:chatRevision-e2-3-test-ts:1.16':
                    'Client tests for the stale view rebase, chat id repair, save intent, recovery slot, revision headers on both native transports, plugin writes and the save exports other packs use.',
                'lazy-chat-sync:owned:src:ts:storage:saveRecovery-e2-3-test-ts:1.16':
                    'Client test for the 422 invariant recovery: a known chat whose body is missing on the server is stored again from the client copy and the database save succeeds.',
                'lazy-chat-sync:owned:src:ts:storage:chatSaveFollowup-e2-3-test-ts:1.16':
                    'Client tests for the chat save follow-ups: the open chat autosave captured from its slot at its turn and the database replacement generation (E2-3d2), the hash of plugin-written chat content (E2-3d3) and chat recreation scoped to the invariant recovery retry (E2-3d4).',
                'lazy-chat-sync:owned:src:ts:storage:chatSlotIdentity-e2-3-test-ts:1.16':
                    'Client tests for chat save results refused once the chat\'s slot holds another chat object (E2-3d5): trigger write-back, plugin character and database writes, a removed character, job recovery and a plugin write to a chat that is not open, with the same object reassigned, reordered chats and results without a rebase kept conflict-free.',
            },
            retired: {
                'lazy-chat-sync:replace:server:node:server-cjs:1.10':
                    'Whole-file replacement. The durable chat writes (E2-3b), the storage reset barrier with the storage epoch (E2-3c), and the chat revision protocol with the stripped database invariants (E2-3d) return as the lazy-chat-sync:server-*:1.16 units.',
                'lazy-chat-sync:replace:src:ts:bootstrap-ts:1.10':
                    'Whole-file replacement. The startup database cache and the plugin load order return with E2-3e.',
                'lazy-chat-sync:replace:src:ts:globalApi-svelte-ts:1.10':
                    'Whole-file replacement. Save intent classification, chat id repair, payload-first saves with the recovery slot and the save exports other packs use return as the lazy-chat-sync:global-api-*:1.16 units (E2-3d).',
                'lazy-chat-sync:replace:src:ts:plugins:apiV3:v3-svelte-ts:1.10':
                    'Whole-file replacement. PocketRisu 1.16.1 plugin API v3 is used; the character tracking of unopened chat writes returns as the lazy-chat-sync:plugin-api-*:1.16 units (E2-3d), other plugin guarantees are decided in E2-7.',
                'lazy-chat-sync:replace:src:ts:storage:autoStorage-ts:1.10':
                    'Whole-file replacement. The writer session and startup cache paths return with E2-3e.',
                'lazy-chat-sync:replace:src:ts:storage:chatStorage-ts:1.10':
                    'Whole-file replacement. PocketRisu 1.16.1 lazy hydration is used; the revision-aware chat save returns as the lazy-chat-sync:chat-storage-*:1.16 and chat-delta-sync-*:1.16 units (E2-3d).',
                'lazy-chat-sync:replace:src:ts:storage:nodeStorage-ts:1.10':
                    'Whole-file replacement. The revision headers on the native chat transports return as the lazy-chat-sync:node-storage-*:1.16 units (E2-3d), the startup database cache with E2-3e.',
                'lazy-chat-sync:replace:src:ts:storage:risuSave-ts:1.10':
                    'Whole-file replacement. PocketRisu 1.16.1 patch baseline and hash mismatch handling are used (E2-3a decision).',
                'lazy-chat-sync:replace:src:ts:storage:risuSavePatcher-test-ts:1.10':
                    'Replaces the native test of the 1.10.0 patcher; PocketRisu 1.16.1 keeps its own risuSavePatcher test (E2-3a decision).',
                'lazy-chat-sync:replace:src:ts:storage:chatStorage-test-ts':
                    'Replaces the native chatStorage test, which PocketRisu 1.16.1 keeps; the client chat save is covered by chatRevision.e2-3.test.ts (E2-3d).',
                'lazy-chat-sync:owned:src:ts:plugins:apiV3:pluginChatAccess-test-ts':
                    'Test of the plugin chat access rewrite; plugin guarantees are decided in E2-7.',
                'lazy-chat-sync:owned:src:ts:plugins:apiV3:pluginChatAccess-ts':
                    'Plugin chat access rewrite; PocketRisu 1.16.1 plugin API v3 is used, missing guarantees are decided in E2-7.',
                'lazy-chat-sync:owned:src:ts:storage:chatSaveView-svelte-test-ts':
                    'Pins the 1.10.0 chatStorage publication callback (saveChatContent with canPublish), which the 1.16.1 units do not have: the rebase is published inside nodeStorage.saveChatContent. chatRevision.e2-3.test.ts (d6, d10, d13) covers the stale view rebase.',
                'lazy-chat-sync:owned:src:ts:storage:chatSaveIntent-test-ts':
                    'Pins the 1.10.0 classification of a baseline without a characters key as update; E2-3d classifies that fresh-install baseline ({}) as create (d8, d11). chatRevision.e2-3.test.ts covers the classifier.',
                'lazy-chat-sync:owned:src:ts:storage:nodeStorage-chatDelta-test-ts':
                    'Client delta save test of the 1.10.0 whole-file transport; the revision headers on the native delta are covered by chatRevision.e2-3.test.ts (d10, d13) and chat-contract.e2-3.test.ts (d10b).',
                'lazy-chat-sync:owned:src:ts:storage:startupDatabaseCache-test-ts':
                    'Startup database cache; returns with E2-3e.',
                'lazy-chat-sync:owned:src:ts:storage:startupDatabaseCache-ts':
                    'Startup database cache; returns with E2-3e.',
                'lazy-chat-sync:owned:server:node:sessionLockReset-phaseB-test-ts:1.10':
                    'Pins the 1.10.0 watermark meaning (an unknown boot is stale, the next write adopts the free lock without the passive state). E2-3c keeps the native fresh, passive and tookOver rules after invalidateBefore; storageBarrier.e2-3.test.ts (c5) covers it.',
                'lazy-chat-sync:owned:src:ts:bootstrap-freshDatabase-test-ts:1.10':
                    'Tests the 1.10.0 whole-file bootstrap; the fresh database first save is covered by chatRevision.e2-3.test.ts (d8 and d11).',
                'lazy-chat-sync:owned:src:ts:storage:globalApi-savePersistence-test-ts:1.10':
                    'Tests the 1.10.0 whole-file globalApi; the payload-first chat save and its recovery slot are covered by chatRevision.e2-3.test.ts (d9).',
                'lazy-chat-sync:owned:src:ts:storage:nodeStorage-sessionHeaders-phaseB-test-ts:1.10':
                    'Writer session header helper; returns with E2-3e.',
                'lazy-chat-sync:owned:src:ts:storage:writerSession-ts:1.10':
                    'Writer session header helper; returns with E2-3e.',
                'lazy-chat-sync:plugin-api-chat-metadata-types':
                    'Type of the getDatabaseMetadata plugin API of the plugin chat access rewrite; decided in E2-7.',
                'lazy-chat-sync:session-lock:watermark:1.10':
                    'Part of the 1.10.0 watermark invalidation. E2-3c rewrites invalidateBefore over the PocketRisu 1.16.1 revokeAll meaning (lazy-chat-sync:session-lock:invalidate-before:1.10), which needs no change to register, checkWrite or peek.',
                'lazy-chat-sync:session-lock:register:1.10':
                    'Part of the 1.10.0 watermark invalidation. E2-3c rewrites invalidateBefore over the PocketRisu 1.16.1 revokeAll meaning (lazy-chat-sync:session-lock:invalidate-before:1.10), which needs no change to register, checkWrite or peek.',
                'lazy-chat-sync:session-lock:check-write:1.10':
                    'Part of the 1.10.0 watermark invalidation. E2-3c rewrites invalidateBefore over the PocketRisu 1.16.1 revokeAll meaning (lazy-chat-sync:session-lock:invalidate-before:1.10), which needs no change to register, checkWrite or peek.',
                'lazy-chat-sync:session-lock:peek:1.10':
                    'Part of the 1.10.0 watermark invalidation. E2-3c rewrites invalidateBefore over the PocketRisu 1.16.1 revokeAll meaning (lazy-chat-sync:session-lock:invalidate-before:1.10), which needs no change to register, checkWrite or peek.',
            },
        },
    },
    'server-backup-snapshot-core': {
        '1.16.1': {
            from: '1.10.0',
            retained: [
                'server-backup-snapshot-core:owned:server:node:backupSnapshot-cjs:1.9',
                'server-backup-snapshot-core:owned:server:node:backupSnapshot-test-ts:1.9',
                'server-backup-snapshot-core:owned:server:node:backupSource-cjs:1.9',
                'server-backup-snapshot-core:owned:server:node:backupSource-test-ts:1.9',
                'server-backup-snapshot-core:db-helper-import:1.9',
                'server-backup-snapshot-core:db-open-snapshot:1.9',
                'server-backup-snapshot-core:db-export-snapshot:1.9',
            ],
            rewritten: {
                'server-backup-snapshot-core:owned:server:node:backupSnapshot-cjs:1.9':
                    'Prefix listings follow the PocketRisu 1.16.1 db.cjs rule (case-sensitive key range for a printable-ASCII last character, escaped LIKE otherwise), so the pinned reader returns the same keys as the live kvList and kvListWithSizes.',
                'server-backup-snapshot-core:owned:server:node:backupSnapshot-test-ts:1.9':
                    'Server tests for the native prefix rule and for a pinned view kept through snapshot rotation and plugin-blob cleanup.',
            },
            replaced: {},
            added: {},
            retired: {
                'server-backup-snapshot-core:owned:test:compat:backup-point-in-time-test-ts:1.9':
                    'Integration test that needs packs outside the core closure (the lazy adapter pinned backup endpoints); returns with its owner pack rebase.',
                'server-backup-snapshot-core:owned:test:compat:storage-reset-b1a-test-ts:1.9':
                    'Integration test that needs packs outside the core closure (lazy-chat-sync storage reset, BG cleanup); the cases that run with lazy-chat-sync alone are lazy-chat-sync test units since E2-3c, the rest returns with its owner pack rebase.',
                'server-backup-snapshot-core:owned:test:compat:session-reset-b2-test-ts:1.9':
                    'Integration test that needs packs outside the core closure (lazy-chat-sync storage reset, BG session cleanup); the cases that run with lazy-chat-sync alone are lazy-chat-sync test units since E2-3c, the rest returns with its owner pack rebase.',
                'server-backup-snapshot-core:owned:test:compat:reset-orphans-b3-test-ts:1.9':
                    'Integration test that needs packs outside the core closure (lazy-chat-sync storage reset, BG result cleanup); returns with its owner pack rebase.',
            },
        },
    },
}
