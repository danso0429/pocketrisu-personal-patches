'use strict'

const fs = require('node:fs')
const path = require('node:path')

const filesRoot = path.join(__dirname, 'files')
const owned = (relative) => fs.readFileSync(path.join(filesRoot, relative), 'utf8')
const pocketRisu190 = { pocketrisu: ['1.9.0', '1.10.0'] }
const nodeStorageOwnerUnits = [
    'startup-cache:node-patch-journal',
    'lazy-chat-sync:replace:src:ts:storage:nodeStorage-ts:1.9',
    'bg-preserve-storage-base:asset-upload-error-detail',
    'lazy-chat-bg-adapter:asset-upload-error-detail',
    'kei-backup-restore-safety-standard-adapter:node-safety-import:1.9',
    'kei-backup-restore-safety-standard-adapter:node-server-stream-error:1.9',
    'kei-backup-restore-safety-lazy-adapter:node-safety-import:1.9',
    'kei-backup-restore-safety-lazy-adapter:node-server-stream-error:1.9',
]
const globalApiOwnerUnits = [
    'bg-preserve:hook:globalapi-durable-save-api',
    'bg-preserve:hook:globalapi-durable-save-outcome',
    'bg-preserve:hook:globalapi-durable-save-rethrow',
    'bg-preserve:hook:globalapi-durable-save-impl',
    'bg-preserve:hook:globalapi-fetch-impl-register:1.9',
    'bg-preserve:hook:globalapi-fetchnative-bgsubkey-arg',
    'bg-preserve:hook:globalapi-gemini-main-branch',
    'lazy-chat-sync:replace:src:ts:globalApi-svelte-ts:1.9',
    'lazy-chat-bg-adapter:global-import',
    'lazy-chat-bg-adapter:durable-flush',
    'persona-organizer:uncleanable-gallery-assets',
    'persona-organizer:uncleanable-folder-assets',
    'persona-organizer:replace-gallery-assets',
]

