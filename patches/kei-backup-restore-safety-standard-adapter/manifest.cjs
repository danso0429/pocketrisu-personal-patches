'use strict'

const {
    createBackupRestoreSafetyAdapterManifest,
} = require('../kei-backup-restore-safety-core/adapter-manifest.cjs')

module.exports = createBackupRestoreSafetyAdapterManifest({
    id: 'kei-backup-restore-safety-standard-adapter',
    title: 'PocketRisu Kei restore safety standard storage adapter',
    lazyChat: false,
})
