'use strict'

const fs = require('node:fs')
const path = require('node:path')

const filesRoot = path.join(__dirname, 'files')
const owned = (relative) => fs.readFileSync(path.join(filesRoot, relative), 'utf8')
const pocketRisu181 = { pocketrisu: ['1.8.1'] }
const pocketRisu190 = { pocketrisu: ['1.9.0', '1.10.0'] }

module.exports = {
    id: 'kei-fullscreen-image-viewer-core',
    title: 'PocketRisu Kei fullscreen image viewer',
    version: '0.2.1',
    targets: {
        pocketrisu: {
            verified: ['1.8.1', '1.9.0'],
            reviewing: ['1.10.0'],
        },
    },
    userSelectable: false,
    units: [
        {
            id: 'kei-fullscreen-image-viewer-core:navigation',
            file: 'src/ts/fullscreenImageNavigation.ts',
            type: 'owned',
            content: owned('src/ts/fullscreenImageNavigation.ts'),
            targetVersions: pocketRisu181,
        },
        {
            id: 'kei-fullscreen-image-viewer-core:navigation-tests',
            file: 'src/ts/fullscreenImageNavigation.test.ts',
            type: 'owned',
            content: owned('src/ts/fullscreenImageNavigation.test.ts'),
            requires: ['kei-fullscreen-image-viewer-core:navigation'],
            targetVersions: pocketRisu181,
        },
        {
            id: 'kei-fullscreen-image-viewer-core:component',
            file: 'src/lib/UI/GUI/FullscreenImageViewer.svelte',
            type: 'owned',
            content: owned('src/lib/UI/GUI/FullscreenImageViewer.svelte'),
            requires: ['kei-fullscreen-image-viewer-core:navigation'],
            targetVersions: pocketRisu181,
        },
        {
            id: 'kei-fullscreen-image-viewer-core:char-config-imports',
            file: 'src/lib/SideBars/CharConfig.svelte',
            type: 'insert',
            where: 'after',
            anchor: '    import SliderInput from "../UI/GUI/SliderInput.svelte";\n',
            managed: `    /* POCKETRISU-PATCH:kei-fullscreen-image-viewer:imports:START */
    import FullscreenImageViewer from "../UI/GUI/FullscreenImageViewer.svelte";
    import { getGalleryNeighborIndex } from "../../ts/fullscreenImageNavigation";
    /* POCKETRISU-PATCH:kei-fullscreen-image-viewer:imports:END */
`,
            markerNeedle: 'POCKETRISU-PATCH:kei-fullscreen-image-viewer:imports:START',
            requires: [
                'kei-fullscreen-image-viewer-core:navigation',
                'kei-fullscreen-image-viewer-core:component',
            ],
            targetVersions: pocketRisu181,
        },
        {
            id: 'kei-fullscreen-image-viewer-core:char-config-state',
            file: 'src/lib/SideBars/CharConfig.svelte',
            type: 'insert',
            where: 'after',
            anchor: `    let assetFileExtensions:string[] = $state([])
    let assetFilePath:string[] = $state([])
`,
            managed: `    /* POCKETRISU-PATCH:kei-fullscreen-image-viewer:state:START */
    const previewableImageExtensions = ['png', 'webp', 'jpeg', 'jpg', 'gif', 'svg', 'avif']
    let assetPreviewIndex = $state(-1)
    let assetPreviewCharacterId = $state(-1)
    let assetPreviewIndexes = $derived.by(() => {
        const assets = (DBState.db.characters[$selectedCharID] as character).additionalAssets ?? []
        return assets
            .map((_, index) => index)
            .filter((index) => (
                previewableImageExtensions.includes((assetFileExtensions[index] ?? '').toLowerCase())
                && !!assetFilePath[index]
            ))
    })
    let assetPreviewPosition = $derived(assetPreviewIndexes.indexOf(assetPreviewIndex))
    let assetPreviewAsset = $derived(
        assetPreviewIndex >= 0
            ? (DBState.db.characters[$selectedCharID] as character).additionalAssets?.[assetPreviewIndex] ?? null
            : null
    )
    let assetPreviewPath = $derived(assetPreviewIndex >= 0 ? assetFilePath[assetPreviewIndex] ?? '' : '')

    function closeAssetPreview() {
        assetPreviewIndex = -1
        assetPreviewCharacterId = -1
    }

    function openAssetPreview(index: number) {
        if (!assetPreviewIndexes.includes(index)) return
        assetPreviewCharacterId = $selectedCharID
        assetPreviewIndex = index
    }

    function goToAssetPreviewNeighbor(direction: -1 | 1) {
        const nextIndex = getGalleryNeighborIndex(assetPreviewIndexes, assetPreviewIndex, direction)
        if (nextIndex !== null) assetPreviewIndex = nextIndex
    }

    $effect.pre(() => {
        const currentCharacterId = $selectedCharID
        if (
            assetPreviewIndex >= 0
            && (
                assetPreviewCharacterId !== currentCharacterId
                || !assetPreviewIndexes.includes(assetPreviewIndex)
            )
        ) {
            closeAssetPreview()
        }
    })
    /* POCKETRISU-PATCH:kei-fullscreen-image-viewer:state:END */
`,
            markerNeedle: 'POCKETRISU-PATCH:kei-fullscreen-image-viewer:state:START',
            requires: ['kei-fullscreen-image-viewer-core:char-config-imports'],
            targetVersions: pocketRisu181,
        },
        {
            id: 'kei-fullscreen-image-viewer-core:char-config-thumbnail',
            file: 'src/lib/SideBars/CharConfig.svelte',
            type: 'replace',
            anchor: `                                        {:else if ['png', 'webp', 'jpeg', 'jpg', 'gif'].includes(assetFileExtensions[i])}
                                            <img src={assetFilePath[i]} class="w-16 h-16 m-1 rounded-md" alt={assets[0]}/>
`,
            managed: `                                        {:else if previewableImageExtensions.includes((assetFileExtensions[i] ?? '').toLowerCase())}
                                            <!-- POCKETRISU-PATCH:kei-fullscreen-image-viewer:thumbnail -->
                                            <button
                                                type="button"
                                                class="w-16 h-16 m-1 rounded-md overflow-hidden cursor-zoom-in"
                                                onclick={() => openAssetPreview(i)}
                                                title={assets[0]}
                                                aria-label={assets[0]}
                                            >
                                                <img
                                                    src={assetFilePath[i]}
                                                    class="w-full h-full object-cover"
                                                    alt={assets[0]}
                                                    draggable={false}
                                                />
                                            </button>
`,
            markerNeedle: 'POCKETRISU-PATCH:kei-fullscreen-image-viewer:thumbnail',
            requires: ['kei-fullscreen-image-viewer-core:char-config-state'],
            targetVersions: pocketRisu181,
        },
        {
            id: 'kei-fullscreen-image-viewer-core:char-config-viewer',
            file: 'src/lib/SideBars/CharConfig.svelte',
            type: 'insert',
            where: 'before',
            anchor: '<style>\n',
            managed: `<!-- POCKETRISU-PATCH:kei-fullscreen-image-viewer:viewer:START -->
<FullscreenImageViewer
    open={
        assetPreviewIndex >= 0
        && assetPreviewCharacterId === $selectedCharID
        && !!assetPreviewAsset
        && !!assetPreviewPath
    }
    src={assetPreviewPath}
    alt={assetPreviewAsset?.[0] ?? ''}
    title={assetPreviewAsset?.[0] ?? ''}
    position={assetPreviewPosition}
    total={assetPreviewIndexes.length}
    canGoPrev={assetPreviewPosition > 0}
    canGoNext={assetPreviewPosition >= 0 && assetPreviewPosition < assetPreviewIndexes.length - 1}
    closeLabel={language.goback}
    onClose={closeAssetPreview}
    onPrev={() => goToAssetPreviewNeighbor(-1)}
    onNext={() => goToAssetPreviewNeighbor(1)}
/>
<!-- POCKETRISU-PATCH:kei-fullscreen-image-viewer:viewer:END -->

`,
            markerNeedle: 'POCKETRISU-PATCH:kei-fullscreen-image-viewer:viewer:START',
            requires: [
                'kei-fullscreen-image-viewer-core:component',
                'kei-fullscreen-image-viewer-core:char-config-state',
                'kei-fullscreen-image-viewer-core:char-config-thumbnail',
            ],
            targetVersions: pocketRisu181,
        },
        {
            id: 'kei-fullscreen-image-viewer-core:asset-viewer-dialog:1.9',
            file: 'src/lib/Others/AssetViewer.svelte',
            type: 'replace',
            anchor: '<div class="fixed inset-0 z-50 flex flex-col" style="background: #09090b;">\n',
            managed: `<div
  class="fixed inset-0 z-50 flex flex-col"
  style="background: #09090b;"
  role="dialog"
  aria-modal="true"
  aria-label={assetViewerStore.title}
>\n`,
            targetVersions: pocketRisu190,
        },
        {
            id: 'kei-fullscreen-image-viewer-core:asset-viewer-search-label:1.9',
            file: 'src/lib/Others/AssetViewer.svelte',
            type: 'replace',
            anchor: `          placeholder={language.search}
          bind:value={search}
`,
            managed: `          placeholder={language.search}
          aria-label={language.search}
          bind:value={search}
`,
            targetVersions: pocketRisu190,
            after: ['kei-fullscreen-image-viewer-core:asset-viewer-dialog:1.9'],
        },
        {
            id: 'kei-fullscreen-image-viewer-core:asset-viewer-grid-close:1.9',
            file: 'src/lib/Others/AssetViewer.svelte',
            type: 'replace',
            anchor: `      <button
        class="w-9 h-9 rounded-full border border-white/20 bg-black/50 hover:bg-black/70 flex items-center justify-center text-white transition-colors"
        onclick={closeAssetViewer}
        title={language.goback}
      >
`,
            managed: `      <button
        type="button"
        class="w-11 h-11 rounded-full border border-white/20 bg-black/50 hover:bg-black/70 flex items-center justify-center text-white transition-colors"
        onclick={closeAssetViewer}
        title={language.goback}
        aria-label={language.goback}
      >
`,
            targetVersions: pocketRisu190,
            after: ['kei-fullscreen-image-viewer-core:asset-viewer-search-label:1.9'],
        },
        {
            id: 'kei-fullscreen-image-viewer-core:asset-viewer-thumbnail-label:1.9',
            file: 'src/lib/Others/AssetViewer.svelte',
            type: 'replace',
            anchor: `          <button
            class="relative group aspect-square rounded-lg overflow-hidden bg-darkbg border border-darkborderc hover:border-borderc/70 transition-colors"
            onclick={() => (zoomIndex = i)}
          >
`,
            managed: `          <button
            type="button"
            class="relative group aspect-square rounded-lg overflow-hidden bg-darkbg border border-darkborderc hover:border-borderc/70 transition-colors"
            onclick={() => (zoomIndex = i)}
            aria-label={item.name}
          >
`,
            targetVersions: pocketRisu190,
            after: ['kei-fullscreen-image-viewer-core:asset-viewer-grid-close:1.9'],
        },
        {
            id: 'kei-fullscreen-image-viewer-core:asset-viewer-zoom-label:1.9',
            file: 'src/lib/Others/AssetViewer.svelte',
            type: 'replace',
            anchor: '  <div class="fixed inset-0 z-[60]" style="background: #09090b;">\n',
            managed: `<div
    class="fixed inset-0 z-[60]"
    style="background: #09090b;"
    role="group"
    aria-label={current?.name ?? assetViewerStore.title}
  >\n`,
            targetVersions: pocketRisu190,
            after: ['kei-fullscreen-image-viewer-core:asset-viewer-thumbnail-label:1.9'],
        },
        {
            id: 'kei-fullscreen-image-viewer-core:asset-viewer-zoom-close:1.9',
            file: 'src/lib/Others/AssetViewer.svelte',
            type: 'replace',
            anchor: `      <button
        class="w-9 h-9 rounded-full border border-white/20 bg-black/50 hover:bg-black/70 flex items-center justify-center text-white transition-colors shrink-0 pointer-events-auto"
        onclick={() => (zoomIndex = -1)}
        title={language.goback}
      >
`,
            managed: `      <button
        type="button"
        class="w-11 h-11 rounded-full border border-white/20 bg-black/50 hover:bg-black/70 flex items-center justify-center text-white transition-colors shrink-0 pointer-events-auto"
        onclick={() => (zoomIndex = -1)}
        title={language.goback}
        aria-label={language.goback}
      >
`,
            targetVersions: pocketRisu190,
            after: ['kei-fullscreen-image-viewer-core:asset-viewer-zoom-label:1.9'],
        },
        {
            id: 'kei-fullscreen-image-viewer-core:asset-viewer-previous-label:1.9',
            file: 'src/lib/Others/AssetViewer.svelte',
            type: 'replace',
            anchor: `      <button
        class="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full border border-white/20 bg-black/50 hover:bg-black/70 flex items-center justify-center text-white transition-colors"
        onclick={() => go(-1)}
      >
`,
            managed: `      <button
        type="button"
        class="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full border border-white/20 bg-black/50 hover:bg-black/70 flex items-center justify-center text-white transition-colors"
        onclick={() => go(-1)}
        aria-label={\`← \${filtered[zoomIndex - 1]?.name ?? assetViewerStore.title}\`}
      >
`,
            targetVersions: pocketRisu190,
            after: ['kei-fullscreen-image-viewer-core:asset-viewer-zoom-close:1.9'],
        },
        {
            id: 'kei-fullscreen-image-viewer-core:asset-viewer-next-label:1.9',
            file: 'src/lib/Others/AssetViewer.svelte',
            type: 'replace',
            anchor: `      <button
        class="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full border border-white/20 bg-black/50 hover:bg-black/70 flex items-center justify-center text-white transition-colors"
        onclick={() => go(1)}
      >
`,
            managed: `      <button
        type="button"
        class="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full border border-white/20 bg-black/50 hover:bg-black/70 flex items-center justify-center text-white transition-colors"
        onclick={() => go(1)}
        aria-label={\`→ \${filtered[zoomIndex + 1]?.name ?? assetViewerStore.title}\`}
      >
`,
            targetVersions: pocketRisu190,
            after: ['kei-fullscreen-image-viewer-core:asset-viewer-previous-label:1.9'],
        },
    ],
}
