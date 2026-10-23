import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { get, writable } from 'svelte/store'
import { runToolLoop } from '../../preset/adapter/toolLoop'

type AnyRecord = Record<string, any>
const db: AnyRecord = { requestRetrys: 3, simplifiedToolUse: false, jsonSchemaEnabled: false, antiServerOverloads: false }
const definition = { name: 'step', description: 'step', inputSchema: { type: 'object' }, mcpURL: 'plugin:synthetic-d2' }
const externalDefinition = { ...definition, mcpURL: 'https://mcp.synthetic.test' }
const text = (value: string) => [{ type: 'text', text: value }]
const terminalError = (code: string) => Object.assign(new Error(code), { code })

function compileFunction(file: string, startMarker: string, endMarker: string, name: string, deps: AnyRecord) {
    const source = readFileSync(file, 'utf8')
    const start = source.indexOf(startMarker)
    const end = endMarker ? source.indexOf(endMarker, start + startMarker.length) : source.length
    if (start < 0 || end <= start) throw Error(`${name} source boundary missing`)
    const compiled = ts.transpileModule(source.slice(start, end), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }, reportDiagnostics: true,
    })
    expect(compiled.diagnostics).toEqual([])
    return new Function(...Object.keys(deps), `${compiled.outputText}\nreturn ${name}`)(...Object.values(deps)) as (...args: any[]) => any
}

function compileModelPresetRequest(deps: AnyRecord) {
    const source = readFileSync('src/ts/process/request/request.ts', 'utf8')
    const start = source.indexOf('async function requestModelPreset(')
    const end = source.indexOf('\nasync function requestNovelAI(', start)
    if (start < 0 || end <= start) throw Error('requestModelPreset source boundary missing')
    const compiled = ts.transpileModule(source.slice(start, end).replace(/^export /gm, ''), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }, reportDiagnostics: true,
    })
    expect(compiled.diagnostics).toEqual([])
    return new Function(...Object.keys(deps), `${compiled.outputText}\nreturn requestModelPreset`)(...Object.values(deps)) as (...args: any[]) => any
}

function requireBgRegistration() {
    const source = readFileSync('src/ts/bgPluginBindings.ts', 'utf8').replace(/^import .*$/gm, '')
        .replace('export const bgPluginBindings', 'const bgPluginBindings')
    const compiled = ts.transpileModule(source, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }, reportDiagnostics: true,
    })
    expect(compiled.diagnostics).toEqual([])
    const store = writable<string[]>([])
    const deps: AnyRecord = { get, pluginV2: { providers: new Map(), providerOptions: new Map() }, allowedDbKeys: [],
        customV3ProviderMetaStore: [], bodyIntercepterStore: [], customProviderStore: store,
        LLMProvider: { AsIs: 0 }, LLMFormat: { Plugin: 0 }, LLMFlags: { hasFullSystemPrompt: 0 },
        LLMTokenizer: { Unknown: 0 }, fetchNative: vi.fn(), globalFetch: vi.fn(), requestChatDataMain: vi.fn(),
        projectChatMetadata: (value: unknown) => value, getModuleLorebooks: () => [],
        registerMCPModule: vi.fn(), unregisterMCPModule: vi.fn(),
    }
    const binding = new Function(...Object.keys(deps), `${compiled.outputText}\nreturn bgPluginBindings`)(...Object.values(deps))
    expect(binding.installMCP, 'the detached bundle binding must implement installMCP').toBeTypeOf('function')
}

function openAIHarness(responses: AnyRecord[], callTool = vi.fn(async () => text('tool-result')), tools = [definition]) {
    const sends: AnyRecord[] = []
    const globalFetch = vi.fn(async (_url: string, options: AnyRecord) => {
        sends.push(structuredClone(options.body));
        const data = responses.shift() ?? { choices: [{ message: { content: 'final' } }] }
        return { ok: data.ok !== false, data: data.data ?? data }
    })
    const run = compileFunction('src/ts/process/request/openAI/requests.ts', 'async function requestHTTPOpenAI(',
        '\nexport async function requestOpenAILegacyInstruct', 'requestHTTPOpenAI', {
            getDatabase: () => db, globalFetch, getLocalNetworkRequestOptions: () => ({}), extractJSON: (value: unknown) => value,
            LLMFlags: { deepSeekThinkingOutput: 999 }, callTool, encodeToolCall: vi.fn(async () => ''), notifyError: vi.fn(),
            language: { errors: { httpError: 'http error' } },
        })
    const arg = { tools, modelInfo: { id: 'synthetic', flags: [] }, extractJson: false,
        multiGen: false, rememberToolUsage: false, abortSignal: new AbortController().signal }
    return { run: () => run('https://provider.test', { messages: [] }, {}, arg), sends, callTool, globalFetch }
}

