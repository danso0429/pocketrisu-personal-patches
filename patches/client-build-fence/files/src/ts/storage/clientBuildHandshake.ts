import {
    CLIENT_BUILD_HEADER,
    clientBuildStamp,
    withClientBuildHeader,
} from './clientBuild'

export const CLIENT_UPGRADE_REQUIRED_STATUS = 426
export const CLIENT_UPGRADE_REQUIRED_CODE = 'CLIENT_UPGRADE_REQUIRED'
export { CLIENT_BUILD_HEADER, clientBuildStamp, withClientBuildHeader }

const RELOAD_GUARD_KEY = 'risu-client-build-reload'
const FROZEN_CLASS = 'risu-client-build-frozen'
const BANNER_ID = 'risu-client-build-banner'
const NON_TEXT_INPUT_TYPES = new Set([
    'button',
    'checkbox',
    'color',
    'file',
    'hidden',
    'image',
    'radio',
    'range',
    'reset',
    'submit',
])

export interface ExpectedClientBuild {
    version: string
    stamp: string
}

let databaseDirtyProbe = () => false
let composerDirty = false
let composerRecoveryText = ''
let draftUnsafe = false
let draftRecoveryText = ''
let generationActive = false
let reloadRequested = false
let frozen = false
let removeInteractionGuards: (() => void) | null = null
let freezeObserver: MutationObserver | null = null

export function setClientBuildDirtyStateProbe(probe: () => boolean): void {
    databaseDirtyProbe = probe
}

export function setClientBuildComposerDirty(value: boolean, recoveryText = ''): void {
    composerDirty = value
    composerRecoveryText = value ? recoveryText : ''
}

export function setClientBuildDraftUnsafe(value: boolean, recoveryText = ''): void {
    draftUnsafe = value
    draftRecoveryText = value ? recoveryText : ''
}

export function setClientBuildGenerationActive(value: boolean): void {
    generationActive = value
}

export function hasUnsafeClientBuildState(): boolean {
    if (composerDirty || draftUnsafe || generationActive) return true
    try {
        return databaseDirtyProbe()
    } catch {
        // If inspection fails, preserve the page rather than risking data loss.
        return true
    }
}

function parseExpectedBuild(value: unknown): ExpectedClientBuild | null {
    if (!value || typeof value !== 'object') return null
    const candidate = value as { version?: unknown; stamp?: unknown }
    if (typeof candidate.version !== 'string' || candidate.version.length === 0) return null
    if (typeof candidate.stamp !== 'string' || candidate.stamp.length === 0) return null
    return { version: candidate.version, stamp: candidate.stamp }
}

function freezeEditableElement(element: Element): void {
    if (element instanceof HTMLTextAreaElement && !element.readOnly) element.readOnly = true
    if (element instanceof HTMLInputElement
        && !NON_TEXT_INPUT_TYPES.has(element.type)
        && !element.readOnly) {
        element.readOnly = true
    }
    if (element.hasAttribute('contenteditable')
        && element.getAttribute('contenteditable') !== 'false') {
        element.setAttribute('contenteditable', 'false')
    }
}

function freezeEditableTree(node: Node): void {
    if (!(node instanceof Element)) return
    freezeEditableElement(node)
    for (const element of node.querySelectorAll('textarea, input, [contenteditable]')) {
        freezeEditableElement(element)
    }
}

function isRecoveryBannerTarget(target: EventTarget | null): boolean {
    return target instanceof Node && !!document.getElementById(BANNER_ID)?.contains(target)
}

