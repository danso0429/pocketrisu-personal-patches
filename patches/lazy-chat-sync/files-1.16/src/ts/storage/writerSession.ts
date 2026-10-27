// Writer session identity and session-lock headers of this tab. Kept free of
// imports so that background request modules can use the same values as
// NodeStorage without loading the storage module graph. NodeStorage takes its
// session id and the user-gesture check from here, so every write path of the
// tab sends one id.

// ── User-gesture recency for the write lock ─────────────────────────────────
// The server moves the single-writer lock only on writes that follow a real
// user gesture (x-user-active header). The app also writes automatically —
// boot housekeeping, the flush-on-hide keepalive — and those must never move
// the lock: a phone tab going to background fires a flush, and without this
// distinction it silently stole the lock from the device actually in use.
const USER_GESTURE_WINDOW_MS = 15_000
let lastUserGestureAt = 0
if (typeof window !== 'undefined') {
    const markGesture = () => { lastUserGestureAt = Date.now() }
    window.addEventListener('pointerdown', markGesture, { capture: true, passive: true })
    window.addEventListener('keydown', markGesture, { capture: true, passive: true })
}
export function isUserActive(): boolean {
    return Date.now() - lastUserGestureAt < USER_GESTURE_WINDOW_MS
}

// Cross-device single-writer lock identity. Persisted in sessionStorage so
// a reload or an OS tab restore of the SAME tab keeps the same identity —
// a phone tab resurrected in the background must not look like a new
// device (which used to silently steal the write lock from a PC
// mid-session). Still per-tab: a genuinely new tab gets a new id, and
// same-device multi-tab is handled by the BroadcastChannel lock.
export const writerSessionId: string = (() => {
    const KEY = 'risu-writer-session-id'
    const minted = crypto?.randomUUID?.() ?? (Date.now().toString(36) + Math.random().toString(36).slice(2))
    try {
        const stored = sessionStorage.getItem(KEY)
        if (stored) return stored
        sessionStorage.setItem(KEY, minted)
    } catch { /* storage unavailable (rare privacy modes) — per-load id */ }
    return minted
})()

// Session-lock headers of a checked write: the writer id, plus the active bit
// after a recent user gesture.
export function writerSessionHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'x-session-id': writerSessionId }
    if (isUserActive()) headers['x-user-active'] = '1'
    return headers
}

// A 423 from a checked write means the write was refused for the writer lock
// or a RisuAI account import (ACCOUNT_IMPORT_ACTIVE); the app shows the
// notice. The event carries the code of the JSON body ({ code }, null without
// one). The body is read from a copy taken before anything is awaited, so the
// caller can still read the response.
export async function notifySessionDeactivated(response: Response): Promise<void> {
    if (response.status !== 423) return
    let code: string | null = null
    try {
        const copy = response.clone()
        code = (await copy.json())?.code ?? null
    } catch { /* no JSON body */ }
    window.dispatchEvent(new CustomEvent('risu-session-deactivated', { detail: { code } }))
}
