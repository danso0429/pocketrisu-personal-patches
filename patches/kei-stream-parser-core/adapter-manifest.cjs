'use strict'

const fs = require('node:fs')
const path = require('node:path')

const anchorsRoot = path.join(__dirname, 'anchors')
const snippetsRoot = path.join(__dirname, 'snippets')
const read = (root, name) => fs.readFileSync(path.join(root, name), 'utf8')
const anchor = (name) => JSON.parse(read(anchorsRoot, `${name}.json`)).join('\n')
const snippet = (name, adapter) => read(snippetsRoot, name)
    .replaceAll('{{ADAPTER}}', adapter)

function createStreamAdapterManifest({
    id,
    title,
    adapter,
    bgPreserve,
}) {
    const openAIImportId = `${id}:openai-import`
    const openAIFunctionId = `${id}:openai-parser`
    const googleImportId = `${id}:google-import`
    const googleFunctionId = `${id}:google-parser`
    const bgGoogleUnits = bgPreserve
        ? [
            'bg-preserve:hook:google-ts-bgsubkey-fwd-stream',
            'bg-preserve:hook:google-ts-bgsubkey-fwd-nonstream',
        ]
        : []

    return {
        id,
        title,
        version: '0.1.0',
        userSelectable: false,
        targets: {
            pocketrisu: {
                verified: ['1.8.1', '1.9.0'],
                reviewing: [],
            },
        },
        requires: bgPreserve
            ? ['kei-stream-parser-core', 'bg-preserve']
            : ['kei-stream-parser-core'],
        conflicts: bgPreserve
            ? ['kei-stream-parser-base-adapter']
            : ['bg-preserve', 'kei-stream-parser-bg-adapter'],
        autoWhen: bgPreserve
            ? {
                all: ['kei-stream-parser-core', 'bg-preserve'],
            }
            : {
                all: ['kei-stream-parser-core'],
                none: ['bg-preserve'],
            },
        units: [
            {
                id: openAIImportId,
                file: 'src/ts/process/request/openAI/requests.ts',
                type: 'insert',
                where: 'after',
                anchor: "import type { RequestDataArgumentExtended, requestDataResponse, StreamResponseChunk } from '../request'\n",
                managed: snippet('openai-import.ts', adapter),
                markerNeedle: `kei-stream-parser:${adapter}:openai-import`,
                anchorPolicy: 'first',
                requires: ['kei-stream-parser-core:runtime'],
            },
            {
                id: openAIFunctionId,
                file: 'src/ts/process/request/openAI/requests.ts',
                type: 'replace',
                anchor: anchor('openai-function.ts'),
                managed: snippet('openai-function.ts', adapter),
                markerNeedle: `kei-stream-parser:${adapter}:openai-transform`,
                anchorPolicy: 'first',
                requires: [openAIImportId],
            },
            {
                id: googleImportId,
                file: 'src/ts/process/request/google.ts',
                type: 'insert',
                where: 'after',
                anchor: "import type { RequestDataArgumentExtended, requestDataResponse, StreamResponseChunk } from './request'\n",
                managed: snippet('google-import.ts', adapter),
                markerNeedle: `kei-stream-parser:${adapter}:google-import`,
                anchorPolicy: 'first',
                requires: ['kei-stream-parser-core:runtime'],
                after: bgGoogleUnits,
            },
            {
                id: googleFunctionId,
                file: 'src/ts/process/request/google.ts',
                type: 'replace',
                anchor: anchor('google-function.ts'),
                managed: snippet('google-function.ts', adapter),
                markerNeedle: `kei-stream-parser:${adapter}:google-transform`,
                anchorPolicy: 'first',
                requires: [googleImportId],
                after: bgGoogleUnits,
            },
        ],
    }
}

module.exports = {
    createStreamAdapterManifest,
}
