#!/usr/bin/env node
'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const util = require('node:util')
const v8 = require('node:v8')
const { createRequire } = require('node:module')

const DATABASE_KEY = 'database/database.bin'
const OLD_CLIPBOARD_LINE = 'const clipText = await navigator.clipboard.readText();'
const IOS_SAFE_CLIPBOARD_LINE = "const clipText = isIOS() ? '' : await navigator.clipboard.readText();"

const FASTIMPORT_POLICY = Object.freeze({
    pluginName: 'fast-character-import',
    displayName: '고속 캐릭터 임포트 1.5.5',
    originalScriptSha256: '203678e882cee9d2e2c66123820e26ede8d6cc085ac5feb0072ed2b5a2cee908',
    patchedScriptSha256: '5777e74585a3dfc7993cd53fef58c7ad2e649d1d6d167aaf8457355eb1885e94',
    needle: OLD_CLIPBOARD_LINE,
    replacement: IOS_SAFE_CLIPBOARD_LINE,
})

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex')
}

function countOccurrences(source, needle) {
    if (!needle) return 0
    let count = 0
    let offset = 0
    while (true) {
        const found = source.indexOf(needle, offset)
        if (found < 0) return count
        count += 1
        offset = found + needle.length
    }
}

function preservedDatabaseValue(database, targetIndex) {
    const preserved = structuredClone(database)
    preserved.plugins[targetIndex].script = '<FASTIMPORT_TARGET_SCRIPT>'
    return preserved
}

function preservedDatabaseDigest(database, targetIndex) {
    return sha256(v8.serialize(preservedDatabaseValue(database, targetIndex)))
}

function assertDatabasePreserved(before, after, targetIndex) {
    if (!util.isDeepStrictEqual(
        preservedDatabaseValue(before, targetIndex),
        preservedDatabaseValue(after, targetIndex),
    )) {
        throw new Error('FastImport migration changed non-target database content')
    }
}

function inspectDecodedDatabase(database, policy = FASTIMPORT_POLICY) {
    if (!database || !Array.isArray(database.plugins)) {
        throw new Error('Decoded database has no plugin array')
    }
    const matches = database.plugins
        .map((plugin, index) => ({ plugin, index }))
        .filter(({ plugin }) => (
            plugin?.name === policy.pluginName
            && plugin?.displayName === policy.displayName
        ))
    if (matches.length !== 1) {
        throw new Error(`Expected exactly one FastImport target, found ${matches.length}`)
    }

    const { plugin, index } = matches[0]
    if (typeof plugin.script !== 'string') {
        throw new Error('FastImport target script is not a string')
    }
    const scriptSha256 = sha256(plugin.script)
    const oldOccurrences = countOccurrences(plugin.script, policy.needle)
    const patchedOccurrences = countOccurrences(plugin.script, policy.replacement)

    if (scriptSha256 === policy.patchedScriptSha256) {
        if (oldOccurrences !== 0 || patchedOccurrences !== 1) {
            throw new Error('Known patched FastImport hash has an unexpected source shape')
        }
        return {
            status: 'already-applied',
            targetIndex: index,
            pluginCount: database.plugins.length,
            scriptSha256,
            preservedDigest: preservedDatabaseDigest(database, index),
        }
    }

    if (scriptSha256 !== policy.originalScriptSha256) {
        throw new Error(`Unknown FastImport script hash: ${scriptSha256}`)
    }
    if (oldOccurrences !== 1 || patchedOccurrences !== 0) {
        throw new Error(
            `Expected one original clipboard line and no patched line; found ${oldOccurrences}/${patchedOccurrences}`,
        )
    }

    const patchedScript = plugin.script.replace(policy.needle, policy.replacement)
    const nextScriptSha256 = sha256(patchedScript)
    if (nextScriptSha256 !== policy.patchedScriptSha256) {
        throw new Error(`FastImport transformed hash mismatch: ${nextScriptSha256}`)
    }

    return {
        status: 'ready',
        targetIndex: index,
        pluginCount: database.plugins.length,
        scriptSha256,
        nextScriptSha256,
        preservedDigest: preservedDatabaseDigest(database, index),
        patchedScript,
    }
}

function buildPatchedDatabase(database, inspection) {
    if (inspection.status !== 'ready') {
        throw new Error(`Cannot build a patch from state ${inspection.status}`)
    }
    const patched = structuredClone(database)
    patched.plugins[inspection.targetIndex].script = inspection.patchedScript
    assertDatabasePreserved(database, patched, inspection.targetIndex)
    return patched
}

