import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import Module from 'node:module'
import { afterEach, describe, expect, it, vi } from 'vitest'

type AnyRecord = Record<string, any>
type SessionPlan = (api: (method: string, args: unknown[]) => Promise<unknown>, options: AnyRecord) => Promise<void>

const hostFile = fileURLToPath(new URL('./bgPluginHost.cjs', import.meta.url))
const hostSource = readFileSync(hostFile, 'utf8')
const openHosts: Array<{ close: () => Promise<void> }> = []
afterEach(async () => { while (openHosts.length) await openHosts.pop()!.close() })

function registry() {
    return { providers: new Map(), replacerbeforeRequest: new Set(), replacerafterRequest: new Set(),
        editinput: new Set(), editoutput: new Set(), editprocess: new Set(), editdisplay: new Set() }
}

function loadHost(createPluginSession: (options: AnyRecord) => Promise<AnyRecord>) {
    const source = hostSource.replace("const { createPluginSession } = require('./bgPluginSession.cjs');",
        'const { createPluginSession } = globalThis.__d2McpSessionHarness;')
    const testModule = new (Module as any)(hostFile)
    testModule.filename = hostFile
    testModule.paths = (Module as any)._nodeModulePaths(dirname(hostFile))
    ;(globalThis as any).__d2McpSessionHarness = { createPluginSession }
    try { (testModule as any)._compile(source, hostFile) }
    finally { delete (globalThis as any).__d2McpSessionHarness }
    return testModule.exports
}

function makeHarness(plans: Record<string, SessionPlan>) {
    const db: AnyRecord = { plugins: Object.keys(plans).map(name => ({ name, version: '3.0', enabled: true, script: name })),
        characters: [{ chatPage: 0, chats: [{ id: 'chat', message: [] }] }] }
    const notices: AnyRecord[] = []
    const installed = new Map<string, AnyRecord>()
    const installMCP = vi.fn((meta: AnyRecord, list: AnyRecord, call: AnyRecord) => {
        const client = { meta, list, call, active: true }
        installed.set(meta.identifier, client)
        return () => {
            client.active = false
            if (installed.get(meta.identifier) === client) installed.delete(meta.identifier)
        }
    })
    const bindings: AnyRecord = { registry: registry(), allowedDbKeys: [], bodyInterceptors: [], installMCP,
        nativeFetch: vi.fn(async () => ({ ok: true, status: 200, headers: {}, data: {} })),
        risuFetch: vi.fn(async () => ({ ok: true, status: 200, headers: {}, data: {} })),
        requestChatDataMain: vi.fn(async () => ({ type: 'success', result: 'ok' })),
        installProvider: vi.fn(() => () => {}), characterMetadata: (value: unknown) => value, moduleLorebooks: () => [] }
    const apis = new Map<string, (method: string, args: unknown[]) => Promise<unknown>>()
    const rootMethods = new Map<string, string[]>()
    const expired = new Set<string>()
    const createPluginSession = async (options: AnyRecord) => {
        const name = options.script as string
        apis.set(name, options.api)
        rootMethods.set(name, options.rootMethods)
        let closed = false
        return { failure: null, assertCurrent() {
            if (expired.has(name)) throw Object.assign(Error('expired'), { code: 'plugin_invocation_expired' })
            if (closed) throw Object.assign(Error('closed'), { code: 'plugin_operation_closed' })
        },
            currentSignal: () => new AbortController().signal, pullAbsentApis: async () => ({ names: [], overflow: false }),
            load: async () => plans[name](options.api, options), close: async () => { closed = true } }
    }
    const controller = new AbortController()
    const beforeEffect = vi.fn(async () => {})
    const values = new Map<string, string>()
    const storageOwner = { kvGet: (key: string) => values.get(key) ?? null,
        kvSet: (key: string, value: string) => values.set(key, value), kvDel: (key: string) => values.delete(key),
        kvList: () => [], transaction: (task: () => unknown) => task(), peekRoot: () => db, getRoot: async () => db }
    const { createBgPluginHost } = loadHost(createPluginSession)
    const start = async () => {
        const host = await createBgPluginHost({ database: db, bindings, getDatabase: () => db,
            getSelection: () => ({ characterIndex: 0, chatIndex: 0 }), hydrate: vi.fn(), storageOwner, beforeEffect,
            publishNotification: (event: AnyRecord) => { notices.push(event); return { status: 'stored' } },
            operation: { operationId: 'operation-d2-0001', charId: 'char', chatId: 'chat', inputPreparedOnClient: false },
            signal: controller.signal })
        openHosts.push(host)
        return host
    }
    return { start, db, bindings, installMCP, installed, apis, rootMethods, notices, beforeEffect, controller,
        expire: (name: string) => expired.add(name) }
}

