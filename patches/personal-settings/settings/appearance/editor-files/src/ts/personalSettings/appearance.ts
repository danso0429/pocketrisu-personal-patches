import type { Database } from '../storage/database.svelte'
import { ensurePersonalChatFontStylesheet, readPersonalAppearance, resolvePersonalAppearanceTokens } from './appearanceValues'
import { getCssRuntime } from './cssToggleRuntime'
export * from './appearanceValues'

export function syncPersonalAppearance(
    db: Database,
    safeMode: boolean,
    root: HTMLElement | null = typeof document === 'undefined' ? null : document.documentElement,
): string {
    if (!root) return resolvePersonalAppearanceTokens(db, safeMode).join(' ')
    const runtime = getCssRuntime(root.ownerDocument, () => ({ db, safeMode }))
    const value = runtime.sync()
    const font = readPersonalAppearance(db).chat.font
    if (value && font !== 'app' && !font.startsWith('custom:')) void ensurePersonalChatFontStylesheet(font, root.ownerDocument)
    return value
}
