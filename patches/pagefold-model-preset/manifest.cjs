'use strict'

const fs = require('node:fs')
const path = require('node:path')

const filesRoot = path.join(__dirname, 'files-1.10')
const owned = (relative) => fs.readFileSync(path.join(filesRoot, relative), 'utf8')
const pocketRisu1100 = { pocketrisu: ['1.10.0'] }

module.exports = {
    id: 'pagefold-model-preset',
    title: 'PageFold ModelPreset transform',
    version: '0.1.0',
    source: 'Independent implementation; PageFold 0.1.1 behavioral reference only',
    targets: {
        pocketrisu: {
            verified: [],
            reviewing: ['1.10.0'],
        },
    },
    userSelectable: true,
    // Prototype-only. The manifest deliberately stays outside src/catalog.cjs
    // until independent extraction and paid route feasibility have passed.
    allDefault: false,
    units: [
        {
            id: 'pagefold-model-preset:canonical-transcript:1.10',
            file: 'src/ts/pagefold/canonicalTranscript.ts',
            type: 'owned',
            content: owned('src/ts/pagefold/canonicalTranscript.ts'),
            targetVersions: pocketRisu1100,
        },
        {
            id: 'pagefold-model-preset:canonical-transcript-tests:1.10',
            file: 'src/ts/pagefold/canonicalTranscript.test.ts',
            type: 'owned',
            content: owned('src/ts/pagefold/canonicalTranscript.test.ts'),
            requires: ['pagefold-model-preset:canonical-transcript:1.10'],
            targetVersions: pocketRisu1100,
        },
    ],
}
