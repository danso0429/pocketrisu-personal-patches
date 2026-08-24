'use strict'

const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const core = require('../patches/kei-partial-edit-core/manifest.cjs')
const base = require('../patches/kei-partial-edit-base-adapter/manifest.cjs')
const bg = require('../patches/kei-partial-edit-bg-adapter/manifest.cjs')
const { loadCatalog } = require('../src/catalog.cjs')
const { packEtag } = require('../src/manager.cjs')
const { resolveSelection } = require('../src/resolver.cjs')

const patchRoot = path.join(__dirname, '../patches/kei-partial-edit-core')
const source = (relative) =>
    fs.readFileSync(path.join(patchRoot, relative), 'utf8')
const unitText = (unit) => unit.managed ?? unit.content ?? ''

test('K15 keeps its core and base/bg adapters internal', () => {
    assert.equal(core.id, 'kei-partial-edit-core')
    assert.equal(base.id, 'kei-partial-edit-base-adapter')
    assert.equal(bg.id, 'kei-partial-edit-bg-adapter')
    assert.equal(core.userSelectable, false)
    assert.equal(base.userSelectable, false)
    assert.equal(bg.userSelectable, false)
    for (const pack of [core, bg]) {
        assert.deepEqual(pack.targets, {
            pocketrisu: {
                verified: ['1.8.1', '1.9.0', '1.10.0'],
                reviewing: [],
            },
        })
    }
    assert.deepEqual(base.targets.pocketrisu, {
        verified: ['1.8.1', '1.9.0'],
        reviewing: ['1.10.0'],
    })
    assert.deepEqual(base.requires, [
        'kei-partial-edit-core',
        'kei-chat-render-base-adapter',
    ])
    assert.deepEqual(bg.requires, [
        'kei-partial-edit-core',
        'kei-chat-render-bg-adapter',
        'bg-preserve',
    ])
    assert.deepEqual(base.autoWhen, {
        all: ['kei-partial-edit-core'],
        none: ['bg-preserve'],
    })
    assert.deepEqual(bg.autoWhen, {
        all: ['kei-partial-edit-core', 'bg-preserve'],
    })
    assert.deepEqual(base.conflicts, [
        'bg-preserve',
        'kei-partial-edit-bg-adapter',
    ])
    assert.deepEqual(bg.conflicts, ['kei-partial-edit-base-adapter'])
})

test('K15 selects exactly one adapter and stays absent without its core', () => {
    const catalog = loadCatalog()
    const absent = resolveSelection(catalog, ['bg-preserve'])
    assert.equal(absent.resolvedIds.includes(core.id), false)
    assert.equal(absent.resolvedIds.includes(base.id), false)
    assert.equal(absent.resolvedIds.includes(bg.id), false)

    const standalone = resolveSelection(catalog, ['pocketrisu-kei'])
    assert.equal(standalone.resolvedIds.includes(base.id), true)
    assert.equal(standalone.resolvedIds.includes(bg.id), false)

    const composed = resolveSelection(
        catalog,
        ['pocketrisu-kei', 'bg-preserve'],
    )
    assert.equal(composed.resolvedIds.includes(base.id), false)
    assert.equal(composed.resolvedIds.includes(bg.id), true)
})

