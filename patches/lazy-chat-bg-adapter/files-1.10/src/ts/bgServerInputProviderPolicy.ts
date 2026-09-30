import type { Chat, Database } from './storage/database.svelte'
import { resolveModelRequestSelection } from './process/request/modelRequestSelection'
import type { ModelModeExtended } from './process/request/shared'

type ProviderDatabase = Partial<Omit<Database, 'seperateModels' | 'fallbackModels'>> & {
    seperateModels?: Partial<Record<ModelModeExtended, string>>
    fallbackModels?: Partial<Record<ModelModeExtended, string[]>>
}

export type ServerInputModelDecision =
    | { kind: 'server-input' }
    | { kind: 'client-prepared'; reason: 'module-bindings-unqualified' | 'preset-unqualified'
        | 'binding-unset' | 'provider-unqualified' | 'fallback-unqualified' }

const modes: ModelModeExtended[] = ['model', 'submodel', 'memory', 'emotion', 'otherAx', 'translate']

function needsPreparedProvider(model: unknown): boolean {
    return typeof model === 'string' && (model === 'reverse_proxy'
        || model.startsWith('xcustom:::') || model.startsWith('pluginmodel:::'))
}

// Keep the existing preset/module/custom admission boundary until their input
// calls are qualified. Dispatch and preflight share the snapshot-only resolver.
export function evaluateServerInputModels(
    database: ProviderDatabase | null | undefined,
    chat: Partial<Chat> | null | undefined,
): ServerInputModelDecision {
    if (database?.moduleModelBindingsEnabled === true) {
        return { kind: 'client-prepared', reason: 'module-bindings-unqualified' }
    }
    const db = (database ?? {}) as Database
    // Do not expand admission while qualifying the new request resolver.
    if (needsPreparedProvider(db.aiModel) || needsPreparedProvider(db.subModel)) {
        return { kind: 'client-prepared', reason: 'provider-unqualified' }
    }
    const requestModes = new Set<ModelModeExtended>(modes)
    if (db.seperateModelsForAxModels && db.seperateModels && typeof db.seperateModels === 'object'
        && !Array.isArray(db.seperateModels)) {
        for (const mode of Object.keys(db.seperateModels)) requestModes.add(mode as ModelModeExtended)
    }
    for (const mode of requestModes) {
        const selection = resolveModelRequestSelection(db, chat as Chat, mode)
        if (selection.kind === 'block') return { kind: 'client-prepared', reason: 'binding-unset' }
        if (selection.kind === 'modelPreset') return { kind: 'client-prepared', reason: 'preset-unqualified' }
        if (needsPreparedProvider(selection.modelId)) {
            return { kind: 'client-prepared', reason: 'provider-unqualified' }
        }
    }
    // The dispatcher uses these as forced classic selections even in preset
    // mode. They must not bypass the same input-preparation boundary.
    for (const mode of modes) {
        const fallbacks = db.fallbackModels?.[mode]
        if (!Array.isArray(fallbacks)) continue
        for (const staticModel of fallbacks) {
            if (!staticModel) continue
            const selection = resolveModelRequestSelection(db, chat as Chat, mode, { staticModel })
            if (selection.kind === 'classic' && needsPreparedProvider(selection.modelId)) {
                return { kind: 'client-prepared', reason: 'fallback-unqualified' }
            }
        }
    }
    return { kind: 'server-input' }
}

export function requiresClientOwnedInputPreparation(
    database: ProviderDatabase | null | undefined,
    chat: Partial<Chat> | null | undefined,
): boolean {
    return evaluateServerInputModels(database, chat).kind === 'client-prepared'
}
