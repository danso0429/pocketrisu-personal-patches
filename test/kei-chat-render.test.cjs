'use strict'

const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const core = require('../patches/kei-chat-render-core/manifest.cjs')
const base = require('../patches/kei-chat-render-base-adapter/manifest.cjs')
const bg = require('../patches/kei-chat-render-bg-adapter/manifest.cjs')
const { loadCatalog } = require('../src/catalog.cjs')
const { packEtag } = require('../src/manager.cjs')
const { resolveSelection } = require('../src/resolver.cjs')

const patchRoot = path.join(__dirname, '../patches/kei-chat-render-core')
const source = (relative) => fs.readFileSync(path.join(patchRoot, relative), 'utf8')
const unitText = (unit) => unit.managed ?? unit.content ?? ''

test('K14 keeps its pure core and graph-specific adapters internal', () => {
    assert.equal(core.id, 'kei-chat-render-core')
    assert.equal(base.id, 'kei-chat-render-base-adapter')
    assert.equal(bg.id, 'kei-chat-render-bg-adapter')
    assert.equal(core.userSelectable, false)
    assert.equal(base.userSelectable, false)
    assert.equal(bg.userSelectable, false)
    assert.deepEqual(base.autoWhen, {
        all: ['kei-chat-render-core'],
        none: ['bg-preserve'],
    })
    assert.deepEqual(bg.autoWhen, {
        all: ['kei-chat-render-core', 'bg-preserve'],
    })
    assert.deepEqual(base.conflicts, [
        'bg-preserve',
        'kei-chat-render-bg-adapter',
    ])
    assert.deepEqual(bg.conflicts, ['kei-chat-render-base-adapter'])
})

test('K14 selects exactly one adapter and stays absent without its core', () => {
    const catalog = loadCatalog()
    const absent = resolveSelection(catalog, ['bg-preserve'])
    assert.equal(absent.resolvedIds.includes(core.id), false)
    assert.equal(absent.resolvedIds.includes(base.id), false)
    assert.equal(absent.resolvedIds.includes(bg.id), false)

    const standalone = resolveSelection(catalog, ['pocketrisu-kei'])
    assert.equal(standalone.resolvedIds.includes(base.id), true)
    assert.equal(standalone.resolvedIds.includes(bg.id), false)

    const composed = resolveSelection(catalog, ['pocketrisu-kei', 'bg-preserve'])
    assert.equal(composed.resolvedIds.includes(base.id), false)
    assert.equal(composed.resolvedIds.includes(bg.id), true)
})

test('K14 owns only the render identity and tests and hooks four chat hosts', () => {
    assert.deepEqual(core.units.map((unit) => unit.file), [
        'src/lib/ChatScreens/keiChatRender.ts',
        'src/lib/ChatScreens/keiChatRender.test.ts',
    ])
    for (const adapter of [base, bg]) {
        assert.deepEqual(
            [...new Set(adapter.units.map((unit) => unit.file))].sort(),
            [
                'src/lib/ChatScreens/Chat.svelte',
                'src/lib/ChatScreens/ChatBody.svelte',
                'src/lib/ChatScreens/Chats.svelte',
                'src/lib/ChatScreens/DefaultChatScreen.svelte',
            ],
        )
        const managed = adapter.units.map(unitText).join('\n')
        assert.doesNotMatch(
            managed,
            /fetch|WebSocket|result.?claim|acknowledge|requestStatus/i,
        )
        assert.doesNotMatch(managed, /setDatabase|requestImmediateSave|localStorage/)
    }
})

