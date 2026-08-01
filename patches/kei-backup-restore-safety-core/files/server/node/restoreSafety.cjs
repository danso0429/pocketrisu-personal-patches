'use strict'

const { randomBytes } = require('node:crypto')

const FRESH_SNAPSHOT_REQUIRED_CODE = 'fresh_snapshot_required'
const RESTORE_WITHOUT_FRESH_SNAPSHOT_HEADER = 'x-risu-restore-without-fresh-snapshot'
const RESTORE_CONFIRMATION_HEADER = 'x-risu-restore-confirmation'
const RESTORE_SOURCE_ID_HEADER = 'x-risu-restore-source-id'
const DEFAULT_CONFIRMATION_TTL_MS = 5 * 60 * 1000
const DEFAULT_CONFIRMATION_MAX_ENTRIES = 128

function errorMessage(error, fallback = 'Fresh pre-restore snapshot failed') {
    if (error && typeof error.message === 'string' && error.message.trim()) {
        return error.message.trim()
    }
    return fallback
}

function freshSnapshotRequiredError(error) {
    const wrapped = new Error(
        `Fresh pre-restore snapshot failed: ${errorMessage(error)}. Restore was not started.`,
    )
    wrapped.code = FRESH_SNAPSHOT_REQUIRED_CODE
    return wrapped
}

function isFreshSnapshotRequiredError(error) {
    return error?.code === FRESH_SNAPSHOT_REQUIRED_CODE
}

function restoreSafetyErrorPayload(error, fallback = 'Restore failed') {
    const payload = {
        code: typeof error?.code === 'string' ? error.code : undefined,
        message: errorMessage(error, fallback),
    }
    if (typeof error?.confirmationToken === 'string' && error.confirmationToken) {
        payload.confirmationToken = error.confirmationToken
    }
    return payload
}

function createRestoreConfirmationOwner({
    now = () => Date.now(),
    token = () => randomBytes(24).toString('base64url'),
    ttlMs = DEFAULT_CONFIRMATION_TTL_MS,
    maxEntries = DEFAULT_CONFIRMATION_MAX_ENTRIES,
} = {}) {
    if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) throw new Error('invalid confirmation TTL')
    if (!Number.isSafeInteger(maxEntries) || maxEntries <= 0) {
        throw new Error('invalid confirmation capacity')
    }
    const entries = new Map()

    const prune = () => {
        const current = now()
        for (const [key, entry] of entries) {
            if (entry.expiresAt <= current) entries.delete(key)
        }
    }

    return {
        issue(restoreTarget) {
            if (typeof restoreTarget !== 'string' || !restoreTarget) {
                throw new Error('restore confirmation target is required')
            }
            prune()
            while (entries.size >= maxEntries) {
                entries.delete(entries.keys().next().value)
            }
            let confirmationToken
            do confirmationToken = token()
            while (typeof confirmationToken !== 'string' || !confirmationToken || entries.has(confirmationToken))
            entries.set(confirmationToken, {
                restoreTarget,
                expiresAt: now() + ttlMs,
            })
            return confirmationToken
        },
        consume(headers, restoreTarget) {
            if (headers?.[RESTORE_WITHOUT_FRESH_SNAPSHOT_HEADER] !== '1') return false
            const confirmationToken = headers?.[RESTORE_CONFIRMATION_HEADER]
            if (typeof confirmationToken !== 'string' || !confirmationToken) return false
            prune()
            const entry = entries.get(confirmationToken)
            if (!entry || entry.restoreTarget !== restoreTarget) return false
            entries.delete(confirmationToken)
            return true
        },
        size() {
            prune()
            return entries.size
        },
    }
}

function restoreTargetForLocalImport(headers) {
    const declared = headers?.[RESTORE_SOURCE_ID_HEADER]
    const boundedDeclared = typeof declared === 'string' && declared.length <= 128
        ? declared
        : ''
    const contentLength = String(headers?.['content-length'] ?? '')
    return `local:${boundedDeclared || contentLength || 'unknown'}`
}

function nextUniqueSnapshotKey({ prefix, now, existingKeys }) {
    const occupied = existingKeys instanceof Set
        ? existingKeys
        : new Set(existingKeys ?? [])
    const nowTick = Number((now / 100).toFixed())
    let newestExistingTick = -1
    for (const key of occupied) {
        if (typeof key !== 'string' || !key.startsWith(prefix) || !key.endsWith('.bin')) continue
        const tick = Number(key.slice(prefix.length, -4))
        if (Number.isSafeInteger(tick) && tick > newestExistingTick) {
            newestExistingTick = tick
        }
    }
    let tick = Math.max(nowTick, newestExistingTick + 1)
    if (!Number.isSafeInteger(tick)) {
        throw new Error('snapshot key space exhausted')
    }
    let key = `${prefix}${tick}.bin`
    while (occupied.has(key)) {
        tick += 1
        if (!Number.isSafeInteger(tick)) {
            throw new Error('snapshot key space exhausted')
        }
        key = `${prefix}${tick}.bin`
    }
    return key
}

