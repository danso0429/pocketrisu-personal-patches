'use strict'

const crypto = require('node:crypto')
const { stableValue } = require('./importPreparedDigest.cjs')

class ImportCommitError extends Error {
    constructor(code, message) {
        super(message)
        this.name = 'ImportCommitError'
        this.code = code
    }
}

function fail(code, message) {
    throw new ImportCommitError(code, message)
}

function entityId(kind, entity) {
    const value = kind === 'module' ? entity?.id : entity?.chaId
    if (typeof value !== 'string' || value.length === 0) fail('IMPORT_PREPARED_INVALID', 'Prepared entity ID is invalid')
    return value
}

function entityDigest(entity) {
    return crypto.createHash('sha256').update(JSON.stringify(stableValue(entity))).digest('hex')
}

function collection(database, kind) {
    if (kind === 'module') {
        database.modules ??= []
        if (!Array.isArray(database.modules)) fail('IMPORT_DATABASE_INVALID', 'Module collection is invalid')
        return database.modules
    }
    database.characters ??= []
    if (!Array.isArray(database.characters)) fail('IMPORT_DATABASE_INVALID', 'Character collection is invalid')
    return database.characters
}

function findEntity(database, kind, id) {
    return collection(database, kind).find(value => (
        kind === 'module' ? value?.id === id : value?.chaId === id
    )) ?? null
}

function addCharacterOrder(database, id) {
    database.characterOrder ??= []
    if (!Array.isArray(database.characterOrder)) fail('IMPORT_DATABASE_INVALID', 'Character order is invalid')
    const ordered = new Set()
    for (const value of database.characterOrder) {
        if (typeof value === 'string') ordered.add(value)
        else if (value && Array.isArray(value.data)) for (const child of value.data) ordered.add(child)
    }
    if (!ordered.has(id)) database.characterOrder.push(id)
}

function createAppendOnlyCanonicalCommitter({
    runStorageOperation,
    loadDatabase,
    promoteAsset,
    readCommitMarker,
    computeRevision,
    persistDatabaseAndMarker,
    synchronizeCanonicalState,
    newChatDefaults = () => ({}),
} = {}) {
    for (const [name, value] of Object.entries({
        runStorageOperation,
        loadDatabase,
        promoteAsset,
        readCommitMarker,
        computeRevision,
        persistDatabaseAndMarker,
        synchronizeCanonicalState,
    })) {
        if (typeof value !== 'function') fail('IMPORT_COMMIT_CONFIG_INVALID', `Missing commit dependency: ${name}`)
    }

    async function commit(operationId, prepared, resolveAssetPath) {
        if (typeof resolveAssetPath !== 'function') fail('IMPORT_COMMIT_CONFIG_INVALID', 'Asset path resolver is required')
        return runStorageOperation(async () => {
            const id = entityId(prepared?.kind, prepared?.entity)
            const marker = await readCommitMarker(operationId)
            const database = await loadDatabase()
            if (!database || typeof database !== 'object') fail('IMPORT_DATABASE_INVALID', 'Canonical database is invalid')
            if (marker) {
                if (
                    marker.operationId !== operationId
                    || marker.kind !== prepared.kind
                    || marker.entityId !== id
                    || marker.preparedDigest !== prepared.preparedDigest
                ) {
                    fail('IMPORT_COMMIT_INCONSISTENT', 'Commit marker conflicts with prepared import')
                }
                const existing = findEntity(database, prepared.kind, id)
                if (!existing || entityDigest(existing) !== marker.committedEntityDigest) {
                    fail('IMPORT_COMMIT_INCONSISTENT', 'Committed entity and marker diverged')
                }
                for (const asset of prepared.assets ?? []) {
                    await promoteAsset(asset, resolveAssetPath(operationId, asset.relativePath))
                }
                await synchronizeCanonicalState(database)
                return {
                    committedRevision: marker.committedRevision,
                    committedEntityDigest: marker.committedEntityDigest,
                    reused: true,
                }
            }

            const existing = findEntity(database, prepared.kind, id)
            if (existing) fail('IMPORT_ENTITY_COLLISION', 'Prepared entity ID already exists')
            const entity = structuredClone(prepared.entity)
            if (prepared.kind === 'character') {
                const defaults = newChatDefaults(database)
                if (!defaults || typeof defaults !== 'object') fail('IMPORT_DATABASE_INVALID', 'New chat defaults are invalid')
                if (!Array.isArray(entity.chats) || entity.chats.length === 0) {
                    fail('IMPORT_PREPARED_INVALID', 'Imported character has no chat')
                }
                for (const chat of entity.chats) {
                    if (!chat || typeof chat !== 'object' || typeof chat.id !== 'string' || !Array.isArray(chat.message)) {
                        fail('IMPORT_PREPARED_INVALID', 'Imported character chat is invalid')
                    }
                    for (const [key, value] of Object.entries(defaults)) {
                        if (chat[key] === undefined) chat[key] = structuredClone(value)
                    }
                }
            }

            for (const asset of prepared.assets ?? []) {
                await promoteAsset(asset, resolveAssetPath(operationId, asset.relativePath))
            }

            collection(database, prepared.kind).push(entity)
            if (prepared.kind === 'character') {
                addCharacterOrder(database, id)
                database.statics ??= {}
                database.statics.imports = Number.isFinite(database.statics.imports)
                    ? database.statics.imports + 1
                    : 1
            }
            const committedEntityDigest = entityDigest(entity)
            const committedRevision = computeRevision(database)
            if (typeof committedRevision !== 'string' || committedRevision.length === 0) {
                fail('IMPORT_COMMIT_INVALID', 'Committed revision is invalid')
            }
            const nextMarker = {
                format: 1,
                operationId,
                kind: prepared.kind,
                entityId: id,
                preparedDigest: prepared.preparedDigest,
                committedEntityDigest,
                committedRevision,
            }
            const persisted = await persistDatabaseAndMarker(database, nextMarker)
            if (persisted?.committedRevision !== committedRevision) {
                fail('IMPORT_COMMIT_INCONSISTENT', 'Persisted revision differs')
            }
            await synchronizeCanonicalState(database)
            return { committedRevision, committedEntityDigest, reused: false }
        })
    }

    return { commit }
}

