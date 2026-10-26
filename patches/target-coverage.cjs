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
}