function selectProtectedSnapshotKeysToDelete({
    entries,
    maxCount,
    maxBytes,
    protectedSnapshotKeys,
}) {
    const protectedSet = new Set(protectedSnapshotKeys)
    const protectedEntries = entries.filter((entry) => protectedSet.has(entry.key))
    let protectedRemainingCount = protectedEntries.length
    let protectedRemainingBytes = protectedEntries.reduce((sum, entry) => sum + entry.size, 0)
    let keptCount = 0
    let runningBytes = 0
    const toDelete = []
    for (const entry of entries) {
        if (protectedSet.has(entry.key)) {
            protectedRemainingCount -= 1
            protectedRemainingBytes -= entry.size
            keptCount += 1
            runningBytes += entry.size
            continue
        }
        const fitsByCount = keptCount + 1 + protectedRemainingCount <= maxCount
        const fitsByBytes = runningBytes + entry.size + protectedRemainingBytes <= maxBytes
        if (fitsByCount && fitsByBytes) {
            keptCount += 1
            runningBytes += entry.size
        } else {
            toDelete.push(entry.key)
        }
    }
    return toDelete
}

function copyVerifiedSnapshot({
    sourceKey,
    destinationKey,
    copyValue,
    sizeValue,
    rotate,
}) {
    const sourceSize = sizeValue(sourceKey)
    if (!Number.isSafeInteger(sourceSize) || sourceSize <= 0) {
        throw new Error('live database is missing or has an invalid size')
    }

    copyValue(sourceKey, destinationKey)
    const verifyDestination = (phase) => {
        const destinationSize = sizeValue(destinationKey)
        if (destinationSize !== sourceSize) {
            throw new Error(`fresh snapshot verification failed after ${phase}`)
        }
    }
    verifyDestination('copy')
    rotate()
    verifyDestination('rotation')
    return destinationKey
}

function restoreSnapshotValue({
    sourceValue,
    destinationKey,
    setValue,
    sizeValue,
}) {
    // The route captures this immutable value when it validates the selected
    // snapshot. Holding it across the storage-queue wait makes concurrent key
    // deletion harmless and avoids kvCopyValue's missing-source no-op path.
    if (!sourceValue || !Number.isSafeInteger(sourceValue.byteLength) || sourceValue.byteLength <= 0) {
        throw new Error('selected snapshot is no longer available')
    }
    setValue(destinationKey, sourceValue)
    if (sizeValue(destinationKey) !== sourceValue.byteLength) {
        throw new Error('restored database verification failed')
    }
    return sourceValue.byteLength
}

async function prepareLazyChatSnapshotOwner({ ensureChatStore }) {
    // Cold-start reconciliation must run before reading/caching database.bin:
    // it performs the lazy owner's REMOTE migration and replays acknowledged
    // journal writes into the canonical chat store.
    await ensureChatStore()
}

function readLazyChatSnapshotState({ getJournalStats }) {
    const stats = getJournalStats()
    if (
        !stats
        || !Number.isSafeInteger(stats.awaitingRecords)
        || stats.awaitingRecords < 0
        || !Number.isSafeInteger(stats.awaitingBytes)
        || stats.awaitingBytes < 0
    ) {
        throw new Error('lazy chat journal owner returned invalid snapshot state')
    }
    return {
        awaitingRecords: stats.awaitingRecords,
        awaitingBytes: stats.awaitingBytes,
    }
}

function requireLazyChatSnapshotCompleteness(snapshotState) {
    if ((snapshotState?.awaitingRecords ?? 0) > 0) {
        throw new Error(
            `${snapshotState.awaitingRecords} acknowledged lazy chat write(s) `
            + 'still await database metadata and cannot be represented by a database snapshot',
        )
    }
}

function createDeferredAsyncIterable(createSource) {
    return {
        async *[Symbol.asyncIterator]() {
            const source = createSource()
            try {
                for await (const chunk of source) yield chunk
            } finally {
                source?.destroy?.()
            }
        },
    }
}

async function prepareFreshRestoreSnapshot({
    confirmationOwner,
    confirmationHeaders,
    restoreTarget,
    flushPendingDb,
    createFreshSnapshot,
    logger,
}) {
    const flushState = await flushPendingDb()
    // Consume only after the non-overridable flush succeeds, but before the
    // snapshot attempt. A retry that obtains a fresh snapshot must still burn
    // its one-use confirmation instead of leaving it available for replay.
    const explicitlyConfirmed = confirmationOwner?.consume(
        confirmationHeaders,
        restoreTarget,
    ) === true
    try {
        const snapshotKey = await createFreshSnapshot(flushState)
        if (typeof snapshotKey !== 'string' || !snapshotKey) {
            throw new Error('snapshot owner did not return a new key')
        }
        return { snapshotKey, bypassed: false }
    } catch (error) {
        const failure = freshSnapshotRequiredError(error)
        if (!explicitlyConfirmed) {
            failure.confirmationToken = confirmationOwner?.issue(restoreTarget)
            throw failure
        }
        logger?.warn?.(
            `[Restore safety] ${failure.message} User explicitly acknowledged this restore without a new snapshot.`,
        )
        return { snapshotKey: null, bypassed: true }
    }
}

module.exports = {
    copyVerifiedSnapshot,
    createRestoreConfirmationOwner,
    createDeferredAsyncIterable,
    FRESH_SNAPSHOT_REQUIRED_CODE,
    RESTORE_CONFIRMATION_HEADER,
    RESTORE_SOURCE_ID_HEADER,
    RESTORE_WITHOUT_FRESH_SNAPSHOT_HEADER,
    freshSnapshotRequiredError,
    isFreshSnapshotRequiredError,
    nextUniqueSnapshotKey,
    prepareFreshRestoreSnapshot,
    prepareLazyChatSnapshotOwner,
    readLazyChatSnapshotState,
    requireLazyChatSnapshotCompleteness,
    restoreTargetForLocalImport,
    restoreSnapshotValue,
    restoreSafetyErrorPayload,
    selectProtectedSnapshotKeysToDelete,
}
