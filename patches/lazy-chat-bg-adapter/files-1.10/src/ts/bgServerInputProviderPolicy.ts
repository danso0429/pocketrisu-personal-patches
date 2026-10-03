import type { Chat, Database } from './storage/database.svelte'
import { resolveModelRequestSelection, modelRequestFallbacks, isModelRequestAttempt } from './process/request/modelRequestSelection'
import { resolveModelPresetCredential } from './process/request/modelCredentialResolution'
import { resolveEndpointUrl } from './preset/adapter/buildRequest'
import { LLMFormat } from './model/types'
import { isLocalNetworkUrl } from './network/localNetwork'
import type { ModelModeExtended } from './process/request/shared'

type ProviderDatabase = Partial<Omit<Database, 'seperateModels' | 'fallbackModels'>> & {
    seperateModels?: Partial<Record<ModelModeExtended, string>>
    fallbackModels?: Partial<Record<ModelModeExtended, string[]>>
}

export type ServerInputModelDecision =
    | { kind: 'server-input' }
    | { kind: 'client-prepared'; reason: 'preset-unqualified' | 'binding-unset'
        | 'provider-unqualified' | 'fallback-unqualified' | 'endpoint-unqualified'
        | 'plugin-host-unqualified' | 'mcp-unqualified' | 'client-network-route' }

const modes: ModelModeExtended[] = ['model', 'submodel', 'memory', 'emotion', 'otherAx', 'translate']
const nativeAdapters = new Set(['openai-compatible', 'anthropic-messages', 'google-gemini'])
const customFormats = new Set<number>([LLMFormat.OpenAICompatible, LLMFormat.Anthropic, LLMFormat.GoogleCloud])

export function supportsNativeInputPresetAdapter(adapter: string): boolean {
    return nativeAdapters.has(adapter)
}

function httpEndpoint(value: unknown): boolean {
    if (typeof value !== 'string') return false
    try { return ['https:', 'http:'].includes(new URL(value).protocol) }
    catch { return false }
}

export function evaluateServerInputModels(
    database: ProviderDatabase | null | undefined,
    chat: Partial<Chat> | null | undefined,
): ServerInputModelDecision {
    const db = (database ?? {}) as Database
    let expandedNativeRoute = false
    // Dynamic Lua/trigger calls may name any bound module.
    const moduleIds: Array<string | undefined> = [undefined]
    if (db.moduleModelBindingsEnabled) moduleIds.push(...Object.keys(db.moduleModelBindings ?? {}))
    for (const mode of modes) {
        for (const [index, staticModel] of modelRequestFallbacks(db, mode).entries()) {
            if (!isModelRequestAttempt(index, staticModel)) continue
            for (const moduleId of moduleIds) {
                const selection = resolveModelRequestSelection(db, chat as Chat, mode, { staticModel, moduleId })
                if (selection.kind === 'block') return { kind: 'client-prepared', reason: 'binding-unset' }
                if (selection.kind === 'modelPreset') {
                    const preset = selection.preset
                    if (!supportsNativeInputPresetAdapter(preset.profileSnapshot?.adapterKind)) {
                        return { kind: 'client-prepared', reason: 'preset-unqualified' }
                    }
                    try {
                        const credential = resolveModelPresetCredential(db, preset)
                        const url = resolveEndpointUrl(preset.profileSnapshot, preset.userValues,
                            preset.profileSnapshot.auth.kind === 'google-service-account' ? credential?.apiKey : undefined)
                        if (!httpEndpoint(url)) return { kind: 'client-prepared', reason: 'endpoint-unqualified' }
                    } catch { return { kind: 'client-prepared', reason: 'endpoint-unqualified' } }
                    expandedNativeRoute = true
                    continue
                }
                const model = selection.modelId
                if (model === 'custom' || model?.startsWith('pluginmodel:::') || model?.startsWith('hf:::')) {
                    return { kind: 'client-prepared', reason: staticModel ? 'fallback-unqualified' : 'provider-unqualified' }
                }
                if (model === 'reverse_proxy' || model?.startsWith('xcustom:::')) {
                    const custom = model === 'reverse_proxy' ? null : db.customModels?.find(value => value.id === model)
                    const format = model === 'reverse_proxy' ? db.customAPIFormat : custom?.format
                    const url = model === 'reverse_proxy' ? db.forceReplaceUrl : custom?.url
                    if (!customFormats.has(format)) return { kind: 'client-prepared', reason: staticModel ? 'fallback-unqualified' : 'provider-unqualified' }
                    if (!httpEndpoint(url)) return { kind: 'client-prepared', reason: 'endpoint-unqualified' }
                    // Classic Anthropic/Gemini input calls can address a local
                    // service directly from the browser (including fallback).
                    // Moving them to Node can select a different localhost/LAN.
                    // Preserve preparation; native presets and classic OpenAI
                    // already request the explicit server local-network route.
                    if (format !== LLMFormat.OpenAICompatible && isLocalNetworkUrl(url)) {
                        return { kind: 'client-prepared', reason: 'client-network-route' }
                    }
                    expandedNativeRoute = true
                }
            }
        }
    }
    // G1.5b owns plugin participation and its server host. Enabled plugin code
    // can dynamically register input effects; this snapshot cannot prove absence.
    // Preserve preparation for newly expanded combinations without claiming all
    // enabled plugins participate or changing existing classic admission.
    const formerlyPrepared = expandedNativeRoute || db.moduleModelBindingsEnabled === true
        || db.nodeOnlyModelModeLock === 'preset'
        || (db.nodeOnlyModelModeLock !== 'legacy' && chat?.useModelPreset === true)
        || [db.aiModel, db.subModel].some(model => model === 'reverse_proxy'
            || model?.startsWith('xcustom:::') || model?.startsWith('pluginmodel:::'))
    if (formerlyPrepared && db.plugins?.some(plugin => plugin.enabled)) {
        return { kind: 'client-prepared', reason: 'plugin-host-unqualified' }
    }
    // Module selection can include a character/persona not supplied to this
    // preflight. Until tool-host qualification, use the snapshot superset rather
    // than dropping configured tools or blocking previously admitted classic work.
    if (formerlyPrepared && (db.modules?.some(module => module.mcp?.url)
        || db.personas?.some(persona => persona.embeddedModule?.mcp?.url))) {
        return { kind: 'client-prepared', reason: 'mcp-unqualified' }
    }
    return { kind: 'server-input' }
}

export function requiresClientOwnedInputPreparation(
    database: ProviderDatabase | null | undefined,
    chat: Partial<Chat> | null | undefined,
): boolean {
    return evaluateServerInputModels(database, chat).kind === 'client-prepared'
}
