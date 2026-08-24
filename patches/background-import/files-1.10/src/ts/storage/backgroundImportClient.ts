import { Sha256 } from '@aws-crypto/sha256-js'

export const BACKGROUND_IMPORT_PROTOCOL_VERSION = 1
export const BACKGROUND_IMPORT_CHUNK_BYTES = 1024 * 1024

export type BackgroundImportKind = 'module' | 'character'
export type BackgroundImportFormat = 'json' | 'lorebook' | 'risum' | 'charx' | 'png' | 'jpeg'
export type BackgroundImportOrigin =
    | 'picker'
    | 'drop'
    | 'share'
    | 'hash'
    | 'launch'
    | 'url'
    | 'realm'
    | 'package'

export type BackgroundImportState =
    | 'receiving'
    | 'upload-finalizing'
    | 'uploaded'
    | 'inspecting'
    | 'awaiting-authorization'
    | 'queued'
    | 'preparing'
    | 'prepared'
    | 'committing'
    | 'reconcile-required'
    | 'completed'
    | 'client-reconciled'
    | 'delivered'
    | 'failed'
    | 'cancelled'
    | 'incompatible-after-upgrade'

export interface BackgroundImportProgress {
    phase: string
    completedItems: number
    totalItems: number
    completedBytes: number
    totalBytes: number
}

export interface BackgroundImportJob {
    operationId: string
    protocolVersion: number
    kind: BackgroundImportKind
    format: BackgroundImportFormat
    sourceSize: number
    sourceSha256: string | null
    state: BackgroundImportState
    nextOffset: number
    authorizationRequired: boolean | null
    authorizationDecision: 'accepted' | 'declined' | null
    progress: BackgroundImportProgress | null
    preparedDigest: string | null
    entityId: string | null
    committedRevision: string | null
    errorCode: string | null
    errorDetail: string | null
    updatedAt: number
}

export interface BackgroundImportResult {
    claimed: boolean
    job: BackgroundImportJob
    entity?: unknown
    preparedDigest?: string
}

export interface BackgroundImportMarker {
    version: 1
    operationId: string
    kind: BackgroundImportKind
    format: BackgroundImportFormat
    origin: BackgroundImportOrigin
    sourceSize: number
    sourceSha256: string
    nextOffset: number
    state: BackgroundImportState
    updatedAt: number
}

export interface SeekableImportSource {
    readonly size: number
    read(start: number, end: number): Promise<Uint8Array>
}

export type BackgroundImportFetch = (
    input: RequestInfo | URL,
    init?: RequestInit,
) => Promise<Response>

export interface BackgroundImportMarkerStore {
    load(): BackgroundImportMarker | null
    save(marker: BackgroundImportMarker): void
    clear(operationId: string): void
}

export interface BackgroundImportTransferProgress {
    phase: 'hashing' | 'uploading'
    completedBytes: number
    totalBytes: number
}

export class BackgroundImportProtocolError extends Error {
    readonly code: string
    readonly status: number
    readonly payload: Record<string, unknown> | null

    constructor(
        code: string,
        message: string,
        status = 0,
        payload: Record<string, unknown> | null = null,
        options?: ErrorOptions,
    ) {
        super(message, options)
        this.name = 'BackgroundImportProtocolError'
        this.code = code
        this.status = status
        this.payload = payload
    }
}

function bytesToHex(value: Uint8Array): string {
    let result = ''
    for (const byte of value) result += byte.toString(16).padStart(2, '0')
    return result
}

function validOperationId(value: unknown): value is string {
    return typeof value === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(value)
}

function errorMessage(payload: Record<string, unknown> | null, fallback: string): string {
    return typeof payload?.error === 'string' && payload.error.length > 0
        ? payload.error
        : fallback
}

async function responsePayload(response: Response): Promise<Record<string, unknown> | null> {
    try {
        const value = await response.clone().json()
        return value && typeof value === 'object' && !Array.isArray(value)
            ? value as Record<string, unknown>
            : null
    } catch {
        return null
    }
}

