'use strict'

const pocketRisu190 = { pocketrisu: ['1.9.0'] }

module.exports = {
    id: 'client-build-fence-kei-adapter',
    title: 'Client build fence Kei snapshot adapter',
    version: '0.1.0',
    targets: {
        pocketrisu: {
            verified: ['1.9.0'],
            reviewing: [],
        },
    },
    userSelectable: false,
    requires: ['client-build-fence', 'kei-backup-restore-safety-core'],
    autoWhen: {
        all: ['client-build-fence', 'kei-backup-restore-safety-core'],
    },
    units: [
        {
            id: 'client-build-fence-kei-adapter:snapshot-restore:1.9',
            file: 'src/lib/Setting/Pages/SystemBackup.svelte',
            type: 'replace',
            anchor: "                const res = await fetch('/api/db/snapshots/restore', {\n",
            content: "                const res = await clientBuildFetch('/api/db/snapshots/restore', {\n",
            after: [
                'client-build-fence:system-backup-boot-reminder:1.9',
                'kei-backup-restore-safety-core:snapshot-ui-retry:1.9',
            ],
            targetVersions: pocketRisu190,
        },
    ],
}
