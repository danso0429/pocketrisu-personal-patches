import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ db: {} as any, chat: null as any }))
vi.mock('src/ts/storage/database.svelte', () => ({ getDatabase: () => state.db }))
import { resolveModelRequestSelection } from './modelRequestSelection'
import { resolveChatModelBindingWithContext } from './modelPresetBinding'

const modes = ['model', 'submodel', 'memory', 'emotion', 'translate', 'otherAx'] as const
const main = { id: 'main-preset', name: 'Main' } as any
const sub = { id: 'sub-preset', name: 'Sub' } as any
const modulePreset = { id: 'module-preset', name: 'Module' } as any

beforeEach(() => {
    state.db = { aiModel: 'classic-main', subModel: 'classic-sub', nodeOnlyModelModeLock: 'none',
        modelPresets: [main, sub, modulePreset], moduleModelBindingsEnabled: true,
        moduleModelBindings: { module: modulePreset.id },
    }
    state.chat = { useModelPreset: true, modelBinding: { main: main.id, sub: sub.id } }
})

describe('explicit request model selection', () => {
    it.each(modes)('selects the expected preset and preserves wrapper context for %s', mode => {
        const expected = { kind: 'modelPreset', preset: mode === 'model' ? main : sub,
            bindingSource: 'chat', pageFoldBinding: state.chat.modelBinding }
        expect(resolveModelRequestSelection(state.db, state.chat, mode)).toEqual(expected)
        expect(resolveChatModelBindingWithContext(state.chat, mode)).toEqual(expected)
    })
    it.each(modes)('preserves module context and forced classic precedence for %s', mode => {
        expect(resolveModelRequestSelection(state.db, state.chat, mode, { moduleId: 'module' }))
            .toEqual({ kind: 'modelPreset', preset: modulePreset, bindingSource: 'module' })
        expect(resolveModelRequestSelection(state.db, state.chat, mode, {
            moduleId: 'module', staticModel: 'reverse_proxy',
        })).toEqual({ kind: 'classic', modelId: 'reverse_proxy' })
    })
    it('uses the passed snapshot even while the singleton has another regime', () => {
        const snapshot = { ...state.db, nodeOnlyModelModeLock: 'legacy',
            aiModel: 'snapshot-main', seperateModelsForAxModels: true,
            seperateModels: { memory: 'snapshot-memory' },
        }
        expect(resolveModelRequestSelection(snapshot, state.chat, 'model'))
            .toEqual({ kind: 'classic', modelId: 'snapshot-main' })
        expect(resolveModelRequestSelection(snapshot, state.chat, 'memory'))
            .toEqual({ kind: 'classic', modelId: 'snapshot-memory' })
        expect(state.db.aiModel).toBe('classic-main')
        expect(resolveChatModelBindingWithContext(state.chat, 'model').kind).toBe('modelPreset')
    })
    it('preserves global-lock defaults, dangling module fallback and missing slots', () => {
        state.db.nodeOnlyModelModeLock = 'preset'
        state.db.defaultModelBinding = { main: main.id }
        state.db.moduleModelBindings.module = 'missing'
        expect(resolveModelRequestSelection(state.db, null, 'model', { moduleId: 'module' }))
            .toEqual({ kind: 'modelPreset', preset: main, bindingSource: 'global-lock-default',
                pageFoldBinding: state.db.defaultModelBinding })
        expect(resolveModelRequestSelection(state.db, null, 'submodel'))
            .toEqual({ kind: 'block', reason: 'sub-unset' })
    })
})

// Execute the generated dispatcher body. Only transport/UI dependencies are
// supplied; both binding and classic selection use the real implementation.
// This checks integration rather than a second copy of the dispatch algorithm.
function dispatcher() {
    const source = readFileSync('src/ts/process/request/request.ts', 'utf8')
    const start = source.indexOf('export async function requestChatDataMain(')
    const end = source.indexOf('\nfunction sendModelPreset(', start)
    if (start < 0 || end <= start) throw new Error('request dispatcher source boundary missing')
    const compiled = ts.transpileModule(source.slice(start, end).replace('export async', 'async'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
        reportDiagnostics: true,
    })
    expect(compiled.diagnostics).toEqual([])
    const js = compiled.outputText
    const calls: any[] = []
    const deps = {
        getDatabase: () => state.db,
        getCurrentChat: () => state.chat,
        resolveModelRequestSelection,
        // Both names are supplied so the same harness can run the baseline.
        resolveChatModelBindingWithContext,
        applyPromptPresetParams: (preset: any) => preset,
        requestModelPreset: (...args: any[]) => { calls.push(['preset', ...args]); return { type: 'success' } },
        getModelInfo: (id: string) => ({ id, format: 'OpenAICompatible' }),
        safeStructuredClone: structuredClone,
        reformater: (value: unknown) => value,
        LLMFormat: { OpenAICompatible: 'OpenAICompatible' },
        requestOpenAI: (arg: any) => { calls.push(['classic', structuredClone(arg)]); return { type: 'success' } },
        language: { modelPresetBindingMainUnset: 'main unset', modelPresetBindingSubUnset: 'sub unset' },
    }
    const run = new Function(...Object.keys(deps), `${js}\nreturn requestChatDataMain`)(...Object.values(deps))
    return { run, calls }
}

describe('generated dispatcher integration', () => {
    const input = () => ({ formated: [{ role: 'user', content: 'synthetic input' }] })
    it('retains preset context and blocks an unset binding before dispatch', async () => {
        const { run, calls } = dispatcher()
        await run(input(), 'model')
        expect(calls[0][0]).toBe('preset')
        expect(calls[0][2]).toBe(main)
        expect(calls[0][5].bindingSource).toBe('chat')
        state.chat.modelBinding = {}
        expect(await run(input(), 'model')).toEqual({ type: 'fail', noRetry: true, result: 'main unset' })
        expect(calls).toHaveLength(1)
    })
    it('retains module override and static fallback with its custom URL/key', async () => {
        state.db.forceReplaceUrl = 'http://127.0.0.1:12345/v1/chat/completions'
        state.db.proxyKey = 'synthetic-key'
        state.db.customAPIFormat = 'OpenAICompatible'
        const { run, calls } = dispatcher()
        await run({ ...input(), moduleId: 'module' }, 'otherAx')
        expect(calls[0][2]).toBe(modulePreset)
        await run({ ...input(), moduleId: 'module', staticModel: 'reverse_proxy' }, 'otherAx')
        expect(calls[1][0]).toBe('classic')
        expect(calls[1][1]).toMatchObject({ aiModel: 'reverse_proxy',
            customURL: state.db.forceReplaceUrl, key: 'synthetic-key' })
    })
    it.each(modes)('preserves classic custom and auxiliary selection for %s', async mode => {
        state.chat.useModelPreset = false
        state.db.seperateModelsForAxModels = true
        state.db.seperateModels = { [mode]: 'xcustom:::selected' }
        state.db.customModels = [{ id: 'xcustom:::selected', url: 'http://localhost:12345/custom', key: 'synthetic' }]
        const { run, calls } = dispatcher()
        await run(input(), mode)
        expect(calls[0][1]).toMatchObject({ aiModel: 'xcustom:::selected',
            customURL: 'http://localhost:12345/custom', key: 'synthetic' })
    })
})
