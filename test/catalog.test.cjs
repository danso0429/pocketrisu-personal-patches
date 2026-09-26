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

test('every pack declares exactly the delivered PocketRisu 1.10.0 target', () => {
    for (const pack of loadCatalog()) {
        assert.deepEqual(pack.targets, {
            pocketrisu: { verified: ['1.10.0'], reviewing: [] },
        }, pack.id)
        for (const unit of pack.units) {
            if (unit.targetVersions === undefined) continue
            assert.deepEqual(unit.targetVersions, { pocketrisu: ['1.10.0'] }, unit.id)
        }
    }
})

test('one delivery profile contains every admitted root pack', () => {
    const catalog = loadCatalog()
    assert.deepEqual(catalog.map((pack) => pack.id), [
        'bg-preserve',
        'client-build-fence',
        'client-build-fence-bg-adapter',
        'client-build-fence-kei-adapter',
        'client-build-fence-kei-lazy-storage-adapter',
        'server-backup-snapshot-core',
        'server-backup-snapshot-lazy-adapter',
        'lazy-chat-sync',
        'lazy-chat-bg-adapter',
        'haejeok-persistence-safety-adapter',
        'persona-organizer',
        'character-organizer',
        'haejeok-korean-search-adapter',
        'character-import-ux',
        'personal-settings',
        'haejeok-chat-width-adapter',
        'preset-integrity',
        'parser-hardening',
        'toolchain-hardening',
        'charx-archive-integrity',
        'log-load-performance',
        'fastimport-ios-picker',
        'kei-stream-parser-core',
        'kei-stream-parser-bg-adapter',
        'kei-chat-render-core',
        'kei-chat-render-bg-adapter',
        'kei-mobile-navigation-core',
        'kei-mobile-navigation-lazy-adapter',
        'kei-hypa-tools-core',
        'kei-hypa-tools-bg-adapter',
        'kei-partial-edit-core',
        'kei-partial-edit-bg-adapter',
        'kei-translation-tools-core',
        'kei-translation-tools-bg-adapter',
        'kei-fullscreen-image-viewer-core',
        'kei-prompt-role-compat-core',
        'kei-text-theme-normalization-core',
        'kei-backup-restore-safety-core',
        'kei-backup-restore-safety-lazy-adapter',
        'pocketrisu-kei',
        'pagefold-model-preset',
        'pagefold-bg-adapter',
    ])
    assert.deepEqual(
        resolveProfile('all', catalog).defaults,
        [
            'bg-preserve',
            'client-build-fence',
            'lazy-chat-sync',
            'persona-organizer',
            'character-organizer',
            'character-import-ux',
            'personal-settings',
            'preset-integrity',
            'parser-hardening',
            'toolchain-hardening',
            'charx-archive-integrity',
            'log-load-performance',
            'fastimport-ios-picker',
            'pocketrisu-kei',
            'pagefold-model-preset',
        ],
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
    assert.throws(() => resolveProfile('features', catalog), /Unknown profile/)
    assert.throws(() => resolveProfile('hardening', catalog), /Unknown profile/)
    const bgPack = catalog.find((pack) => pack.id === 'bg-preserve')
    assert.equal(
        bgPack.units.some((unit) => unit.file === 'src/ts/bgPreserveInstaller.test.ts'),
        false,
    )
})

test('all adopts retired and known custom states but refuses unknown owners', () => {
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
    assert.doesNotThrow(
        () => validateProfileTransition(resolveProfile('all', catalog), {
            profile: 'custom',
            packs: [
                { id: 'background-import' },
                { id: 'persona-organizer' },
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
})

test('all derives every admitted visible pack from the active catalog', () => {
    const catalog = [
        { id: 'existing', version: '1', units: [] },
        { id: 'future-pack', version: '1', units: [] },
        { id: 'reviewing-pack', version: '1', units: [] },
        { id: 'internal-adapter', version: '1', userSelectable: false, units: [] },
    ]
    assert.deepEqual(resolveProfile('all', catalog).defaults, [
        'existing',
        'future-pack',
        'reviewing-pack',
    ])
})

test('PocketRisu Kei remains admitted while background import is retired', () => {
    const catalog = loadCatalog()
    assert.equal(resolveProfile('all', catalog).defaults.includes('pocketrisu-kei'), true)
    const pack = catalog.find((entry) => entry.id === 'background-import')
    assert.equal(pack, undefined)
    assert.equal(resolveProfile('all', catalog).defaults.includes('background-import'), false)
})

test('retired preset metadata fails at the catalog boundary', () => {
    assert.throws(
        () => validateProfileMetadata([{
            id: 'retired-default',
            presetDefaults: ['features'],
        }]),
        /obsolete in all-or-nothing delivery/,
    )
})
