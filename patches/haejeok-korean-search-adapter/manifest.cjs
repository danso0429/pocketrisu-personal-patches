'use strict'

const fs = require('node:fs')
const path = require('node:path')

const filesRoot = path.join(__dirname, 'files')
const owned = (relative) => fs.readFileSync(path.join(filesRoot, relative), 'utf8')
const files116Root = path.join(__dirname, 'files-1.16')
const owned116 = (relative) => fs.readFileSync(path.join(files116Root, relative), 'utf8')
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
    version: '0.1.1',
    source: 'Haejeok RisuAI e9d03568 Korean search adaptation',
    targets: {
        pocketrisu: {
            verified: [],
            reviewing: ['1.16.1'],
        },
    },
    userSelectable: true,
    units: [
        {
            id: 'haejeok-korean-search-adapter:package-dependency:1.10',
            file: 'package.json',
            type: 'insert',
            where: 'after',
            anchor: `    "dompurify": "^3.3.3",\n`,
            managed: `    "es-hangul": "2.4.0",\n`,
            after: dependencyOwners,
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
        },
        {
            id: 'haejeok-korean-search-adapter:matcher:1.10',
            file: 'src/ts/haejeokKoreanSearch.ts',
            type: 'owned',
            content: owned('src/ts/haejeokKoreanSearch.ts'),
            requires: ['haejeok-korean-search-adapter:lock-snapshot:1.10'],
        },
        {
            id: 'haejeok-korean-search-adapter:matcher-tests:1.10',
            file: 'src/ts/haejeokKoreanSearch.test.ts',
            type: 'owned',
            content: owned('src/ts/haejeokKoreanSearch.test.ts'),
            requires: ['haejeok-korean-search-adapter:matcher:1.10'],
        },
        {
            id: 'haejeok-korean-search-adapter:manager-import:1.16',
            file: 'src/ts/characterManager.ts',
            type: 'insert',
            where: 'after',
            anchor: `import { isFolderEntry, type OrderEntry } from './characterOrder'\n`,
            content: `import { matchCharacterKorean } from './haejeokKoreanSearch'\n`,
            requires: ['haejeok-korean-search-adapter:matcher:1.10'],
        },
        {
            id: 'haejeok-korean-search-adapter:manager-entry-fields:1.16',
            file: 'src/ts/characterManager.ts',
            type: 'insert',
            where: 'after',
            anchor: `    trashed: boolean\n`,
            content: `    /** Creator of a live character; deactivated stubs have none. */
    creator?: string
    /** Tags of a live character; deactivated stubs have none. */
    tags?: string[]
`,
        },
        {
            id: 'haejeok-korean-search-adapter:manager-entry-values:1.16',
            file: 'src/ts/characterManager.ts',
            type: 'insert',
            where: 'after',
            anchor: `            trashed: !!c.trashTime,\n`,
            content: `            creator: c.creator,
            tags: c.tags,
`,
            requires: ['haejeok-korean-search-adapter:manager-entry-fields:1.16'],
        },
        {
            id: 'haejeok-korean-search-adapter:manager-search:1.16',
            file: 'src/ts/characterManager.ts',
            type: 'insert',
            where: 'before',
            anchor: `export function matchesFilter(entry: ManagerEntry, filter: ManagerFilter): boolean {\n`,
            content: `/**
 * Manager search over name, creator and tags. Every entry the native name
 * search keeps stays in the result; the Korean matcher (choseong, jamo,
 * romanization, keyboard conversion) can only add entries.
 */
export function matchesCharacterSearch(entry: ManagerEntry, search: string): boolean {
    if (matchesSearch(entry.name, search)) return true
    return matchCharacterKorean(entry, search).matched
}
`,
            requires: [
                'haejeok-korean-search-adapter:manager-import:1.16',
                'haejeok-korean-search-adapter:manager-entry-fields:1.16',
            ],
        },
        {
            id: 'haejeok-korean-search-adapter:manager-search-tests:1.16',
            file: 'src/ts/characterManager.e2-4.test.ts',
            type: 'owned',
            content: owned116('src/ts/characterManager.e2-4.test.ts'),
            requires: [
                'haejeok-korean-search-adapter:manager-entry-values:1.16',
                'haejeok-korean-search-adapter:manager-search:1.16',
            ],
        },
        {
            id: 'haejeok-korean-search-adapter:component-import:1.16',
            file: 'src/lib/CharacterManager/CharacterManager.svelte',
            type: 'replace',
            anchor: `    import {
        buildGridSections, buildManagerEntries, matchesFilter, matchesSearch, sortEntries,
        type ManagerEntry, type ManagerFilter, type ManagerSort,
    } from "src/ts/characterManager";`,
            content: `    import {
        buildGridSections, buildManagerEntries, matchesCharacterSearch, matchesFilter, sortEntries,
        type ManagerEntry, type ManagerFilter, type ManagerSort,
    } from "src/ts/characterManager";`,
            requires: ['haejeok-korean-search-adapter:manager-search:1.16'],
        },
        {
            id: 'haejeok-korean-search-adapter:component-trash-search:1.16',
            file: 'src/lib/CharacterManager/CharacterManager.svelte',
            type: 'replace',
            anchor: `    let trashEntries = $derived([...entries.values()].filter((e) => e.trashed).filter((e) => matchesSearch(e.name, search)));`,
            content: `    let trashEntries = $derived([...entries.values()].filter((e) => e.trashed).filter((e) => matchesCharacterSearch(e, search)));`,
            requires: ['haejeok-korean-search-adapter:component-import:1.16'],
        },
        {
            id: 'haejeok-korean-search-adapter:component-visible-search:1.16',
            file: 'src/lib/CharacterManager/CharacterManager.svelte',
            type: 'replace',
            anchor: `    let visible = $derived((e: ManagerEntry) => matchesSearch(e.name, search) && matchesFilter(e, filter));`,
            content: `    let visible = $derived((e: ManagerEntry) => matchesCharacterSearch(e, search) && matchesFilter(e, filter));`,
            requires: ['haejeok-korean-search-adapter:component-import:1.16'],
        },
    ],
}
