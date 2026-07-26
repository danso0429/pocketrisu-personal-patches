'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
    loadCatalog,
    resolveProfile,
    validateProfileSelection,
    validateProfileTransition,
} = require('../src/catalog.cjs')

test('profiles share one catalog but have different ownership boundaries', () => {
    const catalog = loadCatalog()
    assert.deepEqual(catalog.map((pack) => pack.id), [
        'bg-preserve',
        'startup-cache',
        'lazy-chat-sync',
        'lazy-chat-bg-adapter',
        'persona-organizer',
        'preset-integrity',
        'parser-hardening',
    ])
    assert.throws(
        () => validateProfileSelection(resolveProfile('features'), ['bg-preserve']),
        /cannot manage/,
    )
    assert.deepEqual(resolveProfile('hardening').defaults, ['parser-hardening'])
    assert.throws(
        () => validateProfileSelection(resolveProfile('hardening'), ['lazy-chat-sync']),
        /cannot manage/,
    )
    assert.doesNotThrow(
        () => validateProfileSelection(resolveProfile('all'), [
            'bg-preserve',
            'lazy-chat-sync',
            'lazy-chat-bg-adapter',
            'parser-hardening',
        ]),
    )
    assert.throws(
        () => validateProfileSelection(resolveProfile('all'), [
            'bg-preserve',
            'lazy-chat-sync',
        ]),
        /requires pack lazy-chat-bg-adapter/,
    )
    const bgPack = catalog.find((pack) => pack.id === 'bg-preserve')
    assert.equal(
        bgPack.units.some((unit) => unit.file === 'src/ts/bgPreserveInstaller.test.ts'),
        false,
    )
})

test('all can adopt narrower states, while narrow profiles cannot remove other packs', () => {
    assert.doesNotThrow(
        () => validateProfileTransition(resolveProfile('all'), { profile: 'features' }),
    )
    assert.doesNotThrow(
        () => validateProfileTransition(resolveProfile('all'), { profile: 'hardening' }),
    )
    assert.throws(
        () => validateProfileTransition(resolveProfile('features'), { profile: 'all' }),
        /cannot take ownership/,
    )
    assert.throws(
        () => validateProfileTransition(resolveProfile('hardening'), { profile: 'all' }),
        /cannot take ownership/,
    )
})
