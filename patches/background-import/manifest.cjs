'use strict'

const fs = require('node:fs')
const path = require('node:path')

const filesRoot = path.join(__dirname, 'files-1.10')
const read = (relative) => fs.readFileSync(path.join(filesRoot, relative), 'utf8')
const target110 = { pocketrisu: ['1.10.0'] }
const ownedPaths = [
    'server/node/importCommit.cjs',
    'server/node/importCommit.test.ts',
    'server/node/importJobStore.cjs',
    'server/node/importJobStore.test.ts',
    'server/node/importParserBundle.build.cjs',
    'server/node/importParserEntry.test.ts',
    'server/node/importParserEntry.ts',
    'server/node/importPrepare.cjs',
    'server/node/importPrepare.test.ts',
    'server/node/importPreparedDigest.cjs',
    'server/node/importPreparedStore.cjs',
    'server/node/importPreparedStore.test.ts',
    'server/node/importRoutes.cjs',
    'server/node/importRoutes.test.ts',
    'server/node/importServer.cjs',
    'server/node/importServer.test.ts',
    'server/node/importUpload.cjs',
    'server/node/importUpload.test.ts',
    'src/ts/process/backgroundImportCharacter.test.ts',
    'src/ts/process/backgroundImportCharacter.ts',
    'src/ts/process/backgroundImportCharacterModule.test.ts',
    'src/ts/process/backgroundImportCharacterModule.ts',
    'src/ts/process/backgroundImportLorebook.ts',
    'src/ts/process/backgroundImportPng.test.ts',
    'src/ts/process/backgroundImportPng.ts',
    'src/ts/process/backgroundImportRisuM.test.ts',
    'src/ts/process/backgroundImportRisuM.ts',
    'src/ts/process/backgroundImportSource.ts',
    'src/ts/backgroundImport.ts',
    'src/ts/backgroundImportState.test.ts',
    'src/ts/storage/backgroundImportClient.test.ts',
    'src/ts/storage/backgroundImportClient.ts',
    'src/ts/storage/backgroundImportReconcile.test.ts',
    'src/ts/storage/backgroundImportReconcile.ts',
    'src/ts/storage/backgroundImportRuntime.test.ts',
    'src/ts/storage/backgroundImportRuntime.ts',
]

function ownedId(relative) {
    return `background-import:owned:${relative.replaceAll('/', ':').replaceAll('.', '-')}:1.10`
}

const ownedUnits = ownedPaths.map((relative) => {
    const unit = {
        id: ownedId(relative),
        file: relative,
        type: 'owned',
        content: read(relative),
        targetVersions: target110,
    }
    if (relative === 'server/node/importParserEntry.ts') {
        unit.requires = [
            ownedId('server/node/importPreparedDigest.cjs'),
            ownedId('src/ts/process/backgroundImportCharacter.ts'),
            ownedId('src/ts/process/backgroundImportCharacterModule.ts'),
            ownedId('src/ts/process/backgroundImportLorebook.ts'),
            ownedId('src/ts/process/backgroundImportPng.ts'),
            ownedId('src/ts/process/backgroundImportRisuM.ts'),
            ownedId('src/ts/process/backgroundImportSource.ts'),
            'charx-archive-integrity:archive-engine:1.10',
            'character-import-ux:module-import-core',
            'character-import-ux:risum-reader',
        ]
    }
    return unit
})

