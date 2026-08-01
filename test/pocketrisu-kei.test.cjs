'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const manifest = require('../patches/pocketrisu-kei/manifest.cjs')
const { loadCatalog, resolveProfile } = require('../src/catalog.cjs')
const { packEtag } = require('../src/manager.cjs')
const { resolveSelection } = require('../src/resolver.cjs')

test('PocketRisu Kei remains a unit-free universal-only meta pack', () => {
    assert.equal(manifest.id, 'pocketrisu-kei')
    assert.equal(manifest.version, '0.10.0')
    assert.equal(manifest.userSelectable, true)
    assert.deepEqual(manifest.targets, {
        pocketrisu: {
            verified: ['1.8.1', '1.9.0'],
            reviewing: [],
        },
    })
    assert.deepEqual(manifest.requires, [
        'kei-fullscreen-image-viewer-core',
        'kei-stream-parser-core',
        'kei-chat-render-core',
        'kei-mobile-navigation-core',
        'kei-hypa-tools-core',
        'kei-partial-edit-core',
        'kei-translation-tools-core',
        'kei-prompt-role-compat-core',
    ])
    assert.deepEqual(manifest.units, [])
    assert.equal(Object.hasOwn(manifest, 'presetDefaults'), false)

    const catalog = loadCatalog()
    const registered = catalog.find((pack) => pack.id === manifest.id)
    assert.ok(registered)
    assert.equal(resolveProfile('all', catalog).defaults.includes(manifest.id), true)
    assert.equal(resolveProfile('features', catalog).defaults.includes(manifest.id), false)
    assert.equal(resolveProfile('hardening', catalog).defaults.includes(manifest.id), false)

    const resolution = resolveSelection(catalog, [manifest.id])
    assert.deepEqual(resolution.resolvedIds, [
        'kei-chat-render-base-adapter',
        'kei-chat-render-core',
        'kei-fullscreen-image-viewer-core',
        'kei-hypa-tools-base-adapter',
        'kei-hypa-tools-core',
        'kei-mobile-navigation-base-adapter',
        'kei-mobile-navigation-core',
        'kei-partial-edit-base-adapter',
        'kei-partial-edit-core',
        'kei-prompt-role-compat-core',
        'kei-stream-parser-base-adapter',
        'kei-stream-parser-core',
        'kei-translation-tools-base-adapter',
        'kei-translation-tools-core',
        manifest.id,
    ])
    assert.deepEqual(resolution.dependencyAdded, [
        'kei-chat-render-core',
        'kei-fullscreen-image-viewer-core',
        'kei-hypa-tools-core',
        'kei-mobile-navigation-core',
        'kei-partial-edit-core',
        'kei-prompt-role-compat-core',
        'kei-stream-parser-core',
        'kei-translation-tools-core',
    ])
    assert.deepEqual(resolution.autoAdded, [
        'kei-chat-render-base-adapter',
        'kei-hypa-tools-base-adapter',
        'kei-mobile-navigation-base-adapter',
        'kei-partial-edit-base-adapter',
        'kei-stream-parser-base-adapter',
        'kei-translation-tools-base-adapter',
    ])
})

test('PocketRisu Kei can require hidden children without exposing them directly', () => {
    const catalog = loadCatalog()
    const registered = catalog.find((pack) => pack.id === manifest.id)
    const child = {
        id: 'kei-example-child',
        title: 'Kei example child',
        version: '0.1.0',
        userSelectable: false,
        units: [],
    }
    const futureCatalog = [
        ...catalog.filter((pack) => pack.id !== manifest.id),
        child,
        {
            ...registered,
            requires: [...registered.requires, child.id],
        },
    ]

    const resolution = resolveSelection(futureCatalog, [manifest.id])
    assert.deepEqual(resolution.resolvedIds, [
        'kei-chat-render-base-adapter',
        'kei-chat-render-core',
        child.id,
        'kei-fullscreen-image-viewer-core',
        'kei-hypa-tools-base-adapter',
        'kei-hypa-tools-core',
        'kei-mobile-navigation-base-adapter',
        'kei-mobile-navigation-core',
        'kei-partial-edit-base-adapter',
        'kei-partial-edit-core',
        'kei-prompt-role-compat-core',
        'kei-stream-parser-base-adapter',
        'kei-stream-parser-core',
        'kei-translation-tools-base-adapter',
        'kei-translation-tools-core',
        manifest.id,
    ])
    assert.deepEqual(resolution.dependencyAdded, [
        'kei-chat-render-core',
        child.id,
        'kei-fullscreen-image-viewer-core',
        'kei-hypa-tools-core',
        'kei-mobile-navigation-core',
        'kei-partial-edit-core',
        'kei-prompt-role-compat-core',
        'kei-stream-parser-core',
        'kei-translation-tools-core',
    ])
    assert.throws(
        () => resolveSelection(futureCatalog, [child.id]),
        (error) => error.code === 'INTERNAL_PACK_REQUESTED',
    )
})

