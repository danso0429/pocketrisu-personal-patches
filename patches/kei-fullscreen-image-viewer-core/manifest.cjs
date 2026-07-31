'use strict'

const fs = require('node:fs')
const path = require('node:path')

const filesRoot = path.join(__dirname, 'files')
const owned = (relative) => fs.readFileSync(path.join(filesRoot, relative), 'utf8')

module.exports = {
    id: 'kei-fullscreen-image-viewer-core',
    title: 'PocketRisu Kei fullscreen image viewer',
    version: '0.1.0',
    userSelectable: false,
    units: [
        {
            id: 'kei-fullscreen-image-viewer-core:navigation',
            file: 'src/ts/fullscreenImageNavigation.ts',
            type: 'owned',
            content: owned('src/ts/fullscreenImageNavigation.ts'),
        },
        {
            id: 'kei-fullscreen-image-viewer-core:navigation-tests',
            file: 'src/ts/fullscreenImageNavigation.test.ts',
            type: 'owned',
            content: owned('src/ts/fullscreenImageNavigation.test.ts'),
            requires: ['kei-fullscreen-image-viewer-core:navigation'],
        },
        {
            id: 'kei-fullscreen-image-viewer-core:component',
            file: 'src/lib/UI/GUI/FullscreenImageViewer.svelte',
            type: 'owned',
            content: owned('src/lib/UI/GUI/FullscreenImageViewer.svelte'),
            requires: ['kei-fullscreen-image-viewer-core:navigation'],
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
        },
    ],
}
