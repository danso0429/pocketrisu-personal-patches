import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('../stores.svelte', () => {
    const state: { db: any } = { db: {} }
    const noopStore = { subscribe: () => () => {}, set: () => {}, update: () => {} }
    return {
        DBState: state,
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

const { normalizeBotPresetSelection } = await import('./database.svelte')

function preset(id: string) {
    return {
        id,
        name: id,
        mainPrompt: '',
        jailbreak: '',
        globalNote: '',
        temperature: 0,
        maxContext: 0,
        maxResponse: 0,
        frequencyPenalty: 0,
        PresensePenalty: 0,
        formatingOrder: [],
        bias: [],
        promptPreprocess: false,
    }
}

let db: any

beforeEach(() => {
    db = {
        botPresets: [preset('a'), preset('b'), preset('c')],
        botPresetsId: 1,
    }
})

describe('normalizeBotPresetSelection', () => {
    test('keeps a valid selection and every preset unchanged', () => {
        const before = [...db.botPresets]
        expect(normalizeBotPresetSelection(db)).toBe(1)
        expect(db.botPresets).toEqual(before)
    })

    test('preserves the deliberate no-active sentinel', () => {
        db.botPresetsId = -1
        expect(normalizeBotPresetSelection(db)).toBe(-1)
        expect(db.botPresetsId).toBe(-1)
    })

    test('clamps a one-past-end persisted index to the last surviving preset', () => {
        db.botPresetsId = 3
        expect(normalizeBotPresetSelection(db)).toBe(2)
        expect(db.botPresets.map((item: any) => item.id)).toEqual(['a', 'b', 'c'])
    })

    test('repairs values below the sentinel and non-integer persisted indices', () => {
        db.botPresetsId = -4
        expect(normalizeBotPresetSelection(db)).toBe(0)
        db.botPresetsId = Number.NaN
        expect(normalizeBotPresetSelection(db)).toBe(0)
    })

    test('creates one valid fallback only when the preset array is empty', () => {
        db.botPresets = []
        db.botPresetsId = 8
        expect(normalizeBotPresetSelection(db)).toBe(0)
        expect(db.botPresets).toHaveLength(1)
        expect(db.botPresets[0].id).toBeTruthy()
    })
})
