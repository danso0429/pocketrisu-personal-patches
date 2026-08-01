'use strict'

const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const repositoryRoot = path.resolve(__dirname, '..')
const manifest = require('../patches/preset-integrity/manifest.cjs')

test('preset integrity is a separate default pack with load, save, and UI guards', () => {
    assert.equal(manifest.id, 'preset-integrity')
    assert.equal(manifest.version, '0.2.0')
    assert.deepEqual(manifest.targets.pocketrisu, {
        verified: ['1.8.1', '1.9.0'],
        reviewing: [],
    })
    assert.deepEqual(
        manifest.units
            .filter((unit) => unit.targetVersions.pocketrisu.includes('1.8.1'))
            .map((unit) => unit.id),
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
    assert.deepEqual(
        manifest.units
            .filter((unit) => unit.targetVersions.pocketrisu.includes('1.9.0'))
            .map((unit) => unit.id),
        [
            'preset-integrity:normalizer:1.9',
            'preset-integrity:load-normalization:1.9',
            'preset-integrity:save-normalization:1.9',
            'preset-integrity:change-guard:1.9',
            'preset-integrity:prompt-active-preset:1.9',
            'preset-integrity:prompt-body-start:1.9',
            'preset-integrity:prompt-body-end:1.9',
            'preset-integrity:tests:1.9',
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

test('PocketRisu 1.9 adapter preserves the no-active sentinel and guards active-only UI', () => {
    const normalizer = manifest.units.find(
        (unit) => unit.id === 'preset-integrity:normalizer:1.9',
    )
    const changeGuard = manifest.units.find(
        (unit) => unit.id === 'preset-integrity:change-guard:1.9',
    )
    assert.ok(normalizer)
    assert.ok(changeGuard)
    assert.match(normalizer.content, /requested === -1/)
    assert.match(changeGuard.content, /activeId >= 0 \? activeId : 0/)
    assert.doesNotMatch(changeGuard.content, /const newPres = pres\[activeId\]/)

    const source = fs.readFileSync(
        path.join(
            repositoryRoot,
            'patches/preset-integrity/files-1.9/src/ts/storage/botPresetIntegrity.test.ts',
        ),
        'utf8',
    )
    assert.match(source, /preserves the deliberate no-active sentinel/)
    assert.match(source, /values below the sentinel/)
    assert.equal(
        manifest.units.some((unit) => unit.id === 'preset-integrity:prompt-body-start:1.9'),
        true,
    )
    assert.equal(
        manifest.units.some((unit) => unit.id === 'preset-integrity:prompt-body-end:1.9'),
        true,
    )
})
