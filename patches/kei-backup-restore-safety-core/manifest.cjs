'use strict'

const fs = require('node:fs')
const path = require('node:path')

const filesRoot = path.join(__dirname, 'files')
const owned = (relative) => fs.readFileSync(path.join(filesRoot, relative), 'utf8')
const pocketRisu190 = { pocketrisu: ['1.9.0'] }

module.exports = {
    id: 'kei-backup-restore-safety-core',
    title: 'PocketRisu Kei fresh pre-restore snapshot safety',
    version: '0.1.0',
    targets: {
        pocketrisu: {
            verified: ['1.8.1', '1.9.0'],
            reviewing: [],
        },
    },
    userSelectable: false,
    units: [
        {
            id: 'kei-backup-restore-safety-core:server-helper:1.9',
            file: 'server/node/restoreSafety.cjs',
            type: 'owned',
            content: owned('server/node/restoreSafety.cjs'),
            targetVersions: pocketRisu190,
        },
        {
            id: 'kei-backup-restore-safety-core:server-helper-tests:1.9',
            file: 'server/node/restoreSafety.test.ts',
            type: 'owned',
            content: owned('server/node/restoreSafety.test.ts'),
            requires: ['kei-backup-restore-safety-core:server-helper:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'kei-backup-restore-safety-core:client-helper:1.9',
            file: 'src/ts/storage/restoreSafety.ts',
            type: 'owned',
            content: owned('src/ts/storage/restoreSafety.ts'),
            targetVersions: pocketRisu190,
        },
        {
            id: 'kei-backup-restore-safety-core:client-helper-tests:1.9',
            file: 'src/ts/storage/restoreSafety.test.ts',
            type: 'owned',
            content: owned('src/ts/storage/restoreSafety.test.ts'),
            requires: ['kei-backup-restore-safety-core:client-helper:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'kei-backup-restore-safety-core:local-ui-import:1.9',
            file: 'src/ts/drive/backuplocal.ts',
            type: 'insert',
            where: 'after',
            anchor: 'import { language } from "src/lang";\n',
            content: `import {
    acknowledgedRestoreOptions,
    isFreshSnapshotRequiredError,
    restoreWithoutFreshSnapshotPrompt,
} from "../storage/restoreSafety";
`,
            requires: ['kei-backup-restore-safety-core:client-helper:1.9'],
            after: ['character-import-ux:backup-guard-import'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'kei-backup-restore-safety-core:local-ui-retry:1.9',
            file: 'src/ts/drive/backuplocal.ts',
            type: 'replace',
            anchor: `            const result = await forageStorage.importBackup(file, (loaded, total) => {
                const progress = total > 0 ? ((loaded / total) * 100).toFixed(2) : '0.00'
                alertWait(\`Loading local Backup... (\${progress}%)\`)
            })
`,
            managed: `            /* POCKETRISU-PATCH:kei-backup-restore-safety:local-retry:START */
            const progress = (loaded: number, total: number) => {
                const percent = total > 0 ? ((loaded / total) * 100).toFixed(2) : '0.00'
                alertWait(\`Loading local Backup... (\${percent}%)\`)
            }
            let result: { ok: boolean, assetsRestored: number, coldStorageFailed?: number }
            try {
                try {
                    result = await forageStorage.importBackup(file, progress)
                } catch (error) {
                    if (!isFreshSnapshotRequiredError(error)) throw error
                    const options = acknowledgedRestoreOptions(error)
                    if (!(await alertConfirm(restoreWithoutFreshSnapshotPrompt(error)))) return
                    alertWait(\`Loading local Backup... (Retrying \${file.name})\`)
                    result = await forageStorage.importBackup(file, progress, options)
                }
            } catch (error) {
                console.error(error)
                alertError(error instanceof Error ? error.message : 'Restore failed')
                return
            }
            /* POCKETRISU-PATCH:kei-backup-restore-safety:local-retry:END */
`,
            markerNeedle: 'POCKETRISU-PATCH:kei-backup-restore-safety:local-retry:START',
            requires: ['kei-backup-restore-safety-core:local-ui-import:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'kei-backup-restore-safety-core:snapshot-ui-import:1.9',
            file: 'src/lib/Setting/Pages/SystemBackup.svelte',
            type: 'insert',
            where: 'after',
            anchor: `    import { LoadLocalBackup, SaveLocalBackup, SaveSettingsOnlyBackup, SaveServerBackup } from 'src/ts/drive/backuplocal'
`,
            content: `    import {
        acknowledgedRestoreOptions,
        isFreshSnapshotRequiredError,
        restoreErrorFromPayload,
        restoreSafetyHeaders,
        restoreWithoutFreshSnapshotPrompt,
        type RestoreSafetyOptions,
    } from 'src/ts/storage/restoreSafety'
`,
            requires: ['kei-backup-restore-safety-core:client-helper:1.9'],
            after: ['character-import-ux:snapshot-guard-import'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'kei-backup-restore-safety-core:snapshot-ui-retry:1.9',
            file: 'src/lib/Setting/Pages/SystemBackup.svelte',
            type: 'replace',
            anchor: `            const auth = await forageStorage.createAuth()
            const res = await fetch('/api/db/snapshots/restore', {
                method: 'POST',
                headers: { 'risu-auth': auth, 'content-type': 'application/json' },
                body: JSON.stringify({ key: snap.key }),
            })
            const json = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(json?.error || \`HTTP \${res.status}\`)
`,
            managed: `            /* POCKETRISU-PATCH:kei-backup-restore-safety:snapshot-retry:START */
            const restore = async (options: RestoreSafetyOptions = {}) => {
                const auth = await forageStorage.createAuth()
                const res = await fetch('/api/db/snapshots/restore', {
                    method: 'POST',
                    headers: {
                        'risu-auth': auth,
                        'content-type': 'application/json',
                        ...restoreSafetyHeaders(options),
                    },
                    body: JSON.stringify({ key: snap.key }),
                })
                const json = await res.json().catch(() => ({}))
                if (!res.ok) {
                    throw restoreErrorFromPayload(json, \`HTTP \${res.status}\`)
                }
            }
            try {
                await restore()
            } catch (error) {
                if (!isFreshSnapshotRequiredError(error)) throw error
                const options = acknowledgedRestoreOptions(error)
                if (!(await alertConfirm(restoreWithoutFreshSnapshotPrompt(error)))) return
                alertWait(language.serverBackupRestoring)
                await restore(options)
            }
            /* POCKETRISU-PATCH:kei-backup-restore-safety:snapshot-retry:END */
`,
            markerNeedle: 'POCKETRISU-PATCH:kei-backup-restore-safety:snapshot-retry:START',
            requires: ['kei-backup-restore-safety-core:snapshot-ui-import:1.9'],
            after: ['character-import-ux:snapshot-restore-guard'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'kei-backup-restore-safety-core:server-ui-import:1.9',
            file: 'src/lib/Setting/ServerBackupList.svelte',
            type: 'insert',
            where: 'after',
            anchor: `    import { forageStorage, downloadFile } from "src/ts/globalApi.svelte";
`,
            content: `    import {
        acknowledgedRestoreOptions,
        isFreshSnapshotRequiredError,
        restoreWithoutFreshSnapshotPrompt,
    } from "src/ts/storage/restoreSafety";
`,
            requires: ['kei-backup-restore-safety-core:client-helper:1.9'],
            after: ['character-import-ux:server-backup-guard-import'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'kei-backup-restore-safety-core:server-ui-retry:1.9',
            file: 'src/lib/Setting/ServerBackupList.svelte',
            type: 'replace',
            anchor: `            const result = await forageStorage.restoreServerBackup(backup.filename, (bytes, totalBytes) => {
                if (totalBytes > 0) {
                    const pct = ((bytes / totalBytes) * 100).toFixed(1);
                    alertWait(\`\${language.serverBackupRestoring} (\${pct}%)\`);
                }
            });
`,
            managed: `            /* POCKETRISU-PATCH:kei-backup-restore-safety:server-retry:START */
            const progress = (bytes: number, totalBytes: number) => {
                if (totalBytes > 0) {
                    const pct = ((bytes / totalBytes) * 100).toFixed(1);
                    alertWait(\`\${language.serverBackupRestoring} (\${pct}%)\`);
                }
            };
            let result: { ok: boolean, assetsRestored: number, coldStorageFailed?: number };
            try {
                result = await forageStorage.restoreServerBackup(backup.filename, progress);
            } catch (error) {
                if (!isFreshSnapshotRequiredError(error)) throw error;
                const options = acknowledgedRestoreOptions(error);
                if (!(await alertConfirm(restoreWithoutFreshSnapshotPrompt(error)))) return;
                alertWait(language.serverBackupRestoring);
                result = await forageStorage.restoreServerBackup(backup.filename, progress, options);
            }
            /* POCKETRISU-PATCH:kei-backup-restore-safety:server-retry:END */
`,
            markerNeedle: 'POCKETRISU-PATCH:kei-backup-restore-safety:server-retry:START',
            requires: ['kei-backup-restore-safety-core:server-ui-import:1.9'],
            after: ['character-import-ux:server-backup-restore-guard'],
            targetVersions: pocketRisu190,
        },
    ],
}
