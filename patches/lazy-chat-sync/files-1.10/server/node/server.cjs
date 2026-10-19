const express = require('express');
const app = express();
const http = require('http');
const https = require('https');
const path = require('path');
const net = require('net');
const compression = require('compression');
const htmlparser = require('node-html-parser');
const { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } = require('fs');
const fs = require('fs/promises')
const nodeCrypto = require('crypto')
const zlib = require('zlib')
const rateLimit = require('express-rate-limit')
const { WebSocketServer } = require('ws')
const Vips = require('wasm-vips')
let _vipsPromise = null
const getVips = () => {
    if (!_vipsPromise) {
        _vipsPromise = Vips().catch(err => {
            _vipsPromise = null
            throw err
        })
    }
    return _vipsPromise
}
const { kvGet, kvSet, kvDel, kvList,
        kvDelPrefix, kvListWithSizes, kvSize, kvGetUpdatedAt, kvCopyValue, clearEntities, checkpointWal,
        gcChunks, reclaimableChunkBytes, isDbBlobChunked, snapshotFootprint, db: sqliteDb } = require('./db.cjs');
const {
    addLogBatch, queryLogs, clearLogs, countLogs,
    logger, installProcessHandlers, expressErrorMiddleware,
} = require('./logs.cjs');
const { createRequestLogs } = require('./request-logs.cjs');
const { applyPatch } = require('fast-json-patch');
const { decodeRisuSave, encodeRisuSaveLegacy, calculateHash, normalizeJSON, normalizeForwardHeaders, hasRemoteBlocks } = require('./utils.cjs');
const {
    chatRevision,
    evaluateChatRevisionPrecondition,
    evaluateFullChatWritePrecondition,
    applyChatDelta,
    canonicalizeStrippedDatabase,
    resolveChatReadTarget,
    validateStrippedDatabaseTransition,
} = require('./chatDelta.cjs');
const {
    DEFAULT_PREFIX: CHAT_WRITE_JOURNAL_PREFIX,
    commitSnapshotRestore,
    createChatWriteJournal,
} = require('./chatWriteJournal.cjs');
const storageResetPrepare = require('./storageResetPrepare.cjs');
const storageResetTestHooks = require('./storageResetTestHooks.cjs');
const { AsyncLocalStorage } = require('async_hooks');
const { spawn, execSync } = require('child_process');
const os = require('os');
const { Readable, Transform } = require('stream');

// Install process-level error handlers before any other init so early crashes get logged.
installProcessHandlers();

// Node.js version check
const [nodeMajor] = process.version.slice(1).split('.').map(Number);
if (nodeMajor < 24) {
    logger.warn(`[Server] Node.js ${process.version} is below the recommended version (v24.x). Consider upgrading for best compatibility.`);
}

// Configuration flags for patch-based sync
const enablePatchSync = true;

// In-memory database cache for patch-based sync
// dbCache stores the STRIPPED (stubs-only) version matching what the client sees.
// fullChatStore keeps the actual chat data keyed by chaId→chatId.
let dbCache = {};
let saveTimers = {};
const SAVE_INTERVAL = 5000;
const CHAT_DELTA_MAX_BYTES = 2 * 1024 * 1024;
let fullChatStore = null; // Map<chaId, Map<chatId, chatObject>> — lazy-initialized
let chatStoreInitPromise = null;
let chatStoreGeneration = 0;

const chatWriteJournal = createChatWriteJournal({
    kvGet,
    kvSet,
    kvDel,
    kvList,
    encode: encodeRisuSaveLegacy,
    decode: decodeRisuSave,
    onInvalid: (key, error) => {
        logger.warn(`[ChatJournal] Could not process ${key}:`, error?.message || error);
    },
    onBacklog: (stats) => {
        logger.warn(
            `[ChatJournal] Retained awaiting-metadata backlog: `
            + `${stats.awaitingRecords} record(s), ${stats.awaitingBytes} byte(s)`
        );
    },
    onPressure: (stats) => {
        logger.error(
            `[ChatJournal] Awaiting-metadata capacity reached; existing payloads retained. `
            + `records=${stats.awaitingRecords}/${stats.maxAwaitingRecords} `
            + `bytes=${stats.awaitingBytes}/${stats.maxAwaitingBytes}`
        );
    },
});

// ETag for database.bin
let dbEtag = null;
// Encoded stubs-only database sent to browsers. Keeping it alongside dbCache
// lets an unchanged reload return 304 without decoding the full on-disk DB.
let dbEncodedCache = null;

function computeBufferEtag(buffer) {
    return nodeCrypto.createHash('md5').update(buffer).digest('hex');
}

function computeDatabaseEtagFromObject(databaseObject) {
    return computeBufferEtag(Buffer.from(encodeRisuSaveLegacy(databaseObject)));
}

function quotedEtag(etag) {
    return `"${etag}"`;
}

