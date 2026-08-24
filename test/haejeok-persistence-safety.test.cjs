'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const manifest = require('../patches/haejeok-persistence-safety-adapter/manifest.cjs')

function unit(id) {
    const found = manifest.units.find((entry) => entry.id === id)
    assert.ok(found, `missing unit ${id}`)
    return found
}

test('Haejeok safety is an internal exact-1.10 lazy/BG adapter', () => {
    assert.equal(manifest.id, 'haejeok-persistence-safety-adapter')
    assert.equal(manifest.userSelectable, false)
    assert.deepEqual(manifest.requires, ['bg-preserve', 'lazy-chat-sync'])
    assert.deepEqual(manifest.autoWhen, { all: ['bg-preserve', 'lazy-chat-sync'] })
    assert.deepEqual(manifest.targets, {
        pocketrisu: {
            verified: ['1.8.1', '1.9.0'],
            reviewing: ['1.10.0'],
        },
    })
    assert.ok(manifest.units.every((entry) =>
        entry.targetVersions?.pocketrisu?.length === 1
        && entry.targetVersions.pocketrisu[0] === '1.10.0'
    ))
})

test('new user messages use strict chat persistence before generation', () => {
    assert.match(
        unit('haejeok-persistence-safety-adapter:chat-save-before-generation').content,
        /persistActiveChatBeforeGeneration/,
    )
    assert.match(
        unit('haejeok-persistence-safety-adapter:chat-save-before-generation').content,
        /requestDurableSave/,
    )
    assert.match(
        unit('haejeok-persistence-safety-adapter:chat-append-state').content,
        /appendedUserMessage = true/,
    )
})

test('script mutation writes the exact clone payload and skips read-only calls', () => {
    const helper = unit('haejeok-persistence-safety-adapter:helper').content
    assert.match(helper, /!input\.messagesMutated/)
    assert.match(helper, /isServerOrchestrationRuntime\(\)/)
    assert.match(helper, /save\(input\.chaId, input\.chatId, input\.chat\)/)

    const implementation = unit(
        'haejeok-persistence-safety-adapter:durable-chat-payload-impl',
    ).content
    assert.match(implementation, /liveChat\.message = safeStructuredClone\(chat\.message\)/)
    assert.match(implementation, /requestDurableSaveImpl\(\{ chat: \[chaId, chatId\] \}\)/)
    assert.doesNotMatch(implementation, /saveChatToServer/)
    assert.match(
        unit('haejeok-persistence-safety-adapter:script-set-chat').content,
        /message\.data !== nextValue/,
    )
})

test('plugin reload is sequenced after plugin-scoped strict persistence', () => {
    assert.match(
        unit('haejeok-persistence-safety-adapter:durable-save-plugin-enlistment').content,
        /changeTracker\.plugins = true/,
    )
    const update = unit(
        'haejeok-persistence-safety-adapter:plugin-save-before-reload',
    ).content
    assert.match(update, /await persistPluginsBeforeReload/)
    assert.doesNotMatch(update, /requestImmediateSave/)
})
