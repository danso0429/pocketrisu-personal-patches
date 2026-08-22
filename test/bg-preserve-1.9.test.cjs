'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const manifest = require('../patches/bg-preserve/manifest.cjs')
const {
    PatchCompositionError,
    applyUnit,
    revertUnit,
} = require('../src/compose.cjs')
const { unitMatchesTarget } = require('../src/manager.cjs')

const target181 = { packageName: 'pocketrisu', packageVersion: '1.8.1' }
const target190 = { packageName: 'pocketrisu', packageVersion: '1.9.0' }

function active(target) {
    return manifest.units.filter((unit) => unitMatchesTarget(unit, target))
}

function unit(id) {
    const found = manifest.units.find((candidate) => candidate.id === id)
    assert.ok(found, `missing unit ${id}`)
    return found
}

function owned(file) {
    const found = manifest.units.find((candidate) =>
        candidate.type === 'owned' && candidate.file === file
    )
    assert.ok(found, `missing owned file ${file}`)
    return found.content
}

test('BG pack keeps exact 1.8 support and verifies its target-scoped 1.9 graph', () => {
    assert.equal(manifest.id, 'bg-preserve')
    assert.equal(manifest.version, 'v1.0.1-patcher.8')
    assert.deepEqual(manifest.targets, {
        pocketrisu: {
            verified: ['1.8.1', '1.9.0'],
            reviewing: [],
        },
    })
    assert.equal(active(target181).some((candidate) => candidate.id.endsWith(':1.9')), false)
    assert.equal(active(target190).some((candidate) => candidate.id.endsWith(':1.9')), true)
})

test('1.9 drops upstream-equivalent or obsolete host hooks', () => {
    const ids190 = new Set(active(target190).map((candidate) => candidate.id))
    for (const id of [
        'bg-preserve:hook:app-svelte-safe-mobile-file-drop',
        'bg-preserve:hook:defaultchatscreen-import-abort',
        'bg-preserve:hook:defaultchatscreen-register-abort',
        'bg-preserve:hook:index-remove-legacy-busy-guard',
    ]) {
        assert.equal(ids190.has(id), false, id)
        assert.equal(active(target181).some((candidate) => candidate.id === id), true, id)
    }
})

test('1.9 native generation state delegates only its client lease to BG busy state', () => {
    const importUnit = unit('bg-preserve:hook:index-unified-generation-busy-import:1.9')
    const storeUnit = unit('bg-preserve:hook:index-unified-generation-busy:1.9')
    assert.deepEqual(importUnit.targetVersions, { pocketrisu: ['1.9.0'] })
    assert.equal(storeUnit.file, 'src/ts/process/generationState.ts')
    assert.match(importUnit.content, /doingChat as unifiedDoingChat/)
    assert.match(storeUnit.managed, /export const doingChat = unifiedDoingChat/)
    assert.deepEqual(storeUnit.requires, [importUnit.id])

    const guard = unit('bg-preserve:hook:index-unified-busy-entry-guard')
    assert.match(guard.managed, /get\(unifiedDoingChat\)/)
    assert.doesNotMatch(guard.managed, /get\(doingChat\)/)
})

