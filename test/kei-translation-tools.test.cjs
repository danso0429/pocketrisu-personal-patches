'use strict'

const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const core = require('../patches/kei-translation-tools-core/manifest.cjs')
const base = require('../patches/kei-translation-tools-base-adapter/manifest.cjs')
const bg = require('../patches/kei-translation-tools-bg-adapter/manifest.cjs')
const meta = require('../patches/pocketrisu-kei/manifest.cjs')
const { loadCatalog } = require('../src/catalog.cjs')
const { packEtag } = require('../src/manager.cjs')
const { resolveSelection } = require('../src/resolver.cjs')

const filesRoot = path.join(
    __dirname,
    '../patches/kei-translation-tools-core/files',
)
const source = (relative) =>
    fs.readFileSync(path.join(filesRoot, relative), 'utf8')
const unitText = (unit) => unit.managed ?? unit.content ?? ''

test('K12 keeps one internal core and exactly one base/bg adapter', () => {
    assert.equal(core.id, 'kei-translation-tools-core')
    assert.equal(base.id, 'kei-translation-tools-base-adapter')
    assert.equal(bg.id, 'kei-translation-tools-bg-adapter')
    assert.equal(core.userSelectable, false)
    assert.equal(base.userSelectable, false)
    assert.equal(bg.userSelectable, false)
    for (const pack of [core, base, bg]) {
        assert.deepEqual(pack.targets, {
            pocketrisu: {
                verified: ['1.8.1', '1.9.0'],
                reviewing: [],
            },
        })
    }
    assert.deepEqual(base.requires, [
        'kei-translation-tools-core',
        'kei-chat-render-base-adapter',
    ])
    assert.deepEqual(bg.requires, [
        'kei-translation-tools-core',
        'kei-chat-render-bg-adapter',
        'bg-preserve',
    ])
    assert.deepEqual(base.autoWhen, {
        all: ['kei-translation-tools-core'],
        none: ['bg-preserve'],
    })
    assert.deepEqual(bg.autoWhen, {
        all: ['kei-translation-tools-core', 'bg-preserve'],
    })
    assert.deepEqual(base.conflicts, [
        'bg-preserve',
        'kei-translation-tools-bg-adapter',
    ])
    assert.deepEqual(bg.conflicts, ['kei-translation-tools-base-adapter'])
    assert.equal(meta.requires.includes(core.id), true)

    const catalog = loadCatalog()
    const absent = resolveSelection(catalog, ['bg-preserve'])
    assert.equal(absent.resolvedIds.includes(core.id), false)
    assert.equal(absent.resolvedIds.includes(base.id), false)
    assert.equal(absent.resolvedIds.includes(bg.id), false)

    const standalone = resolveSelection(catalog, ['pocketrisu-kei'])
    assert.equal(standalone.resolvedIds.includes(base.id), true)
    assert.equal(standalone.resolvedIds.includes(bg.id), false)

    const composed = resolveSelection(catalog, [
        'pocketrisu-kei',
        'bg-preserve',
    ])
    assert.equal(composed.resolvedIds.includes(base.id), false)
    assert.equal(composed.resolvedIds.includes(bg.id), true)
})

