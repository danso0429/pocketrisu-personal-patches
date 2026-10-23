import { get, writable } from 'svelte/store'

// Per-tab hint only. An ON/unknown hint requires a current server read before
// acquiring the input marker owner; the server independently rechecks runtime.
export const serverPluginHostSupport = writable<boolean | null>(null)
export const isServerPluginHostKnownOff = () => get(serverPluginHostSupport) === false
// Plugin MCP support is recorded with the same capability read. It is true only
// when the host is supported and the server reports serverPluginMcpVersion 1.
export const serverPluginMcpSupport = writable<boolean | null>(null)
export const isServerPluginMcpSupported = () => get(serverPluginMcpSupport) === true

export function observeServerPluginCapability(value: unknown): boolean {
    const capability = value as { contract?: unknown; serverPluginHostVersion?: unknown; serverPluginMcpVersion?: unknown } | null
    const enabled = capability?.contract === 'bg_orchestration_capabilities.v1'
        && capability.serverPluginHostVersion === 1
    serverPluginHostSupport.set(enabled)
    serverPluginMcpSupport.set(enabled && capability?.serverPluginMcpVersion === 1)
    return enabled
}

export async function canUseServerPluginHost(read: () => Promise<unknown>): Promise<boolean> {
    if (get(serverPluginHostSupport) === false) return false
    try { return observeServerPluginCapability(await read()) }
    catch { return observeServerPluginCapability(null) }
}
