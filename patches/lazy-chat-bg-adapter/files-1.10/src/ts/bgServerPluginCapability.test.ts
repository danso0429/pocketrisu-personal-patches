import { beforeEach, describe, expect, it, vi } from 'vitest'
import { get } from 'svelte/store'
import { serverPluginHostSupport, observeServerPluginCapability, canUseServerPluginHost } from './bgServerPluginCapability'
const on = { contract: 'bg_orchestration_capabilities.v1', serverPluginHostVersion: 1 }
describe('server plugin runtime hints', () => {
    beforeEach(() => serverPluginHostSupport.set(null))
    it('does not query a known OFF runtime before the input marker owner', async () => {
        observeServerPluginCapability({ contract: on.contract })
        const read = vi.fn(async () => on)
        expect(await canUseServerPluginHost(read)).toBe(false)
        expect(read).not.toHaveBeenCalled()
    })
    it('reads unknown and rechecks ON; a stale ON cannot authorize input', async () => {
        const read = vi.fn(async () => on)
        expect(await canUseServerPluginHost(read)).toBe(true)
        expect(read).toHaveBeenCalledTimes(1)
        const off = vi.fn(async () => ({ contract: on.contract, serverPluginHostVersion: 0 }))
        expect(await canUseServerPluginHost(off)).toBe(false)
        expect(off).toHaveBeenCalledTimes(1)
        expect(get(serverPluginHostSupport)).toBe(false)
    })
    it('invalid contracts and read failures cannot seed ON', async () => {
        expect(observeServerPluginCapability({ serverPluginHostVersion: 1 })).toBe(false)
        serverPluginHostSupport.set(null)
        expect(await canUseServerPluginHost(async () => { throw Error('synthetic unavailable') })).toBe(false)
        expect(get(serverPluginHostSupport)).toBe(false)
    })
    it('resumes live checks when legacy negotiation refreshes an OFF hint', async () => {
        observeServerPluginCapability(null)
        observeServerPluginCapability(on)
        expect(get(serverPluginHostSupport)).toBe(true)
        const read = vi.fn(async () => ({ contract: on.contract }))
        expect(await canUseServerPluginHost(read)).toBe(false)
        expect(read).toHaveBeenCalledTimes(1)
    })
})

describe('[D2-3] Plugin MCP server-input admission', () => {
    it('[new] records MCP support only for the exact capability contract and matching host and MCP versions', async () => {
        const capability = await import('./bgServerPluginCapability') as Record<string, any>
        const supported = capability.isServerPluginMcpSupported
        expect(supported, 'isServerPluginMcpSupported must be exported').toBeTypeOf('function')
        expect(observeServerPluginCapability({ contract: on.contract,
            serverPluginHostVersion: 1, serverPluginMcpVersion: 1 })).toBe(true)
        expect(supported()).toBe(true)
        for (const value of [
            { contract: on.contract, serverPluginHostVersion: 1 },
            { contract: on.contract, serverPluginHostVersion: 0, serverPluginMcpVersion: 1 },
            { contract: on.contract, serverPluginHostVersion: 1, serverPluginMcpVersion: 0 },
            { contract: 'other', serverPluginHostVersion: 1, serverPluginMcpVersion: 1 },
        ]) {
            observeServerPluginCapability(value)
            expect(supported(), JSON.stringify(value)).toBe(false)
        }
    })

    it('[unchanged] preserves the legacy host-only negotiation result when the MCP field is absent', () => {
        expect(observeServerPluginCapability(on)).toBe(true)
        expect(get(serverPluginHostSupport)).toBe(true)
    })
})
