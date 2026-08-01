'use strict'

const fs = require('node:fs')
const path = require('node:path')

const base = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'bg-preserve.json'),
    'utf8',
))

const pocketRisu181 = { pocketrisu: ['1.8.1'] }
const pocketRisu190 = { pocketrisu: ['1.9.0'] }

function replaceExact(source, anchor, replacement, label) {
    const count = source.split(anchor).length - 1
    if (count !== 1) {
        throw new Error(`${label}: expected one adapter anchor, found ${count}`)
    }
    return source.replace(anchor, replacement)
}

function adaptOwned(unit) {
    if (unit.file === 'server/node/bgOrchestrator.cjs') {
        const anchor = '    const db = JSON.parse(JSON.stringify(stripped)) // clone so we never mutate the live cache\n'
        const replacement = `${anchor}    // PocketRisu 1.9 model jobs are a client-path recovery authority. The detached\n    // BG owner already preserves the complete ax -> main -> post pipeline, so nesting a\n    // second server job here would create two terminal claim/recovery protocols. Keep the\n    // user setting untouched in the browser and disable it only in this cloned server run.\n    if (Object.prototype.hasOwnProperty.call(db, 'nodeOnlyServerSideRequests')) {\n      db.nodeOnlyServerSideRequests = false\n    }\n`
        return {
            ...unit,
            content: replaceExact(unit.content, anchor, replacement, `${unit.id}: native-job isolation`),
        }
    }
    if (unit.file === 'src/ts/bgStreamFetch.ts') {
        const anchor = `export function bindGenToActiveAbort(gen: string): void {
    if (!gen || !pendingChatAbort) return
    genAbortMap.set(gen, pendingChatAbort)
`
        const replacement = `export function bindGenToActiveAbort(gen: string, abort?: () => void): void {
    const activeAbort = abort ?? pendingChatAbort
    if (!gen || !activeAbort) return
    genAbortMap.set(gen, activeAbort)
`
        return {
            ...unit,
            content: replaceExact(unit.content, anchor, replacement, `${unit.id}: native abort binding`),
        }
    }
    return unit
}

function adaptUniversalUnit(unit) {
    if (unit.id === 'bg-preserve:hook:index-unified-busy-entry-guard') {
        return {
            ...unit,
            managed: replaceExact(
                unit.managed,
                '    const generationBusyAtEntry = get(doingChat)\n',
                '    const generationBusyAtEntry = get(unifiedDoingChat)\n',
                `${unit.id}: combined busy binding`,
            ),
        }
    }
    return unit
}

