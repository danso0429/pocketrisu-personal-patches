'use strict'

const fs = require('node:fs')
const path = require('node:path')

// anchors/ and files/ hold the version-independent units; the whole-file
// replacements of the PocketRisu 1.10.0 sources live in anchors-1.10/files-1.10.
const anchorsRoot = path.join(__dirname, 'anchors')
const filesRoot = path.join(__dirname, 'files')
const anchors1100Root = path.join(__dirname, 'anchors-1.10')
const files1100Root = path.join(__dirname, 'files-1.10')
const read = (root, relative) => fs.readFileSync(path.join(root, relative), 'utf8')

const versionedReplacedFiles = [
    'server/node/server.cjs',
    'src/ts/bootstrap.ts',
    'src/ts/globalApi.svelte.ts',
    'src/ts/plugins/apiV3/v3.svelte.ts',
    'src/ts/storage/autoStorage.ts',
    'src/ts/storage/chatStorage.ts',
    'src/ts/storage/nodeStorage.ts',
    'src/ts/storage/risuSave.ts',
    'src/ts/storage/risuSavePatcher.test.ts',
]

const unchangedReplacedFiles = [
    'src/ts/storage/chatStorage.test.ts',
]

const pocketRisu1100 = { pocketrisu: ['1.10.0'] }

const ownedFiles = [
    'server/node/chatDelta.cjs',
    'server/node/chatDelta.test.ts',
    'server/node/chatWriteJournal.cjs',
    'server/node/chatWriteJournal.test.ts',
    'src/ts/plugins/apiV3/pluginChatAccess.test.ts',
    'src/ts/plugins/apiV3/pluginChatAccess.ts',
    'src/ts/storage/conflictRebase.test.ts',
    'src/ts/storage/conflictRebase.ts',
    'src/ts/storage/chatSaveRebase.ts',
    'src/ts/storage/chatSaveRebase.test.ts',
    'src/ts/storage/chatSaveView.svelte.test.ts',
    'src/ts/storage/nodeStorage.chatRebaseCodec.test.ts',
    'src/ts/storage/chatIdentityRepair.test.ts',
    'src/ts/storage/chatIdentityRepair.ts',
    'src/ts/storage/chatSaveIntent.test.ts',
    'src/ts/storage/chatSaveIntent.ts',
    'src/ts/storage/nodeStorage.chatDelta.test.ts',
    'src/ts/storage/startupDatabaseCache.test.ts',
    'src/ts/storage/startupDatabaseCache.ts',
]

const owned1100Files = [
    'server/node/sessionLockReset.phaseB.test.ts',
    'server/node/serverChatCommit.cjs',
    'server/node/serverChatCommit.test.ts',
    'server/node/storageResetPrepare.cjs',
    'server/node/storageResetPrepare.test.ts',
    'server/node/storageResetTestHooks.cjs',
    'src/ts/bootstrap.freshDatabase.test.ts',
    'src/ts/storage/globalApi.savePersistence.test.ts',
    'src/ts/storage/nodeStorage.sessionHeaders.phaseB.test.ts',
    'src/ts/storage/writerSession.ts',
]

function unitId(relative) {
    return relative.replaceAll('/', ':').replaceAll('.', '-')
}

// Post-reset session invalidation on the upstream server/node/session-lock.cjs.
// After invalidateBefore(timestamp) a non-active session id that booted at or
// before the watermark, or has no recorded boot, is stale even while the lock
// is free. The active id keeps precedence. Without an invalidation the lock
// behaves exactly as upstream.
const sessionLockFile = 'server/node/session-lock.cjs'
const sessionLockResetUnits = [
    {
        name: 'watermark',
        type: 'insert',
        where: 'after',
        anchor: `    const boots = new Map(); // sessionId -> boot timestamp (insertion-ordered)
`,
        content: `    // Storage reset watermark set by invalidateBefore(); null = never set.
    // A non-active id that booted at or before it, or whose boot is unknown,
    // holds pre-reset state and must reload before it may write.
    let invalidatedBefore = null;
    function invalidated(id) {
        if (invalidatedBefore === null) return false;
        const boot = boots.get(id);
        return boot === undefined || boot <= invalidatedBefore;
    }
`,
    },
    {
        name: 'register',
        type: 'replace',
        anchor: `        if (!active) {
            active = { id, lastWriteAt: now() };
        }`,
        content: `        if (!active && !invalidated(id)) {
            active = { id, lastWriteAt: now() };
        }
`,
    },
    {
        name: 'check-write',
        type: 'replace',
        anchor: `        if (!active) {
            active = { id, lastWriteAt: now() };
            return { ok: true };
        }
        if (active.id === id) {
            active.lastWriteAt = now();
            return { ok: true };
        }`,
        content: `        if (active && active.id === id) {
            active.lastWriteAt = now();
            return { ok: true };
        }
        if (invalidated(id)) return { ok: false };
        if (!active) {
            active = { id, lastWriteAt: now() };
            return { ok: true };
        }
`,
    },
    {
        name: 'peek',
        type: 'replace',
        anchor: `        if (!active) return 'free';
        if (active.id === id) return 'active';`,
        content: `        if (active && active.id === id) return 'active';
        if (invalidated(id)) return 'stale';
        if (!active) return 'free';
`,
    },
    {
        name: 'invalidate-before',
        type: 'replace',
        anchor: `    return { register, checkWrite, peek, activeId };`,
        content: `    // Called once after a storage reset was applied: every session that
    // booted before it holds pre-reset state. Clears the lock and raises the
    // watermark (never lowers it). In memory, like the rest of the lock.
    function invalidateBefore(timestamp) {
        active = null;
        if (invalidatedBefore === null || timestamp > invalidatedBefore) {
            invalidatedBefore = timestamp;
        }
    }

    return { register, checkWrite, peek, activeId, invalidateBefore };
`,
    },
].map(({ name, ...unit }) => ({
    id: `lazy-chat-sync:session-lock:${name}:1.10`,
    file: sessionLockFile,
    ...unit,
    targetVersions: pocketRisu1100,
}))

