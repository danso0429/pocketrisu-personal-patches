'use strict'

const fs = require('node:fs')
const path = require('node:path')

const filesRoot = path.join(__dirname, 'files')
const owned = (relative) => fs.readFileSync(path.join(filesRoot, relative), 'utf8')

module.exports = {
    id: 'kei-chat-render-core',
    title: 'PocketRisu Kei streaming chat render core',
    version: '0.2.1',
    userSelectable: false,
    targets: {
        pocketrisu: {
            verified: ['1.8.1', '1.9.0'],
            reviewing: ['1.10.0'],
        },
    },
    units: [
        {
            id: 'kei-chat-render-core:identity',
            file: 'src/lib/ChatScreens/keiChatRender.ts',
            type: 'owned',
            content: owned('src/lib/ChatScreens/keiChatRender.ts'),
        },
        {
            id: 'kei-chat-render-core:identity-tests',
            file: 'src/lib/ChatScreens/keiChatRender.test.ts',
            type: 'owned',
            content: owned('src/lib/ChatScreens/keiChatRender.test.ts'),
            requires: ['kei-chat-render-core:identity'],
        },
    ],
}
