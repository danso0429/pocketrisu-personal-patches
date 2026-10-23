import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import Module from 'node:module'
import { describe, expect, it, vi } from 'vitest'

type AnyRecord = Record<string, any>
const hostFile = fileURLToPath(new URL('./bgPluginHost.cjs', import.meta.url))
const hostSource = readFileSync(hostFile, 'utf8')

function loadHost(createPluginSession: (options: AnyRecord) => Promise<AnyRecord>) {
    const source = hostSource.replace("const { createPluginSession } = require('./bgPluginSession.cjs');",
        'const { createPluginSession } = globalThis.__d2McpExposureSession;')
    const testModule = new (Module as any)(hostFile)
    testModule.filename = hostFile
    testModule.paths = (Module as any)._nodeModulePaths(dirname(hostFile))
    ;(globalThis as any).__d2McpExposureSession = { createPluginSession }
    try { (testModule as any)._compile(source, hostFile) }
    finally { delete (globalThis as any).__d2McpExposureSession }
    return testModule.exports
}

describe('[D2-2] BG request tool discovery and provider guards', () => {
    it('[unchanged] leaves the second plugin-channel tool path unavailable in the BG guest API', () => {
        const { SUPPORTED_ROOT_METHODS } = loadHost(async () => ({}))
        expect(SUPPORTED_ROOT_METHODS).not.toContain('addPluginChannelListener')
        expect(SUPPORTED_ROOT_METHODS).not.toContain('postPluginChannelMessage')
    })

    it('[new] keeps a registered plugin MCP out of the plugin direct runLLMModel sub-request', async () => {
        let api!: (method: string, args: unknown[]) => Promise<unknown>
        const requestChatDataMain = vi.fn(async (arg: AnyRecord) => ({ type: 'success', result: JSON.stringify(arg) }))
        const installMCP = vi.fn(() => () => {})
        const createPluginSession = async (options: AnyRecord) => {
            api = options.api
            return { failure: null, assertCurrent() {}, currentSignal: () => new AbortController().signal,
                pullAbsentApis: async () => ({ names: [], overflow: false }), close: async () => {},
                load: async () => api('registerMCP', [{ identifier: 'plugin:direct', name: 'direct', version: '1', description: '' },
                    async () => [{ name: 'recursive', description: '', inputSchema: { type: 'object' } }],
                    async () => [{ type: 'text', text: 'result' }]]) }
        }
        const { createBgPluginHost } = loadHost(createPluginSession)
        const plugin = { name: 'direct-llm', version: '3.0', enabled: true, script: 'direct-llm' }
        const db = { plugins: [plugin], characters: [] }
        const values = new Map<string, string>()
        const host = await createBgPluginHost({ database: db,
            bindings: { registry: { providers: new Map(), replacerbeforeRequest: new Set(), replacerafterRequest: new Set(),
                editinput: new Set(), editoutput: new Set(), editprocess: new Set(), editdisplay: new Set() },
            allowedDbKeys: [], bodyInterceptors: [], nativeFetch: vi.fn(), risuFetch: vi.fn(), requestChatDataMain,
            installProvider: () => () => {}, installMCP, characterMetadata: (value: unknown) => value, moduleLorebooks: () => [] },
            getDatabase: () => db, getSelection: () => ({ characterIndex: -1, chatIndex: -1 }), hydrate: vi.fn(), beforeEffect: vi.fn(),
            storageOwner: { kvGet: (key: string) => values.get(key) ?? null, kvSet: (key: string, value: string) => values.set(key, value),
                kvDel: (key: string) => values.delete(key), kvList: () => [], transaction: (task: () => unknown) => task(), peekRoot: () => db },
            publishNotification: () => ({ status: 'stored' }),
            operation: { operationId: 'operation-direct-llm', charId: 'char', chatId: 'chat' }, signal: new AbortController().signal })
        try {
            expect(installMCP, 'load-time registration must install before the direct call').toHaveBeenCalledTimes(1)
            await expect(api('runLLMModel', [{ mode: 'model',
                messages: [{ role: 'user', content: 'subrequest' }] }])).resolves.toBeTruthy()
            expect(requestChatDataMain).toHaveBeenCalledTimes(1)
            expect(requestChatDataMain.mock.calls[0][0]).not.toHaveProperty('tools')
        } finally { await host.close() }
    })
})
