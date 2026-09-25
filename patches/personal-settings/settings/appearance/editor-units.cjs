'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { owned } = require('../../manifest-helpers.cjs')
const targetVersions = { pocketrisu: ['1.10.0'] }
// Narrow additions run after optional full replacements and their adapters.
const globalOwners = [
    "bg-preserve:hook:globalapi-durable-save-api",
    "bg-preserve:hook:globalapi-durable-save-outcome",
    "bg-preserve:hook:globalapi-durable-save-rethrow",
    "bg-preserve:hook:globalapi-durable-save-impl",
    "bg-preserve:hook:globalapi-fetch-impl-register:1.9",
    "bg-preserve:hook:globalapi-fetchnative-bgsubkey-arg",
    "bg-preserve:hook:globalapi-gemini-main-branch",
    "client-build-fence:global-import:1.9",
    "client-build-fence:global-dirty-probe:1.9",
    "client-build-fence:global-flush:1.9",
    "client-build-fence:global-proxy-stream-cancel:1.9",
    "client-build-fence:global-proxy-stream-abort:1.9",
    "lazy-chat-sync:replace:src:ts:globalApi-svelte-ts:1.10",
    "lazy-chat-bg-adapter:global-import",
    "lazy-chat-bg-adapter:durable-flush",
    "haejeok-persistence-safety-adapter:durable-save-plugin-scope",
    "haejeok-persistence-safety-adapter:durable-chat-payload-api",
    "haejeok-persistence-safety-adapter:durable-save-plugin-enlistment",
    "haejeok-persistence-safety-adapter:durable-chat-payload-impl",
    "persona-organizer:uncleanable-gallery-assets",
    "persona-organizer:uncleanable-folder-assets",
    "persona-organizer:replace-gallery-assets"
]
const storageOwners = [
    "bg-preserve-storage-base:asset-upload-retry-import",
    "bg-preserve-storage-base:adaptive-asset-upload-retry",
    "bg-preserve-storage-base:asset-upload-error-detail",
    "client-build-fence:node-storage-import:1.9",
    "client-build-fence:node-session-fetch:1.9",
    "client-build-fence:node-session-accept:1.9",
    "client-build-fence:node-auth-fetch:1.9",
    "client-build-fence:node-migration-xhr-header:1.9",
    "client-build-fence:node-migration-xhr-response:1.9",
    "client-build-fence-kei-lazy-storage-adapter:backup-xhr-header:1.9",
    "client-build-fence-kei-lazy-storage-adapter:backup-xhr-response:1.9",
    "startup-cache:node-imports",
    "startup-cache:node-constants",
    "startup-cache:node-result-interface",
    "startup-cache:node-cache-field",
    "startup-cache:node-startup-methods",
    "startup-cache:node-full-write-invalidate",
    "startup-cache:node-read-etag",
    "startup-cache:node-fresh-read",
    "startup-cache:node-patch-previous-etag",
    "startup-cache:node-patch-journal",
    "lazy-chat-sync:replace:src:ts:storage:nodeStorage-ts:1.10",
    "lazy-chat-bg-adapter:asset-upload-retry-import",
    "lazy-chat-bg-adapter:adaptive-asset-upload-retry",
    "lazy-chat-bg-adapter:asset-upload-error-detail",
    "kei-backup-restore-safety-standard-adapter:node-safety-import:1.9",
    "kei-backup-restore-safety-standard-adapter:node-local-option:1.9",
    "kei-backup-restore-safety-standard-adapter:node-local-header:1.9",
    "kei-backup-restore-safety-standard-adapter:node-local-error-state:1.9",
    "kei-backup-restore-safety-standard-adapter:node-local-error-parse:1.9",
    "kei-backup-restore-safety-standard-adapter:node-local-http-error:1.9",
    "kei-backup-restore-safety-standard-adapter:node-local-stream-error:1.9",
    "kei-backup-restore-safety-standard-adapter:node-server-option:1.9",
    "kei-backup-restore-safety-standard-adapter:node-server-header:1.9",
    "kei-backup-restore-safety-standard-adapter:node-server-http-error:1.9",
    "kei-backup-restore-safety-standard-adapter:node-server-stream-error:1.9",
    "kei-backup-restore-safety-lazy-adapter:node-safety-import:1.9",
    "kei-backup-restore-safety-lazy-adapter:node-local-option:1.9",
    "kei-backup-restore-safety-lazy-adapter:node-local-header:1.9",
    "kei-backup-restore-safety-lazy-adapter:node-local-error-state:1.9",
    "kei-backup-restore-safety-lazy-adapter:node-local-error-parse:1.9",
    "kei-backup-restore-safety-lazy-adapter:node-local-http-error:1.9",
    "kei-backup-restore-safety-lazy-adapter:node-local-stream-error:1.9",
    "kei-backup-restore-safety-lazy-adapter:node-server-option:1.9",
    "kei-backup-restore-safety-lazy-adapter:node-server-header:1.9",
    "kei-backup-restore-safety-lazy-adapter:node-server-http-error:1.9",
    "kei-backup-restore-safety-lazy-adapter:node-server-stream-error:1.9"
]
const serverOwners = [
    "bg-preserve:hook:server-cjs-stream-reader-import",
    "bg-preserve:hook:server-cjs-explicit-stream-reader",
    "bg-preserve:hook:server-cjs-proxy-client-close",
    "bg-preserve:hook:server-cjs-proxy-get-client-close",
    "bg-preserve:hook:server-cjs-proxy-response-pipeline",
    "bg-preserve:hook:server-cjs-proxy-get-response-pipeline",
    "bg-preserve:hook:server-cjs-cleanup-missing-stream-cancel",
    "bg-preserve:hook:server-cjs-mark-user-stream-cancel",
    "bg-preserve:hook:server-cjs-register-routes:1.9",
    "client-build-fence:server-import:1.9",
    "client-build-fence:server-middleware:1.9",
    "client-build-fence:server-session-advertise:1.9",
    "server-backup-snapshot-standard-adapter:server-db-reader:1.9",
    "server-backup-snapshot-standard-adapter:server-helper-import:1.9",
    "server-backup-snapshot-standard-adapter:server-source-lifecycle:1.9",
    "server-backup-snapshot-standard-adapter:cold-storage-reader:1.9",
    "server-backup-snapshot-standard-adapter:settings-and-download-export:1.9",
    "server-backup-snapshot-standard-adapter:server-save-export:1.9",
    "server-backup-snapshot-standard-adapter:compression-storage-queue:1.9",
    "server-backup-snapshot-standard-adapter:maintenance-gate:1.10",
    "server-backup-snapshot-standard-adapter:startup-pin-sweep:1.10",
    "server-backup-snapshot-lazy-adapter:server-db-reader:1.9",
    "server-backup-snapshot-lazy-adapter:server-helper-import:1.9",
    "server-backup-snapshot-lazy-adapter:server-source-lifecycle:1.9",
    "server-backup-snapshot-lazy-adapter:cold-storage-reader:1.9",
    "server-backup-snapshot-lazy-adapter:settings-and-download-export:1.9",
    "server-backup-snapshot-lazy-adapter:server-save-export:1.9",
    "server-backup-snapshot-lazy-adapter:compression-storage-queue:1.9",
    "server-backup-snapshot-lazy-adapter:maintenance-gate:1.10",
    "server-backup-snapshot-lazy-adapter:startup-pin-sweep:1.10",
    "startup-cache:server-encoded-field",
    "startup-cache:server-read-fast-path",
    "startup-cache:server-cache-read",
    "startup-cache:server-cache-full-write",
    "startup-cache:server-cache-patch",
    "lazy-chat-sync:replace:server:node:server-cjs:1.10",
    "persona-organizer:server-gallery-assets-1.10",
    "kei-backup-restore-safety-standard-adapter:server-helper-import:1.9",
    "kei-backup-restore-safety-standard-adapter:snapshot-protected-rotation:1.9",
    "kei-backup-restore-safety-standard-adapter:snapshot-force-new:1.9",
    "kei-backup-restore-safety-standard-adapter:flush-without-automatic-snapshot:1.9",
    "kei-backup-restore-safety-standard-adapter:flush-snapshot-gate:1.9",
    "kei-backup-restore-safety-standard-adapter:import-option:1.9",
    "kei-backup-restore-safety-standard-adapter:import-fresh-snapshot:1.9",
    "kei-backup-restore-safety-standard-adapter:local-import-route-option:1.9",
    "kei-backup-restore-safety-standard-adapter:local-import-json-option:1.9",
    "kei-backup-restore-safety-standard-adapter:local-import-error-code:1.9",
    "kei-backup-restore-safety-standard-adapter:server-restore-deferred-stream:1.9",
    "kei-backup-restore-safety-standard-adapter:server-restore-route-option:1.9",
    "kei-backup-restore-safety-standard-adapter:server-restore-error-code:1.9",
    "kei-backup-restore-safety-standard-adapter:snapshot-restore-fresh-snapshot:1.9",
    "kei-backup-restore-safety-standard-adapter:snapshot-restore-post-copy-rotation:1.9",
    "kei-backup-restore-safety-standard-adapter:snapshot-restore-error-code:1.9",
    "kei-backup-restore-safety-lazy-adapter:server-helper-import:1.9",
    "kei-backup-restore-safety-lazy-adapter:snapshot-protected-rotation:1.9",
    "kei-backup-restore-safety-lazy-adapter:snapshot-force-new:1.9",
    "kei-backup-restore-safety-lazy-adapter:flush-without-automatic-snapshot:1.9",
    "kei-backup-restore-safety-lazy-adapter:flush-snapshot-gate:1.9",
    "kei-backup-restore-safety-lazy-adapter:import-option:1.9",
    "kei-backup-restore-safety-lazy-adapter:import-fresh-snapshot:1.9",
    "kei-backup-restore-safety-lazy-adapter:local-import-route-option:1.9",
    "kei-backup-restore-safety-lazy-adapter:local-import-json-option:1.9",
    "kei-backup-restore-safety-lazy-adapter:local-import-error-code:1.9",
    "kei-backup-restore-safety-lazy-adapter:server-restore-deferred-stream:1.9",
    "kei-backup-restore-safety-lazy-adapter:server-restore-route-option:1.9",
    "kei-backup-restore-safety-lazy-adapter:server-restore-error-code:1.9",
    "kei-backup-restore-safety-lazy-adapter:snapshot-restore-fresh-snapshot:1.9",
    "kei-backup-restore-safety-lazy-adapter:snapshot-restore-post-copy-rotation:1.9",
    "kei-backup-restore-safety-lazy-adapter:snapshot-restore-post-commit-rotation:1.9",
    "kei-backup-restore-safety-lazy-adapter:snapshot-restore-error-code:1.9",
    "pagefold-model-preset:server-binary-body-limit:1.10",
    "pagefold-model-preset:server-render-route-registration:1.10"
]
const chatOwners = [
    "bg-preserve:hook:defaultchatscreen-import-orchestrating",
    "bg-preserve:hook:defaultchatscreen-sendmain-orchestrating-gate",
    "bg-preserve:hook:defaultchatscreen-reroll-orchestrating-gate",
    "bg-preserve:hook:defaultchatscreen-unreroll-orchestrating-gate",
    "bg-preserve:hook:defaultchatscreen-suppress-abort-alert",
    "bg-preserve:hook:defaultchatscreen-terminal-completion-sound",
    "bg-preserve:hook:defaultchatscreen-cancel-server-orchestration",
    "bg-preserve:hook:defaultchatscreen-blank-message-a11y-button",
    "bg-preserve:hook:defaultchatscreen-sticker-a11y-button",
    "bg-preserve:hook:defaultchatscreen-composer-orchestrating-gate:1.9",
    "bg-preserve:hook:defaultchatscreen-reroll-blocking-call",
    "bg-preserve:hook:defaultchatscreen-sendchatmain-nobgorch-arg",
    "bg-preserve:hook:defaultchatscreen-forward-nobgorch",
    "client-build-fence:composer-import:1.9",
    "client-build-fence:composer-dirty-state:1.9",
    "lazy-chat-sync:chat-missing-payload-notice",
    "haejeok-persistence-safety-adapter:chat-helper-import",
    "haejeok-persistence-safety-adapter:chat-durable-save-import",
    "haejeok-persistence-safety-adapter:chat-append-state",
    "haejeok-persistence-safety-adapter:chat-say-nothing-append",
    "haejeok-persistence-safety-adapter:chat-character-append",
    "haejeok-persistence-safety-adapter:chat-group-append",
    "haejeok-persistence-safety-adapter:chat-save-before-generation",
    "personal-settings:appearance-composer-hook-1.9",
    "personal-settings:appearance-chat-render-imports-1.9",
    "personal-settings:appearance-send-icon-render-1.9",
    "haejeok-chat-width-adapter:default-chat-import:1.10",
    "haejeok-chat-width-adapter:composer-class:1.10",
    "haejeok-chat-width-adapter:default-chat-root-class:1.10",
    "kei-chat-render-base-adapter:default-chat-generation-state:1.9",
    "kei-chat-render-bg-adapter:default-chat-generation-state:1.9",
    "kei-partial-edit-base-adapter:default-chat-import:1.9",
    "kei-partial-edit-base-adapter:default-chat-root-state:1.9",
    "kei-partial-edit-base-adapter:default-chat-root-binding:1.9",
    "kei-partial-edit-base-adapter:default-chat-manager:1.9",
    "kei-partial-edit-bg-adapter:default-chat-import:1.9",
    "kei-partial-edit-bg-adapter:default-chat-root-state:1.9",
    "kei-partial-edit-bg-adapter:default-chat-root-binding:1.9",
    "kei-partial-edit-bg-adapter:default-chat-manager:1.9"
]
const units = []
for (const [file, owner] of [
    ['src/ts/personalSettings/appearance.ts', 'appearance-logic-1.9'],
    ['src/styles/personal-appearance.css', 'appearance-css-1.9'],
    ['src/lib/Setting/Pages/PersonalSettings/AppearanceSettings.svelte', 'appearance-section-1.9'],
    ['src/lib/Others/PersonalAppearanceRuntime.svelte', 'appearance-runtime-component-1.9'],
]) {
    units.push({ id: `personal-settings:editor-replace-${owner}`, file, type: 'replace',
        anchor: owned(__dirname, file), managed: fs.readFileSync(path.join(__dirname, 'editor-files', file), 'utf8'),
        requires: [`personal-settings:${owner}`], targetVersions })
}
function insert(id, file, anchor, content, after = [], where = 'before') {
    const fullId = `personal-settings:editor-${id}`
    const payload = file.endsWith('.svelte')
        ? { managed: `<!-- POCKETRISU-PATCH:${fullId}:START -->\n${content}<!-- POCKETRISU-PATCH:${fullId}:END -->\n`, markerNeedle: `POCKETRISU-PATCH:${fullId}:START` }
        : { content }
    units.push({ id: fullId, file, type: 'insert', anchor, ...payload, where, after, targetVersions })
}
for (const file of [
    'appearanceValues.ts', 'cssToggleDefinitions.ts', 'cssToggles.ts', 'cssToggleRuntime.ts', 'cssEditorText.ts', 'cssEditorText.test.ts', 'displaySize.ts', 'appearanceNotices.ts', 'appearanceNotices.test.ts',
    'customFonts.ts', 'customFontRuntime.ts', 'fontBytes.ts', 'appearancePersistence.ts', 'appearanceEditor.ts',
    'appearancePersistence.test.ts', 'personalAssets.test.ts',
    'cssToggles.test.ts', 'cssToggleRuntime.test.ts', 'customFonts.test.ts', 'customFontRuntime.test.ts',
]) {
    const relative = `src/ts/personalSettings/${file}`
    units.push({ id: `personal-settings:editor-owned-${file.replaceAll('.', '-')}`, file: relative, type: 'owned', content: owned(__dirname, relative), targetVersions })
}
for (const file of ['CssToggleManager.svelte', 'CustomFontManager.svelte', 'FontNamePreview.svelte', 'CssRecoveryNotice.svelte', 'AppearanceNotifications.svelte', 'AppearanceToast.svelte']) {
    const relative = `src/lib/Setting/Pages/PersonalSettings/${file}`
    units.push({ id: `personal-settings:editor-owned-${file}`, file: relative, type: 'owned', content: owned(__dirname, relative), targetVersions })
}
insert('save-import', 'src/ts/globalApi.svelte.ts', 'export const forageStorage = new AutoStorage()',
    'import { registerAppearanceWriter, appearanceSaveFailure } from "./personalSettings/appearancePersistence";\n\n', globalOwners)
