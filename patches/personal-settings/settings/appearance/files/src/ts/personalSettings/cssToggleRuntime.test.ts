import { afterEach, expect, test, vi } from 'vitest'
import { PersonalCssRuntime, recoveryKey } from './cssToggleRuntime'
import { cssSnapshot, type CssSnapshot } from './cssToggles'
import type { Database } from '../storage/database.svelte'

let runtime: PersonalCssRuntime | undefined
const db = { theme: '', pocketRisuPersonalSettings: { appearance: { version: 1, enabled: true } } } as unknown as Database
const snap = (nodes: { key: string; css: string }[], tokens = ['candidate']) => ({ gates: [], revisions: [1], tokens, nodes }) as CssSnapshot
afterEach(() => { runtime?.dispose(); runtime = undefined; document.head.innerHTML = ''; document.querySelectorAll('#customcss').forEach(n => n.remove()); sessionStorage.clear(); vi.useRealTimers(); window.history.replaceState({}, '', '/') })
test('keeps one independent style per item, unchanged identity, order, and precedence over customcss', async () => {
    const global = document.createElement('style'); global.id = 'customcss'; document.body.append(global)
    runtime = new PersonalCssRuntime(document, () => ({ db, safeMode: false }))
    const candidate = snap([{ key: 'a', css: 'body{' }, { key: 'b', css: 'p { color: blue; }' }])
    runtime.reconcile(candidate)
    const nodes = [...document.querySelectorAll('style[data-pocketrisu-personal-css]')]
    expect(nodes.map(n => n.textContent)).toEqual(candidate.nodes.map(n => n.css))
    runtime.reconcile(candidate)
    expect(document.querySelector('style[data-pocketrisu-personal-css]')).toBe(nodes[0])
    global.remove(); const replacement = document.createElement('style'); replacement.id = 'customcss'; document.body.prepend(replacement)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect([...document.body.querySelectorAll('style')]).toEqual([replacement, ...nodes])
    const later = document.createElement('div'); document.body.append(later)
    replacement.textContent = '.theme { color: red; }'
    await new Promise(resolve => setTimeout(resolve, 0))
    expect([...document.body.children].slice(-4)).toEqual([replacement, ...nodes, later])
    expect(document.querySelector('style[data-pocketrisu-personal-css]')).toBe(nodes[0])
})
test('trials replace tokens and sequence without DB mutation; expiry restores persisted state', () => {
    vi.useFakeTimers()
    runtime = new PersonalCssRuntime(document, () => ({ db, safeMode: false }))
    const before = JSON.stringify(db)
    runtime.trial(snap([{ key: 'candidate', css: 'body{display:none}' }]), async () => {})
    expect(document.documentElement.getAttribute('data-pocketrisu-css')).toBe('candidate')
    runtime.sync()
    expect(document.documentElement.getAttribute('data-pocketrisu-css')).toBe('candidate')
    vi.advanceTimersByTime(15_001)
    expect(document.querySelectorAll('[data-pocketrisu-personal-css]')).toHaveLength(0)
    expect(JSON.stringify(db)).toBe(before)
})
test('confirm cancels expiry before waiting for durable acknowledgement', async () => {
    vi.useFakeTimers()
    runtime = new PersonalCssRuntime(document, () => ({ db, safeMode: false }))
    let resolve!: () => void
    const wait = new Promise<void>(r => resolve = r)
    runtime.trial(snap([{ key: 'candidate', css: 'p{color:red}' }]), () => wait)
    const saving = runtime.confirm()
    vi.advanceTimersByTime(60_000)
    expect(document.querySelectorAll('[data-pocketrisu-personal-css]')).toHaveLength(1)
    resolve(); await saving
    expect(runtime.busy).toBe(false)
})
test('recovery query persists as a session sentinel and suppresses boot styles', () => {
    window.history.replaceState({}, '', '/?safe-css=1')
    runtime = new PersonalCssRuntime(document, () => ({ db, safeMode: false }))
    expect(sessionStorage.getItem(recoveryKey)).toBe('1')
    expect(window.location.search).toBe('')
    runtime.sync(); expect(document.documentElement.hasAttribute('data-pocketrisu-css')).toBe(false)
    runtime.dispose(); runtime = new PersonalCssRuntime(document, () => ({ db, safeMode: false }))
    expect(runtime.suppressed).toBe(true)
})
test('stale recovery confirmation cannot clear the sentinel', async () => {
    sessionStorage.setItem(recoveryKey, '1')
    const source = JSON.parse(JSON.stringify(db))
    runtime = new PersonalCssRuntime(document, () => ({ db: source, safeMode: false }))
    const snapshot = cssSnapshot(source, false)
    source.pocketRisuPersonalSettings.appearance.enabled = false
    await expect(runtime.clearRecovery(snapshot, async () => {})).rejects.toThrow()
    expect(sessionStorage.getItem(recoveryKey)).toBe('1')
})
test('Safe Mode cancels a trial and pauses every node immediately', () => {
    let safeMode = false
    runtime = new PersonalCssRuntime(document, () => ({ db, safeMode }))
    runtime.sync()
    runtime.trial(snap([{ key: 'candidate', css: 'p{color:red}' }]), async () => {})
    safeMode = true; runtime.sync()
    expect(document.querySelectorAll('[data-pocketrisu-personal-css]')).toHaveLength(0)
    safeMode = false; runtime.sync(); expect(runtime.suppressed).toBe(true)
})
test('denied session storage retains the recovery query across reload', () => {
    window.history.replaceState({}, '', '/?safe-css=1')
    const original = Object.getOwnPropertyDescriptor(window, 'sessionStorage')
    Object.defineProperty(window, 'sessionStorage', { configurable: true, get() { throw new Error('denied') } })
    try {
        runtime = new PersonalCssRuntime(document, () => ({ db, safeMode: false }))
        runtime.sync()
        expect(window.location.search).toBe('?safe-css=1')
        expect(runtime.suppressed).toBe(true)
        runtime.dispose(); runtime = new PersonalCssRuntime(document, () => ({ db, safeMode: false }))
        expect(runtime.suppressed).toBe(true)
    } finally {
        if (original) Object.defineProperty(window, 'sessionStorage', original)
    }
})
test('pagehide rolls back a trial before navigation', () => {
    runtime = new PersonalCssRuntime(document, () => ({ db, safeMode: false }))
    runtime.trial(snap([{ key: 'candidate', css: 'body{opacity:0}' }]), async () => {})
    window.dispatchEvent(new Event('pagehide'))
    expect(runtime.busy).toBe(false)
    expect(document.querySelectorAll('[data-pocketrisu-personal-css]')).toHaveLength(0)
})
test('closing and reopening a gate during saving cannot restore candidate styles before activation revalidation', async () => {
    let safeMode = false
    let resolve!: () => void
    runtime = new PersonalCssRuntime(document, () => ({ db, safeMode }))
    runtime.sync()
    runtime.trial(snap([{ key: 'candidate', css: 'body{color:red}' }]), () => new Promise<void>(r => resolve = r))
    const saving = runtime.confirm()
    safeMode = true; runtime.sync()
    safeMode = false; runtime.sync()
    expect(document.querySelectorAll('[data-pocketrisu-personal-css]')).toHaveLength(0)
    resolve(); await saving
    expect(runtime.suppressed).toBe(true)
})
test('a late save acknowledgement cannot recreate disposed nodes', async () => {
    let resolve!: () => void
    runtime = new PersonalCssRuntime(document, () => ({ db, safeMode: false }))
    runtime.trial(snap([{ key: 'candidate', css: 'body{color:red}' }]), () => new Promise<void>(r => resolve = r))
    const saving = runtime.confirm()
    runtime.dispose()
    resolve(); await saving
    expect(document.querySelectorAll('[data-pocketrisu-personal-css]')).toHaveLength(0)
    expect(document.documentElement.hasAttribute('data-pocketrisu-css')).toBe(false)
})
test('preparation cancellation blocks late activation before a trial starts', async () => {
    let resolve!: () => void
    runtime = new PersonalCssRuntime(document, () => ({ db, safeMode: false }))
    const preparing = runtime.prepare(() => new Promise<void>(r => resolve = r))
    expect(runtime.busy).toBe(true)
    runtime.cancel()
    resolve()
    await expect(preparing).rejects.toMatchObject({ cancelled: true })
    expect(runtime.busy).toBe(false)
    expect(document.querySelectorAll('[data-pocketrisu-personal-css]')).toHaveLength(0)
})
test('recovery exit cannot clear its sentinel after a gate closes and reopens during acknowledgement', async () => {
    sessionStorage.setItem(recoveryKey, '1')
    let safeMode = false
    runtime = new PersonalCssRuntime(document, () => ({ db, safeMode }))
    runtime.sync()
    const snapshot = cssSnapshot(db, false)
    runtime.trial(snapshot, () => runtime!.clearRecovery(snapshot, async () => {
        safeMode = true; runtime!.sync()
        safeMode = false; runtime!.sync()
    }))
    await runtime.confirm()
    expect(sessionStorage.getItem(recoveryKey)).toBe('1')
    expect(runtime.suppressed).toBe(true)
})
test('closing and reopening the master gate reapplies the confirmed stored snapshot', () => {
    const local = { theme: '', pocketRisuPersonalSettings: { appearance: { version: 1, enabled: true, chat: { font: 'paperlogy', keepKoreanWords: true } } } } as unknown as Database
    runtime = new PersonalCssRuntime(document, () => ({ db: local, safeMode: false }))
    const before = runtime.sync()
    expect(before).toContain('chat-font-paperlogy')
    expect(document.querySelectorAll('[data-pocketrisu-personal-css]')).toHaveLength(1)
    ;(local as any).pocketRisuPersonalSettings.appearance.enabled = false
    expect(runtime.sync()).toBe('')
    expect(document.querySelectorAll('[data-pocketrisu-personal-css]')).toHaveLength(0)
    ;(local as any).pocketRisuPersonalSettings.appearance.enabled = true
    expect(runtime.sync()).toBe(before)
    expect(document.querySelectorAll('[data-pocketrisu-personal-css]')).toHaveLength(1)
    expect(runtime.suppressed).toBe(false)
    expect(sessionStorage.length).toBe(0)
})
test('a stored suppressed-state repair still blocks activation after the gate reopens', () => {
    const local = { theme: 'customHTML', pocketRisuPersonalSettings: { appearance: { version: 1, enabled: true, chat: { keepKoreanWords: true }, cssToggles: { version: 1, needsValidation: true } } } } as unknown as Database
    runtime = new PersonalCssRuntime(document, () => ({ db: local, safeMode: false }))
    runtime.sync()
    ;(local as any).theme = ''
    expect(runtime.sync()).toBe('')
    expect(runtime.suppressed).toBe(true)
    expect(document.querySelectorAll('[data-pocketrisu-personal-css]')).toHaveLength(0)
})
test('switching to a non-Standard theme keeps Personal CSS, tokens, and actions available', () => {
    const local = { theme: '', pocketRisuPersonalSettings: { appearance: { version: 1, enabled: true, chat: { font: 'paperlogy', keepKoreanWords: true } } } } as unknown as Database
    runtime = new PersonalCssRuntime(document, () => ({ db: local, safeMode: false }))
    const before = runtime.sync()
    for (const theme of ['customHTML', 'waifu', '']) {
        ;(local as any).theme = theme
        expect(runtime.sync()).toBe(before)
        expect(document.querySelectorAll('[data-pocketrisu-personal-css]')).toHaveLength(1)
        expect(runtime.suppressed).toBe(false)
    }
    expect(sessionStorage.length).toBe(0)
})
