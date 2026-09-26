import { toast } from 'svelte-sonner'
import { writable, type Writable } from 'svelte/store'
import AppearanceToast from 'src/lib/Setting/Pages/PersonalSettings/AppearanceToast.svelte'

export type AppearanceNoticeScope = 'css' | 'font' | 'font-load'
export type AppearanceNoticeKind = 'loading' | 'success' | 'error' | 'info'
export interface AppearanceNoticeState { kind: AppearanceNoticeKind; message: string }
export const appearanceNoticeRetentionMs = Object.freeze({ success: 3500, info: 3500, error: 8000 })

// svelte-sonner 1.1.0 restarts a toast's close timer whenever the same ID is
// updated, and an infinite duration then fires almost immediately. Each
// visible notice is therefore mounted once and updated through its store;
// this module alone schedules its dismissal.
interface Entry { id: string; interactive: boolean; status: Writable<AppearanceNoticeState>; timer?: ReturnType<typeof setTimeout> }
const entries = new Map<AppearanceNoticeScope, Entry>()
let sequence = 0

function forget(scope: AppearanceNoticeScope, entry: Entry): void {
    if (entries.get(scope) !== entry) return
    clearTimeout(entry.timer)
    entries.delete(scope)
}

export function appearanceNotice(scope: AppearanceNoticeScope, kind: AppearanceNoticeKind, message: string, persistent = false): void {
    // Only errors accept touches, so they can be swiped away; progress and
    // results never block the controls underneath the toast.
    const interactive = kind === 'error'
    let entry = entries.get(scope)
    if (entry && entry.interactive !== interactive) {
        dismissAppearanceNotice(scope)
        entry = undefined
    }
    if (entry) {
        clearTimeout(entry.timer)
        entry.status.set({ kind, message })
    } else {
        const created: Entry = { id: `personal-appearance:${scope}:${++sequence}`, interactive, status: writable({ kind, message }) }
        entries.set(scope, created)
        toast.custom(AppearanceToast, {
            id: created.id,
            duration: Number.POSITIVE_INFINITY,
            componentProps: { status: created.status },
            style: interactive ? undefined : 'pointer-events: none;',
            onDismiss: () => forget(scope, created),
            onAutoClose: () => forget(scope, created),
        })
        entry = created
    }
    if (kind !== 'loading' && !persistent) {
        const current = entry
        current.timer = setTimeout(() => { if (entries.get(scope) === current) dismissAppearanceNotice(scope) }, appearanceNoticeRetentionMs[kind])
    }
}

export function dismissAppearanceNotice(scope: AppearanceNoticeScope): void {
    const entry = entries.get(scope)
    if (!entry) return
    forget(scope, entry)
    toast.dismiss(entry.id)
}
