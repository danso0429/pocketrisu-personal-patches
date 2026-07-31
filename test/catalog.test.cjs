'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
    loadCatalog,
    resolveProfile,
    validateProfileMetadata,
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
        'character-import-ux',
        'personal-settings',
        'preset-integrity',
        'parser-hardening',
        'toolchain-hardening',
        'kei-fullscreen-image-viewer-core',
        'pocketrisu-kei',
    ])
    assert.throws(
        () => validateProfileSelection(resolveProfile('features', catalog), ['bg-preserve']),
        /cannot manage/,
    )
    assert.deepEqual(
        resolveProfile('features', catalog).defaults,
        [
            'lazy-chat-sync',
            'persona-organizer',
            'character-organizer',
            'character-import-ux',
            'personal-settings',
            'preset-integrity',
        ],
    )
    assert.deepEqual(
        resolveProfile('hardening', catalog).defaults,
        ['parser-hardening', 'toolchain-hardening'],
    )
    assert.throws(
        () => validateProfileSelection(resolveProfile('hardening', catalog), ['lazy-chat-sync']),
        /cannot manage/,
    )
    assert.doesNotThrow(
        () => validateProfileSelection(resolveProfile('all', catalog), [
            'bg-preserve',
            'lazy-chat-sync',
            'parser-hardening',
            'toolchain-hardening',
        ]),
    )
    assert.throws(
        () => validateProfileSelection(resolveProfile('all', catalog), ['lazy-chat-bg-adapter']),
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
        () => validateProfileTransition(resolveProfile('all', catalog), { profile: 'features' }),
    )
    assert.doesNotThrow(
        () => validateProfileTransition(resolveProfile('all', catalog), { profile: 'hardening' }),
    )
    assert.doesNotThrow(
        () => validateProfileTransition(resolveProfile('all', catalog), {
            profile: 'custom',
            packs: [
                { id: 'persona-organizer' },
                { id: 'lazy-chat-bg-adapter' },
            ],
        }, catalog),
    )
    assert.throws(
        () => validateProfileTransition(resolveProfile('all', catalog), {
            profile: 'custom',
            packs: [{ id: 'unknown-future-pack' }],
        }, catalog),
        /cannot take ownership/,
    )
    assert.throws(
        () => validateProfileTransition(resolveProfile('features', catalog), { profile: 'all' }),
        /cannot take ownership/,
    )
    assert.throws(
        () => validateProfileTransition(resolveProfile('hardening', catalog), { profile: 'all' }),
        /cannot take ownership/,
    )
})

test('all derives every visible pack from the active catalog', () => {
    const catalog = [
        { id: 'existing', version: '1', units: [] },
        { id: 'future-pack', version: '1', units: [] },
        { id: 'internal-adapter', version: '1', userSelectable: false, units: [] },
    ]
    assert.deepEqual(resolveProfile('all', catalog).defaults, [
        'existing',
        'future-pack',
    ])
})

test('PocketRisu Kei joins rolling all without entering narrow presets', () => {
    const catalog = loadCatalog()
    assert.equal(resolveProfile('all', catalog).defaults.includes('pocketrisu-kei'), true)
    assert.equal(resolveProfile('features', catalog).defaults.includes('pocketrisu-kei'), false)
    assert.equal(resolveProfile('hardening', catalog).defaults.includes('pocketrisu-kei'), false)
})

test('narrow preset metadata is validated at the catalog boundary', () => {
    assert.throws(
        () => validateProfileMetadata([{
            id: 'unknown-default',
            presetDefaults: ['missing-profile'],
        }]),
        /unknown preset/,
    )
    assert.throws(
        () => validateProfileMetadata([{
            id: 'internal-default',
            userSelectable: false,
            presetDefaults: ['features'],
        }]),
        /internal and cannot be a preset default/,
    )
})