async function readDecoded(openStore, decode) {
    const store = openStore({ readonly: true })
    try {
        const bytes = store.read(DATABASE_KEY)
        if (!bytes) throw new Error(`Missing ${DATABASE_KEY}`)
        return { bytes: Buffer.from(bytes), database: await decode(bytes), quickCheck: store.quickCheck() }
    }
    finally {
        store.close()
    }
}

async function restoreVerifiedBackup({ openStore, decode, originalBytes, patchedBytes, backupKey }) {
    const store = openStore({ readonly: false })
    try {
        const current = store.read(DATABASE_KEY)
        if (!current || sha256(current) !== sha256(patchedBytes)) {
            throw new Error('Post-write verification failed after another database change; refusing automatic restore')
        }
        store.transaction(() => {
            const backup = store.read(backupKey)
            if (!backup || sha256(backup) !== sha256(originalBytes)) {
                throw new Error('Rollback backup is missing or does not match the planned original')
            }
            store.copy(backupKey, DATABASE_KEY)
            const restored = store.read(DATABASE_KEY)
            if (!restored || sha256(restored) !== sha256(originalBytes)) {
                throw new Error('Rollback write did not restore the original database blob')
            }
        })
        if (store.quickCheck() !== 'ok') throw new Error('SQLite quick_check failed after rollback')
    }
    finally {
        store.close()
    }

    const restored = await readDecoded(openStore, decode)
    if (sha256(restored.bytes) !== sha256(originalBytes)) {
        throw new Error('Reopened database does not match the rollback source')
    }
}

async function executeMigration({
    openStore,
    decode,
    encode,
    policy = FASTIMPORT_POLICY,
    apply = false,
    backupKey,
    confirmStopped = false,
}) {
    const original = await readDecoded(openStore, decode)
    if (original.quickCheck !== 'ok') throw new Error('SQLite quick_check failed before migration')
    const inspection = inspectDecodedDatabase(original.database, policy)
    const originalBlobSha256 = sha256(original.bytes)

    if (inspection.status === 'already-applied') {
        return {
            status: 'already-applied',
            wrote: false,
            pluginCount: inspection.pluginCount,
            scriptSha256: inspection.scriptSha256,
            databaseBlobSha256: originalBlobSha256,
            preservedDigest: inspection.preservedDigest,
        }
    }

    if (!apply) {
        return {
            status: 'ready',
            wrote: false,
            pluginCount: inspection.pluginCount,
            scriptSha256: inspection.scriptSha256,
            nextScriptSha256: inspection.nextScriptSha256,
            databaseBlobSha256: originalBlobSha256,
            preservedDigest: inspection.preservedDigest,
        }
    }

    if (!confirmStopped) {
        throw new Error('Apply requires --confirm-stopped after a process-first stop boundary')
    }
    if (typeof backupKey !== 'string' || !backupKey.startsWith('database/dbbackup-')) {
        throw new Error('Apply requires an explicit database/dbbackup-* backup key')
    }

    const patchedDatabase = buildPatchedDatabase(original.database, inspection)
    const patchedBytes = Buffer.from(await encode(patchedDatabase))
    const encodedReadback = await decode(patchedBytes)
    assertDatabasePreserved(original.database, encodedReadback, inspection.targetIndex)
    const encodedInspection = inspectDecodedDatabase(encodedReadback, policy)
    if (encodedInspection.status !== 'already-applied') {
        throw new Error('Encoded migration did not produce the known patched state')
    }

    let committed = false
    try {
        const writeStore = openStore({ readonly: false })
        try {
            writeStore.transaction(() => {
                const current = writeStore.read(DATABASE_KEY)
                if (!current || sha256(current) !== originalBlobSha256) {
                    throw new Error('Database changed after inspection; refusing to overwrite it')
                }
                if (writeStore.has(backupKey)) {
                    throw new Error(`Backup key already exists: ${backupKey}`)
                }
                writeStore.copy(DATABASE_KEY, backupKey)
                const backup = writeStore.read(backupKey)
                if (!backup || sha256(backup) !== originalBlobSha256) {
                    throw new Error('Backup readback does not match the original database blob')
                }
                writeStore.write(DATABASE_KEY, patchedBytes)
                const written = writeStore.read(DATABASE_KEY)
                if (!written || sha256(written) !== sha256(patchedBytes)) {
                    throw new Error('Written database blob failed byte readback')
                }
            })
            committed = true
            if (writeStore.quickCheck() !== 'ok') throw new Error('SQLite quick_check failed after migration')
        }
        finally {
            writeStore.close()
        }

        const reopened = await readDecoded(openStore, decode)
        if (reopened.quickCheck !== 'ok') throw new Error('SQLite quick_check failed after reopen')
        if (sha256(reopened.bytes) !== sha256(patchedBytes)) {
            throw new Error('Reopened database blob differs from the committed bytes')
        }
        assertDatabasePreserved(original.database, reopened.database, inspection.targetIndex)
        const reopenedInspection = inspectDecodedDatabase(reopened.database, policy)
        if (reopenedInspection.status !== 'already-applied') {
            throw new Error('Reopened database does not contain the known patched FastImport script')
        }
        return {
            status: 'applied',
            wrote: true,
            pluginCount: reopenedInspection.pluginCount,
            scriptSha256: reopenedInspection.scriptSha256,
            originalDatabaseBlobSha256: originalBlobSha256,
            databaseBlobSha256: sha256(reopened.bytes),
            backupKey,
            preservedDigest: reopenedInspection.preservedDigest,
        }
    }
    catch (error) {
        if (committed) {
            await restoreVerifiedBackup({
                openStore,
                decode,
                originalBytes: original.bytes,
                patchedBytes,
                backupKey,
            })
            error.restored = true
        }
        throw error
    }
}

