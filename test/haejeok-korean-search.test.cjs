'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const manifest = require('../patches/haejeok-korean-search-adapter/manifest.cjs')

function unit(id) {
    const found = manifest.units.find((entry) => entry.id === id)
    assert.ok(found, `missing unit ${id}`)
    return found
}

test('Korean search is an internal character-owner adapter with exact 1.10 units', () => {
    assert.equal(manifest.id, 'haejeok-korean-search-adapter')
    assert.equal(manifest.userSelectable, false)
    assert.deepEqual(manifest.requires, ['character-organizer'])
    assert.deepEqual(manifest.autoWhen, { all: ['character-organizer'] })
    assert.ok(manifest.units.every((entry) =>
        entry.targetVersions?.pocketrisu?.length === 1
        && entry.targetVersions.pocketrisu[0] === '1.10.0'
    ))
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

test('both catalog surfaces reuse one matcher without adding a score sort', () => {
    const grid = unit('haejeok-korean-search-adapter:grid-filter:1.10').content
    const mobile = unit('haejeok-korean-search-adapter:mobile-filter:1.10').managed
    assert.match(grid, /matchCharacterKorean\(c, search\)\.matched/)
    assert.match(mobile, /matchCharacterKorean\(char, search\)\.matched/)
    assert.doesNotMatch(grid, /sort|score/)
    assert.doesNotMatch(mobile, /sort|score/)
})

test('matcher covers reverse keyboard conversion and bounded IME expansion', () => {
    const source = unit('haejeok-korean-search-adapter:matcher:1.10').content
    assert.match(source, /convertQwertyToHangul/)
    assert.match(source, /convertHangulToQwerty/)
    assert.match(source, /isLastCharacter && jongseongIndex === 0/)
    assert.match(source, /filterCharactersKorean/)
})
