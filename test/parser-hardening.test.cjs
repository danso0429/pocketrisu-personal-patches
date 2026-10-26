'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const manifest = require('../patches/parser-hardening/manifest.cjs')
const { loadCatalog, resolveProfile } = require('../src/catalog.cjs')
const { packEtag } = require('../src/manager.cjs')

test.describe('[E2-1c] Make the six E2-1b packs 1.16.1-only', () => {
    test('[new] parser hardening is version 0.1.3 with only unscoped 1.16.1 payload', () => {
        const catalog = loadCatalog()
        assert.equal(manifest.id, 'parser-hardening')
        assert.equal(manifest.version, '0.1.3')
        assert.equal(resolveProfile('all', catalog).defaults.includes(manifest.id), true)
        assert.deepEqual(manifest.targets, {
            pocketrisu: {
                verified: [],
                reviewing: ['1.16.1'],
            },
        })
        assert.equal(manifest.units.every((unit) => !Object.hasOwn(unit, 'targetVersions')), true)
        assert.equal(manifest.targets.pocketrisu.verified.includes('1.9.1'), false)
    })
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