function googleHarness(responses: AnyRecord[], callTool = vi.fn(async () => text('tool-result'))) {
    const sends: AnyRecord[] = []
    const fetchNative = vi.fn(async (_url: string, options: AnyRecord) => {
        sends.push(JSON.parse(options.body));
        const data = responses.shift() ?? { candidates: [{ content: { parts: [{ text: 'final' }] } }] }
        return new Response(JSON.stringify(data), { status: data.status ?? 200 })
    })
    const run = compileFunction('src/ts/process/request/google.ts', 'async function requestGoogle(',
        '\nfunction getTranStream(', 'requestGoogle', {
            getDatabase: () => db, LLMFormat: { GoogleCloud: 10, VertexAIGemini: 11 }, fetchNative,
            textifyReadableStream: vi.fn(), getTranStream: vi.fn(), wrapToolStream: vi.fn(), extractJSON: (value: unknown) => value,
            v4: () => 'id', saveInlayedSignature: vi.fn(), writeInlayImage: vi.fn(), setInlayAsset: vi.fn(),
            bodyIntercepterStore: [], callTool, encodeToolCall: vi.fn(async () => ''), geminiRetryBackoff: vi.fn(), notifyError: vi.fn(),
        })
    const arg = { tools: [definition], modelInfo: { id: 'synthetic', internalID: 'synthetic', format: 0 }, extractJson: false,
        rememberToolUsage: false, abortSignal: new AbortController().signal, useStreaming: false, saveSignatures: false }
    return { run: () => run('https://provider.test', { contents: [] }, {}, arg), sends, callTool, fetchNative }
}

function anthropicHarness(responses: AnyRecord[], callTool = vi.fn(async () => text('tool-result'))) {
    const sends: AnyRecord[] = []
    const globalFetch = vi.fn(async (_url: string, options: AnyRecord) => {
        sends.push(structuredClone(options.body));
        const data = responses.shift() ?? { content: [{ type: 'text', text: 'final' }] }
        return { ok: data.ok !== false, data: data.data ?? data }
    })
    const run = compileFunction('src/ts/process/request/anthropic.ts', 'async function requestClaudeHTTP(',
        '', 'requestClaudeHTTP', {
            getDatabase: () => db, fetchNative: vi.fn(), textifyReadableStream: vi.fn(), globalFetch, sleep: vi.fn(),
            callTool, encodeToolCall: vi.fn(async () => ''),
        })
    const arg = { tools: [definition], rememberToolUsage: false, abortSignal: new AbortController().signal, useStreaming: false }
    return { run: () => run('https://provider.test', {}, { messages: [{ role: 'user', content: 'hello' }] }, arg),
        sends, callTool, globalFetch }
}

const toolResponse = {
    openai: { choices: [{ message: { role: 'assistant', content: '', tool_calls: [{ id: 'call-1', type: 'function',
        function: { name: 'step', arguments: '{}' } }] } }] },
    google: { candidates: [{ content: { parts: [{ functionCall: { id: 'call-1', name: 'step', args: {} } }] } }] },
    anthropic: { content: [{ type: 'tool_use', id: 'call-1', name: 'step', input: {} }] },
}

beforeEach(() => { db.requestRetrys = 3; db.simplifiedToolUse = false })
afterEach(() => { delete (globalThis as AnyRecord).__bgOrchAbortSignal })

