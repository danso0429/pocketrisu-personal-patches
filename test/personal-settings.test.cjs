'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const patchRoot = path.join(__dirname, '../patches/personal-settings')
const read = (relative) => fs.readFileSync(path.join(patchRoot, relative), 'utf8')
const manifest = require('../patches/personal-settings/manifest.cjs')
const logic = read('files/src/ts/personalSettings.ts')
const logicTests = read('files/src/ts/personalSettings.test.ts')
const page = read('files/src/lib/Setting/Pages/PersonalSettings.svelte')

function unit(id) {
    const result = manifest.units.find((candidate) => candidate.id === id)
    assert.ok(result, `missing unit ${id}`)
    return result
}

function replacementText(candidate) {
    return candidate.managed ?? candidate.content ?? ''
}

test('personal settings is an independent rolling feature pack', () => {
    assert.equal(manifest.id, 'personal-settings')
    assert.equal(manifest.version, '0.1.0')
    assert.equal(manifest.userSelectable, true)
    assert.deepEqual(manifest.presetDefaults, ['features'])
    assert.equal(manifest.requires, undefined)
})

test('the personal namespace defaults to existing behavior and preserves future fields', () => {
    assert.match(logic, /stayOnCurrentCharacterAfterImport\?: boolean/)
    assert.match(
        logic,
        /pocketRisuPersonalSettings\?\.stayOnCurrentCharacterAfterImport === true/,
    )
    assert.match(logic, /\.\.\.\(db\.pocketRisuPersonalSettings \?\? \{\}\)/)
    assert.match(logicTests, /keeps the existing import navigation behavior when the setting is absent/)
    assert.match(logicTests, /futureSetting: 'preserved'/)

    const databaseField = unit('personal-settings:database-field')
    assert.equal(databaseField.content, '    pocketRisuPersonalSettings?:PocketRisuPersonalSettings\n')
})

test('settings UI adds Personal directly after System with a persisted toggle', () => {
    const menu = unit('personal-settings:settings-menu')
    const render = unit('personal-settings:settings-render')
    const route = unit('personal-settings:routing')

    assert.equal(menu.where, 'before')
    assert.equal(menu.anchor, '                    {#if devPanelEnabled}\n')
    assert.match(menu.managed, /\$SettingsMenuIndex === 24/)
    assert.match(menu.managed, /<UserIcon \/>/)
    assert.match(menu.managed, /<span>개인 설정<\/span>/)
    assert.match(render.managed, /\$SettingsMenuIndex === 24/)
    assert.match(render.managed, /<PersonalSettings\/>/)
    assert.equal(route.anchor, '    System: 22 as const,\n')
    assert.equal(route.content, '    Personal: 24 as const,\n')

    assert.match(page, /<SettingPage title="개인 설정">/)
    assert.match(page, /캐릭터 임포트 후 현재 화면 유지/)
    assert.match(page, /새 캐릭터로 자동 이동하지 않고 임포트를 시작한 화면에 머뭅니다/)
    assert.match(page, /setStayOnCurrentCharacterAfterImport\(DBState\.db, enabled\)/)
    assert.match(page, /기존 ‘임포트 시 캐릭터로 이동’ 설정보다 우선/)
})

test('local file and package imports stay put only when the override is enabled', () => {
    const navigation = unit('personal-settings:local-import-navigation')
    const text = replacementText(navigation)

    assert.match(
        text,
        /const importedCharacter = r === 'importCharacter' \|\| r === 'importPackage'/,
    )
    assert.match(
        text,
        /!importedCharacter \|\| !shouldStayOnCurrentCharacterAfterImport\(db\)/,
    )
    assert.match(text, /changeChar\(db\.characters\.length-1\)/)
    assert.doesNotMatch(text, /createfromScratch/)
})

test('Realm navigation obeys the personal override after character import UX composition', () => {
    const helper = unit('personal-settings:realm-import-helper')
    const conditions = [
        unit('personal-settings:realm-import-navigation-with-keys'),
        unit('personal-settings:realm-import-navigation'),
    ]

    assert.deepEqual(helper.after, ['character-import-ux:character-cards'])
    for (const condition of conditions) {
        const text = replacementText(condition)
        assert.match(
            text,
            /!shouldStayOnCurrentCharacterAfterImport\(db\)/,
        )
        assert.match(text, /db\.goCharacterOnImport \|\| arg\.forceRedirect/)
    }
})

test('personal settings never writes the database plugin array', () => {
    const patchText = [
        logic,
        logicTests,
        page,
        ...manifest.units.flatMap((candidate) => [
            candidate.content ?? '',
            candidate.managed ?? '',
        ]),
    ].join('\n')

    assert.doesNotMatch(patchText, /\bplugins\b/)
    assert.doesNotMatch(patchText, /setDatabase(?:Lite)?\s*\(/)
})
