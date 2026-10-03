import type { Database } from '../../storage/database.svelte'
import type { ModelPreset } from '../../preset/types'
import type { AdapterCredential } from '../../preset/adapter/types'

export function resolveModelPresetCredential(database: Database, preset: ModelPreset): AdapterCredential | undefined {
    if (preset.apiKeyRef) {
        const entry = database.apiKeyPool?.[preset.apiKeyRef]
        if (entry?.key) return { apiKey: entry.key }
    }
    if (typeof preset.inlineCredential === 'string' && preset.inlineCredential.length > 0) {
        return { apiKey: preset.inlineCredential }
    }
    if (preset.inlineCredential && typeof preset.inlineCredential === 'object') {
        return preset.inlineCredential as AdapterCredential
    }
    for (const field of preset.profileSnapshot.schema) {
        if (field.mapsTo?.target !== 'auth') continue
        const value = preset.userValues?.[field.key]
        if (typeof value === 'string' && value.length > 0) return { apiKey: value }
    }
    return undefined
}
