'use strict'

const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const core = require('../patches/kei-backup-restore-safety-core/manifest.cjs')
const standard = require('../patches/kei-backup-restore-safety-standard-adapter/manifest.cjs')
const lazy = require('../patches/kei-backup-restore-safety-lazy-adapter/manifest.cjs')
const meta = require('../patches/pocketrisu-kei/manifest.cjs')
const restoreSafety = require('../patches/kei-backup-restore-safety-core/files/server/node/restoreSafety.cjs')
const { loadCatalog } = require('../src/catalog.cjs')
const { packEtag, unitMatchesTarget } = require('../src/manager.cjs')
const { resolveSelection } = require('../src/resolver.cjs')

const target181 = { packageName: 'pocketrisu', packageVersion: '1.8.1' }
const target190 = { packageName: 'pocketrisu', packageVersion: '1.9.0' }
const unitText = (unit) => unit.managed ?? unit.content ?? ''
const lazyServer190 = fs.readFileSync(path.join(
    __dirname,
    '../patches/lazy-chat-sync/files-1.9/server/node/server.cjs',
), 'utf8')

test('K26 restore safety is a hidden exact-1.9 core with one resolved storage adapter', () => {
    const catalog = loadCatalog()
    assert.equal(core.userSelectable, false)
    assert.equal(standard.userSelectable, false)
    assert.equal(lazy.userSelectable, false)
    assert.equal(meta.version, '0.13.0')
    assert.equal(meta.requires.includes(core.id), true)

    const baseGraph = resolveSelection(catalog, [meta.id])
    assert.equal(baseGraph.resolvedIds.includes(standard.id), true)
    assert.equal(baseGraph.resolvedIds.includes(lazy.id), false)

    const lazyGraph = resolveSelection(catalog, [meta.id, 'lazy-chat-sync'])
    assert.equal(lazyGraph.resolvedIds.includes(standard.id), false)
    assert.equal(lazyGraph.resolvedIds.includes(lazy.id), true)

    for (const hidden of [core.id, standard.id, lazy.id]) {
        assert.throws(
            () => resolveSelection(catalog, [hidden]),
            (error) => error.code === 'INTERNAL_PACK_REQUESTED',
        )
    }
})

test('K26 owns no 1.8 payload and limits 1.9 edits to the native restore surfaces', () => {
    for (const manifest of [core, standard, lazy]) {
        assert.deepEqual(
            manifest.units.filter((unit) => unitMatchesTarget(unit, target181)),
            [],
        )
        assert.ok(manifest.units.some((unit) => unitMatchesTarget(unit, target190)))
    }

    assert.deepEqual(
        [...new Set(core.units.map((unit) => unit.file))],
        [
            'server/node/restoreSafety.cjs',
            'server/node/restoreSafety.test.ts',
            'src/ts/storage/restoreSafety.ts',
            'src/ts/storage/restoreSafety.test.ts',
            'src/ts/drive/backuplocal.ts',
            'src/lib/Setting/Pages/SystemBackup.svelte',
            'src/lib/Setting/ServerBackupList.svelte',
        ],
    )
    for (const adapter of [standard, lazy]) {
        assert.deepEqual(
            [...new Set(adapter.units.map((unit) => unit.file))],
            [
                'server/node/server.cjs',
                'src/ts/storage/nodeStorage.ts',
                'src/ts/storage/autoStorage.ts',
            ],
        )
    }
})

