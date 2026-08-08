import { describe, expect, test } from 'vitest'
import type { Database } from 'src/ts/storage/database.svelte'
import {
    PERSONAL_APPEARANCE_ATTRIBUTE,
    readPersonalAppearance,
    resolvePersonalAppearanceTokens,
    setPersonalAppearanceValue,
    syncPersonalAppearance,
} from './appearance'

function db(value: Record<string, unknown> = {}): Database {
    return { theme: '', ...value } as unknown as Database
}

describe('personal appearance storage', () => {
    test('reads missing and invalid enum values without mutating the database', () => {
        const value = db({
            pocketRisuPersonalSettings: {
                appearance: {
                    version: 1,
                    chat: { font: 'future-font', alignment: 'diagonal' },
                },
            },
        })
        const before = JSON.stringify(value)

        expect(readPersonalAppearance(value)).toMatchObject({
            schemaStatus: 'supported',
            enabled: false,
            chat: { font: 'app', alignment: 'left' },
        })
        expect(JSON.stringify(value)).toBe(before)
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
        return db({
            pocketRisuPersonalSettings: {
                appearance: {
                    version: 1,
                    enabled: true,
                    chat: {
                        font: 'paperlogy',
                        alignment: 'center',
                        keepKoreanWords: true,
                    },
                    composer: { minimal: true },
                },
            },
        })
    }

    test('returns stable tokens only for selected features on PocketRisu Standard', () => {
        expect(resolvePersonalAppearanceTokens(enabledDb(), false)).toEqual([
            'chat-font-paperlogy',
            'chat-align-center',
            'chat-keep-korean-words',
            'composer-minimal',
        ])
    })

    test('Safe Mode, master off, and unsupported themes remove all effects', () => {
        const value = enabledDb()
        expect(resolvePersonalAppearanceTokens(value, true)).toEqual([])
        ;(value as any).theme = 'waifu'
        expect(resolvePersonalAppearanceTokens(value, false)).toEqual([])
        ;(value as any).theme = ''
        ;(value as any).pocketRisuPersonalSettings.appearance.enabled = false
        expect(resolvePersonalAppearanceTokens(value, false)).toEqual([])
    })

    test('does not leave a root declaration behind when no token is effective', () => {
        const attributes = new Map<string, string>([[PERSONAL_APPEARANCE_ATTRIBUTE, 'stale']])
        const root = {
            hasAttribute: (name: string) => attributes.has(name),
            getAttribute: (name: string) => attributes.get(name) ?? null,
            setAttribute: (name: string, value: string) => attributes.set(name, value),
            removeAttribute: (name: string) => attributes.delete(name),
        } as unknown as HTMLElement

        syncPersonalAppearance(db(), false, root)
        expect(attributes.has(PERSONAL_APPEARANCE_ATTRIBUTE)).toBe(false)
    })
})