units.push({
    id: 'personal-settings:editor-defer-full-buffer', file: 'src/ts/globalApi.svelte.ts', type: 'replace', targetVersions,
    after: globalOwners,
    anchor: `        await encoder.set(db, safeStructuredClone(toSave))
        const encoded = encoder.encode()
        if (!encoded) {
            await sleep(1000)
            return 'noop'
        }
        const dbData = new Uint8Array(encoded)
`,
    managed: `        const personalPatchOnly = supportsPatchSync && (options as any)?.personalStrict && !options?.forceFullWrite
        // Root blocks are rebuilt on every ordinary/full save. Preserve updates
        // to independently tracked blocks before consuming their dirty flags.
        if (!personalPatchOnly || toSave.botPreset || toSave.modules || toSave.plugins || toSave.pluginCustomStorage || toSave.character.length || toSave.chat.length) {
            await encoder.set(db, safeStructuredClone(toSave))
        }
        let dbData: Uint8Array | undefined
        if (!personalPatchOnly) {
            const encoded = encoder.encode()
            if (!encoded) {
                await sleep(1000)
                return 'noop'
            }
            dbData = new Uint8Array(encoded)
        }
`,
})
insert('save-registration', 'src/ts/globalApi.svelte.ts', '    requestImmediateSaveImpl = async (options) => {\n',
    fs.readFileSync(path.join(__dirname, 'strict-save.txt'), 'utf8'), ['personal-settings:editor-save-import'])