async function requireJson<T>(response: Response, fallback: string): Promise<T> {
    const payload = await responsePayload(response)
    if (!response.ok) {
        throw new BackgroundImportProtocolError(
            typeof payload?.code === 'string' ? payload.code : 'IMPORT_HTTP_ERROR',
            errorMessage(payload, `${fallback} (HTTP ${response.status})`),
            response.status,
            payload,
        )
    }
    if (!payload) {
        throw new BackgroundImportProtocolError(
            'IMPORT_PROTOCOL_INCOMPATIBLE',
            `${fallback}: invalid JSON response`,
            response.status,
        )
    }
    return payload as T
}

function contentJson(value: unknown): RequestInit {
    return {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(value),
    }
}

export function sourceForBackgroundImport(value: Blob | Uint8Array): SeekableImportSource {
    if (value instanceof Uint8Array) {
        return {
            size: value.byteLength,
            async read(start, end) {
                return value.slice(start, end)
            },
        }
    }
    return {
        size: value.size,
        async read(start, end) {
            return new Uint8Array(await value.slice(start, end).arrayBuffer())
        },
    }
}

export function importFormatForName(
    kind: BackgroundImportKind,
    name: string,
): BackgroundImportFormat | null {
    const basename = name.trim().toLowerCase()
    const dot = basename.lastIndexOf('.')
    if (dot <= 0 || dot === basename.length - 1) return null
    const extension = basename.slice(dot + 1)
    if (kind === 'module' && ['json', 'lorebook', 'risum', 'charx'].includes(extension)) {
        return extension as BackgroundImportFormat
    }
    if (kind === 'character') {
        if (extension === 'jpg' || extension === 'jpeg') return 'jpeg'
        if (['json', 'png', 'charx'].includes(extension)) return extension as BackgroundImportFormat
    }
    return null
}

export function mintBackgroundImportId(prefix = 'import'): string {
    const random = globalThis.crypto?.randomUUID?.().replaceAll('-', '')
        ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
    return `${prefix}_${random}`.slice(0, 128)
}

export async function digestImportSource(
    source: SeekableImportSource,
    onProgress?: (progress: BackgroundImportTransferProgress) => void,
    chunkBytes = BACKGROUND_IMPORT_CHUNK_BYTES,
): Promise<string> {
    if (!Number.isSafeInteger(source.size) || source.size <= 0) {
        throw new BackgroundImportProtocolError('IMPORT_SOURCE_SIZE_INVALID', 'Import source is empty')
    }
    const hash = new Sha256()
    for (let start = 0; start < source.size; start += chunkBytes) {
        const end = Math.min(source.size, start + chunkBytes)
        const chunk = await source.read(start, end)
        if (chunk.byteLength !== end - start) {
            throw new BackgroundImportProtocolError('IMPORT_SOURCE_MISMATCH', 'Import source changed while hashing')
        }
        hash.update(chunk)
        onProgress?.({ phase: 'hashing', completedBytes: end, totalBytes: source.size })
    }
    return bytesToHex(await hash.digest())
}

export function markerForJob(
    coordinates: {
        operationId: string
        kind: BackgroundImportKind
        format: BackgroundImportFormat
        origin: BackgroundImportOrigin
        sourceSize: number
        sourceSha256: string
    },
    job: BackgroundImportJob,
): BackgroundImportMarker {
    return {
        version: 1,
        ...coordinates,
        nextOffset: job.nextOffset,
        state: job.state,
        updatedAt: Date.now(),
    }
}

