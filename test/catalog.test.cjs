'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
    DEFAULT_TARGETS,
    loadCatalog,
    resolveProfile,
    validateProfileMetadata,
    validateProfileSelection,
    validateProfileTransition,
} = require('../src/catalog.cjs')

test('target metadata keeps 1.8.1 verified and later exact targets review-only', () => {
    assert.deepEqual(DEFAULT_TARGETS.pocketrisu.verified, ['1.8.1'])
    assert.deepEqual(DEFAULT_TARGETS.pocketrisu.reviewing, ['1.9.0', '1.10.0'])
    assert.equal(Object.isFrozen(DEFAULT_TARGETS), true)
    assert.equal(Object.isFrozen(DEFAULT_TARGETS.pocketrisu), true)
    assert.equal(Object.isFrozen(DEFAULT_TARGETS.pocketrisu.verified), true)
    assert.equal(Object.isFrozen(DEFAULT_TARGETS.pocketrisu.reviewing), true)
})

test('profiles share one catalog but have different ownership boundaries', () => {
    const catalog = loadCatalog()
    assert.deepEqual(catalog.map((pack) => pack.id), [
        'bg-preserve',
        'bg-preserve-legacy-charx-adapter',
        'bg-preserve-storage-base',
        'client-build-fence',
        'client-build-fence-bg-adapter',
        'client-build-fence-standard-adapter',
        'client-build-fence-kei-adapter',
        'client-build-fence-kei-standard-storage-adapter',
        'client-build-fence-kei-lazy-storage-adapter',
        'server-backup-snapshot-core',
        'server-backup-snapshot-standard-adapter',
        'server-backup-snapshot-lazy-adapter',
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
        'charx-archive-integrity',
        'background-import',
        'kei-stream-parser-core',
        'kei-stream-parser-base-adapter',
        'kei-stream-parser-bg-adapter',
        'kei-chat-render-core',
        'kei-chat-render-base-adapter',
        'kei-chat-render-bg-adapter',
        'kei-mobile-navigation-core',
        'kei-mobile-navigation-base-adapter',
        'kei-mobile-navigation-lazy-adapter',
        'kei-hypa-tools-core',
        'kei-hypa-tools-base-adapter',
        'kei-hypa-tools-bg-adapter',
        'kei-partial-edit-core',
        'kei-partial-edit-base-adapter',
        'kei-partial-edit-bg-adapter',
        'kei-translation-tools-core',
        'kei-translation-tools-base-adapter',
        'kei-translation-tools-bg-adapter',
        'kei-fullscreen-image-viewer-core',
        'kei-prompt-role-compat-core',
        'kei-text-theme-normalization-core',
        'kei-backup-restore-safety-core',
        'kei-backup-restore-safety-standard-adapter',
        'kei-backup-restore-safety-lazy-adapter',
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
        ['client-build-fence', 'parser-hardening', 'toolchain-hardening', 'charx-archive-integrity'],
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

test('all derives every admitted visible pack from the active catalog', () => {
    const catalog = [
        { id: 'existing', version: '1', units: [] },
        { id: 'future-pack', version: '1', units: [] },
        { id: 'reviewing-pack', version: '1', allDefault: false, units: [] },
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

test('background import is visible for custom review but not admitted to rolling all', () => {
    const catalog = loadCatalog()
    const pack = catalog.find((entry) => entry.id === 'background-import')
    assert.ok(pack)
    assert.equal(pack.userSelectable, true)
    assert.equal(pack.allDefault, false)
    assert.deepEqual(pack.presetDefaults, [])
    assert.equal(resolveProfile('all', catalog).defaults.includes(pack.id), false)
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
    assert.throws(
        () => validateProfileMetadata([{
            id: 'invalid-all-admission',
            allDefault: 'later',
        }]),
        /allDefault must be a boolean/,
    )
})
