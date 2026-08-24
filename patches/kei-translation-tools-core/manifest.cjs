'use strict'

const fs = require('node:fs')
const path = require('node:path')

const filesRoot = path.join(__dirname, 'files')
const owned = (relative) => fs.readFileSync(path.join(filesRoot, relative), 'utf8')

const ownedFiles = [
    'src/ts/translator/translationTask.ts',
    'src/ts/translator/translationTask.test.ts',
    'src/ts/translator/translationChunkBatch.ts',
    'src/ts/translator/translationChunkBatch.test.ts',
    'src/ts/translator/translationCacheStore.ts',
    'src/ts/translator/translationCacheStore.test.ts',
    'src/ts/translator/translationCacheRuntime.ts',
    'src/ts/translator/translationCacheUsage.ts',
    'src/ts/translator/translationCacheUsage.test.ts',
    'src/lib/Setting/Pages/Language/TranslationCachePanel.svelte',
]

module.exports = {
    id: 'kei-translation-tools-core',
    title: 'PocketRisu Kei translation cache tools core',
    version: '0.2.1',
    targets: {
        pocketrisu: {
            verified: ['1.8.1', '1.9.0', '1.10.0'],
            reviewing: [],
        },
    },
    userSelectable: false,
    units: ownedFiles.map((file, index) => ({
        id: `kei-translation-tools-core:${file}`,
        file,
        type: 'owned',
        content: owned(file),
        ...(index === 0
            ? {}
            : {
                requires: [
                    `kei-translation-tools-core:${ownedFiles[index - 1]}`,
                ],
            }),
    })),
}