function requestEtagMatches(header, etag, { allowWeak = true } = {}) {
    if (!header || !etag) return false;
    return String(header).split(',').some((candidate) => {
        const trimmed = candidate.trim();
        if (!allowWeak && /^W\//.test(trimmed)) return false;
        const normalized = trimmed.replace(/^W\//, '');
        return normalized === '*' || normalized === etag || normalized === quotedEtag(etag);
    });
}

function setRevisionHeaders(res, revision, legacyHeader) {
    if (!revision) return;
    res.setHeader('ETag', quotedEtag(revision));
    if (legacyHeader) res.setHeader(legacyHeader, revision);
}

// ─── Storage reset barrier state ────────────────────────────────────────────
// A storage reset (backup import, server restore) sets storageResetActive for
// its whole duration and bumps storageResetGeneration when it starts. Writer
// requests take the generation at admission; queued work whose admission
// predates a reset is refused instead of running against the restored data.
// storageRecoveryRequired is set only when a failed reset could not restore
// the previous inlay directory; it clears on process restart.
let storageResetActive = false;
let storageResetGeneration = 0;
let storageResetAttempt = 0;
let storageRecoveryRequired = null;
const storageAdmissionContext = new AsyncLocalStorage();

class StorageResetRefusal extends Error {
    constructor(payload, statusCode = 503) {
        super(payload.error);
        this.name = 'StorageResetRefusal';
        this.code = payload.code;
        this.statusCode = statusCode;
        this.payload = payload;
    }
}

// The existing answer for a reset that competes with another reset.
function storageResetBusyError() {
    return new StorageResetRefusal({ error: 'Another import is already in progress' }, 409);
}

function storageResetInProgressPayload() {
    return {
        error: 'Storage reset in progress',
        code: 'STORAGE_RESET_IN_PROGRESS',
        retryable: true,
    };
}

function storageRecoveryRequiredPayload() {
    return {
        error: 'Storage recovery required: a failed restore could not put the previous inlay directory back. '
            + `Restore it manually from ${storageRecoveryRequired?.recoveryPath} and restart the server.`,
        code: 'STORAGE_RECOVERY_REQUIRED',
        retryable: false,
        recoveryPath: storageRecoveryRequired?.recoveryPath,
    };
}

function storageResetErrorPayload(error) {
    return error instanceof StorageResetRefusal ? error.payload : null;
}

// Admission recorded by the reset refusal middleware for writer routes.
// Strict admissions (streaming responses) stay checked after headers are sent.
function staleStorageAdmissionPayload(admission) {
    if (storageRecoveryRequired) return storageRecoveryRequiredPayload();
    if (storageResetActive || admission.generation !== storageResetGeneration) {
        return storageResetInProgressPayload();
    }
    return null;
}

// Throws (and records on the admission) when the request was admitted before
// a reset started; the recorded refusal then replaces the route's answer.
function assertStorageAdmission(admission) {
    if (!admission.strict && admission.res.headersSent) return;
    const payload = staleStorageAdmissionPayload(admission);
    if (!payload) return;
    admission.refusal = payload;
    throw new StorageResetRefusal(payload);
}

let storageOperationQueue = Promise.resolve();
function queueStorageOperation(operation) {
    const admission = storageAdmissionContext.getStore();
    if (admission) {
        // Refuse a stale admission before it waits behind a reset in the queue.
        try {
            assertStorageAdmission(admission);
        } catch (error) {
            return Promise.reject(error);
        }
    }
    const run = admission
        ? () => {
            assertStorageAdmission(admission);
            return operation();
        }
        : operation;
    const operationRun = storageOperationQueue.then(run, run);
    storageOperationQueue = operationRun.catch(() => {});
    return operationRun;
}

const DB_HEX_KEY = Buffer.from('database/database.bin', 'utf-8').toString('hex');

function cacheStrippedDatabase(strippedDb, encoded = null) {
    const encodedBuffer = encoded
        ? Buffer.from(encoded)
        : Buffer.from(encodeRisuSaveLegacy(strippedDb));
    dbCache[DB_HEX_KEY] = strippedDb;
    dbEncodedCache = encodedBuffer;
    dbEtag = computeBufferEtag(encodedBuffer);
    return encodedBuffer;
}

function invalidateStrippedDatabaseCache() {
    delete dbCache[DB_HEX_KEY];
    dbEncodedCache = null;
    dbEtag = null;
}

// ─── Persist failure tracking (Stage 1 visibility) ───────────────────────────
// Debounced persist runs in setTimeout, so failures cannot be returned in the
// triggering response. Record the latest failure here and surface it on the
// next /api/patch response. Cleared on next successful persist.
let lastPersistFailure = null;

function recordPersistFailure(error, source) {
    const message = String(error?.message || error || 'unknown error');
    const attemptedSize = typeof error?.attemptedSize === 'number' ? error.attemptedSize : null;
    // Preserve timestamp when the failure is identical to the last one — every
    // debounce cycle re-records the same failure, and clients dedupe by ts.
    // Without this guard a fresh ts every 5s would re-fire the toast.
    if (lastPersistFailure
        && lastPersistFailure.source === source
        && lastPersistFailure.message === message
        && lastPersistFailure.attemptedSize === attemptedSize) {
        return;
    }
    lastPersistFailure = {
        timestamp: Date.now(),
        message,
        attemptedSize,
        source,
    };
}

function clearPersistFailure() {
    lastPersistFailure = null;
}

function currentPersistWarning() {
    return lastPersistFailure;
}

// ─── Server-side database backup (DB-only snapshots) ────────────────────────
//
// Snapshots live as `database/dbbackup-{ts}.bin` keys inside the kv table.
// They're created on every successful persist (with a cooldown) and rotated
// to fit user-configured count/size limits — see SNAPSHOT_LIMIT_* below.
const SNAPSHOT_LIMIT_COUNT_KEY = 'config/snapshot-max-count';
const SNAPSHOT_LIMIT_BYTES_KEY = 'config/snapshot-max-bytes';
const SNAPSHOT_LIMIT_DEFAULT_COUNT = 20;
const SNAPSHOT_LIMIT_DEFAULT_BYTES = 500 * 1024 * 1024; // 500 MB
// Safety bounds to keep a stray PUT from making the system unusable.
const SNAPSHOT_LIMIT_MIN_COUNT = 1;
const SNAPSHOT_LIMIT_MAX_COUNT = 100;
const SNAPSHOT_LIMIT_MIN_BYTES = 10 * 1024 * 1024;        // 10 MB
const SNAPSHOT_LIMIT_MAX_BYTES = 50 * 1024 * 1024 * 1024; // 50 GB
const BACKUP_INTERVAL_MS = process.env.POCKETRISU_BACKUP_INTERVAL_MS
    ? Number(process.env.POCKETRISU_BACKUP_INTERVAL_MS)
    : 5 * 60 * 1000; // 5 minutes (override for tests to force snapshot creation)
let lastBackupTime = null;

function readSnapshotConfigInt(key, fallback, min, max) {
    try {
        const raw = kvGet(key);
        if (!raw) return fallback;
        const n = parseInt(Buffer.from(raw).toString('utf-8').trim(), 10);
        if (!Number.isFinite(n)) return fallback;
        return Math.min(max, Math.max(min, n));
    } catch { return fallback; }
}

function getSnapshotLimits() {
    return {
        maxCount: readSnapshotConfigInt(
            SNAPSHOT_LIMIT_COUNT_KEY, SNAPSHOT_LIMIT_DEFAULT_COUNT,
            SNAPSHOT_LIMIT_MIN_COUNT, SNAPSHOT_LIMIT_MAX_COUNT,
        ),
        maxBytes: readSnapshotConfigInt(
            SNAPSHOT_LIMIT_BYTES_KEY, SNAPSHOT_LIMIT_DEFAULT_BYTES,
            SNAPSHOT_LIMIT_MIN_BYTES, SNAPSHOT_LIMIT_MAX_BYTES,
        ),
    };
}

// Walk newest → oldest; keep within both limits, delete the rest. The most
// recent snapshot is always kept (even if it alone exceeds the byte limit) so
// we never end up with zero backups after a config change.
function trimSnapshotsToLimits() {
    const { maxCount, maxBytes } = getSnapshotLimits();
    // Size each snapshot by its marginal disk cost (chunks not shared with the
    // live blob), not its logical size — chunked snapshots share chunks, so a
    // logical measure would over-trim ones that cost almost nothing on disk.
    const entries = kvList(DB_BACKUP_PREFIX)
        .map((key) => {
            const tsRaw = parseInt(key.slice(DB_BACKUP_PREFIX.length, -4), 10);
            return { key, size: snapshotFootprint(key), ts: Number.isFinite(tsRaw) ? tsRaw : 0 };
        })
        .sort((a, b) => b.ts - a.ts);

    let runningBytes = 0;
    const toDelete = [];
    for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const isFirst = i === 0;
        const fitsByCount = i < maxCount;
        const fitsByBytes = runningBytes + e.size <= maxBytes;
        if (isFirst || (fitsByCount && fitsByBytes)) {
            runningBytes += e.size;
        } else {
            toDelete.push(e.key);
        }
    }
    for (const key of toDelete) kvDel(key);
    return { kept: entries.length - toDelete.length, removed: toDelete.length };
}

// Current snapshot count + two totals:
//   bytes        — marginal disk cost (snapshotFootprint), the SAME measure the
//                  byte limit/trim uses, so the limit gauge matches what trimming
//                  sees. kvListWithSizes would report a chunked snapshot's marker.
//   logicalBytes — sum of each snapshot's full logical size (kvSize), i.e. what
//                  the snapshots would cost WITHOUT dedup. Drives the "saved by
//                  deduplication" figure; never used for trimming.
function snapshotUsage() {
    const keys = kvList(DB_BACKUP_PREFIX);
    let bytes = 0, logicalBytes = 0;
    for (const k of keys) {
        bytes += snapshotFootprint(k);
        logicalBytes += (kvSize(k) || 0);
    }
    return { count: keys.length, bytes, logicalBytes };
}

function createBackupAndRotate() {
    const now = Date.now();
    if (lastBackupTime && now - lastBackupTime < BACKUP_INTERVAL_MS) {
        return;
    }
    lastBackupTime = now;

    const backupKey = `${DB_BACKUP_PREFIX}${(now / 100).toFixed()}.bin`;
    kvCopyValue('database/database.bin', backupKey);
    trimSnapshotsToLimits();
}

async function flushPendingDb() {
    if (saveTimers[DB_HEX_KEY]) {
        clearTimeout(saveTimers[DB_HEX_KEY]);
        delete saveTimers[DB_HEX_KEY];
        await persistCurrentChatStore();
        createBackupAndRotate();
    }
}

function invalidateDbCache() {
    chatStoreGeneration += 1;
    invalidateStrippedDatabaseCache();
    fullChatStore = null;
    if (saveTimers[DB_HEX_KEY]) {
        clearTimeout(saveTimers[DB_HEX_KEY]);
        delete saveTimers[DB_HEX_KEY];
    }
}

// Installs a storageResetPrepare.prepareRestoredDatabase() result into the
// live caches synchronously, without replaying the chat write journal. The
// generation bump keeps an in-flight chat store initialization from replacing
// the installed map. Save timers are not touched (see the pending save
// helpers). No route uses this yet.
function installPreparedDatabaseCaches(prepared) {
    chatStoreGeneration += 1;
    dbCache[DB_HEX_KEY] = prepared.strippedDatabase;
    dbEncodedCache = Buffer.from(prepared.strippedBytes);
    dbEtag = prepared.etag;
    fullChatStore = prepared.chatMap;
}

// ─── Chat runtime lazy load helpers ─────────────────────────────────────────

// Missing chat ids, orphan folder ids (storageResetPrepare.normalizeOrphanFolderIds),
// cold storage restoration, stub conversion and the chat payload map are
// shared with restore preparation in storageResetPrepare.cjs; the wrappers
// here supply the live id generator, KV reader and logger.
function generateChatId() {
    return nodeCrypto.randomUUID();
}

async function decodeDatabaseWithPersistentChatIds(raw, options = {}) {
    const { createBackup = false, migrationResult = null } = options;
    // Convert legacy REMOTE-block layouts to inline format before decoding.
    // If migration ran it overwrote database.bin, so the caller's `raw` is
    // stale and we re-read from KV. Idempotent on the no-op path.
    const migration = await migrateRemoteBlocksIfNeeded();
    if (migration.ran) {
        const fresh = kvGet('database/database.bin');
        if (fresh) raw = fresh;
    }
    const dbObj = normalizeJSON(await decodeRisuSave(raw));

    // Missing chat ids and orphan folder ids are repaired first, then the
    // one-time cold storage migration restores upstream cold storage characters
    // to full characters. This runs when upstream data first enters NodeOnly
    // (backup import or save folder copy). After restore, the coldstorage field
    // is removed and the clean DB is persisted. Failed characters are promoted
    // to safe blank characters — their KV data is preserved for manual recovery.
    const repair = storageResetPrepare.repairDecodedDatabase(dbObj, liveColdStorageRepairOptions());
    const needsPersist = repair.changed;
    const coldRestoreResult = repair.coldStorage;
    if (coldRestoreResult.failed > 0) {
        logger.error(`[ColdStorage] ${coldRestoreResult.failed} character(s) could not be restored and were converted to safe blank characters. Cold storage KV data is preserved.`);
        for (const name of coldRestoreResult.failedNames) {
            logger.error(`[ColdStorage]   - "${name}"`);
        }
    }

    if (needsPersist) {
        kvSet('database/database.bin', Buffer.from(encodeRisuSaveLegacy(dbObj)));
        if (createBackup) {
            createBackupAndRotate();
        }
    }
    if (migrationResult) {
        migrationResult.coldStorageFailed = coldRestoreResult.failed;
    }
    return dbObj;
}

/**
 * Initialize fullChatStore from a decoded full database object.
 * Extracts all chat payloads into the store keyed by chaId → chatId.
 *
 * Hybrid corruption recovery: a chat with both `_stub: true` and a real
 * message array is treated as a real chat (its fullChat data is intact).
 * Strip the `_stub` flag in place so subsequent reassemble passes don't
 * reproduce the hybrid on disk.
 */
async function initChatStore(dbObj) {
    const generation = chatStoreGeneration;
    // Real stubs (no payload) are skipped — fullChatStore tracks payloads only.
    // Hybrids have the corrupt _stub flag stripped and keep the real chat.
    const nextChatStore = storageResetPrepare.buildChatMap(dbObj, generateChatId);
    // Replay durable, acknowledged chat writes after the database snapshot.
    // This includes a newly-created chat whose database stub has not arrived
    // yet and an existing chat whose debounced DB flush had not completed.
    await chatWriteJournal.restoreInto(nextChatStore);
    if (generation === chatStoreGeneration) fullChatStore = nextChatStore;
}

/**
 * Strip full chat data from a decoded database object, replacing with stubs.
 * Returns a new object — does not mutate input.
 */
function stripChatsFromDb(dbObj) {
    return storageResetPrepare.stripChatsFromDb(dbObj);
}

function hasFullChatPayload(chaId, chatId) {
    const fullChat = fullChatStore?.get(chaId)?.get(chatId);
    return !!fullChat && Array.isArray(fullChat.message);
}

/**
 * Reassemble a full database from a stripped DB + fullChatStore.
 * Replaces stubs with full chats from the store. Returns a new object.
 */
function mergeChatStubWithFullChat(stub, fullChat) {
    if (!fullChat) {
        return stub;
    }
    if (!stub || !stub._stub) {
        return fullChat;
    }
    const merged = {
        ...fullChat,
        id: stub.id || fullChat.id || '',
        name: stub.name,
    };
    // Defensive: never let `_stub: true` ride along on a merged chat. If
    // fullChat carries a stale flag (legacy disk corruption), the spread
    // would propagate the hybrid pattern back to disk and re-trigger the
    // chat-data loss path on next round-trip.
    if ('_stub' in merged) delete merged._stub;
    // Use key presence (`in`) so an explicit null/undefined from the client —
    // meaning "user cleared this field" — overwrites fullChat. The previous
    // `!= null` check conflated "cleared" with "absent" and silently kept
    // stale folderId / modules on disk, producing orphan-folder chats.
    if ('lastDate' in stub) merged.lastDate = stub.lastDate;
    if ('folderId' in stub) merged.folderId = stub.folderId;
    if ('modules' in stub) merged.modules = stub.modules;
    return merged;
}

function reassembleFullDb(strippedDb) {
    if (!strippedDb?.characters || !fullChatStore) return strippedDb;
    const full = { ...strippedDb };
    full.characters = strippedDb.characters.map(char => {
        if (!char?.chaId || !char.chats) return char;
        const charChats = fullChatStore.get(char.chaId);
        if (!charChats) return char;
        return {
            ...char,
            chats: char.chats.map(chat => {
                if (chat && chat._stub && chat.id) {
                    return mergeChatStubWithFullChat(chat, charChats.get(chat.id));
                }
                return chat;
            }),
        };
    });
    return full;
}

// ─── Remote-block migration ─────────────────────────────────────────────────
//
// Background: upstream RisuAI (and very early NodeOnly versions) split each
// character's data out of database.bin into a separate `remotes/<chaId>.local.bin`
// file. The main database.bin then carries a REMOTE pointer block instead of the
// character payload. The server-side RisuSaveDecoder used to skip those blocks
// outright, so any decode pass — /api/read, /api/chat-content fallback, chat
// store init — saw the character as missing and lost its chats.
//
// NodeOnly never wanted this split (`disableRemoteSaving` is hardcoded to
// true), so we one-shot convert any leftover REMOTE blocks to inline raw blocks
// the first time a server with such data boots. The reencoded database.bin is
// stored in legacy msgpack format, which has no block structure at all — so
// the REMOTE code path becomes unreachable for future decodes.
//
// Idempotent via a KV marker. The marker lives in KV (not on disk) so a backup
// import — which wipes most KV prefixes and INSERTs a new database.bin — naturally
// clears it, letting the new contents be re-evaluated.

const REMOTE_MIGRATION_MARKER_KEY = 'migration/disable-remote-saving';
const REMOTE_MIGRATION_MARKER_VALUE = Buffer.from('done', 'utf-8');

function isRemoteMigrationDone() {
    const value = kvGet(REMOTE_MIGRATION_MARKER_KEY);
    return value !== null && value.length > 0;
}

function markRemoteMigrationDone() {
    kvSet(REMOTE_MIGRATION_MARKER_KEY, REMOTE_MIGRATION_MARKER_VALUE);
}

// ─── Storage epoch ──────────────────────────────────────────────────────────
// A persisted counter that every storage reset advances inside its own
// transaction (absent = 0). Background operations record the epoch they
// started in; a commit from an older epoch is refused. The value is a decimal
// non-negative integer.
const STORAGE_EPOCH_KEY = 'internal/storage-epoch/v1';

function parseStorageEpoch(raw) {
    if (raw === null || raw === undefined) return 0;
    const text = Buffer.from(raw).toString('utf-8');
    const epoch = /^(0|[1-9][0-9]*)$/.test(text) ? Number(text) : NaN;
    if (!Number.isSafeInteger(epoch)) {
        throw new Error('Stored storage epoch is invalid');
    }
    return epoch;
}

// Throws when the stored value is malformed; it is never treated as 0.
function readStorageEpoch() {
    return parseStorageEpoch(kvGet(STORAGE_EPOCH_KEY));
}

// Called inside a reset transaction after the restored rows are applied.
// `before` is the epoch read before the reset's first destructive write. An
// epoch row carried by the restored data only raises the next value; a
// malformed one fails the reset (the transaction rolls back).
function advanceStorageEpoch(before, reset) {
    const restored = readStorageEpoch();
    const next = Math.max(before, restored) + 1;
    if (!Number.isSafeInteger(next)) throw new Error('Storage epoch is exhausted');
    kvSet(STORAGE_EPOCH_KEY, Buffer.from(String(next), 'utf-8'));
    storageResetTestHooks.failpoint('after-storage-epoch-write', reset.attempt);
    return next;
}

/**
 * Convert any leftover REMOTE blocks in database.bin into inline raw blocks.
 * Safe to call repeatedly: idempotent via KV marker.
 */
async function migrateRemoteBlocksIfNeeded() {
    if (isRemoteMigrationDone()) return { ran: false, reason: 'already-done' };

    const raw = kvGet('database/database.bin');
    if (!raw) {
        markRemoteMigrationDone();
        return { ran: false, reason: 'no-database' };
    }

    if (!hasRemoteBlocks(raw)) {
        markRemoteMigrationDone();
        return { ran: false, reason: 'no-remote-blocks' };
    }

    logger.info('[Migration] REMOTE blocks detected in database.bin; converting to inline format');

    // Pre-migration backup so a botched migration can be rolled back manually.
    // Use a dedicated prefix — `database/dbbackup-` is on a 20-snapshot rotation
    // whose timestamp parser would assign this entry ts=0 (because of the
    // non-numeric suffix), making it the first to evict. The migration safety
    // net must outlive ordinary backup churn.
    const backupKey = `migration-backup/pre-remote-fix-${Date.now()}.bin`;
    kvCopyValue('database/database.bin', backupKey);

    // Unresolved REMOTE blocks are dropped by the decoder (it logs a warning).
    const { database: dbObj, bytes: reEncoded } = await storageResetPrepare.inlineRemoteBlocks(raw, {
        decodeRisuSave,
        encodeRisuSaveLegacy,
        readEntry: kvGet,
    });

    // Single transaction so swap + marker move together.
    // remotes/ files are intentionally NOT deleted here: pre-migration
    // dbbackup-* snapshots and the migration-backup we just wrote both
    // only carry database.bin (kvCopyValue is single-key). If a user later
    // restores one of those snapshots — which holds REMOTE pointers —
    // resolveRemote needs the remotes/<id>.local.bin payloads to still
    // exist, otherwise every REMOTE-pointed character drops on the next
    // decode and the backup is effectively dead. The orphans don't grow
    // (NodeOnly's disableRemoteSaving = true on writes), so leaving them
    // costs a few MB of disk for full backup recoverability.
    sqliteDb.transaction(() => {
        kvSet('database/database.bin', Buffer.from(reEncoded));
        markRemoteMigrationDone();
    })();

    // Reset in-memory caches whose contents were derived from the pre-migration
    // bytes — next reader recomputes from the migrated database.bin.
    invalidateDbCache();

    const characterCount = Array.isArray(dbObj.characters) ? dbObj.characters.length : 0;
    logger.info(`[Migration] Remote-block migration complete. Inlined ${characterCount} character(s); pre-migration backup at ${backupKey}`);
    return { ran: true, characterCount, backupKey };
}

/**
 * Ensure fullChatStore is initialized. Loads from disk if needed.
 */
async function ensureChatStore() {
    while (!fullChatStore) {
        if (!chatStoreInitPromise) {
            const generation = chatStoreGeneration;
            chatStoreInitPromise = (async () => {
    // Run remote-block migration first so the decode below sees an inline DB.
    // Idempotent — skipped on every subsequent call.
                await migrateRemoteBlocksIfNeeded();
                const raw = kvGet('database/database.bin');
                if (!raw) {
                    const emptyStore = new Map();
                    await chatWriteJournal.restoreInto(emptyStore);
                    if (generation === chatStoreGeneration) fullChatStore = emptyStore;
                    return;
                }
                const dbObj = await decodeDatabaseWithPersistentChatIds(raw, {
                    createBackup: true,
                });
                if (generation === chatStoreGeneration) {
                    await initChatStore(dbObj);
                }
            })();
        }
        const pending = chatStoreInitPromise;
        try {
            await pending;
        } finally {
            if (chatStoreInitPromise === pending) chatStoreInitPromise = null;
        }
    }
}

// Stub metadata fields a JSON Patch may legitimately touch on a `chats[i]`
// entry. Anything else is a chat-internal field — those live in fullChatStore,
// not in dbCache, and should never appear in a /api/patch payload. Keep in
// sync with chatToStub on both server and client.
const STUB_METADATA_FIELDS = new Set(['id', 'name', '_stub', 'lastDate', 'folderId', 'modules']);

// Only add/replace/remove are produced by the legitimate patcher. move/copy
// could alias _stub or other chat-internal fields through `from`, bypassing
// the path-based field allowlist. Reject those op types outright on chat
// paths. test ops can also reveal/manipulate state; deny for symmetry.
const ALLOWED_CHAT_OP_TYPES = new Set(['add', 'replace', 'remove']);

const CHAT_FIELD_PATH_RE = /^\/characters\/\d+\/chats\/\d+\/([^/]+)/;

/**
 * Detect JSON Patch ops that mutate chat-internal fields (anything beyond
 * STUB_METADATA_FIELDS). Such ops are the loss vector: applying them to
 * dbCache leaves a metadata-only chat without `_stub`, which then bypasses
 * fullChat merge in reassembleFullDb and gets persisted as-is.
 *
 * Whole-chat ops (path = `/characters/N/chats/M` or `/characters/N/chats`)
 * are allowed — those replace/add/remove chat slots wholesale and the
 * reassemble guard takes care of validating the resulting state.
 *
 * The `_stub` field gets stricter treatment than other allowed fields: only
 * `add`/`replace` with literal value `true` is permitted. Any op that could
 * remove the flag or set it to a falsy value is itself the loss mechanism
 * (reassembleFullDb skips merge when `_stub` is falsy), so it must be
 * blocked at the patch boundary, not just at the persist boundary.
 *
 * `move`/`copy` ops are rejected wholesale on chat-internal paths because
 * the field-name allowlist on `path` alone can't catch a `from` that points
 * at `_stub` or another chat-internal field. Both `path` and `from` are
 * checked when present.
 */
function findChatInternalFieldOps(patch) {
    if (!Array.isArray(patch)) return [];
    const violations = [];
    for (const op of patch) {
        if (!op || typeof op !== 'object' || typeof op.path !== 'string') continue;

        const pathMatch = op.path.match(CHAT_FIELD_PATH_RE);
        const fromMatch = typeof op.from === 'string' ? op.from.match(CHAT_FIELD_PATH_RE) : null;
        if (!pathMatch && !fromMatch) continue;

        if (!ALLOWED_CHAT_OP_TYPES.has(op.op)) {
            violations.push({
                op: op.op,
                path: op.path,
                field: (pathMatch && pathMatch[1]) || (fromMatch && fromMatch[1]) || '',
                reason: 'disallowed op type on chat field',
            });
            continue;
        }

        if (pathMatch) {
            const field = pathMatch[1];
            if (!STUB_METADATA_FIELDS.has(field)) {
                violations.push({ op: op.op, path: op.path, field });
                continue;
            }
            if (field === '_stub') {
                if (op.op === 'remove') {
                    violations.push({ op: op.op, path: op.path, field, reason: 'remove _stub' });
                } else if ((op.op === 'add' || op.op === 'replace') && op.value !== true) {
                    violations.push({ op: op.op, path: op.path, field, reason: 'non-true _stub value' });
                }
            }
        }
    }
    return violations;
}

/**
 * Detect chats that lost their `_stub` flag without being upgraded to a real
 * Chat. reassembleFullDb skips merge when `_stub` is falsy, so persisting such
 * a chat would write metadata-only to disk and silently strip messages — the
 * exact data-loss path reported with PATCH `remove /chats/N/{message,...}` ops.
 *
 * A real Chat has `message` (Array). A real stub has `_stub === true`. Anything
 * with neither is a malformed in-between state; treat as a corruption signal.
 */
function findStubFlagLossChats(fullDb) {
    if (!fullDb?.characters) return [];
    const losses = [];
    for (let ci = 0; ci < fullDb.characters.length; ci++) {
        const char = fullDb.characters[ci];
        if (!char?.chats) continue;
        for (let chi = 0; chi < char.chats.length; chi++) {
            const chat = char.chats[chi];
            if (!chat || typeof chat !== 'object') continue;
            const isStub = chat._stub === true;
            const hasMessage = Array.isArray(chat.message);
            if (!isStub && !hasMessage) {
                losses.push({
                    chaId: char.chaId,
                    charIndex: ci,
                    chatIndex: chi,
                    chatId: chat.id || null,
                });
            }
        }
    }
    return losses;
}

/**
 * Persist dbCache to disk with full chats merged back in.
 */
async function persistDbCacheWithChats(filePath, decodedKey) {
    const strippedDb = dbCache[filePath];
    if (!strippedDb) return;
    await ensureChatStore();
    const fullDb = reassembleFullDb(strippedDb);

    // Disk protection guard: abort persist when reassemble produced metadata-only
    // chats. Writing them would lock the loss in (next /api/read returns the
    // stripped chat with no `_stub`, so hydration never re-merges fullChatStore).
    // Invalidate dbCache so the next request re-reads from disk and rebuilds a
    // consistent stub view; client receives 409 on next /api/patch via hash mismatch.
    if (decodedKey === 'database/database.bin') {
        const losses = findStubFlagLossChats(fullDb);
        if (losses.length > 0) {
            const sample = losses.slice(0, 3).map(l => `${l.chaId}/${l.chatId ?? l.chatIndex}`).join(', ');
            const err = new Error(
                `persist aborted: ${losses.length} chat(s) lost _stub flag without upgrade — `
                + `would silently strip messages on disk. sample=[${sample}]`
            );
            recordPersistFailure(err, 'persistDbCacheWithChats:stub-flag-loss');
            invalidateStrippedDatabaseCache();
            throw err;
        }
    }

    const data = Buffer.from(encodeRisuSaveLegacy(fullDb));
    try {
        kvSet(decodedKey, data);
    } catch (err) {
        // Tag with BLOB size so the visibility layer can surface it to the user.
        // The dominant failure mode (better-sqlite3 INT_MAX) is size-driven.
        if (err && typeof err === 'object') {
            try { err.attemptedSize = data.length; } catch {}
        }
        throw err;
    }
    if (decodedKey === 'database/database.bin') {
        // The database is durable now. Existing-chat journal entries and new
        // chats whose stubs are present can be retired; a new chat still
        // waiting for its stub remains replayable across flushes/restarts.
        await chatWriteJournal.clearAfterDatabasePersist(strippedDb);
    }
    // Refresh fullChatStore from the persisted snapshot so subsequent
    // /api/chat-content GETs return the same metadata (folderId, modules)
    // that just hit disk. Without this, PATCH-only clears of stub fields
    // leave fullChatStore holding stale fullChat objects, and hydration
    // would resurrect the cleared values until the next /api/read.
    if (decodedKey === 'database/database.bin') {
        await initChatStore(fullDb);
    }
}

async function persistCurrentChatStore() {
    if (!dbCache[DB_HEX_KEY]) {
        const raw = kvGet('database/database.bin');
        if (!raw) return;
        const dbObj = normalizeJSON(await decodeRisuSave(raw));
        cacheStrippedDatabase(normalizeJSON(stripChatsFromDb(dbObj)));
    }
    await persistDbCacheWithChats(DB_HEX_KEY, 'database/database.bin');
}

// What each armed saveTimers entry persists, so a pending save can be re-armed
// with the same callback. Only entries whose key is currently in saveTimers
// are meaningful; scheduling overwrites the target for that key.
const saveTimerTargets = new Map();

function scheduleChatStorePersist() {
    saveTimerTargets.set(DB_HEX_KEY, { kind: 'chat-content' });
    if (saveTimers[DB_HEX_KEY]) clearTimeout(saveTimers[DB_HEX_KEY]);
    const timer = setTimeout(() => {
        void queueStorageOperation(async () => {
            // A read/flush may have drained this timer while its callback was
            // waiting for the storage queue. Do not persist a stale generation.
            if (saveTimers[DB_HEX_KEY] !== timer) return;
            try {
                await persistCurrentChatStore();
                clearPersistFailure();
                try {
                    createBackupAndRotate();
                } catch (backupErr) {
                    logger.warn('[ChatContent] Backup rotation failed:', backupErr);
                }
            } catch (error) {
                logger.error('[ChatContent] Error persisting chat:', error);
                recordPersistFailure(error, 'chat-content');
            } finally {
                if (saveTimers[DB_HEX_KEY] === timer) delete saveTimers[DB_HEX_KEY];
            }
        }).catch((error) => {
            logger.error('[ChatContent] Storage queue failed:', error);
            recordPersistFailure(error, 'chat-content');
        });
    }, SAVE_INTERVAL);
    saveTimers[DB_HEX_KEY] = timer;
}

// Debounced save of a patched cache entry. Database.bin entries merge full
// chats back in; other keys store the cached document as-is.
function schedulePatchSave(cacheKey, decodedKey) {
    saveTimerTargets.set(cacheKey, { kind: 'patch', decodedKey });
    if (saveTimers[cacheKey]) {
        clearTimeout(saveTimers[cacheKey]);
    }
    const patchSaveTimer = setTimeout(() => {
        void queueStorageOperation(async () => {
            if (saveTimers[cacheKey] !== patchSaveTimer) return;
            try {
                if (decodedKey === 'database/database.bin') {
                    await persistDbCacheWithChats(cacheKey, decodedKey);
                } else {
                    const data = Buffer.from(encodeRisuSaveLegacy(dbCache[cacheKey]));
                    try {
                        kvSet(decodedKey, data);
                    } catch (err) {
                        if (err && typeof err === 'object') {
                            try { err.attemptedSize = data.length; } catch {}
                        }
                        throw err;
                    }
                }
                // Persist succeeded — clear before backup so a backup-only
                // failure isn't attributed to data loss.
                clearPersistFailure();
                if (decodedKey === 'database/database.bin') {
                    try {
                        createBackupAndRotate();
                    } catch (backupErr) {
                        logger.warn(`[Patch] Backup rotation failed for ${decodedKey}:`, backupErr);
                    }
                }
            } catch (error) {
                logger.error(`[Patch] Error saving ${decodedKey}:`, error);
                recordPersistFailure(error, `patch:${decodedKey}`);
            } finally {
                if (saveTimers[cacheKey] === patchSaveTimer) delete saveTimers[cacheKey];
            }
        }).catch((error) => {
            logger.error(`[Patch] Storage queue failed for ${decodedKey}:`, error);
            recordPersistFailure(error, `patch:${decodedKey}`);
        });
    }, SAVE_INTERVAL);
    saveTimers[cacheKey] = patchSaveTimer;
}

// ─── Pending save handover for storage resets (no route uses these yet) ─────
//
// recordPendingSaves() captures every armed save timer (database.bin and other
// /api/patch keys) with what is needed to re-arm it. persistPendingSaves()
// force-persists the current cached state of those keys — unlike plain
// flushPendingDb() it does not depend on a database timer being armed.
// disarmPendingSaves() clears and deletes the recorded timers (queued
// callbacks check timer identity and then skip). rearmPendingSaves()
// re-schedules exactly the recorded keys. Callers run inside the storage queue.

function recordPendingSaves() {
    const records = [];
    for (const cacheKey of Object.keys(saveTimers)) {
        const timer = saveTimers[cacheKey];
        if (!timer) continue;
        const target = saveTimerTargets.get(cacheKey)
            ?? (cacheKey === DB_HEX_KEY
                ? { kind: 'chat-content' }
                : { kind: 'patch', decodedKey: Buffer.from(cacheKey, 'hex').toString('utf-8') });
        records.push({ cacheKey, timer, ...target });
    }
    return records;
}

async function persistPendingSaves(records) {
    for (const record of records) {
        if (record.cacheKey === DB_HEX_KEY) {
            await persistCurrentChatStore();
            continue;
        }
        const document = dbCache[record.cacheKey];
        // An invalidated entry has nothing newer than KV to persist.
        if (document === undefined) continue;
        const data = Buffer.from(encodeRisuSaveLegacy(document));
        try {
            kvSet(record.decodedKey, data);
        } catch (err) {
            if (err && typeof err === 'object') {
                try { err.attemptedSize = data.length; } catch {}
            }
            throw err;
        }
    }
}

function disarmPendingSaves(records) {
    for (const record of records) {
        // A timer re-armed after recording belongs to a newer write; keep it.
        if (saveTimers[record.cacheKey] !== record.timer) continue;
        clearTimeout(record.timer);
        delete saveTimers[record.cacheKey];
    }
}

function rearmPendingSaves(records) {
    for (const record of records) {
        if (saveTimers[record.cacheKey]) continue;
        if (record.kind === 'chat-content') {
            scheduleChatStorePersist();
        } else if (record.cacheKey === DB_HEX_KEY || dbCache[record.cacheKey] !== undefined) {
            // Invalidated non-database entries reload from KV on next access.
            schedulePatchSave(record.cacheKey, record.decodedKey);
        }
    }
}

function shouldCompress(req, res) {
    // Proxy/hub-proxy: pass through external responses without compression.
    // Original upstream server has no compression middleware at all,
    // so proxy responses were never compressed in the first place.
    const url = req.originalUrl || req.url;
    if (url.startsWith('/proxy') || url.startsWith('/hub-proxy') || url.startsWith('/api/backup/export') || url.startsWith('/api/backup/server/download/')) {
        return false;
    }

    const contentType = String(res.getHeader('Content-Type') || '').toLowerCase();
    if (contentType.includes('text/event-stream')) {
        return false;
    }
    // NDJSON endpoints (backup import/restore, inlay bulk compression) emit
    // small per-line events and rely on real-time flushes — keepalive
    // heartbeats in particular must reach reverse proxies before their
    // response timeout fires. gzip would buffer those lines until enough
    // bytes accumulated for an efficient compression block, defeating the
    // 502-avoidance the streaming endpoints were built for. compressible's
    // mime-db happens not to list application/x-ndjson today (so this is
    // a no-op in practice) but a future dep upgrade could flip it on.
    if (contentType.includes('application/x-ndjson')) {
        return false;
    }
    // Already-compressed media formats: gzip adds CPU cost with ~0% size gain
    if (contentType.startsWith('image/') || contentType.startsWith('video/') || contentType.startsWith('audio/')) {
        return false;
    }
    if (contentType.includes('application/octet-stream')) {
        return true;
    }
    return compression.filter(req, res);
}

app.use(compression({
    filter: shouldCompress,
}));
// Vite 산출물은 해시 파일명이므로 /assets는 장기 캐시 안전
app.use('/assets', express.static(path.join(process.cwd(), 'dist/assets'), {
    maxAge: '1y',
    immutable: true,
}));
app.use(express.static(path.join(process.cwd(), 'dist'), {index: false, maxAge: 0}));
// ─── Storage reset refusal (before body parsers) ────────────────────────────
// Writers get a fast retryable 503 while a storage reset runs, without waiting
// for their bodies; other resets get the existing 409. Every route admitted
// here records the reset generation so its queued work can be refused if a
// reset started in between. Express route matching: case-insensitive, optional
// trailing slash, HEAD for GET routes.
const STORAGE_RESET_WRITER_ROUTES = [
    ['post', '/api/chat-content/:chaId/:chatIndex/patch', 'chat-content-delta'],
    ['post', '/api/chat-content/:chaId/:chatIndex', 'chat-content'],
    ['post', '/api/patch', 'patch'],
    ['post', '/api/write', 'write'],
    ['get', '/api/remove', 'remove'],
    ['post', '/api/assets/bulk-write', 'assets-bulk-write'],
    ['post', '/api/bg-stream-draft', 'bg-stream-draft'],
    ['post', '/api/bg-stream-draft/delete', 'bg-stream-draft-delete'],
    ['post', '/api/bg-orchestrate', 'bg-orchestrate'],
    ['post', '/api/bg-orchestrate-input/:action(claim|attach|abandon)', 'bg-orchestrate-input'],
    ['delete', '/api/bg-orchestrate/:operationId', 'bg-orchestrate-delete'],
    ['delete', '/api/bg-orchestrate-result/:operationId/:resultId', 'bg-orchestrate-result-delete'],
    ['delete', '/api/bg-orchestrate-result/:charId/:chatId/:resultId', 'bg-orchestrate-result-delete'],
    ['post', '/api/bg-sub-result/:jobId/ack', 'bg-sub-result-ack'],
    ['post', '/api/bg-notifications/claim', 'bg-notifications-claim'],
    ['post', '/api/bg-notifications/ack', 'bg-notifications-ack'],
    ['post', '/api/db/flush', 'db-flush'],
    ['post', '/api/db/assets/purge-orphans', 'db-purge-orphans'],
    ['post', '/api/db/optimize', 'db-optimize'],
    ['post', '/api/db/wal-checkpoint', 'db-wal-checkpoint'],
    ['delete', '/api/db/snapshots', 'db-snapshot-delete'],
    ['delete', '/api/backup/server/:filename', 'backup-delete'],
    ['post', '/api/inlays/compress', 'inlays-compress', { strict: true }],
];
const STORAGE_RESET_COMPETING_ROUTES = [
    ['post', '/api/backup/import/prepare'],
    ['post', '/api/backup/import'],
    ['post', '/api/backup/server/restore'],
    ['post', '/api/migrate/save-folder/execute'],
    ['post', '/api/migrate/save-folder/upload'],
    ['post', '/api/db/snapshots/restore'],
];

function sendStorageResetRefusal(res, payload = storageResetInProgressPayload()) {
    res.status(503).json(payload);
}

function sendCompetingStorageReset(res) {
    if (storageRecoveryRequired) return sendStorageResetRefusal(res, storageRecoveryRequiredPayload());
    res.status(409).json({ error: 'Another import is already in progress' });
}

function isDatabaseRemoveRequest(req) {
    const filePath = req.headers['file-path'];
    return typeof filePath === 'string'
        && /^[0-9a-f]+$/i.test(filePath)
        && Buffer.from(filePath, 'hex').toString('utf-8') === 'database/database.bin';
}

// Once a queued storage operation of this request was refused, whatever the
// route answers afterwards (its own error mapping included) is replaced by
// the refusal's 503 payload. Responses already started are left alone.
function answerStorageRefusalsFor(admission) {
    const { res } = admission;
    const json = res.json.bind(res);
    const send = res.send.bind(res);
    const end = res.end.bind(res);
    let replacing = false;
    const replace = () => {
        replacing = true;
        res.status(503);
        return json(admission.refusal);
    };
    const shouldReplace = () => admission.refusal && !replacing && !res.headersSent;
    res.json = (body) => (shouldReplace() ? replace() : json(body));
    res.send = (body) => (shouldReplace() ? replace() : send(body));
    res.end = (...args) => (shouldReplace() ? replace() : end(...args));
}

const storageResetRefusalRouter = express.Router();
for (const [method, route, kind, options = {}] of STORAGE_RESET_WRITER_ROUTES) {
    storageResetRefusalRouter[method](route, async (req, res, next) => {
        try {
            if (kind === 'remove' && isDatabaseRemoveRequest(req)) {
                // Removing database.bin is itself a reset, not an admitted writer.
                if (storageRecoveryRequired || storageResetActive) return sendCompetingStorageReset(res);
                return next();
            }
            if (storageRecoveryRequired) return sendStorageResetRefusal(res, storageRecoveryRequiredPayload());
            if (storageResetActive) return sendStorageResetRefusal(res);
            const generation = storageResetGeneration;
            await storageResetTestHooks.waitAtAdmissionGate(kind);
            if (storageRecoveryRequired) return sendStorageResetRefusal(res, storageRecoveryRequiredPayload());
            if (storageResetActive || generation !== storageResetGeneration) return sendStorageResetRefusal(res);
            req.storageResetAdmission = { generation, res, strict: options.strict === true, refusal: null };
            answerStorageRefusalsFor(req.storageResetAdmission);
            next();
        } catch (error) {
            next(error);
        }
    });
}
for (const [method, route] of STORAGE_RESET_COMPETING_ROUTES) {
    storageResetRefusalRouter[method](route, (req, res, next) => {
        if (storageRecoveryRequired || storageResetActive) return sendCompetingStorageReset(res);
        next();
    });
}
app.use(storageResetRefusalRouter);
const defaultJsonParser = express.json({ limit: '100mb' });
const chatDeltaJsonParser = express.json({ limit: CHAT_DELTA_MAX_BYTES });
app.use((req, res, next) => {
    const isChatDelta = req.method === 'POST'
        && /^\/api\/chat-content\/[^/]+\/[^/]+\/patch$/.test(req.path);
    return (isChatDelta ? chatDeltaJsonParser : defaultJsonParser)(req, res, next);
});
app.use((req, res, next) => {
    // Skip express.raw() for backup import — it must stream, not buffer into memory
    if (req.path === '/api/backup/import') return next();
    return express.raw({ type: 'application/octet-stream', limit: '2gb' })(req, res, next);
});
app.use(express.text({ limit: '100mb' }));
// Body parsers do not keep async context; re-enter the writer admission so
// queueStorageOperation can check it when the queued work starts.
app.use((req, res, next) => {
    const admission = req.storageResetAdmission;
    if (!admission) return next();
    // A reset may have started while the body was read; synchronous writer
    // handlers run right after this point, queued ones are checked again.
    const stale = staleStorageAdmissionPayload(admission);
    if (stale) return sendStorageResetRefusal(res, stale);
    storageAdmissionContext.run(admission, next);
});
const {pipeline} = require('stream/promises')
const sslPath = path.join(process.cwd(), 'server/node/ssl/certificate');
const hubURL = 'https://sv.risuai.xyz';

let password = ''

// Ensure /save/ exists for password file and migration source
const savePath = path.join(process.cwd(), "save")
if(!existsSync(savePath)){
    mkdirSync(savePath)
}

// Server-side backup directory (outside save/ to avoid bloating updater copies).
// Configurable at runtime via the kv key `config/server-backup-path`. When the
// user changes the path the old directory is left in place (existing backups
// stay where they were); only future backups land at the new path.
const DEFAULT_BACKUPS_DIR = path.join(process.cwd(), "backups");
const BACKUP_PATH_CONFIG_KEY = 'config/server-backup-path';
const MANAGED_BACKUP_PATH_ROOTS = new Set(['server', 'dist', 'scripts', 'bin', 'node_modules', '.update-tmp']);
// Plaintext marker the updater reads to preserve a custom in-tree backup dir
// during in-place updates. KV lives inside the SQLite DB so the updater (which
// runs without npm deps) can't read it; this marker bridges that gap.
const BACKUP_PATH_MARKER = path.join(savePath, '__backup_path');

function readBackupsDirConfig() {
    try {
        const raw = kvGet(BACKUP_PATH_CONFIG_KEY);
        if (!raw) return DEFAULT_BACKUPS_DIR;
        const text = Buffer.from(raw).toString('utf-8').trim();
        return text || DEFAULT_BACKUPS_DIR;
    } catch { return DEFAULT_BACKUPS_DIR; }
}

function writeBackupPathMarker(absPath) {
    try {
        require('fs').writeFileSync(BACKUP_PATH_MARKER, absPath, 'utf-8');
    } catch {
        // Best-effort; marker absence only means the updater falls back to the
        // hard-coded `backups` keep — same as before this feature existed.
    }
}

function isManagedBackupPath(absPath) {
    const rel = path.relative(process.cwd(), absPath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) return false;
    if (!rel) return true;
    return MANAGED_BACKUP_PATH_ROOTS.has(rel.split(path.sep)[0]);
}

let backupsDir = readBackupsDirConfig();
if(!existsSync(backupsDir)){
    try { mkdirSync(backupsDir, { recursive: true }); }
    catch { backupsDir = DEFAULT_BACKUPS_DIR; mkdirSync(backupsDir, { recursive: true }); }
}
writeBackupPathMarker(backupsDir);
const BACKUP_FILENAME_REGEX = /^risu-backup-\d+\.bin$/;

const passwordPath = path.join(process.cwd(), 'save', '__password')
if(existsSync(passwordPath)){
    password = readFileSync(passwordPath, 'utf-8')
}

// ── NodeOnly: server-side JWT (HMAC-SHA256) ─────────────────────────────────
// Upstream uses client-side ECDSA JWT via crypto.subtle, which requires
// Secure Context (HTTPS or localhost). NodeOnly needs HTTP remote access,
// so we moved JWT signing/verification to the server using HMAC-SHA256.
// If upstream changes its auth flow, this section needs manual sync.
// Related: createServerJwt(), checkAuth(), /api/login, /api/token/refresh
const jwtSecretPath = path.join(savePath, '__jwt_secret')
let jwtSecret
if (existsSync(jwtSecretPath)) {
    jwtSecret = readFileSync(jwtSecretPath, 'utf-8').trim()
} else {
    jwtSecret = nodeCrypto.randomBytes(64).toString('hex')
    writeFileSync(jwtSecretPath, jwtSecret, 'utf-8')
}

// ── Instance ID for anonymous usage analytics ────────────────────────────────
const instanceIdPath = path.join(savePath, '__instance_id')
let instanceId
if (existsSync(instanceIdPath)) {
    instanceId = readFileSync(instanceIdPath, 'utf-8').trim()
} else {
    instanceId = nodeCrypto.randomUUID()
    writeFileSync(instanceIdPath, instanceId, 'utf-8')
}

const authCodePath = path.join(process.cwd(), 'save', '__authcode')
const inlayDir = path.join(savePath, 'inlays')
const inlayMigrationMarker = path.join(inlayDir, '.migrated_to_fs')
const hexRegex = /^[0-9a-fA-F]+$/;
const BACKUP_IMPORT_MAX_BYTES = Number(process.env.RISU_BACKUP_IMPORT_MAX_BYTES ?? '0');
const BACKUP_ENTRY_NAME_MAX_BYTES = 1024;
// Minimum free disk space headroom multiplier: require 2× the backup size to be free
const BACKUP_DISK_HEADROOM = 2;
// Heartbeat interval for NDJSON import progress stream. 5 s by default —
// shorter than every common reverse-proxy response timeout (nginx 60 s, Cloudflare
// 100 s). Operators behind more aggressive proxies can tighten this. Clamped to
// 100 ms so a misconfiguration can't spam the socket.
const BACKUP_NDJSON_HEARTBEAT_MS = Math.max(
    100,
    Number(process.env.BACKUP_NDJSON_HEARTBEAT_MS ?? '5000') || 5000,
);

let importInProgress = false;

// ── Cloudflare Quick Tunnel ─────────────────────────────────────────────────
const TUNNEL_DISABLED = process.env.RISU_TUNNEL_DISABLED === 'true';
let tunnelProcess = null;
let tunnelUrl = null;
let tunnelStatus = 'off';   // 'off' | 'downloading' | 'starting' | 'running' | 'error'
let tunnelError = null;
let tunnelStartTimeout = null;

const CLOUDFLARED_ASSETS = {
    'darwin-arm64':  { url: 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64.tgz', type: 'tgz' },
    'darwin-x64':    { url: 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz', type: 'tgz' },
    'linux-x64':     { url: 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64', type: 'bin' },
    'linux-arm64':   { url: 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64', type: 'bin' },
    // Termux reports process.platform === 'android' but the linux-arm64
    // cloudflared binary (statically linked Go) runs cleanly on Bionic.
    'android-arm64': { url: 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64', type: 'bin' },
    'win32-x64':     { url: 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe', type: 'bin' },
};

function findCloudflaredBinary() {
    const ext = process.platform === 'win32' ? '.exe' : '';
    const bundled = path.join(process.cwd(), 'bin', 'cloudflared' + ext);
    if (existsSync(bundled)) return bundled;
    try {
        execSync(process.platform === 'win32' ? 'where cloudflared' : 'which cloudflared', { stdio: 'pipe' });
        return 'cloudflared';
    } catch {
        return null;
    }
}

function followRedirects(url) {
    return new Promise((resolve, reject) => {
        const mod = url.startsWith('https') ? require('https') : require('http');
        mod.get(url, { headers: { 'User-Agent': 'pocketrisu' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                followRedirects(res.headers.location).then(resolve, reject);
            } else if (res.statusCode === 200) {
                resolve(res);
            } else {
                reject(new Error(`HTTP ${res.statusCode}`));
            }
        }).on('error', reject);
    });
}

async function downloadCloudflared() {
    const key = `${process.platform}-${process.arch}`;
    const asset = CLOUDFLARED_ASSETS[key];
    if (!asset) throw new Error(`Unsupported platform: ${key}`);

    const ext = process.platform === 'win32' ? '.exe' : '';
    const binDir = path.join(process.cwd(), 'bin');
    const dest = path.join(binDir, 'cloudflared' + ext);

    if (!existsSync(binDir)) require('fs').mkdirSync(binDir, { recursive: true });

    console.log(`[Tunnel] Downloading cloudflared for ${key}...`);
    const res = await followRedirects(asset.url);

    if (asset.type === 'tgz') {
        const tmpPath = path.join(binDir, '_cloudflared.tgz');
        await new Promise((resolve, reject) => {
            const ws = require('fs').createWriteStream(tmpPath);
            res.pipe(ws);
            ws.on('finish', () => { ws.close(); resolve(); });
            ws.on('error', reject);
        });
        execSync(`tar -xzf "${tmpPath}" -C "${binDir}"`, { stdio: 'pipe' });
        require('fs').unlinkSync(tmpPath);
    } else {
        await new Promise((resolve, reject) => {
            const ws = require('fs').createWriteStream(dest);
            res.pipe(ws);
            ws.on('finish', () => { ws.close(); resolve(); });
            ws.on('error', reject);
        });
    }

    if (process.platform !== 'win32') require('fs').chmodSync(dest, 0o755);
    console.log('[Tunnel] cloudflared downloaded successfully.');
    return dest;
}

function stopTunnel() {
    if (tunnelStartTimeout) { clearTimeout(tunnelStartTimeout); tunnelStartTimeout = null; }
    if (tunnelProcess) {
        try { tunnelProcess.kill('SIGTERM'); } catch {}
        tunnelProcess = null;
    }
    tunnelUrl = null;
    tunnelStatus = 'off';
    tunnelError = null;
}

// ── Update check ─────────────────────────────────────────────────────────────
const UPDATE_CHECK_DISABLED = process.env.RISU_UPDATE_CHECK === 'false';
const UPDATE_CHECK_URL = process.env.RISU_UPDATE_URL || 'https://risu-update-worker.nodridan.workers.dev/check';
const PUBLIC_STATS_URL = (process.env.RISU_UPDATE_URL || 'https://risu-update-worker.nodridan.workers.dev/check').replace(/\/check$/, '/api/public-stats');

// Re-read on each call so non-portable updates (docker/git pull) without a
// process restart don't keep reporting the old version to the update worker.
function getCurrentVersion() {
    try {
        const pkg = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'));
        return pkg.version || '0.0.0';
    } catch { return '0.0.0'; }
}

// ── Deployment type & self-update helpers ─────────────────────────────────────
const GITHUB_REPO = 'PocketRisu/PocketRisu';

const deploymentType = (() => {
    // Only portable builds have the .portable marker (created by CI release workflow).
    // Self-update is gated on this — all other types are inferred for analytics only.
    // Wrapped in try/catch so unexpected filesystem errors can't crash server boot.
    try {
        if (existsSync(path.join(process.cwd(), '.portable'))) return 'portable';
        if (existsSync(path.join(process.cwd(), '.git'))) return 'git';
        if (existsSync('/.dockerenv')) return 'docker';
        try {
            const cgroup = readFileSync('/proc/1/cgroup', 'utf-8');
            if (cgroup.includes('docker') || cgroup.includes('containerd')) return 'docker';
        } catch {}
        if (process.platform === 'android') return 'termux';
    } catch {}
    return 'unknown';
})();

function getSelfUpdateAssetInfo(version) {
    const platformMap = { win32: 'win', linux: 'linux', darwin: 'macos' };
    const platformName = platformMap[process.platform];
    if (!platformName) return null;
    const arch = process.arch; // x64, arm64
    const ext = process.platform === 'win32' ? 'zip' : 'tar.gz';
    const filename = `PocketRisu-v${version}-${platformName}-${arch}.${ext}`;
    const url = `https://github.com/${GITHUB_REPO}/releases/download/v${version}/${filename}`;
    return { platformName, arch, ext, filename, url };
}

function isSafeInlayId(id) {
    return typeof id === 'string' &&
        id.length > 0 &&
        !id.includes('\0') &&
        !id.includes('/') &&
        !id.includes('\\') &&
        id !== '.' &&
        id !== '..';
}

function normalizeInlayExt(ext) {
    if (typeof ext !== 'string') return 'bin';
    const normalized = ext.trim().toLowerCase().replace(/^\.+/, '').replace(/[\/\\\0]/g, '');
    return normalized || 'bin';
}

const resolvedInlayDir = path.resolve(inlayDir) + path.sep;

function assertInsideInlayDir(filePath) {
    if (!path.resolve(filePath).startsWith(resolvedInlayDir)) {
        throw new Error(`Path escapes inlay directory: ${filePath}`);
    }
}

function getInlayFilePath(id, ext) {
    if (!isSafeInlayId(id)) throw new Error(`Invalid inlay id: ${id}`);
    const p = path.join(inlayDir, `${id}.${normalizeInlayExt(ext)}`);
    assertInsideInlayDir(p);
    return p;
}

function getInlaySidecarPath(id) {
    if (!isSafeInlayId(id)) throw new Error(`Invalid inlay id: ${id}`);
    const p = path.join(inlayDir, `${id}.meta.json`);
    assertInsideInlayDir(p);
    return p;
}

async function ensureInlayDir() {
    await fs.mkdir(inlayDir, { recursive: true });
}

function ensureInlayDirSync() {
    if (!existsSync(inlayDir)) {
        mkdirSync(inlayDir, { recursive: true });
    }
}

function getMimeFromExt(ext, buffer) {
    return ASSET_EXT_MIME[normalizeInlayExt(ext)] || detectMime(buffer);
}

function decodeDataUri(dataUri) {
    if (typeof dataUri !== 'string' || !dataUri.startsWith('data:')) {
        throw new Error('Invalid data URI');
    }
    const commaIdx = dataUri.indexOf(',');
    if (commaIdx === -1) {
        throw new Error('Malformed data URI');
    }
    const meta = dataUri.substring(5, commaIdx);
    return {
        buffer: Buffer.from(dataUri.substring(commaIdx + 1), 'base64'),
        mime: meta.split(';')[0] || 'application/octet-stream',
    };
}

function encodeDataUri(buffer, mime) {
    return `data:${mime || 'application/octet-stream'};base64,${Buffer.from(buffer).toString('base64')}`;
}

async function readInlaySidecar(id) {
    try {
        const raw = await fs.readFile(getInlaySidecarPath(id), 'utf-8');
        const parsed = JSON.parse(raw);
        return {
            ext: normalizeInlayExt(parsed?.ext),
            name: typeof parsed?.name === 'string' ? parsed.name : id,
            type: typeof parsed?.type === 'string' ? parsed.type : 'image',
            height: typeof parsed?.height === 'number' ? parsed.height : undefined,
            width: typeof parsed?.width === 'number' ? parsed.width : undefined,
        };
    } catch {
        return null;
    }
}

async function resolveInlayFilePath(id) {
    if (!isSafeInlayId(id)) return null;
    const sidecar = await readInlaySidecar(id);
    if (sidecar) {
        const candidate = getInlayFilePath(id, sidecar.ext);
        try { await fs.access(candidate); return candidate; } catch {}
    }
    // Fallback: scan directory (covers pre-sidecar files or mismatched ext)
    try {
        const entries = await fs.readdir(inlayDir, { withFileTypes: true });
        const match = entries.find((entry) => (
            entry.isFile() &&
            entry.name.startsWith(`${id}.`) &&
            entry.name !== `${id}.meta.json`
        ));
        return match ? path.join(inlayDir, match.name) : null;
    } catch {
        return null;
    }
}

function resolveInlayFilePathSync(id) {
    if (!isSafeInlayId(id)) return null;
    try {
        const raw = readFileSync(getInlaySidecarPath(id), 'utf-8');
        const parsed = JSON.parse(raw);
        const ext = normalizeInlayExt(parsed?.ext);
        const candidate = getInlayFilePath(id, ext);
        if (existsSync(candidate)) return candidate;
    } catch {}
    // Fallback: scan directory
    try {
        const entries = readdirSync(inlayDir, { withFileTypes: true });
        const match = entries.find((entry) => (
            entry.isFile() &&
            entry.name.startsWith(`${id}.`) &&
            entry.name !== `${id}.meta.json`
        ));
        return match ? path.join(inlayDir, match.name) : null;
    } catch {
        return null;
    }
}

async function readInlayFile(id) {
    const filePath = await resolveInlayFilePath(id);
    if (!filePath) return null;
    const ext = normalizeInlayExt(path.extname(filePath).slice(1));
    const buffer = await fs.readFile(filePath);
    const stat = await fs.stat(filePath);
    return {
        buffer,
        ext,
        filePath,
        mtimeMs: stat.mtimeMs,
        mime: getMimeFromExt(ext, buffer),
    };
}

async function writeInlaySidecar(id, info) {
    await ensureInlayDir();
    const sidecar = {
        ext: normalizeInlayExt(info?.ext),
        name: typeof info?.name === 'string' ? info.name : id,
        type: typeof info?.type === 'string' ? info.type : 'image',
        height: typeof info?.height === 'number' ? info.height : undefined,
        width: typeof info?.width === 'number' ? info.width : undefined,
    };
    await fs.writeFile(getInlaySidecarPath(id), JSON.stringify(sidecar));
}

function writeInlaySidecarSync(id, info) {
    ensureInlayDirSync();
    const sidecar = {
        ext: normalizeInlayExt(info?.ext),
        name: typeof info?.name === 'string' ? info.name : id,
        type: typeof info?.type === 'string' ? info.type : 'image',
        height: typeof info?.height === 'number' ? info.height : undefined,
        width: typeof info?.width === 'number' ? info.width : undefined,
    };
    writeFileSync(getInlaySidecarPath(id), JSON.stringify(sidecar));
}

// In-flight inlay filesystem mutations. A storage reset waits for them before
// its first destructive step (its refusal middleware stops new ones).
const inflightInlayMutations = new Set();
function trackInlayMutation(mutation) {
    inflightInlayMutations.add(mutation);
    mutation.then(
        () => inflightInlayMutations.delete(mutation),
        () => inflightInlayMutations.delete(mutation),
    );
    return mutation;
}
async function waitForInlayMutations() {
    while (inflightInlayMutations.size > 0) {
        await Promise.allSettled([...inflightInlayMutations]);
    }
}
function writeInlayFile(id, ext, buffer, info = null) {
    return trackInlayMutation(writeInlayFileUntracked(id, ext, buffer, info));
}
async function writeInlayFileUntracked(id, ext, buffer, info) {
    await ensureInlayDir();
    await deleteInlayRawFile(id);
    const normalizedExt = normalizeInlayExt(ext);
    await fs.writeFile(getInlayFilePath(id, normalizedExt), Buffer.from(buffer));
    await writeInlaySidecar(id, {
        ...(info || {}),
        ext: normalizedExt,
    });
}

function writeInlayFileSync(id, ext, buffer, info = null) {
    ensureInlayDirSync();
    deleteInlayRawFileSync(id);
    const normalizedExt = normalizeInlayExt(ext);
    writeFileSync(getInlayFilePath(id, normalizedExt), Buffer.from(buffer));
    writeInlaySidecarSync(id, {
        ...(info || {}),
        ext: normalizedExt,
    });
}

async function deleteInlayRawFile(id) {
    const filePath = await resolveInlayFilePath(id);
    if (!filePath) return;
    await fs.unlink(filePath).catch(() => {});
}

function deleteInlayRawFileSync(id) {
    const filePath = resolveInlayFilePathSync(id);
    if (!filePath) return;
    try {
        unlinkSync(filePath);
    } catch {
        // ignore
    }
}

function deleteInlayFile(id) {
    return trackInlayMutation(deleteInlayFileUntracked(id));
}
async function deleteInlayFileUntracked(id) {
    await deleteInlayRawFile(id);
    await fs.unlink(getInlaySidecarPath(id)).catch(() => {});
}

function deleteInlayFileSync(id) {
    deleteInlayRawFileSync(id);
    try {
        unlinkSync(getInlaySidecarPath(id));
    } catch {
        // ignore
    }
}

async function listInlayFiles() {
    await ensureInlayDir();
    const entries = await fs.readdir(inlayDir, { withFileTypes: true });
    return entries
        .filter((entry) => (
            entry.isFile() &&
            entry.name !== '.migrated_to_fs' &&
            !entry.name.endsWith('.meta.json')
        ))
        .map((entry) => {
            const ext = normalizeInlayExt(path.extname(entry.name).slice(1));
            const id = entry.name.slice(0, -(ext.length + 1));
            return { id, ext, filePath: path.join(inlayDir, entry.name) };
        })
        .filter((entry) => isSafeInlayId(entry.id));
}

async function readInlayLegacyInfo(id) {
    const value = kvGet(`inlay_info/${id}`);
    if (!value) return null;
    try {
        const parsed = JSON.parse(value.toString('utf-8'));
        return {
            ext: normalizeInlayExt(parsed?.ext),
            name: typeof parsed?.name === 'string' ? parsed.name : id,
            type: typeof parsed?.type === 'string' ? parsed.type : 'image',
            height: typeof parsed?.height === 'number' ? parsed.height : undefined,
            width: typeof parsed?.width === 'number' ? parsed.width : undefined,
        };
    } catch {
        return null;
    }
}

async function readInlayInfoPayload(id) {
    const sidecar = await readInlaySidecar(id);
    if (sidecar) return Buffer.from(JSON.stringify(sidecar));
    const legacy = await readInlayLegacyInfo(id);
    if (legacy) return Buffer.from(JSON.stringify(legacy));
    return kvGet(`inlay_info/${id}`);
}

async function readInlayAssetPayload(id) {
    const file = await readInlayFile(id);
    if (!file) return null;
    const sidecar = (await readInlaySidecar(id)) || (await readInlayLegacyInfo(id));
    const info = {
        ext: sidecar?.ext || file.ext,
        name: sidecar?.name || id,
        type: sidecar?.type || 'image',
        height: sidecar?.height,
        width: sidecar?.width,
    };
    const data = info.type === 'signature'
        ? file.buffer.toString('utf-8')
        : encodeDataUri(file.buffer, file.mime);
    return Buffer.from(JSON.stringify({
        ...info,
        data,
    }));
}

async function migrateInlaysToFilesystem() {
    await ensureInlayDir();
    if (existsSync(inlayMigrationMarker)) return;

    const keys = kvList('inlay/');
    for (const key of keys) {
        const id = key.slice('inlay/'.length);
        if (!isSafeInlayId(id)) continue;
        const fileAlreadyExists = await readInlayFile(id);
        if (fileAlreadyExists) {
            kvDel(key);
            kvDel(`inlay_thumb/${id}`);
            kvDel(`inlay_info/${id}`);
            continue;
        }
        const value = kvGet(key);
        if (!value) continue;
        try {
            const parsed = JSON.parse(value.toString('utf-8'));
            const type = typeof parsed?.type === 'string' ? parsed.type : 'image';
            const ext = normalizeInlayExt(parsed?.ext);
            let buffer;
            if (type === 'signature') {
                buffer = Buffer.from(typeof parsed?.data === 'string' ? parsed.data : '', 'utf-8');
            } else {
                buffer = decodeDataUri(parsed?.data).buffer;
            }
            const info = (await readInlayLegacyInfo(id)) || {
                ext,
                name: typeof parsed?.name === 'string' ? parsed.name : id,
                type,
                height: typeof parsed?.height === 'number' ? parsed.height : undefined,
                width: typeof parsed?.width === 'number' ? parsed.width : undefined,
            };
            await writeInlayFile(id, ext, buffer, info);
            kvDel(key);
            kvDel(`inlay_thumb/${id}`);
            kvDel(`inlay_info/${id}`);
        } catch (error) {
            logger.warn(`[InlayFS] Failed to migrate ${key}:`, error?.message || error);
        }
    }

    await fs.writeFile(inlayMigrationMarker, new Date().toISOString(), 'utf-8');
}

async function fetchLatestRelease(lang) {
    if (UPDATE_CHECK_DISABLED) return null;
    try {
        const currentVersion = getCurrentVersion();
        const params = new URLSearchParams({
            v: currentVersion,
            d: deploymentType,
            os: `${process.platform}-${process.arch}`,
            id: instanceId,
        });
        if (lang) params.set('l', String(lang).slice(0, 16));
        const url = `${UPDATE_CHECK_URL}?${params}`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        if (data.hasUpdate) {
            console.log(`[Update] New version available: v${data.latestVersion} (current: v${currentVersion}, ${data.severity})`);
        }
        return data;
    } catch (e) {
        logger.error('[Update] Failed to check for updates:', e.message);
        return null;
    }
}

// ── Session store for direct asset URL auth (F-0) ──────────────────────────
// <img src="/api/asset/..."> cannot send custom headers, so we use a session
// cookie issued after initial JWT auth. Single-user environment: Map is fine.
// Sessions are persisted to disk so they survive server restarts.
const SESSION_FILE = path.join(process.cwd(), 'save', '__sessions')
const sessions = new Map() // token → expiresAt (ms)

function loadSessions() {
    try {
        const raw = readFileSync(SESSION_FILE, 'utf-8')
        const now = Date.now()
        for (const [token, exp] of JSON.parse(raw)) {
            if (exp > now) sessions.set(token, exp)
        }
    } catch { /* file missing or corrupt – start fresh */ }
}

function saveSessions() {
    try { writeFileSync(SESSION_FILE, JSON.stringify([...sessions])) }
    catch { /* non-critical */ }
}

loadSessions()

function parseSessionCookie(req) {
    const cookieHeader = req.headers.cookie || ''
    for (const part of cookieHeader.split(';')) {
        const eq = part.indexOf('=')
        if (eq === -1) continue
        if (part.slice(0, eq).trim() === 'risu-session') return part.slice(eq + 1).trim()
    }
    return null
}

function sessionAuthMiddleware(req, res, next) {
    const token = parseSessionCookie(req)
    if (token && (sessions.get(token) ?? 0) > Date.now()) return next()
    res.status(401).end()
}

// MIME detection by magic bytes (fallback when key has no extension)
function detectMime(buf) {
    if (!buf || buf.length < 12) return 'application/octet-stream'
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png'
    if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg'
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif'
    if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
        buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp'
    if (buf[0] === 0x1a && buf[1] === 0x45) return 'video/webm'
    if (buf.length >= 8 && buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) return 'video/mp4'
    return 'application/octet-stream'
}
const ASSET_EXT_MIME = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp',
    mp4: 'video/mp4', webm: 'video/webm',
    mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav',
}

async function checkDiskSpace(requiredBytes) {
    try {
        const saveDir = path.join(process.cwd(), 'save');
        const stats = await fs.statfs(saveDir);
        const availableBytes = stats.bavail * stats.bsize;
        return { ok: availableBytes >= requiredBytes, available: availableBytes };
    } catch {
        // statfs unavailable on this platform — skip check
        return { ok: true, available: -1 };
    }
}

// ── Active writer session (single-writer lock) ────────────────────────────────
// Mirrors the BroadcastChannel-based tab lock on the server side so that the
// same protection extends across devices. Lock rules live in session-lock.cjs:
// page loads REGISTER but never steal the lock (an OS-restored phone tab must
// not kick a PC mid-session); ownership moves on the first WRITE from a
// freshly-booted session, and only stale sessions get 423.
const { createSessionLock } = require('./session-lock.cjs');
const sessionLock = createSessionLock();

function checkActiveSession(req, res) {
    const clientSessionId = req.headers['x-session-id']
    // The client attaches x-user-active only when a real user gesture happened
    // recently — automatic writes (boot housekeeping, flush-on-hide) carry no
    // gesture and must never move the lock (session-lock.cjs rules).
    const userActive = req.headers['x-user-active'] === '1'
    const result = sessionLock.checkWrite(typeof clientSessionId === 'string' ? clientSessionId : '', userActive)
    if (result.tookOver) {
        console.log('[Session] Write lock taken over by a freshly-booted session')
    }
    if (result.ok) return true
    res.status(423).json({ error: 'Session deactivated' })
    return false
}

// --- Proxy Stream Job constants ---
const PROXY_STREAM_DEFAULT_TIMEOUT_MS = 600000;
const PROXY_STREAM_MAX_TIMEOUT_MS = 3600000;
const PROXY_STREAM_DEFAULT_HEARTBEAT_SEC = 15;
const PROXY_STREAM_HEARTBEAT_MIN_SEC = 5;
const PROXY_STREAM_HEARTBEAT_MAX_SEC = 60;
const PROXY_STREAM_GC_INTERVAL_MS = 60000;
const PROXY_STREAM_DONE_GRACE_MS = 30000;
const PROXY_STREAM_MAX_ACTIVE_JOBS = 64;
const PROXY_STREAM_MAX_PENDING_EVENTS = 512;
const PROXY_STREAM_MAX_PENDING_BYTES = 2 * 1024 * 1024;
const PROXY_STREAM_MAX_BODY_BASE64_BYTES = 8 * 1024 * 1024;
const proxyStreamJobs = new Map();

const loginRouteLimiter = rateLimit({
    windowMs: 30 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many attempts. Please wait and try again later.' },
    validate: { xForwardedForHeader: false }
});

function isHex(str) {
    return hexRegex.test(str.toUpperCase().trim()) || str === '__password';
}

async function hashJSON(json){
    const hash = nodeCrypto.createHash('sha256');
    hash.update(JSON.stringify(json));
    return hash.digest('hex');
}

// NodeOnly: server-issued JWT (see jwt_secret comment above)
function createServerJwt() {
    const now = Math.floor(Date.now() / 1000)
    const header = { alg: 'HS256', typ: 'JWT' }
    const payload = { iat: now, exp: now + 5 * 60 }
    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url')
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
    const sig = nodeCrypto.createHmac('sha256', jwtSecret)
        .update(`${headerB64}.${payloadB64}`)
        .digest('base64url')
    return `${headerB64}.${payloadB64}.${sig}`
}

function getRequestTimeoutMs(timeoutHeader) {
    const raw = Array.isArray(timeoutHeader) ? timeoutHeader[0] : timeoutHeader;
    if (!raw) {
        return null;
    }
    const timeoutMs = Number.parseInt(raw, 10);
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        return null;
    }
    return timeoutMs;
}

function createTimeoutController(timeoutMs) {
    if (!timeoutMs) {
        return {
            signal: undefined,
            cleanup: () => {}
        };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    return {
        signal: controller.signal,
        cleanup: () => clearTimeout(timer)
    };
}

// --- Proxy Stream: auth helpers ---

function normalizeAuthHeader(authHeader) {
    if (Array.isArray(authHeader)) {
        return authHeader[0] || '';
    }
    return typeof authHeader === 'string' ? authHeader : '';
}

async function isAuthorizedProxyRequest(req) {
    return await checkAuth(req, null, true);
}

async function checkProxyAuth(req, res) {
    return await checkAuth(req, res);
}

// --- Proxy Stream: network helpers ---

function isPrivateIPv4Host(hostname) {
    const parts = hostname.split('.');
    if (parts.length !== 4) {
        return false;
    }
    const octets = parts.map((part) => Number.parseInt(part, 10));
    if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
        return false;
    }
    const [a, b] = octets;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
    return false;
}

function isLocalNetworkHost(hostname) {
    if (typeof hostname !== 'string' || hostname.trim() === '') {
        return false;
    }
    const normalizedHost = hostname.toLowerCase().replace(/\.$/, '').split('%')[0];
    if (normalizedHost === 'localhost' || normalizedHost === '::1' || normalizedHost.endsWith('.local')) {
        return true;
    }
    // NodeOnly policy: keep server-side validation aligned with the client helper
    // for Node/self-hosted deployments where single-label LAN or Docker DNS names
    // like "litellm" / "ollama" are valid local targets. Upstream currently only
    // allows localhost/.local/IP here, but NodeOnly routes all local-network-mode
    // traffic through the Node server, so rejecting single-label hosts would make
    // the feature unusable for common self-hosted setups.
    if (/^[a-z0-9_-]+$/i.test(normalizedHost) && !normalizedHost.includes('.')) {
        return true;
    }
    if (net.isIP(normalizedHost) === 4) {
        return isPrivateIPv4Host(normalizedHost);
    }
    if (net.isIP(normalizedHost) === 6) {
        if (normalizedHost.startsWith('::ffff:')) {
            const mapped = normalizedHost.substring(7);
            return net.isIP(mapped) === 4 && isPrivateIPv4Host(mapped);
        }
        if (normalizedHost.startsWith('fc') || normalizedHost.startsWith('fd')) {
            return true;
        }
        if (/^fe[89ab]/.test(normalizedHost)) {
            return true;
        }
        return normalizedHost === '::1';
    }
    return false;
}

function sanitizeTargetUrl(raw) {
    if (typeof raw !== 'string' || raw.trim() === '') {
        return null;
    }
    try {
        const parsed = new URL(raw);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return null;
        }
        if (!isLocalNetworkHost(parsed.hostname)) {
            return null;
        }
        parsed.username = '';
        parsed.password = '';
        return parsed.toString();
    } catch {
        return null;
    }
}

// --- Proxy Stream: request/response helpers ---
// normalizeForwardHeaders (the shared security strip-list) lives in utils.cjs.

function normalizeProxyResponseHeaders(headers) {
    const normalized = {};
    for (const [key, value] of Object.entries(headers || {})) {
        if (value === undefined) continue;
        normalized[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value);
    }
    return normalized;
}

function normalizeProxyStreamTimeoutMs(timeoutMs) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        return PROXY_STREAM_DEFAULT_TIMEOUT_MS;
    }
    const parsed = Math.max(1, Math.floor(timeoutMs));
    return Math.min(PROXY_STREAM_MAX_TIMEOUT_MS, parsed);
}

function normalizeHeartbeatSec(heartbeatSec) {
    if (!Number.isFinite(heartbeatSec)) {
        return PROXY_STREAM_DEFAULT_HEARTBEAT_SEC;
    }
    const parsed = Math.floor(heartbeatSec);
    return Math.min(PROXY_STREAM_HEARTBEAT_MAX_SEC, Math.max(PROXY_STREAM_HEARTBEAT_MIN_SEC, parsed));
}

// --- Proxy Stream: native HTTP request to local target ---

function requestLocalTargetStream(targetUrl, arg) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(targetUrl);
        const client = parsedUrl.protocol === 'https:' ? https : http;
        const headers = normalizeForwardHeaders(arg.headers);
        if (!headers['host']) {
            headers['host'] = parsedUrl.host;
        }
        if (arg.bodyBuffer && !headers['content-length']) {
            headers['content-length'] = String(arg.bodyBuffer.length);
        }

        let settled = false;
        let cleanupAbort = () => {};
        const finishReject = (error) => {
            if (settled) return;
            settled = true;
            cleanupAbort();
            reject(error);
        };

        const req = client.request(parsedUrl, {
            method: arg.method,
            headers
        }, (res) => {
            if (settled) {
                res.destroy();
                return;
            }
            settled = true;
            cleanupAbort();
            resolve({
                status: res.statusCode || 502,
                headers: normalizeProxyResponseHeaders(res.headers),
                body: res
            });
        });

        req.on('error', (error) => {
            finishReject(error);
        });

        req.setTimeout(arg.timeoutMs, () => {
            req.destroy(new Error(`Upstream request timed out after ${arg.timeoutMs}ms`));
        });

        if (arg.signal) {
            const onAbort = () => {
                const abortError = new Error('Proxy stream job aborted');
                abortError.name = 'AbortError';
                req.destroy(abortError);
            };
            if (arg.signal.aborted) {
                onAbort();
                return;
            }
            arg.signal.addEventListener('abort', onAbort, { once: true });
            cleanupAbort = () => arg.signal.removeEventListener('abort', onAbort);
        }

        if (arg.bodyBuffer && arg.method !== 'GET' && arg.method !== 'HEAD') {
            req.write(arg.bodyBuffer);
        }
        req.end();
    });
}

