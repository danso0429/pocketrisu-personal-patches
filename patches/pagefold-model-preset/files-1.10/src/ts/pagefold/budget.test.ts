import { describe, expect, it, vi } from 'vitest'
import type { ModelPreset } from 'src/ts/preset/types'
import { PAGEFOLD_QUALIFIED_ROUTE } from './qualifiedRoute'
import {
    evaluatePageFoldBudgets,
    resolvePageFoldOutputReserve,
    resolvePageFoldSourceBudget,
    resolvePageFoldSourceTokenizer,
} from './budget'

vi.mock('src/ts/tokenizer', () => ({
    encodeWithTokenizer: async (text: string) => Array.from({ length: Math.ceil(text.length / 4) }, (_, index) => index),
}))

function preset(overrides: Partial<ModelPreset> = {}): ModelPreset {
    return {
        id: 'p', name: 'p', userValues: {}, createdAt: 1, updatedAt: 2,
        maxContext: 50_000,
        profileSnapshot: {
            profileId: PAGEFOLD_QUALIFIED_ROUTE.profileId,
            profileVersion: 1,
            providerBaseId: PAGEFOLD_QUALIFIED_ROUTE.providerBaseId,
            providerBaseVersion: 7,
            adapterKind: 'google-gemini',
            auth: { kind: 'google-service-account', fields: [] },
            endpoint: { kind: 'vertex-gemini' },
            modelId: PAGEFOLD_QUALIFIED_ROUTE.requestedModel,
            schema: [], uiSchema: { groups: [], fields: [] }, defaults: {},
            recommendedTokenizer: 'gemma',
            limits: { known: true, contextWindowTokens: 1_048_576, maxOutputTokens: 65_536 },
        },
        ...overrides,
    }
}

describe('PageFold source and wire budget authorities', () => {
    it('uses total assembly budget minus the actual production output reserve', () => {
        expect(resolvePageFoldSourceBudget({
            preset: preset(), outputReserve: 8_192, databaseTokenizer: 'tik',
        })).toMatchObject({
            assemblyTotalBudget: 50_000,
            outputReserve: 8_192,
            sourceInputBudget: 41_808,
            sourceTokenizer: 'gemma',
            wireModel: 'gemini-3.7-flash',
            wireContextLimit: 1_048_576,
            profileMaxOutputTokens: 65_536,
        })
    })

    it('resolves tokenizer in preset/profile/database/adapter order', () => {
        expect(resolvePageFoldSourceTokenizer(preset({ tokenizerOverride: 'claude' }), 'tik')).toBe('claude')
        expect(resolvePageFoldSourceTokenizer(preset(), 'tik')).toBe('gemma')
        expect(resolvePageFoldSourceTokenizer(preset({ profileSnapshot: { ...preset().profileSnapshot, recommendedTokenizer: undefined } }), 'llama')).toBe('llama')
        expect(resolvePageFoldSourceTokenizer(preset({ profileSnapshot: { ...preset().profileSnapshot, recommendedTokenizer: undefined } }), 'invalid')).toBe('gemma')
    })

    it('honors customBody and final additional-parameter output overrides', () => {
        expect(resolvePageFoldOutputReserve(preset({
            customBody: { generationConfig: { maxOutputTokens: 777 } },
        }), 8_192, 1_000)).toBe(777)
        expect(resolvePageFoldOutputReserve(preset({
            customBody: { generationConfig: { maxOutputTokens: 777 } },
            additionalParamsText: 'generationConfig.maxOutputTokens=999',
        }), 8_192, 1_000)).toBe(999)
        expect(() => resolvePageFoldOutputReserve(preset({
            additionalParamsText: 'generationConfig.maxOutputTokens={{none}}',
        }), 8_192, 1_000)).toThrowError(expect.objectContaining({ code: 'PAGEFOLD_OUTPUT_RESERVE_INVALID' }))
    })

    it('uses v8 266/page plus exact text terms and conservative 600 overhead', async () => {
        const source = resolvePageFoldSourceBudget({ preset: preset(), outputReserve: 8_192, databaseTokenizer: 'tik' })
        const evidence = await evaluatePageFoldBudgets({
            source,
            pageCount: 8,
            sourceMessages: [{ role: 'user', content: 'x'.repeat(400) }],
            wireMessages: [
                { role: 'system', content: 'decoder'.repeat(10) },
                { role: 'user', content: 'continue'.repeat(10) },
            ],
        })
        expect(evidence.predictedWireInputTokens).toBeGreaterThanOrEqual(2_618)
        expect(evidence.wireContextLimit).toBe(1_048_576)
        expect(evidence.wireInputBudget).toBe(1_048_576 - 8_192)
    })

    it('takes wire limits from the selected model snapshot without replacing its model', () => {
        const value = preset({
            userValues: { modelId: 'gemini-3.5-flash' },
            profileSnapshot: {
                ...preset().profileSnapshot,
                schema: [{ key: 'modelId', type: 'string', label: 'Model', mapsTo: { target: 'body', path: 'model' } }],
                limits: { known: true, contextWindowTokens: 321_000, maxOutputTokens: 12_000 },
            },
        })
        expect(resolvePageFoldSourceBudget({
            preset: value, outputReserve: 4_000, databaseTokenizer: 'tik',
        })).toMatchObject({
            wireModel: 'gemini-3.5-flash',
            wireContextLimit: 321_000,
            profileMaxOutputTokens: 12_000,
        })
    })

    it('fails source, page, output, and wire limits without trimming or fallback', async () => {
        expect(() => resolvePageFoldSourceBudget({
            preset: preset({ maxContext: 100 }), outputReserve: 200, databaseTokenizer: 'tik',
        })).toThrowError(expect.objectContaining({ code: 'PAGEFOLD_SOURCE_BUDGET_INVALID' }))
        expect(() => resolvePageFoldOutputReserve(preset(), 70_000, 1_000))
            .toThrowError(expect.objectContaining({ code: 'PAGEFOLD_OUTPUT_RESERVE_INVALID' }))

        const source = resolvePageFoldSourceBudget({ preset: preset({ maxContext: 10 }), outputReserve: 1, databaseTokenizer: 'tik' })
        await expect(evaluatePageFoldBudgets({
            source, pageCount: 1,
            sourceMessages: [{ role: 'user', content: 'x'.repeat(100) }],
            wireMessages: [{ role: 'user', content: 'x' }],
        })).rejects.toMatchObject({ code: 'PAGEFOLD_CANONICAL_SOURCE_BUDGET_EXCEEDED' })
        await expect(evaluatePageFoldBudgets({
            source: resolvePageFoldSourceBudget({ preset: preset(), outputReserve: 1, databaseTokenizer: 'tik' }),
            pageCount: 9,
            sourceMessages: [], wireMessages: [],
        })).rejects.toMatchObject({ code: 'PAGEFOLD_PAGE_LIMIT' })
    })
})
