import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { get, writable } from 'svelte/store'
import { runToolLoop } from '../../preset/adapter/toolLoop'
const state = vi.hoisted(() => ({ db: {} as any, mcpUrls: [] as string[], pluginV2: {
    providers: new Map(), providerOptions: new Map(), replacerbeforeRequest: new Set(), replacerafterRequest: new Set(),
    editinput: new Set(), editoutput: new Set(), editprocess: new Set(), editdisplay: new Set(),
} }))

vi.mock('src/ts/storage/database.svelte', () => ({ getDatabase: () => state.db }))
vi.mock('src/ts/process/modules', () => ({ getModuleMcps: () => [...state.mcpUrls], getModuleLorebooks: () => [] }))
vi.mock('src/ts/process/modules.ts', () => ({ getModuleMcps: () => [...state.mcpUrls], getModuleLorebooks: () => [] }))
vi.mock('../../storage/database.svelte', () => ({ getDatabase: () => state.db }))
vi.mock('../modules', () => ({ getModuleMcps: () => [...state.mcpUrls], getModuleLorebooks: () => [] }))
vi.mock('../modules.ts', () => ({ getModuleMcps: () => [...state.mcpUrls], getModuleLorebooks: () => [] }))
vi.mock('src/ts/alert', () => ({ alertInput: vi.fn(), notifySuccess: vi.fn(), notifyError: vi.fn() }))
vi.mock('../../alert', () => ({ alertInput: vi.fn(), notifySuccess: vi.fn(), notifyError: vi.fn() }))
vi.mock('src/ts/stores.svelte', async () => {
    const { writable } = await import('svelte/store')
    return { DBState: { db: { authRefreshes: [] } }, bodyIntercepterStore: [], customProviderStore: writable<string[]>([]) }
})
vi.mock('src/ts/plugins/plugins.svelte', async () => {
    const { writable } = await import('svelte/store')
    return { pluginV2: state.pluginV2, allowedDbKeys: [], customProviderStore: writable<string[]>([]) }
})
vi.mock('src/ts/plugins/apiV3/v3.svelte', () => ({ customV3ProviderMetaStore: [] }))
vi.mock('src/ts/globalApi.svelte', () => ({ fetchNative: vi.fn(), globalFetch: vi.fn() }))
vi.mock('../../globalApi.svelte', () => ({ fetchNative: vi.fn(), globalFetch: vi.fn(), openURL: vi.fn() }))
vi.mock('src/ts/util', () => ({ sleep: vi.fn() }))
vi.mock('../../util', () => ({ sleep: vi.fn() }))
vi.mock('src/ts/storage/persistentKv', () => ({ makeEncodedStorageKey: vi.fn(), readPersistentJson: vi.fn(), writePersistentJson: vi.fn() }))
vi.mock('../../storage/persistentKv', () => ({ makeEncodedStorageKey: vi.fn(), readPersistentJson: vi.fn(), writePersistentJson: vi.fn() }))
vi.mock('src/ts/process/request/request', () => ({ requestChatDataMain: vi.fn() }))
vi.mock('src/ts/plugins/apiV3/pluginChatAccess', () => ({ projectChatMetadata: (value: unknown) => value }))

import * as mcpModule from '../mcp/mcp'
import * as pluginMcpModule from '../mcp/pluginmcp'

const { MCPs, callMCPTool, getTools } = mcpModule
const { registeredCustomPluginMCPs } = pluginMcpModule

type AnyRecord = Record<string, any>
const tool = (name = 'lookup') => ({ name, description: 'lookup', inputSchema: { type: 'object' } })
const text = (value: string) => [{ type: 'text', text: value }]

