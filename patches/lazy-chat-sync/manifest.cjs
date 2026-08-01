'use strict'

const fs = require('node:fs')
const path = require('node:path')

const anchorsRoot = path.join(__dirname, 'anchors')
const filesRoot = path.join(__dirname, 'files')
const anchors190Root = path.join(__dirname, 'anchors-1.9')
const files190Root = path.join(__dirname, 'files-1.9')
const read = (root, relative) => fs.readFileSync(path.join(root, relative), 'utf8')

const versionedReplacedFiles = [
    'server/node/server.cjs',
    'src/ts/bootstrap.ts',
    'src/ts/globalApi.svelte.ts',
    'src/ts/plugins/apiV3/v3.svelte.ts',
    'src/ts/storage/autoStorage.ts',
    'src/ts/storage/chatStorage.ts',
    'src/ts/storage/nodeStorage.ts',
]

const unchangedReplacedFiles = [
    'src/ts/storage/chatStorage.test.ts',
    'src/ts/storage/risuSave.ts',
    'src/ts/storage/risuSavePatcher.test.ts',
]

const pocketRisu181 = { pocketrisu: ['1.8.1'] }
const pocketRisu190 = { pocketrisu: ['1.9.0'] }

const ownedFiles = [
    'server/node/chatDelta.cjs',
    'server/node/chatDelta.test.ts',
    'server/node/chatWriteJournal.cjs',
    'server/node/chatWriteJournal.test.ts',
    'src/ts/plugins/apiV3/pluginChatAccess.test.ts',
    'src/ts/plugins/apiV3/pluginChatAccess.ts',
    'src/ts/storage/conflictRebase.test.ts',
    'src/ts/storage/conflictRebase.ts',
    'src/ts/storage/chatIdentityRepair.test.ts',
    'src/ts/storage/chatIdentityRepair.ts',
    'src/ts/storage/chatSaveIntent.test.ts',
    'src/ts/storage/chatSaveIntent.ts',
    'src/ts/storage/nodeStorage.chatDelta.test.ts',
    'src/ts/storage/startupDatabaseCache.test.ts',
    'src/ts/storage/startupDatabaseCache.ts',
]

function unitId(relative) {
    return relative.replaceAll('/', ':').replaceAll('.', '-')
}

module.exports = {
    id: 'lazy-chat-sync',
    title: 'Lazy chat synchronization and startup cache',
    version: '0.2.0',
    targets: {
        pocketrisu: {
            verified: ['1.8.1', '1.9.0'],
            reviewing: [],
        },
    },
    userSelectable: true,
    presetDefaults: ['features'],
    supersedes: ['startup-cache'],
    units: [
        ...unchangedReplacedFiles.map((relative) => ({
            id: `lazy-chat-sync:replace:${unitId(relative)}`,
            file: relative,
            type: 'replace',
            anchor: read(anchorsRoot, relative),
            managed: read(filesRoot, relative),
        })),
        ...versionedReplacedFiles.flatMap((relative) => [
            {
                id: `lazy-chat-sync:replace:${unitId(relative)}`,
                file: relative,
                type: 'replace',
                anchor: read(anchorsRoot, relative),
                managed: read(filesRoot, relative),
                targetVersions: pocketRisu181,
            },
            {
                id: `lazy-chat-sync:replace:${unitId(relative)}:1.9`,
                file: relative,
                type: 'replace',
                anchor: read(anchors190Root, relative),
                managed: read(files190Root, relative),
                targetVersions: pocketRisu190,
            },
        ]),
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
        {
            id: 'lazy-chat-sync:plugin-api-chat-metadata-types',
            file: 'src/ts/plugins/apiV3/risuai.d.ts',
            type: 'replace',
            anchor: `    getDatabase(includeOnly:string[]|'all' = 'all'): Promise<DatabaseSubset|null>;
`,
            content: `    getDatabase(includeOnly:string[]|'all' = 'all'): Promise<DatabaseSubset|null>;

    /**
     * Gets the same allowed database keys without hydrating chat message
     * payloads. Character chat entries contain only id, name, lastDate,
     * folderId, and modules, so this method is suitable for read-only lists.
     * Use getDatabase() when chat messages are required.
     */
    getDatabaseMetadata(includeOnly:string[]|'all' = 'all'): Promise<DatabaseSubset|null>;
`,
        },
    ],
}
