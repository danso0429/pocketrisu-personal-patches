'use strict'

const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const repositoryRoot = path.resolve(__dirname, '..')
const manifest = require('../patches/preset-integrity/manifest.cjs')

test('preset integrity is a separate default pack with load, save, and UI guards', () => {
    assert.equal(manifest.id, 'preset-integrity')
    assert.equal(manifest.version, '0.1.0')
    assert.deepEqual(
        manifest.units.map((unit) => unit.id),
        [
            'preset-integrity:normalizer',
            'preset-integrity:load-normalization',
            'preset-integrity:save-normalization',
            'preset-integrity:change-guard',
            'preset-integrity:prompt-active-preset',
            'preset-integrity:prompt-name-guard',
            'preset-integrity:tests',
        ],
    )
})

test('preset selection normalization preserves entries and clamps only the index', () => {
    const normalizer = manifest.units.find((unit) => unit.id === 'preset-integrity:normalizer')
    assert.ok(normalizer)
    assert.match(normalizer.content, /db\.botPresets\.length === 0/)
    assert.match(normalizer.content, /Math\.max\(0, Math\.min\(requested, db\.botPresets\.length - 1\)\)/)
    assert.doesNotMatch(normalizer.content, /\.splice\(|\.filter\(/)
})

test('embedded PocketRisu tests cover the observed one-past-end state', () => {
    const source = fs.readFileSync(
        path.join(
            repositoryRoot,
            'patches/preset-integrity/files/src/ts/storage/botPresetIntegrity.test.ts',
        ),
        'utf8',
    )
    assert.match(source, /one-past-end persisted index/)
    assert.match(source, /toEqual\(\['a', 'b', 'c'\]\)/)
})