// --- Proxy Stream: job lifecycle ---

function createProxyStreamJob(arg) {
    const jobId = nodeCrypto.randomUUID();
    const timeoutMs = normalizeProxyStreamTimeoutMs(Number(arg.timeoutMs));
    const heartbeatSec = normalizeHeartbeatSec(arg.heartbeatSec);
    const controller = new AbortController();
    const createdAt = Date.now();
    const job = {
        id: jobId,
        createdAt,
        updatedAt: createdAt,
        done: false,
        cleanupAt: 0,
        clients: new Set(),
        pendingEvents: [],
        pendingBytes: 0,
        abortController: controller,
        deadlineAt: createdAt + timeoutMs,
        heartbeatSec,
        timeoutMs
    };
    proxyStreamJobs.set(jobId, job);
    return job;
}

function pushJobEvent(job, event) {
    job.updatedAt = Date.now();
    const text = JSON.stringify(event);
    if (job.clients.size === 0) {
        job.pendingEvents.push(text);
        job.pendingBytes += Buffer.byteLength(text);
        while (
            job.pendingEvents.length > PROXY_STREAM_MAX_PENDING_EVENTS
            || job.pendingBytes > PROXY_STREAM_MAX_PENDING_BYTES
        ) {
            const removed = job.pendingEvents.shift();
            if (!removed) break;
            job.pendingBytes -= Buffer.byteLength(removed);
        }
        return;
    }
    for (const client of job.clients) {
        if (client.readyState === client.OPEN) {
            client.send(text);
        }
    }
}

function markJobDone(job) {
    if (job.done) return;
    job.done = true;
    job.cleanupAt = Date.now() + PROXY_STREAM_DONE_GRACE_MS;
}

function cleanupJob(jobId) {
    const job = proxyStreamJobs.get(jobId);
    if (!job) return;
    for (const client of job.clients) {
        try { client.close(); } catch { /* ignore */ }
    }
    proxyStreamJobs.delete(jobId);
}

async function runProxyStreamJob(job, arg) {
    const targetUrl = sanitizeTargetUrl(arg.targetUrl);
    if (!targetUrl) {
        pushJobEvent(job, { type: 'error', status: 400, message: 'Blocked non-local target URL' });
        markJobDone(job);
        return;
    }

    const headers = normalizeForwardHeaders(arg.headers);
    if (!headers['x-forwarded-for']) {
        headers['x-forwarded-for'] = arg.clientIp;
    }
    const bodyBuffer = arg.bodyBase64 ? Buffer.from(arg.bodyBase64, 'base64') : undefined;

    try {
        const upstreamResponse = await requestLocalTargetStream(targetUrl, {
            method: arg.method,
            headers,
            bodyBuffer,
            timeoutMs: job.timeoutMs,
            signal: job.abortController.signal
        });

        const filteredHeaders = {};
        for (const [key, value] of Object.entries(upstreamResponse.headers)) {
            if (key === 'content-security-policy' || key === 'content-security-policy-report-only' || key === 'clear-site-data') {
                continue;
            }
            filteredHeaders[key] = value;
        }

        pushJobEvent(job, { type: 'upstream_headers', status: upstreamResponse.status, headers: filteredHeaders });

        if (upstreamResponse.body) {
            for await (const value of upstreamResponse.body) {
                if (job.abortController.signal.aborted) break;
                if (value && value.length > 0) {
                    pushJobEvent(job, { type: 'chunk', dataBase64: Buffer.from(value).toString('base64') });
                }
            }
        }
        pushJobEvent(job, { type: 'done' });
        markJobDone(job);
    } catch (error) {
        const message = error?.name === 'AbortError' ? 'Proxy stream job aborted' : `${error}`;
        pushJobEvent(job, { type: 'error', status: 504, message });
        markJobDone(job);
    }
}

// --- Proxy Stream: WebSocket setup ---

function setupProxyStreamWebSocket(server) {
    const wsServer = new WebSocketServer({ noServer: true });
    server.on('upgrade', async (req, socket, head) => {
        try {
            const reqUrl = new URL(req.url, `http://${req.headers.host}`);
            if (!reqUrl.pathname.startsWith('/proxy-stream-jobs/') || !reqUrl.pathname.endsWith('/ws')) {
                socket.destroy();
                return;
            }

            const auth = reqUrl.searchParams.get('risu-auth') || normalizeAuthHeader(req.headers['risu-auth']);
            if (!await isAuthorizedProxyRequest({ headers: { 'risu-auth': auth } })) {
                socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                socket.destroy();
                return;
            }

            const pathParts = reqUrl.pathname.split('/').filter(Boolean);
            const jobId = pathParts.length >= 3 ? pathParts[1] : '';
            const job = proxyStreamJobs.get(jobId);
            if (!job) {
                socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
                socket.destroy();
                return;
            }

            wsServer.handleUpgrade(req, socket, head, (ws) => {
                wsServer.emit('connection', ws, req, jobId);
            });
        } catch {
            socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
            socket.destroy();
        }
    });

    wsServer.on('connection', (ws, _req, jobId) => {
        const job = proxyStreamJobs.get(jobId);
        if (!job) {
            ws.close();
            return;
        }

        job.clients.add(ws);
        ws.send(JSON.stringify({ type: 'job_accepted', jobId }));
        for (const event of job.pendingEvents) {
            ws.send(event);
        }
        job.pendingEvents = [];
        job.pendingBytes = 0;

        const pingTimer = setInterval(() => {
            if (ws.readyState !== ws.OPEN) return;
            ws.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
        }, job.heartbeatSec * 1000);

        ws.on('close', () => {
            clearInterval(pingTimer);
            const currentJob = proxyStreamJobs.get(jobId);
            if (!currentJob) return;
            currentJob.clients.delete(ws);
            if (currentJob.done && currentJob.clients.size === 0) {
                cleanupJob(jobId);
            }
        });

        ws.on('error', () => {
            clearInterval(pingTimer);
        });
    });
}

function encodeBackupEntry(name, data) {
    const encodedName = Buffer.from(name, 'utf-8');
    const nameLength = Buffer.allocUnsafe(4);
    nameLength.writeUInt32LE(encodedName.length, 0);
    const dataLength = Buffer.allocUnsafe(4);
    dataLength.writeUInt32LE(data.length, 0);
    return Buffer.concat([nameLength, encodedName, dataLength, data]);
}

function isInvalidBackupPathSegment(name) {
    return storageResetPrepare.isInvalidBackupPathSegment(name);
}

function parseInlayBackupName(name) {
    if (!name.startsWith('inlay/')) return null;
    const suffix = name.slice('inlay/'.length);
    if (!suffix || suffix.includes('/')) return null;
    const dotIdx = suffix.lastIndexOf('.');
    if (dotIdx <= 0) {
        return { id: suffix, ext: null };
    }
    return {
        id: suffix.slice(0, dotIdx),
        ext: suffix.slice(dotIdx + 1),
    };
}

function parseInlaySidecarBackupName(name) {
    if (!name.startsWith('inlay_sidecar/')) return null;
    const id = name.slice('inlay_sidecar/'.length);
    if (!isSafeInlayId(id)) return null;
    return { id };
}

// Flat upstream (#1484) coldstorage_<uuid>.json names and the runtime
// coldstorage/<uuid> keys are normalized in storageResetPrepare.cjs.
const COLD_STORAGE_FLAT_NAME_RE = storageResetPrepare.COLD_STORAGE_FLAT_NAME_RE;

function normalizeColdStorageStorageKey(nameOrKey) {
    return storageResetPrepare.normalizeColdStorageStorageKey(nameOrKey);
}

function toColdStorageBackupName(storageKey) {
    return `${normalizeColdStorageStorageKey(storageKey)}.json`;
}

function parseColdStorageJsonBuffer(buffer, sourceLabel, options = {}) {
    const { allowPlainJson = false } = options;
    try {
        const decompressed = zlib.gunzipSync(buffer);
        return {
            coldData: JSON.parse(decompressed.toString('utf-8')),
            format: 'gzip',
        };
    } catch (gzipError) {
        if (!allowPlainJson) {
            throw gzipError;
        }
        try {
            return {
                coldData: JSON.parse(buffer.toString('utf-8')),
                format: 'plain-json',
            };
        } catch (jsonError) {
            throw new Error(`[ColdStorage] failed to parse ${sourceLabel}: gzip=${gzipError.message}; json=${jsonError.message}`);
        }
    }
}

function encodeColdStorageCanonicalBuffer(coldData) {
    return Buffer.from(zlib.gzipSync(Buffer.from(JSON.stringify(coldData), 'utf-8')));
}

function readColdStorageJsonEntry(nameOrKey, options = {}) {
    const { migrateLegacy = false, allowPlainJsonFallback = false } = options;
    const canonicalKey = normalizeColdStorageStorageKey(nameOrKey);
    const legacyBackupKey = `${canonicalKey}.json`;

    let storageKey = canonicalKey;
    let value = kvGet(canonicalKey);
    if (!value) {
        storageKey = legacyBackupKey;
        value = kvGet(legacyBackupKey);
    }
    if (!value) {
        return null;
    }

    const parsed = parseColdStorageJsonBuffer(value, storageKey, {
        allowPlainJson: allowPlainJsonFallback || storageKey !== canonicalKey,
    });

    if (migrateLegacy && (storageKey !== canonicalKey || parsed.format !== 'gzip')) {
        kvSet(canonicalKey, encodeColdStorageCanonicalBuffer(parsed.coldData));
        if (storageKey !== canonicalKey) {
            kvDel(storageKey);
        }
    }

    return {
        coldData: parsed.coldData,
        storageKey,
        canonicalKey,
        format: parsed.format,
    };
}

function listColdStorageBackupEntries() {
    const canonicalKeys = Array.from(new Set(
        kvList('coldstorage/').map((key) => normalizeColdStorageStorageKey(key))
    )).sort((a, b) => a.localeCompare(b));

    return canonicalKeys.map((storageKey) => {
        const entry = readColdStorageJsonEntry(storageKey, {
            migrateLegacy: true,
            allowPlainJsonFallback: true,
        });
        if (!entry) {
            throw new Error(`[ColdStorage] missing cold storage entry while exporting: ${storageKey}`);
        }
        const plainJson = Buffer.from(JSON.stringify(entry.coldData), 'utf-8');
        return {
            kind: 'buffer',
            buffer: plainJson,
            backupName: toColdStorageBackupName(storageKey),
            sortKey: toColdStorageBackupName(storageKey),
            size: plainJson.length,
        };
    });
}

function resolveBackupStorageKey(name) {
    if (Buffer.byteLength(name, 'utf-8') > BACKUP_ENTRY_NAME_MAX_BYTES) {
        throw new Error(`Backup entry name too long: ${name.slice(0, 64)}`);
    }

    if (name === 'database.risudat') {
        return 'database/database.bin';
    }

    if (
        name.startsWith('inlay_thumb/') ||
        name.startsWith('inlay_meta/')
    ) {
        if (isInvalidBackupPathSegment(name)) {
            throw new Error(`Invalid backup entry name: ${name}`);
        }
        return name;
    }

    if (name.startsWith('inlay/')) {
        const parsed = parseInlayBackupName(name);
        if (!parsed || !isSafeInlayId(parsed.id)) {
            throw new Error(`Invalid inlay backup entry name: ${name}`);
        }
        return name;
    }

    if (name.startsWith('inlay_sidecar/')) {
        const parsed = parseInlaySidecarBackupName(name);
        if (!parsed) {
            throw new Error(`Invalid inlay sidecar backup entry name: ${name}`);
        }
        return name;
    }

    // Upstream backups transport cold storage as coldstorage/<uuid>.json
    // (pre-#1484) or flat coldstorage_<uuid>.json (#1484 onwards).
    // Normalize back to the runtime KV key: coldstorage/<uuid>.
    if (name.startsWith('coldstorage/') || COLD_STORAGE_FLAT_NAME_RE.test(name)) {
        return normalizeColdStorageStorageKey(name);
    }

    if (isInvalidBackupPathSegment(name) || name !== path.basename(name)) {
        throw new Error(`Invalid asset backup entry name: ${name}`);
    }

    return `assets/${name}`;
}

function parseBackupChunk(buffer, onEntry) {
    let offset = 0;
    while (offset + 4 <= buffer.length) {
        const nameLength = buffer.readUInt32LE(offset);
        if (offset + 4 + nameLength > buffer.length) {
            break;
        }
        const nameStart = offset + 4;
        const nameEnd = nameStart + nameLength;
        const name = buffer.subarray(nameStart, nameEnd).toString('utf-8');
        if (nameEnd + 4 > buffer.length) {
            break;
        }
        const dataLength = buffer.readUInt32LE(nameEnd);
        const dataStart = nameEnd + 4;
        const dataEnd = dataStart + dataLength;
        if (dataEnd > buffer.length) {
            break;
        }
        onEntry(name, buffer.subarray(dataStart, dataEnd));
        offset = dataEnd;
    }
    return buffer.subarray(offset);
}

// ─── Storage reset runner ───────────────────────────────────────────────────
// Linearizes a storage reset: the reset flag and a new generation are taken
// synchronously; preparation (spooling, validation, decoding) runs outside the
// storage queue; then, inside one storage-queue slot, in-flight inlay
// mutations finish, pending debounced saves are persisted and disarmed, and
// apply() runs. apply() owns the transaction and publishes the restored caches
// before the slot is released. If apply() fails before its COMMIT, the pending
// saves are re-armed so the still-current caches keep being persisted.
const { openSync, readSync, closeSync, renameSync } = require('fs');

async function runStorageReset(kind, { prepare, apply }) {
    if (storageRecoveryRequired) throw new StorageResetRefusal(storageRecoveryRequiredPayload());
    if (storageResetActive) throw storageResetBusyError();
    storageResetActive = true;
    storageResetGeneration += 1;
    const reset = {
        kind,
        attempt: ++storageResetAttempt,
        committed: false,
        entryCount: 0,
        transactionCount: 0,
        cleanup: [],
        temporaryPaths: [],
        metrics: storageResetTestHooks.startMetrics({
            walPath: `${sqliteDb.name}-wal`,
            port: process.env.PORT || 6001,
        }),
    };
    try {
        const prepared = await prepare(reset);
        // The reset's own slot is never subject to a writer admission.
        return await storageAdmissionContext.exit(() => queueStorageOperation(async () => {
            await waitForInlayMutations();
            const pendingSaves = recordPendingSaves();
            try {
                await persistPendingSaves(pendingSaves);
                disarmPendingSaves(pendingSaves);
                return await apply(prepared, reset);
            } catch (error) {
                if (!reset.committed) rearmPendingSaves(pendingSaves);
                throw error;
            }
        }));
    } finally {
        for (const cleanup of reset.cleanup.reverse()) {
            try {
                await cleanup();
            } catch (cleanupError) {
                logger.warn(`[Storage reset] ${kind} cleanup failed:`, cleanupError?.message || cleanupError);
            }
        }
        if (reset.metrics) {
            await reset.metrics.stop({
                kind,
                entryCount: reset.entryCount,
                transactionCount: reset.transactionCount,
            }, { walBytes: reset.walBytesAtCommit ?? 0 }).catch(() => {});
        }
        storageResetActive = false;
    }
}

// Incremental parser over backup bytes: [nameLen u32][name][dataLen u32][data]*.
// Defers Buffer.concat until enough bytes for the next entry are buffered;
// concatenating on every chunk is O(n²) when one entry (e.g.
// database.risudat) far exceeds the chunk size.
function createBackupEntryReader(onEntry) {
    let pendingChunks = [];
    let pendingTotal = 0;
    let nextEntryThreshold = 8;
    return {
        push(chunk) {
            pendingChunks.push(chunk);
            pendingTotal += chunk.length;
            if (pendingTotal < nextEntryThreshold) return;

            const buffer = pendingChunks.length === 1
                ? pendingChunks[0]
                : Buffer.concat(pendingChunks, pendingTotal);
            pendingChunks = [];
            pendingTotal = 0;

            const remaining = parseBackupChunk(buffer, onEntry);
            if (remaining.length === 0) {
                nextEntryThreshold = 8;
                return;
            }
            pendingChunks.push(remaining);
            pendingTotal = remaining.length;
            if (remaining.length < 4) {
                nextEntryThreshold = 8;
                return;
            }
            const nameLen = remaining.readUInt32LE(0);
            const headerEnd = 4 + nameLen + 4;
            if (remaining.length < headerEnd) {
                nextEntryThreshold = headerEnd;
            } else {
                nextEntryThreshold = headerEnd + remaining.readUInt32LE(4 + nameLen);
            }
        },
        finish() {
            if (pendingTotal > 0) {
                throw new Error('Backup stream ended with incomplete entry');
            }
        },
    };
}

// Synchronous second pass over the spooled (or local) backup file.
function readBackupFileSync(filePath, onEntry) {
    const reader = createBackupEntryReader(onEntry);
    const fd = openSync(filePath, 'r');
    try {
        const chunk = Buffer.allocUnsafe(1024 * 1024);
        let bytesRead;
        while ((bytesRead = readSync(fd, chunk, 0, chunk.length, null)) > 0) {
            reader.push(Buffer.from(chunk.subarray(0, bytesRead)));
        }
    } finally {
        closeSync(fd);
    }
    reader.finish();
}

function discardRequestBody(req) {
    if (req.readableEnded || req.destroyed) return Promise.resolve();
    return new Promise((resolve) => {
        req.once('end', resolve);
        req.once('close', resolve);
        req.once('error', resolve);
        req.resume();
    });
}

function walFileSize() {
    try {
        return require('fs').statSync(`${sqliteDb.name}-wal`).size;
    } catch {
        return 0;
    }
}

// Inside a reset transaction: the prepared database already went through
// REMOTE-block inlining, which is what the first decode after a reset used to
// do (including its pre-migration copy of the restored bytes).
function recordPreparedRemoteMigration(prepared, rawDatabaseBytes) {
    if (prepared.remoteBlocksInlined) {
        const migrationBackupKey = `migration-backup/pre-remote-fix-${Date.now()}.bin`;
        kvSet(migrationBackupKey, rawDatabaseBytes);
        logger.info(`[Migration] REMOTE blocks detected in the restored database.bin; inlined. Pre-migration copy at ${migrationBackupKey}`);
    }
    markRemoteMigrationDone();
}

// Staged reader over rows that a reset will insert (save folder) or that it
// captured from live KV (snapshot restore). A cold-storage key falls back to
// its legacy '<key>.json' row, like readColdStorageJsonEntry.
function createStagedRowReader(readRow) {
    const captured = new Map();
    return (key) => {
        if (!captured.has(key)) {
            let value = readRow(key);
            if (!value && key.startsWith('coldstorage/')) value = readRow(`${key}.json`);
            captured.set(key, value ? Buffer.from(value) : null);
        }
        return captured.get(key);
    };
}

function prepareResetDatabase(rawDatabase, readEntry) {
    // As on the live path, a REMOTE block without its remotes/ row is dropped
    // with the decoder's warning.
    return storageResetPrepare.prepareRestoredDatabase({
        rawDatabase,
        readEntry,
        unresolvedRemote: 'drop',
    }, {
        decodeRisuSave,
        normalizeJSON,
        encodeRisuSaveLegacy,
        randomUUID: () => nodeCrypto.randomUUID(),
        computeBufferEtag,
    });
}

// Publishes a prepared database after COMMIT and drops other decoded caches.
function publishPreparedReset(prepared) {
    installPreparedDatabaseCaches(prepared);
    for (const cacheKey of Object.keys(dbCache)) {
        if (cacheKey !== DB_HEX_KEY) delete dbCache[cacheKey];
    }
}

function logPreparedColdStorage(prepared) {
    const coldStorage = prepared.coldStorage;
    if (coldStorage.failed > 0) {
        logger.error(`[ColdStorage] ${coldStorage.failed} character(s) could not be restored and were converted to safe blank characters. Cold storage KV data is preserved.`);
        for (const name of coldStorage.failedNames) {
            logger.error(`[ColdStorage]   - "${name}"`);
        }
    }
}

function isBackupInlayEntryName(name) {
    return Boolean(parseInlayBackupName(name))
        || Boolean(parseInlaySidecarBackupName(name))
        || name.startsWith('inlay_info/')
        || name.startsWith('inlay_thumb/');
}

// ─── Shared backup import logic ─────────────────────────────────────────────
// Accepts any async iterable of Buffer chunks (HTTP request body, file stream,
// etc.). A request body is spooled to a temporary file; a local backup file
// (localFilePath) is validated in place. Preparation validates every entry,
// stages inlay files and prepares the database outside the storage queue;
// the restore itself is one synchronous transaction inside a reset slot.
async function importBackupFromSource(dataSource, { maxBytes = 0, totalBytes = 0, onProgress = null } = {}) {
    // localFilePath: restore a backup file in place instead of spooling.
    const importOptions = arguments[1] ?? {};
    const localFilePath = importOptions.localFilePath ?? null;
    return runStorageReset(localFilePath ? 'server-restore' : 'backup-import', {
        prepare: (reset) => prepareBackupImport(dataSource, {
            maxBytes,
            totalBytes,
            onProgress,
            localFilePath,
            reset,
        }),
        apply: (importState, reset) => applyBackupImportInResetSlot(importState, reset, importOptions),
    });
}