function installInteractionGuards(): void {
    if (removeInteractionGuards) return
    const blocked = [
        'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click',
        'beforeinput', 'input', 'change', 'submit',
        'compositionstart', 'compositionupdate', 'compositionend',
        'drop', 'dragover', 'paste', 'cut',
    ] as const
    const blockOutsideRecoveryBanner = (event: Event) => {
        if (isRecoveryBannerTarget(event.target)) return
        event.preventDefault()
        event.stopImmediatePropagation()
    }
    const blockUnsafeKey = (event: KeyboardEvent) => {
        if (isRecoveryBannerTarget(event.target)) return
        const key = event.key.toLowerCase()
        const safeShortcut = (event.ctrlKey || event.metaKey) && ['a', 'c', 'f'].includes(key)
        const safeNavigation = [
            'arrowup', 'arrowdown', 'arrowleft', 'arrowright',
            'pageup', 'pagedown', 'home', 'end', 'escape',
        ].includes(key)
        if (safeShortcut || safeNavigation) {
            event.stopImmediatePropagation()
            return
        }
        event.preventDefault()
        event.stopImmediatePropagation()
    }
    for (const eventName of blocked) {
        document.addEventListener(eventName, blockOutsideRecoveryBanner, true)
    }
    document.addEventListener('keydown', blockUnsafeKey, true)
    document.addEventListener('keypress', blockUnsafeKey, true)
    document.addEventListener('keyup', blockUnsafeKey, true)
    removeInteractionGuards = () => {
        for (const eventName of blocked) {
            document.removeEventListener(eventName, blockOutsideRecoveryBanner, true)
        }
        document.removeEventListener('keydown', blockUnsafeKey, true)
        document.removeEventListener('keypress', blockUnsafeKey, true)
        document.removeEventListener('keyup', blockUnsafeKey, true)
    }
}

function showUpgradeBanner(expectedBuild: ExpectedClientBuild | null): void {
    if (typeof document === 'undefined' || document.getElementById(BANNER_ID)) return
    const banner = document.createElement('div')
    banner.id = BANNER_ID
    banner.setAttribute('role', 'alert')
    banner.setAttribute('aria-live', 'assertive')
    banner.style.cssText = [
        'position:fixed',
        'left:0',
        'right:0',
        'top:0',
        'z-index:2147483647',
        'display:flex',
        'flex-wrap:wrap',
        'align-items:center',
        'justify-content:center',
        'gap:12px',
        'padding:12px 16px',
        'background:#7f1d1d',
        'color:#fff',
        'font:14px/1.4 system-ui,sans-serif',
        'max-height:100vh',
        'overflow:auto',
        'box-shadow:0 2px 12px rgba(0,0,0,.45)',
    ].join(';')

    const message = document.createElement('span')
    const version = expectedBuild?.version ? ` (${expectedBuild.version})` : ''
    message.textContent = `서버가 업데이트되었습니다${version}. 작성 중인 내용을 복사한 뒤 새로고침하세요. / Server updated; copy unsaved text before reloading.`
    banner.appendChild(message)

    const recoveryValue = [...new Set([
        composerRecoveryText,
        draftRecoveryText,
    ].filter((value) => value.length > 0))].join('\n\n')
    if (recoveryValue.length > 0) {
        const recoveryText = document.createElement('textarea')
        recoveryText.readOnly = true
        recoveryText.value = recoveryValue
        recoveryText.setAttribute('aria-label', 'Unsaved text recovery')
        recoveryText.style.cssText = 'width:min(100%,420px);height:72px;padding:6px;color:#111;background:#fff'
        banner.appendChild(recoveryText)
    }

    const reload = document.createElement('button')
    reload.type = 'button'
    reload.textContent = '새로고침 / Reload'
    reload.style.cssText = 'padding:6px 10px;border-radius:6px;background:#fff;color:#7f1d1d;font-weight:700'
    reload.addEventListener('click', () => globalThis.location?.reload())
    banner.appendChild(reload)
    document.body.appendChild(banner)
}

function enterFrozenUpgradeState(expectedBuild: ExpectedClientBuild | null): void {
    if (frozen) return
    frozen = true
    if (typeof document === 'undefined') return
    const appRoot = document.getElementById('app')
    appRoot?.classList.add(FROZEN_CLASS)
    freezeEditableTree(document.body)
    installInteractionGuards()
    if (typeof MutationObserver !== 'undefined') {
        freezeObserver = new MutationObserver((records) => {
            for (const record of records) {
                if (record.type === 'attributes') freezeEditableTree(record.target)
                else for (const node of record.addedNodes) freezeEditableTree(node)
            }
        })
        freezeObserver.observe(document.body, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ['contenteditable', 'readonly', 'type'],
        })
    }
    showUpgradeBanner(expectedBuild)
}

