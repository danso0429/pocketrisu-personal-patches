'use strict'

const fs = require('node:fs')
const path = require('node:path')

const anchorsRoot = path.join(__dirname, 'anchors')
const filesRoot = path.join(__dirname, 'files')
const anchors110Root = path.join(__dirname, 'anchors-1.10')
const files110Root = path.join(__dirname, 'files-1.10')
const read = (root, relative) => fs.readFileSync(path.join(root, relative), 'utf8')
const target181Through110 = { pocketrisu: ['1.8.1', '1.9.0', '1.10.0'] }

module.exports = {
    id: 'character-import-ux',
    title: 'Non-blocking character and module import',
    version: '0.2.2',
    targets: {
        pocketrisu: {
            verified: ['1.8.1', '1.9.0'],
            reviewing: ['1.10.0'],
        },
    },
    userSelectable: true,
    presetDefaults: ['features'],
    requires: ['lazy-chat-sync'],
    units: [
        {
            id: 'character-import-ux:toast',
            file: 'src/lib/Others/CharacterImportToast.svelte',
            type: 'owned',
            content: read(filesRoot, 'src/lib/Others/CharacterImportToast.svelte'),
        },
        {
            id: 'character-import-ux:state',
            file: 'src/ts/characterImportState.ts',
            type: 'owned',
            content: read(filesRoot, 'src/ts/characterImportState.ts'),
            requires: ['character-import-ux:toast'],
        },
        {
            id: 'character-import-ux:state-tests',
            file: 'src/ts/characterImportState.test.ts',
            type: 'owned',
            content: read(filesRoot, 'src/ts/characterImportState.test.ts'),
            requires: ['character-import-ux:state'],
        },
        {
            id: 'character-import-ux:charx-progress-callback',
            file: 'src/ts/process/processzip.ts',
            type: 'insert',
            where: 'before',
            anchor: `    /**
     * High-level method to parse ZIP data from various sources.
`,
            content: `    setProgressHandler(handler: (done: number, total: number) => void): void {
        this.onProgress = handler
    }

`,
        },
        {
            id: 'character-import-ux:character-cards',
            file: 'src/ts/characterCards.ts',
            type: 'replace',
            anchor: read(anchorsRoot, 'src/ts/characterCards.ts'),
            managed: read(filesRoot, 'src/ts/characterCards.ts'),
            requires: [
                'character-import-ux:state',
                'character-import-ux:charx-progress-callback',
            ],
            after: [
                'lazy-chat-sync:replace:src:ts:globalApi-svelte-ts',
                'lazy-chat-sync:replace:src:ts:globalApi-svelte-ts:1.9',
            ],
        },
        {
            id: 'character-import-ux:module-import-core',
            file: 'src/ts/process/moduleImport.ts',
            type: 'owned',
            content: read(files110Root, 'src/ts/process/moduleImport.ts'),
            requires: ['character-import-ux:state'],
            targetVersions: target181Through110,
        },
        {
            id: 'character-import-ux:risum-reader',
            file: 'src/ts/process/risumImport.ts',
            type: 'owned',
            content: read(files110Root, 'src/ts/process/risumImport.ts'),
            requires: ['character-import-ux:module-import-core'],
            targetVersions: target181Through110,
        },
        {
            id: 'character-import-ux:module-import-tests',
            file: 'src/ts/process/moduleImport.test.ts',
            type: 'owned',
            content: read(files110Root, 'src/ts/process/moduleImport.test.ts'),
            requires: ['character-import-ux:risum-reader'],
            targetVersions: target181Through110,
        },
        {
            id: 'character-import-ux:risum-reader-tests',
            file: 'src/ts/process/risumImport.test.ts',
            type: 'owned',
            content: read(files110Root, 'src/ts/process/risumImport.test.ts'),
            requires: ['character-import-ux:module-import-tests'],
            targetVersions: target181Through110,
        },
        {
            id: 'character-import-ux:modules-alert-imports',
            file: 'src/ts/process/modules.ts',
            type: 'replace',
            anchor: `import { alertClear, alertConfirm, alertError, alertModuleSelect, alertNormal, alertStore, alertWait, notifySuccess } from "../alert"`,
            content: `import { alertConfirm, alertModuleSelect, alertNormal, alertStore, notifySuccess } from "../alert"`,
            requires: ['character-import-ux:risum-reader-tests'],
            targetVersions: target181Through110,
        },
        {
            id: 'character-import-ux:modules-database-imports',
            file: 'src/ts/process/modules.ts',
            type: 'replace',
            anchor: `import { getCurrentCharacter, getCurrentChat, getDatabase, setCurrentCharacter, setDatabase, type customscript, type loreBook, type triggerscript } from "../storage/database.svelte"`,
            content: `import { getCurrentCharacter, getCurrentChat, getDatabase, setCurrentCharacter, type customscript, type loreBook, type triggerscript } from "../storage/database.svelte"`,
            requires: ['character-import-ux:modules-alert-imports'],
            targetVersions: target181Through110,
        },
        {
            id: 'character-import-ux:modules-global-api-imports',
            file: 'src/ts/process/modules.ts',
            type: 'replace',
            anchor: `import { AppendableBuffer, downloadFile, forageStorage, LocalWriter, readImage, saveAsset, VirtualWriter } from "../globalApi.svelte"`,
            content: `import { AppendableBuffer, downloadFile, forageStorage, LocalWriter, readImage, requestImportedModuleSave, saveAsset, VirtualWriter } from "../globalApi.svelte"`,
            requires: ['character-import-ux:modules-database-imports'],
            targetVersions: target181Through110,
        },
        {
            id: 'character-import-ux:modules-util-imports',
            file: 'src/ts/process/modules.ts',
            type: 'replace',
            anchor: `import { checkPersonaBinded, selectSingleFile, sleep } from "../util"`,
            content: `import { checkPersonaBinded } from "../util"`,
            requires: ['character-import-ux:modules-global-api-imports'],
            targetVersions: target181Through110,
        },
        {
            id: 'character-import-ux:modules-rpack-imports',
            file: 'src/ts/process/modules.ts',
            type: 'replace',
            anchor: `import { decodeRPack, encodeRPack } from "../rpack/rpack_js"`,
            content: `import { encodeRPack } from "../rpack/rpack_js"`,
            requires: ['character-import-ux:modules-util-imports'],
            targetVersions: target181Through110,
        },
        {
            id: 'character-import-ux:modules-orchestrator-imports',
            file: 'src/ts/process/modules.ts',
            type: 'insert',
            where: 'after',
            anchor: `import { exportCharacterCard, importCharacterProcess } from "../characterCards"\n`,
            content: `import { beginModuleImport, formatImportProgress, reserveImport } from "../characterImportState"\nimport { createModuleImportOrchestrator, selectModuleImportFile, type ModuleImportResult, type ModuleImportSource } from "./moduleImport"\nimport { materializeRisuModule, prepareRisuModule } from "./risumImport"\n`,
            requires: ['character-import-ux:modules-rpack-imports'],
            after: ['bg-preserve:hook:modules-source-aware-cache-import'],
            targetVersions: target181Through110,
        },
        {
            id: 'character-import-ux:modules-terminal-import',
            file: 'src/ts/process/modules.ts',
            type: 'replace',
            anchor: read(anchors110Root, 'src/ts/process/moduleImportLegacy.txt'),
            managed: read(files110Root, 'src/ts/process/moduleImportManaged.txt'),
            requires: ['character-import-ux:modules-orchestrator-imports'],
            targetVersions: target181Through110,
        },
        {
            id: 'character-import-ux:character-reporter-type',
            file: 'src/ts/characterCards.ts',
            type: 'replace',
            anchor: `import { beginCharacterImport, formatCharacterImportProgress, type CharacterImportJob } from "./characterImportState"`,
            content: `import { beginCharacterImport, formatCharacterImportProgress, type CharacterImportJob, type ImportProgressReporter } from "./characterImportState"`,
            after: [
                'character-import-ux:character-cards',
                'charx-archive-integrity:character-import-counter:1.10',
                'charx-archive-integrity:character-terminal-receipt:1.10',
                'charx-archive-integrity:character-asset-map:1.10',
                'charx-archive-integrity:character-commit-boundary:1.10',
                'charx-archive-integrity:non-charx-counter:1.10',
                'personal-settings:realm-import-navigation',
            ],
            requires: ['character-import-ux:modules-terminal-import'],
            targetVersions: target181Through110,
        },
        {
            id: 'character-import-ux:character-reporter-option',
            file: 'src/ts/characterCards.ts',
            type: 'insert',
            where: 'after',
            anchor: `    suppressImportJob?:boolean\n`,
            content: `    /** Update-only reporter owned by a parent module import. */\n    progressReporter?:ImportProgressReporter\n`,
            requires: ['character-import-ux:character-reporter-type'],
            targetVersions: target181Through110,
        },
        {
            id: 'character-import-ux:character-reporter-dispatch',
            file: 'src/ts/characterCards.ts',
            type: 'replace',
            anchor: `):Promise<T extends true ? character | number | null : number | null>{\n    if (f.returnCharacter || f.suppressImportJob) {\n`,
            content: `):Promise<T extends true ? character | number | null : number | null>{\n    if (f.progressReporter) {\n        return await importCharacterProcessInternal(f, f.progressReporter)\n    }\n    if (f.returnCharacter || f.suppressImportJob) {\n`,
            requires: ['character-import-ux:character-reporter-option'],
            targetVersions: target181Through110,
        },
        {
            id: 'character-import-ux:character-reporter-internal-type',
            file: 'src/ts/characterCards.ts',
            type: 'replace',
            anchor: `    importJob: CharacterImportJob | null,\n`,
            content: `    importJob: ImportProgressReporter | null,\n`,
            requires: ['character-import-ux:character-reporter-dispatch'],
            targetVersions: target181Through110,
        },
        {
            id: 'character-import-ux:character-reporter-spec-type',
            file: 'src/ts/characterCards.ts',
            type: 'replace',
            anchor: `    importJob: CharacterImportJob | null = null,\n`,
            content: `    importJob: ImportProgressReporter | null = null,\n`,
            requires: ['character-import-ux:character-reporter-internal-type'],
            targetVersions: target181Through110,
        },
        {
            id: 'character-import-ux:embedded-module-low-level',
            file: 'src/ts/characterCards.ts',
            type: 'insert',
            where: 'after',
            anchor: `            if(md.lorebook){\n                lorebook = md.lorebook\n            }\n`,
            content: `            if(md.lowLevelAccess){\n                card.data.extensions.risuai.lowLevelAccess = true\n            }\n`,
            requires: ['character-import-ux:character-reporter-spec-type'],
            targetVersions: target181Through110,
        },
        {
            id: 'character-import-ux:character-module-source-import',
            file: 'src/ts/characterCards.ts',
            type: 'replace',
            anchor: `import { exportModuleLegacy, readModule, type RisuModule } from "./process/modules"`,
            content: `import { exportModuleLegacy, importModuleSource, readModule, type RisuModule } from "./process/modules"`,
            requires: ['character-import-ux:embedded-module-low-level'],
            targetVersions: target181Through110,
        },
        {
            id: 'character-import-ux:character-hash-module-route',
            file: 'src/ts/characterCards.ts',
            type: 'replace',
            anchor: `    if(hash.startsWith('#import_module=')){\n        const data = hash.replace('#import_module=', '')\n        const importData = JSON.parse(Buffer.from(decodeURIComponent(data), 'base64').toString('utf-8'))\n        importData.id = v4()\n\n        const db = getDatabase()\n        if(importData.lowLevelAccess){\n            const conf = await alertConfirm(language.lowLevelAccessConfirm)\n            if(!conf){\n                return false\n            }\n        }\n        db.modules.push(importData)\n        notifySuccess(language.successImport)\n        openSettings(SettingsRoute.Module)\n        return\n    }\n`,
            content: `    if(hash.startsWith('#import_module=')){\n        let data: Uint8Array\n        try {\n            data = new Uint8Array(Buffer.from(\n                decodeURIComponent(hash.replace('#import_module=', '')),\n                'base64',\n            ))\n        } catch {\n            data = new Uint8Array()\n        }\n        const result = await importModuleSource({\n            name: 'imported-module.json',\n            data,\n            origin: 'hash',\n        })\n        if(result.status === 'imported') openSettings(SettingsRoute.Module)\n        return\n    }\n`,
            requires: ['character-import-ux:character-module-source-import'],
            targetVersions: target181Through110,
        },
        {
            id: 'character-import-ux:character-share-module-route',
            file: 'src/ts/characterCards.ts',
            type: 'replace',
            anchor: `    if(hash.startsWith('#share_module')){\n        const data = await fetch("/sw/share/module")\n        if(data.status !== 200){\n            return\n        }\n        const module = new Uint8Array(await data.arrayBuffer())\n        const md = await readModule(Buffer.from(module))\n        md.id = v4()\n        const db = getDatabase()\n        db.modules.push(md)\n        notifySuccess(language.successImport)\n        openSettings(SettingsRoute.Module)\n    }\n`,
            content: `    if(hash.startsWith('#share_module')){\n        const data = await fetch("/sw/share/module")\n        if(data.status !== 200) return\n        const result = await importModuleSource({\n            name: 'shared.risum',\n            data: new Uint8Array(await data.arrayBuffer()),\n            origin: 'share',\n        })\n        if(result.status === 'imported') openSettings(SettingsRoute.Module)\n    }\n`,
            requires: ['character-import-ux:character-hash-module-route'],
            targetVersions: target181Through110,
        },
        {
            id: 'character-import-ux:character-file-module-route',
            file: 'src/ts/characterCards.ts',
            type: 'replace',
            anchor: `        if(name.endsWith('risum')){\n            const md = await readModule(Buffer.from(data))\n            md.id = v4()\n            const db = getDatabase()\n            db.modules.push(md)\n            notifySuccess(language.successImport)\n            openSettings(SettingsRoute.Module)\n            return\n        }\n`,
            content: `        if(name.toLowerCase().endsWith('.risum')){\n            const result = await importModuleSource({ name, data, origin: 'launch' })\n            if(result.status === 'imported') openSettings(SettingsRoute.Module)\n            return\n        }\n`,
            requires: ['character-import-ux:character-share-module-route'],
            targetVersions: target181Through110,
        },
        {
            id: 'character-import-ux:module-settings-await',
            file: 'src/lib/Setting/Pages/Module/ModuleSettings.svelte',
            type: 'replace',
            anchor: `            importModule()\n`,
            content: `            await importModule()\n`,
            requires: ['character-import-ux:character-file-module-route'],
            targetVersions: target181Through110,
        },
        {
            id: 'character-import-ux:app-module-import',
            file: 'src/App.svelte',
            type: 'replace',
            anchor: `    import { readModule } from './ts/process/modules';`,
            content: `    import { importModuleSource } from './ts/process/modules';\n    import { openSettings, SettingsRoute } from './ts/routing';`,
            requires: ['character-import-ux:module-settings-await'],
            after: ['bg-preserve:hook:app-svelte-safe-mobile-file-drop'],
            targetVersions: target181Through110,
        },
        {
            id: 'character-import-ux:app-module-drop',
            file: 'src/App.svelte',
            type: 'replace',
            anchor: `    } else if (name.endsWith('.risum')) {\n        const data = new Uint8Array(await file.arrayBuffer())\n        const module = await readModule(Buffer.from(data))\n        const db = getDatabase()\n        db.modules.push(module)\n        notifySuccess(language.successImport)\n`,
            content: `    } else if (name.endsWith('.risum')) {\n        const result = await importModuleSource({ name: file.name, data: file, origin: 'drop' })\n        if(result.status === 'imported') openSettings(SettingsRoute.Module)\n`,
            requires: ['character-import-ux:app-module-import'],
            targetVersions: { pocketrisu: ['1.9.0', '1.10.0'] },
        },
        {
            id: 'character-import-ux:app-module-drop:1.8',
            file: 'src/App.svelte',
            type: 'replace',
            anchor: `        } else if (name.endsWith('.risum')) {\n            const data = new Uint8Array(await file.arrayBuffer())\n            const module = await readModule(Buffer.from(data))\n            const db = getDatabase()\n            db.modules.push(module)\n            notifySuccess(language.successImport)\n`,
            content: `        } else if (name.endsWith('.risum')) {\n            const result = await importModuleSource({ name: file.name, data: file, origin: 'drop' })\n            if(result.status === 'imported') openSettings(SettingsRoute.Module)\n`,
            requires: ['character-import-ux:app-module-import'],
            targetVersions: { pocketrisu: ['1.8.1'] },
        },
        {
            id: 'character-import-ux:share-get-route',
            file: 'public/sw.js',
            type: 'insert',
            where: 'after',
            anchor: `                case 'share':{\n`,
            content: `                    if(event.request.method === 'GET' && path[3]){\n                        event.respondWith(getSource(url))\n                        break\n                    }\n                    if(event.request.method !== 'POST'){\n                        event.respondWith(new Response('Method not allowed', { status: 405 }))\n                        break\n                    }\n`,
            requires: ['character-import-ux:app-module-import'],
            targetVersions: target181Through110,
        },
        {
            id: 'character-import-ux:share-cache-url-base',
            file: 'public/sw.js',
            type: 'replace',
            anchor: `    const url = new URL(urlr)\n`,
            content: `    const url = new URL(urlr, self.location.origin)\n`,
            requires: ['character-import-ux:share-get-route'],
            targetVersions: target181Through110,
        },
        {
            id: 'character-import-ux:share-cache-miss',
            file: 'public/sw.js',
            type: 'replace',
            anchor: `async function getSource(url){\n    const cache = await caches.open('risuCache')\n    return await cache.match(url)\n}\n`,
            content: `async function getSource(url){\n    const cache = await caches.open('risuCache')\n    return await cache.match(url) ?? new Response('Cached share not found', { status: 404 })\n}\n`,
            requires: ['character-import-ux:share-cache-url-base'],
            targetVersions: target181Through110,
        },
        {
            id: 'character-import-ux:share-transport-tests',
            file: 'server/node/moduleShareServiceWorker.test.ts',
            type: 'owned',
            content: read(files110Root, 'server/node/moduleShareServiceWorker.test.ts'),
            requires: ['character-import-ux:share-cache-miss'],
            targetVersions: target181Through110,
        },
        {
            id: 'character-import-ux:package-keeps-parent-progress',
            file: 'src/ts/characterPackage.ts',
            type: 'replace',
            anchor: `            const result = await importCharacterProcess({
                name: manifest.character.file.split('/').pop() || 'package.charx',
                data: charxBytes
            })
`,
            content: `            const result = await importCharacterProcess({
                name: manifest.character.file.split('/').pop() || 'package.charx',
                data: charxBytes,
                suppressImportJob: true,
            })
`,
            requires: ['character-import-ux:character-cards'],
        },
        {
            id: 'character-import-ux:backup-guard-import',
            file: 'src/ts/drive/backuplocal.ts',
            type: 'insert',
            where: 'after',
            anchor: `import { language } from "src/lang";
`,
            content: `import { allowDuringCharacterImport } from "../characterImportState";
`,
            requires: ['character-import-ux:state'],
        },
        {
            id: 'character-import-ux:local-backup-restore-guard',
            file: 'src/ts/drive/backuplocal.ts',
            type: 'insert',
            where: 'after',
            anchor: `export function LoadLocalBackup(){
`,
            content: `    if (!allowDuringCharacterImport('Backup restore')) return
`,
            requires: ['character-import-ux:backup-guard-import'],
        },
        {
            id: 'character-import-ux:save-folder-import-guard',
            file: 'src/ts/drive/backuplocal.ts',
            type: 'insert',
            where: 'after',
            anchor: `export async function ImportFromSaveZip() {
`,
            content: `    if (!allowDuringCharacterImport('Save-folder import')) return
`,
            requires: ['character-import-ux:backup-guard-import'],
        },
        {
            id: 'character-import-ux:migrated-files-cleanup-guard',
            file: 'src/ts/drive/backuplocal.ts',
            type: 'insert',
            where: 'after',
            anchor: `export async function CleanupMigratedFiles() {
`,
            content: `    if (!allowDuringCharacterImport('Migrated-file cleanup')) return
`,
            requires: ['character-import-ux:backup-guard-import'],
        },
        {
            id: 'character-import-ux:snapshot-guard-import',
            file: 'src/lib/Setting/Pages/SystemBackup.svelte',
            type: 'insert',
            where: 'after',
            anchor: `    import { language } from 'src/lang'
`,
            content: `    import { allowDuringCharacterImport } from 'src/ts/characterImportState'
`,
            requires: ['character-import-ux:state'],
        },
        {
            id: 'character-import-ux:snapshot-restore-guard',
            file: 'src/lib/Setting/Pages/SystemBackup.svelte',
            type: 'insert',
            where: 'after',
            anchor: `    async function restoreSnapshot(snap: Snapshot) {
`,
            content: `        if (!allowDuringCharacterImport('Snapshot restore')) return
`,
            requires: ['character-import-ux:snapshot-guard-import'],
        },
        {
            id: 'character-import-ux:server-backup-guard-import',
            file: 'src/lib/Setting/ServerBackupList.svelte',
            type: 'insert',
            where: 'after',
            anchor: `    import { forageStorage, downloadFile } from "src/ts/globalApi.svelte";
`,
            content: `    import { allowDuringCharacterImport } from "src/ts/characterImportState";
`,
            requires: ['character-import-ux:state'],
        },
        {
            id: 'character-import-ux:server-backup-restore-guard',
            file: 'src/lib/Setting/ServerBackupList.svelte',
            type: 'insert',
            where: 'after',
            anchor: `    async function restoreBackup(backup: BackupEntry) {
`,
            content: `        if (!allowDuringCharacterImport('Server backup restore')) return
`,
            requires: ['character-import-ux:server-backup-guard-import'],
        },
        {
            id: 'character-import-ux:update-guard-import',
            file: 'src/ts/update.ts',
            type: 'insert',
            where: 'after',
            anchor: `import { DBState } from "./stores.svelte"
`,
            content: `import { allowDuringCharacterImport } from "./characterImportState"
`,
            requires: ['character-import-ux:state'],
        },
        {
            id: 'character-import-ux:self-update-guard',
            file: 'src/ts/update.ts',
            type: 'insert',
            where: 'after',
            anchor: `export async function executeSelfUpdate(): Promise<void> {
`,
            content: `    if (!allowDuringCharacterImport('Application update')) return
`,
            requires: ['character-import-ux:update-guard-import'],
        },
    ],
}
