'use strict'

const { managedTypeScript } = require('../../manifest-helpers.cjs')

const targetVersions = {
    pocketrisu: ['1.9.0'],
}

module.exports = [
    {
        id: 'personal-settings:search-manifest-1.9',
        file: 'src/ts/setting/searchManifestData.ts',
        type: 'insert',
        where: 'after',
        anchor: `    {
        id: 'manual.system.pluginStorage',
        label: () => language.pluginStorageTab,
        keywords: ['plugin storage', '플러그인 저장소'],
        route: SettingsRoute.System,
        subTab: SystemTab.PluginStorage,
    },
`,
        managed: managedTypeScript('personal-settings:search-manifest-1.9', `    {
        id: 'manual.page.personal',
        label: () => '개인 설정',
        keywords: ['personal settings', 'personal', '개인 설정', '개인설정'],
        route: SettingsRoute.Personal,
    },`),
        markerNeedle: 'POCKETRISU-PATCH:personal-settings:search-manifest-1.9:START',
        requires: ['personal-settings:routing'],
        targetVersions,
    },
    {
        id: 'personal-settings:search-index-test-1.9',
        file: 'src/ts/setting/searchIndex.test.ts',
        type: 'insert',
        where: 'before',
        anchor: "describe('searchSettings — module binding tab', () => {\n",
        managed: managedTypeScript('personal-settings:search-index-test-1.9', `function personalPageHits(query: string) {
    return searchSettings(query, ctx)
        .filter((result) => result.key === 'manual.page.personal')
}

describe('searchSettings — Personal settings page', () => {
    test('finds the page by its Korean label', () => {
        const hits = personalPageHits('개인 설정')
        expect(hits).toHaveLength(1)
        expect(hits[0].route).toBe(SettingsRoute.Personal)
    })

    test('finds the page by its English keyword', () => {
        const hits = personalPageHits('personal settings')
        expect(hits).toHaveLength(1)
        expect(hits[0].route).toBe(SettingsRoute.Personal)
    })
})`),
        markerNeedle: 'POCKETRISU-PATCH:personal-settings:search-index-test-1.9:START',
        requires: ['personal-settings:search-manifest-1.9'],
        targetVersions,
    },
]
