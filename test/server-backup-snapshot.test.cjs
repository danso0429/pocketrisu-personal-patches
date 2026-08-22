'use strict'

const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const core = require('../patches/server-backup-snapshot-core/manifest.cjs')
const standard = require('../patches/server-backup-snapshot-standard-adapter/manifest.cjs')
const lazy = require('../patches/server-backup-snapshot-lazy-adapter/manifest.cjs')
const { loadCatalog } = require('../src/catalog.cjs')
const { packEtag, unitMatchesTarget } = require('../src/manager.cjs')
const { resolveSelection } = require('../src/resolver.cjs')

const target181 = { packageName: 'pocketrisu', packageVersion: '1.8.1' }
const target190 = { packageName: 'pocketrisu', packageVersion: '1.9.0' }
const unitText = (manifest) => manifest.units
    .map((unit) => unit.managed ?? unit.content ?? '')
    .join('\n')

test('P1 admits one hidden P2 storage adapter without adding a user selection bit', () => {
    const catalog = loadCatalog()
    const absent = resolveSelection(catalog, ['lazy-chat-sync'])
    assert.equal(absent.resolvedIds.includes(core.id), false)
    assert.equal(absent.resolvedIds.includes(standard.id), false)
    assert.equal(absent.resolvedIds.includes(lazy.id), false)

    const standardGraph = resolveSelection(catalog, ['client-build-fence'])
    assert.equal(standardGraph.resolvedIds.includes(core.id), true)
    assert.equal(standardGraph.resolvedIds.includes(standard.id), true)
    assert.equal(standardGraph.resolvedIds.includes(lazy.id), false)

    const lazyGraph = resolveSelection(catalog, ['client-build-fence', 'lazy-chat-sync'])
    assert.equal(lazyGraph.resolvedIds.includes(core.id), true)
    assert.equal(lazyGraph.resolvedIds.includes(standard.id), false)
    assert.equal(lazyGraph.resolvedIds.includes(lazy.id), true)

    assert.ok(catalog.filter((pack) => pack.userSelectable !== false).length > 0)
    for (const hidden of [core.id, standard.id, lazy.id]) {
        assert.throws(
            () => resolveSelection(catalog, [hidden]),
            (error) => error.code === 'INTERNAL_PACK_REQUESTED',
        )
    }
})

test('every visible selection resolves P1 to exactly one P2 adapter', () => {
    const catalog = loadCatalog()
    const visible = catalog
        .filter((pack) => pack.userSelectable !== false)
        .map((pack) => pack.id)
    const counts = { absent: 0, standard: 0, lazy: 0 }

    for (let mask = 0; mask < (2 ** visible.length); mask += 1) {
        const requested = visible.filter((_, index) => mask & (2 ** index))
        const resolved = new Set(resolveSelection(catalog, requested).resolvedIds)
        const hasP1 = resolved.has('client-build-fence')
        const hasCore = resolved.has(core.id)
        const hasStandard = resolved.has(standard.id)
        const hasLazy = resolved.has(lazy.id)

        assert.equal(hasCore, hasP1)
        assert.equal(Number(hasStandard) + Number(hasLazy), hasP1 ? 1 : 0)
        if (!hasP1) counts.absent += 1
        else if (hasLazy) counts.lazy += 1
        else counts.standard += 1
    }

    const selectionCount = 2 ** visible.length
    assert.equal(counts.absent, selectionCount / 2)
    assert.equal(counts.standard + counts.lazy, selectionCount / 2)
    assert.ok(counts.standard > 0)
    assert.ok(counts.lazy > 0)
})

test('P2 is exact-1.9 and standard/lazy adapters own the same server semantics', () => {
    for (const manifest of [core, standard, lazy]) {
        assert.deepEqual(
            manifest.units.filter((unit) => unitMatchesTarget(unit, target181)),
            [],
        )
        assert.ok(manifest.units.some((unit) => unitMatchesTarget(unit, target190)))
    }
    assert.deepEqual(core.requires, ['client-build-fence'])
    assert.deepEqual(standard.requires, [core.id])
    assert.deepEqual(lazy.requires, [core.id, 'lazy-chat-sync'])
    assert.equal(standard.units.length, lazy.units.length)
    assert.deepEqual(
        standard.units.map((unit) => unit.file),
        lazy.units.map((unit) => unit.file),
    )
})

test('P2 pins one WAL reader and filesystem source for both backup destinations', () => {
    const coreText = unitText(core)
    const standardText = unitText(standard)
    const lazyText = unitText(lazy)

    assert.match(coreText, /snapshotDb\.exec\('BEGIN'\)/)
    assert.match(coreText, /SELECT 1 FROM sqlite_master/)
    assert.match(coreText, /manifest_chunks WHERE manifest_key/)
    assert.match(coreText, /copyPinnedFile/)
    assert.match(coreText, /sameSourceStat/)
    assert.match(coreText, /activeTokens\.size >= maxActive/)
    assert.match(coreText, /activeCount/)
    assert.match(coreText, /BACKUP_ENTRY_TOO_LARGE/)

    for (const text of [standardText, lazyText]) {
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
    for (const manifest of [core, standard, lazy]) {
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
