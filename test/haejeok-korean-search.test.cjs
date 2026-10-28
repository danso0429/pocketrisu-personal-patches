'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const manifest = require('../patches/haejeok-korean-search-adapter/manifest.cjs')

function unit(id) {
    const found = manifest.units.find((entry) => entry.id === id)
    assert.ok(found, `missing unit ${id}`)
    return found
}

test('Korean search is a standalone user pack declared only for PocketRisu 1.16.1', () => {
    assert.equal(manifest.id, 'haejeok-korean-search-adapter')
    assert.equal(manifest.userSelectable, true)
    assert.equal(manifest.requires, undefined)
    assert.equal(manifest.autoWhen, undefined)
    assert.deepEqual(manifest.targets.pocketrisu, { verified: [], reviewing: ['1.16.1'] })
    assert.ok(manifest.units.every((entry) => !Object.hasOwn(entry, 'targetVersions')))
})

test('es-hangul is exact, integrity-pinned, and owned by the patch transaction', () => {
    assert.match(
        unit('haejeok-korean-search-adapter:package-dependency:1.10').managed,
        /"es-hangul": "2\.4\.0"/,
    )
    assert.match(
        unit('haejeok-korean-search-adapter:lock-package:1.10').managed,
        /sha512-9ouVct\+rsUw7d5\+JeyEV/,
    )
    assert.match(
        unit('haejeok-korean-search-adapter:lock-snapshot:1.10').managed,
        /es-hangul@2\.4\.0/,
    )
})

test('both native manager lists reuse one entry matcher without adding a score sort', () => {
    const trash = unit('haejeok-korean-search-adapter:component-trash-search:1.16').content
    const visible = unit('haejeok-korean-search-adapter:component-visible-search:1.16').content
    assert.match(trash, /matchesCharacterSearch\(e, search\)/)
    assert.match(visible, /matchesCharacterSearch\(e, search\)/)
    assert.doesNotMatch(trash, /sort|score/)
    assert.doesNotMatch(visible, /sort|score/)
    const search = unit('haejeok-korean-search-adapter:manager-search:1.16').content
    assert.match(search, /matchesSearch\(entry\.name, search\)/)
    assert.match(search, /matchCharacterKorean\(entry, search\)\.matched/)
})

test('matcher covers reverse keyboard conversion and bounded IME expansion', () => {
    const source = unit('haejeok-korean-search-adapter:matcher:1.10').content
    assert.match(source, /convertQwertyToHangul/)
    assert.match(source, /convertHangulToQwerty/)
    assert.match(source, /isLastCharacter && jongseongIndex === 0/)
    assert.match(source, /filterCharactersKorean/)
})