test('direct browser and server sendChat callers close the exact native lifecycle', () => {
    const lifecycle = unit('bg-preserve:hook:generation-state-direct-lifecycle:1.9')
    const lifecycleImport = unit('bg-preserve:hook:index-direct-send-lifecycle-import:1.9')
    const lifecycleWrapper = unit('bg-preserve:hook:index-direct-send-lifecycle-wrapper:1.9')
    const lifecycleTest = unit('bg-preserve:owned:src/ts/process/directGenerationLifecycle.test.ts:1.9')
    const browser = unit('bg-preserve:owned:src/ts/bgOrchestrate.ts:1.9').content
    const server = unit('bg-preserve:owned:server/node/bgOrchestrator.cjs:1.9').content

    assert.match(lifecycle.content, /if \(isChatGenerating\(chatKey\)\) return false/)
    assert.match(lifecycle.content, /endGeneration\(chatKey\)/)
    assert.match(lifecycle.content, /chatProcessStage\.set\(0\)/)
    assert.match(lifecycle.content, /endGenerationIfOwned/)
    assert.match(lifecycleWrapper.content, /sendChatWithDirectLifecycle/)
    assert.match(lifecycleWrapper.content, /clearPendingSend\(chatId\)/)
    assert.deepEqual(lifecycleImport.after, [
        'bg-preserve:hook:index-register-gen-context-abort-import:1.9',
    ])
    assert.deepEqual(lifecycleWrapper.requires, [lifecycleImport.id, lifecycle.id])
    assert.deepEqual(lifecycleTest.requires, [lifecycle.id])
    assert.match(lifecycleTest.content, /preserving another background owner/)
    assert.match(lifecycleTest.content, /does not run or reset cleanup/)
    assert.match(lifecycleTest.content, /releases only the exact preparation owner/)

    assert.match(browser, /sendChatWithDirectLifecycle\(key\.chatId, -1/)
    assert.doesNotMatch(browser, /\(\) => sendChat\(-1, \{ \.\.\.arg, bgOrchFallback: true \}\)/)
    assert.match(server, /sendChatWithDirectLifecycle\(selectedChatId, -1/)
    assert.match(server, /sendChatWithDirectLifecycle\(selectedChatId, charIdx, \{ previewLLM: true/)
    assert.match(server, /sendChatWithDirectLifecycle\(selectedChatId, charIdx, \{ preview: true \}\)/)
    assert.doesNotMatch(server, /idx\.doingChat\.set\(false\)/)

    assert.match(browser, /startGeneration\(preparationKey, operationId\)/)
    assert.match(browser, /endGenerationIfOwned\(/)
    assert.equal((browser.match(/releasePreparationOwner\(\)/g) || []).length, 4)
    const handoffStart = browser.indexOf('setServerGenerationBusy(true)', browser.indexOf('writePendingMarker('))
    const handoffRelease = browser.indexOf('releasePreparationOwner()', handoffStart)
    assert.ok(handoffStart >= 0 && handoffRelease > handoffStart)
    assert.doesNotMatch(
        browser.slice(browser.indexOf('export async function runServerOrchestratedChat(')),
        /doingChat\.set\((?:true|false)\)/,
    )

    const stateBaseline = `${lifecycle.anchor}\nexport function syncDoingChat(): void {}\n`
    const stateApplied = applyUnit(stateBaseline, lifecycle)
    assert.equal(applyUnit(stateApplied, lifecycle), stateApplied)
    assert.equal(revertUnit(stateApplied, lifecycle), stateBaseline)

    const indexBaseline = `${lifecycleWrapper.anchor}    return false\n}\n`
    const indexApplied = applyUnit(indexBaseline, lifecycleWrapper)
    assert.equal(applyUnit(indexApplied, lifecycleWrapper), indexApplied)
    assert.equal(revertUnit(indexApplied, lifecycleWrapper), indexBaseline)
})

test('1.9 context registration occurs after token resolution and binds native per-chat abort', () => {
    const context = unit('bg-preserve:hook:index-register-gen-context:1.9')
    assert.equal(context.anchor, '    const generationModel = getGenerationModelString()\n')
    assert.match(context.managed, /inputTokens,/)
    assert.match(context.managed, /outputTokens,/)
    assert.match(context.managed, /maxContext: maxContextTokens/)
    assert.match(context.managed, /abortGeneration\(genKey\)/)
    assert.deepEqual(context.requires, [
        'bg-preserve:hook:index-register-gen-context-abort-import:1.9',
    ])

    const streamFetch = owned('src/ts/bgStreamFetch.ts')
    assert.match(streamFetch, /bindGenToActiveAbort\(gen: string, abort\?: \(\) => void\)/)
    assert.match(streamFetch, /const activeAbort = abort \?\? pendingChatAbort/)
})

test('detached BG server disables nested native jobs without changing the client setting', () => {
    const server = owned('server/node/bgOrchestrator.cjs')
    assert.match(server, /hasOwnProperty\.call\(db, 'nodeOnlyServerSideRequests'\)/)
    assert.match(server, /db\.nodeOnlyServerSideRequests = false/)
    assert.doesNotMatch(server, /DBState\.db\.nodeOnlyServerSideRequests\s*=/)

    const redirect = unit('bg-preserve:hook:index-orchestrate-redirect')
    assert.match(redirect.managed, /runServerOrchestratedChat/)
    assert.match(redirect.managed, /!arg\.noBgOrch/)
    assert.match(redirect.managed, /requiresClientGenerationEpilogue/)
})

test('1.9 cache and composer adapters retain native target contracts', () => {
    const cache = unit('bg-preserve:hook:request-cache-authority-gate:1.9')
    assert.match(cache.managed, /cacheRuntimeAuthority &&/)
    assert.match(cache.managed, /fetchImpl: makeProxiedFetch\(arg\.chatId\)/)

    const composer = unit('bg-preserve:hook:defaultchatscreen-composer-orchestrating-gate:1.9')
    assert.equal(
        composer.anchor,
        '                {#if currentChatGenerating || doingChatInputTranslate',
    )
    assert.equal(composer.where, 'after')
    assert.equal(composer.anchorPolicy, 'first')
    assert.equal(composer.anchor.endsWith('}'), false)
    assert.match(composer.managed, /\$orchestrating/)

    const baseline = `${composer.anchor}}\n                    <button />\n`
    const applied = applyUnit(baseline, composer)
    assert.equal(
        applied,
        `${composer.anchor}${composer.managed}}\n                    <button />\n`,
    )
    assert.match(
        applied,
        /\{#if currentChatGenerating \|\| doingChatInputTranslate\/\* BG-PRESERVE:START orch-composer \*\/ \|\| \$orchestrating\/\* BG-PRESERVE:END \*\/\}/,
    )
    assert.doesNotMatch(
        applied,
        /\}\s*\/\* BG-PRESERVE:START orch-composer \*\//,
    )
    assert.equal(applyUnit(applied, composer), applied)
    assert.equal(revertUnit(applied, composer), baseline)
    const duplicateAnchor = applyUnit(`${baseline}${baseline}`, composer)
    assert.equal(
        (duplicateAnchor.match(/BG-PRESERVE:START orch-composer/g) ?? []).length,
        1,
    )
    assert.equal(revertUnit(duplicateAnchor, composer), `${baseline}${baseline}`)
    assert.throws(
        () => applyUnit(
            applied.replace('$orchestrating', '$orchestratingBroken'),
            composer,
        ),
        (error) =>
            error instanceof PatchCompositionError
            && error.code === 'MARKER_DRIFT',
    )

    const fetchImpl = unit('bg-preserve:hook:globalapi-fetch-impl-register:1.9')
    assert.match(fetchImpl.anchor, /FetchNativeArgs/)

    const tokenizer = unit('bg-preserve:hook:tokenizer-tikjs-catch-fallback:1.9')
    assert.equal(tokenizer.anchor, '    return (await pending).encode(text)\n')
})