module.exports = {
    id: 'lazy-chat-sync',
    title: 'Lazy chat synchronization and startup cache',
    version: '0.5.18',
    targets: {
        pocketrisu: {
            verified: ['1.10.0'],
            reviewing: [],
        },
    },
    userSelectable: true,
    units: [
        ...unchangedReplacedFiles.map((relative) => ({
            id: `lazy-chat-sync:replace:${unitId(relative)}`,
            file: relative,
            type: 'replace',
            anchor: read(anchorsRoot, relative),
            managed: read(filesRoot, relative),
        })),
        ...versionedReplacedFiles.map((relative) => ({
            id: `lazy-chat-sync:replace:${unitId(relative)}:1.10`,
            file: relative,
            type: 'replace',
            anchor: read(anchors1100Root, relative),
            managed: read(files1100Root, relative),
            targetVersions: pocketRisu1100,
        })),
        ...ownedFiles.map((relative) => ({
            id: `lazy-chat-sync:owned:${unitId(relative)}`,
            file: relative,
            type: 'owned',
            content: read(filesRoot, relative),
        })),
        ...owned1100Files.map((relative) => ({
            id: `lazy-chat-sync:owned:${unitId(relative)}:1.10`,
            file: relative,
            type: 'owned',
            content: read(files1100Root, relative),
            ...(relative === 'server/node/serverChatCommit.test.ts' ? {
                requires: [
                    'lazy-chat-sync:owned:server:node:chatWriteJournal-cjs',
                    'lazy-chat-sync:owned:server:node:serverChatCommit-cjs:1.10',
                ],
            } : {}),
            ...(relative === 'server/node/storageResetPrepare.test.ts' ? {
                requires: [
                    'lazy-chat-sync:owned:server:node:storageResetPrepare-cjs:1.10',
                ],
            } : {}),
            targetVersions: pocketRisu1100,
        })),
        {
            id: 'lazy-chat-sync:chat-missing-payload-notice',
            file: 'src/lib/ChatScreens/DefaultChatScreen.svelte',
            type: 'replace',
            anchor: `        const activeChat = await ensureActiveChatReady(selectedChar)
        if(!activeChat) return
`,
            content: `        const activeChat = await ensureActiveChatReady(selectedChar)
        if(!activeChat) {
            notifyError('Chat data unavailable', {
                description: 'The server has metadata for this chat but no message payload. Your draft was kept.',
                source: 'chat-hydration',
            })
            return
        }
`,
        },
        {
            id: 'lazy-chat-sync:plugin-api-chat-metadata-types',
            file: 'src/ts/plugins/apiV3/risuai.d.ts',
            type: 'replace',
            anchor: `    getDatabase(includeOnly:string[]|'all' = 'all'): Promise<DatabaseSubset|null>;
`,
            content: `    getDatabase(includeOnly:string[]|'all' = 'all'): Promise<DatabaseSubset|null>;

    /**
     * Gets the same allowed database keys without hydrating chat message
     * payloads. Character chat entries contain only id, name, lastDate,
     * folderId, and modules, so this method is suitable for read-only lists.
     * Use getDatabase() when chat messages are required.
     */
    getDatabaseMetadata(includeOnly:string[]|'all' = 'all'): Promise<DatabaseSubset|null>;
`,
        },
        ...sessionLockResetUnits,
    ],
}
