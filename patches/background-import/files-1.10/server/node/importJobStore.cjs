'use strict'

const path = require('node:path')
const fs = require('node:fs')
const Database = require('better-sqlite3')

const IMPORT_PROTOCOL_VERSION = 1
const OPERATION_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/
const FORMAT_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/
const HASH_PATTERN = /^[a-f0-9]{64}$/
const BUILD_PATTERN = /^[A-Za-z0-9._:-]{1,256}$/
const ERROR_CODE_PATTERN = /^(IMPORT|CHARX|RISUM|PNG)_[A-Z0-9_]{1,96}$/
const KINDS = new Set(['character', 'module'])
const ORIGINS = new Set(['picker', 'drop', 'share', 'hash', 'launch', 'url', 'realm', 'package'])
const TERMINAL_STATES = new Set(['completed', 'client-reconciled', 'delivered', 'failed', 'cancelled', 'incompatible-after-upgrade'])
const CLIENT_CLOSED_STATES = new Set(['delivered', 'failed', 'cancelled', 'incompatible-after-upgrade'])

class ImportJobStoreError extends Error {
    constructor(code, message) {
        super(message)
        this.name = 'ImportJobStoreError'
        this.code = code
    }
}

function fail(code, message) {
    throw new ImportJobStoreError(code, message)
}

function validOperationId(value) {
    return typeof value === 'string' && OPERATION_ID_PATTERN.test(value)
}

function validHash(value) {
    return typeof value === 'string' && HASH_PATTERN.test(value)
}

function sanitizeErrorDetail(value) {
    if (typeof value !== 'string') return ''
    return value.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 1024)
}

function parseProgress(value) {
    if (!value) return null
    try {
        const parsed = JSON.parse(value)
        return parsed && typeof parsed === 'object' ? parsed : null
    } catch {
        return null
    }
}

function mapJob(row) {
    if (!row) return null
    return {
        operationId: row.operation_id,
        protocolVersion: row.protocol_version,
        kind: row.kind,
        declaredFormat: row.declared_format,
        sourceSize: row.source_size,
        sourceSha256: row.source_sha256,
        origin: row.origin,
        admissionBuild: row.admission_build,
        state: row.state,
        nextOffset: row.next_offset,
        authorizationRequired: row.authorization_required === null
            ? null
            : row.authorization_required === 1,
        authorizationDecision: row.authorization_decision,
        progress: parseProgress(row.progress_json),
        preparedDigest: row.prepared_digest,
        entityId: row.entity_id,
        committedRevision: row.committed_revision,
        errorCode: row.error_code,
        errorDetail: row.error_detail,
        claimConsumer: row.claim_consumer,
        claimAt: row.claim_at,
        reconciledAt: row.reconciled_at,
        ackedAt: row.acked_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }
}

function validateCoordinates(value) {
    if (!validOperationId(value?.operationId)) fail('IMPORT_INVALID_ID', 'Invalid operation ID')
    if (!Number.isSafeInteger(value.protocolVersion) || value.protocolVersion !== IMPORT_PROTOCOL_VERSION) {
        fail('IMPORT_PROTOCOL_INCOMPATIBLE', 'Unsupported import protocol')
    }
    if (!KINDS.has(value.kind)) fail('IMPORT_KIND_INVALID', 'Invalid import kind')
    if (typeof value.declaredFormat !== 'string' || !FORMAT_PATTERN.test(value.declaredFormat)) {
        fail('IMPORT_FORMAT_INVALID', 'Invalid declared format')
    }
    if (!Number.isSafeInteger(value.sourceSize) || value.sourceSize <= 0) {
        fail('IMPORT_SOURCE_SIZE_INVALID', 'Invalid source size')
    }
    if (!ORIGINS.has(value.origin)) fail('IMPORT_ORIGIN_INVALID', 'Invalid import origin')
    if (typeof value.admissionBuild !== 'string' || !BUILD_PATTERN.test(value.admissionBuild)) {
        fail('IMPORT_BUILD_INVALID', 'Invalid admission build')
    }
}

