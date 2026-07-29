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
        'bg-preserve-storage-base',
        'startup-cache',
        'lazy-chat-sync',
        'lazy-chat-bg-adapter',
        'persona-organizer',
        'character-organizer',
        'preset-integrity',
        'parser-hardening',
        'toolchain-hardening',
    ])
    assert.throws(
        () => validateProfileSelection(resolveProfile('features'), ['bg-preserve']),
        /cannot manage/,
    )
    assert.deepEqual(
        resolveProfile('hardening').defaults,
        ['parser-hardening', 'toolchain-hardening'],
    )
    assert.throws(
        () => validateProfileSelection(resolveProfile('hardening'), ['lazy-chat-sync']),
        /cannot manage/,
    )
    assert.doesNotThrow(
        () => validateProfileSelection(resolveProfile('all'), [
            'bg-preserve',
            'lazy-chat-sync',
            'parser-hardening',
            'toolchain-hardening',
        ]),
    )
    assert.throws(
        () => validateProfileSelection(resolveProfile('all'), ['lazy-chat-bg-adapter']),
        /cannot manage/,
    )
    const bgPack = catalog.find((pack) => pack.id === 'bg-preserve')
    assert.equal(
        bgPack.units.some((unit) => unit.file === 'src/ts/bgPreserveInstaller.test.ts'),
        false,
    )
})

test('all can adopt narrower states, while narrow profiles cannot remove other packs', () => {
    const catalog = loadCatalog()
    assert.doesNotThrow(
        () => validateProfileTransition(resolveProfile('all'), { profile: 'features' }),
    )
    assert.doesNotThrow(
        () => validateProfileTransition(resolveProfile('all'), { profile: 'hardening' }),
    )
    assert.doesNotThrow(
        () => validateProfileTransition(resolveProfile('all'), {
            profile: 'custom',
            packs: [
                { id: 'persona-organizer' },
                { id: 'lazy-chat-bg-adapter' },
            ],
        }, catalog),
    )
    assert.throws(
        () => validateProfileTransition(resolveProfile('all'), {
            profile: 'custom',
            packs: [{ id: 'unknown-future-pack' }],
        }, catalog),
        /cannot take ownership/,
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
