'use strict'

const path = require('node:path')
const { createImportCommitOwner } = require('./importCommit.cjs')
const { createImportJobStore } = require('./importJobStore.cjs')
const { createImportPrepareOwner } = require('./importPrepare.cjs')
const { createPreparedImportStore } = require('./importPreparedStore.cjs')
const { createImportUploadOwner } = require('./importUpload.cjs')

const FORMAT_BY_KIND = {
    module: new Set(['json', 'lorebook', 'risum', 'charx']),
    character: new Set(['json', 'png', 'charx', 'jpeg']),
}
const BLOCKED_WHILE_IMPORT_ACTIVE = new Set([
    'GET /api/remove',
    'HEAD /api/remove',
    'POST /api/backup/import/prepare',
    'POST /api/backup/import',
    'POST /api/backup/server/restore',
    'POST /api/migrate/save-folder/scan',
    'POST /api/migrate/save-folder/execute',
    'POST /api/migrate/save-folder/upload',
    'POST /api/migrate/save-folder/cleanup/scan',
    'POST /api/migrate/save-folder/cleanup/execute',
    'POST /api/db/assets/purge-orphans',
    'POST /api/db/optimize',
    'DELETE /api/db/snapshots',
    'POST /api/db/snapshots/restore',
    'POST /api/self-update',
])

function responseJob(job) {
    if (!job) return null
    return {
        operationId: job.operationId,
        protocolVersion: job.protocolVersion,
        kind: job.kind,
        format: job.declaredFormat,
        origin: job.origin,
        sourceSize: job.sourceSize,
        sourceSha256: job.sourceSha256,
        state: job.state,
        nextOffset: job.nextOffset,
        authorizationRequired: job.authorizationRequired,
        authorizationDecision: job.authorizationDecision,
        progress: job.progress,
        preparedDigest: job.preparedDigest,
        entityId: job.entityId,
        committedRevision: job.committedRevision,
        errorCode: job.errorCode,
        errorDetail: job.errorDetail,
        updatedAt: job.updatedAt,
    }
}

function statusForError(error) {
    const code = error?.code ?? ''
    if (code === 'IMPORT_JOB_NOT_FOUND') return 404
    if (code === 'IMPORT_CAPACITY_EXCEEDED') return 507
    if (/(_INVALID|_MISMATCH|_INCOMPLETE|_UNSUPPORTED)/.test(code)) return 400
    if (/(_CONFLICT|_COLLISION)/.test(code) || ['IMPORT_STATE_CONFLICT', 'IMPORT_ACTIVE'].includes(code)) return 409
    return 500
}

