import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import Module from 'node:module'
import { describe, expect, it, vi } from 'vitest'

type AnyRecord = Record<string, any>

const hostFile = fileURLToPath(new URL('./bgPluginHost.cjs', import.meta.url))
const hostSource = readFileSync(hostFile, 'utf8')

function registry() {
    return { providers: new Map(), replacerbeforeRequest: new Set(), replacerafterRequest: new Set(),
        editinput: new Set(), editoutput: new Set(), editprocess: new Set(), editdisplay: new Set() }
}

function loadHostWithSession(createPluginSession: (options: AnyRecord) => Promise<AnyRecord>) {
    const source = hostSource.replace("const { createPluginSession } = require('./bgPluginSession.cjs');",
        'const { createPluginSession } = globalThis.__d3SessionHarness;')
    const testModule = new (Module as any)(hostFile)
    testModule.filename = hostFile
    testModule.paths = (Module as any)._nodeModulePaths(dirname(hostFile))
    ;(globalThis as any).__d3SessionHarness = { createPluginSession }
    try { (testModule as any)._compile(source, hostFile) }
    finally { delete (globalThis as any).__d3SessionHarness }
    return testModule.exports
}

async function hostHarness(configs: Array<{ candidates: number, result: AnyRecord }>) {
    const calls: AnyRecord[] = []
    const sessions: AnyRecord[] = []
    const createPluginSession = vi.fn(async (options: AnyRecord) => {
        const index = sessions.length
        const config = configs[index]
        const session = {
            failure: null,
            assertCurrent: vi.fn(),
            currentSignal: () => new AbortController().signal,
            pullAbsentApis: async () => ({ names: [], overflow: false }),
            load: async () => {
                await options.api('addRisuReplacer', ['afterRequest', async (value: string) => {
                    calls.push({ type: 'after-callback', index, value })
                    return value
                }])
                await options.api('addRisuScriptHandler', ['output', async (value: string) => {
                    calls.push({ type: 'output-callback', index, value })
                    return value
                }])
                return { ready: true }
            },
            runPostResponseEligible: vi.fn(async (task: () => unknown) => task()),
            postResponseCandidates: vi.fn(async () => config.candidates),
            openPostResponse: vi.fn(async (options: AnyRecord) => {
                calls.push({ type: 'open', index, options })
                return config.result
            }),
            close: vi.fn(async () => { calls.push({ type: 'close', index }) }),
        }
        sessions.push(session)
        return session
    })
    const plugins = configs.map((_, index) => ({ name: `d3-plugin-${index}`, version: '3.0', enabled: true, script: 'void 0' }))
    const permissions = plugins.map(plugin => JSON.stringify([plugin.name, 'replacer']))
    const values = new Map<string, string>([['cache/plugin-permissions/state.json', JSON.stringify({
        given: permissions, denied: [], cache: permissions.map(key => [key + '_lastGrantTime', Date.now()]),
    })]])
    const bindings = { registry: registry(), allowedDbKeys: [], bodyInterceptors: [], nativeFetch() {}, risuFetch() {},
        requestChatDataMain() {}, installProvider() {}, characterMetadata() {}, moduleLorebooks: () => [] }
    const db = { plugins, characters: [{ chatPage: 0, chats: [{ id: 'chat', message: [] }] }] }
    const { createBgPluginHost } = loadHostWithSession(createPluginSession)
    const host = await createBgPluginHost({ database: db, bindings, getDatabase: () => db,
        getSelection: () => ({ characterIndex: 0, chatIndex: 0 }), hydrate: vi.fn(), beforeEffect: vi.fn(),
        storageOwner: { kvGet: (key: string) => values.get(key) ?? null,
            kvSet: (key: string, value: string) => values.set(key, value), kvDel: (key: string) => values.delete(key),
            kvList: (prefix: string) => [...values.keys()].filter(key => key.startsWith(prefix)),
            transaction: (task: () => unknown) => task(), peekRoot: () => db },
        publishNotification: () => ({ status: 'stored' }), operation: {
            operationId: 'operation-d3-host', charId: 'character-d3', chatId: 'chat-d3',
        }, signal: new AbortController().signal })
    return { host: host as AnyRecord, sessions, calls, bindings }
}

