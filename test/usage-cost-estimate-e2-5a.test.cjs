'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const baseline = require('./fixtures/target-baseline-1.10.0.json')
const unitBaseline = require('./fixtures/target-baseline-1.10.0-units.json')
const coverage = require('../patches/target-coverage.cjs')
const { loadCatalog } = require('../src/catalog.cjs')
const { evaluateTargetCompatibility, assertTargetVerified } = require('../src/compatibility.cjs')
const { stableStringify, unitMatchesTarget } = require('../src/manager.cjs')
const { validateTargetCoverage } = require('../scripts/lib/target-coverage.cjs')

const ROOT = path.resolve(__dirname, '..')
const IN_SCOPE = new Set(['usage-cost-estimate', 'pagefold-model-preset', 'pagefold-bg-adapter'])

function unitHash(unit) {
    const { targetVersions: _targetVersions, ...unscoped } = unit
    return crypto.createHash('sha256').update(stableStringify(unscoped)).digest('hex')
}

test.describe('[E2-5a] Rebase usage-cost-estimate onto PocketRisu 1.16.1', () => {
    test('[new] B5 removes the last PageFold artifacts and preserves the remaining computed after order', () => {
        assert.equal(fs.existsSync(path.join(ROOT, 'patches/pagefold-model-preset')), false,
            'pagefold-model-preset directory still exists')
        assert.equal(fs.existsSync(path.join(ROOT, 'test/pagefold-model-preset.test.cjs')), false)

        const catalog = loadCatalog()
        const pack = catalog.find(({ id }) => id === 'usage-cost-estimate')
        assert.ok(pack)
        const related = ['bg-preserve', 'lazy-chat-bg-adapter', 'log-load-performance']
            .flatMap((id) => catalog.find((candidate) => candidate.id === id).units)
        for (const unit of pack.units) {
            assert.equal(unit.after?.some((id) => id.startsWith('pagefold-model-preset:')) ?? false, false, unit.id)
            if (Object.hasOwn(unit, 'after')) {
                assert.deepEqual(unit.after,
                    related.filter((prior) => prior.file === unit.file).map(({ id }) => id), unit.id)
            }
        }
    })

    test('[new] C0/C1/C2 declares only reviewing 1.16.1, has unscoped units, valid coverage, and ordinary install refusal', () => {
        const pack = loadCatalog().find(({ id }) => id === 'usage-cost-estimate')
        assert.ok(pack)
        assert.deepEqual(pack.targets.pocketrisu, { verified: [], reviewing: ['1.16.1'] })
        assert.equal(pack.units.every((unit) => !Object.hasOwn(unit, 'targetVersions')), true)
        assert.deepEqual(validateTargetCoverage({
            catalog: loadCatalog(), coverage, baseline, packIds: [pack.id], unitBaseline,
        }), { ok: true, violations: [] })

        const targetRoot = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'e2-5-target-'))
        try {
            fs.writeFileSync(path.join(targetRoot, 'package.json'), JSON.stringify({
                name: 'pocketrisu', version: '1.16.1',
            }))
            const compatibility = evaluateTargetCompatibility(targetRoot, [pack])
            assert.equal(compatibility.status, 'under-review')
            assert.throws(() => assertTargetVerified(compatibility),
                (error) => error.code === 'TARGET_REVIEW_REQUIRED')
        } finally {
            fs.rmSync(targetRoot, { recursive: true, force: true })
        }
    })

    test('[new] a3 retires the redundant model-job units because native 1.16.1 owns model storage', () => {
        const pack = loadCatalog().find(({ id }) => id === 'usage-cost-estimate')
        assert.ok(pack)
        assert.deepEqual(
            pack.units.filter((unit) => unit.file === 'server/node/model-jobs.cjs'
                || unit.file === 'server/node/model-jobs.test.ts').map(({ id }) => id),
            [],
        )
        const retired = coverage[pack.id]?.['1.16.1']?.retired ?? {}
        for (const id of [
            'usage-cost-estimate:job-model-route:1.10',
            'usage-cost-estimate:job-model-test-input:1.10',
            'usage-cost-estimate:job-model-test-readback:1.10',
        ]) assert.equal(typeof retired[id], 'string', id)
    })

    test('[unchanged] C2/C3 untouched unre-based packs retain frozen 1.10 unit hashes', () => {
        const target = { packageName: 'pocketrisu', packageVersion: '1.10.0' }
        for (const pack of loadCatalog()) {
            if (IN_SCOPE.has(pack.id) || Object.hasOwn(coverage[pack.id] ?? {}, '1.16.1')) continue
            // Its computed after lists already changed when lazy-chat-sync was rebased in E2-3.
            if (pack.id === 'lazy-chat-bg-adapter') continue
            const selected = pack.units.filter((unit) => unitMatchesTarget(unit, target))
            assert.deepEqual(selected.map(({ id }) => id), baseline.packs[pack.id].units110, pack.id)
            for (const unit of selected) {
                assert.equal(unitHash(unit), unitBaseline.packs[pack.id][unit.id], unit.id)
            }
        }
    })
})