test('K14 identity retains structure but removes only streaming churn', () => {
    const runtime = source('files/src/lib/ChatScreens/keiChatRender.ts')
    const runtimeTests = source('files/src/lib/ChatScreens/keiChatRender.test.ts')
    assert.doesNotMatch(runtime, /^import /m)
    assert.match(runtime, /input\.role === 'char'/)
    assert.match(runtime, /input\.chatStreaming/)
    assert.match(runtime, /input\.generationActive/)
    assert.match(runtime, /input\.isLastMessage/)
    assert.doesNotMatch(runtime, /DBState|useStreaming/)
    assert.match(runtime, /const message = streaming \? '' : input\.message/)
    assert.match(runtime, /const reloadPointer = streaming \? 0 : input\.reloadPointer/)
    assert.match(runtime, /const model = streaming \? '' : \(input\.model \?\? ''\)/)
    assert.match(runtime, /\+ \(input\.chatId \?\? ''\)/)
    assert.match(runtime, /\+ input\.disabled\?\.toString\(\)/)
    assert.match(runtimeTests, /stays stable across content, model, and local reload/)
    assert.match(runtimeTests, /per-preset streams independent of global settings/)
    assert.match(runtimeTests, /remounts at both streaming lifecycle boundaries/)
    assert.match(runtimeTests, /keeps structural message changes visible/)
})

test('K14 updates mounted props and defers translation only for active streaming', () => {
    for (const adapter of [base, bg]) {
        const managed = adapter.units.map(unitText).join('\n')
        assert.match(managed, /const props = \$state<ChatMountProps>/)
        assert.match(managed, /entry\.props\.message = message\.data/)
        assert.match(managed, /isStreamingDisplay: isStreamingMessage/)
        assert.match(
            managed,
            /messageGenerationInfo: message\.generationInfo,/,
        )
        assert.match(
            managed,
            /entry\.props\.messageGenerationInfo !== message\.generationInfo/,
        )
        assert.doesNotMatch(
            managed,
            /messageGenerationInfo: message\.generationInfo \? \{ \.\.\.message\.generationInfo \}/,
        )
        assert.match(managed, /generationActive=\{\$doingChat\}/)
        assert.match(managed, /getChatBodyReloadPointer/)
        assert.match(managed, /if\(!streamingDisplay && DBState\.db\.autoTranslate\)/)
        assert.match(managed, /if\(!streamingDisplay && \(retranslate \|\| translated\)\)/)
        assert.match(managed, /\$ReloadGUIPointer/)
        assert.match(managed, /\$ReloadChatPointer\[idx\] \?\? 0/)
    }
})

test('K14 bg adapter explicitly follows existing Chat ownership without touching delivery', () => {
    const chatUnits = bg.units.filter((unit) =>
        unit.file === 'src/lib/ChatScreens/Chat.svelte',
    )
    assert.equal(chatUnits.length, 5)
    for (const unit of chatUnits) {
        assert.deepEqual(unit.after, [
            'bg-preserve:hook:chat-risu-control-touch-import',
            'bg-preserve:hook:chat-risu-control-touch-bridge',
            'bg-preserve:hook:chat-standard-risu-control-touch-events',
            'bg-preserve:hook:chat-themed-risu-control-touch-events',
        ])
    }
    const defaultChatUnit = bg.units.find((unit) =>
        unit.file === 'src/lib/ChatScreens/DefaultChatScreen.svelte',
    )
    assert.ok(defaultChatUnit)
    assert.equal(defaultChatUnit.after.length, 15)
    assert.equal(
        defaultChatUnit.after.every((id) =>
            id.startsWith('bg-preserve:hook:defaultchatscreen-')
        ),
        true,
    )
})

test('K14 adapter payloads participate in ETags and retain pinned attribution', () => {
    for (const adapter of [base, bg]) {
        const original = packEtag(adapter)
        const changed = {
            ...adapter,
            units: adapter.units.map((unit, index) => index === 2
                ? { ...unit, managed: `${unit.managed}\n// changed` }
                : unit),
        }
        assert.notEqual(packEtag(changed), original)
        assert.equal(packEtag(adapter), original)
    }

    const notices = fs.readFileSync(
        path.join(__dirname, '../THIRD_PARTY_NOTICES.md'),
        'utf8',
    )
    assert.match(notices, /cc1d1b195babd887577ebf943d5e82f01f58135c/)
    assert.match(notices, /streaming chat render identity/)
})
