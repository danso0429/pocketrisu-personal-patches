import { writable } from 'svelte/store'
import type { Database } from '../storage/database.svelte'
import { CSS_LIMITS, cssSnapshot, readCssToggles, sameValue, type CssSnapshot } from './cssToggles'

export const recoveryKey = 'pocketrisu-personal-css-recovery'
const validationKey = 'pocketrisu-personal-css-validation'
export type AppearancePhase = 'idle' | 'preparing' | 'trial' | 'saving' | 'unresolved'
export const personalCssStatus = writable({ recovery: false, validation: false, phase: 'idle' as AppearancePhase, message: '' })
const owners = new WeakMap<Document, PersonalCssRuntime>()

export class PersonalCssRuntime {
    private nodes = new Map<string, HTMLStyleElement>()
    private anchor: Comment
    private observer: MutationObserver | undefined
    private dialog: HTMLDivElement | undefined
    private initiatingControl: HTMLElement | null = null
    private timer: ReturnType<typeof setTimeout> | undefined
    private candidate: CssSnapshot | undefined
    private safetyInterrupted = false
    private disposed = false
    private preparation = 0
    private rollbackResources: (() => void) | undefined
    private current: () => { db: Database; safeMode: boolean }
    private lastActive: boolean | undefined
    private phase: AppearancePhase = 'idle'
    private recovery = false
    private validation = false
    private message = ''
    private confirmAction: (() => Promise<void>) | undefined
    constructor(readonly doc: Document, current: () => { db: Database; safeMode: boolean }) {
        this.current = current
        this.anchor = doc.createComment('Personal CSS anchor')
        const win = doc.defaultView
        try { this.recovery = win?.sessionStorage.getItem(recoveryKey) === '1' } catch { /* Query remains the fallback. */ }
        try { this.validation = win?.sessionStorage.getItem(validationKey) === '1' } catch { /* In-memory suppression remains active. */ }
        if (win && new URL(win.location.href).searchParams.get('safe-css') === '1') {
            this.recovery = true
            try {
                win.sessionStorage.setItem(recoveryKey, '1')
                if (win.sessionStorage.getItem(recoveryKey) === '1') {
                    const url = new URL(win.location.href)
                    url.searchParams.delete('safe-css')
                    win.history.replaceState(win.history.state, '', url)
                }
            } catch { /* Never consume the query without a verified sentinel. */ }
        }
        if (win?.MutationObserver) {
            this.observer = new win.MutationObserver(() => this.restoreOrder())
            this.observer.observe(doc.head, { childList: true })
            // PocketRisu creates #customcss directly in body, not in head.
            if (doc.body) this.observer.observe(doc.body, { childList: true })
        }
        win?.addEventListener('pagehide', this.onPageHide)
        this.publish()
    }
    setCurrent(current: () => { db: Database; safeMode: boolean }): void { this.current = current }
    get busy(): boolean { return this.phase !== 'idle' }
    get suppressed(): boolean { return this.recovery || this.validation || !this.active() }
    private snapshot(): CssSnapshot {
        const current = this.current()
        return cssSnapshot(current.db, current.safeMode, this.doc.documentElement.getAttribute('data-personal-custom-font-ready'))
    }
    private active(): boolean {
        const { db, safeMode } = this.current()
        const gates = cssSnapshot(db, safeMode).gates
        return !gates[0] && gates[1] === '' && gates[2] !== 'unsupported' && gates[3] === true
    }
    private publish(): void { if (!this.disposed) personalCssStatus.set({ recovery: this.recovery, validation: this.validation, phase: this.phase, message: this.message }) }
    requireValidation(): void {
        if (this.validation) return
        this.validation = true
        try { this.doc.defaultView?.sessionStorage.setItem(validationKey, '1') } catch { /* Stored group also carries repairs. */ }
        this.publish()
    }
    sync(): string {
        if (this.disposed) return ''
        const { db } = this.current()
        const active = this.active()
        if (this.lastActive === true && !active) this.requireValidation()
        this.lastActive = active
        if (readCssToggles(db).value.needsValidation) this.requireValidation()
        if (!active) {
            if (this.phase === 'trial' || this.phase === 'preparing') this.cancel('꾸미기가 중지되어 시험 적용을 취소했습니다.')
            if (this.phase === 'saving') this.safetyInterrupted = true
            this.reconcile({ gates: [], tokens: [], nodes: [], revisions: [] })
            return ''
        }
        const snapshot = (this.safetyInterrupted ? undefined : this.candidate)
            ?? (this.suppressed ? { gates: [], tokens: [], nodes: [], revisions: [] } : this.snapshot())
        this.reconcile(snapshot)
        return snapshot.tokens.join(' ')
    }
    private restoreOrder(): void {
        const custom = this.doc.getElementById('customcss')
        const parent = custom?.parentNode ?? this.doc.head
        if (this.anchor.parentNode !== parent || this.anchor.nextSibling !== custom) {
            // With no customcss, the anchor remains at the end of head.
            if (custom || this.anchor.parentNode !== parent || this.anchor.nextSibling) parent.insertBefore(this.anchor, custom)
        }
        let next: Node = this.anchor
        for (const node of [...this.nodes.values()].reverse()) {
            if (node.parentNode !== parent || node.nextSibling !== next) parent.insertBefore(node, next)
            next = node
        }
    }
    reconcile(snapshot: CssSnapshot): void {
        if (this.disposed) return
        const retained = new Map<string, HTMLStyleElement>()
        for (const item of snapshot.nodes) {
            const node = this.nodes.get(item.key) ?? this.doc.createElement('style')
            node.setAttribute('data-pocketrisu-personal-css', item.key)
            if (node.textContent !== item.css) node.textContent = item.css
            retained.set(item.key, node)
        }
        for (const [id, node] of this.nodes) if (!retained.has(id)) node.remove()
        this.nodes = retained
        const tokens = snapshot.tokens.join(' ')
        if (tokens) this.doc.documentElement.setAttribute('data-pocketrisu-css', tokens)
        else this.doc.documentElement.removeAttribute('data-pocketrisu-css')
        this.restoreOrder()
    }
    async prepare<T>(load: () => Promise<T>): Promise<T> {
        if (this.disposed || this.busy || !this.active()) throw new Error('꾸미기 적용 상태와 진행 중인 작업을 확인하세요.')
        const epoch = ++this.preparation
        this.phase = 'preparing'
        this.message = '전체 규칙 시험 적용에 필요한 폰트를 준비하는 중…'
        this.publish()
        try {
            const value = await load()
            if (epoch !== this.preparation || this.disposed) throw Object.assign(new Error('시험 적용 준비가 취소되었습니다.'), { cancelled: true })
            return value
        } catch (error) {
            if (epoch !== this.preparation || this.disposed) throw Object.assign(new Error('시험 적용 준비가 취소되었습니다.'), { cancelled: true })
            throw error
        } finally {
            if (epoch === this.preparation && this.phase === 'preparing') { this.phase = 'idle'; this.publish(); this.sync() }
        }
    }
    trial(snapshot: CssSnapshot, confirm: () => Promise<void>, rollbackResources?: () => void): void {
        if (this.disposed) throw new Error('꾸미기 화면이 닫혔습니다.')
        if (this.busy) throw new Error('진행 중인 확인 또는 저장을 먼저 마쳐야 합니다.')
        if (!this.active()) throw new Error('Standard 테마에서 Safe Mode와 전체 사용 상태를 확인하세요.')
        this.phase = 'trial'
        this.safetyInterrupted = false
        this.candidate = snapshot
        this.confirmAction = confirm
        this.rollbackResources = rollbackResources
        this.message = '시험 적용 중 · 확인하지 않으면 자동으로 되돌립니다.'
        // Schedule before touching tokens or styles, including confirmation UI.
        this.timer = setTimeout(() => this.cancel('시간이 지나 시험 적용을 되돌렸습니다.'), CSS_LIMITS.trialMs)
        this.publish()
        this.showConfirmation()
        this.reconcile(snapshot)
    }
    private showConfirmation(): void {
        this.initiatingControl = this.doc.activeElement as HTMLElement | null
        const host = this.doc.createElement('div')
        host.setAttribute('data-personal-css-confirmation', '')
        host.style.cssText = 'position:fixed;inset:16px 12px auto;z-index:2147483647;display:block;'
        const shadow = host.attachShadow({ mode: 'open' })
        const panel = this.doc.createElement('section')
        panel.setAttribute('role', 'alertdialog')
        panel.setAttribute('aria-label', 'CSS 시험 적용 확인')
        panel.style.cssText = 'font:16px system-ui;background:#fff;color:#111;padding:16px;border:2px solid #345;border-radius:10px;box-shadow:0 4px 30px #0008;'
        const text = this.doc.createElement('p')
        text.textContent = '현재 화면을 유지할까요? 확인하지 않으면 자동 복구됩니다. 원격 CSS 리소스의 이후 변경까지 검증하지는 않습니다.'
        panel.append(text)
        for (const [label, action] of [['확인하고 저장', () => void this.confirm()], ['되돌리기', () => this.cancel()]] as const) {
            const button = this.doc.createElement('button')
            button.textContent = label
            button.style.cssText = 'min-height:44px;margin:4px;padding:8px 16px;'
            button.onclick = action
            panel.append(button)
        }
        shadow.append(panel)
        this.doc.body.append(host)
        this.dialog = host
        shadow.querySelector('button')?.focus()
    }
    private restoreFocus(): void {
        const control = this.initiatingControl
        this.initiatingControl = null
        this.doc.defaultView?.requestAnimationFrame(() => {
            if (!this.disposed && this.phase === 'idle' && this.doc.activeElement === this.doc.body
                && control?.isConnected && !control.hasAttribute('disabled')) control.focus()
        })
    }
    async confirm(): Promise<void> {
        if (this.phase !== 'trial' || !this.confirmAction) return
        const action = this.confirmAction
        clearTimeout(this.timer)
        this.phase = 'saving'
        this.dialog?.remove()
        this.dialog = undefined
        this.message = '저장 완료를 확인하는 중…'
        this.publish()
        try {
            await action()
            this.phase = 'idle'
            this.candidate = undefined
            this.message = '저장 완료'
        } catch (error) {
            this.rollbackResources?.()
            const ambiguous = (error as any)?.ambiguous === true
            this.phase = ambiguous ? 'unresolved' : 'idle'
            this.candidate = undefined
            this.message = error instanceof Error ? error.message : '저장 실패'
            if (ambiguous) this.requireValidation()
        }
        this.confirmAction = undefined
        this.rollbackResources = undefined
        this.publish()
        this.sync()
        this.restoreFocus()
    }
    async save(action: () => Promise<void>): Promise<void> {
        if (this.busy) throw new Error('다른 저장이 진행 중입니다.')
        this.safetyInterrupted = false
        if (!this.suppressed) {
            this.candidate = this.snapshot()
        }
        this.phase = 'trial'
        this.confirmAction = action
        await this.confirm()
    }
    cancel(message = '시험 적용을 취소했습니다.'): void {
        if (this.phase !== 'trial' && this.phase !== 'preparing') return
        ++this.preparation
        this.rollbackResources?.()
        this.rollbackResources = undefined
        clearTimeout(this.timer)
        this.dialog?.remove()
        this.dialog = undefined
        this.candidate = undefined
        this.confirmAction = undefined
        this.phase = 'idle'
        this.message = message
        this.publish()
        this.sync()
        this.restoreFocus()
    }
    async clearRecovery(expected: CssSnapshot, persistRepairFlag: () => Promise<void>): Promise<void> {
        if (this.safetyInterrupted || !sameValue(this.snapshot(), expected) || !this.active()) throw new Error('시험 적용 후 설정이 바뀌었습니다. 다시 확인하세요.')
        await persistRepairFlag()
        if (this.safetyInterrupted || !sameValue(this.snapshot(), expected) || !this.active()) throw new Error('저장 중 설정이 바뀌어 복구 모드를 유지합니다.')
        const win = this.doc.defaultView
        if (win) {
            try {
                win.sessionStorage.removeItem(recoveryKey)
                win.sessionStorage.removeItem(validationKey)
                if (win.sessionStorage.getItem(recoveryKey) || win.sessionStorage.getItem(validationKey)) throw new Error('sentinel retained')
                const url = new URL(win.location.href)
                url.searchParams.delete('safe-css')
                win.history.replaceState(win.history.state, '', url)
            } catch {
                try { win.sessionStorage.setItem(recoveryKey, '1') } catch { /* Restore the query when storage is denied. */ }
                try {
                    const url = new URL(win.location.href)
                    url.searchParams.set('safe-css', '1')
                    win.history.replaceState(win.history.state, '', url)
                } catch { /* In-memory recovery remains active. */ }
                throw new Error('복구 상태를 지울 수 없습니다. 복구 모드를 유지합니다.')
            }
        }
        this.recovery = false
        this.validation = false
        this.publish()
    }
    private onPageHide = () => {
        if (this.phase === 'trial' || this.phase === 'preparing') this.cancel()
        else if (this.phase === 'saving') {
            this.safetyInterrupted = true
            this.requireValidation()
            this.reconcile({ gates: [], tokens: [], nodes: [], revisions: [] })
        }
    }
    dispose(): void {
        if (this.phase === 'saving') this.requireValidation()
        this.disposed = true
        ++this.preparation
        this.cancel()
        this.rollbackResources?.()
        this.rollbackResources = undefined
        clearTimeout(this.timer)
        this.observer?.disconnect()
        this.doc.defaultView?.removeEventListener('pagehide', this.onPageHide)
        for (const node of this.nodes.values()) node.remove()
        this.anchor.remove()
        this.dialog?.remove()
        this.doc.documentElement.removeAttribute('data-pocketrisu-css')
    }
}
export function getCssRuntime(doc: Document, current: () => { db: Database; safeMode: boolean }): PersonalCssRuntime {
    let owner = owners.get(doc)
    if (!owner) { owner = new PersonalCssRuntime(doc, current); owners.set(doc, owner) }
    owner.setCurrent(current)
    return owner
}
export function disposeCssRuntime(doc: Document): void { owners.get(doc)?.dispose(); owners.delete(doc) }