describe('[D2-2] BG request tool discovery and provider guards', () => {
    it('[unchanged] feeds plugin tool results through OpenAI, Google, and Anthropic non-stream follow-up requests', async () => {
        ;(globalThis as AnyRecord).__bgOrchAbortSignal = new AbortController().signal
        const cases = [openAIHarness([toolResponse.openai]), googleHarness([toolResponse.google]),
            anthropicHarness([toolResponse.anthropic])]
        for (const harness of cases) {
            const result = await harness.run()
            expect(result).toMatchObject({ type: 'success' })
            expect(result.result).toContain('final')
            expect(harness.callTool).toHaveBeenCalledWith('step', {})
            expect(JSON.stringify(harness.sends[1])).toContain('tool-result')
        }
    })

    it('[unchanged] assembles an OpenAI streaming tool call, invokes it once, and feeds its text into the follow-up stream', async () => {
        ;(globalThis as AnyRecord).__bgOrchAbortSignal = new AbortController().signal
        const callTool = vi.fn(async (_name: string, _args: unknown) => text('stream-tool-result'))
        const fetchNative = vi.fn(async () => new Response('next', { status: 200,
            headers: { 'content-type': 'text/event-stream' } }))
        const getTranStream = () => new TransformStream<Uint8Array, AnyRecord>({
            flush(controller) { controller.enqueue({ '0': 'stream-final' }) },
        })
        const wrap = compileFunction('src/ts/process/request/openAI/requests.ts', 'function wrapToolStream(', '',
            'wrapToolStream', { ReadableStream, getDatabase: () => db, callTool, encodeToolCall: vi.fn(), fetchNative,
                getLocalNetworkRequestOptions: () => ({}), getTranStream, notifyError: vi.fn(), JSON })
        const source = new ReadableStream<AnyRecord>({ start(controller) {
            controller.enqueue({ '0': '', '__tool_calls': JSON.stringify({ 0: { id: 'stream-call',
                function: { name: 'step', arguments: '{}' } } }) }); controller.close()
        } })
        const body = { messages: [] as AnyRecord[] }
        const stream = wrap(source, body, {}, 'https://provider.test', {
            tools: [definition], modelInfo: { id: 'synthetic' }, abortSignal: new AbortController().signal,
            rememberToolUsage: false,
        }) as ReadableStream<AnyRecord>
        const values: AnyRecord[] = []
        for await (const value of stream as any) values.push(value)
        expect(callTool).toHaveBeenCalledWith('step', {})
        expect(fetchNative).toHaveBeenCalledTimes(1)
        expect(JSON.stringify(body.messages)).toContain('stream-tool-result')
        expect(values.at(-1)?.['0']).toContain('stream-final')
    })

    it('[new] preserves provider-specific tool errors and performs no retry or fallback after the BG effect latch', async () => {
        ;(globalThis as AnyRecord).__bgOrchAbortSignal = new AbortController().signal
        const failure = () => vi.fn(async () => { throw Error('synthetic tool error') })
        const openai = openAIHarness([toolResponse.openai, { ok: false, data: { error: 'follow-up failed' } }], failure())
        const openaiResult = await openai.run()
        expect(openaiResult).toMatchObject({ type: 'success' })
        expect(JSON.stringify(openai.sends[1])).toContain('Tool call failed with error:')
        expect(openai.globalFetch).toHaveBeenCalledTimes(2)
        for (const harness of [googleHarness([toolResponse.google], failure()), anthropicHarness([toolResponse.anthropic], failure())]) {
            await expect(harness.run()).rejects.toThrow('synthetic tool error')
            expect(harness.callTool).toHaveBeenCalledTimes(1)
            expect(harness.sends).toHaveLength(1)
        }
    })

    it.each(['OpenAI', 'Google', 'Anthropic'] as const)(
        '[new] caps the %s BG classic loop at eight tool executions and nine model sends with the fixed marker', async provider => {
            ;(globalThis as AnyRecord).__bgOrchAbortSignal = new AbortController().signal
            const repeated = Array.from({ length: 12 }, () => provider === 'OpenAI' ? structuredClone(toolResponse.openai)
                : provider === 'Google' ? structuredClone(toolResponse.google) : structuredClone(toolResponse.anthropic))
            const harness = provider === 'OpenAI' ? openAIHarness(repeated)
                : provider === 'Google' ? googleHarness(repeated) : anthropicHarness(repeated)
            const result = await harness.run()
            expect(result).toMatchObject({ type: 'success' })
            expect(result.result).toContain('[BG: maximum tool steps (8) reached]')
            expect(harness.callTool).toHaveBeenCalledTimes(8)
            expect(harness.sends.length).toBeLessThanOrEqual(9)
        }, 10_000,
    )

    it('[unchanged] does not cap or suppress a follow-up retry for a BG classic loop with only non-plugin MCP tools', async () => {
        ;(globalThis as AnyRecord).__bgOrchAbortSignal = new AbortController().signal
        const responses = [...Array.from({ length: 9 }, () => structuredClone(toolResponse.openai)),
            { ok: false, data: { error: 'temporary external follow-up failure' } },
            { choices: [{ message: { content: 'external-final' } }] }]
        const harness = openAIHarness(responses, vi.fn(async () => text('external-result')), [externalDefinition])
        const result = await harness.run()
        expect(result).toMatchObject({ type: 'success' })
        expect(result.result).toContain('external-final')
        expect(harness.callTool).toHaveBeenCalledTimes(9)
        expect(result.result).not.toContain('[BG: maximum tool steps')
    })

    it.each(['plugin_invocation_expired', 'plugin_operation_closed'])(
        '[new] returns an OpenAI BG failure without a model follow-up when a plugin MCP call rejects with %s', async code => {
            ;(globalThis as AnyRecord).__bgOrchAbortSignal = new AbortController().signal
            const callTool = vi.fn(async () => { throw terminalError(code) })
            const harness = openAIHarness([toolResponse.openai, { choices: [{ message: { content: 'unexpected-follow-up' } }] }], callTool)
            const result = await harness.run()
            expect(result).toMatchObject({ type: 'fail' })
            expect(harness.sends).toHaveLength(1)
            expect(callTool).toHaveBeenCalledTimes(1)
        },
    )

    it.each(['plugin_invocation_expired', 'plugin_operation_closed'])(
        '[new] returns an OpenAI BG failure without a third send when the second plugin MCP call rejects with %s', async code => {
            ;(globalThis as AnyRecord).__bgOrchAbortSignal = new AbortController().signal
            const callTool = vi.fn()
                .mockResolvedValueOnce(text('first-tool-result'))
                .mockRejectedValueOnce(terminalError(code))
            const harness = openAIHarness([
                structuredClone(toolResponse.openai),
                structuredClone(toolResponse.openai),
                { choices: [{ message: { content: 'unexpected-third-response' } }] },
            ], callTool)
            const result = await harness.run()
            expect(result).toMatchObject({ type: 'fail' })
            expect(harness.sends).toHaveLength(2)
            expect(callTool).toHaveBeenCalledTimes(2)
        },
    )

    it.each(['plugin_invocation_expired', 'plugin_operation_closed'])(
        '[new] returns a ModelPreset BG failure without a model follow-up when a plugin MCP call rejects with %s', async code => {
            ;(globalThis as AnyRecord).__bgOrchAbortSignal = new AbortController().signal
            const callTool = vi.fn(async () => { throw terminalError(code) })
            const sendModelPreset = vi.fn()
                .mockResolvedValueOnce({ text: '', toolCalls: [{ id: 'call-1', name: 'step', arguments: '{}' }] })
                .mockResolvedValue({ text: 'unexpected-follow-up', toolCalls: [] })
            const request = compileModelPresetRequest({
                buildModelPresetCredential: () => ({}), resolveWireModelId: () => 'synthetic-model', toRequestKind: () => 'main',
                toLogSource: () => 'main',
                statusEnabled: () => false, createRequestLogScope: () => ({ setRoute: vi.fn(), wrap: (value: unknown) => value, close: vi.fn() }),
                resolvePresetStreaming: () => false, makeProxiedFetch: () => fetch, getDatabase: () => db,
                toAdapterToolDef: (value: unknown) => value, makeJobFetch: vi.fn(), VISION_CAPABLE_ADAPTER_KINDS: ['openai-compatible'],
                getCurrentChat: () => null, LLMFlags: { hasFullSystemPrompt: 1, hasFirstSystemPrompt: 2,
                    requiresAlternateRole: 3, mustStartWithUserInput: 4 }, reformater: (value: unknown) => value,
                safeStructuredClone: structuredClone, expandAdapterMessages: async (value: unknown) => value,
                decodeToolCall: vi.fn(), toAdapterMessage: (value: unknown) => value, previewModelPreset: vi.fn(),
                resolvePageFoldState: () => ({ kind: 'off' }),
                runToolLoop, MODEL_PRESET_MAX_TOOL_STEPS: 8, formatPresetReasoning: (value?: string) => value ?? '',
                sendModelPreset, encodeToolCall: vi.fn(), callTool,
                toolResponseText: () => '', performance, console,
                uuidv4: () => 'synthetic-id', TOOL_CAPABLE_ADAPTER_KINDS: ['openai-compatible'],
            })
            const preset = { id: 'preset', name: 'preset', toolUse: true, profileSnapshot: {
                adapterKind: 'openai-compatible', capabilities: ['tools'], modelId: 'synthetic-model',
                providerBaseId: 'synthetic-provider', auth: { kind: 'bearer' },
            } }
            const result = await request({ formated: [{ role: 'user', content: 'hello' }], tools: [definition],
                rememberToolUsage: false, chatId: 'synthetic-chat', useStreaming: false }, preset,
                new AbortController().signal)
            expect(result).toMatchObject({ type: 'fail' })
            expect(sendModelPreset).toHaveBeenCalledTimes(1)
            expect(callTool).toHaveBeenCalledTimes(1)
        },
    )

    it('[unchanged] leaves the ModelPreset eight-step marker and successful accumulated-result shape intact in BG', async () => {
        ;(globalThis as AnyRecord).__bgOrchAbortSignal = new AbortController().signal
        let sends = 0
        const callTool = vi.fn(async (_name: string, _args: unknown) => text('preset-result'))
        const loop = compileFunction('src/ts/process/request/request.ts', 'async function runModelPresetToolLoop(',
            '\nasync function executeModelPresetTool(', 'runModelPresetToolLoop', {
                runToolLoop, MODEL_PRESET_MAX_TOOL_STEPS: 8, formatPresetReasoning: (value: string) => value,
                sendModelPreset: vi.fn(async () => ({ text: '', toolCalls: [{ id: `call-${++sends}`, name: 'step', arguments: '{}' }] })),
                getDatabase: () => db, executeModelPresetTool: async (_arg: unknown, call: AnyRecord) => ({
                    text: (await callTool(call.name, JSON.parse(call.arguments)))[0].text, response: text('preset-result'),
                }), encodeToolCall: vi.fn(), console,
            })
        const result = await loop({ tools: [definition], rememberToolUsage: false }, {}, 'openai-compatible', undefined,
            fetch, [], [definition], new AbortController().signal)
        expect(result.toolsExecuted).toBe(true)
        expect(result.result).toContain('[ModelPreset: maximum tool steps (8) reached]')
        expect(callTool).toHaveBeenCalledTimes(8)
        expect(sends).toBeLessThanOrEqual(9)
    })

    it('[unchanged] keeps all three ModelPreset tool-use gates mandatory', () => {
        const source = readFileSync('src/ts/process/request/request.ts', 'utf8')
        expect(source).toContain("const supportsTools = preset.toolUse === true")
        expect(source).toContain('&& TOOL_CAPABLE_ADAPTER_KINDS.includes(kind)')
        expect(source).toContain("&& (caps?.includes('tools') ?? false)")
    })

    it('[new] strips plugin MCP tools from unsupported variants and fixes one per-plugin operation notice at mcp_list', () => {
        requireBgRegistration()
        const request = readFileSync('src/ts/process/request/request.ts', 'utf8')
        const notifications = readFileSync('src/ts/bgNotifications.ts', 'utf8')
        expect(request).toContain('plugin_mcp_unsupported')
        expect(request).toContain("phase: 'mcp_list'")
        expect(notifications).toContain("'plugin_mcp_unsupported'")
        expect(request).toMatch(/OpenAIResponseAPI[\s\S]{0,1200}plugin_mcp_unsupported|plugin_mcp_unsupported[\s\S]{0,1200}OpenAIResponseAPI/)
        expect(request).toMatch(/Anthropic[\s\S]{0,1200}plugin_mcp_unsupported|plugin_mcp_unsupported[\s\S]{0,1200}Anthropic/)
    })

    it('[unchanged] does not cap foreground classic provider recursion at eight tool rounds', async () => {
        const responses = [...Array.from({ length: 9 }, () => structuredClone(toolResponse.openai)),
            { choices: [{ message: { content: 'foreground-final' } }] }]
        const harness = openAIHarness(responses)
        const result = await harness.run()
        expect(result).toMatchObject({ type: 'success' })
        expect(result.result).toContain('foreground-final')
        expect(harness.callTool).toHaveBeenCalledTimes(9)
        expect(result.result).not.toContain('[BG: maximum tool steps')
    })
})
