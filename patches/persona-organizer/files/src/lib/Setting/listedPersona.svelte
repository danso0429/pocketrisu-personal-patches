<!-- POCKETRISU-PATCH:persona-organizer:START -->
<script lang="ts">
    import {
        ChevronDownIcon,
        ChevronUpIcon,
        FolderIcon,
        FolderPlusIcon,
        PencilIcon,
        TrashIcon,
        XIcon,
    } from "@lucide/svelte"
    import { language } from "../../lang"
    import { alertConfirm, alertInput } from "src/ts/alert"
    import { requestImmediateSave } from "src/ts/globalApi.svelte"
    import { changeUserPersona, saveUserPersona } from "src/ts/persona"
    import {
        buildPersonaGroups,
        flattenPersonaGroups,
        reorderPersonaList,
        type PersonaGroup,
    } from "src/ts/personaOrganizer"
    import { DBState } from "src/ts/stores.svelte"
    import type { RisuPersona, RisuPersonaFolder } from "src/ts/storage/database.svelte"
    import { v4 } from "uuid"

    interface Props {
        close?: () => void
        onSelect?: ((index: number) => void) | null
    }

    let { close = () => {}, onSelect = null }: Props = $props()
    let currentDragId: string | null = null
    let suppressClickUntil = 0
    // PocketRisu force-enables mobile-drag-drop on iOS. Exposing an HTML
    // draggable there lets the polyfill claim the gesture before this popup's
    // long-press controller, so native drag is desktop-only just like Sidebar.
    const isTouchDevice = typeof matchMedia !== "undefined"
        && matchMedia("(pointer: coarse)").matches

    function ensureModel(): void {
        DBState.db.personaFolders ??= []
        for (const persona of DBState.db.personas) persona.id ??= v4()
    }

    function groups(): PersonaGroup[] {
        ensureModel()
        return buildPersonaGroups(DBState.db.personas, DBState.db.personaFolders)
    }

    function selectedId(): string | null {
        ensureModel()
        return DBState.db.personas[DBState.db.selectedPersona]?.id ?? null
    }

    function commitPersonas(personas: RisuPersona[], keepSelectedId: string | null): void {
        DBState.db.personas = personas
        const nextSelected = personas.findIndex((persona) => persona.id === keepSelectedId)
        changeUserPersona(nextSelected >= 0 ? nextSelected : 0, "noSave")
        void requestImmediateSave()
    }

    function reorderPersona(sourceId: string, folderId: string | null, beforeId: string | null): void {
        ensureModel()
        saveUserPersona()
        const keepSelectedId = selectedId()
        const reordered = reorderPersonaList(
            DBState.db.personas,
            DBState.db.personaFolders,
            sourceId,
            folderId,
            beforeId,
        )
        commitPersonas(reordered, keepSelectedId)
    }

    async function createFolderWith(sourceId: string, targetId: string): Promise<void> {
        ensureModel()
        const source = DBState.db.personas.find((persona) => persona.id === sourceId)
        const target = DBState.db.personas.find((persona) => persona.id === targetId)
        if (!source || !target || source === target) return

        if (target.folderId && DBState.db.personaFolders.some((folder) => folder.id === target.folderId)) {
            reorderPersona(sourceId, target.folderId, targetId)
            return
        }

        const name = await alertInput("Folder name", [], "New Folder")
        if (!name?.trim()) return
        saveUserPersona()
        const keepSelectedId = selectedId()
        const folder: RisuPersonaFolder = { id: v4(), name: name.trim() }
        DBState.db.personaFolders = [...DBState.db.personaFolders, folder]
        source.folderId = folder.id
        target.folderId = folder.id
        const reordered = reorderPersonaList(
            DBState.db.personas,
            DBState.db.personaFolders,
            sourceId,
            folder.id,
            null,
        )
        commitPersonas(reordered, keepSelectedId)
    }

    async function addFolder(): Promise<void> {
        const name = await alertInput("Folder name", [], "New Folder")
        if (!name?.trim()) return
        ensureModel()
        DBState.db.personaFolders = [
            ...DBState.db.personaFolders,
            { id: v4(), name: name.trim() },
        ]
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
        commitPersonas(flattenPersonaGroups(groups()), selectedId())
    }

    function moveFolder(folder: RisuPersonaFolder, offset: number): void {
        const folders = [...DBState.db.personaFolders]
        const from = folders.findIndex((item) => item.id === folder.id)
        const to = from + offset
        if (from < 0 || to < 0 || to >= folders.length) return
        folders.splice(to, 0, ...folders.splice(from, 1))
        DBState.db.personaFolders = folders
        commitPersonas(flattenPersonaGroups(groups()), selectedId())
    }

    function choosePersona(persona: RisuPersona): void {
        if (Date.now() < suppressClickUntil) return
        const index = DBState.db.personas.findIndex((item) => item.id === persona.id)
        if (index < 0) return
        if (onSelect) onSelect(index)
        else changeUserPersona(index)
        close()
    }

    function dragStart(persona: RisuPersona, event: DragEvent): void {
        currentDragId = persona.id ?? null
        if (!currentDragId || !event.dataTransfer) return
        event.dataTransfer.effectAllowed = "move"
        event.dataTransfer.setData("application/x-risu-persona", currentDragId)
        event.dataTransfer.setData("application/x-risu-internal", "true")
    }

    function allowDrop(event: DragEvent): void {
        event.preventDefault()
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move"
    }

    function draggedId(event: DragEvent): string | null {
        return currentDragId
            ?? event.dataTransfer?.getData("application/x-risu-persona")
            ?? null
    }

    function dropAt(folderId: string | null, beforeId: string | null, event: DragEvent): void {
        event.preventDefault()
        const sourceId = draggedId(event)
        currentDragId = null
        if (sourceId) reorderPersona(sourceId, folderId, beforeId)
    }

    function dropOnPersona(targetId: string, event: DragEvent): void {
        event.preventDefault()
        const sourceId = draggedId(event)
        currentDragId = null
        if (sourceId && sourceId !== targetId) void createFolderWith(sourceId, targetId)
    }

    let touchDrag: {
        sourceId: string
        source: HTMLElement
        ghost: HTMLElement | null
        highlighted: HTMLElement | null
    } | null = null
    let touchTimer = 0
    let touchStart = { x: 0, y: 0 }

    function clearHighlight(): void {
        if (!touchDrag?.highlighted) return
        touchDrag.highlighted.classList.remove("persona-drop-active")
        touchDrag.highlighted = null
    }

    function startTouch(persona: RisuPersona, event: TouchEvent & { currentTarget: HTMLElement }): void {
        const touch = event.touches[0]
        if (!touch || !persona.id) return
        touchStart = { x: touch.clientX, y: touch.clientY }
        const source = event.currentTarget
        if (touchTimer) clearTimeout(touchTimer)
        touchTimer = window.setTimeout(() => {
            touchDrag = { sourceId: persona.id!, source, ghost: null, highlighted: null }
            source.style.opacity = "0.45"
            try { navigator.vibrate?.(30) } catch {}
            const rect = source.getBoundingClientRect()
            const ghost = source.cloneNode(true) as HTMLElement
            ghost.style.cssText = [
                "position:fixed",
                "pointer-events:none",
                "z-index:9999",
                "opacity:0.78",
                `width:${rect.width}px`,
                `left:${touch.clientX - rect.width / 2}px`,
                `top:${touch.clientY - rect.height / 2}px`,
            ].join(";")
            document.body.appendChild(ghost)
            touchDrag!.ghost = ghost
        }, 400)
    }

    function targetUnderTouch(touch: Touch): HTMLElement | null {
        if (touchDrag?.ghost) touchDrag.ghost.style.display = "none"
        const target = document.elementFromPoint(touch.clientX, touch.clientY) as HTMLElement | null
        if (touchDrag?.ghost) touchDrag.ghost.style.display = ""
        return target
    }

    function moveTouch(event: TouchEvent): void {
        const touch = event.touches[0]
        if (!touch) return
        if (!touchDrag) {
            if (Math.abs(touch.clientX - touchStart.x) > 8 || Math.abs(touch.clientY - touchStart.y) > 8) {
                if (touchTimer) clearTimeout(touchTimer)
                touchTimer = 0
            }
            return
        }
        event.preventDefault()
        if (touchDrag.ghost) {
            const rect = touchDrag.source.getBoundingClientRect()
            touchDrag.ghost.style.left = `${touch.clientX - rect.width / 2}px`
            touchDrag.ghost.style.top = `${touch.clientY - rect.height / 2}px`
        }
        clearHighlight()
        const target = targetUnderTouch(touch)?.closest(
            "[data-persona-spacer],[data-persona-folder],[data-persona-row]",
        ) as HTMLElement | null
        if (target && target !== touchDrag.source) {
            target.classList.add("persona-drop-active")
            touchDrag.highlighted = target
        }
    }

    function cleanupTouch(): string | null {
        if (touchTimer) clearTimeout(touchTimer)
        touchTimer = 0
        if (!touchDrag) return null
        const sourceId = touchDrag.sourceId
        touchDrag.source.style.opacity = ""
        clearHighlight()
        touchDrag.ghost?.remove()
        touchDrag = null
        return sourceId
    }

    function endTouch(event: TouchEvent): void {
        if (!touchDrag) {
            if (touchTimer) clearTimeout(touchTimer)
            touchTimer = 0
            return
        }
        const touch = event.changedTouches[0]
        const target = touch ? targetUnderTouch(touch) : null
        const sourceId = cleanupTouch()
        if (!sourceId || !target) return

        const spacer = target.closest("[data-persona-spacer]") as HTMLElement | null
        const folder = target.closest("[data-persona-folder]") as HTMLElement | null
        const row = target.closest("[data-persona-row]") as HTMLElement | null
        if (spacer) {
            reorderPersona(
                sourceId,
                spacer.dataset.folderId || null,
                spacer.dataset.beforeId || null,
            )
        } else if (folder) {
            reorderPersona(sourceId, folder.dataset.folderId || null, null)
        } else if (row?.dataset.personaId && row.dataset.personaId !== sourceId) {
            void createFolderWith(sourceId, row.dataset.personaId)
        }
        suppressClickUntil = Date.now() + 350
    }

    function touchContainer(node: HTMLElement) {
        node.addEventListener("touchmove", moveTouch, { passive: false })
        node.addEventListener("touchend", endTouch)
        node.addEventListener("touchcancel", cleanupTouch)
        return {
            destroy() {
                node.removeEventListener("touchmove", moveTouch)
                node.removeEventListener("touchend", endTouch)
                node.removeEventListener("touchcancel", cleanupTouch)
            },
        }
    }
