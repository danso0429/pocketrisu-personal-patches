'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const adapter = require('../patches/lazy-chat-bg-adapter/manifest.cjs')
const { loadCatalog } = require('../src/catalog.cjs')
const { flattenUnits, packEtag } = require('../src/manager.cjs')
const { resolveSelection } = require('../src/resolver.cjs')

const target1100 = { packageName: 'pocketrisu', packageVersion: '1.10.0' }
const target190 = { packageName: 'pocketrisu', packageVersion: '1.9.0' }

function unit(id) {
    const found = adapter.units.find(candidate => candidate.id === id)
    assert.ok(found, `missing unit ${id}`)
    return found
}

test('C2: exact-1.10 lazy BG graph owns the server commit adapter and route precedence', () => {
    assert.equal(adapter.version, '0.7.1')
    const resolution = resolveSelection(loadCatalog(), ['lazy-chat-sync', 'bg-preserve'])
    assert.ok(resolution.resolvedIds.includes('lazy-chat-bg-adapter'))
    const units1100 = flattenUnits(resolution.packs, target1100)
    const units190 = flattenUnits(resolution.packs, target190)
    for (const file of [
        'server/node/serverChatCommitOwner.cjs',
        'server/node/serverChatCommitOwner.test.ts',
        'server/node/bgServerChatCommitRoutes.test.ts',
        'server/node/bgServerChatProcessPreload.cjs',
        'server/node/bgServerChatProcessClient.cjs',
        'server/node/bgServerChatProcessBoundary.test.ts',
        'src/ts/storage/bgServerChatProcessAdoption.test.ts',
    ]) {
        assert.equal(units1100.filter(candidate => candidate.file === file).length, 1)
        assert.equal(units190.filter(candidate => candidate.file === file).length, 0)
    }

    const terminal = unit('lazy-chat-bg-adapter:server-chat-commit-terminal:1.10')
    assert.match(terminal.content, /serverChatCommitOwner\.commitGenerationResult/)
    assert.match(terminal.content, /serverChatCommitVersion === 1/)
    assert.match(terminal.content, /serverChatCommit\.status !== 'committed'/)
    assert.match(
        unit('lazy-chat-bg-adapter:server-chat-commit-preview-call:1.10').content,
        /runDetachedServerPreview/,
    )
    const settings = unit('lazy-chat-bg-adapter:server-chat-commit-settings-digest:1.10')
    assert.match(settings.content, /control\.serverChatCommitVersion === 1/)
    assert.match(settings.content, /: null/)

    const status = unit('lazy-chat-bg-adapter:server-chat-commit-status:1.10')
    const cancel = unit('lazy-chat-bg-adapter:server-chat-commit-cancel:1.10')
    const missing = unit('lazy-chat-bg-adapter:server-chat-commit-missing-result:1.10')
    assert.match(status.content, /state: 'chat-committed'/)
    assert.match(cancel.content, /reason: 'already-committed'/)
    assert.match(missing.content, /serverChatCommit: committed\.receipt/)
    const durable = unit('lazy-chat-bg-adapter:server-chat-commit-durable-response:1.10')
    assert.match(durable.content, /durableServerChatCommitVersion/)
    assert.match(durable.content, /reason: 'operation-protocol-conflict'/)
})

test('C2: server commit reset hooks cover every lazy journal reset owner', () => {
    const resetUnits = adapter.units.filter(candidate => (
        candidate.id.includes('server-chat-commit-')
        && candidate.id.endsWith('reset:1.10')
    ))
    assert.deepEqual(resetUnits.map(candidate => candidate.id).sort(), [
        'lazy-chat-bg-adapter:server-chat-commit-backup-reset:1.10',
        'lazy-chat-bg-adapter:server-chat-commit-database-remove-reset:1.10',
        'lazy-chat-bg-adapter:server-chat-commit-save-folder-reset:1.10',
        'lazy-chat-bg-adapter:server-chat-commit-snapshot-reset:1.10',
    ])
    assert.equal(resetUnits.every(candidate => (
        candidate.content.includes('serverChatCommitOwner.discardRecovery()')
    )), true)
    assert.match(
        unit('lazy-chat-bg-adapter:owned:server-chat-commit-owner:1.10').content,
        /kvDel\(operationResultKey\(operationId\)\)/,
    )
})

test('C2: adapter payload changes invalidate its pack ETag without mutating the source manifest', () => {
    const original = packEtag(adapter)
    const ownerIndex = adapter.units.findIndex(candidate => (
        candidate.id === 'lazy-chat-bg-adapter:owned:server-chat-commit-owner:1.10'
    ))
    assert.ok(ownerIndex >= 0)
    const changed = {
        ...adapter,
        units: adapter.units.map((candidate, index) => (
            index === ownerIndex
                ? { ...candidate, content: `${candidate.content}\n// mutation` }
                : candidate
        )),
    }
    assert.notEqual(packEtag(changed), original)
    assert.equal(packEtag(adapter), original)
})

test('C2: current client remains unopted until the separate C3 compatibility branch', () => {
    const bgClient = resolveSelection(loadCatalog(), ['lazy-chat-sync', 'bg-preserve'])
        .packs.find(pack => pack.id === 'bg-preserve')
        .units.find(candidate => (
            candidate.file === 'src/ts/bgOrchestrate.ts'
            && candidate.targetVersions?.pocketrisu?.includes('1.10.0')
        ))
    assert.ok(bgClient)
    assert.doesNotMatch(bgClient.content, /serverChatCommitVersion/)
    assert.match(unit('lazy-chat-bg-adapter:server-chat-commit-start-gate:1.10').content, /server-chat-commit-input-stale/)
})
