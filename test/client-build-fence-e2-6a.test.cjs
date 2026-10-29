'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')

const baseline = require('./fixtures/target-baseline-1.10.0.json')
const unitBaseline = require('./fixtures/target-baseline-1.10.0-units.json')
const coverage = require('../patches/target-coverage.cjs')
const { loadCatalog } = require('../src/catalog.cjs')
const { validateTargetCoverage } = require('../scripts/lib/target-coverage.cjs')

const PACK_ID = 'client-build-fence'
const PRE_E2_6A_ADDED_IDS = [
    'client-build-fence:server-helper-e2-2a-tests:1.16',
    'client-build-fence:node-storage-tests:1.16',
    'client-build-fence:plugin-storage-pending:1.16',
    'client-build-fence:plugin-storage-pending-tests:1.16',
    'client-build-fence:plugin-storage-dirty-tests:1.16',
    'client-build-fence:job-fetch-orphan-delete:1.16',
    'client-build-fence:job-fetch-tests:1.16',
    'client-build-fence:bootstrap-import:1.16',
    'client-build-fence:bootstrap-auto-sweep:1.16',
    'client-build-fence:bootstrap-tests:1.16',
    'client-build-fence:system-dashboard-archive-purge:1.16',
    'client-build-fence:system-dashboard-archive-purge-tests:1.16',
]
const PRE_E2_6A_UNITS_HASH = 'd92b8e5a7464a88b479cbdee6a88d69f970afabf948bc373c92694d28d50cfc6'

function digest(value) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

test.describe('[E2-6a] Fence the native backup import and snapshot restore calls', () => {
    test('[new] adds exactly the two 1.16.1 client fence units and records their coverage', () => {
        const catalog = loadCatalog()
        const pack = catalog.find(({ id }) => id === PACK_ID)
        assert.ok(pack)
        assert.equal(pack.version, '0.1.5')
        assert.deepEqual(pack.targets.pocketrisu, { verified: [], reviewing: ['1.16.1'] })
        assert.equal(pack.units.every((unit) => !Object.hasOwn(unit, 'targetVersions')), true)
        assert.equal(pack.units.length, 75)

        const oldIds = new Set([
            ...baseline.packs[PACK_ID].units110,
            ...PRE_E2_6A_ADDED_IDS,
        ])
        const addedUnits = pack.units.filter(({ id }) => !oldIds.has(id))
        const testFiles = [
            'server/node/clientBuildFence.e2-6a.test.ts',
            'src/lib/Setting/Pages/SystemBackup.e2-6a.test.ts',
            'src/ts/storage/nodeStorage.e2-6a.test.ts',
        ]
        const testFileSet = new Set(testFiles)
        const ownedTestUnits = addedUnits.filter(({ file, type }) => (
            type === 'owned' && testFileSet.has(file)
        ))
        const behaviorUnits = addedUnits.filter((unit) => !ownedTestUnits.includes(unit))
        assert.equal(behaviorUnits.length, 2)
        assert.deepEqual(
            behaviorUnits.map(({ file }) => file).sort(),
            ['src/lib/Setting/Pages/SystemBackup.svelte', 'src/ts/storage/nodeStorage.ts'],
        )
        assert.deepEqual(ownedTestUnits.map(({ file }) => file).sort(), testFiles)
        const entry = coverage[PACK_ID]?.['1.16.1']
        assert.ok(entry)
        const coverageIds = Object.keys(entry.added)
        assert.deepEqual(
            coverageIds.filter((id) => !PRE_E2_6A_ADDED_IDS.includes(id)).sort(),
            addedUnits.map(({ id }) => id).sort(),
        )
        for (const { id } of addedUnits) assert.match(entry.added[id] ?? '', /\S/)

        assert.deepEqual(validateTargetCoverage({
            catalog,
            coverage,
            baseline,
            packIds: [PACK_ID],
            unitBaseline,
        }), { ok: true, violations: [] })
    })

    test('[unchanged] preserves every pre-E2-6a client-build-fence unit byte-for-byte', () => {
        const pack = loadCatalog().find(({ id }) => id === PACK_ID)
        assert.ok(pack)
        const oldIds = new Set([
            ...baseline.packs[PACK_ID].units110,
            ...PRE_E2_6A_ADDED_IDS,
        ])
        const oldUnits = pack.units.filter(({ id }) => oldIds.has(id))
        assert.equal(oldUnits.length, 70)
        assert.equal(digest(oldUnits), PRE_E2_6A_UNITS_HASH)
    })
})
