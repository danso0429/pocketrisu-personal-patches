'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const baseline = require('./fixtures/target-baseline-1.10.0.json')
const unitBaseline = require('./fixtures/target-baseline-1.10.0-units.json')
const coverage = require('../patches/target-coverage.cjs')
const { loadCatalog } = require('../src/catalog.cjs')
const { unitMatchesTarget } = require('../src/manager.cjs')
const { validateTargetCoverage } = require('../scripts/lib/target-coverage.cjs')

const PACK_ID = 'server-backup-snapshot-core'
const LAZY_ID = 'server-backup-snapshot-lazy-adapter'
const COMPAT_IDS = [
    'server-backup-snapshot-core:owned:test:compat:backup-point-in-time-test-ts:1.9',
    'server-backup-snapshot-core:owned:test:compat:storage-reset-b1a-test-ts:1.9',
    'server-backup-snapshot-core:owned:test:compat:session-reset-b2-test-ts:1.9',
    'server-backup-snapshot-core:owned:test:compat:reset-orphans-b3-test-ts:1.9',
]
const REWRITTEN_IDS = [
    'server-backup-snapshot-core:owned:server:node:backupSnapshot-cjs:1.9',
    'server-backup-snapshot-core:owned:server:node:backupSnapshot-test-ts:1.9',
]

test.describe('[E2-2b] Rebase the server backup snapshot core onto PocketRisu 1.16.1', () => {
    test('[new] the core selects seven unscoped units and its coverage retires only four compat tests', () => {
        const catalog = loadCatalog()
        const pack = catalog.find(({ id }) => id === PACK_ID)
        assert.ok(pack)
        assert.equal(pack.version, '0.1.8')
        assert.deepEqual(pack.targets.pocketrisu, { verified: [], reviewing: ['1.16.1'] })
        assert.deepEqual(pack.requires, ['client-build-fence'])
        assert.deepEqual(pack.autoWhen, { all: ['client-build-fence'] })
        assert.equal(pack.units.every((unit) => !Object.hasOwn(unit, 'targetVersions')), true)

        const target = { packageName: 'pocketrisu', packageVersion: '1.16.1' }
        const expectedRetained = baseline.packs[PACK_ID].units110
            .filter((unitId) => !COMPAT_IDS.includes(unitId))
        assert.deepEqual(
            pack.units.filter((unit) => unitMatchesTarget(unit, target)).map(({ id }) => id),
            expectedRetained,
        )

        const entry = coverage[PACK_ID]?.['1.16.1']
        assert.ok(entry)
        assert.deepEqual(entry.retained, expectedRetained)
        assert.deepEqual(entry.replaced, {})
        assert.deepEqual(entry.added, {})
        assert.deepEqual(Object.keys(entry.retired).sort(), [...COMPAT_IDS].sort())
        assert.deepEqual(Object.keys(entry.rewritten).sort(), [...REWRITTEN_IDS].sort())
        for (const reason of [...Object.values(entry.retired), ...Object.values(entry.rewritten)]) {
            assert.match(reason, /\S/)
        }
        assert.deepEqual(validateTargetCoverage({
            catalog,
            coverage,
            baseline,
            unitBaseline,
            packIds: [PACK_ID],
        }), { ok: true, violations: [] })
    })

    test('[unchanged] the lazy adapter keeps its 1.10.0 unit ids', () => {
        const pack = loadCatalog().find(({ id }) => id === LAZY_ID)
        assert.ok(pack)
        const units110 = baseline.packs[LAZY_ID].units110
        assert.deepEqual(
            pack.units.map(({ id }) => id).filter((unitId) => units110.includes(unitId)),
            units110,
        )
    })
})
