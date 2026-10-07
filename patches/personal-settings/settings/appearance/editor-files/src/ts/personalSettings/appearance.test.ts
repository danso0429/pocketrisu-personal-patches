import { describe, expect, test } from 'vitest'
import type { Database } from 'src/ts/storage/database.svelte'
import {
    getPersonalFontFamily,
    PERSONAL_APPEARANCE_ATTRIBUTE,
    readPersonalAppearance,
    resolvePersonalAppearanceTokens,
    setPersonalAppearanceValue,
    setPersonalFontEnabled,
    syncPersonalAppearance,
} from './appearance'

function db(value: Record<string, unknown> = {}): Database {
    return { theme: '', ...value } as unknown as Database
}

function appearanceDb(appearance: Record<string, unknown>): Database {
    return db({ pocketRisuPersonalSettings: { appearance: { version: 1, ...appearance } } })
}

describe('personal appearance storage', () => {
    test('reads missing and invalid enum values without mutating the database', () => {
        const value = appearanceDb({ chat: { font: 'future-font', alignment: 'diagonal' } })
        const before = JSON.stringify(value)

        expect(readPersonalAppearance(value)).toMatchObject({
            schemaStatus: 'supported',
            enabled: false,
            chat: { font: 'galmuri14', fontEnabled: false, alignment: 'left' },
            ui: { font: 'galmuri14', fontEnabled: false },
        })
        expect(setPersonalAppearanceValue(value, 'chat.font', 'future-font')).toBe(false)
        expect(JSON.stringify(value)).toBe(before)
    })

    test.each([
        ['paperlogy', 'Paperlogy'],
        ['galmuri14', 'Galmuri14'],
    ] as const)('resolves the built-in %s font for both targets', (font, family) => {
        const value = appearanceDb({
            enabled: true,
            chat: { font, fontEnabled: true },
            ui: { font, fontEnabled: true },
        })

        expect(readPersonalAppearance(value)).toMatchObject({ chat: { font }, ui: { font } })
        expect(getPersonalFontFamily(font)).toBe(family)
        expect(resolvePersonalAppearanceTokens(value, false)).toEqual([`chat-font-${font}`, `ui-font-${font}`])
    })

    test('emits one shared token per target for user fonts', () => {
        const value = appearanceDb({
            enabled: true,
            chat: { font: 'custom:first', fontEnabled: true },
            ui: { font: 'custom:second', fontEnabled: true },
        })

        expect(getPersonalFontFamily('custom:first')).toBeNull()
        expect(resolvePersonalAppearanceTokens(value, false)).toEqual(['chat-font-custom', 'ui-font-custom'])
    })

    test.each([
        ['app', false],
        ['noto-sans-kr', false],
        ['noto-serif-kr', false],
        ['ibm-plex-sans-kr', false],
        ['gowun-dodum', false],
        ['gowun-batang', false],
        ['hahmlet', false],
        [undefined, false],
        ['paperlogy', true],
        ['custom:kept', true],
    ] as const)('reads a legacy chat font %s with a derived toggle', (font, enabled) => {
        const value = appearanceDb({ enabled: true, chat: font === undefined ? {} : { font } })
        const expectedFont = enabled ? font : 'galmuri14'

        expect(readPersonalAppearance(value)).toMatchObject({
            chat: { font: expectedFont, fontEnabled: enabled },
            ui: { font: 'galmuri14', fontEnabled: false },
        })
        expect(resolvePersonalAppearanceTokens(value, false)).toEqual(
            enabled ? [`chat-font-${String(font).startsWith('custom:') ? 'custom' : font}`] : [],
        )
    })

    test('an explicit toggle wins over the derived legacy state', () => {
        const value = appearanceDb({
            enabled: true,
            chat: { font: 'paperlogy', fontEnabled: false },
            ui: { font: 'hahmlet', fontEnabled: true },
        })

        expect(readPersonalAppearance(value)).toMatchObject({
            chat: { font: 'paperlogy', fontEnabled: false },
            ui: { font: 'galmuri14', fontEnabled: true },
        })
        expect(resolvePersonalAppearanceTokens(value, false)).toEqual(['ui-font-galmuri14'])
    })

    test('rejects removed and app font writes', () => {
        const value = appearanceDb({ chat: { font: 'paperlogy' } })
        const before = JSON.stringify(value)

        for (const font of ['app', 'noto-sans-kr', 'hahmlet']) {
            expect(setPersonalAppearanceValue(value, 'chat.font', font)).toBe(false)
            expect(setPersonalAppearanceValue(value, 'ui.font', font)).toBe(false)
        }
        expect(setPersonalAppearanceValue(value, 'ui.fontEnabled', 'yes')).toBe(false)
        expect(JSON.stringify(value)).toBe(before)
    })

    test('a toggle write stores the normalized font of its target', () => {
        const value = appearanceDb({ chat: { font: 'app', futureChat: 'keep' } })

        expect(setPersonalFontEnabled(value, 'chat', true)).toBe(true)
        expect(setPersonalFontEnabled(value, 'ui', true)).toBe(true)
        expect((value as any).pocketRisuPersonalSettings.appearance).toEqual({
            version: 1,
            chat: { font: 'galmuri14', fontEnabled: true, futureChat: 'keep' },
            ui: { font: 'galmuri14', fontEnabled: true },
        })
    })

    test('a malformed ui group makes the schema unsupported', () => {
        const value = appearanceDb({ enabled: true, ui: 'broken' })

        expect(readPersonalAppearance(value).schemaStatus).toBe('unsupported')
        expect(setPersonalFontEnabled(value, 'ui', true)).toBe(false)
        expect(resolvePersonalAppearanceTokens(value, false)).toEqual([])
    })

    test('creates version 1 on first write and preserves unknown fields at every level', () => {
        const value = db({
            pocketRisuPersonalSettings: {
                futurePersonal: 'keep',
                appearance: {
                    version: 1,
                    futureAppearance: 'keep',
                    chat: { futureChat: 'keep' },
                },
            },
        })

        expect(setPersonalAppearanceValue(value, 'chat.font', 'paperlogy')).toBe(true)
        expect((value as any).pocketRisuPersonalSettings).toMatchObject({
            futurePersonal: 'keep',
            appearance: {
                version: 1,
                futureAppearance: 'keep',
                chat: { futureChat: 'keep', font: 'paperlogy' },
            },
        })

        const fresh = db()
        expect(setPersonalAppearanceValue(fresh, 'enabled', true)).toBe(true)
        expect((fresh as any).pocketRisuPersonalSettings.appearance).toEqual({
            version: 1,
            enabled: true,
        })
    })

    test('fails closed and preserves an unknown future schema', () => {
        const value = db({
            pocketRisuPersonalSettings: {
                appearance: { version: 2, enabled: true, future: 'untouched' },
            },
        })
        const before = JSON.stringify(value)

        expect(readPersonalAppearance(value).schemaStatus).toBe('unsupported')
        expect(setPersonalAppearanceValue(value, 'enabled', false)).toBe(false)
        expect(resolvePersonalAppearanceTokens(value, false)).toEqual([])
        expect(JSON.stringify(value)).toBe(before)
    })
})