test('K12 selects one exact adapter graph for each supported PocketRisu', () => {
    for (const adapter of [base, bg]) {
        assert.equal(adapter.units.length, 92)
        const historical = adapter.units.filter((unit) =>
            unit.targetVersions?.pocketrisu?.includes('1.8.1')
        )
        const current = adapter.units.filter((unit) =>
            unit.targetVersions?.pocketrisu?.includes('1.9.0')
        )
        assert.equal(historical.length, 46)
        assert.equal(current.length, 46)
        assert.equal(
            historical.every((unit) => !unit.id.endsWith(':1.9')),
            true,
        )
        assert.equal(
            current.every((unit) => unit.id.endsWith(':1.9')),
            true,
        )
        assert.equal(
            adapter.units.every((unit) =>
                unit.targetVersions.pocketrisu.length === 1
            ),
            true,
        )

        const currentBySuffix = (suffix) => current.find((unit) =>
            unit.id.endsWith(`${suffix}:1.9`)
        )
        for (const suffix of [
            'translator-deepl-signal',
            'translator-deeplx-signal',
            'translator-google-experimental-signal',
        ]) {
            const unit = currentBySuffix(suffix)
            assert.ok(unit)
            assert.match(unit.anchor, /logCategory: 'translate'/)
            assert.match(unit.anchor, /logSource: 'translate'/)
            assert.match(unit.managed, /logCategory: 'translate'/)
            assert.match(unit.managed, /logSource: 'translate'/)
            assert.match(unit.managed, /abortSignal: signal/)
        }

        const llmRuntime = currentBySuffix('translator-llm-runtime')
        assert.match(llmRuntime.anchor, /The cache is looked up \(above\)/)
        assert.match(llmRuntime.anchor, /const cacheKey = text/)
        assert.match(llmRuntime.anchor, /llmTranslateCache\.set\(cacheKey, result\)/)
        assert.equal(
            llmRuntime.managed.match(/const cacheKey = text/g)?.length,
            1,
        )

        const beginTask = currentBySuffix('chatbody-begin-task')
        assert.match(beginTask.anchor, /chatbody-capture-streaming:1\.9/)
        assert.match(beginTask.anchor, /isOptimizedStreamingMessage/)
        assert.match(beginTask.managed, /translationTasks\.begin\(\)/)
        assert.doesNotMatch(beginTask.managed, /translationTasks\.begin\([^)]/)
        assert.deepEqual(beginTask.after, [
            `${adapter.id.replace('translation-tools', 'chat-render')}:chatbody-translation-gate:1.9`,
        ])
    }
})

test('K12 owns only cache/task helpers, focused tests, and its panel', () => {
    assert.deepEqual(core.units.map((unit) => unit.file), [
        'src/ts/translator/translationTask.ts',
        'src/ts/translator/translationTask.test.ts',
        'src/ts/translator/translationChunkBatch.ts',
        'src/ts/translator/translationChunkBatch.test.ts',
        'src/ts/translator/translationCacheStore.ts',
        'src/ts/translator/translationCacheStore.test.ts',
        'src/ts/translator/translationCacheRuntime.ts',
        'src/ts/translator/translationCacheUsage.ts',
        'src/ts/translator/translationCacheUsage.test.ts',
        'src/lib/Setting/Pages/Language/TranslationCachePanel.svelte',
    ])
    const expectedHosts = [
        'src/lang/en.ts',
        'src/lang/ko.ts',
        'src/lib/ChatScreens/ChatBody.svelte',
        'src/lib/Setting/Pages/LanguageSettings.svelte',
        'src/ts/translator/translator.ts',
    ]
    for (const adapter of [base, bg]) {
        assert.deepEqual(
            [...new Set(adapter.units.map((unit) => unit.file))].sort(),
            expectedHosts,
        )
        const managed = adapter.units.map(unitText).join('\n')
        assert.doesNotMatch(
            managed,
            /revenant|bgOrchestrat|result.?claim|acknowledge|setCurrentChat|setDatabase/i,
        )
        assert.doesNotMatch(managed, /translatorPresets\s*=|SettingTabs|models\.dev/i)
    }
})

