import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('../stores.svelte', () => {
    const noopStore = { subscribe: () => () => {}, set: () => {}, update: () => {} }
    return {
        DBState: { db: {} },
        selectedCharID: noopStore,
        selIdState: { selId: -1 },
    }
})

vi.mock('../globalApi.svelte', () => ({
    forageStorage: { realStorage: null },
    downloadFile: () => {},
    saveAsset: () => Promise.resolve(''),
}))

vi.mock('../alert', () => ({
    notifySuccess: () => {},
    alertError: () => {},
}))

vi.mock('../../lang', () => ({
    language: {},
    changeLanguage: () => {},
}))

const databaseModule = await import('./database.svelte')
const storesModule = await import('../stores.svelte')
const {
    changeToThemePreset,
    setDatabase,
    themePresetTemplate,
} = databaseModule
const { DBState } = storesModule as any

function loadWithTextTheme(textTheme: unknown) {
    setDatabase({ textTheme } as any)
    return DBState.db
}

beforeEach(() => {
    DBState.db = {}
})

describe('database text-theme boundary', () => {
    test.each([undefined, null, '', 'vex', 'Standard', 0])(
        'normalizes unsupported loaded value %j to standard',
        (value) => {
            expect(loadWithTextTheme(value).textTheme).toBe('standard')
        },
    )

    test.each(['standard', 'highcontrast', 'custom'])(
        'preserves official loaded value %s',
        (value) => {
            expect(loadWithTextTheme(value).textTheme).toBe(value)
        },
    )
})

describe('theme-preset activation boundary', () => {
    test('normalizes a present unsupported preset value to standard', () => {
        const db = loadWithTextTheme('custom')
        db.themePresets = [{ ...structuredClone(themePresetTemplate), textTheme: 'vex' }]
        db.themePresetsId = 0

        changeToThemePreset(0, false)

        expect(DBState.db.textTheme).toBe('standard')
    })

    test.each(['standard', 'highcontrast', 'custom'])(
        'preserves official activated value %s',
        (value) => {
            const db = loadWithTextTheme('standard')
            db.themePresets = [{ ...structuredClone(themePresetTemplate), textTheme: value }]
            db.themePresetsId = 0

            changeToThemePreset(0, false)

            expect(DBState.db.textTheme).toBe(value)
        },
    )

    test('keeps the current valid value when a legacy preset omits textTheme', () => {
        const db = loadWithTextTheme('highcontrast')
        db.themePresets = [{
            ...structuredClone(themePresetTemplate),
            textTheme: undefined,
        } as any]
        db.themePresetsId = 0

        changeToThemePreset(0, false)

        expect(DBState.db.textTheme).toBe('highcontrast')
    })
})
