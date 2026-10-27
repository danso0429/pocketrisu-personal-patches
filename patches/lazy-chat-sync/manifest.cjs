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

// E2-3d: the chat revision and stripped database module, the stale view
// rebase and the client save classification, with their 1.10.0 tests. The
// save intent classifier and the chat id repair are rewritten for 1.16.1
// (files-1.16/); their ids stay.
const chatRevisionOwnedUnits = [
    ...[
        'server/node/chatDelta.cjs',
        'server/node/chatDelta.test.ts',
        'server/node/chatWriteJournal.test.ts',
        'src/ts/storage/conflictRebase.ts',
        'src/ts/storage/conflictRebase.test.ts',
        'src/ts/storage/chatSaveRebase.ts',
        'src/ts/storage/chatSaveRebase.test.ts',
        'src/ts/storage/chatIdentityRepair.test.ts',
        'src/ts/storage/nodeStorage.chatRebaseCodec.test.ts',
    ].map((relative) => ({
        id: `lazy-chat-sync:owned:${unitId(relative)}`,
        file: relative,
        type: 'owned',
        content: read(filesRoot, relative),
    })),
    ...[
        'src/ts/storage/chatIdentityRepair.ts',
        'src/ts/storage/chatSaveIntent.ts',
    ].map((relative) => ({
        id: `lazy-chat-sync:owned:${unitId(relative)}`,
        file: relative,
        type: 'owned',
        content: read(files1116Root, relative),
    })),
]

// E2-3b, E2-3c and E2-3d tests over the native 1.16.1 sources.
const ownedTests1116 = [
    'server/node/chatDurability.e2-3.test.ts',
    'server/node/storageBarrier.e2-3.test.ts',
    'test/compat/restartableServer.e2-3.helper.ts',
    'test/compat/restart-durability.e2-3.test.ts',
    'test/compat/storage-reset.e2-3.test.ts',
    // Storage reset cases of server-backup-snapshot-core that run with this
    // pack alone (E2-3c).
    'test/compat/storage-reset-b1a.lazy-chat-sync.test.ts',
    'test/compat/session-reset-b2.lazy-chat-sync.test.ts',
    // Chat revision protocol (E2-3d).
    'test/compat/chat-contract.e2-3.test.ts',
    'src/ts/storage/chatRevision.e2-3.test.ts',
    'src/ts/storage/saveRecovery.e2-3.test.ts',
    // Chat save follow-ups (E2-3d2, E2-3d3, E2-3d4).
    'src/ts/storage/chatSaveFollowup.e2-3.test.ts',
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
        ...require('./server-reset-units.cjs'),
        ...chatRevisionOwnedUnits,
        ...require('./chat-revision-units.cjs'),
        ...require('./native-test-units.cjs'),
        ...ownedTests1116,
    ],
}