// Runs inside the reset slot: the pre-restore persist/snapshot step, then the
// synchronous transaction. importOptions carries caller options for that step.
async function applyBackupImportInResetSlot(importState, reset, importOptions) {
    await storageResetTestHooks.waitAtResetGate(reset.kind);
    await flushPendingDb();
    createBackupAndRotate();

    sqliteDb.pragma('synchronous = OFF');
    return applyBackupImport(importState, reset);
}

async function prepareBackupImport(dataSource, { maxBytes, totalBytes, onProgress, localFilePath, reset }) {
    let hasDatabase = false;
    let databaseBytes = null;
    let assetsRestored = 0;
    let bytesReceived = 0;
    let entryCount = 0;
    const seenEntryNames = new Set();
    const importedInlayIds = new Set();
    const importedSidecarIds = new Set();
    const explicitSidecarMap = new Map();
    const legacyInlayInfoMap = new Map();
    const stagedColdStorage = new Map();

    const stagingDir = path.join(savePath, 'inlays_import_staging');
    // An earlier interrupted import may have left the only copy of the
    // previous inlays here; it is kept until the next successful import.
    const legacyBackupInlayDir = path.join(savePath, 'inlays_import_backup');
    await fs.rm(stagingDir, { recursive: true, force: true });
    if (existsSync(legacyBackupInlayDir)) {
        logger.warn(`[Backup Import] Keeping the inlay copy left by an interrupted import until this import succeeds: ${legacyBackupInlayDir}`);
    }
    reset.cleanup.push(() => fs.rm(stagingDir, { recursive: true, force: true }));
    reset.temporaryPaths.push(stagingDir);
    await fs.mkdir(stagingDir, { recursive: true });

    let spoolPath = null;
    let spoolHandle = null;
    if (!localFilePath) {
        const spoolDir = storageResetTestHooks.spoolDirectory() ?? savePath;
        spoolPath = path.join(
            spoolDir,
            `.storage-reset-spool-${process.pid}-${Date.now()}-${nodeCrypto.randomBytes(6).toString('hex')}.bin`,
        );
        reset.cleanup.push(() => fs.rm(spoolPath, { force: true }));
        reset.temporaryPaths.push(spoolPath);
        spoolHandle = await fs.open(spoolPath, 'wx');
    }
    reset.metrics?.setTemporaryPaths(reset.temporaryPaths);

    function stagingInlayFilePath(id, ext) {
        return path.join(stagingDir, `${id}.${normalizeInlayExt(ext)}`);
    }
    function stagingSidecarPath(id) {
        return path.join(stagingDir, `${id}.meta.json`);
    }
    function writeStagingInlayFileSync(id, ext, buffer, info) {
        const normalizedExt = normalizeInlayExt(ext);
        writeFileSync(stagingInlayFilePath(id, normalizedExt), Buffer.from(buffer));
        const sidecar = {
            ext: normalizedExt,
            name: typeof info?.name === 'string' ? info.name : id,
            type: typeof info?.type === 'string' ? info.type : 'image',
            height: typeof info?.height === 'number' ? info.height : undefined,
            width: typeof info?.width === 'number' ? info.width : undefined,
        };
        writeFileSync(stagingSidecarPath(id), JSON.stringify(sidecar));
    }
    function writeStagingSidecarSync(id, info) {
        const sidecar = {
            ext: normalizeInlayExt(info?.ext),
            name: typeof info?.name === 'string' ? info.name : id,
            type: typeof info?.type === 'string' ? info.type : 'image',
            height: typeof info?.height === 'number' ? info.height : undefined,
            width: typeof info?.width === 'number' ? info.width : undefined,
        };
        writeFileSync(stagingSidecarPath(id), JSON.stringify(sidecar));
    }

    const reader = createBackupEntryReader((name, data) => {
        if (seenEntryNames.has(name)) {
            throw new Error(`Duplicate backup entry: ${name}`);
        }
        seenEntryNames.add(name);
        entryCount += 1;

        const inlayRaw = parseInlayBackupName(name);
        const inlaySidecar = parseInlaySidecarBackupName(name);

        if (inlayRaw) {
            importedInlayIds.add(inlayRaw.id);
            if (inlayRaw.ext) {
                writeStagingInlayFileSync(inlayRaw.id, inlayRaw.ext, data, legacyInlayInfoMap.get(inlayRaw.id) || { ext: inlayRaw.ext, name: inlayRaw.id, type: 'image' });
            } else if (data.length > 0 && data[0] === 0x7b) {
                const parsed = JSON.parse(data.toString('utf-8'));
                const type = typeof parsed?.type === 'string' ? parsed.type : 'image';
                const ext = normalizeInlayExt(parsed?.ext);
                const buffer = type === 'signature'
                    ? Buffer.from(typeof parsed?.data === 'string' ? parsed.data : '', 'utf-8')
                    : decodeDataUri(parsed?.data).buffer;
                writeStagingInlayFileSync(inlayRaw.id, ext, buffer, legacyInlayInfoMap.get(inlayRaw.id) || {
                    ext,
                    name: typeof parsed?.name === 'string' ? parsed.name : inlayRaw.id,
                    type,
                    height: typeof parsed?.height === 'number' ? parsed.height : undefined,
                    width: typeof parsed?.width === 'number' ? parsed.width : undefined,
                });
            } else {
                writeStagingInlayFileSync(inlayRaw.id, 'bin', data, legacyInlayInfoMap.get(inlayRaw.id) || {
                    ext: 'bin',
                    name: inlayRaw.id,
                    type: 'image',
                });
            }
            if (explicitSidecarMap.has(inlayRaw.id)) {
                writeStagingSidecarSync(inlayRaw.id, explicitSidecarMap.get(inlayRaw.id));
            } else if (!importedSidecarIds.has(inlayRaw.id)) {
                const legacyInfo = legacyInlayInfoMap.get(inlayRaw.id);
                if (legacyInfo) {
                    writeStagingSidecarSync(inlayRaw.id, legacyInfo);
                }
            }
            assetsRestored += 1;
        } else if (inlaySidecar) {
            const parsed = JSON.parse(data.toString('utf-8'));
            explicitSidecarMap.set(inlaySidecar.id, parsed);
            writeStagingSidecarSync(inlaySidecar.id, parsed);
            importedSidecarIds.add(inlaySidecar.id);
        } else if (name.startsWith('inlay_info/')) {
            const id = name.slice('inlay_info/'.length);
            if (!isSafeInlayId(id)) {
                throw new Error(`Invalid legacy inlay info entry name: ${name}`);
            }
            const parsed = JSON.parse(data.toString('utf-8'));
            legacyInlayInfoMap.set(id, {
                ext: normalizeInlayExt(parsed?.ext),
                name: typeof parsed?.name === 'string' ? parsed.name : id,
                type: typeof parsed?.type === 'string' ? parsed.type : 'image',
                height: typeof parsed?.height === 'number' ? parsed.height : undefined,
                width: typeof parsed?.width === 'number' ? parsed.width : undefined,
            });
            if (importedInlayIds.has(id) && !importedSidecarIds.has(id)) {
                writeStagingSidecarSync(id, legacyInlayInfoMap.get(id));
            }
        } else if (name.startsWith('inlay_thumb/')) {
            // Skip deprecated thumbnail entries from legacy backups
        } else {
            const storageKey = resolveBackupStorageKey(name);
            if (storageKey.startsWith('coldstorage/')) {
                stagedColdStorage.set(storageKey, encodeColdStorageCanonicalBuffer(
                    parseColdStorageJsonBuffer(data, name, { allowPlainJson: true }).coldData
                ));
            }
            if (storageKey === 'database/database.bin') {
                hasDatabase = true;
                databaseBytes = Buffer.from(data);
            } else {
                assetsRestored += 1;
            }
        }
    });

    // A failed request upload keeps its connection usable for the error
    // response: the rest of the body is discarded instead of destroying it.
    const isRequestBody = dataSource instanceof http.IncomingMessage;
    const chunks = isRequestBody
        ? dataSource.iterator({ destroyOnReturn: false })
        : dataSource;
    try {
        for await (const chunk of chunks) {
            bytesReceived += chunk.length;
            if (maxBytes > 0 && bytesReceived > maxBytes) {
                throw new Error(`Backup exceeds max allowed size (${maxBytes} bytes)`);
            }
            if (onProgress) onProgress(bytesReceived, totalBytes);

            const buffer = Buffer.from(chunk);
            if (spoolHandle) {
                storageResetTestHooks.checkSpoolWrite(bytesReceived, reset.attempt);
                let offset = 0;
                while (offset < buffer.length) {
                    const { bytesWritten } = await spoolHandle.write(buffer, offset, buffer.length - offset);
                    offset += bytesWritten;
                }
            }
            reader.push(buffer);
        }
        reader.finish();
    } catch (error) {
        if (isRequestBody) await discardRequestBody(dataSource);
        throw error;
    } finally {
        if (spoolHandle) await spoolHandle.close();
    }

    if (!hasDatabase) {
        throw new Error('Backup does not contain database.risudat');
    }
    for (const [id, info] of legacyInlayInfoMap.entries()) {
        if (importedInlayIds.has(id) && !importedSidecarIds.has(id)) {
            writeStagingSidecarSync(id, info);
        }
    }

    // Decode, inline/normalize and build the caches to publish now, before
    // any destructive write. The import wipes remotes/ and a backup carries
    // none, so as before an unresolvable REMOTE block is dropped with the
    // decoder's warning (and the database is re-encoded, as the migration did).
    const database = await prepareResetDatabase(
        databaseBytes,
        (key) => stagedColdStorage.get(key) ?? null,
    );

    return {
        sourcePath: localFilePath || spoolPath,
        rawDatabaseBytes: databaseBytes,
        stagingDir,
        legacyBackupInlayDir,
        stagedColdStorage,
        database,
        assetsRestored,
        bytesReceived,
        entryCount,
    };
}

// Restores the inlay directory after a caught failure. If that is impossible,
// storage writes stay disabled until manual recovery and a restart.
function reverseBackupInlaySwap(swap, stagingDir, oldInlayCopy, reset) {
    if (!swap.oldMoved && !swap.newMoved) return;
    try {
        storageResetTestHooks.failpoint('reverse-inlay-rename', reset.attempt);
        if (swap.newMoved) renameSync(inlayDir, stagingDir);
        if (swap.oldMoved) renameSync(oldInlayCopy, inlayDir);
    } catch (reverseError) {
        const recoveryPath = swap.oldMoved && existsSync(oldInlayCopy) ? oldInlayCopy : inlayDir;
        storageRecoveryRequired = { recoveryPath, at: Date.now() };
        logger.error(
            `[Storage reset] Could not restore the previous inlay directory after a failed ${reset.kind}; `
            + `storage writes are disabled until it is restored manually and the server restarts. `
            + `Previous inlays: ${recoveryPath}`,
            reverseError,
        );
        throw new StorageResetRefusal(storageRecoveryRequiredPayload());
    }
}

// Runs inside the reset slot with no await between BEGIN and COMMIT/ROLLBACK.
function applyBackupImport(importState, reset) {
    const prepared = importState.database;
    const oldInlayCopy = path.join(savePath, `inlays_import_backup-${Date.now()}-${storageResetGeneration}`);
    const swap = { oldMoved: false, newMoved: false };
    // synchronous = OFF was set by applyBackupImportInResetSlot.
    try {
        try {
            sqliteDb.exec('BEGIN');
            reset.transactionCount += 1;
            storageResetTestHooks.trace('begin', { kind: reset.kind });
            storageResetTestHooks.traceNextYield({ kind: reset.kind });
            const epochBefore = readStorageEpoch();
            kvDelPrefix('assets/');
            kvDelPrefix('inlay/');
            kvDelPrefix('inlay_thumb/');
            kvDelPrefix('inlay_meta/');
            kvDelPrefix('inlay_info/');
            kvDelPrefix('coldstorage/');
            // Composer drafts are session/device-local and not carried in the backup;
            // wipe stale ones so an old snapshot's chats don't resurrect later drafts.
            kvDelPrefix('drafts/');
            // Same reasoning as clearExistingData (save-folder import path): wipe stale
            // remote payloads from the prior user before this backup's contents land.
            // .bin backups never carry REMOTE blocks today, so the migration won't
            // resolveRemote on them — but keeping the two import paths consistent
            // avoids a contamination regression if that ever changes (upstream sync,
            // plugin-generated buffers, etc.).
            kvDelPrefix('remotes/');
            kvDelPrefix(CHAT_WRITE_JOURNAL_PREFIX);
            // Durable reset only; in-memory owners are reset after COMMIT.
            kvDel(REMOTE_MIGRATION_MARKER_KEY);
            clearEntities();
            storageResetTestHooks.failpoint('after-destructive-deletes', reset.attempt);

            let entryNumber = 0;
            readBackupFileSync(importState.sourcePath, (name, data) => {
                entryNumber += 1;
                storageResetTestHooks.entryFailpoint(entryNumber, reset.attempt);
                if (isBackupInlayEntryName(name)) return;
                const storageKey = resolveBackupStorageKey(name);
                if (storageKey === 'database/database.bin') {
                    kvSet(storageKey, prepared.databaseBytes);
                } else if (storageKey.startsWith('coldstorage/')) {
                    kvSet(storageKey, importState.stagedColdStorage.get(storageKey));
                } else {
                    kvSet(storageKey, data);
                }
            });
            reset.entryCount = entryNumber;
            recordPreparedRemoteMigration(prepared, importState.rawDatabaseBytes);
            advanceStorageEpoch(epochBefore, reset);

            if (existsSync(inlayDir)) {
                renameSync(inlayDir, oldInlayCopy);
                swap.oldMoved = true;
            }
            storageResetTestHooks.failpoint('second-inlay-rename', reset.attempt);
            renameSync(importState.stagingDir, inlayDir);
            swap.newMoved = true;

            storageResetTestHooks.failpoint('commit-after-inlay-swap', reset.attempt);
            sqliteDb.exec('COMMIT');
            reset.committed = true;
            storageResetTestHooks.trace('commit', { kind: reset.kind });
            if (reset.metrics) reset.walBytesAtCommit = walFileSize();
        } catch (error) {
            if (!reset.committed) {
                try { sqliteDb.exec('ROLLBACK'); } catch (_) {}
                storageResetTestHooks.trace('rollback', { kind: reset.kind });
            }
            reverseBackupInlaySwap(swap, importState.stagingDir, oldInlayCopy, reset);
            throw error;
        }
    } finally {
        sqliteDb.pragma('synchronous = NORMAL');
    }

    // Publish the prepared caches before the slot is released; no journal
    // replay (the journal was discarded with the old data).
    publishPreparedReset(prepared);
    // Memory resets run only after COMMIT.
    chatWriteJournal.resetMemory();

    // Best-effort post-commit cleanup; failures are logged, not rolled back.
    try {
        writeFileSync(inlayMigrationMarker, new Date().toISOString(), 'utf-8');
    } catch (markerError) {
        logger.warn('[Backup Import] Could not write the inlay migration marker:', markerError?.message || markerError);
    }
    try {
        checkpointWal('TRUNCATE');
    } catch (checkpointError) {
        logger.warn('[Backup Import] WAL checkpoint after import failed:', checkpointError);
    }
    for (const leftover of [oldInlayCopy, importState.legacyBackupInlayDir]) {
        if (!existsSync(leftover)) continue;
        fs.rm(leftover, { recursive: true, force: true }).catch((removeError) => {
            logger.warn(`[Backup Import] Could not remove the previous inlay copy ${leftover}:`, removeError?.message || removeError);
        });
    }

    logPreparedColdStorage(prepared);
    const coldStorage = prepared.coldStorage;
    const { assetsRestored, bytesReceived } = importState;
    console.log(`[Backup Import] Complete: ${assetsRestored} assets restored, ${(bytesReceived / 1024 / 1024).toFixed(1)}MB processed`);
    if (coldStorage.failed > 0) {
        logger.error(`[Backup Import] ${coldStorage.failed} cold storage character(s) could not be restored`);
    }
    return { assetsRestored, bytesReceived, coldStorageFailed: coldStorage.failed };
}

app.get('/', async (req, res, next) => {

    const clientIP = req.ip || 'Unknown IP';
    const timestamp = new Date().toISOString();
    console.log(`[Server] ${timestamp} | Connection from: ${clientIP}`);
    
    try {
        const mainIndex = await fs.readFile(path.join(process.cwd(), 'dist', 'index.html'))
        const root = htmlparser.parse(mainIndex)
        const head = root.querySelector('head')
        head.innerHTML = `<script>globalThis.__NODE__ = true; globalThis.__PATCH_SYNC__ = ${enablePatchSync}</script>` + head.innerHTML
        
        res.send(root.toString())
    } catch (error) {
        console.log(error)
        next(error)
    }
})

async function checkAuth(req, res, returnOnlyStatus = false, {allowExpired = false} = {}){
    try {
        const authHeader = req.headers['risu-auth'];

        if(!authHeader){
            console.log('No auth header')
            if(returnOnlyStatus){
                return false;
            }
            res.status(400).send({
                error:'No auth header'
            });
            return false
        }


        //jwt token
        const [
            jsonHeaderB64,
            jsonPayloadB64,
            signatureB64,
        ] = authHeader.split('.');

        //alg, typ
        const jsonHeader = JSON.parse(Buffer.from(jsonHeaderB64, 'base64url').toString('utf-8'));

        //iat, exp
        const jsonPayload = JSON.parse(Buffer.from(jsonPayloadB64, 'base64url').toString('utf-8'));

        
        //check expiration
        if(!allowExpired){
            const now = Math.floor(Date.now() / 1000);
            if(jsonPayload.exp < now){
                console.log('Token expired')
                if(returnOnlyStatus){
                    return false;
                }
                res.status(400).send({
                    error:'Token Expired'
                });
                return false
            }
        }

        //check signature (HMAC-SHA256)
        if(jsonHeader.alg !== "HS256"){
            console.log('Unsupported algorithm')
            if(returnOnlyStatus){
                return false;
            }
            res.status(400).send({
                error:'Unsupported Algorithm'
            });
            return false
        }

        const expectedSig = nodeCrypto.createHmac('sha256', jwtSecret)
            .update(`${jsonHeaderB64}.${jsonPayloadB64}`)
            .digest()
        const actualSig = Buffer.from(signatureB64, 'base64url')

        if(expectedSig.length !== actualSig.length || !nodeCrypto.timingSafeEqual(expectedSig, actualSig)){
            console.log('Invalid signature')
            if(returnOnlyStatus){
                return false;
            }
            res.status(400).send({
                error:'Invalid Signature'
            });
            return false
        }
        return true
    } catch (error) {
        console.log(error)
        if(returnOnlyStatus){
            return false;
        }
        res.status(500).send({
            error:'Internal Server Error'
        });
        return false
    }
}

const reverseProxyFunc = async (req, res, next) => {
    if(!await checkAuth(req, res)){
        return;
    }
    
    const urlParam = req.headers['risu-url'] ? decodeURIComponent(req.headers['risu-url']) : req.query.url;

    if (!urlParam) {
        res.status(400).send({
            error:'URL has no param'
        });
        return;
    }
    const timeoutMs = getRequestTimeoutMs(req.headers['risu-timeout-ms']);
    const timeout = createTimeoutController(timeoutMs);
    let originalResponse;
    try {
    const header = req.headers['risu-header'] ? JSON.parse(decodeURIComponent(req.headers['risu-header'])) : req.headers;
    if (req.headers['x-risu-tk'] && !header['x-risu-tk']) {
        header['x-risu-tk'] = req.headers['x-risu-tk'];
    }
    if (req.headers['risu-location'] && !header['risu-location']) {
        header['risu-location'] = req.headers['risu-location'];
    }
    if(!header['x-forwarded-for']){
        header['x-forwarded-for'] = req.ip
    }

    if(req.headers['authorization']?.startsWith('X-SERVER-REGISTER')){
        if(!existsSync(authCodePath)){
            delete header['authorization']
        }
        else{
            const authCode = await fs.readFile(authCodePath, {
                encoding: 'utf-8'
            })
            header['authorization'] = `Bearer ${authCode}`
        }
    }
        let requestBody = undefined;
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            if (Buffer.isBuffer(req.body) || typeof req.body === 'string') {
                requestBody = req.body;
            }
            else if (req.body !== undefined) {
                requestBody = JSON.stringify(req.body);
            }
        }
        // make request to original server
        originalResponse = await fetch(urlParam, {
            method: req.method,
            headers: header,
            body: requestBody,
            signal: timeout.signal
        });
        // get response body as stream
        const originalBody = originalResponse.body;
        // get response headers
        const head = new Headers(originalResponse.headers);
        head.delete('content-security-policy');
        head.delete('content-security-policy-report-only');
        head.delete('clear-site-data');
        head.delete('Cache-Control');
        head.delete('Content-Encoding');
        // Node's fetch already decompressed the body, so the upstream
        // (compressed) Content-Length no longer matches and would truncate the
        // response. Drop it and let the body stream out chunked.
        head.delete('Content-Length');
        const headObj = {};
        for (let [k, v] of head) {
            headObj[k] = v;
        }
        // send response headers to client
        res.header(headObj);
        // send response status to client
        res.status(originalResponse.status);
        // send response body to client
        await pipeline(originalResponse.body, res);


    }
    catch (err) {
        if (err?.name === 'AbortError') {
            if (!res.headersSent) {
                res.status(504).send({
                    error: timeoutMs
                        ? `Proxy request timed out after ${timeoutMs}ms`
                        : 'Proxy request aborted'
                });
            } else {
                res.end();
            }
            return;
        }
        // Pass the actual `err` (not err.cause) so logger.* can tag it and the
        // Express error middleware knows to skip. The cause chain is preserved
        // via formatErrorWithCause in normalizeArgs.
        logger.error(`[Proxy] ${req.method} ${urlParam}`, err);
        next(err);
        return;
    } finally {
        timeout.cleanup();
    }
}

const reverseProxyFunc_get = async (req, res, next) => {
    if(!await checkAuth(req, res)){
        return;
    }
    
    const urlParam = req.headers['risu-url'] ? decodeURIComponent(req.headers['risu-url']) : req.query.url;

    if (!urlParam) {
        res.status(400).send({
            error:'URL has no param'
        });
        return;
    }
    const timeoutMs = getRequestTimeoutMs(req.headers['risu-timeout-ms']);
    const timeout = createTimeoutController(timeoutMs);
    let originalResponse;
    try {
    const header = req.headers['risu-header'] ? JSON.parse(decodeURIComponent(req.headers['risu-header'])) : req.headers;
    if (req.headers['x-risu-tk'] && !header['x-risu-tk']) {
        header['x-risu-tk'] = req.headers['x-risu-tk'];
    }
    if (req.headers['risu-location'] && !header['risu-location']) {
        header['risu-location'] = req.headers['risu-location'];
    }
    if(!header['x-forwarded-for']){
        header['x-forwarded-for'] = req.ip
    }
        // make request to original server
        originalResponse = await fetch(urlParam, {
            method: 'GET',
            headers: header,
            signal: timeout.signal
        });
        // get response body as stream
        const originalBody = originalResponse.body;
        // get response headers
        const head = new Headers(originalResponse.headers);
        head.delete('content-security-policy');
        head.delete('content-security-policy-report-only');
        head.delete('clear-site-data');
        head.delete('Cache-Control');
        head.delete('Content-Encoding');
        // Node's fetch already decompressed the body, so the upstream
        // (compressed) Content-Length no longer matches and would truncate the
        // response. Drop it and let the body stream out chunked.
        head.delete('Content-Length');
        const headObj = {};
        for (let [k, v] of head) {
            headObj[k] = v;
        }
        // send response headers to client
        res.header(headObj);
        // send response status to client
        res.status(originalResponse.status);
        // send response body to client
        await pipeline(originalResponse.body, res);
    }
    catch (err) {
        if (err?.name === 'AbortError') {
            if (!res.headersSent) {
                res.status(504).send({
                    error: timeoutMs
                        ? `Proxy request timed out after ${timeoutMs}ms`
                        : 'Proxy request aborted'
                });
            } else {
                res.end();
            }
            return;
        }
        next(err);
        return;
    } finally {
        timeout.cleanup();
    }
}

let accessTokenCache = {
    token: null,
    expiry: 0
}
async function getSionywAccessToken() {
    if(accessTokenCache.token && Date.now() < accessTokenCache.expiry){
        return accessTokenCache.token;
    }
    //Schema of the client data file
    // {
    //     refresh_token: string;
    //     client_id: string;
    //     client_secret: string;
    // }
    
    const clientDataPath = path.join(process.cwd(), 'save', '__sionyw_client_data.json');
    let refreshToken = ''
    let clientId = ''
    let clientSecret = ''
    if(!existsSync(clientDataPath)){
        throw new Error('No Sionyw client data found');
    }
    const clientDataRaw = readFileSync(clientDataPath, 'utf-8');
    const clientData = JSON.parse(clientDataRaw);
    refreshToken = clientData.refresh_token;
    clientId = clientData.client_id;
    clientSecret = clientData.client_secret;

    //Oauth Refresh Token Flow
    
    const tokenResponse = await fetch('account.sionyw.com/account/api/oauth/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: clientId,
            client_secret: clientSecret
        })
    })

    if(!tokenResponse.ok){
        throw new Error('Failed to refresh Sionyw access token');
    }

    const tokenData = await tokenResponse.json();

    //Update the refresh token in the client data file
    if(tokenData.refresh_token && tokenData.refresh_token !== refreshToken){
        clientData.refresh_token = tokenData.refresh_token;
        writeFileSync(clientDataPath, JSON.stringify(clientData), 'utf-8');
    }

    accessTokenCache.token = tokenData.access_token;
    accessTokenCache.expiry = Date.now() + (tokenData.expires_in * 1000) - (5 * 60 * 1000); //5 minutes early

    return tokenData.access_token;
}


async function hubProxyFunc(req, res) {
    const excludedHeaders = [
        'content-encoding',
        'content-length',
        'transfer-encoding'
    ];

    try {
        let externalURL = '';

        const pathHeader = req.headers['x-risu-node-path'];
        if (pathHeader) {
            const decodedPath = decodeURIComponent(pathHeader);
            externalURL = decodedPath;
        } else {
            const pathAndQuery = req.originalUrl.replace(/^\/hub-proxy/, '');
            externalURL = hubURL + pathAndQuery;
        }
        
        const headersToSend = { ...req.headers };
        delete headersToSend.host;
        delete headersToSend.connection;
        delete headersToSend['content-length'];
        delete headersToSend['x-risu-node-path'];

        const hubOrigin = new URL(hubURL).origin;
        headersToSend.origin = hubOrigin;

        //if Authorization header is "Server-Auth, set the token to be Server-Auth
        if(headersToSend['Authorization'] === 'X-Node-Server-Auth'){
            //this requires password auth
            if(!await checkAuth(req, res)){
                return;
            }

            headersToSend['Authorization'] = "Bearer " + await getSionywAccessToken();
            delete headersToSend['risu-auth'];
        }
        
        
        const response = await fetch(externalURL, {
            method: req.method,
            headers: headersToSend,
            body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
            redirect: 'manual',
            duplex: 'half'
        });
        
        for (const [key, value] of response.headers.entries()) {
            // Skip encoding-related headers to prevent double decoding
            if (excludedHeaders.includes(key.toLowerCase())) {
                continue;
            }
            res.setHeader(key, value);
        }
        res.status(response.status);

        if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
            const redirectUrl = response.headers.get('location');
            const newHeaders = { ...headersToSend };
            const redirectResponse = await fetch(redirectUrl, {
                method: req.method,
                headers: newHeaders,
                body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
                redirect: 'manual',
                duplex: 'half'
            });
            for (const [key, value] of redirectResponse.headers.entries()) {
                if (excludedHeaders.includes(key.toLowerCase())) {
                    continue;
                }
                res.setHeader(key, value);
            }
            res.status(redirectResponse.status);
            if (redirectResponse.body) {
                await pipeline(redirectResponse.body, res);
            } else {
                res.end();
            }
            return;
        }
        
        if (response.body) {
            await pipeline(response.body, res);
        } else {
            res.end();
        }
        
    } catch (error) {
        logger.error("[Hub Proxy] Error:", error);
        if (!res.headersSent) {
            res.status(502).send({ error: 'Proxy request failed: ' + error.message });
        } else {
            res.end();
        }
    }
}

app.get('/proxy', reverseProxyFunc_get);
app.get('/proxy2', reverseProxyFunc_get);
app.get('/hub-proxy/*', hubProxyFunc);

app.post('/proxy', reverseProxyFunc);
app.post('/proxy2', reverseProxyFunc);
app.put('/proxy', reverseProxyFunc);
app.put('/proxy2', reverseProxyFunc);
app.patch('/proxy', reverseProxyFunc);
app.patch('/proxy2', reverseProxyFunc);
app.delete('/proxy', reverseProxyFunc);
app.delete('/proxy2', reverseProxyFunc);
app.post('/hub-proxy/*', hubProxyFunc);

// --- Proxy Stream Job endpoints ---
app.post('/proxy-stream-jobs', async (req, res) => {
    if (!await checkProxyAuth(req, res)) {
        return;
    }

    const rawUrl = typeof req.body?.url === 'string' ? req.body.url : '';
    const encodedUrl = encodeURIComponent(rawUrl);
    const url = sanitizeTargetUrl(decodeURIComponent(encodedUrl));
    if (!url) {
        res.status(400).send({ error: 'Invalid target URL. Only local/private network http(s) endpoints are allowed.' });
        return;
    }

    const method = typeof req.body?.method === 'string' ? req.body.method.toUpperCase() : 'POST';
    if (!['POST', 'GET', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
        res.status(400).send({ error: 'Invalid method' });
        return;
    }

    const bodyBase64 = typeof req.body?.bodyBase64 === 'string' ? req.body.bodyBase64 : '';
    if (bodyBase64.length > PROXY_STREAM_MAX_BODY_BASE64_BYTES) {
        res.status(413).send({ error: 'Request body too large' });
        return;
    }
    if (proxyStreamJobs.size >= PROXY_STREAM_MAX_ACTIVE_JOBS) {
        res.status(429).send({ error: 'Too many active stream jobs. Retry shortly.' });
        return;
    }
    const headers = normalizeForwardHeaders(req.body?.headers);
    const heartbeatSec = normalizeHeartbeatSec(Number(req.body?.heartbeatSec));
    const job = createProxyStreamJob({
        heartbeatSec,
        timeoutMs: req.body?.timeoutMs
    });

    void runProxyStreamJob(job, {
        targetUrl: url,
        headers,
        method,
        bodyBase64,
        clientIp: req.ip
    });

    res.send({
        jobId: job.id,
        heartbeatSec: job.heartbeatSec
    });
});

app.delete('/proxy-stream-jobs/:jobId', async (req, res) => {
    if (!await checkProxyAuth(req, res)) {
        return;
    }
    const job = proxyStreamJobs.get(req.params.jobId);
    if (!job) {
        res.send({ success: true });
        return;
    }
    job.abortController.abort();
    markJobDone(job);
    cleanupJob(job.id);
    res.send({ success: true });
});

// --- Model Job endpoints (durable server-side model-preset relay) ---
// Recorder pattern: the server makes the provider request, streams the bytes
// to the client unchanged, and journals the same bytes to disk so a client
// that disconnects mid-generation can recover the response. All logic lives
// in model-jobs.cjs; registers /api/model-jobs* with /proxy2-level auth.
const { createModelJobs } = require('./model-jobs.cjs');
const modelJobs = createModelJobs({ saveDir: savePath, logger });
modelJobs.registerRoutes(app, { auth: checkProxyAuth });

// app.get('/api/password', async(req, res)=> {
//     if(password === ''){
//         res.send({status: 'unset'})
//     }
//     else if(req.body.password && req.body.password.trim() === password.trim()){
//         res.send({status:'correct'})
//     }
//     else{
//         res.send({status:'incorrect'})
//     }
// })

app.get('/api/test_auth', async(req, res) => {

    if(!password){
        res.send({status: 'unset'})
    }
    else if(!await checkAuth(req, res, true)){
        // JWT missing/invalid – fall back to session cookie (survives page refresh)
        const sessionToken = parseSessionCookie(req)
        if (sessionToken && (sessions.get(sessionToken) ?? 0) > Date.now()) {
            res.send({status: 'success', token: createServerJwt()})
        } else {
            res.send({status: 'incorrect'})
        }
    }
    else{
        res.send({status: 'success', token: createServerJwt()})
    }
})

app.post('/api/login', loginRouteLimiter, async (req, res) => {
    if(password === ''){
        res.status(400).send({error: 'Password not set'})
        return;
    }
    if(req.body.password && req.body.password.trim() === password.trim()){
        res.send({status:'success', token: createServerJwt()})
    }
    else{
        res.status(400).send({error: 'Password incorrect'})
    }
})

// NodeOnly: token refresh endpoint (pairs with server-side JWT)
app.post('/api/token/refresh', async (req, res) => {
    if (!await checkAuth(req, res, false, {allowExpired: true})) return
    res.json({ token: createServerJwt() })
})

// Reload-on-return check: side-effect-free writer-lock state for this session.
// The client calls it when the tab regains visibility/focus and reloads ONLY
// on 'stale' — before the user has done anything, so nothing is lost.
app.get('/api/session/lock-status', async (req, res) => {
    if (!await checkAuth(req, res)) return
    const id = req.headers['x-session-id']
    res.json({ state: sessionLock.peek(typeof id === 'string' ? id : '') })
})

// ── Session cookie issuance (F-0) ──────────────────────────────────────────
// Called once after JWT auth succeeds. Issues a long-lived cookie so that
// <img src="/api/asset/..."> requests can be authenticated without JS.
app.post('/api/session', async (req, res) => {
    if (!await checkAuth(req, res)) return
    const clientSessionId = req.headers['x-session-id']
    if (typeof clientSessionId === 'string') {
        // Registers the boot; takes the lock only if nobody holds it.
        sessionLock.register(clientSessionId)
        console.log('[Session] Session boot registered')
    }
    const token = nodeCrypto.randomBytes(32).toString('hex')
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000
    sessions.set(token, expiresAt)
    // Prune stale sessions (bounded by single-user usage, safe to do inline)
    for (const [t, exp] of sessions) {
        if (exp < Date.now()) sessions.delete(t)
    }
    saveSessions()
    const maxAge = 7 * 24 * 60 * 60 // seconds
    res.setHeader('Set-Cookie', `risu-session=${token}; HttpOnly; SameSite=Strict; Max-Age=${maxAge}; Path=/`)
    res.json({ ok: true })
})

// ── Direct asset serving (F-1) ─────────────────────────────────────────────
// Serves KV-stored assets as proper HTTP responses with long-term caching.
// Key is hex-encoded to safely pass through URL. Auth via session cookie.
//
// Storage formats differ by key prefix:
//   assets/*        → raw binary (Uint8Array)
//   inlay/*         → JSON { data: "data:<mime>;base64,...", ext, type, ... }
//   inlay_thumb/*   → JSON { data: "data:<mime>;base64,...", ext, type, ... }

/**
 * Extract raw binary and content-type from a KV value.
 * Handles both raw binary (assets/) and JSON+base64 wrapped (inlay/) formats.
 */
function resolveAssetPayload(key, rawValue) {
    // inlay/ and inlay_thumb/ keys store JSON with base64 data URI
    if (key.startsWith('inlay/') || key.startsWith('inlay_thumb/')) {
        try {
            const json = JSON.parse(rawValue.toString('utf-8'))
            const dataUri = json.data
            if (typeof dataUri === 'string' && dataUri.startsWith('data:')) {
                // Parse "data:<mime>;base64,<payload>"
                const commaIdx = dataUri.indexOf(',')
                const meta = dataUri.substring(5, commaIdx) // after "data:"
                const mime = meta.split(';')[0]
                const binary = Buffer.from(dataUri.substring(commaIdx + 1), 'base64')
                return { binary, contentType: mime || 'application/octet-stream' }
            }
            // Fallback: ext field
            const ext = (json.ext || '').toLowerCase()
            const mime = ASSET_EXT_MIME[ext] || 'application/octet-stream'
            return { binary: rawValue, contentType: mime }
        } catch {
            // JSON parse failed — treat as raw binary
        }
    }

    // assets/* and others: raw binary
    const ext = key.split('.').pop()?.toLowerCase()
    const contentType = ASSET_EXT_MIME[ext] || detectMime(rawValue)
    return { binary: rawValue, contentType }
}

const THUMB_MAX_SIDE = 320;
const THUMB_QUALITY = 75;
const THUMB_IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);