test('PocketRisu Kei adds only its child units to every existing unit graph', () => {
    const catalog = loadCatalog()
    const existingVisible = catalog
        .filter((pack) => pack.userSelectable !== false && pack.id !== manifest.id)
        .map((pack) => pack.id)
    const keiPackIds = new Set([
        'kei-chat-render-core',
        'kei-chat-render-base-adapter',
        'kei-chat-render-bg-adapter',
        'kei-fullscreen-image-viewer-core',
        'kei-mobile-navigation-core',
        'kei-mobile-navigation-base-adapter',
        'kei-mobile-navigation-lazy-adapter',
        'kei-hypa-tools-core',
        'kei-hypa-tools-base-adapter',
        'kei-hypa-tools-bg-adapter',
        'kei-partial-edit-core',
        'kei-partial-edit-base-adapter',
        'kei-partial-edit-bg-adapter',
        'kei-prompt-role-compat-core',
        'kei-translation-tools-core',
        'kei-translation-tools-base-adapter',
        'kei-translation-tools-bg-adapter',
        'kei-stream-parser-core',
        'kei-stream-parser-base-adapter',
        'kei-stream-parser-bg-adapter',
        manifest.id,
    ])

    for (let mask = 0; mask < (2 ** existingVisible.length); mask += 1) {
        const selected = existingVisible.filter((_, index) => mask & (2 ** index))
        const withoutKeiResolution = resolveSelection(catalog, selected)
        const withKeiResolution = resolveSelection(catalog, [...selected, manifest.id])
        const withoutKei = withoutKeiResolution.packs
            .flatMap((pack) => pack.units.map((unit) => unit.id))
        const withKei = withKeiResolution.packs
            .filter((pack) => !keiPackIds.has(pack.id))
            .flatMap((pack) => pack.units.map((unit) => unit.id))
        assert.deepEqual(
            withKei,
            withoutKei,
        )
        assert.equal(
            withKeiResolution.resolvedIds.includes('kei-stream-parser-base-adapter'),
            !withKeiResolution.resolvedIds.includes('bg-preserve'),
        )
        assert.equal(
            withKeiResolution.resolvedIds.includes('kei-stream-parser-bg-adapter'),
            withKeiResolution.resolvedIds.includes('bg-preserve'),
        )
        assert.equal(
            withKeiResolution.resolvedIds.includes('kei-chat-render-base-adapter'),
            !withKeiResolution.resolvedIds.includes('bg-preserve'),
        )
        assert.equal(
            withKeiResolution.resolvedIds.includes('kei-chat-render-bg-adapter'),
            withKeiResolution.resolvedIds.includes('bg-preserve'),
        )
        assert.equal(
            withKeiResolution.resolvedIds.includes('kei-mobile-navigation-base-adapter'),
            !withKeiResolution.resolvedIds.includes('lazy-chat-sync'),
        )
        assert.equal(
            withKeiResolution.resolvedIds.includes('kei-mobile-navigation-lazy-adapter'),
            withKeiResolution.resolvedIds.includes('lazy-chat-sync'),
        )
        assert.equal(
            withKeiResolution.resolvedIds.includes('kei-hypa-tools-base-adapter'),
            !withKeiResolution.resolvedIds.includes('bg-preserve'),
        )
        assert.equal(
            withKeiResolution.resolvedIds.includes('kei-hypa-tools-bg-adapter'),
            withKeiResolution.resolvedIds.includes('bg-preserve'),
        )
        assert.equal(
            withKeiResolution.resolvedIds.includes('kei-partial-edit-base-adapter'),
            !withKeiResolution.resolvedIds.includes('bg-preserve'),
        )
        assert.equal(
            withKeiResolution.resolvedIds.includes('kei-partial-edit-bg-adapter'),
            withKeiResolution.resolvedIds.includes('bg-preserve'),
        )
        assert.equal(
            withKeiResolution.resolvedIds.includes('kei-translation-tools-base-adapter'),
            !withKeiResolution.resolvedIds.includes('bg-preserve'),
        )
        assert.equal(
            withKeiResolution.resolvedIds.includes('kei-translation-tools-bg-adapter'),
            withKeiResolution.resolvedIds.includes('bg-preserve'),
        )
    }
})

test('PocketRisu Kei graph metadata participates in its content ETag', () => {
    const pack = loadCatalog().find((entry) => entry.id === manifest.id)
    const original = packEtag(pack)
    assert.notEqual(packEtag({
        ...pack,
        requires: ['kei-future-child'],
    }), original)
    assert.equal(packEtag(pack), original)
})
