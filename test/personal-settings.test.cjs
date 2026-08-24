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
const appearanceUnits = require('../patches/personal-settings/settings/appearance/units.cjs')
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
const appearanceLogic = read(
    'settings/appearance/files/src/ts/personalSettings/appearance.ts',
)
const appearanceLogicTests = read(
    'settings/appearance/files/src/ts/personalSettings/appearance.test.ts',
)
const appearanceSettingsData = read(
    'settings/appearance/files/src/ts/setting/personalAppearanceSettingsData.ts',
)
const appearanceSection = read(
    'settings/appearance/files/src/lib/Setting/Pages/PersonalSettings/AppearanceSettings.svelte',
)
const appearanceRuntime = read(
    'settings/appearance/files/src/lib/Others/PersonalAppearanceRuntime.svelte',
)
const appearanceCss = read(
    'settings/appearance/files/src/styles/personal-appearance.css',
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
    assert.equal(manifest.version, '0.4.3')
    assert.deepEqual(manifest.targets, {
        pocketrisu: {
            verified: ['1.8.1', '1.9.0', '1.10.0'],
            reviewing: [],
        },
    })
    assert.equal(manifest.userSelectable, true)
    assert.equal(Object.hasOwn(manifest, 'presetDefaults'), false)
    assert.equal(manifest.requires, undefined)
})

test('the root manifest only aggregates core and setting-owned units', () => {
    assert.deepEqual(manifest.units, [
        ...coreUnits,
        ...importNavigationUnits,
        ...appearanceUnits,
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
        candidate.targetVersions?.pocketrisu?.join(',') === '1.9.0,1.10.0'
    ))
    assert.ok(appearanceUnits.length > 0)
    assert.ok(appearanceUnits.every((candidate) =>
        candidate.targetVersions?.pocketrisu?.join(',') === '1.9.0,1.10.0'
    ))
})

