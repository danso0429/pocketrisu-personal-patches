import type { Chat, Database } from 'src/ts/storage/database.svelte'
import { resolveChatModelBindingFromDatabase } from './modelBindingResolution'
import type { ResolvedBindingWithContext } from './modelPresetBinding'
import type { ModelModeExtended } from './shared'

export type ModelRequestSelection =
    | Exclude<ResolvedBindingWithContext, { kind: 'classic' }>
    | { kind: 'classic'; modelId: string }

// Preserve the dispatcher's existing sentinel/index semantics. In particular,
// a configured nonempty first fallback does not also attempt the chat binding.
export function modelRequestFallbacks(database: Database, mode: ModelModeExtended): string[] {
    return [...(database.fallbackModels?.[mode] ?? []), '']
}

export function isModelRequestAttempt(index: number, staticModel: string): boolean {
    return index === 0 || !!staticModel
}

// Shared by the real dispatcher and preflight. Never consult the database
// singleton: server preflight runs before the execution snapshot is installed.
export function resolveModelRequestSelection(
    database: Database,
    chat: Chat | null | undefined,
    mode: ModelModeExtended,
    options: { moduleId?: string; staticModel?: string } = {},
): ModelRequestSelection {
    if (options.staticModel) return { kind: 'classic', modelId: options.staticModel }
    const binding = resolveChatModelBindingFromDatabase(database, chat, mode, options.moduleId)
    if (binding.kind !== 'classic') return binding
    const override = database.seperateModelsForAxModels && database.seperateModels?.[mode]
    return {
        kind: 'classic',
        modelId: override || (mode === 'model' ? database.aiModel : database.subModel),
    }
}
