'use strict'

const fs = require('node:fs')
const path = require('node:path')

const anchorsRoot = path.join(__dirname, 'anchors')
const filesRoot = path.join(__dirname, 'files')
const read = (root, relative) => fs.readFileSync(path.join(root, relative), 'utf8')

module.exports = {
    id: 'character-import-ux',
    title: 'Non-blocking character import',
    version: '0.1.1',
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
                'lazy-chat-sync:replace:src:ts:globalApi-svelte-ts',
            ],
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
            anchor: `    import { LoadLocalBackup, SaveLocalBackup, SaveServerBackup } from 'src/ts/drive/backuplocal'
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
