'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const patchRoot = path.join(__dirname, '../patches/personal-settings')
const read = (relative) => fs.readFileSync(path.join(patchRoot, relative), 'utf8')
const manifest = require('../patches/personal-settings/manifest.cjs')
const coreUnits = require('../patches/personal-settings/core/units.cjs')
const importNavigationUnits = require(
    '../patches/personal-settings/settings/import-navigation/units.cjs',
)
const searchUnits = require('../patches/personal-settings/settings/search/units.cjs')
const logic = read('core/files/src/ts/personalSettings.ts')
const logicTests = read('core/files/src/ts/personalSettings.test.ts')
const storage = read('core/files/src/ts/personalSettings/core.ts')
const page = read('core/files/src/lib/Setting/Pages/PersonalSettings.svelte')
const importNavigationLogic = read(
    'settings/import-navigation/files/src/ts/personalSettings/importNavigation.ts',
)
const importNavigationTests = read(
    'settings/import-navigation/files/src/ts/personalSettings/importNavigation.test.ts',
)
const importNavigationSection = read(
    'settings/import-navigation/files/src/lib/Setting/Pages/PersonalSettings/ImportNavigationSetting.svelte',
)

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
    assert.equal(manifest.version, '0.2.0')
    assert.deepEqual(manifest.targets, {
        pocketrisu: {
            verified: ['1.8.1', '1.9.0'],
            reviewing: [],
        },
    })
    assert.equal(manifest.userSelectable, true)
    assert.deepEqual(manifest.presetDefaults, ['features'])
    assert.equal(manifest.requires, undefined)
})

test('the root manifest only aggregates core and setting-owned units', () => {
    assert.deepEqual(manifest.units, [
        ...coreUnits,
        ...importNavigationUnits,
        ...searchUnits,
    ])
    assert.equal(
        new Set(manifest.units.map((candidate) => candidate.id)).size,
        manifest.units.length,
    )
    assert.ok(coreUnits.some((candidate) => candidate.id === 'personal-settings:page'))
    assert.ok(importNavigationUnits.some(
        (candidate) => candidate.id === 'personal-settings:local-import-navigation',
    ))
    assert.equal(
        coreUnits.some((candidate) => candidate.id.includes('import-navigation')),
        false,
    )
    assert.equal(searchUnits.length, 2)
    assert.ok(searchUnits.every((candidate) =>
        candidate.targetVersions?.pocketrisu?.length === 1
        && candidate.targetVersions.pocketrisu[0] === '1.9.0'
    ))
})

test('PocketRisu 1.9 Settings Search indexes and tests the Personal page', () => {
    const entry = unit('personal-settings:search-manifest-1.9')
    const searchTest = unit('personal-settings:search-index-test-1.9')

    assert.equal(entry.file, 'src/ts/setting/searchManifestData.ts')
    assert.equal(entry.where, 'after')
    assert.match(entry.anchor, /id: 'manual\.system\.pluginStorage'/)
    assert.match(entry.managed, /id: 'manual\.page\.personal'/)
    assert.match(entry.managed, /label: \(\) => '개인 설정'/)
    assert.match(entry.managed, /route: SettingsRoute\.Personal/)
    assert.match(entry.managed, /'personal settings'/)
    assert.deepEqual(entry.requires, ['personal-settings:routing'])

    assert.equal(searchTest.file, 'src/ts/setting/searchIndex.test.ts')
    assert.match(searchTest.managed, /personalPageHits\('개인 설정'\)/)
    assert.match(searchTest.managed, /personalPageHits\('personal settings'\)/)
    assert.match(searchTest.managed, /result\.key === 'manual\.page\.personal'/)
    assert.match(searchTest.managed, /expect\(hits\)\.toHaveLength\(1\)/)
    assert.deepEqual(searchTest.requires, ['personal-settings:search-manifest-1.9'])
})

test('the personal namespace defaults to existing behavior and preserves future fields', () => {
    assert.match(logic, /from '\.\/personalSettings\/core'/)
    assert.match(logic, /from '\.\/personalSettings\/importNavigation'/)
    assert.match(storage, /stayOnCurrentCharacterAfterImport\?: boolean/)
    assert.match(
        importNavigationLogic,
        /pocketRisuPersonalSettings\?\.stayOnCurrentCharacterAfterImport === true/,
    )
    assert.match(storage, /\.\.\.\(db\.pocketRisuPersonalSettings \?\? \{\}\)/)
    assert.match(
        importNavigationTests,
        /keeps the existing import navigation behavior when the setting is absent/,
    )
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
    assert.match(page, /<ImportNavigationSetting \/>/)
    assert.match(importNavigationSection, /캐릭터 임포트 후 현재 화면 유지/)
    assert.match(
        importNavigationSection,
        /새 캐릭터로 자동 이동하지 않고 임포트를 시작한 화면에 머뭅니다/,
    )
    assert.match(
        importNavigationSection,
        /setStayOnCurrentCharacterAfterImport\(DBState\.db, enabled\)/,
    )
    assert.match(
        importNavigationSection,
        /기존 ‘임포트 시 캐릭터로 이동’ 설정보다 우선/,
    )
})

test('local file and package imports stay put only when the override is enabled', () => {
    const helper = unit('personal-settings:local-import-helper')
    const navigation = unit('personal-settings:local-import-navigation')
    const text = replacementText(navigation)

    assert.equal(
        helper.content,
        'import { shouldStayOnCurrentCharacterAfterImport } from "./personalSettings";\n',
    )
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
        storage,
        page,
        importNavigationLogic,
        importNavigationTests,
        importNavigationSection,
        ...searchUnits.flatMap((candidate) => [
            candidate.content ?? '',
            candidate.managed ?? '',
        ]),
        ...manifest.units.flatMap((candidate) => [
            candidate.content ?? '',
            candidate.managed ?? '',
        ]),
    ].join('\n')

    assert.doesNotMatch(patchText, /\bplugins\b/)
    assert.doesNotMatch(patchText, /setDatabase(?:Lite)?\s*\(/)
})
