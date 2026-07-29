<script lang="ts">
    import {
        ArrowLeftIcon,
        ChevronLeftIcon,
        ChevronRightIcon,
        FolderIcon,
        FolderOpenIcon,
        FolderPlusIcon,
        PencilIcon,
        PlusIcon,
        Trash2Icon,
        XIcon,
    } from "@lucide/svelte"
    import { alertConfirm, alertInput } from "src/ts/alert"
    import {
        commitCharacterFolderDraft,
        findCharacterFolder,
        isOrganizableCharacterId,
        moveCharacterRootItem,
        moveCharacterToFolder,
        moveCharacterToRoot,
        moveCharacterWithinFolder,
        normalizeCharacterOrder,
        orderedCharacterIds,
        removeCharacterFolder,
        renameCharacterFolder,
        type CharacterFolderDraft,
        type CharacterRootItem,
    } from "src/ts/characterOrganizer"
    import { getCharImage } from "src/ts/characters"
    import { requestImmediateSave } from "src/ts/globalApi.svelte"
    import type { character, folder } from "src/ts/storage/database.svelte"
    import { DBState } from "src/ts/stores.svelte"
    import { v4 } from "uuid"

    type ViewItem = {
        key: string
        kind: "character"
        character: character
    } | {
        key: string
        kind: "folder"
        folder: folder
        count: number
    }

    interface Props {
        close?: () => void
    }

    const PAGE_SIZE = 16

    let { close = () => {} }: Props = $props()
    let openFolderId = $state<string | null>(null)
    let draftFolder = $state<CharacterFolderDraft | null>(null)
    let pageByContext = $state<Record<string, number>>({ root: 0 })
    let arrangeMode = $state(false)
    let membershipMode = $state(false)

    const activeCharacters = $derived(
        DBState.db.characters.filter((item) =>
            !item.trashTime && isOrganizableCharacterId(item.chaId)
        )
    )
    const activeCharacterIds = $derived(activeCharacters.map((item) => item.chaId))
    const characterById = $derived.by(() =>
        new Map(activeCharacters.map((item) => [item.chaId, item]))
    )
    const viewOrder = $derived.by(() =>
        normalizeCharacterOrder(
            DBState.db.characterOrder ?? [],
            activeCharacterIds,
        )
    )
    const persistedOpenFolder = $derived.by((): folder | null => {
        if (!openFolderId) return null
        return viewOrder.find((entry): entry is folder =>
            typeof entry !== "string" && entry.id === openFolderId
        ) ?? null
    })
    const activeFolderName = $derived(
        draftFolder?.id === openFolderId
            ? draftFolder.name
            : persistedOpenFolder?.name ?? ""
    )
    const activeContext = $derived(openFolderId ?? "root")

    const rootItems = $derived.by((): ViewItem[] => {
        const items: ViewItem[] = []
        for (const entry of viewOrder) {
            if (typeof entry === "string") {
                const item = characterById.get(entry)
                if (item) {
                    items.push({
                        key: `character:${entry}`,
                        kind: "character",
                        character: item,
                    })
                }
                continue
            }
            items.push({
                key: `folder:${entry.id}`,
                kind: "folder",
                folder: entry,
                count: entry.data.filter((id) => characterById.has(id)).length,
            })
        }
        return items
    })
    const folderItems = $derived.by((): ViewItem[] => {
        if (!persistedOpenFolder) return []
        return persistedOpenFolder.data.flatMap((id): ViewItem[] => {
            const item = characterById.get(id)
            return item
                ? [{
                    key: `character:${id}`,
                    kind: "character",
                    character: item,
                }]
                : []
        })
    })
    const membershipItems = $derived.by((): ViewItem[] =>
        orderedCharacterIds(viewOrder).flatMap((id): ViewItem[] => {
            const item = characterById.get(id)
            return item
                ? [{
                    key: `membership:${id}`,
                    kind: "character",
                    character: item,
                }]
                : []
        })
    )
    const activeItems = $derived(openFolderId ? folderItems : rootItems)
    const displayItems = $derived(membershipMode ? membershipItems : activeItems)
    const displayContext = $derived(
        membershipMode && openFolderId
            ? `members:${openFolderId}`
            : activeContext
    )
    const pageCount = $derived(
        Math.max(1, Math.ceil(displayItems.length / PAGE_SIZE))
    )
    const currentPage = $derived(
        Math.min(pageByContext[displayContext] ?? 0, pageCount - 1)
    )

    function editableOrder(): (string | folder)[] {
        return normalizeCharacterOrder(
            DBState.db.characterOrder ?? [],
            activeCharacterIds,
        )
    }

    function commitOrder(next: (string | folder)[]): void {
        DBState.db.characterOrder = next
        void requestImmediateSave()
    }

    function setCurrentPage(page: number): void {
        const next = Math.max(0, Math.min(page, pageCount - 1))
        pageByContext = { ...pageByContext, [displayContext]: next }
    }

    function characterName(characterId: string): string {
        return characterById.get(characterId)?.name || "Unnamed character"
    }

    async function confirmSourceFolderRemoval(
        characterId: string,
        destinationFolderId?: string,
    ): Promise<boolean> {
        const source = findCharacterFolder(
            editableOrder(),
            characterId,
        )
        if (
            !source
            || source.id === destinationFolderId
            || source.data.length > 1
        ) return true
        return alertConfirm(
            `Moving "${characterName(characterId)}" will remove the now-empty folder "${source.name}". The character will be kept. Continue?`
        )
    }

    async function createFolderDraft(): Promise<void> {
        const name = await alertInput("Folder name")
        if (!name?.trim()) return
        const id = v4()
        draftFolder = {
            id,
            name: name.trim(),
            color: "default",
        }
        openFolderId = id
        membershipMode = false
        arrangeMode = false
        pageByContext = {
            ...pageByContext,
            [id]: 0,
            [`members:${id}`]: 0,
        }
    }

    function enterFolder(value: folder): void {
        openFolderId = value.id
        membershipMode = false
        if (pageByContext[value.id] === undefined) {
            pageByContext = { ...pageByContext, [value.id]: 0 }
        }
    }

    function leaveFolder(): void {
        if (membershipMode) {
            membershipMode = false
            return
        }
        if (draftFolder?.id === openFolderId) draftFolder = null
        openFolderId = null
        arrangeMode = false
    }

    function closeOrganizer(): void {
        draftFolder = null
        openFolderId = null
        membershipMode = false
        arrangeMode = false
        close()
    }

    function openMembershipEditor(): void {
        if (!openFolderId) return
        membershipMode = true
        pageByContext = {
            ...pageByContext,
            [`members:${openFolderId}`]: 0,
        }
    }

    async function toggleFolderMembership(item: character): Promise<void> {
        if (!openFolderId) return
        const characterId = item.chaId

        if (draftFolder?.id === openFolderId) {
            if (!await confirmSourceFolderRemoval(characterId)) return
            const next = commitCharacterFolderDraft(
                editableOrder(),
                draftFolder,
                characterId,
            )
            if (!next) return
            commitOrder(next)
            draftFolder = null
            return
        }

        const target = editableOrder().find((entry): entry is folder =>
            typeof entry !== "string" && entry.id === openFolderId
        )
        if (!target) {
            openFolderId = null
            membershipMode = false
            return
        }

        if (target.data.includes(characterId)) {
            if (
                target.data.length === 1
                && !await alertConfirm(
                    `Removing "${characterName(characterId)}" will remove the now-empty folder "${target.name}". The character will be kept. Continue?`
                )
            ) return
            commitOrder(moveCharacterToRoot(editableOrder(), characterId))
            if (target.data.length === 1) {
                openFolderId = null
                membershipMode = false
                arrangeMode = false
            }
            return
        }

        if (!await confirmSourceFolderRemoval(characterId, target.id)) return
        commitOrder(moveCharacterToFolder(
            editableOrder(),
            characterId,
            target.id,
        ))
    }

    async function renameOpenFolder(): Promise<void> {
        if (!openFolderId) return
        const currentName = activeFolderName
        const name = await alertInput("Folder name", [], currentName)
        if (!name?.trim()) return
        if (draftFolder?.id === openFolderId) {
            draftFolder = { ...draftFolder, name: name.trim() }
            return
        }
        commitOrder(renameCharacterFolder(
            editableOrder(),
            openFolderId,
            name,
        ))
    }

    async function removeOpenFolder(): Promise<void> {
        if (!openFolderId) return
        if (draftFolder?.id === openFolderId) {
            draftFolder = null
            openFolderId = null
            membershipMode = false
            return
        }
        if (!persistedOpenFolder) return
        if (!await alertConfirm(
            `Remove folder "${persistedOpenFolder.name}"? Its ${persistedOpenFolder.data.length} character${persistedOpenFolder.data.length === 1 ? "" : "s"} will be kept and moved to the main list.`
        )) return
        commitOrder(removeCharacterFolder(
            editableOrder(),
            persistedOpenFolder.id,
        ))
        openFolderId = null
        membershipMode = false
        arrangeMode = false
    }

    function rootIdentity(item: ViewItem): CharacterRootItem {
        return item.kind === "character"
            ? { kind: "character", id: item.character.chaId }
            : { kind: "folder", id: item.folder.id }
    }

    function canMove(item: ViewItem, offset: -1 | 1): boolean {
        if (openFolderId) {
            if (item.kind !== "character" || !persistedOpenFolder) return false
            const index = persistedOpenFolder.data.indexOf(item.character.chaId)
            const target = index + offset
            return index >= 0 && target >= 0 && target < persistedOpenFolder.data.length
        }
        const identity = rootIdentity(item)
        const index = viewOrder.findIndex((entry) =>
            identity.kind === "character"
                ? entry === identity.id
                : typeof entry !== "string" && entry.id === identity.id
        )
        const target = index + offset
        return index >= 0 && target >= 0 && target < viewOrder.length
    }

    function moveItem(item: ViewItem, offset: -1 | 1): void {
        if (openFolderId) {
            if (item.kind !== "character" || !persistedOpenFolder) return
            commitOrder(moveCharacterWithinFolder(
                editableOrder(),
                persistedOpenFolder.id,
                item.character.chaId,
                offset,
            ))
            return
        }
        commitOrder(moveCharacterRootItem(
            editableOrder(),
            rootIdentity(item),
            offset,
        ))
    }

    function isCurrentMember(item: character): boolean {
        return !!persistedOpenFolder?.data.includes(item.chaId)
    }
