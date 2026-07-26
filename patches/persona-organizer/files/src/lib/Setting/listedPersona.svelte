<!-- POCKETRISU-PATCH:persona-organizer:START -->
<script lang="ts">
    import {
        ArrowDownIcon,
        ArrowUpIcon,
        FolderIcon,
        FolderOpenIcon,
        FolderPlusIcon,
        PencilIcon,
        Trash2Icon,
        XIcon,
    } from "@lucide/svelte"
    import { language } from "../../lang"
    import { alertConfirm, alertInput } from "src/ts/alert"
    import { getCharImage } from "src/ts/characters"
    import { requestImmediateSave } from "src/ts/globalApi.svelte"
    import { changeUserPersona, saveUserPersona } from "src/ts/persona"
    import {
        buildPersonaGroups,
        reorderPersonaList,
        type PersonaGroup,
    } from "src/ts/personaOrganizer"
    import type {
        RisuPersona,
        RisuPersonaFolder,
    } from "src/ts/storage/database.svelte"
    import { DBState } from "src/ts/stores.svelte"
    import { v4 } from "uuid"

    interface Props {
        close?: () => void
        onSelect?: ((index: number) => void) | null
    }

    let { close = () => {}, onSelect = null }: Props = $props()

    let openFolderId = $state<string | null>(null)
    let currentDragId = $state<string | null>(null)
    let dragActive = $state(false)
    let highlightedDrop: HTMLElement | null = null
    let suppressClickUntil = 0
    let touchDrag: {
        sourceId: string
        source: HTMLElement
        ghost: HTMLElement | null
    } | null = null
    let longPressTimer: ReturnType<typeof setTimeout> | null = null
    let touchStart = { x: 0, y: 0 }

    const isTouchDevice = typeof window !== "undefined"
        && (window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0)

    const groups = $derived.by((): PersonaGroup[] => {
        DBState.db.personaFolders ??= []
        for (const persona of DBState.db.personas) persona.id ??= v4()
        return buildPersonaGroups(DBState.db.personas, DBState.db.personaFolders)
    })
    const unfiledGroup = $derived(groups[0])
    const openGroup = $derived(
        openFolderId
            ? groups.find((group) => group.id === openFolderId) ?? null
            : null
    )

    function selectedPersonaId(): string | null {
        return DBState.db.personas[DBState.db.selectedPersona]?.id ?? null
    }

    function commitPersonas(personas: RisuPersona[], keepSelectedId: string | null): void {
        DBState.db.personas = personas
        const nextSelected = personas.findIndex((persona) => persona.id === keepSelectedId)
        changeUserPersona(nextSelected >= 0 ? nextSelected : 0, "noSave")
        void requestImmediateSave()
    }

    function reorderPersona(sourceId: string, folderId: string | null, beforeId: string | null): void {
        saveUserPersona()
        const keepSelectedId = selectedPersonaId()
        commitPersonas(
            reorderPersonaList(
                DBState.db.personas,
                DBState.db.personaFolders,
                sourceId,
                folderId,
                beforeId,
            ),
            keepSelectedId,
        )
    }

    async function addFolder(): Promise<void> {
        const name = await alertInput("Folder name")
        if (!name?.trim()) return
        const folder = { id: v4(), name: name.trim() }
        DBState.db.personaFolders = [...DBState.db.personaFolders, folder]
        openFolderId = folder.id
        void requestImmediateSave()
    }

    async function renameFolder(folder: RisuPersonaFolder): Promise<void> {
        const name = await alertInput("Folder name", [], folder.name)
        if (!name?.trim()) return
        folder.name = name.trim()
        DBState.db.personaFolders = [...DBState.db.personaFolders]
        void requestImmediateSave()
    }

    async function removeFolder(folder: RisuPersonaFolder): Promise<void> {
        if (!await alertConfirm(`Remove folder "${folder.name}"? Personas will be kept.`)) return
        for (const persona of DBState.db.personas) {
            if (persona.folderId === folder.id) persona.folderId = undefined
        }
        DBState.db.personaFolders = DBState.db.personaFolders.filter((item) => item.id !== folder.id)
        if (openFolderId === folder.id) openFolderId = null
        void requestImmediateSave()
    }

    function moveFolder(folder: RisuPersonaFolder, offset: number): void {
        const folders = [...DBState.db.personaFolders]
        const from = folders.findIndex((item) => item.id === folder.id)
        const to = from + offset
        if (from < 0 || to < 0 || to >= folders.length) return
        folders.splice(to, 0, ...folders.splice(from, 1))
        DBState.db.personaFolders = folders
        void requestImmediateSave()
    }

    function choosePersona(persona: RisuPersona): void {
        if (Date.now() < suppressClickUntil || dragActive) return
        const index = DBState.db.personas.findIndex((item) => item.id === persona.id)
        if (index < 0) return
        saveUserPersona()
        if (onSelect) onSelect(index)
        else changeUserPersona(index)
        close()
    }

    function clearDropHighlight(): void {
        highlightedDrop?.classList.remove("persona-drop-active")
        highlightedDrop = null
    }

    function highlightDrop(target: HTMLElement | null): void {
        if (target === highlightedDrop) return
        clearDropHighlight()
        highlightedDrop = target
        highlightedDrop?.classList.add("persona-drop-active")
    }

    function finishDrag(): void {
        if (longPressTimer) clearTimeout(longPressTimer)
        longPressTimer = null
        touchDrag?.ghost?.remove()
        touchDrag = null
        currentDragId = null
        dragActive = false
        clearDropHighlight()
    }

    function dragStart(persona: RisuPersona, event: DragEvent): void {
        currentDragId = persona.id ?? null
        dragActive = !!currentDragId
        if (!currentDragId || !event.dataTransfer) return
        event.dataTransfer.effectAllowed = "move"
        event.dataTransfer.setData("application/x-risu-persona", currentDragId)
        event.dataTransfer.setData("text/plain", currentDragId)
    }

    function dragSource(event: DragEvent): string | null {
        return currentDragId
            ?? event.dataTransfer?.getData("application/x-risu-persona")
            ?? event.dataTransfer?.getData("text/plain")
            ?? null
    }

    function dragOver(event: DragEvent & { currentTarget: HTMLElement }): void {
        event.preventDefault()
        event.stopPropagation()
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move"
        highlightDrop(event.currentTarget)
    }

    function dropAt(folderId: string | null, beforeId: string | null, event: DragEvent): void {
        event.preventDefault()
        event.stopPropagation()
        const sourceId = dragSource(event)
        finishDrag()
        if (sourceId && sourceId !== beforeId) reorderPersona(sourceId, folderId, beforeId)
    }

    function createTouchGhost(source: HTMLElement): HTMLElement {
        const rect = source.getBoundingClientRect()
        const ghost = source.cloneNode(true) as HTMLElement
        ghost.classList.add("persona-touch-ghost")
        ghost.style.width = `${rect.width}px`
        ghost.style.height = `${rect.height}px`
        document.body.appendChild(ghost)
        return ghost
    }

    function positionTouchGhost(ghost: HTMLElement, touch: Touch): void {
        ghost.style.left = `${touch.clientX}px`
        ghost.style.top = `${touch.clientY}px`
    }

    function findTouchTarget(touch: Touch): HTMLElement | null {
        const hit = document.elementFromPoint(touch.clientX, touch.clientY) as HTMLElement | null
        const target = hit?.closest(
            "[data-persona-card],[data-folder-drop],[data-unfiled-drop]"
        ) as HTMLElement | null
        if (target?.dataset.personaId === touchDrag?.sourceId) return null
        return target
    }

    function startTouch(persona: RisuPersona, event: TouchEvent & { currentTarget: HTMLElement }): void {
        const touch = event.touches[0]
        if (!touch || !persona.id) return
        touchStart = { x: touch.clientX, y: touch.clientY }
        const source = event.currentTarget
        if (longPressTimer) clearTimeout(longPressTimer)
        longPressTimer = setTimeout(() => {
            const ghost = createTouchGhost(source)
            touchDrag = { sourceId: persona.id!, source, ghost }
            currentDragId = persona.id!
            dragActive = true
            suppressClickUntil = Date.now() + 700
            positionTouchGhost(ghost, touch)
            if (navigator.vibrate) navigator.vibrate(25)
        }, 260)
    }

    function moveTouch(event: TouchEvent): void {
        const touch = event.touches[0]
        if (!touch) return
        if (!touchDrag) {
            if (
                longPressTimer
                && (
                    Math.abs(touch.clientX - touchStart.x) > 8
                    || Math.abs(touch.clientY - touchStart.y) > 8
                )
            ) {
                clearTimeout(longPressTimer)
                longPressTimer = null
            }
            return
        }
        event.preventDefault()
        if (touchDrag.ghost) positionTouchGhost(touchDrag.ghost, touch)
        highlightDrop(findTouchTarget(touch))
    }

    function cancelTouch(): void {
        finishDrag()
    }

    function endTouch(): void {
        if (!touchDrag) {
            if (longPressTimer) clearTimeout(longPressTimer)
            longPressTimer = null
            return
        }
        const sourceId = touchDrag.sourceId
        const target = highlightedDrop
        const folder = target?.closest("[data-folder-drop]") as HTMLElement | null
        const unfiled = target?.closest("[data-unfiled-drop]") as HTMLElement | null
        const persona = target?.closest("[data-persona-card]") as HTMLElement | null
        finishDrag()
        suppressClickUntil = Date.now() + 500

        if (folder?.dataset.folderId) {
            reorderPersona(sourceId, folder.dataset.folderId, null)
        } else if (unfiled) {
            reorderPersona(sourceId, null, null)
        } else if (persona?.dataset.personaId && persona.dataset.personaId !== sourceId) {
            reorderPersona(
                sourceId,
                persona.dataset.folderId || null,
                persona.dataset.personaId,
            )
        }
    }
