'use strict'

const fs = require('node:fs')
const path = require('node:path')

const pocketRisu190 = { pocketrisu: ['1.9.0'] }
const canonicalServer = fs.readFileSync(
    path.join(__dirname, '..', 'lazy-chat-sync', 'files-1.9', 'server', 'node', 'server.cjs'),
    'utf8',
)

function canonicalSection(start, end) {
    const startIndex = canonicalServer.indexOf(start)
    const endIndex = canonicalServer.indexOf(end, startIndex)
    if (startIndex < 0 || endIndex < 0) {
        throw new Error('Could not locate canonical P2 server section: ' + start)
    }
    return canonicalServer.slice(startIndex, endIndex)
}

function readFragment(relative, marker) {
    return fs.readFileSync(path.join(__dirname, 'fragments', relative), 'utf8')
        .replaceAll('__MARKER__', marker)
}

function appendAfter(unit, ids) {
    return ids.length === 0
        ? unit
        : { ...unit, after: [...(unit.after ?? []), ...ids] }
}

function createServerBackupSnapshotAdapterManifest({ id, title, lazyChat }) {
    const prefix = id + ':'
    const marker = (name) => (
        'POCKETRISU-PATCH:server-backup-snapshot:'
        + (lazyChat ? 'lazy' : 'standard')
        + ':'
        + name
    )
    const serverAfter = [
        'client-build-fence:server-session-advertise:1.9',
        'kei-backup-restore-safety-standard-adapter:snapshot-restore-error-code:1.9',
        'kei-backup-restore-safety-lazy-adapter:snapshot-restore-error-code:1.9',
        ...(lazyChat ? ['lazy-chat-sync:replace:server:node:server-cjs:1.9'] : []),
    ]
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
            anchor: canonicalSection(
                'function readColdStorageJsonEntry(nameOrKey, options = {}) {',
                'function resolveBackupStorageKey(name) {',
            ),
            managed: readFragment('cold-storage.cjs.txt', marker('cold-storage-reader')),
            markerNeedle: marker('cold-storage-reader') + ':START',
            requires: [prefix + 'server-source-lifecycle:1.9'],
        },
        {
            id: prefix + 'settings-and-download-export:1.9',
            file: 'server/node/server.cjs',
            type: 'replace',
            anchor: canonicalSection(
                'async function buildSettingsOnlyPlan({ includeModuleAssets = true } = {}) {',
                '// Pre-flight check: auth + size + disk space before client starts uploading',
            ),
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
            anchor: canonicalSection(
                "app.post('/api/backup/server/save', async (req, res, next) => {",
                '// List backup files on the server',
            ),
            managed: readFragment('server-save.cjs.txt', marker('server-save-export')),
            markerNeedle: marker('server-save-export') + ':START',
            requires: [prefix + 'settings-and-download-export:1.9'],
        },
        {
            id: prefix + 'compression-storage-queue:1.9',
            file: 'server/node/server.cjs',
            type: 'replace',
            anchor: `                    await writeInlayFile(entry.id, 'webp', webpBuf, { ...info, ext: 'webp' });
                    // invalidate thumbnail cache
                    kvDel(\`inlay_thumb/\${entry.id}\`);
`,
            managed: `                    /* ${marker('compression-storage-queue')}:START */
                    await queueStorageOperation(async () => {
                        await writeInlayFile(entry.id, 'webp', webpBuf, { ...info, ext: 'webp' });
                        // invalidate thumbnail cache in the same mutation turn
                        kvDel(\`inlay_thumb/\${entry.id}\`);
                    });
                    /* ${marker('compression-storage-queue')}:END */
`,
            markerNeedle: marker('compression-storage-queue') + ':START',
            requires: [prefix + 'server-save-export:1.9'],
        },
        {
            id: prefix + 'maintenance-gate:1.9',
            file: 'server/node/server.cjs',
            type: 'replace',
            anchor: canonicalSection(
                "app.post('/api/db/optimize', async (req, res, next) => {",
                '// ── Snapshot list (database/dbbackup-* keys) ─────────────────────────────────',
            ),
            managed: readFragment('maintenance-gate.cjs.txt', marker('maintenance-gate')),
            markerNeedle: marker('maintenance-gate') + ':START',
            requires: [prefix + 'compression-storage-queue:1.9'],
        },
        {
            id: prefix + 'startup-pin-sweep:1.9',
            file: 'server/node/server.cjs',
            type: 'replace',
            anchor: `async function startServer() {
    try {
        await migrateInlaysToFilesystem();
`,
            managed: `async function startServer() {
    try {
        /* ${marker('startup-pin-sweep')} */
        await backupSourceManager.sweep();
        await migrateInlaysToFilesystem();
`,
            markerNeedle: marker('startup-pin-sweep'),
            requires: [prefix + 'maintenance-gate:1.9'],
        },
    ].map((unit) => appendAfter({ ...unit, targetVersions: pocketRisu190 }, serverAfter))

    return {
        id,
        title,
        version: '0.1.0',
        userSelectable: false,
        targets: {
            pocketrisu: {
                verified: ['1.9.0'],
                reviewing: [],
            },
        },
        requires: lazyChat
            ? ['server-backup-snapshot-core', 'lazy-chat-sync']
            : ['server-backup-snapshot-core'],
        conflicts: lazyChat
            ? ['server-backup-snapshot-standard-adapter']
            : ['lazy-chat-sync', 'server-backup-snapshot-lazy-adapter'],
        autoWhen: lazyChat
            ? { all: ['server-backup-snapshot-core', 'lazy-chat-sync'] }
            : { all: ['server-backup-snapshot-core'], none: ['lazy-chat-sync'] },
        units: serverUnits,
    }
}

module.exports = { createServerBackupSnapshotAdapterManifest }
