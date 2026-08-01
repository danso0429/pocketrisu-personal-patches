'use strict'

module.exports = {
    id: 'bg-preserve-storage-base',
    title: 'BG preserve storage integration for standard PocketRisu storage',
    version: '0.1.0',
    targets: {
        pocketrisu: {
            verified: ['1.8.1', '1.9.0'],
            reviewing: [],
        },
    },
    userSelectable: false,
    requires: ['bg-preserve'],
    conflicts: ['lazy-chat-sync'],
    autoWhen: {
        all: ['bg-preserve'],
        none: ['lazy-chat-sync'],
    },
    units: [
        {
            id: 'bg-preserve-storage-base:asset-upload-retry-import',
            file: 'src/ts/storage/nodeStorage.ts',
            type: 'insert',
            where: 'after',
            anchor: 'import { normalizeChat } from "./database.svelte"\n',
            managed: '/* BG-PRESERVE:START asset-upload-retry-import */\nimport { retryAssetUpload } from "./assetUploadRetry"\n/* BG-PRESERVE:END */\n',
            markerNeedle: 'asset-upload-retry-import',
            anchorPolicy: 'first',
        },
        {
            id: 'bg-preserve-storage-base:adaptive-asset-upload-retry',
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
            after: ['bg-preserve-storage-base:asset-upload-retry-import'],
        },
        {
            id: 'bg-preserve-storage-base:asset-upload-error-detail',
            file: 'src/ts/storage/nodeStorage.ts',
            type: 'replace',
            anchor: `        if(da.status < 200 || da.status >= 300){
            throw "setItem Error"
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
            throw "setItem Error"
        }
        /* BG-PRESERVE:END */
`,
            markerNeedle: 'asset-upload-error-detail',
            anchorPolicy: 'first',
            after: ['bg-preserve-storage-base:adaptive-asset-upload-retry'],
        },
    ],
}