function reloadGuardValue(expectedBuild: ExpectedClientBuild): string {
    return JSON.stringify({ client: clientBuildStamp, server: expectedBuild.stamp })
}

function armReloadGuard(expectedBuild: ExpectedClientBuild): 'armed' | 'blocked' {
    try {
        const value = reloadGuardValue(expectedBuild)
        if (sessionStorage.getItem(RELOAD_GUARD_KEY) === value) return 'blocked'
        sessionStorage.setItem(RELOAD_GUARD_KEY, value)
        return 'armed'
    } catch {
        return 'blocked'
    }
}

export function handleClientUpgradeRequired(
    expectedBuildValue: unknown,
): 'reload' | 'recovery' | 'blocked' {
    const expectedBuild = parseExpectedBuild(expectedBuildValue)
    if (!expectedBuild) {
        enterFrozenUpgradeState(null)
        return 'blocked'
    }
    if (hasUnsafeClientBuildState()) {
        enterFrozenUpgradeState(expectedBuild)
        return 'recovery'
    }
    if (reloadRequested) return 'reload'
    if (armReloadGuard(expectedBuild) !== 'armed'
        || typeof globalThis.location?.reload !== 'function') {
        enterFrozenUpgradeState(expectedBuild)
        return 'blocked'
    }
    reloadRequested = true
    globalThis.location.reload()
    return 'reload'
}

export function acceptMatchingClientBuild(value: unknown): void {
    const expectedBuild = parseExpectedBuild(value)
    if (!expectedBuild || expectedBuild.stamp !== clientBuildStamp) return
    try { sessionStorage.removeItem(RELOAD_GUARD_KEY) } catch { /* noop */ }
}

export function handleAdvertisedClientBuild(
    value: unknown,
): 'match' | 'reload' | 'recovery' | 'blocked' | 'ignored' {
    const expectedBuild = parseExpectedBuild(value)
    if (!expectedBuild) return 'ignored'
    if (expectedBuild.stamp === clientBuildStamp) {
        acceptMatchingClientBuild(expectedBuild)
        return 'match'
    }
    return handleClientUpgradeRequired(expectedBuild)
}

export async function handleClientBuildResponse(response: Response): Promise<void> {
    if (response.status !== CLIENT_UPGRADE_REQUIRED_STATUS) return
    const body = await response.clone().json().catch(() => null) as {
        code?: unknown
        expectedBuild?: unknown
    } | null
    if (body?.code !== CLIENT_UPGRADE_REQUIRED_CODE) return
    handleClientUpgradeRequired(body.expectedBuild)
}

export function handleClientBuildXhr(xhr: XMLHttpRequest): void {
    if (xhr.status !== CLIENT_UPGRADE_REQUIRED_STATUS) return
    try {
        const body = JSON.parse(xhr.responseText) as { code?: unknown; expectedBuild?: unknown }
        if (body?.code === CLIENT_UPGRADE_REQUIRED_CODE) {
            handleClientUpgradeRequired(body.expectedBuild)
        }
    } catch {
        enterFrozenUpgradeState(null)
    }
}

export async function clientBuildFetch(
    input: RequestInfo | URL,
    init: RequestInit = {},
): Promise<Response> {
    const response = await fetch(input, {
        ...init,
        headers: withClientBuildHeader(init.headers),
    })
    await handleClientBuildResponse(response)
    return response
}

/** Test-only cleanup for module-global state and DOM guards. */
export function resetClientBuildHandshakeForTests(options: {
    preserveReloadGuard?: boolean
} = {}): void {
    databaseDirtyProbe = () => false
    composerDirty = false
    composerRecoveryText = ''
    draftUnsafe = false
    draftRecoveryText = ''
    generationActive = false
    reloadRequested = false
    frozen = false
    freezeObserver?.disconnect()
    freezeObserver = null
    removeInteractionGuards?.()
    removeInteractionGuards = null
    if (typeof document !== 'undefined') {
        document.getElementById('app')?.classList.remove(FROZEN_CLASS)
        document.getElementById(BANNER_ID)?.remove()
    }
    if (!options.preserveReloadGuard) {
        try { sessionStorage.removeItem(RELOAD_GUARD_KEY) } catch { /* noop */ }
    }
}