const meta = (identifier: string, name = identifier) => ({ identifier, name, version: '1.0', description: 'test MCP' })
const tool = (name = 'lookup') => ({ name, description: 'lookup', inputSchema: { type: 'object' } })
const text = (value = 'ok') => [{ type: 'text', text: value }]

async function rejectionWithoutUnsupported(task: Promise<unknown>) {
    let caught: any
    try { await task } catch (error) { caught = error }
    expect(caught, 'the call must reject').toBeTruthy()
    expect(caught?.code, 'the implemented MCP API must decide the rejection').not.toBe('plugin_api_unsupported')
    return caught
}

describe('[D2-1] BG plugin MCP registration and calls', () => {
    it('[new] stages load-time registration, replaces a same-owner duplicate, and installs only after load succeeds', async () => {
        let loadFinished = false
        const firstList = vi.fn(async () => [tool('old')])
        const secondList = vi.fn(async () => [tool('new')])
        const h = makeHarness({ alpha: async api => {
            await api('registerMCP', [meta('plugin:weather'), firstList, async () => text('old')])
            expect(h.installed.size, 'registration must remain staged during load').toBe(0)
            await api('registerMCP', [meta('plugin:weather'), secondList, async () => text('new')])
            loadFinished = true
        } })
        await h.start()
        expect(h.rootMethods.get('alpha')).toContain('registerMCP')
        expect(loadFinished).toBe(true)
        expect(h.installMCP).toHaveBeenCalledTimes(1)
        expect(await h.installed.get('plugin:weather')?.list()).toEqual([tool('new')])
    })

    it('[new] rolls back a failed load while reserving its identifier against a later plugin load', async () => {
        let betaRejected = false
        const h = makeHarness({ alpha: async api => {
            await api('registerMCP', [meta('plugin:shared'), async () => [tool()], async () => text()])
            throw Error('synthetic load failure')
        }, beta: async api => {
            try { await api('registerMCP', [meta('plugin:shared'), async () => [tool()], async () => text()]) }
            catch (error: any) { betaRejected = error?.code !== 'plugin_api_unsupported' }
        } })
        await h.start()
        expect(h.rootMethods.get('alpha')).toContain('registerMCP')
        expect(betaRejected).toBe(true)
        expect(h.installed.has('plugin:shared')).toBe(false)
    })

    it('[new] rejects cross-plugin registration and unregistration without disturbing the owner client', async () => {
        let registerRejected = false, unregisterRejected = false
        const ownerCall = vi.fn(async () => text('alpha'))
        const h = makeHarness({ alpha: async api => {
            await api('registerMCP', [meta('plugin:alpha'), async () => [tool()], ownerCall])
        }, beta: async api => {
            try { await api('registerMCP', [meta('plugin:alpha'), async () => [tool()], async () => text('beta')]) }
            catch (error: any) { registerRejected = error?.code !== 'plugin_api_unsupported' }
            try { await api('unregisterMCP', ['plugin:alpha']) }
            catch (error: any) { unregisterRejected = error?.code !== 'plugin_api_unsupported' }
        } })
        await h.start()
        expect(registerRejected).toBe(true)
        expect(unregisterRejected).toBe(true)
        expect(await h.installed.get('plugin:alpha')?.call('lookup', {})).toEqual(text('alpha'))
        expect(ownerCall).toHaveBeenCalledTimes(1)
    })

    it('[new] rejects non-literal plugin prefixes without pinning a new error code or the plugin-colon-only case', async () => {
        const rejected: string[] = []
        const invalid = ['http://localhost:3000', 'mcp:tool', '', 'PLUGIN:upper']
        const h = makeHarness({ alpha: async api => {
            for (const identifier of invalid) {
                try { await api('registerMCP', [meta(identifier), async () => [tool()], async () => text()]) }
                catch (error: any) { if (error?.code !== 'plugin_api_unsupported') rejected.push(identifier) }
            }
        } })
        await h.start()
        expect(h.rootMethods.get('alpha')).toContain('registerMCP')
        expect(rejected).toEqual(invalid)
        expect(h.installMCP).not.toHaveBeenCalled()
    })

    it('[new] rejects registerMCP after load but permits same-owner unregisterMCP during a hook', async () => {
        const h = makeHarness({ late: async () => {}, owner: async api => {
            await api('registerMCP', [meta('plugin:owned'), async () => [tool()], async () => text()])
        } })
        await h.start()
        const lateApi = h.apis.get('late')!
        const ownerApi = h.apis.get('owner')!
        await rejectionWithoutUnsupported(lateApi('registerMCP', [meta('plugin:late'), async () => [tool()], async () => text()]))
        expect(h.installed.has('plugin:late')).toBe(false)
        expect(h.installed.has('plugin:owned')).toBe(true)
        let unregisterError: unknown
        try { await ownerApi('unregisterMCP', ['plugin:owned']) }
        catch (error) { unregisterError = error }
        expect(unregisterError).toBeUndefined()
        expect(h.installed.has('plugin:owned')).toBe(false)
    })

    it('[new] validates list and call results, propagates failures, disables the entry, and emits the fixed phases and existing codes', async () => {
        const modes = [
            { name: 'list throw', list: async () => { throw Error('list failed') }, call: async () => text(), phase: 'mcp_list' },
            { name: 'list shape', list: async () => ({ bad: true }), call: async () => text(), phase: 'mcp_list' },
            { name: 'call throw', list: async () => [tool()], call: async () => { throw Error('call failed') }, phase: 'mcp_call' },
            { name: 'call shape', list: async () => [tool()], call: async () => [{ type: 'unknown' }], phase: 'mcp_call' },
        ]
        for (const [index, mode] of modes.entries()) {
            const identifier = `plugin:invalid-${index}`
            const h = makeHarness({ alpha: async api => {
                await api('registerMCP', [meta(identifier), mode.list, mode.call])
            } })
            const host = await h.start()
            const client = h.installed.get(identifier)
            expect(client, `${mode.name}: installMCP client`).toBeTruthy()
            const action = mode.phase === 'mcp_list' ? client.list() : client.call('lookup', {})
            await expect(action, mode.name).rejects.toBeTruthy()
            await host.assertNotifications()
            expect(h.notices.at(-1), mode.name).toMatchObject({ code: 'plugin_hook_failed', phase: mode.phase })
            await expect(client.list(), `${mode.name}: disabled entry`).rejects.toBeTruthy()
            await host.close(); openHosts.pop()
        }
    })

    it('[new] runs the effect and identity barrier before mcp_call but never for mcp_list', async () => {
        const order: string[] = []
        const h = makeHarness({ alpha: async api => {
            await api('registerMCP', [meta('plugin:barrier'), async () => { order.push('list'); return [tool()] },
                async () => { order.push('call'); throw Error('effect failure') }])
        } })
        h.beforeEffect.mockImplementation(async () => { order.push('beforeEffect') })
        const host = await h.start()
        const client = h.installed.get('plugin:barrier')
        expect(await client?.list()).toEqual([tool()])
        expect(h.beforeEffect).not.toHaveBeenCalled()
        await expect(client?.call('lookup', {})).rejects.toBeTruthy()
        await host.assertNotifications()
        expect(order).toEqual(['list', 'beforeEffect', 'call'])
        expect(h.notices.at(-1)).toMatchObject({ code: 'plugin_hook_failed', phase: 'mcp_call', effectsMayHaveOccurred: true })
    })

    it('[new] cleans installed clients on unregister, disable, rollback, and idempotent host close', async () => {
        const h = makeHarness({ alpha: async api => {
            await api('registerMCP', [meta('plugin:ephemeral'), async () => [tool()], async () => text()])
        } })
        const host = await h.start()
        const stale = h.installed.get('plugin:ephemeral')
        expect(stale).toBeTruthy()
        await host.close(); openHosts.pop()
        await host.close()
        expect(h.installed.has('plugin:ephemeral')).toBe(false)
        await expect(stale.list()).rejects.toBeTruthy()
    })

    it('[new] pointer-checks cleanup so an earlier job cannot remove a later job client', async () => {
        const first = makeHarness({ alpha: async api => {
            await api('registerMCP', [meta('plugin:shared'), async () => [tool('first')], async () => text('first')])
        } })
        const firstHost = await first.start()
        const firstClient = first.installed.get('plugin:shared')
        const second = makeHarness({ beta: async api => {
            await api('registerMCP', [meta('plugin:shared'), async () => [tool('second')], async () => text('second')])
        } })
        const secondHost = await second.start()
        const secondClient = second.installed.get('plugin:shared')
        expect(firstClient).not.toBe(secondClient)
        await firstHost.close(); openHosts.splice(openHosts.indexOf(firstHost), 1)
        expect(await secondClient.list()).toEqual([tool('second')])
        expect(await secondClient.call('second', {})).toEqual(text('second'))
        await secondHost.close(); openHosts.splice(openHosts.indexOf(secondHost), 1)
    })

    it('[new] shares the 128-operation budget between mcp_call dispatch and plugin fetch while leaving mcp_list dispatch uncharged', async () => {
        let api!: (method: string, args: unknown[]) => Promise<unknown>
        let callCount = 0
        const h = makeHarness({ alpha: async hostApi => {
            api = hostApi
            await api('registerMCP', [meta('plugin:budget'), async () => {
                await api('nativeFetch', ['https://example.test/list', {}])
                return [tool()]
            }, async () => {
                callCount++
                for (let index = 0; index < 126; index++) await api('nativeFetch', ['https://example.test/call', {}])
                return text()
            }])
        } })
        const host = await h.start()
        const client = h.installed.get('plugin:budget')
        expect(client, 'the budget MCP client must be installed').toBeTruthy()
        if (!client) return
        await expect(client.list()).resolves.toEqual([tool()])
        await expect(client.call('lookup', {})).resolves.toEqual(text())
        await expect(client.call('lookup', {})).rejects.toBeTruthy()
        await host.assertNotifications()
        expect(callCount).toBe(1)
        expect(h.notices.at(-1)).toMatchObject({ code: 'plugin_host_limit', reason: 'operation_budget', phase: 'mcp_call' })
    })

    it('[new] refuses cancelled work before dispatch and suppresses a late successful callback result', async () => {
        let resolveCall!: (value: unknown) => void
        const called = vi.fn()
        const h = makeHarness({ alpha: async api => {
            await api('registerMCP', [meta('plugin:cancel'), async () => [tool()], async () => {
                called()
                return await new Promise(resolve => { resolveCall = resolve })
            }])
        } })
        await h.start()
        const client = h.installed.get('plugin:cancel')
        expect(client, 'the cancellation MCP client must be installed').toBeTruthy()
        if (!client) return
        const pending = client.call('lookup', {})
        await vi.waitFor(() => expect(called).toHaveBeenCalledTimes(1))
        h.controller.abort(Error('cancelled'))
        resolveCall(text('too late'))
        await expect(pending).rejects.toBeTruthy()
        await expect(client.list()).rejects.toBeTruthy()
        expect(called).toHaveBeenCalledTimes(1)
    })

    it('[new] pre-checks the existing session deadline before mcp_list or mcp_call without inventing a per-call timeout', async () => {
        const list = vi.fn(async () => [tool()]), call = vi.fn(async () => text())
        const h = makeHarness({ alpha: async api => {
            await api('registerMCP', [meta('plugin:deadline'), list, call])
        } })
        await h.start()
        const client = h.installed.get('plugin:deadline')
        expect(client, 'the deadline MCP client must be installed').toBeTruthy()
        if (!client) return
        h.expire('alpha')
        await expect(client.list()).rejects.toBeTruthy()
        await expect(client.call('lookup', {})).rejects.toBeTruthy()
        expect(list).not.toHaveBeenCalled()
        expect(call).not.toHaveBeenCalled()
    })
})
