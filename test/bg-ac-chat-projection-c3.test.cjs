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
    assert.equal(adapter.version, '0.5.0')
    const resolution = resolveSelection(loadCatalog(), ['lazy-chat-sync', 'bg-preserve'])
    const units1100 = flattenUnits(resolution.packs, target1100)
    const units190 = flattenUnits(resolution.packs, target190)
    for (const file of [
        'server/node/serverChatExecutionProjection.cjs',
        'server/node/serverChatExecutionProjection.test.ts',
        'server/node/serverChatInputOwner.cjs',
        'server/node/serverChatInputOwner.test.ts',
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
    assert.match(route.content, /found: true,[\s\S]*\.\.\.outcome\.projection/)
})

test('C3: pre-canonical server input remains an explicit dormant contract', () => {
    const capability = unit('lazy-chat-bg-adapter:server-input-capabilities:1.10')
    const start = unit('lazy-chat-bg-adapter:server-chat-commit-start-gate:1.10')
    const transform = unit('lazy-chat-bg-adapter:server-input-transform:1.10')
    const settings = unit('lazy-chat-bg-adapter:server-input-settings-snapshot:1.10')
    const terminal = unit('lazy-chat-bg-adapter:server-chat-commit-terminal:1.10')
    const intermediate = unit('lazy-chat-bg-adapter:server-input-intermediate-policy:1.10')
    assert.match(capability.content, /inputCommandVersion: 0/)
    assert.match(capability.content, /inputCommandFoundationVersion: serverChatInputOwner \? 2 : 0/)
    assert.match(start.content, /serverChatInputOwner\.admit/)
    assert.match(start.content, /serverRunChat/)
    assert.match(start.content, /serverRunChat = serverInputExecution\.chat/)
    assert.match(transform.content, /runTrigger/)
    assert.match(transform.content, /processScript/)
    assert.match(transform.content, /attachInputTransform/)
    assert.match(settings.content, /readInputSettingsSnapshot/)
    assert.match(settings.content, /decodeRisuSave/)
    assert.match(settings.content, /settingsSnapshot\.contextDigest/)
    assert.match(settings.content, /server input settings context unavailable/)
    assert.match(
        unit('lazy-chat-bg-adapter:owned:server-chat-input-owner:1.10').content,
        /SERVER_CHAT_SETTINGS_SNAPSHOT_MAX_CONTEXTS = 2/,
    )
    assert.match(terminal.content, /serverInputReceipt/)
    assert.match(terminal.content, /serverCommitBaselineMessageCount/)
    assert.match(intermediate.content, /inputCommandVersion !== 1/)
    assert.match(
        unit('lazy-chat-bg-adapter:server-chat-commit-operation-state:1.10').content,
        /inputCommandId/,
    )
    assert.match(
        unit('lazy-chat-bg-adapter:server-chat-commit-run-context:1.10').content,
        /loadSettingsSnapshot/,
    )
    assert.match(
        unit('lazy-chat-bg-adapter:server-chat-commit-settings-digest:1.10').content,
        /inputSettingsContextDigest/,
    )
    assert.match(
        unit('lazy-chat-bg-adapter:server-chat-commit-status:1.10').content,
        /input-transform-unknown/,
    )
    assert.match(
        unit('lazy-chat-bg-adapter:server-chat-commit-missing-result:1.10').content,
        /input-transform-unknown/,
    )
    assert.match(
        unit('lazy-chat-bg-adapter:server-input-bundle-exports:1.10').content,
        /triggers, scripts/,
    )
    const resets = adapter.units.filter(candidate => (
        candidate.id.includes('server-chat-commit-')
        && candidate.id.endsWith('reset:1.10')
    ))
    assert.equal(resets.every(candidate => (
        candidate.content.includes('serverChatInputOwner.discardRecovery()')
    )), true)

    const clientImport = unit('lazy-chat-bg-adapter:server-commit-client-import:1.10')
    assert.doesNotMatch(clientImport.content, /inputCommandVersion/)
})

test('C3: committed-result client path hydrates canonical chat and skips legacy save effects', () => {
    const imports = unit('lazy-chat-bg-adapter:server-commit-client-import:1.10')
    const hydration = unit('lazy-chat-bg-adapter:server-commit-client-hydration:1.10')
    const foreground = unit('lazy-chat-bg-adapter:server-commit-client-found-result:1.10')
    const boot = unit('lazy-chat-bg-adapter:server-commit-boot-found-result:1.10')
    assert.match(imports.content, /hydrateServerCommittedOrchestration/)
    assert.match(imports.content, /adoptServerCommittedChat/)
    assert.match(hydration.content, /fetchOrchestrationControl/)
    assert.match(hydration.content, /state === 'revision_mismatch'/)
    assert.match(hydration.content, /projection\.currentRevision/)
    assert.match(hydration.content, /mergeTargetByOperation\.get\(operationId\)/)
    assert.match(hydration.content, /allowedCurrentRevisions/)
    assert.match(hydration.content, /orchestrationChatRevision/)
    assert.match(foreground.content, /serverChatCommitReceipt/)
    assert.match(foreground.content, /acknowledgeResultRevision/)
    assert.doesNotMatch(foreground.content, /persistMergedOrchestrationResult/)
    assert.doesNotMatch(foreground.content, /requestDurableSave/)
    assert.match(boot.content, /hydrateServerCommittedResult/)

    const snapshot = unit('lazy-chat-bg-adapter:server-chat-snapshot-read:1.10')
    const adoption = unit('lazy-chat-bg-adapter:server-committed-chat-adoption:1.10')
    assert.match(snapshot.content, /peekChatContentSnapshot/)
    assert.match(snapshot.content, /fetchChatContentSnapshot/)
    assert.match(snapshot.content, /rememberChatContentSnapshot/)
    assert.match(snapshot.content, /rememberChatSyncState/)
    assert.match(adoption.content, /peekChatContentSnapshot/)
    assert.match(adoption.content, /rememberChatContentSnapshot/)
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
