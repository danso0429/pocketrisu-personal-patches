import { get } from 'svelte/store'
import { pluginV2, allowedDbKeys } from './plugins/plugins.svelte'
import { customV3ProviderMetaStore } from './plugins/apiV3/v3.svelte'
import { bodyIntercepterStore } from './stores.svelte'
import { customProviderStore } from './plugins/plugins.svelte'
import { LLMProvider, LLMFormat, LLMFlags, LLMTokenizer, type LLMModel } from './model/types'
import { fetchNative, globalFetch } from './globalApi.svelte'
import { requestChatDataMain } from './process/request/request'
import { projectChatMetadata } from './plugins/apiV3/pluginChatAccess'
import { getModuleLorebooks } from './process/modules'
import { registerMCPModule, registeredCustomPluginMCPs } from './process/mcp/pluginmcp'
import { MCPs } from './process/mcp/mcp'
import type { MCPTool, RPCToolCallContent } from './process/mcp/mcplib'

// Only the detached server bundle exposes this adapter. Admission is unchanged.
export const bgPluginBindings = {
    registry: pluginV2, allowedDbKeys, bodyInterceptors: bodyIntercepterStore,
    nativeFetch: fetchNative, risuFetch: globalFetch, requestChatDataMain,
    characterMetadata: (character: any) => ({ ...character,
        chats: Array.isArray(character.chats) ? character.chats.map(projectChatMetadata) : [] }),
    moduleLorebooks: () => getModuleLorebooks(),
    installProvider(name: string, callback: any, options: any = {}) {
        if (pluginV2.providers.has(name) || customV3ProviderMetaStore.some(model => model.id === `pluginmodel:::${name}`)) {
            throw Object.assign(new Error('plugin_provider_name_conflict'), { code: 'plugin_provider_name_conflict' })
        }
        const priorNames = get(customProviderStore)
        const model: LLMModel = {
            id: `pluginmodel:::${name}`, name: options.model?.name ?? name,
            shortName: options.model?.shortName ?? name, fullName: options.model?.fullName ?? name,
            internalID: options.model?.internalID ?? `pluginmodel:::${name}`,
            provider: LLMProvider.AsIs, format: LLMFormat.Plugin,
            flags: options.model?.flags ?? [LLMFlags.hasFullSystemPrompt],
            parameters: options.model?.parameters ?? ['temperature', 'top_p', 'frequency_penalty',
                'presence_penalty', 'repetition_penalty', 'min_p', 'top_a', 'top_k', 'thinking_tokens'],
            tokenizer: options.model?.tokenizer ?? LLMTokenizer.Unknown,
        }
        pluginV2.providers.set(name, callback)
        pluginV2.providerOptions.set(name, options)
        customProviderStore.set([...priorNames, name])
        customV3ProviderMetaStore.push(model)
        return () => {
            if (pluginV2.providers.get(name) === callback) {
                pluginV2.providers.delete(name)
                pluginV2.providerOptions.delete(name)
                const names = [...get(customProviderStore)]
                const index = names.lastIndexOf(name)
                if (index >= 0) names.splice(index, 1)
                customProviderStore.set(names)
            }
            const index = customV3ProviderMetaStore.indexOf(model)
            if (index >= 0) customV3ProviderMetaStore.splice(index, 1)
        }
    },
    // One host MCP registration in the shared plugin registry. The cleanup
    // removes the registry entry and the MCP client cache only while they still
    // point at this installation's client, so a later installation under the
    // same identifier is never evicted by an earlier one.
    installMCP(meta: any, getToolList: () => Promise<MCPTool[]>,
        callTool: (toolName: string, args: any) => Promise<RPCToolCallContent[]>) {
        const identifier = meta?.identifier
        if (typeof identifier !== 'string' || !identifier.startsWith('plugin:')) {
            throw Object.assign(new Error('plugin_registration_invalid'), { code: 'plugin_registration_invalid' })
        }
        void registerMCPModule({ identifier, name: String(meta.name ?? ''), version: String(meta.version ?? ''),
            description: String(meta.description ?? '') }, getToolList, callTool)
        const client = registeredCustomPluginMCPs.get(identifier)
        if (!client) throw Object.assign(new Error('plugin_registration_invalid'), { code: 'plugin_registration_invalid' })
        // Request variants without a tool loop report through the client.
        if (typeof meta.reportUnsupported === 'function') {
            (client as typeof client & { bgReportUnsupported?: (event: unknown) => void }).bgReportUnsupported = meta.reportUnsupported
        }
        let active = true
        return () => {
            if (!active) return
            active = false
            if (registeredCustomPluginMCPs.get(identifier) === client) registeredCustomPluginMCPs.delete(identifier)
            if (MCPs[identifier] === client) delete MCPs[identifier]
        }
    },
}
