'use strict'

const pocketRisu190 = { pocketrisu: ['1.9.0'] }

module.exports = {
    id: 'client-build-fence-kei-standard-storage-adapter',
    title: 'Client build fence Kei standard-storage adapter',
    version: '0.1.0',
    targets: {
        pocketrisu: { verified: ['1.9.0'], reviewing: [] },
    },
    userSelectable: false,
    requires: ['client-build-fence', 'kei-backup-restore-safety-standard-adapter'],
    autoWhen: {
        all: ['client-build-fence', 'kei-backup-restore-safety-standard-adapter'],
    },
    units: [
        {
            id: 'client-build-fence-kei-standard-storage-adapter:backup-xhr-header:1.9',
            file: 'src/ts/storage/nodeStorage.ts',
            type: 'insert',
            where: 'after',
            anchor: '            /* POCKETRISU-PATCH:kei-backup-restore-safety:standard:node-local-header */\n',
            content: "            xhr.setRequestHeader('x-client-build', clientBuildStamp)\n",
            requires: [
                'client-build-fence:node-migration-xhr-response:1.9',
                'kei-backup-restore-safety-standard-adapter:node-local-stream-error:1.9',
                'kei-backup-restore-safety-standard-adapter:node-server-stream-error:1.9',
            ],
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence-kei-standard-storage-adapter:backup-xhr-response:1.9',
            file: 'src/ts/storage/nodeStorage.ts',
            type: 'replace',
            anchor: `            xhr.onload = () => {
                if (xhr.status < 200 || xhr.status >= 300) {
                    /* POCKETRISU-PATCH:kei-backup-restore-safety:standard:node-local-http-error */
`,
            content: `            xhr.onload = () => {
                handleClientBuildXhr(xhr)
                if (xhr.status < 200 || xhr.status >= 300) {
                    /* POCKETRISU-PATCH:kei-backup-restore-safety:standard:node-local-http-error */
`,
            requires: ['client-build-fence-kei-standard-storage-adapter:backup-xhr-header:1.9'],
            targetVersions: pocketRisu190,
        },
    ],
}
