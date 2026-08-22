'use strict'

const fs = require('node:fs/promises')
const { pathToFileURL } = require('node:url')

const ERROR_CODE_PATTERN = /^(IMPORT|CHARX|RISUM|PNG)_[A-Z0-9_]{1,96}$/
const CLOSED_STATES = new Set(['prepared', 'committing', 'completed', 'client-reconciled', 'delivered', 'failed', 'cancelled', 'incompatible-after-upgrade'])

class ImportPrepareError extends Error {
    constructor(code, message) {
        super(message)
        this.name = 'ImportPrepareError'
        this.code = code
    }
}

function fail(code, message) {
    throw new ImportPrepareError(code, message)
}

function entityId(job, prepared) {
    const value = job.kind === 'module' ? prepared?.entity?.id : prepared?.entity?.chaId
    if (typeof value !== 'string' || value.length === 0 || value.length > 256) {
        fail('IMPORT_PREPARED_INVALID', 'Prepared entity ID is invalid')
    }
    return value
}

function createImportPrepareOwner({
    jobStore,
    upload,
    preparedStore,
    parserBundlePath,
    limits,
} = {}) {
    if (!jobStore || !upload || !preparedStore) fail('IMPORT_PREPARE_CONFIG_INVALID', 'Import preparation owners are required')
    if (typeof parserBundlePath !== 'string' || parserBundlePath.length === 0) {
        fail('IMPORT_PREPARE_CONFIG_INVALID', 'Parser bundle path is required')
    }
    if (!limits || typeof limits !== 'object') fail('IMPORT_PREPARE_CONFIG_INVALID', 'Parser limits are required')

    let loadedParser = null
    let loadedIdentity = ''
    let operationQueue = Promise.resolve()

    function queue(operation) {
        const run = operationQueue.then(operation, operation)
        operationQueue = run.catch(() => undefined)
        return run
    }

    async function parser() {
        const stat = await fs.stat(parserBundlePath)
        const identity = `${stat.size}:${stat.mtimeMs}`
        if (loadedParser && loadedIdentity === identity) return loadedParser
        const loaded = await import(`${pathToFileURL(parserBundlePath).href}?identity=${encodeURIComponent(identity)}`)
        if (
            typeof loaded.inspectImport !== 'function'
            || typeof loaded.prepareImport !== 'function'
            || typeof loaded.preparedDigestFor !== 'function'
        ) {
            fail('IMPORT_PROTOCOL_INCOMPATIBLE', 'Parser bundle exports are invalid')
        }
        loadedParser = loaded
        loadedIdentity = identity
        return loadedParser
    }

    function requestFor(job) {
        return {
            operationId: job.operationId,
            sourcePath: upload.sourcePath(job.operationId),
            stagingDir: preparedStore.stagingDir(job.operationId),
            kind: job.kind,
            format: job.declaredFormat,
            authorized: job.authorizationRequired !== true || job.authorizationDecision === 'accepted',
            limits,
        }
    }

    async function inspect(operationId) {
        let job = jobStore.getJob(operationId)
        if (!job) fail('IMPORT_JOB_NOT_FOUND', 'Import job not found')
        if (job.state === 'uploaded') job = jobStore.beginInspection(operationId)
        if (job.state !== 'inspecting') return job
        const inspection = await (await parser()).inspectImport(requestFor(job))
        return jobStore.finishInspection(operationId, {
            authorizationRequired: inspection?.authorizationRequired === true,
        })
    }

    async function prepare(operationId) {
        let job = jobStore.getJob(operationId)
        if (!job) fail('IMPORT_JOB_NOT_FOUND', 'Import job not found')
        if (job.state === 'queued') job = jobStore.beginPreparing(operationId)
        if (job.state !== 'preparing') return job
        const prepared = await (await parser()).prepareImport(requestFor(job))
        const id = entityId(job, prepared)
        await preparedStore.write(operationId, prepared)
        return jobStore.markPrepared(operationId, {
            preparedDigest: prepared.preparedDigest,
            entityId: id,
        })
    }

    async function runUnlocked(operationId) {
        try {
            for (let step = 0; step < 4; step++) {
                const job = jobStore.getJob(operationId)
                if (!job) fail('IMPORT_JOB_NOT_FOUND', 'Import job not found')
                if (job.state === 'uploaded' || job.state === 'inspecting') {
                    const inspected = await inspect(operationId)
                    if (inspected.state === 'awaiting-authorization') return inspected
                    continue
                }
                if (job.state === 'queued' || job.state === 'preparing') return await prepare(operationId)
                return job
            }
            fail('IMPORT_STATE_CONFLICT', 'Import preparation did not settle')
        } catch (error) {
            const current = jobStore.getJob(operationId)
            if (!current || CLOSED_STATES.has(current.state)) throw error
            const code = typeof error?.code === 'string' && ERROR_CODE_PATTERN.test(error.code)
                ? error.code
                : 'IMPORT_PREPARATION_FAILED'
            const detail = code === 'IMPORT_PREPARATION_FAILED'
                ? 'Import preparation failed'
                : String(error?.message ?? code)
            try { return jobStore.failJob(operationId, { code, detail }) }
            catch { throw error }
        }
    }

    function run(operationId) {
        return queue(() => runUnlocked(operationId))
    }

    function authorize(operationId, accepted) {
        return queue(async () => {
            const job = jobStore.authorize(operationId, accepted)
            if (accepted) return job
            await upload.cancel(operationId)
            await preparedStore.remove(operationId)
            return jobStore.getJob(operationId)
        })
    }

    return {
        inspect: operationId => queue(() => inspect(operationId)),
        prepare: operationId => queue(() => prepare(operationId)),
        run,
        authorize,
    }
}

module.exports = {
    ImportPrepareError,
    createImportPrepareOwner,
}
