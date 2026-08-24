import {
    BackgroundImportProtocolError,
    createBackgroundImportApi,
    importFormatForName,
    isTransientImportTransportError,
    isBackgroundSafeImportState,
    isClosedImportState,
    markerForJob,
    mintBackgroundImportId,
    sourceForBackgroundImport,
    uploadBackgroundImportSource,
    type BackgroundImportFetch,
    type BackgroundImportJob,
    type BackgroundImportKind,
    type BackgroundImportMarkerStore,
    type BackgroundImportOrigin,
} from './backgroundImportClient'
import type { BackgroundImportEntityCoordinate } from './backgroundImportReconcile'

export interface BackgroundImportReporter {
    update(message: string, description?: string): void
    backgroundSafe(message: string, description?: string): void
    succeed(message: string, description?: string): void
    fail(error: unknown): void
    dismiss(): void
}

export type BackgroundImportRunOutcome =
    | { status: 'imported'; job: BackgroundImportJob }
    | { status: 'cancelled'; job: BackgroundImportJob }
    | { status: 'foreground-required'; job: BackgroundImportJob }
    | { status: 'failed'; job: BackgroundImportJob | null; error: unknown; committed: boolean }

export interface BackgroundImportRuntimeDependencies {
    fetcher: BackgroundImportFetch
    markerStore: BackgroundImportMarkerStore
    reconcile(coordinate: BackgroundImportEntityCoordinate): Promise<void>
    confirmLowLevel(): Promise<boolean>
    consumerId: string
    wait?(milliseconds: number): Promise<void>
    claimHeartbeatMs?: number
}

const FOLLOW_INTERVAL_MS = 750
const CLAIM_HEARTBEAT_MS = 30_000

function describeBytes(value: number, total: number): string {
    const mib = (value / (1024 * 1024)).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1)
    const totalMib = (total / (1024 * 1024)).toFixed(total >= 10 * 1024 * 1024 ? 0 : 1)
    return `${mib} / ${totalMib} MiB`
}

function stateMessage(job: BackgroundImportJob): [string, string | undefined] {
    if (job.state === 'uploaded' || job.state === 'inspecting') {
        return ['Inspecting import security...', 'Keep this page open until authorization is resolved']
    }
    if (job.state === 'queued') return ['Import handed to the server', 'You may switch tabs or leave this page']
    if (job.state === 'preparing') {
        const progress = job.progress
        const description = progress
            ? `${progress.completedItems}/${progress.totalItems} items, ${describeBytes(progress.completedBytes, progress.totalBytes)}`
            : 'Validating and staging imported data'
        return ['Preparing import in the background...', description]
    }
    if (job.state === 'prepared' || job.state === 'committing') {
        return ['Saving import on the server...', 'Waiting for the canonical database commit']
    }
    if (job.state === 'completed' || job.state === 'client-reconciled') {
        return ['Restoring the completed import...', 'Reconciling this tab with the server']
    }
    return ['Recovering background import...', undefined]
}

function terminalError(job: BackgroundImportJob): BackgroundImportProtocolError {
    return new BackgroundImportProtocolError(
        job.errorCode ?? 'IMPORT_PREPARATION_FAILED',
        job.errorDetail || `Background import stopped in state ${job.state}`,
    )
}

