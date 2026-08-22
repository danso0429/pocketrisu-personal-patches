import type { loreBook } from '../storage/database.svelte'

export function convertExternalLorebookForImport(
    entries: Record<string, any>,
): loreBook[] {
    const lore: loreBook[] = []
    for (const key of Object.keys(entries ?? {})) {
        const current = entries[key] ?? {}
        lore.push({
            key: current.key ? current.key.join(', ')
                : current.keys ? current.keys.join(', ')
                    : current.keywords ? current.keywords.join(', ')
                        : '',
            insertorder: current.order
                ?? current.priority
                ?? current?.contextConfig?.budgetPriority
                ?? 0,
            comment: current.comment || current.name || current.displayName || '',
            content: current.content || current.entry || current.text || '',
            mode: 'normal',
            alwaysActive: current.constant ?? current.forceActivation ?? false,
            secondkey: current.secondary_keys ? current.secondary_keys.join(', ') : '',
            selective: current.selective ?? false,
        } as loreBook)
    }
    return lore
}