function loadBindings() {
    const source = readFileSync('src/ts/bgPluginBindings.ts', 'utf8').replace(/^import .*$/gm, '')
        .replace('export const bgPluginBindings', 'const bgPluginBindings')
    const compiled = ts.transpileModule(source, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }, reportDiagnostics: true,
    })
    expect(compiled.diagnostics).toEqual([])
    const customProviderStore = writable<string[]>([])
    const deps: AnyRecord = { ...mcpModule, ...pluginMcpModule,
        get, pluginV2: state.pluginV2, allowedDbKeys: [], customV3ProviderMetaStore: [],
        bodyIntercepterStore: [], customProviderStore,
        LLMProvider: { AsIs: 0 }, LLMFormat: { Plugin: 0 }, LLMFlags: { hasFullSystemPrompt: 0 },
        LLMTokenizer: { Unknown: 0 }, fetchNative: vi.fn(), globalFetch: vi.fn(), requestChatDataMain: vi.fn(),
        projectChatMetadata: (value: unknown) => value, getModuleLorebooks: () => [],
    }
    return new Function(...Object.keys(deps), `${compiled.outputText}\nreturn bgPluginBindings`)(...Object.values(deps)) as AnyRecord
}

beforeEach(() => {
    state.db = { requestRetrys: 1, banCharacterset: [], fallbackWhenBlankResponse: false }
    state.mcpUrls = []
    registeredCustomPluginMCPs.clear()
    for (const key of Object.keys(MCPs)) delete MCPs[key]
    state.pluginV2.replacerbeforeRequest.clear(); state.pluginV2.replacerafterRequest.clear()
})
afterEach(() => { delete (globalThis as AnyRecord).__bgOrchAbortSignal })

function install(meta: AnyRecord, list: () => Promise<unknown[]>, call: (name: string, args: unknown) => Promise<unknown[]>) {
    const value = loadBindings().installMCP
    expect(value, 'bgPluginBindings.installMCP must be implemented').toBeTypeOf('function')
    if (typeof value !== 'function') throw Error('installMCP unavailable')
    return value(meta, list, call) as () => void
}

function requestHarness(options: {
    getTools?: () => Promise<unknown[]>,
    main: (arg: AnyRecord, call: number) => Promise<AnyRecord> | AnyRecord,
    fallbacks?: string[], signal?: AbortSignal,
}) {
    const source = readFileSync('src/ts/process/request/request.ts', 'utf8')
    const start = source.indexOf('export async function requestChatData(')
    const end = source.indexOf('\nexport function reformater(', start)
    if (start < 0 || end <= start) throw new Error('requestChatData source boundary missing')
    const compiled = ts.transpileModule(source.slice(start, end).replace('export async', 'async'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }, reportDiagnostics: true,
    })
    expect(compiled.diagnostics).toEqual([])
    const calls: AnyRecord[] = []
    let mainCalls = 0
    const deps: AnyRecord = {
        assertServerInputCanContinue() {}, getDatabase: () => state.db,
        modelRequestFallbacks: () => options.fallbacks ?? [''], getTools: options.getTools ?? (async () => []),
        safeStructuredClone: structuredClone, risuUnescape: (value: string) => value, risuEscape: (value: string) => value,
        isModelRequestAttempt: () => true, pluginV2: state.pluginV2, getCurrentCharacter: () => null, getCurrentChat: () => null,
        runTrigger: vi.fn(), requestChatDataMain: async (arg: AnyRecord) => {
            calls.push(structuredClone(arg)); return options.main(arg, ++mainCalls)
        }, pageFoldContentRetryPolicy: (reason: string) => ({ reason }), sleep: async () => {},
    }
    const run = new Function(...Object.keys(deps), `${compiled.outputText}\nreturn requestChatData`)(...Object.values(deps))
    return { run: (arg: AnyRecord) => run(arg, 'model', options.signal ?? null), calls,
        getTools: deps.getTools as ReturnType<typeof vi.fn> }
}

function compileRequestFunction(file: string, startMarker: string, endMarker: string, name: string, deps: AnyRecord) {
    const source = readFileSync(file, 'utf8')
    const start = source.indexOf(startMarker)
    const end = source.indexOf(endMarker, start + startMarker.length)
    if (start < 0 || end <= start) throw Error(`${name} source boundary missing`)
    const compiled = ts.transpileModule(source.slice(start, end).replace(/^export /gm, ''), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }, reportDiagnostics: true,
    })
    expect(compiled.diagnostics).toEqual([])
    return new Function(...Object.keys(deps), `${compiled.outputText}\nreturn ${name}`)(...Object.values(deps)) as (...args: any[]) => any
}

