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

test('persona organizer targets the settings editor and leaves the selection popup original', () => {
    const replacementUnits = manifest.units.filter((unit) => unit.type === 'replace')
    assert.deepEqual(
        replacementUnits.map((unit) => unit.file),
        ['src/lib/Setting/Pages/PersonaSettings.svelte'],
    )
    assert.doesNotMatch(
        replacementUnits.map((unit) => unit.file).join('\n'),
        /listedPersona\.svelte/,
    )
})

test('existing persona editor and plus-menu behavior remain available', () => {
    assert.match(source, /<SettingPage title=\{language\.persona\}>/)
    assert.match(source, /<Help key="personaName" \/>/)
    assert.match(source, /<Help key="personaNote" \/>/)
    assert.match(source, /<Help key="personaDescription" \/>/)
    assert.match(source, /bind:value=\{DBState\.db\.username\}/)
    assert.match(source, /bind:value=\{DBState\.db\.userNote\}/)
    assert.match(source, /bind:value=\{DBState\.db\.personaPrompt\}/)
    assert.match(source, /alertSelect\(\[[\s\S]*language\.createfromScratch,[\s\S]*language\.importCharacter/)
    assert.match(source, /<BaseRoundedButton onClick=\{addPersona\}>/)
    assert.match(source, /selectUserImg\(\)/)
    assert.match(source, /exportUserPersona/)
    assert.match(source, /importUserPersona/)
})
