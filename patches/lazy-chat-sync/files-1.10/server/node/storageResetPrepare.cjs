'use strict'

// Side-effect-free database preparation shared by the live decode path and
// restore preparation. Nothing in this module reads or writes KV, the
// filesystem, caches, timers or module state: every lookup goes through an
// injected reader and every generated id through an injected randomUUID.

const zlib = require('zlib')

class StoragePrepareError extends Error {
    constructor(code, message, options = {}) {
        super(message, options.cause === undefined ? undefined : { cause: options.cause })
        this.name = 'StoragePrepareError'
        this.code = code
        if (options.details !== undefined) this.details = options.details
    }
}

// ─── Chat identity and folder repairs ───────────────────────────────────────

// These helpers were moved from the non-strict server.cjs. A property write to
// a primitive entry (e.g. a string in `chats`) was silently ignored there but
// throws in strict mode, so writes go through this helper, which keeps the
// previous semantics: the id is still generated, nothing is assigned.
function assignChatId(chat, id) {
    if (chat !== null && (typeof chat === 'object' || typeof chat === 'function')) {
        chat.id = id
    }
}

function assignMissingChatIds(dbObj, randomUUID) {
    let changed = false
    if (!dbObj?.characters) return changed
    for (const char of dbObj.characters) {
        if (!char?.chats) continue
        for (const chat of char.chats) {
            if (!chat || chat._stub || chat.id) continue
            assignChatId(chat, randomUUID())
            changed = true
        }
    }
    return changed
}

// Recovers chats whose folderId points to a deleted folder. The previous merge
// layer silently kept stale folderId on disk when a user moved a chat out of a
// folder, then later deleting that folder produced orphans invisible in the
// sidebar (rendered into neither the no-folder section nor any folder section).
// Boot-time normalize so historical corruption self-heals; new corruption is
// blocked by the merge fix in mergeChatStubWithFullChat (server.cjs).
function normalizeOrphanFolderIds(dbObj) {
    let changed = false
    if (!dbObj?.characters) return changed
    for (const char of dbObj.characters) {
        if (!char?.chats) continue
        const validIds = new Set((char.chatFolders ?? []).map(f => f?.id).filter(Boolean))
        for (const chat of char.chats) {
            if (!chat) continue
            if (chat.folderId && !validIds.has(chat.folderId)) {
                chat.folderId = null
                changed = true
            }
        }
    }
    return changed
}

// ─── Stub conversion and chat payload map ───────────────────────────────────

/**
 * Convert a full chat to a stub (metadata only).
 *
 * Hybrid corruption guard: a chat carrying `_stub: true` AND a real `message`
 * array is the v1.4.x legacy hybrid pattern. The fast-path "if _stub return"
 * would propagate the corruption (server reassemble skips merge for _stub
 * chats with no fullChat lookup match). Treat hybrids as real chats and
 * collapse them to a real stub here.
 */
function chatToStub(chat) {
    if (!chat) return chat
    if (chat._stub && !Array.isArray(chat.message)) return chat
    const stub = {
        id: chat.id || '',
        name: chat.name ?? '',
        _stub: true,
    }
    // Preserve key presence even when the value is null/undefined so the
    // round-trip distinguishes "user cleared" from "field absent". See
    // mergeChatStubWithFullChat (server.cjs) — it relies on `in` semantics.
    if ('lastDate' in chat) stub.lastDate = chat.lastDate
    if ('folderId' in chat) stub.folderId = chat.folderId
    if ('modules' in chat) stub.modules = chat.modules
    return stub
}

// Returns a new object with every chat replaced by its stub; does not mutate input.
function stripChatsFromDb(dbObj) {
    if (!dbObj?.characters) return dbObj
    const stripped = { ...dbObj }
    stripped.characters = dbObj.characters.map(char => {
        if (!char?.chats) return char
        return { ...char, chats: char.chats.map(chatToStub) }
    })
    return stripped
}

