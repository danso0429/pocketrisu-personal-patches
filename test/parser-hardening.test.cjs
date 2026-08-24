'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const manifest = require('../patches/parser-hardening/manifest.cjs')
const { loadCatalog, resolveProfile } = require('../src/catalog.cjs')
const { packEtag } = require('../src/manager.cjs')

test('parser hardening is independently versioned and included in the complete set', () => {
    const catalog = loadCatalog()
    assert.equal(manifest.id, 'parser-hardening')
    assert.equal(manifest.version, '0.1.1')
    assert.equal(resolveProfile('all', catalog).defaults.includes(manifest.id), true)
})

test('parser hardening is qualified only for reviewed exact PocketRisu targets', () => {
    assert.deepEqual(manifest.targets, {
        pocketrisu: {
            verified: ['1.8.1', '1.9.0', '1.10.0'],
            reviewing: [],
        },
    })
    assert.equal(manifest.targets.pocketrisu.verified.includes('1.9.1'), false)
})

test('parser hardening pack ETag covers its exact managed content', () => {
    const original = packEtag(manifest)
    const changed = {
        ...manifest,
        units: manifest.units.map((unit, index) => index === 0
            ? { ...unit, content: `${unit.content}\n` }
            : unit),
    }
    assert.match(original, /^[0-9a-f]{64}$/)
    assert.notEqual(packEtag(changed), original)
    assert.equal(packEtag(manifest), original)
})

test('parser hardening owns focused helper tests and resolves all three old skips', () => {
    const ownedFiles = manifest.units
        .filter((unit) => unit.type === 'owned')
        .map((unit) => unit.file)
    assert.deepEqual(ownedFiles.sort(), [
        'src/ts/parser/tests/thoughts.test.ts',
        'src/ts/parser/tests/whenExpression.test.ts',
        'src/ts/parser/thoughts.ts',
        'src/ts/parser/whenExpression.ts',
    ])

    const managedTests = manifest.units
        .filter((unit) => unit.file.endsWith('.test.ts'))
        .map((unit) => unit.content)
        .join('\n')
    assert.doesNotMatch(managedTests, /\btest\.skip\s*\(/)
    assert.match(managedTests, /terminal assistant generation marker/)
    assert.match(managedTests, /extracts multiple thoughts/)
    assert.match(managedTests, /comparison operators before logical operators/)
})