insert('patch-refusal', 'src/ts/globalApi.svelte.ts', '                saved = patchResult.success\n',
    `                if ((options as any)?.personalStrict && (!patchResult.success || patchResult.persistWarning)) {
                    throw appearanceSaveFailure(!(patchResult as any).conflict && !(patchResult as any).validationRejected && !(patchResult as any).chatGuardRejected)
                }
`, ['personal-settings:editor-save-registration'])
insert('no-full-fallback', 'src/ts/globalApi.svelte.ts', '        if (!saved) {\n',
    '        if ((options as any)?.personalStrict && !saved && supportsPatchSync) throw appearanceSaveFailure(false)\n', ['personal-settings:editor-patch-refusal'])
insert('full-buffer-required', 'src/ts/globalApi.svelte.ts', '        if (!saved) {\n',
    '            if (!dbData) throw appearanceSaveFailure(false)\n',
    ['personal-settings:editor-defer-full-buffer', 'personal-settings:editor-no-full-fallback'], 'after')
insert('no-conflict-rebase', 'src/ts/globalApi.svelte.ts', '                if (conflictErr instanceof ConflictError) {\n',
    '                if ((options as any)?.personalStrict && conflictErr instanceof ConflictError) throw appearanceSaveFailure(false)\n', ['personal-settings:editor-no-full-fallback'])
