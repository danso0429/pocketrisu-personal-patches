'use strict'

const fs = require('node:fs')
const path = require('node:path')

const filesRoot = path.join(__dirname, 'files')
const owned = (relative) =>
    fs.readFileSync(path.join(filesRoot, relative), 'utf8')

module.exports = {
    id: 'kei-hypa-tools-core',
    title: 'PocketRisu Kei HypaMemory manual tools core',
    version: '0.1.0',
    userSelectable: false,
    units: [
        {
            id: 'kei-hypa-tools-core:selection',
            file: 'src/lib/Others/HypaV3Modal/keiHypaManualSelection.ts',
            type: 'owned',
            content: owned('src/lib/Others/HypaV3Modal/keiHypaManualSelection.ts'),
        },
        {
            id: 'kei-hypa-tools-core:selection-tests',
            file: 'src/lib/Others/HypaV3Modal/keiHypaManualSelection.test.ts',
            type: 'owned',
            content: owned('src/lib/Others/HypaV3Modal/keiHypaManualSelection.test.ts'),
            requires: ['kei-hypa-tools-core:selection'],
        },
        {
            id: 'kei-hypa-tools-core:manual-panel',
            file: 'src/lib/Others/HypaV3Modal/KeiHypaManualSummaryPanel.svelte',
            type: 'owned',
            content: owned('src/lib/Others/HypaV3Modal/KeiHypaManualSummaryPanel.svelte'),
            requires: ['kei-hypa-tools-core:selection'],
        },
        {
            id: 'kei-hypa-tools-core:manual-panel-tests',
            file: 'src/lib/Others/HypaV3Modal/KeiHypaManualSummaryPanel.test.ts',
            type: 'owned',
            content: owned('src/lib/Others/HypaV3Modal/KeiHypaManualSummaryPanel.test.ts'),
            requires: ['kei-hypa-tools-core:manual-panel'],
        },
    ],
}