module.exports = {
    id: 'client-build-fence',
    title: 'Client build write fence',
    version: '0.1.2',
    targets: {
        pocketrisu: {
            verified: ['1.9.0'],
            reviewing: ['1.10.0'],
        },
    },
    userSelectable: true,
    presetDefaults: ['hardening'],
    units: [
        {
            id: 'client-build-fence:client-build-helper:1.9',
            file: 'src/ts/storage/clientBuild.ts',
            type: 'owned',
            content: owned('src/ts/storage/clientBuild.ts'),
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence:client-handshake:1.9',
            file: 'src/ts/storage/clientBuildHandshake.ts',
            type: 'owned',
            content: owned('src/ts/storage/clientBuildHandshake.ts'),
            requires: ['client-build-fence:client-build-helper:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence:client-handshake-tests:1.9',
            file: 'src/ts/storage/clientBuildHandshake.test.ts',
            type: 'owned',
            content: owned('src/ts/storage/clientBuildHandshake.test.ts'),
            requires: ['client-build-fence:client-handshake:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence:draft-failure-tests:1.9',
            file: 'src/ts/storage/chatDraftClientBuild.test.ts',
            type: 'owned',
            content: owned('src/ts/storage/chatDraftClientBuild.test.ts'),
            requires: ['client-build-fence:draft-sweep-key:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence:server-helper:1.9',
            file: 'server/node/clientBuildFence.cjs',
            type: 'owned',
            content: owned('server/node/clientBuildFence.cjs'),
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence:server-helper-tests:1.9',
            file: 'server/node/clientBuildFence.test.ts',
            type: 'owned',
            content: owned('server/node/clientBuildFence.test.ts'),
            requires: ['client-build-fence:server-helper:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence:vite-crypto-import:1.9',
            file: 'vite.config.ts',
            type: 'insert',
            where: 'after',
            anchor: "import { readFileSync } from 'fs';\n",
            content: "import { randomBytes } from 'crypto';\n",
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence:vite-stamp-value:1.9',
            file: 'vite.config.ts',
            type: 'insert',
            where: 'after',
            anchor: 'export default defineConfig(({command, mode}) => {\n',
            content: `  const buildHash = command === 'build'
    ? randomBytes(32).toString('hex')
    : 'development';
  const clientBuildStamp = \`\${pkg.version}-\${buildHash}\`;
  const clientBuildManifest = JSON.stringify({
    version: pkg.version,
    stamp: clientBuildStamp,
  }, null, 2) + '\\n';
`,
            requires: ['client-build-fence:vite-crypto-import:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence:vite-stamp-define:1.9',
            file: 'vite.config.ts',
            type: 'insert',
            where: 'after',
            anchor: "      '__APP_VERSION__': JSON.stringify(pkg.version),\n",
            content: "      '__CLIENT_BUILD_STAMP__': JSON.stringify(clientBuildStamp),\n",
            requires: ['client-build-fence:vite-stamp-value:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence:vite-stamp-asset:1.9',
            file: 'vite.config.ts',
            type: 'insert',
            where: 'before',
            anchor: '      svelte({\n',
            content: `      {
        name: 'pocketrisu-client-build-stamp',
        apply: 'build',
        generateBundle() {
          this.emitFile({
            type: 'asset',
            fileName: 'build-stamp.json',
            source: clientBuildManifest,
          });
        },
      },
`,
            requires: ['client-build-fence:vite-stamp-define:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence:vite-env:1.9',
            file: 'src/vite-env.d.ts',
            type: 'insert',
            where: 'after',
            anchor: 'declare const __APP_VERSION__: string\n',
            content: 'declare const __CLIENT_BUILD_STAMP__: string\n',
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence:node-storage-import:1.9',
            file: 'src/ts/storage/nodeStorage.ts',
            type: 'insert',
            where: 'after',
            anchor: 'import { decodeRisuSave, encodeRisuSaveLegacy } from "./risuSave"\n',
            content: `import {
    clientBuildFetch,
    clientBuildStamp,
    handleAdvertisedClientBuild,
    handleClientBuildXhr,
} from "./clientBuildHandshake"
`,
            after: nodeStorageOwnerUnits,
            requires: ['client-build-fence:client-handshake:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence:node-session-fetch:1.9',
            file: 'src/ts/storage/nodeStorage.ts',
            type: 'replace',
            anchor: "            const res = await fetch('/api/session', {\n",
            content: "            const res = await clientBuildFetch('/api/session', {\n",
            after: nodeStorageOwnerUnits,
            requires: ['client-build-fence:node-storage-import:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence:node-session-accept:1.9',
            file: 'src/ts/storage/nodeStorage.ts',
            type: 'replace',
            anchor: `            if (res.ok) {
                NodeStorage.sessionInitialized = true
            }
`,
            content: `            if (res.ok) {
                const body = await res.clone().json().catch(() => null)
                handleAdvertisedClientBuild(body?.build)
                NodeStorage.sessionInitialized = true
            }
`,
            after: nodeStorageOwnerUnits,
            requires: ['client-build-fence:node-session-fetch:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence:node-auth-fetch:1.9',
            file: 'src/ts/storage/nodeStorage.ts',
            type: 'replace',
            anchor: `        const response = await fetch(input, {
            ...init,
            headers
        })
`,
            content: `        const response = await clientBuildFetch(input, {
            ...init,
            headers
        })
`,
            after: nodeStorageOwnerUnits,
            requires: ['client-build-fence:node-session-accept:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence:node-migration-xhr-header:1.9',
            file: 'src/ts/storage/nodeStorage.ts',
            type: 'replace',
            anchor: `            xhr.setRequestHeader('content-type', 'application/zip')
            xhr.setRequestHeader('risu-auth', authHeader)
            xhr.setRequestHeader('x-session-id', NodeStorage.sessionId)
            if (isUserActive()) xhr.setRequestHeader('x-user-active', '1')
`,
            content: `            xhr.setRequestHeader('content-type', 'application/zip')
            xhr.setRequestHeader('risu-auth', authHeader)
            xhr.setRequestHeader('x-session-id', NodeStorage.sessionId)
            xhr.setRequestHeader('x-client-build', clientBuildStamp)
            if (isUserActive()) xhr.setRequestHeader('x-user-active', '1')
`,
            after: nodeStorageOwnerUnits,
            requires: ['client-build-fence:node-auth-fetch:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence:node-migration-xhr-response:1.9',
            file: 'src/ts/storage/nodeStorage.ts',
            type: 'replace',
            anchor: `            xhr.onerror = () => reject(new Error('zip upload failed'))
            xhr.onload = () => {
                if (xhr.status < 200 || xhr.status >= 300) {
`,
            content: `            xhr.onerror = () => reject(new Error('zip upload failed'))
            xhr.onload = () => {
                handleClientBuildXhr(xhr)
                if (xhr.status < 200 || xhr.status >= 300) {
`,
            after: nodeStorageOwnerUnits,
            requires: ['client-build-fence:node-migration-xhr-header:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence:global-import:1.9',
            file: 'src/ts/globalApi.svelte.ts',
            type: 'insert',
            where: 'after',
            anchor: 'import { AutoStorage } from "./storage/autoStorage";\n',
            content: `import {
    clientBuildFetch,
    setClientBuildDirtyStateProbe,
} from "./storage/clientBuildHandshake";
`,
            after: globalApiOwnerUnits,
            requires: ['client-build-fence:client-handshake:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence:global-dirty-probe:1.9',
            file: 'src/ts/globalApi.svelte.ts',
            type: 'insert',
            where: 'after',
            anchor: `    function hasTrackedChanges(toSave: toSaveType) {
        return !!(
            toSave.botPreset ||
            toSave.modules ||
            toSave.plugins ||
            toSave.pluginCustomStorage ||
            toSave.root ||
            toSave.character.length > 0 ||
            toSave.chat.length > 0
        )
    }
`,
            content: `
    setClientBuildDirtyStateProbe(() => (
        changed
        || saveInFlight !== null
        || hasTrackedChanges(changeTracker)
    ))
`,
            after: globalApiOwnerUnits,
            requires: ['client-build-fence:global-import:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence:global-flush:1.9',
            file: 'src/ts/globalApi.svelte.ts',
            type: 'replace',
            anchor: `            fetch('/api/db/flush', {
                method: 'POST',
                keepalive: true,
                credentials: 'same-origin'
            }).catch(() => {})
`,
            content: `            clientBuildFetch('/api/db/flush', {
                method: 'POST',
                keepalive: true,
                credentials: 'same-origin'
            }).catch(() => {})
`,
            after: globalApiOwnerUnits,
            requires: ['client-build-fence:global-dirty-probe:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence:global-proxy-stream-cancel:1.9',
            file: 'src/ts/globalApi.svelte.ts',
            type: 'replace',
            anchor: `            cancel() {
                ws.close()
                fetch(\`/proxy-stream-jobs/\${encodeURIComponent(jobId)}\`, {
`,
            content: `            cancel() {
                ws.close()
                clientBuildFetch(\`/proxy-stream-jobs/\${encodeURIComponent(jobId)}\`, {
`,
            after: globalApiOwnerUnits,
            requires: ['client-build-fence:global-flush:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence:global-proxy-stream-abort:1.9',
            file: 'src/ts/globalApi.svelte.ts',
            type: 'replace',
            anchor: `        const abortHandler = () => {
            ws.close()
            fetch(\`/proxy-stream-jobs/\${encodeURIComponent(jobId)}\`, {
`,
            content: `        const abortHandler = () => {
            ws.close()
            clientBuildFetch(\`/proxy-stream-jobs/\${encodeURIComponent(jobId)}\`, {
`,
            after: globalApiOwnerUnits,
            requires: ['client-build-fence:global-proxy-stream-cancel:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence:draft-import:1.9',
            file: 'src/ts/storage/chatDraft.ts',
            type: 'insert',
            where: 'after',
            anchor: 'import { forageStorage } from "../globalApi.svelte"\n',
            content: 'import { setClientBuildDraftUnsafe } from "./clientBuildHandshake"\n',
            requires: ['client-build-fence:client-handshake:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence:draft-queue-state:1.9',
            file: 'src/ts/storage/chatDraft.ts',
            type: 'replace',
            anchor: `let writeChain: Promise<void> = Promise.resolve()
function enqueue(op: () => Promise<void>): void {
    writeChain = writeChain.then(() => op().catch(() => {}))
}
`,
            content: `let writeChain: Promise<void> = Promise.resolve()
let queuedWrites = 0
let activeWrites = 0
let nextDraftOperation = 0
const pendingDraftRecovery = new Map<number, string>()
const failedDraftRecovery = new Map<string, string>()

function formatDraftRecovery(draft: ChatDraft): string {
    return [
        draft.m,
        draft.t ? '[번역 입력 / Translation input]\\n' + draft.t : '',
    ].filter(Boolean).join('\\n\\n')
}

function syncClientBuildDraftState(): void {
    const recoveryText = [...new Set([
        ...failedDraftRecovery.values(),
        ...pendingDraftRecovery.values(),
    ].filter(Boolean))].join('\\n\\n')
    setClientBuildDraftUnsafe(
        saveTimer !== null || queuedWrites > 0 || activeWrites > 0 || failedDraftRecovery.size > 0,
        recoveryText,
    )
}

function enqueue(key: string, op: () => Promise<void>, recoveryText = ''): void {
    const operation = ++nextDraftOperation
    pendingDraftRecovery.set(operation, recoveryText)
    queuedWrites += 1
    syncClientBuildDraftState()
    writeChain = writeChain.then(async () => {
        queuedWrites -= 1
        activeWrites += 1
        syncClientBuildDraftState()
        try {
            await op()
            failedDraftRecovery.delete(key)
        } catch {
            if (recoveryText || !failedDraftRecovery.has(key)) {
                failedDraftRecovery.set(key, recoveryText)
            }
        } finally {
            activeWrites -= 1
            pendingDraftRecovery.delete(operation)
            syncClientBuildDraftState()
        }
    })
}
`,
            requires: ['client-build-fence:draft-import:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence:draft-timer-state:1.9',
            file: 'src/ts/storage/chatDraft.ts',
            type: 'replace',
            anchor: `let saveTimer: ReturnType<typeof setTimeout> | null = null

function cancelPending() {
    if (saveTimer) {
        clearTimeout(saveTimer)
        saveTimer = null
    }
}
`,
            content: `let saveTimer: ReturnType<typeof setTimeout> | null = null

function cancelPending() {
    if (saveTimer) {
        clearTimeout(saveTimer)
        saveTimer = null
    }
    syncClientBuildDraftState()
}
`,
            requires: ['client-build-fence:draft-queue-state:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence:draft-schedule-state:1.9',
            file: 'src/ts/storage/chatDraft.ts',
            type: 'replace',
            anchor: `    saveTimer = setTimeout(() => {
        saveTimer = null
        enqueue(() => persistSave(key, draft))
    }, DEBOUNCE_MS)
`,
            content: `    saveTimer = setTimeout(() => {
        saveTimer = null
        enqueue(key, () => persistSave(key, draft), formatDraftRecovery(draft))
    }, DEBOUNCE_MS)
    syncClientBuildDraftState()
`,
            requires: ['client-build-fence:draft-timer-state:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence:draft-flush-key:1.9',
            file: 'src/ts/storage/chatDraft.ts',
            type: 'replace',
            anchor: `    cancelPending()
    enqueue(() => persistSave(chatDraftKey(chaId, chatId), draft))
`,
            content: `    cancelPending()
    const key = chatDraftKey(chaId, chatId)
    enqueue(key, () => persistSave(key, draft), formatDraftRecovery(draft))
`,
            requires: ['client-build-fence:draft-schedule-state:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence:draft-remove-key:1.9',
            file: 'src/ts/storage/chatDraft.ts',
            type: 'replace',
            anchor: `    cancelPending()
    enqueue(() => persistRemove(chatDraftKey(chaId, chatId)))
`,
            content: `    cancelPending()
    const key = chatDraftKey(chaId, chatId)
    enqueue(key, () => persistRemove(key))
`,
            requires: ['client-build-fence:draft-flush-key:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence:draft-sweep-key:1.9',
            file: 'src/ts/storage/chatDraft.ts',
            type: 'replace',
            anchor: `            enqueue(async () => {
                await forageStorage.removeItem(key)
`,
            content: `            enqueue(key, async () => {
                await forageStorage.removeItem(key)
`,
            requires: ['client-build-fence:draft-remove-key:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence:composer-import:1.9',
            file: 'src/lib/ChatScreens/DefaultChatScreen.svelte',
            type: 'insert',
            where: 'after',
            anchor: "    import { loadChatDraft, scheduleSaveChatDraft, flushChatDraft, removeChatDraft } from 'src/ts/storage/chatDraft';\n",
            content: "    import { setClientBuildComposerDirty } from 'src/ts/storage/clientBuildHandshake';\n",
            requires: ['client-build-fence:client-handshake:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence:composer-dirty-state:1.9',
            file: 'src/lib/ChatScreens/DefaultChatScreen.svelte',
            type: 'insert',
            where: 'after',
            anchor: `    $effect(() => {
        const chaId = draftChaId
        const chatId = draftChatId
        const m = messageInput
        const t = messageInputTranslate
        if (!chaId || !chatId || draftLoading) return
        scheduleSaveChatDraft(chaId, chatId, { m, t })
    })
`,
            content: `
    $effect(() => {
        const recoveryText = [
            messageInput,
            messageInputTranslate
                ? '[번역 입력 / Translation input]\\n' + messageInputTranslate
                : '',
            fileInput.length > 0
                ? '[첨부 자산 / Attached assets]\\n' + fileInput.join('\\n')
                : '',
        ].filter(Boolean).join('\\n\\n')
        setClientBuildComposerDirty(
            messageInput.length > 0 || messageInputTranslate.length > 0 || fileInput.length > 0,
            recoveryText,
        )
        return () => setClientBuildComposerDirty(false)
    })
`,
            requires: ['client-build-fence:composer-import:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence:generation-import:1.9',
            file: 'src/ts/process/generationState.ts',
            type: 'insert',
            where: 'after',
            anchor: 'import { derived, get, writable, type Readable } from "svelte/store"\n',
            content: 'import { setClientBuildGenerationActive } from "../storage/clientBuildHandshake"\n',
            after: ['bg-preserve:hook:index-unified-generation-busy-import:1.9'],
            requires: ['client-build-fence:client-handshake:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence:generation-state:1.9',
            file: 'src/ts/process/generationState.ts',
            type: 'insert',
            where: 'after',
            anchor: 'export const generationStates = writable<Map<string, GenState>>(new Map())\n',
            content: 'generationStates.subscribe((states) => setClientBuildGenerationActive(states.size > 0))\n',
            requires: ['client-build-fence:generation-import:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence:job-fetch-import:1.9',
            file: 'src/ts/process/request/jobFetch.ts',
            type: 'insert',
            where: 'after',
            anchor: "import { language } from 'src/lang'\n",
            content: "import { clientBuildFetch } from 'src/ts/storage/clientBuildHandshake'\n",
            requires: ['client-build-fence:client-handshake:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence:job-fetch-delete:1.9',
            file: 'src/ts/process/request/jobFetch.ts',
            type: 'replace',
            anchor: "                await fetch(`/api/model-jobs/${jobId}`, { method: 'DELETE', headers: await authHeader() })\n",
            content: "                await clientBuildFetch(`/api/model-jobs/${jobId}`, { method: 'DELETE', headers: await authHeader() })\n",
            requires: ['client-build-fence:job-fetch-import:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence:job-fetch-claim:1.9',
            file: 'src/ts/process/request/jobFetch.ts',
            type: 'replace',
            anchor: "                await fetch(`/api/model-jobs/${jobId}/claim`, { method: 'POST', headers: await authHeader() })\n",
            content: "                await clientBuildFetch(`/api/model-jobs/${jobId}/claim`, { method: 'POST', headers: await authHeader() })\n",
            requires: ['client-build-fence:job-fetch-delete:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence:job-recovery-import:1.9',
            file: 'src/ts/process/request/jobRecovery.ts',
            type: 'insert',
            where: 'after',
            anchor: "import { language } from 'src/lang'\n",
            content: "import { clientBuildFetch } from 'src/ts/storage/clientBuildHandshake'\n",
            requires: ['client-build-fence:client-handshake:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence:job-recovery-claim:1.9',
            file: 'src/ts/process/request/jobRecovery.ts',
            type: 'replace',
            anchor: "        await fetch(`/api/model-jobs/${jobId}/claim`, { method: 'POST', headers: await authHeader() })\n",
            content: "        await clientBuildFetch(`/api/model-jobs/${jobId}/claim`, { method: 'POST', headers: await authHeader() })\n",
            requires: ['client-build-fence:job-recovery-import:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence:job-recovery-delete:1.9',
            file: 'src/ts/process/request/jobRecovery.ts',
            type: 'replace',
            anchor: "            await fetch(`/api/model-jobs/${job.id}`, { method: 'DELETE', headers: await authHeader() })\n",
            content: "            await clientBuildFetch(`/api/model-jobs/${job.id}`, { method: 'DELETE', headers: await authHeader() })\n",
            requires: ['client-build-fence:job-recovery-claim:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence:pending-sends-import:1.9',
            file: 'src/ts/process/request/pendingSends.ts',
            type: 'insert',
            where: 'after',
            anchor: "import { authHeader } from './jobFetch'\n",
            content: "import { clientBuildFetch } from 'src/ts/storage/clientBuildHandshake'\n",
            requires: ['client-build-fence:client-handshake:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence:pending-sends-delete:1.9',
            file: 'src/ts/process/request/pendingSends.ts',
            type: 'replace',
            anchor: "        await fetch(`/api/pending-sends/${encodeURIComponent(chatId)}`, {\n",
            content: "        await clientBuildFetch(`/api/pending-sends/${encodeURIComponent(chatId)}`, {\n",
            requires: ['client-build-fence:pending-sends-import:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence:pending-sends-claim:1.9',
            file: 'src/ts/process/request/pendingSends.ts',
            type: 'replace',
            anchor: "        const res = await fetch(`/api/pending-sends/${encodeURIComponent(chatId)}/claim`, {\n",
            content: "        const res = await clientBuildFetch(`/api/pending-sends/${encodeURIComponent(chatId)}/claim`, {\n",
            requires: ['client-build-fence:pending-sends-delete:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence:system-backup-import:1.9',
            file: 'src/lib/Setting/Pages/SystemBackup.svelte',
            type: 'insert',
            where: 'after',
            anchor: "    import { forageStorage } from 'src/ts/globalApi.svelte'\n",
            content: "    import { clientBuildFetch } from 'src/ts/storage/clientBuildHandshake'\n",
            requires: ['client-build-fence:client-handshake:1.9'],
            targetVersions: pocketRisu190,
        },
        ...[
            ['snapshot-delete', "            const res = await fetch(url, { method: 'DELETE', headers: { 'risu-auth': auth } })\n", "            const res = await clientBuildFetch(url, { method: 'DELETE', headers: { 'risu-auth': auth } })\n"],
            ['snapshot-limits', "            const res = await fetch('/api/db/snapshots/limits', {\n", "            const res = await clientBuildFetch('/api/db/snapshots/limits', {\n"],
            ['backup-path', "            const res = await fetch('/api/backup/server/path', {\n", "            const res = await clientBuildFetch('/api/backup/server/path', {\n"],
            ['boot-reminder', "            const res = await fetch('/api/backup/boot-reminder', {\n", "            const res = await clientBuildFetch('/api/backup/boot-reminder', {\n"],
        ].map(([suffix, anchor, content], index) => ({
            id: `client-build-fence:system-backup-${suffix}:1.9`,
            file: 'src/lib/Setting/Pages/SystemBackup.svelte',
            type: 'replace',
            anchor,
            content,
            requires: [index === 0
                ? 'client-build-fence:system-backup-import:1.9'
                : `client-build-fence:system-backup-${['snapshot-delete', 'snapshot-limits', 'backup-path'][index - 1]}:1.9`],
            targetVersions: pocketRisu190,
        })),
        {
            id: 'client-build-fence:system-dashboard-import:1.9',
            file: 'src/lib/Setting/Pages/SystemDashboard.svelte',
            type: 'insert',
            where: 'after',
            anchor: "    import { forageStorage } from 'src/ts/globalApi.svelte'\n",
            content: "    import { clientBuildFetch } from 'src/ts/storage/clientBuildHandshake'\n",
            requires: ['client-build-fence:client-handshake:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence:system-dashboard-wal:1.9',
            file: 'src/lib/Setting/Pages/SystemDashboard.svelte',
            type: 'replace',
            anchor: "            const res = await fetch('/api/db/wal-checkpoint', {\n",
            content: "            const res = await clientBuildFetch('/api/db/wal-checkpoint', {\n",
            requires: ['client-build-fence:system-dashboard-import:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence:system-dashboard-optimize:1.9',
            file: 'src/lib/Setting/Pages/SystemDashboard.svelte',
            type: 'replace',
            anchor: "            const res = await fetch('/api/db/optimize', {\n",
            content: "            const res = await clientBuildFetch('/api/db/optimize', {\n",
            requires: ['client-build-fence:system-dashboard-wal:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence:system-dashboard-purge:1.10',
            file: 'src/lib/Setting/Pages/SystemDashboard.svelte',
            type: 'replace',
            anchor: "            const res = await fetch('/api/db/assets/purge-orphans', {\n",
            content: "            const res = await clientBuildFetch('/api/db/assets/purge-orphans', {\n",
            requires: ['client-build-fence:system-dashboard-optimize:1.9'],
            targetVersions: { pocketrisu: ['1.10.0'] },
        },
        {
            id: 'client-build-fence:inlay-import:1.9',
            file: 'src/lib/Setting/Pages/Advanced/InlayCompressButton.svelte',
            type: 'insert',
            where: 'after',
            anchor: '    import { alertConfirm, alertNormal } from "src/ts/alert";\n',
            content: '    import { clientBuildFetch } from "src/ts/storage/clientBuildHandshake";\n',
            requires: ['client-build-fence:client-handshake:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence:inlay-request:1.9',
            file: 'src/lib/Setting/Pages/Advanced/InlayCompressButton.svelte',
            type: 'replace',
            anchor: "            const res = await fetch('/api/inlays/compress', {\n",
            content: "            const res = await clientBuildFetch('/api/inlays/compress', {\n",
            requires: ['client-build-fence:inlay-import:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence:server-import:1.9',
            file: 'server/node/server.cjs',
            type: 'insert',
            where: 'after',
            anchor: "const { createRequestLogs } = require('./request-logs.cjs');\n",
            content: "const { createClientBuildFence } = require('./clientBuildFence.cjs');\n",
            after: [
                'lazy-chat-sync:replace:server:node:server-cjs:1.9',
                'kei-backup-restore-safety-standard-adapter:server-helper-import:1.9',
                'kei-backup-restore-safety-lazy-adapter:server-helper-import:1.9',
            ],
            requires: ['client-build-fence:server-helper:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence:server-middleware:1.9',
            file: 'server/node/server.cjs',
            type: 'insert',
            where: 'after',
            anchor: "app.use(express.static(path.join(process.cwd(), 'dist'), {index: false, maxAge: 0}));\n",
            content: `const clientBuildFence = createClientBuildFence({
    distDir: path.join(process.cwd(), 'dist'),
});
app.use(clientBuildFence.middleware);
`,
            requires: ['client-build-fence:server-import:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence:server-session-advertise:1.9',
            file: 'server/node/server.cjs',
            type: 'replace',
            anchor: '    res.json({ ok: true })\n',
            content: '    res.json({ ok: true, build: clientBuildFence.expectedBuild ?? undefined })\n',
            requires: ['client-build-fence:server-middleware:1.9'],
            targetVersions: pocketRisu190,
        },
    ],
}
