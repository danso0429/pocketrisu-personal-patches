'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const adapter = require('../patches/lazy-chat-bg-adapter/manifest.cjs')
const lazy = require('../patches/lazy-chat-sync/manifest.cjs')

function unit(manifest, id) {
    const found = manifest.units.find(candidate => candidate.id === id)
    assert.ok(found, `missing unit ${id}`)
    return found
}

test('G1 is an exact-1.10 input and commit contract on the current patcher graph', () => {
    assert.deepEqual(adapter.targets.pocketrisu.verified, ['1.10.0'])
    assert.deepEqual(lazy.targets.pocketrisu.verified, ['1.10.0'])
    assert.equal(adapter.version, '0.7.12')
    assert.equal(lazy.version, '0.5.2')
    assert.match(unit(adapter, 'lazy-chat-bg-adapter:server-input-capabilities:1.10').content,
        /inputCommandVersion: 1/)
    assert.match(unit(adapter, 'lazy-chat-bg-adapter:server-chat-commit-start-gate:1.10').content,
        /serverChatCommitOwner\.readGenerationCommit/)
    assert.match(unit(adapter, 'lazy-chat-bg-adapter:server-input-retention-sweep:1.10').content,
        /retireRecoveries/)
    for (const id of [
        'lazy-chat-bg-adapter:owned:bg-browser-message-effects:1.10',
        'lazy-chat-bg-adapter:owned:bg-draft-identity:1.10',
        'lazy-chat-bg-adapter:owned:bg-server-input-provider-policy:1.10',
        'lazy-chat-bg-adapter:owned:server-chat-input-owner:1.10',
        'lazy-chat-bg-adapter:owned:server-chat-commit-owner:1.10',
        'lazy-chat-bg-adapter:owned:server-pending-inputs-ui:1.10',
    ]) unit(adapter, id)
    for (const id of [
        'lazy-chat-sync:owned:server:node:serverChatCommit-cjs:1.10',
        'lazy-chat-sync:owned:server:node:serverChatCommit-test-ts:1.10',
    ]) unit(lazy, id)
})

test('G1 patch owners do not replace Archive Center source', () => {
    const files = [...adapter.units, ...lazy.units].map(candidate => candidate.file)
    assert.equal(files.some(file => /archive.center|archive-center|archive_center/i.test(file)), false)
})
