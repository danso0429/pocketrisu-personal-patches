'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const manifest = require('../patches/toolchain-hardening/manifest.cjs')
const { PROFILES } = require('../src/catalog.cjs')
const { packEtag } = require('../src/manager.cjs')

test('toolchain hardening is independently versioned and included by hardening and all', () => {
    assert.equal(manifest.id, 'toolchain-hardening')
    assert.equal(manifest.version, '0.1.0')
    assert.equal(PROFILES.hardening.defaults.includes(manifest.id), true)
    assert.equal(PROFILES.features.defaults.includes(manifest.id), false)
    assert.equal(PROFILES.all.defaults.includes(manifest.id), true)
})

test('toolchain hardening ETag covers exact setup and dependency content', () => {
    const original = packEtag(manifest)
    const changed = {
        ...manifest,
        units: manifest.units.map((unit, index) => index === 0
            ? { ...unit, managed: `${unit.managed}\n` }
            : unit),
    }

    assert.match(original, /^[0-9a-f]{64}$/)
    assert.notEqual(packEtag(changed), original)
    assert.equal(packEtag(manifest), original)
})

test('toolchain hardening keeps runtime source out of scope', () => {
    assert.deepEqual(
        [...new Set(manifest.units.map((unit) => unit.file))].sort(),
        ['package.json', 'pnpm-lock.yaml', 'vitest.setup.ts'],
    )

    const setup = manifest.units.find((unit) =>
        unit.id === 'toolchain-hardening:vitest-storage')
    assert.match(setup.managed, /import \{ Storage \} from 'happy-dom'/)
    assert.match(setup.managed, /typeof globalThis\.localStorage\?\.clear !== 'function'/)
    assert.match(setup.managed, /new Storage\(\)/)

    const managedLock = manifest.units
        .filter((unit) => unit.file === 'pnpm-lock.yaml')
        .map((unit) => unit.managed)
        .join('\n')
    assert.doesNotMatch(managedLock, /1\.32\.0/)
    assert.match(managedLock, /lightningcss(?:@|: )1\.33\.0/)
})
