import type { MarkerStorage } from './bgOrchestrationPending'

export interface ServerInputMarker {
    operationId: string
    charId: string
    chatId: string
    localRevision: string
    baseRevision: string
    state: 'uncertain' | 'accepted'
    createdAt: number
}

export const SERVER_INPUT_MARKER_PREFIX = 'bg-server-input-v1:'
export const SERVER_INPUT_MARKER_MAX_AGE_MS = 49 * 60 * 60 * 1000
export const SERVER_INPUT_MARKER_MAX_ENTRIES = 128

function markerKey(operationId: string): string {
    return SERVER_INPUT_MARKER_PREFIX + operationId
}

function validMarker(value: unknown): value is ServerInputMarker {
    if (!value || typeof value !== 'object') return false
    const marker = value as Record<string, unknown>
    const fields = new Set([
        'operationId', 'charId', 'chatId', 'localRevision',
        'baseRevision', 'state', 'createdAt',
    ])
    return Object.keys(marker).every(key => fields.has(key))
        && typeof marker.operationId === 'string' && marker.operationId.length > 0
        && marker.operationId.length <= 128
        && typeof marker.charId === 'string' && marker.charId.length > 0
        && marker.charId.length <= 255
        && typeof marker.chatId === 'string' && marker.chatId.length > 0
        && marker.chatId.length <= 255
        && typeof marker.localRevision === 'string'
        && /^[a-f0-9]{64}$/.test(marker.localRevision)
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
        if (key?.startsWith(SERVER_INPUT_MARKER_PREFIX)) keys.push(key)
    }
    const candidates: ServerInputMarker[] = []
    for (const key of keys) {
        let marker: unknown
        try { marker = JSON.parse(storage.getItem(key) || '') } catch { /* invalid */ }
        if (!validMarker(marker) || key !== markerKey(marker.operationId)
            || now - marker.createdAt > SERVER_INPUT_MARKER_MAX_AGE_MS) {
            storage.removeItem(key)
            continue
        }
        if (marker.createdAt > now) {
            marker = { ...marker, createdAt: now }
            storage.setItem(key, JSON.stringify(marker))
        }
        candidates.push(marker as ServerInputMarker)
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
}

export function advanceServerInputMarkerRevisions(
    storage: MarkerStorage,
    charId: string,
    chatId: string,
    previousRevision: string,
    nextRevision: string,
    now = Date.now(),
): number {
    if (!/^[a-f0-9]{64}$/.test(nextRevision)) {
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
