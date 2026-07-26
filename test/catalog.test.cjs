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
        'persona-organizer',
    ])
    assert.throws(
        () => validateProfileSelection(resolveProfile('features'), ['bg-preserve']),
        /cannot manage/,
    )
    assert.doesNotThrow(
        () => validateProfileSelection(resolveProfile('all'), [
            'bg-preserve',
            'startup-cache',
        ]),
    )
    assert.throws(
        () => validateProfileSelection(resolveProfile('all'), ['startup-cache']),
        /requires pack bg-preserve/,
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