export function createBackgroundImportApi(fetcher: BackgroundImportFetch) {
    async function createJob(input: {
        operationId: string
        kind: BackgroundImportKind
        format: BackgroundImportFormat
        sourceSize: number
        origin: BackgroundImportOrigin
    }): Promise<BackgroundImportJob> {
        return requireJson(await fetcher('/api/import-jobs', contentJson({
            ...input,
            protocolVersion: BACKGROUND_IMPORT_PROTOCOL_VERSION,
        })), 'Could not create import')
    }

    async function status(operationId: string): Promise<BackgroundImportJob> {
        return requireJson(await fetcher(`/api/import-jobs/${encodeURIComponent(operationId)}`), 'Could not read import status')
    }

    async function list(): Promise<BackgroundImportJob[]> {
        const payload = await requireJson<{ jobs?: unknown }>(
            await fetcher('/api/import-jobs'),
            'Could not list imports',
        )
        return Array.isArray(payload.jobs) ? payload.jobs as BackgroundImportJob[] : []
    }

    async function append(
        operationId: string,
        offset: number,
        chunk: Uint8Array,
        sha256: string,
    ): Promise<BackgroundImportJob & { replayed?: boolean }> {
        return requireJson(await fetcher(
            `/api/import-jobs/${encodeURIComponent(operationId)}/source`,
            {
                method: 'PUT',
                headers: {
                    'content-type': 'application/octet-stream',
                    'x-upload-offset': String(offset),
                    'x-chunk-sha256': sha256,
                },
                body: chunk as BodyInit,
            },
        ), 'Could not upload import source')
    }

    async function complete(operationId: string, sha256: string): Promise<BackgroundImportJob> {
        return requireJson(await fetcher(
            `/api/import-jobs/${encodeURIComponent(operationId)}/source/complete`,
            contentJson({ sha256 }),
        ), 'Could not complete import upload')
    }

    async function authorize(operationId: string, accepted: boolean): Promise<BackgroundImportJob> {
        return requireJson(await fetcher(
            `/api/import-jobs/${encodeURIComponent(operationId)}/authorize`,
            contentJson({ accepted }),
        ), 'Could not record import authorization')
    }

    async function claim(operationId: string, consumerId: string): Promise<BackgroundImportResult> {
        return requireJson(await fetcher(
            `/api/import-jobs/${encodeURIComponent(operationId)}/result/claim`,
            contentJson({ consumerId }),
        ), 'Could not claim import result')
    }

    async function heartbeat(operationId: string, consumerId: string): Promise<BackgroundImportJob> {
        return requireJson(await fetcher(
            `/api/import-jobs/${encodeURIComponent(operationId)}/claim/heartbeat`,
            contentJson({ consumerId }),
        ), 'Could not renew import result claim')
    }

    async function reconciled(operationId: string, consumerId: string): Promise<BackgroundImportJob> {
        return requireJson(await fetcher(
            `/api/import-jobs/${encodeURIComponent(operationId)}/reconciled`,
            contentJson({ consumerId }),
        ), 'Could not record import reconciliation')
    }

    async function ack(operationId: string, consumerId: string): Promise<BackgroundImportJob> {
        return requireJson(await fetcher(
            `/api/import-jobs/${encodeURIComponent(operationId)}/ack`,
            contentJson({ consumerId }),
        ), 'Could not acknowledge import result')
    }

    async function remove(operationId: string): Promise<BackgroundImportJob> {
        return requireJson(await fetcher(
            `/api/import-jobs/${encodeURIComponent(operationId)}`,
            { method: 'DELETE' },
        ), 'Could not cancel or clean import')
    }

    return { createJob, status, list, append, complete, authorize, claim, heartbeat, reconciled, ack, remove }
}

function sameUploadCoordinates(
    job: BackgroundImportJob,
    coordinates: {
        operationId: string
        kind: BackgroundImportKind
        format: BackgroundImportFormat
        sourceSize: number
    },
): boolean {
    return job.operationId === coordinates.operationId
        && job.kind === coordinates.kind
        && job.format === coordinates.format
        && job.sourceSize === coordinates.sourceSize
}

