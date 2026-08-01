<!-- POCKETRISU-PATCH:persona-organizer-picker:START -->
<script lang="ts">
    import { XIcon } from "@lucide/svelte"
    import { language } from "../../lang"
    import { requestImmediateSave } from "src/ts/globalApi.svelte"
    import { changeUserPersona, importUserPersona, saveUserPersona } from "src/ts/persona"
    import {
        filterPersonaPicker,
        PERSONA_PICKER_SCOPE_ALL,
        PERSONA_PICKER_SCOPE_UNFILED,
        personaPickerFolderIdFromScope,
        personaPickerFolderScope,
    } from "src/ts/personaOrganizer"
    import { DBState } from "src/ts/stores.svelte"
    import { v4 } from "uuid"

    interface Props {
        close?: () => void
        onSelect?: ((index: number) => void) | null
    }

    let { close = () => {}, onSelect = null }: Props = $props()
    let query = $state("")
    let pickerScope = $state(PERSONA_PICKER_SCOPE_ALL)
    let importing = $state(false)

    const pickerEntries = $derived.by(() => filterPersonaPicker(
        DBState.db.personas,
        DBState.db.personaFolders ?? [],
        query,
        pickerScope,
    ))
    const selectedFolderId = $derived(personaPickerFolderIdFromScope(
        DBState.db.personaFolders ?? [],
        pickerScope,
    ))

    function selectPersona(index: number): void {
        if (index < 0 || index >= DBState.db.personas.length) return
        if (onSelect) onSelect(index)
        else changeUserPersona(index)
        close()
    }

    function createPersona(): void {
        saveUserPersona()
        const index = DBState.db.personas.length
        DBState.db.personas.push({
            id: v4(),
            name: "New Persona",
            icon: "",
            imageGallery: [],
            personaPrompt: "",
            note: "",
            folderId: selectedFolderId,
        })
        selectPersona(index)
        void requestImmediateSave()
    }

    async function importPersona(): Promise<void> {
        if (importing) return
        importing = true
        try {
            const index = await importUserPersona(selectedFolderId)
            if (index == null) return
            saveUserPersona()
            selectPersona(index)
            void requestImmediateSave()
        } finally {
            importing = false
        }
    }
</script>

<div class="absolute w-full h-full z-40 bg-black/50 flex justify-center items-center">
    <div class="persona-picker bg-darkbg text-textcolor break-any rounded-md">
        <div class="picker-heading">
            <h2 class="mt-0 mb-0 font-bold">{language.persona}</h2>
            <button
                class="text-textcolor2 hover:text-primary cursor-pointer items-center"
                aria-label="Close persona picker"
                onclick={close}
            >
                <XIcon size={24}/>
            </button>
        </div>

        <div class="picker-controls">
            <label>
                <span>Search personas</span>
                <input
                    class="picker-input bg-darkbg text-textcolor border-darkborderc"
                    type="search"
                    placeholder="Name or note"
                    bind:value={query}
                />
            </label>
            <label>
                <span>Folder</span>
                <select
                    class="picker-input bg-darkbg text-textcolor border-darkborderc"
                    bind:value={pickerScope}
                >
                    <option value={PERSONA_PICKER_SCOPE_ALL}>All folders</option>
                    <option value={PERSONA_PICKER_SCOPE_UNFILED}>Unfiled</option>
                    {#each DBState.db.personaFolders ?? [] as folder (folder.id)}
                        <option value={personaPickerFolderScope(folder.id)}>{folder.name}</option>
                    {/each}
                </select>
            </label>
        </div>

        <div class="picker-actions">
            <button class="picker-action border-darkborderc" onclick={createPersona}>
                {language.createfromScratch}
            </button>
            <button
                class="picker-action border-darkborderc"
                disabled={importing}
                onclick={importPersona}
            >
                {importing ? "Importing..." : language.importCharacter}
            </button>
        </div>

        <div class="picker-results" role="list" aria-label="Personas">
            {#each pickerEntries as entry (entry.index)}
                <button
                    class="persona-row border-darkborderc"
                    class:bg-selected={entry.index === DBState.db.selectedPersona}
                    onclick={() => selectPersona(entry.index)}
                >
                    <span class="font-medium">{entry.persona.name}</span>
                    {#if entry.persona.note}
                        <span class="persona-note">{entry.persona.note}</span>
                    {/if}
                </button>
            {:else}
                <p class="empty-result">No personas match this search and folder.</p>
            {/each}
        </div>
    </div>
</div>

<style>
    .persona-picker {
        display: flex;
        flex-direction: column;
        width: min(32rem, calc(100vw - 2rem));
        max-height: min(44rem, calc(100vh - 2rem));
        padding: 1rem;
        overflow: hidden;
    }
    .picker-heading,
    .picker-actions {
        display: flex;
        align-items: center;
        gap: 0.75rem;
    }
    .picker-heading {
        justify-content: space-between;
        margin-bottom: 0.875rem;
    }
    .picker-controls {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(9rem, 0.7fr);
        gap: 0.625rem;
    }
    .picker-controls label {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        min-width: 0;
        font-size: 0.75rem;
        color: var(--risu-theme-textcolor2);
    }
    .picker-input,
    .picker-action {
        min-height: 2.5rem;
        border-width: 1px;
        border-style: solid;
        border-radius: 0.5rem;
        padding: 0.5rem 0.625rem;
    }
    .picker-actions {
        margin: 0.75rem 0;
    }
    .picker-action {
        flex: 1;
        text-align: center;
    }
    .picker-action:disabled {
        opacity: 0.55;
    }
    .picker-results {
        min-height: 0;
        overflow-y: auto;
        border-top: 1px solid var(--risu-theme-darkborderc);
    }
    .persona-row {
        display: flex;
        flex-direction: column;
        width: 100%;
        gap: 0.125rem;
        padding: 0.75rem 0.625rem;
        border-width: 0 0 1px;
        border-style: solid;
        text-align: left;
    }
    .persona-note {
        color: var(--risu-theme-textcolor2);
        font-size: 0.8rem;
    }
    .empty-result {
        margin: 1.5rem 0.5rem;
        text-align: center;
        color: var(--risu-theme-textcolor2);
    }
    .break-any {
        word-break: normal;
        overflow-wrap: anywhere;
    }
    @media (max-width: 36rem) {
        .picker-controls {
            grid-template-columns: 1fr;
        }
    }
</style>
<!-- POCKETRISU-PATCH:persona-organizer-picker:END -->
