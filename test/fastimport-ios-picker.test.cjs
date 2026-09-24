'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { compose, revertUnit } = require('../src/compose.cjs')
const { loadCatalog } = require('../src/catalog.cjs')
const { FASTIMPORT_POLICY } = require('../scripts/fastimport-ios-migration.cjs')

const pack = loadCatalog().find((entry) => entry.id === 'fastimport-ios-picker')

test('FastImport iOS picker is one exact-1.10 root owner', () => {
    assert.ok(pack)
    assert.equal(pack.userSelectable, true)
    assert.deepEqual(pack.targets.pocketrisu, { verified: ['1.10.0'], reviewing: [] })
    assert.equal(pack.units.length, 4)
    assert.equal(
        pack.units.filter((unit) => unit.targetVersions?.pocketrisu?.includes('1.10.0')).length,
        4,
    )
})

test('runtime compatibility composes and reverts without owning plugin data', () => {
    const baseline = `import { pluginCodeTranspiler } from "./apiV3/transpiler";

export async function loadPlugins() {
    const db = getDatabase()
    const enabledPlugins = safeStructuredClone(db.plugins).filter((p: RisuPlugin) => p.enabled)
    const pluginV2 = enabledPlugins.filter((a: RisuPlugin) => a.version === 2 || a.version === '2.1')
    const pluginV3 = enabledPlugins.filter((a: RisuPlugin) => a.version === '3.0')
}
`
    const files = new Map([
        ['src/ts/plugins/plugins.svelte.ts', baseline],
        ['src/ts/plugins/fastImportIOSPicker.ts', null],
        ['src/ts/plugins/fastImportIOSPicker.test.ts', null],
    ])
    const plan = compose(pack.units, files)
    assert.deepEqual(plan.collisions, [])
    assert.match(plan.outputs.get('src/ts/plugins/plugins.svelte.ts'), /compatiblePlugins/)
    assert.match(plan.outputs.get('src/ts/plugins/fastImportIOSPicker.ts'), /crypto\.subtle\.digest/)
    assert.match(plan.outputs.get('src/ts/plugins/fastImportIOSPicker.test.ts'), /picker synchronous/)

    const helper = plan.outputs.get('src/ts/plugins/fastImportIOSPicker.ts')
    assert.match(helper, new RegExp(FASTIMPORT_POLICY.originalScriptSha256))
    assert.match(helper, new RegExp(FASTIMPORT_POLICY.patchedScriptSha256))
    assert.equal(helper.includes(FASTIMPORT_POLICY.needle), true)
    assert.equal(helper.includes(FASTIMPORT_POLICY.replacement), true)
    assert.equal(pack.units.some((unit) => unit.file.includes('database')), false)

    const byId = new Map(pack.units.map((unit) => [unit.id, unit]))
    const reverted = new Map(plan.outputs)
    for (const id of [...plan.order].reverse()) {
        const unit = byId.get(id)
        reverted.set(unit.file, revertUnit(reverted.get(unit.file), unit))
    }
    assert.equal(reverted.get('src/ts/plugins/plugins.svelte.ts'), baseline)
    assert.equal(reverted.get('src/ts/plugins/fastImportIOSPicker.ts'), null)
    assert.equal(reverted.get('src/ts/plugins/fastImportIOSPicker.test.ts'), null)
})
