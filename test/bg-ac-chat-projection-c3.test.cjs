'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const adapter = require('../patches/lazy-chat-bg-adapter/manifest.cjs')
const { loadCatalog } = require('../src/catalog.cjs')
const { flattenUnits } = require('../src/manager.cjs')
const { resolveSelection } = require('../src/resolver.cjs')

const target1100 = { packageName: 'pocketrisu', packageVersion: '1.10.0' }
const target190 = { packageName: 'pocketrisu', packageVersion: '1.9.0' }

function unit(id) {
    const found = adapter.units.find(candidate => candidate.id === id)
    assert.ok(found, `missing unit ${id}`)
    return found
}

test('C3: exact-1.10 graph owns revision-bound chat execution projection', () => {
    assert.equal(adapter.version, '0.4.0')
    const resolution = resolveSelection(loadCatalog(), ['lazy-chat-sync', 'bg-preserve'])
    const units1100 = flattenUnits(resolution.packs, target1100)
    const units190 = flattenUnits(resolution.packs, target190)
    for (const file of [
        'server/node/serverChatExecutionProjection.cjs',
        'server/node/serverChatExecutionProjection.test.ts',
    ]) {
        assert.equal(units1100.filter(candidate => candidate.file === file).length, 1)
        assert.equal(units190.filter(candidate => candidate.file === file).length, 0)
    }

    const route = unit('lazy-chat-bg-adapter:server-chat-execution-projection-route:1.10')
    assert.match(route.content, /sessionAuthMiddleware/)
    assert.match(route.content, /requestedRevision/)
    assert.match(route.content, /state: 'revision_mismatch'/)
    assert.match(route.content, /state: 'ownership-unknown'/)
    assert.match(route.content, /found: true, \.\.\.outcome\.projection/)
})

test('C3: server-owned root state survives both full and patch database writers', () => {
    const full = unit('lazy-chat-bg-adapter:server-chat-owned-root-full-write:1.10')
    const patch = unit('lazy-chat-bg-adapter:server-chat-owned-root-patch:1.10')
    for (const candidate of [full, patch]) {
        assert.match(candidate.content, /serverChatCommitOwner\.preserveDatabaseState/)
    }
    const owner = unit('lazy-chat-bg-adapter:owned:server-chat-commit-owner:1.10')
    assert.match(owner.content, /copyServerOwnedRootState/)
    assert.match(owner.content, /readChatProjection/)
    assert.match(owner.content, /applyCommitProjection/)
})
