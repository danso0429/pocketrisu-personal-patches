'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const patchRoot = path.join(__dirname, '../patches/character-import-ux')
const read = (relative) => fs.readFileSync(path.join(patchRoot, relative), 'utf8')
const source = read('files/src/ts/characterCards.ts')
const anchor = read('anchors/src/ts/characterCards.ts')
const state = read('files/src/ts/characterImportState.ts')
const toastComponent = read('files/src/lib/Others/CharacterImportToast.svelte')
const manifest = require('../patches/character-import-ux/manifest.cjs')

test('character import UX is a separate lazy-chat-dependent feature pack', () => {
    assert.equal(manifest.id, 'character-import-ux')
    assert.equal(manifest.userSelectable, true)
    assert.deepEqual(manifest.presetDefaults, ['features'])
    assert.deepEqual(manifest.requires, ['lazy-chat-sync'])
    assert.notEqual(source, anchor)
    assert.doesNotMatch(source, /setDatabaseLite\(\{ ?plugins|setDatabase\(\{ ?plugins/)
})

test('ordinary imports use one reactive toast body and server-confirmed success', () => {
    assert.match(source, /beginCharacterImport/)
    assert.match(source, /runCharacterImportJob/)
    assert.match(source, /requestImportedCharacterSave\(character\.chaId\)/)
    assert.match(source, /job\.succeed\(language\.importedCharacter\)/)
    assert.match(source, /if \(imported\.length === 0\) \{\s*job\.dismiss\(\)\s*return null/)
    assert.doesNotMatch(source, /notifySuccess\(language\.importedCharacter\)/)
    assert.match(state, /toast\.custom\(CharacterImportToast/)
    assert.match(state, /status\.set\(/)
    assert.doesNotMatch(state, /toast\.loading/)
    assert.match(state, /duration: Number\.POSITIVE_INFINITY/)
    assert.match(state, /beforeunload/)
    assert.match(toastComponent, /\$status\.message/)
    assert.match(toastComponent, /class:ci-loading=/)
    assert.ok(manifest.units.some(
        (unit) => unit.id === 'character-import-ux:toast'
            && unit.file === 'src/lib/Others/CharacterImportToast.svelte',
    ))
})

test('asset progress stays in the same title with stable-width counters', () => {
    assert.match(source, /formatCharacterImportProgress/)
    assert.match(source, /'Saving character assets\.\.\.',\s*done,\s*total,/)
    assert.match(source, /'Saving character assets\.\.\.',\s*readedPngChunks \+ 1,/)
    assert.match(state, /String\(safeCurrent\)\.padStart\(width, '0'\)/)
    assert.ok(state.includes("'?'.repeat(width)"))
})

test('PNG import reads one stream and assigns stable IDs at construction', () => {
    assert.equal((source.match(/PngChunk\.readGenerator\(f\.data/g) ?? []).length, 1)
    assert.doesNotMatch(source, /const prereader|pngChunks/)
    assert.match(source, /function convertOffSpecCards[\s\S]*chats: \[\{\s*id: uuidv4\(\),/)
    assert.match(source, /let char:character = \{[\s\S]*chats: \[\{\s*id: uuidv4\(\),/)
})

test('package import retains its parent progress contract', () => {
    const unit = manifest.units.find(
        (candidate) => candidate.id === 'character-import-ux:package-keeps-parent-progress',
    )
    assert.ok(unit)
    assert.match(unit.content, /suppressImportJob: true/)
    assert.match(source, /if \(f\.returnCharacter \|\| f\.suppressImportJob\)/)
})

test('hub imports clear legacy modals and do not navigate after a refused import', () => {
    assert.match(
        source,
        /alertStore\.set\(\{ type: 'none', msg: '' \}\)\s*const imported = await importCharacterProcess\(\{\s*name: 'charahub\.png'/,
    )
    assert.match(
        source,
        /let imported: number \| null[\s\S]*if \(imported === null\) return\s*checkCharOrder\(\)/,
    )
})

test('only replacement, restart, and destructive storage actions are gated', () => {
    const guarded = manifest.units
        .filter((unit) => unit.id.endsWith('-guard') && typeof unit.content === 'string')
        .map((unit) => unit.content)
        .join('\n')
    assert.match(guarded, /Backup restore/)
    assert.match(guarded, /Save-folder import/)
    assert.match(guarded, /Snapshot restore/)
    assert.match(guarded, /Server backup restore/)
    assert.match(guarded, /Application update/)
    assert.doesNotMatch(guarded, /sendChat|settings|character edit/i)
})