describe('personal appearance resolver', () => {
    function enabledDb() {
        return appearanceDb({
            enabled: true,
            chat: {
                font: 'paperlogy',
                alignment: 'center',
                keepKoreanWords: true,
            },
            ui: { font: 'galmuri14', fontEnabled: true },
            composer: { minimal: true },
        })
    }

    test('returns stable tokens only for selected features on PocketRisu Standard', () => {
        expect(resolvePersonalAppearanceTokens(enabledDb(), false)).toEqual([
            'chat-font-paperlogy',
            'ui-font-galmuri14',
            'chat-align-center',
            'chat-keep-korean-words',
            'composer-minimal',
        ])
    })

    test('Safe Mode and master off remove all effects under every theme', () => {
        const value = enabledDb()
        expect(resolvePersonalAppearanceTokens(value, true)).toEqual([])
        ;(value as any).theme = 'waifu'
        expect(resolvePersonalAppearanceTokens(value, false)).not.toEqual([])
        expect(resolvePersonalAppearanceTokens(value, true)).toEqual([])
        ;(value as any).theme = ''
        ;(value as any).pocketRisuPersonalSettings.appearance.enabled = false
        expect(resolvePersonalAppearanceTokens(value, false)).toEqual([])
    })

    test('does not leave a root declaration behind when no token is effective', () => {
        const root = document.documentElement
        root.setAttribute(PERSONAL_APPEARANCE_ATTRIBUTE, 'stale')
        syncPersonalAppearance(db(), false, root)
        expect(root.hasAttribute(PERSONAL_APPEARANCE_ATTRIBUTE)).toBe(false)
    })
})
