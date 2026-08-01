<script lang="ts">
    import {
        CopyIcon,
        EraserIcon,
        EyeIcon,
        EyeOffIcon,
        PencilIcon,
        RefreshCcwIcon,
        SearchIcon,
        Trash2Icon,
        XIcon,
    } from '@lucide/svelte'
    import { onDestroy, onMount } from 'svelte'
    import ShButton from 'src/lib/UI/GUI/ShButton.svelte'
    import ShInput from 'src/lib/UI/GUI/ShInput.svelte'
    import { language } from 'src/lang'
    import {
        alertConfirm,
        notifyError,
        notifySuccess,
    } from 'src/ts/alert'
    import { getDatabase } from 'src/ts/storage/database.svelte'
    import { fetchChatFromServer } from 'src/ts/storage/chatStorage'
    import {
        deleteLLMCacheEntry,
        listLLMCacheEntries,
        replaceLLMCacheEntry,
        subscribeLLMTranslationCache,
        type LLMCacheEntryIdentity,
    } from 'src/ts/translator/translationCacheRuntime'
    import { findUnusedTranslationCacheEntries } from 'src/ts/translator/translationCacheStore'
    import { collectKnownTranslationSourceKeys } from 'src/ts/translator/translationCacheUsage'
    import { isTranslationAbortError } from 'src/ts/translator/translationTask'

    const DISPLAY_LIMIT = 20

    let entries = $state<LLMCacheEntryIdentity[]>([])
    let total = $state(0)
    let search = $state('')
    let loading = $state(false)
    let loadComplete = $state(false)
    let loadError = $state<string | null>(null)
    let expanded = $state<Record<string, boolean>>({})
    let showOriginal = $state<Record<string, boolean>>({})
    let editingEntry = $state<LLMCacheEntryIdentity | null>(null)
    let editingValue = $state('')
    let cleanupCandidates = $state<LLMCacheEntryIdentity[]>([])
    let cleanupRunning = $state(false)
    let cleanupStatus = $state('')
    let loadRequestId = 0
    let loadController: AbortController | null = null
    let cleanupController: AbortController | null = null
    let reloadTimer: ReturnType<typeof setTimeout> | null = null
    let unsubscribe: (() => void) | null = null

    const candidateStorageKeys = $derived(
        new Set(cleanupCandidates.map((entry) => entry.storageKey)),
    )
    const filteredEntries = $derived.by(() => {
        const query = search.trim().toLocaleLowerCase()
        const source = cleanupCandidates.length > 0
            ? entries.filter((entry) => candidateStorageKeys.has(entry.storageKey))
            : entries
        if (!query) {
            return source
        }
        return source.filter((entry) =>
            entry.key.toLocaleLowerCase().includes(query)
            || entry.value.toLocaleLowerCase().includes(query)
        )
    })
    const displayedEntries = $derived(filteredEntries.slice(0, DISPLAY_LIMIT))

    function cloneEntry(entry: LLMCacheEntryIdentity): LLMCacheEntryIdentity {
        return {
            storageKey: entry.storageKey,
            key: entry.key,
            value: entry.value,
        }
    }

    function cancelLoad(): void {
        loadController?.abort()
        loadController = null
        loadRequestId++
    }

    async function reloadEntries(): Promise<void> {
        cancelLoad()
        const requestId = loadRequestId
        const controller = new AbortController()
        loadController = controller
        loading = true
        loadComplete = false
        loadError = null

        try {
            const result = await listLLMCacheEntries({
                batchSize: 100,
                signal: controller.signal,
                onProgress: (state) => {
                    if (requestId !== loadRequestId) return
                    entries = state.entries
                    total = state.total
                    loadComplete = state.done
                },
            })
            if (requestId !== loadRequestId) return
            entries = result.entries
            total = result.total
            loadComplete = result.done
        }
        catch (error) {
            if (requestId !== loadRequestId || isTranslationAbortError(error)) {
                return
            }
            loadError = error instanceof Error ? error.message : String(error)
        }
        finally {
            if (requestId === loadRequestId) {
                loading = false
                loadController = null
            }
        }
    }

    function scheduleReload(): void {
        if (cleanupRunning) {
            return
        }
        if (reloadTimer) {
            clearTimeout(reloadTimer)
        }
        reloadTimer = setTimeout(() => {
            reloadTimer = null
            void reloadEntries()
        }, 150)
    }

    async function copyEntry(entry: LLMCacheEntryIdentity): Promise<void> {
        try {
            await navigator.clipboard.writeText(`${entry.key}\n\n---\n\n${entry.value}`)
            notifySuccess(language.copied)
        }
        catch (error) {
            notifyError(error)
        }
    }

    function openEdit(entry: LLMCacheEntryIdentity): void {
        editingEntry = cloneEntry(entry)
        editingValue = entry.value
    }

    function closeEdit(): void {
        editingEntry = null
        editingValue = ''
    }

    async function saveEdit(): Promise<void> {
        if (!editingEntry) return
        try {
            const result = await replaceLLMCacheEntry(
                cloneEntry(editingEntry),
                editingValue,
            )
            if (result.status !== 'updated') {
                notifyError(language.translationCacheEntryChanged)
                scheduleReload()
                return
            }
            closeEdit()
            notifySuccess(language.translationCacheEntrySaved)
        }
        catch (error) {
            notifyError(error)
        }
    }

    async function deleteEntry(entry: LLMCacheEntryIdentity): Promise<void> {
        if (!await alertConfirm(language.deleteTranslationCacheEntryConfirm)) {
            return
        }
        try {
            const result = await deleteLLMCacheEntry(cloneEntry(entry))
            if (result.status !== 'deleted') {
                notifyError(language.translationCacheEntryChanged)
                scheduleReload()
                return
            }
            if (editingEntry?.storageKey === entry.storageKey) {
                closeEdit()
            }
            notifySuccess(language.deleteTranslationCacheEntrySuccess)
        }
        catch (error) {
            notifyError(error)
        }
    }

    function cancelCleanup(): void {
        const controller = cleanupController
        if (!controller) {
            return
        }
        controller.abort()
        cleanupStatus = language.translationCacheCleanupCancelled
    }

    async function scanCleanupCandidates(): Promise<void> {
        cancelCleanup()
        cleanupCandidates = []
        const controller = new AbortController()
        cleanupController = controller
        cleanupRunning = true
        cleanupStatus = language.cleanupUnusedTranslationCacheProgressScanningChats
        try {
            const usedKeys = await collectKnownTranslationSourceKeys(
                getDatabase(),
                {
                    signal: controller.signal,
                    fetchChat: fetchChatFromServer,
                    onProgress: (current, sourceTotal) => {
                        if (cleanupController !== controller) return
                        cleanupStatus =
                            language.translationCacheCleanupScanProgress(
                                current,
                                sourceTotal,
                            )
                    },
                },
            )
            if (cleanupController !== controller) return
            cleanupStatus = language.cleanupUnusedTranslationCacheProgressLoadingCache
            const cache = await listLLMCacheEntries({
                batchSize: 100,
                signal: controller.signal,
                onProgress: (state) => {
                    if (cleanupController !== controller) return
                    cleanupStatus =
                        language.translationCacheCleanupLoadProgress(
                            state.entries.length,
                            state.total,
                    )
                },
            })
            if (cleanupController !== controller) return
            const candidates = findUnusedTranslationCacheEntries(
                cache.entries,
                usedKeys,
            )
            entries = cache.entries
            total = cache.total
            cleanupCandidates = candidates
            search = ''
            cleanupStatus = language.translationCacheCleanupPreviewReady(
                candidates.length,
            )
        }
        catch (error) {
            if (cleanupController !== controller) {
                return
            }
            if (isTranslationAbortError(error)) {
                cleanupStatus = language.translationCacheCleanupCancelled
            }
            else {
                cleanupStatus = ''
                notifyError(error)
            }
        }
        finally {
            if (cleanupController === controller) {
                cleanupController = null
                cleanupRunning = false
            }
        }
    }

    async function deleteCleanupCandidates(): Promise<void> {
        if (cleanupCandidates.length === 0) return
        const candidates = cleanupCandidates.map(cloneEntry)
        if (!await alertConfirm(
            language.cleanupUnusedTranslationCacheConfirm(
                candidates.length,
            ),
        )) {
            return
        }

        const controller = new AbortController()
        cleanupController = controller
        cleanupRunning = true
        let deleted = 0
        let skipped = 0
        const remainingStorageKeys = new Set(
            candidates.map((entry) => entry.storageKey),
        )
        try {
            for (let index = 0; index < candidates.length; index++) {
                if (controller.signal.aborted) {
                    const error = new Error('Translation cache cleanup aborted')
                    error.name = 'AbortError'
                    throw error
                }
                cleanupStatus = language.cleanupUnusedTranslationCacheProgressDeleting(
                    index + 1,
                    candidates.length,
                )
                const result = await deleteLLMCacheEntry(
                    candidates[index],
                )
                if (result.status === 'deleted') {
                    deleted++
                }
                else {
                    skipped++
                }
                remainingStorageKeys.delete(candidates[index].storageKey)
            }
            if (cleanupController !== controller) return
            cleanupCandidates = []
            cleanupStatus = language.cleanupUnusedTranslationCacheSuccess(
                deleted,
                skipped,
            )
            notifySuccess(cleanupStatus)
            await reloadEntries()
        }
        catch (error) {
            if (cleanupController !== controller) {
                return
            }
            if (isTranslationAbortError(error)) {
                cleanupCandidates = cleanupCandidates.filter(
                    (entry) => remainingStorageKeys.has(entry.storageKey),
                )
                cleanupStatus = deleted + skipped > 0
                    ? language.translationCacheCleanupCancelledAfter(
                        deleted,
                        skipped,
                    )
                    : language.translationCacheCleanupCancelled
                await reloadEntries()
            }
            else {
                cleanupCandidates = cleanupCandidates.filter(
                    (entry) => remainingStorageKeys.has(entry.storageKey),
                )
                notifyError(error)
                await reloadEntries()
            }
        }
        finally {
            if (cleanupController === controller) {
                cleanupController = null
                cleanupRunning = false
            }
        }
    }

    function closeCleanupPreview(): void {
        cleanupCandidates = []
        cleanupStatus = ''
    }

    onMount(() => {
        unsubscribe = subscribeLLMTranslationCache(scheduleReload)
        void reloadEntries()
    })

    onDestroy(() => {
        cancelLoad()
        cleanupController?.abort()
        cleanupController = null
        if (reloadTimer) {
            clearTimeout(reloadTimer)
        }
        unsubscribe?.()
    })