function parseArguments(argv) {
    const parsed = { apply: false, confirmStopped: false }
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i]
        if (arg === '--apply') parsed.apply = true
        else if (arg === '--confirm-stopped') parsed.confirmStopped = true
        else if (arg === '--database') parsed.database = argv[++i]
        else if (arg === '--target-root') parsed.targetRoot = argv[++i]
        else if (arg === '--backup-key') parsed.backupKey = argv[++i]
        else if (arg === '--help' || arg === '-h') parsed.help = true
        else throw new Error(`Unknown argument: ${arg}`)
    }
    return parsed
}

function usage() {
    return [
        'Usage:',
        '  node scripts/fastimport-ios-migration.cjs --database PATH --target-root PATH',
        '  node scripts/fastimport-ios-migration.cjs --database PATH --target-root PATH --apply',
        '    --confirm-stopped --backup-key database/dbbackup-NAME.bin',
        '',
        'Default mode is read-only inspection. No live path is assumed.',
    ].join('\n')
}

function createRisuSaveCodecs({ Packr, Unpackr, fflate }) {
    const magicHeader = Buffer.from([0, 82, 73, 83, 85, 83, 65, 86, 69, 0, 7])
    const magicCompressedHeader = Buffer.from([0, 82, 73, 83, 85, 83, 65, 86, 69, 0, 8])
    const magicStreamCompressedHeader = Buffer.from([0, 82, 73, 83, 85, 83, 65, 86, 69, 0, 9])
    const blockHeader = Buffer.from('RISUSAVE\0')
    const packr = new Packr({ useRecords: false })
    const unpackr = new Unpackr({ int64AsType: 'number', useRecords: false })

    const startsWith = (bytes, header) => (
        bytes.length >= header.length
        && Buffer.from(bytes.subarray(0, header.length)).equals(header)
    )

    const decodeBlocks = (bytes) => {
        const database = {}
        let offset = blockHeader.length
        while (offset < bytes.length) {
            if (offset + 7 > bytes.length) throw new Error('Truncated RisuSave block header')
            const type = bytes[offset]
            const compressed = bytes[offset + 1] === 1
            const nameLength = bytes[offset + 2]
            offset += 3
            if (offset + nameLength + 4 > bytes.length) throw new Error('Truncated RisuSave block name')
            offset += nameLength
            const length = Buffer.from(bytes).readUInt32LE(offset)
            offset += 4
            if (offset + length > bytes.length) throw new Error('Truncated RisuSave block payload')
            let content = Buffer.from(bytes.subarray(offset, offset + length))
            offset += length
            if (compressed) content = Buffer.from(fflate.decompressSync(content))
            if (type === 6) {
                throw new Error('FastImport migration refuses RisuSave REMOTE blocks')
            }
            if (type === 0 || type === 3) continue
            const value = JSON.parse(content.toString('utf8'))
            if (type === 1) {
                for (const [key, entry] of Object.entries(value)) {
                    if (!key.startsWith('__') && !(key in database)) database[key] = entry
                }
            }
            else if (type === 2 || type === 7) {
                database.characters ??= []
                database.characters.push(value)
            }
            else if (type === 4) database.botPresets = value
            else if (type === 5) database.modules = value
            else if (type === 9) database.plugins = value
            else if (type === 10) database.loadouts = value
            else if (type === 11) database.pluginCustomStorage = value
            else if (type === 8) database[value.key] = value.data
        }
        database.characters ??= []
        return database
    }

    const decode = async (input) => {
        const bytes = Buffer.from(input)
        if (startsWith(bytes, magicHeader)) {
            return unpackr.decode(bytes.subarray(magicHeader.length))
        }
        if (startsWith(bytes, magicCompressedHeader)) {
            return unpackr.decode(fflate.decompressSync(bytes.subarray(magicCompressedHeader.length)))
        }
        if (startsWith(bytes, magicStreamCompressedHeader)) {
            return unpackr.decode(fflate.decompressSync(bytes.subarray(magicStreamCompressedHeader.length)))
        }
        if (startsWith(bytes, blockHeader)) return decodeBlocks(bytes)
        return unpackr.decode(bytes)
    }

    const encode = async (database) => {
        const packed = Buffer.from(packr.encode(database))
        return Buffer.concat([magicHeader, packed])
    }

    return { decode, encode }
}

