'use strict'

const fs = require('node:fs')
const path = require('node:path')

const filesRoot = path.join(__dirname, 'files')
const owned = (relative) =>
    fs.readFileSync(path.join(filesRoot, relative), 'utf8')

module.exports = {
    id: 'kei-mobile-navigation-core',
    title: 'PocketRisu Kei mobile navigation core',
    version: '0.2.1',
    userSelectable: false,
    targets: {
        pocketrisu: {
            verified: ['1.8.1', '1.9.0', '1.10.0'],
            reviewing: [],
        },
    },
    units: [
        {
            id: 'kei-mobile-navigation-core:hotkey-navigation',
            file: 'src/ts/keiMobileNavigation.ts',
            type: 'owned',
            content: owned('src/ts/keiMobileNavigation.ts'),
        },
        {
            id: 'kei-mobile-navigation-core:hotkey-navigation-tests',
            file: 'src/ts/keiMobileNavigation.test.ts',
            type: 'owned',
            content: owned('src/ts/keiMobileNavigation.test.ts'),
            requires: ['kei-mobile-navigation-core:hotkey-navigation'],
        },
        {
            id: 'kei-mobile-navigation-core:mobile-back',
            file: 'src/ts/mobileBackNavigation.ts',
            type: 'owned',
            content: owned('src/ts/mobileBackNavigation.ts'),
        },
        {
            id: 'kei-mobile-navigation-core:mobile-back-tests',
            file: 'src/ts/mobileBackNavigation.test.ts',
            type: 'owned',
            content: owned('src/ts/mobileBackNavigation.test.ts'),
            requires: ['kei-mobile-navigation-core:mobile-back'],
        },
    ],
}
