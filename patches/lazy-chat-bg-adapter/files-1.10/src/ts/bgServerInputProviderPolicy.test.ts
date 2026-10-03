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

    it('blocks missing preset bindings but does not reject an empty module binding table', () => {
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
        }, { useModelPreset: false })).toBe(false)
    })

    const modes = ['model', 'submodel', 'memory', 'emotion', 'translate', 'otherAx'] as const
    const preset = (adapterKind = 'openai-compatible') => ({
        id: 'native-preset', userValues: {}, profileSnapshot: {
            adapterKind, endpoint: { kind: 'static', url: 'http://localhost:11434/v1/chat/completions' },
            auth: { kind: 'none', fields: [] }, schema: [],
        },
    }) as any

    it.each(['openai-compatible', 'anthropic-messages', 'google-gemini'])(
        'admits native %s presets and resolves every module binding against the same snapshot', adapter => {
            const db = { modelPresets: [preset(adapter)], aiModel: 'gpt-4o', subModel: 'gpt-4o' }
            expect(evaluateServerInputModels(db, { useModelPreset: true,
                modelBinding: { main: 'native-preset', sub: 'native-preset', separateAux: false, aux: {} },
            })).toEqual({ kind: 'server-input' })
            expect(evaluateServerInputModels({ ...db, moduleModelBindingsEnabled: true,
                moduleModelBindings: { moduleA: 'native-preset', dangling: 'missing' },
            }, null)).toEqual({ kind: 'server-input' })
        },
    )

    it('checks endpoint overrides using the adapter resolver without banning local addresses', () => {
        const p = preset()
        p.profileSnapshot.schema = [{ key: 'url', mapsTo: { target: 'custom', path: 'endpointUrl' } }]
        const db = { modelPresets: [p], nodeOnlyModelModeLock: 'preset' as const,
            defaultModelBinding: { main: p.id, sub: p.id, separateAux: false, aux: {} } }
        for (const url of ['http://127.0.0.1:8080/v1', 'http://192.168.1.2/v1', 'https://example.test/custom']) {
            p.userValues.url = url
            expect(evaluateServerInputModels(db, null)).toEqual({ kind: 'server-input' })
        }
        p.userValues.url = 'file:///tmp/provider'
        expect(evaluateServerInputModels(db, null)).toEqual({ kind: 'client-prepared', reason: 'endpoint-unqualified' })
    })

    it('uses static fallback attempts without consulting an unused preset binding', () => {
        const db = { nodeOnlyModelModeLock: 'preset' as const,
            fallbackModels: Object.fromEntries(modes.map(mode => [mode, ['gpt-4o', '', 'gpt-4o-mini']])) }
        expect(evaluateServerInputModels(db, null)).toEqual({ kind: 'server-input' })
        db.fallbackModels.model.unshift('')
        expect(evaluateServerInputModels(db, null)).toEqual({ kind: 'client-prepared', reason: 'binding-unset' })
    })

    it.each([0, 2, 5] as const)('admits qualified custom format %i with its configured endpoint', format => {
        expect(evaluateServerInputModels({ aiModel: 'reverse_proxy', subModel: 'gpt-4o',
            customAPIFormat: format, forceReplaceUrl: 'https://example.test/v1',
        }, null)).toEqual({ kind: 'server-input' })
        expect(evaluateServerInputModels({ aiModel: 'xcustom:::native', subModel: 'gpt-4o',
            customModels: [{ id: 'xcustom:::native', format, url: 'https://example.test/v1' }] as any,
        }, null)).toEqual({ kind: 'server-input' })
    })

    it('preserves browser-local classic routes while admitting explicit server-local transport', () => {
        for (const format of [0, 2, 5] as const) {
            expect(evaluateServerInputModels({ aiModel: 'reverse_proxy', subModel: 'gpt-4o',
                customAPIFormat: format, forceReplaceUrl: 'http://localhost:8080/v1',
            }, null)).toEqual(format === 0 ? { kind: 'server-input' }
                : { kind: 'client-prepared', reason: 'client-network-route' })
        }
    })

    it('preserves preparation when plugin input participation is unresolved on newly expanded routes', () => {
        const db = { modelPresets: [preset()], plugins: [{ enabled: true }] as any,
            aiModel: 'gpt-4o', subModel: 'gpt-4o',
        }
        expect(evaluateServerInputModels(db, { useModelPreset: true,
            modelBinding: { main: 'native-preset', sub: 'native-preset', separateAux: false, aux: {} },
        })).toEqual({ kind: 'client-prepared', reason: 'plugin-host-unqualified' })
        expect(evaluateServerInputModels(db, { useModelPreset: false })).toEqual({ kind: 'server-input' })
        expect(evaluateServerInputModels({ ...db, moduleModelBindingsEnabled: true,
            moduleModelBindings: { dangling: 'missing' },
        }, { useModelPreset: false })).toEqual({ kind: 'client-prepared', reason: 'plugin-host-unqualified' })
        expect(evaluateServerInputModels({ ...db, nodeOnlyModelModeLock: 'preset',
            fallbackModels: Object.fromEntries(modes.map(mode => [mode, ['gpt-4o']])),
        }, null)).toEqual({ kind: 'client-prepared', reason: 'plugin-host-unqualified' })
    })

    it('retains existing classic MCP execution and preparation for newly expanded MCP combinations', () => {
        const db = { modelPresets: [preset()], modules: [{ mcp: { url: 'internal:dice' } }] as any,
            aiModel: 'gpt-4o', subModel: 'gpt-4o' }
        expect(evaluateServerInputModels(db, null)).toEqual({ kind: 'server-input' })
        expect(evaluateServerInputModels(db, { useModelPreset: true,
            modelBinding: { main: 'native-preset', sub: 'native-preset', separateAux: false, aux: {} },
        })).toEqual({ kind: 'client-prepared', reason: 'mcp-unqualified' })
    })

    it.each(['custom', 'pluginmodel:::missing', 'hf:::browser-model'])(
        'does not infer native execution from missing registry metadata for %s', aiModel => {
            expect(evaluateServerInputModels({ aiModel, subModel: 'gpt-4o' }, null))
                .toEqual({ kind: 'client-prepared', reason: 'provider-unqualified' })
        },
    )
})