async function generateThumbnail(buffer) {
    const vips = await getVips()
    const img = vips.Image.thumbnailBuffer(buffer, THUMB_MAX_SIDE, {
        height: THUMB_MAX_SIDE,
        size: 'down',
    })
    try {
        const out = img.writeToBuffer('.webp', { Q: THUMB_QUALITY })
        return Buffer.from(out);
    } finally {
        img.delete()
    }
}

app.get('/api/asset/:hexKey', sessionAuthMiddleware, async (req, res) => {
    try {
        const key = Buffer.from(req.params.hexKey, 'hex').toString('utf-8')

        if (key.startsWith('inlay/')) {
            const id = key.slice('inlay/'.length)
            const file = await readInlayFile(id)
            if (file) {
                const etag = `"${Math.floor(file.mtimeMs)}"`
                if (req.headers['if-none-match'] === etag) {
                    return res.status(304).set('Cache-Control', 'public, max-age=31536000, immutable').end()
                }
                res.set({
                    'Content-Type': file.mime,
                    'Cache-Control': 'public, max-age=31536000, immutable',
                    'ETag': etag,
                })
                return res.send(file.buffer)
            }
            return res.status(404).set('Cache-Control', 'no-store').end()
        }

        if (key.startsWith('inlay_thumb/')) {
            const id = key.slice('inlay_thumb/'.length)
            const sidecar = await readInlaySidecar(id);
            if (!sidecar || sidecar.type !== 'image' || !THUMB_IMAGE_EXTS.has(sidecar.ext)) {
                return res.status(404).end()
            }
            const file = await readInlayFile(id)
            if (!file) return res.status(404).set('Cache-Control', 'no-store').end()
            const etag = `"thumb-${Math.floor(file.mtimeMs)}"`
            if (req.headers['if-none-match'] === etag) {
                return res.status(304).set('Cache-Control', 'public, max-age=31536000, immutable').end()
            }
            const thumb = await generateThumbnail(file.buffer)
            res.set({
                'Content-Type': 'image/webp',
                'Cache-Control': 'public, max-age=31536000, immutable',
                'ETag': etag,
            })
            return res.send(thumb)
        }

        // Fast-path 304: check updated_at BEFORE loading the blob.
        const updatedAt = kvGetUpdatedAt(key)
        if (updatedAt === null) return res.status(404).set('Cache-Control', 'no-store').end()

        const etag = `"${updatedAt}"`
        if (req.headers['if-none-match'] === etag) {
            return res.status(304).set('Cache-Control', 'public, max-age=31536000, immutable').end()
        }

        const data = kvGet(key)
        if (!data) return res.status(404).set('Cache-Control', 'no-store').end()

        const { binary, contentType } = resolveAssetPayload(key, data)
        res.set({
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=31536000, immutable',
            'ETag': etag,
        })
        res.send(binary)
    } catch (error) {
        logger.error('[Asset] Failed to serve asset:', error);
        res.status(500).end()
    }
})

app.post('/api/crypto', async (req, res) => {
    try {
        const hash = nodeCrypto.createHash('sha256')
        hash.update(Buffer.from(req.body.data, 'utf-8'))
        res.send(hash.digest('hex'))
    } catch (error) {
        res.status(500).send({ error: 'Crypto operation failed' });
    }
})

// Vertex / google-service-account access tokens. The browser cannot sign the
// RS256 JWT itself: crypto.subtle needs a Secure Context that HTTP remote
// access lacks, and node:crypto isn't in the client bundle. So the client
// forwards the SA JSON here and the server signs + exchanges it. Google's token
// response is forwarded verbatim so the client maps statuses unchanged.
// Never log the SA JSON / private key / assertion / OAuth body.
const GOOGLE_OAUTH_TOKEN_URI = 'https://oauth2.googleapis.com/token'
app.post('/api/model-preset/google-service-account/token', async (req, res) => {
    if (!await checkAuth(req, res)) return
    try {
        const serviceAccountJson = req.body && req.body.serviceAccountJson
        const scope = (req.body && typeof req.body.scope === 'string' && req.body.scope.length > 0)
            ? req.body.scope
            : 'https://www.googleapis.com/auth/cloud-platform'
        if (typeof serviceAccountJson !== 'string' || serviceAccountJson.length === 0) {
            res.status(400).send({ error: 'serviceAccountJson required' })
            return
        }
        let sa
        try {
            sa = JSON.parse(serviceAccountJson)
        } catch {
            res.status(400).send({ error: 'invalid service account JSON' })
            return
        }
        const clientEmail = sa && sa.client_email
        const privateKey = sa && sa.private_key
        const kid = sa && sa.private_key_id
        const tokenUri = (sa && typeof sa.token_uri === 'string' && sa.token_uri.length > 0)
            ? sa.token_uri
            : GOOGLE_OAUTH_TOKEN_URI
        if (typeof clientEmail !== 'string' || typeof privateKey !== 'string') {
            res.status(400).send({ error: 'service account missing client_email / private_key' })
            return
        }
        // SSRF / signed-JWT exfiltration guard: only Google's documented endpoint.
        if (tokenUri !== GOOGLE_OAUTH_TOKEN_URI) {
            res.status(400).send({ error: 'unsupported token_uri' })
            return
        }
        const nowSec = Math.floor(Date.now() / 1000)
        const header = { alg: 'RS256', typ: 'JWT' }
        if (typeof kid === 'string' && kid.length > 0) header.kid = kid
        const payload = { iss: clientEmail, scope, aud: tokenUri, iat: nowSec, exp: nowSec + 3600 }
        const signingInput =
            `${Buffer.from(JSON.stringify(header)).toString('base64url')}.` +
            `${Buffer.from(JSON.stringify(payload)).toString('base64url')}`
        let signature
        try {
            const signer = nodeCrypto.createSign('RSA-SHA256')
            signer.update(signingInput)
            signer.end()
            signature = signer.sign(privateKey).toString('base64url')
        } catch {
            res.status(400).send({ error: 'failed to sign with the provided private key' })
            return
        }
        const assertion = `${signingInput}.${signature}`

        let googleRes
        try {
            googleRes = await fetch(tokenUri, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Accept: 'application/json',
                },
                body: new URLSearchParams({
                    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                    assertion,
                }).toString(),
            })
        } catch {
            res.status(502).send({ error: 'OAuth token endpoint unreachable' })
            return
        }

        // Forward Google's status + body verbatim (client maps errors).
        const text = await googleRes.text().catch(() => '')
        const contentType = googleRes.headers.get('content-type')
        if (contentType) res.set('content-type', contentType)
        res.status(googleRes.status).send(text)
    } catch {
        res.status(500).send({ error: 'service account token exchange failed' })
    }
})


app.post('/api/set_password', async (req, res) => {
    if(password === ''){
        password = req.body.password
        writeFileSync(passwordPath, password, 'utf-8')
        res.send({status: 'success'})
    }
    else{
        res.status(400).send("already set")
    }
})

app.get('/api/read', async (req, res, next) => {
    if(!await checkAuth(req, res)){
        return;
    }
    const filePath = req.headers['file-path'];
    if (!filePath) {
        console.log('no path')
        res.status(400).send({ error:'File path required' });
        return;
    }
    if(!isHex(filePath)){
        res.status(400).send({ error:'Invaild Path' });
        return;
    }
    try {
        const key = Buffer.from(filePath, 'hex').toString('utf-8');
        const readOperation = async () => {
        // Flush pending patches before reading database.bin
        if (key === 'database/database.bin') {
            await flushPendingDb();
            // Allow a private cached copy, but require validation so startup can
            // take the in-memory 304 fast path without serving stale data.
            res.setHeader('Cache-Control', 'private, no-cache');
            if (dbEncodedCache && dbEtag) {
                setRevisionHeaders(res, dbEtag, 'x-db-etag');
                if (requestEtagMatches(req.headers['if-none-match'], dbEtag)) {
                    return res.status(304).end();
                }
                res.setHeader('Content-Type', 'application/octet-stream');
                return res.send(dbEncodedCache);
            }
        }
        let value = null;
        if (key.startsWith('inlay/')) {
            value = await readInlayAssetPayload(key.slice('inlay/'.length));
        } else if (key.startsWith('inlay_info/')) {
            value = await readInlayInfoPayload(key.slice('inlay_info/'.length));
        }
        if (value === null) {
            value = kvGet(key);
        }
        if(value === null){
            res.send();
        } else {
            // Strip chat payloads from database.bin — client gets stubs only
            if (key === 'database/database.bin') {
                try {
                    const dbObj = await decodeDatabaseWithPersistentChatIds(value, {
                        createBackup: true,
                    });
                    await initChatStore(dbObj);
                    const stripped = normalizeJSON(stripChatsFromDb(dbObj));
                    value = cacheStrippedDatabase(stripped);
                } catch (e) {
                    // Log the Error itself (not just e.message) so logger.*
                    // tags it and the Express middleware won't re-log after next().
                    logger.error('[Read] Failed to strip chats from database.bin', e);
                    throw e;
                }
                setRevisionHeaders(res, dbEtag, 'x-db-etag');
                if (requestEtagMatches(req.headers['if-none-match'], dbEtag)) {
                    return res.status(304).end();
                }
            }
            res.setHeader('Content-Type', 'application/octet-stream');
            res.send(value);
        }
        };

        // Unlike inlay and other immutable payload reads, database reads touch
        // the shared stripped cache/full-chat store and may flush a pending
        // debounce. Serialize that entire path with patch/write operations.
        // flushPendingDb itself does not enqueue, so this cannot self-deadlock
        // with /api/db/flush (which independently acquires the same queue).
        if (key === 'database/database.bin') {
            await queueStorageOperation(readOperation);
        } else {
            await readOperation();
        }
    } catch (error) {
        next(error);
    }
});

app.get('/api/remove', async (req, res, next) => {
    if(!await checkAuth(req, res)){
        return;
    }
    if (!checkActiveSession(req, res)) return;
    const filePath = req.headers['file-path'];
    if (!filePath) {
        res.status(400).send({ error:'File path required' });
        return;
    }
    if(!isHex(filePath)){
        res.status(400).send({ error:'Invaild Path' });
        return;
    }
    try {
        if (Buffer.from(filePath, 'hex').toString('utf-8') === DB_BLOB_KEY) {
            await removeDatabaseReset();
            res.send({ success: true });
            return;
        }
        await queueStorageOperation(async () => {
            const key = Buffer.from(filePath, 'hex').toString('utf-8');
            if (key.startsWith('inlay/')) {
                const id = key.slice('inlay/'.length)
                await deleteInlayFile(id)
                kvDel(key);
                kvDel(`inlay_thumb/${id}`);
                kvDel(`inlay_info/${id}`);
                return res.send({ success: true });
            }
            if (key.startsWith('inlay_info/')) {
                await fs.unlink(getInlaySidecarPath(key.slice('inlay_info/'.length))).catch(() => {});
            }
            kvDel(key);
            res.send({ success: true });
        });
    } catch (error) {
        next(error);
    }
});

// Removing database.bin is a storage reset: the database row and the chat
// write journal go in one transaction inside the reset slot, then the caches
// and in-memory owners are reset.
// Owns importInProgress like the other resets (capture exclusion).
async function removeDatabaseReset() {
    if (importInProgress) throw storageResetBusyError();
    importInProgress = true;
    try {
        return await runDatabaseRemoveReset();
    } finally {
        importInProgress = false;
    }
}

function runDatabaseRemoveReset() {
    return runStorageReset('database-remove', {
        prepare: async () => null,
        apply: async (_prepared, reset) => {
            await storageResetTestHooks.waitAtResetGate(reset.kind);
            sqliteDb.transaction(() => {
                reset.transactionCount += 1;
                const epochBefore = readStorageEpoch();
                kvDel(DB_BLOB_KEY);
                advanceStorageEpoch(epochBefore, reset);
                kvDelPrefix(CHAT_WRITE_JOURNAL_PREFIX);
                // Durable reset only; database-remove memory resets run after COMMIT.
            })();
            reset.committed = true;
            invalidateDbCache();
            // Database-remove memory resets run only after COMMIT.
            chatWriteJournal.resetMemory();
        },
    });
}

app.get('/api/list', async (req, res, next) => {
    if(!await checkAuth(req, res)){
        return;
    }
    try {
        const keyPrefix = req.headers['key-prefix'] || '';
        let data;
        if (keyPrefix === 'inlay/') {
            const fileKeys = (await listInlayFiles()).map((entry) => `inlay/${entry.id}`);
            data = [...new Set([
                ...fileKeys,
                ...kvList('inlay/'),
            ])];
        } else {
            data = kvList(keyPrefix || undefined)
                .filter(key => !key.startsWith(CHAT_WRITE_JOURNAL_PREFIX));
        }
        res.send({ success: true, content: data });
    } catch (error) {
        next(error);
    }
});

// ─── /api/logs — client-side error/warning/info log persistence ───────────────
const LOGS_POST_MAX_ENTRIES = 1000;
app.post('/api/logs', async (req, res, next) => {
    if (!await checkAuth(req, res)) return;
    try {
        const body = req.body;
        const entries = Array.isArray(body) ? body : [body];
        if (entries.length === 0) {
            return res.send({ success: true, written: 0 });
        }
        if (entries.length > LOGS_POST_MAX_ENTRIES) {
            return res.status(413).send({ error: `too many entries (max ${LOGS_POST_MAX_ENTRIES})` });
        }
        const prepared = entries
            .filter(e => e && typeof e === 'object' && typeof e.message === 'string')
            .map(e => ({
                timestamp: typeof e.timestamp === 'number' ? e.timestamp : Date.now(),
                level: e.level,
                origin: 'client',
                message: e.message,
                description: e.description,
                source: e.source,
                count: e.count,
                platform: e.platform,
                clientId: e.clientId,
                userAgent: e.userAgent,
            }));
        const written = addLogBatch(prepared);
        res.send({ success: true, written });
    } catch (error) {
        next(error);
    }
});

app.get('/api/logs', async (req, res, next) => {
    if (!await checkAuth(req, res)) return;
    try {
        const parseCsv = (v) => typeof v === 'string' && v.length ? v.split(',').filter(Boolean) : undefined;
        const filterArgs = {
            level: typeof req.query.level === 'string' ? req.query.level : undefined,
            origin: typeof req.query.origin === 'string' ? req.query.origin : undefined,
            since: req.query.since ? Number(req.query.since) : undefined,
            excludeLevels: parseCsv(req.query.exclude_levels),
            excludeOrigins: parseCsv(req.query.exclude_origins),
            excludeBackground: req.query.exclude_background === '1',
        };
        const rows = queryLogs({
            ...filterArgs,
            beforeId: req.query.before_id ? Number(req.query.before_id) : undefined,
            limit: req.query.limit ? Number(req.query.limit) : undefined,
        });
        // total reflects rows matching the same filter — pagination math depends on it.
        res.send({ success: true, content: rows, total: countLogs(filterArgs) });
    } catch (error) {
        next(error);
    }
});

app.delete('/api/logs', async (req, res, next) => {
    if (!await checkAuth(req, res)) return;
    if (!checkActiveSession(req, res)) return;
    try {
        clearLogs();
        res.send({ success: true });
    } catch (error) {
        next(error);
    }
});

// ─── /api/request-logs — provider request log + token usage statistics ───────
// Own SQLite file (save/request-logs.db) with its own rotation policy; see
// server/node/request-logs.cjs. Registered with the same auth the /api/logs
// endpoints use.
const requestLogs = createRequestLogs({ saveDir: savePath });
requestLogs.registerRoutes(app, { auth: checkAuth, activeSession: checkActiveSession });

app.post('/api/write', async (req, res, next) => {
    if(!await checkAuth(req, res)){
        return;
    }
    if (!checkActiveSession(req, res)) return;
    const filePath = req.headers['file-path'];
    const fileContent = req.body;
    if (!filePath || !fileContent) {
        res.status(400).send({ error:'File path required' });
        return;
    }
    if(!isHex(filePath)){
        res.status(400).send({ error:'Invaild Path' });
        return;
    }
    try {
        await queueStorageOperation(async () => {
            const key = Buffer.from(filePath, 'hex').toString('utf-8');
            let incomingStrippedDb = null;

            // ETag conflict detection for database.bin
            if (key === 'database/database.bin') {
                const standardIfMatch = req.headers['if-match'];
                const legacyIfMatch = req.headers['x-if-match'];
                const ifMatch = standardIfMatch || legacyIfMatch;
                const matches = standardIfMatch
                    ? requestEtagMatches(standardIfMatch, dbEtag, { allowWeak: false })
                    : requestEtagMatches(legacyIfMatch, dbEtag);
                if (ifMatch && dbEtag && !matches) {
                    res.status(409).send({
                        error: 'ETag mismatch - concurrent modification detected',
                        currentEtag: dbEtag
                    });
                    return;
                }
            }

            if (key.startsWith('inlay/')) {
                const id = key.slice('inlay/'.length)
                const parsed = JSON.parse(Buffer.from(fileContent).toString('utf-8'));
                const type = typeof parsed?.type === 'string' ? parsed.type : 'image';
                const ext = normalizeInlayExt(parsed?.ext);
                const buffer = type === 'signature'
                    ? Buffer.from(typeof parsed?.data === 'string' ? parsed.data : '', 'utf-8')
                    : decodeDataUri(parsed?.data).buffer;
                await writeInlayFile(id, ext, buffer, {
                    ext,
                    name: typeof parsed?.name === 'string' ? parsed.name : id,
                    type,
                    height: typeof parsed?.height === 'number' ? parsed.height : undefined,
                    width: typeof parsed?.width === 'number' ? parsed.width : undefined,
                });
                kvDel(key);
                kvDel(`inlay_thumb/${id}`);
                kvDel(`inlay_info/${id}`);
            } else if (key.startsWith('inlay_info/')) {
                const id = key.slice('inlay_info/'.length)
                const parsed = JSON.parse(Buffer.from(fileContent).toString('utf-8'));
                await writeInlaySidecar(id, parsed);
                kvDel(key);
            } else if (key === 'database/database.bin') {
                // Client sends stubs-only DB — merge full chats from server before persisting
                try {
                    const incomingDb = normalizeJSON(await decodeRisuSave(fileContent));
                    await ensureChatStore();
                    let acceptedStrippedDb = dbCache[DB_HEX_KEY];
                    if (!acceptedStrippedDb) {
                        const currentRaw = kvGet(key);
                        const currentDb = currentRaw
                            ? normalizeJSON(await decodeRisuSave(currentRaw))
                            : {};
                        acceptedStrippedDb = canonicalizeStrippedDatabase(
                            normalizeJSON(stripChatsFromDb(currentDb))
                        );
                    }
                    incomingStrippedDb = canonicalizeStrippedDatabase(
                        normalizeJSON(stripChatsFromDb(incomingDb))
                    );
                    try {
                        validateStrippedDatabaseTransition(
                            acceptedStrippedDb,
                            incomingStrippedDb,
                            hasFullChatPayload,
                        );
                    } catch (invariantError) {
                        res.status(422).json({
                            error: 'Write rejected: stripped database invariant failed',
                            code: 'DB_INVARIANT_REJECTED',
                            detail: String(invariantError?.message || invariantError),
                            missingFullChat: invariantError?.code === 'MISSING_FULL_CHAT_PAYLOAD'
                                ? { chaId: invariantError.chaId, chatId: invariantError.chatId }
                                : undefined,
                            currentEtag: dbEtag,
                        });
                        return;
                    }
                    const fullDb = reassembleFullDb(incomingStrippedDb);

                    // Mirror the patch-persist guard (persistDbCacheWithChats):
                    // a malformed full-write payload could carry chats with
                    // neither `_stub` nor `message` (the v1.4.x metadata-only
                    // pattern). reassembleFullDb passes them through unchanged
                    // because there's no fullChat lookup to merge in, so they
                    // would land on disk and silently strip user messages.
                    // Normal clients are safe (RisuSaveEncoder runs chatToStub
                    // on every chat first), but external tools / future
                    // regressions could bypass that — keep the guard at the
                    // disk boundary for defense in depth.
                    const losses = findStubFlagLossChats(fullDb);
                    if (losses.length > 0) {
                        const sample = losses.slice(0, 3).map(l => `${l.chaId}/${l.chatId ?? l.chatIndex}`).join(', ');
                        const err = new Error(
                            `write aborted: ${losses.length} chat(s) lost _stub flag without upgrade — `
                            + `would silently strip messages on disk. sample=[${sample}]`
                        );
                        recordPersistFailure(err, '/api/write:stub-flag-loss');
                        logger.error(`[Write] ${err.message}`);
                        res.status(500).json({ error: 'Write aborted: chat data integrity check failed' });
                        return;
                    }

                    const mergedContent = Buffer.from(encodeRisuSaveLegacy(fullDb));
                    kvSet(key, mergedContent);
                    await chatWriteJournal.clearAfterDatabasePersist(incomingStrippedDb);
                    // Publish the merged store only after database.bin is durable.
                    await initChatStore(fullDb);
                } catch (e) {
                    logger.error('[Write] Failed to merge chats into database.bin:', e.message);
                    // Do NOT write stubs-only to disk — that would permanently
                    // destroy existing full chat data. Preserve disk as-is.
                    res.status(500).json({ error: 'Database merge failed' });
                    return;
                }
            } else {
                kvSet(key, fileContent);
            }

            // Keep the canonical stubs-only representation ready for the next
            // conditional startup read.
            if (key === 'database/database.bin') {
                if (saveTimers[DB_HEX_KEY]) {
                    clearTimeout(saveTimers[DB_HEX_KEY]);
                    delete saveTimers[DB_HEX_KEY];
                }
                cacheStrippedDatabase(incomingStrippedDb);
                createBackupAndRotate();
                setRevisionHeaders(res, dbEtag, 'x-db-etag');
            }

            res.send({
                success: true,
                etag: key === 'database/database.bin' ? dbEtag : undefined
            });
        });
    } catch (error) {
        next(error);
    }
});

// NOT session-locked: flush carries no data — it only asks the server to
// fsync what it already has. It fires automatically on tab-hide from EVERY
// device, so gating it on the write lock made a phone going to background
// steal (or trip over) the lock without any user action.
app.post('/api/db/flush', sessionAuthMiddleware, async (req, res, next) => {
    try {
        await queueStorageOperation(async () => {
            await flushPendingDb();
            setRevisionHeaders(res, dbEtag, 'x-db-etag');
            res.send({
                success: true,
                etag: dbEtag ?? undefined
            });
        });
    } catch (error) {
        next(error);
    }
});

// ─── Patch sync endpoint ──────────────────────────────────────────────────────
app.post('/api/patch', async (req, res, next) => {
    if (!enablePatchSync) {
        res.status(404).send({ error: 'Patch sync is not enabled' });
        return;
    }
    if(!await checkAuth(req, res)){
        return;
    }
    if (!checkActiveSession(req, res)) return;
    const filePath = req.headers['file-path'];
    const patch = req.body.patch;
    const expectedHash = req.body.expectedHash;

    if (!filePath || !patch || !expectedHash) {
        res.status(400).send({ error: 'File path, patch, and expected hash required' });
        return;
    }
    if (!isHex(filePath)) {
        res.status(400).send({ error: 'Invaild Path' });
        return;
    }

    // Which step of the patch flow was running when the outer catch fired —
    // without it a bare error name (e.g. RangeError) is undiagnosable.
    let patchStage = 'load';
    try {
        await queueStorageOperation(async () => {
            const decodedKey = Buffer.from(filePath, 'hex').toString('utf-8');
            const cacheKey = decodedKey === 'database/database.bin' ? DB_HEX_KEY : filePath;

            // Load database into memory if not already cached
            // For database.bin, cache holds the STRIPPED version (stubs only)
            if (!dbCache[cacheKey]) {
                const fileContent = kvGet(decodedKey);
                if (fileContent) {
                    const decoded = decodedKey === 'database/database.bin'
                        ? await decodeDatabaseWithPersistentChatIds(fileContent)
                        : normalizeJSON(await decodeRisuSave(fileContent));
                    if (decodedKey === 'database/database.bin') {
                        await initChatStore(decoded);
                        cacheStrippedDatabase(normalizeJSON(stripChatsFromDb(decoded)));
                    } else {
                        dbCache[cacheKey] = decoded;
                    }
                } else {
                    dbCache[cacheKey] = {};
                }
            }

            // Reject patch ops that touch chat-internal fields. Lazy loading
            // strips chats to stubs in dbCache; the only legitimate chat ops
            // are stub metadata (id, name, _stub, lastDate, folderId, modules)
            // or whole-chat add/replace/remove. Field-level ops on chats —
            // particularly remove of message/hypaV3Data/scriptstate/etc —
            // strip the `_stub` flag and cause silent on-disk data loss when
            // reassembleFullDb later sees the metadata-only chat. Reject as
            // 409 so the client falls through to a full write and rebases its
            // patcher baseline. See findStubFlagLossChats for the disk-side
            // partner guard.
            const chatInternalOps = decodedKey === 'database/database.bin'
                ? findChatInternalFieldOps(patch)
                : [];
            if (chatInternalOps.length > 0) {
                const sample = chatInternalOps.slice(0, 5).map(v => `${v.op} ${v.path}`).join(', ');
                logger.warn(
                    `[Patch] Rejected ${chatInternalOps.length} chat-internal field op(s) `
                    + `(would corrupt lazy-loaded chats): ${sample}`
                );
                let currentEtag;
                try {
                    cacheStrippedDatabase(dbCache[cacheKey]);
                    currentEtag = dbEtag;
                } catch {}
                setRevisionHeaders(res, currentEtag, 'x-db-etag');
                res.status(409).send({
                    error: 'Patch rejected: chat-internal field ops not allowed for lazy-loaded chats',
                    code: 'CHAT_GUARD_REJECTED',
                    chatGuardRejected: true,
                    currentEtag,
                });
                return;
            }

            patchStage = 'hash';
            const serverHash = calculateHash(dbCache[cacheKey]).toString(16);

            if (expectedHash !== serverHash) {
                console.log(`[Patch] Hash mismatch for ${decodedKey}: expected=${expectedHash}, server=${serverHash}`);
                let currentEtag = undefined;
                if (decodedKey === 'database/database.bin') {
                    // Encode failure must not upgrade this 409 into a 500.
                    try {
                        cacheStrippedDatabase(dbCache[cacheKey]);
                        currentEtag = dbEtag;
                    } catch {}
                }
                setRevisionHeaders(res, currentEtag, 'x-db-etag');
                res.status(409).send({
                    error: 'Hash mismatch - data out of sync',
                    currentEtag
                });
                return;
            }

            // Apply patch to in-memory database (clone first to prevent partial
            // mutation on failure). structuredClone instead of a JSON round-trip:
            // stringifying the whole DB into one JS string hits V8's ~512MB
            // string ceiling on large databases (RangeError: Invalid string
            // length), which rejected every patch. The cache is normalized to
            // plain JSON values at load, so the clone semantics are identical.
            patchStage = 'clone';
            const snapshot = structuredClone(dbCache[cacheKey]);
            patchStage = 'apply';
            let result;
            let nextDocument;
            try {
                result = applyPatch(snapshot, patch, true, true, true);
                nextDocument = normalizeJSON(result.newDocument);
            } catch (patchErr) {
                // Invalidate corrupted cache entry to force reload on next request
                if (decodedKey === 'database/database.bin') {
                    invalidateStrippedDatabaseCache();
                } else {
                    delete dbCache[cacheKey];
                }
                throw patchErr;
            }

            if (decodedKey === 'database/database.bin') {
                try {
                    await ensureChatStore();
                    validateStrippedDatabaseTransition(
                        dbCache[cacheKey],
                        nextDocument,
                        hasFullChatPayload,
                    );
                } catch (invariantError) {
                    cacheStrippedDatabase(dbCache[cacheKey]);
                    setRevisionHeaders(res, dbEtag, 'x-db-etag');
                    res.status(409).send({
                        error: 'Patch rejected: stripped database invariant failed',
                        code: 'DB_INVARIANT_REJECTED',
                        detail: String(invariantError?.message || invariantError),
                        missingFullChat: invariantError?.code === 'MISSING_FULL_CHAT_PAYLOAD'
                            ? { chaId: invariantError.chaId, chatId: invariantError.chatId }
                            : undefined,
                        currentEtag: dbEtag,
                    });
                    return;
                }
            }
            dbCache[cacheKey] = nextDocument;

            // Schedule save to KV (debounced) — merge full chats back for database.bin
            schedulePatchSave(cacheKey, decodedKey);

            // Update ETag after successful patch (based on stripped version)
            patchStage = 'etag';
            if (decodedKey === 'database/database.bin') {
                cacheStrippedDatabase(dbCache[cacheKey]);
                setRevisionHeaders(res, dbEtag, 'x-db-etag');
            }

            const responsePayload = {
                success: true,
                appliedOperations: result.length,
                etag: decodedKey === 'database/database.bin' ? dbEtag : undefined,
            };
            const persistWarning = currentPersistWarning();
            if (persistWarning) {
                responsePayload.persistWarning = persistWarning;
            }
            res.send(responsePayload);
        });
    } catch (error) {
        const storagePayload = storageResetErrorPayload(error);
        if (storagePayload) {
            if (!res.headersSent) sendStorageResetRefusal(res, storagePayload);
            return;
        }
        const decodedKeyForLog = isHex(filePath) ? Buffer.from(filePath, 'hex').toString('utf-8') : filePath;
        logger.error(
            `[Patch] Error applying patch to ${decodedKeyForLog} (stage=${patchStage}, ops=${Array.isArray(patch) ? patch.length : '?'}): `
            + `${error?.name}: ${error?.message}`,
            error?.stack
        );
        res.status(500).send({
            error: 'Patch application failed: ' + (error && error.message ? error.message : error)
        });
    }
});

// ─── Bulk asset endpoints (3-2-B) ─────────────────────────────────────────────
const BULK_BATCH = 50;

app.post('/api/assets/bulk-read', async (req, res, next) => {
    if(!await checkAuth(req, res)){ return; }
    try {
        const keys = req.body; // string[] — decoded key strings
        if(!Array.isArray(keys)){
            res.status(400).send({ error: 'Body must be a JSON array of keys' });
            return;
        }

        const acceptsBinary = (req.headers['accept'] || '').includes('application/octet-stream');

        if (acceptsBinary) {
            // Binary protocol: [count(4)] then per entry: [keyLen(4)][key][valLen(4)][value]
            // Eliminates ~33% base64 overhead
            const entries = [];
            let totalSize = 4; // count header
            for (let i = 0; i < keys.length; i += BULK_BATCH) {
                const batch = keys.slice(i, i + BULK_BATCH);
                for (const key of batch) {
                    let value = null;
                    if (typeof key === 'string' && key.startsWith('inlay_info/')) {
                        value = await readInlayInfoPayload(key.slice('inlay_info/'.length));
                    }
                    if (value === null) {
                        value = kvGet(key);
                    }
                    if (value !== null) {
                        const keyBuf = Buffer.from(key, 'utf-8');
                        const valBuf = Buffer.from(value);
                        entries.push({ keyBuf, valBuf });
                        totalSize += 4 + keyBuf.length + 4 + valBuf.length;
                    }
                }
            }
            const out = Buffer.allocUnsafe(totalSize);
            let offset = 0;
            out.writeUInt32BE(entries.length, offset); offset += 4;
            for (const { keyBuf, valBuf } of entries) {
                out.writeUInt32BE(keyBuf.length, offset); offset += 4;
                keyBuf.copy(out, offset); offset += keyBuf.length;
                out.writeUInt32BE(valBuf.length, offset); offset += 4;
                valBuf.copy(out, offset); offset += valBuf.length;
            }
            res.set('Content-Type', 'application/octet-stream');
            res.send(out);
        } else {
            // Legacy JSON+base64 fallback
            const results = [];
            for (let i = 0; i < keys.length; i += BULK_BATCH) {
                const batch = keys.slice(i, i + BULK_BATCH);
                for (const key of batch) {
                    let value = null;
                    if (typeof key === 'string' && key.startsWith('inlay_info/')) {
                        value = await readInlayInfoPayload(key.slice('inlay_info/'.length));
                    }
                    if (value === null) {
                        value = kvGet(key);
                    }
                    if (value !== null) {
                        results.push({ key, value: Buffer.from(value).toString('base64') });
                    }
                }
            }
            res.json(results);
        }
    } catch(error){ next(error); }
});

app.post('/api/assets/bulk-write', async (req, res, next) => {
    if(!await checkAuth(req, res)){ return; }
    if (!checkActiveSession(req, res)) return;
    try {
        const entries = req.body; // {key: string, value: base64}[]
        if(!Array.isArray(entries)){
            res.status(400).send({ error: 'Body must be a JSON array of {key, value}' });
            return;
        }
        for(let i = 0; i < entries.length; i += BULK_BATCH){
            const batch = entries.slice(i, i + BULK_BATCH);
            const writeBatch = sqliteDb.transaction(() => {
                for(const { key, value } of batch){
                    kvSet(key, Buffer.from(value, 'base64'));
                }
            });
            writeBatch();
        }
        res.json({ success: true, count: entries.length });
    } catch(error){ next(error); }
});

// ── Settings-only export ────────────────────────────────────────────────────
//
// Multi-instance setups are a common PocketRisu pattern, and re-entering every
// setting by hand on each new instance is the pain this removes. A settings-only
// backup is the full backup minus characters, chats and inlay images: modules,
// plugins, prompt presets, personas, lorebooks, theme and API keys all travel.
//
// Restore stays the ordinary full-replace import — the target is a fresh
// instance, so there is no merge path involved.