test('K15 owns only identity/manager code and hooks four focused hosts', () => {
    assert.deepEqual(core.units.map((unit) => unit.file), [
        'src/lib/ChatScreens/keiPartialEditIdentity.ts',
        'src/lib/ChatScreens/keiPartialEditIdentity.test.ts',
        'src/lib/ChatScreens/PartialEditManager.svelte',
        'src/lib/ChatScreens/PartialEditManager.test.ts',
    ])
    const expectedHosts = [
        'src/lang/en.ts',
        'src/lang/ko.ts',
        'src/lib/ChatScreens/Chat.svelte',
        'src/lib/ChatScreens/DefaultChatScreen.svelte',
    ]
    for (const adapter of [base, bg]) {
        const units181 = adapter.units.filter((unit) =>
            unit.targetVersions?.pocketrisu?.includes('1.8.1')
        )
        const units190 = adapter.units.filter((unit) =>
            unit.targetVersions?.pocketrisu?.includes('1.9.0')
        )
        assert.equal(units181.length, 14)
        assert.equal(units190.length, 14)
        assert.equal(
            adapter.units.every((unit) => {
                const versions = unit.targetVersions?.pocketrisu
                return versions?.length === 1 || versions?.join(',') === '1.9.0,1.10.0'
            }),
            true,
        )
        assert.deepEqual(
            [...new Set(adapter.units.map((unit) => unit.file))].sort(),
            expectedHosts,
        )
        const managed = adapter.units.map(unitText).join('\n')
        assert.doesNotMatch(
            managed,
            /bgOrchestrat|result.?claim|acknowledge|sendChat|requestStatus|setCurrentChat/i,
        )
        assert.equal((managed.match(/setLLMCache/g) ?? []).length, 2)

        const managed181 = units181.map(unitText).join('\n')
        const managed190 = units190.map(unitText).join('\n')
        assert.match(managed181, /isStreamingDisplay/)
        assert.doesNotMatch(managed190, /isStreamingDisplay/)
        assert.match(managed190, /isOptimizedStreamingMessage/)
        assert.match(managed190, /overscroll-y-contain/)
        const rootState190 = units190.find((unit) =>
            unit.id.endsWith(':chat-root-state:1.9')
        )
        const manager190 = units190.find((unit) =>
            unit.id.endsWith(':default-chat-manager:1.9')
        )
        assert.ok(rootState190)
        assert.ok(manager190)
        assert.deepEqual(rootState190.after, [
            `kei-chat-render-${adapter === base ? 'base' : 'bg'}-adapter:chat-reactive-metadata:1.9`,
        ])
        assert.match(
            manager190.requires.join('\n'),
            /default-chat-generation-state:1\.9/,
        )
    }
})

