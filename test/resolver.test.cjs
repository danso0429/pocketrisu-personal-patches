'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { loadCatalog, resolveProfile } = require('../src/catalog.cjs')
const { resolveSelection } = require('../src/resolver.cjs')

test('catalog exposes the expected user packs and keeps integration packs internal', () => {
    const catalog = loadCatalog()
    assert.deepEqual(
        catalog.filter((pack) => pack.userSelectable !== false).map((pack) => pack.id),
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
    assert.deepEqual(
        catalog.filter((pack) => pack.userSelectable === false).map((pack) => pack.id),
        [
            'client-build-fence-bg-adapter',
            'client-build-fence-kei-adapter',
            'client-build-fence-kei-lazy-storage-adapter',
            'server-backup-snapshot-core',
            'server-backup-snapshot-lazy-adapter',
            'lazy-chat-bg-adapter',
            'haejeok-persistence-safety-adapter',
            'haejeok-korean-search-adapter',
            'haejeok-chat-width-adapter',
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
            'pagefold-bg-adapter',
        ],
    )
})

const supersedeCatalog = [
    { id: 'narrow', version: '1', units: [] },
    { id: 'broad', version: '1', units: [], supersedes: ['narrow'] },
    { id: 'feature', version: '1', units: [], requires: ['broad'] },
]

test('a superseding pack replaces the narrower requested pack', () => {
    const resolution = resolveSelection(supersedeCatalog, ['narrow', 'broad'])
    assert.deepEqual(resolution.effectiveRequested, ['broad'])
    assert.deepEqual(resolution.superseded, [{ pack: 'narrow', by: 'broad' }])
    assert.equal(resolution.resolvedIds.includes('narrow'), false)
})

test('a dependency-added superseding pack also replaces the requested pack', () => {
    const resolution = resolveSelection(supersedeCatalog, ['feature', 'narrow'])
    assert.deepEqual(resolution.effectiveRequested, ['feature'])
    assert.deepEqual(resolution.dependencyAdded, ['broad'])
    assert.deepEqual(resolution.superseded, [{ pack: 'narrow', by: 'broad' }])
    assert.equal(resolution.resolvedIds.includes('broad'), true)
    assert.equal(resolution.resolvedIds.includes('narrow'), false)
})

test('bg preserve with lazy chat storage adds the lazy BG storage adapter', () => {
    const standalone = resolveSelection(loadCatalog(), ['bg-preserve'])
    assert.equal(standalone.resolvedIds.includes('lazy-chat-bg-adapter'), false)

    const lazy = resolveSelection(loadCatalog(), ['bg-preserve', 'lazy-chat-sync'])
    assert.equal(lazy.resolvedIds.includes('lazy-chat-bg-adapter'), true)
})

test('downloaders cannot select an internal adapter directly', () => {
    assert.throws(
        () => resolveSelection(loadCatalog(), ['lazy-chat-bg-adapter']),
        (error) => error.code === 'INTERNAL_PACK_REQUESTED',
    )
})

test('the complete admitted graph resolves deterministically', () => {
    const catalog = loadCatalog()
    const requested = resolveProfile('all', catalog).defaults
    const first = resolveSelection(catalog, requested)
    const second = resolveSelection(catalog, [...requested].reverse())
    assert.deepEqual(second, first)
    assert.equal(first.resolvedIds.includes('background-import'), false)
    assert.equal(first.resolvedIds.includes('lazy-chat-bg-adapter'), true)
})

test('declared conflicts fail before composition', () => {
    const catalog = [
        { id: 'a', version: '1', units: [], conflicts: ['b'] },
        { id: 'b', version: '1', units: [] },
    ]
    assert.throws(
        () => resolveSelection(catalog, ['a', 'b']),
        (error) => error.code === 'PACK_CONFLICT'
            && error.details.packs.join(',') === 'a,b',
    )
})

test('every relation is validated even when its pack is not selected', () => {
    const catalog = [
        { id: 'visible', version: '1', units: [] },
        {
            id: 'adapter',
            version: '1',
            units: [],
            userSelectable: false,
            autoWhen: {
                all: ['missing-pack'],
            },
        },
    ]
    assert.throws(
        () => resolveSelection(catalog, ['visible']),
        (error) => error.code === 'UNKNOWN_PACK'
            && error.details.relation === 'adapter.autoWhen.all',
    )
})
