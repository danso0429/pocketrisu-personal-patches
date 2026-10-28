'use strict'

const fs = require('node:fs')
const path = require('node:path')

const files116Root = path.join(__dirname, 'files-1.16')
const owned116 = (relative) => fs.readFileSync(path.join(files116Root, relative), 'utf8')
const personaDefault = `    if(!Array.isArray(data.personas) || data.personas.length === 0){
        data.personas = [{
            name: data.username,
            personaPrompt: "",
            icon: data.userIcon,
            note: data.userNote,
            largePortrait: false
        }]
    }
`

module.exports = {
    id: 'persona-organizer',
    title: 'Persona organizer',
    version: '0.11.4',
    targets: {
        pocketrisu: {
            verified: [],
            reviewing: ['1.16.1'],
        },
    },
    userSelectable: true,
    units: [
        {
            id: 'persona-organizer:logic',
            file: 'src/ts/personaOrganizer.ts',
            type: 'owned',
            content: fs.readFileSync(path.join(__dirname, 'files/src/ts/personaOrganizer.ts'), 'utf8'),
        },
        {
            id: 'persona-organizer:logic-tests',
            file: 'src/ts/personaOrganizer.test.ts',
            type: 'owned',
            content: fs.readFileSync(path.join(__dirname, 'files/src/ts/personaOrganizer.test.ts'), 'utf8'),
        },
        {
            id: 'persona-organizer:image-gallery-logic',
            file: 'src/ts/personaImages.ts',
            type: 'owned',
            content: fs.readFileSync(path.join(__dirname, 'files/src/ts/personaImages.ts'), 'utf8'),
        },
        {
            id: 'persona-organizer:image-gallery-tests',
            file: 'src/ts/personaImages.test.ts',
            type: 'owned',
            content: fs.readFileSync(path.join(__dirname, 'files/src/ts/personaImages.test.ts'), 'utf8'),
        },
        {
            id: 'persona-organizer:image-gallery-normalization:1.16',
            file: 'src/ts/storage/database.svelte.ts',
            type: 'insert',
            where: 'after',
            anchor: personaDefault,
            content: `    for (const persona of data.personas) {
        const gallery = Array.isArray(persona.imageGallery)
            ? persona.imageGallery.filter((path, index, values) =>
                typeof path === 'string' && !!path && values.indexOf(path) === index
            )
            : []
        if (typeof persona.icon !== 'string') persona.icon = ''
        if (persona.icon && !gallery.includes(persona.icon)) gallery.unshift(persona.icon)
        if (!persona.icon && gallery.length > 0) persona.icon = gallery[0]
        persona.imageGallery = gallery
    }
`,
        },
        {
            id: 'persona-organizer:persona-image-gallery-field',
            file: 'src/ts/storage/database.svelte.ts',
            type: 'insert',
            where: 'after',
            anchor: '    note?:string\n',
            content: '    imageGallery?:string[]\n',
        },
        {
            id: 'persona-organizer:folder-model:1.16',
            file: 'src/ts/storage/database.svelte.ts',
            type: 'replace',
            anchor: `export interface PromptPresetFolder {
    id: string
    name: string
}
`,
            content: `export interface PromptPresetFolder {
    id: string
    name: string
    /** Optional folder image path. Only persona folders draw it (persona-organizer). */
    icon?: string
}

/** The persona folder model is the native folder; the 1.10 pack name stays as an alias. */
export type RisuPersonaFolder = PromptPresetFolder
`,
        },
        {
            id: 'persona-organizer:persona-helper-import',
            file: 'src/ts/persona.ts',
            type: 'insert',
            where: 'after',
            anchor: 'import { v4 } from "uuid"\n',
            content: `import { normalizePersonaImageGallery } from "./personaImages"
import { resolvePersonaFolderId } from "./personaOrganizer"
`,
        },
        {
            id: 'persona-organizer:single-image-gallery-sync',
            file: 'src/ts/persona.ts',
            type: 'insert',
            where: 'after',
            anchor: `    db.personas[db.selectedPersona] = {
        ...db.personas[db.selectedPersona],
        name: db.username,
        icon: db.userIcon,
        personaPrompt: db.personaPrompt,
        note: db.userNote,
        id: db.personas[db.selectedPersona].id ?? v4()
    }
`,
            content: '    normalizePersonaImageGallery(db.personas[db.selectedPersona])\n',
            requires: ['persona-organizer:persona-helper-import'],
        },
        {
            id: 'persona-organizer:save-gallery-sync',
            file: 'src/ts/persona.ts',
            type: 'insert',
            where: 'after',
            anchor: '    db.personas[db.selectedPersona].note = db.userNote\n',
            content: '    normalizePersonaImageGallery(db.personas[db.selectedPersona])\n',
            requires: ['persona-organizer:persona-helper-import'],
        },
        {
            id: 'persona-organizer:change-gallery-sync',
            file: 'src/ts/persona.ts',
            type: 'insert',
            where: 'after',
            anchor: '    const pr = db.personas[id]\n',
            content: '    normalizePersonaImageGallery(pr)\n',
            requires: ['persona-organizer:persona-helper-import'],
        },
        {
            id: 'persona-organizer:import-folder-preservation',
            file: 'src/ts/persona.ts',
            type: 'replace',
            anchor: `export async function importUserPersona() {
    try {
        const v = await selectSingleFile(['png'])
        if (!v) {
            return
        }
        const readGenerator = PngChunk.readGenerator(v.data)
        let decoded: string | undefined;

        for await (const chunk of readGenerator) {
            if (chunk && !(chunk instanceof AppendableBuffer) && chunk.key === 'persona') {
                decoded = chunk.value
                break
            }
        }

        if (!decoded) {
            alertError(language.errors.noData)
            return
        }
        const data: PersonaCard = JSON.parse(Buffer.from(decoded, 'base64').toString('utf-8'))
        if (data.name && data.personaPrompt) {
            let db = getDatabase()
            db.personas.push({
                name: data.name,
                icon: await saveImage(await reencodeImage(v.data)),
                personaPrompt: data.personaPrompt,
                note: data.note,
                id: v4()
            })
            notifySuccess(language.successImport)
        } else {
            alertError(language.errors.noData)
        }
    } catch (error) {
        alertError(error)
        return
    }
}`,
            content: `export async function importUserPersona(folderId?: string) {
    try {
        const v = await selectSingleFile(['png'])
        if (!v) return null
        const readGenerator = PngChunk.readGenerator(v.data)
        let decoded: string | undefined

        for await (const chunk of readGenerator) {
            if (chunk && !(chunk instanceof AppendableBuffer) && chunk.key === 'persona') {
                decoded = chunk.value
                break
            }
        }

        if (!decoded) {
            alertError(language.errors.noData)
            return null
        }
        const data: PersonaCard = JSON.parse(Buffer.from(decoded, 'base64').toString('utf-8'))
        if (!data.name || !data.personaPrompt) {
            alertError(language.errors.noData)
            return null
        }

        const icon = await saveImage(await reencodeImage(v.data))
        const db = getDatabase()
        const importedIndex = db.personas.push({
            name: data.name,
            icon,
            personaPrompt: data.personaPrompt,
            note: data.note,
            id: v4(),
            folderId: resolvePersonaFolderId(db.personaFolders ?? [], folderId),
        }) - 1
        notifySuccess(language.successImport)
        return importedIndex
    } catch (error) {
        alertError(error)
        return null
    }
}`,
            requires: ['persona-organizer:persona-helper-import'],
        },
        // Export image choice over the native exportUserPersona(personaIndex):
        // an optional imagePath is used only when it is that persona's icon or
        // one of its gallery images; anything else exports as native.
        {
            id: 'persona-organizer:export-image-parameter:1.16',
            file: 'src/ts/persona.ts',
            type: 'replace',
            anchor: 'export async function exportUserPersona(personaIndex?: number) {\n',
            content: 'export async function exportUserPersona(personaIndex?: number, imagePath?: string) {\n',
        },
        {
            id: 'persona-organizer:export-image-choice:1.16',
            file: 'src/ts/persona.ts',
            type: 'replace',
            anchor: `    let img: Uint8Array
    if (!persona.icon) {
`,
            content: `    // persona-organizer: the chosen image must belong to this persona
    // (its icon or a gallery image); otherwise the native icon is used.
    const ownGallery = personaIndex === undefined
        ? db.personas[db.selectedPersona]?.imageGallery
        : db.personas[personaIndex]?.imageGallery
    const exportImage = imagePath && (
        imagePath === persona.icon
        || (Array.isArray(ownGallery) && ownGallery.includes(imagePath))
    ) ? imagePath : persona.icon
    let img: Uint8Array
    if (!exportImage) {
`,
            requires: ['persona-organizer:export-image-parameter:1.16'],
        },
        {
            id: 'persona-organizer:export-selected-image:1.16',
            file: 'src/ts/persona.ts',
            type: 'replace',
            anchor: '        img = await readImage(persona.icon)\n',
            content: '        img = await readImage(exportImage)\n',
            requires: ['persona-organizer:export-image-choice:1.16'],
        },
        {
            id: 'persona-organizer:uncleanable-gallery-assets',
            file: 'src/ts/globalApi.svelte.ts',
            type: 'insert',
            where: 'after',
            anchor: '            addUncleanable(v.icon);\n',
            content: `            if (v.imageGallery) {
                for (const image of v.imageGallery) addUncleanable(image)
            }
`,
            after: ['lazy-chat-bg-adapter:durable-flush'],
        },
        {
            id: 'persona-organizer:uncleanable-folder-assets',
            file: 'src/ts/globalApi.svelte.ts',
            type: 'insert',
            where: 'before',
            anchor: '    if (db.characterOrder) {\n',
            content: `    if (db.personaFolders) {
        for (const folder of db.personaFolders) addUncleanable(folder.icon ?? '')
    }

`,
            after: ['lazy-chat-bg-adapter:durable-flush'],
        },
        {
            id: 'persona-organizer:replace-gallery-assets',
            file: 'src/ts/globalApi.svelte.ts',
            type: 'insert',
            where: 'before',
            anchor: `    return db;
}

/**
 * Checks and updates the character order in the database.
`,
            content: `    for (const persona of db.personas ?? []) {
        persona.icon = replaceData(persona.icon)
        if (persona.imageGallery) {
            persona.imageGallery = persona.imageGallery.map((path) => replaceData(path))
        }
    }
    for (const folder of db.personaFolders ?? []) {
        folder.icon = replaceData(folder.icon ?? '')
    }
`,
            after: ['lazy-chat-bg-adapter:durable-flush'],
        },
        {
            id: 'persona-organizer:server-gallery-assets:1.16',
            file: 'server/node/server.cjs',
            type: 'replace',
            anchor: `    if (Array.isArray(dbObj.personas)) {
        for (const p of dbObj.personas) {
            add(p?.icon);
            // Legacy \`image\` alongside \`icon\` on card-imported personas. Unread
            // by current code but still a live reference — see getUncleanables.
            add(p?.image);
            const embedded = p?.embeddedModule;
            if (includeModuleAssets && Array.isArray(embedded?.assets)) for (const a of embedded.assets) add(a?.[1]);
            add(embedded?.icon);
        }
    }`,
            content: `    if (Array.isArray(dbObj.personas)) {
        for (const p of dbObj.personas) {
            add(p?.icon);
            // Legacy \`image\` alongside \`icon\` on card-imported personas. Unread
            // by current code but still a live reference — see getUncleanables.
            add(p?.image);
            if (Array.isArray(p?.imageGallery)) {
                for (const image of p.imageGallery) add(image);
            }
            const embedded = p?.embeddedModule;
            if (includeModuleAssets && Array.isArray(embedded?.assets)) for (const a of embedded.assets) add(a?.[1]);
            add(embedded?.icon);
        }
    }
    if (Array.isArray(dbObj.personaFolders)) {
        for (const folder of dbObj.personaFolders) add(folder?.icon);
    }
`,
            after: ['bg-preserve:hook:server-cjs-register-routes:1.9'],
        },
        {
            id: 'persona-organizer:account-import-gallery-assets:1.16',
            file: 'server/node/risu-account-import.cjs',
            type: 'insert',
            where: 'after',
            anchor: '        add(persona?.icon);\n',
            content: `        // persona-organizer: every persona gallery image is a live reference.
        if (Array.isArray(persona?.imageGallery)) for (const image of persona.imageGallery) add(image);
`,
        },
        {
            id: 'persona-organizer:account-import-folder-assets:1.16',
            file: 'server/node/risu-account-import.cjs',
            type: 'insert',
            where: 'before',
            anchor: '    for (const item of db?.characterOrder ?? []) {\n',
            content: `    // persona-organizer: persona folder images.
    for (const folder of Array.isArray(db?.personaFolders) ? db.personaFolders : []) add(folder?.icon);
`,
        },
        {
            id: 'persona-organizer:server-asset-tests:1.16',
            file: 'test/compat/persona-assets.e2-4.test.ts',
            type: 'owned',
            content: owned116('test/compat/persona-assets.e2-4.test.ts'),
            requires: [
                'persona-organizer:server-gallery-assets:1.16',
                'persona-organizer:account-import-gallery-assets:1.16',
                'persona-organizer:account-import-folder-assets:1.16',
            ],
        },
        {
            id: 'persona-organizer:backup-gallery-assets',
            file: 'src/ts/drive/backuplocal.ts',
            type: 'insert',
            where: 'after',
            anchor: `    if (db.personas) {
        for (const persona of db.personas) {
            if (persona && persona.icon) {
                assetMap.set(persona.icon, { charName: 'Persona', assetName: \`\${persona.name} Icon\` })
            }
        }
    }
`,
            content: `    if (db.personas) {
        for (const persona of db.personas) {
            for (const [index, image] of (persona.imageGallery ?? []).entries()) {
                assetMap.set(image, {
                    charName: 'Persona',
                    assetName: \`\${persona.name} Gallery \${index + 1}\`,
                })
            }
        }
    }
    for (const folder of db.personaFolders ?? []) {
        if (folder.icon) {
            assetMap.set(folder.icon, { charName: 'Persona Folder', assetName: \`\${folder.name} Image\` })
        }
    }
`,
        },
        {
            id: 'persona-organizer:plugin-gallery-type',
            file: 'src/ts/plugins/apiV3/risuai.d.ts',
            type: 'insert',
            where: 'after',
            anchor: `    /** Persona icon */
    icon: string;
`,
            content: `    /** Persona image gallery; icon remains the active image */
    imageGallery?: string[];
`,
        },
        {
            id: 'persona-organizer:client-tests:1.16',
            file: 'src/ts/personaOrganizer.e2-4.test.ts',
            type: 'owned',
            content: owned116('src/ts/personaOrganizer.e2-4.test.ts'),
            requires: [
                'persona-organizer:logic',
                'persona-organizer:image-gallery-logic',
            ],
        },
        {
            id: 'persona-organizer:client-asset-tests:1.16',
            file: 'src/ts/personaAssets.e2-4.test.ts',
            type: 'owned',
            content: owned116('src/ts/personaAssets.e2-4.test.ts'),
            requires: [
                'persona-organizer:uncleanable-gallery-assets',
                'persona-organizer:uncleanable-folder-assets',
                'persona-organizer:replace-gallery-assets',
            ],
        },
        // Picker (native read-only persona popup): folder and unfiled scope.
        {
            id: 'persona-organizer:picker-scope-import:1.16',
            file: 'src/lib/Setting/listedPersona.svelte',
            type: 'insert',
            where: 'after',
            anchor: '    import { groupByFolder } from "src/ts/folders";\n',
            content: `    import {
        filterPersonaPicker,
        personaPickerFolderScope,
        PERSONA_PICKER_SCOPE_ALL,
        PERSONA_PICKER_SCOPE_UNFILED,
    } from "src/ts/personaOrganizer";
`,
            requires: ['persona-organizer:logic'],
        },
        {
            id: 'persona-organizer:picker-scope-state:1.16',
            file: 'src/lib/Setting/listedPersona.svelte',
            type: 'insert',
            where: 'after',
            anchor: '    const groups = $derived(groupByFolder(DBState.db.personas.map(p => p.folderId), DBState.db.personaFolders ?? []));\n',
            content: `    // Scope: all personas, unfiled personas, or one folder. A folder scope
    // whose folder no longer exists falls back to all personas.
    let pickerScope = $state<string>(PERSONA_PICKER_SCOPE_ALL);
    const scopedIndexes = $derived(new Set(
        filterPersonaPicker(DBState.db.personas, DBState.db.personaFolders ?? [], '', pickerScope)
            .map((entry) => entry.index),
    ));
`,
            requires: ['persona-organizer:picker-scope-import:1.16'],
        },
        {
            id: 'persona-organizer:picker-scope-filter:1.16',
            file: 'src/lib/Setting/listedPersona.svelte',
            type: 'replace',
            anchor: '            {@const visible = group.indexes.filter(matches)}\n',
            managed: '            {@const visible = group.indexes.filter((index) => scopedIndexes.has(index) && matches(index))}\n',
            requires: ['persona-organizer:picker-scope-state:1.16'],
        },
        {
            id: 'persona-organizer:picker-scope-control:1.16',
            file: 'src/lib/Setting/listedPersona.svelte',
            type: 'insert',
            where: 'after',
            anchor: `                class="w-full py-1.5 text-sm bg-transparent text-textcolor outline-none"/>
        </div>
`,
            managed: `        {#if (DBState.db.personaFolders ?? []).length > 0}
            <!-- POCKETRISU-PATCH:persona-organizer:picker-scope-control -->
            <select bind:value={pickerScope} aria-label="페르소나 범위"
                class="risu-field-border mb-2 w-full rounded-md bg-darkbg px-3 py-1.5 text-sm text-textcolor outline-none">
                <option value={PERSONA_PICKER_SCOPE_ALL}>전체</option>
                <option value={PERSONA_PICKER_SCOPE_UNFILED}>{language.folderUncategorized}</option>
                {#each DBState.db.personaFolders ?? [] as folder (folder.id)}
                    <option value={personaPickerFolderScope(folder.id)}>{folder.name}</option>
                {/each}
            </select>
        {/if}
`,
            requires: ['persona-organizer:picker-scope-state:1.16'],
        },
        // Native FolderedList: optional folder header icon and folder menu entries.
        // Other lists that use FolderedList pass neither and render as before.
        {
            id: 'persona-organizer:foldered-list-props:1.16',
            file: 'src/lib/UI/FolderedList.svelte',
            type: 'insert',
            where: 'after',
            anchor: `        /** Toolbar content shown top-left, opposite the "new folder" button. */
        actions?: Snippet;
`,
            content: `        /** Optional folder header image; the default folder icon is shown without it. */
        folderIcon?: Snippet<[PromptPresetFolder]>;
        /** Optional folder menu entries, rendered before the native folder actions. */
        folderMenuItems?: Snippet<[PromptPresetFolder]>;
`,
        },
        {
            id: 'persona-organizer:foldered-list-prop-values:1.16',
            file: 'src/lib/UI/FolderedList.svelte',
            type: 'insert',
            where: 'after',
            anchor: `        itemMenu,
        actions,
`,
            content: `        folderIcon,
        folderMenuItems,
`,
            requires: ['persona-organizer:foldered-list-props:1.16'],
        },
        {
            id: 'persona-organizer:foldered-list-folder-icon:1.16',
            file: 'src/lib/UI/FolderedList.svelte',
            type: 'replace',
            anchor: `                        <FolderIcon size={16} class="shrink-0 text-textcolor2"/>
                        <span class="truncate grow">{folder.name}</span>
`,
            managed: `                        {#if folderIcon}{@render folderIcon(folder)}{:else}<FolderIcon size={16} class="shrink-0 text-textcolor2"/>{/if}
                        <span class="truncate grow">{folder.name}</span>
`,
            requires: ['persona-organizer:foldered-list-prop-values:1.16'],
        },
        {
            id: 'persona-organizer:foldered-list-folder-menu:1.16',
            file: 'src/lib/UI/FolderedList.svelte',
            type: 'insert',
            where: 'before',
            anchor: '            <ShDropdownMenuItem onSelect={() => renameFolder(folder)}><span>{language.renameFolder}</span></ShDropdownMenuItem>\n',
            managed: '            {@render folderMenuItems?.(folder)}\n',
            requires: ['persona-organizer:foldered-list-prop-values:1.16'],
        },
        // Native Settings → Persona: per-persona gallery, folder image, and
        // create or import into a chosen folder.
        {
            id: 'persona-organizer:settings-imports:1.16',
            file: 'src/lib/Setting/Pages/PersonaSettings.svelte',
            type: 'insert',
            where: 'after',
            anchor: '    import { v4 } from "uuid"\n',
            content: `    import { FolderIcon, ImageIcon, XIcon } from "@lucide/svelte";
    import ShDropdownMenuItem from "src/lib/UI/GUI/ShDropdownMenuItem.svelte";
    import ShDropdownMenuSeparator from "src/lib/UI/GUI/ShDropdownMenuSeparator.svelte";
    import { resolvePersonaFolderId } from "src/ts/personaOrganizer";
    import {
        addPersonaImages,
        getPersonaImageGallery,
        removePersonaImage,
        selectPersonaImage,
    } from "src/ts/personaImages";
    import { saveImage, type PromptPresetFolder, type RisuPersona } from "src/ts/storage/database.svelte";
    import { selectMultipleFile, selectSingleFile } from "src/ts/util";
`,
            requires: [
                'persona-organizer:logic',
                'persona-organizer:image-gallery-logic',
                'persona-organizer:folder-model:1.16',
            ],
        },
        {
            id: 'persona-organizer:settings-actions:1.16',
            file: 'src/lib/Setting/Pages/PersonaSettings.svelte',
            type: 'insert',
            where: 'before',
            anchor: '    function duplicatePersona(index: number) {\n',
            content: `    const personaImageExtensions = ["png", "webp", "gif", "jpg", "jpeg"]
    let addingPersonaImages = $state(false)

    /** Creates a persona inside a still-existing folder (unfiled otherwise). */
    function createPersonaInFolder(folderId: string) {
        saveUserPersona()
        DBState.db.personas = [...DBState.db.personas, {
            id: v4(),
            name: 'New Persona',
            icon: '',
            personaPrompt: '',
            note: '',
            folderId: resolvePersonaFolderId(DBState.db.personaFolders ?? [], folderId),
        }]
        changeUserPersona(DBState.db.personas.length - 1, 'noSave')
        expanded = true
        void requestImmediateSave()
    }

    /** Imports a persona PNG into a still-existing folder (unfiled otherwise). */
    async function importPersonaIntoFolder(folderId: string) {
        saveUserPersona()
        const importedIndex = await importUserPersona(folderId)
        if (typeof importedIndex === 'number') changeUserPersona(importedIndex, 'noSave')
        void requestImmediateSave()
    }

    async function chooseFolderImage(folderId: string) {
        const selected = await selectSingleFile(personaImageExtensions)
        if (!selected) return
        const icon = await saveImage(selected.data, '', selected.name)
        DBState.db.personaFolders = (DBState.db.personaFolders ?? []).map((folder) =>
            folder.id === folderId ? { ...folder, icon } : folder
        )
        void requestImmediateSave()
    }

    /** Returns the folder to the default icon; the shared asset is not deleted. */
    function resetFolderImage(folderId: string) {
        DBState.db.personaFolders = (DBState.db.personaFolders ?? []).map((folder) =>
            folder.id === folderId ? { ...folder, icon: '' } : folder
        )
        void requestImmediateSave()
    }

    /** Changes one persona's gallery and keeps the editor's active image in step. */
    function updatePersonaGallery(personaId: string, change: (persona: RisuPersona) => void) {
        saveUserPersona()
        const index = DBState.db.personas.findIndex((persona) => persona.id === personaId)
        if (index < 0) return
        const persona = DBState.db.personas[index]
        change(persona)
        if (index === DBState.db.selectedPersona) DBState.db.userIcon = persona.icon
        void requestImmediateSave()
    }

    async function addGalleryImages(index: number) {
        const persona = DBState.db.personas[index]
        if (!persona || addingPersonaImages) return
        const personaId = ensureId(persona)
        // The native picker never settles when the chooser is cancelled, so
        // the busy flag is set only after files were chosen.
        const files = await selectMultipleFile(personaImageExtensions)
        if (!files?.length) return
        addingPersonaImages = true
        try {
            const paths: string[] = []
            for (const file of files) paths.push(await saveImage(file.data, '', file.name))
            if (paths.length > 0) updatePersonaGallery(personaId, (target) => { addPersonaImages(target, paths) })
        } finally {
            addingPersonaImages = false
        }
    }

    function usePersonaImage(index: number, image: string) {
        const persona = DBState.db.personas[index]
        if (!persona) return
        updatePersonaGallery(ensureId(persona), (target) => { selectPersonaImage(target, image) })
    }

    /** Removes the image from this persona only; the shared asset is not deleted. */
    function removeGalleryImage(index: number, image: string) {
        const persona = DBState.db.personas[index]
        if (!persona) return
        updatePersonaGallery(ensureId(persona), (target) => { removePersonaImage(target, image) })
    }

`,
            requires: [
                'persona-organizer:settings-imports:1.16',
                'persona-organizer:import-folder-preservation',
            ],
        },
        {
            id: 'persona-organizer:settings-folder-snippets:1.16',
            file: 'src/lib/Setting/Pages/PersonaSettings.svelte',
            type: 'insert',
            where: 'after',
            anchor: `        {#snippet actions()}
            <ShButton size="sm" onclick={createPersona}><PlusIcon />{language.createfromScratch}</ShButton>
            <ShButton size="sm" variant="outline" onclick={importPersona}><HardDriveUploadIcon />{language.import}</ShButton>
        {/snippet}
`,
            managed: `        <!-- POCKETRISU-PATCH:persona-organizer:folder-snippets -->
        {#snippet folderIcon(folder: PromptPresetFolder)}
            {#if personaSelectMode}
                <input type="checkbox" class="no-sort shrink-0 h-4 w-4 accent-[var(--risu-theme-primary)]"
                    aria-label={\`\${folder.name} 폴더와 안의 페르소나 선택\`}
                    checked={deleteFolderIds.includes(folder.id)}
                    onclick={(e) => { e.stopPropagation(); toggleFolderForDeletion(folder.id) }}
                    onkeydown={(e) => e.stopPropagation()} />
            {/if}
            {#if folder.icon}
                {#await getCharImage(folder.icon, 'css')}
                    <FolderIcon size={16} class="shrink-0 text-textcolor2"/>
                {:then im}
                    <div class="h-6 w-6 shrink-0 overflow-hidden rounded bg-cover bg-center" style={im}></div>
                {/await}
            {:else}
                <FolderIcon size={16} class="shrink-0 text-textcolor2"/>
            {/if}
        {/snippet}
        {#snippet folderMenuItems(folder: PromptPresetFolder)}
            <ShDropdownMenuItem onSelect={() => createPersonaInFolder(folder.id)}><PlusIcon /><span>{language.createfromScratch}</span></ShDropdownMenuItem>
            <ShDropdownMenuItem onSelect={() => importPersonaIntoFolder(folder.id)}><HardDriveUploadIcon /><span>{language.import}</span></ShDropdownMenuItem>
            <ShDropdownMenuItem onSelect={() => chooseFolderImage(folder.id)}><ImageIcon /><span>폴더 이미지 선택</span></ShDropdownMenuItem>
            {#if folder.icon}
                <ShDropdownMenuItem onSelect={() => resetFolderImage(folder.id)}><FolderIcon /><span>기본 폴더 아이콘 사용</span></ShDropdownMenuItem>
            {/if}
            <ShDropdownMenuSeparator />
        {/snippet}
`,
            requires: [
                'persona-organizer:settings-actions:1.16',
                'persona-organizer:settings-bulk-delete-actions:1.16',
                'persona-organizer:foldered-list-folder-icon:1.16',
                'persona-organizer:foldered-list-folder-menu:1.16',
            ],
        },
        {
            id: 'persona-organizer:settings-gallery:1.16',
            file: 'src/lib/Setting/Pages/PersonaSettings.svelte',
            type: 'insert',
            where: 'after',
            anchor: '                <div class="flex grow flex-col min-w-0 basis-64 gap-4">\n',
            managed: `                    <!-- POCKETRISU-PATCH:persona-organizer:gallery -->
                    <div class="flex flex-col gap-1">
                        <span class="text-sm text-textcolor">페르소나 이미지</span>
                        <div class="flex flex-wrap gap-2">
                            {#each getPersonaImageGallery(persona) as image (image)}
                                <div class="relative h-14 w-14 shrink-0">
                                    <button type="button"
                                        class="h-14 w-14 overflow-hidden rounded-md border-2 bg-textcolor2 {persona.icon === image ? 'border-primary' : 'border-transparent'}"
                                        aria-pressed={persona.icon === image}
                                        aria-label="이 이미지 사용"
                                        onclick={() => usePersonaImage(index, image)}>
                                        {#await getCharImage(image, 'css') then im}
                                            <div class="h-full w-full bg-cover bg-center" style={im}></div>
                                        {/await}
                                    </button>
                                    <button type="button"
                                        class="absolute -top-1 -right-1 rounded-full bg-darkbg p-0.5 text-textcolor2 hover:text-red-500"
                                        aria-label="이 페르소나에서 이미지 빼기"
                                        onclick={() => removeGalleryImage(index, image)}>
                                        <XIcon size={12}/>
                                    </button>
                                </div>
                            {/each}
                            <button type="button"
                                class="h-14 w-14 shrink-0 flex items-center justify-center rounded-md border border-dashed border-darkborderc text-textcolor2 hover:text-primary"
                                aria-label={addingPersonaImages ? "추가 중..." : "이미지 추가"}
                                disabled={addingPersonaImages}
                                onclick={() => addGalleryImages(index)}>
                                <PlusIcon size={18}/>
                            </button>
                        </div>
                    </div>
`,
            requires: ['persona-organizer:settings-actions:1.16'],
        },
        // Native Settings → Persona: multiple delete (personas and folders,
        // one confirmation) and the export image choice. Native single delete,
        // duplicate and export stay.
        {
            id: 'persona-organizer:settings-bulk-export-imports:1.16',
            file: 'src/lib/Setting/Pages/PersonaSettings.svelte',
            type: 'insert',
            where: 'after',
            anchor: '    import { requestImmediateSave } from "src/ts/globalApi.svelte";\n',
            content: `    import { TrashIcon } from "@lucide/svelte";
    import ShDialog from "src/lib/UI/GUI/ShDialog.svelte";
    import ShToggle from "src/lib/UI/GUI/ShToggle.svelte";
    import {
        applyPersonaDeletion,
        buildPersonaDeletionPlan,
        selectedPersonaAfterDeletion,
    } from "src/ts/personaOrganizer";
`,
            requires: [
                'persona-organizer:logic',
                'persona-organizer:settings-imports:1.16',
            ],
        },
        {
            id: 'persona-organizer:settings-bulk-delete-actions:1.16',
            file: 'src/lib/Setting/Pages/PersonaSettings.svelte',
            type: 'insert',
            where: 'before',
            anchor: '    onDestroy(() => {\n',
            content: `    // Multiple delete: personas and folders are selected (a folder includes
    // its personas) and removed after one confirmation. At least one
    // persona always remains.
    let personaSelectMode = $state(false)
    let deletePersonaIds = $state<string[]>([])
    let deleteFolderIds = $state<string[]>([])
    const deletionPlan = $derived(buildPersonaDeletionPlan(
        DBState.db.personas,
        DBState.db.personaFolders ?? [],
        deletePersonaIds,
        deleteFolderIds,
    ))
    const deletionCount = $derived(deletionPlan.personaIds.length + deletionPlan.folderIds.length)

    function setPersonaSelectMode(on: boolean) {
        if (on) {
            saveUserPersona()
            expanded = false
            // Deletion matches personas by id, including ones moved into a
            // selected folder later, so every persona gets one now.
            for (const persona of DBState.db.personas) ensureId(persona)
        }
        personaSelectMode = on
        deletePersonaIds = []
        deleteFolderIds = []
    }

    function isPersonaMarkedForDeletion(index: number) {
        const persona = DBState.db.personas[index]
        if (!persona) return false
        return (!!persona.id && deletePersonaIds.includes(persona.id))
            || (!!persona.folderId && deleteFolderIds.includes(persona.folderId))
    }

    function togglePersonaForDeletion(index: number) {
        const persona = DBState.db.personas[index]
        if (!persona) return
        // A persona inside a selected folder is already included; its row stays as is.
        if (persona.folderId && deleteFolderIds.includes(persona.folderId)) return
        const id = ensureId(persona)
        deletePersonaIds = deletePersonaIds.includes(id)
            ? deletePersonaIds.filter((value) => value !== id)
            : [...deletePersonaIds, id]
    }

    function toggleFolderForDeletion(folderId: string) {
        if (deleteFolderIds.includes(folderId)) {
            deleteFolderIds = deleteFolderIds.filter((value) => value !== folderId)
            return
        }
        // Members are matched by id, so every member needs one.
        for (const persona of DBState.db.personas) {
            if (persona.folderId === folderId) ensureId(persona)
        }
        deleteFolderIds = [...deleteFolderIds, folderId]
    }

    async function deleteSelectedPersonas() {
        if (deletionCount === 0 || deletionPlan.remainingCount < 1) return
        const names = [
            ...deletionPlan.folders.map((entry) => \`\${entry.folder.name} (폴더, 페르소나 \${entry.personas.length}개)\`),
            ...deletionPlan.loosePersonas.map((persona) => persona.name),
        ]
        if (!await alertConfirm(\`\${language.removeConfirm}\${names.join(', ')}\`)) return
        saveUserPersona()
        const before = DBState.db.personas
        const folders = DBState.db.personaFolders ?? []
        for (const persona of before) {
            if (persona.folderId && deleteFolderIds.includes(persona.folderId)) ensureId(persona)
        }
        // Planned again: the list may have changed while the dialog was open.
        const plan = buildPersonaDeletionPlan(before, folders, deletePersonaIds, deleteFolderIds)
        if (plan.personaIds.length + plan.folderIds.length === 0 || plan.remainingCount < 1) return
        const result = applyPersonaDeletion(before, folders, plan)
        // Duplicate ids (plugin or hand-edited data) could empty the list.
        if (result.personas.length < 1) return
        const nextSelected = selectedPersonaAfterDeletion(before, DBState.db.selectedPersona, result.personas)
        DBState.db.personas = result.personas
        DBState.db.personaFolders = result.folders
        changeUserPersona(nextSelected, 'noSave')
        setPersonaSelectMode(false)
        void requestImmediateSave()
    }

    // Export image choice, offered when the persona has two or more images.
    let exportImageDialogOpen = $state(false)
    let exportImagePersonaId = $state('')
    let exportImageChoice = $state('')
    let exportingPersonaImage = $state(false)
    const exportImageOptions = $derived.by(() => {
        const persona = DBState.db.personas.find((candidate) => candidate.id === exportImagePersonaId)
        return persona ? getPersonaImageGallery(persona) : []
    })

    async function exportPersonaWithImage() {
        if (exportingPersonaImage) return
        const index = DBState.db.personas.findIndex((persona) => persona.id === exportImagePersonaId)
        if (index < 0) {
            exportImageDialogOpen = false
            return
        }
        exportingPersonaImage = true
        try {
            await exportUserPersona(index, exportImageChoice)
            exportImageDialogOpen = false
        } finally {
            exportingPersonaImage = false
        }
    }

`,
            requires: [
                'persona-organizer:settings-bulk-export-imports:1.16',
                'persona-organizer:export-image-parameter:1.16',
            ],
        },
        {
            id: 'persona-organizer:settings-export-choice:1.16',
            file: 'src/lib/Setting/Pages/PersonaSettings.svelte',
            type: 'replace',
            anchor: `    async function exportPersona(index: number) {
        saveUserPersona()
        await exportUserPersona(index)
    }
`,
            content: `    async function exportPersona(index: number) {
        saveUserPersona()
        const persona = DBState.db.personas[index]
        const images = persona ? getPersonaImageGallery(persona) : []
        if (persona && images.length >= 2) {
            exportImagePersonaId = ensureId(persona)
            exportImageChoice = images.includes(persona.icon) ? persona.icon : images[0]
            exportImageDialogOpen = true
            return
        }
        await exportUserPersona(index)
    }
`,
            requires: ['persona-organizer:settings-bulk-delete-actions:1.16'],
        },
        {
            id: 'persona-organizer:settings-bulk-delete-toolbar:1.16',
            file: 'src/lib/Setting/Pages/PersonaSettings.svelte',
            type: 'insert',
            where: 'before',
            anchor: '    <FolderedList\n',
            managed: `    <!-- POCKETRISU-PATCH:persona-organizer:bulk-delete -->
    <div class="mb-2 flex flex-wrap items-center gap-2">
        <ShToggle size="sm" bind:pressed={personaSelectMode} onPressedChange={(on) => setPersonaSelectMode(on)}>{language.select}</ShToggle>
        {#if personaSelectMode}
            <span class="text-sm font-medium text-textcolor">{language.selectionCount(deletionCount)}</span>
            {#if deletionCount > 0 && deletionPlan.remainingCount < 1}
                <span class="text-xs text-red-500">페르소나는 하나 이상 남아야 합니다</span>
            {/if}
            <div class="grow"></div>
            <ShButton size="sm" variant="destructive" disabled={deletionCount === 0 || deletionPlan.remainingCount < 1} onclick={deleteSelectedPersonas}><TrashIcon />{language.remove}</ShButton>
            <ShButton size="sm" variant="outline" onclick={() => setPersonaSelectMode(false)}>{language.cancel}</ShButton>
        {/if}
    </div>
`,
            requires: ['persona-organizer:settings-bulk-delete-actions:1.16'],
        },
        {
            id: 'persona-organizer:settings-bulk-delete-row-select:1.16',
            file: 'src/lib/Setting/Pages/PersonaSettings.svelte',
            type: 'replace',
            anchor: '        onSelect={toggleRow}\n',
            managed: '        onSelect={(index) => personaSelectMode ? togglePersonaForDeletion(index) : toggleRow(index)}\n',
            requires: ['persona-organizer:settings-bulk-delete-actions:1.16'],
        },
        {
            id: 'persona-organizer:settings-bulk-delete-row-check:1.16',
            file: 'src/lib/Setting/Pages/PersonaSettings.svelte',
            type: 'insert',
            where: 'after',
            anchor: `        {#snippet itemContent(index)}
            {@const persona = DBState.db.personas[index]}
`,
            managed: `            {#if personaSelectMode}
                <!-- POCKETRISU-PATCH:persona-organizer:bulk-delete-row -->
                <input type="checkbox" class="no-sort shrink-0 h-4 w-4 accent-[var(--risu-theme-primary)]"
                    aria-label={\`\${persona.name} 선택\`}
                    checked={isPersonaMarkedForDeletion(index)}
                    disabled={!!persona.folderId && deleteFolderIds.includes(persona.folderId)}
                    tabindex="-1"
                    onclick={(e) => { e.stopPropagation(); togglePersonaForDeletion(index) }} />
            {/if}
`,
            requires: ['persona-organizer:settings-bulk-delete-actions:1.16'],
        },
        {
            id: 'persona-organizer:settings-export-dialog:1.16',
            file: 'src/lib/Setting/Pages/PersonaSettings.svelte',
            type: 'insert',
            where: 'after',
            anchor: '</SettingPage>\n',
            managed: `
<!-- POCKETRISU-PATCH:persona-organizer:export-image -->
<ShDialog
    bind:open={exportImageDialogOpen}
    size="sm"
    tier="alert"
    closable={!exportingPersonaImage}
    closeOnEscape={!exportingPersonaImage}
    closeOnOutsideClick={!exportingPersonaImage}
>
    {#snippet title()}엑스포트 이미지 선택{/snippet}
    {#snippet description()}페르소나 PNG에 넣을 이미지를 고릅니다. 사용 중인 이미지는 바뀌지 않습니다.{/snippet}
    {#snippet children()}
        <div class="flex flex-wrap gap-2">
            {#each exportImageOptions as image, imageIndex (image)}
                <button type="button"
                    class="h-16 w-16 overflow-hidden rounded-md border-2 bg-textcolor2 {exportImageChoice === image ? 'border-primary' : 'border-transparent'}"
                    aria-pressed={exportImageChoice === image}
                    aria-label={\`페르소나 이미지 \${imageIndex + 1}로 엑스포트\`}
                    onclick={() => exportImageChoice = image}>
                    {#await getCharImage(image, 'css') then im}
                        <div class="h-full w-full bg-cover bg-center" style={im}></div>
                    {/await}
                </button>
            {/each}
        </div>
    {/snippet}
    {#snippet footer()}
        <ShButton variant="outline" disabled={exportingPersonaImage} onclick={() => exportImageDialogOpen = false}>{language.cancel}</ShButton>
        <ShButton disabled={exportingPersonaImage} onclick={exportPersonaWithImage}>{exportingPersonaImage ? "엑스포트 중..." : language.export}</ShButton>
    {/snippet}
</ShDialog>
`,
            requires: ['persona-organizer:settings-bulk-delete-actions:1.16'],
        },
        {
            id: 'persona-organizer:bulk-export-tests:1.16',
            file: 'src/ts/personaBulkExport.e2-4.test.ts',
            type: 'owned',
            content: owned116('src/ts/personaBulkExport.e2-4.test.ts'),
            requires: [
                'persona-organizer:logic',
                'persona-organizer:export-selected-image:1.16',
            ],
        },
    ],
}
