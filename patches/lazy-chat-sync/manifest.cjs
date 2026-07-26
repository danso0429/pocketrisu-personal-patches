'use strict'

const fs = require('node:fs')
const path = require('node:path')

const anchorsRoot = path.join(__dirname, 'anchors')
const filesRoot = path.join(__dirname, 'files')
const read = (root, relative) => fs.readFileSync(path.join(root, relative), 'utf8')

const replacedFiles = [
    'server/node/server.cjs',
    'src/ts/bootstrap.ts',
    'src/ts/globalApi.svelte.ts',
    'src/ts/plugins/apiV3/v3.svelte.ts',
    'src/ts/storage/autoStorage.ts',
    'src/ts/storage/chatStorage.test.ts',
    'src/ts/storage/chatStorage.ts',
    'src/ts/storage/nodeStorage.ts',
    'src/ts/storage/risuSave.ts',
    'src/ts/storage/risuSavePatcher.test.ts',
]

const ownedFiles = [
    'server/node/chatDelta.cjs',
    'server/node/chatDelta.test.ts',
    'server/node/chatWriteJournal.cjs',
    'server/node/chatWriteJournal.test.ts',
    'src/ts/plugins/apiV3/pluginChatAccess.test.ts',
    'src/ts/plugins/apiV3/pluginChatAccess.ts',
    'src/ts/storage/conflictRebase.test.ts',
    'src/ts/storage/conflictRebase.ts',
    'src/ts/storage/nodeStorage.chatDelta.test.ts',
    'src/ts/storage/startupDatabaseCache.test.ts',
    'src/ts/storage/startupDatabaseCache.ts',
]

function unitId(relative) {
    return relative.replaceAll('/', ':').replaceAll('.', '-')
}

module.exports = {
    id: 'lazy-chat-sync',
    version: '0.1.1',
    units: [
        ...replacedFiles.map((relative) => ({
            id: `lazy-chat-sync:replace:${unitId(relative)}`,
            file: relative,
            type: 'replace',
            anchor: read(anchorsRoot, relative),
            managed: read(filesRoot, relative),
        })),
        ...ownedFiles.map((relative) => ({
            id: `lazy-chat-sync:owned:${unitId(relative)}`,
            file: relative,
            type: 'owned',
            content: read(filesRoot, relative),
        })),
        {
            id: 'lazy-chat-sync:chat-missing-payload-notice',
            file: 'src/lib/ChatScreens/DefaultChatScreen.svelte',
            type: 'replace',
            anchor: `        const activeChat = await ensureActiveChatReady(selectedChar)
        if(!activeChat) return
`,
            content: `        const activeChat = await ensureActiveChatReady(selectedChar)
        if(!activeChat) {
            notifyError('Chat data unavailable', {
                description: 'The server has metadata for this chat but no message payload. Your draft was kept.',
                source: 'chat-hydration',
            })
            return
        }
`,
        },
    ],
}