insert('full-write-etag', 'src/ts/globalApi.svelte.ts', '                const currentEtag = forageStorage.getDbEtag()\n',
    '                if ((options as any)?.personalStrict && !currentEtag) throw appearanceSaveFailure(false)\n',
    ['personal-settings:editor-no-conflict-rebase'], 'after')
insert('font-stream-import', 'src/ts/storage/nodeStorage.ts', 'export class NodeStorage',
    'import { readFontStream } from "../personalSettings/fontBytes";\n\n', storageOwners)
insert('flush', 'src/ts/storage/nodeStorage.ts', '    async patchItem(key: string, patchData: { patch: any[], expectedHash: string }): Promise<PatchItemResult> {\n',
    `    async readPersonalFont(key: string, maximumBytes: number): Promise<Uint8Array> {
        const response = await this.authFetch('/api/read', {
            method: 'GET', headers: { 'file-path': Buffer.from(key, 'utf-8').toString('hex') },
        })
        if (!response.ok || !response.body) throw new Error('Font asset read failed')
        return readFontStream(response.body, maximumBytes)
    }

    async flushPersonalAppearance(): Promise<void> {
        const response = await this.authFetch('/api/db/flush', { method: 'POST' })
        if (!response.ok) throw new Error('Appearance flush was not acknowledged')
        const body = await response.json()
        if (body.success !== true) throw new Error('Appearance flush was not acknowledged')
    }

`, storageOwners)
// Retain this passive compatibility surface if editor UI is rolled back.
insert('asset-references-client', 'src/ts/globalApi.svelte.ts', '    addUncleanable(db.customBackground);\n',
    `    const personalAssetStack: unknown[] = [db.pocketRisuPersonalSettings]
    const personalAssetSeen = new Set<object>()
    while (personalAssetStack.length) {
        const value = personalAssetStack.pop()
        if (typeof value === 'string') {
            if (value.startsWith('assets/')) addUncleanable(value)
            for (const match of value.matchAll(/assets[/\\\\][^\\s"'<>()[\\]{};,]+/g)) addUncleanable(match[0])
        } else if (value && typeof value === 'object' && !personalAssetSeen.has(value)) {
            personalAssetSeen.add(value)
            for (const child of Object.values(value)) personalAssetStack.push(child)
        }
    }
`, ['personal-settings:editor-no-conflict-rebase'])
insert('asset-remap', 'src/ts/globalApi.svelte.ts', '    db.customBackground = replaceData(db.customBackground);\n',
    `    const personalRemapStack: unknown[] = [db.pocketRisuPersonalSettings]
    const personalRemapSeen = new Set<object>()
    while (personalRemapStack.length) {
        const value = personalRemapStack.pop()
        if (!value || typeof value !== 'object' || personalRemapSeen.has(value)) continue
        personalRemapSeen.add(value)
        for (const key of Object.keys(value)) {
            const item = (value as any)[key]
            if (typeof item === 'string' && item.startsWith('assets/') && Object.hasOwn(replacer, item)) (value as any)[key] = replacer[item]
            else if (item && typeof item === 'object') personalRemapStack.push(item)
        }
    }
`, ['personal-settings:editor-asset-references-client'])
insert('asset-references-server', 'server/node/server.cjs', '    add(dbObj.customBackground);',
    `    const personalAssetStack = [dbObj.pocketRisuPersonalSettings];
    const personalAssetSeen = new Set();
    while (personalAssetStack.length) {
        const value = personalAssetStack.pop();
        if (typeof value === 'string') {
            if (value.startsWith('assets/')) add(value);
            for (const match of value.matchAll(/assets[/\\\\][^\\s"'<>()[\\]{};,]+/g)) add(match[0]);
        } else if (value && typeof value === 'object' && !personalAssetSeen.has(value)) {
            personalAssetSeen.add(value);
            for (const child of Object.values(value)) personalAssetStack.push(child);
        }
    }
`, serverOwners)

