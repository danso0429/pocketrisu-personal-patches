import { describe, expect, test } from 'vitest'
import type { Database } from 'src/ts/storage/database.svelte'
import {
    ensurePersonalChatFontStylesheet,
    getPersonalChatFontFamily,
    PERSONAL_APPEARANCE_ATTRIBUTE,
    readPersonalAppearance,
    resolvePersonalAppearanceTokens,
    setPersonalAppearanceValue,
    syncPersonalAppearance,
} from './appearance'

function db(value: Record<string, unknown> = {}): Database {
    return { theme: '', ...value } as unknown as Database
}

function disconnectedFontDocument(): {
    targetDocument: Document
    links: HTMLLinkElement[]
} {
    const links: HTMLLinkElement[] = []
    const head = {
        querySelector<T extends Element>(selector: string): T | null {
            return (links.find((link) => link.matches(selector)) ?? null) as unknown as T | null
        },
        append(...nodes: (Node | string)[]) {
            for (const node of nodes) {
                if (typeof node === 'string' || !(node instanceof HTMLLinkElement)) {
                    throw new TypeError('Expected a stylesheet link')
                }
                if (!links.includes(node)) links.push(node)
            }
        },
    }

    return {
        targetDocument: {
            createElement: document.createElement.bind(document),
            head,
        } as unknown as Document,
        links,
    }
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
        expect(setPersonalAppearanceValue(value, 'chat.font', 'future-font')).toBe(false)
        expect(JSON.stringify(value)).toBe(before)
    })

    test.each([
        ['paperlogy', 'Paperlogy', 'chat-font-paperlogy'],
        ['noto-sans-kr', 'Noto Sans KR', 'chat-font-noto-sans-kr'],
        ['noto-serif-kr', 'Noto Serif KR', 'chat-font-noto-serif-kr'],
        ['ibm-plex-sans-kr', 'IBM Plex Sans KR', 'chat-font-ibm-plex-sans-kr'],
        ['gowun-dodum', 'Gowun Dodum', 'chat-font-gowun-dodum'],
        ['gowun-batang', 'Gowun Batang', 'chat-font-gowun-batang'],
        ['hahmlet', 'Hahmlet', 'chat-font-hahmlet'],
    ] as const)('normalizes and resolves the supported %s font', (font, family, token) => {
        const value = db({
            pocketRisuPersonalSettings: {
                appearance: { version: 1, enabled: true, chat: { font } },
            },
        })

        expect(readPersonalAppearance(value).chat.font).toBe(font)
        expect(getPersonalChatFontFamily(font)).toBe(family)
        expect(resolvePersonalAppearanceTokens(value, false)).toEqual([token])
    })

    test('keeps the app font free of a font family and root token', () => {
        const value = db({
            pocketRisuPersonalSettings: {
                appearance: { version: 1, enabled: true, chat: { font: 'app' } },
            },
        })

        expect(getPersonalChatFontFamily('app')).toBeNull()
        expect(resolvePersonalAppearanceTokens(value, false)).toEqual([])
    })

    test('loads an optional stylesheet once and reports its browser result', async () => {
        const { targetDocument, links } = disconnectedFontDocument()

        const first = ensurePersonalChatFontStylesheet('gowun-dodum', targetDocument)
        const second = ensurePersonalChatFontStylesheet('gowun-dodum', targetDocument)
        expect(links).toHaveLength(1)
        expect(links[0].isConnected).toBe(false)
        expect(second).toBe(first)
        expect(links[0].href).toContain('fonts.googleapis.com/css2?family=Gowun+Dodum')

        links[0].dispatchEvent(new Event('load'))
        await expect(first).resolves.toBe(true)
        expect(links[0].dataset.pocketrisuFontLoaded).toBe('true')
        await expect(ensurePersonalChatFontStylesheet('paperlogy', targetDocument)).resolves.toBe(true)
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