const serverRegister = `const backgroundImportManager = registerBackgroundImport(app, {
    saveDir: savePath,
    rootDir: process.cwd(),
    checkAuth,
    checkActiveSession,
    logger,
    limits: {
        maxSourceBytes: 1024 * 1024 * 1024,
        maxSpoolBytes: 2 * 1024 * 1024 * 1024,
        maxChunkBytes: 1024 * 1024,
        minFreeBytes: (1024 + 64) * 1024 * 1024,
        claimTtlMs: 2 * 60 * 1000,
        terminalRetentionMs: 7 * 24 * 60 * 60 * 1000,
        cleanupBatch: 32,
        parser: {
            jsonBytes: 50 * 1024 * 1024,
            inlineAssetBytes: 50 * 1024 * 1024,
            stagedAssets: 0xffff,
            stagedBytes: 1024 * 1024 * 1024,
            png: {
                chunkCount: 0xffff,
                textChunkBytes: 50 * 1024 * 1024,
                totalTextBytes: 1024 * 1024 * 1024,
                ioChunkBytes: 64 * 1024,
            },
        },
    },
    queueStorageOperation,
    flushPendingDb,
    kvGet,
    kvSet,
    async decodeDatabase(raw) {
        return normalizeJSON(await decodeRisuSave(raw));
    },
    computeDatabaseRevision(database) {
        return computeDatabaseEtagFromObject(
            canonicalizeStrippedDatabase(normalizeJSON(stripChatsFromDb(database)))
        );
    },
    async persistDatabaseAndMarker(database, markerKey, marker) {
        const stripped = canonicalizeStrippedDatabase(normalizeJSON(stripChatsFromDb(database)));
        const losses = findStubFlagLossChats(database);
        if (losses.length > 0) {
            throw Object.assign(new Error('Imported database contains an invalid chat shell'), {
                code: 'IMPORT_DATABASE_INVALID',
            });
        }
        const encoded = Buffer.from(encodeRisuSaveLegacy(database));
        sqliteDb.transaction(() => {
            kvSet('database/database.bin', encoded);
            kvSet(markerKey, Buffer.from(JSON.stringify(marker)));
        })();
        return { committedRevision: marker.committedRevision };
    },
    async synchronizeCanonicalState(database) {
        const stripped = canonicalizeStrippedDatabase(normalizeJSON(stripChatsFromDb(database)));
        await chatWriteJournal.clearAfterDatabasePersist(stripped);
        invalidateDbCache();
        await initChatStore(database);
        cacheStrippedDatabase(stripped);
        try { createBackupAndRotate(); }
        catch (error) { logger.warn('[BackgroundImport] backup rotation failed:', error?.message || error); }
    },
});
app.use(backgroundImportManager.replacementGuard);

`

