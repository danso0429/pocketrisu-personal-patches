import { writable, type Writable } from 'svelte/store'
import { toast } from 'svelte-sonner'
import CharacterImportToast from 'src/lib/Others/CharacterImportToast.svelte'

const IMPORT_TOAST_ID_PREFIX = 'import:progress'
const IMPORT_BUSY_TOAST_ID = 'import:busy'
const SUCCESS_RETENTION_MS = 4_000
const ERROR_RETENTION_MS = 8_000

export type ImportKind = 'character' | 'module'
export type ImportToastPhase = 'loading' | 'success' | 'error'

export interface ImportJobLabels {
    busyTitle: string
    busyDescription: string
    failureTitle: string
}

export interface ImportToastState {
    phase: ImportToastPhase
    message: string
    description?: string
}

export type CharacterImportToastPhase = ImportToastPhase
export type CharacterImportToastState = ImportToastState

export interface ImportProgressReporter {
    update(message: string, description?: string): void
}

export interface ImportJob extends ImportProgressReporter {
    succeed(message: string, description?: string): void
    fail(error: unknown): void
    dismiss(): void
}

export type CharacterImportJob = ImportJob

export interface ImportReservation {
    activate(initialMessage: string, labels?: ImportJobLabels): ImportJob | null
    cancel(): void
}

const CHARACTER_LABELS: ImportJobLabels = Object.freeze({
    busyTitle: 'A character import is already in progress.',
    busyDescription: 'Wait for it to finish before starting another import.',
    failureTitle: 'Character import failed.',
})

const MODULE_LABELS: ImportJobLabels = Object.freeze({
    busyTitle: 'A module import is already in progress.',
    busyDescription: 'Wait for it to finish before starting another import.',
    failureTitle: 'Module import failed.',
})

let active: { token: symbol; kind: ImportKind; labels: ImportJobLabels } | null = null
let toastSequence = 0
let lastToastId: string | null = null

function labelsFor(kind: ImportKind): ImportJobLabels {
    return kind === 'module' ? MODULE_LABELS : CHARACTER_LABELS
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
    if (!active) return
    event.preventDefault()
    event.returnValue = ''
}

function attachNavigationGuard(): void {
    if (typeof window !== 'undefined') window.addEventListener('beforeunload', preventImportNavigation)
}

function detachNavigationGuard(): void {
    if (typeof window !== 'undefined') window.removeEventListener('beforeunload', preventImportNavigation)
}

function release(token: symbol): boolean {
    if (active?.token !== token) return false
    active = null
    detachNavigationGuard()
    return true
}

function dismissLater(toastId: string, delay: number): void {
    setTimeout(() => {
        toast.dismiss(toastId)
        if (lastToastId === toastId) lastToastId = null
    }, delay)
}

function mountJob(token: symbol, initialMessage: string, labels: ImportJobLabels): ImportJob | null {
    if (active?.token !== token) return null
    active = { ...active, labels }
    if (lastToastId) toast.dismiss(lastToastId)
    const toastId = `${IMPORT_TOAST_ID_PREFIX}:${++toastSequence}`
    lastToastId = toastId
    const status: Writable<ImportToastState> = writable({
        phase: 'loading',
        message: initialMessage,
    })
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
        update(message, description) {
            if (active?.token !== token) return
            status.set({ phase: 'loading', message, description })
        },
        succeed(message, description) {
            if (!release(token)) return
            status.set({ phase: 'success', message, description })
            dismissLater(toastId, SUCCESS_RETENTION_MS)
        },
        fail(error) {
            if (!release(token)) return
            status.set({
                phase: 'error',
                message: labels.failureTitle,
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

export function reserveImport(kind: ImportKind): ImportReservation | null {
    if (active) {
        toast.warning(active.labels.busyTitle, {
            id: IMPORT_BUSY_TOAST_ID,
            description: active.labels.busyDescription,
        })
        return null
    }
    const token = Symbol(`${kind}-import`)
    const initialLabels = labelsFor(kind)
    active = { token, kind, labels: initialLabels }
    attachNavigationGuard()
    let activated = false
    return {
        activate(initialMessage, labels = initialLabels) {
            if (activated || active?.token !== token) return null
            activated = true
            return mountJob(token, initialMessage, labels)
        },
        cancel() {
            if (activated) return
            release(token)
        },
    }
}

export function beginImportJob(
    kind: ImportKind,
    initialMessage: string,
    labels: ImportJobLabels = labelsFor(kind),
): ImportJob | null {
    return reserveImport(kind)?.activate(initialMessage, labels) ?? null
}

export function beginCharacterImport(message = 'Reading character file...'): CharacterImportJob | null {
    return beginImportJob('character', message, CHARACTER_LABELS)
}

export function beginModuleImport(message = 'Reading module file...'): ImportJob | null {
    return beginImportJob('module', message, MODULE_LABELS)
}

export function isImportActive(): boolean {
    return active !== null
}

export function isCharacterImportActive(): boolean {
    return isImportActive()
}

export function formatImportProgress(message: string, current: number, total?: number): string {
    const safeCurrent = Number.isFinite(current) ? Math.max(0, Math.trunc(current)) : 0
    const hasTotal = Number.isFinite(total) && (total as number) >= 0
    const safeTotal = hasTotal ? Math.max(0, Math.trunc(total as number)) : null
    const width = Math.max(3, String(safeCurrent).length, safeTotal === null ? 0 : String(safeTotal).length)
    return `${message} (${String(safeCurrent).padStart(width, '0')}/${
        safeTotal === null ? '?'.repeat(width) : String(safeTotal).padStart(width, '0')
    })`
}

export const formatCharacterImportProgress = formatImportProgress

export function allowDuringImport(action: string): boolean {
    if (!active) return true
    toast.warning('Wait for the active import to finish.', {
        id: IMPORT_BUSY_TOAST_ID,
        description: `${action} is unavailable while the ${active.kind} import is active.`,
    })
    return false
}

export const allowDuringCharacterImport = allowDuringImport
