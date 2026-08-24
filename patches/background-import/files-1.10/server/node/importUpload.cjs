'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const { validOperationId } = require('./importJobStore.cjs')

const HASH_PATTERN = /^[a-f0-9]{64}$/
const SOURCE_RETAINED_STATES = new Set([
    'uploaded',
    'inspecting',
    'awaiting-authorization',
    'queued',
    'preparing',
    'prepared',
    'committing',
    'completed',
    'client-reconciled',
    'delivered',
])

class ImportUploadError extends Error {
    constructor(code, message) {
        super(message)
        this.name = 'ImportUploadError'
        this.code = code
    }
}

function fail(code, message) {
    throw new ImportUploadError(code, message)
}

function validHash(value) {
    return typeof value === 'string' && HASH_PATTERN.test(value)
}

function digest(data) {
    return crypto.createHash('sha256').update(data).digest('hex')
}

async function fileDigest(file) {
    const hash = crypto.createHash('sha256')
    for await (const chunk of fs.createReadStream(file)) hash.update(chunk)
    return hash.digest('hex')
}

async function handleDigest(handle, size) {
    const hash = crypto.createHash('sha256')
    const buffer = Buffer.allocUnsafe(Math.min(1024 * 1024, size))
    let offset = 0
    while (offset < size) {
        const length = Math.min(buffer.byteLength, size - offset)
        const result = await handle.read(buffer, 0, length, offset)
        if (result.bytesRead !== length) fail('IMPORT_SOURCE_MISMATCH', 'Import source read was incomplete')
        hash.update(buffer.subarray(0, length))
        offset += length
    }
    return hash.digest('hex')
}

async function lstatOptional(file) {
    try { return await fsp.lstat(file) }
    catch (error) {
        if (error.code === 'ENOENT') return null
        throw error
    }
}

