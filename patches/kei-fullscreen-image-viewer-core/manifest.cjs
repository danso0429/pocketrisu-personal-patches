'use strict'

// PocketRisu 1.10.0 ships its own fullscreen asset viewer; this pack only adds
// accessible labels and dialog semantics to it.
const pocketRisu1100 = { pocketrisu: ['1.10.0'] }

module.exports = {
    id: 'kei-fullscreen-image-viewer-core',
    title: 'PocketRisu Kei fullscreen image viewer',
    version: '0.2.1',
    targets: {
        pocketrisu: {
            verified: ['1.10.0'],
            reviewing: [],
        },
    },
    userSelectable: false,
    units: [
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
            targetVersions: pocketRisu1100,
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
            targetVersions: pocketRisu1100,
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
            targetVersions: pocketRisu1100,
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
            targetVersions: pocketRisu1100,
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
            targetVersions: pocketRisu1100,
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
            targetVersions: pocketRisu1100,
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
            targetVersions: pocketRisu1100,
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
            targetVersions: pocketRisu1100,
            after: ['kei-fullscreen-image-viewer-core:asset-viewer-previous-label:1.9'],
        },
    ],
}
