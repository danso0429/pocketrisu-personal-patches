'use strict'

const { createServerBackupSnapshotAdapterManifest } = require('../server-backup-snapshot-core/adapter-manifest.cjs')

module.exports = createServerBackupSnapshotAdapterManifest({
    id: 'server-backup-snapshot-standard-adapter',
    title: 'Point-in-time server backup standard-storage adapter',
    lazyChat: false,
})
