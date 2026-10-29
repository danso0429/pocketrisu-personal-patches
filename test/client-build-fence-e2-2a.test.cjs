'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const baseline = require('./fixtures/target-baseline-1.10.0.json')
const unitBaseline = require('./fixtures/target-baseline-1.10.0-units.json')
const coverage = require('../patches/target-coverage.cjs')
const { loadCatalog } = require('../src/catalog.cjs')
const { compose } = require('../src/compose.cjs')
const { unitMatchesTarget } = require('../src/manager.cjs')
const { validateTargetCoverage } = require('../scripts/lib/target-coverage.cjs')

const PACK_ID = 'client-build-fence'
const target = (packageVersion) => ({ packageName: 'pocketrisu', packageVersion })

function selected(pack, version) {
    return pack.units.filter((unit) => unitMatchesTarget(unit, target(version)))
}

function loadCommonJs(source) {
    const module = { exports: {} }
    Function('require', 'module', 'exports', source)(require, module, module.exports)
    return module.exports
}

test.describe('[E2-2a] Rebase the client build fence onto PocketRisu 1.16.1', () => {
    test('[new] 1.16.1 selects a complete dependency graph and composes its fence helper', () => {
        const pack = loadCatalog().find(({ id }) => id === PACK_ID)
        assert.ok(pack, 'client-build-fence pack is present')
        assert.equal(pack.version, '0.1.5')
        assert.deepEqual(pack.targets.pocketrisu, { verified: [], reviewing: ['1.16.1'] })
        assert.equal(pack.units.every((unit) => !Object.hasOwn(unit, 'targetVersions')), true)

        const units116 = selected(pack, '1.16.1')
        assert.ok(units116.length > 58, '1.16.1 selects all retained ids plus added units')
        const selectedIds = new Set(units116.map(({ id }) => id))
        for (const unit of units116) {
            for (const dependency of unit.requires ?? []) {
                assert.equal(selectedIds.has(dependency), true, `${unit.id} requires ${dependency}`)
            }
        }

        const graphUnits = units116.map((unit) => ({
            id: unit.id,
            file: `__graph__/${unit.id}.txt`,
            type: 'owned',
            content: `${unit.id}\n`,
            requires: unit.requires,
            before: unit.before,
            after: unit.after,
        }))
        assert.doesNotThrow(() => compose(graphUnits, new Map()))

        const fenceUnits = units116.filter(({ file }) => file === 'server/node/clientBuildFence.cjs')
        const plan = compose(fenceUnits, new Map())
        const fence = loadCommonJs(plan.outputs.get('server/node/clientBuildFence.cjs'))
        assert.equal(typeof fence.isWriterRoute, 'function')
    })

    test('[new] coverage retains all 58 baseline ids, records rewrites, and adds only new units', () => {
        const catalog = loadCatalog()
        const result = validateTargetCoverage({
            catalog,
            coverage,
            baseline,
            packIds: [PACK_ID],
            unitBaseline,
        })
        assert.deepEqual(result, { ok: true, violations: [] })

        const entry = coverage[PACK_ID]?.['1.16.1']
        assert.ok(entry, 'client-build-fence has 1.16.1 coverage')
        const retained = entry.retained === 'all' ? baseline.packs[PACK_ID].units110 : entry.retained
        assert.deepEqual(retained, baseline.packs[PACK_ID].units110)
        assert.deepEqual(entry.replaced, {})
        assert.deepEqual(entry.retired, {})
        for (const unitId of [
            'client-build-fence:global-dirty-probe:1.9',
            'client-build-fence:node-auth-fetch:1.9',
            'client-build-fence:node-session-accept:1.9',
            'client-build-fence:node-session-fetch:1.9',
        ]) assert.match(entry.rewritten?.[unitId] ?? '', /\S/, unitId)
        assert.ok(Object.keys(entry.added).length > 0)
    })

    test('[new] the fence declaration is 1.16.1-only and all units are unscoped', () => {
        const pack = loadCatalog().find(({ id }) => id === PACK_ID)
        assert.ok(pack)
        assert.equal(pack.version, '0.1.5')
        assert.deepEqual(pack.targets.pocketrisu, { verified: [], reviewing: ['1.16.1'] })
        assert.equal(pack.units.every((unit) => !Object.hasOwn(unit, 'targetVersions')), true)
    })

    test('[new] composed 1.16.1 routing covers new writers and preserves normalization and exclusions', () => {
        const pack = loadCatalog().find(({ id }) => id === PACK_ID)
        assert.ok(pack)
        const composeFence = (version) => {
            const units = selected(pack, version)
                .filter(({ file }) => file === 'server/node/clientBuildFence.cjs')
            const output = compose(units, new Map()).outputs.get('server/node/clientBuildFence.cjs')
            assert.equal(typeof output, 'string', `${version} composes the fence helper`)
            return loadCommonJs(output)
        }
        const newFence = composeFence('1.16.1')

        const newRoutes = [
            ['POST', '/api/risu-account/prepare'],
            ['POST', '/api/risu-account/download'],
            ['POST', '/api/risu-account/cancel'],
            ['POST', '/api/risu-account/apply'],
            ['POST', '/api/characters/cha_123/archive'],
            ['POST', '/api/characters/archive-batch'],
            ['POST', '/api/characters/cha_123/activate'],
            ['DELETE', '/api/characters/cha_123/archive'],
            ['POST', '/api/db/archive/purge-orphans'],
            ['POST', '/api/db/assets/auto-sweep'],
            ['PATCH', '/api/asset-manifests/owner/character/own_456'],
        ]
        for (const [method, path] of newRoutes) {
            assert.equal(newFence.isWriterRoute({ method, path }), true, `${method} ${path}`)
        }

        assert.equal(newFence.isWriterRoute({ method: 'POST', path: '/API/CHARACTERS/A%2FB-1_2.3~4/ARCHIVE/' }), true)
        assert.equal(newFence.isWriterRoute({ method: 'PATCH', path: '/api/asset-manifests/owner/custom_kind/id-with-dashes/' }), true)
        assert.equal(newFence.isWriterRoute({ method: 'POST', path: '/api/characters//archive' }), false)
        assert.equal(newFence.isWriterRoute({ method: 'PATCH', path: '/api/asset-manifests/owner/kindOnly' }), false)
        assert.equal(newFence.isWriterRoute({ method: 'PATCH', path: '/api/asset-manifests/owner/k/o/extra' }), false)
        assert.equal(newFence.isWriterRoute({ method: 'GET', path: '/api/risu-account/prepare' }), false)
        assert.equal(newFence.isWriterRoute({ method: 'POST', path: '/api/db/assets/auto-sweep?dryRun=false' }), false)
        for (const path of ['/api/termux-notify', '/api/asset-manifests/resolve', '/api/db/flush', '/api/model-jobs', '/proxy2']) {
            assert.equal(newFence.isWriterRoute({ method: 'POST', path }), false, path)
        }
    })
})
