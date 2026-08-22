'use strict'

module.exports = {
    id: 'pocketrisu-kei',
    title: 'PocketRisu Kei integration',
    version: '0.13.0',
    userSelectable: true,
    targets: {
        pocketrisu: {
            verified: ['1.8.1', '1.9.0'],
            reviewing: ['1.10.0'],
        },
    },
    requires: [
        'kei-fullscreen-image-viewer-core',
        'kei-stream-parser-core',
        'kei-chat-render-core',
        'kei-mobile-navigation-core',
        'kei-hypa-tools-core',
        'kei-partial-edit-core',
        'kei-translation-tools-core',
        'kei-prompt-role-compat-core',
        'kei-text-theme-normalization-core',
        'kei-backup-restore-safety-core',
    ],
    units: [],
}
