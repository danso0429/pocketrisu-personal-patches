'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const source = fs.readFileSync(path.join(
    __dirname,
    '../patches/persona-organizer/files/src/lib/Setting/Pages/PersonaSettings.svelte',
), 'utf8')
const manifest = require('../patches/persona-organizer/manifest.cjs')

test('persona arrange uses explicit one-slot controls and contains no drag surface', () => {
    assert.match(source, /movePersonaWithinGroup/)
    assert.match(source, /function movePersona\(persona: RisuPersona, offset: -1 \| 1\)/)
    assert.match(source, /function moveFolder\(folder: RisuPersonaFolder, offset: -1 \| 1\)/)
    assert.match(source, /class="item-shift item-shift-left"/)
    assert.match(source, /class="item-shift item-shift-right"/)
    assert.match(source, /canMovePersona\(item\.persona, -1\)/)
    assert.match(source, /canMoveFolder\(item\.folder, 1\)/)
    assert.match(source, />\s*\{arrangeMode \? "Done" : "Arrange"\}\s*</)
    assert.doesNotMatch(source, /\bdraggable\b|\bondrag\w*\b|\bontouch\w*\b/)
    assert.doesNotMatch(source, /longPress|Sortable|preventDefault|touch-action/)
})

test('persona folders are explicit same-size cards that open normally', () => {
    assert.match(source, />New folder</)
    assert.match(source, /class="folder-image"/)
    assert.match(source, /\.persona-image,\s*\.folder-image[\s\S]*width: 5rem;[\s\S]*height: 5rem;/)
    assert.match(source, /function enterFolder\(folder: RisuPersonaFolder\)/)
    assert.match(source, /class="folder-toolbar"/)
    assert.match(source, /onclick=\{\(\) => enterFolder\(folder\)\}/)
    assert.doesNotMatch(source, /data-folder-drop|dropAt|dropOnPersona|createFolderWith/)
})

