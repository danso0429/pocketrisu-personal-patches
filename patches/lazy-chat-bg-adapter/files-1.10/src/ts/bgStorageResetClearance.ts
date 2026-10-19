import { ORCHESTRATION_PENDING_PREFIX, type MarkerStorage } from './bgOrchestrationPending'
import { serverInputMarkerKeys } from './bgServerInputLedger'

function storageEpochValue(value: unknown): number | null {
    return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null
}

// A `missing` status body proves a storage reset removed the operation when its
// storage epoch E is newer than the epoch the marker recorded at acceptance, or,
// for a marker written before epoch stamping (no epochVersion), when E > 0.
// A marker of this version without a recorded epoch, a body without an epoch
// and a same-epoch `missing` keep the existing behaviour (false).
// Callers pass only bodies of a 404 status response.
export function isStorageResetMissing(
    marker: { operationId?: unknown; epochVersion?: unknown; storageEpoch?: unknown } | null | undefined,
    statusBody: unknown,
): boolean {
    if (!marker) return false
    const body = statusBody as { accepted?: unknown; state?: unknown; operationId?: unknown; storageEpoch?: unknown } | null
    if (!body || typeof body !== 'object' || body.state !== 'missing' || body.accepted === true) return false
    if (typeof marker.operationId === 'string' && body.operationId !== marker.operationId) return false
    const current = storageEpochValue(body.storageEpoch)
    if (current === null) return false
    const recorded = storageEpochValue(marker.storageEpoch)
    if (recorded !== null) return current > recorded
    return marker.epochVersion === undefined && current > 0
}

// The epoch evidence of a stored entry, read with the marker parsers' rules:
// storageEpoch counts only together with epochVersion 1.
function storedEpochEvidence(raw: string): { operationId?: unknown; epochVersion?: 1; storageEpoch?: unknown } | null {
    let value: any
    try { value = JSON.parse(raw) } catch { return null }
    if (!value || typeof value !== 'object') return null
    return {
        operationId: value.operationId,
        epochVersion: value.epochVersion === 1 ? 1 : undefined,
        storageEpoch: value.epochVersion === 1 ? value.storageEpoch : undefined,
    }
}

// Synchronously re-reads every stored key of the operation's marker and removes
// it. With statusBody, each current entry is removed only if it still qualifies
// for reset clearance against that body (another reader may have recorded an
// epoch while the status request was pending). True only when this call removed
// an entry, so concurrent readers in one tab show the notice once.
export function clearMarkerForStorageReset(
    storage: MarkerStorage,
    kind: 'server-input' | 'legacy',
    operationId: string,
    statusBody?: unknown,
): boolean {
    const keys = kind === 'server-input'
        ? serverInputMarkerKeys(operationId)
        : [ORCHESTRATION_PENDING_PREFIX + operationId]
    let removed = false
    for (const key of keys) {
        const raw = storage.getItem(key)
        if (raw === null) continue
        if (statusBody !== undefined && !isStorageResetMissing(storedEpochEvidence(raw), statusBody)) continue
        storage.removeItem(key)
        removed = true
    }
    return removed
}
