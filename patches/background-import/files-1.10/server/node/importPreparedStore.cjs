'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const { digestPrepared } = require('./importPreparedDigest.cjs')

const ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/
const HASH_PATTERN = /^[a-f0-9]{64}$/
const ASSET_KEY_PATTERN = /^assets\/([a-f0-9]{64})\.([a-z0-9]{1,16})$/

class PreparedImportStoreError extends Error {
    constructor(code, message) {
        super(message)
        this.name = 'PreparedImportStoreError'
        this.code = code
    }
}

function fail(code, message) {
    throw new PreparedImportStoreError(code, message)
}

function validId(value) {
    return typeof value === 'string' && ID_PATTERN.test(value)
}

async function hashFile(file) {
    const hash = crypto.createHash('sha256')
    let bytes = 0
    for await (const chunk of fs.createReadStream(file)) {
        hash.update(chunk)
        bytes += chunk.byteLength
    }
    return { sha256: hash.digest('hex'), bytes }
}

async function lstatOptional(file) {
    try { return await fsp.lstat(file) }
    catch (error) {
        if (error.code === 'ENOENT') return null
        throw error
    }
}

function createPreparedImportStore({ root } = {}) {
    if (typeof root !== 'string' || root.length === 0) fail('IMPORT_PREPARED_CONFIG_INVALID', 'Prepared root is required')

    function validateId(operationId) {
        if (!validId(operationId)) fail('IMPORT_INVALID_ID', 'Invalid operation ID')
    }

    function stagingDir(operationId) {
        validateId(operationId)
        return path.join(root, operationId)
    }

    function preparedPath(operationId) {
        return path.join(stagingDir(operationId), 'prepared.json')
    }

    async function initRoot() {
        await fsp.mkdir(root, { recursive: true, mode: 0o700 })
        const stat = await fsp.lstat(root)
        if (!stat.isDirectory() || stat.isSymbolicLink()) fail('IMPORT_PREPARED_PATH_INVALID', 'Prepared root is invalid')
        await fsp.chmod(root, 0o700)
    }

    async function syncDirectory(directory) {
        const handle = await fsp.open(directory, 'r')
        try { await handle.sync() } finally { await handle.close() }
    }

    async function validatePrepared(operationId, prepared) {
        if (!prepared || typeof prepared !== 'object' || Array.isArray(prepared)) {
            fail('IMPORT_PREPARED_INVALID', 'Prepared import is invalid')
        }
        if (!['module', 'character'].includes(prepared.kind) || typeof prepared.format !== 'string') {
            fail('IMPORT_PREPARED_INVALID', 'Prepared coordinates are invalid')
        }
        if (!prepared.entity || typeof prepared.entity !== 'object' || Array.isArray(prepared.entity)) {
            fail('IMPORT_PREPARED_INVALID', 'Prepared entity is invalid')
        }
        if (!Array.isArray(prepared.assets) || !HASH_PATTERN.test(prepared.preparedDigest ?? '')) {
            fail('IMPORT_PREPARED_INVALID', 'Prepared asset inventory is invalid')
        }
        const actualDigest = digestPrepared(prepared)
        if (actualDigest !== prepared.preparedDigest) {
            fail('IMPORT_PREPARED_DIGEST_MISMATCH', 'Prepared semantic digest changed')
        }
        const directory = stagingDir(operationId)
        const expectedPrefix = `${operationId}/`
        for (const asset of prepared.assets) {
            const match = typeof asset?.key === 'string' ? asset.key.match(ASSET_KEY_PATTERN) : null
            if (
                !match
                || asset.sha256 !== match[1]
                || !Number.isSafeInteger(asset.bytes)
                || asset.bytes < 0
            ) {
                fail('IMPORT_STAGED_ASSET_MISMATCH', 'Prepared asset coordinates are invalid')
            }
            if (typeof asset.relativePath !== 'string' || !asset.relativePath.startsWith(expectedPrefix)) {
                fail('IMPORT_PREPARED_PATH_INVALID', 'Prepared asset path is invalid')
            }
            const basename = asset.relativePath.slice(expectedPrefix.length)
            if (basename !== `${asset.sha256}.${match[2]}` || basename.includes('/') || basename.includes('\\')) {
                fail('IMPORT_PREPARED_PATH_INVALID', 'Prepared asset path is invalid')
            }
            const file = path.join(directory, basename)
            const stat = await lstatOptional(file)
            if (!stat || !stat.isFile() || stat.isSymbolicLink()) {
                fail('IMPORT_PREPARED_PATH_INVALID', 'Prepared asset is not a regular file')
            }
            const observed = await hashFile(file)
            if (observed.bytes !== asset.bytes || observed.sha256 !== asset.sha256) {
                fail('IMPORT_STAGED_ASSET_MISMATCH', 'Prepared asset bytes changed')
            }
            await fsp.chmod(file, 0o600)
        }
        return prepared
    }

    async function write(operationId, prepared) {
        await initRoot()
        const directory = stagingDir(operationId)
        await fsp.mkdir(directory, { recursive: true, mode: 0o700 })
        const dirStat = await fsp.lstat(directory)
        if (!dirStat.isDirectory() || dirStat.isSymbolicLink()) fail('IMPORT_PREPARED_PATH_INVALID', 'Operation directory is invalid')
        await fsp.chmod(directory, 0o700)
        await validatePrepared(operationId, prepared)
        const file = preparedPath(operationId)
        const temporary = path.join(directory, `prepared-${process.pid}-${crypto.randomUUID()}.tmp`)
        try {
            const handle = await fsp.open(temporary, 'wx', 0o600)
            try {
                await handle.writeFile(Buffer.from(JSON.stringify(prepared)))
                await handle.sync()
            } finally { await handle.close() }
            await fsp.rename(temporary, file)
            await fsp.chmod(file, 0o600)
            await syncDirectory(directory)
            await syncDirectory(root)
        } catch (error) {
            try { await fsp.unlink(temporary) } catch (cleanupError) {
                if (cleanupError.code !== 'ENOENT') throw cleanupError
            }
            throw error
        }
        return prepared
    }

    async function read(operationId) {
        await initRoot()
        const file = preparedPath(operationId)
        const stat = await lstatOptional(file)
        if (!stat || !stat.isFile() || stat.isSymbolicLink()) {
            fail('IMPORT_PREPARED_MISSING', 'Prepared import is missing')
        }
        let prepared
        try { prepared = JSON.parse(await fsp.readFile(file, 'utf8')) }
        catch (error) { throw new PreparedImportStoreError('IMPORT_PREPARED_INVALID', 'Prepared import could not be decoded') }
        return validatePrepared(operationId, prepared)
    }

    async function remove(operationId) {
        await initRoot()
        const directory = stagingDir(operationId)
        const stat = await lstatOptional(directory)
        if (!stat) return { removed: false }
        if (!stat.isDirectory() || stat.isSymbolicLink()) fail('IMPORT_PREPARED_PATH_INVALID', 'Operation directory is invalid')
        await fsp.rm(directory, { recursive: true, force: false })
        await syncDirectory(root)
        return { removed: true }
    }

    return {
        stagingDir,
        preparedPath,
        write,
        read,
        remove,
    }
}

module.exports = {
    PreparedImportStoreError,
    createPreparedImportStore,
}