test('K26 force-new snapshot keeps ordinary throttle and all three destructive callers', () => {
    const combined = standard.units.map(unitText).join('\n')
    const lazyCombined = lazy.units.map(unitText).join('\n')
    assert.match(combined, /if \(!force\)/)
    assert.match(combined, /Preserve native ordinary rotation, including failure-path throttle/)
    assert.match(combined, /if \(protectedSnapshotKeys\.length === 0\)/)
    assert.match(combined, /const fitsByCount = i < maxCount/)
    assert.match(combined, /nextUniqueSnapshotKey/)
    assert.match(combined, /copyVerifiedSnapshot/)
    assert.match(combined, /protectedSnapshotKeys: \[\.\.\.protectedSnapshotKeys, backupKey\]/)
    assert.match(combined, /createBackupAndRotate\(\{ force: true \}\)/)
    assert.match(combined, /protectedSnapshotKeys: \[key\]/)
    assert.equal((combined.match(/prepareFreshRestoreSnapshot\(\{/g) ?? []).length, 2)
    assert.match(combined, /confirmationOwner: restoreConfirmationOwner/)
    assert.match(combined, /restoreTargetForLocalImport\(req\.headers\)/)
    assert.match(combined, /restoreTarget: 'server:' \+ filename/)
    assert.match(combined, /restoreTarget: 'snapshot:' \+ key/)
    assert.match(combined, /createDeferredAsyncIterable/)
    assert.match(combined, /if \(kvSize\(DB_BLOB_KEY\) !== null\)/)
    assert.match(combined, /A pristine server has nothing to overwrite/)
    assert.match(combined, /restoreSnapshotValue/)
    assert.match(lazyServer190, /commitSnapshotRestore\(\{/)
    assert.match(lazyServer190, /runTransaction: \(operation\) => sqliteDb\.transaction\(operation\)\(\)/)
    assert.match(lazyServer190, /kvCopyValue\(key, DB_BLOB_KEY\);[\s\S]*discardJournal: \(\) => kvDelPrefix\(CHAT_WRITE_JOURNAL_PREFIX\)/)
    assert.match(lazyServer190, /resetJournalMemory: \(\) => chatWriteJournal\.resetMemory\(\)/)
    const lazySnapshotSwap = lazy.units.find((unit) =>
        unit.id.endsWith('snapshot-restore-post-copy-rotation:1.9'))
    const lazySnapshotTrim = lazy.units.find((unit) =>
        unit.id.endsWith('snapshot-restore-post-commit-rotation:1.9'))
    assert.ok(lazySnapshotSwap)
    assert.ok(lazySnapshotTrim)
    assert.doesNotMatch(unitText(lazySnapshotSwap), /trimSnapshotsToLimits/)
    assert.match(unitText(lazySnapshotTrim), /try \{ trimSnapshotsToLimits\(\); \}/)
    assert.match(unitText(lazySnapshotTrim), /outside the DB\+journal/)
    assert.match(combined, /importBackupFromSource\(stream/)
    assert.match(combined, /isFreshSnapshotRequiredError/)
    assert.match(combined, /res\.status\(409\)/)
    assert.match(lazyCombined, /reconcileForFreshSnapshot/)
    assert.match(lazyCombined, /prepareLazyChatSnapshotOwner/)
    assert.match(lazyCombined, /readLazyChatSnapshotState/)
    assert.match(lazyCombined, /requireLazyChatSnapshotCompleteness/)
    assert.doesNotMatch(combined, /schedule|selective|missing.asset|boot.*snapshot/i)
})

test('K26 lazy node adapter composes after the complete optional BG node owner', () => {
    const expected = 'lazy-chat-bg-adapter:asset-upload-error-detail'
    const nodeUnits = lazy.units.filter((unit) => unit.file === 'src/ts/storage/nodeStorage.ts')
    assert.ok(nodeUnits.length > 0)
    for (const unit of nodeUnits) assert.equal(unit.after.includes(expected), true)
})

test('K26 core UIs retry only the same selected restore after structured failure', () => {
    const combined = core.units.map(unitText).join('\n')
    const uiRetries = core.units
        .filter((unit) => unit.id.endsWith('-ui-retry:1.9'))
        .map(unitText)
        .join('\n')
    assert.match(combined, /isFreshSnapshotRequiredError/)
    assert.match(combined, /restoreWithoutFreshSnapshotPrompt/)
    assert.match(combined, /acknowledgedRestoreOptions/)
    assert.match(combined, /forageStorage\.importBackup\(file, progress, options\)/)
    assert.match(combined, /restoreServerBackup\(backup\.filename, progress, options\)/)
    assert.match(combined, /await restore\(options\)/)
    assert.equal((uiRetries.match(/acknowledgedRestoreOptions\(error\)/g) ?? []).length, 3)
    assert.match(combined, /restoreSafetyHeaders\(options\)/)
})

test('K26 server helper makes keys collision-free and requires a bounded one-use target token', () => {
    assert.equal(restoreSafety.nextUniqueSnapshotKey({
        prefix: 'database/dbbackup-',
        now: 100_000,
        existingKeys: [
            'database/dbbackup-1000.bin',
            'database/dbbackup-1001.bin',
        ],
    }), 'database/dbbackup-1002.bin')
    assert.equal(restoreSafety.nextUniqueSnapshotKey({
        prefix: 'database/dbbackup-',
        now: 100_000,
        existingKeys: ['database/dbbackup-5000.bin'],
    }), 'database/dbbackup-5001.bin')
    let sequence = 0
    const owner = restoreSafety.createRestoreConfirmationOwner({
        token: () => `confirmation-${++sequence}`,
    })
    const token = owner.issue('snapshot:selected')
    const headers = {
        'x-risu-restore-without-fresh-snapshot': '1',
        'x-risu-restore-confirmation': token,
    }
    assert.equal(owner.consume(headers, 'snapshot:other'), false)
    assert.equal(owner.consume(headers, 'snapshot:selected'), true)
    assert.equal(owner.consume(headers, 'snapshot:selected'), false)
    assert.equal(restoreSafety.restoreTargetForLocalImport({
        'x-risu-restore-source-id': '42:1234',
    }), 'local:42:1234')
})

test('K26 helper, UI, and standard/lazy adapter changes affect their pack ETags', () => {
    for (const pack of [core, standard, lazy]) {
        const original = packEtag(pack)
        const mutated = {
            ...pack,
            units: pack.units.map((unit, index) => index === 0
                ? { ...unit, [unit.managed === undefined ? 'content' : 'managed']: `${unitText(unit)}\n` }
                : unit),
        }
        assert.notEqual(packEtag(mutated), original)
        assert.equal(packEtag(pack), original)
    }
})
