import { writable, type Writable } from 'svelte/store'
import { toast } from 'svelte-sonner'
import CharacterImportToast from 'src/lib/Others/CharacterImportToast.svelte'

const IMPORT_TOAST_ID_PREFIX = 'character-import:progress'
const IMPORT_BUSY_TOAST_ID = 'character-import:busy'
const SUCCESS_RETENTION_MS = 4_000
const ERROR_RETENTION_MS = 8_000

let activeToken: symbol | null = null
let toastSequence = 0
let lastToastId: string | null = null

export type CharacterImportToastPhase = 'loading' | 'success' | 'error'

export interface CharacterImportToastState {
    phase: CharacterImportToastPhase
    message: string
    description?: string
}

function normalizeError(error: unknown): string {
    if (error instanceof Error) return error.message || String(error)
    if (typeof error === 'string') return error
    try {
        return JSON.stringify(error) ?? String(error)
    } catch {
        return String(error)
    }
}

function preventImportNavigation(event: BeforeUnloadEvent): void {
    if (!activeToken) return
    event.preventDefault()
    event.returnValue = ''
}

function attachNavigationGuard(): void {
    if (typeof window !== 'undefined') {
        window.addEventListener('beforeunload', preventImportNavigation)
    }
}

function detachNavigationGuard(): void {
    if (typeof window !== 'undefined') {
        window.removeEventListener('beforeunload', preventImportNavigation)
    }
}

function release(token: symbol): boolean {
    if (activeToken !== token) return false
    activeToken = null
    detachNavigationGuard()
    return true
}

function dismissLater(toastId: string, delay: number): void {
    setTimeout(() => {
        toast.dismiss(toastId)
        if (lastToastId === toastId) lastToastId = null
    }, delay)
}

export function formatCharacterImportProgress(
    message: string,
    current: number,
    total?: number,
): string {
    const safeCurrent = Number.isFinite(current) ? Math.max(0, Math.trunc(current)) : 0
    const hasTotal = Number.isFinite(total) && (total as number) >= 0
    const safeTotal = hasTotal ? Math.max(0, Math.trunc(total as number)) : null
    const width = Math.max(
        3,
        String(safeCurrent).length,
        safeTotal === null ? 0 : String(safeTotal).length,
    )
    const currentText = String(safeCurrent).padStart(width, '0')
    const totalText = safeTotal === null
        ? '?'.repeat(width)
        : String(safeTotal).padStart(width, '0')
    return `${message} (${currentText}/${totalText})`
}

export interface CharacterImportJob {
    update(message: string, description?: string): void
    succeed(message: string, description?: string): void
    fail(error: unknown): void
    dismiss(): void
}

export function isCharacterImportActive(): boolean {
    return activeToken !== null
}

/**
 * Starts the single character-import job owned by this page.
 *
 * The toast is intentionally dismissible: closing feedback must not cancel an
 * in-flight asset write. The active token and beforeunload guard remain until
 * the importer explicitly reaches a terminal state.
 */
export function beginCharacterImport(message = 'Reading character file...'): CharacterImportJob | null {
    if (activeToken) {
        toast.warning('A character import is already in progress.', {
            id: IMPORT_BUSY_TOAST_ID,
            description: 'Wait for it to finish before starting another import.',
        })
        return null
    }

    const token = Symbol('character-import')
    if (lastToastId) toast.dismiss(lastToastId)
    const toastId = `${IMPORT_TOAST_ID_PREFIX}:${++toastSequence}`
    lastToastId = toastId
    const status: Writable<CharacterImportToastState> = writable({
        phase: 'loading',
        message,
    })
    activeToken = token
    attachNavigationGuard()
    try {
        toast.custom(CharacterImportToast, {
            id: toastId,
            duration: Number.POSITIVE_INFINITY,
            componentProps: { status },
        })
    } catch (error) {
        release(token)
        if (lastToastId === toastId) lastToastId = null
        throw error
    }

    return {
        update(nextMessage, description) {
            if (activeToken !== token) return
            status.set({
                phase: 'loading',
                message: nextMessage,
                description,
            })
        },
        succeed(successMessage, description) {
            if (!release(token)) return
            status.set({
                phase: 'success',
                message: successMessage,
                description,
            })
            dismissLater(toastId, SUCCESS_RETENTION_MS)
        },
        fail(error) {
            if (!release(token)) return
            status.set({
                phase: 'error',
                message: 'Character import failed.',
                description: normalizeError(error),
            })
            dismissLater(toastId, ERROR_RETENTION_MS)
        },
        dismiss() {
            if (!release(token)) return
            toast.dismiss(toastId)
            if (lastToastId === toastId) lastToastId = null
        },
    }
}

/**
 * Returns false for operations that replace the database, stop the server, or
 * reload the page while character assets are still being imported.
 */
export function allowDuringCharacterImport(action: string): boolean {
    if (!activeToken) return true
    toast.warning('Wait for the character import to finish.', {
        id: IMPORT_BUSY_TOAST_ID,
        description: `${action} is unavailable while the import is active.`,
    })
    return false
}
