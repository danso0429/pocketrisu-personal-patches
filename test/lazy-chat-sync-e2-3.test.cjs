'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const baseline = require('./fixtures/target-baseline-1.10.0.json')
const unitBaseline = require('./fixtures/target-baseline-1.10.0-units.json')
const coverage = require('../patches/target-coverage.cjs')
const { loadCatalog } = require('../src/catalog.cjs')
const { unitMatchesTarget } = require('../src/manager.cjs')
const { assertTargetVerified, evaluateTargetCompatibility } = require('../src/compatibility.cjs')
const { validateTargetCoverage } = require('../scripts/lib/target-coverage.cjs')

const PACK_ID = 'lazy-chat-sync'
const TARGET = { packageName: 'pocketrisu', packageVersion: '1.16.1' }

function packFrom(catalog = loadCatalog()) {
    const pack = catalog.find(({ id }) => id === PACK_ID)
    assert.ok(pack, 'lazy-chat-sync pack is present')
    return pack
}

function parseVersion(version) {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
    assert.ok(match, `expected a numeric semver, received ${version}`)
    return match.slice(1).map(Number)
}

test.describe('[E2-3b] Rebuild server chat-write durability over native 1.16.1', () => {
    test('[new] C0 declares only PocketRisu 1.16.1 under review and uses unscoped units', () => {
        const pack = packFrom()
        assert.deepEqual(pack.targets.pocketrisu, { verified: [], reviewing: ['1.16.1'] })
        assert.equal(
            pack.units.every((unit) => !Object.hasOwn(unit, 'targetVersions')),
            true,
            'every rebuilt unit must be unscoped once the pack is 1.16.1-only',
        )
    })

    test('[new] C0 records complete 1.16.1 coverage against the unit baseline', () => {
        const catalog = loadCatalog()
        assert.ok(coverage[PACK_ID]?.['1.16.1'], 'lazy-chat-sync has a 1.16.1 coverage entry')
        const result = validateTargetCoverage({
            catalog,
            coverage,
            baseline,
            unitBaseline,
            packIds: [PACK_ID],
        })
        assert.deepEqual(result, { ok: true, violations: [] })
    })

    test('[new] C0 selects no legacy full-file replacement on PocketRisu 1.16.1', () => {
        const pack = packFrom()
        const legacyWholeFileIds = new Set(
            baseline.packs[PACK_ID].units110.filter((id) => id.startsWith(`${PACK_ID}:replace:`)),
        )
        const selectedLegacyReplacements = pack.units
            .filter((unit) => unitMatchesTarget(unit, TARGET) && legacyWholeFileIds.has(unit.id))
            .map(({ id }) => id)
        assert.deepEqual(selectedLegacyReplacements, [])
    })

    test('[new] C0 advances only the patch component from the frozen pack version', () => {
        const pack = packFrom()
        const [baseMajor, baseMinor, basePatch] = parseVersion(baseline.packs[PACK_ID].version)
        const [major, minor, patch] = parseVersion(pack.version)
        assert.deepEqual([major, minor], [baseMajor, baseMinor])
        assert.ok(patch > basePatch, `${pack.version} must have a larger patch than ${baseline.packs[PACK_ID].version}`)
    })

    test('[new] u7 ordinary selection refuses the reviewing-only target', () => {
        const pack = packFrom()
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lazy-chat-sync-e2-3-'))
        try {
            fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'pocketrisu', version: '1.16.1' }))
            const result = evaluateTargetCompatibility(root, [pack])
            assert.equal(result.status, 'under-review')
            assert.throws(() => assertTargetVerified(result), { code: 'TARGET_REVIEW_REQUIRED' })
        } finally {
            fs.rmSync(root, { recursive: true, force: true })
        }
    })
})