/**
 * Trims a decoded database object down to settings only.
 *
 * Chats live inside `characters[].chats`, so dropping characters drops chats
 * with them. `characterOrder` has to go too, or the restored instance keeps
 * folders pointing at character ids that no longer exist.
 */
function stripToSettingsOnly(dbObj) {
    return {
        ...dbObj,
        characters: [],
        characterOrder: [],
    };
}

/**
 * Works out what a settings-only export would ship.
 *
 * Shared by the export endpoint and the estimate endpoint so the number shown
 * in the confirm dialog can't drift from the file the user actually gets.
 *
 * Module assets are reported separately because they dominate the size for
 * anyone using asset-pack modules — several GB against a handful of MB for
 * everything else — and that is the one call worth putting to the user.
 * Note the marginal cost is computed as (all − withoutModules), so an asset a
 * module shares with, say, a persona icon is never billed to the module and
 * never dropped when module assets are excluded.
 */
async function buildSettingsOnlyPlan({ includeModuleAssets = true } = {}) {
    const raw = kvGet('database/database.bin');
    if (!raw) return null;

    // Plain decodeRisuSave, not decodeDatabaseWithPersistentChatIds: that
    // variant runs chat-id and cold-storage migrations and can persist. Both
    // concern data we are about to drop anyway.
    const trimmed = stripToSettingsOnly(await decodeRisuSave(raw));
    const dbValue = Buffer.from(encodeRisuSaveLegacy(trimmed, 'compression'));

    const withModules = buildUncleanableSet(trimmed);
    const withoutModules = buildUncleanableSet(trimmed, { includeModuleAssets: false });
    const keepNames = includeModuleAssets ? withModules : withoutModules;

    let baseCount = 0, baseBytes = 0, moduleCount = 0, moduleBytes = 0;
    for (const entry of kvListWithSizes('assets/')) {
        const name = path.basename(entry.key);
        if (withoutModules.has(name)) {
            baseCount++;
            baseBytes += entry.size;
        } else if (withModules.has(name)) {
            moduleCount++;
            moduleBytes += entry.size;
        }
    }

    const modulesWithAssets = (trimmed.modules ?? [])
        .filter((m) => Array.isArray(m?.assets) && m.assets.length > 0).length;

    return {
        trimmed,
        dbValue,
        keepNames,
        breakdown: {
            dbBytes: dbValue.length,
            baseAssets: { count: baseCount, bytes: baseBytes },
            moduleAssets: { count: moduleCount, bytes: moduleBytes, moduleCount: modulesWithAssets },
        },
    };
}

// Size breakdown for the settings-only confirm dialog. Kept separate from
// /api/db/stats because it has to decode and re-encode the DB, which that
// dashboard poll should not pay for on every load.
app.get('/api/backup/export/settings-estimate', async (req, res, next) => {
    if (!await checkAuth(req, res)) { return; }
    try {
        await flushPendingDb();
        const plan = await buildSettingsOnlyPlan({ includeModuleAssets: true });
        if (!plan) {
            res.status(500).json({ error: 'database.bin missing' });
            return;
        }
        res.json(plan.breakdown);
    } catch (error) {
        next(error);
    }
});

app.get('/api/backup/export', async (req, res, next) => {
    if(!await checkAuth(req, res)){ return; }
    try {
        // ?target=upstream excludes NodeOnly-only inlay namespaces (inlay/,
        // inlay_sidecar/, inlay_meta/). Their entry names contain a slash,
        // which upstream RisuAI's import treats as a path under assets/ and
        // fails with ENOENT. The export becomes lossy on inlay images but
        // imports cleanly into upstream.
        const target = req.query.target === 'upstream' ? 'upstream' : 'nodeonly';
        // ?mode=settings drops characters, chats and inlay images — see
        // buildSettingsOnlyPlan above. &moduleAssets=0 additionally leaves out
        // asset-pack module images, which is where the bulk usually lives.
        const settingsOnly = req.query.mode === 'settings';
        const includeModuleAssets = req.query.moduleAssets !== '0';
        // Flush any pending patches to ensure export includes latest data
        await flushPendingDb();

        // Settings-only re-encodes a trimmed DB up front: its byte length is
        // needed for content-length, and the trimmed object drives the asset
        // filter below. Safe to hold in memory — with characters gone this is
        // orders of magnitude smaller than the live blob.
        let settingsDbValue = null;
        let settingsAssetNames = null;
        if (settingsOnly) {
            const plan = await buildSettingsOnlyPlan({ includeModuleAssets });
            if (!plan) {
                res.status(500).json({ error: 'database.bin missing' });
                return;
            }
            settingsDbValue = plan.dbValue;
            settingsAssetNames = plan.keepNames;
        }

        // Inlay images only ever attach to chat messages, so a settings-only
        // export skips those namespaces for the same reason upstream does.
        const skipInlay = settingsOnly || target === 'upstream';
        const inlayFiles = skipInlay ? [] : await listInlayFiles();
        const inlayEntries = await Promise.all(inlayFiles.map(async (entry) => {
            const stat = await fs.stat(entry.filePath);
            return {
                kind: 'file',
                sourcePath: entry.filePath,
                backupName: `inlay/${entry.id}.${entry.ext}`,
                sortKey: `inlay/${entry.id}`,
                size: stat.size,
            };
        }));
        const sidecarEntries = await Promise.all(inlayFiles.map(async (entry) => {
            const sidecarPath = getInlaySidecarPath(entry.id);
            try {
                const stat = await fs.stat(sidecarPath);
                return {
                    kind: 'sidecar',
                    sourcePath: sidecarPath,
                    backupName: `inlay_sidecar/${entry.id}`,
                    sortKey: `inlay_sidecar/${entry.id}`,
                    size: stat.size,
                };
            } catch {
                return null;
            }
        }));
        const inlayMetaEntries = skipInlay ? [] : kvListWithSizes('inlay_meta/').map((entry) => ({
            kind: 'kv',
            key: entry.key,
            backupName: entry.key,
            sortKey: entry.key,
            size: entry.size,
        }));
        const namespacedEntries = [
            ...kvListWithSizes('assets/')
                // Settings-only keeps just the assets the trimmed DB still
                // points at — persona icons, theme background, notification
                // sounds, module assets. Character art falls out here, which is
                // what actually shrinks the file.
                .filter((entry) => !settingsAssetNames || settingsAssetNames.has(path.basename(entry.key)))
                .map((entry) => ({
                    kind: 'kv',
                    key: entry.key,
                    backupName: path.basename(entry.key),
                    sortKey: entry.key,
                    size: entry.size,
                })),
            // Cold storage holds character payloads only — nothing left to carry
            // once characters are stripped.
            ...(settingsOnly ? [] : listColdStorageBackupEntries()),
            ...inlayMetaEntries,
            ...inlayEntries,
            ...sidecarEntries.filter(Boolean),
        ].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
        const dbSize = settingsOnly ? settingsDbValue.length : kvSize('database/database.bin');
        const totalBytes = namespacedEntries.reduce((sum, entry) => {
            return sum + 8 + Buffer.byteLength(entry.backupName, 'utf-8') + entry.size;
        }, 0) + (dbSize ? 8 + Buffer.byteLength('database.risudat', 'utf-8') + dbSize : 0);

        // Settings-only files get their own name — they are kept around and
        // reused across instances, so they have to be tellable apart from a full
        // backup months later.
        const filenameBase = settingsOnly ? 'risu-settings' : 'risu-backup';
        const filenameSuffix = settingsOnly ? '' : target === 'upstream' ? '-upstream' : '';
        res.setHeader('content-type', 'application/octet-stream');
        res.setHeader('content-disposition', `attachment; filename="${filenameBase}-${Date.now()}${filenameSuffix}.bin"`);
        res.setHeader('content-length', totalBytes);
        res.setHeader('x-risu-backup-assets', namespacedEntries.length);

        let closed = false;
        res.once('close', () => { closed = true; });

        function waitForDrain() {
            if (closed) return Promise.resolve();
            return new Promise(resolve => {
                function done() {
                    res.removeListener('drain', done);
                    res.removeListener('close', done);
                    resolve();
                }
                res.once('drain', done);
                res.once('close', done);
            });
        }

        for (const entry of namespacedEntries) {
            if (closed) break;
            const value = entry.kind === 'kv'
                ? kvGet(entry.key)
                : entry.kind === 'buffer'
                    ? entry.buffer
                    : await fs.readFile(entry.sourcePath);
            if (closed) break;
            if (value) {
                const ok = res.write(encodeBackupEntry(entry.backupName, value));
                if (!ok) {
                    await waitForDrain();
                    if (closed) break;
                }
            }
        }

        if (!closed && dbSize) {
            const dbValue = settingsOnly ? settingsDbValue : kvGet('database/database.bin');
            if (dbValue) {
                const ok = res.write(encodeBackupEntry('database.risudat', dbValue));
                if (!ok) {
                    await waitForDrain();
                }
            }
        }
        if (!closed) res.end();
    } catch (error) {
        next(error);
    }
});

// Pre-flight check: auth + size + disk space before client starts uploading
app.post('/api/backup/import/prepare', async (req, res, next) => {
    if (!await checkAuth(req, res)) { return; }
    if (!checkActiveSession(req, res)) return;
    try {
        if (importInProgress) {
            res.status(409).json({ error: 'Another import is already in progress' });
            return;
        }

        const size = Number(req.body?.size ?? 0);
        if (BACKUP_IMPORT_MAX_BYTES > 0 && size > BACKUP_IMPORT_MAX_BYTES) {
            res.status(413).json({ error: `Backup exceeds max allowed size (${BACKUP_IMPORT_MAX_BYTES} bytes)` });
            return;
        }

        if (size > 0) {
            const disk = await checkDiskSpace(size * BACKUP_DISK_HEADROOM);
            if (!disk.ok) {
                res.status(507).json({
                    error: 'Insufficient disk space',
                    available: disk.available,
                    required: size * BACKUP_DISK_HEADROOM,
                });
                return;
            }
        }

        res.json({ ok: true });
    } catch (error) {
        next(error);
    }
});

app.post('/api/backup/import', async (req, res, next) => {
    if(!await checkAuth(req, res)){ return; }
    if (!checkActiveSession(req, res)) return;

    if (importInProgress) {
        res.status(409).json({ error: 'Another import is already in progress' });
        return;
    }
    importInProgress = true;

    // Disable timeouts for large backup uploads
    const prevRequestTimeout = req.socket.server?.requestTimeout;
    req.socket.setTimeout(0);
    req.socket.setKeepAlive(true);
    if (req.socket.server) req.socket.server.requestTimeout = 0;

    // NDJSON streaming keeps the response socket alive during long
    // post-upload work (WAL checkpoint, cold-storage migration). Without it
    // a reverse proxy in front of the server can hit its response timeout
    // and bounce the request back to the client as 502 Bad Gateway.
    const wantsNdjson = String(req.headers['accept'] ?? '').includes('application/x-ndjson');
    let heartbeatTimer = null;

    try {
        const contentType = String(req.headers['content-type'] ?? '');
        if (contentType && !contentType.includes('application/x-risu-backup') && !contentType.includes('application/octet-stream')) {
            res.status(415).json({ error: 'Unsupported backup content-type' });
            return;
        }

        const contentLength = Number(req.headers['content-length'] ?? '0');
        if (BACKUP_IMPORT_MAX_BYTES > 0 && Number.isFinite(contentLength) && contentLength > BACKUP_IMPORT_MAX_BYTES) {
            res.status(413).json({ error: `Backup exceeds max allowed size (${BACKUP_IMPORT_MAX_BYTES} bytes)` });
            return;
        }

        if (wantsNdjson) {
            res.setHeader('content-type', 'application/x-ndjson');
            res.setHeader('cache-control', 'no-cache, no-transform');
            // Disable nginx response buffering so progress events flush immediately.
            res.setHeader('x-accel-buffering', 'no');
            res.flushHeaders();

            // Periodic keepalive — covers the post-stream phase (commit,
            // inlay dir swap, cold storage migration) where onProgress is silent.
            heartbeatTimer = setInterval(() => {
                if (!res.writableEnded) res.write('{"type":"heartbeat"}\n');
            }, BACKUP_NDJSON_HEARTBEAT_MS);

            let lastProgressWrite = 0;
            const totalBytes = Number.isFinite(contentLength) ? contentLength : 0;
            const result = await importBackupFromSource(req, {
                maxBytes: BACKUP_IMPORT_MAX_BYTES,
                totalBytes,
                onProgress: (received, total) => {
                    const now = Date.now();
                    if (now - lastProgressWrite < 200) return;
                    lastProgressWrite = now;
                    res.write(JSON.stringify({ type: 'progress', bytes: received, totalBytes: total }) + '\n');
                },
            });
            res.write(JSON.stringify({
                type: 'done',
                ok: true,
                assetsRestored: result.assetsRestored,
                coldStorageFailed: result.coldStorageFailed,
            }) + '\n');
            res.end();
        } else {
            const result = await importBackupFromSource(req, { maxBytes: BACKUP_IMPORT_MAX_BYTES });
            res.json({
                ok: true,
                assetsRestored: result.assetsRestored,
                coldStorageFailed: result.coldStorageFailed,
            });
        }
    } catch (error) {
        if (wantsNdjson && res.headersSent) {
            try {
                res.write(JSON.stringify({ type: 'error', message: error?.message || 'backup import failed' }) + '\n');
                res.end();
            } catch (_) {}
        } else {
            next(error);
        }
    } finally {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        importInProgress = false;
        if (req.socket.server && prevRequestTimeout !== undefined) {
            req.socket.server.requestTimeout = prevRequestTimeout;
        }
    }
});

// ── Server-side backup endpoints ────────────────────────────────────────────