function registerImportRoutes(app, {
    saveDir,
    parserBundlePath,
    checkAuth,
    checkActiveSession,
    canonicalCommitter,
    limits,
    logger = console,
    now = Date.now,
} = {}) {
    if (!app || typeof app.post !== 'function') throw new Error('Import route app is required')
    if (typeof saveDir !== 'string' || typeof parserBundlePath !== 'string') throw new Error('Import route paths are required')
    if (typeof checkAuth !== 'function' || typeof checkActiveSession !== 'function') throw new Error('Import route auth is required')
    if (!canonicalCommitter || !limits?.parser) throw new Error('Import route owners and limits are required')

    if (
        !Number.isSafeInteger(limits.terminalRetentionMs)
        || limits.terminalRetentionMs < 0
        || !Number.isSafeInteger(limits.cleanupBatch)
        || limits.cleanupBatch <= 0
        || limits.cleanupBatch > 1024
    ) throw new Error('Import route retention limits are required')
    const jobStore = createImportJobStore({
        dbPath: path.join(saveDir, 'import-jobs.db'),
        now,
    })
    const upload = createImportUploadOwner({
        spoolDir: path.join(saveDir, 'import-sources'),
        jobStore,
        maxSourceBytes: limits.maxSourceBytes,
        maxSpoolBytes: limits.maxSpoolBytes,
        maxChunkBytes: limits.maxChunkBytes,
        minFreeBytes: limits.minFreeBytes,
    })
    const preparedStore = createPreparedImportStore({ root: path.join(saveDir, 'import-prepared') })
    const prepareOwner = createImportPrepareOwner({
        jobStore,
        upload,
        preparedStore,
        parserBundlePath,
        limits: limits.parser,
    })
    const commitOwner = createImportCommitOwner({
        jobStore,
        preparedStore,
        committer: canonicalCommitter,
    })
    const running = new Map()
    let cleanupPromise = null

    function kick(operationId) {
        if (running.has(operationId)) return running.get(operationId)
        const promise = (async () => {
            const prepared = await prepareOwner.run(operationId)
            if (prepared?.state === 'prepared' || prepared?.state === 'committing') {
                await commitOwner.run(operationId)
            }
        })().catch(error => {
            logger.error?.(`[BackgroundImport] operation failed code=${error?.code ?? 'unknown'}`)
        }).finally(() => {
            if (running.get(operationId) === promise) running.delete(operationId)
        })
        running.set(operationId, promise)
        return promise
    }

    async function waitForIdle(operationId) {
        while (running.has(operationId)) await running.get(operationId)
        return jobStore.getJob(operationId)
    }

    function cleanupTerminal() {
        if (cleanupPromise) return cleanupPromise
        cleanupPromise = (async () => {
            const cutoff = Math.max(0, now() - limits.terminalRetentionMs)
            let cleaned = 0
            for (const job of jobStore.listTerminalCleanupCandidates(cutoff, limits.cleanupBatch)) {
                try {
                    await preparedStore.remove(job.operationId)
                    await upload.release(job.operationId)
                    jobStore.deleteTerminalJob(job.operationId)
                    cleaned += 1
                } catch (error) {
                    logger.error?.(`[BackgroundImport] terminal cleanup failed code=${error?.code ?? 'unknown'}`)
                }
            }
            return { cleaned }
        })().finally(() => { cleanupPromise = null })
        return cleanupPromise
    }

    async function authenticated(req, res) {
        return await checkAuth(req, res)
    }

    function handler(fn, { activeSession = false } = {}) {
        return async (req, res, next) => {
            try {
                if (!await authenticated(req, res)) return
                if (activeSession && !checkActiveSession(req, res)) return
                await fn(req, res)
            } catch (error) {
                if (res.headersSent) return next(error)
                res.status(statusForError(error)).json({
                    error: error?.message ?? 'Background import failed',
                    code: error?.code ?? 'IMPORT_INTERNAL_ERROR',
                })
            }
        }
    }

    app.post('/api/import-jobs', handler(async (req, res) => {
        const body = req.body ?? {}
        if (body.protocolVersion !== 1) {
            return res.status(400).json({ error: 'Unsupported import protocol', code: 'IMPORT_PROTOCOL_INCOMPATIBLE' })
        }
        if (!FORMAT_BY_KIND[body.kind]?.has(body.format)) {
            return res.status(400).json({ error: 'Unsupported import kind/format', code: 'IMPORT_UNSUPPORTED_FORMAT' })
        }
        const admissionBuild = req.headers['x-client-build']
        if (typeof admissionBuild !== 'string' || admissionBuild.length === 0) {
            return res.status(400).json({ error: 'Client build is required', code: 'IMPORT_BUILD_INVALID' })
        }
        const active = jobStore.listRecoverable().find(job => job.operationId !== body.operationId)
        if (active) {
            return res.status(409).json({
                error: 'Another import is active',
                code: 'IMPORT_ACTIVE',
                active: responseJob(active),
            })
        }
        const created = await upload.createJob({
            operationId: body.operationId,
            protocolVersion: body.protocolVersion,
            kind: body.kind,
            declaredFormat: body.format,
            sourceSize: body.sourceSize,
            origin: body.origin,
            admissionBuild,
        })
        res.status(created.reused ? 200 : 201).json(responseJob(created))
    }, { activeSession: true }))

    app.put('/api/import-jobs/:operationId/source', handler(async (req, res) => {
        const start = Number(req.headers['x-upload-offset'])
        const hash = req.headers['x-chunk-sha256']
        const result = await upload.append(req.params.operationId, start, req.body, hash)
        res.json({ ...responseJob(result), replayed: result.replayed === true })
    }, { activeSession: true }))

    app.post('/api/import-jobs/:operationId/source/complete', handler(async (req, res) => {
        const result = await upload.complete(req.params.operationId, req.body?.sha256)
        kick(req.params.operationId)
        res.status(202).json(responseJob(result))
    }, { activeSession: true }))

    app.post('/api/import-jobs/:operationId/authorize', handler(async (req, res) => {
        if (typeof req.body?.accepted !== 'boolean') {
            return res.status(400).json({ error: 'Authorization decision is required', code: 'IMPORT_AUTHORIZATION_INVALID' })
        }
        const result = await prepareOwner.authorize(req.params.operationId, req.body.accepted)
        if (req.body.accepted) kick(req.params.operationId)
        res.json(responseJob(result))
    }, { activeSession: true }))

    app.get('/api/import-jobs/:operationId', handler(async (req, res) => {
        let job = jobStore.getJob(req.params.operationId)
        if (!job) return res.status(404).json({ error: 'Import job not found', code: 'IMPORT_JOB_NOT_FOUND' })
        if (['uploaded', 'inspecting', 'queued', 'preparing', 'prepared', 'committing'].includes(job.state)) {
            kick(req.params.operationId)
            job = jobStore.getJob(req.params.operationId)
        }
        res.json(responseJob(job))
    }))

    app.get('/api/import-jobs', handler(async (req, res) => {
        res.json({ jobs: jobStore.listRecoverable().map(responseJob) })
    }))

    app.get('/api/import-jobs-diagnostics', handler(async (req, res) => {
        const [source, prepared] = await Promise.all([
            upload.diagnostics(),
            preparedStore.diagnostics(),
        ])
        res.json({
            jobs: jobStore.diagnostics(),
            source,
            prepared,
            active: responseJob(jobStore.listRecoverable(1)[0] ?? null),
        })
    }))

    app.get('/api/import-jobs/:operationId/result', handler(async (req, res) => {
        const job = jobStore.getJob(req.params.operationId)
        if (!job) return res.status(404).json({ error: 'Import job not found', code: 'IMPORT_JOB_NOT_FOUND' })
        res.json({ job: responseJob(job), preparedDigest: job.preparedDigest })
    }))

    app.post('/api/import-jobs/:operationId/result/claim', handler(async (req, res) => {
        const consumerId = req.body?.consumerId
        const claim = jobStore.claimResult(req.params.operationId, consumerId, limits.claimTtlMs)
        if (!claim.claimed) return res.status(409).json({ claimed: false, job: responseJob(claim.job) })
        res.json({
            claimed: true,
            job: responseJob(claim.job),
            preparedDigest: claim.job.preparedDigest,
        })
    }))

    app.post('/api/import-jobs/:operationId/claim/heartbeat', handler(async (req, res) => {
        res.json(responseJob(jobStore.heartbeatClaim(req.params.operationId, req.body?.consumerId)))
    }))

    app.post('/api/import-jobs/:operationId/reconciled', handler(async (req, res) => {
        res.json(responseJob(jobStore.markClientReconciled(req.params.operationId, req.body?.consumerId)))
    }))

    app.post('/api/import-jobs/:operationId/ack', handler(async (req, res) => {
        const job = jobStore.ackResult(req.params.operationId, req.body?.consumerId)
        await preparedStore.remove(req.params.operationId)
        await upload.release(req.params.operationId)
        res.json(responseJob(job))
    }))

    app.delete('/api/import-jobs/:operationId', handler(async (req, res) => {
        const operationId = req.params.operationId
        const existing = jobStore.getJob(operationId)
        if (!existing) {
            return res.status(404).json({ error: 'Import job not found', code: 'IMPORT_JOB_NOT_FOUND' })
        }
        if (['failed', 'cancelled', 'incompatible-after-upgrade', 'delivered'].includes(existing.state)) {
            await preparedStore.remove(operationId)
            await upload.release(operationId)
            return res.json(responseJob(jobStore.getJob(operationId)))
        }
        jobStore.beginCancellation(operationId)
        await waitForIdle(operationId)
        await preparedStore.remove(req.params.operationId)
        const job = await upload.finishCancellation(operationId)
        res.json(responseJob(job))
    }, { activeSession: true }))

    async function resume() {
        for (const job of jobStore.listNonterminal()) {
            if (job.state === 'receiving' || job.state === 'awaiting-authorization' || job.state === 'reconcile-required') continue
            if (job.state === 'upload-finalizing') {
                try { await upload.status(job.operationId) } catch (error) {
                    logger.error?.(`[BackgroundImport] upload recovery failed code=${error?.code ?? 'unknown'}`)
                    continue
                }
            }
            const current = jobStore.getJob(job.operationId)
            if (current && ['uploaded', 'inspecting', 'queued', 'preparing', 'prepared', 'committing'].includes(current.state)) {
                kick(job.operationId)
            }
        }
    }

    queueMicrotask(() => {
        void resume()
        void cleanupTerminal()
    })

    return {
        jobStore,
        waitForIdle,
        resume,
        cleanupTerminal,
        hasActiveImport: () => jobStore.listRecoverable().length > 0,
        replacementGuard(req, res, next) {
            if (jobStore.listRecoverable().length === 0) return next()
            const method = String(req.method ?? '').toUpperCase()
            const requestPath = String(req.path ?? '').replace(/\/+$/, '') || '/'
            if (!BLOCKED_WHILE_IMPORT_ACTIVE.has(`${method} ${requestPath}`)) return next()
            return res.status(409).json({
                error: 'A background import is active',
                code: 'IMPORT_ACTIVE',
                commitOutcome: 'not-committed',
            })
        },
        close: () => jobStore.close(),
    }
}

module.exports = {
    BLOCKED_WHILE_IMPORT_ACTIVE,
    registerImportRoutes,
    responseJob,
    statusForError,
}
