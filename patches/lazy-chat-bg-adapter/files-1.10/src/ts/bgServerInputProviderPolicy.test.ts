import { describe, expect, it } from 'vitest'
import { requiresClientOwnedInputPreparation } from './bgServerInputProviderPolicy'

describe('server-owned input provider boundary', () => {
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