// Save current data as a .bin backup file on the server
app.post('/api/backup/server/save', async (req, res, next) => {
    if (!await checkAuth(req, res)) { return; }
    if (!checkActiveSession(req, res)) return;
    try {
        await flushPendingDb();

        // Pre-flight disk check — bail before streaming if the target dir
        // can't fit the backup. Avoids wasted minutes + half-written tmp files.
        try {
            const estimate = await estimateServerBackupSize();
            const required = Math.ceil(estimate * 1.05); // 5% safety margin
            const sf = await fs.statfs(backupsDir);
            const free = sf.bsize * sf.bavail;
            if (estimate > 0 && free < required) {
                return res.status(400).json({
                    error: `Insufficient disk space (need ~${(required / 1024 / 1024).toFixed(0)} MB, free ${(free / 1024 / 1024).toFixed(0)} MB)`,
                    code: 'insufficient_space',
                    required,
                    free,
                });
            }
        } catch (e) {
            // Non-fatal: log and proceed. statfs may be unavailable, in which
            // case the streaming fallback path below still fails gracefully.
            console.warn('[Backup] pre-flight disk check failed:', e?.message || e);
        }

        const inlayFiles = await listInlayFiles();
        const inlayEntries = await Promise.all(inlayFiles.map(async (entry) => {
            const stat = await fs.stat(entry.filePath);
            return { kind: 'file', sourcePath: entry.filePath, backupName: `inlay/${entry.id}.${entry.ext}`, size: stat.size };
        }));
        const sidecarEntries = (await Promise.all(inlayFiles.map(async (entry) => {
            const sidecarPath = getInlaySidecarPath(entry.id);
            try {
                const stat = await fs.stat(sidecarPath);
                return { kind: 'sidecar', sourcePath: sidecarPath, backupName: `inlay_sidecar/${entry.id}`, size: stat.size };
            } catch { return null; }
        }))).filter(Boolean);

        const namespacedEntries = [
            ...kvListWithSizes('assets/').map((e) => ({ kind: 'kv', key: e.key, backupName: path.basename(e.key), size: e.size })),
            ...listColdStorageBackupEntries(),
            ...kvListWithSizes('inlay_meta/').map((e) => ({ kind: 'kv', key: e.key, backupName: e.key, size: e.size })),
            ...inlayEntries,
            ...sidecarEntries,
        ];

        const totalEntries = namespacedEntries.length + 1; // +1 for database
        const totalBytes = namespacedEntries.reduce((sum, e) => sum + e.size, 0);

        // Stream progress as NDJSON
        res.setHeader('content-type', 'application/x-ndjson');
        res.flushHeaders();

        const filename = `risu-backup-${Date.now()}.bin`;
        const finalPath = path.join(backupsDir, filename);
        const tmpPath = finalPath + '.tmp';
        const { createWriteStream: createFsWriteStream } = require('fs');
        const writeStream = createFsWriteStream(tmpPath);

        let closed = false;
        let writeComplete = false;
        res.once('close', () => { closed = true; });

        try {
            await new Promise((resolve, reject) => {
                writeStream.on('error', reject);

                (async () => {
                    let written = 0;
                    let bytesWritten = 0;
                    for (const entry of namespacedEntries) {
                        if (closed) break;
                        const value = entry.kind === 'kv'
                            ? kvGet(entry.key)
                            : entry.kind === 'buffer'
                                ? entry.buffer
                                : await fs.readFile(entry.sourcePath);
                        if (value) {
                            const ok = writeStream.write(encodeBackupEntry(entry.backupName, value));
                            if (!ok) await new Promise(r => writeStream.once('drain', r));
                            bytesWritten += value.length;
                        }
                        written++;
                        if (written % 50 === 0 || written === namespacedEntries.length) {
                            res.write(JSON.stringify({ type: 'progress', current: written, total: totalEntries, bytes: bytesWritten, totalBytes }) + '\n');
                        }
                    }
                    if (closed) throw new Error('Client disconnected during backup save');
                    const dbValue = kvGet('database/database.bin');
                    if (dbValue) {
                        const ok = writeStream.write(encodeBackupEntry('database.risudat', dbValue));
                        if (!ok) await new Promise(r => writeStream.once('drain', r));
                        bytesWritten += dbValue.length;
                    }
                    res.write(JSON.stringify({ type: 'progress', current: totalEntries, total: totalEntries, bytes: bytesWritten, totalBytes }) + '\n');
                    writeStream.end(resolve);
                })().catch(reject);
            });

            // Atomic rename: only expose the file after successful write
            await fs.rename(tmpPath, finalPath);
            writeComplete = true;

            const stat = await fs.stat(finalPath);
            console.log(`[Server Backup] Saved: ${filename} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
            res.write(JSON.stringify({ type: 'done', ok: true, filename, size: stat.size }) + '\n');
            res.end();
        } catch (innerError) {
            // Clean up incomplete temp file
            if (!writeComplete) {
                await fs.unlink(tmpPath).catch(() => {});
            }
            throw innerError;
        }
    } catch (error) {
        if (!res.headersSent) {
            next(error);
        } else {
            res.write(JSON.stringify({ type: 'error', message: error.message }) + '\n');
            res.end();
        }
    }
});

// List backup files on the server
app.get('/api/backup/server/list', async (req, res, next) => {
    if (!await checkAuth(req, res)) { return; }
    try {
        let entries;
        try {
            entries = await fs.readdir(backupsDir, { withFileTypes: true });
        } catch {
            res.json({ backups: [] });
            return;
        }
        const backups = [];
        for (const entry of entries) {
            if (!entry.isFile() || !BACKUP_FILENAME_REGEX.test(entry.name)) continue;
            const stat = await fs.stat(path.join(backupsDir, entry.name));
            const tsMatch = entry.name.match(/^risu-backup-(\d+)\.bin$/);
            backups.push({
                filename: entry.name,
                size: stat.size,
                createdAt: tsMatch ? Number(tsMatch[1]) : stat.mtimeMs,
            });
        }
        backups.sort((a, b) => b.createdAt - a.createdAt);
        res.json({ backups });
    } catch (error) {
        next(error);
    }
});

// Restore from a server backup file
app.post('/api/backup/server/restore', async (req, res, next) => {
    if (!await checkAuth(req, res)) { return; }
    if (!checkActiveSession(req, res)) return;

    if (importInProgress) {
        res.status(409).json({ error: 'Another import is already in progress' });
        return;
    }
    importInProgress = true;

    try {
        const filename = req.body?.filename;
        if (!filename || !BACKUP_FILENAME_REGEX.test(filename)) {
            res.status(400).json({ error: 'Invalid backup filename' });
            return;
        }
        const filePath = path.join(backupsDir, filename);
        let fileStat;
        try {
            fileStat = await fs.stat(filePath);
        } catch {
            res.status(404).json({ error: 'Backup file not found' });
            return;
        }

        const disk = await checkDiskSpace(fileStat.size * BACKUP_DISK_HEADROOM);
        if (!disk.ok) {
            res.status(507).json({
                error: 'Insufficient disk space',
                available: disk.available,
                required: fileStat.size * BACKUP_DISK_HEADROOM,
            });
            return;
        }

        const { createReadStream } = require('fs');
        const stream = createReadStream(filePath, { highWaterMark: 256 * 1024 });
        const result = await importBackupFromSource(stream, {
            totalBytes: fileStat.size,
            localFilePath: filePath,
        });
        // The NDJSON response starts only after the restore has committed, so
        // a validation, preparation or apply failure keeps an error status.
        res.setHeader('content-type', 'application/x-ndjson');
        res.write(JSON.stringify({ type: 'progress', bytes: fileStat.size, totalBytes: fileStat.size }) + '\n');
        res.write(JSON.stringify({
            type: 'done',
            ok: true,
            assetsRestored: result.assetsRestored,
            coldStorageFailed: result.coldStorageFailed,
        }) + '\n');
        res.end();
    } catch (error) {
        if (!res.headersSent) {
            next(error);
        } else {
            res.write(JSON.stringify({ type: 'error', message: error.message }) + '\n');
            res.end();
        }
    } finally {
        importInProgress = false;
    }
});

// Delete a server backup file
app.delete('/api/backup/server/:filename', async (req, res, next) => {
    if (!await checkAuth(req, res)) { return; }
    if (!checkActiveSession(req, res)) return;
    try {
        const filename = req.params.filename;
        if (!BACKUP_FILENAME_REGEX.test(filename)) {
            res.status(400).json({ error: 'Invalid backup filename' });
            return;
        }
        const filePath = path.join(backupsDir, filename);
        try {
            await fs.unlink(filePath);
        } catch (err) {
            if (err.code === 'ENOENT') {
                res.status(404).json({ error: 'Backup file not found' });
                return;
            }
            throw err;
        }
        res.json({ ok: true });
    } catch (error) {
        next(error);
    }
});

// Download a server backup file
app.get('/api/backup/server/download/:filename', async (req, res, next) => {
    if (!await checkAuth(req, res)) { return; }
    try {
        const filename = req.params.filename;
        if (!BACKUP_FILENAME_REGEX.test(filename)) {
            res.status(400).json({ error: 'Invalid backup filename' });
            return;
        }
        const filePath = path.join(backupsDir, filename);
        let stat;
        try {
            stat = await fs.stat(filePath);
        } catch {
            res.status(404).json({ error: 'Backup file not found' });
            return;
        }
        res.setHeader('content-type', 'application/octet-stream');
        res.setHeader('content-disposition', `attachment; filename="${filename}"`);
        res.setHeader('content-length', stat.size);
        const { createReadStream } = require('fs');
        createReadStream(filePath).pipe(res);
    } catch (error) {
        next(error);
    }
});

// ── Chat content endpoints (runtime lazy load) ─────────────────────────────

// Cold storage compatibility: restore data stored in coldstorage/ KV entries
const COLD_STORAGE_HEADER = '\uEF01COLDSTORAGE\uEF01';

// Live repair options for the shared cold storage restoration: entries are
// read through readColdStorageJsonEntry (canonical key, legacy .json
// fallback, legacy-to-canonical migration) and failures are logged.
function liveColdStorageRepairOptions() {
    return {
        randomUUID: generateChatId,
        readColdEntry: (key) => readColdStorageJsonEntry(key, {
            migrateLegacy: true,
        }),
        onError: (...args) => logger.error(...args),
    };
}

function isColdStorageChat(chat) {
    return chat?.message?.[0]?.data?.startsWith(COLD_STORAGE_HEADER);
}

function restoreColdStorageChat(chat) {
    if (!isColdStorageChat(chat)) return true;
    const key = chat.message[0].data.slice(COLD_STORAGE_HEADER.length);
    const entry = readColdStorageJsonEntry(key, {
        migrateLegacy: true,
    });
    if (!entry) {
        logger.error(`[ColdStorage] data not found for key: ${key}`);
        return false;
    }
    try {
        const coldData = entry.coldData;
        if (Array.isArray(coldData)) {
            chat.message = coldData;
        } else if (coldData?.message) {
            chat.message = coldData.message;
            if (coldData.hypaV3Data) chat.hypaV3Data = coldData.hypaV3Data;
            if (coldData.scriptstate) chat.scriptstate = coldData.scriptstate;
            if (coldData.localLore) chat.localLore = coldData.localLore;
        }
        chat.lastDate = Date.now();
        return true;
    } catch (err) {
        logger.error(`[ColdStorage] restore failed for key ${key}:`, err.message);
        return false;
    }
}

// GET /api/chat-content/:chaId/:chatIndex — retrieve full chat from server
app.get('/api/chat-content/:chaId/:chatIndex', async (req, res, next) => {
    if (!await checkAuth(req, res)) { return; }
    try {
        await queueStorageOperation(async () => {
        const chaId = req.params.chaId;
        const chatIndex = parseInt(req.params.chatIndex, 10);
        const expectedChatId = typeof req.headers['x-chat-id'] === 'string'
            ? req.headers['x-chat-id']
            : '';

        await ensureChatStore();
        // First try fullChatStore (fast path)
        const charChats = fullChatStore.get(chaId);
        if (charChats && expectedChatId) {
            const chat = charChats.get(expectedChatId);
            if (chat) {
                if (!restoreColdStorageChat(chat)) {
                    return res.status(500).json({ error: 'Cold storage restore failed' });
                }
                const revision = chatRevision(chat);
                setRevisionHeaders(res, revision, 'x-chat-revision');
                res.setHeader('Cache-Control', 'private, no-cache');
                if (requestEtagMatches(req.headers['if-none-match'], revision)) {
                    return res.status(304).end();
                }
                const encoded = Buffer.from(encodeRisuSaveLegacy(chat));
                res.setHeader('Content-Type', 'application/octet-stream');
                return res.send(encoded);
            }
        }

        // Fallback: load canonical metadata. Stable ID is authoritative when
        // present; the path index remains only for legacy callers.
        const raw = kvGet('database/database.bin');
        if (!raw) {
            return res.status(404).json({ error: 'Database not found' });
        }
        const dbObj = await decodeRisuSave(raw);
        const char = dbObj.characters?.find(c => c?.chaId === chaId);
        const chat = resolveChatReadTarget(char, chatIndex, expectedChatId);
        if (!chat) return res.status(404).json({ error: 'Chat not found' });
        // A legacy metadata-only shell is not a valid chat payload. Returning
        // it as 200 makes the client decoder treat hydration as malformed and
        // can turn a send attempt into an unhandled error. Report an explicit
        // missing payload so the composer can keep the user's draft intact.
        if (chat?._stub === true && !Array.isArray(chat.message)) {
            return res.status(404).json({
                error: 'Chat metadata exists but its full payload is unavailable',
                code: 'CHAT_PAYLOAD_MISSING',
            });
        }
        if (!restoreColdStorageChat(chat)) {
            return res.status(500).json({ error: 'Cold storage restore failed' });
        }
        const revision = chatRevision(chat);
        setRevisionHeaders(res, revision, 'x-chat-revision');
        res.setHeader('Cache-Control', 'private, no-cache');
        if (requestEtagMatches(req.headers['if-none-match'], revision)) {
            return res.status(304).end();
        }
        const encoded = Buffer.from(encodeRisuSaveLegacy(chat));
        res.setHeader('Content-Type', 'application/octet-stream');
        res.send(encoded);
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/chat-content/:chaId/:chatIndex/patch — save an incremental chat delta
app.post('/api/chat-content/:chaId/:chatIndex/patch', async (req, res, next) => {
    if (!await checkAuth(req, res)) { return; }
    if (!checkActiveSession(req, res)) return;
    try {
        await queueStorageOperation(async () => {
            const chaId = req.params.chaId;
            const expectedChatId = typeof req.headers['x-chat-id'] === 'string'
                ? req.headers['x-chat-id']
                : '';
            const baseRevision = typeof req.body?.baseRevision === 'string' ? req.body.baseRevision : '';
            const patch = req.body?.patch;
            const payloadBytes = Buffer.byteLength(JSON.stringify(req.body || {}));

            if (!expectedChatId || !baseRevision || !Array.isArray(patch)) {
                return res.status(400).json({ error: 'Chat ID, base revision, and patch are required' });
            }
            if (payloadBytes > CHAT_DELTA_MAX_BYTES) {
                return res.status(413).json({ error: 'Chat delta is too large; use full chat save' });
            }

            await ensureChatStore();
            const chat = fullChatStore.get(chaId)?.get(expectedChatId);
            if (!chat) {
                return res.status(404).json({ error: 'Chat not found; use full chat save' });
            }
            if (!restoreColdStorageChat(chat)) {
                return res.status(500).json({ error: 'Cold storage restore failed' });
            }

            const precondition = evaluateChatRevisionPrecondition(chat, baseRevision);
            if (!precondition.matches) {
                setRevisionHeaders(res, precondition.currentRevision, 'x-chat-revision');
                return res.status(409).json({
                    error: 'Chat revision mismatch',
                    currentRevision: precondition.currentRevision,
                });
            }

            let nextChat;
            try {
                nextChat = applyChatDelta(chat, patch, expectedChatId);
            } catch (patchError) {
                return res.status(400).json({
                    error: 'Invalid chat delta',
                    detail: String(patchError?.message || patchError),
                });
            }

            const awaitingMetadata = await chatWriteJournal.isAwaitingMetadata(chaId, expectedChatId);
            await chatWriteJournal.stage(chaId, expectedChatId, nextChat, {
                awaitingMetadata,
            });
            fullChatStore.get(chaId).set(expectedChatId, nextChat);
            const nextRevision = chatRevision(nextChat);
            scheduleChatStorePersist();
            setRevisionHeaders(res, nextRevision, 'x-chat-revision');
            res.setHeader('x-chat-save-mode', 'delta');
            res.json({
                success: true,
                revision: nextRevision,
                appliedOperations: patch.length,
                receivedBytes: payloadBytes,
            });
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/chat-content/:chaId/:chatIndex — save full chat content to server
app.post('/api/chat-content/:chaId/:chatIndex', async (req, res, next) => {
    if (!await checkAuth(req, res)) { return; }
    if (!checkActiveSession(req, res)) return;
    try {
        await queueStorageOperation(async () => {
            const chaId = req.params.chaId;
            const chatIndex = parseInt(req.params.chatIndex, 10);
            const expectedChatId = typeof req.headers['x-chat-id'] === 'string'
                ? req.headers['x-chat-id']
                : '';
            let chatData;
            if (Buffer.isBuffer(req.body)) {
                // Binary msgpack body (application/octet-stream)
                try {
                    chatData = await decodeRisuSave(req.body);
                } catch (e) {
                    return res.status(400).json({ error: 'Invalid binary chat data' });
                }
            } else {
                // JSON body (legacy)
                chatData = req.body;
            }

            if (!chatData || !expectedChatId) {
                return res.status(400).json({ error: 'Chat data and x-chat-id required' });
            }
            if (chatData.id && chatData.id !== expectedChatId) {
                return res.status(409).json({ error: 'Chat ID mismatch' });
            }
            if (!Array.isArray(chatData.message)) {
                return res.status(400).json({ error: 'Full chat payload must contain a message array' });
            }
            chatData.id = expectedChatId;

            await ensureChatStore();

            const baseRevision = typeof req.headers['x-chat-base-revision'] === 'string'
                ? req.headers['x-chat-base-revision']
                : '';
            const currentChat = fullChatStore.get(chaId)?.get(expectedChatId) || null;
            const createOnly = String(req.headers['if-none-match'] || '')
                .split(',')
                .some(candidate => candidate.trim() === '*');
            if (currentChat && !restoreColdStorageChat(currentChat)) {
                return res.status(500).json({ error: 'Cold storage restore failed' });
            }
            const precondition = evaluateFullChatWritePrecondition(currentChat, {
                baseRevision,
                createOnly,
            });
            if (!precondition.matches) {
                setRevisionHeaders(res, precondition.currentRevision, 'x-chat-revision');
                return res.status(precondition.status).json({
                    error: precondition.error,
                    currentRevision: precondition.currentRevision,
                });
            }

            const wasAwaitingMetadata = await chatWriteJournal.isAwaitingMetadata(
                chaId,
                expectedChatId,
            );
            await chatWriteJournal.stage(chaId, expectedChatId, chatData, {
                awaitingMetadata: !currentChat || wasAwaitingMetadata,
            });

            // Publish only after the durable journal write succeeds.
            if (!fullChatStore.has(chaId)) {
                fullChatStore.set(chaId, new Map());
            }
            fullChatStore.get(chaId).set(expectedChatId, chatData);

            scheduleChatStorePersist();
            const revision = chatRevision(chatData);
            setRevisionHeaders(res, revision, 'x-chat-revision');
            res.setHeader('x-chat-save-mode', 'full');
            res.json({ success: true, revision });
        });
    } catch (error) {
        next(error);
    }
});

// ── Save-folder migration endpoints ──────────────────────────────────────────
const migrationMarkerPath = path.join(savePath, '.migrated_to_sqlite');

function scanHexFilesInDir(dirPath) {
    let files;
    try {
        files = readdirSync(dirPath);
    } catch {
        return { hexFiles: [], count: 0, totalSize: 0, hasDatabase: false };
    }
    const hexFiles = files.filter(f => hexRegex.test(f));
    let totalSize = 0;
    let hasDatabase = false;
    for (const f of hexFiles) {
        try {
            const stat = require('fs').statSync(path.join(dirPath, f));
            totalSize += stat.size;
        } catch { /* skip unreadable files */ }
        try {
            if (Buffer.from(f, 'hex').toString('utf-8') === 'database/database.bin') hasDatabase = true;
        } catch { /* invalid hex */ }
    }
    return { hexFiles, count: hexFiles.length, totalSize, hasDatabase };
}

function clearExistingData() {
    kvDelPrefix('assets/');
    kvDelPrefix('inlay/');
    kvDelPrefix('inlay_thumb/');
    kvDelPrefix('inlay_meta/');
    kvDelPrefix('inlay_info/');
    // Composer drafts aren't part of a save folder; clear stale ones on import.
    kvDelPrefix('drafts/');
    // Drop the previous user's remote payloads. The new save folder usually
    // brings its own remotes/<id>.local.bin files (INSERT OR REPLACE), but if
    // the imported character ids reuse names from the prior user without
    // shipping a matching payload, the migration's resolveRemote would silently
    // stitch in stale cross-user data. Wiping here ensures only payloads
    // that arrived in this import survive.
    kvDelPrefix('remotes/');
    kvDelPrefix(CHAT_WRITE_JOURNAL_PREFIX);
    // Durable reset only; in-memory owners are reset after COMMIT.
    // Cold-storage rows belong to the previous user's chats. The .bin import path
    // (importBackupFromSource) already clears these; the save-folder path did not,
    // leaving orphans that no dashboard or Optimize pass ever reclaims.
    kvDelPrefix('coldstorage/');
    // Clear remote-block migration marker — newly imported database.bin may
    // contain REMOTE blocks (it usually does, since save-folder imports
    // preserve upstream's split-character format) and we want the migration
    // to re-evaluate against the new contents on the next ensureChatStore.
    kvDel(REMOTE_MIGRATION_MARKER_KEY);
    clearEntities();
}

// Save-folder imports (directory execute and zip upload) are storage resets.
// The rows to insert are read once, outside the storage queue; the database is
// prepared from exactly those bytes; the reset slot then replaces the data in
// one synchronous transaction and publishes the prepared caches.
async function readSaveFolderDirectoryEntries(dirPath) {
    const { hexFiles, hasDatabase } = scanHexFilesInDir(dirPath);
    if (hexFiles.length === 0) return [];
    if (!hasDatabase) throw new Error('Save folder does not contain database/database.bin');
    const entries = [];
    for (const hexFile of hexFiles) {
        entries.push({
            key: Buffer.from(hexFile, 'hex').toString('utf-8'),
            value: await fs.readFile(path.join(dirPath, hexFile)),
        });
    }
    return entries;
}

async function importSaveFolder(kind, readEntries) {
    return runStorageReset(kind, {
        prepare: async (reset) => {
            const entries = await readEntries(reset);
            if (entries.length === 0) return { rows: new Map(), database: null };
            // A later row with the same key replaces an earlier one, in both
            // preparation and insertion.
            const rows = new Map();
            for (const { key, value } of entries) rows.set(key, value);
            const rawDatabase = rows.get(DB_BLOB_KEY);
            if (!rawDatabase) throw new Error('Data does not contain database/database.bin');
            const database = await prepareResetDatabase(
                rawDatabase,
                createStagedRowReader((key) => rows.get(key) ?? null),
            );
            return { rows, database, imported: entries.length };
        },
        apply: async (state, reset) => {
            if (!state.database) {
                // An empty folder imports nothing but is still a storage reset.
                sqliteDb.transaction(() => {
                    reset.transactionCount += 1;
                    advanceStorageEpoch(readStorageEpoch(), reset);
                })();
                return { imported: 0 };
            }
            await storageResetTestHooks.waitAtResetGate(reset.kind);
            await flushPendingDb();
            createBackupAndRotate();
            return applySaveFolderImport(state, reset);
        },
    });
}

// Runs inside the reset slot with no await between BEGIN and COMMIT.
function applySaveFolderImport(state, reset) {
    const prepared = state.database;
    const insert = sqliteDb.prepare(
        `INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, ?)`
    );
    const now = Date.now();

    const run = sqliteDb.transaction(() => {
        reset.transactionCount += 1;
        storageResetTestHooks.trace('begin', { kind: reset.kind });
        storageResetTestHooks.traceNextYield({ kind: reset.kind });
        const epochBefore = readStorageEpoch();
        clearExistingData();
        storageResetTestHooks.failpoint('after-destructive-deletes', reset.attempt);
        let entryNumber = 0;
        for (const [key, value] of state.rows) {
            entryNumber += 1;
            storageResetTestHooks.entryFailpoint(entryNumber, reset.attempt);
            // Chunk the DB blob so an oversized database.bin imports instead of
            // failing the BLOB bind limit; other keys keep the bulk fast path.
            if (key === DB_BLOB_KEY) { kvSet(key, prepared.databaseBytes); continue; }
            insert.run(key, value, now);
        }
        reset.entryCount = entryNumber;
        recordPreparedRemoteMigration(prepared, state.rows.get(DB_BLOB_KEY));
        advanceStorageEpoch(epochBefore, reset);
    });
    run();
    reset.committed = true;
    storageResetTestHooks.trace('commit', { kind: reset.kind });

    publishPreparedReset(prepared);
    // Save-folder memory resets run only after COMMIT.
    chatWriteJournal.resetMemory();

    try {
        writeFileSync(migrationMarkerPath, new Date().toISOString(), 'utf-8');
    } catch (markerError) {
        logger.warn('[Save-folder import] Could not write the migration marker:', markerError?.message || markerError);
    }
    logPreparedColdStorage(prepared);
    return { imported: state.imported };
}

function saveFolderErrorResponse(res, error) {
    const storagePayload = storageResetErrorPayload(error);
    if (storagePayload) return res.status(error.statusCode).json(storagePayload);
    res.status(error?.statusCode || 400).json({ error: error.message || 'Import failed' });
}

app.post('/api/migrate/save-folder/scan', async (req, res, next) => {
    if (!await checkAuth(req, res)) return;
    if (!checkActiveSession(req, res)) return;
    try {
        const folderPath = req.body?.path || savePath;
        const resolved = path.resolve(folderPath);
        try {
            const stat = require('fs').statSync(resolved);
            if (!stat.isDirectory()) {
                res.status(400).json({ error: 'Path is not a directory' });
                return;
            }
        } catch {
            res.status(400).json({ error: 'Cannot access directory' });
            return;
        }
        const { count, totalSize, hasDatabase } = scanHexFilesInDir(resolved);
        res.json({ count, totalSize, hasDatabase });
    } catch (error) {
        next(error);
    }
});

app.post('/api/migrate/save-folder/execute', async (req, res, next) => {
    if (!await checkAuth(req, res)) return;
    if (!checkActiveSession(req, res)) return;
    if (importInProgress) {
        res.status(409).json({ error: 'Another import is already in progress' });
        return;
    }
    importInProgress = true;
    try {
        const folderPath = req.body?.path || savePath;
        const resolved = path.resolve(folderPath);
        try {
            const stat = require('fs').statSync(resolved);
            if (!stat.isDirectory()) {
                res.status(400).json({ error: 'Path is not a directory' });
                return;
            }
        } catch {
            res.status(400).json({ error: 'Cannot access directory' });
            return;
        }
        const result = await importSaveFolder('save-folder-execute', () => readSaveFolderDirectoryEntries(resolved));
        res.json({ ok: true, imported: result.imported });
    } catch (error) {
        saveFolderErrorResponse(res, error);
    } finally {
        importInProgress = false;
    }
});

app.post('/api/migrate/save-folder/upload', async (req, res, next) => {
    if (!await checkAuth(req, res)) return;
    if (!checkActiveSession(req, res)) return;
    if (importInProgress) {
        res.status(409).json({ error: 'Another import is already in progress' });
        return;
    }
    importInProgress = true;

    req.socket.setTimeout(0);
    req.socket.setKeepAlive(true);
    const prevRequestTimeout = req.socket.server?.requestTimeout;
    if (req.socket.server) req.socket.server.requestTimeout = 0;

    try {
        const result = await importSaveFolder('save-folder-upload', () => readSaveFolderUploadEntries(req));
        res.json({ ok: true, imported: result.imported });
    } catch (error) {
        saveFolderErrorResponse(res, error);
    } finally {
        importInProgress = false;
        if (req.socket.server && prevRequestTimeout !== undefined) {
            req.socket.server.requestTimeout = prevRequestTimeout;
        }
    }
});

function saveFolderHttpError(statusCode, message) {
    return Object.assign(new Error(message), { statusCode });
}

// Reads and unzips an uploaded save folder outside the storage queue. A failed
// upload keeps its connection usable for the error response.
async function readSaveFolderUploadEntries(req) {
    const chunks = [];
    let totalSize = 0;
    try {
        for await (const chunk of req.iterator({ destroyOnReturn: false })) {
            totalSize += chunk.length;
            if (BACKUP_IMPORT_MAX_BYTES > 0 && totalSize > BACKUP_IMPORT_MAX_BYTES) {
                throw saveFolderHttpError(413, 'Zip file exceeds max allowed size');
            }
            chunks.push(chunk);
        }
    } catch (error) {
        await discardRequestBody(req);
        throw error;
    }
    const zipBuffer = Buffer.concat(chunks);

    const fflate = require('fflate');
    let unzipped;
    try {
        unzipped = fflate.unzipSync(new Uint8Array(zipBuffer));
    } catch {
        throw saveFolderHttpError(400, 'Invalid or corrupted zip file');
    }

    const entries = [];
    for (const [entryPath, data] of Object.entries(unzipped)) {
        if (data.length === 0) continue;
        const basename = path.basename(entryPath);
        if (!hexRegex.test(basename)) continue;
        try {
            const key = Buffer.from(basename, 'hex').toString('utf-8');
            entries.push({ key, value: Buffer.from(data) });
        } catch { /* invalid hex filename */ }
    }

    if (entries.length === 0) {
        throw saveFolderHttpError(400, 'No compatible hex files found in zip');
    }
    return entries;
}

app.post('/api/migrate/save-folder/cleanup/scan', async (req, res, next) => {
    if (!await checkAuth(req, res)) return;
    if (!checkActiveSession(req, res)) return;
    try {
        if (!existsSync(migrationMarkerPath)) {
            res.status(400).json({ error: 'Migration has not been completed yet' });
            return;
        }
        const { count, totalSize } = scanHexFilesInDir(savePath);
        res.json({ count, totalSize });
    } catch (error) {
        next(error);
    }
});

app.post('/api/migrate/save-folder/cleanup/execute', async (req, res, next) => {
    if (!await checkAuth(req, res)) return;
    if (!checkActiveSession(req, res)) return;
    try {
        if (!existsSync(migrationMarkerPath)) {
            res.status(400).json({ error: 'Migration has not been completed yet' });
            return;
        }
        const { hexFiles } = scanHexFilesInDir(savePath);
        let removed = 0;
        let freedBytes = 0;
        for (const f of hexFiles) {
            try {
                const filePath = path.join(savePath, f);
                const stat = require('fs').statSync(filePath);
                unlinkSync(filePath);
                freedBytes += stat.size;
                removed++;
            } catch { /* skip unremovable files */ }
        }
        res.json({ ok: true, removed, freedBytes });
    } catch (error) {
        next(error);
    }
});

// ── Storage dashboard endpoints ──────────────────────────────────────────────

const DB_BLOB_KEY = 'database/database.bin';
const DB_BACKUP_PREFIX = 'database/dbbackup-';
const ASSET_PREFIXES = ['assets/', 'remotes/', 'inlay/', 'inlay_thumb/', 'inlay_meta/', 'inlay_info/', 'coldstorage/'];

function statsBasename(s) {
    if (!s) return '';
    return String(s).replace(/\\/g, '/').split('/').pop();
}

// Pull "assets/..." path references out of an arbitrary value. Non-string
// values are serialized first so references nested inside plugin-stored JSON
// (objects, arrays) are found too. Mirrors globalApi's extractAssetRefs.
function extractAssetRefsFromText(value) {
    let text;
    if (typeof value === 'string') text = value;
    else {
        try { text = JSON.stringify(value) ?? ''; } catch { return []; }
    }
    return Array.from(text.matchAll(/assets[/\\][\w-]+\.\w+/g), (m) => m[0]);
}

// V3 plugin persistent storage lives in kv (cache/plugin-storage/*.json), not
// in the DB blob, and may hold saveAsset paths. Returns basenames so callers
// can union it with buildUncleanableSet before deciding what is orphaned.
function collectPluginStorageAssetRefs() {
    const set = new Set();
    for (const key of kvList('cache/plugin-storage/')) {
        try {
            const raw = kvGet(key);
            if (!raw) continue;
            const text = Buffer.isBuffer(raw) ? raw.toString('utf-8') : String(raw);
            for (const ref of extractAssetRefsFromText(text)) {
                const bn = statsBasename(ref);
                if (bn) set.add(bn);
            }
        } catch { /* unreadable entry — skip */ }
    }
    return set;
}

// Every asset reference reachable from the DB. Mirrors
// src/ts/globalApi.svelte.ts:getUncleanables, plus the settings-level image-gen
// references that walker misses (NAIImgConfig, wavespeedImage).
//
// Two consumers: dashboard orphan stats, and picking which assets a
// settings-only backup carries. A miss here silently drops an asset from the
// seed backup, so err toward including a field.
//
// Deliberately absent: botPresets[].image and modules[].backgroundEmbedding.
// The former is an inline data URI (canvas.toDataURL), the latter is HTML —
// neither is a stored asset, so both ride along inside database.bin.
//
// `includeModuleAssets: false` omits modules[].assets (and the same array on a
// persona's embedded module). Asset-pack modules routinely carry thousands of
// images — several GB is normal — so a settings-only export offers to leave
// them behind. Module *icons* are not gated: they are tiny and part of the
// module's identity in the list UI.
function buildUncleanableSet(dbObj, { includeModuleAssets = true } = {}) {
    const set = new Set();
    const add = (v) => {
        const bn = statsBasename(v);
        if (bn) set.add(bn);
    };
    if (!dbObj) return set;
    add(dbObj.customBackground);
    add(dbObj.userIcon);
    // Notification sounds. Bundled-preset values (e.g. "bell") are not asset
    // paths and just add a basename that matches no stored asset.
    add(dbObj.messageSound);
    add(dbObj.translateSound);
    if (Array.isArray(dbObj.customSounds)) for (const s of dbObj.customSounds) add(s?.path);
    // Image-gen reference images hang off settings, not off a character.
    add(dbObj.NAIImgConfig?.character_image);
    add(dbObj.NAIImgConfig?.image);
    add(dbObj.wavespeedImage?.reference_image);
    if (Array.isArray(dbObj.characters)) {
        for (const cha of dbObj.characters) {
            if (!cha) continue;
            add(cha.image);
            if (Array.isArray(cha.emotionImages)) for (const em of cha.emotionImages) add(em?.[1]);
            if (Array.isArray(cha.additionalAssets)) for (const em of cha.additionalAssets) add(em?.[1]);
            if (cha.vits?.files) for (const k of Object.keys(cha.vits.files)) add(cha.vits.files[k]);
            if (Array.isArray(cha.ccAssets)) for (const a of cha.ccAssets) add(a?.uri);
            // GPT-SoVITS reference audio — assetId holds the full "assets/..." path.
            add(cha.gptSoVitsConfig?.ref_audio_data?.assetId);
        }
    }
    if (Array.isArray(dbObj.modules)) {
        for (const m of dbObj.modules) {
            if (includeModuleAssets && Array.isArray(m?.assets)) for (const a of m.assets) add(a?.[1]);
            add(m?.icon);
        }
    }
    if (Array.isArray(dbObj.personas)) {
        for (const p of dbObj.personas) {
            add(p?.icon);
            // Legacy `image` alongside `icon` on card-imported personas. Unread
            // by current code but still a live reference — see getUncleanables.
            add(p?.image);
            const embedded = p?.embeddedModule;
            if (includeModuleAssets && Array.isArray(embedded?.assets)) for (const a of embedded.assets) add(a?.[1]);
            add(embedded?.icon);
        }
    }
    if (Array.isArray(dbObj.characterOrder)) {
        for (const item of dbObj.characterOrder) {
            if (item && typeof item === 'object' && 'imgFile' in item) add(item.imgFile);
        }
    }
    // Plugins can persist asset paths (from risuai.saveAsset) anywhere inside
    // their storage — as plain strings or nested in JSON values — so scan the
    // serialized text for "assets/..." references instead of assuming a structure.
    if (dbObj.pluginCustomStorage && typeof dbObj.pluginCustomStorage === 'object') {
        for (const value of Object.values(dbObj.pluginCustomStorage)) {
            for (const ref of extractAssetRefsFromText(value)) add(ref);
        }
    }
    return set;
}

function statSafe(p) {
    try { return require('fs').statSync(p); } catch { return null; }
}

async function diskFreeStat(dirPath) {
    try {
        const sf = await fs.statfs(dirPath);
        return { free: sf.bsize * sf.bavail, total: sf.bsize * sf.blocks };
    } catch { return { free: null, total: null }; }
}

// Sum the on-disk inlay payload (image files + sidecar JSONs in save/inlays).
// Returns 0 if the directory is missing. Used by both the backup-size
// estimator and the dashboard inlay total — kv inlay/* prefixes don't
// reflect filesystem bytes after the inlay→fs migration.
async function sumInlayFsBytes() {
    let total = 0;
    try {
        const inlayFiles = await listInlayFiles();
        await Promise.all(inlayFiles.map(async (entry) => {
            try {
                const st = await fs.stat(entry.filePath);
                total += st.size;
            } catch { /* missing — skip */ }
            try {
                const sst = await fs.stat(getInlaySidecarPath(entry.id));
                total += sst.size;
            } catch { /* sidecar may not exist */ }
        }));
    } catch { /* dir missing */ }
    return total;
}

// Estimated server-backup size — mirrors the enumeration in
// /api/backup/server/save without writing anything. Inlay files live on the
// filesystem (post-migration), so we have to fs.stat them rather than read
// kvSize. Cost: ~5-50 ms typical, ~200 ms for users with thousands of inlays.
async function estimateServerBackupSize() {
    let total = 0;
    total += kvSize(DB_BLOB_KEY) || 0;
    for (const it of kvListWithSizes('assets/')) total += it.size;
    for (const it of kvListWithSizes('inlay_meta/')) total += it.size;
    for (const e of listColdStorageBackupEntries()) total += e.size;
    total += await sumInlayFsBytes();
    return total;
}

app.get('/api/db/stats', async (req, res, next) => {
    if (!await checkAuth(req, res)) return;
    try {
        const saveDir = path.join(process.cwd(), 'save');
        const dbFilePath = path.join(saveDir, 'risuai.db');
        const walPath = dbFilePath + '-wal';
        const shmPath = dbFilePath + '-shm';

        const files = {
            db: statSafe(dbFilePath)?.size ?? 0,
            wal: statSafe(walPath)?.size ?? 0,
            shm: statSafe(shmPath)?.size ?? 0,
        };

        const disk = await diskFreeStat(saveDir);
        // Backup destination disk — same as save/ in the default config but
        // can diverge when the user points backupsDir at a different mount.
        // Surfaced separately so backup-side warnings target the right disk.
        // `sameAsSaveDir` is true when both paths land on the same filesystem
        // (compared by Stat.dev). Dashboard uses this to decide whether to
        // count file backups against the save/ disk in the storage chart.
        let backupDisk;
        if (backupsDir === DEFAULT_BACKUPS_DIR) {
            backupDisk = { ...disk, path: backupsDir, sameAsSaveDir: true };
        } else {
            const bDisk = await diskFreeStat(backupsDir);
            let sameAsSaveDir = false;
            try {
                const saveStat = require('fs').statSync(saveDir);
                const bStat = require('fs').statSync(backupsDir);
                sameAsSaveDir = saveStat.dev === bStat.dev;
            } catch { /* non-fatal */ }
            backupDisk = { ...bDisk, path: backupsDir, sameAsSaveDir };
        }

        const pageSize = sqliteDb.pragma('page_size', { simple: true });
        const pageCount = sqliteDb.pragma('page_count', { simple: true });
        const freelistCount = sqliteDb.pragma('freelist_count', { simple: true });
        const journalMode = sqliteDb.pragma('journal_mode', { simple: true });
        const autoVacuum = sqliteDb.pragma('auto_vacuum', { simple: true });
        const reclaimable = freelistCount * pageSize;

        const dbBlobSize = kvSize(DB_BLOB_KEY) || 0;

        // Physical storage of the chunked DB blob (and all snapshots, which share
        // chunks). This is where the blob bytes actually live post-chunking — kv
        // holds only a tiny marker, so the chart must count this table separately.
        const chunkStat = sqliteDb.prepare('SELECT COUNT(*) AS c, COALESCE(SUM(LENGTH(data)), 0) AS b FROM chunks').get();
        // Bytes the next gc() would reclaim (true orphans + chunks pinned only by
        // stale/raw-overwritten manifests) — drives the Optimize button.
        const orphanChunkBytes = reclaimableChunkBytes();
        const liveChunked = isDbBlobChunked();

        // Prefix breakdown — split database/ into the live blob vs rotated backups.
        const prefixes = {};
        prefixes[DB_BLOB_KEY] = { totalSize: dbBlobSize, count: dbBlobSize > 0 ? 1 : 0 };
        const backupKeys = kvList(DB_BACKUP_PREFIX);
        let backupTotal = 0;
        let backupOldest = null, backupNewest = null;
        for (const k of backupKeys) {
            const sz = kvSize(k) || 0;
            backupTotal += sz;
            const tsRaw = parseInt(k.slice(DB_BACKUP_PREFIX.length, -4), 10);
            if (Number.isFinite(tsRaw)) {
                const ts = tsRaw * 100;
                if (!backupOldest || ts < backupOldest) backupOldest = ts;
                if (!backupNewest || ts > backupNewest) backupNewest = ts;
            }
        }
        prefixes[DB_BACKUP_PREFIX] = { totalSize: backupTotal, count: backupKeys.length };
        for (const p of ASSET_PREFIXES) {
            const items = kvListWithSizes(p);
            let total = 0;
            for (const it of items) total += it.size;
            prefixes[p] = { totalSize: total, count: items.length };
        }

        const kvRows = sqliteDb.prepare('SELECT COUNT(*) AS c FROM kv').get().c;
        const kvTotalBytes = sqliteDb.prepare('SELECT COALESCE(SUM(LENGTH(value)), 0) AS s FROM kv').get().s;

        let fileBackups = { count: 0, totalSize: 0, oldest: null, newest: null };
        try {
            const entries = await fs.readdir(backupsDir, { withFileTypes: true });
            for (const e of entries) {
                if (!e.isFile() || !BACKUP_FILENAME_REGEX.test(e.name)) continue;
                const st = await fs.stat(path.join(backupsDir, e.name));
                fileBackups.count++;
                fileBackups.totalSize += st.size;
                const ts = st.mtimeMs;
                if (!fileBackups.oldest || ts < fileBackups.oldest) fileBackups.oldest = ts;
                if (!fileBackups.newest || ts > fileBackups.newest) fileBackups.newest = ts;
            }
        } catch { /* backups dir may not exist */ }

        // Quick estimates from in-memory cache only — never decode the BLOB just for stats.
        let trashed = { count: 0, expiredCount: 0, available: false };
        let orphan = { count: 0, totalSize: 0, available: false };
        const stripped = dbCache[DB_HEX_KEY];
        if (stripped?.characters) {
            const now = Date.now();
            const GRACE = 1000 * 60 * 60 * 24 * 3;
            for (const c of stripped.characters) {
                if (c?.trashTime) {
                    trashed.count++;
                    if (c.trashTime + GRACE < now) trashed.expiredCount++;
                }
            }
            trashed.available = true;
        }
        // `characters` must be an array: a decode failure parks `{}` in dbCache,
        // and walking that yields an empty reference set — which would report
        // every stored asset as an orphan.
        if (stripped && Array.isArray(stripped.characters)) {
            const uncleanable = buildUncleanableSet(stripped);
            for (const bn of collectPluginStorageAssetRefs()) uncleanable.add(bn);
            for (const it of kvListWithSizes('assets/')) {
                if (!uncleanable.has(statsBasename(it.key))) {
                    orphan.count++;
                    orphan.totalSize += it.size;
                }
            }
            orphan.available = true;
        }

        const estimatedBackupSize = await estimateServerBackupSize();
        // Inlay payload now lives on the filesystem (post-migration) rather
        // than in kv `inlay/*` prefixes. Surface explicitly so the dashboard
        // chart can include it in the inlay slice instead of underreporting.
        const inlayFsBytes = await sumInlayFsBytes();

        res.json({
            files,
            disk,
            backupDisk,
            sqlite: { pageSize, pageCount, freelistCount, reclaimable, journalMode, autoVacuum },
            chunks: { count: chunkStat.c, bytes: chunkStat.b, orphanBytes: orphanChunkBytes, liveChunked },
            prefixes,
            kvRows,
            kvTotalBytes,
            estimatedBackupSize,
            inlayFsBytes,
            backups: {
                kv: { count: backupKeys.length, totalSize: backupTotal, oldest: backupOldest, newest: backupNewest },
                file: fileBackups,
            },
            trashed,
            orphan,
            etag: dbEtag,
        });
    } catch (err) { next(err); }
});

app.get('/api/db/stats/characters', async (req, res, next) => {
    if (!await checkAuth(req, res)) return;
    try {
        await ensureChatStore();
        const raw = kvGet(DB_BLOB_KEY);
        if (!raw) {
            res.json({ characters: [], orphan: { count: 0, totalSize: 0 }, chatBytesNote: 'estimate' });
            return;
        }
        const dbObj = await decodeRisuSave(raw);

        const assetSize = new Map();
        for (const it of kvListWithSizes('assets/')) {
            assetSize.set(statsBasename(it.key), it.size);
        }
        // remotes/<chaId>.local.bin (+ optional .meta sidecar) → bucket by chaId.
        const remoteSize = new Map();
        for (const it of kvListWithSizes('remotes/')) {
            const bn = statsBasename(it.key).replace(/\.meta$/, '');
            const chaId = bn.replace(/\.local\.bin$/, '');
            if (chaId) remoteSize.set(chaId, (remoteSize.get(chaId) || 0) + it.size);
        }

        const claimed = new Set();
        const characters = [];
        const list = Array.isArray(dbObj.characters) ? dbObj.characters : [];
        for (const cha of list) {
            if (!cha) continue;
            const refs = [];
            const collect = (v) => { if (v) refs.push(statsBasename(v)); };
            collect(cha.image);
            if (Array.isArray(cha.emotionImages)) for (const em of cha.emotionImages) collect(em?.[1]);
            if (Array.isArray(cha.additionalAssets)) for (const em of cha.additionalAssets) collect(em?.[1]);
            if (cha.vits?.files) for (const k of Object.keys(cha.vits.files)) collect(cha.vits.files[k]);
            if (Array.isArray(cha.ccAssets)) for (const a of cha.ccAssets) collect(a?.uri);

            // Same asset shared across characters is attributed to the first one we see — avoids double-counting.
            let imgBytes = 0;
            for (const bn of refs) {
                if (!bn || claimed.has(bn)) continue;
                const sz = assetSize.get(bn);
                if (sz != null) {
                    imgBytes += sz;
                    claimed.add(bn);
                }
            }
            const remoteBytes = remoteSize.get(cha.chaId) || 0;

            let chatBytes = 0;
            const charChats = fullChatStore?.get(cha.chaId);
            if (charChats) {
                for (const chat of charChats.values()) {
                    try { chatBytes += JSON.stringify(chat).length; } catch { /* skip un-serializable */ }
                }
            }

            // Card body = the character row minus chats (which we count separately).
            // Asset URIs themselves are tiny strings — leaving them in card body is fine.
            let cardBytes = 0;
            try {
                const { chats: _drop, ...body } = cha;
                cardBytes = JSON.stringify(body).length;
            } catch { /* skip un-serializable */ }

            characters.push({
                chaId: cha.chaId || '',
                name: cha.name || '',
                image: cha.image || '',
                trashed: !!cha.trashTime,
                cardBytes,
                imgBytes: imgBytes + remoteBytes,
                chatBytes,
                totalBytes: cardBytes + imgBytes + remoteBytes + chatBytes,
            });
        }

        const uncleanable = buildUncleanableSet(dbObj);
        for (const bn of collectPluginStorageAssetRefs()) uncleanable.add(bn);
        let orphanCount = 0, orphanTotal = 0;
        for (const it of kvListWithSizes('assets/')) {
            if (!uncleanable.has(statsBasename(it.key))) {
                orphanCount++;
                orphanTotal += it.size;
            }
        }

        characters.sort((a, b) => b.totalBytes - a.totalBytes);
        res.json({
            characters,
            orphan: { count: orphanCount, totalSize: orphanTotal },
            chatBytesNote: 'JSON.stringify estimate; on-disk msgpack ~0.6×',
            etag: dbEtag,
        });
    } catch (err) { next(err); }
});

// Per-module breakdown — modules live inside database.bin (no separate kv keys
// for module bodies), so size = JSON.stringify of the module + sum of its
// referenced assets. Assets attribution is independent from /characters; an
// asset shared between a character and a module would be counted in both.
app.get('/api/db/stats/modules', async (req, res, next) => {
    if (!await checkAuth(req, res)) return;
    try {
        const raw = kvGet(DB_BLOB_KEY);
        if (!raw) {
            res.json({ modules: [] });
            return;
        }
        const dbObj = await decodeRisuSave(raw);
        const list = Array.isArray(dbObj.modules) ? dbObj.modules : [];

        const assetSize = new Map();
        for (const it of kvListWithSizes('assets/')) {
            assetSize.set(statsBasename(it.key), it.size);
        }

        const modules = [];
        for (const m of list) {
            if (!m) continue;

            let bodyBytes = 0;
            try {
                const { assets: _drop, ...body } = m;
                bodyBytes = JSON.stringify(body).length;
            } catch { /* skip un-serializable */ }

            let assetBytes = 0;
            const seen = new Set();
            if (Array.isArray(m.assets)) {
                for (const a of m.assets) {
                    const bn = statsBasename(a?.[1]);
                    if (!bn || seen.has(bn)) continue;
                    seen.add(bn);
                    const sz = assetSize.get(bn);
                    if (sz != null) assetBytes += sz;
                }
            }

            modules.push({
                id: m.id || m.namespace || m.name || '',
                name: m.name || m.namespace || '',
                bodyBytes,
                assetBytes,
                totalBytes: bodyBytes + assetBytes,
            });
        }

        modules.sort((a, b) => b.totalBytes - a.totalBytes);
        res.json({ modules, etag: dbEtag });
    } catch (err) { next(err); }
});

// Delete every assets/* row no reference in the database points at. The count
// shown by /api/db/stats comes from the in-memory stripped cache; this pass
// recomputes from the persisted blob instead, so the deletion is decided by the
// same bytes a backup would carry rather than by cache state.
app.post('/api/db/assets/purge-orphans', async (req, res, next) => {
    if (!await checkAuth(req, res)) return;
    if (!checkActiveSession(req, res)) return;
    try {
        const result = await queueStorageOperation(async () => {
            // Land any debounced write first — otherwise the blob we walk is
            // older than the assets the client just attached.
            await flushPendingDb();
            const raw = kvGet(DB_BLOB_KEY);
            if (!raw) return { error: 'No database blob' };
            const dbObj = await decodeRisuSave(raw);
            if (!dbObj || !Array.isArray(dbObj.characters)) return { error: 'Database decode failed' };

            const uncleanable = buildUncleanableSet(dbObj);
            const assets = kvListWithSizes('assets/');
            // A walker that returns nothing while assets exist means the decode
            // produced a shape we do not understand — every asset would look
            // orphaned. Refuse rather than delete the library. Checked before
            // plugin-storage refs are unioned in so those can't mask a bad walk.
            if (uncleanable.size === 0 && assets.length > 0) {
                return { error: 'Reference scan produced no references — refusing to purge' };
            }
            for (const bn of collectPluginStorageAssetRefs()) uncleanable.add(bn);

            const victims = assets.filter((it) => !uncleanable.has(statsBasename(it.key)));
            // One commit for the whole sweep: thousands of autocommitted deletes
            // would each hit the WAL, and a crash mid-loop would leave the
            // library half-swept.
            sqliteDb.transaction(() => {
                for (const it of victims) kvDel(it.key);
            })();
            const deleted = victims.length;
            const bytes = victims.reduce((sum, it) => sum + it.size, 0);
            if (deleted > 0) {
                try { checkpointWal('TRUNCATE'); } catch (e) { logger.warn('[PurgeOrphans] checkpoint failed:', e?.message || e); }
            }
            return { ok: true, deleted, bytes, scanned: assets.length };
        });
        if (result.error) return res.status(400).json(result);
        logger.info(`[PurgeOrphans] removed ${result.deleted}/${result.scanned} assets (${result.bytes} bytes)`);
        res.json(result);
    } catch (err) { next(err); }
});

app.post('/api/db/optimize', async (req, res, next) => {
    if (!await checkAuth(req, res)) return;
    if (!checkActiveSession(req, res)) return;
    try {
        const saveDir = path.join(process.cwd(), 'save');
        const dbFilePath = path.join(saveDir, 'risuai.db');
        const preDbSize = statSafe(dbFilePath)?.size ?? 0;

        // VACUUM peaks at ~2x the DB size on disk: the transient copy it builds
        // (routed to the save dir via SQLITE_TMPDIR) plus the WAL inflating to
        // roughly the full DB while the copy is written back.
        const { free } = await diskFreeStat(saveDir);
        if (preDbSize > 0 && free != null && free < preDbSize * 2.2) {
            return res.status(400).json({
                error: 'Insufficient disk space for VACUUM',
                required: Math.ceil(preDbSize * 2.2),
                free,
            });
        }

        const result = await queueStorageOperation(async () => {
            await flushPendingDb();
            const t0 = Date.now();
            // Reclaim chunks orphaned by edits/snapshot rotation before VACUUM, so
            // their pages get compacted in the same pass. Serialized with saves by
            // the surrounding queueStorageOperation.
            let gcDeleted = 0;
            try { gcDeleted = gcChunks(); } catch (e) { logger.warn('[Optimize] chunk gc failed:', e?.message || e); }
            try { checkpointWal('TRUNCATE'); } catch (e) { logger.warn('[Optimize] checkpoint failed:', e?.message || e); }
            // VACUUM copies the entire DB into a transient database that honors
            // temp_store. With the session-wide temp_store=MEMORY that copy
            // lands in RAM and OOM-kills the process on multi-GB DBs, so spill
            // it to disk (SQLITE_TMPDIR = save dir) for the duration.
            sqliteDb.pragma('temp_store = FILE');
            try {
                sqliteDb.exec('VACUUM');
            } finally {
                sqliteDb.pragma('temp_store = MEMORY');
            }
            // VACUUM streams the whole DB through the WAL; without this checkpoint the
            // -wal file stays inflated until the next 5-min background TRUNCATE.
            try { checkpointWal('TRUNCATE'); } catch (e) { logger.warn('[Optimize] post-VACUUM checkpoint failed:', e?.message || e); }
            const elapsed = Date.now() - t0;
            const postDbSize = statSafe(dbFilePath)?.size ?? 0;
            return {
                ok: true,
                elapsedMs: elapsed,
                preDbSize,
                postDbSize,
                reclaimed: Math.max(0, preDbSize - postDbSize),
                chunksReclaimed: gcDeleted,
            };
        });
        res.json(result);
    } catch (err) { next(err); }
});

app.post('/api/db/wal-checkpoint', async (req, res, next) => {
    if (!await checkAuth(req, res)) return;
    if (!checkActiveSession(req, res)) return;
    try {
        const saveDir = path.join(process.cwd(), 'save');
        const walFilePath = path.join(saveDir, 'risuai.db-wal');
        const preWalSize = statSafe(walFilePath)?.size ?? 0;

        const result = await queueStorageOperation(async () => {
            await flushPendingDb();
            const t0 = Date.now();
            checkpointWal('TRUNCATE');
            const elapsed = Date.now() - t0;
            const postWalSize = statSafe(walFilePath)?.size ?? 0;
            return {
                ok: true,
                elapsedMs: elapsed,
                preWalSize,
                postWalSize,
                reclaimed: Math.max(0, preWalSize - postWalSize),
            };
        });
        res.json(result);
    } catch (err) { next(err); }
});

// ── Snapshot list (database/dbbackup-* keys) ─────────────────────────────────

