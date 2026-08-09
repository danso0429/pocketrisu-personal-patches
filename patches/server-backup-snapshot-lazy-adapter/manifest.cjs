'use strict'

const { createServerBackupSnapshotAdapterManifest } = require('../server-backup-snapshot-core/adapter-manifest.cjs')

module.exports = createServerBackupSnapshotAdapterManifest({
    id: 'server-backup-snapshot-lazy-adapter',
    title: 'Point-in-time server backup lazy-storage adapter',
    lazyChat: true,
})
