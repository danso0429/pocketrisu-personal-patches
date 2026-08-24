'use strict'

const fs = require('node:fs')
const path = require('node:path')

const filesRoot = path.join(__dirname, 'files')
const owned = (relative) => fs.readFileSync(path.join(filesRoot, relative), 'utf8')
const pocketRisu190 = { pocketrisu: ['1.9.0', '1.10.0'] }

module.exports = {
    id: 'kei-prompt-role-compat-core',
    title: 'PocketRisu Kei typed prompt-role compatibility',
    version: '0.1.1',
    targets: {
        pocketrisu: {
            verified: ['1.8.1', '1.9.0', '1.10.0'],
            reviewing: [],
        },
    },
    userSelectable: false,
    units: [
        {
            id: 'kei-prompt-role-compat-core:normalizer-export:1.9',
            file: 'src/ts/storage/database.svelte.ts',
            type: 'replace',
            anchor: 'function normalizePromptTemplate(template: PromptItem[]|null|undefined): PromptItem[]|null {\n',
            managed: 'export function normalizePromptTemplate(template: PromptItem[]|null|undefined): PromptItem[]|null {\n',
            targetVersions: pocketRisu190,
        },
        {
            id: 'kei-prompt-role-compat-core:typed-role-fallback:1.9',
            file: 'src/ts/storage/database.svelte.ts',
            type: 'replace',
            anchor: `            case 'persona':
            case 'description':
            case 'authornote':
            case 'memory':{
                if(item.role2 !== undefined && item.role2 !== null){
                    item.role2 = normalizePromptRole(item.role2) ?? 'system'
                }
                break
            }
`,
            managed: `            case 'persona':
            case 'description':
            case 'authornote':
            case 'memory':{
                /* POCKETRISU-PATCH:kei-prompt-role-compat:typed-role-fallback:START */
                if(item.role2 !== undefined && item.role2 !== null){
                    item.role2 = normalizePromptRole(item.role2) ?? 'system'
                }
                else if(item.role !== undefined && item.role !== null){
                    item.role2 = normalizePromptRole(item.role) ?? 'system'
                }
                /* POCKETRISU-PATCH:kei-prompt-role-compat:typed-role-fallback:END */
                break
            }
`,
            markerNeedle: 'POCKETRISU-PATCH:kei-prompt-role-compat:typed-role-fallback:START',
            requires: ['kei-prompt-role-compat-core:normalizer-export:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'kei-prompt-role-compat-core:tests:1.9',
            file: 'src/ts/storage/promptRoleCompatibility.test.ts',
            type: 'owned',
            content: owned('src/ts/storage/promptRoleCompatibility.test.ts'),
            requires: ['kei-prompt-role-compat-core:typed-role-fallback:1.9'],
            targetVersions: pocketRisu190,
        },
    ],
}