test('K12 cache mutations require the complete issued entry identity', () => {
    const store = source('src/ts/translator/translationCacheStore.ts')
    const tests = source('src/ts/translator/translationCacheStore.test.ts')
    const runtime = source('src/ts/translator/translationCacheRuntime.ts')

    assert.match(store, /current\.storageKey === expected\.storageKey/)
    assert.match(store, /current\.key === expected\.key/)
    assert.match(store, /current\.value === expected\.value/)
    assert.match(store, /await dependencies\.write[\s\S]*memory\.set/)
    assert.match(store, /await dependencies\.remove[\s\S]*memory\.delete/)
    assert.match(store, /mutationTail/)
    assert.match(store, /storeGenerated/)
    assert.match(store, /replaceValue/)
    assert.match(store, /volatile/)
    assert.match(store, /Object\.create\(null\)/)
    assert.match(store, /raceTranslationAbort\(waitForMutations\(\), signal\)/)
    assert.match(store, /async get\([\s\S]*signal\?: AbortSignal/)
    assert.match(store, /throwIfTranslationAborted\(signal\)/)
    assert.match(tests, /changed elsewhere/)
    assert.match(tests, /does not resurrect a generated value/)
    assert.match(tests, /storage-key mismatch/)
    assert.match(tests, /AbortError/)
    assert.match(runtime, /cache\/llm-translate\//)
    assert.match(runtime, /expectedValue/)
    assert.match(runtime, /TranslationCacheChangedError/)
    assert.match(runtime, /generated translation was not persisted/)
})

test('K12 cleanup previews candidates before exact-value deletion', () => {
    const panel = source(
        'src/lib/Setting/Pages/Language/TranslationCachePanel.svelte',
    )
    const usage = source('src/ts/translator/translationCacheUsage.ts')
    const usageTests = source('src/ts/translator/translationCacheUsage.test.ts')

    assert.match(panel, /scanCleanupCandidates/)
    assert.match(panel, /deleteCleanupCandidates/)
    assert.match(panel, /cleanupCandidates = candidates/)
    assert.match(panel, /remainingStorageKeys/)
    assert.match(panel, /translationCacheCleanupCancelledAfter/)
    assert.match(panel, /deleteLLMCacheEntry/)
    assert.match(panel, /translationCacheCleanupScopeWarning/)
    assert.match(panel, /cleanupCandidates\.length > 0/)
    assert.match(usage, /if \(message\.isComment\)/)
    assert.match(usage, /message\.swipes/)
    assert.match(usage, /suggestMessages/)
    assert.match(usage, /hypaV3Data\?\.summaries/)
    assert.match(usage, /fetchChat/)
    assert.match(usage, /yieldToEventLoop/)
    assert.match(usageTests, /without replacing the database object/)
    assert.match(usageTests, /fails closed/)
    assert.match(usageTests, /in-memory scan can be cancelled/)
})

test('K12 propagates one cancellation signal without replacing bg delivery', () => {
    const batch = source('src/ts/translator/translationChunkBatch.ts')
    const batchTests = source('src/ts/translator/translationChunkBatch.test.ts')
    for (const adapter of [base, bg]) {
        const managed = adapter.units.map(unitText).join('\n')
        assert.match(managed, /createTranslationTaskController/)
        assert.match(managed, /translationTasks\.dispose/)
        assert.match(managed, /subscribeLLMTranslationCache/)
        assert.match(managed, /translationCacheRefresh/)
        assert.match(managed, /currentTranslationCacheKey/)
        assert.match(managed, /translationTasks\.hasCurrent/)
        assert.match(managed, /translateHTML\([\s\S]*task\.signal/)
        assert.match(managed, /requestChatData\([\s\S]*'translate', arg\.signal/)
        assert.match(managed, /getCachedLLMTranslation\(cacheKey, arg\.signal\)/)
        assert.match(managed, /getLLMCache\(data, task\.signal\)/)
        assert.match(managed, /abortSignal: signal/)
        assert.match(managed, /fetch\(url,[\s\S]*signal/)
        assert.match(managed, /raceTranslationAbort/)
        assert.match(managed, /createTranslationChunkBatch/)
        assert.match(managed, /superChunkTranslations\.flush/)
        assert.match(managed, /translationPromise\.catch/)
        assert.match(managed, /if\(isTranslationAbortError\(error\)\) throw error/)
        assert.doesNotMatch(managed, /prepareRevenant|completeRevenant/)
    }
    assert.match(batch, /entry\.reject\(error\)/)
    assert.match(batch, /split\.length === batch\.length/)
    assert.match(batch, /current\.length > 0 \? joiner\.length : 0/)
    assert.match(batch, /Promise\.allSettled/)
    assert.match(batchTests, /rejects every queued node and flush/)
    assert.match(batchTests, /does not index past resolvers/)
    const bgTranslatorUnits = bg.units.filter(
        (unit) => unit.file === 'src/ts/translator/translator.ts',
    )
    assert.equal(bgTranslatorUnits.length > 0, true)
    for (const unit of bgTranslatorUnits) {
        assert.deepEqual(unit.after, [
            'bg-preserve:hook:regex-translator-import',
            'bg-preserve:hook:regex-translator-edittrans',
        ])
    }
})

test('K12 payloads participate in ETags', () => {
    for (const pack of [core, base, bg]) {
        const original = packEtag(pack)
        const changed = {
            ...pack,
            units: pack.units.map((unit, index) => index === 0
                ? {
                    ...unit,
                    [unit.type === 'owned' ? 'content' : 'managed']:
                        `${unitText(unit)}\n`,
                }
                : unit),
        }
        assert.notEqual(packEtag(changed), original)
        assert.equal(packEtag(pack), original)
    }
})