function createImportUploadOwner({
    spoolDir,
    jobStore,
    maxSourceBytes,
    maxSpoolBytes,
    maxChunkBytes = maxSourceBytes,
    minFreeBytes = 0,
    availableBytes = async directory => {
        const stat = await fsp.statfs(directory)
        return Math.min(Number.MAX_SAFE_INTEGER, Number(stat.bavail) * Number(stat.bsize))
    },
    fault = () => undefined,
} = {}) {
    if (typeof spoolDir !== 'string' || spoolDir.length === 0) {
        fail('IMPORT_UPLOAD_CONFIG_INVALID', 'Spool directory is required')
    }
    if (!jobStore || typeof jobStore.getJob !== 'function') {
        fail('IMPORT_UPLOAD_CONFIG_INVALID', 'Import job store is required')
    }
    if (!Number.isSafeInteger(maxSourceBytes) || maxSourceBytes <= 0) {
        fail('IMPORT_UPLOAD_CONFIG_INVALID', 'Source limit is invalid')
    }
    if (!Number.isSafeInteger(maxSpoolBytes) || maxSpoolBytes < maxSourceBytes) {
        fail('IMPORT_UPLOAD_CONFIG_INVALID', 'Spool limit is invalid')
    }
    if (!Number.isSafeInteger(maxChunkBytes) || maxChunkBytes <= 0 || maxChunkBytes > maxSourceBytes) {
        fail('IMPORT_UPLOAD_CONFIG_INVALID', 'Chunk limit is invalid')
    }
    if (!Number.isSafeInteger(minFreeBytes) || minFreeBytes < 0 || typeof availableBytes !== 'function') {
        fail('IMPORT_UPLOAD_CONFIG_INVALID', 'Free-space policy is invalid')
    }

    let uploadQueue = Promise.resolve()

    function queue(operation) {
        const run = uploadQueue.then(operation, operation)
        uploadQueue = run.catch(() => undefined)
        return run
    }

    function paths(operationId) {
        if (!validOperationId(operationId)) fail('IMPORT_INVALID_ID', 'Invalid operation ID')
        return {
            part: path.join(spoolDir, `${operationId}.part`),
            source: path.join(spoolDir, `${operationId}.source`),
        }
    }

    async function init() {
        await fsp.mkdir(spoolDir, { recursive: true, mode: 0o700 })
        await fsp.chmod(spoolDir, 0o700)
    }

    async function syncDirectory() {
        const handle = await fsp.open(spoolDir, 'r')
        try { await handle.sync() } finally { await handle.close() }
    }

    async function ensureRegularPrivate(file, { create = false } = {}) {
        let stat = await lstatOptional(file)
        if (!stat && create) {
            const handle = await fsp.open(file, 'wx', 0o600)
            try { await handle.sync() } finally { await handle.close() }
            stat = await fsp.lstat(file)
            await syncDirectory()
        }
        if (!stat) return null
        if (!stat.isFile() || stat.isSymbolicLink()) {
            fail('IMPORT_SPOOL_INVALID', 'Spool entry is not a regular file')
        }
        await fsp.chmod(file, 0o600)
        return stat
    }

    async function reservedSpoolBytes() {
        await init()
        const actualByOperation = new Map()
        let actualTotal = 0
        for (const entry of await fsp.readdir(spoolDir, { withFileTypes: true })) {
            const match = entry.name.match(/^([A-Za-z0-9_-]{8,128})\.(part|source)$/)
            if (!match) continue
            const file = path.join(spoolDir, entry.name)
            const stat = await ensureRegularPrivate(file)
            actualTotal += stat.size
            actualByOperation.set(match[1], (actualByOperation.get(match[1]) ?? 0) + stat.size)
        }
        let reserved = actualTotal
        for (const job of jobStore.listRecoverable(1024)) {
            reserved += Math.max(0, job.sourceSize - (actualByOperation.get(job.operationId) ?? 0))
        }
        return reserved
    }

    async function createJob(coordinates) {
        return queue(async () => {
            await init()
            if (!Number.isSafeInteger(coordinates?.sourceSize) || coordinates.sourceSize > maxSourceBytes) {
                fail('IMPORT_CAPACITY_EXCEEDED', 'Source exceeds the upload limit')
            }
            const existing = jobStore.getJob(coordinates.operationId)
            const active = jobStore.listRecoverable(1024)
                .find(job => job.operationId !== coordinates.operationId)
            if (active) fail('IMPORT_ACTIVE', 'Another import is active')
            if (!existing) {
                let free
                try { free = await availableBytes(spoolDir) }
                catch { fail('IMPORT_CAPACITY_EXCEEDED', 'Import free space could not be verified') }
                if (!Number.isSafeInteger(free) || free < coordinates.sourceSize + minFreeBytes) {
                    fail('IMPORT_CAPACITY_EXCEEDED', 'Import disk capacity is exhausted')
                }
            }
            if (!existing && (await reservedSpoolBytes()) + coordinates.sourceSize > maxSpoolBytes) {
                fail('IMPORT_CAPACITY_EXCEEDED', 'Import spool capacity is exhausted')
            }
            const result = jobStore.createJob(coordinates)
            if (result.job.state === 'receiving') {
                const target = paths(coordinates.operationId).part
                const stat = await ensureRegularPrivate(target, { create: result.job.nextOffset === 0 })
                if (!stat) fail('IMPORT_SPOOL_MISSING', 'Acknowledged upload source is missing')
                await reconcileReceiving(result.job, stat)
            }
            return { ...result.job, reused: result.reused }
        })
    }

    async function reconcileReceiving(job, knownStat = null) {
        const { part } = paths(job.operationId)
        const stat = knownStat ?? await ensureRegularPrivate(part)
        if (!stat) fail('IMPORT_SPOOL_MISSING', 'Upload source is missing')
        if (stat.size < job.nextOffset) fail('IMPORT_SPOOL_INVALID', 'Acknowledged source bytes are missing')
        if (stat.size > job.nextOffset) {
            await fsp.truncate(part, job.nextOffset)
            const handle = await fsp.open(part, 'r')
            try { await handle.sync() } finally { await handle.close() }
        }
        return job
    }

    async function statusInternal(operationId) {
        await init()
        let job = jobStore.getJob(operationId)
        if (!job) fail('IMPORT_JOB_NOT_FOUND', 'Import job not found')
        const target = paths(operationId)
        if (job.state === 'receiving') return reconcileReceiving(job)
        if (job.state === 'upload-finalizing') {
            const sourceStat = await ensureRegularPrivate(target.source)
            if (sourceStat) {
                if (sourceStat.size !== job.sourceSize) fail('IMPORT_SPOOL_INVALID', 'Final source size changed')
                if (await fileDigest(target.source) !== job.sourceSha256) {
                    fail('IMPORT_SOURCE_MISMATCH', 'Final source hash changed')
                }
                job = jobStore.markUploaded(operationId, job.sourceSha256)
                return job
            }
            return reconcileReceiving(job)
        }
        if (SOURCE_RETAINED_STATES.has(job.state)) {
            const sourceStat = await ensureRegularPrivate(target.source)
            if (!sourceStat || sourceStat.size !== job.sourceSize) {
                fail('IMPORT_SPOOL_MISSING', 'Durable source is missing')
            }
        }
        return job
    }

    function status(operationId) {
        return queue(() => statusInternal(operationId))
    }

    async function verifySourceInternal(operationId) {
        const job = await statusInternal(operationId)
        if (!SOURCE_RETAINED_STATES.has(job.state) || !validHash(job.sourceSha256)) {
            fail('IMPORT_STATE_CONFLICT', 'Import source is not ready for verification')
        }
        if (await fileDigest(paths(operationId).source) !== job.sourceSha256) {
            fail('IMPORT_SOURCE_MISMATCH', 'Durable import source hash changed')
        }
        return job
    }

    function verifySource(operationId) {
        return queue(() => verifySourceInternal(operationId))
    }

    async function withVerifiedSourceInternal(operationId, operation) {
        if (typeof operation !== 'function') fail('IMPORT_UPLOAD_CONFIG_INVALID', 'Verified source operation is required')
        let job
        try { job = await statusInternal(operationId) }
        catch (error) {
            if (['IMPORT_SPOOL_INVALID', 'IMPORT_SPOOL_MISSING'].includes(error?.code)) {
                fail('IMPORT_SOURCE_MISMATCH', 'Durable import source is unavailable')
            }
            throw error
        }
        if (!SOURCE_RETAINED_STATES.has(job.state) || !validHash(job.sourceSha256)) {
            fail('IMPORT_STATE_CONFLICT', 'Import source is not ready for parsing')
        }
        const source = paths(operationId).source
        const pathStat = await fsp.lstat(source)
        if (!pathStat.isFile() || pathStat.isSymbolicLink() || pathStat.size !== job.sourceSize) {
            fail('IMPORT_SOURCE_MISMATCH', 'Import source path changed')
        }
        const noFollow = Number.isInteger(fs.constants.O_NOFOLLOW) ? fs.constants.O_NOFOLLOW : 0
        let handle
        try { handle = await fsp.open(source, fs.constants.O_RDONLY | noFollow) }
        catch { fail('IMPORT_SOURCE_MISMATCH', 'Import source could not be opened safely') }
        try {
            const before = await handle.stat()
            if (
                !before.isFile()
                || before.size !== job.sourceSize
                || (pathStat.dev !== undefined && before.dev !== pathStat.dev)
                || (pathStat.ino !== undefined && before.ino !== pathStat.ino)
                || await handleDigest(handle, before.size) !== job.sourceSha256
            ) {
                fail('IMPORT_SOURCE_MISMATCH', 'Import source identity changed')
            }
            const result = await operation({ handle, size: before.size })
            const after = await handle.stat()
            if (
                after.size !== before.size
                || after.dev !== before.dev
                || after.ino !== before.ino
                || await handleDigest(handle, after.size) !== job.sourceSha256
            ) {
                fail('IMPORT_SOURCE_MISMATCH', 'Import source changed during parsing')
            }
            return result
        } finally {
            await handle.close()
        }
    }

    function withVerifiedSource(operationId, operation) {
        return queue(() => withVerifiedSourceInternal(operationId, operation))
    }

    async function append(operationId, start, data, expectedHash) {
        return queue(async () => {
            if (!Buffer.isBuffer(data)) data = Buffer.from(data)
            if (!Number.isSafeInteger(start) || start < 0 || data.length === 0) {
                fail('IMPORT_UPLOAD_RANGE_INVALID', 'Chunk range is invalid')
            }
            if (data.length > maxChunkBytes) {
                fail('IMPORT_UPLOAD_RANGE_INVALID', 'Chunk exceeds the upload limit')
            }
            if (!validHash(expectedHash) || digest(data) !== expectedHash) {
                fail('IMPORT_CHUNK_HASH_MISMATCH', 'Chunk hash mismatch')
            }
            const job = await statusInternal(operationId)
            if (job.state !== 'receiving') fail('IMPORT_STATE_CONFLICT', 'Upload is not receiving')
            const end = start + data.length
            if (!Number.isSafeInteger(end) || end > job.sourceSize) {
                fail('IMPORT_UPLOAD_RANGE_INVALID', 'Chunk exceeds source size')
            }
            if (start > job.nextOffset) fail('IMPORT_UPLOAD_GAP', 'Chunk starts after the acknowledged offset')
            const { part } = paths(operationId)
            if (start < job.nextOffset) {
                if (end > job.nextOffset) {
                    fail('IMPORT_UPLOAD_OVERLAP', 'Chunk crosses the acknowledged offset')
                }
                const existing = Buffer.allocUnsafe(data.length)
                const handle = await fsp.open(part, 'r')
                try {
                    const result = await handle.read(existing, 0, existing.length, start)
                    if (result.bytesRead !== existing.length || !existing.equals(data)) {
                        fail('IMPORT_UPLOAD_REPLAY_MISMATCH', 'Replayed chunk differs')
                    }
                } finally {
                    await handle.close()
                }
                return { ...job, replayed: true }
            }
            const handle = await fsp.open(part, 'r+')
            try {
                const result = await handle.write(data, 0, data.length, start)
                if (result.bytesWritten !== data.length) {
                    fail('IMPORT_UPLOAD_WRITE_INCOMPLETE', 'Chunk write was incomplete')
                }
                await handle.sync()
            } finally {
                await handle.close()
            }
            const next = jobStore.advanceUpload(operationId, start, end)
            return { ...next, replayed: false }
        })
    }

    async function complete(operationId, expectedHash) {
        return queue(async () => {
            if (!validHash(expectedHash)) fail('IMPORT_SOURCE_HASH_INVALID', 'Source hash is invalid')
            let job = await statusInternal(operationId)
            if (SOURCE_RETAINED_STATES.has(job.state)) {
                if (job.sourceSha256 !== expectedHash) {
                    fail('IMPORT_OPERATION_CONFLICT', 'Completed source hash changed')
                }
                return { ...job, reused: true }
            }
            const target = paths(operationId)
            if (job.state === 'receiving') {
                if (job.nextOffset !== job.sourceSize) fail('IMPORT_UPLOAD_INCOMPLETE', 'Upload is incomplete')
                if (await fileDigest(target.part) !== expectedHash) {
                    fail('IMPORT_SOURCE_MISMATCH', 'Source hash mismatch')
                }
                job = jobStore.beginUploadFinalization(operationId, expectedHash)
                fault('after-finalizing')
            }
            if (job.state !== 'upload-finalizing' || job.sourceSha256 !== expectedHash) {
                fail('IMPORT_STATE_CONFLICT', 'Upload cannot complete')
            }
            const sourceStat = await ensureRegularPrivate(target.source)
            if (!sourceStat) {
                const partStat = await ensureRegularPrivate(target.part)
                if (!partStat || partStat.size !== job.sourceSize) fail('IMPORT_SPOOL_INVALID', 'Finalizing source is missing')
                if (await fileDigest(target.part) !== expectedHash) fail('IMPORT_SOURCE_MISMATCH', 'Source hash changed')
                const handle = await fsp.open(target.part, 'r')
                try { await handle.sync() } finally { await handle.close() }
                await fsp.rename(target.part, target.source)
                await syncDirectory()
                fault('after-rename')
            }
            job = jobStore.markUploaded(operationId, expectedHash)
            return { ...job, reused: false }
        })
    }

    async function cleanupSourceFiles(operationId) {
        const target = paths(operationId)
        for (const file of [target.part, target.source]) {
            try { await fsp.unlink(file) }
            catch (error) { if (error.code !== 'ENOENT') throw error }
        }
        await init()
        await syncDirectory()
    }

    async function finishCancellationInternal(operationId) {
        const job = jobStore.getJob(operationId)
        if (!job || !['cancelling', 'cancelled'].includes(job.state)) {
            fail('IMPORT_STATE_CONFLICT', 'Import cancellation is not active')
        }
        if (job.state === 'cancelled') return job
        await cleanupSourceFiles(operationId)
        return jobStore.finishCancellation(operationId)
    }

    async function cancel(operationId) {
        return queue(async () => {
            jobStore.beginCancellation(operationId)
            return finishCancellationInternal(operationId)
        })
    }

    function finishCancellation(operationId) {
        return queue(() => finishCancellationInternal(operationId))
    }

    async function release(operationId) {
        return queue(async () => {
            const job = jobStore.getJob(operationId)
            if (!job) fail('IMPORT_JOB_NOT_FOUND', 'Import job not found')
            if (!['delivered', 'failed', 'cancelled', 'incompatible-after-upgrade'].includes(job.state)) {
                fail('IMPORT_STATE_CONFLICT', 'Import source is still active or recoverable')
            }
            const target = paths(operationId)
            let removed = false
            for (const file of [target.part, target.source]) {
                try { await fsp.unlink(file); removed = true }
                catch (error) { if (error.code !== 'ENOENT') throw error }
            }
            await init()
            if (removed) await syncDirectory()
            return { removed }
        })
    }

    function sourcePath(operationId) {
        const job = jobStore.getJob(operationId)
        if (!job || !SOURCE_RETAINED_STATES.has(job.state)) {
            fail('IMPORT_STATE_CONFLICT', 'Import source is not durable')
        }
        return paths(operationId).source
    }

    return {
        createJob,
        append,
        complete,
        status,
        verifySource,
        withVerifiedSource,
        cancel,
        finishCancellation,
        release,
        sourcePath,
    }
}

module.exports = {
    ImportUploadError,
    createImportUploadOwner,
    digest,
    fileDigest,
}