const RECONCILE_CODES = new Set([
    'IMPORT_COMMIT_INCONSISTENT',
    'IMPORT_OPERATION_CONFLICT',
])
const TERMINAL_CONFLICT_CODES = new Set(['IMPORT_ENTITY_COLLISION', 'IMPORT_ASSET_COLLISION'])

function createImportCommitOwner({
    jobStore,
    preparedStore,
    committer,
    fault = () => undefined,
} = {}) {
    if (!jobStore || !preparedStore || typeof committer?.commit !== 'function') {
        fail('IMPORT_COMMIT_CONFIG_INVALID', 'Import commit owners are required')
    }
    let commitQueue = Promise.resolve()

    function queue(operation) {
        const run = commitQueue.then(operation, operation)
        commitQueue = run.catch(() => undefined)
        return run
    }

    async function runUnlocked(operationId) {
        let job = jobStore.getJob(operationId)
        if (!job) fail('IMPORT_JOB_NOT_FOUND', 'Import job not found')
        if (['completed', 'client-reconciled', 'delivered', 'reconcile-required'].includes(job.state)) return job
        if (job.state === 'prepared') job = jobStore.markCommitting(operationId)
        if (job.state !== 'committing') fail('IMPORT_STATE_CONFLICT', 'Import is not prepared for commit')
        const prepared = await preparedStore.read(operationId)
        const id = entityId(job.kind, prepared.entity)
        if (prepared.preparedDigest !== job.preparedDigest || id !== job.entityId || prepared.kind !== job.kind) {
            return jobStore.failJob(operationId, {
                code: 'IMPORT_COMMIT_CONFLICT',
                detail: 'Prepared import and durable coordinates differ',
            })
        }
        try {
            const result = await committer.commit(
                operationId,
                prepared,
                (idValue, relativePath) => preparedStore.resolveAssetPath(idValue, relativePath),
            )
            fault('after-canonical')
            return jobStore.markCompleted(operationId, {
                committedRevision: result.committedRevision,
            })
        } catch (error) {
            if (TERMINAL_CONFLICT_CODES.has(error?.code)) {
                return jobStore.failJob(operationId, {
                    code: 'IMPORT_COMMIT_CONFLICT',
                    detail: 'Import commit was refused before database mutation',
                })
            }
            if (RECONCILE_CODES.has(error?.code)) {
                return jobStore.markReconcileRequired(operationId, {
                    code: 'IMPORT_COMMIT_CONFLICT',
                    detail: String(error?.message ?? error.code),
                })
            }
            throw error
        }
    }

    return { run: operationId => queue(() => runUnlocked(operationId)) }
}

module.exports = {
    ImportCommitError,
    createAppendOnlyCanonicalCommitter,
    createImportCommitOwner,
    entityDigest,
}
