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
    ])
    assert.throws(
        () => validateProfileSelection(resolveProfile('features'), ['bg-preserve']),
        /cannot manage/,
    )
    assert.doesNotThrow(
        () => validateProfileSelection(resolveProfile('all'), [
            'bg-preserve',
            'lazy-chat-sync',
            'lazy-chat-bg-adapter',
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

test('all can adopt features state, while features cannot silently remove all state', () => {
    assert.doesNotThrow(
        () => validateProfileTransition(resolveProfile('all'), { profile: 'features' }),
    )
    assert.throws(
        () => validateProfileTransition(resolveProfile('features'), { profile: 'all' }),
        /cannot take ownership/,
    )
})
