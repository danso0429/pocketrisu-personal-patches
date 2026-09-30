import { describe, expect, it, vi } from 'vitest'
vi.mock('src/ts/storage/database.svelte', () => ({ getDatabase: () => {
    throw new Error('Policy must use its explicit snapshot')
} }))
import { evaluateServerInputModels, requiresClientOwnedInputPreparation } from './bgServerInputProviderPolicy'

describe('server-owned input provider boundary', () => {
    it.each(['model', 'submodel', 'memory', 'emotion', 'translate', 'otherAx'] as const)(
        'checks forced classic fallbacks for %s without exposing model data', mode => {
            for (const model of ['reverse_proxy', 'xcustom:::local-1', 'pluginmodel:::plugin-1']) {
                expect(evaluateServerInputModels({ aiModel: 'novelai', subModel: 'openai',
                    fallbackModels: { [mode]: [model] },
                }, null)).toEqual({ kind: 'client-prepared', reason: 'fallback-unqualified' })
            }
        },
    )
    it('keeps ordinary fallback chains and empty entries eligible', () => {
        expect(evaluateServerInputModels({ aiModel: 'novelai', subModel: 'openai',
            fallbackModels: { model: ['', 'gpt-4o'], translate: ['novelai'] },
        }, null)).toEqual({ kind: 'server-input' })
    })
    it('reads current snapshots independently of the execution singleton', () => {
        const source = { aiModel: 'novelai', subModel: 'openai' }
        const changed = { ...source, fallbackModels: { model: ['reverse_proxy'] } }
        expect(requiresClientOwnedInputPreparation(source, null)).toBe(false)
        expect(requiresClientOwnedInputPreparation(changed, null)).toBe(true)
        expect(requiresClientOwnedInputPreparation(source, null)).toBe(false)
    })
    it('keeps ordinary classic cloud models eligible', () => {
        expect(requiresClientOwnedInputPreparation({
            aiModel: 'novelai', subModel: 'openai',
        }, { useModelPreset: false })).toBe(false)
    })

    it.each(['reverse_proxy', 'xcustom:::local-1', 'pluginmodel:::plugin-1'])(
        'leaves %s on the existing client-prepared path', model => {
            expect(requiresClientOwnedInputPreparation({ aiModel: model }, null)).toBe(true)
            expect(requiresClientOwnedInputPreparation({ subModel: model }, null)).toBe(true)
            expect(requiresClientOwnedInputPreparation({
                aiModel: 'novelai', subModel: 'novelai',
                seperateModelsForAxModels: true,
                seperateModels: { memory: model },
            }, null)).toBe(true)
        },
    )

    it('does not treat an inactive auxiliary override as an active endpoint', () => {
        expect(requiresClientOwnedInputPreparation({
            aiModel: 'novelai', subModel: 'novelai',
            seperateModelsForAxModels: false,
            seperateModels: { memory: 'reverse_proxy' },
        }, null)).toBe(false)
    })

    it('keeps preset-regime endpoint overrides on the existing preparation path', () => {
        expect(requiresClientOwnedInputPreparation({ nodeOnlyModelModeLock: 'preset' }, null))
            .toBe(true)
        expect(requiresClientOwnedInputPreparation({ nodeOnlyModelModeLock: 'none' }, {
            useModelPreset: true,
        })).toBe(true)
        expect(requiresClientOwnedInputPreparation({ nodeOnlyModelModeLock: 'legacy' }, {
            useModelPreset: true,
        })).toBe(false)
        expect(requiresClientOwnedInputPreparation({
            nodeOnlyModelModeLock: 'legacy', moduleModelBindingsEnabled: true,
        }, { useModelPreset: false })).toBe(true)
    })
})