function sameCoordinates(job, value) {
    return job.protocolVersion === value.protocolVersion
        && job.kind === value.kind
        && job.declaredFormat === value.declaredFormat
        && job.sourceSize === value.sourceSize
        && job.origin === value.origin
}

function validateProgress(progress) {
    if (!progress || typeof progress !== 'object') fail('IMPORT_PROGRESS_INVALID', 'Progress is invalid')
    if (typeof progress.phase !== 'string' || !FORMAT_PATTERN.test(progress.phase)) {
        fail('IMPORT_PROGRESS_INVALID', 'Progress phase is invalid')
    }
    for (const key of ['completedItems', 'totalItems', 'completedBytes', 'totalBytes']) {
        if (!Number.isSafeInteger(progress[key]) || progress[key] < 0) {
            fail('IMPORT_PROGRESS_INVALID', `Progress ${key} is invalid`)
        }
    }
    if (progress.completedItems > progress.totalItems || progress.completedBytes > progress.totalBytes) {
        fail('IMPORT_PROGRESS_INVALID', 'Progress exceeds its total')
    }
}

function createImportJobStore({ dbPath, now = Date.now } = {}) {
    if (typeof dbPath !== 'string' || dbPath.length === 0) {
        fail('IMPORT_STORE_INVALID', 'Import job database path is required')
    }
    fs.mkdirSync(path.dirname(dbPath), { recursive: true, mode: 0o700 })
    const db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    // Offset metadata may safely rewind after a host power loss: the source
    // file is fsynced first, recovery truncates bytes beyond the durable DB
    // offset, and the client replays the exact chunk. FULL here adds several
    // disk barriers to every chunk without strengthening that invariant.
    db.pragma('synchronous = NORMAL')
    db.pragma('busy_timeout = 5000')
    db.exec(`
        CREATE TABLE IF NOT EXISTS import_jobs (
            operation_id TEXT PRIMARY KEY,
            protocol_version INTEGER NOT NULL,
            kind TEXT NOT NULL,
            declared_format TEXT NOT NULL,
            source_size INTEGER NOT NULL,
            source_sha256 TEXT,
            origin TEXT NOT NULL,
            admission_build TEXT NOT NULL,
            state TEXT NOT NULL,
            next_offset INTEGER NOT NULL DEFAULT 0,
            authorization_required INTEGER,
            authorization_decision TEXT,
            progress_json TEXT,
            prepared_digest TEXT,
            entity_id TEXT,
            committed_revision TEXT,
            error_code TEXT,
            error_detail TEXT,
            claim_consumer TEXT,
            claim_at INTEGER,
            reconciled_at INTEGER,
            acked_at INTEGER,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_import_jobs_state_updated
            ON import_jobs(state, updated_at);
    `)
    try { fs.chmodSync(dbPath, 0o600) } catch {}

    const getStatement = db.prepare('SELECT * FROM import_jobs WHERE operation_id = ?')
    const insertStatement = db.prepare(`
        INSERT INTO import_jobs (
            operation_id, protocol_version, kind, declared_format,
            source_size, origin, admission_build, state,
            created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'receiving', ?, ?)
    `)

    function getJob(operationId) {
        if (!validOperationId(operationId)) fail('IMPORT_INVALID_ID', 'Invalid operation ID')
        return mapJob(getStatement.get(operationId))
    }

    function requireJob(operationId) {
        const job = getJob(operationId)
        if (!job) fail('IMPORT_JOB_NOT_FOUND', 'Import job not found')
        return job
    }

    function update(operationId, assignments, expectedStates, idempotentState = null) {
        return db.transaction(() => {
            const job = requireJob(operationId)
            if (idempotentState && job.state === idempotentState) return job
            if (!expectedStates.includes(job.state)) {
                fail('IMPORT_STATE_CONFLICT', `Import state ${job.state} cannot transition`)
            }
            const entries = Object.entries(assignments)
            const columns = entries.map(([key]) => `${key} = ?`)
            const values = entries.map(([, value]) => value)
            columns.push('updated_at = ?')
            values.push(now(), operationId)
            db.prepare(`UPDATE import_jobs SET ${columns.join(', ')} WHERE operation_id = ?`).run(...values)
            return requireJob(operationId)
        })()
    }

    function createJob(value) {
        validateCoordinates(value)
        return db.transaction(() => {
            const existing = getJob(value.operationId)
            if (existing) {
                if (!sameCoordinates(existing, value)) {
                    fail('IMPORT_OPERATION_CONFLICT', 'Operation coordinates conflict')
                }
                return { job: existing, reused: true }
            }
            const timestamp = now()
            insertStatement.run(
                value.operationId,
                value.protocolVersion,
                value.kind,
                value.declaredFormat,
                value.sourceSize,
                value.origin,
                value.admissionBuild,
                timestamp,
                timestamp,
            )
            return { job: requireJob(value.operationId), reused: false }
        })()
    }

    function advanceUpload(operationId, expectedOffset, nextOffset) {
        return db.transaction(() => {
            const job = requireJob(operationId)
            if (job.state !== 'receiving') fail('IMPORT_STATE_CONFLICT', 'Upload is not receiving')
            if (job.nextOffset !== expectedOffset) {
                fail('IMPORT_UPLOAD_OFFSET_CONFLICT', 'Upload offset changed')
            }
            if (!Number.isSafeInteger(nextOffset) || nextOffset <= expectedOffset || nextOffset > job.sourceSize) {
                fail('IMPORT_UPLOAD_RANGE_INVALID', 'Upload range is invalid')
            }
            db.prepare(`
                UPDATE import_jobs SET next_offset = ?, updated_at = ? WHERE operation_id = ?
            `).run(nextOffset, now(), operationId)
            return requireJob(operationId)
        })()
    }

    function beginUploadFinalization(operationId, sourceSha256) {
        if (!validHash(sourceSha256)) fail('IMPORT_SOURCE_HASH_INVALID', 'Source hash is invalid')
        return db.transaction(() => {
            const job = requireJob(operationId)
            if (job.state === 'upload-finalizing' || job.state === 'uploaded') {
                if (job.sourceSha256 !== sourceSha256) {
                    fail('IMPORT_OPERATION_CONFLICT', 'Source hash changed')
                }
                return job
            }
            if (job.state !== 'receiving') fail('IMPORT_STATE_CONFLICT', 'Upload cannot finalize')
            if (job.nextOffset !== job.sourceSize) fail('IMPORT_UPLOAD_INCOMPLETE', 'Upload is incomplete')
            db.prepare(`
                UPDATE import_jobs
                SET source_sha256 = ?, state = 'upload-finalizing', updated_at = ?
                WHERE operation_id = ?
            `).run(sourceSha256, now(), operationId)
            return requireJob(operationId)
        })()
    }

    function markUploaded(operationId, sourceSha256) {
        if (!validHash(sourceSha256)) fail('IMPORT_SOURCE_HASH_INVALID', 'Source hash is invalid')
        return db.transaction(() => {
            const job = requireJob(operationId)
            if (job.state === 'uploaded') {
                if (job.sourceSha256 !== sourceSha256) {
                    fail('IMPORT_OPERATION_CONFLICT', 'Source hash changed')
                }
                return job
            }
            if (job.state !== 'upload-finalizing' || job.sourceSha256 !== sourceSha256) {
                fail('IMPORT_STATE_CONFLICT', 'Upload finalization is not durable')
            }
            db.prepare(`UPDATE import_jobs SET state = 'uploaded', updated_at = ? WHERE operation_id = ?`)
                .run(now(), operationId)
            return requireJob(operationId)
        })()
    }

    function beginInspection(operationId) {
        return update(operationId, { state: 'inspecting' }, ['uploaded'], 'inspecting')
    }

    function finishInspection(operationId, { authorizationRequired }) {
        if (typeof authorizationRequired !== 'boolean') {
            fail('IMPORT_AUTHORIZATION_INVALID', 'Authorization requirement is invalid')
        }
        return db.transaction(() => {
            const job = requireJob(operationId)
            const targetState = authorizationRequired ? 'awaiting-authorization' : 'queued'
            if (job.state === targetState) {
                if (job.authorizationRequired !== authorizationRequired) {
                    fail('IMPORT_OPERATION_CONFLICT', 'Authorization requirement changed')
                }
                return job
            }
            if (job.state !== 'inspecting') fail('IMPORT_STATE_CONFLICT', 'Inspection is not active')
            db.prepare(`
                UPDATE import_jobs
                SET state = ?, authorization_required = ?, updated_at = ?
                WHERE operation_id = ?
            `).run(targetState, authorizationRequired ? 1 : 0, now(), operationId)
            return requireJob(operationId)
        })()
    }

    function authorize(operationId, accepted) {
        if (typeof accepted !== 'boolean') fail('IMPORT_AUTHORIZATION_INVALID', 'Authorization decision is invalid')
        return db.transaction(() => {
            const job = requireJob(operationId)
            const targetState = accepted ? 'queued' : 'cancelled'
            const decision = accepted ? 'accepted' : 'declined'
            if (job.authorizationDecision) {
                if (job.authorizationDecision !== decision || job.state !== targetState) {
                    fail('IMPORT_OPERATION_CONFLICT', 'Authorization decision changed')
                }
                return job
            }
            if (job.state !== 'awaiting-authorization' || job.authorizationRequired !== true) {
                fail('IMPORT_STATE_CONFLICT', 'Authorization is not awaited')
            }
            db.prepare(`
                UPDATE import_jobs
                SET state = ?, authorization_decision = ?, updated_at = ?
                WHERE operation_id = ?
            `).run(targetState, decision, now(), operationId)
            return requireJob(operationId)
        })()
    }

    function beginPreparing(operationId) {
        return update(operationId, { state: 'preparing' }, ['queued'], 'preparing')
    }

    function updateProgress(operationId, progress) {
        validateProgress(progress)
        return db.transaction(() => {
            const job = requireJob(operationId)
            if (job.state !== 'preparing') fail('IMPORT_STATE_CONFLICT', 'Preparation is not active')
            const previous = job.progress
            if (previous?.phase === progress.phase && (
                progress.completedItems < previous.completedItems
                || progress.completedBytes < previous.completedBytes
                || progress.totalItems < previous.totalItems
                || progress.totalBytes < previous.totalBytes
            )) {
                fail('IMPORT_PROGRESS_REGRESSION', 'Import progress regressed')
            }
            db.prepare(`UPDATE import_jobs SET progress_json = ?, updated_at = ? WHERE operation_id = ?`)
                .run(JSON.stringify(progress), now(), operationId)
            return requireJob(operationId)
        })()
    }

    function markPrepared(operationId, { preparedDigest, entityId }) {
        if (!validHash(preparedDigest)) fail('IMPORT_PREPARED_INVALID', 'Prepared digest is invalid')
        if (typeof entityId !== 'string' || entityId.length === 0 || entityId.length > 256) {
            fail('IMPORT_PREPARED_INVALID', 'Entity ID is invalid')
        }
        return db.transaction(() => {
            const job = requireJob(operationId)
            if (job.state === 'prepared') {
                if (job.preparedDigest !== preparedDigest || job.entityId !== entityId) {
                    fail('IMPORT_OPERATION_CONFLICT', 'Prepared coordinates changed')
                }
                return job
            }
            if (job.state !== 'preparing') fail('IMPORT_STATE_CONFLICT', 'Preparation is not active')
            db.prepare(`
                UPDATE import_jobs
                SET state = 'prepared', prepared_digest = ?, entity_id = ?, updated_at = ?
                WHERE operation_id = ?
            `).run(preparedDigest, entityId, now(), operationId)
            return requireJob(operationId)
        })()
    }

    function markCommitting(operationId) {
        return update(operationId, { state: 'committing' }, ['prepared'], 'committing')
    }

    function markCompleted(operationId, { committedRevision }) {
        if (typeof committedRevision !== 'string' || committedRevision.length === 0 || committedRevision.length > 256) {
            fail('IMPORT_COMMIT_INVALID', 'Committed revision is invalid')
        }
        return db.transaction(() => {
            const job = requireJob(operationId)
            if (['completed', 'client-reconciled', 'delivered'].includes(job.state)) {
                if (job.committedRevision !== committedRevision) {
                    fail('IMPORT_OPERATION_CONFLICT', 'Committed revision changed')
                }
                return job
            }
            if (job.state !== 'committing') fail('IMPORT_STATE_CONFLICT', 'Commit is not active')
            db.prepare(`
                UPDATE import_jobs
                SET state = 'completed', committed_revision = ?, updated_at = ?
                WHERE operation_id = ?
            `).run(committedRevision, now(), operationId)
            return requireJob(operationId)
        })()
    }

    function markReconcileRequired(operationId, { code = 'IMPORT_RECONCILIATION_REQUIRED', detail = '' } = {}) {
        if (typeof code !== 'string' || !ERROR_CODE_PATTERN.test(code)) {
            fail('IMPORT_ERROR_INVALID', 'Import reconciliation code is invalid')
        }
        return db.transaction(() => {
            const job = requireJob(operationId)
            if (job.state === 'reconcile-required') return job
            if (!['prepared', 'committing'].includes(job.state)) {
                fail('IMPORT_STATE_CONFLICT', 'Import cannot enter reconciliation')
            }
            db.prepare(`
                UPDATE import_jobs
                SET state = 'reconcile-required', error_code = ?, error_detail = ?, updated_at = ?
                WHERE operation_id = ?
            `).run(code, sanitizeErrorDetail(detail), now(), operationId)
            return requireJob(operationId)
        })()
    }

    function claimResult(operationId, consumerId, ttlMs) {
        if (!validOperationId(consumerId)) fail('IMPORT_INVALID_CONSUMER', 'Invalid result consumer')
        if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) fail('IMPORT_CLAIM_INVALID', 'Invalid claim TTL')
        return db.transaction(() => {
            const job = requireJob(operationId)
            if (!['completed', 'client-reconciled'].includes(job.state)) {
                fail('IMPORT_STATE_CONFLICT', 'Import result is not claimable')
            }
            const timestamp = now()
            const claimAge = Number.isSafeInteger(job.claimAt)
                ? timestamp - job.claimAt
                : Number.POSITIVE_INFINITY
            const active = job.claimConsumer
                && claimAge >= -ttlMs
                && claimAge <= ttlMs
            if (active && job.claimConsumer !== consumerId) return { claimed: false, job }
            db.prepare(`
                UPDATE import_jobs
                SET claim_consumer = ?, claim_at = ?, updated_at = ?
                WHERE operation_id = ?
            `).run(consumerId, timestamp, timestamp, operationId)
            return { claimed: true, job: requireJob(operationId) }
        })()
    }

    function heartbeatClaim(operationId, consumerId) {
        if (!validOperationId(consumerId)) fail('IMPORT_INVALID_CONSUMER', 'Invalid result consumer')
        return db.transaction(() => {
            const job = requireJob(operationId)
            if (job.claimConsumer !== consumerId || !['completed', 'client-reconciled'].includes(job.state)) {
                fail('IMPORT_CLAIM_CONFLICT', 'Result claim does not match')
            }
            const timestamp = now()
            db.prepare(`UPDATE import_jobs SET claim_at = ?, updated_at = ? WHERE operation_id = ?`)
                .run(timestamp, timestamp, operationId)
            return requireJob(operationId)
        })()
    }

    function markClientReconciled(operationId, consumerId) {
        if (!validOperationId(consumerId)) fail('IMPORT_INVALID_CONSUMER', 'Invalid result consumer')
        return db.transaction(() => {
            const job = requireJob(operationId)
            if (job.claimConsumer !== consumerId) fail('IMPORT_CLAIM_CONFLICT', 'Result claim does not match')
            if (job.state === 'client-reconciled') return job
            if (job.state !== 'completed') fail('IMPORT_STATE_CONFLICT', 'Result is not completed')
            const timestamp = now()
            db.prepare(`
                UPDATE import_jobs
                SET state = 'client-reconciled', reconciled_at = ?, updated_at = ?
                WHERE operation_id = ?
            `).run(timestamp, timestamp, operationId)
            return requireJob(operationId)
        })()
    }

    function ackResult(operationId, consumerId) {
        if (!validOperationId(consumerId)) fail('IMPORT_INVALID_CONSUMER', 'Invalid result consumer')
        return db.transaction(() => {
            const job = requireJob(operationId)
            if (job.claimConsumer !== consumerId) fail('IMPORT_CLAIM_CONFLICT', 'Result claim does not match')
            if (job.state === 'delivered') return job
            if (job.state !== 'client-reconciled') fail('IMPORT_STATE_CONFLICT', 'Result is not reconciled')
            const timestamp = now()
            db.prepare(`
                UPDATE import_jobs
                SET state = 'delivered', acked_at = ?, updated_at = ?
                WHERE operation_id = ?
            `).run(timestamp, timestamp, operationId)
            return requireJob(operationId)
        })()
    }

    function failJob(operationId, { code, detail = '' }) {
        if (typeof code !== 'string' || !ERROR_CODE_PATTERN.test(code)) {
            fail('IMPORT_ERROR_INVALID', 'Import error code is invalid')
        }
        return db.transaction(() => {
            const job = requireJob(operationId)
            if (TERMINAL_STATES.has(job.state)) fail('IMPORT_STATE_CONFLICT', 'Terminal job cannot fail')
            db.prepare(`
                UPDATE import_jobs
                SET state = 'failed', error_code = ?, error_detail = ?, updated_at = ?
                WHERE operation_id = ?
            `).run(code, sanitizeErrorDetail(detail), now(), operationId)
            return requireJob(operationId)
        })()
    }

    function cancelJob(operationId) {
        return db.transaction(() => {
            const job = requireJob(operationId)
            if (job.state === 'cancelled') return job
            if (TERMINAL_STATES.has(job.state) || job.state === 'committing') {
                fail('IMPORT_STATE_CONFLICT', 'Terminal or committing import cannot be cancelled')
            }
            db.prepare(`UPDATE import_jobs SET state = 'cancelled', updated_at = ? WHERE operation_id = ?`)
                .run(now(), operationId)
            return requireJob(operationId)
        })()
    }

    function validateListLimit(limit) {
        if (!Number.isSafeInteger(limit) || limit <= 0 || limit > 1024) {
            fail('IMPORT_LIMIT_INVALID', 'Import list limit is invalid')
        }
    }

    function listNonterminal(limit = 128) {
        validateListLimit(limit)
        const excluded = [...TERMINAL_STATES]
        const placeholders = excluded.map(() => '?').join(', ')
        return db.prepare(`
            SELECT * FROM import_jobs
            WHERE state NOT IN (${placeholders})
            ORDER BY updated_at ASC, operation_id ASC LIMIT ?
        `).all(...excluded, limit).map(mapJob)
    }

    function listRecoverable(limit = 128) {
        validateListLimit(limit)
        const excluded = [...CLIENT_CLOSED_STATES]
        const placeholders = excluded.map(() => '?').join(', ')
        return db.prepare(`
            SELECT * FROM import_jobs
            WHERE state NOT IN (${placeholders})
            ORDER BY updated_at ASC, operation_id ASC LIMIT ?
        `).all(...excluded, limit).map(mapJob)
    }

    return {
        createJob,
        getJob,
        advanceUpload,
        beginUploadFinalization,
        markUploaded,
        beginInspection,
        finishInspection,
        authorize,
        beginPreparing,
        updateProgress,
        markPrepared,
        markCommitting,
        markCompleted,
        markReconcileRequired,
        claimResult,
        heartbeatClaim,
        markClientReconciled,
        ackResult,
        failJob,
        cancelJob,
        listNonterminal,
        listRecoverable,
        close: () => db.close(),
    }
}

module.exports = {
    IMPORT_PROTOCOL_VERSION,
    ImportJobStoreError,
    createImportJobStore,
    validOperationId,
}
