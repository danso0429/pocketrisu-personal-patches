import { get, writable } from 'svelte/store'

// Per-tab hint only. An ON/unknown hint requires a current server read before
// acquiring the input marker owner; the server independently rechecks runtime.
export const serverPluginHostSupport = writable<boolean | null>(null)
export const isServerPluginHostKnownOff = () => get(serverPluginHostSupport) === false

export function observeServerPluginCapability(value: unknown): boolean {
    const capability = value as { contract?: unknown; serverPluginHostVersion?: unknown } | null
    const enabled = capability?.contract === 'bg_orchestration_capabilities.v1'
        && capability.serverPluginHostVersion === 1
    serverPluginHostSupport.set(enabled)
    return enabled
}

export async function canUseServerPluginHost(read: () => Promise<unknown>): Promise<boolean> {
    if (get(serverPluginHostSupport) === false) return false
    try { return observeServerPluginCapability(await read()) }
    catch { return observeServerPluginCapability(null) }
}
