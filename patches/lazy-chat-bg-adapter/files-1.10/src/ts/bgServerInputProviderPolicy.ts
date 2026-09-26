type ProviderDatabase = {
    aiModel?: unknown
    subModel?: unknown
    seperateModelsForAxModels?: unknown
    seperateModels?: unknown
    nodeOnlyModelModeLock?: unknown
    moduleModelBindingsEnabled?: unknown
}

export function requiresClientOwnedInputPreparation(
    database: ProviderDatabase | null | undefined,
    chat: { useModelPreset?: unknown } | null | undefined,
): boolean {
    const lock = database?.nodeOnlyModelModeLock
    if (lock === 'preset' || (lock !== 'legacy' && chat?.useModelPreset === true)) {
        // A preset can override its endpoint at request time. Keep its existing
        // client-prepared delegation path until that final wire URL is qualified.
        return true
    }
    if (database?.moduleModelBindingsEnabled === true) return true
    const models = [database?.aiModel, database?.subModel]
    if (database?.seperateModelsForAxModels === true
        && database.seperateModels && typeof database.seperateModels === 'object'
        && !Array.isArray(database.seperateModels)) {
        models.push(...Object.values(database.seperateModels))
    }
    return models.some(value => typeof value === 'string'
        && (value === 'reverse_proxy' || value.startsWith('xcustom:::')
            || value.startsWith('pluginmodel:::')))
}
