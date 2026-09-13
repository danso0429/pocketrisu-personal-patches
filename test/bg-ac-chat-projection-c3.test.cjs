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
        'src/ts/bgServerCommitHydration.ts',
        'src/ts/bgServerCommitHydration.test.ts',
        'src/ts/storage/serverCommittedChatAdoption.test.ts',
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

test('C3: committed-result client path hydrates canonical chat and skips legacy save effects', () => {
    const imports = unit('lazy-chat-bg-adapter:server-commit-client-import:1.10')
    const hydration = unit('lazy-chat-bg-adapter:server-commit-client-hydration:1.10')
    const foreground = unit('lazy-chat-bg-adapter:server-commit-client-found-result:1.10')
    const boot = unit('lazy-chat-bg-adapter:server-commit-boot-found-result:1.10')
    assert.match(imports.content, /hydrateServerCommittedOrchestration/)
    assert.match(imports.content, /adoptServerCommittedChat/)
    assert.match(hydration.content, /fetchOrchestrationControl/)
    assert.match(hydration.content, /orchestrationChatRevision/)
    assert.match(foreground.content, /serverChatCommitReceipt/)
    assert.match(foreground.content, /acknowledgeResultRevision/)
    assert.doesNotMatch(foreground.content, /persistMergedOrchestrationResult/)
    assert.doesNotMatch(foreground.content, /requestDurableSave/)
    assert.match(boot.content, /hydrateServerCommittedResult/)

    const snapshot = unit('lazy-chat-bg-adapter:server-chat-snapshot-read:1.10')
    const adoption = unit('lazy-chat-bg-adapter:server-committed-chat-adoption:1.10')
    assert.match(snapshot.content, /fetchChatContentSnapshot/)
    assert.match(snapshot.content, /rememberChatSyncState/)
    assert.match(adoption.content, /hydrationJustApplied/)
    assert.match(adoption.content, /local-revision-conflict/)
    assert.match(adoption.content, /server-revision-mismatch/)
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