test('folder images use shared asset storage and can return to the default icon', () => {
    const normalization = manifest.units.find(
        (unit) => unit.id === 'persona-organizer:model-normalization',
    )
    const folderInterface = manifest.units.find(
        (unit) => unit.id === 'persona-organizer:folder-interface',
    )

    assert.equal(manifest.version, '0.10.0')
    assert.deepEqual(manifest.targets, {
        pocketrisu: {
            verified: ['1.8.1', '1.9.0'],
            reviewing: [],
        },
    })
    assert.match(normalization.content, /typeof folder\.icon !== 'string'\) folder\.icon = ''/)
    assert.match(folderInterface.content, /icon\?:string/)
    assert.match(source, /import \{ saveImage \} from "src\/ts\/storage\/database\.svelte"/)
    assert.match(source, /selectSingleFile\(\["png", "webp", "gif", "jpg", "jpeg"\]\)/)
    assert.match(source, /folder\.icon = await saveImage\(selected\.data, "", selected\.name\)/)
    assert.match(source, /function resetFolderImage\(folder: RisuPersonaFolder\): void \{[\s\S]*folder\.icon = ""/)
    assert.match(source, /class="toolbar-text-button folder-image-button"[\s\S]*<span>Image<\/span>/)
    assert.match(source, /<ShDialog[\s\S]*bind:open=\{folderImageDialogOpen\}[\s\S]*Folder image[\s\S]*Replace image[\s\S]*Use default folder image/)
    assert.match(source, /\{#if folder\.icon\}[\s\S]*getCharImage\(folder\.icon, "css"\)[\s\S]*folder-image-fill/)
    assert.match(source, /\{#if entry\.folder\.icon\}[\s\S]*getCharImage\(entry\.folder\.icon, "css"\)[\s\S]*delete-folder-image-fill/)
    assert.doesNotMatch(source, /deleteAsset|removeAsset|forageStorage\.removeItem/)
})

test('folder membership uses a stable sixteen-card selection grid', () => {
    assert.match(source, /function openMembershipEditor\(\)/)
    assert.match(source, /membershipPersonaIds = DBState\.db\.personas/)
    assert.match(source, /function toggleFolderMembership\(persona: RisuPersona\)/)
    assert.match(source, /persona\.folderId === openFolderId \? null : openFolderId/)
    assert.match(source, /class="folder-members-button"/)
    assert.match(source, /class="membership-mark"/)
    assert.match(source, /class:persona-member-selected=\{membership && persona\.folderId === openFolderId\}/)
    assert.match(source, /membershipMode \? `Select for \$\{openGroup\.name\}` : openGroup\.name/)
})

test('persona and folder contents use sixteen-card animated pages', () => {
    assert.match(source, /const PAGE_SIZE = 16/)
    assert.match(source, /Math\.ceil\(displayItems\.length \/ PAGE_SIZE\)/)
    assert.match(source, /displayItems\.slice\(pageIndex \* PAGE_SIZE, \(pageIndex \+ 1\) \* PAGE_SIZE\)/)
    assert.match(source, /grid-template-columns: repeat\(4,/)
    assert.match(source, /class="page-track"/)
    assert.match(source, /translate3d\(-\$\{currentPage \* 100\}%/)
    assert.match(source, /transition: transform 220ms/)
    assert.match(source, /pageByContext/)
})

test('folder and persona controls keep their movement domains separate', () => {
    assert.match(source, /movePersonaWithinGroup\([\s\S]*persona\.folderId \?\? null,[\s\S]*offset/)
    assert.match(source, /const folders = \[\.\.\.DBState\.db\.personaFolders\]/)
    assert.match(source, /folders\.splice\(to, 0, \.\.\.folders\.splice\(from, 1\)\)/)
    assert.match(source, /if \(item\.kind === "persona"\) movePersona\(item\.persona, -1\)[\s\S]*else moveFolder\(item\.folder, -1\)/)
    assert.match(source, /if \(item\.kind === "persona"\) movePersona\(item\.persona, 1\)[\s\S]*else moveFolder\(item\.folder, 1\)/)
})

test('arrange remains active when a folder is opened so its contents can be shifted', () => {
    assert.match(source, /function enterFolder\(folder: RisuPersonaFolder\): void \{[\s\S]*openFolderId = folder\.id[\s\S]*membershipMode = false/)
    assert.doesNotMatch(
        source.match(/function enterFolder\(folder: RisuPersonaFolder\): void \{[\s\S]*?\n    \}/)?.[0] ?? '',
        /arrangeMode = false/,
    )
    assert.match(source, /\{#if arrangeMode && !membershipMode\}/)
    assert.match(source, /activeItems = \$derived\(openGroup \? folderItems : rootItems\)/)
})

test('bulk delete stays selection-only until a grouped confirmation is accepted', () => {
    assert.match(source, /let deleteMode = \$state\(false\)/)
    assert.match(source, /function startDeleteMode\(\): void \{[\s\S]*deleteMode = true/)
    assert.match(source, /function cancelDeleteMode\(\): void \{[\s\S]*deletePersonaIds = \[\][\s\S]*deleteFolderIds = \[\][\s\S]*deleteMode = false/)
    assert.match(source, /function requestDeleteConfirmation\(\): void \{[\s\S]*deleteConfirmOpen = true/)
    assert.match(source, /function confirmDeleteSelection\(\): void \{[\s\S]*applyPersonaDeletion\([\s\S]*commitPersonas\(next\.personas, keepSelectedId\)/)
    assert.match(source, /deletionPlan\.remainingCount >= 1/)
    assert.match(source, /<ShAlertDialog[\s\S]*Delete selected personas\?[\s\S]*deletionPlan\.loosePersonas[\s\S]*deletionPlan\.folders/)
    assert.match(source, /Alias: \{persona\.note\?\.trim\(\) \|\| "—"\}/)
    assert.match(source, /Folder and \{entry\.personas\.length\} persona/)
})

test('folder delete mode cannot navigate out before done or cancel', () => {
    assert.match(source, /function leaveFolder\(\): void \{\s*if \(deleteMode\) return/)
    assert.match(source, /title=\{deleteMode \? "Finish or cancel deletion first" : "Back to personas"\}/)
    assert.match(source, /disabled=\{deleteMode\}[\s\S]*onclick=\{leaveFolder\}/)
    assert.match(source, /function toggleDeleteFolder\(folder: RisuPersonaFolder\): void \{\s*if \(!deleteMode \|\| openFolderId\) return/)
    assert.match(source, /\{:else if deleteMode\}[\s\S]*Cancel[\s\S]*Done \(\{deletionSelectionCount\}\)/)
})

test('the persona plus menu is local, closable, and preserves create and import actions', () => {
    assert.match(source, /let addPersonaDialogOpen = \$state\(false\)/)
    assert.match(source, /<BaseRoundedButton onClick=\{\(\) => addPersonaDialogOpen = true\}>/)
    assert.match(source, /<ShDialog[\s\S]*bind:open=\{addPersonaDialogOpen\}[\s\S]*closable=\{true\}[\s\S]*Close[\s\S]*<\/ShDialog>/)
    assert.match(source, /function createPersona\(\): void \{[\s\S]*name: "New Persona"/)
    assert.match(source, /async function importPersonaFromDialog\(\): Promise<void> \{[\s\S]*await importUserPersona\(\)/)
    assert.doesNotMatch(source, /alertSelect/)
})

test('persona organizer targets the settings editor and leaves the selection popup original', () => {
    const replacementUnits = manifest.units.filter(
        (unit) => unit.type === 'replace' && unit.file.endsWith('.svelte'),
    )
    assert.deepEqual(
        replacementUnits.map((unit) => unit.file),
        ['src/lib/Setting/Pages/PersonaSettings.svelte'],
    )
    assert.doesNotMatch(
        replacementUnits.map((unit) => unit.file).join('\n'),
        /listedPersona\.svelte/,
    )
})

test('existing persona editor behavior remains available', () => {
    assert.match(source, /<SettingPage title=\{language\.persona\}>/)
    assert.match(source, /<Help key="personaName" \/>/)
    assert.match(source, /<Help key="personaNote" \/>/)
    assert.match(source, /<Help key="personaDescription" \/>/)
    assert.match(source, /bind:value=\{DBState\.db\.username\}/)
    assert.match(source, /bind:value=\{DBState\.db\.userNote\}/)
    assert.match(source, /bind:value=\{DBState\.db\.personaPrompt\}/)
    assert.match(source, /language\.createfromScratch/)
    assert.match(source, /language\.importCharacter/)
    assert.match(source, /exportUserPersona/)
    assert.match(source, /importUserPersona/)
})

test('persona image gallery keeps icon as the selected compatibility image', () => {
    const galleryLogic = fs.readFileSync(path.join(
        __dirname,
        '../patches/persona-organizer/files/src/ts/personaImages.ts',
    ), 'utf8')
    const normalization = manifest.units.find(
        (unit) => unit.id === 'persona-organizer:image-gallery-normalization',
    )
    const modelField = manifest.units.find(
        (unit) => unit.id === 'persona-organizer:persona-image-gallery-field',
    )
    const pluginField = manifest.units.find(
        (unit) => unit.id === 'persona-organizer:plugin-gallery-type',
    )
    const singleImageSync = manifest.units.find(
        (unit) => unit.id === 'persona-organizer:single-image-gallery-sync',
    )

    assert.match(normalization.content, /persona\.imageGallery = gallery/)
    assert.match(normalization.content, /if \(persona\.icon && !gallery\.includes\(persona\.icon\)\) gallery\.unshift\(persona\.icon\)/)
    assert.match(modelField.content, /imageGallery\?:string\[\]/)
    assert.match(pluginField.content, /imageGallery\?: string\[\]/)
    assert.match(singleImageSync.content, /normalizePersonaImageGallery/)
    assert.match(galleryLogic, /export function addPersonaImages/)
    assert.match(galleryLogic, /export function selectPersonaImage/)
    assert.match(galleryLogic, /persona\.icon = path/)
    assert.match(galleryLogic, /export function removePersonaImage/)
    assert.match(galleryLogic, /persona\.icon = gallery\[Math\.min\(removedIndex, gallery\.length - 1\)\] \?\? ""/)
})

test('persona image gallery supports multi-add, explicit selection, and non-destructive removal', () => {
    assert.match(source, /selectMultipleFile\(\["png", "webp", "gif", "jpg", "jpeg"\]\)/)
    assert.match(source, /paths\.push\(await saveImage\(file\.data, "", file\.name\)\)/)
    assert.match(source, /addPersonaImagePaths\(persona, paths\)/)
    assert.match(source, /selectPersonaImage\(persona, path\)/)
    assert.match(source, /removePersonaImagePath\(persona, path\)/)
    assert.match(source, />Persona images</)
    assert.match(source, /\{addingPersonaImages \? "Adding\.\.\." : "Add images"\}/)
    assert.match(source, /class:persona-gallery-active=\{editorPersona\?\.icon === image\}/)
    assert.match(source, /aria-pressed=\{editorPersona\?\.icon === image\}/)
    assert.match(source, />Active</)
    assert.doesNotMatch(source, /deleteAsset|removeAsset|forageStorage\.removeItem/)
})

test('persona image gallery replaces the duplicate large active-image preview', () => {
    const galleryIndex = source.indexOf('<div class="persona-image-gallery">')
    const fieldsIndex = source.indexOf('<div class="persona-editor-fields">')

    assert.match(source, /class="persona-editor-panel"/)
    assert.ok(galleryIndex >= 0)
    assert.ok(fieldsIndex > galleryIndex)
    assert.doesNotMatch(source, /Active image/)
    assert.doesNotMatch(source, /selectUserImg/)
    assert.match(source, /class:persona-gallery-active=\{editorPersona\?\.icon === image\}/)
    assert.match(source, />Active</)
})

test('persona PNG export chooses a gallery image without changing the active image', () => {
    const unit = (id) => manifest.units.find((candidate) => candidate.id === id)

    assert.match(
        unit('persona-organizer:export-image-parameter').content,
        /exportUserPersona\(imagePath\?: string\)/,
    )
    assert.match(
        unit('persona-organizer:export-image-parameter').content,
        /const exportImage = imagePath \?\? db\.userIcon/,
    )
    assert.match(unit('persona-organizer:export-image-fallback').content, /if \(!exportImage\)/)
    assert.match(
        unit('persona-organizer:export-selected-image').content,
        /readImage\(exportImage\)/,
    )
    assert.match(source, /<Button onclick=\{openPersonaExportDialog\}>\{language\.export\}<\/Button>/)
    assert.match(source, /\{#snippet title\(\)\}Select export image\{\/snippet\}/)
    assert.match(source, /This does not change the active image/)
    assert.match(source, /aria-pressed=\{exportPersonaImage === image\}/)
    assert.match(source, /await exportUserPersona\(exportPersonaImage \?\? ""\)/)
    assert.match(source, /"Export selected image"/)
    assert.doesNotMatch(
        source,
        /function exportSelectedPersona[\s\S]*selectPersonaImage\(/,
    )
})

test('persona and folder image references survive cleanup, replacement, and partial backup', () => {
    const unit = (id) => manifest.units.find((candidate) => candidate.id === id)
    const server181 = unit('persona-organizer:server-gallery-assets')
    const server190 = unit('persona-organizer:server-gallery-assets-1.9')

    assert.match(unit('persona-organizer:uncleanable-gallery-assets').content, /v\.imageGallery/)
    assert.match(unit('persona-organizer:uncleanable-folder-assets').content, /db\.personaFolders/)
    assert.match(unit('persona-organizer:replace-gallery-assets').content, /persona\.icon = replaceData\(persona\.icon\)/)
    assert.match(unit('persona-organizer:replace-gallery-assets').content, /persona\.imageGallery = persona\.imageGallery\.map/)
    assert.match(unit('persona-organizer:replace-gallery-assets').content, /folder\.icon = replaceData/)
    assert.match(server181.content, /persona\?\.imageGallery/)
    assert.match(server181.content, /dbObj\.personaFolders/)
    assert.deepEqual(server181.targetVersions, { pocketrisu: ['1.8.1'] })
    assert.match(server190.content, /p\?\.imageGallery/)
    assert.match(server190.content, /dbObj\.personaFolders/)
    assert.match(server190.content, /p\?\.embeddedModule/)
    assert.match(server190.content, /includeModuleAssets/)
    assert.deepEqual(server190.targetVersions, { pocketrisu: ['1.9.0'] })
    assert.match(unit('persona-organizer:backup-gallery-assets').content, /persona\.imageGallery/)
    assert.match(unit('persona-organizer:backup-gallery-assets').content, /folder\.icon/)
})

test('persona organizer does not replace the database or plugin array', () => {
    const owned = [
        source,
        ...manifest.units.flatMap((candidate) => [
            candidate.content ?? '',
            candidate.managed ?? '',
        ]),
    ].join('\n')

    assert.doesNotMatch(owned, /setDatabase(?:Lite)?\(/)
    assert.doesNotMatch(owned, /Database\.plugins|DBState\.db\.plugins/)
})
