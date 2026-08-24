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
    'src/ts/storage/backgroundImportClient.test.ts',
    'src/ts/storage/backgroundImportClient.ts',
    'src/ts/storage/backgroundImportReconcile.test.ts',
    'src/ts/storage/backgroundImportReconcile.ts',
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
    version: '0.1.1',
    targets: {
        pocketrisu: {
            verified: [],
            reviewing: ['1.10.0'],
        },
    },
    userSelectable: true,
    allDefault: false,
    presetDefaults: [],
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
    ],
}
