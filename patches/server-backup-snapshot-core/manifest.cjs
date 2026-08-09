'use strict'

const fs = require('node:fs')
const path = require('node:path')

const filesRoot = path.join(__dirname, 'files')
const read = (relative) => fs.readFileSync(path.join(filesRoot, relative), 'utf8')
const pocketRisu190 = { pocketrisu: ['1.9.0'] }

module.exports = {
    id: 'server-backup-snapshot-core',
    title: 'Point-in-time server backup source core',
    version: '0.1.0',
    userSelectable: false,
    targets: {
        pocketrisu: {
            verified: ['1.9.0'],
            reviewing: [],
        },
    },
    requires: ['client-build-fence'],
    autoWhen: {
        all: ['client-build-fence'],
    },
    units: [
        ...[
            'server/node/backupSnapshot.cjs',
            'server/node/backupSnapshot.test.ts',
            'server/node/backupSource.cjs',
            'server/node/backupSource.test.ts',
            'test/compat/backup-point-in-time.test.ts',
        ].map((relative) => ({
            id: `server-backup-snapshot-core:owned:${relative.replaceAll('/', ':').replaceAll('.', '-')}:1.9`,
            file: relative,
            type: 'owned',
            content: read(relative),
            targetVersions: pocketRisu190,
        })),
        {
            id: 'server-backup-snapshot-core:db-helper-import:1.9',
            file: 'server/node/db.cjs',
            type: 'replace',
            anchor: "const { createChunkStore } = require('./chunkStore.cjs');\n",
            managed: `const { createChunkStore } = require('./chunkStore.cjs');
/* POCKETRISU-PATCH:server-backup-snapshot-core:db-helper-import */
const { openKvSnapshot } = require('./backupSnapshot.cjs');
`,
            markerNeedle: 'POCKETRISU-PATCH:server-backup-snapshot-core:db-helper-import',
            requires: ['server-backup-snapshot-core:owned:server:node:backupSnapshot-cjs:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'server-backup-snapshot-core:db-open-snapshot:1.9',
            file: 'server/node/db.cjs',
            type: 'insert',
            where: 'before',
            anchor: "function checkpointWal(mode = 'TRUNCATE') {\n",
            content: `function createKvSnapshot() {
    return openKvSnapshot(dbPath);
}

`,
            requires: ['server-backup-snapshot-core:db-helper-import:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'server-backup-snapshot-core:db-export-snapshot:1.9',
            file: 'server/node/db.cjs',
            type: 'replace',
            anchor: `    kvGet, kvSet, kvDel, kvList, kvDelPrefix, kvListWithSizes, kvSize, kvGetUpdatedAt, kvCopyValue,
`,
            content: `    kvGet, kvSet, kvDel, kvList, kvDelPrefix, kvListWithSizes, kvSize, kvGetUpdatedAt, kvCopyValue,
    createKvSnapshot,
`,
            requires: ['server-backup-snapshot-core:db-open-snapshot:1.9'],
            targetVersions: pocketRisu190,
        },
    ],
}
