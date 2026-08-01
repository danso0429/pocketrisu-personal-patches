'use strict'

const ORCH_RESULT_RETENTION_TTL_MS = 48 * 60 * 60 * 1000
const ORCH_RESULT_RETENTION_MAX_ROWS = 128
const ORCH_RESULT_RETENTION_MAX_BYTES = 256 * 1024 * 1024
const ORCH_RESULT_PREFIX = 'bg-orch-result:'
const OPERATION_RESULT_PREFIX = 'bg-orch-result-op:'

const TERMINAL_KINDS = new Set([
  'terminal-success',
  'terminal-partial',
  'terminal-error',
])

function validOperationId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(value)
}

function operationIdFromResultKey(key) {
  if (typeof key !== 'string' || !key.startsWith(OPERATION_RESULT_PREFIX)) return null
  const operationId = key.slice(OPERATION_RESULT_PREFIX.length)
  return validOperationId(operationId) ? operationId : null
}

function valueBytes(value) {
  if (typeof value === 'string') return Buffer.byteLength(value)
  if (Buffer.isBuffer(value)) return value.byteLength
  if (value instanceof Uint8Array) return value.byteLength
  return 0
}

function parseResultRecord(value) {
  try {
    const text = typeof value === 'string'
      ? value
      : (Buffer.isBuffer(value) || value instanceof Uint8Array)
          ? Buffer.from(value).toString('utf8')
          : ''
    if (!text) return null
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function isTerminalResult(record) {
  if (!record || typeof record !== 'object') return false
  if (record.kind === 'intermediate') return false
  if (TERMINAL_KINDS.has(record.kind)) return true
  return record.final === true
    || (typeof record.error === 'string' && record.error.length > 0)
}

function hasLiveDeliveryClaim(record, now, claimTtlMs) {
  const claim = record && record.deliveryClaim
  const age = claim && Number.isFinite(claim.claimedAt)
    ? now - claim.claimedAt
    : Number.POSITIVE_INFINITY
  return !!claim
    && typeof claim.consumerId === 'string'
    && claim.consumerId.length > 0
    && Number.isFinite(claim.claimedAt)
    // Tolerate one lease window of clock rollback, but do not let a corrupt or
    // far-future timestamp turn a two-minute claim into unbounded retention.
    && age >= -claimTtlMs
    && age < claimTtlMs
}

function activeOperation(isOperationActive, operationId) {
  if (!operationId || typeof isOperationActive !== 'function') return false
  try {
    return isOperationActive(operationId) === true
  } catch {
    // Retention is best-effort. If the active-run owner cannot answer, fail
    // closed and keep the paid result instead of enforcing storage pressure.
    return true
  }
}

function planOrchestrationResultRetention(entries, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now()
  const ttlMs = Number.isFinite(options.ttlMs)
    ? Math.max(0, options.ttlMs)
    : ORCH_RESULT_RETENTION_TTL_MS
  const maxRows = Number.isFinite(options.maxRows)
    ? Math.max(1, Math.floor(options.maxRows))
    : ORCH_RESULT_RETENTION_MAX_ROWS
  const maxBytes = Number.isFinite(options.maxBytes)
    ? Math.max(1, Math.floor(options.maxBytes))
    : ORCH_RESULT_RETENTION_MAX_BYTES
  const claimTtlMs = Number.isFinite(options.claimTtlMs)
    ? Math.max(0, options.claimTtlMs)
    : 2 * 60 * 1000

  const normalized = []
  const seenKeys = new Set()
  for (const raw of Array.isArray(entries) ? entries : []) {
    if (!raw || typeof raw.key !== 'string' || raw.key.length === 0) continue
    // Count each physical row once even if a future caller supplies repeated
    // or overlapping scans. Current legacy and operation prefixes are disjoint.
    if (seenKeys.has(raw.key)) continue
    seenKeys.add(raw.key)
    const record = parseResultRecord(raw.value)
    // An operation-keyed KV key remains the exact run identity even when its
    // payload is partially written or malformed. Prefer it over record fields
    // so active paid work cannot be evicted merely because parsing failed.
    const keyedOperationId = operationIdFromResultKey(raw.key)
    const operationId = keyedOperationId
      || (validOperationId(record && record.operationId) ? record.operationId : null)
    const updatedAt = Number.isFinite(raw.updatedAt) ? raw.updatedAt : null
    const active = activeOperation(options.isOperationActive, operationId)
    const claimed = hasLiveDeliveryClaim(record, now, claimTtlMs)
    // Rolling char/chat-key clients had no consumer claim. Their explicit-ACK
    // GET refreshes updatedAt, which supplies the same bounded lease window.
    const updatedAge = updatedAt == null ? Number.POSITIVE_INFINITY : now - updatedAt
    const recentLegacyDelivery = raw.key.startsWith(ORCH_RESULT_PREFIX) && !keyedOperationId
      && updatedAge >= -claimTtlMs && updatedAge < claimTtlMs
    normalized.push({
      key: raw.key,
      value: raw.value,
      bytes: valueBytes(raw.value),
      updatedAt,
      record,
      operationId,
      terminal: isTerminalResult(record),
      intermediate: record && record.kind === 'intermediate',
      active,
      claimed,
      recentLegacyDelivery,
      protected: active || claimed || recentLegacyDelivery,
    })
  }

  const removed = new Map()
  const remove = (entry, reason) => {
    if (removed.has(entry.key)) return
    removed.set(entry.key, {
      key: entry.key,
      reason,
      operationId: entry.operationId,
      record: entry.record,
      bytes: entry.bytes,
      updatedAt: entry.updatedAt,
    })
  }
  const oldestFirst = (a, b) => {
    const aAt = a.updatedAt == null ? now : a.updatedAt
    const bAt = b.updatedAt == null ? now : b.updatedAt
    return aAt - bAt || a.key.localeCompare(b.key)
  }

  const normalizations = normalized
    .filter((entry) => entry.updatedAt != null && entry.updatedAt > now)
    .map((entry) => ({ key: entry.key, value: entry.value, updatedAt: entry.updatedAt }))

  for (const entry of [...normalized].sort(oldestFirst)) {
    if (entry.protected || entry.updatedAt == null) continue
    if (now - entry.updatedAt > ttlMs) remove(entry, 'expired')
  }

  let keptRows = normalized.length - removed.size
  let keptBytes = normalized.reduce((sum, entry) =>
    sum + (removed.has(entry.key) ? 0 : entry.bytes), 0)

  // Under pressure, discard invalid/orphaned intermediate rows before a
  // completed paid response. Terminal rows then use oldest-first eviction.
  // Active operations and live claims never enter this candidate list.
  const pressureCandidates = normalized
    .filter((entry) => !entry.protected && !removed.has(entry.key))
    .sort((a, b) => {
      // Only an explicitly intermediate row is lower priority. A parsed but
      // unknown rolling/future schema may still be the sole paid terminal
      // response, so retain it alongside known terminal rows.
      const aPriority = !a.record ? 0 : (a.intermediate ? 1 : 2)
      const bPriority = !b.record ? 0 : (b.intermediate ? 1 : 2)
      return aPriority - bPriority || oldestFirst(a, b)
    })

  for (const entry of pressureCandidates) {
    if (keptRows <= maxRows && keptBytes <= maxBytes) break
    remove(entry, 'pressure')
    keptRows -= 1
    keptBytes -= entry.bytes
  }

  return {
    actions: [...removed.values()],
    normalizations: normalizations.filter((entry) => !removed.has(entry.key)),
    stats: {
      inputRows: normalized.length,
      inputBytes: normalized.reduce((sum, entry) => sum + entry.bytes, 0),
      keptRows,
      keptBytes,
      protectedRows: normalized.filter((entry) => entry.protected).length,
      protectedBytes: normalized.reduce((sum, entry) =>
        sum + (entry.protected ? entry.bytes : 0), 0),
      overRows: Math.max(0, keptRows - maxRows),
      overBytes: Math.max(0, keptBytes - maxBytes),
    },
  }
}

function validCoordinates(meta) {
  return !!meta
    && typeof meta.charId === 'string' && meta.charId.length > 0
    && typeof meta.chatId === 'string' && meta.chatId.length > 0
}

function sweepOrchestrationResultRetention(options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now()
  const resultPrefixes = Array.isArray(options.resultPrefixes) ? options.resultPrefixes : []
  const statePrefix = typeof options.statePrefix === 'string' ? options.statePrefix : ''
  const {
    kvList, kvGet, kvSet, kvDel, kvGetUpdatedAt,
    readOperationState, writeOperationState, isOperationActive,
  } = options
  if ([kvList, kvGet, kvSet, kvDel, kvGetUpdatedAt].some((value) => typeof value !== 'function')) {
    return { skipped: true, plan: null, deleted: [], retained: [], normalized: [], deletedStates: [] }
  }

  const keys = new Set()
  for (const prefix of resultPrefixes) {
    try {
      for (const key of kvList(prefix)) keys.add(key)
    } catch { /* leave that owner prefix untouched */ }
  }
  const entries = []
  for (const key of keys) {
    try {
      entries.push({ key, value: kvGet(key), updatedAt: kvGetUpdatedAt(key) })
    } catch { /* unreadable rows fail closed */ }
  }
  const plan = planOrchestrationResultRetention(entries, {
    now,
    ttlMs: options.ttlMs,
    maxRows: options.maxRows,
    maxBytes: options.maxBytes,
    claimTtlMs: options.claimTtlMs,
    isOperationActive,
  })

  const deleted = []
  const retained = []
  for (const action of plan.actions) {
    if (action.operationId) {
      // Durable operation state is canonical. A corrupt result must not replace
      // valid coordinates with String(undefined) in the existing state owner.
      let meta = null
      try {
        meta = typeof readOperationState === 'function'
          ? readOperationState(kvGet, action.operationId)
          : null
      } catch { /* record fallback below */ }
      if (!validCoordinates(meta) && validCoordinates(action.record)) meta = action.record
      if (!validCoordinates(meta) || typeof writeOperationState !== 'function') {
        retained.push({ ...action, reason: 'missing-tombstone-authority' })
        continue
      }
      // ACK and cancellation already own stronger suppressive tombstones. Do
      // not replace `delivered`/`cancelled`: if payload deletion fails, those
      // states must continue preventing a stale result from being redelivered.
      if (meta.state !== 'delivered' && meta.state !== 'cancelled') {
        const state = action.reason === 'expired' ? 'result-expired' : 'result-evicted'
        let durable = null
        try { durable = writeOperationState(kvSet, action.operationId, meta, state) } catch { /* fail closed */ }
        if (!durable || durable.written !== true) {
          retained.push({ ...action, reason: 'tombstone-write-failed' })
          continue
        }
      }
    }
    try {
      kvDel(action.key)
      deleted.push(action)
    } catch {
      // A written tombstone does not suppress a still-present payload. Existing
      // GET/ACK ownership may therefore finish delivery, while a later sweep
      // retries exact deletion.
      retained.push({ ...action, reason: 'payload-delete-failed' })
    }
  }

  const normalized = []
  for (const entry of plan.normalizations) {
    try {
      kvSet(entry.key, entry.value)
      normalized.push(entry.key)
    } catch { /* retry next sweep; never delete solely for clock skew */ }
  }

  const deletedStates = []
  if (statePrefix) {
    let stateKeys = []
    try { stateKeys = kvList(statePrefix) } catch { /* leave states untouched */ }
    for (const key of stateKeys) {
      const operationId = key.startsWith(statePrefix) ? key.slice(statePrefix.length) : ''
      if (!validOperationId(operationId) || activeOperation(isOperationActive, operationId)) continue
      // A claim can refresh/protect the payload after its earlier lifecycle
      // state reaches the TTL. Keep that state as the duplicate-POST barrier
      // until result retention tombstones and removes the exact payload.
      let resultStillPresent = true
      try { resultStillPresent = kvGet(OPERATION_RESULT_PREFIX + operationId) != null } catch { /* fail closed */ }
      if (resultStillPresent) continue
      try {
        const at = kvGetUpdatedAt(key)
        if (at != null && now - at > (Number.isFinite(options.ttlMs)
          ? Math.max(0, options.ttlMs)
          : ORCH_RESULT_RETENTION_TTL_MS)) {
          kvDel(key)
          deletedStates.push(key)
        } else if (at != null && at > now) {
          // Rebase a future wall-clock timestamp once. Repeating min(at, now)
          // without a write would otherwise reset its computed age forever.
          const value = kvGet(key)
          kvSet(key, value)
          normalized.push(key)
        }
      } catch { /* best-effort state cleanup */ }
    }
  }

  return { skipped: false, plan, deleted, retained, normalized, deletedStates }
}

module.exports = {
  ORCH_RESULT_RETENTION_TTL_MS,
  ORCH_RESULT_RETENTION_MAX_ROWS,
  ORCH_RESULT_RETENTION_MAX_BYTES,
  hasLiveDeliveryClaim,
  isTerminalResult,
  planOrchestrationResultRetention,
  sweepOrchestrationResultRetention,
}
