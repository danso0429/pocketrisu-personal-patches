import type { MarkerStorage } from './bgOrchestrationPending'

export interface ServerInputMarker {
    operationId: string
    charId: string
    chatId: string
    localRevision: string
    adoptedRevision?: string
    baseRevision: string
    state: 'uncertain' | 'accepted'
    createdAt: number
    recoveryOutcome?: string
    recoveryNoticeKey?: string
}

// v2 readers reject unknown fields and remove the whole entry. Isolate the
// optional recovery annotations from those readers, as v2 did for v1.
export const SERVER_INPUT_MARKER_PREFIX = 'bg-server-input-v3:'
const LEGACY_SERVER_INPUT_MARKER_PREFIXES = ['bg-server-input-v2:', 'bg-server-input-v1:']
export const SERVER_INPUT_MARKER_MAX_AGE_MS = 49 * 60 * 60 * 1000
export const SERVER_INPUT_MARKER_MAX_ENTRIES = 128

function markerKey(operationId: string): string {
    return SERVER_INPUT_MARKER_PREFIX + operationId
}

export function isInputViewRevision(value: unknown): value is string {
    return typeof value === 'string' && value.length <= 128
        && (/^[0-9a-z]+-[0-9a-z]+-[0-9a-z]+$/.test(value) || /^[a-f0-9]{64}$/.test(value))
}

function validMarker(value: unknown): value is ServerInputMarker {
    if (!value || typeof value !== 'object') return false
    const marker = value as Record<string, unknown>
    const fields = new Set([
        'operationId', 'charId', 'chatId', 'localRevision',
        'baseRevision', 'state', 'createdAt', 'adoptedRevision',
        'recoveryOutcome', 'recoveryNoticeKey',
    ])
    return Object.keys(marker).every(key => fields.has(key))
        && (marker.recoveryOutcome === undefined || (typeof marker.recoveryOutcome === 'string' && marker.recoveryOutcome.length <= 64))
        && (marker.recoveryNoticeKey === undefined || (typeof marker.recoveryNoticeKey === 'string' && marker.recoveryNoticeKey.length <= 1024))
        && typeof marker.operationId === 'string' && marker.operationId.length > 0
        && marker.operationId.length <= 128
        && typeof marker.charId === 'string' && marker.charId.length > 0
        && marker.charId.length <= 255
        && typeof marker.chatId === 'string' && marker.chatId.length > 0
        && marker.chatId.length <= 255
        && isInputViewRevision(marker.localRevision)
        && (marker.adoptedRevision === undefined || (typeof marker.adoptedRevision === 'string'
            && /^[a-f0-9]{64}$/.test(marker.adoptedRevision)))
        && typeof marker.baseRevision === 'string'
        && /^[a-f0-9]{64}$/.test(marker.baseRevision)
        && (marker.state === 'uncertain' || marker.state === 'accepted')
        && Number.isSafeInteger(marker.createdAt) && Number(marker.createdAt) > 0
}