export function createBackgroundImportRuntime(deps: BackgroundImportRuntimeDependencies) {
    const api = createBackgroundImportApi(deps.fetcher)
    const wait = deps.wait ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)))
    const heartbeatMs = deps.claimHeartbeatMs ?? CLAIM_HEARTBEAT_MS

    function saveMarker(job: BackgroundImportJob, fallback?: {
        origin: BackgroundImportOrigin
        sourceSha256: string
    }) {
        if (!job.sourceSha256 && !fallback?.sourceSha256) return
        deps.markerStore.save(markerForJob({
            operationId: job.operationId,
            kind: job.kind,
            format: job.format,
            origin: job.origin ?? fallback?.origin ?? 'picker',
            sourceSize: job.sourceSize,
            sourceSha256: job.sourceSha256 ?? fallback!.sourceSha256,
        }, job))
    }

    async function statusWithRetry(operationId: string): Promise<BackgroundImportJob> {
        while (true) {
            try { return await api.status(operationId) }
            catch (error) {
                if (!isTransientImportTransportError(error)) throw error
                await wait(FOLLOW_INTERVAL_MS)
            }
        }
    }

    async function listWithRetry(): Promise<BackgroundImportJob[]> {
        while (true) {
            try { return await api.list() }
            catch (error) {
                if (!isTransientImportTransportError(error)) throw error
                await wait(FOLLOW_INTERVAL_MS)
            }
        }
    }

    async function authorizeWithRetry(
        operationId: string,
        accepted: boolean,
    ): Promise<BackgroundImportJob> {
        while (true) {
            try { return await api.authorize(operationId, accepted) }
            catch (error) {
                if (!isTransientImportTransportError(error)) throw error
                await wait(FOLLOW_INTERVAL_MS)
                const current = await statusWithRetry(operationId)
                if (current.state !== 'awaiting-authorization') return current
            }
        }
    }

    async function cleanupClosed(job: BackgroundImportJob): Promise<void> {
        try {
            await api.remove(job.operationId)
            deps.markerStore.clear(job.operationId)
        } catch {
            saveMarker(job)
        }
    }

    async function reconcileAndAck(
        initial: BackgroundImportJob,
        reporter: BackgroundImportReporter,
    ): Promise<BackgroundImportRunOutcome> {
        let job = initial
        while (job.state !== 'delivered') {
            let claim
            try { claim = await api.claim(job.operationId, deps.consumerId) }
            catch (error) {
                if (error instanceof BackgroundImportProtocolError && error.status === 409) {
                    await wait(FOLLOW_INTERVAL_MS)
                    job = await statusWithRetry(job.operationId)
                    continue
                }
                if (isTransientImportTransportError(error)) {
                    await wait(FOLLOW_INTERVAL_MS)
                    job = await statusWithRetry(job.operationId)
                    continue
                }
                throw error
            }
            if (!claim.claimed) {
                await wait(FOLLOW_INTERVAL_MS)
                job = await statusWithRetry(job.operationId)
                continue
            }
            job = claim.job
            let heartbeatError: unknown = null
            const heartbeat = setInterval(() => {
                void api.heartbeat(job.operationId, deps.consumerId).catch(error => {
                    if (!isTransientImportTransportError(error)) heartbeatError = error
                })
            }, heartbeatMs)
            try {
                const coordinate: BackgroundImportEntityCoordinate = {
                    kind: job.kind,
                    entityId: job.entityId ?? '',
                    committedRevision: job.committedRevision ?? '',
                }
                while (true) {
                    try { await deps.reconcile(coordinate); break }
                    catch (error) {
                        if (!isTransientImportTransportError(error)) throw error
                        await wait(FOLLOW_INTERVAL_MS)
                        job = await statusWithRetry(job.operationId)
                    }
                }
                if (heartbeatError) throw heartbeatError
                while (job.state === 'completed') {
                    try { job = await api.reconciled(job.operationId, deps.consumerId) }
                    catch (error) {
                        if (!isTransientImportTransportError(error)) throw error
                        await wait(FOLLOW_INTERVAL_MS)
                        job = await statusWithRetry(job.operationId)
                    }
                }
                while (job.state !== 'delivered') {
                    try { job = await api.ack(job.operationId, deps.consumerId) }
                    catch (error) {
                        if (!isTransientImportTransportError(error)) throw error
                        await wait(FOLLOW_INTERVAL_MS)
                        job = await statusWithRetry(job.operationId)
                    }
                }
            } finally {
                clearInterval(heartbeat)
            }
        }
        deps.markerStore.clear(job.operationId)
        reporter.succeed(job.kind === 'character' ? 'Character imported.' : 'Module imported.')
        return { status: 'imported', job }
    }

    async function follow(
        initial: BackgroundImportJob,
        reporter: BackgroundImportReporter,
    ): Promise<BackgroundImportRunOutcome> {
        let job = initial
        let backgroundSafe = false
        while (true) {
            saveMarker(job)
            if (job.state === 'awaiting-authorization') {
                reporter.update('Import authorization required', 'Review low-level module access before continuing')
                const accepted = await deps.confirmLowLevel()
                job = await authorizeWithRetry(job.operationId, accepted)
                if (!accepted) {
                    deps.markerStore.clear(job.operationId)
                    reporter.dismiss()
                    return { status: 'cancelled', job }
                }
                continue
            }
            if (isBackgroundSafeImportState(job.state) && !backgroundSafe) {
                backgroundSafe = true
                reporter.backgroundSafe('Import continues on the server', 'You may switch tabs or leave this page')
            }
            const [message, description] = stateMessage(job)
            reporter.update(message, description)
            if (job.state === 'completed' || job.state === 'client-reconciled' || job.state === 'delivered') {
                return reconcileAndAck(job, reporter)
            }
            if (job.state === 'failed') {
                if (job.errorCode === 'IMPORT_PASSWORD_REQUIRED') {
                    await cleanupClosed(job)
                    reporter.update('Password required', 'Continuing with the foreground character importer')
                    return { status: 'foreground-required', job }
                }
                const error = terminalError(job)
                await cleanupClosed(job)
                reporter.fail(error)
                return { status: 'failed', job, error, committed: false }
            }
            if (job.state === 'cancelled' || job.state === 'incompatible-after-upgrade') {
                await cleanupClosed(job)
                reporter.dismiss()
                return { status: 'cancelled', job }
            }
            if (job.state === 'reconcile-required') {
                const error = terminalError(job)
                reporter.fail(error)
                return { status: 'failed', job, error, committed: true }
            }
            await wait(FOLLOW_INTERVAL_MS)
            job = await statusWithRetry(job.operationId)
        }
    }

    async function run(input: {
        kind: BackgroundImportKind
        name: string
        data: Blob | Uint8Array
        origin: BackgroundImportOrigin
        reporter: BackgroundImportReporter
        onAdmitted?: () => void
    }): Promise<BackgroundImportRunOutcome> {
        const format = importFormatForName(input.kind, input.name)
        if (!format) {
            const error = new BackgroundImportProtocolError('IMPORT_UNSUPPORTED_FORMAT', 'Unsupported import file type')
            input.reporter.fail(error)
            return { status: 'failed', job: null, error, committed: false }
        }
        const source = sourceForBackgroundImport(input.data)
        let marker = deps.markerStore.load()
        if (marker) {
            try {
                const prior = await api.status(marker.operationId)
                if (isClosedImportState(prior.state)) {
                    await cleanupClosed(prior)
                    marker = null
                }
            } catch (error) {
                if (error instanceof BackgroundImportProtocolError && error.status === 404) {
                    deps.markerStore.clear(marker.operationId)
                    marker = null
                } else if (!isTransientImportTransportError(error)) {
                    throw error
                }
            }
        }
        let operationId = marker?.kind === input.kind
            && marker.format === format
            && marker.sourceSize === source.size
            ? marker.operationId
            : mintBackgroundImportId(input.kind)
        let currentJob: BackgroundImportJob | null = null
        try {
            const active = (await listWithRetry())[0]
            if (active) {
                currentJob = active
                if (
                    active.state === 'receiving'
                    && active.kind === input.kind
                    && active.format === format
                    && active.sourceSize === source.size
                ) operationId = active.operationId
                else {
                    const error = new BackgroundImportProtocolError(
                        'IMPORT_ACTIVE',
                        'Another background import must be recovered before starting this file',
                    )
                    input.reporter.fail(error)
                    return { status: 'failed', job: active, error, committed: isBackgroundSafeImportState(active.state) }
                }
            }
            const uploaded = await uploadBackgroundImportSource({
                fetcher: deps.fetcher,
                markerStore: deps.markerStore,
                source,
                operationId,
                kind: input.kind,
                format,
                origin: input.origin,
                onProgress(progress) {
                    input.reporter.update(
                        progress.phase === 'hashing' ? 'Checking import file...' : 'Uploading import file...',
                        describeBytes(progress.completedBytes, progress.totalBytes),
                    )
                },
                wait,
                onTransportWait() {
                    input.reporter.update(
                        'Waiting to resume import upload...',
                        'The verified server offset is preserved',
                    )
                },
            })
            currentJob = uploaded.job
            try { input.onAdmitted?.() } catch {}
            return await follow(uploaded.job, input.reporter)
        } catch (error) {
            input.reporter.fail(error)
            return {
                status: 'failed',
                job: currentJob,
                error,
                committed: currentJob ? isBackgroundSafeImportState(currentJob.state) : false,
            }
        }
    }

    async function recover(
        reporterFor: (kind: BackgroundImportKind) => BackgroundImportReporter | null,
    ): Promise<BackgroundImportRunOutcome | null> {
        const marker = deps.markerStore.load()
        let jobs = await listWithRetry()
        if (jobs.length === 0 && marker) {
            try { jobs = [await api.status(marker.operationId)] }
            catch (error) {
                if (error instanceof BackgroundImportProtocolError && error.status === 404) {
                    deps.markerStore.clear(marker.operationId)
                    return null
                }
                throw error
            }
        }
        const job = jobs[0]
        if (!job) return null
        const reporter = reporterFor(job.kind)
        if (!reporter) return null
        saveMarker(job)
        if (job.state === 'receiving') {
            reporter.fail(new BackgroundImportProtocolError(
                'IMPORT_SOURCE_RESELECTION_REQUIRED',
                'Select the same file again to resume this upload',
            ))
            return { status: 'failed', job, error: new Error('source reselection required'), committed: false }
        }
        return follow(job, reporter)
    }

    return { api, follow, recover, run }
}