</script>

{#snippet personaCard(persona: RisuPersona)}
    <button
        class="persona-card text-textcolor"
        class:persona-selected={selectedPersonaId() === persona.id}
        draggable={!isTouchDevice}
        data-persona-card
        data-persona-id={persona.id}
        data-folder-id={persona.folderId ?? ""}
        aria-label={persona.name}
        onclick={() => choosePersona(persona)}
        ondragstart={!isTouchDevice ? (event) => dragStart(persona, event) : undefined}
        ondragend={finishDrag}
        ondragover={dragOver}
        ondragleave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) clearDropHighlight()
        }}
        ondrop={(event) => dropAt(persona.folderId ?? null, persona.id ?? null, event)}
        ontouchstart={isTouchDevice ? (event) => startTouch(persona, event) : undefined}
    >
        {#if persona.icon === ""}
            <span class="persona-image bg-textcolor2"></span>
        {:else}
            {#await getCharImage(persona.icon, "css")}
                <span class="persona-image bg-textcolor2"></span>
            {:then imageStyle}
                <span class="persona-image bg-textcolor2" style={imageStyle}></span>
            {/await}
        {/if}
        <span class="persona-card-name" title={persona.note ? `${persona.name} / ${persona.note}` : persona.name}>
            {persona.name}
        </span>
    </button>
{/snippet}

<div
    class="absolute w-full h-full z-40 bg-black/50 flex justify-center items-center"
    role="presentation"
    ontouchmove={moveTouch}
    ontouchend={endTouch}
    ontouchcancel={cancelTouch}
>
    <div
        class="persona-panel relative bg-darkbg p-4 break-any rounded-md flex flex-col max-w-3xl w-full mx-3 max-h-full overflow-y-auto"
        class:persona-dragging={dragActive}
    >
        <div class="flex items-center text-textcolor mb-4 gap-2">
            <h2 class="mt-0 mb-0 font-bold">{language.persona}</h2>
            <div class="grow flex justify-end items-center gap-2">
                <button
                    class="folder-create-button"
                    title="Create folder"
                    onclick={addFolder}
                >
                    <FolderPlusIcon size={19} />
                    <span>New folder</span>
                </button>
                <button class="text-textcolor2 hover:text-primary cursor-pointer items-center" onclick={close}>
                    <XIcon size={24}/>
                </button>
            </div>
        </div>

        {#if dragActive}
            <div class="persona-drag-guide" aria-live="polite">
                <span>Drop on a folder to move in · Drop on a persona to reorder</span>
            </div>
        {/if}

        <div class="section-label">
            <span>Unfiled</span>
            <span>{unfiledGroup.personas.length}</span>
        </div>
        <div
            class="persona-grid persona-drop-zone"
            class:empty-drop-zone={unfiledGroup.personas.length === 0}
            role="list"
            aria-label="Unfiled personas and folders"
            data-unfiled-drop
            ondragover={dragOver}
            ondragleave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) clearDropHighlight()
            }}
            ondrop={(event) => dropAt(null, null, event)}
        >
            {#each DBState.db.personaFolders as folder (folder.id)}
                {@const group = groups.find((item) => item.id === folder.id)}
                <button
                    class="folder-card text-textcolor"
                    class:folder-open={openFolderId === folder.id}
                    aria-label={`Open ${folder.name} folder`}
                    data-folder-drop
                    data-folder-id={folder.id}
                    onclick={() => {
                        if (Date.now() < suppressClickUntil || dragActive) return
                        openFolderId = openFolderId === folder.id ? null : folder.id
                    }}
                    ondragover={dragOver}
                    ondragleave={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) clearDropHighlight()
                    }}
                    ondrop={(event) => dropAt(folder.id, null, event)}
                >
                    <span class="folder-image">
                        {#if openFolderId === folder.id}
                            <FolderOpenIcon size={46} />
                        {:else}
                            <FolderIcon size={46} />
                        {/if}
                        <span class="folder-count">{group?.personas.length ?? 0}</span>
                    </span>
                    <span class="persona-card-name">{folder.name}</span>
                </button>
            {/each}
            {#each unfiledGroup.personas as persona (persona.id)}
                {@render personaCard(persona)}
            {/each}
            {#if DBState.db.personaFolders.length === 0 && unfiledGroup.personas.length === 0}
                <span class="drop-placeholder">Drop personas here</span>
            {/if}
        </div>

        {#if openGroup?.folder}
            <div
                class="open-folder"
                role="list"
                aria-label={`${openGroup.name} folder contents`}
                data-folder-drop
                data-folder-id={openGroup.folder.id}
                ondragover={dragOver}
                ondragleave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) clearDropHighlight()
                }}
                ondrop={(event) => dropAt(openGroup.folder!.id, null, event)}
            >
                <div class="open-folder-header">
                    <FolderOpenIcon size={20} />
                    <span class="font-semibold truncate">{openGroup.name}</span>
                    <span class="text-xs opacity-70">{openGroup.personas.length}</span>
                    <div class="grow"></div>
                    <button title="Move folder up" onclick={() => moveFolder(openGroup.folder!, -1)}>
                        <ArrowUpIcon size={17} />
                    </button>
                    <button title="Move folder down" onclick={() => moveFolder(openGroup.folder!, 1)}>
                        <ArrowDownIcon size={17} />
                    </button>
                    <button title="Rename folder" onclick={() => renameFolder(openGroup.folder!)}>
                        <PencilIcon size={17} />
                    </button>
                    <button title="Remove folder" onclick={() => removeFolder(openGroup.folder!)}>
                        <Trash2Icon size={17} />
                    </button>
                </div>
                <div
                    class="persona-grid folder-contents"
                    class:empty-drop-zone={openGroup.personas.length === 0}
                >
                    {#each openGroup.personas as persona (persona.id)}
                        {@render personaCard(persona)}
                    {/each}
                    {#if openGroup.personas.length === 0}
                        <span class="drop-placeholder">Drop personas into this folder</span>
                    {/if}
                </div>
            </div>
        {/if}
    </div>
</div>

<style>
    .break-any {
        word-break: normal;
        overflow-wrap: anywhere;
    }
    .persona-panel {
        overscroll-behavior: contain;
    }
    .folder-create-button {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        border: 1px solid var(--color-darkborderc);
        border-radius: 0.5rem;
        padding: 0.35rem 0.55rem;
        color: var(--color-textcolor);
        background: color-mix(in srgb, var(--color-darkborderc) 28%, transparent);
    }
    .folder-create-button:hover {
        color: var(--color-primary);
        border-color: var(--color-primary);
    }
    .section-label {
        display: flex;
        justify-content: space-between;
        align-items: center;
        color: var(--color-textcolor2);
        font-size: 0.78rem;
        margin: 0 0 0.4rem;
    }
    .persona-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(5rem, 1fr));
        gap: 0.65rem;
        align-items: start;
        min-height: 6.4rem;
        padding: 0.55rem;
        border: 1px solid var(--color-darkborderc);
        border-radius: 0.65rem;
    }
    .persona-card,
    .folder-card {
        display: flex;
        min-width: 0;
        flex-direction: column;
        align-items: center;
        gap: 0.35rem;
        border-radius: 0.6rem;
        padding: 0.25rem;
        user-select: none;
        -webkit-user-select: none;
        touch-action: pan-y;
    }
    .persona-card:hover,
    .folder-card:hover,
    .folder-open {
        color: var(--color-primary);
        background: color-mix(in srgb, var(--color-primary) 10%, transparent);
    }
    .persona-image,
    .folder-image {
        display: flex;
        width: 5rem;
        height: 5rem;
        flex: 0 0 5rem;
        align-items: center;
        justify-content: center;
        border-radius: 0.5rem;
        box-shadow: 0 8px 18px rgb(0 0 0 / 0.2);
        background-position: center !important;
        background-repeat: no-repeat !important;
    }
    .folder-image {
        position: relative;
        background: color-mix(in srgb, var(--color-primary) 16%, var(--color-darkborderc));
        border: 1px solid color-mix(in srgb, var(--color-primary) 40%, var(--color-darkborderc));
    }
    .folder-count {
        position: absolute;
        right: 0.35rem;
        bottom: 0.3rem;
        min-width: 1.2rem;
        border-radius: 999px;
        padding: 0.05rem 0.3rem;
        color: var(--color-textcolor);
        background: rgb(0 0 0 / 0.55);
        font-size: 0.7rem;
        line-height: 1.1rem;
    }
    .persona-selected .persona-image {
        outline: 3px solid var(--color-primary);
        outline-offset: 1px;
    }
    .persona-card-name {
        width: 100%;
        overflow: hidden;
        text-align: center;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 0.78rem;
    }
    .open-folder {
        margin-top: 0.9rem;
        border: 1px solid color-mix(in srgb, var(--color-primary) 40%, var(--color-darkborderc));
        border-radius: 0.7rem;
        padding: 0.6rem;
    }
    .open-folder-header {
        display: flex;
        align-items: center;
        gap: 0.45rem;
        color: var(--color-textcolor);
        margin-bottom: 0.5rem;
    }
    .open-folder-header button {
        display: inline-flex;
        padding: 0.28rem;
        border-radius: 0.35rem;
        color: var(--color-textcolor2);
    }
    .open-folder-header button:hover {
        color: var(--color-primary);
        background: color-mix(in srgb, var(--color-primary) 12%, transparent);
    }
    .folder-contents {
        border: 0;
        padding: 0.2rem;
    }
    .empty-drop-zone {
        align-items: center;
        justify-items: center;
    }
    .drop-placeholder {
        grid-column: 1 / -1;
        align-self: center;
        color: var(--color-textcolor2);
        font-size: 0.8rem;
        opacity: 0.8;
    }
    .persona-drag-guide {
        position: sticky;
        top: 0;
        z-index: 5;
        margin-bottom: 0.55rem;
        border: 1px solid color-mix(in srgb, var(--color-primary) 55%, transparent);
        border-radius: 0.5rem;
        padding: 0.4rem 0.6rem;
        color: var(--color-textcolor);
        background: color-mix(in srgb, var(--color-primary) 18%, var(--color-darkbg));
        text-align: center;
        font-size: 0.78rem;
    }
    :global(.persona-drop-active) {
        outline: 3px solid var(--color-primary) !important;
        outline-offset: 2px;
        background: color-mix(in srgb, var(--color-primary) 18%, transparent) !important;
    }
    :global(.persona-touch-ghost) {
        position: fixed !important;
        z-index: 1000 !important;
        pointer-events: none !important;
        margin: 0 !important;
        opacity: 0.78 !important;
        transform: translate(-50%, -60%) scale(1.04);
        filter: drop-shadow(0 10px 14px rgb(0 0 0 / 0.45));
    }
    .persona-dragging {
        cursor: grabbing;
    }
</style>
<!-- POCKETRISU-PATCH:persona-organizer:END -->
