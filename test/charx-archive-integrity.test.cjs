'use strict'

const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')
const { compose, revertUnit } = require('../src/compose.cjs')
const { loadCatalog } = require('../src/catalog.cjs')
const { resolveSelection } = require('../src/resolver.cjs')

const root = path.join(__dirname, '..')
const pack = loadCatalog().find((entry) => entry.id === 'charx-archive-integrity')
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8')

function exact110Units() {
    return pack.units.filter((unit) =>
        unit.targetVersions?.pocketrisu?.includes('1.10.0')
    )
}

function exact110Baselines() {
    return new Map([
        ['package.json', `{
  "dependencies": {
    "@types/trusted-types": "^2.0.7",
    "acorn": "^8.15.0"
  }
}
`],
        ['pnpm-lock.yaml', `lockfileVersion: '9.0'

importers:
  .:
    dependencies:
      '@types/trusted-types':
        specifier: ^2.0.7
        version: 2.0.7

packages:
  accepts@1.3.8:
    resolution: {integrity: sha512-PYAthTa2m2VKxuvSD3DPC/Gy+U+sOA1LAuT8mkmRuvw+NACSaeXEQ+NHcVF7rONl6qcaxV3Uuemwawk+7+SJLw==}

snapshots:
  accepts@1.3.8:
    dependencies:
      mime-types: 2.1.35
`],
        ['src/ts/process/processzip.ts', read('patches/charx-archive-integrity/anchors-1.10/src/ts/process/processzip.ts')],
        ['src/ts/characterCards.ts', read('patches/character-import-ux/anchors/src/ts/characterCards.ts')],
        ['src/ts/process/charxArchive.ts', null],
        ['src/ts/process/charxImportSession.ts', null],
    ])
}

test('CharX integrity is a visible 1.10 review-only hardening owner', () => {
    assert.ok(pack)
    assert.equal(pack.userSelectable, true)
    assert.equal(Object.hasOwn(pack, 'presetDefaults'), false)
    assert.deepEqual(pack.targets.pocketrisu, { verified: ['1.10.0'], reviewing: [] })
    assert.ok(exact110Units().length > 0)
    assert.equal(exact110Units().length, pack.units.length)
})

test('BG legacy CharX error hook is selected only when the indexed session is absent', () => {
    const catalog = loadCatalog()
    const legacy = resolveSelection(catalog, ['bg-preserve'])
    assert.equal(legacy.resolvedIds.includes('bg-preserve-legacy-charx-adapter'), true)
    const indexed = resolveSelection(catalog, ['bg-preserve', 'charx-archive-integrity'])
    assert.equal(indexed.resolvedIds.includes('bg-preserve-legacy-charx-adapter'), false)
})

test('CharX production sources pin indexed no-worker integrity and terminal settlement', () => {
    const archive = read('patches/charx-archive-integrity/files-1.10/src/ts/process/charxArchive.ts')
    const session = read('patches/charx-archive-integrity/files-1.10/src/ts/process/charxImportSession.ts')
    assert.match(archive, /useWebWorkers: false/)
    assert.match(archive, /strictness: 'strict'/)
    assert.match(archive, /checkLocalDirectory: true/)
    assert.match(archive, /checkCrc32: true/)
    assert.match(archive, /checkOverlappingEntryOnly: true/)
    assert.match(archive, /metadataBytes: 16 \* 1024 \* 1024/)
    assert.match(session, /await archive\.close\(\)/)
    assert.match(session, /if \(operationError\) throw operationError/)
    assert.match(session, /options\.hashSignal && !options\.skipSaving/)
})

test('exact 1.10 CharX graph composes and reverts byte exactly', () => {
    const baselines = exact110Baselines()
    const units = exact110Units()
    const plan = compose(units, baselines)
    assert.deepEqual(plan.collisions, [])
    assert.equal(JSON.parse(plan.outputs.get('package.json')).dependencies['@zip.js/zip.js'], '2.8.55')
    assert.match(plan.outputs.get('pnpm-lock.yaml'), /'@zip\.js\/zip\.js@2\.8\.55'/)
    assert.match(plan.outputs.get('src/ts/process/processzip.ts'), /await this\.import\(data, container\)/)
    assert.match(plan.outputs.get('src/ts/characterCards.ts'), /const receipt = await importer\.import/)

    const byId = new Map(units.map((unit) => [unit.id, unit]))
    const reverted = new Map(plan.outputs)
    for (const id of [...plan.order].reverse()) {
        const unit = byId.get(id)
        reverted.set(unit.file, revertUnit(reverted.get(unit.file), unit))
    }
    for (const [file, baseline] of baselines) assert.equal(reverted.get(file), baseline, file)
})
