<script lang="ts">
    import type { Snippet } from 'svelte'
    import { ChevronLeft, ChevronRight, Download, Info, X } from '@lucide/svelte'
    import { getFullscreenImageAction } from 'src/ts/fullscreenImageNavigation'

    interface Props {
        open?: boolean
        src?: string
        alt?: string
        title?: string
        position?: number
        total?: number
        loading?: boolean
        error?: string
        loadingLabel?: string
        canGoPrev?: boolean
        canGoNext?: boolean
        infoOpen?: boolean
        infoLabel?: string
        downloadLabel?: string
        closeLabel?: string
        previousLabel?: string
        nextLabel?: string
        onClose: () => void
        onPrev?: () => void
        onNext?: () => void
        onDownload?: () => void | Promise<void>
        info?: Snippet
        statusOverlay?: Snippet
    }

    let {
        open = false,
        src = '',
        alt = '',
        title = '',
        position = -1,
        total = 0,
        loading = false,
        error = '',
        loadingLabel = 'Loading...',
        canGoPrev = false,
        canGoNext = false,
        infoOpen = $bindable(false),
        infoLabel = 'Info',
        downloadLabel = 'Download',
        closeLabel = 'Close',
        previousLabel = 'Previous image',
        nextLabel = 'Next image',
        onClose,
        onPrev,
        onNext,
        onDownload,
        info,
        statusOverlay,
    }: Props = $props()

    function handleKeydown(event: KeyboardEvent) {
        if (!open) return
        const action = getFullscreenImageAction(event.key, canGoPrev, canGoNext)
        if (!action) return
        event.preventDefault()
        if (action === 'close') onClose()
        else if (action === 'previous') onPrev?.()
        else onNext?.()
    }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
    <div
        class="fixed inset-0 z-50 flex overflow-hidden bg-bgcolor text-textcolor"
        role="dialog"
        aria-modal="true"
        aria-label={title || alt || closeLabel}
    >
        <div class="relative flex flex-1 min-w-0 items-center justify-center overflow-hidden">
            <div class="absolute top-0 inset-x-0 z-10 flex items-center gap-3 px-4 py-3 bg-gradient-to-b from-darkbg/90 to-transparent pointer-events-none">
                <div class="flex-1 min-w-0">
                    <p class="text-textcolor text-sm font-semibold truncate">{title}</p>
                    {#if position >= 0 && total > 0}
                        <p class="text-textcolor2 text-xs">{position + 1} / {total}</p>
                    {/if}
                </div>
                <div class="flex gap-2 shrink-0 pointer-events-auto">
                    {#if info}
                        <button
                            type="button"
                            class="w-11 h-11 rounded-full border border-darkborderc bg-darkbutton hover:bg-selected flex items-center justify-center text-textcolor transition-colors"
                            onclick={() => (infoOpen = !infoOpen)}
                            title={infoLabel}
                            aria-label={infoLabel}
                        >
                            <Info size={18} />
                        </button>
                    {/if}
                    {#if onDownload}
                        <button
                            type="button"
                            class="w-11 h-11 rounded-full border border-darkborderc bg-darkbutton hover:bg-selected flex items-center justify-center text-textcolor transition-colors"
                            onclick={onDownload}
                            title={downloadLabel}
                            aria-label={downloadLabel}
                        >
                            <Download size={18} />
                        </button>
                    {/if}
                    <button
                        type="button"
                        class="w-11 h-11 rounded-full border border-darkborderc bg-darkbutton hover:bg-selected flex items-center justify-center text-textcolor transition-colors"
                        onclick={onClose}
                        title={closeLabel}
                        aria-label={closeLabel}
                    >
                        <X size={18} />
                    </button>
                </div>
            </div>

            {#if canGoPrev}
                <button
                    type="button"
                    class="absolute left-3 z-10 w-11 h-11 rounded-full border border-darkborderc bg-darkbutton hover:bg-selected flex items-center justify-center text-textcolor transition-colors"
                    onclick={onPrev}
                    aria-label={previousLabel}
                >
                    <ChevronLeft size={22} class="-translate-x-px" />
                </button>
            {/if}

            <div class="w-full h-full flex items-center justify-center px-16 py-16">
                {#if loading}
                    <div class="flex flex-col items-center gap-4" aria-live="polite">
                        <div class="w-12 h-12 border-4 border-selected border-t-primary rounded-full animate-spin"></div>
                        <p class="text-textcolor2 text-sm">{loadingLabel}</p>
                    </div>
                {:else if error}
                    <p class="text-draculared text-sm" role="alert">{error}</p>
                {:else if src}
                    <img
                        {src}
                        {alt}
                        class="max-w-full max-h-full object-contain rounded shadow-2xl"
                        style="max-height: calc(100vh - 128px);"
                        draggable={false}
                    />
                {/if}
            </div>

            {#if canGoNext}
                <button
                    type="button"
                    class="absolute right-3 z-10 w-11 h-11 rounded-full border border-darkborderc bg-darkbutton hover:bg-selected flex items-center justify-center text-textcolor transition-colors"
                    onclick={onNext}
                    aria-label={nextLabel}
                >
                    <ChevronRight size={22} class="translate-x-px" />
                </button>
            {/if}

            {#if statusOverlay}
                {@render statusOverlay()}
            {/if}
        </div>

        {#if infoOpen && info}
            <div class="absolute inset-y-0 right-0 z-20 w-[min(20rem,85vw)] flex flex-col overflow-hidden border-l border-darkborderc bg-darkbg">
                <div class="flex items-center justify-between px-4 py-3">
                    <span class="text-textcolor text-sm font-semibold">{infoLabel}</span>
                    <button
                        type="button"
                        class="w-11 h-11 flex items-center justify-center text-textcolor2 hover:text-textcolor transition-colors"
                        onclick={() => (infoOpen = false)}
                        aria-label={closeLabel}
                    >
                        <X size={18} />
                    </button>
                </div>
                <div class="flex-1 overflow-y-auto">
                    {@render info()}
                </div>
            </div>
        {/if}
    </div>
{/if}
