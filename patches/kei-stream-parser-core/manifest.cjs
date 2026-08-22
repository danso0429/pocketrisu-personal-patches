'use strict'

const fs = require('node:fs')
const path = require('node:path')

const filesRoot = path.join(__dirname, 'files')
const owned = (relative) => fs.readFileSync(path.join(filesRoot, relative), 'utf8')

module.exports = {
    id: 'kei-stream-parser-core',
    title: 'PocketRisu Kei replayable SSE parser core',
    version: '0.1.1',
    userSelectable: false,
    targets: {
        pocketrisu: {
            verified: ['1.8.1', '1.9.0'],
            reviewing: ['1.10.0'],
        },
    },
    units: [
        {
            id: 'kei-stream-parser-core:runtime',
            file: 'src/ts/process/request/keiSseStream.ts',
            type: 'owned',
            content: owned('src/ts/process/request/keiSseStream.ts'),
        },
        {
            id: 'kei-stream-parser-core:runtime-tests',
            file: 'src/ts/process/request/keiSseStream.test.ts',
            type: 'owned',
            content: owned('src/ts/process/request/keiSseStream.test.ts'),
            requires: ['kei-stream-parser-core:runtime'],
        },
        {
            id: 'kei-stream-parser-core:openai-integration-tests',
            file: 'src/ts/process/request/openAI/requests.stream.test.ts',
            type: 'owned',
            content: owned('src/ts/process/request/openAI/requests.stream.test.ts'),
            requires: ['kei-stream-parser-core:runtime-tests'],
        },
        {
            id: 'kei-stream-parser-core:google-integration-tests',
            file: 'src/ts/process/request/google.stream.test.ts',
            type: 'owned',
            content: owned('src/ts/process/request/google.stream.test.ts'),
            requires: ['kei-stream-parser-core:runtime-tests'],
        },
    ],
}
