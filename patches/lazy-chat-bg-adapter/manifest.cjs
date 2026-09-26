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
    'bg-preserve:hook:globalapi-fetch-impl-register:1.9',
    'bg-preserve:hook:globalapi-fetchnative-bgsubkey-arg',
    'bg-preserve:hook:globalapi-gemini-main-branch',
]

module.exports = {
    id: 'lazy-chat-bg-adapter',
    title: 'BG preserve integration for lazy chat storage',
    version: '0.7.12',
    targets: {
        pocketrisu: {
            verified: ['1.10.0'],
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
            id: 'lazy-chat-bg-adapter:server-chat-snapshot-type:1.10',
            file: 'src/ts/storage/nodeStorage.ts',
            type: 'replace',
            anchor: 'interface ServerChatSnapshot {\n',
            content: 'export interface ServerChatSnapshot {\n',
            requires: ['lazy-chat-bg-adapter:asset-upload-error-detail'],
            after: [
                'client-build-fence-kei-lazy-storage-adapter:backup-xhr-response:1.9',
            ],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-chat-snapshot-read:1.10',
            file: 'src/ts/storage/nodeStorage.ts',
            type: 'replace',
            anchor: `    async fetchChatContent(chaId: string, chatIndex: number, chatId: string): Promise<any | null> {
        const serverSnapshot = await this.readServerChatSnapshot(chaId, chatIndex, chatId)
        if (!serverSnapshot) return null
        this.rememberChatSyncState(
            this.chatSyncKey(chaId, chatId),
            serverSnapshot.revision,
            serverSnapshot.chat,
            serverSnapshot.encodedBytes,
        )
        this.chatDeltaSupported = true
        return serverSnapshot.chat
    }
`,
            content: `    async peekChatContentSnapshot(
        chaId: string,
        chatIndex: number,
        chatId: string,
    ): Promise<ServerChatSnapshot | null> {
        return this.readServerChatSnapshot(chaId, chatIndex, chatId)
    }

    rememberChatContentSnapshot(
        chaId: string,
        chatId: string,
        serverSnapshot: ServerChatSnapshot,
    ): void {
        if (!serverSnapshot || serverSnapshot.chat?.id !== chatId
            || !Array.isArray(serverSnapshot.chat?.message)
            || typeof serverSnapshot.revision !== 'string' || !serverSnapshot.revision
            || !Number.isSafeInteger(serverSnapshot.encodedBytes)
            || serverSnapshot.encodedBytes < 0) {
            throw new Error('cannot remember an invalid server chat snapshot')
        }
        this.rememberChatSyncState(
            this.chatSyncKey(chaId, chatId),
            serverSnapshot.revision,
            serverSnapshot.chat,
            serverSnapshot.encodedBytes,
        )
        this.chatDeltaSupported = true
    }

    async fetchChatContentSnapshot(
        chaId: string,
        chatIndex: number,
        chatId: string,
    ): Promise<ServerChatSnapshot | null> {
        const serverSnapshot = await this.peekChatContentSnapshot(chaId, chatIndex, chatId)
        if (!serverSnapshot) return null
        this.rememberChatContentSnapshot(chaId, chatId, serverSnapshot)
        return serverSnapshot
    }

    async fetchChatContent(chaId: string, chatIndex: number, chatId: string): Promise<any | null> {
        return (await this.fetchChatContentSnapshot(chaId, chatIndex, chatId))?.chat ?? null
    }
`,
            requires: ['lazy-chat-bg-adapter:server-chat-snapshot-type:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-committed-chat-adoption:1.10',
            file: 'src/ts/storage/chatStorage.ts',
            type: 'insert',
            where: 'after',
            anchor: `export async function fetchChatFromServer(chaId: string, chatIndex: number, chatId: string): Promise<Chat | null> {
    const storage = forageStorage.realStorage
    return storage.fetchChatContent(chaId, chatIndex, chatId)
}
`,
            content: `
export async function peekServerChatSnapshot(
    chaId: string,
    chatIndex: number,
    chatId: string,
) {
    return forageStorage.realStorage.peekChatContentSnapshot(chaId, chatIndex, chatId)
}

export async function adoptServerCommittedChat(
    chats: Chat[],
    chaId: string,
    chatId: string,
    expectedServerRevision: string,
    allowedCurrentRevisions: string[],
    revisionOf: (chat: Chat) => string,
): Promise<{
    adopted: boolean
    reason?: string
    currentRevision?: string
    revision?: string
    chat?: Chat
}> {
    const initialIndex = chats.findIndex(chat => chat?.id === chatId)
    if (initialIndex < 0) return { adopted: false, reason: 'chat-missing' }
    const initial = chats[initialIndex]
    const allowed = new Set(allowedCurrentRevisions)
    if (!initial._placeholder) {
        let currentRevision = ''
        try { currentRevision = revisionOf(initial) } catch { /* invalid local chat */ }
        if (!allowed.has(currentRevision)) {
            return { adopted: false, reason: 'local-revision-conflict' }
        }
    }

    const key = chatKey(chaId, chatId)
    acquireHydrationState(hydrationInFlight, hydrationInFlightCounts, key)
    try {
        const snapshot = await forageStorage.realStorage.peekChatContentSnapshot(
            chaId,
            initialIndex,
            chatId,
        )
        if (!snapshot || !isValidHydratedChat(snapshot.chat, chatId)) {
            return { adopted: false, reason: 'server-chat-missing' }
        }
        if (snapshot.revision !== expectedServerRevision) {
            return {
                adopted: false,
                reason: 'server-revision-mismatch',
                currentRevision: snapshot.revision,
            }
        }
        snapshot.chat.isStreaming = false
        snapshot.chat.activeStreamingDisplayOptimizationMode = undefined
        await yieldForHydrationPaint()

        const currentIndex = chats.findIndex(chat => chat?.id === chatId)
        if (currentIndex < 0) return { adopted: false, reason: 'chat-removed' }
        const current = chats[currentIndex]
        if (current !== initial) return { adopted: false, reason: 'local-slot-replaced' }
        if (!current._placeholder) {
            let currentRevision = ''
            try { currentRevision = revisionOf(current) } catch { /* invalid local chat */ }
            if (!allowed.has(currentRevision)) {
                return { adopted: false, reason: 'local-revision-conflict' }
            }
        }

        acquireHydrationState(hydrationJustApplied, hydrationJustAppliedCounts, key)
        try {
            chats[currentIndex] = snapshot.chat
            forageStorage.realStorage.rememberChatContentSnapshot(chaId, chatId, snapshot)
            await tick()
        } finally {
            releaseHydrationState(hydrationJustApplied, hydrationJustAppliedCounts, key)
        }
        return {
            adopted: true,
            revision: snapshot.revision,
            chat: snapshot.chat,
        }
    } finally {
        releaseHydrationState(hydrationInFlight, hydrationInFlightCounts, key)
    }
}
`,
            requires: [
                'lazy-chat-sync:replace:src:ts:storage:chatStorage-ts:1.10',
                'lazy-chat-bg-adapter:server-chat-snapshot-read:1.10',
            ],
            targetVersions: pocketRisu1100,
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
            id: 'lazy-chat-bg-adapter:owned:bg-server-commit-hydration:1.10',
            file: 'src/ts/bgServerCommitHydration.ts',
            type: 'owned',
            content: owned1100('src/ts/bgServerCommitHydration.ts'),
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:owned:bg-server-commit-hydration-test:1.10',
            file: 'src/ts/bgServerCommitHydration.test.ts',
            type: 'owned',
            content: owned1100('src/ts/bgServerCommitHydration.test.ts'),
            requires: ['lazy-chat-bg-adapter:owned:bg-server-commit-hydration:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:owned:bg-server-pending-projection:1.10',
            file: 'src/ts/bgServerPendingProjection.ts',
            type: 'owned',
            content: owned1100('src/ts/bgServerPendingProjection.ts'),
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:owned:bg-server-pending-projection-test:1.10',
            file: 'src/ts/bgServerPendingProjection.test.ts',
            type: 'owned',
            content: owned1100('src/ts/bgServerPendingProjection.test.ts'),
            requires: ['lazy-chat-bg-adapter:owned:bg-server-pending-projection:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:owned:bg-server-input-admission:1.10',
            file: 'src/ts/bgServerInputAdmission.ts',
            type: 'owned',
            content: owned1100('src/ts/bgServerInputAdmission.ts'),
            requires: ['lazy-chat-bg-adapter:owned:bg-server-pending-projection:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:owned:bg-server-input-admission-test:1.10',
            file: 'src/ts/bgServerInputAdmission.test.ts',
            type: 'owned',
            content: owned1100('src/ts/bgServerInputAdmission.test.ts'),
            requires: ['lazy-chat-bg-adapter:owned:bg-server-input-admission:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:owned:bg-server-input-start:1.10',
            file: 'src/ts/bgServerInputStart.ts',
            type: 'owned',
            content: owned1100('src/ts/bgServerInputStart.ts'),
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:owned:bg-server-input-start-test:1.10',
            file: 'src/ts/bgServerInputStart.test.ts',
            type: 'owned',
            content: owned1100('src/ts/bgServerInputStart.test.ts'),
            requires: ['lazy-chat-bg-adapter:owned:bg-server-input-start:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:owned:bg-server-input-ledger:1.10',
            file: 'src/ts/bgServerInputLedger.ts',
            type: 'owned',
            content: owned1100('src/ts/bgServerInputLedger.ts'),
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:owned:bg-server-input-ledger-test:1.10',
            file: 'src/ts/bgServerInputLedger.test.ts',
            type: 'owned',
            content: owned1100('src/ts/bgServerInputLedger.test.ts'),
            requires: ['lazy-chat-bg-adapter:owned:bg-server-input-ledger:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:owned:bg-server-input-adoption:1.10',
            file: 'src/ts/bgServerInputAdoption.ts',
            type: 'owned',
            content: owned1100('src/ts/bgServerInputAdoption.ts'),
            requires: ['lazy-chat-bg-adapter:owned:bg-server-input-ledger:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:owned:bg-server-input-adoption-test:1.10',
            file: 'src/ts/bgServerInputAdoption.test.ts',
            type: 'owned',
            content: owned1100('src/ts/bgServerInputAdoption.test.ts'),
            requires: ['lazy-chat-bg-adapter:owned:bg-server-input-adoption:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:owned:bg-browser-message-effects:1.10',
            file: 'src/ts/bgBrowserMessageEffects.ts',
            type: 'owned',
            content: owned1100('src/ts/bgBrowserMessageEffects.ts'),
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:owned:bg-browser-message-effects-test:1.10',
            file: 'src/ts/bgBrowserMessageEffects.test.ts',
            type: 'owned',
            content: owned1100('src/ts/bgBrowserMessageEffects.test.ts'),
            requires: ['lazy-chat-bg-adapter:owned:bg-browser-message-effects:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:owned:bg-draft-identity:1.10',
            file: 'src/ts/bgDraftIdentity.ts',
            type: 'owned',
            content: owned1100('src/ts/bgDraftIdentity.ts'),
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:owned:bg-server-input-provider-policy:1.10',
            file: 'src/ts/bgServerInputProviderPolicy.ts',
            type: 'owned',
            content: owned1100('src/ts/bgServerInputProviderPolicy.ts'),
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:owned:bg-server-input-provider-policy-test:1.10',
            file: 'src/ts/bgServerInputProviderPolicy.test.ts',
            type: 'owned',
            content: owned1100('src/ts/bgServerInputProviderPolicy.test.ts'),
            requires: ['lazy-chat-bg-adapter:owned:bg-server-input-provider-policy:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:owned:bg-draft-identity-test:1.10',
            file: 'src/ts/bgDraftIdentity.test.ts',
            type: 'owned',
            content: owned1100('src/ts/bgDraftIdentity.test.ts'),
            requires: ['lazy-chat-bg-adapter:owned:bg-draft-identity:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:draft-identity-import:1.10',
            file: 'src/ts/storage/chatDraft.ts',
            type: 'insert',
            where: 'after',
            anchor: 'import { forageStorage } from "../globalApi.svelte"\n',
            content: 'import { legacyDraftIdentity, validDraftIdentity } from "../bgDraftIdentity"\n',
            requires: ['lazy-chat-bg-adapter:owned:bg-draft-identity:1.10'],
            after: [
                'client-build-fence:draft-import:1.9',
                'client-build-fence:draft-queue-state:1.9',
                'client-build-fence:draft-timer-state:1.9',
                'client-build-fence:draft-schedule-state:1.9',
                'client-build-fence:draft-flush-key:1.9',
                'client-build-fence:draft-remove-key:1.9',
                'client-build-fence:draft-sweep-key:1.9',
            ],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:draft-identity-type:1.10',
            file: 'src/ts/storage/chatDraft.ts',
            type: 'replace',
            anchor: '    t: string\n}\n',
            content: '    t: string\n    /** Stable identity of this unsent draft across tabs and reloads. */\n    id?: string\n}\n',
            requires: ['lazy-chat-bg-adapter:draft-identity-import:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:draft-identity-load:1.10',
            file: 'src/ts/storage/chatDraft.ts',
            type: 'replace',
            anchor: "        return { m: obj.m ?? '', t: obj.t ?? '' }\n",
            content: `        const m = typeof obj.m === 'string' ? obj.m : ''
        const t = typeof obj.t === 'string' ? obj.t : ''
        let id = validDraftIdentity(obj.id) ? obj.id : undefined
        if (!id) {
            try { id = await legacyDraftIdentity(chaId, chatId, m, t) }
            catch { /* Keep the text; server-owned admission will remain blocked. */ }
        }
        return { m, t, ...(id ? { id } : {}) }
`,
            requires: ['lazy-chat-bg-adapter:draft-identity-type:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:draft-identity-native-test:1.10',
            file: 'src/ts/storage/chatDraft.test.ts',
            type: 'replace',
            anchor: "        expect(loaded).toEqual({ m: 'second', t: '' })\n",
            content: "        expect(loaded).toMatchObject({ m: 'second', t: '' })\n        expect(loaded?.id).toMatch(/^legacy_[a-f0-9]{64}$/)\n",
            requires: ['lazy-chat-bg-adapter:draft-identity-load:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:draft-identity-native-roundtrip-test:1.10',
            file: 'src/ts/storage/chatDraft.test.ts',
            type: 'replace',
            anchor: "        expect(loaded).toEqual({ m: 'remember me', t: 'tr' })\n",
            content: "        expect(loaded).toMatchObject({ m: 'remember me', t: 'tr' })\n        expect(loaded?.id).toMatch(/^legacy_[a-f0-9]{64}$/)\n",
            requires: ['lazy-chat-bg-adapter:draft-identity-native-test:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:browser-stat-effect-send-import:1.10',
            file: 'src/ts/process/index.svelte.ts',
            type: 'insert',
            where: 'after',
            anchor: 'import { v4 } from "uuid";\n',
            content: 'import { recordBrowserMessageEffect } from "../bgBrowserMessageEffects";\n',
            requires: ['lazy-chat-bg-adapter:owned:bg-browser-message-effects:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:browser-stat-effect-send:1.10',
            file: 'src/ts/process/index.svelte.ts',
            type: 'replace',
            anchor: '    DBState.db.statics.messages += 1\n',
            managed: `    /* POCKETRISU-PATCH:lazy-chat-bg-adapter:browser-stat-effect-send:START */
    if ((globalThis as { __bgOrch?: unknown }).__bgOrch) {
        DBState.db.statics.messages += 1
    } else {
        recordBrowserMessageEffect(DBState.db.statics, generationId)
    }
    /* POCKETRISU-PATCH:lazy-chat-bg-adapter:browser-stat-effect-send:END */
`,
            markerNeedle: 'POCKETRISU-PATCH:lazy-chat-bg-adapter:browser-stat-effect-send:START',
            requires: ['lazy-chat-bg-adapter:browser-stat-effect-send-import:1.10'],
            after: ['bg-preserve:hook:index-direct-send-lifecycle-wrapper:1.9'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:owned:bg-server-input-client:1.10',
            file: 'src/ts/bgServerInputClient.ts',
            type: 'owned',
            content: owned1100('src/ts/bgServerInputClient.ts'),
            requires: [
                'lazy-chat-bg-adapter:owned:bg-server-input-ledger:1.10',
                'lazy-chat-bg-adapter:owned:bg-server-input-start:1.10',
                'lazy-chat-bg-adapter:owned:bg-server-input-admission:1.10',
            ],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:owned:bg-server-input-client-test:1.10',
            file: 'src/ts/bgServerInputClient.test.ts',
            type: 'owned',
            content: owned1100('src/ts/bgServerInputClient.test.ts'),
            requires: ['lazy-chat-bg-adapter:owned:bg-server-input-client:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:owned:server-pending-inputs-ui:1.10',
            file: 'src/lib/ChatScreens/ServerPendingInputs.svelte',
            type: 'owned',
            content: owned1100('src/lib/ChatScreens/ServerPendingInputs.svelte'),
            requires: ['lazy-chat-bg-adapter:owned:bg-server-pending-projection-test:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:owned:server-pending-inputs-ui-test:1.10',
            file: 'src/lib/ChatScreens/ServerPendingInputs.test.ts',
            type: 'owned',
            content: owned1100('src/lib/ChatScreens/ServerPendingInputs.test.ts'),
            requires: ['lazy-chat-bg-adapter:owned:server-pending-inputs-ui:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:owned:server-committed-chat-adoption-test:1.10',
            file: 'src/ts/storage/serverCommittedChatAdoption.test.ts',
            type: 'owned',
            content: owned1100('src/ts/storage/serverCommittedChatAdoption.test.ts'),
            requires: [
                'lazy-chat-bg-adapter:server-committed-chat-adoption:1.10',
                'lazy-chat-bg-adapter:owned:bg-server-commit-hydration-test:1.10',
            ],
            targetVersions: pocketRisu1100,
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
            id: 'lazy-chat-bg-adapter:browser-stat-effect-import:1.10',
            file: 'src/ts/globalApi.svelte.ts',
            type: 'insert',
            where: 'after',
            anchor: "import { v4 as uuidv4, v4 } from 'uuid';\n",
            content: 'import { mergeBrowserMessageEffects } from "./bgBrowserMessageEffects";\n',
            requires: [
                'lazy-chat-bg-adapter:global-import',
                'lazy-chat-bg-adapter:owned:bg-browser-message-effects:1.10',
            ],
            after: [
                'haejeok-persistence-safety-adapter:durable-save-plugin-scope',
                'haejeok-persistence-safety-adapter:durable-chat-payload-api',
                'haejeok-persistence-safety-adapter:durable-save-plugin-enlistment',
                'haejeok-persistence-safety-adapter:durable-chat-payload-impl',
            ],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:browser-stat-effect-rebase:1.10',
            file: 'src/ts/globalApi.svelte.ts',
            type: 'insert',
            where: 'after',
            anchor: `            const mergedDb = mergeThreeWayValue(
                previousServerBaseline,
                localDb,
                latestDb,
            ) as Database
`,
            content: `            mergeBrowserMessageEffects(
                previousServerBaseline,
                localDb,
                latestDb,
                mergedDb,
            )
`,
            requires: ['lazy-chat-bg-adapter:browser-stat-effect-import:1.10'],
            after: [
                ...bgGlobalApiUnits,
                'lazy-chat-sync:replace:src:ts:globalApi-svelte-ts',
                'client-build-fence:global-import:1.9',
                'client-build-fence:global-dirty-probe:1.9',
                'client-build-fence:global-flush:1.9',
                'client-build-fence:global-proxy-stream-cancel:1.9',
                'client-build-fence:global-proxy-stream-abort:1.9',
                'haejeok-persistence-safety-adapter:durable-save-plugin-scope',
                'haejeok-persistence-safety-adapter:durable-chat-payload-api',
                'haejeok-persistence-safety-adapter:durable-save-plugin-enlistment',
                'haejeok-persistence-safety-adapter:durable-chat-payload-impl',
            ],
            targetVersions: pocketRisu1100,
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
                'lazy-chat-sync:replace:src:ts:globalApi-svelte-ts:1.10',
                'lazy-chat-bg-adapter:global-import',
            ],
        },
        {
            id: 'lazy-chat-bg-adapter:server-commit-client-import:1.10',
            file: 'src/ts/bgOrchestrate.ts',
            type: 'replace',
            anchor: "import { ensureChatHydrated, fetchChatFromServer } from './storage/chatStorage'\n",
            content: `import {
    adoptServerCommittedChat,
    ensureChatHydrated,
    fetchChatFromServer,
    peekServerChatSnapshot,
} from './storage/chatStorage'
import {
    hydrateServerCommittedOrchestration,
    serverChatDeliveryDisposition,
    serverChatCommitReceipt,
} from './bgServerCommitHydration'
import { parseServerPendingInputs, type ServerPendingInput } from './bgServerPendingProjection'
import { submitServerInputCommand, type ServerInputClientOutcome } from './bgServerInputClient'
import { adoptAttachedServerInputs } from './bgServerInputAdoption'
import { recordBrowserMessageEffect } from './bgBrowserMessageEffects'
import { requiresClientOwnedInputPreparation } from './bgServerInputProviderPolicy'
import {
    advanceServerInputMarkerRevisions,
    clearServerInputMarker,
    readServerInputMarkers,
} from './bgServerInputLedger'
`,
            requires: [
                'client-build-fence-bg-adapter:orchestration-control:1.9',
                'lazy-chat-bg-adapter:owned:server-committed-chat-adoption-test:1.10',
                'lazy-chat-bg-adapter:owned:bg-server-pending-projection-test:1.10',
                'lazy-chat-bg-adapter:owned:bg-server-input-client-test:1.10',
                'lazy-chat-bg-adapter:owned:bg-server-input-adoption-test:1.10',
                'lazy-chat-bg-adapter:owned:bg-browser-message-effects-test:1.10',
                'lazy-chat-bg-adapter:owned:bg-server-input-provider-policy-test:1.10',
            ],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:legacy-browser-stat-effect:1.10',
            file: 'src/ts/bgOrchestrate.ts',
            type: 'replace',
            anchor: `        if (statics && staticsIncrement > 0) {
            statics.messages = (statics.messages || 0) + staticsIncrement
        }
`,
            content: `        if (statics && staticsIncrement > 0) {
            if (operationId && typeof data.resultId === 'string'
                && /^[A-Za-z0-9_-]{8,128}$/.test(data.resultId)) {
                recordBrowserMessageEffect(
                    statics, data.resultId, Date.now(), staticsIncrement,
                )
            } else {
                // Pre-operation-ID legacy delivery cannot provide an exact
                // idempotency key; retain its old client-owned behavior.
                statics.messages = (statics.messages || 0) + staticsIncrement
            }
        }
`,
            requires: ['lazy-chat-bg-adapter:server-commit-client-import:1.10'],
            after: [
                'lazy-chat-bg-adapter:server-commit-client-hydration:1.10',
                'lazy-chat-bg-adapter:server-commit-client-missing-result:1.10',
                'lazy-chat-bg-adapter:server-commit-client-ownership-fence:1.10',
                'lazy-chat-bg-adapter:server-commit-client-found-result:1.10',
                'lazy-chat-bg-adapter:server-commit-boot-missing-result:1.10',
                'lazy-chat-bg-adapter:server-commit-boot-ownership-fence:1.10',
                'lazy-chat-bg-adapter:server-commit-boot-found-result:1.10',
                'lazy-chat-bg-adapter:server-chat-commit-client-negotiate:1.10',
                'lazy-chat-bg-adapter:server-chat-commit-client-request:1.10',
            ],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-commit-client-hydration:1.10',
            file: 'src/ts/bgOrchestrate.ts',
            type: 'insert',
            where: 'before',
            anchor: 'async function pollOrchestrationResult(): Promise<void> {\n',
            content: `async function readServerChatExecutionProjection(
    charId: string,
    chatId: string,
    revision: string,
    allowMissing = false,
): Promise<unknown> {
    let requestedRevision = revision
    for (let attempt = 0; attempt < 2; attempt += 1) {
        const query = new URLSearchParams({ revision: requestedRevision })
        const url = '/api/bg-orchestrate-chat-state/'
            + encodeURIComponent(charId) + '/' + encodeURIComponent(chatId)
            + '?' + query.toString()
        const response = await fetchOrchestrationControl(url, {
            method: 'GET',
            credentials: 'same-origin',
        })
        const projection = await response.json()
        if (response.ok && projection?.found === true) return projection
        if (allowMissing && response.status === 404) return null
        if (attempt === 0 && response.status === 409
            && projection?.state === 'revision_mismatch'
            && typeof projection.currentRevision === 'string'
            && projection.currentRevision.length > 0
            && projection.currentRevision.length <= 256
            && projection.currentRevision !== requestedRevision) {
            requestedRevision = projection.currentRevision
            continue
        }
        throw new Error(response.ok
            ? 'chat execution projection missing'
            : 'chat execution projection unavailable')
    }
    throw new Error('chat execution projection unavailable')
}

export async function readServerPendingInputCommands(
    charId: string,
    chatId: string,
    chat: unknown,
): Promise<ServerPendingInput[]> {
    if (!chat || typeof chat !== 'object' || !Array.isArray((chat as { message?: unknown }).message)) {
        return []
    }
    const revision = orchestrationChatRevision(chat)
    const projection = await readServerChatExecutionProjection(
        charId, chatId, revision, true,
    )
    return parseServerPendingInputs(projection)
}

export function hasServerOwnedInputMarker(charId: string, chatId: string): boolean {
    if (typeof localStorage === 'undefined') return false
    return readServerInputMarkers(localStorage).some(marker => (
        marker.charId === charId && marker.chatId === chatId
    ))
}

export async function reconcileServerPendingInputCommands(
    charId: string,
    chatId: string,
    chat: unknown,
): Promise<ServerPendingInput[]> {
    const pending = await readServerPendingInputCommands(charId, chatId, chat)
    if (typeof localStorage === 'undefined') return pending
    const characters: any[] = (DBState as any)?.db?.characters
    const character = Array.isArray(characters)
        ? characters.find(candidate => candidate?.chaId === charId) : null
    if (!character || !Array.isArray(character.chats)) return pending
    const currentChat = () => character.chats.find((candidate: any) => candidate?.id === chatId)
    await adoptAttachedServerInputs({
        storage: localStorage,
        charId, chatId, pendingInputs: pending,
        readLocalRevision: () => {
            const value = currentChat()
            if (!value || value._placeholder) return null
            try { return orchestrationChatRevision(value) } catch { return null }
        },
        isCurrent: () => Array.isArray(character.chats) && !!currentChat(),
        adopt: (revision, allowed) => adoptServerCommittedChat(
            character.chats, charId, chatId, revision, [allowed], orchestrationChatRevision,
        ),
    })
    for (const marker of readServerInputMarkers(localStorage).filter(row => (
        row.charId === charId && row.chatId === chatId && row.state === 'accepted'
    ))) {
        if (!pending.some(input => input.operationId === marker.operationId)) {
            try {
                const query = new URLSearchParams({ charId, chatId })
                const statusResponse = await fetchOrchestrationControl(
                    '/api/bg-orchestrate-status/' + encodeURIComponent(marker.operationId)
                    + '?' + query.toString(),
                    { method: 'GET', credentials: 'same-origin' },
                )
                const statusData = await statusResponse.json()
                if (statusResponse.ok && statusData?.accepted === true
                    && statusData.operationId === marker.operationId
                    && statusData.state === 'input-retried'
                    && typeof statusData.replacementOperationId === 'string'
                    && /^[A-Za-z0-9_-]{8,128}$/.test(statusData.replacementOperationId)) {
                    clearServerInputMarker(localStorage, marker.operationId)
                    continue
                }
            } catch { /* Keep the marker until exact status can be read. */ }
        }
        let response: Response
        try {
            response = await fetchOrchestrationControl(
                orchestrationResultUrl(charId, chatId, marker.operationId, 1),
                { method: 'GET', credentials: 'same-origin' },
            )
        } catch { continue }
        if (!response.ok) continue
        let data: any
        try { data = await response.json() } catch { continue }
        if (data.operationId !== marker.operationId || !serverChatCommitReceipt(data)) continue
        const previouslyAcknowledged = data.found === false
            && data.operationState === 'chat-committed'
        if (data.found !== true && !previouslyAcknowledged) continue
        const hydration = await hydrateServerCommittedResult(
            charId, chatId, marker.operationId, data,
        )
        if (!hydration.hydrated || !Array.isArray(character.chats) || !currentChat()) continue
        const adoptedRevision = (hydration.projection as { chatRevision: string }).chatRevision
        advanceServerInputMarkerRevisions(
            localStorage, charId, chatId, marker.localRevision, adoptedRevision,
        )
        if (previouslyAcknowledged) {
            clearServerInputMarker(localStorage, marker.operationId)
            continue
        }
        const resultId = typeof data.resultId === 'string' ? data.resultId : ''
        if (!resultId) continue
        try {
            const acknowledgement = await acknowledgeResultRevision(
                charId, chatId, marker.operationId, 1, resultId,
            )
            if (isConfirmedOrchestrationAcknowledgement(acknowledgement)) {
                clearServerInputMarker(localStorage, marker.operationId)
            }
        } catch { /* Retain marker and server result for exact retry. */ }
    }
    return pending
}

export async function tryRunServerOwnedInput(
    selectedIndex: number,
    rawText: string,
    draftId: string,
    replaceBlockedOperationId?: string,
): Promise<ServerInputClientOutcome> {
    if (typeof document === 'undefined' || !isServerOrchestrationEnabled()) {
        return { kind: 'unsupported' }
    }
    const character: any = (DBState as any)?.db?.characters?.[selectedIndex]
    const selectedChat: any = character?.chats?.[character.chatPage]
    if (requiresClientOwnedInputPreparation((DBState as any)?.db, selectedChat)) {
        return { kind: 'unsupported' }
    }
    const charId = character?.chaId
    const chatId = selectedChat?.id
    if (typeof charId !== 'string' || typeof chatId !== 'string') {
        return { kind: 'blocked', reason: 'chat-unavailable' }
    }
    const currentCharacter = () => {
        const chars: any[] = (DBState as any)?.db?.characters
        return Array.isArray(chars)
            ? chars.find(candidate => candidate?.chaId === charId)
            : null
    }
    const currentChat = () => {
        const char = currentCharacter()
        return Array.isArray(char?.chats)
            ? char.chats.find((candidate: any) => candidate?.id === chatId)
            : null
    }
    const isCurrent = () => {
        const char = (DBState as any)?.db?.characters?.[get(selectedCharID)]
        return char?.chaId === charId && char?.chats?.[char.chatPage]?.id === chatId
    }
    try {
        return await submitServerInputCommand({
            storage: localStorage,
            readCapability: async () => {
                const response = await fetchOrchestrationControl(
                    '/api/bg-orchestrate-capabilities',
                    { method: 'GET', credentials: 'same-origin' },
                )
                if (response.status === 404) return null
                if (!response.ok) throw new Error('server input capability unavailable')
                return await response.json()
            },
            flushSettings: async () => {
                const char = currentCharacter()
                const index = Array.isArray(char?.chats)
                    ? char.chats.findIndex((candidate: any) => candidate?.id === chatId)
                    : -1
                if (index < 0 || !await ensureChatHydrated(char.chats, index, charId)) {
                    throw new Error('active chat hydration unavailable')
                }
                await requestDurableSave({ root: true })
            },
            readLocalRevision: () => {
                const chat = currentChat()
                if (!chat || chat._placeholder) throw new Error('local chat unavailable')
                return orchestrationChatRevision(chat)
            },
            peekServerChat: async () => {
                const char = currentCharacter()
                const index = Array.isArray(char?.chats)
                    ? char.chats.findIndex((candidate: any) => candidate?.id === chatId)
                    : -1
                if (index < 0) return null
                const snapshot = await peekServerChatSnapshot(charId, index, chatId)
                return snapshot?.chat?.id === chatId ? { revision: snapshot.revision } : null
            },
            readPendingInputs: async revision => parseServerPendingInputs(
                await readServerChatExecutionProjection(charId, chatId, revision, true),
            ),
            start: async (body, signal) => {
                const response = await clientBuildFetch('/api/bg-orchestrate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify(body),
                    signal,
                })
                let parsed: unknown = null
                try { parsed = await response.json() } catch { /* ambiguous response */ }
                return { status: response.status, body: parsed }
            },
            status: async (operationId, signal) => {
                const query = new URLSearchParams({ charId, chatId })
                const response = await clientBuildFetch(
                    '/api/bg-orchestrate-status/' + encodeURIComponent(operationId)
                    + '?' + query.toString(),
                    { method: 'GET', credentials: 'same-origin', signal },
                )
                let parsed: unknown = null
                try { parsed = await response.json() } catch { /* ambiguous status */ }
                return { status: response.status, body: parsed }
            },
            newId: v4,
            isCurrent,
        }, { charId, chatId, rawText, draftId, replaceBlockedOperationId })
    } catch (error) {
        console.error('[bg-orch] server input admission unavailable', error)
        return { kind: 'blocked', reason: 'admission-unavailable' }
    }
}

async function hydrateServerCommittedResult(
    charId: string,
    chatId: string,
    operationId: string,
    data: any,
) {
    const target = mergeTargetByOperation.get(operationId)
    const allowedCurrentRevisions = target
        ? [target.expectedChatRevision, ...(target.acceptedChatRevisions || [])]
        : []
    if (typeof localStorage !== 'undefined') {
        const inputMarker = readServerInputMarkers(localStorage).find(marker => (
            marker.operationId === operationId && marker.charId === charId
                && marker.chatId === chatId && marker.state === 'accepted'
        ))
        if (inputMarker) allowedCurrentRevisions.push(inputMarker.localRevision)
    }
    return hydrateServerCommittedOrchestration({
        data,
        operationId,
        charId,
        chatId,
        allowedCurrentRevisions,
        readProjection: readServerChatExecutionProjection,
        adoptChat: async ({
            charId: storedCharId,
            chatId: storedChatId,
            expectedServerRevision,
            allowedCurrentRevisions,
        }) => {
            const characters: any[] = (DBState as any)?.db?.characters
            const character = Array.isArray(characters)
                ? characters.find((candidate: any) => candidate?.chaId === storedCharId)
                : null
            if (!character || !Array.isArray(character.chats)) {
                return { adopted: false, reason: 'character-missing' }
            }
            return adoptServerCommittedChat(
                character.chats,
                storedCharId,
                storedChatId,
                expectedServerRevision,
                allowedCurrentRevisions,
                orchestrationChatRevision,
            )
        },
    })
}

function rememberServerCommittedTarget(operationId: string, hydration: any): void {
    const receipt = hydration && hydration.receipt
    if (!receipt || !hydration.chat) return
    try {
        const expectedChatRevision = orchestrationChatRevision(hydration.chat)
        const current = mergeTargetByOperation.get(operationId)
        mergeTargetByOperation.set(operationId, {
            deliveryChatId: receipt.storedChatId,
            expectedChatRevision,
            acceptedChatRevisions: [],
            conflict: current?.conflict || false,
        })
        updatePendingMarker(localStorage, operationId, (marker) => ({
            ...marker,
            deliveryChatId: receipt.storedChatId,
            expectedChatRevision,
        }))
    } catch { /* canonical chat and in-memory watch remain authoritative */ }
}

function serverOwnedChatStillActive(data: any): boolean {
    return [
        'queued',
        'running',
        'running-result-ready',
        'running-result-consumed',
        'input-queued',
        'input-attached',
        'input-waiting-predecessor',
    ].includes(data?.operationState)
}

function retainUncommittedServerChat(
    operationId: string | null,
    data: any,
    mode: 'watch' | 'boot',
): void {
    console.error('[bg-orch] server-owned chat commit is unresolved; retaining result', {
        operationId,
        state: data?.serverChatCommit?.status || data?.operationState || 'uncommitted',
        reason: data?.serverChatCommit?.reason || 'commit-receipt-invalid',
    })
    if (mode === 'boot') deferBootRecovery(operationId)
    else stopWatch({ preservePendingMarker: true })
    try {
        alertError('서버 소유 답변의 채팅 저장을 확인하지 못했어요. 결과와 작업 표식을 보존하고 다음 실행에서 다시 확인해요.')
    } catch { /* best-effort */ }
}

`,
            requires: ['lazy-chat-bg-adapter:server-commit-client-import:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-commit-client-missing-result:1.10',
            file: 'src/ts/bgOrchestrate.ts',
            type: 'replace',
            anchor: `        if (!data || !data.found) {
            if (data?.operationState === 'start-retry-required') {
`,
            content: `        if (!data || !data.found) {
            if (data?.operationState === 'chat-committed'
                && operationId && serverChatCommitReceipt(data)) {
                const hydration = await hydrateServerCommittedResult(
                    charId, chatId, operationId, data,
                )
                if (pollEpoch !== watchEpoch) return
                if (!hydration.hydrated) {
                    console.warn('[bg-orch] committed chat hydrate deferred:', hydration.reason)
                    return
                }
                rememberServerCommittedTarget(operationId, hydration)
                runServerCompletionEpilogue(operationId, { ...data, chat: hydration.chat })
                stopWatch()
                return
            }
            const serverChatDisposition = serverChatDeliveryDisposition(data)
            if (serverChatDisposition === 'server-owned-uncommitted'
                && !serverOwnedChatStillActive(data)) {
                retainUncommittedServerChat(operationId, data, 'watch')
                return
            }
            if (data?.operationState === 'start-retry-required') {
`,
            requires: ['lazy-chat-bg-adapter:server-commit-client-hydration:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-commit-client-ownership-fence:1.10',
            file: 'src/ts/bgOrchestrate.ts',
            type: 'replace',
            anchor: `        if (operationId && data.operationId !== operationId) return
        const orderDecision = classifyOrchestrationResultOrder(data, appliedResultOrderByOperation)
`,
            content: `        if (operationId && data.operationId !== operationId) return
        const serverOwnedDisposition = serverChatDeliveryDisposition(data)
        if (serverOwnedDisposition === 'server-owned-uncommitted') {
            retainUncommittedServerChat(operationId, data, 'watch')
            return
        }
        const orderDecision = classifyOrchestrationResultOrder(data, appliedResultOrderByOperation)
`,
            requires: ['lazy-chat-bg-adapter:server-commit-client-missing-result:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-commit-client-found-result:1.10',
            file: 'src/ts/bgOrchestrate.ts',
            type: 'replace',
            anchor: `        try {
            const newMsgs = data.chat && Array.isArray(data.chat.message) ? data.chat.message.length : -1
`,
            content: `        try {
            const serverChatDisposition = serverChatDeliveryDisposition(data)
            const committedReceipt = serverChatCommitReceipt(data)
            if (serverChatDisposition === 'server-committed'
                && committedReceipt && operationId) {
                const hydration = await hydrateServerCommittedResult(
                    charId, chatId, operationId, data,
                )
                if (pollEpoch !== watchEpoch) return
                if (!hydration.hydrated) {
                    console.warn('[bg-orch] committed result hydrate deferred:', hydration.reason)
                    return
                }
                const acknowledgement = resultId
                    ? await acknowledgeResultRevision(
                        charId, chatId, operationId, resultKeyVersion, resultId,
                    )
                    : 'unconfirmed'
                if (pollEpoch !== watchEpoch || acknowledgement === 'superseded') return
                commitOrchestrationResultOrder(data, appliedResultOrderByOperation)
                rememberServerCommittedTarget(operationId, hydration)
                runServerCompletionEpilogue(operationId, { ...data, chat: hydration.chat })
                if (isConfirmedOrchestrationAcknowledgement(acknowledgement)) stopWatch()
                else stopWatch({ preservePendingMarker: true })
                return
            }
            if (serverChatDisposition !== 'legacy-client-owned') {
                retainUncommittedServerChat(operationId, data, 'watch')
                return
            }
            const newMsgs = data.chat && Array.isArray(data.chat.message) ? data.chat.message.length : -1
`,
            requires: ['lazy-chat-bg-adapter:server-commit-client-ownership-fence:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-commit-boot-missing-result:1.10',
            file: 'src/ts/bgOrchestrate.ts',
            type: 'replace',
            anchor: `            if (!data || !data.found) {
                const stage = data && typeof data.stage === 'number' ? data.stage : 0
`,
            content: `            if (!data || !data.found) {
                if (data?.operationState === 'chat-committed'
                    && operationId && serverChatCommitReceipt(data)) {
                    const hydration = await hydrateServerCommittedResult(
                        charId, chatId, operationId, data,
                    )
                    if (epoch !== bootRecoveryEpoch) return
                    if (!hydration.hydrated) {
                        setTimeout(() => bootRecoverPoll(
                            charId, chatId, baselineMsgs, operationId,
                            resultKeyVersion, deadline, emptyCount, epoch,
                        ), ORCH_POLL_MS)
                        return
                    }
                    rememberServerCommittedTarget(operationId, hydration)
                    runServerCompletionEpilogue(operationId, { ...data, chat: hydration.chat })
                    finishBootRecovery(operationId)
                    return
                }
                const serverChatDisposition = serverChatDeliveryDisposition(data)
                if (serverChatDisposition === 'server-owned-uncommitted'
                    && !serverOwnedChatStillActive(data)) {
                    retainUncommittedServerChat(operationId, data, 'boot')
                    return
                }
                const stage = data && typeof data.stage === 'number' ? data.stage : 0
`,
            requires: ['lazy-chat-bg-adapter:server-commit-client-found-result:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-commit-boot-ownership-fence:1.10',
            file: 'src/ts/bgOrchestrate.ts',
            type: 'replace',
            anchor: `            setServerGenerationBusy(true)
            chatProcessStage.set(4)
            const orderDecision = classifyOrchestrationResultOrder(data, appliedResultOrderByOperation)
`,
            content: `            setServerGenerationBusy(true)
            chatProcessStage.set(4)
            const serverOwnedDisposition = serverChatDeliveryDisposition(data)
            if (serverOwnedDisposition === 'server-owned-uncommitted') {
                retainUncommittedServerChat(operationId, data, 'boot')
                return
            }
            const orderDecision = classifyOrchestrationResultOrder(data, appliedResultOrderByOperation)
`,
            requires: ['lazy-chat-bg-adapter:server-commit-boot-missing-result:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-commit-boot-found-result:1.10',
            file: 'src/ts/bgOrchestrate.ts',
            type: 'replace',
            anchor: `            const newMsgs = data.chat && Array.isArray(data.chat.message) ? data.chat.message.length : -1
            if (data.chat && newMsgs > baselineMsgs) {
`,
            content: `            const serverChatDisposition = serverChatDeliveryDisposition(data)
            const committedReceipt = serverChatCommitReceipt(data)
            if (serverChatDisposition === 'server-committed'
                && committedReceipt && operationId) {
                const hydration = await hydrateServerCommittedResult(
                    charId, chatId, operationId, data,
                )
                if (epoch !== bootRecoveryEpoch) return
                if (!hydration.hydrated) {
                    setTimeout(() => bootRecoverPoll(
                        charId, chatId, baselineMsgs, operationId,
                        resultKeyVersion, deadline, 0, epoch,
                    ), ORCH_POLL_MS)
                    return
                }
                const resultId = typeof data.resultId === 'string' ? data.resultId : null
                const acknowledgement = resultId
                    ? await acknowledgeResultRevision(
                        charId, chatId, operationId, resultKeyVersion, resultId,
                    )
                    : 'unconfirmed'
                if (epoch !== bootRecoveryEpoch) return
                if (acknowledgement === 'superseded') {
                    setTimeout(() => bootRecoverPoll(
                        charId, chatId, baselineMsgs, operationId,
                        resultKeyVersion, deadline, 0, epoch,
                    ), ORCH_POLL_MS)
                    return
                }
                commitOrchestrationResultOrder(data, appliedResultOrderByOperation)
                rememberServerCommittedTarget(operationId, hydration)
                runServerCompletionEpilogue(operationId, { ...data, chat: hydration.chat })
                if (isConfirmedOrchestrationAcknowledgement(acknowledgement)) {
                    finishBootRecovery(operationId)
                } else {
                    deferBootRecovery(operationId)
                }
                return
            }
            if (serverChatDisposition !== 'legacy-client-owned') {
                retainUncommittedServerChat(operationId, data, 'boot')
                return
            }
            const newMsgs = data.chat && Array.isArray(data.chat.message) ? data.chat.message.length : -1
            if (data.chat && newMsgs > baselineMsgs) {
`,
            requires: ['lazy-chat-bg-adapter:server-commit-boot-ownership-fence:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-chat-commit-client-negotiate:1.10',
            file: 'src/ts/bgOrchestrate.ts',
            type: 'insert',
            where: 'before',
            anchor: `        const baselineMsgs = Array.isArray(delegatedChat.message) ? delegatedChat.message.length : 0
`,
            content: `        let serverChatCommitVersion: 0 | 1 = 0
        try {
            const capabilityResponse = await fetchOrchestrationControl(
                '/api/bg-orchestrate-capabilities',
                { method: 'GET', credentials: 'same-origin' },
            )
            if (capabilityResponse.ok) {
                const capability = await capabilityResponse.json()
                if (capability?.contract === 'bg_orchestration_capabilities.v1'
                    && capability.serverChatCommitVersion === 1
                    && capability.chatExecutionProjectionVersion === 1) {
                    serverChatCommitVersion = 1
                }
            }
        } catch { /* rolling server or unavailable capability keeps legacy ownership */ }
        if (arg?.signal?.aborted) {
            releasePreparationOwner()
            chatProcessStage.set(0)
            return { handled: true, result: false }
        }
`,
            requires: ['lazy-chat-bg-adapter:server-commit-boot-found-result:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-chat-commit-client-request:1.10',
            file: 'src/ts/bgOrchestrate.ts',
            type: 'replace',
            anchor: `            resultOrderVersion: 1,
            startAckVersion: 1,
            resultKeyVersion: 1,
`,
            content: `            resultOrderVersion: 1,
            startAckVersion: 1,
            resultKeyVersion: 1,
            ...(serverChatCommitVersion === 1 ? { serverChatCommitVersion: 1 } : {}),
`,
            requires: ['lazy-chat-bg-adapter:server-chat-commit-client-negotiate:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-chat-commit-client-replay-ambiguity:1.10',
            file: 'src/ts/bgOrchestrate.ts',
            type: 'insert',
            where: 'before',
            anchor: "                if (data?.started === false || (res.ok && data?.handled === false)) return 'rejected'\n",
            content: `                if (data?.reason === 'server-chat-commit-already-completed'
                    || data?.reason === 'server-chat-commit-identity-unavailable') {
                    throw new Error('server chat commit identity requires exact status reconciliation')
                }
`,
            requires: ['lazy-chat-bg-adapter:server-chat-commit-client-request:1.10'],
            after: ['lazy-chat-bg-adapter:legacy-browser-stat-effect:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-pending-ui-import:1.10',
            file: 'src/lib/ChatScreens/DefaultChatScreen.svelte',
            type: 'insert',
            where: 'after',
            anchor: '    import { sleep } from "../../ts/util";\n',
            content: `    import ServerPendingInputs from './ServerPendingInputs.svelte';
    import type { ServerPendingInput } from '../../ts/bgServerPendingProjection';
    import { hasServerOwnedInputMarker, tryRunServerOwnedInput } from '../../ts/bgOrchestrate';
    import { requiresClientGenerationEpilogue } from '../../ts/bgOrchestrationPolicy';
    import { requiresClientOwnedInputPreparation } from '../../ts/bgServerInputProviderPolicy';
`,
            requires: [
                'lazy-chat-bg-adapter:owned:server-pending-inputs-ui:1.10',
                'lazy-chat-bg-adapter:owned:bg-server-input-provider-policy:1.10',
            ],
            after: [
                'bg-preserve:hook:defaultchatscreen-import-orchestrating',
                'bg-preserve:hook:defaultchatscreen-sendmain-orchestrating-gate',
                'bg-preserve:hook:defaultchatscreen-reroll-orchestrating-gate',
                'bg-preserve:hook:defaultchatscreen-unreroll-orchestrating-gate',
                'bg-preserve:hook:defaultchatscreen-suppress-abort-alert',
                'bg-preserve:hook:defaultchatscreen-terminal-completion-sound',
                'bg-preserve:hook:defaultchatscreen-cancel-server-orchestration',
                'bg-preserve:hook:defaultchatscreen-blank-message-a11y-button',
                'bg-preserve:hook:defaultchatscreen-sticker-a11y-button',
                'bg-preserve:hook:defaultchatscreen-composer-orchestrating-gate:1.9',
                'bg-preserve:hook:defaultchatscreen-reroll-blocking-call',
                'bg-preserve:hook:defaultchatscreen-sendchatmain-nobgorch-arg',
                'bg-preserve:hook:defaultchatscreen-forward-nobgorch',
                'client-build-fence:composer-import:1.9',
                'client-build-fence:composer-dirty-state:1.9',
                'haejeok-chat-width-adapter:default-chat-import:1.10',
                'haejeok-chat-width-adapter:composer-class:1.10',
                'haejeok-chat-width-adapter:default-chat-root-class:1.10',
                'haejeok-persistence-safety-adapter:chat-helper-import',
                'haejeok-persistence-safety-adapter:chat-durable-save-import',
                'haejeok-persistence-safety-adapter:chat-append-state',
                'haejeok-persistence-safety-adapter:chat-say-nothing-append',
                'haejeok-persistence-safety-adapter:chat-character-append',
                'haejeok-persistence-safety-adapter:chat-group-append',
                'haejeok-persistence-safety-adapter:chat-save-before-generation',
                'kei-chat-render-bg-adapter:default-chat-generation-state:1.9',
                'kei-partial-edit-bg-adapter:default-chat-import:1.9',
                'kei-partial-edit-bg-adapter:default-chat-root-state:1.9',
                'kei-partial-edit-bg-adapter:default-chat-root-binding:1.9',
                'kei-partial-edit-bg-adapter:default-chat-manager:1.9',
                'lazy-chat-sync:chat-missing-payload-notice',
                'personal-settings:appearance-composer-hook-1.9',
                'personal-settings:appearance-chat-render-imports-1.9',
                'personal-settings:appearance-send-icon-render-1.9',
            ],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-pending-ui-selection:1.10',
            file: 'src/lib/ChatScreens/DefaultChatScreen.svelte',
            type: 'insert',
            where: 'after',
            anchor: "    let messageInput:string = $state('')\n",
            content: `    let pendingCharacter = $derived(DBState.db.characters[$selectedCharID])
    let pendingChat = $derived(pendingCharacter?.chats?.[pendingCharacter.chatPage])
    let inputAdmissionBusy = $state(false)
    async function retryBlockedServerInput(input: ServerPendingInput): Promise<void> {
        if (inputAdmissionBusy || !input.rawText || !input.inputCommandId) return
        if (requiresClientGenerationEpilogue(DBState.db, pendingCharacter)
            || requiresClientOwnedInputPreparation(DBState.db, pendingChat)) {
            notifyError('현재 설정에서는 서버 입력을 다시 시작할 수 없어요', {
                description: '원래 입력은 서버에 남아 있어요.', source: 'bg-input',
            })
            return
        }
        inputAdmissionBusy = true
        try {
            const outcome = await tryRunServerOwnedInput(
                $selectedCharID, input.rawText, input.inputCommandId, input.operationId,
            )
            if (outcome.kind === 'accepted' && outcome.clearDraft) {
                notifySuccess('변경된 채팅에서 입력을 다시 접수했어요.')
            } else if (outcome.kind === 'accepted') {
                notifyError('입력은 접수됐지만 실행이 멈췄어요', {
                    description: '서버 입력 상태를 확인해 주세요.', source: 'bg-input',
                })
            } else if (outcome.kind === 'unknown') {
                notifyError('재접수 여부를 확인할 수 없어요', {
                    description: '다시 누르기 전에 서버 입력 상태를 확인해 주세요.', source: 'bg-input',
                })
            } else {
                notifyError('입력을 다시 시작하지 않았어요', {
                    description: '원래 입력은 서버에 남아 있어요. 채팅 상태를 확인해 주세요.',
                    source: 'bg-input',
                })
            }
            window.dispatchEvent(new Event('bg-server-input-updated'))
        } finally {
            inputAdmissionBusy = false
        }
    }
`,
            requires: ['lazy-chat-bg-adapter:server-pending-ui-import:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-pending-ui-render:1.10',
            file: 'src/lib/ChatScreens/DefaultChatScreen.svelte',
            type: 'insert',
            where: 'after',
            anchor: '              <div class="mx-auto w-full {composerWidthClass} px-2">\n',
            managed: `                <!-- POCKETRISU-PATCH:lazy-chat-bg-adapter:server-pending-ui:START -->
                {#if pendingCharacter?.chaId && pendingChat?.id}
                    <ServerPendingInputs
                        charId={pendingCharacter.chaId}
                        chatId={pendingChat.id}
                        chat={pendingChat}
                        onRetryBlocked={retryBlockedServerInput}
                    />
                {/if}
                <!-- POCKETRISU-PATCH:lazy-chat-bg-adapter:server-pending-ui:END -->
`,
            markerNeedle: 'POCKETRISU-PATCH:lazy-chat-bg-adapter:server-pending-ui:START',
            requires: ['lazy-chat-bg-adapter:server-pending-ui-selection:1.10'],
            after: ['personal-settings:appearance-composer-hook-1.9'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-input-client-send:1.10',
            file: 'src/lib/ChatScreens/DefaultChatScreen.svelte',
            type: 'insert',
            where: 'before',
            anchor: '        if($doingChat/* BG-PRESERVE:START orch-sendmain */ || $orchestrating/* BG-PRESERVE:END */){\n',
            managed: `        /* POCKETRISU-PATCH:lazy-chat-bg-adapter:server-input-client-send:START */
        if (inputAdmissionBusy) return
        if (!continueResponse && !$doingChat && !$orchestrating
            && !messageInput.startsWith('/')
            && (messageInput !== '' || fileInput.length > 0)
            && !requiresClientGenerationEpilogue(DBState.db, DBState.db.characters[selectedChar])
            && !requiresClientOwnedInputPreparation(DBState.db,
                DBState.db.characters[selectedChar]?.chats?.[DBState.db.characters[selectedChar]?.chatPage])) {
            const draftText = messageInput
            const draftTranslation = messageInputTranslate
            const draftFiles = [...fileInput]
            const rawText = draftText + draftFiles.map(file => '{{inlayed::' + file + '}}').join('')
            inputAdmissionBusy = true
            try {
                const outcome = await tryRunServerOwnedInput(selectedChar, rawText, draftInputId)
                if (outcome.kind !== 'unsupported') {
                    window.dispatchEvent(new Event('bg-server-input-updated'))
                    if (outcome.kind === 'accepted' && outcome.clearDraft) {
                        const draftUnchanged = messageInput === draftText
                            && messageInputTranslate === draftTranslation
                            && fileInput.length === draftFiles.length
                            && fileInput.every((file, index) => file === draftFiles[index])
                        if (draftUnchanged) {
                            messageInput = ''
                            messageInputTranslate = ''
                            fileInput = []
                            removeChatDraft(draftChaId, draftChatId)
                            updateInputSizeAll()
                        } else {
                            notifySuccess('이전 입력은 서버에 접수됐고 새 초안은 남겼어요.')
                        }
                    } else if (outcome.kind === 'unknown') {
                        notifyError('서버 접수 여부를 확인할 수 없어요', {
                            description: '같은 입력을 다시 보내지 말고 채팅 상태를 확인해 주세요. 초안은 남겼어요.',
                            source: 'bg-input',
                        })
                    } else if (outcome.kind === 'blocked'
                        && outcome.reason === 'draft-already-submitted') {
                        notifyError('같은 초안이 이미 다른 화면에서 접수됐어요', {
                            description: '진행 상태를 확인해 주세요. 초안은 지우지 않았어요.',
                            source: 'bg-input',
                        })
                    } else {
                        notifyError('서버 입력을 시작하지 않았어요', {
                            description: '채팅이나 설정 상태를 확인한 뒤 다시 보내 주세요. 초안은 남겼어요.',
                            source: 'bg-input',
                        })
                    }
                    return
                }
            } catch (error) {
                console.error('[bg-orch] input admission failed', error)
                notifyError('서버 입력을 확인할 수 없어요', {
                    description: '초안은 남겼어요. 채팅 상태를 확인한 뒤 다시 보내 주세요.',
                    source: 'bg-input',
                })
                return
            } finally {
                inputAdmissionBusy = false
            }
        }
        if (pendingCharacter?.chaId && pendingChat?.id
            && hasServerOwnedInputMarker(pendingCharacter.chaId, pendingChat.id)) {
            notifyError('서버 입력 상태를 확인 중이에요', {
                description: '진행 중인 서버 입력을 확인한 뒤 다시 시도해 주세요.',
                source: 'bg-input',
            })
            return
        }
        /* POCKETRISU-PATCH:lazy-chat-bg-adapter:server-input-client-send:END */
`,
            markerNeedle: 'POCKETRISU-PATCH:lazy-chat-bg-adapter:server-input-client-send:START',
            requires: [
                'lazy-chat-bg-adapter:server-pending-ui-render:1.10',
                'lazy-chat-bg-adapter:server-commit-client-hydration:1.10',
            ],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-input-client-busy-ui:1.10',
            file: 'src/lib/ChatScreens/DefaultChatScreen.svelte',
            type: 'replace',
            anchor: '                {#if currentChatGenerating || doingChatInputTranslate/* BG-PRESERVE:START orch-composer */ || $orchestrating/* BG-PRESERVE:END */}\n',
            managed: `                <!-- POCKETRISU-PATCH:lazy-chat-bg-adapter:server-input-client-busy-ui:START -->
                {#if inputAdmissionBusy}
                    <button type="button" disabled aria-label="서버 입력 접수 확인 중"
                            class="order-2 shrink-0 flex justify-center items-center w-9 h-9 rounded-full text-textcolor">
                        <div class="loadmove"></div>
                    </button>
                {:else if currentChatGenerating || doingChatInputTranslate/* BG-PRESERVE:START orch-composer */ || $orchestrating/* BG-PRESERVE:END */}
                <!-- POCKETRISU-PATCH:lazy-chat-bg-adapter:server-input-client-busy-ui:END -->
`,
            markerNeedle: 'POCKETRISU-PATCH:lazy-chat-bg-adapter:server-input-client-busy-ui:START',
            requires: ['lazy-chat-bg-adapter:server-input-client-send:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:composer-draft-identity-state:1.10',
            file: 'src/lib/ChatScreens/DefaultChatScreen.svelte',
            type: 'insert',
            where: 'after',
            anchor: '    let draftLoading = $state(false)\n',
            content: `    let draftInputId = $state(v4())
    let draftIdentityContent = JSON.stringify(['', '', []])

    // Programmatic composer changes also create a new unsent draft identity.
    $effect(() => {
        const content = JSON.stringify([messageInput, messageInputTranslate, fileInput])
        if (draftLoading || content === draftIdentityContent) return
        draftIdentityContent = content
        draftInputId = v4()
    })
`,
            requires: [
                'lazy-chat-bg-adapter:server-input-client-busy-ui:1.10',
                'lazy-chat-bg-adapter:owned:bg-draft-identity:1.10',
            ],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:composer-draft-identity-reset:1.10',
            file: 'src/lib/ChatScreens/DefaultChatScreen.svelte',
            type: 'replace',
            anchor: "        untrack(() => { messageInput = ''; messageInputTranslate = ''; draftLoading = true })\n",
            content: "        untrack(() => { messageInput = ''; messageInputTranslate = ''; draftInputId = v4(); draftLoading = true })\n",
            requires: ['lazy-chat-bg-adapter:composer-draft-identity-state:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:composer-draft-identity-load:1.10',
            file: 'src/lib/ChatScreens/DefaultChatScreen.svelte',
            type: 'replace',
            anchor: `                if (draft && messageInput === '' && messageInputTranslate === '') {
                    messageInput = draft.m
                    messageInputTranslate = draft.t
                }
                draftLoading = false
`,
            content: `                if (draft && messageInput === '' && messageInputTranslate === '') {
                    messageInput = draft.m
                    messageInputTranslate = draft.t
                    draftInputId = draft.id ?? ''
                }
                draftIdentityContent = JSON.stringify([messageInput, messageInputTranslate, fileInput])
                draftLoading = false
`,
            requires: ['lazy-chat-bg-adapter:composer-draft-identity-reset:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:composer-draft-identity-persist:1.10',
            file: 'src/lib/ChatScreens/DefaultChatScreen.svelte',
            type: 'replace',
            anchor: '        flushChatDraft(draftChaId, draftChatId, { m: messageInput, t: messageInputTranslate })\n',
            content: '        flushChatDraft(draftChaId, draftChatId, { m: messageInput, t: messageInputTranslate, id: draftInputId })\n',
            requires: ['lazy-chat-bg-adapter:composer-draft-identity-load:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:composer-draft-identity-cleanup:1.10',
            file: 'src/lib/ChatScreens/DefaultChatScreen.svelte',
            type: 'replace',
            anchor: `            flushChatDraft(chaId, chatId, {
                m: untrack(() => messageInput),
                t: untrack(() => messageInputTranslate),
            })
`,
            content: `            flushChatDraft(chaId, chatId, {
                m: untrack(() => messageInput),
                t: untrack(() => messageInputTranslate),
                id: untrack(() => draftInputId),
            })
`,
            requires: ['lazy-chat-bg-adapter:composer-draft-identity-persist:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:composer-draft-identity-save:1.10',
            file: 'src/lib/ChatScreens/DefaultChatScreen.svelte',
            type: 'replace',
            anchor: '        scheduleSaveChatDraft(chaId, chatId, { m, t })\n',
            content: '        scheduleSaveChatDraft(chaId, chatId, { m, t, id: draftInputId })\n',
            requires: ['lazy-chat-bg-adapter:composer-draft-identity-cleanup:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:owned:server-chat-input-owner:1.10',
            file: 'server/node/serverChatInputOwner.cjs',
            type: 'owned',
            content: owned1100('server/node/serverChatInputOwner.cjs'),
            requires: [
                'lazy-chat-sync:owned:server:node:serverChatCommit-cjs:1.10',
                'lazy-chat-sync:owned:server:node:chatWriteJournal-cjs',
                'bg-preserve:owned:server/node/bgOrchestrationOperationStore.cjs',
            ],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:owned:server-chat-input-owner-test:1.10',
            file: 'server/node/serverChatInputOwner.test.ts',
            type: 'owned',
            content: owned1100('server/node/serverChatInputOwner.test.ts'),
            requires: ['lazy-chat-bg-adapter:owned:server-chat-input-owner:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:owned:server-chat-input-drain:1.10',
            file: 'server/node/serverChatInputDrain.cjs',
            type: 'owned',
            content: owned1100('server/node/serverChatInputDrain.cjs'),
            requires: ['lazy-chat-bg-adapter:owned:server-chat-input-owner:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:owned:server-chat-input-drain-test:1.10',
            file: 'server/node/serverChatInputDrain.test.ts',
            type: 'owned',
            content: owned1100('server/node/serverChatInputDrain.test.ts'),
            requires: ['lazy-chat-bg-adapter:owned:server-chat-input-drain:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:owned:server-chat-input-transform:1.10',
            file: 'server/node/serverChatInputTransform.cjs',
            type: 'owned',
            content: owned1100('server/node/serverChatInputTransform.cjs'),
            requires: ['lazy-chat-bg-adapter:owned:server-chat-input-owner:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:owned:server-chat-input-transform-test:1.10',
            file: 'server/node/serverChatInputTransform.test.ts',
            type: 'owned',
            content: owned1100('server/node/serverChatInputTransform.test.ts'),
            requires: ['lazy-chat-bg-adapter:owned:server-chat-input-transform:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:owned:server-chat-settings-context:1.10',
            file: 'server/node/serverChatSettingsContext.cjs',
            type: 'owned',
            content: owned1100('server/node/serverChatSettingsContext.cjs'),
            requires: ['lazy-chat-bg-adapter:owned:server-chat-input-owner-test:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:owned:server-chat-settings-context-test:1.10',
            file: 'server/node/serverChatSettingsContext.test.ts',
            type: 'owned',
            content: owned1100('server/node/serverChatSettingsContext.test.ts'),
            requires: ['lazy-chat-bg-adapter:owned:server-chat-settings-context:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:owned:server-chat-execution-projection:1.10',
            file: 'server/node/serverChatExecutionProjection.cjs',
            type: 'owned',
            content: owned1100('server/node/serverChatExecutionProjection.cjs'),
            requires: [
                'lazy-chat-sync:owned:server:node:serverChatCommit-cjs:1.10',
            ],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:owned:server-chat-execution-projection-test:1.10',
            file: 'server/node/serverChatExecutionProjection.test.ts',
            type: 'owned',
            content: owned1100('server/node/serverChatExecutionProjection.test.ts'),
            requires: [
                'lazy-chat-bg-adapter:owned:server-chat-execution-projection:1.10',
            ],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:owned:server-chat-commit-owner:1.10',
            file: 'server/node/serverChatCommitOwner.cjs',
            type: 'owned',
            content: owned1100('server/node/serverChatCommitOwner.cjs'),
            requires: [
                'lazy-chat-sync:owned:server:node:serverChatCommit-cjs:1.10',
                'bg-preserve:owned:server/node/bgOrchestrationOperationStore.cjs',
                'lazy-chat-bg-adapter:owned:server-chat-execution-projection:1.10',
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
                'lazy-chat-bg-adapter:owned:server-chat-execution-projection-test:1.10',
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
            id: 'lazy-chat-bg-adapter:owned:server-chat-process-preload:1.10',
            file: 'server/node/bgServerChatProcessPreload.cjs',
            type: 'owned',
            content: owned1100('server/node/bgServerChatProcessPreload.cjs'),
            requires: [
                'lazy-chat-bg-adapter:owned:server-chat-commit-owner:1.10',
                'lazy-chat-bg-adapter:owned:server-chat-input-owner:1.10',
            ],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:owned:server-chat-process-client:1.10',
            file: 'server/node/bgServerChatProcessClient.cjs',
            type: 'owned',
            content: owned1100('server/node/bgServerChatProcessClient.cjs'),
            requires: [
                'lazy-chat-bg-adapter:owned:server-chat-process-preload:1.10',
                'lazy-chat-sync:replace:server:node:server-cjs:1.10',
            ],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:owned:server-chat-process-adoption-test:1.10',
            file: 'src/ts/storage/bgServerChatProcessAdoption.test.ts',
            type: 'owned',
            content: owned1100('src/ts/storage/bgServerChatProcessAdoption.test.ts'),
            requires: [
                'lazy-chat-bg-adapter:owned:server-chat-process-client:1.10',
                'lazy-chat-bg-adapter:server-committed-chat-adoption:1.10',
            ],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:owned:server-chat-process-boundary-test:1.10',
            file: 'server/node/bgServerChatProcessBoundary.test.ts',
            type: 'owned',
            content: owned1100('server/node/bgServerChatProcessBoundary.test.ts'),
            requires: [
                'lazy-chat-bg-adapter:owned:server-chat-commit-routes-test:1.10',
                'lazy-chat-bg-adapter:owned:server-chat-process-client:1.10',
                'lazy-chat-bg-adapter:owned:server-chat-process-adoption-test:1.10',
            ],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-chat-commit-owner-init:1.10',
            file: 'server/node/server.cjs',
            type: 'insert',
            where: 'before',
            anchor: '// ─── Express error middleware — must be registered after all routes ─────────\n',
            content: `const {
    createServerChatCommitOwner,
    reconcileServerChatRecovery,
} = require('./serverChatCommitOwner.cjs');
const { createServerChatInputOwner } = require('./serverChatInputOwner.cjs');

async function ensureServerChatCommitCanonicalState() {
    await ensureChatStore();
    if (dbCache[DB_HEX_KEY]) return;
    const raw = kvGet('database/database.bin');
    if (!raw) return;
    const database = await decodeDatabaseWithPersistentChatIds(raw, { createBackup: true });
    cacheStrippedDatabase(normalizeJSON(stripChatsFromDb(database)));
}

const serverChatInputOwner = createServerChatInputOwner({
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
    encodeSettingsSnapshot: encodeRisuSaveLegacy,
});

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
    serverChatInputOwner,
});

`,
            requires: [
                'lazy-chat-bg-adapter:owned:server-chat-commit-owner:1.10',
                'lazy-chat-bg-adapter:owned:server-chat-input-owner-test:1.10',
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
            content: "require('./bgOrchestrator.cjs')(app, Object.assign({ sessionAuthMiddleware, ensureChatStore, getDbCache: () => dbCache, getFullChatStore: () => fullChatStore, DB_HEX_KEY, requestLogs, serverChatCommitOwner, serverChatInputOwner }, require('./db.cjs')));",
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
            content: `    const serverChatRecovery = await reconcileServerChatRecovery({
        serverChatInputOwner,
        serverChatCommitOwner,
    });
    if (serverChatRecovery.stalled) {
        logger.error(
            '[ServerChatRecovery] Recovery stalled after '
            + serverChatRecovery.passes + ' pass(es): '
            + serverChatRecovery.pendingInputs.length + ' input(s), '
            + serverChatRecovery.pendingCommits.length + ' commit(s)'
        );
    } else if (serverChatRecovery.inputResults.length > 0
        || serverChatRecovery.commitResults.length > 0) {
        logger.info(
            '[ServerChatRecovery] Reconciled server chat journals in '
            + serverChatRecovery.passes + ' pass(es) before listen'
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
    serverChatInputOwner.discardRecovery();
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
                serverChatInputOwner.discardRecovery();
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
    serverChatInputOwner.discardRecovery();
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
                discardCommitRecovery: () => {
                    serverChatInputOwner.discardRecovery();
                    serverChatCommitOwner.discardRecovery();
                },
                resetJournalMemory: () => chatWriteJournal.resetMemory(),
`,
            requires: ['lazy-chat-bg-adapter:server-chat-commit-save-folder-reset:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-chat-owned-root-full-write:1.10',
            file: 'server/node/server.cjs',
            type: 'replace',
            anchor: `                    incomingStrippedDb = canonicalizeStrippedDatabase(
                        normalizeJSON(stripChatsFromDb(incomingDb))
                    );
                    try {
`,
            content: `                    incomingStrippedDb = canonicalizeStrippedDatabase(
                        normalizeJSON(stripChatsFromDb(incomingDb))
                    );
                    // A validator-free root snapshot cannot attest to an
                    // already accepted server or browser statistic effect.
                    // A truly empty initial database remains writable.
                    if (!req.headers['if-match'] && !req.headers['x-if-match']
                        && ((Array.isArray(acceptedStrippedDb.serverChatCommitApplied)
                            && acceptedStrippedDb.serverChatCommitApplied.length > 0)
                            || (Array.isArray(acceptedStrippedDb.statics?.browserMessageEffects)
                                && acceptedStrippedDb.statics.browserMessageEffects.length > 0)
                            || (Number.isSafeInteger(acceptedStrippedDb.statics?.browserMessageEffectCutoff)
                                && acceptedStrippedDb.statics.browserMessageEffectCutoff > 0))) {
                        return res.status(428).json({
                            error: 'Current database revision required after server chat commit',
                            code: 'BG_SERVER_EFFECT_REVISION_REQUIRED',
                            currentEtag: dbEtag,
                        });
                    }
                    incomingStrippedDb = serverChatCommitOwner.preserveDatabaseState(
                        acceptedStrippedDb,
                        incomingStrippedDb,
                    );
                    try {
`,
            requires: ['lazy-chat-bg-adapter:server-chat-commit-snapshot-reset:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-chat-owned-root-patch:1.10',
            file: 'server/node/server.cjs',
            type: 'replace',
            anchor: `            if (decodedKey === 'database/database.bin') {
                try {
                    await ensureChatStore();
                    validateStrippedDatabaseTransition(
`,
            content: `            if (decodedKey === 'database/database.bin') {
                try {
                    nextDocument = serverChatCommitOwner.preserveDatabaseState(
                        dbCache[cacheKey],
                        nextDocument,
                    );
                    await ensureChatStore();
                    validateStrippedDatabaseTransition(
`,
            requires: ['lazy-chat-bg-adapter:server-chat-owned-root-full-write:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-input-bundle-exports:1.10',
            file: 'server/node/bgOrchBundle.build.cjs',
            type: 'replace',
            anchor: "    contents: `import * as idx from 'src/ts/process/index.svelte';\\nimport * as stores from 'src/ts/stores.svelte';\\nimport * as dbmod from 'src/ts/storage/database.svelte';\\nimport * as status from 'src/ts/status/requestStatus';\\nglobalThis.__bgOrch = { idx, stores, dbmod, status };\\n`,\n",
            content: "    contents: `import * as idx from 'src/ts/process/index.svelte';\\nimport * as stores from 'src/ts/stores.svelte';\\nimport * as dbmod from 'src/ts/storage/database.svelte';\\nimport * as status from 'src/ts/status/requestStatus';\\nimport * as triggers from 'src/ts/process/triggers';\\nimport * as scripts from 'src/ts/process/scripts';\\nglobalThis.__bgOrch = { idx, stores, dbmod, status, triggers, scripts };\\n`,\n",
            requires: ['bg-preserve:owned:server/node/bgOrchBundle.build.cjs'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-input-bundle-load-check:1.10',
            file: 'server/node/bgOrchBundle.build.cjs',
            type: 'replace',
            anchor: `    const ok = globalThis.__bgOrch && globalThis.__bgOrch.idx && typeof globalThis.__bgOrch.idx.sendChat === 'function'
`,
            content: `    const ok = globalThis.__bgOrch
      && globalThis.__bgOrch.idx
      && typeof globalThis.__bgOrch.idx.sendChat === 'function'
      && typeof globalThis.__bgOrch.triggers?.runTrigger === 'function'
      && typeof globalThis.__bgOrch.scripts?.processScript === 'function'
`,
            requires: ['lazy-chat-bg-adapter:server-input-bundle-exports:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-input-settings-snapshot:1.10',
            file: 'server/node/bgOrchestrator.cjs',
            type: 'replace',
            anchor: `    const dbCache = typeof deps.getDbCache === 'function' ? deps.getDbCache() : null
    let stripped = dbCache && deps.DB_HEX_KEY ? dbCache[deps.DB_HEX_KEY] : null
`,
            content: `    const dbCache = typeof deps.getDbCache === 'function' ? deps.getDbCache() : null
    const inputSettingsSnapshotRequired = mode === 'full'
      && control && control.inputCommandVersion === 1
    let inputSettingsContextDigest = null
    let stripped = dbCache && deps.DB_HEX_KEY ? dbCache[deps.DB_HEX_KEY] : null
    if (inputSettingsSnapshotRequired) {
      if (typeof control.readInputSettingsSnapshot !== 'function') {
        throw new Error('server input settings snapshot owner unavailable')
      }
      const settingsSnapshot = control.readInputSettingsSnapshot()
      if (!settingsSnapshot || settingsSnapshot.status !== 'ready'
        || !Buffer.isBuffer(settingsSnapshot.bytes)
        || typeof settingsSnapshot.contextDigest !== 'string'
        || !/^[a-f0-9]{64}$/.test(settingsSnapshot.contextDigest)) {
        throw new Error('server input settings context unavailable')
      }
      inputSettingsContextDigest = settingsSnapshot.contextDigest
      const snapshotUtils = require('./utils.cjs')
      stripped = snapshotUtils.normalizeJSON(
        await snapshotUtils.decodeRisuSave(settingsSnapshot.bytes),
      )
      if (!stripped || !Array.isArray(stripped.characters)) {
        throw new Error('server input settings snapshot is invalid')
      }
      if (settingsSnapshot.record?.predecessorResolution) {
        const currentStripped = dbCache && deps.DB_HEX_KEY ? dbCache[deps.DB_HEX_KEY] : null
        const { overlayServerChatDynamicState } = require('./serverChatSettingsContext.cjs')
        const resolution = settingsSnapshot.record.predecessorResolution
        try {
          if (typeof control.readPredecessorEffectLineage !== 'function') {
            throw new Error('server input predecessor effect owner unavailable')
          }
          stripped = overlayServerChatDynamicState(stripped, currentStripped, {
            resolution,
            ...control.readPredecessorEffectLineage(resolution.operationId),
          })
        } catch (error) {
          if (typeof control.onInputBlocked === 'function') {
            control.onInputBlocked('predecessor_effect_lineage_changed')
          }
          throw error
        }
      }
    }
`,
            requires: [
                'bg-preserve:owned:server/node/bgOrchestrator.cjs:1.9',
                'lazy-chat-bg-adapter:owned:server-chat-settings-context-test:1.10',
            ],
            after: ['pagefold-bg-adapter:bundle-stale-sources:1.10'],
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
      ? (control.inputCommandVersion === 1
        ? inputSettingsContextDigest
        : nodeCrypto
          .createHash('sha256')
          .update(JSON.stringify({ database: db, selectedCharId, selectedChatId }))
          .digest('hex'))
      : null
`,
            requires: [
                'bg-preserve:owned:server/node/bgOrchestrator.cjs:1.9',
                'lazy-chat-bg-adapter:server-commit-boot-found-result:1.10',
                'lazy-chat-bg-adapter:server-input-settings-snapshot:1.10',
            ],
            after: ['pagefold-bg-adapter:bundle-stale-sources:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-input-transform:1.10',
            file: 'server/node/bgOrchestrator.cjs',
            type: 'insert',
            where: 'after',
            anchor: '    stores.selectedCharID.set(charIdx)\n',
            content: `    let serverInputAttachment = null
    if (mode === 'full' && control && control.inputCommandVersion === 1) {
      if (typeof control.beginInputTransform !== 'function'
        || typeof control.attachInputTransform !== 'function') {
        throw new Error('server input transform owner unavailable')
      }
      const transform = await control.beginInputTransform()
      if (transform && transform.status === 'attached') {
        serverInputAttachment = transform.record
      } else if (transform && transform.status === 'started') {
        const command = transform.record && transform.record.admission
        const inputCharacter = db.characters[charIdx]
        if (!command || !inputCharacter) {
          throw new Error('server input transform command unavailable')
        }
        const inputGlobalsBefore = JSON.stringify(db.globalChatVariables || {})
        const { transformServerChatInput } = require('./serverChatInputTransform.cjs')
        const transformedChat = await transformServerChatInput(
          inputCharacter,
          db.characters[charIdx].chats[chatIdx],
          command,
          bg.triggers,
          bg.scripts,
          (chat) => { db.characters[charIdx].chats[chatIdx] = chat },
        )
        const inputGlobalsAfter = db.globalChatVariables || {}
        let inputGlobalsBeforeObject = {}
        try { inputGlobalsBeforeObject = JSON.parse(inputGlobalsBefore) } catch { /* empty */ }
        const inputGlobals = diffGlobalVariables(inputGlobalsBeforeObject, inputGlobalsAfter)
        const attached = await control.attachInputTransform({
          chat: transformedChat,
          globalIntent: inputGlobals,
        })
        if (!attached || attached.status !== 'attached'
          || attached.publication === 'pending_recovery') {
          throw new Error('server input transform could not attach')
        }
        serverInputAttachment = attached.record
      } else {
        throw new Error('server input transform outcome is unavailable')
      }
      if (typeof control.onInputCommitted === 'function') {
        control.onInputCommitted(serverInputAttachment)
      }
    }
`,
            requires: [
                'lazy-chat-bg-adapter:server-chat-commit-settings-digest:1.10',
                'lazy-chat-bg-adapter:server-input-bundle-load-check:1.10',
                'lazy-chat-bg-adapter:owned:server-chat-input-transform-test:1.10',
            ],
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
    ...(meta && meta.inputCommandVersion === 1
      && typeof meta.inputCommandId === 'string'
      && meta.inputCommandId.length > 0 && meta.inputCommandId.length <= 255
      && Number.isSafeInteger(meta.admissionSeq) && meta.admissionSeq > 0
      ? {
          inputCommandVersion: 1,
          inputCommandId: meta.inputCommandId,
          admissionSeq: meta.admissionSeq,
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
            requires: ['lazy-chat-bg-adapter:server-input-transform:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-chat-commit-result-response:1.10',
            file: 'server/node/bgOrchestrator.cjs',
            type: 'replace',
            anchor: '    error: record.error, postError: record.postError,\n',
            content: `    error: record.error, postError: record.postError,
    ...(record.serverChatCommitVersion === 1 ? { serverChatCommitVersion: 1 } : {}),
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
    serverChatCommitVersion: opts && opts.serverChatCommitVersion === 1 ? 1 : undefined,
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
    kvSet, kvGet, kvList, kvDel, kvGetUpdatedAt, serverChatCommitOwner, serverChatInputOwner,
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
        const inputCommandVersion = req.body && req.body.inputCommandVersion === 1 ? 1 : 0
        const requestedBaseChatRevision = req.body && req.body.baseChatRevision
        if (serverChatCommitVersion === 1
          && (resultKeyVersion !== 1 || !serverChatCommitOwner
            || typeof serverChatCommitOwner.readGenerationCommit !== 'function')) {
          return res.status(409).json({
            handled: false, started: false, operationId,
            reason: 'server-chat-commit-unavailable',
          })
        }
        if (serverChatCommitVersion === 1) {
          const existingCommit = serverChatCommitOwner.readGenerationCommit(operationId)
          if (existingCommit.status === 'committed') {
            return res.status(409).json({
              handled: true, operationId,
              reason: 'server-chat-commit-already-completed',
            })
          }
          if (existingCommit.status === 'conflict') {
            return res.status(503).json({
              handled: true, operationId,
              reason: 'server-chat-commit-identity-unavailable',
            })
          }
        }
        if (inputCommandVersion === 1
          && (serverChatCommitVersion !== 1 || !serverChatInputOwner
            || !req.body || !req.body.inputCommand)) {
          return res.status(409).json({
            handled: false, started: false, operationId,
            reason: 'server-input-command-unavailable',
          })
        }
        if (inputCommandVersion === 1
          && ((chatProcessIndex !== undefined && chatProcessIndex !== -1)
            || runLLM || runFull || clientFormated !== undefined)) {
          return res.status(409).json({
            handled: false, started: false, operationId,
            reason: 'server-input-command-mode-unsupported',
          })
        }
        let serverInputExecution = null
        let serverRunChat = currentChat
        if (inputCommandVersion === 1) {
          let admission
          try {
            admission = await serverChatInputOwner.admit({
              ...req.body.inputCommand,
              operationId,
              charId: selectedCharId,
              chatId: selectedChatId,
              submittedBaseRevision: requestedBaseChatRevision,
            })
          } catch (error) {
            console.error('[bg-orch] server input admission failed:', (error && error.code) || 'unavailable')
            return res.status(503).json({
              handled: false, started: false, operationId,
              reason: 'server-input-admission-failed',
            })
          }
          if (!admission || admission.status !== 'admitted') {
            return res.status(409).json({
              handled: false, started: false, operationId,
              reason: admission && admission.reason
                ? admission.reason : 'server-input-admission-conflict',
              ...(admission && admission.existingOperationId
                ? { existingOperationId: admission.existingOperationId } : {}),
              ...(admission && admission.blockingOperationId
                ? { blockingOperationId: admission.blockingOperationId } : {}),
              ...(admission && Array.isArray(admission.blockingOperationIds)
                ? { blockingOperationIds: admission.blockingOperationIds } : {}),
            })
          }
          const inputActiveExisting = orchestrationRuns.get(operationId)
          if (inputActiveExisting) {
            if (inputActiveExisting.charId !== String(selectedCharId)
              || inputActiveExisting.chatId !== String(selectedChatId)
              || inputActiveExisting.inputCommandVersion !== 1) {
              return res.status(409).json({
                handled: false, started: false, operationId,
                reason: 'operation-coordinate-conflict',
              })
            }
            return res.json({
              handled: true,
              started: true,
              operationId,
              reused: true,
              state: orchestrationRuns.status(operationId),
              resultKeyVersion: inputActiveExisting.resultKeyVersion || 0,
              serverChatCommitVersion: inputActiveExisting.serverChatCommitVersion === 1 ? 1 : 0,
              inputCommandVersion: 1,
            })
          }
          serverInputExecution = await serverChatInputOwner.loadExecution(operationId)
          if (serverInputExecution && serverInputExecution.status === 'waiting') {
            return res.status(202).json({
              handled: true,
              started: false,
              accepted: true,
              operationId,
              state: 'input-waiting-predecessor',
              predecessorOperationId: serverInputExecution.predecessorOperationId,
              reason: serverInputExecution.reason,
              resultKeyVersion: 1,
              serverChatCommitVersion: 1,
              inputCommandVersion: 1,
            })
          }
          if (!serverInputExecution
            || (serverInputExecution.status !== 'transform-required'
              && serverInputExecution.status !== 'attached')) {
            return res.status(409).json({
              handled: false, started: false, operationId,
              reason: serverInputExecution && serverInputExecution.reason
                ? serverInputExecution.reason : 'server-input-command-blocked',
            })
          }
          serverRunChat = serverInputExecution.chat
        }
        let serverCommitBase = null
        if (serverChatCommitVersion === 1) {
          if (inputCommandVersion === 1) {
            const record = serverInputExecution.record
            const revision = serverInputExecution.status === 'attached'
              ? record.executionBaseRevision : record.effectiveBaseRevision
            serverCommitBase = { revision, submittedRevision: revision, matches: true }
          } else {
            try {
              serverCommitBase = await serverChatCommitOwner.captureBase(
                selectedCharId,
                selectedChatId,
                serverRunChat,
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
        }
        let serverBaseChatRevision = serverCommitBase && serverCommitBase.revision
        let serverCommitBaselineMessageCount = chatMessageCount(serverRunChat)
        let serverInputReceipt = serverInputExecution && serverInputExecution.status === 'attached'
          ? serverInputExecution.record.inputReceipt : null
        let serverInputProviderStarted = false
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
            id: 'lazy-chat-bg-adapter:server-input-capabilities:1.10',
            file: 'server/node/bgOrchestrator.cjs',
            type: 'insert',
            where: 'before',
            anchor: `  app.post('/api/bg-orchestrate', sessionAuthMiddleware, async (req, res) => {
`,
            content: `  app.get('/api/bg-orchestrate-capabilities', sessionAuthMiddleware, (_req, res) => {
    res.json({
      contract: 'bg_orchestration_capabilities.v1',
      inputCommandVersion: 1,
      inputCommandFoundationVersion: serverChatInputOwner ? 4 : 0,
      serverChatCommitVersion: serverChatCommitOwner ? 1 : 0,
      chatExecutionProjectionVersion: serverChatCommitOwner ? 1 : 0,
    })
  })

`,
            requires: ['lazy-chat-bg-adapter:server-chat-commit-preview-owner:1.10'],
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
              { getDbCache, DB_HEX_KEY, kvSet, kvGet, requestLogs: deps.requestLogs }, selectedCharId, selectedChatId, serverRunChat, 'full',
`,
            requires: ['lazy-chat-bg-adapter:server-input-capabilities:1.10'],
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
            content: `          ...(inputCommandVersion === 1
            ? { baseChatRevision: serverInputExecution.record.effectiveBaseRevision }
            : typeof requestedBaseChatRevision === 'string'
              && requestedBaseChatRevision.length > 0 && requestedBaseChatRevision.length <= 256
              ? { baseChatRevision: requestedBaseChatRevision }
              : {}),
          ...(serverChatCommitVersion === 1 ? {
            serverChatCommitVersion,
            serverBaseChatRevision,
          } : {}),
          ...(inputCommandVersion === 1 ? {
            inputCommandVersion,
            inputCommandId: serverInputExecution.record.admission.inputCommandId,
            admissionSeq: serverInputExecution.record.admissionSeq,
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
                inputCommandVersion,
                readInputSettingsSnapshot: () => serverChatInputOwner.loadSettingsSnapshot(
                  operationId,
                ),
                readPredecessorEffectLineage: (predecessorOperationId) => ({
                  input: serverChatInputOwner.read(predecessorOperationId),
                  response: serverChatCommitOwner.readEffectLineage(predecessorOperationId),
                }),
                onInputBlocked: (reason) => serverChatInputOwner.blockEditSynchronously(
                  operationId,
                  reason,
                ),
                beginInputTransform: () => serverChatInputOwner.beginTransform(operationId),
                attachInputTransform: (value) => serverChatInputOwner.attachTransformed(
                  operationId,
                  value,
                ),
                onInputCommitted: (record) => {
                  if (!record || !record.inputReceipt || !record.executionBaseRevision
                    || !Number.isSafeInteger(record.baselineMessageCount)) {
                    throw new Error('server input commit receipt is invalid')
                  }
                  serverInputReceipt = record.inputReceipt
                  serverBaseChatRevision = record.executionBaseRevision
                  serverCommitBaselineMessageCount = record.baselineMessageCount
                  operationMeta.serverBaseChatRevision = record.executionBaseRevision
                },
                globalChatVariablesSnapshot: inputCommandVersion !== 1
                  && req.body && req.body.globalVariablesVersion === 1
`,
            requires: ['lazy-chat-bg-adapter:server-chat-commit-operation-meta:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-input-global-snapshot-policy:1.10',
            file: 'server/node/bgOrchestrator.cjs',
            type: 'replace',
            anchor: `                globalChatVariablesSnapshotVersion: req.body && req.body.globalVariablesVersion === 1 ? 1 : 0,
`,
            content: `                globalChatVariablesSnapshotVersion: inputCommandVersion !== 1
                  && req.body && req.body.globalVariablesVersion === 1 ? 1 : 0,
`,
            requires: ['lazy-chat-bg-adapter:server-chat-commit-run-context:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-input-intermediate-policy:1.10',
            file: 'server/node/bgOrchestrator.cjs',
            type: 'replace',
            anchor: `                allowIntermediate: req.body && req.body.resultOrderVersion === 1,
`,
            content: `                allowIntermediate: serverChatCommitVersion !== 1
                  && inputCommandVersion !== 1
                  && req.body && req.body.resultOrderVersion === 1,
`,
            requires: ['lazy-chat-bg-adapter:server-input-global-snapshot-policy:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-input-provider-start-marker:1.10',
            file: 'server/node/bgOrchestrator.cjs',
            type: 'replace',
            anchor: `                onProviderStart: () => {
                  if (resultKeyVersion !== 1) return
                  const running = writeOperationState(kvSet, operationId, operationMeta, 'running')
                  if (!running.written) throw running.error || new Error('operation state store unavailable')
                },
`,
            content: `                onProviderStart: () => {
                  if (resultKeyVersion !== 1) return
                  const running = writeOperationState(kvSet, operationId, operationMeta, 'running')
                  if (!running.written) throw running.error || new Error('operation state store unavailable')
                  if (inputCommandVersion === 1) serverInputProviderStarted = true
                },
`,
            requires: ['lazy-chat-bg-adapter:server-input-intermediate-policy:1.10'],
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
            content: `            const terminalKind = inputCommandVersion === 1
              ? (result && result.chat && Array.isArray(result.chat.message)
                && result.chat.message.length > serverCommitBaselineMessageCount
                  ? (result.threw ? 'terminal-partial' : 'terminal-success')
                  : 'terminal-error')
              : terminalOrchResultKind(result, currentChat)
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
                  baselineMessageCount: serverCommitBaselineMessageCount,
                  settingsDigest: result && result.settingsDigest,
                  result,
                  committedAt,
                  inputReceipt: serverInputReceipt,
                })
              } catch (error) {
                console.error(
                  '[bg-orch] server chat commit failed:',
                  (error && (error.code || error.message)) || 'unknown',
                )
                serverChatCommit = { status: 'failed', reason: 'commit_failed' }
              }
              if (serverChatCommit && serverChatCommit.status === 'cancelled') {
                if (inputCommandVersion === 1) {
                  serverChatInputOwner.settleSynchronously(operationId, 'cancelled')
                }
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
              serverChatCommitVersion,
              serverChatCommit,
            })
            if (inputCommandVersion === 1
              && (!serverChatCommit || serverChatCommit.status !== 'committed')) {
              serverChatInputOwner.markRunFailureSynchronously(
                operationId,
                serverInputProviderStarted,
              )
            }
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
            requires: ['lazy-chat-bg-adapter:server-input-provider-start-marker:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-input-terminal-error:1.10',
            file: 'server/node/bgOrchestrator.cjs',
            type: 'replace',
            anchor: `              const persisted = persistOrchResult(kvSet, selectedCharId, selectedChatId, { chat: null, statics: null, staticsMessagesDelta: 0, globalChatVariables: {}, threw: String((e && e.message) || e) }, {
`,
            content: `              if (inputCommandVersion === 1) {
                try {
                  serverChatInputOwner.markRunFailureSynchronously(
                    operationId,
                    serverInputProviderStarted,
                  )
                } catch { /* recovery retains command */ }
                if (!serverInputProviderStarted) {
                  terminalState = 'retryable-no-provider'
                  console.error('[bg-orch] server input preparation stopped before provider:', (e && e.message) || e)
                  return
                }
              }
              const persisted = persistOrchResult(kvSet, selectedCharId, selectedChatId, { chat: null, statics: null, staticsMessagesDelta: 0, globalChatVariables: {}, threw: String((e && e.message) || e) }, {
                serverChatCommitVersion,
`,
            requires: ['lazy-chat-bg-adapter:server-chat-commit-terminal:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-input-retryable-finish:1.10',
            file: 'server/node/bgOrchestrator.cjs',
            type: 'replace',
            anchor: `            orchestrationRuns.finish(operationId, activeRun, terminalState)
`,
            content: `            if (terminalState === 'retryable-no-provider') {
              orchestrationRuns.discard(operationId, activeRun)
            } else {
              orchestrationRuns.finish(operationId, activeRun, terminalState)
            }
`,
            requires: ['lazy-chat-bg-adapter:server-input-terminal-error:1.10'],
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
    const inputCommand = serverChatInputOwner
      ? serverChatInputOwner.read(operationId)
      : null
    if (inputCommand) {
      if (inputCommand.admission.charId !== charId
        || inputCommand.admission.chatId !== chatId) {
        return res.status(409).json({ accepted: false, operationId, state: 'coordinate-conflict' })
      }
      const pendingInput = typeof serverChatInputOwner.pendingProjection === 'function'
        ? serverChatInputOwner.pendingProjection(charId, chatId)
          .find((entry) => entry.operationId === operationId)
        : null
      const state = inputCommand.userResolvedAt
        ? 'input-retried'
        : inputCommand.transformState === 'unknown'
        ? 'input-transform-unknown'
        : inputCommand.inputState === 'attached'
          ? pendingInput?.state === 'execution_unknown'
            ? 'input-execution-unknown'
            : pendingInput?.state === 'generating'
              ? 'input-generating'
              : 'input-attached'
          : pendingInput && pendingInput.state === 'waiting_predecessor'
            ? 'input-waiting-predecessor'
          : inputCommand.inputState === 'queued'
            ? 'input-queued'
            : 'input-' + inputCommand.inputState
      return res.json({
        accepted: true,
        operationId,
        state,
        resultKeyVersion: 1,
        serverChatCommitVersion: 1,
        inputCommandVersion: 1,
        inputCommandId: inputCommand.admission.inputCommandId,
        admissionSeq: inputCommand.admissionSeq,
        predecessorOperationId: inputCommand.executionPredecessorId,
        ...(inputCommand.userResolvedAt
          ? { replacementOperationId: inputCommand.replacedByOperationId } : {}),
      })
    }
    const run = orchestrationRuns.get(operationId)
`,
            requires: ['lazy-chat-bg-adapter:server-input-retryable-finish:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-chat-execution-projection-route:1.10',
            file: 'server/node/bgOrchestrator.cjs',
            type: 'insert',
            where: 'before',
            anchor: `  // M4: whole-pipeline cancellation. Authentication matches the start/result routes. The ACK
`,
            content: `  app.get('/api/bg-orchestrate-chat-state/:charId/:chatId', sessionAuthMiddleware, async (req, res) => {
    const charId = req.params.charId
    const chatId = req.params.chatId
    const requestedRevision = req.query && typeof req.query.revision === 'string'
      ? req.query.revision : ''
    if (!charId || charId.length > 255 || !chatId || chatId.length > 255
      || !requestedRevision || requestedRevision.length > 256) {
      return res.status(400).json({ found: false, state: 'invalid-request' })
    }
    if (!serverChatCommitOwner || typeof serverChatCommitOwner.readChatProjection !== 'function') {
      return res.status(503).json({ found: false, state: 'projection-unavailable' })
    }
    const outcome = await serverChatCommitOwner.readChatProjection(
      charId,
      chatId,
      requestedRevision,
    )
    const pendingInputCommands = serverChatInputOwner
      && typeof serverChatInputOwner.pendingProjection === 'function'
      ? serverChatInputOwner.pendingProjection(charId, chatId)
      : []
    if (outcome.status === 'revision_mismatch') {
      return res.status(409).json({
        found: false,
        state: 'revision_mismatch',
        currentRevision: outcome.currentRevision,
      })
    }
    if (outcome.status === 'missing') {
      if (pendingInputCommands.length > 0 && outcome.currentRevision === requestedRevision) {
        return res.json({
          found: true,
          contract: 'bg_chat_execution_projection.v1',
          charId,
          chatId,
          chatRevision: requestedRevision,
          bindingEpoch: 'pending-unbound',
          hostChangeSeq: 0,
          coverage: 'unknown',
          owners: [],
          pendingInputCommands,
        })
      }
      return res.status(404).json({
        found: false,
        state: 'ownership-unknown',
        currentRevision: outcome.currentRevision,
      })
    }
    if (outcome.status !== 'ok' || !outcome.projection) {
      return res.status(503).json({ found: false, state: 'projection-invalid' })
    }
    return res.json({
      found: true,
      ...outcome.projection,
      pendingInputCommands,
    })
  })

`,
            requires: ['lazy-chat-bg-adapter:server-chat-commit-status:1.10'],
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
            requires: ['lazy-chat-bg-adapter:server-chat-execution-projection-route:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-input-cancel-tombstone:1.10',
            file: 'server/node/bgOrchestrator.cjs',
            type: 'replace',
            anchor: `      console.log(\`[bg-orch] cancel tombstone: op=\${operationId} state=not-active\`)
      return res.json({ cancelled: true, operationId, state: 'cancelled-before-or-after-restart' })
`,
            content: `      if (serverChatInputOwner) {
        serverChatInputOwner.settleSynchronously(operationId, 'cancelled')
      }
      console.log(\`[bg-orch] cancel tombstone: op=\${operationId} state=not-active\`)
      return res.json({ cancelled: true, operationId, state: 'cancelled-before-or-after-restart' })
`,
            requires: ['lazy-chat-bg-adapter:server-chat-commit-cancel:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-input-cancel-active:1.10',
            file: 'server/node/bgOrchestrator.cjs',
            type: 'replace',
            anchor: `    console.log(\`[bg-orch] cancel ACK: op=\${operationId} state=\${outcome.reason}\`)
    res.json({ cancelled: true, operationId, state: outcome.reason })
`,
            content: `    if (serverChatInputOwner) {
      serverChatInputOwner.settleSynchronously(operationId, 'cancelled')
    }
    console.log(\`[bg-orch] cancel ACK: op=\${operationId} state=\${outcome.reason}\`)
    res.json({ cancelled: true, operationId, state: outcome.reason })
`,
            requires: ['lazy-chat-bg-adapter:server-input-cancel-tombstone:1.10'],
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
            requires: ['lazy-chat-bg-adapter:server-input-cancel-active:1.10'],
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
        const inputCommand = serverChatInputOwner
          ? serverChatInputOwner.read(operationId)
          : null
        const pendingInput = inputCommand
          && typeof serverChatInputOwner.pendingProjection === 'function'
          ? serverChatInputOwner.pendingProjection(charId, chatId)
            .find((entry) => entry.operationId === operationId)
          : null
        const inputOperationState = !inputCommand
          ? null
          : inputCommand.transformState === 'unknown'
            ? 'input-transform-unknown'
            : inputCommand.inputState === 'attached'
              ? pendingInput?.state === 'execution_unknown'
                ? 'input-execution-unknown'
                : pendingInput?.state === 'generating'
                  ? 'input-generating'
                  : 'input-attached'
              : pendingInput && pendingInput.state === 'waiting_predecessor'
                ? 'input-waiting-predecessor'
                : 'input-' + inputCommand.inputState
        const operationState = inputOperationState
          || (committed && committed.status === 'committed'
            ? 'chat-committed'
            : run
            ? (run.state === 'running' && run.cancelled ? 'cancelled' : run.state)
            : orphanedOperationState(state))
        return res.json({
          found: false, operationId, operationState,
          ...((state && state.serverChatCommitVersion === 1) || inputCommand
            ? { serverChatCommitVersion: 1 }
            : {}),
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
            inputCommandVersion: activeExisting.inputCommandVersion === 1 ? 1 : 0,
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
          const durableInputCommandVersion = durable.inputCommandVersion === 1 ? 1 : 0
          const sameInputCommand = durableInputCommandVersion !== 1
            || (durable.inputCommandId === operationMeta.inputCommandId
              && durable.admissionSeq === operationMeta.admissionSeq)
          if (resultKeyVersion !== 1
            || durableServerChatCommitVersion !== serverChatCommitVersion
            || !sameServerBase
            || durableInputCommandVersion !== inputCommandVersion
            || !sameInputCommand) {
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
                inputCommandVersion: durable.inputCommandVersion === 1 ? 1 : 0,
              })
          }
        }
`,
            requires: ['lazy-chat-bg-adapter:server-chat-commit-active-response:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-input-capacity-settle:1.10',
            file: 'server/node/bgOrchestrator.cjs',
            type: 'replace',
            anchor: `            if (resultKeyVersion === 1) {
              try { if (typeof kvDel === 'function') kvDel(operationStateKey(operationId)) } catch { /* best-effort */ }
            }
            return res.status(429).json({
`,
            content: `            if (resultKeyVersion === 1) {
              try { if (typeof kvDel === 'function') kvDel(operationStateKey(operationId)) } catch { /* best-effort */ }
            }
            if (inputCommandVersion === 1) {
              serverChatInputOwner.settleSynchronously(operationId, 'cancelled')
            }
            return res.status(429).json({
`,
            requires: ['lazy-chat-bg-adapter:server-chat-commit-durable-response:1.10'],
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
            inputCommandVersion: started.run.inputCommandVersion === 1 ? 1 : 0,
          })
`,
            requires: ['lazy-chat-bg-adapter:server-input-capacity-settle:1.10'],
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
          inputCommandVersion,
        })
`,
            requires: ['lazy-chat-bg-adapter:server-chat-commit-running-response:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-input-drain-handler:1.10',
            file: 'server/node/bgOrchestrator.cjs',
            type: 'replace',
            anchor: `  app.post('/api/bg-orchestrate', sessionAuthMiddleware, async (req, res) => {
`,
            content: `  let inputDrain = null
  const handleOrchestrateStart = async (req, res) => {
`,
            requires: [
                'lazy-chat-bg-adapter:server-input-capabilities:1.10',
                'lazy-chat-bg-adapter:server-chat-commit-start-response:1.10',
                'lazy-chat-bg-adapter:owned:server-chat-input-drain-test:1.10',
            ],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-input-mode-preflight:1.10',
            file: 'server/node/bgOrchestrator.cjs',
            type: 'replace',
            anchor: `      const { selectedCharId, selectedChatId, chatProcessIndex, currentChat, clientFormated, runLLM, runFull, detached } = req.body || {}
`,
            content: `      const { selectedCharId, selectedChatId, chatProcessIndex, currentChat, clientFormated, runLLM, runFull, detached } = req.body || {}
      if (req.body?.inputCommandVersion === 1
        && (!detached || !selectedCharId || !selectedChatId || !currentChat)) {
        return res.status(409).json({
          handled: false, started: false,
          operationId: validOperationId(req.body?.operationId) ? req.body.operationId : null,
          reason: 'server-input-command-mode-unsupported',
        })
      }
`,
            requires: ['lazy-chat-bg-adapter:server-input-drain-enqueue:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-input-drain-enqueue:1.10',
            file: 'server/node/bgOrchestrator.cjs',
            type: 'replace',
            anchor: `          if (serverInputExecution && serverInputExecution.status === 'waiting') {
            return res.status(202).json({
`,
            content: `          if (serverInputExecution && serverInputExecution.status === 'waiting') {
            inputDrain.enqueue(operationId, req.body)
            return res.status(202).json({
`,
            requires: ['lazy-chat-bg-adapter:server-input-drain-handler:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-input-drain-registration:1.10',
            file: 'server/node/bgOrchestrator.cjs',
            type: 'replace',
            anchor: `  })

  // M8: reconcile a lost detached-start response by exact operation identity. Active/finished
`,
            content: `  }
  app.post('/api/bg-orchestrate', sessionAuthMiddleware, handleOrchestrateStart)
  if (serverChatInputOwner) {
    const { createServerChatInputDrain } = require('./serverChatInputDrain.cjs')
    inputDrain = createServerChatInputDrain({
      loadExecution: (operationId) => serverChatInputOwner.loadExecution(operationId),
      start: async (body) => {
        let status = 200
        let payload = null
        const response = {
          status(value) { status = value; return this },
          json(value) { payload = value; return value },
        }
        await handleOrchestrateStart({ body }, response)
        return { status, started: payload?.started === true }
      },
    })
  }

  // M8: reconcile a lost detached-start response by exact operation identity. Active/finished
`,
            requires: ['lazy-chat-bg-adapter:server-input-mode-preflight:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'lazy-chat-bg-adapter:server-input-retention-sweep:1.10',
            file: 'server/node/bgOrchestrator.cjs',
            type: 'insert',
            where: 'after',
            anchor: "          isOperationActive: (operationId) => orchestrationRuns.status(operationId) === 'running',\n        })\n",
            content: `        if (serverChatInputOwner || serverChatCommitOwner) {
          void (async () => {
            if (serverChatInputOwner) await serverChatInputOwner.retireTerminal()
            if (serverChatCommitOwner) await serverChatCommitOwner.retireRecoveries()
          })().catch(() => {
            // Keep the durable records; the next retention sweep retries.
          })
        }
`,
            requires: ['lazy-chat-bg-adapter:server-input-drain-registration:1.10'],
            targetVersions: pocketRisu1100,
        },
    ],
}