describe('[D2-2] BG request tool discovery and provider guards', () => {
    it('[new] fails OpenAI and ModelPreset without another send when the offered plugin client is cleaned up before its call', async () => {
        state.mcpUrls = ['plugin:expiring']
        ;(globalThis as AnyRecord).__bgOrchAbortSignal = new AbortController().signal
        const pluginCall = vi.fn(async () => text('must-not-be-used-after-cleanup'))
        const cleanup = install({ identifier: 'plugin:expiring', name: 'expiring', version: '1', description: '' },
            async () => [tool('expiring_tool')], pluginCall)
        const offeredTools = await getTools()
        expect(offeredTools).toEqual([{ ...tool('expiring_tool'), mcpURL: 'plugin:expiring' }])
        cleanup()

        const openAISends: AnyRecord[] = []
        const globalFetch = vi.fn(async (_url: string, options: AnyRecord) => {
            openAISends.push(structuredClone(options.body))
            return { ok: true, data: openAISends.length === 1
                ? { choices: [{ message: { role: 'assistant', content: '', tool_calls: [{ id: 'call-1', type: 'function',
                    function: { name: 'expiring_tool', arguments: '{}' } }] } }] }
                : { choices: [{ message: { content: 'unexpected-follow-up' } }] } }
        })
        const requestOpenAI = compileRequestFunction('src/ts/process/request/openAI/requests.ts',
            'async function requestHTTPOpenAI(', '\nexport async function requestOpenAILegacyInstruct', 'requestHTTPOpenAI', {
                getDatabase: () => state.db, globalFetch, getLocalNetworkRequestOptions: () => ({}),
                extractJSON: (value: unknown) => value, LLMFlags: { deepSeekThinkingOutput: 999 }, callTool: callMCPTool,
                encodeToolCall: vi.fn(async () => ''), notifyError: vi.fn(), language: { errors: { httpError: 'http error' } },
            })
        const providerArg = { tools: offeredTools, modelInfo: { id: 'synthetic', flags: [] }, extractJson: false,
            multiGen: false, rememberToolUsage: false, abortSignal: new AbortController().signal }
        const openAIResult = await requestOpenAI('https://provider.test', { messages: [] }, {}, providerArg)
        expect(openAIResult).toMatchObject({ type: 'fail' })
        expect(openAISends).toHaveLength(1)

        const sendModelPreset = vi.fn()
            .mockResolvedValueOnce({ text: '', toolCalls: [{ id: 'call-1', name: 'expiring_tool', arguments: '{}' }] })
            .mockResolvedValue({ text: 'unexpected-follow-up', toolCalls: [] })
        const requestModelPreset = compileRequestFunction('src/ts/process/request/request.ts',
            'async function requestModelPreset(', '\nasync function requestNovelAI(', 'requestModelPreset', {
                buildModelPresetCredential: () => ({}), resolveWireModelId: () => 'synthetic-model', toRequestKind: () => 'main',
                toLogSource: () => 'main', statusEnabled: () => false,
                createRequestLogScope: () => ({ setRoute: vi.fn(), wrap: (value: unknown) => value, close: vi.fn() }),
                resolvePresetStreaming: () => false, makeProxiedFetch: () => fetch, getDatabase: () => state.db,
                toAdapterToolDef: (value: unknown) => value, makeJobFetch: vi.fn(), VISION_CAPABLE_ADAPTER_KINDS: ['openai-compatible'],
                getCurrentChat: () => null, LLMFlags: { hasFullSystemPrompt: 1, hasFirstSystemPrompt: 2,
                    requiresAlternateRole: 3, mustStartWithUserInput: 4 }, reformater: (value: unknown) => value,
                safeStructuredClone: structuredClone, expandAdapterMessages: async (value: unknown) => value,
                decodeToolCall: vi.fn(), toAdapterMessage: (value: unknown) => value, previewModelPreset: vi.fn(),
                resolvePageFoldState: () => ({ kind: 'off' }), runToolLoop, MODEL_PRESET_MAX_TOOL_STEPS: 8,
                formatPresetReasoning: (value?: string) => value ?? '', sendModelPreset, encodeToolCall: vi.fn(),
                callTool: callMCPTool, toolResponseText: () => '', performance, console, uuidv4: () => 'synthetic-id',
                TOOL_CAPABLE_ADAPTER_KINDS: ['openai-compatible'],
            })
        const preset = { id: 'preset', name: 'preset', toolUse: true, profileSnapshot: {
            adapterKind: 'openai-compatible', capabilities: ['tools'], modelId: 'synthetic-model',
            providerBaseId: 'synthetic-provider', auth: { kind: 'bearer' },
        } }
        const presetResult = await requestModelPreset({ formated: [{ role: 'user', content: 'hello' }], tools: offeredTools,
            rememberToolUsage: false, chatId: 'synthetic-chat', useStreaming: false }, preset,
            new AbortController().signal)
        expect(presetResult).toMatchObject({ type: 'fail' })
        expect(sendModelPreset).toHaveBeenCalledTimes(1)
    })

    it('[new] installs into both plugin registries and evicts only its own registry and MCP cache pointers', async () => {
        state.mcpUrls = ['plugin:shared']
        const firstList = vi.fn(async () => [tool('first')])
        const firstCleanup = install({ identifier: 'plugin:shared', name: 'first', version: '1', description: '' },
            firstList, async () => text('first'))
        expect((registeredCustomPluginMCPs as Map<string, unknown>).has('plugin:shared')).toBe(true)
        expect((await getTools()).map(value => value.name)).toEqual(['first'])
        const stale = MCPs['plugin:shared']
        const secondCleanup = install({ identifier: 'plugin:shared', name: 'second', version: '1', description: '' },
            async () => [tool('second')], async () => text('second'))
        firstCleanup()
        expect((registeredCustomPluginMCPs as Map<string, unknown>).has('plugin:shared')).toBe(true)
        expect(MCPs['plugin:shared']).not.toBe(stale)
        expect((await getTools()).map(value => value.name)).toEqual(['second'])
        expect(await callMCPTool('second', {})).toEqual(text('second'))
        secondCleanup(); secondCleanup()
        expect((registeredCustomPluginMCPs as Map<string, unknown>).has('plugin:shared')).toBe(false)
        expect(MCPs).not.toHaveProperty('plugin:shared')
    })

    it('[new] never routes a same-name tool call to a stale client from a previous job', async () => {
        state.mcpUrls = ['plugin:shared']
        const staleCall = vi.fn(async () => text('stale'))
        const staleCleanup = install({ identifier: 'plugin:shared', name: 'old', version: '1', description: '' },
            async () => [tool('duplicate')], staleCall)
        await getTools()
        const liveCall = vi.fn(async () => text('live'))
        install({ identifier: 'plugin:shared', name: 'new', version: '1', description: '' },
            async () => [tool('duplicate')], liveCall)
        staleCleanup()
        expect(await callMCPTool('duplicate', {})).toEqual(text('live'))
        expect(liveCall).toHaveBeenCalledTimes(1)
        expect(staleCall).not.toHaveBeenCalled()
    })

    it('[new] binds a same-name BG tool call to the only client that offered it in this attempt list', async () => {
        state.mcpUrls = ['plugin:alpha', 'plugin:beta']
        ;(globalThis as AnyRecord).__bgOrchAbortSignal = new AbortController().signal
        let alphaEnabled = false
        const alphaCall = vi.fn(async () => text('alpha'))
        const betaCall = vi.fn(async () => text('beta'))
        install({ identifier: 'plugin:alpha', name: 'alpha', version: '1', description: '' },
            async () => alphaEnabled ? [tool()] : [], alphaCall)
        install({ identifier: 'plugin:beta', name: 'beta', version: '1', description: '' },
            async () => [tool()], betaCall)
        expect((await getTools()).map(value => value.name)).toEqual(['lookup'])
        alphaEnabled = true
        expect(await callMCPTool('lookup', {})).toEqual(text('beta'))
        expect(betaCall).toHaveBeenCalledTimes(1)
        expect(alphaCall).not.toHaveBeenCalled()
    })

    it('[new] refuses an ambiguous same-name BG tool call without running either client callback', async () => {
        state.mcpUrls = ['plugin:alpha', 'plugin:beta']
        ;(globalThis as AnyRecord).__bgOrchAbortSignal = new AbortController().signal
        const alphaCall = vi.fn(async () => text('alpha'))
        const betaCall = vi.fn(async () => text('beta'))
        install({ identifier: 'plugin:alpha', name: 'alpha', version: '1', description: '' },
            async () => [tool()], alphaCall)
        install({ identifier: 'plugin:beta', name: 'beta', version: '1', description: '' },
            async () => [tool()], betaCall)
        await getTools()
        await expect(callMCPTool('lookup', {})).rejects.toThrow()
        expect(alphaCall).not.toHaveBeenCalled()
        expect(betaCall).not.toHaveBeenCalled()
    })

    it('[new] resolves tools after beforeRequest and puts the dynamic tool in the first BG model send', async () => {
        const order: string[] = []
        let enabled = false
        state.pluginV2.replacerbeforeRequest.add(async (messages: unknown) => { order.push('before'); enabled = true; return messages })
        const list = vi.fn(async () => { order.push('list'); return enabled ? [tool('dynamic_tool')] : [] })
        ;(globalThis as AnyRecord).__bgOrchAbortSignal = new AbortController().signal
        const h = requestHarness({ getTools: list, main: async () => ({ type: 'success', result: 'done' }) })
        await h.run({ formated: [{ role: 'user', content: 'hello' }] })
        expect(order).toEqual(['before', 'list'])
        expect(h.calls[0].tools).toEqual([tool('dynamic_tool')])
        expect(list).toHaveBeenCalledTimes(1)
    })

    it('[unchanged] explicit arg.tools including an empty array bypasses MCP discovery without merging', async () => {
        const list = vi.fn(async () => [tool('registered')])
        ;(globalThis as AnyRecord).__bgOrchAbortSignal = new AbortController().signal
        for (const explicit of [[], [tool('explicit')]]) {
            const h = requestHarness({ getTools: list, main: async () => ({ type: 'success', result: 'done' }) })
            await h.run({ formated: [{ role: 'user', content: 'hello' }], tools: explicit })
            expect(h.calls[0].tools).toEqual(explicit)
        }
        expect(list).not.toHaveBeenCalled()
    })

    it('[new] reads once after preparation for a PageFold attempt and reuses that list on its source-skipping retry', async () => {
        const order: string[] = []
        state.pluginV2.replacerbeforeRequest.add(async (messages: unknown) => { order.push('before'); return messages })
        const list = vi.fn(async () => { order.push('list'); return [tool('fold')] })
        ;(globalThis as AnyRecord).__bgOrchAbortSignal = new AbortController().signal
        const h = requestHarness({ getTools: list, main: async (_arg, call) => call === 1
            ? { type: 'fail', result: 'retry', pageFoldRouteState: { route: 'fold' },
                failurePolicy: { allowClassicFallback: false, retrySameRoute: true } }
            : { type: 'success', result: 'done' } })
        await h.run({ formated: [{ role: 'user', content: 'hello' }] })
        expect(order).toEqual(['before', 'list'])
        expect(list).toHaveBeenCalledTimes(1)
        expect(h.calls).toHaveLength(2)
        expect(h.calls[1].tools).toEqual(h.calls[0].tools)
    })

    it('[new] checks cancellation after the deferred tool read and before requestChatDataMain', async () => {
        const controller = new AbortController()
        const order: string[] = []
        state.pluginV2.replacerbeforeRequest.add(async (messages: unknown) => { order.push('before'); return messages })
        const list = vi.fn(async () => { order.push('list'); controller.abort(); return [tool()] })
        ;(globalThis as AnyRecord).__bgOrchAbortSignal = controller.signal
        const h = requestHarness({ signal: controller.signal, getTools: list,
            main: async () => { order.push('send'); return { type: 'success', result: 'unexpected' } } })
        expect(await h.run({ formated: [{ role: 'user', content: 'hello' }] })).toMatchObject({ type: 'fail', result: 'Aborted' })
        expect(order).toEqual(['before', 'list'])
        expect(h.calls).toHaveLength(0)
    })

    it('[new] allows ordinary retry after mcp_list but refreshes the list once for each prepared non-PageFold attempt', async () => {
        const list = vi.fn(async () => [tool()])
        ;(globalThis as AnyRecord).__bgOrchAbortSignal = new AbortController().signal
        const h = requestHarness({ getTools: list, main: async (_arg, call) => call === 1
            ? { type: 'fail', result: 'temporary' } : { type: 'success', result: 'done' } })
        expect(await h.run({ formated: [{ role: 'user', content: 'hello' }] })).toMatchObject({ type: 'success' })
        expect(h.calls).toHaveLength(2)
        expect(list).toHaveBeenCalledTimes(2)
    })

    it('[unchanged] foreground discovery remains before beforeRequest and classic retry is not given a BG step cap', async () => {
        const order: string[] = []
        state.pluginV2.replacerbeforeRequest.add(async (messages: unknown) => { order.push('before'); return messages })
        const list = vi.fn(async () => { order.push('list'); return [] })
        state.db.requestRetrys = 9
        const h = requestHarness({ getTools: list, main: async (_arg, call) => call <= 9
            ? { type: 'fail', result: 'temporary' } : { type: 'success', result: 'done' } })
        expect(await h.run({ formated: [{ role: 'user', content: 'hello' }] })).toMatchObject({ type: 'success' })
        expect(order.slice(0, 2)).toEqual(['list', 'before'])
        expect(h.calls).toHaveLength(10)
    })

    it('[unchanged] a BG request with no registered tools stays empty and preserves beforeRequest rejection', async () => {
        ;(globalThis as AnyRecord).__bgOrchAbortSignal = new AbortController().signal
        const empty = requestHarness({ getTools: vi.fn(async () => []),
            main: async () => ({ type: 'success', result: 'done' }) })
        await empty.run({ formated: [{ role: 'user', content: 'hello' }] })
        expect(empty.calls[0].tools).toEqual([])
        state.pluginV2.replacerbeforeRequest.add(async () => { throw Error('before failure') })
        const failing = requestHarness({ getTools: vi.fn(async () => []),
            main: async () => ({ type: 'success', result: 'unexpected' }) })
        await expect(failing.run({ formated: [{ role: 'user', content: 'hello' }] })).rejects.toThrow('before failure')
        expect(failing.calls).toHaveLength(0)
    })

    it('[unchanged] keeps outer retry for a BG request whose tools are all non-plugin MCP tools', async () => {
        ;(globalThis as AnyRecord).__bgOrchAbortSignal = new AbortController().signal
        const external = { ...tool(), mcpURL: 'https://mcp.synthetic.test' }
        const h = requestHarness({ getTools: vi.fn(async () => [external]), main: async (_arg, call) => call === 1
            ? { type: 'fail', result: 'temporary', toolExecuted: true }
            : { type: 'success', result: 'done' } })
        expect(await h.run({ formated: [{ role: 'user', content: 'hello' }] })).toMatchObject({ type: 'success' })
        expect(h.calls).toHaveLength(2)
    })

    it('[new] stops outer retry and fallback after a BG tool effect for every provider result shape', async () => {
        ;(globalThis as AnyRecord).__bgOrchAbortSignal = new AbortController().signal
        const pluginTool = { ...tool(), mcpURL: 'plugin:synthetic-d2' }
        const cases = [
            { provider: 'ModelPreset', response: { type: 'success', result: 'Tool call failed: boom', toolExecuted: true } },
            { provider: 'OpenAI', response: { type: 'success', result: 'Tool call failed with error: boom', toolExecuted: true } },
            { provider: 'Google', response: { type: 'fail', result: 'boom', toolExecuted: true } },
            { provider: 'Anthropic', response: { type: 'fail', result: 'boom', toolExecuted: true } },
        ]
        for (const item of cases) {
            const h = requestHarness({ getTools: vi.fn(async () => [pluginTool]),
                fallbacks: ['', 'fallback'], main: async () => item.response })
            const result = await h.run({ formated: [{ role: 'user', content: 'hello' }] })
            expect(h.calls, item.provider).toHaveLength(1)
            expect(result.result, item.provider).toContain('boom')
        }
    })
})
