'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const manifest = require('../patches/pocketrisu-kei/manifest.cjs')
const { loadCatalog, resolveProfile } = require('../src/catalog.cjs')
const { packEtag } = require('../src/manager.cjs')
const { resolveSelection } = require('../src/resolver.cjs')

test('PocketRisu Kei remains a unit-free universal-only meta pack', () => {
    assert.equal(manifest.id, 'pocketrisu-kei')
    assert.equal(manifest.version, '0.2.0')
    assert.equal(manifest.userSelectable, true)
    assert.deepEqual(manifest.requires, ['kei-fullscreen-image-viewer-core'])
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
        'kei-fullscreen-image-viewer-core',
        manifest.id,
    ])
    assert.deepEqual(resolution.dependencyAdded, ['kei-fullscreen-image-viewer-core'])
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
        child.id,
        'kei-fullscreen-image-viewer-core',
        manifest.id,
    ])
    assert.deepEqual(resolution.dependencyAdded, [
        child.id,
        'kei-fullscreen-image-viewer-core',
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
    const childUnitIds = new Set(
        catalog
            .find((pack) => pack.id === 'kei-fullscreen-image-viewer-core')
            .units
            .map((unit) => unit.id),
    )

    for (let mask = 0; mask < (2 ** existingVisible.length); mask += 1) {
        const selected = existingVisible.filter((_, index) => mask & (2 ** index))
        const withoutKei = resolveSelection(catalog, selected)
            .packs
            .flatMap((pack) => pack.units.map((unit) => unit.id))
        const withKei = resolveSelection(catalog, [...selected, manifest.id])
            .packs
            .flatMap((pack) => pack.units.map((unit) => unit.id))
        assert.deepEqual(
            withKei.filter((id) => !childUnitIds.has(id)),
            withoutKei,
        )
        assert.deepEqual(
            withKei.filter((id) => childUnitIds.has(id)).sort(),
            [...childUnitIds].sort(),
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
