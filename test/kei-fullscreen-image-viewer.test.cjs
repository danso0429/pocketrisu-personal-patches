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

const patchRoot = path.join(__dirname, '../patches/kei-fullscreen-image-viewer-core')
const read = (relative) => fs.readFileSync(path.join(patchRoot, relative), 'utf8')
const component = read('files/src/lib/UI/GUI/FullscreenImageViewer.svelte')
const navigation = read('files/src/ts/fullscreenImageNavigation.ts')
const navigationTests = read('files/src/ts/fullscreenImageNavigation.test.ts')
const notice = fs.readFileSync(path.join(__dirname, '../THIRD_PARTY_NOTICES.md'), 'utf8')

function unit(id) {
    const result = manifest.units.find((candidate) => candidate.id === id)
    assert.ok(result, `missing unit ${id}`)
    return result
}

function managedText(candidate) {
    return candidate.managed ?? candidate.content ?? ''
}

test('fullscreen viewer remains a hidden umbrella child with no narrow preset ownership', () => {
    const catalog = loadCatalog()
    assert.equal(manifest.id, 'kei-fullscreen-image-viewer-core')
    assert.equal(manifest.version, '0.1.0')
    assert.equal(manifest.userSelectable, false)
    assert.equal(manifest.presetDefaults, undefined)
    assert.equal(metaManifest.version, '0.6.0')
    assert.equal(metaManifest.requires.includes(manifest.id), true)
    assert.equal(resolveProfile('features', catalog).defaults.includes(metaManifest.id), false)
    assert.equal(resolveProfile('hardening', catalog).defaults.includes(metaManifest.id), false)

    const resolution = resolveSelection(catalog, [metaManifest.id])
    assert.equal(resolution.dependencyAdded.includes(manifest.id), true)
    assert.equal(resolution.resolvedIds.includes(manifest.id), true)
    assert.throws(
        () => resolveSelection(catalog, [manifest.id]),
        (error) => error.code === 'INTERNAL_PACK_REQUESTED',
    )
})

test('core owns only focused files and hooks only character additional-image UI', () => {
    const ownedFiles = manifest.units
        .filter((candidate) => candidate.type === 'owned')
        .map((candidate) => candidate.file)
    const hostFiles = [...new Set(
        manifest.units
            .filter((candidate) => candidate.type !== 'owned')
            .map((candidate) => candidate.file),
    )]

    assert.deepEqual(ownedFiles, [
        'src/ts/fullscreenImageNavigation.ts',
        'src/ts/fullscreenImageNavigation.test.ts',
        'src/lib/UI/GUI/FullscreenImageViewer.svelte',
    ])
    assert.deepEqual(hostFiles, ['src/lib/SideBars/CharConfig.svelte'])
    assert.equal(
        manifest.units.some((candidate) =>
            candidate.file.includes('InlayImageGallery')
            || candidate.file.includes('database')
            || candidate.file.includes('characters.ts')
        ),
        false,
    )
})

test('viewer centralizes one keyboard action and exposes touch-sized controls', () => {
    assert.match(component, /getFullscreenImageAction\(event\.key, canGoPrev, canGoNext\)/)
    assert.match(component, /if \(action === 'close'\) onClose\(\)/)
    assert.match(component, /else if \(action === 'previous'\) onPrev\?\.\(\)/)
    assert.match(component, /<svelte:window onkeydown=\{handleKeydown\} \/>/)
    assert.match(component, /role="dialog"/)
    assert.match(component, /aria-modal="true"/)
    assert.match(component, /w-11 h-11/)
    assert.match(component, /aria-label=\{previousLabel\}/)
    assert.match(component, /aria-label=\{nextLabel\}/)
    assert.match(component, /draggable=\{false\}/)
    assert.doesNotMatch(component, /document\.addEventListener\('keydown'/)
})

test('pure navigation skips non-images and refuses unavailable boundaries', () => {
    assert.match(navigation, /key === 'Escape'/)
    assert.match(navigation, /key === 'ArrowLeft' && canGoPrevious/)
    assert.match(navigation, /key === 'ArrowRight' && canGoNext/)
    assert.match(navigation, /indexes\.indexOf\(currentIndex\)/)
    assert.match(navigation, /indexes\[position \+ direction\] \?\? null/)
    assert.match(navigationTests, /const imageIndexes = \[0, 2, 5\]/)
    assert.match(navigationTests, /getGalleryNeighborIndex\(imageIndexes, 2, -1\)\)\.toBe\(0\)/)
    assert.match(navigationTests, /getGalleryNeighborIndex\(imageIndexes, 2, 1\)\)\.toBe\(5\)/)
    assert.match(navigationTests, /getGalleryNeighborIndex\(imageIndexes, 0, -1\)\)\.toBeNull\(\)/)
    assert.match(navigationTests, /getGalleryNeighborIndex\(imageIndexes, 5, 1\)\)\.toBeNull\(\)/)
})

test('character hooks preserve asset writes and close stale character previews', () => {
    const state = managedText(unit('kei-fullscreen-image-viewer-core:char-config-state'))
    const thumbnail = managedText(unit(
        'kei-fullscreen-image-viewer-core:char-config-thumbnail',
    ))
    const viewer = managedText(unit('kei-fullscreen-image-viewer-core:char-config-viewer'))
    const allHooks = manifest.units
        .filter((candidate) => candidate.type !== 'owned')
        .map(managedText)
        .join('\n')

    assert.match(state, /previewableImageExtensions = \['png', 'webp', 'jpeg', 'jpg', 'gif', 'svg', 'avif'\]/)
    assert.match(state, /assetPreviewCharacterId !== currentCharacterId/)
    assert.match(state, /!assetPreviewIndexes\.includes\(assetPreviewIndex\)/)
    assert.match(state, /getGalleryNeighborIndex\(assetPreviewIndexes, assetPreviewIndex, direction\)/)
    assert.match(thumbnail, /onclick=\{\(\) => openAssetPreview\(i\)\}/)
    assert.match(viewer, /assetPreviewCharacterId === \$selectedCharID/)
    assert.match(viewer, /onPrev=\{\(\) => goToAssetPreviewNeighbor\(-1\)\}/)
    assert.match(viewer, /onNext=\{\(\) => goToAssetPreviewNeighbor\(1\)\}/)
    assert.doesNotMatch(
        allHooks,
        /additionalAssets\.push|additionalAssets\.splice|prebuiltAssetExclude\s*=|setDatabase|removeAsset/,
    )
})

test('Kei provenance is pinned and graph metadata changes the pack ETag', () => {
    assert.match(notice, /https:\/\/github\.com\/seto-sama\/PocketRisu-Kei/)
    assert.match(notice, /cc1d1b195babd887577ebf943d5e82f01f58135c/)
    assert.match(notice, /GNU General Public License v3\.0/)

    const pack = loadCatalog().find((candidate) => candidate.id === manifest.id)
    const original = packEtag(pack)
    assert.notEqual(packEtag({
        ...pack,
        units: pack.units.map((candidate, index) => index === 0
            ? { ...candidate, content: `${candidate.content}\n` }
            : candidate),
    }), original)
    assert.equal(packEtag(pack), original)
})
