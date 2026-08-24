'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs/promises')
const path = require('node:path')
const { createAppendOnlyCanonicalCommitter } = require('./importCommit.cjs')
const { registerImportRoutes } = require('./importRoutes.cjs')

const DB_KEY = 'database/database.bin'
const MARKER_PREFIX = 'import-commit:'
const ASSET_KEY = /^assets\/([a-f0-9]{64})\.([a-z0-9]{1,16})$/

function serverError(code, message) {
    return Object.assign(new Error(message), { name: 'ImportServerError', code })
}

function markerKey(operationId) {
    return `${MARKER_PREFIX}${operationId}`
}

function createServerCanonicalCommitter(deps) {
    const required = [
        'queueStorageOperation', 'flushPendingDb', 'kvGet', 'kvSet',
        'decodeDatabase', 'computeDatabaseRevision',
        'persistDatabaseAndMarker', 'synchronizeCanonicalState',
    ]
    for (const name of required) {
        if (typeof deps?.[name] !== 'function') throw new Error(`Missing import server dependency: ${name}`)
    }

    return createAppendOnlyCanonicalCommitter({
        runStorageOperation: deps.queueStorageOperation,
        async loadDatabase() {
            await deps.flushPendingDb({ createBackup: false })
            const raw = deps.kvGet(DB_KEY)
            if (!raw) throw serverError('IMPORT_DATABASE_INVALID', 'Canonical database is missing')
            const database = await deps.decodeDatabase(raw)
            if (!database || typeof database !== 'object') {
                throw serverError('IMPORT_DATABASE_INVALID', 'Canonical database could not be decoded')
            }
            return database
        },
        async promoteAsset(asset, file) {
            const match = typeof asset?.key === 'string' ? asset.key.match(ASSET_KEY) : null
            if (!match || match[1] !== asset.sha256) {
                throw serverError('IMPORT_STAGED_ASSET_MISMATCH', 'Staged asset key is invalid')
            }
            const stat = await fs.lstat(file)
            if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== asset.bytes) {
                throw serverError('IMPORT_STAGED_ASSET_MISMATCH', 'Staged asset file is invalid')
            }
            const data = await fs.readFile(file)
            const observed = crypto.createHash('sha256').update(data).digest('hex')
            if (observed !== asset.sha256) {
                throw serverError('IMPORT_STAGED_ASSET_MISMATCH', 'Staged asset hash changed')
            }
            const existing = deps.kvGet(asset.key)
            if (existing && !Buffer.from(existing).equals(data)) {
                throw serverError('IMPORT_ASSET_COLLISION', 'Content-addressed asset key differs')
            }
            if (!existing) deps.kvSet(asset.key, data)
        },
        async readCommitMarker(operationId) {
            const raw = deps.kvGet(markerKey(operationId))
            if (!raw) return null
            try { return JSON.parse(Buffer.from(raw).toString('utf8')) }
            catch { throw serverError('IMPORT_COMMIT_INCONSISTENT', 'Canonical import marker is invalid') }
        },
        computeRevision: deps.computeDatabaseRevision,
        async persistDatabaseAndMarker(database, marker) {
            return deps.persistDatabaseAndMarker(database, markerKey(marker.operationId), marker)
        },
        synchronizeCanonicalState: deps.synchronizeCanonicalState,
        newChatDefaults(database) {
            if (!database.useModelPresetByDefault) return {}
            return {
                useModelPreset: true,
                modelBinding: database.defaultModelBinding
                    ? structuredClone(database.defaultModelBinding)
                    : {
                        main: '', sub: '', separateAux: false,
                        aux: { memory: '', emotion: '', translate: '', otherAx: '' },
                    },
            }
        },
    })
}

function registerBackgroundImport(app, deps) {
    const canonicalCommitter = createServerCanonicalCommitter(deps)
    return registerImportRoutes(app, {
        saveDir: deps.saveDir,
        parserBundlePath: deps.parserBundlePath
            ?? path.join(deps.rootDir ?? process.cwd(), 'server/node/importParserBundle.mjs'),
        checkAuth: deps.checkAuth,
        checkActiveSession: deps.checkActiveSession,
        canonicalCommitter,
        limits: deps.limits,
        logger: deps.logger,
    })
}

module.exports = {
    DB_KEY,
    MARKER_PREFIX,
    createServerCanonicalCommitter,
    registerBackgroundImport,
}
