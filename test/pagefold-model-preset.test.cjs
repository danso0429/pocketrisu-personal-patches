'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { compose, revertUnit } = require('../src/compose.cjs')
const { loadCatalog } = require('../src/catalog.cjs')
const manifest = require('../patches/pagefold-model-preset/manifest.cjs')

test('PageFold prototype is exact-1.10 reviewing and excluded from the catalog', () => {
    assert.equal(manifest.id, 'pagefold-model-preset')
    assert.equal(manifest.userSelectable, true)
    assert.equal(manifest.allDefault, false)
    assert.deepEqual(manifest.targets.pocketrisu, { verified: [], reviewing: ['1.10.0'] })
    assert.match(manifest.source, /Independent implementation/)
    assert.equal(loadCatalog().some((pack) => pack.id === manifest.id), false)
    assert.ok(manifest.units.every((unit) =>
        unit.targetVersions?.pocketrisu?.length === 1
        && unit.targetVersions.pocketrisu[0] === '1.10.0'
    ))
})

test('prototype dependency and owned-file graph composes and reverts exactly', () => {
    const baselines = new Map()
    for (const unit of manifest.units) {
        if (unit.type === 'owned') {
            if (!baselines.has(unit.file)) baselines.set(unit.file, null)
            continue
        }
        const prior = baselines.get(unit.file) ?? ''
        baselines.set(unit.file, prior + unit.anchor + `# synthetic-boundary:${unit.id}\n`)
    }
    const plan = compose(manifest.units, baselines)
    assert.deepEqual(plan.collisions, [])
    assert.match(plan.outputs.get('package.json'), /"pdf-lib": "1\.17\.1"/)
    assert.match(plan.outputs.get('pnpm-lock.yaml'), /pdf-lib@1\.17\.1/)
    assert.match(plan.outputs.get('src/ts/pagefold/canonicalTranscript.ts'), /encodePageFoldJsonString/)
    assert.match(plan.outputs.get('src/ts/pagefold/canonicalTranscript.test.ts'), /fakeHeader/)
    assert.match(plan.outputs.get('server/node/pageFoldPdfService.cjs'), /maxPages: 8/)
    assert.match(plan.outputs.get('server/node/pageFoldPdfWorker.cjs'), /ActualText/)
    assert.match(plan.outputs.get('server/node/pageFoldStructuralPaidRunner.cjs'), /const MAX_CALLS = 21/)
    assert.match(plan.outputs.get('server/node/pageFoldStructuralPaidRunner.cjs'), /const MAX_OUTPUT_CONTROLS = 0/)
    assert.match(plan.outputs.get('server/node/pageFoldStructuralPaidRunner.cjs'), /STRUCTURAL_ORACLE_V5/)
    assert.match(plan.outputs.get('server/node/pageFoldStructuralPaidRunner.test.ts'), /resumes an exact two-pass decision/)

    const byId = new Map(manifest.units.map((unit) => [unit.id, unit]))
    const reverted = new Map(plan.outputs)
    for (const id of [...plan.order].reverse()) {
        const unit = byId.get(id)
        reverted.set(unit.file, revertUnit(reverted.get(unit.file), unit))
    }
    for (const [file, baseline] of baselines) assert.equal(reverted.get(file), baseline, file)
})