describe('[D3-1] Post-commit continuation for afterRequest timers', () => {
    it('[unchanged] keeps the existing 600 second session default', () => {
        const sessionSource = readFileSync(new URL('./bgPluginSession.cjs', import.meta.url), 'utf8')
        expect(sessionSource).toMatch(/runtimeMs\s*=\s*600_?000/)
    })

    it('[new] grants eligibility only to the afterRequest replacer and seals candidates before hand-over', async () => {
        const h = await hostHarness([{ candidates: 1, result: { status: 'drained' } }])
        expect(h.host.handOver, 'host.handOver must expose the post-response participant boundary').toBeTypeOf('function')
        const after = [...h.bindings.registry.replacerafterRequest][0] as (value: string) => Promise<string>
        const output = [...h.bindings.registry.editoutput][0] as (value: string) => Promise<string>
        await expect(after('answer')).resolves.toBe('answer')
        await expect(output('answer')).resolves.toBe('answer')
        expect(h.sessions[0].runPostResponseEligible).toHaveBeenCalledTimes(1)
        expect(h.sessions[0].postResponseCandidates).not.toHaveBeenCalled()
        await h.host.handOver()
        expect(h.sessions[0].postResponseCandidates).toHaveBeenCalledTimes(1)
        await h.host.close()
    })

    it('[new] memoizes hand-over, closes nonparticipants, and reports the fixed participant identity shape', async () => {
        const h = await hostHarness([
            { candidates: 1, result: { status: 'drained' } },
            { candidates: 0, result: { status: 'none' } },
        ])
        expect(h.host.handOver, 'host.handOver must exist').toBeTypeOf('function')
        const first = h.host.handOver()
        const second = h.host.handOver()
        expect(second).toBe(first)
        await expect(first).resolves.toEqual({ participants: [
            { index: 0, pluginName: 'd3-plugin-0', pluginVersion: '3.0' },
        ] })
        expect(h.sessions[0].close).not.toHaveBeenCalled()
        expect(h.sessions[1].close).toHaveBeenCalledTimes(1)
        await h.host.close()
    })

    it('[new] aggregates participant results in parallel with uncertain taking precedence', async () => {
        const h = await hostHarness([
            { candidates: 1, result: { status: 'drained' } },
            { candidates: 1, result: { status: 'uncertain', reason: 'deadline' } },
            { candidates: 1, result: { status: 'none' } },
        ])
        expect(h.host.openPostResponse, 'host.openPostResponse must exist').toBeTypeOf('function')
        await h.host.handOver()
        const controller = new AbortController()
        const deadline = performance.now() + 100
        await expect(h.host.openPostResponse({ deadline, signal: controller.signal }))
            .resolves.toEqual({ status: 'uncertain', reason: 'deadline' })
        expect(h.sessions.every(session => session.openPostResponse.mock.calls[0][0].deadline === deadline)).toBe(true)
        expect(h.sessions.every(session => session.openPostResponse.mock.calls[0][0].signal === controller.signal)).toBe(true)
        await h.host.close()
    })

    it('[new] returns none without participants even for an aborted signal and never opens a session', async () => {
        const h = await hostHarness([{ candidates: 0, result: { status: 'drained' } }])
        expect(h.host.openPostResponse, 'host.openPostResponse must exist').toBeTypeOf('function')
        await h.host.handOver()
        const controller = new AbortController(); controller.abort()
        await expect(h.host.openPostResponse({ deadline: performance.now() - 1, signal: controller.signal }))
            .resolves.toEqual({ status: 'none' })
        expect(h.sessions[0].openPostResponse).not.toHaveBeenCalled()
        await h.host.close()
    })

    it('[new] rejects opening before hand-over with the fixed uncertain result rather than throwing', async () => {
        const h = await hostHarness([{ candidates: 1, result: { status: 'drained' } }])
        expect(h.host.openPostResponse, 'host.openPostResponse must exist').toBeTypeOf('function')
        await expect(h.host.openPostResponse({ deadline: performance.now() + 100, signal: new AbortController().signal }))
            .resolves.toEqual({ status: 'uncertain', reason: 'error' })
        await h.host.close()
    })

    it('[new] memoizes close and aborts a participant window before completing teardown', async () => {
        const h = await hostHarness([{ candidates: 1, result: { status: 'uncertain', reason: 'aborted' } }])
        expect(h.host.handOver, 'host.handOver must exist').toBeTypeOf('function')
        await h.host.handOver()
        const opened = h.host.openPostResponse({ deadline: performance.now() + 1000, signal: new AbortController().signal })
        const first = h.host.close()
        const second = h.host.close()
        expect(second).toBe(first)
        await expect(opened).resolves.toEqual({ status: 'uncertain', reason: 'aborted' })
        await first
        expect(h.sessions[0].close).toHaveBeenCalledTimes(1)
    })
})
