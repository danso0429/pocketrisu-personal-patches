'use strict'

const fs = require('node:fs')
const path = require('node:path')

const filesRoot = path.join(__dirname, 'files')
const owned = (relative) => fs.readFileSync(path.join(filesRoot, relative), 'utf8')
const pocketRisu1100 = { pocketrisu: ['1.10.0'] }
const dependencyOwners = [
    'charx-archive-integrity:package-dependency:1.10',
    'charx-archive-integrity:lock-importer:1.10',
    'charx-archive-integrity:lock-package:1.10',
    'charx-archive-integrity:lock-snapshot:1.10',
    'toolchain-hardening:package-lightningcss-override',
    'toolchain-hardening:lock-lightningcss-override',
    'toolchain-hardening:lock-lightningcss-packages',
    'toolchain-hardening:lock-tailwind-lightningcss',
    'toolchain-hardening:lock-lightningcss-snapshots',
    'toolchain-hardening:lock-vite-lightningcss',
]

module.exports = {
    id: 'haejeok-korean-search-adapter',
    title: 'Haejeok Korean character search adapter',
    version: '0.1.0',
    source: 'Haejeok RisuAI e9d03568 Korean search adaptation',
    targets: {
        pocketrisu: {
            // No units apply to these historical targets.
            verified: ['1.8.1', '1.9.0', '1.10.0'],
            reviewing: [],
        },
    },
    userSelectable: false,
    requires: ['character-organizer'],
    autoWhen: {
        all: ['character-organizer'],
    },
    units: [
        {
            id: 'haejeok-korean-search-adapter:package-dependency:1.10',
            file: 'package.json',
            type: 'insert',
            where: 'after',
            anchor: `    "dompurify": "^3.3.3",\n`,
            managed: `    "es-hangul": "2.4.0",\n`,
            after: dependencyOwners,
            targetVersions: pocketRisu1100,
        },
        {
            id: 'haejeok-korean-search-adapter:lock-importer:1.10',
            file: 'pnpm-lock.yaml',
            type: 'insert',
            where: 'after',
            anchor: `      dompurify:
        specifier: ^3.3.3
        version: 3.3.3
`,
            managed: `      es-hangul:
        specifier: 2.4.0
        version: 2.4.0
`,
            requires: ['haejeok-korean-search-adapter:package-dependency:1.10'],
            after: dependencyOwners,
            targetVersions: pocketRisu1100,
        },
        {
            id: 'haejeok-korean-search-adapter:lock-package:1.10',
            file: 'pnpm-lock.yaml',
            type: 'insert',
            where: 'before',
            anchor: `  es-module-lexer@2.0.0:
`,
            managed: `  es-hangul@2.4.0:
    resolution: {integrity: sha512-9ouVct+rsUw7d5+JeyEV+Lf4PAytSK4cWnLGHM4FJDyG9BS5d3iSPnEmH/rVgmSyxyps5cWZ+NeDAlJyq8eKaw==}

`,
            requires: ['haejeok-korean-search-adapter:lock-importer:1.10'],
            after: dependencyOwners,
            targetVersions: pocketRisu1100,
        },
        {
            id: 'haejeok-korean-search-adapter:lock-snapshot:1.10',
            file: 'pnpm-lock.yaml',
            type: 'insert',
            where: 'before',
            anchor: `  es-module-lexer@2.0.0: {}
`,
            managed: `  es-hangul@2.4.0: {}

`,
            requires: ['haejeok-korean-search-adapter:lock-package:1.10'],
            after: dependencyOwners,
            targetVersions: pocketRisu1100,
        },
        {
            id: 'haejeok-korean-search-adapter:matcher:1.10',
            file: 'src/ts/haejeokKoreanSearch.ts',
            type: 'owned',
            content: owned('src/ts/haejeokKoreanSearch.ts'),
            requires: ['haejeok-korean-search-adapter:lock-snapshot:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'haejeok-korean-search-adapter:matcher-tests:1.10',
            file: 'src/ts/haejeokKoreanSearch.test.ts',
            type: 'owned',
            content: owned('src/ts/haejeokKoreanSearch.test.ts'),
            requires: ['haejeok-korean-search-adapter:matcher:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'haejeok-korean-search-adapter:grid-import:1.10',
            file: 'src/lib/Others/GridCatalog.svelte',
            type: 'insert',
            where: 'after',
            anchor: `    import { checkCharOrder } from "src/ts/globalApi.svelte";\n`,
            content: `    import { matchCharacterKorean } from "src/ts/haejeokKoreanSearch";\n`,
            requires: ['haejeok-korean-search-adapter:matcher:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'haejeok-korean-search-adapter:grid-filter:1.10',
            file: 'src/lib/Others/GridCatalog.svelte',
            type: 'replace',
            anchor: `            if(c.name.replace(/ /g,"").toLocaleLowerCase().includes(search.toLocaleLowerCase().replace(/ /g,""))){
`,
            content: `            if(matchCharacterKorean(c, search).matched){
`,
            requires: ['haejeok-korean-search-adapter:grid-import:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'haejeok-korean-search-adapter:mobile-import:1.10',
            file: 'src/lib/Mobile/MobileCharacters.svelte',
            type: 'insert',
            where: 'after',
            anchor: `    import { makeAgoText } from "src/ts/util";\n`,
            content: `    import { matchCharacterKorean } from "src/ts/haejeokKoreanSearch";\n`,
            requires: ['haejeok-korean-search-adapter:matcher:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'haejeok-korean-search-adapter:mobile-search-fields:1.10',
            file: 'src/lib/Mobile/MobileCharacters.svelte',
            type: 'insert',
            where: 'after',
            anchor: `                type: c.type,
`,
            content: `                creator: c.creator,
                tags: c.tags,
`,
            requires: ['haejeok-korean-search-adapter:mobile-import:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'haejeok-korean-search-adapter:mobile-filter:1.10',
            file: 'src/lib/Mobile/MobileCharacters.svelte',
            type: 'replace',
            anchor: `        {#if char.name.replace(/ /g,"").toLocaleLowerCase().includes(search.replace(/ /g,"").toLocaleLowerCase())}
`,
            managed: `        {#if matchCharacterKorean(char, search).matched}
`,
            requires: ['haejeok-korean-search-adapter:mobile-search-fields:1.10'],
            targetVersions: pocketRisu1100,
        },
    ],
}