</script>

<section class="mt-5 rounded-lg border border-darkborderc bg-darkbg/40 p-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
            <h3 class="font-semibold text-textcolor">
                {language.translationCacheManagement}
            </h3>
            <p class="mt-1 text-sm leading-relaxed text-textcolor2">
                {language.translationCacheManagementDesc}
            </p>
        </div>
        <ShButton
            variant="outline"
            size="sm"
            onclick={() => reloadEntries()}
            disabled={loading || cleanupRunning}
        >
            <RefreshCcwIcon size={16} />
            {language.translationCacheRefresh}
        </ShButton>
    </div>

    <div class="mt-4 rounded-md border border-darkborderc/70 p-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="min-w-0">
                <div class="flex items-center gap-2 font-medium text-textcolor">
                    <EraserIcon size={16} />
                    {language.cleanupUnusedTranslationCache}
                </div>
                <p class="mt-1 text-sm leading-relaxed text-textcolor2">
                    {language.cleanupUnusedTranslationCacheDesc}
                </p>
            </div>
            <div class="flex flex-wrap gap-2">
                {#if cleanupRunning}
                    <ShButton variant="outline" size="sm" onclick={cancelCleanup}>
                        <XIcon size={16} />
                        {language.cancel}
                    </ShButton>
                {:else if cleanupCandidates.length > 0}
                    <ShButton
                        variant="destructive"
                        size="sm"
                        onclick={deleteCleanupCandidates}
                    >
                        <Trash2Icon size={16} />
                        {language.translationCacheDeleteCandidates(
                            cleanupCandidates.length,
                        )}
                    </ShButton>
                    <ShButton variant="outline" size="sm" onclick={closeCleanupPreview}>
                        <XIcon size={16} />
                        {language.cancel}
                    </ShButton>
                {:else}
                    <ShButton
                        variant="outline"
                        size="sm"
                        onclick={scanCleanupCandidates}
                        disabled={loading}
                    >
                        <SearchIcon size={16} />
                        {language.translationCacheScanCandidates}
                    </ShButton>
                {/if}
            </div>
        </div>
        <p class="mt-2 text-xs leading-relaxed text-textcolor2">
            {language.translationCacheCleanupScopeWarning}
        </p>
        {#if cleanupStatus}
            <p class="mt-2 text-sm text-textcolor" aria-live="polite">
                {cleanupStatus}
            </p>
        {/if}
    </div>

    <div class="mt-4">
        <div class="flex items-center gap-2 font-medium text-textcolor">
            <SearchIcon size={16} />
            {cleanupCandidates.length > 0
                ? language.translationCacheCleanupCandidates
                : language.translationCacheEntries}
        </div>
        <div class="mt-2">
            <ShInput
                bind:value={search}
                placeholder={language.translationCacheSearchPlaceholder}
            />
        </div>
        <p class="mt-2 text-xs text-textcolor2" aria-live="polite">
            {#if loadError}
                {loadError}
            {:else}
                {language.translationCacheShown(
                    displayedEntries.length,
                    filteredEntries.length,
                    total,
                    loading || !loadComplete,
                )}
            {/if}
        </p>
    </div>

    {#if displayedEntries.length > 0}
        <div class="mt-3 flex flex-col gap-2">
            {#each displayedEntries as entry (entry.storageKey)}
                <details
                    class="rounded-md border border-darkborderc/70 bg-bgcolor/30"
                    open={expanded[entry.storageKey] === true}
                    ontoggle={(event) => {
                        expanded = {
                            ...expanded,
                            [entry.storageKey]: event.currentTarget.open,
                        }
                    }}
                >
                    <summary
                        class="cursor-pointer select-none truncate p-3 text-sm text-textcolor"
                    >
                        {entry.key}
                    </summary>
                    <div class="border-t border-darkborderc/70 p-3">
                        {#if showOriginal[entry.storageKey]}
                            <p class="mb-1 text-xs text-textcolor2">
                                {language.translationCacheOriginal}
                            </p>
                            <pre class="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded border border-darkborderc/50 bg-darkbg/60 p-2 text-xs text-textcolor">{entry.key}</pre>
                        {/if}

                        <p class="mb-1 mt-2 text-xs text-textcolor2">
                            {language.translationCacheTranslated}
                        </p>
                        {#if editingEntry?.storageKey === entry.storageKey}
                            <textarea
                                class="min-h-28 w-full resize-y rounded border border-darkborderc bg-bgcolor p-2 text-base text-textcolor outline-none focus:border-borderc focus:ring-2 focus:ring-borderc/50"
                                bind:value={editingValue}
                            ></textarea>
                        {:else}
                            <pre class="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded border border-darkborderc/50 bg-darkbg/60 p-2 text-xs text-textcolor">{entry.value}</pre>
                        {/if}

                        <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
                            <div class="flex flex-wrap gap-2">
                                {#if editingEntry?.storageKey === entry.storageKey}
                                    <ShButton variant="outline" size="sm" onclick={closeEdit}>
                                        {language.cancel}
                                    </ShButton>
                                    <ShButton variant="primary" size="sm" onclick={saveEdit}>
                                        {language.editTranslationSave}
                                    </ShButton>
                                {:else}
                                    <ShButton variant="outline" size="sm" onclick={() => copyEntry(entry)}>
                                        <CopyIcon size={16} />
                                        {language.copy}
                                    </ShButton>
                                    <ShButton variant="outline" size="sm" onclick={() => openEdit(entry)}>
                                        <PencilIcon size={16} />
                                        {language.edit}
                                    </ShButton>
                                    <ShButton
                                        variant="outline"
                                        size="sm"
                                        onclick={() => {
                                            showOriginal = {
                                                ...showOriginal,
                                                [entry.storageKey]: !showOriginal[entry.storageKey],
                                            }
                                        }}
                                    >
                                        {#if showOriginal[entry.storageKey]}
                                            <EyeOffIcon size={16} />
                                            {language.translationCacheHideOriginal}
                                        {:else}
                                            <EyeIcon size={16} />
                                            {language.translationCacheShowOriginal}
                                        {/if}
                                    </ShButton>
                                {/if}
                            </div>
                            <ShButton
                                variant="destructive"
                                size="sm"
                                onclick={() => deleteEntry(entry)}
                            >
                                <Trash2Icon size={16} />
                                {language.remove}
                            </ShButton>
                        </div>
                    </div>
                </details>
            {/each}
        </div>
    {:else if !loading}
        <div class="mt-3 rounded-md border border-dashed border-darkborderc p-8 text-center text-sm text-textcolor2">
            {search.trim()
                ? language.translationCacheNoSearchResults
                : language.exportTranslationCacheEmpty}
        </div>
    {/if}
</section>