test('K15 manager binds each edit to object, data, and DOM identities', () => {
    const identity = source(
        'files/src/lib/ChatScreens/keiPartialEditIdentity.ts',
    )
    const identityTests = source(
        'files/src/lib/ChatScreens/keiPartialEditIdentity.test.ts',
    )
    const manager = source(
        'files/src/lib/ChatScreens/PartialEditManager.svelte',
    )
    const managerTests = source(
        'files/src/lib/ChatScreens/PartialEditManager.test.ts',
    )

    assert.match(manager, /chat\.message\?\.\[messageIndex\] !== messageRef/)
    assert.match(manager, /samePartialEditMessageIdentity/)
    assert.match(manager, /messages\[target\.messageIndex\] !== target\.messageRef/)
    assert.match(manager, /currentMessage\.data !== target\.messageData/)
    assert.match(manager, /dataset\.chatIndex !== String\(target\.messageIndex\)/)
    assert.match(manager, /dataset\.chatId \|\| null\) !== target\.messageId/)
    assert.match(manager, /target\.translatedView && !translationContext/)
    assert.match(manager, /expectedData: matchingState\.sourceData/)
    assert.match(manager, /activeTranslationContext = sourceType === 'translation'/)
    assert.doesNotMatch(manager, /matchingState\.translationContext/)
    assert.match(manager, /saved = response \? await response : false/)
    assert.match(manager, /saveFailed = true/)
    assert.match(manager, /partialEdit\.saveFailedMessage/)
    assert.match(manager, /data-partial-edit-disabled/)
    assert.match(manager, /data-partial-edit-translated/)
    assert.doesNotMatch(manager, /setLLMCache|setCurrentChat|bgOrchestrat/)

    assert.match(identity, /current\.chatRef === expected\.chatRef/)
    assert.match(identity, /current\.messageRef === expected\.messageRef/)
    assert.match(identity, /request\.token === issued\.token/)
    assert.match(identity, /request\.key === issued\.key/)
    assert.match(identity, /request\.expectedData === issued\.data/)
    assert.match(identity, /await write\(key, nextData, previousData\)/)
    assert.match(identity, /await write\(key, previousData, nextData\)/)
    assert.match(identityTests, /does not restore over a newer value/)
    assert.match(identityTests, /\['token', \{ token: \{\} \}\]/)
    assert.match(identityTests, /\['key', \{ key: 'another-key' \}\]/)
    assert.match(identityTests, /\['cached data', \{ expectedData:/)
    assert.match(identityTests, /id-less messages with equal text/)

    assert.match(managerTests, /one shared listener set regardless of message count/)
    assert.match(managerTests, /only the resolved message and its active swipe/)
    assert.match(managerTests, /only through its issued context/)
    assert.match(managerTests, /keeps the translated edit available/)
    assert.match(managerTests, /translation context is unavailable/)
    assert.match(managerTests, /equal-text messages reorder without ids/)
    assert.match(managerTests, /target changes during lookup/)
    assert.match(managerTests, /rejects greeting roots/)
})

test('K15 translation bridge requires an issued current cache identity', () => {
    const identity = source(
        'files/src/lib/ChatScreens/keiPartialEditIdentity.ts',
    )
    assert.match(identity, /request\.token === issued\.token/)
    assert.match(identity, /request\.key === issued\.key/)
    assert.match(identity, /request\.expectedData === issued\.data/)

    for (const adapter of [base, bg]) {
        const bridges = adapter.units.filter((unit) =>
            unit.id.endsWith(':chat-translation-bridge')
            || unit.id.endsWith(':chat-translation-bridge:1.9')
        )
        assert.equal(bridges.length, 2)
        for (const bridge of bridges) {
            const payload = unitText(bridge)
            assert.match(payload, /chatRef: chat as object/)
            assert.match(payload, /messageRef: messageRef as object/)
            assert.match(payload, /issuedPartialEditTranslation !== issued/)
            assert.match(payload, /partialEditTranslationSaveMatchesIssue/)
            assert.match(payload, /currentKey !== issued\.key/)
            assert.match(payload, /currentData !== issued\.data/)
            assert.match(payload, /commitPartialEditTranslationCache/)
            assert.match(
                payload,
                /!DBState\.db\.enableBlockPartialEdit && !DBState\.db\.enableDragPartialEdit/,
            )
            assert.match(payload, /samePartialEditMessageIdentity/)
            assert.doesNotMatch(
                payload,
                /bgOrchestrat|result.?claim|acknowledge|sendChat|setCurrentChat/i,
            )
        }
    }
})

test('K15 bg adapter follows existing touch ownership without replacing it', () => {
    for (const suffix of ['chat-standard-root', 'chat-themed-root']) {
        const units = bg.units.filter((candidate) =>
            candidate.id.endsWith(`:${suffix}`)
            || candidate.id.endsWith(`:${suffix}:1.9`),
        )
        assert.equal(units.length, 2)
        assert.deepEqual(units[0].after, [
            'kei-chat-render-bg-adapter:chat-body-streaming-prop',
            'bg-preserve:hook:chat-standard-risu-control-touch-events',
            'bg-preserve:hook:chat-themed-risu-control-touch-events',
        ])
        assert.deepEqual(units[1].after, [
            'kei-chat-render-bg-adapter:chat-body-streaming-prop:1.9',
            'bg-preserve:hook:chat-standard-risu-control-touch-events',
            'bg-preserve:hook:chat-themed-risu-control-touch-events',
        ])
        for (const unit of units) {
            assert.match(unitText(unit), /BG-PRESERVE:START risu-control-touch-/)
            assert.doesNotMatch(
                unitText(unit),
                /ontouchstartcapture|ontouchendcapture|onclickcapture/,
            )
        }
    }
})

test('K15 payloads participate in ETags and retain pinned attribution', () => {
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

    const notices = fs.readFileSync(
        path.join(__dirname, '../THIRD_PARTY_NOTICES.md'),
        'utf8',
    )
    assert.match(notices, /cc1d1b195babd887577ebf943d5e82f01f58135c/)
    assert.match(notices, /shared\s+partial-message editing/)
    assert.match(notices, /issued translation-cache token/)
})
