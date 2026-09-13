'use strict'

const fs = require('node:fs')
const path = require('node:path')

const filesRoot = path.join(__dirname, 'files')
const files1100Root = path.join(__dirname, 'files-1.10')
const owned = (relative) => fs.readFileSync(path.join(filesRoot, relative), 'utf8')
const owned1100 = (relative) => fs.readFileSync(path.join(files1100Root, relative), 'utf8')
const pocketRisu1100 = { pocketrisu: ['1.10.0'] }
const bgGlobalApiUnits = [
    'bg-preserve:hook:globalapi-durable-save-api',
    'bg-preserve:hook:globalapi-durable-save-outcome',
    'bg-preserve:hook:globalapi-durable-save-rethrow',
    'bg-preserve:hook:globalapi-durable-save-impl',
    'bg-preserve:hook:globalapi-fetch-impl-register',
    'bg-preserve:hook:globalapi-fetchnative-bgsubkey-arg',
    'bg-preserve:hook:globalapi-gemini-main-branch',
]

module.exports = {
    id: 'lazy-chat-bg-adapter',
    title: 'BG preserve integration for lazy chat storage',
    version: '0.3.0',
    targets: {
        pocketrisu: {
            verified: ['1.8.1', '1.9.0', '1.10.0'],
            reviewing: [],
        },
    },
    userSelectable: false,
    requires: ['bg-preserve', 'lazy-chat-sync'],
    autoWhen: {
        all: ['bg-preserve', 'lazy-chat-sync'],
    },
    units: [
        {
            id: 'lazy-chat-bg-adapter:asset-upload-retry-import',
            file: 'src/ts/storage/nodeStorage.ts',
            type: 'insert',
            where: 'after',
            anchor: 'import { StartupDatabaseCache } from "./startupDatabaseCache"\n',
            managed: '/* BG-PRESERVE:START asset-upload-retry-import */\nimport { retryAssetUpload } from "./assetUploadRetry"\n/* BG-PRESERVE:END */\n',
            markerNeedle: 'asset-upload-retry-import',
            anchorPolicy: 'first',
            after: [
                'lazy-chat-sync:replace:src:ts:storage:nodeStorage-ts',
                'lazy-chat-sync:replace:src:ts:storage:nodeStorage-ts:1.9',
            ],
        },
        {
            id: 'lazy-chat-bg-adapter:adaptive-asset-upload-retry',
            file: 'src/ts/storage/nodeStorage.ts',
            type: 'replace',
            anchor: `        const da = await this.authFetch('/api/write', {
            method: "POST",
            body: value as any,
            headers
        })
`,
            managed: `        /* BG-PRESERVE:START asset-upload-adaptive-retry */
        const upload = () => this.authFetch('/api/write', {
            method: "POST",
            body: value as any,
            headers
        })
        const da = key.startsWith('assets/')
            ? await retryAssetUpload(upload)
            : await upload()
        /* BG-PRESERVE:END */
`,
            markerNeedle: 'asset-upload-adaptive-retry',
            anchorPolicy: 'first',
            requires: ['lazy-chat-bg-adapter:asset-upload-retry-import'],
        },
        {
            id: 'lazy-chat-bg-adapter:asset-upload-error-detail',
            file: 'src/ts/storage/nodeStorage.ts',
            type: 'replace',
            anchor: `        if(da.status < 200 || da.status >= 300){
            const data = await da.clone().json().catch(() => ({}))
            throw new Error(data?.detail || data?.error || \`setItem Error (\${da.status})\`)
        }
`,
            managed: `        /* BG-PRESERVE:START asset-upload-error-detail */
        if(da.status < 200 || da.status >= 300){
            if (key.startsWith('assets/')) {
                let detail = ''
                try {
                    const body = await da.clone().json()
                    detail = typeof body?.error === 'string' ? \`: \${body.error}\` : ''
                } catch {
                    // A non-JSON proxy/server response is still identified by its HTTP status.
                }
                throw new Error(\`Asset upload failed (HTTP \${da.status})\${detail}\`)
            }
            const data = await da.clone().json().catch(() => ({}))
            throw new Error(data?.detail || data?.error || \`setItem Error (\${da.status})\`)
        }
        /* BG-PRESERVE:END */
`,
            markerNeedle: 'asset-upload-error-detail',
            anchorPolicy: 'first',
            requires: ['lazy-chat-bg-adapter:adaptive-asset-upload-retry'],
        },
        {
            id: 'lazy-chat-bg-adapter:barrier',
            file: 'src/ts/bgDurableSaveBarrier.ts',
            type: 'owned',
            content: owned('src/ts/bgDurableSaveBarrier.ts'),
        },
        {
            id: 'lazy-chat-bg-adapter:barrier-tests',
            file: 'src/ts/bgDurableSaveBarrier.test.ts',
            type: 'owned',
            content: owned('src/ts/bgDurableSaveBarrier.test.ts'),
        },
        {
            id: 'lazy-chat-bg-adapter:global-import',
            file: 'src/ts/globalApi.svelte.ts',
            type: 'insert',
            where: 'after',
            anchor: 'import { isHydrating, saveChatToServer, ensureChatHydrated, chatToStub, classifyChat, convertStubsToPlaceholders } from "./storage/chatStorage";\n',
            content: 'import { completeBgDurableSave } from "./bgDurableSaveBarrier";\n',
            requires: [
                'bg-preserve:hook:globalapi-durable-save-api',
            ],
            after: [
                ...bgGlobalApiUnits,
                'lazy-chat-sync:replace:src:ts:globalApi-svelte-ts',
                'lazy-chat-sync:replace:src:ts:globalApi-svelte-ts:1.9',
            ],
        },
        {
            id: 'lazy-chat-bg-adapter:durable-flush',
            file: 'src/ts/globalApi.svelte.ts',
            type: 'replace',
            anchor: "        if (!committed) throw new Error('durable save deferred; orchestration result retained')\n",
            content: `        await completeBgDurableSave(
            committed,
            () => forageStorage.flushDatabase(),
        )
`,
            requires: [
                'bg-preserve:hook:globalapi-durable-save-impl',
            ],
            after: [
                ...bgGlobalApiUnits,
                'lazy-chat-sync:replace:src:ts:globalApi-svelte-ts',
                'lazy-chat-sync:replace:src:ts:globalApi-svelte-ts:1.9',
                'lazy-chat-bg-adapter:global-import',
            ],
        },
        {
            id: 'lazy-chat-bg-adapter:owned:server-chat-commit-owner:1.10',
            file: 'server/node/serverChatCommitOwner.cjs',
            type: 'owned',
            content: owned1100('server/node/serverChatCommitOwner.cjs'),
            requires: [
                'lazy-chat-sync:owned:server:node:serverChatCommit-cjs:1.10',
                'bg-preserve:owned:server/node/bgOrchestrationOperationStore.cjs',
            ],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:owned:server-chat-commit-owner-test:1.10',
            file: 'server/node/serverChatCommitOwner.test.ts',
            type: 'owned',
            content: owned1100('server/node/serverChatCommitOwner.test.ts'),
            requires: [
                'lazy-chat-bg-adapter:owned:server-chat-commit-owner:1.10',
                'lazy-chat-sync:owned:server:node:chatWriteJournal-cjs',
            ],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:owned:server-chat-commit-routes-test:1.10',
            file: 'server/node/bgServerChatCommitRoutes.test.ts',
            type: 'owned',
            content: owned1100('server/node/bgServerChatCommitRoutes.test.ts'),
            requires: [
                'lazy-chat-bg-adapter:server-chat-commit-missing-result:1.10',
                'lazy-chat-bg-adapter:owned:server-chat-commit-owner:1.10',
            ],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-chat-commit-owner-init:1.10',
            file: 'server/node/server.cjs',
            type: 'insert',
            where: 'before',
            anchor: '// ─── Express error middleware — must be registered after all routes ─────────\n',
            content: `const { createServerChatCommitOwner } = require('./serverChatCommitOwner.cjs');

async function ensureServerChatCommitCanonicalState() {
    await ensureChatStore();
    if (dbCache[DB_HEX_KEY]) return;
    const raw = kvGet('database/database.bin');
    if (!raw) return;
    const database = await decodeDatabaseWithPersistentChatIds(raw, { createBackup: true });
    cacheStrippedDatabase(normalizeJSON(stripChatsFromDb(database)));
}

const serverChatCommitOwner = createServerChatCommitOwner({
    chatWriteJournal,
    kvGet,
    kvSet,
    kvDel,
    kvDelPrefix,
    kvList,
    sqliteDb,
    queueStorageOperation,
    chatRevision,
    ensureCanonicalState: ensureServerChatCommitCanonicalState,
    getDbCache: () => dbCache,
    getFullChatStore: () => fullChatStore,
    databaseKey: DB_HEX_KEY,
    cacheStrippedDatabase,
    scheduleChatStorePersist,
});

`,
            requires: [
                'lazy-chat-bg-adapter:owned:server-chat-commit-owner:1.10',
                'lazy-chat-sync:replace:server:node:server-cjs:1.10',
            ],
            after: [
                'bg-preserve:hook:server-cjs-stream-reader-import',
                'bg-preserve:hook:server-cjs-explicit-stream-reader',
                'bg-preserve:hook:server-cjs-proxy-client-close',
                'bg-preserve:hook:server-cjs-proxy-get-client-close',
                'bg-preserve:hook:server-cjs-proxy-response-pipeline',
                'bg-preserve:hook:server-cjs-proxy-get-response-pipeline',
                'bg-preserve:hook:server-cjs-cleanup-missing-stream-cancel',
                'bg-preserve:hook:server-cjs-mark-user-stream-cancel',
                'bg-preserve:hook:server-cjs-register-routes:1.9',
                'client-build-fence:server-import:1.9',
                'client-build-fence:server-middleware:1.9',
                'client-build-fence:server-session-advertise:1.9',
                'kei-backup-restore-safety-lazy-adapter:server-helper-import:1.9',
                'kei-backup-restore-safety-lazy-adapter:snapshot-protected-rotation:1.9',
                'kei-backup-restore-safety-lazy-adapter:snapshot-force-new:1.9',
                'kei-backup-restore-safety-lazy-adapter:flush-without-automatic-snapshot:1.9',
                'kei-backup-restore-safety-lazy-adapter:flush-snapshot-gate:1.9',
                'kei-backup-restore-safety-lazy-adapter:import-option:1.9',
                'kei-backup-restore-safety-lazy-adapter:import-fresh-snapshot:1.9',
                'kei-backup-restore-safety-lazy-adapter:local-import-route-option:1.9',
                'kei-backup-restore-safety-lazy-adapter:local-import-json-option:1.9',
                'kei-backup-restore-safety-lazy-adapter:local-import-error-code:1.9',
                'kei-backup-restore-safety-lazy-adapter:server-restore-deferred-stream:1.9',
                'kei-backup-restore-safety-lazy-adapter:server-restore-route-option:1.9',
                'kei-backup-restore-safety-lazy-adapter:server-restore-error-code:1.9',
                'kei-backup-restore-safety-lazy-adapter:snapshot-restore-fresh-snapshot:1.9',
                'kei-backup-restore-safety-lazy-adapter:snapshot-restore-post-copy-rotation:1.9',
                'kei-backup-restore-safety-lazy-adapter:snapshot-restore-post-commit-rotation:1.9',
                'kei-backup-restore-safety-lazy-adapter:snapshot-restore-error-code:1.9',
                'pagefold-model-preset:server-binary-body-limit:1.10',
                'pagefold-model-preset:server-render-route-registration:1.10',
                'persona-organizer:server-gallery-assets-1.10',
                'server-backup-snapshot-lazy-adapter:server-db-reader:1.9',
                'server-backup-snapshot-lazy-adapter:server-helper-import:1.9',
                'server-backup-snapshot-lazy-adapter:server-source-lifecycle:1.9',
                'server-backup-snapshot-lazy-adapter:cold-storage-reader:1.9',
                'server-backup-snapshot-lazy-adapter:settings-and-download-export:1.9',
                'server-backup-snapshot-lazy-adapter:server-save-export:1.9',
                'server-backup-snapshot-lazy-adapter:compression-storage-queue:1.9',
                'server-backup-snapshot-lazy-adapter:maintenance-gate:1.10',
                'server-backup-snapshot-lazy-adapter:startup-pin-sweep:1.10',
            ],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-chat-commit-registration:1.10',
            file: 'server/node/server.cjs',
            type: 'replace',
            anchor: "require('./bgOrchestrator.cjs')(app, Object.assign({ sessionAuthMiddleware, ensureChatStore, getDbCache: () => dbCache, getFullChatStore: () => fullChatStore, DB_HEX_KEY, requestLogs }, require('./db.cjs')));",
            content: "require('./bgOrchestrator.cjs')(app, Object.assign({ sessionAuthMiddleware, ensureChatStore, getDbCache: () => dbCache, getFullChatStore: () => fullChatStore, DB_HEX_KEY, requestLogs, serverChatCommitOwner }, require('./db.cjs')));",
            requires: [
                'lazy-chat-bg-adapter:server-chat-commit-owner-init:1.10',
                'bg-preserve:hook:server-cjs-register-routes:1.9',
            ],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-chat-commit-startup-recovery:1.10',
            file: 'server/node/server.cjs',
            type: 'replace',
            anchor: '    await startServer();\n',
            content: `    const recoveredServerChatCommits = await serverChatCommitOwner.recoverAll();
    const pendingServerChatCommits = recoveredServerChatCommits.filter((entry) => (
        entry.status !== 'committed' || entry.publication === 'pending_recovery'
    ));
    if (pendingServerChatCommits.length > 0) {
        logger.error(
            '[ServerChatCommit] Recovery remains pending for '
            + pendingServerChatCommits.length + ' operation(s)'
        );
    } else if (recoveredServerChatCommits.length > 0) {
        logger.info(
            '[ServerChatCommit] Recovered '
            + recoveredServerChatCommits.length + ' operation(s) before listen'
        );
    }
    await startServer();
`,
            requires: ['lazy-chat-bg-adapter:server-chat-commit-registration:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-chat-commit-backup-reset:1.10',
            file: 'server/node/server.cjs',
            type: 'replace',
            anchor: `    kvDelPrefix(CHAT_WRITE_JOURNAL_PREFIX);
    chatWriteJournal.resetMemory();
    // Allow remote-block migration to re-evaluate against the new database.bin.
`,
            content: `    kvDelPrefix(CHAT_WRITE_JOURNAL_PREFIX);
    serverChatCommitOwner.discardRecovery();
    chatWriteJournal.resetMemory();
    // Allow remote-block migration to re-evaluate against the new database.bin.
`,
            requires: ['lazy-chat-bg-adapter:server-chat-commit-startup-recovery:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-chat-commit-database-remove-reset:1.10',
            file: 'server/node/server.cjs',
            type: 'replace',
            anchor: `            if (key === 'database/database.bin') {
                kvDelPrefix(CHAT_WRITE_JOURNAL_PREFIX);
                chatWriteJournal.resetMemory();
`,
            content: `            if (key === 'database/database.bin') {
                kvDelPrefix(CHAT_WRITE_JOURNAL_PREFIX);
                serverChatCommitOwner.discardRecovery();
                chatWriteJournal.resetMemory();
`,
            requires: ['lazy-chat-bg-adapter:server-chat-commit-backup-reset:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-chat-commit-save-folder-reset:1.10',
            file: 'server/node/server.cjs',
            type: 'replace',
            anchor: `function clearExistingData() {
    kvDelPrefix('assets/');
`,
            content: `function clearExistingData() {
    serverChatCommitOwner.discardRecovery();
    kvDelPrefix('assets/');
`,
            requires: ['lazy-chat-bg-adapter:server-chat-commit-database-remove-reset:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-chat-commit-snapshot-reset:1.10',
            file: 'server/node/server.cjs',
            type: 'replace',
            anchor: `                discardJournal: () => kvDelPrefix(CHAT_WRITE_JOURNAL_PREFIX),
                resetJournalMemory: () => chatWriteJournal.resetMemory(),
`,
            content: `                discardJournal: () => kvDelPrefix(CHAT_WRITE_JOURNAL_PREFIX),
                discardCommitRecovery: () => serverChatCommitOwner.discardRecovery(),
                resetJournalMemory: () => chatWriteJournal.resetMemory(),
`,
            requires: ['lazy-chat-bg-adapter:server-chat-commit-save-folder-reset:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-chat-commit-settings-digest:1.10',
            file: 'server/node/bgOrchestrator.cjs',
            type: 'insert',
            where: 'after',
            anchor: '    stores.selectedCharID.set(charIdx)\n',
            content: `    const serverChatCommitSettingsDigest = mode === 'full'
      && control && control.serverChatCommitVersion === 1
      ? nodeCrypto
        .createHash('sha256')
        .update(JSON.stringify({ database: db, selectedCharId, selectedChatId }))
        .digest('hex')
      : null
`,
            requires: ['bg-preserve:owned:server/node/bgOrchestrator.cjs:1.9'],
            after: ['pagefold-bg-adapter:bundle-stale-sources:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-chat-commit-operation-state:1.10',
            file: 'server/node/bgOrchestrationOperationStore.cjs',
            type: 'replace',
            anchor: `    ...(typeof (meta && meta.baseChatRevision) === 'string'
      && meta.baseChatRevision.length > 0 && meta.baseChatRevision.length <= 256
      ? { baseChatRevision: meta.baseChatRevision }
      : {}),
    state,
`,
            content: `    ...(typeof (meta && meta.baseChatRevision) === 'string'
      && meta.baseChatRevision.length > 0 && meta.baseChatRevision.length <= 256
      ? { baseChatRevision: meta.baseChatRevision }
      : {}),
    ...(meta && meta.serverChatCommitVersion === 1
      && typeof meta.serverBaseChatRevision === 'string'
      && meta.serverBaseChatRevision.length > 0
      && meta.serverBaseChatRevision.length <= 256
      ? {
          serverChatCommitVersion: 1,
          serverBaseChatRevision: meta.serverBaseChatRevision,
        }
      : {}),
    state,
`,
            requires: [
                'bg-preserve:owned:server/node/bgOrchestrationOperationStore.cjs',
                'lazy-chat-bg-adapter:owned:server-chat-commit-owner:1.10',
            ],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-chat-commit-result-context:1.10',
            file: 'server/node/bgOrchestrator.cjs',
            type: 'replace',
            anchor: `        globalChatVariablesExpected: gvDiff.expected,
        threw: fullThrew ? String((fullThrew && fullThrew.message) || fullThrew) : null,
`,
            content: `        globalChatVariablesExpected: gvDiff.expected,
        settingsDigest: serverChatCommitSettingsDigest,
        threw: fullThrew ? String((fullThrew && fullThrew.message) || fullThrew) : null,
`,
            requires: ['lazy-chat-bg-adapter:server-chat-commit-settings-digest:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-chat-commit-result-response:1.10',
            file: 'server/node/bgOrchestrator.cjs',
            type: 'replace',
            anchor: '    error: record.error, postError: record.postError,\n',
            content: `    error: record.error, postError: record.postError,
    serverChatCommit: record.serverChatCommit || null,
`,
            requires: ['lazy-chat-bg-adapter:server-chat-commit-result-context:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-chat-commit-result-id:1.10',
            file: 'server/node/bgOrchestrator.cjs',
            type: 'replace',
            anchor: '    resultId: nodeCrypto.randomUUID(),\n',
            content: `    resultId: opts && validOperationId(opts.resultId)
      ? opts.resultId : nodeCrypto.randomUUID(),
`,
            requires: ['lazy-chat-bg-adapter:server-chat-commit-result-response:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-chat-commit-result-record:1.10',
            file: 'server/node/bgOrchestrator.cjs',
            type: 'replace',
            anchor: `    postError: kind === 'terminal-partial' ? (result.threw || undefined) : undefined,
    time: Date.now(),
`,
            content: `    postError: kind === 'terminal-partial' ? (result.threw || undefined) : undefined,
    serverChatCommit: opts && opts.serverChatCommit ? opts.serverChatCommit : undefined,
    time: Date.now(),
`,
            requires: ['lazy-chat-bg-adapter:server-chat-commit-result-id:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-chat-commit-dependency:1.10',
            file: 'server/node/bgOrchestrator.cjs',
            type: 'replace',
            anchor: `    sessionAuthMiddleware, ensureChatStore, getDbCache, getFullChatStore, DB_HEX_KEY,
    kvSet, kvGet, kvList, kvDel, kvGetUpdatedAt, // from Object.assign(deps, require('./db.cjs'))
`,
            content: `    sessionAuthMiddleware, ensureChatStore, getDbCache, getFullChatStore, DB_HEX_KEY,
    kvSet, kvGet, kvList, kvDel, kvGetUpdatedAt, serverChatCommitOwner,
`,
            requires: [
                'lazy-chat-bg-adapter:server-chat-commit-result-record:1.10',
                'lazy-chat-bg-adapter:server-chat-commit-registration:1.10',
            ],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-chat-commit-start-gate:1.10',
            file: 'server/node/bgOrchestrator.cjs',
            type: 'replace',
            anchor: `        const resultKeyVersion = req.body && req.body.resultKeyVersion === 1 ? 1 : 0
        const requestedBaseChatRevision = req.body && req.body.baseChatRevision
`,
            content: `        const resultKeyVersion = req.body && req.body.resultKeyVersion === 1 ? 1 : 0
        const serverChatCommitVersion = req.body && req.body.serverChatCommitVersion === 1 ? 1 : 0
        if (serverChatCommitVersion === 1
          && (resultKeyVersion !== 1 || !serverChatCommitOwner)) {
          return res.status(409).json({
            handled: false, started: false, operationId,
            reason: 'server-chat-commit-unavailable',
          })
        }
        let serverCommitBase = null
        if (serverChatCommitVersion === 1) {
          try {
            serverCommitBase = await serverChatCommitOwner.captureBase(
              selectedCharId,
              selectedChatId,
              currentChat,
            )
          } catch (error) {
            console.error(
              '[bg-orch] server chat commit base read failed:',
              (error && error.code) || 'unavailable',
            )
            return res.status(503).json({
              handled: false, started: false, operationId,
              reason: 'server-chat-commit-base-read-failed',
            })
          }
        }
        const serverBaseChatRevision = serverCommitBase && serverCommitBase.revision
        if (serverChatCommitVersion === 1 && !serverBaseChatRevision) {
          return res.status(409).json({
            handled: false, started: false, operationId,
            reason: 'server-chat-commit-base-unavailable',
          })
        }
        if (serverChatCommitVersion === 1 && !serverCommitBase.matches) {
          return res.status(409).json({
            handled: false, started: false, operationId,
            reason: 'server-chat-commit-input-stale',
          })
        }
        const requestedBaseChatRevision = req.body && req.body.baseChatRevision
`,
            requires: ['lazy-chat-bg-adapter:server-chat-commit-preview-call:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-chat-commit-preview-owner:1.10',
            file: 'server/node/bgOrchestrator.cjs',
            type: 'insert',
            where: 'after',
            anchor: `  const orchestrationRuns = deps && deps.orchestrationRuns
    ? deps.orchestrationRuns
    : createOrchestrationRunRegistry()
`,
            content: `  const runDetachedServerPreview = deps && typeof deps.runServerPreview === 'function'
    ? deps.runServerPreview
    : runServerPreview
`,
            requires: ['lazy-chat-bg-adapter:server-chat-commit-dependency:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-chat-commit-preview-call:1.10',
            file: 'server/node/bgOrchestrator.cjs',
            type: 'replace',
            anchor: `            const result = await runServerPreview(
              { getDbCache, DB_HEX_KEY, kvSet, kvGet, requestLogs: deps.requestLogs }, selectedCharId, selectedChatId, currentChat, 'full',
`,
            content: `            const result = await runDetachedServerPreview(
              { getDbCache, DB_HEX_KEY, kvSet, kvGet, requestLogs: deps.requestLogs }, selectedCharId, selectedChatId, currentChat, 'full',
`,
            requires: ['lazy-chat-bg-adapter:server-chat-commit-preview-owner:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-chat-commit-operation-meta:1.10',
            file: 'server/node/bgOrchestrator.cjs',
            type: 'replace',
            anchor: `          ...(typeof requestedBaseChatRevision === 'string'
            && requestedBaseChatRevision.length > 0 && requestedBaseChatRevision.length <= 256
            ? { baseChatRevision: requestedBaseChatRevision }
            : {}),
`,
            content: `          ...(typeof requestedBaseChatRevision === 'string'
            && requestedBaseChatRevision.length > 0 && requestedBaseChatRevision.length <= 256
            ? { baseChatRevision: requestedBaseChatRevision }
            : {}),
          ...(serverChatCommitVersion === 1 ? {
            serverChatCommitVersion,
            serverBaseChatRevision,
          } : {}),
`,
            requires: ['lazy-chat-bg-adapter:server-chat-commit-start-gate:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-chat-commit-run-context:1.10',
            file: 'server/node/bgOrchestrator.cjs',
            type: 'replace',
            anchor: `                operationId,
                resultKeyVersion,
                globalChatVariablesSnapshot: req.body && req.body.globalVariablesVersion === 1
`,
            content: `                operationId,
                resultKeyVersion,
                serverChatCommitVersion,
                globalChatVariablesSnapshot: req.body && req.body.globalVariablesVersion === 1
`,
            requires: ['lazy-chat-bg-adapter:server-chat-commit-operation-meta:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-chat-commit-terminal:1.10',
            file: 'server/node/bgOrchestrator.cjs',
            type: 'replace',
            anchor: `            const persisted = persistOrchResult(kvSet, selectedCharId, selectedChatId, result, {
              kind: terminalOrchResultKind(result, currentChat),
              operationId,
              resultKeyVersion,
              kvGet,
              publishSeq: orchestrationRuns.nextPublishSequence(operationId, activeRun),
            })
            terminalState = persisted.persisted ? 'finished' : 'delivery-failed'
            if (resultKeyVersion === 1) {
              writeOperationState(kvSet, operationId, operationMeta,
                persisted.persisted ? 'result-ready' : 'delivery-failed')
            }
            const msgs = result && result.chat && Array.isArray(result.chat.message) ? result.chat.message.length : -1
            console.log(\`[bg-orch] S4b detached done: msgs=\${msgs} threw=\${result ? result.threw : '?'} TOTAL=\${Date.now() - t0}ms (\${persisted.persisted ? 'kv saved' : 'delivery failed'})\`)
`,
            content: `            const terminalKind = terminalOrchResultKind(result, currentChat)
            const resultId = nodeCrypto.randomUUID()
            const publishSeq = orchestrationRuns.nextPublishSequence(operationId, activeRun)
            const committedAt = new Date().toISOString()
            let serverChatCommit = null
            if (serverChatCommitVersion === 1
              && (terminalKind === 'terminal-success' || terminalKind === 'terminal-partial')) {
              try {
                serverChatCommit = await serverChatCommitOwner.commitGenerationResult({
                  operationId,
                  resultId,
                  publishSeq,
                  charId: selectedCharId,
                  chatId: selectedChatId,
                  baseChatRevision: serverBaseChatRevision,
                  baselineMessageCount: chatMessageCount(currentChat),
                  settingsDigest: result && result.settingsDigest,
                  result,
                  committedAt,
                })
              } catch (error) {
                console.error(
                  '[bg-orch] server chat commit failed:',
                  (error && (error.code || error.message)) || 'unknown',
                )
                serverChatCommit = { status: 'failed', reason: 'commit_failed' }
              }
              if (serverChatCommit && serverChatCommit.status === 'cancelled') {
                terminalState = 'cancelled'
                activeRun.cancelled = true
                return
              }
            }
            const persisted = persistOrchResult(kvSet, selectedCharId, selectedChatId, result, {
              kind: terminalKind,
              operationId,
              resultKeyVersion,
              kvGet,
              resultId,
              publishSeq,
              serverChatCommit,
            })
            terminalState = persisted.persisted ? 'finished' : 'delivery-failed'
            if (resultKeyVersion === 1
              && (!serverChatCommit || serverChatCommit.status !== 'committed')) {
              writeOperationState(kvSet, operationId, operationMeta,
                persisted.persisted ? 'result-ready' : 'delivery-failed')
            }
            const msgs = result && result.chat && Array.isArray(result.chat.message) ? result.chat.message.length : -1
            const commitState = serverChatCommit && serverChatCommit.status
              ? serverChatCommit.status : 'legacy'
            console.log(\`[bg-orch] S4b detached done: msgs=\${msgs} threw=\${result ? result.threw : '?'} TOTAL=\${Date.now() - t0}ms (\${persisted.persisted ? 'kv saved' : 'delivery failed'}, chat=\${commitState})\`)
`,
            requires: ['lazy-chat-bg-adapter:server-chat-commit-run-context:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-chat-commit-status:1.10',
            file: 'server/node/bgOrchestrator.cjs',
            type: 'replace',
            anchor: `    if (!validOperationId(operationId) || !charId || !chatId) {
      return res.status(400).json({ accepted: false, state: 'invalid-request' })
    }
    const run = orchestrationRuns.get(operationId)
`,
            content: `    if (!validOperationId(operationId) || !charId || !chatId) {
      return res.status(400).json({ accepted: false, state: 'invalid-request' })
    }
    const committed = serverChatCommitOwner
      ? serverChatCommitOwner.readGenerationCommit(operationId)
      : null
    if (committed && committed.status === 'committed') {
      if (committed.receipt.requestedCharId !== charId
        || committed.receipt.requestedChatId !== chatId) {
        return res.status(409).json({ accepted: false, operationId, state: 'coordinate-conflict' })
      }
      return res.json({
        accepted: true,
        operationId,
        state: 'chat-committed',
        resultKeyVersion: 1,
        serverChatCommit: committed.receipt,
      })
    }
    if (committed && committed.status === 'conflict') {
      return res.status(503).json({ accepted: false, operationId, state: 'commit-record-invalid' })
    }
    const run = orchestrationRuns.get(operationId)
`,
            requires: ['lazy-chat-bg-adapter:server-chat-commit-terminal:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-chat-commit-cancel:1.10',
            file: 'server/node/bgOrchestrator.cjs',
            type: 'replace',
            anchor: `    const outcome = orchestrationRuns.cancel(operationId)
`,
            content: `    const committed = serverChatCommitOwner
      ? serverChatCommitOwner.readGenerationCommit(operationId)
      : null
    if (committed && committed.status === 'committed') {
      return res.status(409).json({
        cancelled: false,
        operationId,
        reason: 'already-committed',
        serverChatCommit: committed.receipt,
      })
    }
    if (committed && committed.status === 'conflict') {
      return res.status(503).json({ cancelled: false, operationId, reason: 'commit-record-invalid' })
    }
    const outcome = orchestrationRuns.cancel(operationId)
`,
            requires: ['lazy-chat-bg-adapter:server-chat-commit-status:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-chat-commit-delivered-result:1.10',
            file: 'server/node/bgOrchestrator.cjs',
            type: 'replace',
            anchor: `      if (cancelled || (state && state.state === 'delivered')) {
        return res.json({
          found: false,
          operationId,
          operationState: cancelled ? 'cancelled' : 'delivered',
          stage: 0,
          status: [],
        })
      }
`,
            content: `      if (cancelled || (state && state.state === 'delivered')) {
        const committed = serverChatCommitOwner
          ? serverChatCommitOwner.readGenerationCommit(operationId)
          : null
        if (committed && committed.status === 'committed') {
          return res.json({
            found: false,
            operationId,
            operationState: 'chat-committed',
            serverChatCommit: committed.receipt,
            stage: 0,
            status: [],
          })
        }
        return res.json({
          found: false,
          operationId,
          operationState: cancelled ? 'cancelled' : 'delivered',
          stage: 0,
          status: [],
        })
      }
`,
            requires: ['lazy-chat-bg-adapter:server-chat-commit-cancel:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-chat-commit-missing-result:1.10',
            file: 'server/node/bgOrchestrator.cjs',
            type: 'replace',
            anchor: `      if (delivery.state === 'missing') {
        const operationState = run
          ? (run.state === 'running' && run.cancelled ? 'cancelled' : run.state)
          : orphanedOperationState(state)
        return res.json({
          found: false, operationId, operationState,
          stage: _orchStage[operationId] ?? 0,
          status: _orchStatus[operationId] || [],
        })
      }
`,
            content: `      if (delivery.state === 'missing') {
        const committed = serverChatCommitOwner
          ? serverChatCommitOwner.readGenerationCommit(operationId)
          : null
        const operationState = committed && committed.status === 'committed'
          ? 'chat-committed'
          : run
            ? (run.state === 'running' && run.cancelled ? 'cancelled' : run.state)
            : orphanedOperationState(state)
        return res.json({
          found: false, operationId, operationState,
          ...(committed && committed.status === 'committed'
            ? { serverChatCommit: committed.receipt }
            : {}),
          stage: _orchStage[operationId] ?? 0,
          status: _orchStatus[operationId] || [],
        })
      }
`,
            requires: ['lazy-chat-bg-adapter:server-chat-commit-delivered-result:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-chat-commit-active-response:1.10',
            file: 'server/node/bgOrchestrator.cjs',
            type: 'replace',
            anchor: `          return res.json({
            handled: true, started: true, operationId, reused: true,
            state: orchestrationRuns.status(operationId),
            resultKeyVersion: activeExisting.resultKeyVersion || 0,
          })
`,
            content: `          return res.json({
            handled: true, started: true, operationId, reused: true,
            state: orchestrationRuns.status(operationId),
            resultKeyVersion: activeExisting.resultKeyVersion || 0,
            serverChatCommitVersion: activeExisting.serverChatCommitVersion === 1 ? 1 : 0,
          })
`,
            requires: ['lazy-chat-bg-adapter:server-chat-commit-missing-result:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-chat-commit-durable-response:1.10',
            file: 'server/node/bgOrchestrator.cjs',
            type: 'replace',
            anchor: `        if (resultKeyVersion === 1) {
          const durable = readOperationState(kvGet, operationId)
          if (durable) {
            if (durable.charId !== operationMeta.charId || durable.chatId !== operationMeta.chatId) {
              return res.status(409).json({
                handled: false, started: false, operationId,
                reason: 'operation-coordinate-conflict',
              })
            }
            // \`queued\` is the sole restartable state: it was durably recorded before provider work
            // and a process death may have happened before the run began. Every later state is an
            // exact paid-work tombstone and must never launch the same operation again.
            if (durable.state !== 'queued') {
              return res.json({
                handled: true, started: true, operationId, reused: true,
                state: durable.state, resultKeyVersion: 1,
              })
            }
          }
        }
`,
            content: `        const durable = typeof kvGet === 'function'
          ? readOperationState(kvGet, operationId)
          : null
        if (durable) {
          if (durable.charId !== operationMeta.charId || durable.chatId !== operationMeta.chatId) {
            return res.status(409).json({
              handled: false, started: false, operationId,
              reason: 'operation-coordinate-conflict',
            })
          }
          const durableServerChatCommitVersion = durable.serverChatCommitVersion === 1 ? 1 : 0
          const sameServerBase = durableServerChatCommitVersion !== 1
            || durable.serverBaseChatRevision === serverBaseChatRevision
          if (resultKeyVersion !== 1
            || durableServerChatCommitVersion !== serverChatCommitVersion
            || !sameServerBase) {
            return res.status(409).json({
              handled: false, started: false, operationId,
              reason: 'operation-protocol-conflict',
            })
          }
          // \`queued\` is the sole restartable state: it was durably recorded before provider work
          // and a process death may have happened before the run began. Every later state is an
          // exact paid-work tombstone and must never launch the same operation again.
          if (durable.state !== 'queued') {
            return res.json({
                handled: true, started: true, operationId, reused: true,
                state: durable.state, resultKeyVersion: 1,
                serverChatCommitVersion: durable.serverChatCommitVersion === 1 ? 1 : 0,
              })
          }
        }
`,
            requires: ['lazy-chat-bg-adapter:server-chat-commit-active-response:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-chat-commit-running-response:1.10',
            file: 'server/node/bgOrchestrator.cjs',
            type: 'replace',
            anchor: `          return res.json({
            handled: true,
            started: true,
            operationId,
            reused: true,
            state: orchestrationRuns.status(operationId),
            resultKeyVersion: started.run.resultKeyVersion || 0,
          })
`,
            content: `          return res.json({
            handled: true,
            started: true,
            operationId,
            reused: true,
            state: orchestrationRuns.status(operationId),
            resultKeyVersion: started.run.resultKeyVersion || 0,
            serverChatCommitVersion: started.run.serverChatCommitVersion === 1 ? 1 : 0,
          })
`,
            requires: ['lazy-chat-bg-adapter:server-chat-commit-durable-response:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-chat-commit-start-response:1.10',
            file: 'server/node/bgOrchestrator.cjs',
            type: 'replace',
            anchor: '        return res.json({ handled: true, started: true, operationId, resultKeyVersion })\n',
            content: `        return res.json({
          handled: true,
          started: true,
          operationId,
          resultKeyVersion,
          serverChatCommitVersion,
        })
`,
            requires: ['lazy-chat-bg-adapter:server-chat-commit-running-response:1.10'],
            targetVersions: pocketRisu1100,
        },
    ],
}