const variant190 = new Map([
    ['bg-preserve:hook:globalapi-fetch-impl-register', (unit) => ({
        ...unit,
        id: `${unit.id}:1.9`,
        anchor: 'export async function fetchNative(url: string, arg: FetchNativeArgs): Promise<Response> {',
        targetVersions: pocketRisu190,
    })],
    ['bg-preserve:hook:index-unified-generation-busy', (unit) => ({
        ...unit,
        id: `${unit.id}:1.9`,
        file: 'src/ts/process/generationState.ts',
        anchor: 'export const doingChat = writable(false)\n',
        managed: `/* BG-PRESERVE:START generation-busy-store-1.9 */
// Native per-chat generation state owns the client lease. Its public writable delegates
// into the BG coordinator so native sync/reset calls can release only the client side;
// a detached server orchestration keeps every combined subscriber busy until terminal.
export const doingChat = unifiedDoingChat
/* BG-PRESERVE:END */
`,
        markerNeedle: 'generation-busy-store-1.9',
        requires: ['bg-preserve:hook:index-unified-generation-busy-import:1.9'],
        after: undefined,
        targetVersions: pocketRisu190,
    })],
    ['bg-preserve:hook:index-register-gen-context', (unit) => ({
        ...unit,
        id: `${unit.id}:1.9`,
        anchor: '    const generationModel = getGenerationModelString()\n',
        managed: `    /* BG-PRESERVE:START generation-context-1.9 */
    // PocketRisu 1.9 mints generationId before chat/token resolution. Register only here,
    // after stable chat coordinates and token metadata exist, and bind the exact native
    // per-chat AbortController instead of the former screen-global callback.
    try {
        setBgGenContext(generationId, {
            charId: (currentChar as any)?.chaId,
            chatId: (currentChar as any)?.chats?.[(currentChar as any)?.chatPage]?.id,
            charName: (currentChar as any)?.name,
            inputTokens,
            outputTokens,
            maxContext: maxContextTokens,
        })
        bindGenToActiveAbort(generationId, () => abortGeneration(genKey))
    } catch { /* best-effort */ }
    /* BG-PRESERVE:END */
`,
        markerNeedle: 'generation-context-1.9',
        requires: ['bg-preserve:hook:index-register-gen-context-abort-import:1.9'],
        targetVersions: pocketRisu190,
    })],
    ['bg-preserve:hook:defaultchatscreen-composer-orchestrating-gate', (unit) => ({
        ...unit,
        id: `${unit.id}:1.9`,
        anchor: '                {#if currentChatGenerating || doingChatInputTranslate}',
        targetVersions: pocketRisu190,
    })],
    ['bg-preserve:hook:request-cache-authority-gate', (unit) => ({
        ...unit,
        id: `${unit.id}:1.9`,
        anchor: `    if (kind === 'google-gemini' && preset.promptCaching?.enabled && mode === 'model'
        && (caps?.includes('cache') ?? false)
        && !tools && !arg.previewBody
        && (cacheAuthKind === 'x-goog-api-key' || cacheAuthKind === 'google-service-account')) {
        const cacheChatKey = getCurrentChat()?.id
        if (cacheChatKey) {
            cache = {
                promptCaching: preset.promptCaching,
                chatKey: cacheChatKey,
                task: mode,
                presetId: preset.id,
                generationId: genId,
                // Always the direct proxied fetch, never the server-side job
                // fetch: a job is keyed to the chat (one at a time) and its
                // journal is replayed as a CHAT response at boot, so cache
                // housekeeping calls must not become jobs. Built without the
                // route reporter so a cachedContents call cannot relabel the
                // chat request's log entries.
                fetchImpl: makeProxiedFetch(arg.chatId),
            }
        }
    }
`,
        managed: `    /* BG-PRESERVE:START gemini-cache-authority-gate-1.9 */
    if (cacheRuntimeAuthority && kind === 'google-gemini' && preset.promptCaching?.enabled && mode === 'model'
        && (caps?.includes('cache') ?? false)
        && !tools && !arg.previewBody
        && (cacheAuthKind === 'x-goog-api-key' || cacheAuthKind === 'google-service-account')) {
        const cacheChatKey = getCurrentChat()?.id
        if (cacheChatKey) {
            cache = {
                promptCaching: preset.promptCaching,
                chatKey: cacheChatKey,
                task: mode,
                presetId: preset.id,
                generationId: genId,
                // Preserve native 1.9's cache-housekeeping route. It must bypass both
                // native model jobs and BG stream jobs so cache usage cannot be recovered
                // as a chat response or relabel the main request log.
                fetchImpl: makeProxiedFetch(arg.chatId),
            }
        }
    }
    /* BG-PRESERVE:END */
`,
        markerNeedle: 'gemini-cache-authority-gate-1.9',
        targetVersions: pocketRisu190,
    })],
    ['bg-preserve:hook:request-stream-cache-source-badge', (unit) => ({
        ...unit,
        id: `${unit.id}:1.9`,
        anchor: `                                if (cache && cachedTokens > 0) {
                                    addBadge(genId, { key: 'cache', text: language.requestStatus.cacheHit.replace('{n}', cachedTokens.toLocaleString()), tone: 'success' })
                                }
`,
        targetVersions: pocketRisu190,
    })],
    ['bg-preserve:hook:tokenizer-tikjs-catch-fallback', (unit) => ({
        ...unit,
        id: `${unit.id}:1.9`,
        anchor: '    return (await pending).encode(text)\n',
        targetVersions: pocketRisu190,
    })],
])

const target181Only = new Set([
    'bg-preserve:hook:app-svelte-safe-mobile-file-drop',
    'bg-preserve:hook:defaultchatscreen-import-abort',
    'bg-preserve:hook:defaultchatscreen-register-abort',
    'bg-preserve:hook:index-remove-legacy-busy-guard',
])

const variantIds = new Set(variant190.keys())

function expandRelations(unit) {
    const output = { ...unit }
    // Version siblings are mutually exclusive. Only optional ordering hints may
    // name both; hard requirements must keep naming one concrete active unit.
    for (const relation of ['after', 'before']) {
        if (!Array.isArray(output[relation])) continue
        output[relation] = [...new Set(output[relation].flatMap((id) =>
            variantIds.has(id) ? [id, `${id}:1.9`] : [id]
        ))]
    }
    return output
}

const units = base.units.flatMap((rawUnit) => {
    const unit = adaptUniversalUnit(adaptOwned(rawUnit))
    const create190 = variant190.get(unit.id)
    if (create190) {
        return [
            expandRelations({ ...unit, targetVersions: pocketRisu181 }),
            expandRelations(create190(unit)),
        ]
    }
    if (target181Only.has(unit.id)) {
        return [expandRelations({ ...unit, targetVersions: pocketRisu181 })]
    }
    return [expandRelations(unit)]
})

units.push(
    {
        id: 'bg-preserve:hook:index-unified-generation-busy-import:1.9',
        file: 'src/ts/process/generationState.ts',
        type: 'insert',
        where: 'after',
        anchor: 'import { derived, get, writable, type Readable } from "svelte/store"\n',
        content: 'import { doingChat as unifiedDoingChat } from "../generationBusy"\n',
        targetVersions: pocketRisu190,
    },
    {
        id: 'bg-preserve:hook:index-register-gen-context-abort-import:1.9',
        file: 'src/ts/process/index.svelte.ts',
        type: 'insert',
        where: 'after',
        anchor: 'import { chatGenKey, chatProcessStage, endGeneration, isChatGenerating, setGenerationStage, startGeneration } from "./generationState";\n',
        content: 'import { abortGeneration } from "./generationState";\n',
        targetVersions: pocketRisu190,
    },
)

module.exports = {
    ...base,
    version: 'v1.0.1-patcher.1',
    source: 'bg-preserve-install.cjs + PocketRisu 1.9 authority adapter',
    targets: {
        pocketrisu: {
            verified: ['1.8.1', '1.9.0'],
            reviewing: [],
        },
    },
    units,
}