test('PocketRisu 1.9 appearance storage is normalized, leaf-written, and future-safe', () => {
    assert.match(appearanceLogic, /PERSONAL_APPEARANCE_SCHEMA_VERSION = 1/)
    assert.match(appearanceLogic, /schemaStatus: 'unsupported'/)
    assert.match(appearanceLogic, /function readPersonalAppearance/)
    assert.match(appearanceLogic, /function setPersonalAppearanceValue/)
    assert.match(appearanceLogic, /\.\.\.personalRecord/)
    assert.match(appearanceLogic, /\.\.\.appearanceRecord/)
    assert.match(appearanceLogic, /\.\.\.\(\(currentGroup \?\? \{\}\) as UnknownRecord\)/)
    assert.doesNotMatch(appearanceLogic, /setDatabase(?:Lite)?\s*\(/)

    assert.match(appearanceLogicTests, /invalid enum values without mutating/)
    assert.match(appearanceLogicTests, /preserves unknown fields at every level/)
    assert.match(appearanceLogicTests, /unknown future schema/)
    assert.match(appearanceLogicTests, /Safe Mode, master off, and unsupported themes/)
    assert.match(appearanceLogicTests, /does not leave a root declaration behind/)
})

test('appearance settings use typed accessors and render in a searchable child tab', () => {
    assert.match(appearanceSettingsData, /personalAppearanceFontSettingsItems: SettingItem\[\]/)
    assert.match(appearanceSettingsData, /personalAppearanceOtherSettingsItems: SettingItem\[\]/)
    assert.match(appearanceSettingsData, /personalAppearanceSettingsItems: SettingItem\[\]/)
    assert.match(appearanceSettingsData, /getValue: \(db\) => getPersonalAppearanceValue/)
    assert.match(appearanceSettingsData, /setValue: \(db, value\)/)
    assert.doesNotMatch(appearanceSettingsData, /bindPath:/)
    assert.match(appearanceSettingsData, /syncPersonalAppearance\(ctx\.db, get\(SafeModeStore\)\)/)
    assert.equal((appearanceSettingsData.match(/id: 'personal\.appearance\./g) ?? []).length, 12)
    assert.match(appearanceSettingsData, /value: 'noto-sans-kr'/)
    assert.match(appearanceSettingsData, /value: 'noto-serif-kr'/)
    assert.match(appearanceSettingsData, /value: 'ibm-plex-sans-kr'/)
    assert.match(appearanceSettingsData, /value: 'gowun-dodum'/)
    assert.match(appearanceSettingsData, /value: 'gowun-batang'/)
    assert.match(appearanceSettingsData, /value: 'hahmlet'/)
    assert.match(appearanceSection, /personal-font-preview__sample/)
    assert.match(appearanceSection, /appearance\.chat\.font !== 'app'/)
    assert.match(appearanceSection, /items=\{personalAppearanceFontSettingsItems\}/)
    assert.match(appearanceSection, /items=\{personalAppearanceOtherSettingsItems\}/)
    assert.match(appearanceSection, /document\.fonts/)
    assert.match(appearanceSection, /ensurePersonalChatFontStylesheet/)
    assert.match(appearanceSection, /faces\.length > 0 \? 'ready' : 'failed'/)
    assert.match(appearanceSection, /lang="zh-Hans"/)
    assert.match(appearanceSection, /lang="zh-Hant"/)
    assert.doesNotMatch(appearanceSection, /personalAppearanceFontPreviewNote/)

    const languageEnglish = unit('personal-settings:appearance-language-en-1.9')
    const languageKorean = unit('personal-settings:appearance-language-ko-1.9')
    assert.match(languageEnglish.content, /personalAppearanceFontPreview: "Font preview"/)
    assert.match(languageKorean.content, /personalAppearanceFontPreview: "폰트 미리보기"/)
    assert.doesNotMatch(languageEnglish.content, /Multilingual font preview/)
    assert.doesNotMatch(languageKorean.content, /다국어 폰트 미리보기/)

    const helpEnglish = unit('personal-settings:appearance-help-en-1.9')
    const helpKorean = unit('personal-settings:appearance-help-ko-1.9')
    assert.doesNotMatch(helpEnglish.content, /Paperlogy|Noto/)
    assert.doesNotMatch(helpKorean.content, /Paperlogy|Noto/)

    const pageTabs = unit('personal-settings:appearance-page-tabs-1.9')
    assert.match(pageTabs.managed, /personalSettingsAppearanceTab/)
    assert.match(pageTabs.managed, /\$PersonalSubmenuIndex === 1/)
    assert.match(pageTabs.managed, /<AppearanceSettings \/>/)

    const searchSource = unit('personal-settings:appearance-search-source-1.9')
    const searchSubmenu = unit('personal-settings:appearance-search-submenu-1.9')
    assert.match(searchSource.content, /personalAppearanceSettingsItems/)
    assert.match(searchSource.content, /route: SettingsRoute\.Personal/)
    assert.match(searchSource.content, /subTab: 1/)
    assert.match(searchSubmenu.content, /PersonalSubmenuIndex/)
})

test('appearance runtime has a single token attribute and Safe Mode wins everywhere', () => {
    assert.match(appearanceLogic, /PERSONAL_APPEARANCE_ATTRIBUTE = 'data-pocketrisu-css'/)
    assert.match(appearanceLogic, /safeMode\n\s*\|\| theme !== ''/)
    assert.match(appearanceLogic, /root\.removeAttribute\(PERSONAL_APPEARANCE_ATTRIBUTE\)/)
    assert.match(appearanceRuntime, /\$effect/)
    assert.match(appearanceRuntime, /syncPersonalAppearance\(DBState\.db, \$SafeModeStore\)/)

    const bootstrap = unit('personal-settings:appearance-bootstrap-sync-1.9')
    assert.match(bootstrap.content, /syncPersonalAppearance\(db, get\(SafeModeStore\)\)/)
    const runtime = unit('personal-settings:appearance-app-runtime-1.9')
    assert.match(runtime.managed, /<PersonalAppearanceRuntime \/>/)

    const send = unit('personal-settings:appearance-send-icon-render-1.9')
    assert.match(send.managed, /composer\.textSendIcon/)
    assert.match(send.managed, /personal-send-glyph/)
    const jailbreak = unit('personal-settings:appearance-jailbreak-render-second-1.9')
    assert.match(jailbreak.managed, /visibility\.hideJailbreakToggle/)
    assert.match(appearanceSection, /DBState\.db\.jailbreakToggle/)
})

test('static appearance CSS is unlayered, token-gated, and leaves user CSS last', () => {
    assert.doesNotMatch(appearanceCss, /@layer/)
    assert.match(appearanceCss, /font-family: "Paperlogy"/)
    assert.match(appearanceCss, /font-family: "Galmuri14"/)
    assert.match(appearanceCss, /fonts\.googleapis\.com\/css2\?family=Noto\+Sans\+KR/)
    assert.match(appearanceCss, /data-pocketrisu-css~="chat-font-paperlogy"/)
    assert.match(appearanceCss, /data-pocketrisu-css~="chat-font-noto-sans-kr"/)
    assert.match(appearanceCss, /data-pocketrisu-css~="chat-font-noto-serif-kr"/)
    assert.match(appearanceCss, /data-pocketrisu-css~="chat-font-ibm-plex-sans-kr"/)
    assert.match(appearanceCss, /data-pocketrisu-css~="chat-font-gowun-dodum"/)
    assert.match(appearanceCss, /data-pocketrisu-css~="chat-font-gowun-batang"/)
    assert.match(appearanceCss, /data-pocketrisu-css~="chat-font-hahmlet"/)
    assert.match(appearanceCss, /--personal-chat-font-family: "Noto Sans KR"/)
    assert.match(appearanceCss, /--personal-chat-font-family: "Noto Serif KR"/)
    assert.match(appearanceCss, /font-family: var\(--personal-chat-font-family\)/)
    assert.match(appearanceCss, /data-pocketrisu-css\*="chat-font-"/)
    assert.match(appearanceCss, /\.chattext :where\(\*\)/)
    assert.match(appearanceCss, /\.personal-font-preview__sample/)
    assert.match(appearanceCss, /\.personal-font-preview__sample :where\(\*\)/)
    assert.match(appearanceCss, /\.default-chat-screen\.nodeonly-standard/)
    assert.match(appearanceCss, /\.chattext pre > code/)
    assert.doesNotMatch(appearanceCss, /overflow-x:\s*hidden/)
    assert.match(appearanceCss, /\[data-risu-composer\]/)
    assert.match(appearanceCss, /\[data-spacer-index\]::before/)

    const link = unit('personal-settings:appearance-css-link-1.9')
    assert.equal(
        link.anchor,
        '    <link rel="stylesheet" href="/src/styles/nodeonly-standard.css" />\n',
    )
    assert.match(link.managed, /personal-appearance\.css/)
    assert.doesNotMatch(link.managed, /customcss/)
})

test('row switches and selects are connected to visible labels and help descriptions', () => {
    const rowLabel = unit('personal-settings:appearance-a11y-row-label-1.9')
    const rowDescription = unit('personal-settings:appearance-a11y-row-description-1.9')
    const settingCheck = unit('personal-settings:appearance-a11y-setting-check-1.9')
    const settingSelect = unit('personal-settings:appearance-a11y-setting-select-1.9')
    assert.match(rowLabel.managed, /setting-\$\{item\.id\}-label/)
    assert.match(rowDescription.managed, /setting-\$\{item\.id\}-description/)
    assert.match(settingCheck.managed, /ariaLabelledby/)
    assert.match(settingCheck.managed, /ariaDescribedby/)
    assert.match(settingSelect.managed, /ariaLabelledby/)
    assert.match(settingSelect.managed, /ariaDescribedby/)
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
        appearanceLogic,
        appearanceLogicTests,
        appearanceSettingsData,
        appearanceSection,
        appearanceRuntime,
        appearanceCss,
        ...appearanceUnits.flatMap((candidate) => [
            candidate.content ?? '',
            candidate.managed ?? '',
        ]),
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