const appearanceUnits = require('./units.cjs')
for (const [suffix, content] of [
    ['send-icon-render', `                            <span data-personal-send-default aria-hidden="true"><Send size={18} /></span>
                            <span data-personal-send-text class="personal-send-glyph" aria-hidden="true"></span>
`],
    ['jailbreak-render-first', '        {#if hasJailbreakPrompt}\n        <div data-personal-jailbreak>\n'],
    ['jailbreak-render-second', '    {#if hasJailbreakPrompt}\n    <div data-personal-jailbreak>\n'],
]) {
    const old = appearanceUnits.find(u => u.id === `personal-settings:appearance-${suffix}-1.9`)
    units.push({ id: `personal-settings:editor-hook-${suffix}`, file: old.file, type: 'replace',
        anchor: old.managed, managed: `<!-- POCKETRISU-PATCH:personal-settings:editor-hook-${suffix}:START -->\n${content}<!-- POCKETRISU-PATCH:personal-settings:editor-hook-${suffix}:END -->\n`,
        markerNeedle: `POCKETRISU-PATCH:personal-settings:editor-hook-${suffix}:START`, requires: [old.id], after: suffix === 'send-icon-render' ? chatOwners : appearanceUnits.filter(u => u.file === old.file).map(u => u.id), targetVersions })
}
insert('jailbreak-first-close', 'src/lib/SideBars/Toggles.svelte', '        {/if}\n        {@render toggles(groupedToggles, true)}',
    '        </div>\n', ['personal-settings:editor-hook-jailbreak-render-first'])
