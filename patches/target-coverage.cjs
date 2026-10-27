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
            ],
            rewritten: {
                'lazy-chat-sync:owned:server:node:chatWriteJournal-cjs':
                    'PocketRisu 1.16.1 writes the database outside the storage queue, so a chat POST can land between the read and the write of a persist. clearAfterDatabasePersist takes the payloads the persist read and keeps a record whose chat changed since; replayInto replays the loaded records synchronously for the native store rebuilds; markListedRecords ends the wait for an entry once the live database lists the chat.',
                'lazy-chat-sync:owned:server:node:storageResetTestHooks-cjs:1.10':
                    'Holds only the db-persist gate (POCKETRISU_TEST_STORAGE_PERSIST_GATE_DIR) that the durable chat writes use; the reset gates, failpoints, trace, spool and metrics hooks return with the E2-3c storage reset barrier.',
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
                    'Backup import, server restore and account apply drop the journal rows in the transaction that commits the new database.',
                'lazy-chat-sync:server-backup-import-journal-memory:1.16':
                    'Backup import, server restore and account apply clear the journal memory after COMMIT.',
                'lazy-chat-sync:server-save-folder-dir-journal:1.16':
                    'Save-folder execute drops the journal rows in its import transaction.',
                'lazy-chat-sync:server-save-folder-dir-journal-memory:1.16':
                    'Save-folder execute clears the journal memory after COMMIT.',
                'lazy-chat-sync:server-save-folder-entries-journal:1.16':
                    'Save-folder upload drops the journal rows in its import transaction.',
                'lazy-chat-sync:server-save-folder-entries-journal-memory:1.16':
                    'Save-folder upload clears the journal memory after COMMIT.',
                'lazy-chat-sync:server-snapshot-restore-journal:1.16':
                    'Snapshot restore commits the database, plugin rows and journal deletion together (commitSnapshotRestore), then clears the journal memory.',
                'lazy-chat-sync:server-database-remove-journal:1.16':
                    'Removing database.bin drops the journal rows in the same transaction, then clears the journal memory.',
                'lazy-chat-sync:server-cold-storage-fallback-fm-index:1.16':
                    'The chat the server creates for a cold-storage character it cannot restore carries fmIndex.',
                'lazy-chat-sync:owned:server:node:chatDurability-e2-3-test-ts:1.16':
                    'Server tests for the journal replay, the persist interleaving rule, the snapshot transaction order and the fallback chat fmIndex.',
                'lazy-chat-sync:owned:test:compat:restartableServer-e2-3-helper-ts:1.16':
                    'Compat helper that restarts a server process on the same save folder.',
                'lazy-chat-sync:owned:test:compat:restart-durability-e2-3-test-ts:1.16':
                    'Compat tests for a chat acknowledged before a kill, the native reset paths across a restart and the archive state across a restart.',
            },
            retired: {
                'lazy-chat-sync:replace:server:node:server-cjs:1.10':
                    'Whole-file replacement. The durable chat writes return as the lazy-chat-sync:server-*:1.16 units; the storage reset barrier and storage epoch return with E2-3c, the chat revision protocol and the stripped database invariants with E2-3d.',
                'lazy-chat-sync:replace:src:ts:bootstrap-ts:1.10':
                    'Whole-file replacement. The startup database cache and the plugin load order return with E2-3e.',
                'lazy-chat-sync:replace:src:ts:globalApi-svelte-ts:1.10':
                    'Whole-file replacement. Save intent classification, chat id repair, stale view rebase and the save exports other packs use return with E2-3d.',
                'lazy-chat-sync:replace:src:ts:plugins:apiV3:v3-svelte-ts:1.10':
                    'Whole-file replacement. PocketRisu 1.16.1 plugin API v3 is used; the character tracking of unopened chat writes returns with E2-3d, other plugin guarantees are decided in E2-7.',
                'lazy-chat-sync:replace:src:ts:storage:autoStorage-ts:1.10':
                    'Whole-file replacement. The writer session and startup cache paths return with E2-3e.',
                'lazy-chat-sync:replace:src:ts:storage:chatStorage-ts:1.10':
                    'Whole-file replacement. PocketRisu 1.16.1 lazy hydration is used; the revision-aware chat save returns with E2-3d.',
                'lazy-chat-sync:replace:src:ts:storage:nodeStorage-ts:1.10':
                    'Whole-file replacement. The revision headers on the native chat transports return with E2-3d, the startup database cache with E2-3e.',
                'lazy-chat-sync:replace:src:ts:storage:risuSave-ts:1.10':
                    'Whole-file replacement. PocketRisu 1.16.1 patch baseline and hash mismatch handling are used (E2-3a decision).',
                'lazy-chat-sync:replace:src:ts:storage:risuSavePatcher-test-ts:1.10':
                    'Replaces the native test of the 1.10.0 patcher; PocketRisu 1.16.1 keeps its own risuSavePatcher test (E2-3a decision).',
                'lazy-chat-sync:replace:src:ts:storage:chatStorage-test-ts':
                    'Replaces the native chatStorage test; returns with the client chat save of E2-3d.',
                'lazy-chat-sync:owned:server:node:chatDelta-cjs':
                    'Chat revision and stripped database invariant module; returns with E2-3d.',
                'lazy-chat-sync:owned:server:node:chatDelta-test-ts':
                    'Test of chatDelta.cjs; returns with E2-3d.',
                'lazy-chat-sync:owned:server:node:chatWriteJournal-test-ts':
                    'Imports chatDelta.cjs; returns with E2-3d. chatDurability.e2-3.test.ts covers the journal meanwhile.',
                'lazy-chat-sync:owned:src:ts:plugins:apiV3:pluginChatAccess-test-ts':
                    'Test of the plugin chat access rewrite; plugin guarantees are decided in E2-7.',
                'lazy-chat-sync:owned:src:ts:plugins:apiV3:pluginChatAccess-ts':
                    'Plugin chat access rewrite; PocketRisu 1.16.1 plugin API v3 is used, missing guarantees are decided in E2-7.',
                'lazy-chat-sync:owned:src:ts:storage:conflictRebase-test-ts':
                    'Stale view rebase; returns with E2-3d.',
                'lazy-chat-sync:owned:src:ts:storage:conflictRebase-ts':
                    'Stale view rebase; returns with E2-3d.',
                'lazy-chat-sync:owned:src:ts:storage:chatSaveRebase-ts':
                    'Stale view rebase; returns with E2-3d.',
                'lazy-chat-sync:owned:src:ts:storage:chatSaveRebase-test-ts':
                    'Stale view rebase; returns with E2-3d.',
                'lazy-chat-sync:owned:src:ts:storage:chatSaveView-svelte-test-ts':
                    'Client chat save test; returns with E2-3d.',
                'lazy-chat-sync:owned:src:ts:storage:nodeStorage-chatRebaseCodec-test-ts':
                    'Client chat save test; returns with E2-3d.',
                'lazy-chat-sync:owned:src:ts:storage:chatIdentityRepair-test-ts':
                    'Chat id repair; returns with E2-3d.',
                'lazy-chat-sync:owned:src:ts:storage:chatIdentityRepair-ts':
                    'Chat id repair; returns with E2-3d.',
                'lazy-chat-sync:owned:src:ts:storage:chatSaveIntent-test-ts':
                    'Create and update save classification; returns with E2-3d.',
                'lazy-chat-sync:owned:src:ts:storage:chatSaveIntent-ts':
                    'Create and update save classification; returns with E2-3d.',
                'lazy-chat-sync:owned:src:ts:storage:nodeStorage-chatDelta-test-ts':
                    'Client delta save test of the 1.10.0 transport; the revision headers on the native delta return with E2-3d.',
                'lazy-chat-sync:owned:src:ts:storage:startupDatabaseCache-test-ts':
                    'Startup database cache; returns with E2-3e.',
                'lazy-chat-sync:owned:src:ts:storage:startupDatabaseCache-ts':
                    'Startup database cache; returns with E2-3e.',
                'lazy-chat-sync:owned:server:node:sessionLockReset-phaseB-test-ts:1.10':
                    'Post-reset session invalidation; returns with E2-3c.',
                'lazy-chat-sync:owned:src:ts:bootstrap-freshDatabase-test-ts:1.10':
                    'Fresh database first save; returns with E2-3d.',
                'lazy-chat-sync:owned:src:ts:storage:globalApi-savePersistence-test-ts:1.10':
                    'Payload-first chat save persistence; returns with E2-3d.',
                'lazy-chat-sync:owned:src:ts:storage:nodeStorage-sessionHeaders-phaseB-test-ts:1.10':
                    'Writer session header helper; returns with E2-3e.',
                'lazy-chat-sync:owned:src:ts:storage:writerSession-ts:1.10':
                    'Writer session header helper; returns with E2-3e.',
                'lazy-chat-sync:chat-missing-payload-notice':
                    'Payload-missing notice; returns with the same id in E2-3d.',
                'lazy-chat-sync:plugin-api-chat-metadata-types':
                    'Type of the getDatabaseMetadata plugin API of the plugin chat access rewrite; decided in E2-7.',
                'lazy-chat-sync:session-lock:watermark:1.10':
                    'Post-reset session invalidation; rewritten over the PocketRisu 1.16.1 session lock in E2-3c.',
                'lazy-chat-sync:session-lock:register:1.10':
                    'Post-reset session invalidation; rewritten over the PocketRisu 1.16.1 session lock in E2-3c.',
                'lazy-chat-sync:session-lock:check-write:1.10':
                    'Post-reset session invalidation; rewritten over the PocketRisu 1.16.1 session lock in E2-3c.',
                'lazy-chat-sync:session-lock:peek:1.10':
                    'Post-reset session invalidation; rewritten over the PocketRisu 1.16.1 session lock in E2-3c.',
                'lazy-chat-sync:session-lock:invalidate-before:1.10':
                    'Post-reset session invalidation; rewritten over the PocketRisu 1.16.1 session lock in E2-3c.',
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
                    'Integration test that needs packs outside the core closure (lazy-chat-sync storage reset, BG cleanup); returns with its owner pack rebase.',
                'server-backup-snapshot-core:owned:test:compat:session-reset-b2-test-ts:1.9':
                    'Integration test that needs packs outside the core closure (lazy-chat-sync storage reset, BG session cleanup); returns with its owner pack rebase.',
                'server-backup-snapshot-core:owned:test:compat:reset-orphans-b3-test-ts:1.9':
                    'Integration test that needs packs outside the core closure (lazy-chat-sync storage reset, BG result cleanup); returns with its owner pack rebase.',
            },
        },
    },
}
