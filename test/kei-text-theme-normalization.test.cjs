'use strict'

const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const manifest = require('../patches/kei-text-theme-normalization-core/manifest.cjs')
const meta = require('../patches/pocketrisu-kei/manifest.cjs')
const { loadCatalog, resolveProfile } = require('../src/catalog.cjs')
const { packEtag, unitMatchesTarget } = require('../src/manager.cjs')
const { resolveSelection } = require('../src/resolver.cjs')

const patchRoot = path.join(__dirname, '../patches/kei-text-theme-normalization-core')
const read = (relative) => fs.readFileSync(path.join(patchRoot, relative), 'utf8')
const helper = read('files/src/ts/gui/textTheme.ts')
const helperTest = read('files/src/ts/gui/textTheme.test.ts')
const databaseTest = read('files/src/ts/storage/textThemeDatabase.test.ts')
const runtimeTest = read('files/src/ts/gui/textThemeRuntime.test.ts')
const target181 = { packageName: 'pocketrisu', packageVersion: '1.8.1' }
const target190 = { packageName: 'pocketrisu', packageVersion: '1.9.0' }
const unitText = (unit) => unit.managed ?? unit.content ?? ''

test('K17 normalization is a hidden exact-1.9 umbrella child', () => {
    const catalog = loadCatalog()

    assert.equal(manifest.id, 'kei-text-theme-normalization-core')
    assert.equal(manifest.version, '0.1.0')
    assert.equal(manifest.userSelectable, false)
    assert.deepEqual(manifest.targets, {
        pocketrisu: {
            verified: ['1.8.1', '1.9.0'],
            reviewing: [],
        },
    })
    assert.equal(meta.version, '0.11.0')
    assert.equal(meta.requires.includes(manifest.id), true)
    assert.equal(resolveProfile('features', catalog).defaults.includes(meta.id), false)
    assert.equal(resolveProfile('hardening', catalog).defaults.includes(meta.id), false)

    const resolution = resolveSelection(catalog, [meta.id])
    assert.equal(resolution.dependencyAdded.includes(manifest.id), true)
    assert.equal(resolution.resolvedIds.includes(manifest.id), true)
    assert.throws(
        () => resolveSelection(catalog, [manifest.id]),
        (error) => error.code === 'INTERNAL_PACK_REQUESTED',
    )
})

test('K17 owns no 1.8 units and only the helper, three boundaries, and tests on 1.9', () => {
    assert.deepEqual(
        manifest.units.filter((unit) => unitMatchesTarget(unit, target181)),
        [],
    )
    const active190 = manifest.units.filter((unit) => unitMatchesTarget(unit, target190))
    assert.equal(active190.length, 9)
    assert.deepEqual(
        [...new Set(active190.map((unit) => unit.file))],
        [
            'src/ts/gui/textTheme.ts',
            'src/ts/gui/textTheme.test.ts',
            'src/ts/storage/database.svelte.ts',
            'src/ts/storage/textThemeDatabase.test.ts',
            'src/ts/gui/colorscheme.ts',
            'src/ts/gui/textThemeRuntime.test.ts',
        ],
    )
    assert.equal(active190.filter((unit) => unit.type === 'owned').length, 4)
    assert.equal(active190.filter((unit) => unit.type === 'replace').length, 5)
})

test('the helper admits only the three official values', () => {
    assert.match(helper, /\['standard', 'highcontrast', 'custom'\] as const/)
    assert.match(helper, /textThemeNames\.includes\(theme as TextThemeName\)/)
    assert.match(helper, /: 'standard'/)
    assert.match(helperTest, /test\.each\(textThemeNames\)/)
    assert.match(helperTest, /undefined/)
    assert.match(helperTest, /null/)
    assert.match(helperTest, /'vex'/)
})

test('managed calls cover load, activation, and runtime CSS without broad K17', () => {
    const combined = manifest.units.map(unitText).join('\n')

    assert.match(combined, /data\.textTheme = normalizeTextTheme\(data\.textTheme\)/)
    assert.match(combined, /db\.textTheme = normalizeTextTheme\(p\.textTheme \?\? db\.textTheme\)/)
    assert.match(combined, /const textTheme = normalizeTextTheme\(get\(isLite\) \? 'standard' : db\.textTheme\)/)
    assert.doesNotMatch(combined, /textTheme:\s*normalizeTextTheme\(db\.textTheme\)/)
    assert.doesNotMatch(combined, /pre\.textTheme = normalizeTextTheme/)
    assert.equal(
        manifest.units.some((unit) => unit.file === 'src/ts/plugins/apiV3/v3.svelte.ts'),
        false,
    )
    assert.doesNotMatch(combined, /changeTextTheme|setCustomTextTheme|getTextTheme/)
})

test('target tests cover corrupt state, official values, legacy presets, and stale CSS', () => {
    assert.match(databaseTest, /normalizes unsupported loaded value/)
    assert.match(databaseTest, /normalizes a present unsupported preset value/)
    assert.match(databaseTest, /keeps the current valid value when a legacy preset omits textTheme/)
    assert.match(runtimeTest, /unsupported in-memory value rewrites all standard variables/)
    assert.match(runtimeTest, /highcontrast remains on the native high-contrast branch/)
    assert.match(runtimeTest, /custom remains on the native custom-color branch/)
})

test('K17 managed graph changes are reflected in its ETag', () => {
    const pack = loadCatalog().find((candidate) => candidate.id === manifest.id)
    const original = packEtag(pack)

    assert.notEqual(packEtag({
        ...pack,
        units: pack.units.map((unit, index) => index === 3
            ? { ...unit, managed: `${unit.managed}\n` }
            : unit),
    }), original)
    assert.equal(packEtag(pack), original)
})