</script>

<div class="absolute w-full h-full z-40 bg-black/50 flex justify-center items-center">
    <div
        class="persona-panel bg-darkbg p-4 break-any rounded-md flex flex-col max-w-3xl w-96 max-h-full overflow-y-auto"
        use:touchContainer
    >
        <div class="flex items-center text-textcolor mb-3">
            <h2 class="mt-0 mb-0 font-bold">{language.persona}</h2>
            <div class="grow flex justify-end gap-1">
                <button
                    class="text-textcolor2 hover:text-primary cursor-pointer p-1"
                    title="Create folder"
                    onclick={addFolder}
                >
                    <FolderPlusIcon size={21} />
                </button>
                <button class="text-textcolor2 hover:text-primary cursor-pointer p-1" onclick={close}>
                    <XIcon size={24} />
                </button>
            </div>
        </div>

        {#each groups() as group (group.id ?? "unfiled")}
            <section class="mb-2">
                <div
                    class="flex items-center min-h-9 px-2 text-sm text-textcolor2 rounded"
                    role="group"
                    aria-label={`${group.name} persona folder`}
                    data-persona-folder
                    data-folder-id={group.id ?? ""}
                    ondragover={allowDrop}
                    ondrop={(event) => dropAt(group.id, null, event)}
                >
                    <FolderIcon size={16} class="mr-2 shrink-0" />
                    <span class="font-medium grow truncate">{group.name}</span>
                    {#if group.folder}
                        <button
                            class="p-1 hover:text-primary"
                            title="Move folder up"
                            onclick={() => moveFolder(group.folder!, -1)}
                        ><ChevronUpIcon size={15} /></button>
                        <button
                            class="p-1 hover:text-primary"
                            title="Move folder down"
                            onclick={() => moveFolder(group.folder!, 1)}
                        ><ChevronDownIcon size={15} /></button>
                        <button
                            class="p-1 hover:text-primary"
                            title="Rename folder"
                            onclick={() => renameFolder(group.folder!)}
                        ><PencilIcon size={15} /></button>
                        <button
                            class="p-1 hover:text-red-400"
                            title="Remove folder"
                            onclick={() => removeFolder(group.folder!)}
                        ><TrashIcon size={15} /></button>
                    {/if}
                </div>

                {#each group.personas as persona (persona.id)}
                    <div
                        class="persona-spacer h-2 rounded"
                        role="separator"
                        aria-label={`Move persona before ${persona.name}`}
                        data-persona-spacer
                        data-folder-id={group.id ?? ""}
                        data-before-id={persona.id}
                        ondragover={allowDrop}
                        ondrop={(event) => dropAt(group.id, persona.id ?? null, event)}
                    ></div>
                    <button
                        draggable={!isTouchDevice ? "true" : undefined}
                        data-persona-row
                        data-persona-id={persona.id}
                        class="persona-row flex items-center w-full text-textcolor border-t-1 border-solid border-0 border-darkborderc p-2 cursor-pointer rounded"
                        class:bg-selected={DBState.db.personas[DBState.db.selectedPersona]?.id === persona.id}
                        onclick={() => choosePersona(persona)}
                        ondragstart={!isTouchDevice ? (event) => dragStart(persona, event) : undefined}
                        ondragend={!isTouchDevice ? () => { currentDragId = null } : undefined}
                        ondragover={allowDrop}
                        ondrop={(event) => dropOnPersona(persona.id!, event)}
                        ontouchstart={isTouchDevice ? (event) => startTouch(persona, event) : undefined}
                    >
                        <span class="overflow-x-auto whitespace-nowrap w-full text-left">
                            <span class="font-medium">{persona.name}</span>
                            {#if persona.note}
                                <span class="opacity-75"> / {persona.note}</span>
                            {/if}
                        </span>
                    </button>
                {/each}
                <div
                    class="persona-spacer min-h-3 rounded"
                    role="separator"
                    aria-label={`Move persona to end of ${group.name}`}
                    data-persona-spacer
                    data-folder-id={group.id ?? ""}
                    data-before-id=""
                    ondragover={allowDrop}
                    ondrop={(event) => dropAt(group.id, null, event)}
                ></div>
            </section>
        {/each}
    </div>
</div>

<style>
    .break-any {
        word-break: normal;
        overflow-wrap: anywhere;
    }
    .persona-row {
        touch-action: pan-y;
        user-select: none;
        -webkit-user-select: none;
    }
    .persona-spacer {
        transition: background-color 120ms ease, min-height 120ms ease;
    }
    .persona-spacer:has(+ .persona-row:hover) {
        min-height: 0.75rem;
    }
    :global(.persona-drop-active) {
        outline: 2px solid rgb(var(--primary, 99 102 241));
        outline-offset: -2px;
        background: color-mix(in srgb, currentColor 12%, transparent);
    }
</style>
<!-- POCKETRISU-PATCH:persona-organizer:END -->
