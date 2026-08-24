'use strict'

const pocketRisu190 = { pocketrisu: ['1.9.0'] }

module.exports = {
    id: 'client-build-fence-standard-adapter',
    title: 'Client build fence standard snapshot adapter',
    version: '0.1.0',
    targets: {
        pocketrisu: {
            verified: ['1.9.0'],
            reviewing: [],
        },
    },
    userSelectable: false,
    requires: ['client-build-fence'],
    autoWhen: {
        all: ['client-build-fence'],
        none: ['kei-backup-restore-safety-core'],
    },
    units: [
        {
            id: 'client-build-fence-standard-adapter:backup-xhr-header:1.9',
            file: 'src/ts/storage/nodeStorage.ts',
            type: 'replace',
            anchor: `            xhr.setRequestHeader('content-type', 'application/x-risu-backup')
            xhr.setRequestHeader('risu-auth', authHeader)
            xhr.setRequestHeader('x-session-id', NodeStorage.sessionId)
            if (isUserActive()) xhr.setRequestHeader('x-user-active', '1')
`,
            content: `            xhr.setRequestHeader('content-type', 'application/x-risu-backup')
            xhr.setRequestHeader('risu-auth', authHeader)
            xhr.setRequestHeader('x-session-id', NodeStorage.sessionId)
            xhr.setRequestHeader('x-client-build', clientBuildStamp)
            if (isUserActive()) xhr.setRequestHeader('x-user-active', '1')
`,
            after: ['client-build-fence:node-migration-xhr-response:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence-standard-adapter:backup-xhr-response:1.9',
            file: 'src/ts/storage/nodeStorage.ts',
            type: 'replace',
            anchor: `            xhr.onerror = () => reject(new Error('backup import request failed'))
            xhr.onload = () => {
                if (xhr.status < 200 || xhr.status >= 300) {
`,
            content: `            xhr.onerror = () => reject(new Error('backup import request failed'))
            xhr.onload = () => {
                handleClientBuildXhr(xhr)
                if (xhr.status < 200 || xhr.status >= 300) {
`,
            after: [
                'client-build-fence:node-migration-xhr-response:1.9',
                'client-build-fence-standard-adapter:backup-xhr-header:1.9',
            ],
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence-standard-adapter:snapshot-restore:1.9',
            file: 'src/lib/Setting/Pages/SystemBackup.svelte',
            type: 'replace',
            anchor: "            const res = await fetch('/api/db/snapshots/restore', {\n",
            content: "            const res = await clientBuildFetch('/api/db/snapshots/restore', {\n",
            after: ['client-build-fence:system-backup-boot-reminder:1.9'],
            targetVersions: pocketRisu190,
        },
    ],
}
