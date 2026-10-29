'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')

const baseline = require('./fixtures/target-baseline-1.10.0.json')
const unitBaseline = require('./fixtures/target-baseline-1.10.0-units.json')
const coverage = require('../patches/target-coverage.cjs')
const { loadCatalog } = require('../src/catalog.cjs')
const { stableStringify } = require('../src/manager.cjs')
const { validateTargetCoverage } = require('../scripts/lib/target-coverage.cjs')

const PACK_ID = 'server-backup-snapshot-lazy-adapter'
const PREVIOUS_IDS = baseline.packs[PACK_ID].units110
const COMPAT_ID = `${PACK_ID}:owned:test:compat:backup-point-in-time-test-ts:1.16`
const BLIND_COMPAT_ID = `${PACK_ID}:owned:test:compat:server-backup-snapshot-lazy-adapter-e2-6b-test-ts:1.16`

function unitHash(unit) {
    const { targetVersions: _targetVersions, ...unscoped } = unit
    return crypto.createHash('sha256').update(stableStringify(unscoped)).digest('hex')
}

test.describe('[E2-6b] Rebase the snapshot lazy adapter onto PocketRisu 1.16.1', () => {
    test('[new] C0 declares only reviewing 1.16.1, preserves all nine behavior unit ids, and owns the restored compat test', () => {
        const catalog = loadCatalog()
        const pack = catalog.find(({ id }) => id === PACK_ID)
        assert.ok(pack)
        assert.deepEqual(pack.targets.pocketrisu, { verified: [], reviewing: ['1.16.1'] })
        assert.equal(pack.units.every((unit) => !Object.hasOwn(unit, 'targetVersions')), true)
        assert.deepEqual(
            pack.units.filter(({ id }) => PREVIOUS_IDS.includes(id)).map(({ id }) => id),
            PREVIOUS_IDS,
            'downstream after/requires edges retain the nine established ids and their order',
        )
        const compat = pack.units.find(({ id }) => id === COMPAT_ID)
        assert.ok(compat, 'b6 restores backup-point-in-time.test.ts as an adapter-owned unit')
        assert.equal(compat.type, 'owned')
        assert.equal(compat.file, 'test/compat/backup-point-in-time.test.ts')
        const blindCompat = pack.units.find(({ id }) => id === BLIND_COMPAT_ID)
        assert.ok(blindCompat, 'the adapter owns its E2-6b compat test')
        assert.equal(blindCompat.type, 'owned')
        assert.equal(blindCompat.file, 'test/compat/server-backup-snapshot-lazy-adapter.e2-6b.test.ts')

        const entry = coverage[PACK_ID]?.['1.16.1']
        assert.ok(entry)
        assert.deepEqual(entry.retained, PREVIOUS_IDS)
        assert.deepEqual(entry.replaced, {})
        assert.deepEqual(entry.retired, {})
        assert.deepEqual(Object.keys(entry.added).sort(), [COMPAT_ID, BLIND_COMPAT_ID].sort())
        assert.match(entry.added[COMPAT_ID], /\S/)
        assert.match(entry.added[BLIND_COMPAT_ID], /\S/)
        assert.deepEqual(Object.keys(entry.rewritten).sort(), [...PREVIOUS_IDS].sort())
        for (const reason of Object.values(entry.rewritten)) assert.match(reason, /\S/)
        assert.deepEqual(validateTargetCoverage({
            catalog,
            coverage,
            baseline,
            unitBaseline,
            packIds: [PACK_ID],
        }), { ok: true, violations: [] })
    })

    test('[unchanged] C2 leaves every not-yet-rebased pack on its frozen 1.10.0 unit hashes', () => {
        const catalog = loadCatalog()
        for (const pack of catalog) {
            if (
                pack.id === PACK_ID
                || pack.id === 'lazy-chat-bg-adapter'
                || Object.hasOwn(coverage[pack.id] ?? {}, '1.16.1')
            ) continue
            const expected = unitBaseline.packs[pack.id]
            if (!expected) continue
            for (const unit of pack.units) {
                if (!Object.hasOwn(expected, unit.id)) continue
                assert.equal(unitHash(unit), expected[unit.id], unit.id)
            }
        }
    })
})
