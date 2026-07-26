<!-- POCKETRISU-PATCH:persona-organizer:START -->
<script lang="ts">
    import {
        ArrowLeftIcon,
        ChevronLeftIcon,
        ChevronRightIcon,
        FolderIcon,
        FolderOpenIcon,
        FolderPlusIcon,
        PencilIcon,
        Trash2Icon,
    } from "@lucide/svelte"
    import { onDestroy } from "svelte"
    import { language } from "src/lang"
    import Help from "src/lib/Others/Help.svelte"
    import BaseRoundedButton from "src/lib/UI/BaseRoundedButton.svelte"
    import Button from "src/lib/UI/GUI/Button.svelte"
    import Check from "src/lib/UI/GUI/CheckInput.svelte"
    import SettingPage from "src/lib/UI/GUI/SettingPage.svelte"
    import TextAreaInput from "src/lib/UI/GUI/TextAreaInput.svelte"
    import TextInput from "src/lib/UI/GUI/TextInput.svelte"
    import { alertConfirm, alertInput, alertSelect } from "src/ts/alert"
    import { getCharImage } from "src/ts/characters"
    import { requestImmediateSave } from "src/ts/globalApi.svelte"
    import {
        changeUserPersona,
        exportUserPersona,
        importUserPersona,
        saveUserPersona,
        selectUserImg,
    } from "src/ts/persona"
    import {
        buildPersonaGroups,
        movePersonaWithinGroup,
        reorderPersonaList,
        type PersonaGroup,
    } from "src/ts/personaOrganizer"
    import type {
        RisuPersona,
        RisuPersonaFolder,
    } from "src/ts/storage/database.svelte"
    import { DBState } from "src/ts/stores.svelte"
    import { v4 } from "uuid"

    type ViewItem = {
        key: string
        kind: "persona"
        persona: RisuPersona
    } | {
        key: string
        kind: "folder"
        folder: RisuPersonaFolder
        count: number
    }

    const PAGE_SIZE = 16

    let openFolderId = $state<string | null>(null)
    let pageByContext = $state<Record<string, number>>({ root: 0 })
    let arrangeMode = $state(false)
    let membershipMode = $state(false)
    let membershipPersonaIds = $state<string[]>([])

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
    const activeContext = $derived(openFolderId ?? "root")
    const activeFolderId = $derived(openGroup?.id ?? null)

    const rootItems = $derived.by((): ViewItem[] => [
        ...DBState.db.personaFolders.map((folder): ViewItem => ({
            key: `folder:${folder.id}`,
            kind: "folder",
            folder,
            count: groups.find((group) => group.id === folder.id)?.personas.length ?? 0,
        })),
        ...unfiledGroup.personas.map((persona): ViewItem => ({
            key: `persona:${persona.id}`,
            kind: "persona",
            persona,
        })),
    ])
    const folderItems = $derived.by((): ViewItem[] =>
        openGroup
            ? openGroup.personas.map((persona): ViewItem => ({
                key: `persona:${persona.id}`,
                kind: "persona",
                persona,
            }))
            : []
    )
    const activeItems = $derived(openGroup ? folderItems : rootItems)
    const membershipItems = $derived.by((): ViewItem[] => {
        const byId = new Map(DBState.db.personas.map((persona) => [persona.id, persona]))
        return membershipPersonaIds
            .map((id) => byId.get(id))
            .filter((persona): persona is RisuPersona => !!persona)
            .map((persona): ViewItem => ({
                key: `member:${persona.id}`,
                kind: "persona",
                persona,
            }))
    })
    const displayItems = $derived(membershipMode ? membershipItems : activeItems)
    const displayContext = $derived(
        membershipMode && openFolderId ? `members:${openFolderId}` : activeContext
    )
    const pageCount = $derived(Math.max(1, Math.ceil(displayItems.length / PAGE_SIZE)))
    const currentPage = $derived(
        Math.min(pageByContext[displayContext] ?? 0, pageCount - 1)
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

    function movePersona(persona: RisuPersona, offset: -1 | 1): void {
        if (!persona.id) return
        saveUserPersona()
        const keepSelectedId = selectedPersonaId()
        commitPersonas(
            movePersonaWithinGroup(
                DBState.db.personas,
                DBState.db.personaFolders,
                persona.id,
                persona.folderId ?? null,
                offset,
            ),
            keepSelectedId,
        )
    }

    function canMovePersona(persona: RisuPersona, offset: -1 | 1): boolean {
        const group = groups.find((item) => item.id === (persona.folderId ?? null)) ?? unfiledGroup
        const index = group.personas.findIndex((item) => item.id === persona.id)
        const target = index + offset
        return index >= 0 && target >= 0 && target < group.personas.length
    }

    function setCurrentPage(page: number): void {
        const next = Math.max(0, Math.min(page, pageCount - 1))
        pageByContext = { ...pageByContext, [displayContext]: next }
    }

    function enterFolder(folder: RisuPersonaFolder): void {
        openFolderId = folder.id
        membershipMode = false
        if (pageByContext[folder.id] === undefined) {
            pageByContext = { ...pageByContext, [folder.id]: 0 }
        }
    }

    function leaveFolder(): void {
        membershipMode = false
        membershipPersonaIds = []
        openFolderId = null
    }

    function openMembershipEditor(): void {
        if (!openFolderId) return
        membershipPersonaIds = DBState.db.personas
            .map((persona) => persona.id)
            .filter((id): id is string => !!id)
        membershipMode = true
        pageByContext = { ...pageByContext, [`members:${openFolderId}`]: 0 }
    }

    function closeMembershipEditor(): void {
        membershipMode = false
        membershipPersonaIds = []
    }

    function toggleFolderMembership(persona: RisuPersona): void {
        if (!openFolderId || !persona.id) return
        reorderPersona(
            persona.id,
            persona.folderId === openFolderId ? null : openFolderId,
            null,
        )
    }

    async function addFolder(): Promise<void> {
        const name = await alertInput("Folder name")
        if (!name?.trim()) return
        saveUserPersona()
        const folder = { id: v4(), name: name.trim() }
        DBState.db.personaFolders = [...DBState.db.personaFolders, folder]
        pageByContext = { ...pageByContext, [folder.id]: 0 }
        openFolderId = folder.id
        membershipMode = false
        void requestImmediateSave()
    }

    async function renameFolder(folder: RisuPersonaFolder): Promise<void> {
        const name = await alertInput("Folder name", [], folder.name)
        if (!name?.trim()) return
        saveUserPersona()
        folder.name = name.trim()
        DBState.db.personaFolders = [...DBState.db.personaFolders]
        void requestImmediateSave()
    }

    async function removeFolder(folder: RisuPersonaFolder): Promise<void> {
        if (!await alertConfirm(`Remove folder "${folder.name}"? Personas will be kept.`)) return
        saveUserPersona()
        for (const persona of DBState.db.personas) {
            if (persona.folderId === folder.id) persona.folderId = undefined
        }
        DBState.db.personaFolders = DBState.db.personaFolders.filter((item) => item.id !== folder.id)
        const { [folder.id]: removed, [`members:${folder.id}`]: removedMembers, ...remainingPages } = pageByContext
        void removed
        void removedMembers
        pageByContext = remainingPages
        membershipMode = false
        membershipPersonaIds = []
        openFolderId = null
        void requestImmediateSave()
    }

    function moveFolder(folder: RisuPersonaFolder, offset: -1 | 1): void {
        const folders = [...DBState.db.personaFolders]
        const from = folders.findIndex((item) => item.id === folder.id)
        const to = from + offset
        if (from < 0 || to < 0 || to >= folders.length) return
        saveUserPersona()
        folders.splice(to, 0, ...folders.splice(from, 1))
        DBState.db.personaFolders = folders
        void requestImmediateSave()
    }

    function canMoveFolder(folder: RisuPersonaFolder, offset: -1 | 1): boolean {
        const index = DBState.db.personaFolders.findIndex((item) => item.id === folder.id)
        const target = index + offset
        return index >= 0 && target >= 0 && target < DBState.db.personaFolders.length
    }

    function choosePersona(persona: RisuPersona): void {
        const index = DBState.db.personas.findIndex((item) => item.id === persona.id)
        if (index < 0 || index === DBState.db.selectedPersona) return
        saveUserPersona()
        changeUserPersona(index)
    }

    async function addPersona(): Promise<void> {
        const selected = parseInt(await alertSelect([
            language.createfromScratch,
            language.importCharacter,
        ]))
        if (selected === 0) {
            DBState.db.personas.push({
                id: v4(),
                name: "New Persona",
                icon: "",
                personaPrompt: "",
                note: "",
            })
            changeUserPersona(DBState.db.personas.length - 1)
            void requestImmediateSave()
        } else if (selected === 1) {
            await importUserPersona()
            void requestImmediateSave()
        }
    }

    onDestroy(() => {
        saveUserPersona()
    })
</script>

{#snippet personaCard(persona: RisuPersona, membership: boolean)}
    <button
        class="persona-card text-textcolor"
        class:persona-selected={!membership && selectedPersonaId() === persona.id}
        class:persona-member-selected={membership && persona.folderId === openFolderId}
        aria-label={membership
            ? `${persona.name}: ${persona.folderId === openFolderId ? "selected" : "not selected"}`
            : persona.name}
        onclick={() => membership ? toggleFolderMembership(persona) : choosePersona(persona)}
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
        {#if membership}
            <span class="membership-mark" aria-hidden="true">
                {persona.folderId === openFolderId ? "✓" : "+"}
            </span>
        {/if}
        <span class="persona-card-name" title={persona.note ? `${persona.name} / ${persona.note}` : persona.name}>
            {persona.name}
        </span>
    </button>
{/snippet}

{#snippet folderCard(folder: RisuPersonaFolder, count: number)}
    <button
        class="folder-card text-textcolor"
        aria-label={`Open ${folder.name} folder`}
        onclick={() => enterFolder(folder)}
    >
        <span class="folder-image">
            <FolderIcon size={46} />
            <span class="folder-count">{count}</span>
        </span>
        <span class="persona-card-name">{folder.name}</span>
    </button>
{/snippet}

<SettingPage title={language.persona}>
    <div class="persona-organizer rounded-md border-darkborderc border mb-2 p-3 w-full max-w-full min-w-0">
        {#if openGroup?.folder}
            <div class="folder-toolbar">
                <button class="folder-back-button" title="Back to personas" onclick={leaveFolder}>
                    <ArrowLeftIcon size={19} />
                </button>
                <FolderOpenIcon size={20} />
                <span class="font-semibold truncate">
                    {membershipMode ? `Select for ${openGroup.name}` : openGroup.name}
                </span>
                <span class="text-xs opacity-70">
                    {membershipMode
                        ? `${openGroup.personas.length}/${DBState.db.personas.length}`
                        : openGroup.personas.length}
                </span>
                <div class="grow"></div>
                {#if membershipMode}
                    <button class="toolbar-text-button toolbar-active" onclick={closeMembershipEditor}>
                        Done
                    </button>
                {:else}
                    <button class="folder-members-button" title="Add or remove personas" onclick={openMembershipEditor}>
                        <span aria-hidden="true">+</span>
                    </button>
                    <button
                        class="toolbar-text-button"
                        class:toolbar-active={arrangeMode}
                        aria-pressed={arrangeMode}
                        onclick={() => arrangeMode = !arrangeMode}
                    >
                        {arrangeMode ? "Done" : "Arrange"}
                    </button>
                    <button title="Rename folder" onclick={() => renameFolder(openGroup.folder!)}>
                        <PencilIcon size={17} />
                    </button>
                    <button title="Remove folder" onclick={() => removeFolder(openGroup.folder!)}>
                        <Trash2Icon size={17} />
                    </button>
                {/if}
            </div>
        {:else}
            <div class="organizer-toolbar">
                <button class="folder-create-button" title="Create folder" onclick={addFolder}>
                    <FolderPlusIcon size={19} />
                    <span>New folder</span>
                </button>
                <div class="grow"></div>
                <button
                    class="toolbar-text-button"
                    class:toolbar-active={arrangeMode}
                    aria-pressed={arrangeMode}
                    onclick={() => arrangeMode = !arrangeMode}
                >
                    {arrangeMode ? "Done" : "Arrange"}
                </button>
                <div class="flex justify-center items-center mx-1" title="Create or import persona">
                    <BaseRoundedButton onClick={addPersona}>
                        <svg viewBox="0 0 24 24" width="1.2em" height="1.2em">
                            <path
                                fill="none"
                                stroke="currentColor"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                            />
                        </svg>
                    </BaseRoundedButton>
                </div>
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
                            class="persona-page"
                            role="list"
                            aria-label={`${membershipMode ? "Folder selection" : openGroup?.name ?? "Personas"} page ${pageIndex + 1}`}
                        >
                            {#each displayItems.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE) as item (item.key)}
                                <div class="card-slot">
                                    {#if item.kind === "persona"}
                                        {@render personaCard(item.persona, membershipMode)}
                                    {:else}
                                        {@render folderCard(item.folder, item.count)}
                                    {/if}
                                    {#if arrangeMode && !membershipMode}
                                        <button
                                            class="item-shift item-shift-left"
                                            aria-label={`Move ${item.kind === "persona" ? item.persona.name : item.folder.name} left`}
                                            disabled={item.kind === "persona"
                                                ? !canMovePersona(item.persona, -1)
                                                : !canMoveFolder(item.folder, -1)}
                                            onclick={(event) => {
                                                event.stopPropagation()
                                                if (item.kind === "persona") movePersona(item.persona, -1)
                                                else moveFolder(item.folder, -1)
                                            }}
                                        >‹</button>
                                        <button
                                            class="item-shift item-shift-right"
                                            aria-label={`Move ${item.kind === "persona" ? item.persona.name : item.folder.name} right`}
                                            disabled={item.kind === "persona"
                                                ? !canMovePersona(item.persona, 1)
                                                : !canMoveFolder(item.folder, 1)}
                                            onclick={(event) => {
                                                event.stopPropagation()
                                                if (item.kind === "persona") movePersona(item.persona, 1)
                                                else moveFolder(item.folder, 1)
                                            }}
                                        >›</button>
                                    {/if}
                                </div>
                            {/each}
                            {#if displayItems.length === 0 && pageIndex === 0}
                                <span class="empty-placeholder">
                                    {openGroup ? "No personas in this folder · use + to add" : "No personas"}
                                </span>
                            {/if}
                        </div>
                    {/each}
                </div>
            </div>

            {#if pageCount > 1}
                <div class="page-controls" aria-label="Persona pages">
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
    </div>

    <div class="flex w-full items-starts rounded-md border-darkborderc border p-4 max-w-full flex-wrap">
        <div class="flex flex-col mt-4 mr-4">
            <button onclick={() => {selectUserImg()}}>
                {#if DBState.db.userIcon === ""}
                    <div class="rounded-md h-28 w-28 shadow-lg bg-textcolor2 cursor-pointer hover:text-primary"></div>
                {:else}
                    {#await getCharImage(DBState.db.userIcon, DBState.db.personas[DBState.db.selectedPersona].largePortrait ? "lgcss" : "css")}
                        <div class="rounded-md h-28 w-28 shadow-lg bg-textcolor2 cursor-pointer hover:text-primary"></div>
                    {:then imageStyle}
                        <div class="rounded-md h-28 w-28 shadow-lg bg-textcolor2 cursor-pointer hover:text-primary" style={imageStyle}></div>
                    {/await}
                {/if}
            </button>
        </div>
        <div class="flex grow flex-col p-2 max-w-full">
            <span class="text-sm text-textcolor2">{language.name} <Help key="personaName" /></span>
            <TextInput className="mt-2" marginBottom placeholder="User" bind:value={DBState.db.username}/>
            <span class="text-sm text-textcolor2">{language.note} <Help key="personaNote" /></span>
            {#if DBState.db.personaNote}
                <TextInput className="mt-2" marginBottom bind:value={DBState.db.userNote} placeholder={`Put a unique identifier for this persona here.\nExample: [Alternate Hunters persona]`} />
            {/if}
            <span class="text-sm text-textcolor2">{language.description} <Help key="personaDescription" /></span>
            <TextAreaInput className="mt-2 mb-4" autocomplete="off" bind:value={DBState.db.personaPrompt} placeholder={`Put the description of this persona here.\nExample: [<user> is a 20 year old girl.]`} />
            <div class="flex gap-2 mt-4 max-w-full flex-wrap">
                <Button onclick={exportUserPersona}>{language.export}</Button>
                <Button onclick={importUserPersona}>{language.import}</Button>

                <Button styled="danger" onclick={async () => {
                    if (DBState.db.personas.length === 1) return
                    const confirmed = await alertConfirm(
                        `${language.removeConfirm}${DBState.db.personas[DBState.db.selectedPersona].name}`
                    )
                    if (confirmed) {
                        saveUserPersona()
                        const personas = DBState.db.personas
                        personas.splice(DBState.db.selectedPersona, 1)
                        DBState.db.personas = personas
                        changeUserPersona(0, "noSave")
                        void requestImmediateSave()
                    }
                }}>{language.remove}</Button>
                <Check bind:check={DBState.db.personas[DBState.db.selectedPersona].largePortrait} name={language.largePortrait}/>
                <Help key="personaLargePortrait" />
            </div>
        </div>
    </div>
</SettingPage>

<style>
    .persona-organizer {
        position: relative;
    }
    .organizer-toolbar,
    .folder-toolbar {
        display: flex;
        align-items: center;
        gap: 0.45rem;
        margin-bottom: 0.65rem;
        color: var(--color-textcolor);
    }
    .folder-toolbar {
        flex-wrap: wrap;
    }
    .folder-toolbar > button,
    .folder-back-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0.3rem;
        border-radius: 0.35rem;
        color: var(--color-textcolor2);
    }
    .folder-toolbar > button:hover,
    .folder-back-button:hover {
        color: var(--color-primary);
        background: color-mix(in srgb, var(--color-primary) 12%, transparent);
    }
    .folder-create-button,
    .toolbar-text-button {
        display: inline-flex;
        align-items: center;
        min-height: 2.35rem;
        border: 1px solid var(--color-darkborderc);
        border-radius: 0.5rem;
        padding: 0.4rem 0.65rem;
        color: var(--color-textcolor);
        background: color-mix(in srgb, var(--color-darkborderc) 28%, transparent);
        font-size: 0.8rem;
        font-weight: 600;
    }
    .folder-create-button {
        gap: 0.4rem;
        padding-right: 0.7rem;
        padding-left: 0.7rem;
    }
    .folder-create-button:hover,
    .toolbar-text-button:hover,
    .toolbar-active {
        border-color: var(--color-primary);
        color: var(--color-primary);
    }
    .toolbar-active {
        background: color-mix(in srgb, var(--color-primary) 14%, transparent);
    }
    .folder-members-button {
        width: 2.35rem;
        min-width: 2.35rem;
        height: 2.35rem;
        border: 1px solid var(--color-primary);
        border-radius: 0.5rem !important;
        color: var(--color-primary) !important;
        font-size: 1.45rem;
        line-height: 1;
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
    .persona-page {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 5rem));
        grid-auto-rows: 6.35rem;
        justify-content: space-between;
        gap: 0.3rem 0.2rem;
        flex: 0 0 100%;
        min-width: 0;
        min-height: 6.35rem;
        padding: 0.4rem 0.15rem;
        align-content: start;
    }
    .card-slot {
        position: relative;
        display: flex;
        min-width: 0;
        justify-content: center;
    }
    .persona-card,
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
    .persona-card:hover,
    .folder-card:hover {
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
        border: 1px solid color-mix(in srgb, var(--color-primary) 40%, var(--color-darkborderc));
        background: color-mix(in srgb, var(--color-primary) 16%, var(--color-darkborderc));
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
    .persona-member-selected .persona-image {
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
    .persona-member-selected .membership-mark {
        background: var(--color-green-500, #22c55e);
    }
    .persona-card-name {
        width: 100%;
        overflow: hidden;
        text-align: center;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 0.75rem;
        line-height: 1rem;
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
    @media (max-width: 374px) {
        .persona-page {
            grid-template-columns: repeat(4, minmax(0, 1fr));
        }
        .persona-card,
        .folder-card,
        .persona-image,
        .folder-image {
            width: 4.55rem;
        }
        .persona-image,
        .folder-image {
            height: 4.55rem;
            flex-basis: 4.55rem;
        }
    }
</style>
<!-- POCKETRISU-PATCH:persona-organizer:END -->