insert('jailbreak-second-close', 'src/lib/SideBars/Toggles.svelte', '    {/if}\n    {@render toggles(groupedToggles)}',
    '    </div>\n', ['personal-settings:editor-hook-jailbreak-render-second', 'personal-settings:editor-jailbreak-first-close'])

const previousByHost = new Map()
units.push({
    id: 'personal-settings:editor-root-dom-test',
    file: 'src/ts/personalSettings/appearance.test.ts', type: 'replace',
    anchor: `        const attributes = new Map<string, string>([[PERSONAL_APPEARANCE_ATTRIBUTE, 'stale']])
        const root = {
            hasAttribute: (name: string) => attributes.has(name),
            getAttribute: (name: string) => attributes.get(name) ?? null,
            setAttribute: (name: string, value: string) => attributes.set(name, value),
            removeAttribute: (name: string) => attributes.delete(name),
        } as unknown as HTMLElement

        syncPersonalAppearance(db(), false, root)
        expect(attributes.has(PERSONAL_APPEARANCE_ATTRIBUTE)).toBe(false)`,
    content: `        const root = document.documentElement
        root.setAttribute(PERSONAL_APPEARANCE_ATTRIBUTE, 'stale')
        syncPersonalAppearance(db(), false, root)
        expect(root.hasAttribute(PERSONAL_APPEARANCE_ATTRIBUTE)).toBe(false)`,
    requires: ['personal-settings:appearance-logic-tests-1.9'], targetVersions,
})
units.push({
    id: 'personal-settings:editor-theme-independent-test',
    file: 'src/ts/personalSettings/appearance.test.ts', type: 'replace',
    anchor: `    test('Safe Mode, master off, and unsupported themes remove all effects', () => {
        const value = enabledDb()
        expect(resolvePersonalAppearanceTokens(value, true)).toEqual([])
        ;(value as any).theme = 'waifu'
        expect(resolvePersonalAppearanceTokens(value, false)).toEqual([])`,
    content: `    test('Safe Mode and master off remove all effects under every theme', () => {
        const value = enabledDb()
        expect(resolvePersonalAppearanceTokens(value, true)).toEqual([])
        ;(value as any).theme = 'waifu'
        expect(resolvePersonalAppearanceTokens(value, false)).not.toEqual([])
        expect(resolvePersonalAppearanceTokens(value, true)).toEqual([])`,
    requires: ['personal-settings:appearance-logic-tests-1.9'], targetVersions,
})
for (const unit of units) {
    const previous = previousByHost.get(unit.file)
    if (previous) unit.after = [...(unit.after ?? []), previous]
    previousByHost.set(unit.file, unit.id)
}
module.exports = units
