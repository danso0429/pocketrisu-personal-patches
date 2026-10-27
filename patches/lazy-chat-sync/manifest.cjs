'use strict'

const fs = require('node:fs')
const path = require('node:path')

// PocketRisu 1.16.1 only. The pack is rebuilt as units over the native
// sources instead of whole-file replacements; patches/target-coverage.cjs maps
// every 1.10.0 unit and names the step (E2-3c, E2-3d, E2-3e, E2-7) that
// re-adds what is not here yet. anchors-1.10/ and files-1.10/ keep the 1.10.0
// sources: the owned modules below still come from there, and other packs
// read the 1.10.0 server replacement.
const filesRoot = path.join(__dirname, 'files')
const files1100Root = path.join(__dirname, 'files-1.10')
const files1116Root = path.join(__dirname, 'files-1.16')
const read = (root, relative) => fs.readFileSync(path.join(root, relative), 'utf8')

function unitId(relative) {
    return relative.replaceAll('/', ':').replaceAll('.', '-')
}

// Owned modules whose unit ids other packs and the BG contract name. The ids
// keep their 1.10.0 form.
const ownedUnits = [
    {
        id: `lazy-chat-sync:owned:${unitId('server/node/chatWriteJournal.cjs')}`,
        file: 'server/node/chatWriteJournal.cjs',
        type: 'owned',
        content: read(filesRoot, 'server/node/chatWriteJournal.cjs'),
    },
    ...[
        'server/node/serverChatCommit.cjs',
        'server/node/serverChatCommit.test.ts',
        'server/node/storageResetPrepare.cjs',
        'server/node/storageResetPrepare.test.ts',
        'server/node/storageResetPrepare.phaseC.test.ts',
    ].map((relative) => ({
        id: `lazy-chat-sync:owned:${unitId(relative)}:1.10`,
        file: relative,
        type: 'owned',
        content: read(files1100Root, relative),
        ...(relative === 'server/node/serverChatCommit.test.ts' ? {
            requires: [
                'lazy-chat-sync:owned:server:node:chatWriteJournal-cjs',
                'lazy-chat-sync:owned:server:node:serverChatCommit-cjs:1.10',
            ],
        } : {}),
        ...(relative.startsWith('server/node/storageResetPrepare.') && relative.endsWith('.test.ts') ? {
            requires: [
                'lazy-chat-sync:owned:server:node:storageResetPrepare-cjs:1.10',
            ],
        } : {}),
    })),
    {
        id: `lazy-chat-sync:owned:${unitId('server/node/storageResetTestHooks.cjs')}:1.10`,
        file: 'server/node/storageResetTestHooks.cjs',
        type: 'owned',
        content: read(files1116Root, 'server/node/storageResetTestHooks.cjs'),
    },
]

// E2-3b tests over the native 1.16.1 server.
const ownedTests1116 = [
    'server/node/chatDurability.e2-3.test.ts',
    'test/compat/restartableServer.e2-3.helper.ts',
    'test/compat/restart-durability.e2-3.test.ts',
].map((relative) => ({
    id: `lazy-chat-sync:owned:${unitId(relative)}:1.16`,
    file: relative,
    type: 'owned',
    content: read(files1116Root, relative),
}))

module.exports = {
    id: 'lazy-chat-sync',
    title: 'Lazy chat synchronization and startup cache',
    version: '0.5.20',
    targets: {
        pocketrisu: {
            verified: [],
            reviewing: ['1.16.1'],
        },
    },
    userSelectable: true,
    units: [
        ...ownedUnits,
        ...require('./server-durability-units.cjs'),
        ...ownedTests1116,
    ],
}
