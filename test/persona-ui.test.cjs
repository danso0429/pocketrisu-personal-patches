'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const source = fs.readFileSync(path.join(
    __dirname,
    '../patches/persona-organizer/files/src/lib/Setting/listedPersona.svelte',
), 'utf8')

test('persona native drag does not compete with the iOS long-press controller', () => {
    assert.match(source, /matchMedia\("\(pointer: coarse\)"\)/)
    assert.match(source, /draggable=\{!isTouchDevice\}/)
    assert.match(source, /ontouchstart=\{isTouchDevice \?/)
    assert.doesNotMatch(source, /draggable="true"/)
})

test('persona folders are explicit same-size cards that open as drop targets', () => {
    assert.match(source, />New folder</)
    assert.match(source, /class="folder-image"/)
    assert.match(source, /\.persona-image,\s*\.folder-image[\s\S]*width: 5rem;[\s\S]*height: 5rem;/)
    assert.match(source, /class="open-folder"/)
    assert.match(source, /data-folder-drop/)
    assert.match(source, /dropAt\(folder\.id, null, event\)/)
    assert.doesNotMatch(source, /createFolderWith|dropOnPersona|Drop on a persona: create folder/)
})

test('persona reorder, folder move, and unfile actions stay distinct', () => {
    assert.match(source, /dropAt\(persona\.folderId \?\? null, persona\.id \?\? null, event\)/)
    assert.match(source, /dropAt\(null, null, event\)/)
    assert.match(source, /const target = highlightedDrop/)
    assert.match(source, /event\.stopPropagation\(\)/)
    assert.match(source, /saveUserPersona\(\)[\s\S]*reorderPersonaList/)
})