function loadTargetRuntime(targetRoot) {
    const packagePath = path.join(targetRoot, 'package.json')
    if (!fs.existsSync(packagePath)) throw new Error(`Missing target package.json: ${packagePath}`)
    const targetRequire = createRequire(packagePath)
    const BetterSqlite3 = targetRequire('better-sqlite3')
    const { Packr, Unpackr } = targetRequire('msgpackr')
    const fflate = targetRequire('fflate')
    const chunkStoreModule = require(path.join(targetRoot, 'server/node/chunkStore.cjs'))
    const codecs = createRisuSaveCodecs({ Packr, Unpackr, fflate })
    return { BetterSqlite3, ...chunkStoreModule, ...codecs }
}

function createSqliteStoreFactory({ databasePath, targetRuntime }) {
    const { BetterSqlite3, CHUNK_MARKER, createChunkStore } = targetRuntime
    return ({ readonly }) => {
        const db = new BetterSqlite3(databasePath, { readonly, fileMustExist: true })
        const readRaw = (key) => {
            const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(key)
            if (!row) return null
            const value = Buffer.from(row.value)
            if (!value.equals(CHUNK_MARKER)) return value
            const chunks = db.prepare(
                `SELECT c.data FROM manifest_chunks m
                 JOIN chunks c ON c.hash = m.hash
                 WHERE m.manifest_key = ? ORDER BY m.seq`,
            ).all(key)
            return chunks.length > 0
                ? Buffer.concat(chunks.map(row => Buffer.from(row.data)))
                : value
        }
        const chunkStore = readonly ? null : createChunkStore(db)
        return {
            read: readonly ? readRaw : (key) => chunkStore.getValue(key),
            has: (key) => !!db.prepare('SELECT 1 FROM kv WHERE key = ?').get(key),
            copy: (source, destination) => {
                if (!chunkStore) throw new Error('Readonly store cannot copy values')
                chunkStore.snapshotValue(source, destination)
            },
            write: (key, value) => {
                if (!chunkStore) throw new Error('Readonly store cannot write values')
                chunkStore.putValue(key, Buffer.from(value))
            },
            transaction: (operation) => {
                if (readonly) throw new Error('Readonly store cannot open a write transaction')
                return db.transaction(operation)()
            },
            quickCheck: () => {
                const rows = db.pragma('quick_check')
                return rows.length === 1 ? rows[0].quick_check : JSON.stringify(rows)
            },
            close: () => db.close(),
        }
    }
}

async function main(argv = process.argv.slice(2)) {
    const args = parseArguments(argv)
    if (args.help) {
        console.log(usage())
        return
    }
    if (!args.database || !args.targetRoot) throw new Error(usage())
    const databasePath = path.resolve(args.database)
    const targetRoot = path.resolve(args.targetRoot)
    const targetRuntime = loadTargetRuntime(targetRoot)
    const openStore = createSqliteStoreFactory({ databasePath, targetRuntime })
    const result = await executeMigration({
        openStore,
        decode: targetRuntime.decode,
        encode: targetRuntime.encode,
        apply: args.apply,
        backupKey: args.backupKey,
        confirmStopped: args.confirmStopped,
    })
    console.log(JSON.stringify(result, null, 2))
}

if (require.main === module) {
    main().catch((error) => {
        console.error(JSON.stringify({
            error: error.message,
            restored: error.restored === true,
        }, null, 2))
        process.exitCode = 1
    })
}

module.exports = {
    DATABASE_KEY,
    FASTIMPORT_POLICY,
    OLD_CLIPBOARD_LINE,
    IOS_SAFE_CLIPBOARD_LINE,
    assertDatabasePreserved,
    buildPatchedDatabase,
    countOccurrences,
    createRisuSaveCodecs,
    executeMigration,
    inspectDecodedDatabase,
    preservedDatabaseDigest,
    sha256,
}
