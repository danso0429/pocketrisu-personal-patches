'use strict'

const fs = require('node:fs')
const path = require('node:path')

// Anchors are the PocketRisu 1.16.1 server text that this adapter replaces.
// The four long sections are native 1.16.1 text, unchanged by lazy-chat-sync.
const anchors116Root = path.join(__dirname, 'anchors-1.16', 'server', 'node')
const coreFilesRoot = path.join(__dirname, 'files')

function readAnchor(name) {
    return fs.readFileSync(path.join(anchors116Root, name + '.txt'), 'utf8')
}

function readFragment(relative, marker) {
    return fs.readFileSync(path.join(__dirname, 'fragments', relative), 'utf8')
        .replaceAll('__MARKER__', marker)
}

function createServerBackupSnapshotAdapterManifest({ id, title }) {
    const prefix = id + ':'
    const marker = (name) => 'POCKETRISU-PATCH:server-backup-snapshot:lazy:' + name
    const files116Root = path.join(__dirname, '..', id, 'files-1.16')
    // Computed after: every server.cjs unit of the 1.16.1 packs that can be
    // installed with this adapter, except units that already follow it. The
    // compression unit is anchored on the lazy-chat-sync compress generation
    // unit's text, which exists only after that unit, so the adapter must
    // follow every unit it could otherwise be paired against on pristine
    // text. The runtime needs from lazy-chat-sync are the storage barrier
    // state and queue, the reset-aware flush, the checkActiveSession
    // admission, the compress generation unit and the journal load.
    const serverAfter = [
        'client-build-fence:server-session-advertise:1.9',
        'kei-backup-restore-safety-lazy-adapter:snapshot-restore-error-code:1.9',
        'kei-backup-restore-safety-lazy-adapter:server-restore-error-code:1.9',
        'bg-preserve:hook:server-cjs-stream-reader-import',
        'bg-preserve:hook:server-cjs-mark-user-stream-cancel',
        'bg-preserve:hook:server-cjs-register-routes:1.9',
        ...['client-build-fence', 'lazy-chat-sync', 'persona-organizer', 'personal-settings']
            .flatMap((name) => require(`../${name}/manifest.cjs`).units)
            .filter((unit) => unit.file === 'server/node/server.cjs')
            .filter((unit) => !(unit.after ?? []).some((unitId) => unitId.startsWith(prefix)))
            .map((unit) => unit.id),
    ].filter((unitId, index, all) => all.indexOf(unitId) === index)
    const helperFragment = fs.readFileSync(
        path.join(__dirname, 'fragments', 'server-helpers.cjs.txt'),
        'utf8',
    )

    const serverUnits = [
        {
            id: prefix + 'server-db-reader:1.9',
            file: 'server/node/server.cjs',
            type: 'replace',
            anchor: `const { kvGet, kvSet, kvDel, kvList,
        kvDelPrefix, kvListWithSizes, kvSize, kvGetUpdatedAt, kvCopyValue, clearEntities, checkpointWal,
        gcChunks, reclaimableChunkBytes, isDbBlobChunked, snapshotFootprint, db: sqliteDb } = require('./db.cjs');
`,
            managed: `/* ${marker('server-db-reader')} */
const { kvGet, kvSet, kvDel, kvList,
        kvDelPrefix, kvListWithSizes, kvSize, kvGetUpdatedAt, kvCopyValue, clearEntities, checkpointWal,
        gcChunks, reclaimableChunkBytes, isDbBlobChunked, snapshotFootprint, createKvSnapshot, db: sqliteDb } = require('./db.cjs');
`,
            markerNeedle: marker('server-db-reader'),
        },
        {
            id: prefix + 'server-helper-import:1.9',
            file: 'server/node/server.cjs',
            type: 'replace',
            anchor: `const { applyPatch } = require('fast-json-patch');
`,
            managed: `const { applyPatch } = require('fast-json-patch');
/* ${marker('server-helper-import')} */
const {
    BackupSourceError,
    createBackupSourceManager,
} = require('./backupSource.cjs');
`,
            markerNeedle: marker('server-helper-import'),
            requires: [prefix + 'server-db-reader:1.9'],
        },
        {
            id: prefix + 'server-source-lifecycle:1.9',
            file: 'server/node/server.cjs',
            type: 'insert',
            where: 'after',
            anchor: 'let importInProgress = false;\n',
            content: `
/* ${marker('server-source-lifecycle')}:START */
${helperFragment}/* ${marker('server-source-lifecycle')}:END */
`,
            markerNeedle: marker('server-source-lifecycle') + ':START',
            requires: [prefix + 'server-helper-import:1.9'],
        },
        {
            id: prefix + 'cold-storage-reader:1.9',
            file: 'server/node/server.cjs',
            type: 'replace',
            anchor: readAnchor('cold-storage-reader'),
            managed: readFragment('cold-storage.cjs.txt', marker('cold-storage-reader')),
            markerNeedle: marker('cold-storage-reader') + ':START',
            requires: [prefix + 'server-source-lifecycle:1.9'],
        },
        {
            id: prefix + 'settings-and-download-export:1.9',
            file: 'server/node/server.cjs',
            type: 'replace',
            anchor: readAnchor('settings-and-download-export'),
            managed: readFragment(
                'settings-export.cjs.txt',
                marker('settings-and-download-export'),
            ),
            markerNeedle: marker('settings-and-download-export') + ':START',
            requires: [prefix + 'cold-storage-reader:1.9'],
        },
        {
            id: prefix + 'server-save-export:1.9',
            file: 'server/node/server.cjs',
            type: 'replace',
            anchor: readAnchor('server-save-export'),
            managed: readFragment('server-save.cjs.txt', marker('server-save-export')),
            markerNeedle: marker('server-save-export') + ':START',
            requires: [prefix + 'settings-and-download-export:1.9'],
        },
        {
            id: prefix + 'compression-storage-queue:1.9',
            file: 'server/node/server.cjs',
            type: 'replace',
            // The write that lazy-chat-sync's compress generation unit wraps.
            anchor: `                    await trackInlayMutation((async () => {
                        await writeInlayFile(entry.id, 'webp', webpBuf, { ...info, ext: 'webp' });
                        // invalidate thumbnail cache
                        kvDel(\`inlay_thumb/\${entry.id}\`);
                    })());
`,
            managed: `                    /* ${marker('compression-storage-queue')}:START */
                    // The write and the thumbnail invalidation run in the
                    // storage queue, so a backup capture sees the inlay file
                    // and its sidecar either before or after them. The
                    // admission is checked again once the queue slot is held;
                    // only the write itself counts as an in-flight inlay
                    // mutation that a storage reset waits for.
                    await queueStorageOperation(() => {
                        const queuedRefusal = admission ? staleStorageAdmissionPayload(admission) : null;
                        if (queuedRefusal) throw new StorageResetRefusal(queuedRefusal);
                        return trackInlayMutation((async () => {
                            await writeInlayFile(entry.id, 'webp', webpBuf, { ...info, ext: 'webp' });
                            // invalidate thumbnail cache
                            kvDel(\`inlay_thumb/\${entry.id}\`);
                        })());
                    });
                    /* ${marker('compression-storage-queue')}:END */
`,
            markerNeedle: marker('compression-storage-queue') + ':START',
            requires: [prefix + 'server-save-export:1.9'],
        },
        {
            id: prefix + 'maintenance-gate:1.10',
            file: 'server/node/server.cjs',
            type: 'replace',
            anchor: readAnchor('maintenance-gate'),
            managed: readFragment('maintenance-gate-1.10.cjs.txt', marker('maintenance-gate-1.10')),
            markerNeedle: marker('maintenance-gate-1.10') + ':START',
            requires: [prefix + 'compression-storage-queue:1.9'],
        },
        {
            id: prefix + 'startup-pin-sweep:1.10',
            file: 'server/node/server.cjs',
            type: 'replace',
            // Before the two native startup migrations; lazy-chat-sync's
            // journal load is inserted right after `try {`, ahead of it.
            anchor: `        await migrateInlaysToFilesystem();
`,
            managed: `        /* ${marker('startup-pin-sweep-1.10')} */
        await backupSourceManager.sweep();
        await migrateInlaysToFilesystem();
`,
            markerNeedle: marker('startup-pin-sweep-1.10'),
            requires: [prefix + 'maintenance-gate:1.10'],
        },
    ].map((unit) => ({ ...unit, after: [...serverAfter] }))

    const testUnits = [
        {
            id: prefix + 'owned:test:compat:backup-point-in-time-test-ts:1.16',
            file: 'test/compat/backup-point-in-time.test.ts',
            type: 'owned',
            content: fs.readFileSync(
                path.join(coreFilesRoot, 'test', 'compat', 'backup-point-in-time.test.ts'),
                'utf8',
            ),
            requires: [prefix + 'startup-pin-sweep:1.10'],
        },
        {
            id: prefix + 'owned:test:compat:server-backup-snapshot-lazy-adapter-e2-6b-test-ts:1.16',
            file: 'test/compat/server-backup-snapshot-lazy-adapter.e2-6b.test.ts',
            type: 'owned',
            content: fs.readFileSync(
                path.join(files116Root, 'test', 'compat', 'server-backup-snapshot-lazy-adapter.e2-6b.test.ts'),
                'utf8',
            ),
            requires: [prefix + 'startup-pin-sweep:1.10'],
        },
    ]

    return {
        id,
        title,
        version: '0.2.3',
        userSelectable: false,
        targets: {
            pocketrisu: {
                verified: [],
                reviewing: ['1.16.1'],
            },
        },
        requires: ['server-backup-snapshot-core', 'lazy-chat-sync'],
        autoWhen: { all: ['server-backup-snapshot-core', 'lazy-chat-sync'] },
        units: [...serverUnits, ...testUnits],
    }
}

module.exports = { createServerBackupSnapshotAdapterManifest }
