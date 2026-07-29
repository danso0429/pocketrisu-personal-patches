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
    title: 'BG preserve integration for lazy chat storage',
    version: '0.2.0',
    userSelectable: false,
    requires: ['bg-preserve', 'lazy-chat-sync'],
    autoWhen: {
        all: ['bg-preserve', 'lazy-chat-sync'],
    },
    units: [
        {
            id: 'lazy-chat-bg-adapter:asset-upload-retry-import',
            file: 'src/ts/storage/nodeStorage.ts',
            type: 'insert',
            where: 'after',
            anchor: 'import { StartupDatabaseCache } from "./startupDatabaseCache"\n',
            managed: '/* BG-PRESERVE:START asset-upload-retry-import */\nimport { retryAssetUpload } from "./assetUploadRetry"\n/* BG-PRESERVE:END */\n',
            markerNeedle: 'asset-upload-retry-import',
            anchorPolicy: 'first',
            requires: ['lazy-chat-sync:replace:src:ts:storage:nodeStorage-ts'],
        },
        {
            id: 'lazy-chat-bg-adapter:adaptive-asset-upload-retry',
            file: 'src/ts/storage/nodeStorage.ts',
            type: 'replace',
            anchor: `        const da = await this.authFetch('/api/write', {
            method: "POST",
            body: value as any,
            headers
        })
`,
            managed: `        /* BG-PRESERVE:START asset-upload-adaptive-retry */
        const upload = () => this.authFetch('/api/write', {
            method: "POST",
            body: value as any,
            headers
        })
        const da = key.startsWith('assets/')
            ? await retryAssetUpload(upload)
            : await upload()
        /* BG-PRESERVE:END */
`,
            markerNeedle: 'asset-upload-adaptive-retry',
            anchorPolicy: 'first',
            requires: ['lazy-chat-bg-adapter:asset-upload-retry-import'],
        },
        {
            id: 'lazy-chat-bg-adapter:asset-upload-error-detail',
            file: 'src/ts/storage/nodeStorage.ts',
            type: 'replace',
            anchor: `        if(da.status < 200 || da.status >= 300){
            const data = await da.clone().json().catch(() => ({}))
            throw new Error(data?.detail || data?.error || \`setItem Error (\${da.status})\`)
        }
`,
            managed: `        /* BG-PRESERVE:START asset-upload-error-detail */
        if(da.status < 200 || da.status >= 300){
            if (key.startsWith('assets/')) {
                let detail = ''
                try {
                    const body = await da.clone().json()
                    detail = typeof body?.error === 'string' ? \`: \${body.error}\` : ''
                } catch {
                    // A non-JSON proxy/server response is still identified by its HTTP status.
                }
                throw new Error(\`Asset upload failed (HTTP \${da.status})\${detail}\`)
            }
            const data = await da.clone().json().catch(() => ({}))
            throw new Error(data?.detail || data?.error || \`setItem Error (\${da.status})\`)
        }
        /* BG-PRESERVE:END */
`,
            markerNeedle: 'asset-upload-error-detail',
            anchorPolicy: 'first',
            requires: ['lazy-chat-bg-adapter:adaptive-asset-upload-retry'],
        },
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
