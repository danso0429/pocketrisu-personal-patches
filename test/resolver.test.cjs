'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { loadCatalog } = require('../src/catalog.cjs')
const { resolveSelection } = require('../src/resolver.cjs')

test('catalog exposes eleven user packs and keeps integration packs internal', () => {
    const catalog = loadCatalog()
    assert.deepEqual(
        catalog.filter((pack) => pack.userSelectable !== false).map((pack) => pack.id),
        [
            'bg-preserve',
            'startup-cache',
            'lazy-chat-sync',
            'persona-organizer',
            'character-organizer',
            'character-import-ux',
            'personal-settings',
            'preset-integrity',
            'parser-hardening',
            'toolchain-hardening',
            'pocketrisu-kei',
        ],
    )
    assert.deepEqual(
        catalog.filter((pack) => pack.userSelectable === false).map((pack) => pack.id),
        [
            'bg-preserve-storage-base',
            'lazy-chat-bg-adapter',
            'kei-stream-parser-core',
            'kei-stream-parser-base-adapter',
            'kei-stream-parser-bg-adapter',
            'kei-chat-render-core',
            'kei-chat-render-base-adapter',
            'kei-chat-render-bg-adapter',
            'kei-fullscreen-image-viewer-core',
        ],
    )
})

test('lazy chat supersedes the narrower startup cache pack', () => {
    const resolution = resolveSelection(loadCatalog(), ['startup-cache', 'lazy-chat-sync'])
    assert.deepEqual(resolution.effectiveRequested, ['lazy-chat-sync'])
    assert.deepEqual(resolution.superseded, [{
        pack: 'startup-cache',
        by: 'lazy-chat-sync',
    }])
    assert.equal(resolution.resolvedIds.includes('startup-cache'), false)
})

test('a dependency-added lazy chat pack also supersedes requested startup cache', () => {
    const resolution = resolveSelection(
        loadCatalog(),
        ['character-import-ux', 'startup-cache'],
    )
    assert.deepEqual(resolution.effectiveRequested, ['character-import-ux'])
    assert.deepEqual(resolution.dependencyAdded, ['lazy-chat-sync'])
    assert.deepEqual(resolution.superseded, [{
        pack: 'startup-cache',
        by: 'lazy-chat-sync',
    }])
    assert.equal(resolution.resolvedIds.includes('lazy-chat-sync'), true)
    assert.equal(resolution.resolvedIds.includes('startup-cache'), false)
})

test('bg preserve selects exactly one storage integration', () => {
    const standalone = resolveSelection(loadCatalog(), ['bg-preserve'])
    assert.equal(standalone.resolvedIds.includes('bg-preserve-storage-base'), true)
    assert.equal(standalone.resolvedIds.includes('lazy-chat-bg-adapter'), false)

    const lazy = resolveSelection(loadCatalog(), ['bg-preserve', 'lazy-chat-sync'])
    assert.equal(lazy.resolvedIds.includes('bg-preserve-storage-base'), false)
    assert.equal(lazy.resolvedIds.includes('lazy-chat-bg-adapter'), true)
})

test('downloaders cannot select an internal adapter directly', () => {
    assert.throws(
        () => resolveSelection(loadCatalog(), ['lazy-chat-bg-adapter']),
        (error) => error.code === 'INTERNAL_PACK_REQUESTED',
    )
})

test('all raw user selections resolve deterministically', () => {
    const catalog = loadCatalog()
    const visible = catalog
        .filter((pack) => pack.userSelectable !== false)
        .map((pack) => pack.id)
    for (let mask = 0; mask < (1 << visible.length); mask += 1) {
        const requested = visible.filter((_, index) => mask & (1 << index))
        const first = resolveSelection(catalog, requested)
        const second = resolveSelection(catalog, [...requested].reverse())
        assert.deepEqual(second, first)
    }
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