// Builds Map<chaId, Map<chatId, chat>> of real chat payloads. Real stubs are
// skipped; hybrids have their `_stub` flag removed in place; chats without an
// id receive one in place.
function buildChatMap(dbObj, randomUUID) {
    const chatMap = new Map()
    if (!dbObj?.characters) return chatMap
    for (const char of dbObj.characters) {
        if (!char?.chaId || !char.chats) continue
        const charChats = new Map()
        for (const chat of char.chats) {
            if (!chat) continue
            const isStub = chat._stub === true
            const hasMessage = Array.isArray(chat.message)
            if (isStub && !hasMessage) continue
            if (isStub && hasMessage) {
                delete chat._stub
            }
            if (!chat.id) {
                assignChatId(chat, randomUUID())
            }
            charChats.set(chat.id, chat)
        }
        if (charChats.size > 0) {
            chatMap.set(char.chaId, charChats)
        }
    }
    return chatMap
}

// ─── REMOTE block inlining ──────────────────────────────────────────────────

function remoteEntryKey(name) {
    return `remotes/${name}.local.bin`
}

// Decodes `raw` resolving REMOTE blocks through `readEntry`, then re-encodes
// the result in the compressed legacy format. Unresolved names are reported,
// not thrown: the decoder drops a block whose resolver returns null.
async function inlineRemoteBlocks(raw, { decodeRisuSave, encodeRisuSaveLegacy, readEntry }) {
    const requested = []
    const unresolved = []
    const database = await decodeRisuSave(raw, {
        resolveRemote: async (name) => {
            requested.push(name)
            const value = readEntry(remoteEntryKey(name))
            if (!value) unresolved.push(name)
            return value || null
        },
    })
    const bytes = encodeRisuSaveLegacy(database, 'compression')
    return { database, bytes, requested, unresolved }
}

// ─── Cold storage ───────────────────────────────────────────────────────────

// Upstream (#1484) writes cold storage backup entries as flat
// coldstorage_<uuid>.json names; older backups and the runtime KV use
// coldstorage/<uuid>. Match upstream's UUID pattern for the flat form so
// ordinary assets that merely start with "coldstorage_" are not captured.
const COLD_STORAGE_FLAT_NAME_RE = /^coldstorage_([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})(?:\.json)?$/

function isInvalidBackupPathSegment(name) {
    return (
        !name ||
        name.includes('\0') ||
        name.includes('\\') ||
        name.startsWith('/') ||
        name.includes('../') ||
        name.includes('/..') ||
        name === '.' ||
        name === '..'
    )
}

function normalizeColdStorageStorageKey(nameOrKey) {
    let key = nameOrKey
    if (key.startsWith('coldstorage/')) {
        key = key.slice('coldstorage/'.length)
    } else {
        const flat = COLD_STORAGE_FLAT_NAME_RE.exec(key)
        if (flat) {
            key = flat[1]
        }
    }
    if (key.endsWith('.json')) {
        key = key.slice(0, -'.json'.length)
    }
    if (!key || key.includes('/') || isInvalidBackupPathSegment(key)) {
        throw new Error(`Invalid cold storage entry name: ${nameOrKey}`)
    }
    return `coldstorage/${key}`
}

// Staged cold-storage rows are accepted in both forms the backup import
// accepts: canonical gzip JSON and plain JSON.
function parseStagedColdStorageEntry(buffer, sourceLabel) {
    try {
        return JSON.parse(zlib.gunzipSync(buffer).toString('utf-8'))
    } catch (gzipError) {
        try {
            return JSON.parse(Buffer.from(buffer).toString('utf-8'))
        } catch (jsonError) {
            throw new Error(`[ColdStorage] failed to parse ${sourceLabel}: gzip=${gzipError.message}; json=${jsonError.message}`)
        }
    }
}

function restoreColdStorageCharacter(character, { readColdEntry, onError }) {
    if (!character?.coldstorage) return true
    const key = character.coldstorage
    const entry = readColdEntry(key)
    if (!entry) {
        onError(`[ColdStorage] character data not found for key: ${key}`)
        return false
    }
    try {
        const coldData = entry.coldData
        if (coldData?.character) {
            Object.assign(character, coldData.character)
            delete character.coldstorage
            delete character.coldStoragedChats
        } else {
            onError(`[ColdStorage] unexpected character cold data format for key: ${key}`)
            return false
        }
        return true
    } catch (err) {
        onError(`[ColdStorage] character restore failed for key ${key}:`, err.message)
        return false
    }
}

