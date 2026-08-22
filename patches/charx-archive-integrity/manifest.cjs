'use strict'

const fs = require('node:fs')
const path = require('node:path')

const anchors = path.join(__dirname, 'anchors-1.10')
const files = path.join(__dirname, 'files-1.10')
const read = (root, relative) => fs.readFileSync(path.join(root, relative), 'utf8')
const target1100 = { pocketrisu: ['1.10.0'] }
const processZipAnchor = read(anchors, 'src/ts/process/processzip.ts')
const importerStart = 'export class CharXImporter{'
const importerEnd = '/**\n * Checks if a CharX file'
const sliceImporter = (source) => {
    const start = source.indexOf(importerStart)
    const end = source.indexOf(importerEnd, start)
    if (start < 0 || end < 0) throw new Error('Unable to locate the exact 1.10 CharXImporter anchor')
    return source.slice(start, end)
}

module.exports = {
    id: 'charx-archive-integrity',
    title: 'CharX archive integrity',
    version: '0.1.0',
    targets: {
        pocketrisu: {
            verified: [],
            reviewing: ['1.10.0'],
        },
    },
    userSelectable: true,
    presetDefaults: ['hardening'],
    units: [
        {
            id: 'charx-archive-integrity:package-dependency:1.10',
            file: 'package.json',
            type: 'insert',
            where: 'after',
            anchor: `    "@types/trusted-types": "^2.0.7",\n`,
            managed: `    "@zip.js/zip.js": "2.8.55",\n`,
            targetVersions: target1100,
        },
        {
            id: 'charx-archive-integrity:lock-importer:1.10',
            file: 'pnpm-lock.yaml',
            type: 'insert',
            where: 'after',
            anchor: `      '@types/trusted-types':\n        specifier: ^2.0.7\n        version: 2.0.7\n`,
            managed: `      '@zip.js/zip.js':\n        specifier: 2.8.55\n        version: 2.8.55\n`,
            requires: ['charx-archive-integrity:package-dependency:1.10'],
            targetVersions: target1100,
        },
        {
            id: 'charx-archive-integrity:lock-package:1.10',
            file: 'pnpm-lock.yaml',
            type: 'insert',
            where: 'before',
            anchor: `  accepts@1.3.8:\n    resolution: {integrity: sha512-PYAthTa2m2VKxuvSD3DPC/Gy+U+sOA1LAuT8mkmRuvw+NACSaeXEQ+NHcVF7rONl6qcaxV3Uuemwawk+7+SJLw==}\n`,
            managed: `  '@zip.js/zip.js@2.8.55':\n    resolution: {integrity: sha512-MxnikN49/iB2AQOSUBjxlGYLsbEblCsZ5S84tmt+hcBlYCQQKG0qKO7UNX0AzFS8a5KlS8cyvwjZV3nNTF6WuQ==}\n    engines: {bun: '>=0.7.0', deno: '>=1.0.0', node: '>=18.0.0'}\n\n`,
            requires: ['charx-archive-integrity:lock-importer:1.10'],
            targetVersions: target1100,
        },
        {
            id: 'charx-archive-integrity:lock-snapshot:1.10',
            file: 'pnpm-lock.yaml',
            type: 'insert',
            where: 'before',
            anchor: `  accepts@1.3.8:\n    dependencies:\n      mime-types: 2.1.35\n`,
            managed: `  '@zip.js/zip.js@2.8.55': {}\n\n`,
            requires: ['charx-archive-integrity:lock-package:1.10'],
            targetVersions: target1100,
        },
        {
            id: 'charx-archive-integrity:archive-engine:1.10',
            file: 'src/ts/process/charxArchive.ts',
            type: 'owned',
            content: read(files, 'src/ts/process/charxArchive.ts'),
            requires: ['charx-archive-integrity:lock-snapshot:1.10'],
            targetVersions: target1100,
        },
        {
            id: 'charx-archive-integrity:import-session:1.10',
            file: 'src/ts/process/charxImportSession.ts',
            type: 'owned',
            content: read(files, 'src/ts/process/charxImportSession.ts'),
            requires: ['charx-archive-integrity:archive-engine:1.10'],
            targetVersions: target1100,
        },
        {
            id: 'charx-archive-integrity:test-fixtures:1.10',
            file: 'src/ts/process/charxTestFixtures.ts',
            type: 'owned',
            content: read(files, 'src/ts/process/charxTestFixtures.ts'),
            requires: ['charx-archive-integrity:import-session:1.10'],
            targetVersions: target1100,
        },
        {
            id: 'charx-archive-integrity:archive-tests:1.10',
            file: 'src/ts/process/charxArchive.test.ts',
            type: 'owned',
            content: read(files, 'src/ts/process/charxArchive.test.ts'),
            requires: ['charx-archive-integrity:test-fixtures:1.10'],
            targetVersions: target1100,
        },
        {
            id: 'charx-archive-integrity:session-tests:1.10',
            file: 'src/ts/process/charxImportSession.test.ts',
            type: 'owned',
            content: read(files, 'src/ts/process/charxImportSession.test.ts'),
            requires: ['charx-archive-integrity:archive-tests:1.10'],
            targetVersions: target1100,
        },
        {
            id: 'charx-archive-integrity:processzip-import:1.10',
            file: 'src/ts/process/processzip.ts',
            type: 'insert',
            where: 'after',
            anchor: `import { hubURL } from "../characterCards";\n`,
            content: `import { CharXArchiveError, type CharXContainerHint } from "./charxArchive";\nimport { charXSource, importCharX, type CharXImportReceipt } from "./charxImportSession";\n`,
            requires: ['charx-archive-integrity:session-tests:1.10'],
            targetVersions: target1100,
        },
        {
            id: 'charx-archive-integrity:processzip-util-import:1.10',
            file: 'src/ts/process/processzip.ts',
            type: 'replace',
            anchor: `import { asBuffer, Semaphore, sleep } from "../util";`,
            content: `import { asBuffer } from "../util";`,
            requires: ['charx-archive-integrity:processzip-import:1.10'],
            targetVersions: target1100,
        },
        {
            id: 'charx-archive-integrity:processzip-constants:1.10',
            file: 'src/ts/process/processzip.ts',
            type: 'replace',
            anchor: `// File size and chunk size constants\nconst MAX_ASSET_SIZE_BYTES = 50 * 1024 * 1024; // 50MB\nconst CHUNK_SIZE_BYTES = 1024 * 1024; // 1MB\n\n// Queue management constants\nconst MAX_CONCURRENT_ASSET_SAVES = 10;\n\n`,
            content: '',
            requires: ['charx-archive-integrity:processzip-util-import:1.10'],
            targetVersions: target1100,
        },
        {
            id: 'charx-archive-integrity:processzip-importer:1.10',
            file: 'src/ts/process/processzip.ts',
            type: 'replace',
            anchor: sliceImporter(processZipAnchor),
            managed: read(files, 'src/ts/process/CharXImporter.txt'),
            requires: ['charx-archive-integrity:processzip-constants:1.10'],
            before: ['character-import-ux:charx-progress-callback'],
            targetVersions: target1100,
        },
        {
            id: 'charx-archive-integrity:character-import-counter:1.10',
            file: 'src/ts/characterCards.ts',
            type: 'replace',
            anchor: `    let db = getDatabase()\n    db.statics.imports += 1\n\n    if(f.name.endsWith('charx') || f.name.endsWith('jpg') || f.name.endsWith('jpeg')){\n`,
            content: `    let db = getDatabase()\n\n    if(f.name.endsWith('charx') || f.name.endsWith('jpg') || f.name.endsWith('jpeg')){\n`,
            after: [
                'character-import-ux:character-cards',
                'personal-settings:realm-import-navigation',
            ],
            requires: ['charx-archive-integrity:processzip-importer:1.10'],
            targetVersions: target1100,
        },
        {
            id: 'charx-archive-integrity:character-terminal-receipt:1.10',
            file: 'src/ts/characterCards.ts',
            type: 'replace',
            anchor: `        await importer.parse(f.data)\n        const cardData = importer.cardData\n        if(!cardData){\n            alertError(language.errors.noData)\n            return\n        }\n        const card:CharacterCardV3 = JSON.parse(cardData)\n        if(card.spec !== 'chara_card_v3'){\n            alertError(language.errors.noData)\n            return\n        }\n        let lorebook:loreBook[] = null\n        if(importer.moduleData){\n            const md = await readModule(Buffer.from(importer.moduleData))\n            card.data.extensions ??= {}\n            card.data.extensions.risuai ??= {}\n            card.data.extensions.risuai.triggerscript = md.trigger ?? []\n            card.data.extensions.risuai.customScripts = md.regex ?? []\n            if(md.lorebook){\n                lorebook = md.lorebook\n            }\n        }\n        await importer.done()\n`,
            content: `        const receipt = await importer.import(\n            f.data,\n            f.name.endsWith('charx') ? 'zip' : 'jpeg',\n        )\n        const card = receipt.card\n        let lorebook:loreBook[] = null\n        if(receipt.moduleData){\n            const md = await readModule(Buffer.from(receipt.moduleData))\n            if(!md) throw new Error('Invalid CharX module')\n            card.data.extensions ??= {}\n            card.data.extensions.risuai ??= {}\n            card.data.extensions.risuai.triggerscript = md.trigger ?? []\n            card.data.extensions.risuai.customScripts = md.regex ?? []\n            if(md.lorebook){\n                lorebook = md.lorebook\n            }\n        }\n`,
            requires: ['charx-archive-integrity:character-import-counter:1.10'],
            targetVersions: target1100,
        },
        {
            id: 'charx-archive-integrity:character-asset-map:1.10',
            file: 'src/ts/characterCards.ts',
            type: 'replace',
            anchor: `importer.assets`,
            content: `Object.fromEntries(receipt.assets)`,
            requires: ['charx-archive-integrity:character-terminal-receipt:1.10'],
            targetVersions: target1100,
        },
        {
            id: 'charx-archive-integrity:character-commit-boundary:1.10',
            file: 'src/ts/characterCards.ts',
            type: 'insert',
            where: 'before',
            anchor: `        if(f.returnCharacter){\n            return v as any\n        }\n`,
            content: `        if(!v) return null as any\n        if(!f.returnCharacter) getDatabase().statics.imports += 1\n`,
            requires: ['charx-archive-integrity:character-asset-map:1.10'],
            targetVersions: target1100,
        },
        {
            id: 'charx-archive-integrity:non-charx-counter:1.10',
            file: 'src/ts/characterCards.ts',
            type: 'insert',
            where: 'before',
            anchor: `    if(!f.name.endsWith('png')){\n`,
            content: `    getDatabase().statics.imports += 1\n\n`,
            requires: ['charx-archive-integrity:character-commit-boundary:1.10'],
            targetVersions: target1100,
        },
    ],
}
