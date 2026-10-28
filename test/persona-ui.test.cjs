'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const logicSource = fs.readFileSync(path.join(
    __dirname,
    '../patches/persona-organizer/files/src/ts/personaOrganizer.ts',
), 'utf8')
const galleryLogic = fs.readFileSync(path.join(
    __dirname,
    '../patches/persona-organizer/files/src/ts/personaImages.ts',
), 'utf8')
const manifest = require('../patches/persona-organizer/manifest.cjs')

function unit(id) {
    const found = manifest.units.find((candidate) => candidate.id === id)
    assert.ok(found, id)
    return found
}

function text(id) {
    const found = unit(id)
    return found.managed ?? found.content
}

test('persona organizer is declared only for PocketRisu 1.16.1', () => {
    assert.equal(manifest.version, '0.11.4')
    assert.deepEqual(manifest.targets, {
        pocketrisu: {
            verified: [],
            reviewing: ['1.16.1'],
        },
    })
    assert.ok(manifest.units.every((entry) => !Object.hasOwn(entry, 'targetVersions')))
})

test('persona folders are the native folders with an optional icon', () => {
    const folderModel = text('persona-organizer:folder-model:1.16')
    assert.match(folderModel, /export interface PromptPresetFolder \{[\s\S]*icon\?: string/)
    assert.match(folderModel, /export type RisuPersonaFolder = PromptPresetFolder/)
    // PocketRisu 1.16.1 declares folderId and personaFolders itself.
    const declared = manifest.units
        .filter((entry) => entry.file === 'src/ts/storage/database.svelte.ts')
        .map((entry) => entry.content ?? '')
        .join('\n')
    assert.doesNotMatch(declared, /folderId\?:string|personaFolders:/)
})

test('the native folder list gains only optional folder icon and folder menu snippets', () => {
    assert.match(text('persona-organizer:foldered-list-props:1.16'), /folderIcon\?: Snippet<\[PromptPresetFolder\]>/)
    assert.match(text('persona-organizer:foldered-list-props:1.16'), /folderMenuItems\?: Snippet<\[PromptPresetFolder\]>/)
    assert.match(
        text('persona-organizer:foldered-list-folder-icon:1.16'),
        /\{#if folderIcon\}\{@render folderIcon\(folder\)\}\{:else\}<FolderIcon size=\{16\} class="shrink-0 text-textcolor2"\/>\{\/if\}/,
    )
    assert.equal(
        text('persona-organizer:foldered-list-folder-menu:1.16'),
        '            {@render folderMenuItems?.(folder)}\n',
    )
})

test('folder images use shared asset storage and can return to the default icon', () => {
    const actions = text('persona-organizer:settings-actions:1.16')
    const snippets = text('persona-organizer:settings-folder-snippets:1.16')
    assert.match(actions, /const personaImageExtensions = \["png", "webp", "gif", "jpg", "jpeg"\]/)
    assert.match(actions, /const icon = await saveImage\(selected\.data, '', selected\.name\)/)
    assert.match(actions, /function resetFolderImage\(folderId: string\) \{[\s\S]*icon: ''/)
    assert.match(snippets, /\{#snippet folderIcon\(folder: PromptPresetFolder\)\}[\s\S]*getCharImage\(folder\.icon, 'css'\)/)
    assert.match(snippets, /chooseFolderImage\(folder\.id\)/)
    assert.match(snippets, /\{#if folder\.icon\}[\s\S]*resetFolderImage\(folder\.id\)/)
    assert.doesNotMatch(`${actions}\n${snippets}`, /deleteAsset|removeAsset|forageStorage\.removeItem/)
})

test('create and import from a folder menu file the persona in that still-valid folder', () => {
    const actions = text('persona-organizer:settings-actions:1.16')
    const snippets = text('persona-organizer:settings-folder-snippets:1.16')
    assert.match(actions, /function createPersonaInFolder\(folderId: string\) \{[\s\S]*folderId: resolvePersonaFolderId\(DBState\.db\.personaFolders \?\? \[\], folderId\)/)
    assert.match(actions, /async function importPersonaIntoFolder\(folderId: string\) \{[\s\S]*await importUserPersona\(folderId\)/)
    assert.match(snippets, /onSelect=\{\(\) => createPersonaInFolder\(folder\.id\)\}/)
    assert.match(snippets, /onSelect=\{\(\) => importPersonaIntoFolder\(folder\.id\)\}/)

    const importUnit = text('persona-organizer:import-folder-preservation')
    assert.match(importUnit, /resolvePersonaFolderId\(db\.personaFolders \?\? \[\], folderId\)/)
    assert.match(importUnit, /const icon = await saveImage\(await reencodeImage\(v\.data\)\)[\s\S]*const db = getDatabase\(\)/)
    assert.match(importUnit, /const importedIndex = db\.personas\.push\([\s\S]*\) - 1/)
    assert.match(importUnit, /return importedIndex/)
    assert.match(importUnit, /if \(!v\) return null/)
    assert.match(importUnit, /catch \(error\)[\s\S]*return null/)
})

test('persona image gallery keeps icon as the selected compatibility image', () => {
    const normalization = text('persona-organizer:image-gallery-normalization:1.16')
    assert.match(normalization, /persona\.imageGallery = gallery/)
    assert.match(normalization, /if \(persona\.icon && !gallery\.includes\(persona\.icon\)\) gallery\.unshift\(persona\.icon\)/)
    assert.match(text('persona-organizer:persona-image-gallery-field'), /imageGallery\?:string\[\]/)
    assert.match(text('persona-organizer:plugin-gallery-type'), /imageGallery\?: string\[\]/)
    assert.match(text('persona-organizer:single-image-gallery-sync'), /normalizePersonaImageGallery/)
    assert.match(galleryLogic, /export function addPersonaImages/)
    assert.match(galleryLogic, /export function selectPersonaImage/)
    assert.match(galleryLogic, /persona\.icon = path/)
    assert.match(galleryLogic, /export function removePersonaImage/)
    assert.match(galleryLogic, /persona\.icon = gallery\[Math\.min\(removedIndex, gallery\.length - 1\)\] \?\? ""/)
})

test('persona image gallery supports multi-add, explicit selection, and non-destructive removal', () => {
    const actions = text('persona-organizer:settings-actions:1.16')
    const gallery = text('persona-organizer:settings-gallery:1.16')
    assert.match(actions, /selectMultipleFile\(personaImageExtensions\)/)
    assert.match(actions, /paths\.push\(await saveImage\(file\.data, '', file\.name\)\)/)
    assert.match(actions, /addPersonaImages\(target, paths\)/)
    assert.match(actions, /selectPersonaImage\(target, image\)/)
    assert.match(actions, /removePersonaImage\(target, image\)/)
    // The editor mirrors the selected persona in db.userIcon.
    assert.match(actions, /saveUserPersona\(\)[\s\S]*if \(index === DBState\.db\.selectedPersona\) DBState\.db\.userIcon = persona\.icon/)
    assert.match(gallery, />페르소나 이미지</)
    assert.match(gallery, /\{#each getPersonaImageGallery\(persona\) as image \(image\)\}/)
    assert.match(gallery, /aria-pressed=\{persona\.icon === image\}/)
    assert.match(gallery, /addingPersonaImages \? "추가 중\.\.\." : "이미지 추가"/)
    assert.doesNotMatch(`${actions}\n${gallery}`, /deleteAsset|removeAsset|forageStorage\.removeItem/)
})

test('persona picker filters by folder scope without renumbering selection', () => {
    assert.match(text('persona-organizer:picker-scope-import:1.16'), /PERSONA_PICKER_SCOPE_UNFILED/)
    const state = text('persona-organizer:picker-scope-state:1.16')
    assert.match(state, /let pickerScope = \$state<string>\(PERSONA_PICKER_SCOPE_ALL\)/)
    assert.match(state, /filterPersonaPicker\(DBState\.db\.personas, DBState\.db\.personaFolders \?\? \[\], '', pickerScope\)/)
    assert.match(state, /\.map\(\(entry\) => entry\.index\)/)
    assert.equal(
        text('persona-organizer:picker-scope-filter:1.16'),
        '            {@const visible = group.indexes.filter((index) => scopedIndexes.has(index) && matches(index))}\n',
    )
    const control = text('persona-organizer:picker-scope-control:1.16')
    assert.match(control, /bind:value=\{pickerScope\}/)
    assert.match(control, /PERSONA_PICKER_SCOPE_UNFILED/)
    assert.match(control, /personaPickerFolderScope\(folder\.id\)/)
    assert.match(logicSource, /return \[\{ persona, index \}\]/)
    assert.match(logicSource, /scope === PERSONA_PICKER_SCOPE_UNFILED/)
    assert.match(logicSource, /!persona\.folderId \|\| !validFolderIds\.has\(persona\.folderId\)/)
})

test('native folder management, duplicate and export stay native', () => {
    const owned = manifest.units
        .filter((entry) => entry.type !== 'owned' || entry.file.endsWith('.ts') && !entry.file.endsWith('.test.ts'))
        .map((entry) => entry.managed ?? entry.content ?? '')
        .join('\n')
    assert.doesNotMatch(owned, /duplicatePersona|clonePersona|copyPersona/)
    assert.doesNotMatch(owned, /personaPickerId|pickerPersonaId/)
    // No unit replaces a whole native page.
    assert.ok(manifest.units.every((entry) => entry.markerNeedle === undefined))
    // Export keeps the native signature and adds only an optional image path.
    assert.equal(
        text('persona-organizer:export-image-parameter:1.16'),
        'export async function exportUserPersona(personaIndex?: number, imagePath?: string) {\n',
    )
    const exportUnits = manifest.units.filter((entry) =>
        entry.file === 'src/ts/persona.ts' && /exportUserPersona|readImage|persona\.icon/.test(entry.anchor ?? ''))
    assert.deepEqual(exportUnits.map((entry) => entry.id), [
        'persona-organizer:export-image-parameter:1.16',
        'persona-organizer:export-image-choice:1.16',
        'persona-organizer:export-selected-image:1.16',
    ])
    // Native single delete stays; the settings page keeps its deletePersona.
    assert.ok(manifest.units.every((entry) => !/async function deletePersona\(/.test(entry.anchor ?? '')))
})

test('export image choice uses only the persona\'s own icon or gallery image', () => {
    const choice = text('persona-organizer:export-image-choice:1.16')
    assert.match(choice, /imagePath === persona\.icon/)
    assert.match(choice, /ownGallery\.includes\(imagePath\)/)
    assert.match(choice, /\) \? imagePath : persona\.icon/)
    assert.match(choice, /if \(!exportImage\) \{/)
    assert.equal(text('persona-organizer:export-selected-image:1.16'), '        img = await readImage(exportImage)\n')
    const settings = text('persona-organizer:settings-export-choice:1.16')
    assert.match(settings, /if \(persona && images\.length >= 2\)/)
    assert.match(settings, /await exportUserPersona\(index\)\n/)
    assert.match(text('persona-organizer:settings-bulk-delete-actions:1.16'), /await exportUserPersona\(index, exportImageChoice\)/)
})

test('multiple delete removes selected personas and folders after one confirmation', () => {
    const actions = text('persona-organizer:settings-bulk-delete-actions:1.16')
    assert.match(actions, /buildPersonaDeletionPlan\(/)
    assert.match(actions, /applyPersonaDeletion\(before, folders, plan\)/)
    assert.match(actions, /selectedPersonaAfterDeletion\(before, DBState\.db\.selectedPersona, result\.personas\)/)
    assert.match(actions, /plan\.remainingCount < 1\) return/)
    assert.equal((actions.match(/alertConfirm\(/g) ?? []).length, 1)
    assert.match(actions, /saveUserPersona\(\)[\s\S]*changeUserPersona\(nextSelected, 'noSave'\)[\s\S]*requestImmediateSave\(\)/)
    assert.match(logicSource, /export function selectedPersonaAfterDeletion\(/)
    assert.match(
        text('persona-organizer:settings-bulk-delete-row-select:1.16'),
        /personaSelectMode \? togglePersonaForDeletion\(index\) : toggleRow\(index\)/,
    )
    assert.match(text('persona-organizer:settings-folder-snippets:1.16'), /toggleFolderForDeletion\(folder\.id\)/)
})

test('persona and folder image references survive cleanup, replacement, and partial backup', () => {
    assert.match(text('persona-organizer:uncleanable-gallery-assets'), /v\.imageGallery/)
    assert.match(text('persona-organizer:uncleanable-folder-assets'), /db\.personaFolders/)
    assert.match(text('persona-organizer:replace-gallery-assets'), /persona\.icon = replaceData\(persona\.icon\)/)
    assert.match(text('persona-organizer:replace-gallery-assets'), /persona\.imageGallery = persona\.imageGallery\.map/)
    assert.match(text('persona-organizer:replace-gallery-assets'), /folder\.icon = replaceData/)
    assert.match(text('persona-organizer:backup-gallery-assets'), /persona\.imageGallery/)
    assert.match(text('persona-organizer:backup-gallery-assets'), /folder\.icon/)
})

test('server orphan walker unions native and organizer persona references', () => {
    const server = text('persona-organizer:server-gallery-assets:1.16')
    assert.match(server, /add\(p\?\.image\)/)
    assert.match(server, /p\?\.imageGallery/)
    assert.match(server, /dbObj\.personaFolders/)
    assert.match(server, /embedded\?\.assets/)
})

test('account import requests persona gallery and folder images', () => {
    assert.match(
        text('persona-organizer:account-import-gallery-assets:1.16'),
        /if \(Array\.isArray\(persona\?\.imageGallery\)\) for \(const image of persona\.imageGallery\) add\(image\)/,
    )
    assert.match(
        text('persona-organizer:account-import-folder-assets:1.16'),
        /for \(const folder of Array\.isArray\(db\?\.personaFolders\) \? db\.personaFolders : \[\]\) add\(folder\?\.icon\)/,
    )
})

test('persona organizer does not replace the database or plugin array', () => {
    const owned = manifest.units
        .flatMap((candidate) => [candidate.content ?? '', candidate.managed ?? ''])
        .join('\n')

    assert.doesNotMatch(owned, /setDatabase(?:Lite)?\(/)
    assert.doesNotMatch(owned, /Database\.plugins|DBState\.db\.plugins/)
})