function promoteFailedColdStorageStub(char, randomUUID) {
    const coldKey = char.coldstorage
    // Fill in missing fields with safe defaults matching createBlankChar() in src/ts/characters.ts.
    // SYNC: if createBlankChar() defaults change, update this object to match.
    const defaults = {
        firstMessage: '', desc: '', notes: '', chatFolders: [],
        emotionImages: [], bias: [], viewScreen: 'none', globalLore: [],
        sdData: [
            ['always', 'solo, 1girl'], ['negative', ''],
            ["|character's appearance", ''], ['current situation', ''],
            ["$character's pose", ''], ["$character's emotion", ''],
            ['current location', ''],
        ],
        utilityBot: false, customscript: [], exampleMessage: '',
        creatorNotes: '', systemPrompt: '', postHistoryInstructions: '',
        alternateGreetings: [], tags: [], creator: '', characterVersion: '',
        personality: '', scenario: '',
        firstMsgIndex: -1,
        replaceGlobalNote: '', additionalText: '',
        triggerscript: [
            { comment: '', type: 'manual', conditions: [], effect: [{ type: 'v2Header', code: '', indent: 0 }] },
            { comment: 'New Event', type: 'manual', conditions: [], effect: [] },
        ],
    }
    for (const [key, value] of Object.entries(defaults)) {
        if (char[key] === undefined || char[key] === null) {
            char[key] = value
        }
    }
    // Force firstMsgIndex to -1 even if stub had 0 — prevents alternateGreetings[0] access on empty array
    char.firstMsgIndex = -1
    // Ensure chats array is valid
    if (!Array.isArray(char.chats) || char.chats.length === 0) {
        char.chats = [{
            id: randomUUID(),
            message: [],
            note: '',
            name: 'Chat 1',
            localLore: [],
        }]
    }
    // Leave recovery breadcrumb and remove cold storage markers
    char.desc = `[Cold storage restore failed. Original key: ${coldKey}]\n\n${char.desc || ''}`.trim()
    delete char.coldstorage
    delete char.coldStoragedChats
}

// Restores cold-storage characters in place. `readColdEntry(key)` returns
// `{ coldData }` or null; characters it cannot restore are promoted to safe
// blank characters.
function restoreColdStorageCharactersInDb(dbObj, { readColdEntry, randomUUID, onError }) {
    const result = { restored: 0, failed: 0, failedNames: [] }
    if (!Array.isArray(dbObj?.characters)) return result
    for (let i = 0; i < dbObj.characters.length; i++) {
        const char = dbObj.characters[i]
        if (!char?.coldstorage) continue
        if (restoreColdStorageCharacter(char, { readColdEntry, onError })) {
            result.restored++
        } else {
            result.failed++
            result.failedNames.push(char.name || `(index ${i})`)
            promoteFailedColdStorageStub(char, randomUUID)
        }
    }
    return result
}

// Applies the persistent repairs of a decoded, normalized database in the
// live order: missing chat ids, orphan folder ids, cold-storage characters.
function repairDecodedDatabase(dbObj, { randomUUID, readColdEntry, onError }) {
    let changed = false
    if (assignMissingChatIds(dbObj, randomUUID)) changed = true
    if (normalizeOrphanFolderIds(dbObj)) changed = true
    const coldStorage = restoreColdStorageCharactersInDb(dbObj, { readColdEntry, randomUUID, onError })
    if (coldStorage.restored > 0 || coldStorage.failed > 0) changed = true
    return { changed, coldStorage }
}

// ─── Restore preparation ────────────────────────────────────────────────────

function isDatabaseObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
}

async function decodeOrReject(decodeRisuSave, bytes, options) {
    try {
        return options === undefined
            ? await decodeRisuSave(bytes)
            : await decodeRisuSave(bytes, options)
    } catch (error) {
        throw new StoragePrepareError('DATABASE_UNDECODABLE', 'Database bytes could not be decoded', { cause: error })
    }
}

