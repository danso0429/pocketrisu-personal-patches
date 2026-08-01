'use strict'

const {
    createBackupRestoreSafetyAdapterManifest,
} = require('../kei-backup-restore-safety-core/adapter-manifest.cjs')

module.exports = createBackupRestoreSafetyAdapterManifest({
    id: 'kei-backup-restore-safety-lazy-adapter',
    title: 'PocketRisu Kei restore safety lazy-chat storage adapter',
    lazyChat: true,
})