</script>

{#snippet characterCard(item: character, membership: boolean)}
    <button
        class="character-card text-textcolor"
        class:member-selected={membership && isCurrentMember(item)}
        aria-label={membership
            ? `${item.name}: ${isCurrentMember(item) ? "in folder" : "not in folder"}`
            : item.name}
        onclick={() => {
            if (membership) void toggleFolderMembership(item)
        }}
    >
        {#if item.image}
            {#await getCharImage(item.image, "css")}
                <span class="card-image bg-textcolor2"></span>
            {:then imageStyle}
                <span class="card-image bg-textcolor2" style={imageStyle}></span>
            {/await}
        {:else}
            <span class="card-image card-image-empty bg-textcolor2"></span>
        {/if}
        {#if membership}
            <span class="membership-mark" aria-hidden="true">
                {isCurrentMember(item) ? "✓" : "+"}
            </span>
        {/if}
        <span class="card-name" title={item.name}>{item.name || "Unnamed"}</span>
    </button>
{/snippet}

{#snippet folderCard(value: folder, count: number)}
    <button
        class="folder-card text-textcolor"
        aria-label={`Open ${value.name} folder`}
        onclick={() => enterFolder(value)}
    >
        <span class="folder-image">
            {#if value.imgFile}
                {#await getCharImage(value.imgFile, "css")}
                    <FolderIcon size={46} />
                {:then imageStyle}
                    {#if imageStyle}
                        <span class="folder-image-fill" style={imageStyle}></span>
                    {:else}
                        <FolderIcon size={46} />
                    {/if}
                {/await}
            {:else}
                <FolderIcon size={46} />
            {/if}
            <span class="folder-count">{count}</span>
        </span>
        <span class="card-name" title={value.name}>{value.name}</span>
    </button>
{/snippet}

<div class="organizer-screen bg-bg text-textcolor" role="dialog" aria-modal="true" aria-label="Character organizer">
    <div class="organizer-panel bg-darkbg">
        <header class="screen-header">
            <button class="icon-button" title="Close character organizer" onclick={closeOrganizer}>
                <XIcon size={21} />
            </button>
            <div class="header-copy">
                <h1>Character organizer</h1>
                <p>Arrange characters and folders without dragging.</p>
            </div>
        </header>

        <section class="organizer-card">
            {#if openFolderId}
                <div class="folder-toolbar">
                    <button class="icon-button" title="Back" onclick={leaveFolder}>
                        <ArrowLeftIcon size={19} />
                    </button>
                    <FolderOpenIcon size={20} />
                    <span class="folder-name">{membershipMode ? `Select for ${activeFolderName}` : activeFolderName}</span>
                    {#if draftFolder?.id === openFolderId}
                        <span class="draft-pill">Draft · not saved</span>
                    {:else}
                        <span class="folder-total">{folderItems.length}</span>
                    {/if}
                    <div class="grow"></div>
                    {#if membershipMode}
                        <button class="text-button active-button" onclick={() => membershipMode = false}>
                            Done
                        </button>
                    {:else}
                        <button
                            class="members-button"
                            title="Add or remove characters"
                            aria-label="Add or remove characters"
                            onclick={openMembershipEditor}
                        >
                            <PlusIcon size={18} />
                        </button>
                        {#if !draftFolder}
                            <button
                                class="text-button"
                                class:active-button={arrangeMode}
                                aria-pressed={arrangeMode}
                                onclick={() => arrangeMode = !arrangeMode}
                            >
                                {arrangeMode ? "Done" : "Arrange"}
                            </button>
                        {/if}
                        <button class="icon-button" title="Rename folder" onclick={renameOpenFolder}>
                            <PencilIcon size={17} />
                        </button>
                        <button
                            class="icon-button danger-button"
                            title={draftFolder ? "Discard draft" : "Remove folder but keep characters"}
                            onclick={removeOpenFolder}
                        >
                            <Trash2Icon size={17} />
                        </button>
                    {/if}
                </div>
            {:else}
                <div class="root-toolbar">
                    <button class="new-folder-button" onclick={createFolderDraft}>
                        <FolderPlusIcon size={19} />
                        <span>New folder</span>
                    </button>
                    <div class="grow"></div>
                    <button
                        class="text-button"
                        class:active-button={arrangeMode}
                        aria-pressed={arrangeMode}
                        onclick={() => arrangeMode = !arrangeMode}
                    >
                        {arrangeMode ? "Done" : "Arrange"}
                    </button>
                </div>
            {/if}

            {#if draftFolder?.id === openFolderId && !membershipMode}
                <div class="draft-note">
                    This folder exists only on this screen. Use <strong>+</strong> and choose its first character to save it.
                </div>
            {/if}

            <div class="page-shell">
                <div class="page-viewport">
                    <div
                        class="page-track"
                        style={`transform: translate3d(-${currentPage * 100}%, 0, 0);`}
                    >
                        {#each Array(pageCount) as _, pageIndex}
                            <div
                                class="character-page"
                                role="list"
                                aria-label={`${membershipMode ? "Folder selection" : activeFolderName || "Characters"} page ${pageIndex + 1}`}
                            >
                                {#each displayItems.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE) as item (item.key)}
                                    <div class="card-slot" role="listitem">
                                        {#if item.kind === "character"}
                                            {@render characterCard(item.character, membershipMode)}
                                        {:else}
                                            {@render folderCard(item.folder, item.count)}
                                        {/if}
                                        {#if arrangeMode && !membershipMode}
                                            <button
                                                class="item-shift item-shift-left"
                                                aria-label={`Move ${item.kind === "character" ? item.character.name : item.folder.name} left`}
                                                disabled={!canMove(item, -1)}
                                                onclick={(event) => {
                                                    event.stopPropagation()
                                                    moveItem(item, -1)
                                                }}
                                            >‹</button>
                                            <button
                                                class="item-shift item-shift-right"
                                                aria-label={`Move ${item.kind === "character" ? item.character.name : item.folder.name} right`}
                                                disabled={!canMove(item, 1)}
                                                onclick={(event) => {
                                                    event.stopPropagation()
                                                    moveItem(item, 1)
                                                }}
                                            >›</button>
                                        {/if}
                                    </div>
                                {/each}
                                {#if displayItems.length === 0 && pageIndex === 0}
                                    <span class="empty-placeholder">
                                        {draftFolder
                                            ? "No characters yet · use + to choose the first one"
                                            : openFolderId
                                                ? "No visible characters in this folder"
                                                : "No characters"}
                                    </span>
                                {/if}
                            </div>
                        {/each}
                    </div>
                </div>

                {#if pageCount > 1}
                    <div class="page-controls" aria-label="Character pages">
                        <button
                            title="Previous page"
                            disabled={currentPage === 0}
                            onclick={() => setCurrentPage(currentPage - 1)}
                        >
                            <ChevronLeftIcon size={19} />
                        </button>
                        <div class="page-dots">
                            {#each Array(pageCount) as _, pageIndex}
                                <button
                                    class="page-dot"
                                    class:page-dot-active={currentPage === pageIndex}
                                    aria-label={`Page ${pageIndex + 1}`}
                                    onclick={() => setCurrentPage(pageIndex)}
                                ></button>
                            {/each}
                        </div>
                        <span class="page-number">{currentPage + 1}/{pageCount}</span>
                        <button
                            title="Next page"
                            disabled={currentPage >= pageCount - 1}
                            onclick={() => setCurrentPage(currentPage + 1)}
                        >
                            <ChevronRightIcon size={19} />
                        </button>
                    </div>
                {/if}
            </div>
        </section>
    </div>
</div>

<style>
    .organizer-screen {
        position: fixed;
        z-index: 35;
        inset: 0;
        display: flex;
        width: 100%;
        height: 100%;
        min-width: 0;
        justify-content: center;
        overflow: hidden;
    }
    .organizer-panel {
        display: flex;
        width: min(100%, 48rem);
        height: 100%;
        min-width: 0;
        flex-direction: column;
        overflow-y: auto;
        padding: 1rem;
    }
    .screen-header,
    .root-toolbar,
    .folder-toolbar {
        display: flex;
        align-items: center;
    }
    .screen-header {
        gap: 0.7rem;
        padding: 0.25rem 0.1rem 1rem;
    }
    .header-copy {
        min-width: 0;
    }
    .header-copy h1 {
        margin: 0;
        font-size: 1.15rem;
        font-weight: 700;
    }
    .header-copy p {
        margin: 0.1rem 0 0;
        color: var(--color-textcolor2);
        font-size: 0.78rem;
    }
    .organizer-card {
        width: 100%;
        min-width: 0;
        border: 1px solid var(--color-darkborderc);
        border-radius: 0.75rem;
        padding: 0.75rem;
    }
    .root-toolbar,
    .folder-toolbar {
        min-height: 2.4rem;
        gap: 0.45rem;
        margin-bottom: 0.7rem;
    }
    .folder-toolbar {
        flex-wrap: wrap;
    }
    .folder-name {
        max-width: min(14rem, 42vw);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-weight: 650;
    }
    .folder-total {
        color: var(--color-textcolor2);
        font-size: 0.75rem;
    }
    .draft-pill {
        border: 1px solid color-mix(in srgb, var(--color-primary) 55%, var(--color-darkborderc));
        border-radius: 999px;
        padding: 0.12rem 0.45rem;
        color: var(--color-primary);
        font-size: 0.68rem;
        font-weight: 650;
    }
    .grow {
        flex: 1 1 auto;
    }
    .icon-button,
    .members-button {
        display: inline-flex;
        min-width: 2.25rem;
        min-height: 2.25rem;
        align-items: center;
        justify-content: center;
        border-radius: 0.45rem;
        color: var(--color-textcolor2);
    }
    .icon-button:hover,
    .members-button:hover {
        color: var(--color-primary);
        background: color-mix(in srgb, var(--color-primary) 11%, transparent);
    }
    .members-button {
        border: 1px solid color-mix(in srgb, var(--color-primary) 58%, var(--color-darkborderc));
        color: var(--color-primary);
    }
    .new-folder-button,
    .text-button {
        display: inline-flex;
        min-height: 2.35rem;
        align-items: center;
        justify-content: center;
        gap: 0.38rem;
        border: 1px solid var(--color-darkborderc);
        border-radius: 0.5rem;
        padding: 0.4rem 0.65rem;
        color: var(--color-textcolor);
        background: color-mix(in srgb, var(--color-darkborderc) 28%, transparent);
        font-size: 0.8rem;
        font-weight: 600;
    }
    .active-button {
        border-color: var(--color-primary);
        color: var(--color-primary);
        background: color-mix(in srgb, var(--color-primary) 12%, transparent);
    }
    .danger-button {
        color: var(--color-draculared, #ef4444);
    }
    .draft-note {
        margin: -0.1rem 0 0.65rem;
        border: 1px dashed color-mix(in srgb, var(--color-primary) 45%, var(--color-darkborderc));
        border-radius: 0.5rem;
        padding: 0.55rem 0.65rem;
        color: var(--color-textcolor2);
        font-size: 0.76rem;
        line-height: 1.15rem;
    }
    .page-shell,
    .page-viewport {
        position: relative;
        width: 100%;
        min-width: 0;
    }
    .page-viewport {
        overflow: hidden;
        border: 1px solid var(--color-darkborderc);
        border-radius: 0.65rem;
    }
    .page-track {
        display: flex;
        width: 100%;
        transition: transform 220ms cubic-bezier(0.22, 0.8, 0.24, 1);
        will-change: transform;
    }
    .character-page {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 5rem));
        grid-auto-rows: 6.35rem;
        flex: 0 0 100%;
        min-width: 0;
        min-height: 6.35rem;
        align-content: start;
        justify-content: space-between;
        gap: 0.3rem 0.2rem;
        padding: 0.4rem 0.15rem;
    }
    .card-slot {
        position: relative;
        display: flex;
        min-width: 0;
        justify-content: center;
    }
    .character-card,
    .folder-card {
        position: relative;
        display: flex;
        width: 5rem;
        min-width: 0;
        flex-direction: column;
        align-items: center;
        gap: 0.3rem;
        border-radius: 0.6rem;
        padding: 0;
        color: var(--color-textcolor);
    }
    .character-card:hover,
    .folder-card:hover {
        color: var(--color-primary);
        background: color-mix(in srgb, var(--color-primary) 10%, transparent);
    }
    .card-image,
    .folder-image {
        display: flex;
        width: 5rem;
        height: 5rem;
        flex: 0 0 5rem;
        align-items: center;
        justify-content: center;
        border-radius: 0.5rem;
        background-position: center !important;
        background-repeat: no-repeat !important;
        background-size: cover !important;
        box-shadow: 0 8px 18px rgb(0 0 0 / 0.2);
    }
    .card-image-empty {
        background-image: linear-gradient(135deg, rgb(255 255 255 / 0.08), transparent);
    }
    .folder-image {
        position: relative;
        overflow: hidden;
        border: 1px solid color-mix(in srgb, var(--color-primary) 40%, var(--color-darkborderc));
        background: color-mix(in srgb, var(--color-primary) 16%, var(--color-darkborderc));
    }
    .folder-image-fill {
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background-position: center !important;
        background-repeat: no-repeat !important;
        background-size: cover !important;
    }
    .folder-count {
        position: absolute;
        z-index: 2;
        right: 0.35rem;
        bottom: 0.3rem;
        min-width: 1.2rem;
        border-radius: 999px;
        padding: 0.05rem 0.3rem;
        color: white;
        background: rgb(0 0 0 / 0.58);
        font-size: 0.7rem;
        line-height: 1.1rem;
    }
    .card-name {
        width: 100%;
        overflow: hidden;
        text-align: center;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 0.75rem;
        line-height: 1rem;
    }
    .member-selected .card-image {
        outline: 3px solid var(--color-green-500, #22c55e);
        outline-offset: -3px;
    }
    .membership-mark {
        position: absolute;
        top: 0.25rem;
        right: 0.25rem;
        display: flex;
        width: 1.35rem;
        height: 1.35rem;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        color: white;
        background: rgb(0 0 0 / 0.68);
        font-size: 0.9rem;
        font-weight: 700;
    }
    .member-selected .membership-mark {
        background: var(--color-green-500, #22c55e);
    }
    .item-shift {
        position: absolute;
        z-index: 4;
        top: 1.9rem;
        display: flex;
        width: 1.45rem;
        height: 1.7rem;
        align-items: center;
        justify-content: center;
        border: 1px solid color-mix(in srgb, var(--color-primary) 65%, white);
        border-radius: 999px;
        color: white;
        background: rgb(0 0 0 / 0.75);
        box-shadow: 0 2px 7px rgb(0 0 0 / 0.35);
        font-size: 1.35rem;
        line-height: 1;
    }
    .item-shift-left {
        left: -0.1rem;
    }
    .item-shift-right {
        right: -0.1rem;
    }
    .item-shift:disabled {
        opacity: 0.22;
    }
    .empty-placeholder {
        grid-column: 1 / -1;
        align-self: center;
        justify-self: center;
        color: var(--color-textcolor2);
        font-size: 0.8rem;
        opacity: 0.8;
        text-align: center;
    }
    .page-controls {
        display: flex;
        min-height: 2rem;
        align-items: center;
        justify-content: center;
        gap: 0.45rem;
        margin-top: 0.35rem;
        color: var(--color-textcolor2);
    }
    .page-controls > button {
        display: inline-flex;
        padding: 0.25rem;
        border-radius: 0.35rem;
    }
    .page-controls > button:disabled {
        opacity: 0.3;
    }
    .page-dots {
        display: flex;
        align-items: center;
        gap: 0.3rem;
    }
    .page-dot {
        width: 0.45rem;
        height: 0.45rem;
        border-radius: 999px;
        background: var(--color-textcolor2);
        opacity: 0.35;
        transition: width 160ms ease, opacity 160ms ease, background 160ms ease;
    }
    .page-dot-active {
        width: 1rem;
        background: var(--color-primary);
        opacity: 1;
    }
    .page-number {
        min-width: 2.4rem;
        text-align: center;
        font-size: 0.72rem;
    }
    @media (prefers-reduced-motion: reduce) {
        .page-track,
        .page-dot {
            transition-duration: 1ms;
        }
    }
    @media (max-width: 390px) {
        .organizer-panel {
            padding: 0.6rem;
        }
        .organizer-card {
            padding: 0.55rem;
        }
        .character-page {
            grid-template-columns: repeat(4, minmax(0, 1fr));
        }
        .character-card,
        .folder-card {
            width: 100%;
            max-width: 4.55rem;
        }
        .card-image,
        .folder-image {
            width: 100%;
            max-width: 4.55rem;
        }
        .card-image,
        .folder-image {
            height: auto;
            flex: 0 0 auto;
            aspect-ratio: 1 / 1;
        }
    }
</style>
