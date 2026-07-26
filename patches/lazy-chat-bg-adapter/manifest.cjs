'use strict'

const fs = require('node:fs')
const path = require('node:path')

const filesRoot = path.join(__dirname, 'files')
const owned = (relative) => fs.readFileSync(path.join(filesRoot, relative), 'utf8')
const bgGlobalApiUnits = [
    'bg-preserve:hook:globalapi-durable-save-api',
    'bg-preserve:hook:globalapi-durable-save-outcome',
    'bg-preserve:hook:globalapi-durable-save-rethrow',
    'bg-preserve:hook:globalapi-durable-save-impl',
    'bg-preserve:hook:globalapi-fetch-impl-register',
    'bg-preserve:hook:globalapi-fetchnative-bgsubkey-arg',
    'bg-preserve:hook:globalapi-gemini-main-branch',
]

module.exports = {
    id: 'lazy-chat-bg-adapter',
    version: '0.1.0',
    requires: ['bg-preserve', 'lazy-chat-sync'],
    units: [
        {
            id: 'lazy-chat-bg-adapter:barrier',
            file: 'src/ts/bgDurableSaveBarrier.ts',
            type: 'owned',
            content: owned('src/ts/bgDurableSaveBarrier.ts'),
        },
        {
            id: 'lazy-chat-bg-adapter:barrier-tests',
            file: 'src/ts/bgDurableSaveBarrier.test.ts',
            type: 'owned',
            content: owned('src/ts/bgDurableSaveBarrier.test.ts'),
        },
        {
            id: 'lazy-chat-bg-adapter:global-import',
            file: 'src/ts/globalApi.svelte.ts',
            type: 'insert',
            where: 'after',
            anchor: 'import { isHydrating, saveChatToServer, ensureChatHydrated, chatToStub, classifyChat, convertStubsToPlaceholders } from "./storage/chatStorage";\n',
            content: 'import { completeBgDurableSave } from "./bgDurableSaveBarrier";\n',
            requires: [
                'lazy-chat-sync:replace:src:ts:globalApi-svelte-ts',
                'bg-preserve:hook:globalapi-durable-save-api',
            ],
            after: bgGlobalApiUnits,
        },
        {
            id: 'lazy-chat-bg-adapter:durable-flush',
            file: 'src/ts/globalApi.svelte.ts',
            type: 'replace',
            anchor: "        if (!committed) throw new Error('durable save deferred; orchestration result retained')\n",
            content: `        await completeBgDurableSave(
            committed,
            () => forageStorage.flushDatabase(),
        )
`,
            requires: [
                'lazy-chat-sync:replace:src:ts:globalApi-svelte-ts',
                'bg-preserve:hook:globalapi-durable-save-impl',
            ],
            after: [
                ...bgGlobalApiUnits,
                'lazy-chat-bg-adapter:global-import',
            ],
        },
    ],
}
