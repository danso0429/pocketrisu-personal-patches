import type { Database } from '../storage/database.svelte'
import { resolvePersonalAppearanceTokens } from './appearanceValues'
import { getCssRuntime } from './cssToggleRuntime'
export * from './appearanceValues'

export function syncPersonalAppearance(
    db: Database,
    safeMode: boolean,
    root: HTMLElement | null = typeof document === 'undefined' ? null : document.documentElement,
): string {
    if (!root) return resolvePersonalAppearanceTokens(db, safeMode).join(' ')
    const runtime = getCssRuntime(root.ownerDocument, () => ({ db, safeMode }))
    return runtime.sync()
}
