'use strict'

const fs = require('node:fs')
const path = require('node:path')

const filesRoot = path.join(__dirname, 'files')
const owned = (relative) =>
    fs.readFileSync(path.join(filesRoot, relative), 'utf8')

module.exports = {
    id: 'kei-partial-edit-core',
    title: 'PocketRisu Kei partial message editing core',
    version: '0.3.1',
    userSelectable: false,
    targets: {
        pocketrisu: {
            verified: ['1.8.1', '1.9.0'],
            reviewing: ['1.10.0'],
        },
    },
    units: [
        {
            id: 'kei-partial-edit-core:identity',
            file: 'src/lib/ChatScreens/keiPartialEditIdentity.ts',
            type: 'owned',
            content: owned('src/lib/ChatScreens/keiPartialEditIdentity.ts'),
        },
        {
            id: 'kei-partial-edit-core:identity-tests',
            file: 'src/lib/ChatScreens/keiPartialEditIdentity.test.ts',
            type: 'owned',
            content: owned('src/lib/ChatScreens/keiPartialEditIdentity.test.ts'),
            requires: ['kei-partial-edit-core:identity'],
        },
        {
            id: 'kei-partial-edit-core:manager',
            file: 'src/lib/ChatScreens/PartialEditManager.svelte',
            type: 'owned',
            content: owned('src/lib/ChatScreens/PartialEditManager.svelte'),
            requires: ['kei-partial-edit-core:identity'],
        },
        {
            id: 'kei-partial-edit-core:manager-tests',
            file: 'src/lib/ChatScreens/PartialEditManager.test.ts',
            type: 'owned',
            content: owned('src/lib/ChatScreens/PartialEditManager.test.ts'),
            requires: ['kei-partial-edit-core:manager'],
        },
    ],
}
