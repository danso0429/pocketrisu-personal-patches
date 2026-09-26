'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { loadCatalog, resolveProfile } = require('../src/catalog.cjs')
const { packEtag } = require('../src/manager.cjs')
const { resolveSelection } = require('../src/resolver.cjs')
const manifest = require('../patches/kei-fullscreen-image-viewer-core/manifest.cjs')
const metaManifest = require('../patches/pocketrisu-kei/manifest.cjs')

const notice = fs.readFileSync(path.join(__dirname, '../THIRD_PARTY_NOTICES.md'), 'utf8')

function managedText(candidate) {
    return candidate.managed ?? candidate.content ?? ''
}

test('fullscreen viewer remains a hidden child of the complete set', () => {
    const catalog = loadCatalog()
    assert.equal(manifest.id, 'kei-fullscreen-image-viewer-core')
    assert.equal(manifest.version, '0.2.1')
    assert.deepEqual(manifest.targets, {
        pocketrisu: {
            verified: ['1.10.0'],
            reviewing: [],
        },
    })
    assert.equal(manifest.userSelectable, false)
    assert.equal(manifest.presetDefaults, undefined)
    assert.equal(metaManifest.requires.includes(manifest.id), true)
    assert.equal(resolveProfile('all', catalog).defaults.includes(metaManifest.id), true)

    const resolution = resolveSelection(catalog, [metaManifest.id])
    assert.equal(resolution.dependencyAdded.includes(manifest.id), true)
    assert.equal(resolution.resolvedIds.includes(manifest.id), true)
    assert.throws(
        () => resolveSelection(catalog, [manifest.id]),
        (error) => error.code === 'INTERNAL_PACK_REQUESTED',
    )
})

test('the native asset viewer is the only host and no viewer file is owned', () => {
    assert.equal(manifest.units.some((candidate) => candidate.type === 'owned'), false)
    assert.deepEqual(
        [...new Set(manifest.units.map((candidate) => candidate.file))],
        ['src/lib/Others/AssetViewer.svelte'],
    )
    assert.equal(
        manifest.units.every((candidate) =>
            candidate.targetVersions?.pocketrisu?.join(',') === '1.10.0'
        ),
        true,
    )
})

test('the pack adds only dialog, accessible-name, and touch-target deltas', () => {
    const combined = manifest.units.map(managedText).join('\n')
    assert.match(combined, /role="dialog"/)
    assert.match(combined, /aria-modal="true"/)
    assert.match(combined, /aria-label=\{assetViewerStore\.title\}/)
    assert.match(combined, /aria-label=\{language\.search\}/)
    assert.match(combined, /aria-label=\{item\.name\}/)
    assert.match(combined, /aria-label=\{`← \$\{filtered\[zoomIndex - 1\]\?\.name/)
    assert.match(combined, /aria-label=\{`→ \$\{filtered\[zoomIndex \+ 1\]\?\.name/)
    assert.equal((combined.match(/w-11 h-11/g) ?? []).length >= 4, true)
    assert.doesNotMatch(combined, /additionalAssets|openAssetViewer|scrollToIndex|onscroll/)
})

test('Kei provenance is pinned and unit payloads change the pack ETag', () => {
    assert.match(notice, /https:\/\/github\.com\/seto-sama\/PocketRisu-Kei/)
    assert.match(notice, /cc1d1b195babd887577ebf943d5e82f01f58135c/)
    assert.match(notice, /GNU General Public License v3\.0/)

    const pack = loadCatalog().find((candidate) => candidate.id === manifest.id)
    const original = packEtag(pack)
    assert.notEqual(packEtag({
        ...pack,
        units: pack.units.map((candidate, index) => index === 0
            ? { ...candidate, managed: `${managedText(candidate)}\n` }
            : candidate),
    }), original)
    assert.equal(packEtag(pack), original)
})