export function readServerInputMarkers(
    storage: MarkerStorage,
    now = Date.now(),
    protectedOperationId: string | null = null,
): ServerInputMarker[] {
    const keys: string[] = []
    for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index)
        if (key && [SERVER_INPUT_MARKER_PREFIX, ...LEGACY_SERVER_INPUT_MARKER_PREFIXES].some(prefix => key.startsWith(prefix))) keys.push(key)
    }
    const prefixes = [SERVER_INPUT_MARKER_PREFIX, ...LEGACY_SERVER_INPUT_MARKER_PREFIXES]
    keys.sort((left, right) => prefixes.findIndex(prefix => left.startsWith(prefix))
        - prefixes.findIndex(prefix => right.startsWith(prefix)))
    const candidates: ServerInputMarker[] = []
    const seen = new Set<string>()
    for (const key of keys) {
        let parsed: unknown
        try { parsed = JSON.parse(storage.getItem(key) || '') } catch { /* invalid */ }
        const legacy = LEGACY_SERVER_INPUT_MARKER_PREFIXES.find(prefix => key.startsWith(prefix))
        if (!validMarker(parsed) || key !== (legacy ? legacy + parsed.operationId : markerKey(parsed.operationId))
            || now - parsed.createdAt > SERVER_INPUT_MARKER_MAX_AGE_MS) {
            storage.removeItem(key)
            continue
        }
        let marker: ServerInputMarker = parsed
        // A lower-priority row must not perform migration writes after a
        // higher-priority row was selected but could not be copied (quota).
        if (seen.has(marker.operationId)) continue
        if (legacy) {
            const destination = markerKey(marker.operationId)
            let existing: unknown
            try { existing = JSON.parse(storage.getItem(destination) || '') } catch {}
            if (validMarker(existing) && existing.operationId === marker.operationId
                && now - existing.createdAt <= SERVER_INPUT_MARKER_MAX_AGE_MS) {
                marker = existing
                try { storage.removeItem(key) } catch { /* Duplicate cleanup is best effort. */ }
            } else {
                // Copy before removal. Failed migration must neither lose the
                // legacy row nor prevent unrelated current rows being read.
                try {
                    storage.setItem(destination, JSON.stringify(marker))
                    storage.removeItem(key)
                } catch { /* Return the validated legacy candidate until migration can succeed. */ }
            }
        }
        if (marker.createdAt > now) {
            marker = { ...marker, createdAt: now }
            try { storage.setItem(markerKey(marker.operationId), JSON.stringify(marker)) }
            catch { /* A clock correction can still be applied to this read. */ }
        }
        seen.add(marker.operationId)
        candidates.push(marker)
    }
    candidates.sort((left, right) => left.createdAt - right.createdAt
        || left.operationId.localeCompare(right.operationId))
    const protectedMarker = protectedOperationId
        ? candidates.find(marker => marker.operationId === protectedOperationId)
        : undefined
    const rest = protectedMarker
        ? candidates.filter(marker => marker !== protectedMarker) : candidates
    const retained = [
        ...rest.slice(-(SERVER_INPUT_MARKER_MAX_ENTRIES - (protectedMarker ? 1 : 0))),
        ...(protectedMarker ? [protectedMarker] : []),
    ].sort((left, right) => left.createdAt - right.createdAt)
    const retainedIds = new Set(retained.map(marker => marker.operationId))
    for (const marker of candidates) {
        if (!retainedIds.has(marker.operationId)) storage.removeItem(markerKey(marker.operationId))
    }
    return retained
}

export function writeServerInputMarker(storage: MarkerStorage, marker: ServerInputMarker): void {
    if (!validMarker(marker)) throw new Error('server input marker is invalid')
    storage.setItem(markerKey(marker.operationId), JSON.stringify(marker))
    readServerInputMarkers(storage, marker.createdAt, marker.operationId)
}

export function updateServerInputMarker(
    storage: MarkerStorage,
    operationId: string,
    update: (marker: ServerInputMarker) => ServerInputMarker,
): boolean {
    const raw = storage.getItem(markerKey(operationId))
    let parsed: unknown
    try { parsed = JSON.parse(raw || '') } catch { return false }
    if (!validMarker(parsed) || parsed.operationId !== operationId) return false
    const next = update(parsed)
    if (!validMarker(next) || next.operationId !== operationId
        || next.charId !== parsed.charId || next.chatId !== parsed.chatId) {
        throw new Error('server input marker update is invalid')
    }
    storage.setItem(markerKey(operationId), JSON.stringify(next))
    return true
}

export function clearServerInputMarker(storage: MarkerStorage, operationId: string): void {
    storage.removeItem(markerKey(operationId))
    for (const prefix of LEGACY_SERVER_INPUT_MARKER_PREFIXES) storage.removeItem(prefix + operationId)
}

export function advanceServerInputMarkerRevisions(
    storage: MarkerStorage,
    charId: string,
    chatId: string,
    previousRevision: string,
    nextRevision: string,
    now = Date.now(),
): number {
    if (!isInputViewRevision(nextRevision)) {
        throw new Error('server input adopted revision is invalid')
    }
    let advanced = 0
    for (const marker of readServerInputMarkers(storage, now)) {
        if (marker.charId !== charId || marker.chatId !== chatId
            || marker.state !== 'accepted'
            || marker.localRevision !== previousRevision) continue
        if (updateServerInputMarker(storage, marker.operationId, current => ({
            ...current, localRevision: nextRevision,
        }))) advanced += 1
    }
    return advanced
}