module.exports = {
    id: 'background-import',
    title: 'Durable background character and module import',
    version: '0.3.3',
    targets: {
        pocketrisu: {
            verified: [],
            reviewing: ['1.10.0'],
        },
    },
    userSelectable: true,
    requires: [
        'character-import-ux',
        'charx-archive-integrity',
        'lazy-chat-sync',
        'client-build-fence',
    ],
    units: [
        ...ownedUnits,
        {
            id: 'background-import:server-import:1.10',
            file: 'server/node/server.cjs',
            type: 'insert',
            where: 'before',
            anchor: "const { decodeRisuSave, encodeRisuSaveLegacy, calculateHash, normalizeJSON, normalizeForwardHeaders, hasRemoteBlocks } = require('./utils.cjs');\n",
            content: "const { registerBackgroundImport } = require('./importServer.cjs');\n",
            requires: [
                ownedId('server/node/importServer.cjs'),
                'lazy-chat-sync:replace:server:node:server-cjs:1.10',
            ],
            after: [
                'client-build-fence:server-import:1.9',
                'kei-backup-restore-safety-lazy-adapter:server-helper-import:1.9',
            ],
            targetVersions: target110,
        },
        {
            id: 'background-import:early-upload-auth:1.10',
            file: 'server/node/server.cjs',
            type: 'insert',
            where: 'before',
            anchor: "const defaultJsonParser = express.json({ limit: '100mb' });\n",
            content: `app.use(async (req, res, next) => {
    const isImportChunk = req.method === 'PUT'
        && /^\\/api\\/import-jobs\\/[^/]+\\/source$/.test(req.path);
    if (!isImportChunk) return next();
    if (!await checkAuth(req, res)) return;
    if (!checkActiveSession(req, res)) return;
    next();
});
`,
            requires: [
                'background-import:server-import:1.10',
                'client-build-fence:server-middleware:1.9',
            ],
            after: [
                'client-build-fence:server-session-advertise:1.9',
                'server-backup-snapshot-lazy-adapter:startup-pin-sweep:1.10',
                'persona-organizer:server-gallery-assets-1.10',
            ],
            targetVersions: target110,
        },
        {
            id: 'background-import:bounded-upload-body:1.10',
            file: 'server/node/server.cjs',
            type: 'replace',
            anchor: `app.use((req, res, next) => {
    // Skip express.raw() for backup import — it must stream, not buffer into memory
    if (req.path === '/api/backup/import') return next();
    return express.raw({ type: 'application/octet-stream', limit: '2gb' })(req, res, next);
});
`,
            content: `app.use((req, res, next) => {
    // Skip express.raw() for backup import — it must stream, not buffer into memory.
    if (req.path === '/api/backup/import') return next();
    const isImportChunk = req.method === 'PUT'
        && /^\\/api\\/import-jobs\\/[^/]+\\/source$/.test(req.path);
    return express.raw({
        type: 'application/octet-stream',
        limit: isImportChunk ? '1mb' : '2gb',
    })(req, res, next);
});
`,
            requires: ['background-import:early-upload-auth:1.10'],
            targetVersions: target110,
        },
        {
            id: 'background-import:server-register:1.10',
            file: 'server/node/server.cjs',
            type: 'insert',
            where: 'before',
            anchor: "app.get('/api/remove', async (req, res, next) => {\n",
            content: serverRegister,
            requires: [
                'background-import:server-import:1.10',
                'background-import:bounded-upload-body:1.10',
            ],
            after: [
                'server-backup-snapshot-lazy-adapter:startup-pin-sweep:1.10',
                'bg-preserve:hook:server-cjs-register-routes:1.9',
                'kei-backup-restore-safety-lazy-adapter:snapshot-restore-error-code:1.9',
            ],
            targetVersions: target110,
        },
        {
            id: 'background-import:http-error-status:1.10',
            file: 'server/node/server.cjs',
            type: 'replace',
            anchor: `app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    res.status(500).json({ error: err?.message || 'internal server error' });
});
`,
            content: `app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = Number.isInteger(err?.status) && err.status >= 400 && err.status < 500
        ? err.status
        : 500;
    res.status(status).json({ error: err?.message || 'internal server error' });
});
`,
            requires: ['background-import:server-register:1.10'],
            after: [
                'bg-preserve:hook:server-cjs-register-routes:1.9',
                'kei-backup-restore-safety-lazy-adapter:snapshot-restore-error-code:1.9',
            ],
            targetVersions: target110,
        },
        {
            id: 'background-import:node-fetch-bridge:1.10',
            file: 'src/ts/storage/nodeStorage.ts',
            type: 'insert',
            where: 'before',
            anchor: '    private databaseReadHeaders(): Record<string, string> {\n',
            content: `    async importJobFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
        return this.authFetch(input, init)
    }

`,
            requires: [
                ownedId('src/ts/storage/backgroundImportClient.ts'),
                'lazy-chat-sync:replace:src:ts:storage:nodeStorage-ts:1.10',
                'client-build-fence:node-migration-xhr-response:1.9',
            ],
            after: [
                'lazy-chat-bg-adapter:asset-upload-error-detail',
                'kei-backup-restore-safety-lazy-adapter:node-server-stream-error:1.9',
                'client-build-fence-kei-lazy-storage-adapter:backup-xhr-response:1.9',
            ],
            targetVersions: target110,
        },
        {
            id: 'background-import:auto-fetch-bridge:1.10',
            file: 'src/ts/storage/autoStorage.ts',
            type: 'insert',
            where: 'before',
            anchor: `    async exportBackup(opts?: ExportBackupOptions) {
`,
            content: `    async importJobFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
        await this.Init()
        return this.realStorage.importJobFetch(input, init)
    }

`,
            requires: [
                'background-import:node-fetch-bridge:1.10',
                'lazy-chat-sync:replace:src:ts:storage:autoStorage-ts:1.10',
            ],
            after: ['kei-backup-restore-safety-lazy-adapter:auto-server-option:1.9'],
            targetVersions: target110,
        },
        {
            id: 'background-import:reporter-safe-type:1.10',
            file: 'src/ts/characterImportState.ts',
            type: 'insert',
            where: 'after',
            anchor: `export interface ImportJob extends ImportProgressReporter {
`,
            content: `    backgroundSafe(message: string, description?: string): void
`,
            requires: [
                ownedId('src/ts/storage/backgroundImportRuntime.ts'),
                'character-import-ux:state',
            ],
            targetVersions: target110,
        },
        {
            id: 'background-import:reporter-safe-runtime:1.10',
            file: 'src/ts/characterImportState.ts',
            type: 'insert',
            where: 'before',
            anchor: `        succeed(message, description) {
`,
            content: `        backgroundSafe(message, description) {
            if (active?.token !== token) return
            detachNavigationGuard()
            status.set({ phase: 'loading', message, description })
        },
`,
            requires: ['background-import:reporter-safe-type:1.10'],
            targetVersions: target110,
        },
        {
            id: 'background-import:module-test-reporter-safe:1.10',
            file: 'src/ts/process/moduleImport.test.ts',
            type: 'insert',
            where: 'after',
            anchor: `        update(message) { events.push(\`update:\${message}\`) },
`,
            content: `        backgroundSafe(message) { events.push(\`safe:\${message}\`) },
`,
            requires: [
                'background-import:reporter-safe-type:1.10',
                'character-import-ux:module-import-tests',
            ],
            targetVersions: target110,
        },
        {
            id: 'background-import:global-reconcile-import:1.10',
            file: 'src/ts/globalApi.svelte.ts',
            type: 'insert',
            where: 'after',
            anchor: `import { findTrackedDeletionConflict, jsonValuesEqual, mergeThreeWayValue, mergeTrackedChanges } from "./storage/conflictRebase";
`,
            content: `import {
    preserveCommittedImport,
    requireCommittedImport,
    type BackgroundImportEntityCoordinate,
} from "./storage/backgroundImportReconcile";
`,
            requires: [
                ownedId('src/ts/storage/backgroundImportReconcile.ts'),
                'lazy-chat-sync:replace:src:ts:globalApi-svelte-ts:1.10',
            ],
            after: ['client-build-fence:global-proxy-stream-abort:1.9'],
            targetVersions: target110,
        },
        {
            id: 'background-import:global-reconcile-api:1.10',
            file: 'src/ts/globalApi.svelte.ts',
            type: 'insert',
            where: 'after',
            anchor: `export function requestImportedModuleSave(moduleId: string): Promise<void> {
    return requestImportedModuleSaveImpl(moduleId)
}
`,
            content: `
let reconcileBackgroundImportImpl: (
    coordinate: BackgroundImportEntityCoordinate,
) => Promise<void> = async () => {
    throw new Error('background import reconciliation is not initialized')
}
let resolveBackgroundImportReconciliation!: () => void
const backgroundImportReconciliationReady = new Promise<void>(resolve => {
    resolveBackgroundImportReconciliation = resolve
})
export function waitForBackgroundImportReconciliation(): Promise<void> {
    return backgroundImportReconciliationReady
}
export async function reconcileBackgroundImport(
    coordinate: BackgroundImportEntityCoordinate,
): Promise<void> {
    await backgroundImportReconciliationReady
    return reconcileBackgroundImportImpl(coordinate)
}
`,
            requires: ['background-import:global-reconcile-import:1.10'],
            targetVersions: target110,
        },
        {
            id: 'background-import:global-rebase-coordinate:1.10',
            file: 'src/ts/globalApi.svelte.ts',
            type: 'replace',
            anchor: `    async function rebaseTrackedLocalChangesOnLatestServerDb(db: Database, toSave: toSaveType) {
`,
            content: `    async function rebaseTrackedLocalChangesOnLatestServerDb(
        db: Database,
        toSave: toSaveType,
        requiredImport?: BackgroundImportEntityCoordinate,
    ) {
`,
            requires: ['background-import:global-reconcile-api:1.10'],
            targetVersions: target110,
        },
        {
            id: 'background-import:global-rebase-preserve:1.10',
            file: 'src/ts/globalApi.svelte.ts',
            type: 'replace',
            anchor: `            const mergedDb = mergeThreeWayValue(
                previousServerBaseline,
                localDb,
                latestDb,
            ) as Database
`,
            content: `            let mergedDb = mergeThreeWayValue(
                previousServerBaseline,
                localDb,
                latestDb,
            ) as Database
            if (requiredImport) {
                mergedDb = preserveCommittedImport({
                    base: previousServerBaseline,
                    local: localDb,
                    latest: latestDb,
                    merged: mergedDb,
                    coordinate: requiredImport,
                })
            }
`,
            requires: ['background-import:global-rebase-coordinate:1.10'],
            targetVersions: target110,
        },
        {
            id: 'background-import:global-reconcile-runtime:1.10',
            file: 'src/ts/globalApi.svelte.ts',
            type: 'insert',
            where: 'before',
            anchor: `    requestImportedCharacterSaveImpl = async (chaId) => {
`,
            content: `    reconcileBackgroundImportImpl = async (coordinate) => {
        if (
            !coordinate
            || !['module', 'character'].includes(coordinate.kind)
            || typeof coordinate.entityId !== 'string'
            || coordinate.entityId.length === 0
            || typeof coordinate.committedRevision !== 'string'
            || coordinate.committedRevision.length === 0
        ) {
            throw new Error('Invalid background import reconciliation coordinate')
        }
        await tick()
        if (saveInFlight) await saveInFlight
        const pending = safeStructuredClone(changeTracker)
        await rebaseTrackedLocalChangesOnLatestServerDb(
            getDatabase(),
            pending,
            coordinate,
        )
        const imported = requireCommittedImport(getDatabase(), coordinate)
        if (coordinate.kind === 'character') {
            for (let index = 0; index < (imported.chats ?? []).length; index++) {
                const hydrated = await ensureChatHydrated(imported.chats, index, coordinate.entityId)
                if (!hydrated) throw new Error('Imported character chat could not be hydrated')
            }
        }
        if (hasTrackedChanges(changeTracker)) {
            let strictOutcome: 'saved' | 'retry' | 'noop' = 'saved'
            await triggerSave({
                rejectOnError: true,
                onResult: (result: 'saved' | 'retry' | 'noop') => { strictOutcome = result },
            } as any)
            if (strictOutcome !== 'saved') {
                throw new Error('Local changes were retained for a later reconciliation retry')
            }
        }
        requireCommittedImport(lastConfirmedServerDb, coordinate)
    }
    resolveBackgroundImportReconciliation()

`,
            requires: ['background-import:global-rebase-preserve:1.10'],
            after: [
                'bg-preserve:hook:globalapi-durable-save-impl',
                'lazy-chat-bg-adapter:durable-flush',
            ],
            targetVersions: target110,
        },
        {
            id: 'background-import:bootstrap-import:1.10',
            file: 'src/ts/bootstrap.ts',
            type: 'insert',
            where: 'after',
            anchor: `import { initModelJobRecovery } from "./process/request/jobRecovery";
`,
            content: `import { initBackgroundImportRecovery } from "./backgroundImport";
`,
            requires: [
                ownedId('src/ts/backgroundImport.ts'),
                'background-import:auto-fetch-bridge:1.10',
                'background-import:global-reconcile-runtime:1.10',
                'background-import:reporter-safe-runtime:1.10',
                'lazy-chat-sync:replace:src:ts:bootstrap-ts:1.10',
            ],
            after: [
                'kei-mobile-navigation-lazy-adapter:bootstrap-imports',
                'kei-mobile-navigation-lazy-adapter:bootstrap-imports:1.9',
            ],
            targetVersions: target110,
        },
        {
            id: 'background-import:bootstrap-recovery:1.10',
            file: 'src/ts/bootstrap.ts',
            type: 'insert',
            where: 'after',
            anchor: `            saveDb()
`,
            content: `            initBackgroundImportRecovery()
`,
            requires: ['background-import:bootstrap-import:1.10'],
            targetVersions: target110,
        },
        {
            id: 'background-import:module-source-consumer:1.10',
            file: 'src/ts/process/moduleImport.ts',
            type: 'insert',
            where: 'after',
            anchor: `    origin: ModuleImportOrigin
`,
            content: `    /** Consume a one-shot share/hash instruction after durable handoff. */
    consumeOrigin?: () => void
`,
            requires: ['character-import-ux:module-import-core'],
            targetVersions: target110,
        },
        {
            id: 'background-import:modules-reporter-type:1.10',
            file: 'src/ts/process/modules.ts',
            type: 'replace',
            anchor: `import { beginModuleImport, formatImportProgress, reserveImport } from "../characterImportState"
`,
            content: `import { beginModuleImport, formatImportProgress, reserveImport, type ImportJob } from "../characterImportState"
`,
            requires: [
                'background-import:reporter-safe-type:1.10',
                'character-import-ux:modules-terminal-import',
            ],
            after: [
                'character-import-ux:modules-orchestrator-imports',
                'bg-preserve:hook:modules-source-aware-cache-refresh',
            ],
            targetVersions: target110,
        },
        {
            id: 'background-import:modules-runtime-import:1.10',
            file: 'src/ts/process/modules.ts',
            type: 'insert',
            where: 'after',
            anchor: `import { createModuleImportOrchestrator, selectModuleImportFile, type ModuleImportResult, type ModuleImportSource } from "./moduleImport"
`,
            content: `import { runBackgroundImport } from "../backgroundImport"
`,
            requires: [
                ownedId('src/ts/backgroundImport.ts'),
                'background-import:module-source-consumer:1.10',
                'background-import:modules-reporter-type:1.10',
                'character-import-ux:modules-terminal-import',
            ],
            after: ['bg-preserve:hook:modules-source-aware-cache-import'],
            targetVersions: target110,
        },
        {
            id: 'background-import:modules-runtime-owner:1.10',
            file: 'src/ts/process/modules.ts',
            type: 'insert',
            where: 'before',
            anchor: `export async function readModule(
`,
            content: `async function runDurableModuleImport(
    source: ModuleImportSource,
    job: ImportJob,
): Promise<ModuleImportResult> {
    const outcome = await runBackgroundImport({
        kind: 'module',
        name: source.name,
        data: source.data,
        origin: source.origin,
        reporter: job,
        onAdmitted: source.consumeOrigin,
    })
    if (outcome.status === 'foreground-required') return runModuleImport(source, job)
    if (outcome.status === 'cancelled') return { status: 'cancelled' }
    if (outcome.status === 'failed') {
        return {
            status: 'failed',
            error: outcome.error,
            committed: outcome.committed,
        }
    }
    const imported = getDatabase().modules.find(module => module?.id === outcome.job.entityId)
    if (!imported) {
        return {
            status: 'failed',
            error: new Error('Reconciled module is not visible'),
            committed: true,
        }
    }
    return { status: 'imported', module: imported }
}

`,
            requires: ['background-import:modules-runtime-import:1.10'],
            targetVersions: target110,
        },
        {
            id: 'background-import:modules-source-dispatch:1.10',
            file: 'src/ts/process/modules.ts',
            type: 'replace',
            anchor: `    return runModuleImport(source, job)
`,
            content: `    return runDurableModuleImport(source, job)
`,
            requires: ['background-import:modules-runtime-owner:1.10'],
            targetVersions: target110,
        },
        {
            id: 'background-import:modules-picker-dispatch:1.10',
            file: 'src/ts/process/modules.ts',
            type: 'replace',
            anchor: `    return runModuleImport({ name: file.name, data: file, origin: 'picker' }, job)
`,
            content: `    return runDurableModuleImport({ name: file.name, data: file, origin: 'picker' }, job)
`,
            requires: ['background-import:modules-source-dispatch:1.10'],
            targetVersions: target110,
        },
        {
            id: 'background-import:character-runtime-import:1.10',
            file: 'src/ts/characterCards.ts',
            type: 'insert',
            where: 'after',
            anchor: `import { beginCharacterImport, formatCharacterImportProgress, type CharacterImportJob, type ImportProgressReporter } from "./characterImportState"
`,
            content: `import { runBackgroundImport } from "./backgroundImport"
import type { BackgroundImportOrigin } from "./storage/backgroundImportClient"
`,
            requires: [
                ownedId('src/ts/backgroundImport.ts'),
                'background-import:reporter-safe-runtime:1.10',
                'character-import-ux:character-reporter-type',
                'character-import-ux:character-file-module-route',
                'charx-archive-integrity:non-charx-counter:1.10',
            ],
            after: [
                'charx-archive-integrity:non-charx-counter:1.10',
                'personal-settings:realm-import-navigation',
            ],
            targetVersions: target110,
        },
        {
            id: 'background-import:character-source-options:1.10',
            file: 'src/ts/characterCards.ts',
            type: 'insert',
            where: 'after',
            anchor: `    data: Uint8Array|File|ReadableStream<Uint8Array>
`,
            content: `    origin?:BackgroundImportOrigin
    /** Consume a one-shot share/hash instruction after durable handoff. */
    consumeOrigin?:() => void
`,
            requires: ['background-import:character-runtime-import:1.10'],
            targetVersions: target110,
        },
        {
            id: 'background-import:character-job-reuse:1.10',
            file: 'src/ts/characterCards.ts',
            type: 'replace',
            anchor: `async function runCharacterImportJob<T>(
    work: (job: CharacterImportJob) => Promise<T>,
): Promise<T | null> {
    const job = beginCharacterImport()
`,
            content: `async function runCharacterImportJob<T>(
    work: (job: CharacterImportJob) => Promise<T>,
    existingJob: CharacterImportJob | null = null,
): Promise<T | null> {
    const job = existingJob ?? beginCharacterImport()
`,
            requires: ['background-import:character-source-options:1.10'],
            targetVersions: target110,
        },
        {
            id: 'background-import:character-dispatch:1.10',
            file: 'src/ts/characterCards.ts',
            type: 'insert',
            where: 'before',
            anchor: `    if (f.progressReporter) {
`,
            content: `    const backgroundSource = f.data instanceof Uint8Array || f.data instanceof Blob
        ? f.data
        : null
    if (!f.progressReporter && !f.returnCharacter && !f.suppressImportJob && backgroundSource) {
        const job = beginCharacterImport()
        if (!job) return null as any
        const outcome = await runBackgroundImport({
            kind: 'character',
            name: f.name,
            data: backgroundSource,
            origin: f.origin ?? 'picker',
            reporter: job,
            onAdmitted: f.consumeOrigin,
        })
        if (outcome.status === 'foreground-required') {
            return await runCharacterImportJob(
                reporter => importCharacterProcessInternal(f, reporter),
                job,
            ) as any
        }
        if (outcome.status === 'imported') {
            const index = getDatabase().characters.findIndex(
                character => character?.chaId === outcome.job.entityId,
            )
            return (index >= 0 ? index : null) as any
        }
        return null as any
    }
`,
            requires: ['background-import:character-job-reuse:1.10'],
            after: ['character-import-ux:character-reporter-dispatch'],
            targetVersions: target110,
        },
        {
            id: 'background-import:app-character-drop-origin:1.10',
            file: 'src/App.svelte',
            type: 'replace',
            anchor: `        await importCharacterProcess({
            name: file.name,
            data: file
        })
`,
            content: `        await importCharacterProcess({
            name: file.name,
            data: file,
            origin: 'drop',
        })
`,
            requires: ['background-import:character-dispatch:1.10'],
            after: ['character-import-ux:app-module-drop'],
            targetVersions: target110,
        },
        {
            id: 'background-import:character-url-origin:1.10',
            file: 'src/ts/characterCards.ts',
            type: 'replace',
            anchor: `            const imported = await importCharacterProcess({
                name: 'charahub.png',
                data: img
            })
`,
            content: `            const imported = await importCharacterProcess({
                name: 'charahub.png',
                data: img,
                origin: 'url',
            })
`,
            requires: ['background-import:character-dispatch:1.10'],
            targetVersions: target110,
        },
        {
            id: 'background-import:character-share-origin:1.10',
            file: 'src/ts/characterCards.ts',
            type: 'replace',
            anchor: `        await importCharacterProcess({
            name: 'shared.charx',
            data: charx
        })
`,
            content: `        await importCharacterProcess({
            name: 'shared.charx',
            data: charx,
            origin: 'share',
            consumeOrigin: () => { location.hash = '' },
        })
`,
            requires: ['background-import:character-url-origin:1.10'],
            targetVersions: target110,
        },
        {
            id: 'background-import:file-origin-argument:1.10',
            file: 'src/ts/characterCards.ts',
            type: 'replace',
            anchor: `    async function importFile(name:string, data:Uint8Array) {
`,
            content: `    async function importFile(
        name: string,
        data: Uint8Array,
        origin: 'url' | 'launch',
    ) {
`,
            requires: ['background-import:character-share-origin:1.10'],
            targetVersions: target110,
        },
        {
            id: 'background-import:file-url-call:1.10',
            file: 'src/ts/characterCards.ts',
            type: 'replace',
            anchor: `            await importFile(getFileName(res), data)
`,
            content: `            await importFile(getFileName(res), data, 'url')
`,
            requires: ['background-import:file-origin-argument:1.10'],
            targetVersions: target110,
        },
        {
            id: 'background-import:file-launch-call:1.10',
            file: 'src/ts/characterCards.ts',
            type: 'replace',
            anchor: `                await importFile(f.name, data);
`,
            content: `                await importFile(f.name, data, 'launch');
`,
            requires: ['background-import:file-url-call:1.10'],
            targetVersions: target110,
        },
        {
            id: 'background-import:file-character-origin:1.10',
            file: 'src/ts/characterCards.ts',
            type: 'replace',
            anchor: `            await importCharacterProcess({
                name: name,
                data: data
            })
`,
            content: `            await importCharacterProcess({
                name,
                data,
                origin,
            })
`,
            requires: ['background-import:file-launch-call:1.10'],
            targetVersions: target110,
        },
        {
            id: 'background-import:file-module-origin:1.10',
            file: 'src/ts/characterCards.ts',
            type: 'replace',
            anchor: `            const result = await importModuleSource({ name, data, origin: 'launch' })
`,
            content: `            const result = await importModuleSource({ name, data, origin })
`,
            requires: ['background-import:file-character-origin:1.10'],
            after: ['character-import-ux:character-file-module-route'],
            targetVersions: target110,
        },
        {
            id: 'background-import:module-hash-consumer:1.10',
            file: 'src/ts/characterCards.ts',
            type: 'insert',
            where: 'after',
            anchor: `            origin: 'hash',
`,
            content: `            consumeOrigin: () => { location.hash = '' },
`,
            requires: [
                'background-import:modules-source-dispatch:1.10',
                'background-import:file-module-origin:1.10',
                'character-import-ux:character-hash-module-route',
            ],
            targetVersions: target110,
        },
        {
            id: 'background-import:module-share-consumer:1.10',
            file: 'src/ts/characterCards.ts',
            type: 'replace',
            anchor: `        const result = await importModuleSource({
            name: 'shared.risum',
            data: new Uint8Array(await data.arrayBuffer()),
            origin: 'share',
        })
`,
            content: `        const result = await importModuleSource({
            name: 'shared.risum',
            data: new Uint8Array(await data.arrayBuffer()),
            origin: 'share',
            consumeOrigin: () => { location.hash = '' },
        })
`,
            requires: [
                'background-import:module-hash-consumer:1.10',
                'character-import-ux:character-share-module-route',
            ],
            targetVersions: target110,
        },
        {
            id: 'background-import:realm-charx-origin:1.10',
            file: 'src/ts/characterCards.ts',
            type: 'replace',
            anchor: `                    name: 'realm.charx',
                    data: new Uint8Array(await res.arrayBuffer()),
                    lightningRealmImport: db.lightningRealmImport,
`,
            content: `                    name: 'realm.charx',
                    data: new Uint8Array(await res.arrayBuffer()),
                    lightningRealmImport: db.lightningRealmImport,
                    origin: 'realm',
`,
            requires: ['background-import:module-share-consumer:1.10'],
            targetVersions: target110,
        },
        {
            id: 'background-import:realm-png-origin:1.10',
            file: 'src/ts/characterCards.ts',
            type: 'replace',
            anchor: `                    name: 'realm.png',
                    data: res.body,
                    lightningRealmImport: db.lightningRealmImport,
`,
            content: `                    name: 'realm.png',
                    data: res.body,
                    lightningRealmImport: db.lightningRealmImport,
                    origin: 'realm',
`,
            requires: ['background-import:realm-charx-origin:1.10'],
            targetVersions: target110,
        },
    ],
}
