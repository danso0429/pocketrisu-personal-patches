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

test('canonical serializer owner graph composes and reverts to absent', () => {
    const baselines = new Map(manifest.units.map((unit) => [unit.file, null]))
    const plan = compose(manifest.units, baselines)
    assert.deepEqual(plan.collisions, [])
    assert.match(plan.outputs.get('src/ts/pagefold/canonicalTranscript.ts'), /encodePageFoldJsonString/)
    assert.match(plan.outputs.get('src/ts/pagefold/canonicalTranscript.test.ts'), /fakeHeader/)

    const byId = new Map(manifest.units.map((unit) => [unit.id, unit]))
    const reverted = new Map(plan.outputs)
    for (const id of [...plan.order].reverse()) {
        const unit = byId.get(id)
        reverted.set(unit.file, revertUnit(reverted.get(unit.file), unit))
    }
    for (const [file, baseline] of baselines) assert.equal(reverted.get(file), baseline, file)
})
