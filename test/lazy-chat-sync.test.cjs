'use strict'

const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const repositoryRoot = path.resolve(__dirname, '..')
const lazyManifest = require('../patches/lazy-chat-sync/manifest.cjs')
const bgAdapter = require('../patches/lazy-chat-bg-adapter/manifest.cjs')

function payload(relative) {
    return fs.readFileSync(
        path.join(repositoryRoot, 'patches/lazy-chat-sync/files', relative),
        'utf8',
    )
}

test('lazy chat pack includes CAS, WAL, reconciliation, and safe hydration boundaries', () => {
    assert.equal(lazyManifest.id, 'lazy-chat-sync')
    assert.equal(lazyManifest.version, '0.1.1')
    assert.match(payload('server/node/server.cjs'), /chatWriteJournal/)
    assert.match(payload('server/node/server.cjs'), /\/api\/chat-content\/:chaId\/:chatIndex\/patch/)
    assert.match(payload('server/node/server.cjs'), /validateStrippedDatabaseTransition/)
    assert.match(payload('server/node/server.cjs'), /CHAT_PAYLOAD_MISSING/)
    assert.match(payload('src/ts/storage/nodeStorage.ts'), /x-chat-base-revision/)
    assert.match(payload('src/ts/storage/conflictRebase.ts'), /mergeThreeWayValue/)
    assert.match(payload('src/ts/plugins/apiV3/pluginChatAccess.ts'), /hydrateChat/)
    const missingPayloadNotice = lazyManifest.units.find((unit) =>
        unit.id === 'lazy-chat-sync:chat-missing-payload-notice'
    )
    assert.ok(missingPayloadNotice)
    assert.match(missingPayloadNotice.content, /Your draft was kept/)
})

test('startup probe accepts either valid browser cache without joining stalled backends', () => {
    const source = payload('src/ts/storage/startupDatabaseCache.ts')
    const probe = source.slice(
        source.indexOf('private async probeWithoutTimeout'),
        source.indexOf('async resolveNotModified'),
    )
    assert.match(probe, /Promise\.race\(pending\.values\(\)\)/)
    assert.doesNotMatch(probe, /Promise\.all/)
})

test('BG adapter preserves semantic revisions and adds only the durable flush barrier', () => {
    assert.deepEqual(bgAdapter.requires, ['bg-preserve', 'lazy-chat-sync'])
    const flush = bgAdapter.units.find((unit) =>
        unit.id === 'lazy-chat-bg-adapter:durable-flush'
    )
    assert.ok(flush)
    assert.match(flush.content, /forageStorage\.flushDatabase\(\)/)
    assert.doesNotMatch(flush.content, /baseChatRevision|x-chat-base-revision/)
})
