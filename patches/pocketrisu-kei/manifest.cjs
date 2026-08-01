'use strict'

module.exports = {
    id: 'pocketrisu-kei',
    title: 'PocketRisu Kei integration',
    version: '0.11.0',
    userSelectable: true,
    targets: {
        pocketrisu: {
            verified: ['1.8.1', '1.9.0'],
            reviewing: [],
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
    ],
    units: [],
}