/**
 * Prepare a restored database from staged bytes without touching live storage.
 * `readEntry(kvKey)` is the only data access; it serves staged rows such as
 * `remotes/<id>.local.bin` and `coldstorage/<id>`.
 */
// input.unresolvedRemote: 'error' (default) rejects a REMOTE block readEntry
// cannot supply; 'drop' keeps the decoder's behaviour of dropping it with a
// warning, for restores whose live path never had those rows to resolve.
async function prepareRestoredDatabase(input, dependencies) {
    const { rawDatabase, readEntry, unresolvedRemote = 'error' } = input
    if (unresolvedRemote !== 'error' && unresolvedRemote !== 'drop') {
        throw new TypeError(`Unsupported unresolvedRemote option: ${unresolvedRemote}`)
    }
    const { decodeRisuSave, normalizeJSON, encodeRisuSaveLegacy, randomUUID, computeBufferEtag } = dependencies

    // Restores clear the REMOTE migration marker, so REMOTE blocks are always
    // inlined here exactly as migrateRemoteBlocksIfNeeded would inline them.
    let remote
    try {
        remote = await inlineRemoteBlocks(rawDatabase, { decodeRisuSave, encodeRisuSaveLegacy, readEntry })
    } catch (error) {
        if (error instanceof StoragePrepareError) throw error
        throw new StoragePrepareError('DATABASE_UNDECODABLE', 'Database bytes could not be decoded', { cause: error })
    }
    if (remote.unresolved.length > 0 && unresolvedRemote === 'error') {
        throw new StoragePrepareError(
            'REMOTE_UNRESOLVED',
            `REMOTE block(s) could not be resolved: ${remote.unresolved.join(', ')}`,
            { details: { unresolved: [...remote.unresolved] } },
        )
    }

    let databaseBytes = rawDatabase
    let changed = false
    let decoded = remote.database
    if (remote.requested.length > 0) {
        databaseBytes = Buffer.from(remote.bytes)
        changed = true
        decoded = await decodeOrReject(decodeRisuSave, databaseBytes)
    }
    if (!isDatabaseObject(decoded)) {
        throw new StoragePrepareError('DATABASE_UNDECODABLE', 'Decoded database is not an object')
    }

    const database = normalizeJSON(decoded)
    const repair = repairDecodedDatabase(database, {
        randomUUID,
        readColdEntry: (key) => {
            const storageKey = normalizeColdStorageStorageKey(key)
            const value = readEntry(storageKey)
            if (!value) return null
            return { coldData: parseStagedColdStorageEntry(value, storageKey) }
        },
        onError: () => {},
    })
    if (repair.changed) {
        databaseBytes = Buffer.from(encodeRisuSaveLegacy(database))
        changed = true
    }

    const chatMap = buildChatMap(database, randomUUID)
    const strippedDatabase = normalizeJSON(stripChatsFromDb(database))
    const strippedBytes = Buffer.from(encodeRisuSaveLegacy(strippedDatabase))
    const etag = computeBufferEtag(strippedBytes)

    return {
        databaseBytes,
        changed,
        // REMOTE blocks were present and the database was re-encoded inline.
        remoteBlocksInlined: remote.requested.length > 0,
        database,
        chatMap,
        strippedDatabase,
        strippedBytes,
        etag,
        coldStorage: {
            restored: repair.coldStorage.restored,
            failed: repair.coldStorage.failed,
            failedNames: [...repair.coldStorage.failedNames],
        },
    }
}

module.exports = {
    StoragePrepareError,
    COLD_STORAGE_FLAT_NAME_RE,
    assignMissingChatIds,
    normalizeOrphanFolderIds,
    chatToStub,
    stripChatsFromDb,
    buildChatMap,
    inlineRemoteBlocks,
    isInvalidBackupPathSegment,
    normalizeColdStorageStorageKey,
    restoreColdStorageCharactersInDb,
    repairDecodedDatabase,
    prepareRestoredDatabase,
}