app.get('/api/db/snapshots/limits', async (req, res, next) => {
    if (!await checkAuth(req, res)) return;
    try {
        const { maxCount, maxBytes } = getSnapshotLimits();
        const usage = snapshotUsage();
        res.json({
            maxCount,
            maxBytes,
            currentCount: usage.count,
            currentBytes: usage.bytes,
            logicalBytes: usage.logicalBytes,
            bounds: {
                minCount: SNAPSHOT_LIMIT_MIN_COUNT,
                maxCount: SNAPSHOT_LIMIT_MAX_COUNT,
                minBytes: SNAPSHOT_LIMIT_MIN_BYTES,
                maxBytes: SNAPSHOT_LIMIT_MAX_BYTES,
            },
            defaults: {
                count: SNAPSHOT_LIMIT_DEFAULT_COUNT,
                bytes: SNAPSHOT_LIMIT_DEFAULT_BYTES,
            },
        });
    } catch (err) { next(err); }
});

app.put('/api/db/snapshots/limits', async (req, res, next) => {
    if (!await checkAuth(req, res)) return;
    if (!checkActiveSession(req, res)) return;
    try {
        const rawCount = Number(req.body?.maxCount);
        const rawBytes = Number(req.body?.maxBytes);
        if (!Number.isFinite(rawCount) || rawCount < SNAPSHOT_LIMIT_MIN_COUNT || rawCount > SNAPSHOT_LIMIT_MAX_COUNT) {
            return res.status(400).json({ error: `maxCount out of range (${SNAPSHOT_LIMIT_MIN_COUNT}-${SNAPSHOT_LIMIT_MAX_COUNT})` });
        }
        if (!Number.isFinite(rawBytes) || rawBytes < SNAPSHOT_LIMIT_MIN_BYTES || rawBytes > SNAPSHOT_LIMIT_MAX_BYTES) {
            return res.status(400).json({ error: `maxBytes out of range` });
        }
        const maxCount = Math.floor(rawCount);
        const maxBytes = Math.floor(rawBytes);
        kvSet(SNAPSHOT_LIMIT_COUNT_KEY, Buffer.from(String(maxCount), 'utf-8'));
        kvSet(SNAPSHOT_LIMIT_BYTES_KEY, Buffer.from(String(maxBytes), 'utf-8'));
        const trim = trimSnapshotsToLimits();
        const usage = snapshotUsage();
        res.json({
            maxCount, maxBytes,
            currentCount: usage.count,
            currentBytes: usage.bytes,
            logicalBytes: usage.logicalBytes,
            removed: trim.removed,
        });
    } catch (err) { next(err); }
});

app.get('/api/db/snapshots', async (req, res, next) => {
    if (!await checkAuth(req, res)) return;
    try {
        const out = kvList(DB_BACKUP_PREFIX).map((key) => {
            const tsRaw = parseInt(key.slice(DB_BACKUP_PREFIX.length, -4), 10);
            const ts = Number.isFinite(tsRaw) ? tsRaw * 100 : null;
            // Logical size — the full data this snapshot represents (the whole DB),
            // not its marginal on-disk cost. Users expect "this backup = my 53 MB
            // DB"; the dedup win is shown once, as the section's savings figure.
            // (kvSize reassembles via the manifest; the marker's 13 bytes are not
            // what a user wants to see for a full backup.) Trimming still sizes by
            // snapshotFootprint in db.cjs, so this display change can't over-trim.
            return { key, size: kvSize(key) || 0, timestamp: ts };
        }).sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
        res.json({ snapshots: out });
    } catch (err) { next(err); }
});

app.delete('/api/db/snapshots', async (req, res, next) => {
    if (!await checkAuth(req, res)) return;
    if (!checkActiveSession(req, res)) return;
    try {
        const key = typeof req.query?.key === 'string' ? req.query.key : '';
        // Restrict to snapshot prefix — never let this endpoint touch other kv keys.
        if (!key.startsWith(DB_BACKUP_PREFIX)) {
            return res.status(400).json({ error: 'Invalid snapshot key' });
        }
        kvDel(key);
        res.json({ ok: true });
    } catch (err) { next(err); }
});

// Restore a snapshot atomically server-side: copy snapshot blob → live blob,
// invalidate caches, rebuild chat store. Client-side setDatabase + reload is
// racy because the patch-sync save loop is debounced and the reload can fire
// before the snapshot data lands on disk.
// Like the import routes, a snapshot restore owns importInProgress so it and a
// backup capture exclude each other with the existing 409.
async function runSnapshotRestoreReset(apply) {
    if (importInProgress) throw storageResetBusyError();
    importInProgress = true;
    try {
        return await runStorageReset('snapshot-restore', { prepare: async () => null, apply });
    } finally {
        importInProgress = false;
    }
}

app.post('/api/db/snapshots/restore', async (req, res, next) => {
    if (!await checkAuth(req, res)) return;
    if (!checkActiveSession(req, res)) return;
    try {
        const key = typeof req.body?.key === 'string' ? req.body.key : '';
        if (!key.startsWith(DB_BACKUP_PREFIX)) {
            return res.status(400).json({ error: 'Invalid snapshot key' });
        }
        const blob = kvGet(key);
        if (!blob) {
            return res.status(404).json({ error: 'Snapshot not found' });
        }
        await runSnapshotRestoreReset(async (_unused, reset) => {
            await storageResetTestHooks.waitAtResetGate(reset.kind);
            // Capture the REMOTE and cold-storage rows the snapshot needs from
            // live KV at this serialized point and prepare the database before
            // anything is written (including the pre-restore snapshot below);
            // a snapshot that cannot be prepared fails here.
            const prepared = await prepareResetDatabase(
                Buffer.from(blob),
                createStagedRowReader((rowKey) => kvGet(rowKey)),
            );
            // Drain any pending debounced persist first — same pattern as
            // /api/db/optimize. Without this, an in-flight save could land
            // after kvCopyValue and overwrite the restored snapshot.
            await flushPendingDb();
            // The restored DB and removal of newer journal rows are one durable
            // transition. If either write fails, SQLite rolls both back and the
            // caches keep the still-current database.
            commitSnapshotRestore({
                runTransaction: (operation) => sqliteDb.transaction(operation)(),
                restoreDatabase: () => {
                    kvCopyValue(key, DB_BLOB_KEY);
                    if (prepared.changed) kvSet(DB_BLOB_KEY, prepared.databaseBytes);
                    recordPreparedRemoteMigration(prepared, blob);
                    // Only database.bin was rewritten, so the epoch row still
                    // holds the pre-restore value here.
                    advanceStorageEpoch(readStorageEpoch(), reset);
                },
                discardJournal: () => kvDelPrefix(CHAT_WRITE_JOURNAL_PREFIX),
                resetJournalMemory: () => chatWriteJournal.resetMemory(),
            });
            reset.committed = true;
            // Snapshot may pre-date the remote-block migration. Clear the marker
            // step of the earlier flow is covered by the preparation above: REMOTE
            // blocks were resolved against the live remotes/ rows and the restore
            // transaction recorded the migration as done. Publish the caches.
            publishPreparedReset(prepared);
            logPreparedColdStorage(prepared);
        });
        res.json({ ok: true });
    } catch (err) { next(err); }
});

// ── Boot-time backup reminder ───────────────────────────────────────────────

const BOOT_REMINDER_KEY = 'config/boot-backup-reminder';

function readBootReminder() {
    try {
        const raw = kvGet(BOOT_REMINDER_KEY);
        if (!raw) return false;
        return Buffer.from(raw).toString('utf-8').trim() === '1';
    } catch { return false; }
}

app.get('/api/backup/boot-reminder', async (req, res, next) => {
    if (!await checkAuth(req, res)) return;
    try {
        res.json({ enabled: readBootReminder() });
    } catch (err) { next(err); }
});

app.put('/api/backup/boot-reminder', async (req, res, next) => {
    if (!await checkAuth(req, res)) return;
    if (!checkActiveSession(req, res)) return;
    try {
        const enabled = !!req.body?.enabled;
        kvSet(BOOT_REMINDER_KEY, Buffer.from(enabled ? '1' : '0', 'utf-8'));
        res.json({ enabled });
    } catch (err) { next(err); }
});

// ── Backup directory configuration ──────────────────────────────────────────

app.get('/api/backup/server/path', async (req, res, next) => {
    if (!await checkAuth(req, res)) return;
    try {
        res.json({
            path: backupsDir,
            default: DEFAULT_BACKUPS_DIR,
            isDefault: backupsDir === DEFAULT_BACKUPS_DIR,
        });
    } catch (err) { next(err); }
});

app.put('/api/backup/server/path', async (req, res, next) => {
    if (!await checkAuth(req, res)) return;
    if (!checkActiveSession(req, res)) return;
    try {
        const next = typeof req.body?.path === 'string' ? req.body.path.trim() : '';
        if (!next) {
            return res.status(400).json({ error: 'Path required' });
        }
        const resolved = path.resolve(next);
        if (isManagedBackupPath(resolved)) {
            return res.status(400).json({
                error: 'Backup path cannot be inside PocketRisu app files. Choose a separate folder such as data/backups.',
            });
        }
        // Ensure parent exists / target is writable. Create the dir if missing.
        try {
            if (!existsSync(resolved)) {
                mkdirSync(resolved, { recursive: true });
            }
            // Probe writability with a tmpfile.
            const probe = path.join(resolved, `.risu-write-probe-${Date.now()}`);
            require('fs').writeFileSync(probe, '');
            require('fs').unlinkSync(probe);
        } catch (e) {
            return res.status(400).json({ error: 'Path is not writable: ' + (e?.message || String(e)) });
        }
        const previous = backupsDir;
        backupsDir = resolved;
        kvSet(BACKUP_PATH_CONFIG_KEY, Buffer.from(resolved, 'utf-8'));
        writeBackupPathMarker(resolved);
        res.json({
            path: backupsDir,
            previous,
            default: DEFAULT_BACKUPS_DIR,
            isDefault: backupsDir === DEFAULT_BACKUPS_DIR,
        });
    } catch (err) { next(err); }
});

// ── Inlay bulk compression endpoint ──────────────────────────────────────────
const COMPRESS_IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp']);

app.post('/api/inlays/compress', sessionAuthMiddleware, async (req, res) => {
    if (!checkActiveSession(req, res)) return;
    const quality = typeof req.body?.quality === 'number' ? req.body.quality : 85;
    // Images read before a storage reset must never be written after it.
    const compressionGeneration = storageResetGeneration;

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    });

    const send = (data) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
        const files = await listInlayFiles();
        const imageFiles = [];

        for (const entry of files) {
            if (!COMPRESS_IMAGE_EXTS.has(entry.ext)) continue;
            const sidecar = await readInlaySidecar(entry.id);
            if (sidecar && sidecar.type !== 'image') continue;
            imageFiles.push(entry);
        }

        const total = imageFiles.length;
        let compressed = 0;
        let skipped = 0;
        let totalSaved = 0;

        const vips = await getVips()

        for (let i = 0; i < imageFiles.length; i++) {
            const entry = imageFiles[i];
            try {
                const original = await fs.readFile(entry.filePath);
                const img = vips.Image.newFromBuffer(original)
                let webpBuf
                try {
                    const out = img.writeToBuffer('.webp', { Q: quality })
                    webpBuf = Buffer.from(out);
                } finally {
                    img.delete()
                }

                if (webpBuf.length < original.length) {
                    const sidecar = await readInlaySidecar(entry.id);
                    const info = sidecar || {};
                    if (compressionGeneration !== storageResetGeneration || storageResetActive) {
                        throw new Error('Storage reset since compression started');
                    }
                    await writeInlayFile(entry.id, 'webp', webpBuf, { ...info, ext: 'webp' });
                    // invalidate thumbnail cache
                    kvDel(`inlay_thumb/${entry.id}`);
                    const saved = original.length - webpBuf.length;
                    totalSaved += saved;
                    compressed++;
                } else {
                    skipped++;
                }
            } catch {
                skipped++;
            }

            send({ type: 'progress', current: i + 1, total, compressed, skipped, totalSaved });
        }

        send({ type: 'done', total, compressed, skipped, totalSaved });
    } catch (err) {
        send({ type: 'error', message: err?.message || 'Unknown error' });
    }

    res.end();
});

// ── Public stats proxy ───────────────────────────────────────────────────────
app.get('/api/public-stats', async (req, res) => {
    try {
        const r = await fetch(PUBLIC_STATS_URL);
        if (!r.ok) { res.status(r.status).json({ error: 'upstream error' }); return; }
        const data = await r.json();
        res.json(data);
    } catch {
        res.status(502).json({ error: 'fetch failed' });
    }
});

// ── Update check endpoint ────────────────────────────────────────────────────
app.get('/api/update-check', async (req, res) => {
    const currentVersion = getCurrentVersion();
    if (UPDATE_CHECK_DISABLED) {
        res.json({ currentVersion, hasUpdate: false, severity: 'none', disabled: true, deploymentType, canSelfUpdate: false });
        return;
    }
    const result = await fetchLatestRelease(req.query.lang);
    const response = result || { currentVersion, hasUpdate: false, severity: 'none' };
    response.deploymentType = deploymentType;
    response.canSelfUpdate = deploymentType === 'portable'
        && !!response.hasUpdate
        && !response.manualOnly
        && !!getSelfUpdateAssetInfo(response.latestVersion);
    res.json(response);
});

// ── Self-update endpoint (portable only) ─────────────────────────────────────
let selfUpdateInProgress = false;

app.post('/api/self-update', async (req, res) => {
    if (!await checkAuth(req, res)) return;

    if (deploymentType !== 'portable') {
        res.status(400).json({ error: 'Self-update is only available for portable deployments' });
        return;
    }
    if (selfUpdateInProgress) {
        res.status(409).json({ error: 'Update already in progress' });
        return;
    }
    selfUpdateInProgress = true;

    // Track client disconnect — used to abort download, but NOT to release the lock.
    // The lock stays held until the update fully completes or fails, preventing
    // a second request from touching the same install directory concurrently.
    let clientDisconnected = false;
    res.on('close', () => {
        clientDisconnected = true;
        console.log('[Update] Client disconnected (update continues if past download stage).');
    });

    // NDJSON streaming response
    res.writeHead(200, {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
    });
    const send = (step, progress, message) => {
        try { res.write(JSON.stringify({ step, progress, message }) + '\n'); } catch {}
    };

    let tmpDir = null;
    try {
        // 1. Check update
        send('checking', 0, 'Checking for updates...');
        const updateInfo = await fetchLatestRelease();
        if (!updateInfo?.hasUpdate) {
            send('done', 100, 'Already up to date.');
            res.end();
            selfUpdateInProgress = false;
            return;
        }

        const targetVersion = updateInfo.latestVersion;
        const assetInfo = getSelfUpdateAssetInfo(targetVersion);
        if (!assetInfo) {
            throw new Error(`No release asset for ${process.platform}-${process.arch}`);
        }

        // 2. Download
        tmpDir = path.join(os.tmpdir(), `risu-update-${Date.now()}`);
        await fs.mkdir(tmpDir, { recursive: true });
        const archivePath = path.join(tmpDir, assetInfo.filename);

        send('downloading', 0, 'Starting download...');
        const dlRes = await fetch(assetInfo.url, { redirect: 'follow' });
        if (!dlRes.ok) throw new Error(`Download failed: ${dlRes.status} ${dlRes.statusText}`);

        const totalSize = parseInt(dlRes.headers.get('content-length'), 10) || 0;
        const fileStream = require('fs').createWriteStream(archivePath);
        let downloaded = 0;
        let lastPct = -1;

        const progress = new Transform({
            transform(chunk, _enc, cb) {
                if (clientDisconnected) { cb(new Error('Client disconnected')); return; }
                downloaded += chunk.length;
                if (totalSize > 0) {
                    const pct = Math.round((downloaded / totalSize) * 100);
                    if (pct >= lastPct + 5) {
                        lastPct = pct;
                        const dlMB = (downloaded / 1048576).toFixed(0);
                        const totalMB = (totalSize / 1048576).toFixed(0);
                        send('downloading', pct, `Downloading... ${pct}% (${dlMB}/${totalMB} MB)`);
                    }
                }
                cb(null, chunk);
            },
        });
        await pipeline(Readable.fromWeb(dlRes.body), progress, fileStream);
        send('downloading', 100, 'Download complete.');

        // 3. Extract
        send('extracting', null, 'Extracting...');
        const extractDir = path.join(tmpDir, 'extracted');
        await fs.mkdir(extractDir, { recursive: true });

        if (process.platform === 'win32') {
            try {
                // Windows 10 1803+ has tar.exe built-in, handles zip, much faster than PowerShell
                execSync(`tar -xf "${archivePath}" -C "${extractDir}"`, { timeout: 300000 });
            } catch {
                execSync(
                    `powershell -NoProfile -Command "Expand-Archive -Force -Path '${archivePath}' -DestinationPath '${extractDir}'"`,
                    { timeout: 300000 },
                );
            }
        } else {
            execSync(`tar -xzf "${archivePath}" -C "${extractDir}"`, { timeout: 300000 });
        }

        // Resolve possibly nested root directory (same as updater.cjs resolveExtractedRoot)
        const entries = await fs.readdir(extractDir);
        let sourceDir = extractDir;
        if (entries.length === 1) {
            const candidate = path.join(extractDir, entries[0]);
            if ((await fs.stat(candidate)).isDirectory()) sourceDir = candidate;
        }

        // 4. Validate extracted package (mirrors updater.cjs validateExtractedRoot)
        const REQUIRED_ENTRIES = ['dist', 'server', 'package.json'];
        const REQUIRED_DIST_FILES = ['index.html'];
        for (const entry of REQUIRED_ENTRIES) {
            try { await fs.access(path.join(sourceDir, entry)); }
            catch { throw new Error(`Downloaded package is missing required entry: ${entry}`); }
        }
        for (const file of REQUIRED_DIST_FILES) {
            try { await fs.access(path.join(sourceDir, 'dist', file)); }
            catch { throw new Error(`Downloaded package is missing dist/${file}`); }
        }
        if (process.platform === 'win32') {
            try { await fs.access(path.join(sourceDir, 'bin')); }
            catch { throw new Error('Downloaded Windows package is missing bin/'); }
        }

        // 5. Replace files (follows updater.cjs Phase 1-4 pattern)
        // Stop tunnel before replacing files to avoid file lock issues
        stopTunnel();
        send('replacing', null, 'Replacing files...');
        const appDir = process.cwd();
        const isWin = process.platform === 'win32';
        const updateTmp = path.join(appDir, '.update-tmp');

        // Restore from a previous interrupted update if leftover exists
        const prevBackup = path.join(updateTmp, 'backup');
        try {
            await fs.access(prevBackup);
            console.log('[Update] Restoring files from previous interrupted update...');
            await restoreBackup(prevBackup, appDir);
        } catch { /* no leftover */ }
        await fs.rm(updateTmp, { recursive: true, force: true }).catch(() => {});
        await fs.mkdir(updateTmp, { recursive: true });

        // Carry over SSL certificates into new package before swap
        const sslSrc = path.join(appDir, 'server', 'node', 'ssl', 'certificate');
        try {
            await fs.access(sslSrc);
            const sslDst = path.join(sourceDir, 'server', 'node', 'ssl', 'certificate');
            await fs.mkdir(path.dirname(sslDst), { recursive: true });
            await fs.cp(sslSrc, sslDst, { recursive: true });
        } catch { /* no user certs */ }

        // Keep set — matches updater.cjs + user data/config that must survive updates
        const keep = new Set(['save', 'backups', '.installed-version', '.update-tmp', 'scripts', '.env', '.npmrc', '.portable']);
        if (isWin) keep.add('bin');

        // Phase 1: move old files to backup — rollback immediately on any failure
        const backupDir = path.join(updateTmp, 'backup');
        await fs.mkdir(backupDir, { recursive: true });

        const oldEntries = await fs.readdir(appDir);
        for (const e of oldEntries) {
            if (keep.has(e)) continue;
            try {
                await fs.rename(path.join(appDir, e), path.join(backupDir, e));
            } catch (backupErr) {
                logger.error(`[Update] Failed to back up ${e}: ${backupErr.message}`);
                console.log('[Update] Restoring files already moved to backup...');
                await restoreBackup(backupDir, appDir);
                throw new Error(isWin
                    ? 'Update failed: some files are in use. Close RisuAI first, then try again.'
                    : 'Update failed: some files are in use. Stop the server first, then try again.');
            }
        }

        // Phase 2: move new files from extracted to app root
        const skipMove = new Set(['save', 'scripts']);
        if (isWin) skipMove.add('bin');
        const moved = [];
        try {
            const newEntries = await fs.readdir(sourceDir);
            for (const e of newEntries) {
                if (skipMove.has(e)) continue;
                const dest = path.join(appDir, e);
                await fs.rm(dest, { recursive: true, force: true }).catch(() => {});
                await moveAcrossVolumes(path.join(sourceDir, e), dest);
                moved.push(e);
            }
            // Post-move validation
            for (const entry of REQUIRED_ENTRIES) {
                if (!moved.includes(entry) && !existsSync(path.join(appDir, entry))) {
                    throw new Error(`Required entry was not installed: ${entry}`);
                }
            }
            for (const file of REQUIRED_DIST_FILES) {
                if (!existsSync(path.join(appDir, 'dist', file))) {
                    throw new Error(`Required file was not installed: dist/${file}`);
                }
            }
        } catch (moveErr) {
            logger.error(`[Update] Move failed: ${moveErr.message}`);
            console.log('[Update] Restoring from backup...');
            await restoreBackup(backupDir, appDir);
            throw new Error('Update failed, previous version restored. Please try again.');
        }

        // Phase 3: update scripts/ from new release
        const newScripts = path.join(sourceDir, 'scripts');
        try {
            await fs.access(newScripts);
            await fs.mkdir(path.join(appDir, 'scripts'), { recursive: true });
            for (const f of await fs.readdir(newScripts)) {
                await fs.copyFile(path.join(newScripts, f), path.join(appDir, 'scripts', f));
            }
        } catch { /* no scripts in release */ }

        // Phase 4 (Windows): stage bin/ for restart script to apply after exit
        if (isWin) {
            const newBin = path.join(sourceDir, 'bin');
            const stagedBin = path.join(updateTmp, 'new-bin');
            await fs.rm(stagedBin, { recursive: true, force: true }).catch(() => {});
            await fs.cp(newBin, stagedBin, { recursive: true });
            // Version marker — finalized after bin/ is applied
            await fs.writeFile(path.join(updateTmp, 'latest-version'), `v${targetVersion}`);
        } else {
            await fs.writeFile(path.join(appDir, '.installed-version'), `v${targetVersion}`);
        }

        // Cleanup temp download (not .update-tmp — that stays on Windows for bin/ post-step)
        fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
        tmpDir = null;
        if (!isWin) {
            fs.rm(updateTmp, { recursive: true, force: true }).catch(() => {});
        }

        send('restarting', 100, 'Update complete. Restarting...');
        res.end();

        // 6. Flush DB and restart
        setTimeout(async () => {
            try {
            console.log(`[Update] Self-update to v${targetVersion} complete. Restarting...`);
            try { await flushPendingDb(); } catch {}
            try { checkpointWal('TRUNCATE'); } catch {}

            const port = process.env.PORT || 6001;

            if (isWin) {
                // Windows: use a .bat script to apply bin/, finalize version, and restart.
                // A bat script can replace bin/node.exe after the Node process exits,
                // avoiding file-lock issues that a Node child process would hit.
                const batScript = path.join(os.tmpdir(), `risu-restart-${Date.now()}.bat`);
                const utmp = path.join(appDir, '.update-tmp');
                const binDir = path.join(appDir, 'bin');
                const binBackup = path.join(utmp, 'old-bin');
                const batLines = [
                    '@echo off',
                    'timeout /t 3 /nobreak >nul',
                    // Apply staged bin/: backup current → copy new → on failure restore backup
                    `if exist "${path.join(utmp, 'new-bin')}\\" (`,
                    `  if exist "${binDir}\\" (`,
                    `    xcopy /E /I /Y "${binDir}\\*" "${binBackup}\\" >nul`,
                    `  )`,
                    `  xcopy /E /I /Y "${path.join(utmp, 'new-bin')}\\*" "${binDir}\\" >nul`,
                    `  if errorlevel 1 (`,
                    `    echo [Update] bin/ copy failed, restoring backup...`,
                    `    if exist "${binBackup}\\" (`,
                    `      xcopy /E /I /Y "${binBackup}\\*" "${binDir}\\" >nul`,
                    `    )`,
                    `    echo [Update] bin/ restored. Staged files kept for retry.`,
                    `    goto start`,
                    `  )`,
                    `)`,
                    // Finalize version marker only after successful bin/ copy
                    `if exist "${path.join(utmp, 'latest-version')}" (`,
                    `  copy /Y "${path.join(utmp, 'latest-version')}" "${path.join(appDir, '.installed-version')}" >nul`,
                    `)`,
                    // Cleanup .update-tmp (includes old-bin backup)
                    `rmdir /s /q "${utmp}" 2>nul`,
                    ':start',
                    // Start server with correct working directory
                    `cd /d "${appDir}"`,
                    `start "" "${path.join(appDir, 'bin', 'node.exe')}" "${path.join(appDir, 'server', 'node', 'server.cjs')}"`,
                    'exit /b 0',
                ];
                writeFileSync(batScript, batLines.join('\r\n'));
                spawn('cmd.exe', ['/c', batScript], { detached: true, stdio: 'ignore' }).unref();
            } else {
                // Unix: Node restart helper with port-check to avoid clashing with process managers
                const restartScript = path.join(os.tmpdir(), `risu-restart-${Date.now()}.cjs`);
                writeFileSync(restartScript, [
                    `const net = require('net');`,
                    `const { spawn } = require('child_process');`,
                    `setTimeout(() => {`,
                    `  const s = net.createServer();`,
                    `  s.once('error', () => process.exit(0));`,
                    `  s.once('listening', () => {`,
                    `    s.close();`,
                    `    spawn(${JSON.stringify(process.execPath)}, ['server/node/server.cjs'], {`,
                    `      cwd: ${JSON.stringify(appDir)},`,
                    `      detached: true,`,
                    `      stdio: 'inherit',`,
                    `      env: Object.assign({}, process.env),`,
                    `    }).unref();`,
                    `    setTimeout(() => process.exit(0), 500);`,
                    `  });`,
                    `  s.listen(${Number(port)});`,
                    `}, 3000);`,
                ].join('\n'));
                spawn(process.execPath, [restartScript], { detached: true, stdio: 'ignore' }).unref();
            }
            process.exit(0);
            } catch (restartErr) {
                logger.error('[Update] Restart failed:', restartErr);
                selfUpdateInProgress = false;
            }
        }, 500);

    } catch (e) {
        logger.error('[Update] Self-update failed:', e);
        send('error', null, `Update failed: ${e.message}`);
        res.end();
        selfUpdateInProgress = false;
        if (tmpDir) fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
});

// Helper: rename, falling back to copy+remove when src and dest are on
// different volumes (Windows EXDEV — e.g. app on D:, os.tmpdir() on C:)
async function moveAcrossVolumes(src, dest) {
    try {
        await fs.rename(src, dest);
    } catch (err) {
        if (err && err.code === 'EXDEV') {
            await fs.cp(src, dest, { recursive: true, force: true });
            await fs.rm(src, { recursive: true, force: true });
            return;
        }
        throw err;
    }
}

// Helper: restore files from backup directory into app root (mirrors updater.cjs restoreBackupIntoRoot)
async function restoreBackup(backupDir, rootDir) {
    try { await fs.access(backupDir); } catch { return; }
    for (const entry of await fs.readdir(backupDir)) {
        const src = path.join(backupDir, entry);
        const dest = path.join(rootDir, entry);
        try {
            await fs.rm(dest, { recursive: true, force: true }).catch(() => {});
            await moveAcrossVolumes(src, dest);
        } catch { /* best effort */ }
    }
}

// ── Cloudflare Quick Tunnel API ──────────────────────────────────────────────

app.get('/api/tunnel/status', async (req, res) => {
    if (!await checkAuth(req, res)) return;
    res.json({
        disabled: TUNNEL_DISABLED,
        status: tunnelStatus,
        url: tunnelUrl,
        error: tunnelError,
        platform: process.platform,
    });
});

app.post('/api/tunnel/start', async (req, res) => {
    if (!await checkAuth(req, res)) return;
    if (TUNNEL_DISABLED) return res.status(403).json({ error: 'Tunnel is disabled via RISU_TUNNEL_DISABLED' });
    if (tunnelStatus === 'running' || tunnelStatus === 'starting' || tunnelStatus === 'downloading') {
        return res.status(409).json({ error: 'Tunnel is already ' + tunnelStatus });
    }

    let cfPath = findCloudflaredBinary();

    // Auto-download if not found
    if (!cfPath) {
        tunnelStatus = 'downloading';
        tunnelError = null;
        res.json({ status: 'downloading' });

        try {
            cfPath = await downloadCloudflared();
        } catch (e) {
            logger.error('[Tunnel] Download failed:', e.message);
            tunnelStatus = 'error';
            tunnelError = `Failed to download cloudflared: ${e.message}`;
            return;
        }
        // After download, start the tunnel (response already sent)
        startTunnelProcess(cfPath);
        return;
    }

    tunnelStatus = 'starting';
    tunnelError = null;
    tunnelUrl = null;
    startTunnelProcess(cfPath);
    res.json({ status: 'starting' });
});

function startTunnelProcess(cfPath) {
    const port = process.env.PORT || 6001;
    tunnelStatus = 'starting';
    tunnelError = null;
    tunnelUrl = null;

    try {
        tunnelProcess = spawn(cfPath, ['tunnel', '--url', 'http://localhost:' + port], {
            stdio: ['ignore', 'pipe', 'pipe']
        });

        tunnelProcess.stderr.on('data', (chunk) => {
            const text = chunk.toString();
            const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
            if (match && tunnelStatus === 'starting') {
                tunnelUrl = match[0];
                tunnelStatus = 'running';
                if (tunnelStartTimeout) { clearTimeout(tunnelStartTimeout); tunnelStartTimeout = null; }
                console.log(`[Tunnel] Quick tunnel URL: ${tunnelUrl}`);
            }
        });

        tunnelProcess.on('error', (err) => {
            logger.error('[Tunnel] Process error:', err.message);
            tunnelStatus = 'error';
            tunnelError = err.message;
            tunnelProcess = null;
            if (tunnelStartTimeout) { clearTimeout(tunnelStartTimeout); tunnelStartTimeout = null; }
        });

        tunnelProcess.on('exit', (code) => {
            if (tunnelStatus === 'running' || tunnelStatus === 'starting') {
                console.log(`[Tunnel] Process exited with code ${code}`);
                tunnelStatus = 'error';
                tunnelError = `cloudflared exited unexpectedly (code ${code})`;
            }
            tunnelProcess = null;
            tunnelUrl = null;
            if (tunnelStartTimeout) { clearTimeout(tunnelStartTimeout); tunnelStartTimeout = null; }
        });

        tunnelStartTimeout = setTimeout(() => {
            if (tunnelStatus === 'starting') {
                tunnelStatus = 'error';
                tunnelError = 'Tunnel failed to start within 30 seconds';
                if (tunnelProcess) { try { tunnelProcess.kill('SIGTERM'); } catch {} tunnelProcess = null; }
            }
            tunnelStartTimeout = null;
        }, 30000);
    } catch (e) {
        tunnelStatus = 'error';
        tunnelError = e.message;
        tunnelProcess = null;
    }
}

app.post('/api/tunnel/stop', async (req, res) => {
    if (!await checkAuth(req, res)) return;
    stopTunnel();
    res.json({ status: 'off' });
});

// ─── Express error middleware — must be registered after all routes ─────────
app.use(expressErrorMiddleware);
app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const storagePayload = storageResetErrorPayload(err);
    if (storagePayload) return res.status(err.statusCode).json(storagePayload);
    res.status(500).json({ error: err?.message || 'internal server error' });
});

// ─────────────────────────────────────────────────────────────────────────────

async function getHttpsOptions() {

    const keyPath = path.join(sslPath, 'server.key');
    const certPath = path.join(sslPath, 'server.crt');

    try {
 
        await fs.access(keyPath);
        await fs.access(certPath);

        const [key, cert] = await Promise.all([
            fs.readFile(keyPath),
            fs.readFile(certPath)
        ]);
       
        return { key, cert };

    } catch (error) {
        if (error.code === 'ENOENT') {
            logger.info('[Server] No SSL certificate found, starting with HTTP');
        } else {
            logger.error('[Server] SSL setup errors:', error.message);
            console.log('[Server] Start the server with HTTP instead of HTTPS...');
        }
        return null;
    }
}

async function startServer() {
    try {
        await migrateInlaysToFilesystem();
        await migrateRemoteBlocksIfNeeded();
        const port = process.env.PORT || 6001;
        const httpsOptions = await getHttpsOptions();
        let server;

        if (httpsOptions) {
            // HTTPS
            server = https.createServer(httpsOptions, app);
            setupProxyStreamWebSocket(server);
            server.listen(port, () => {
                console.log("[Server] HTTPS server is running.");
                console.log(`[Server] https://localhost:${port}/`);
            });
        } else {
            // HTTP
            server = http.createServer(app);
            setupProxyStreamWebSocket(server);
            server.listen(port, () => {
                console.log("[Server] HTTP server is running.");
                console.log(`[Server] http://localhost:${port}/`);
            });
        }
    } catch (error) {
        logger.error('[Server] Failed to start server :', error);
        process.exit(1);
    }
}

// Graceful shutdown: flush pending patches and checkpoint WAL before exit
for (const sig of ['SIGTERM', 'SIGINT']) {
    process.on(sig, async () => {
        console.log(`[Server] Received ${sig}, flushing pending data...`);
        stopTunnel();
        try { await flushPendingDb(); } catch (e) { logger.error('[Server] Flush error:', e); }
        try { checkpointWal('TRUNCATE'); } catch { /* non-fatal */ }
        process.exit(0);
    });
}

(async () => {
    // Proxy stream job garbage collection
    setInterval(() => {
        const now = Date.now();
        for (const [jobId, job] of proxyStreamJobs.entries()) {
            if (!job.done && now >= job.deadlineAt && !job.abortController.signal.aborted) {
                job.abortController.abort();
            }
            if (job.done && job.clients.size === 0 && job.cleanupAt > 0 && now >= job.cleanupAt) {
                cleanupJob(jobId);
                continue;
            }
            if (!job.done && now - job.updatedAt > Math.max(PROXY_STREAM_DEFAULT_TIMEOUT_MS, job.timeoutMs * 2)) {
                cleanupJob(jobId);
            }
        }
    }, PROXY_STREAM_GC_INTERVAL_MS);

    await startServer();

    // Periodically checkpoint WAL to reclaim disk space.
    // TRUNCATE (vs RESTART) shrinks the -wal file on disk, not just the writer
    // pointer — required for journal_size_limit to actually take effect.
    setInterval(() => {
        try { checkpointWal('TRUNCATE'); }
        catch { /* non-fatal */ }
    }, 5 * 60 * 1000); // every 5 minutes

})();
