'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const patchRoot = path.join(__dirname, '../patches/character-organizer')
const screen = fs.readFileSync(path.join(
    patchRoot,
    'files/src/lib/Others/CharacterOrganizer.svelte',
), 'utf8')
const logic = fs.readFileSync(path.join(
    patchRoot,
    'files/src/ts/characterOrganizer.ts',
), 'utf8')
const state = fs.readFileSync(path.join(
    patchRoot,
    'files/src/ts/characterOrganizerState.svelte.ts',
), 'utf8')
const manifest = require('../patches/character-organizer/manifest.cjs')

test('character organizer is an independent hamburger capability', () => {
    assert.equal(manifest.id, 'character-organizer')
    assert.equal(manifest.userSelectable, true)
    assert.match(state, /additionalHamburgerMenu/)
    assert.match(state, /id: MENU_ID/)
    assert.match(state, /name: "Character organizer"/)
    assert.match(state, /characterOrganizerState\.open = true/)
    assert.doesNotMatch(state, /setDatabase|setDatabaseLite|plugins/)

    const hostUnits = manifest.units.filter((unit) => unit.type !== 'owned')
    assert.deepEqual(
        [...new Set(hostUnits.map((unit) => unit.file))],
        ['src/App.svelte'],
    )
    assert.match(
        hostUnits.find((unit) => unit.id === 'character-organizer:app-screen').managed,
        /<CharacterOrganizer close=\{\(\) => characterOrganizerState\.open = false\} \/>/,
    )
})

test('character organizer is qualified only for reviewed exact PocketRisu targets', () => {
    assert.deepEqual(manifest.targets, {
        pocketrisu: {
            verified: ['1.8.1', '1.9.0'],
            reviewing: ['1.10.0'],
        },
    })
    assert.equal(manifest.targets.pocketrisu.verified.includes('1.9.1'), false)
})

test('character and folder arrangement uses a paginated four-by-four non-drag grid', () => {
    assert.match(screen, /const PAGE_SIZE = 16/)
    assert.match(screen, /displayItems\.slice\(pageIndex \* PAGE_SIZE, \(pageIndex \+ 1\) \* PAGE_SIZE\)/)
    assert.match(screen, /grid-template-columns: repeat\(4,/)
    assert.match(screen, /class="page-track"/)
    assert.match(screen, /translate3d\(-\$\{currentPage \* 100\}%/)
    assert.match(screen, /transition: transform 220ms/)
    assert.match(screen, /moveCharacterRootItem/)
    assert.match(screen, /moveCharacterWithinFolder/)
    assert.match(screen, /class="item-shift item-shift-left"/)
    assert.match(screen, /class="item-shift item-shift-right"/)
    assert.match(screen, />\s*\{arrangeMode \? "Done" : "Arrange"\}\s*</)
    assert.doesNotMatch(screen, /\bdraggable\b|\bondrag\w*\b|\bontouch\w*\b/)
    assert.doesNotMatch(screen, /longPress|Sortable|preventDefault|touch-action/)
})

test('temporary and playground characters never enter the organizer order', () => {
    assert.match(logic, /id !== "§temp" && id !== "§playground"/)
    assert.match(screen, /isOrganizableCharacterId\(item\.chaId\)/)
})

test('all visible and editable order uses one normalized active-character snapshot', () => {
    assert.match(logic, /export function normalizeCharacterOrder/)
    assert.match(logic, /const validIds = new Set\(characterIds\.filter\(isOrganizableCharacterId\)\)/)
    assert.match(logic, /seenCharacters/)
    assert.match(logic, /seenFolders/)
    assert.match(screen, /const viewOrder = \$derived\.by\(\(\) =>\s*normalizeCharacterOrder/)
    assert.match(screen, /function editableOrder\(\): \(string \| folder\)\[\] \{\s*return normalizeCharacterOrder/)
    assert.match(screen, /return viewOrder\.find/)
    assert.doesNotMatch(screen, /DBState\.db\.characterOrder\.find/)
})

test('empty folder creation stays local until the first member commits atomically', () => {
    assert.match(screen, /let draftFolder = \$state<CharacterFolderDraft \| null>\(null\)/)
    assert.match(screen, /draftFolder = \{\s*id,\s*name: name\.trim\(\),\s*color: "default",\s*\}/)
    assert.match(screen, /Draft · not saved/)
    assert.match(screen, /This folder exists only on this screen/)
    assert.match(screen, /commitCharacterFolderDraft\(\s*editableOrder\(\),\s*draftFolder,\s*characterId/)
    assert.match(screen, /function commitOrder\(next: \(string \| folder\)\[\]\): void \{\s*DBState\.db\.characterOrder = next/)
    assert.match(logic, /if \(!draft\.id \|\| !name \|\| !firstCharacterId\) return null/)
    assert.match(logic, /data: \[firstCharacterId\]/)
    assert.doesNotMatch(screen, /characterOrder\.push|checkCharOrder/)
})

test('global name and confirmation alerts stay above the organizer overlay', () => {
    assert.match(screen, /\.organizer-screen \{[\s\S]*z-index: 35;/)
    assert.match(screen, /alertInput/)
    assert.match(screen, /alertConfirm/)
})

test('folder membership keeps characters and confirms any folder disappearance', () => {
    assert.match(screen, /function openMembershipEditor\(\): void/)
    assert.match(screen, /async function toggleFolderMembership\(item: character\)/)
    assert.match(screen, /moveCharacterToFolder/)
    assert.match(screen, /moveCharacterToRoot/)
    assert.match(screen, /target\.data\.length === 1/)
    assert.match(screen, /confirmSourceFolderRemoval/)
    assert.match(screen, /The character will be kept\. Continue\?/)
    assert.match(screen, /Remove folder "\$\{persistedOpenFolder\.name\}"\?/)
    assert.match(screen, /removeCharacterFolder/)
    assert.doesNotMatch(screen, /\bremoveChar\(|trashTime\s*=|removeAsset|deleteAsset/)
})

test('closing or backing out discards an uncommitted draft', () => {
    assert.match(screen, /if \(draftFolder\?\.id === openFolderId\) draftFolder = null/)
    assert.match(screen, /function closeOrganizer\(\): void \{\s*draftFolder = null/)
    assert.match(screen, /title=\{draftFolder \? "Discard draft" : "Remove folder but keep characters"\}/)
})
