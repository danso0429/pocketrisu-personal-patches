'use strict'

const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const core = require('../patches/server-backup-snapshot-core/manifest.cjs')
const lazy = require('../patches/server-backup-snapshot-lazy-adapter/manifest.cjs')
const { loadCatalog } = require('../src/catalog.cjs')
const { packEtag, unitMatchesTarget } = require('../src/manager.cjs')
const { resolveSelection } = require('../src/resolver.cjs')

const target181 = { packageName: 'pocketrisu', packageVersion: '1.8.1' }
const target190 = { packageName: 'pocketrisu', packageVersion: '1.9.0' }
const unitText = (manifest) => manifest.units
    .map((unit) => unit.managed ?? unit.content ?? '')
    .join('\n')

test('P1 admits the hidden P2 core and lazy-storage adapter without a user selection bit', () => {
    const catalog = loadCatalog()
    const absent = resolveSelection(catalog, ['lazy-chat-sync'])
    assert.equal(absent.resolvedIds.includes(core.id), false)
    assert.equal(absent.resolvedIds.includes(lazy.id), false)

    const lazyGraph = resolveSelection(catalog, ['client-build-fence', 'lazy-chat-sync'])
    assert.equal(lazyGraph.resolvedIds.includes(core.id), true)
    assert.equal(lazyGraph.resolvedIds.includes(lazy.id), true)

    assert.ok(catalog.filter((pack) => pack.userSelectable !== false).length > 0)
    for (const hidden of [core.id, lazy.id]) {
        assert.throws(
            () => resolveSelection(catalog, [hidden]),
            (error) => error.code === 'INTERNAL_PACK_REQUESTED',
        )
    }
})

test('every visible selection resolves the P2 adapter only with P1 and lazy storage', () => {
    const catalog = loadCatalog()
    const visible = catalog
        .filter((pack) => pack.userSelectable !== false)
        .map((pack) => pack.id)

    for (let mask = 0; mask < (2 ** visible.length); mask += 1) {
        const requested = visible.filter((_, index) => mask & (2 ** index))
        const resolved = new Set(resolveSelection(catalog, requested).resolvedIds)
        const hasP1 = resolved.has('client-build-fence')
        assert.equal(resolved.has(core.id), hasP1)
        assert.equal(resolved.has(lazy.id), hasP1 && resolved.has('lazy-chat-sync'))
    }
})

test('P2 owns no 1.8 payload and its lazy adapter requires lazy storage', () => {
    for (const manifest of [core, lazy]) {
        assert.deepEqual(
            manifest.units.filter((unit) => unitMatchesTarget(unit, target181)),
            [],
        )
        assert.ok(manifest.units.some((unit) => unitMatchesTarget(unit, target190)))
    }
    assert.deepEqual(core.requires, ['client-build-fence'])
    assert.deepEqual(lazy.requires, [core.id, 'lazy-chat-sync'])
})

test('P2 pins one WAL reader and filesystem source for both backup destinations', () => {
    const coreText = unitText(core)
    const lazyText = unitText(lazy)

    assert.match(coreText, /snapshotDb\.exec\('BEGIN'\)/)
    assert.match(coreText, /SELECT 1 FROM sqlite_master/)
    assert.match(coreText, /manifest_chunks WHERE manifest_key/)
    assert.match(coreText, /copyPinnedFile/)
    assert.match(coreText, /sameSourceStat/)
    assert.match(coreText, /activeTokens\.size >= maxActive/)
    assert.match(coreText, /activeCount/)
    assert.match(coreText, /BACKUP_ENTRY_TOO_LARGE/)

    for (const text of [lazyText]) {
        assert.match(text, /capturePointInTimeBackupSource/)
        assert.match(text, /queueStorageOperation\(async \(\) =>/)
        assert.match(text, /reader: backupSource\.snapshot/)
        assert.match(text, /migrateLegacy: false/)
        assert.match(text, /readPointInTimeBackupEntry/)
        assert.match(text, /totalBackupFramedSize/)
        assert.match(text, /app\.get\('\/api\/backup\/export'/)
        assert.match(text, /app\.post\('\/api\/backup\/server\/save'/)
        assert.match(text, /await backupSource\?\.close\(\)/)
        assert.match(text, /await backupSourceManager\.sweep\(\)/)
        assert.match(text, /BACKUP_SOURCE_MAINTENANCE_BUSY/)
        assert.match(text, /await destroyBackupWritable\(writeStream\)/)
    }
})

test('exact 1.10 maintenance guard preserves purge, disk-spill, and both checkpoint barriers', () => {
    const fragment = fs.readFileSync(path.join(
        __dirname,
        '../patches/server-backup-snapshot-core/fragments/maintenance-gate-1.10.cjs.txt',
    ), 'utf8')
    assert.match(fragment, /preDbSize \* 2\.2/)
    assert.match(fragment, /temp_store = FILE/)
    assert.match(fragment, /temp_store = MEMORY/)
    assert.equal((fragment.match(/pointInTimeBackupMaintenanceConflict\(\)/g) ?? []).length, 2)
    assert.equal((fragment.match(/BACKUP_SOURCE_MAINTENANCE_BUSY/g) ?? []).length, 2)
    assert.match(fragment, /post-VACUUM checkpoint failed/)

    const lazy1100 = lazy.units.filter((unit) =>
        unit.targetVersions?.pocketrisu?.includes('1.10.0')
    )
    assert.ok(lazy1100.some((unit) => unit.id.endsWith('maintenance-gate:1.10')))
    assert.ok(lazy1100.some((unit) => unit.id.endsWith('startup-pin-sweep:1.10')))
})

test('every P2 core and adapter payload contributes to its pack ETag', () => {
    for (const manifest of [core, lazy]) {
        const original = packEtag(manifest)
        for (let unitIndex = 0; unitIndex < manifest.units.length; unitIndex += 1) {
            const mutated = {
                ...manifest,
                units: manifest.units.map((unit, index) => {
                    if (index !== unitIndex) return unit
                    const field = unit.managed === undefined ? 'content' : 'managed'
                    assert.equal(typeof unit[field], 'string')
                    return { ...unit, [field]: unit[field] + '\n' }
                }),
            }
            assert.notEqual(packEtag(mutated), original)
        }
        assert.equal(packEtag(manifest), original)
    }
})
