import { describe, expect, test, vi } from 'vitest'

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

const { normalizePromptTemplate } = await import('./database.svelte')

const typedPromptTypes = ['persona', 'description', 'authornote', 'memory'] as const

describe('frozen Kei typed prompt-role compatibility', () => {
    test.each(typedPromptTypes)('%s prefers native role2 over legacy role', (type) => {
        const source = [{ type, role2: 'user', role: 'assistant' }]
        const normalized = normalizePromptTemplate(source as any) as any[]

        expect(normalized[0].role2).toBe('user')
        expect(source[0].role2).toBe('user')
    })

    test('an invalid but present native role2 does not fall through to legacy role', () => {
        const normalized = normalizePromptTemplate([
            { type: 'persona', role2: 'invalid-native', role: 'user' },
        ] as any) as any[]

        expect(normalized[0].role2).toBe('system')
    })

    test.each(typedPromptTypes)('%s uses frozen legacy role when role2 is absent or null', (type) => {
        for (const source of [
            { type, role: 'assistant' },
            { type, role2: null, role: 'assistant' },
        ]) {
            const normalized = normalizePromptTemplate([source] as any) as any[]
            expect(normalized[0].role2).toBe('bot')
        }
    })

    test.each([
        ['assistant', 'bot'],
        ['char', 'bot'],
        ['user', 'user'],
        ['system', 'system'],
        ['invalid-legacy', 'system'],
    ])('normalizes legacy role %s through the native role aliases', (role, expected) => {
        const normalized = normalizePromptTemplate([
            { type: 'memory', role },
        ] as any) as any[]

        expect(normalized[0].role2).toBe(expected)
    })

    test('lorebook role data remains outside typed-role normalization', () => {
        const source = [{ type: 'lorebook', role: 'assistant' }]
        const normalized = normalizePromptTemplate(source as any) as any[]

        expect(normalized[0]).toEqual(source[0])
        expect(normalized[0]).not.toHaveProperty('role2')
        expect(normalized[0]).not.toBe(source[0])
    })
})
