import { describe, expect, it } from 'vitest'

describe('[E2-4d] Rebase personal-settings onto PocketRisu 1.16.1', () => {
    it('[new] reads old-release Personal CSS and font values through the preserved module exports', async () => {
        const modulePath = './personalSettings/appearance'
        const appearance = await import(/* @vite-ignore */ modulePath).catch(() => null)
        expect(appearance, 'the rebased appearance module exists').not.toBeNull()
        if (!appearance) return
        expect(appearance.readPersonalAppearance).toEqual(expect.any(Function))
        expect(appearance.resolvePersonalAppearanceTokens).toEqual(expect.any(Function))

        const cssModulePath = './personalSettings/cssToggles'
        const cssToggles = await import(/* @vite-ignore */ cssModulePath).catch(() => null)
        expect(cssToggles, 'the rebased cssToggles module exists').not.toBeNull()
        if (!cssToggles) return
        expect(cssToggles.cssSnapshot).toEqual(expect.any(Function))

        const db = {
            theme: '',
            pocketRisuPersonalSettings: {
                appearance: {
                    version: 1,
                    enabled: true,
                    chat: { font: 'paperlogy', fontEnabled: true },
                    cssToggles: {
                        version: 1,
                        custom: [{
                            id: 'legacy-css',
                            name: 'legacy',
                            description: '',
                            css: 'body { color: red; }',
                            enabled: true,
                        }],
                    },
                },
            },
        }
        const value = appearance.readPersonalAppearance(db)
        expect(value).toMatchObject({
            schemaStatus: 'supported',
            enabled: true,
            chat: { font: 'paperlogy', fontEnabled: true },
        })
        expect(appearance.resolvePersonalAppearanceTokens(db, false)).toContain('chat-font-paperlogy')
        expect(cssToggles.cssSnapshot(db, false).nodes).toEqual(
            expect.arrayContaining([{ key: 'custom:legacy-css', css: 'body { color: red; }' }]),
        )
    })

    it('[new] preserves old-release external-header settings while updating another Personal key', async () => {
        const modulePath = './personalSettings'
        const personalSettings = await import(/* @vite-ignore */ modulePath).catch(() => null)
        expect(personalSettings, 'the rebased personalSettings module exists').not.toBeNull()
        if (!personalSettings) return
        expect(personalSettings.updatePersonalSettings).toEqual(expect.any(Function))

        const externalRequestHeaders = [{
            id: 'legacy-rule',
            destination: 'https://api.example.test/v1',
            header: 'x-session',
        }]
        const db = {
            pocketRisuPersonalSettings: {
                externalRequestHeaders,
                futureSetting: 'preserved',
            },
        }
        personalSettings.updatePersonalSettings(db, { stayOnCurrentCharacterAfterImport: true })
        expect(db.pocketRisuPersonalSettings).toMatchObject({
            externalRequestHeaders,
            futureSetting: 'preserved',
            stayOnCurrentCharacterAfterImport: true,
        })
    })
})
