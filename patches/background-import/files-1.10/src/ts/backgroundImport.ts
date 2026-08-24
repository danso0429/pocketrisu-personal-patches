import { alertConfirm } from './alert'
import {
    beginImportJob,
    type ImportJob,
    type ImportKind,
} from './characterImportState'
import {
    forageStorage,
    reconcileBackgroundImport,
    waitForBackgroundImportReconciliation,
} from './globalApi.svelte'
import { language } from 'src/lang'
import {
    createBackgroundImportRuntime,
    type BackgroundImportRunOutcome,
} from './storage/backgroundImportRuntime'
import type {
    BackgroundImportKind,
    BackgroundImportMarker,
    BackgroundImportOrigin,
} from './storage/backgroundImportClient'

const MARKER_KEY = 'pocketrisu-background-import-v1'
const CONSUMER_KEY = 'pocketrisu-background-import-consumer-v1'
const VALID_STATES = new Set([
    'receiving', 'upload-finalizing', 'uploaded', 'inspecting', 'awaiting-authorization',
    'queued', 'preparing', 'prepared', 'committing', 'reconcile-required', 'completed',
    'client-reconciled', 'delivered', 'failed', 'cancelled', 'incompatible-after-upgrade',
])

function validMarker(value: any): value is BackgroundImportMarker {
    return value?.version === 1
        && typeof value.operationId === 'string'
        && /^[A-Za-z0-9_-]{8,128}$/.test(value.operationId)
        && ['module', 'character'].includes(value.kind)
        && ['json', 'lorebook', 'risum', 'charx', 'png', 'jpeg'].includes(value.format)
        && ['picker', 'drop', 'share', 'hash', 'launch', 'url', 'realm', 'package'].includes(value.origin)
        && Number.isSafeInteger(value.sourceSize)
        && value.sourceSize > 0
        && typeof value.sourceSha256 === 'string'
        && /^[a-f0-9]{64}$/.test(value.sourceSha256)
        && Number.isSafeInteger(value.nextOffset)
        && value.nextOffset >= 0
        && value.nextOffset <= value.sourceSize
        && VALID_STATES.has(value.state)
        && Number.isSafeInteger(value.updatedAt)
}

const markerStore = {
    load(): BackgroundImportMarker | null {
        try {
            const raw = localStorage.getItem(MARKER_KEY)
            if (!raw) return null
            const value = JSON.parse(raw)
            if (validMarker(value)) return value
            localStorage.removeItem(MARKER_KEY)
        } catch {
            // Storage can be unavailable in private modes. Server discovery
            // remains the recovery authority after a completed handoff.
        }
        return null
    },
    save(marker: BackgroundImportMarker): void {
        if (!validMarker(marker)) throw new Error('Invalid background import marker')
        try { localStorage.setItem(MARKER_KEY, JSON.stringify(marker)) } catch {}
    },
    clear(operationId: string): void {
        try {
            const current = this.load()
            if (!current || current.operationId === operationId) localStorage.removeItem(MARKER_KEY)
        } catch {}
    },
}

function consumerId(): string {
    const minted = `consumer_${crypto.randomUUID().replaceAll('-', '')}`
    try {
        const existing = sessionStorage.getItem(CONSUMER_KEY)
        if (existing && /^[A-Za-z0-9_-]{8,128}$/.test(existing)) return existing
        sessionStorage.setItem(CONSUMER_KEY, minted)
    } catch {}
    return minted
}

const runtime = createBackgroundImportRuntime({
    fetcher: (input, init) => forageStorage.importJobFetch(input, init),
    markerStore,
    reconcile: coordinate => reconcileBackgroundImport(coordinate),
    confirmLowLevel: () => alertConfirm(language.lowLevelAccessConfirm),
    consumerId: consumerId(),
})

export async function runBackgroundImport(input: {
    kind: BackgroundImportKind
    name: string
    data: Blob | Uint8Array
    origin: BackgroundImportOrigin
    reporter: ImportJob
    onAdmitted?: () => void
}): Promise<BackgroundImportRunOutcome> {
    await waitForBackgroundImportReconciliation()
    return runtime.run(input)
}

let recoveryTail: Promise<BackgroundImportRunOutcome | null> | null = null
let recoveryTriggersInstalled = false

function beginRecoveryReporter(kind: BackgroundImportKind): ImportJob | null {
    return beginImportJob(kind as ImportKind, `Recovering ${kind} import...`)
}

export function recoverBackgroundImports(): Promise<BackgroundImportRunOutcome | null> {
    if (recoveryTail) return recoveryTail
    recoveryTail = (async () => {
        await waitForBackgroundImportReconciliation()
        return runtime.recover(beginRecoveryReporter)
    })().catch(error => {
        console.warn('[BackgroundImport] recovery deferred:', error instanceof Error ? error.message : String(error))
        return null
    }).finally(() => {
        recoveryTail = null
    })
    return recoveryTail
}

export function initBackgroundImportRecovery(): void {
    if (!recoveryTriggersInstalled) {
        recoveryTriggersInstalled = true
        window.addEventListener('online', () => { void recoverBackgroundImports() })
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') void recoverBackgroundImports()
        })
    }
    void recoverBackgroundImports()
}