export async function uploadBackgroundImportSource(options: {
    fetcher: BackgroundImportFetch
    markerStore: BackgroundImportMarkerStore
    source: SeekableImportSource
    operationId: string
    kind: BackgroundImportKind
    format: BackgroundImportFormat
    origin: BackgroundImportOrigin
    sourceSha256?: string
    onProgress?: (progress: BackgroundImportTransferProgress) => void
    chunkBytes?: number
}): Promise<{ job: BackgroundImportJob; marker: BackgroundImportMarker }> {
    const api = createBackgroundImportApi(options.fetcher)
    const chunkBytes = options.chunkBytes ?? BACKGROUND_IMPORT_CHUNK_BYTES
    const sourceSha256 = options.sourceSha256
        ?? await digestImportSource(options.source, options.onProgress, chunkBytes)
    const coordinates = {
        operationId: options.operationId,
        kind: options.kind,
        format: options.format,
        origin: options.origin,
        sourceSize: options.source.size,
        sourceSha256,
    }
    const previous = options.markerStore.load()
    if (previous?.operationId === options.operationId && (
        previous.sourceSize !== options.source.size
        || previous.sourceSha256 !== sourceSha256
        || previous.kind !== options.kind
        || previous.format !== options.format
    )) {
        throw new BackgroundImportProtocolError(
            'IMPORT_SOURCE_MISMATCH',
            'The selected file does not match the interrupted import',
        )
    }

    let job: BackgroundImportJob
    try {
        job = await api.createJob(coordinates)
    } catch (error) {
        if (!(error instanceof TypeError)) throw error
        try { job = await api.status(options.operationId) }
        catch { job = await api.createJob(coordinates) }
    }
    if (!sameUploadCoordinates(job, coordinates)) {
        throw new BackgroundImportProtocolError('IMPORT_OPERATION_CONFLICT', 'Server import coordinates changed')
    }
    let marker = markerForJob(coordinates, job)
    options.markerStore.save(marker)

    if (job.state === 'receiving') {
        let offset = job.nextOffset
        while (offset < options.source.size) {
            const end = Math.min(options.source.size, offset + chunkBytes)
            const chunk = await options.source.read(offset, end)
            if (chunk.byteLength !== end - offset) {
                throw new BackgroundImportProtocolError('IMPORT_SOURCE_MISMATCH', 'Import source changed while uploading')
            }
            const chunkHasher = new Sha256()
            chunkHasher.update(chunk)
            const chunkHash = bytesToHex(await chunkHasher.digest())
            try {
                job = await api.append(options.operationId, offset, chunk, chunkHash)
            } catch (error) {
                if (!(error instanceof TypeError)) throw error
                job = await api.status(options.operationId)
                if (job.state !== 'receiving' || ![offset, end].includes(job.nextOffset)) throw error
                if (job.nextOffset === offset) job = await api.append(options.operationId, offset, chunk, chunkHash)
            }
            if (job.nextOffset !== end) {
                throw new BackgroundImportProtocolError('IMPORT_UPLOAD_OFFSET_CONFLICT', 'Server upload offset changed')
            }
            offset = end
            marker = markerForJob(coordinates, job)
            options.markerStore.save(marker)
            options.onProgress?.({ phase: 'uploading', completedBytes: offset, totalBytes: options.source.size })
        }
    }

    if (job.state === 'receiving' || job.state === 'upload-finalizing') {
        try {
            job = await api.complete(options.operationId, sourceSha256)
        } catch (error) {
            if (!(error instanceof TypeError)) throw error
            job = await api.status(options.operationId)
            if (job.state === 'receiving') job = await api.complete(options.operationId, sourceSha256)
        }
    }
    if (job.sourceSha256 !== sourceSha256 || job.state === 'receiving') {
        throw new BackgroundImportProtocolError('IMPORT_SOURCE_MISMATCH', 'Server did not retain the exact import source')
    }
    marker = markerForJob(coordinates, job)
    options.markerStore.save(marker)
    return { job, marker }
}

export function isBackgroundSafeImportState(state: BackgroundImportState): boolean {
    return [
        'queued', 'preparing', 'prepared', 'committing', 'reconcile-required',
        'completed', 'client-reconciled', 'delivered',
    ].includes(state)
}

export function isClosedImportState(state: BackgroundImportState): boolean {
    return ['delivered', 'failed', 'cancelled', 'incompatible-after-upgrade'].includes(state)
}
