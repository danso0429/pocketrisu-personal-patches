'use strict'

// E2-3c: storage reset barrier over the native PocketRisu 1.16.1 server.
// A storage reset (backup import, server restore, account apply, save-folder
// execute and upload, snapshot restore, database.bin removal) sets one flag
// and a new generation when it starts. checkActiveSession refuses storage
// writers with 503 while the flag is set (after the native account import
// gate); /api/db/flush, which does not call it, checks the same gate. A
// writer records the generation at entry and its queued work is refused if a
// reset started in between. The reset takes one storage queue slot, waits for
// debounced writes already running, persists what other debounced writes
// hold, and replaces the storage in one transaction that also advances the
// storage epoch. Competing resets keep the native importInProgress 409.

const serverFile = 'server/node/server.cjs'
const sessionLockFile = 'server/node/session-lock.cjs'

const units = [
    {
        name: 'barrier-state',
        type: 'replace',
        anchor: `let storageOperationQueue = Promise.resolve();
function queueStorageOperation(operation) {
    const operationRun = storageOperationQueue.then(operation, operation);
    storageOperationQueue = operationRun.catch(() => {});
    return operationRun;
}
`,
        content: `// ─── Storage reset barrier ─────────────────────────────────────────────────
// storageResetActive is set for the whole duration of a storage reset and
// storageResetGeneration advances when one starts. A writer admitted by
// checkActiveSession (or /api/db/flush) records the generation; its queued
// work is refused when a reset started after its admission, whether that
// reset is still running or already finished. storageRecoveryRequired is set
// only when a failed reset could not put the previous inlay directory back;
// it clears on process restart.
const { AsyncLocalStorage } = require('async_hooks');
let storageResetActive = false;
let storageResetGeneration = 0;
let storageResetAttempt = 0;
let storageResetCommittedGeneration = 0;
let storageRecoveryRequired = null;
let activeStorageReset = null;
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
            + \`Restore it manually from \${storageRecoveryRequired?.recoveryPath} and restart the server.\`,
        code: 'STORAGE_RECOVERY_REQUIRED',
        retryable: false,
        recoveryPath: storageRecoveryRequired?.recoveryPath,
    };
}

// Test gate name of an admitted writer route (storageResetTestHooks).
function storageAdmissionKind(req) {
    const route = req.path;
    if (req.method === 'POST' && /^\\/api\\/chat-content\\/[^/]+\\/[^/]+$/.test(route)) {
        return readChatDeltaBase(req) ? 'chat-content-delta' : 'chat-content';
    }
    if (req.method === 'DELETE' && route.startsWith('/api/backup/server/')) return 'backup-delete';
    return {
        '/api/patch': 'patch',
        '/api/write': 'write',
        '/api/remove': 'remove',
        '/api/assets/bulk-write': 'assets-bulk-write',
        '/api/db/flush': 'db-flush',
        '/api/db/assets/purge-orphans': 'db-purge-orphans',
        '/api/db/optimize': 'db-optimize',
        '/api/db/wal-checkpoint': 'db-wal-checkpoint',
        '/api/db/snapshots': 'db-snapshot-delete',
        '/api/inlays/compress': 'inlays-compress',
    }[route] ?? null;
}

function isDatabaseRemoveRequest(req) {
    const filePath = normalizeFilePathHeader(req.headers['file-path']);
    return typeof filePath === 'string'
        && /^[0-9a-f]+$/.test(filePath)
        && Buffer.from(filePath, 'hex').toString('utf-8') === 'database/database.bin';
}

// Once queued work of an admitted request was refused, whatever the route
// answers afterwards (its own error mapping included) is replaced by the
// refusal's 503. Responses already started are left alone.
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

// The storage reset gate. Called by checkActiveSession after the account
// import gate, and by /api/db/flush. A request that starts a reset passes
// while no recovery is required; a competing reset then gets the native
// importInProgress 409 from its route. Any other request is refused with a
// retryable 503 during a reset, and otherwise admitted: its generation is
// recorded for the queued work it starts.
function admitStorageRequest(req, res, { storageReset = false } = {}) {
    if (storageRecoveryRequired) {
        res.status(503).json(storageRecoveryRequiredPayload());
        return false;
    }
    if (storageReset) return true;
    if (storageResetActive) {
        res.status(503).json(storageResetInProgressPayload());
        return false;
    }
    const admission = {
        generation: storageResetGeneration,
        kind: storageAdmissionKind(req),
        res,
        refusal: null,
    };
    req.storageResetAdmission = admission;
    answerStorageRefusalsFor(admission);
    // The rest of the route handler, and the queued work it starts, run
    // with this admission (queueStorageOperation reads it).
    storageAdmissionContext.enterWith(admission);
    return true;
}

function staleStorageAdmissionPayload(admission) {
    if (storageRecoveryRequired) return storageRecoveryRequiredPayload();
    if (storageResetActive || admission.generation !== storageResetGeneration) {
        return storageResetInProgressPayload();
    }
    return null;
}

// Throws (and records the refusal on the admission) when the request was
// admitted before a reset started. Work that runs after the request was
// answered is not checked here; debounced writes check on their own.
function assertStorageAdmission(admission) {
    if (admission.res.headersSent) return;
    const payload = staleStorageAdmissionPayload(admission);
    if (!payload) return;
    admission.refusal = payload;
    throw new StorageResetRefusal(payload);
}

let storageOperationQueue = Promise.resolve();
function enqueueStorageOperation(operation) {
    const operationRun = storageOperationQueue.then(operation, operation);
    storageOperationQueue = operationRun.catch(() => {});
    return operationRun;
}

// Work of an admitted writer is checked when it is queued and again when it
// runs, so a write admitted before a reset never runs against its result.
function queueStorageOperation(operation) {
    const admission = storageAdmissionContext.getStore();
    if (!admission) return enqueueStorageOperation(operation);
    try {
        assertStorageAdmission(admission);
    } catch (error) {
        return Promise.reject(error);
    }
    const admitted = () => enqueueStorageOperation(() => {
        assertStorageAdmission(admission);
        return operation();
    });
    const gate = admission.kind ? storageResetTestHooks.waitAtAdmissionGate(admission.kind) : null;
    if (!gate) return admitted();
    return gate.then(() => {
        assertStorageAdmission(admission);
        return admitted();
    });
}

// ─── Debounced writes around a reset ───────────────────────────────────────
// The chat POST and /api/patch timers write outside the storage queue. A
// reset waits for those already writing; one that fires during a reset
// leaves its saveTimers entry as the record that memory is ahead of disk:
// the reset's own flush persists it, a committed reset drops it, and a reset
// that did not commit arms it again.
const storagePersistsInFlight = new Set();
const deferredStoragePersists = new Map();

function trackStoragePersist(cacheKey, persist) {
    const armedGeneration = storageResetGeneration;
    return function storagePersistTimer() {
        const timer = this;
        if (storageResetActive) {
            deferredStoragePersists.set(cacheKey, { timer, persist });
            return;
        }
        if (armedGeneration < storageResetCommittedGeneration) {
            // Armed before a reset that replaced the storage it describes.
            if (saveTimers[cacheKey] === timer) delete saveTimers[cacheKey];
            return;
        }
        const run = persist();
        storagePersistsInFlight.add(run);
        const settle = () => { storagePersistsInFlight.delete(run); };
        run.then(settle, settle);
    };
}

function settleDeferredStoragePersists(reset) {
    for (const [cacheKey, { timer, persist }] of deferredStoragePersists) {
        deferredStoragePersists.delete(cacheKey);
        // The reset's flush or cache invalidation already took the entry.
        if (saveTimers[cacheKey] !== timer) continue;
        if (reset.committed) {
            delete saveTimers[cacheKey];
            continue;
        }
        saveTimers[cacheKey] = setTimeout(trackStoragePersist(cacheKey, persist), SAVE_INTERVAL);
    }
}

// In-flight inlay file writes (bulk compression). A reset waits for them.
const inflightInlayMutations = new Set();
function trackInlayMutation(mutation) {
    inflightInlayMutations.add(mutation);
    const settle = () => { inflightInlayMutations.delete(mutation); };
    mutation.then(settle, settle);
    return mutation;
}

async function waitForStoragePersists() {
    while (storagePersistsInFlight.size > 0 || inflightInlayMutations.size > 0 || dbFlushInFlight) {
        await Promise.allSettled([
            ...storagePersistsInFlight,
            ...inflightInlayMutations,
            ...(dbFlushInFlight ? [dbFlushInFlight] : []),
        ]);
    }
}

// Pending debounced writes of keys other than database.bin are written now
// and their timers cleared; they would otherwise land after the reset.
// database.bin is left to the reset: each native reset path flushes it
// (flushPendingDb) or invalidates the cache that holds it.
function persistAndDisarmPendingSaves() {
    for (const cacheKey of Object.keys(saveTimers)) {
        if (cacheKey === DB_HEX_KEY) continue;
        const timer = saveTimers[cacheKey];
        if (!timer) continue;
        const document = dbCache[cacheKey];
        if (document !== undefined) {
            const decodedKey = Buffer.from(cacheKey, 'hex').toString('utf-8');
            kvSet(decodedKey, Buffer.from(encodeRisuSaveLegacy(document)));
        }
        clearTimeout(timer);
        delete saveTimers[cacheKey];
    }
}

// ─── Storage epoch ─────────────────────────────────────────────────────────
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
// reset.epochBefore was read before the reset's first destructive write. An
// epoch row carried by the restored data only raises the next value; a
// malformed one fails the reset (the transaction rolls back).
function advanceStorageEpoch(reset) {
    const restored = readStorageEpoch();
    const next = Math.max(reset.epochBefore, restored) + 1;
    if (!Number.isSafeInteger(next)) throw new Error('Storage epoch is exhausted');
    kvSet(STORAGE_EPOCH_KEY, Buffer.from(String(next), 'utf-8'));
    storageResetTestHooks.failpoint('after-storage-epoch-write', reset.attempt);
    return next;
}

// Final recovery cleanup inside a reset transaction, after the restored rows
// are applied: neither a previous nor an imported row keeps recovery
// authority. Owners of other recovery namespaces extend this cleanup.
function discardStorageResetRecoveryRows() {
    kvDelPrefix(CHAT_WRITE_JOURNAL_PREFIX);
}

// Ends a reset transaction's writes: final recovery cleanup, then the epoch.
function finishStorageResetTransaction(reset) {
    discardStorageResetRecoveryRows();
    return advanceStorageEpoch(reset);
}

// Runs after a reset committed, inside its storage slot and before sessions
// are invalidated. Owners of in-memory state that belongs to the replaced
// storage (background runs) extend it.
function publishStorageResetCommitted(reset) {}

// ─── Storage reset runner ──────────────────────────────────────────────────
function beginStorageReset(kind) {
    if (storageRecoveryRequired) throw new StorageResetRefusal(storageRecoveryRequiredPayload());
    if (storageResetActive) throw storageResetBusyError();
    storageResetActive = true;
    storageResetGeneration += 1;
    activeStorageReset = {
        kind,
        attempt: ++storageResetAttempt,
        generation: storageResetGeneration,
        committed: false,
        epochBefore: 0,
        inlaySwap: null,
    };
    return activeStorageReset;
}

// Ends a reset begun by its route (save-folder upload starts its reset
// before it reads the upload).
function endStorageReset(reset) {
    if (!reset || activeStorageReset !== reset) return;
    settleDeferredStoragePersists(reset);
    activeStorageReset = null;
    storageResetActive = false;
}

// Linearizes a storage reset. Inside one storage queue slot: debounced writes
// already running finish, the other pending debounced writes are persisted
// and disarmed, the epoch is read, and apply() replaces the storage. apply()
// owns its transaction and sets reset.committed after COMMIT. After a commit,
// every session that booted before the reset is invalidated before the slot
// is released and the flag clears, also when apply() throws after its COMMIT
// (the error still reaches the caller).
async function runStorageReset(kind, apply, { reset: begun = null } = {}) {
    const reset = begun ?? beginStorageReset(kind);
    try {
        return await storageAdmissionContext.exit(() => enqueueStorageOperation(async () => {
            await waitForStoragePersists();
            await storageResetTestHooks.waitAtResetGate(reset.kind);
            persistAndDisarmPendingSaves();
            storageResetTestHooks.trace('cancel-persistence-timers', { kind: reset.kind });
            reset.epochBefore = readStorageEpoch();
            storageResetTestHooks.trace('begin', { kind: reset.kind });
            try {
                return await apply(reset);
            } finally {
                storageResetTestHooks.trace(reset.committed ? 'commit' : 'rollback', { kind: reset.kind });
                if (reset.committed) {
                    storageResetCommittedGeneration = reset.generation;
                    publishStorageResetCommitted(reset);
                    // A page loaded before the reset holds the replaced data:
                    // its next checked write gets 423 and it reloads.
                    sessionLock.invalidateBefore(Date.now());
                }
            }
        }));
    } finally {
        if (!begun && activeStorageReset === reset) {
            settleDeferredStoragePersists(reset);
            activeStorageReset = null;
            storageResetActive = false;
        }
    }
}

// The inlay directory swap of a backup import runs inside its transaction,
// before COMMIT, so a failed COMMIT can still put the previous directory
// back. The previous directory moves to a name no later import removes.
function swapResetInlayDir(reset, stagingDir) {
    const { renameSync } = require('fs');
    const swap = {
        oldMoved: false,
        newMoved: false,
        oldInlayCopy: path.join(savePath, \`inlays_import_backup-\${Date.now()}-\${reset.generation}\`),
    };
    reset.inlaySwap = swap;
    if (existsSync(inlayDir)) {
        renameSync(inlayDir, swap.oldInlayCopy);
        swap.oldMoved = true;
    }
    storageResetTestHooks.failpoint('second-inlay-rename', reset.attempt);
    renameSync(stagingDir, inlayDir);
    swap.newMoved = true;
}

// Puts the previous inlay directory back after a failure before or at
// COMMIT. If that is impossible, storage writes and resets stay refused
// until the directory is restored manually and the server restarts; the
// failure that needed the reverse is logged first.
function reverseResetInlaySwap(reset, stagingDir, originalError) {
    const swap = reset.inlaySwap;
    if (!swap || (!swap.oldMoved && !swap.newMoved)) return;
    const { renameSync } = require('fs');
    try {
        storageResetTestHooks.failpoint('reverse-inlay-rename', reset.attempt);
        if (swap.newMoved) renameSync(inlayDir, stagingDir);
        if (swap.oldMoved) renameSync(swap.oldInlayCopy, inlayDir);
        reset.inlaySwap = null;
    } catch (reverseError) {
        const recoveryPath = swap.oldMoved && existsSync(swap.oldInlayCopy) ? swap.oldInlayCopy : inlayDir;
        storageRecoveryRequired = { recoveryPath, at: Date.now() };
        logger.error(\`[Storage reset] \${reset.kind} failed before or at COMMIT:\`, originalError);
        logger.error(
            \`[Storage reset] Could not restore the previous inlay directory after a failed \${reset.kind}; \`
            + 'storage writes are disabled until it is restored manually and the server restarts. '
            + \`Previous inlays: \${recoveryPath}\`,
            reverseError,
        );
        throw new StorageResetRefusal(storageRecoveryRequiredPayload());
    }
}

// After COMMIT the previous inlay directory is no longer needed.
async function removeResetInlayCopy(reset) {
    const copy = reset.inlaySwap?.oldMoved ? reset.inlaySwap.oldInlayCopy : null;
    if (!copy) return;
    await fs.rm(copy, { recursive: true, force: true }).catch((error) => {
        logger.warn('[Storage reset] Could not remove the previous inlay directory:', error?.message || error);
    });
}
`,
    },
    {
        name: 'check-active-session-options',
        type: 'replace',
        anchor: `function checkActiveSession(req, res, { allowDuringAccountImport = false } = {}) {
`,
        content: `function checkActiveSession(req, res, { allowDuringAccountImport = false, storageReset = false, storageResetExempt = false } = {}) {
`,
    },
    {
        name: 'check-active-session-gate',
        type: 'insert',
        where: 'after',
        anchor: `        res.status(423).json({ error: 'A RisuAI account import is in progress', code: 'ACCOUNT_IMPORT_ACTIVE' })
        return false
    }
`,
        content: `    // Storage reset gate, after the account import gate. The account import
    // routes and the log routes are outside it; routes that start a reset
    // pass it and answer a competing reset with their importInProgress 409.
    if (!allowDuringAccountImport && !storageResetExempt
        && !admitStorageRequest(req, res, { storageReset })) return false
`,
    },
    {
        name: 'flush-gate',
        type: 'insert',
        where: 'after',
        anchor: `app.post('/api/db/flush', sessionAuthMiddleware, async (req, res, next) => {
`,
        content: `    // Not session-locked, but storage reset gated like every storage writer.
    if (!admitStorageRequest(req, res)) return;
`,
    },
    {
        name: 'logs-exempt',
        type: 'replace',
        anchor: `app.delete('/api/logs', async (req, res, next) => {
    if (!await checkAuth(req, res)) return;
    if (!checkActiveSession(req, res)) return;
`,
        content: `app.delete('/api/logs', async (req, res, next) => {
    if (!await checkAuth(req, res)) return;
    // Server logs are not part of the storage a reset replaces.
    if (!checkActiveSession(req, res, { storageResetExempt: true })) return;
`,
    },
    {
        name: 'request-logs-exempt',
        type: 'replace',
        anchor: `requestLogs.registerRoutes(app, { auth: checkAuth, activeSession: checkActiveSession });
`,
        content: `// Request logs are not part of the storage a reset replaces.
requestLogs.registerRoutes(app, {
    auth: checkAuth,
    activeSession: (req, res) => checkActiveSession(req, res, { storageResetExempt: true }),
});
`,
    },
    {
        name: 'remove-gate',
        type: 'replace',
        anchor: `app.get('/api/remove', async (req, res, next) => {
    if(!await checkAuth(req, res)){
        return;
    }
    if (!checkActiveSession(req, res)) return;
`,
        content: `app.get('/api/remove', async (req, res, next) => {
    if(!await checkAuth(req, res)){
        return;
    }
    // Removing database.bin is a reset of its own; other keys are writers.
    if (!checkActiveSession(req, res, { storageReset: isDatabaseRemoveRequest(req) })) return;
`,
    },
    {
        name: 'backup-import-prepare-gate',
        type: 'replace',
        anchor: `app.post('/api/backup/import/prepare', async (req, res, next) => {
    if (!await checkAuth(req, res)) { return; }
    if (!checkActiveSession(req, res)) return;
`,
        content: `app.post('/api/backup/import/prepare', async (req, res, next) => {
    if (!await checkAuth(req, res)) { return; }
    if (!checkActiveSession(req, res, { storageReset: true })) return;
`,
    },
    {
        name: 'backup-import-gate',
        type: 'replace',
        anchor: `app.post('/api/backup/import', async (req, res, next) => {
    if(!await checkAuth(req, res)){ return; }
    if (!checkActiveSession(req, res)) return;
`,
        content: `app.post('/api/backup/import', async (req, res, next) => {
    if(!await checkAuth(req, res)){ return; }
    if (!checkActiveSession(req, res, { storageReset: true })) return;
`,
    },
    {
        name: 'server-restore-gate',
        type: 'replace',
        anchor: `app.post('/api/backup/server/restore', async (req, res, next) => {
    if (!await checkAuth(req, res)) { return; }
    if (!checkActiveSession(req, res)) return;
`,
        content: `app.post('/api/backup/server/restore', async (req, res, next) => {
    if (!await checkAuth(req, res)) { return; }
    if (!checkActiveSession(req, res, { storageReset: true })) return;
`,
    },
    {
        name: 'server-restore-kind',
        type: 'replace',
        anchor: `        const result = await importBackupFromSource(stream, {
            totalBytes: fileStat.size,
`,
        content: `        const result = await importBackupFromSource(stream, {
            storageResetKind: 'server-restore',
            totalBytes: fileStat.size,
`,
    },
    {
        name: 'account-apply-kind',
        type: 'replace',
        anchor: `            return await importBackupFromSource(entries, { totalBytes, onProgress });
`,
        content: `            return await importBackupFromSource(entries, { totalBytes, onProgress, storageResetKind: 'account-apply' });
`,
    },
    {
        name: 'save-folder-execute-gate',
        type: 'replace',
        anchor: `app.post('/api/migrate/save-folder/execute', async (req, res, next) => {
    if (!await checkAuth(req, res)) return;
    if (!checkActiveSession(req, res)) return;
`,
        content: `app.post('/api/migrate/save-folder/execute', async (req, res, next) => {
    if (!await checkAuth(req, res)) return;
    if (!checkActiveSession(req, res, { storageReset: true })) return;
`,
    },
    {
        name: 'save-folder-upload-gate',
        type: 'replace',
        anchor: `app.post('/api/migrate/save-folder/upload', async (req, res, next) => {
    if (!await checkAuth(req, res)) return;
    if (!checkActiveSession(req, res)) return;
`,
        content: `app.post('/api/migrate/save-folder/upload', async (req, res, next) => {
    if (!await checkAuth(req, res)) return;
    if (!checkActiveSession(req, res, { storageReset: true })) return;
`,
    },
    {
        name: 'save-folder-upload-begin',
        type: 'replace',
        anchor: `    try {
        const chunks = [];
        let totalSize = 0;
        for await (const chunk of req) {
`,
        content: `    let uploadStorageReset = null;
    try {
        // The reset starts before the upload is read: writers are refused
        // from here on, and the upload is applied in this reset.
        uploadStorageReset = beginStorageReset('save-folder-upload');
        const chunks = [];
        let totalSize = 0;
        for await (const chunk of req) {
`,
    },
    {
        name: 'save-folder-upload-end',
        type: 'replace',
        anchor: `    } finally {
        importInProgress = false;
        if (httpServer && prevRequestTimeout !== undefined) {
            httpServer.requestTimeout = prevRequestTimeout;
        }
    }
});

app.post('/api/migrate/save-folder/cleanup/scan', async (req, res, next) => {
`,
        content: `    } finally {
        endStorageReset(uploadStorageReset);
        importInProgress = false;
        if (httpServer && prevRequestTimeout !== undefined) {
            httpServer.requestTimeout = prevRequestTimeout;
        }
    }
});

app.post('/api/migrate/save-folder/cleanup/scan', async (req, res, next) => {
`,
    },
    {
        name: 'snapshot-restore-gate',
        type: 'replace',
        anchor: `app.post('/api/db/snapshots/restore', async (req, res, next) => {
    if (!await checkAuth(req, res)) return;
    if (!checkActiveSession(req, res)) return;
    try {
`,
        content: `app.post('/api/db/snapshots/restore', async (req, res, next) => {
    if (!await checkAuth(req, res)) return;
    if (!checkActiveSession(req, res, { storageReset: true })) return;
    // A snapshot restore replaces the database: it shares the import
    // exclusion with the other resets.
    if (importInProgress) {
        res.status(409).json({ error: 'Another import is already in progress' });
        return;
    }
    importInProgress = true;
    try {
`,
    },
    {
        name: 'snapshot-restore-runner',
        type: 'replace',
        anchor: `        await queueStorageOperation(async () => {
            restoringSnapshotKey = key;
`,
        content: `        await runStorageReset('snapshot-restore', async (reset) => {
            restoringSnapshotKey = key;
`,
    },
    {
        name: 'snapshot-restore-end',
        type: 'replace',
        anchor: `        if (snapshotMissing) {
            return res.status(404).json({ error: 'Snapshot not found' });
        }
        res.json({ ok: true });
    } catch (err) { next(err); }
});
`,
        content: `        if (snapshotMissing) {
            return res.status(404).json({ error: 'Snapshot not found' });
        }
        res.json({ ok: true });
    } catch (err) {
        next(err);
    } finally {
        importInProgress = false;
    }
});
`,
    },
    {
        name: 'backup-import-runner',
        type: 'replace',
        anchor: `async function importBackupFromSource(dataSource, { maxBytes = 0, totalBytes = 0, onProgress = null } = {}) {
`,
        content: `// Every caller (backup import, server restore, account apply) runs one
// storage reset: entries, database, deletions, journal rows, storage epoch
// and the inlay directory swap commit together.
function importBackupFromSource(dataSource, options = {}) {
    const kind = options.storageResetKind || 'backup-import';
    return runStorageReset(kind, (reset) => importBackupFromSourceInReset(dataSource, options, reset));
}

async function importBackupFromSourceInReset(dataSource, { maxBytes = 0, totalBytes = 0, onProgress = null } = {}, reset) {
`,
    },
    {
        name: 'backup-import-single-transaction',
        type: 'replace',
        anchor: `                batchCount++;
                if (batchCount >= BATCH_SIZE) {
                    sqliteDb.exec('COMMIT');
                    sqliteDb.exec('BEGIN');
                    batchCount = 0;
                }
`,
        content: `                // One transaction for the whole import: no intermediate COMMIT.
                batchCount++;
                storageResetTestHooks.entryFailpoint(batchCount, reset.attempt);
`,
    },
    {
        name: 'backup-import-inlay-swap-after-commit',
        type: 'replace',
        anchor: `    await ensureInlayDir();
    try {
        if (existsSync(inlayDir)) {
            await fs.rename(inlayDir, backupInlayDir);
        }
        await fs.rename(stagingDir, inlayDir);
        await fs.writeFile(inlayMigrationMarker, new Date().toISOString(), 'utf-8');
        await fs.rm(backupInlayDir, { recursive: true, force: true }).catch(() => {});
    } catch (swapError) {
        if (existsSync(backupInlayDir)) {
            await fs.rm(inlayDir, { recursive: true, force: true }).catch(() => {});
            await fs.rename(backupInlayDir, inlayDir).catch(() => {});
        }
        await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => {});
        throw swapError;
    }
`,
        content: `    // The inlay directory was swapped before COMMIT. The previous one goes;
    // a failed marker write still fails the import, as before.
    await removeResetInlayCopy(reset);
    await fs.writeFile(inlayMigrationMarker, new Date().toISOString(), 'utf-8');
`,
    },
    {
        name: 'save-folder-dir-runner',
        type: 'replace',
        anchor: `async function importHexFilesFromDir(dirPath) {
`,
        content: `function importHexFilesFromDir(dirPath) {
    return runStorageReset('save-folder-execute', (reset) => importHexFilesFromDirInReset(dirPath, reset));
}

async function importHexFilesFromDirInReset(dirPath, reset) {
`,
    },
    {
        name: 'save-folder-entries-runner',
        type: 'replace',
        anchor: `async function importHexEntries(entries) {
`,
        content: `// Applied in the reset its upload route began.
function importHexEntries(entries) {
    const reset = activeStorageReset?.kind === 'save-folder-upload' ? activeStorageReset : null;
    return runStorageReset('save-folder-upload', (current) => importHexEntriesInReset(entries, current), { reset });
}

async function importHexEntriesInReset(entries, reset) {
`,
    },
    {
        name: 'inlay-compress-generation',
        type: 'replace',
        anchor: `                if (webpBuf.length < original.length) {
                    const sidecar = await readInlaySidecar(entry.id);
                    const info = sidecar || {};
                    await writeInlayFile(entry.id, 'webp', webpBuf, { ...info, ext: 'webp' });
                    // invalidate thumbnail cache
                    kvDel(\`inlay_thumb/\${entry.id}\`);
`,
        content: `                if (webpBuf.length < original.length) {
                    const sidecar = await readInlaySidecar(entry.id);
                    const info = sidecar || {};
                    // Images read before a storage reset are never written
                    // after it; a reset waits for a write already started.
                    const admission = req.storageResetAdmission;
                    const refusal = admission ? staleStorageAdmissionPayload(admission) : null;
                    if (refusal) throw new StorageResetRefusal(refusal);
                    await trackInlayMutation((async () => {
                        await writeInlayFile(entry.id, 'webp', webpBuf, { ...info, ext: 'webp' });
                        // invalidate thumbnail cache
                        kvDel(\`inlay_thumb/\${entry.id}\`);
                    })());
`,
    },
    {
        name: 'patch-persist-timer',
        type: 'replace',
        anchor: `            saveTimers[filePath] = setTimeout(async () => {
                let failed = false;
                try {
                    if (decodedKey === 'database/database.bin') {
`,
        content: `            saveTimers[filePath] = setTimeout(trackStoragePersist(filePath, async () => {
                let failed = false;
                try {
                    if (decodedKey === 'database/database.bin') {
`,
    },
    {
        name: 'patch-persist-timer-end',
        type: 'replace',
        anchor: `                if (failed && decodedKey === 'database/database.bin') retryDatabasePersistLater('patch');
            }, SAVE_INTERVAL);
`,
        content: `                if (failed && decodedKey === 'database/database.bin') retryDatabasePersistLater('patch');
            }), SAVE_INTERVAL);
`,
    },
    {
        name: 'chat-persist-timer',
        type: 'replace',
        anchor: `            saveTimers[DB_HEX_KEY] = setTimeout(async () => {
                let failed = false;
                const cold = !dbCache[DB_HEX_KEY];
`,
        content: `            saveTimers[DB_HEX_KEY] = setTimeout(trackStoragePersist(DB_HEX_KEY, async () => {
                let failed = false;
                const cold = !dbCache[DB_HEX_KEY];
`,
    },
    {
        name: 'chat-persist-timer-end',
        type: 'replace',
        anchor: `                if (failed && cold) retryColdPersistLater('chat-content');
                else if (failed) retryDatabasePersistLater('chat-content');
            }, SAVE_INTERVAL);
`,
        content: `                if (failed && cold) retryColdPersistLater('chat-content');
                else if (failed) retryDatabasePersistLater('chat-content');
            }), SAVE_INTERVAL);
`,
    },
    {
        name: 'error-refusal',
        type: 'insert',
        where: 'after',
        anchor: `app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
`,
        content: `    // A storage reset refusal keeps its status and payload.
    if (err instanceof StorageResetRefusal) return res.status(err.statusCode).json(err.payload);
`,
    },
]

// Post-reset session invalidation over the PocketRisu 1.16.1 lock: after
// invalidateBefore(t) nobody holds the lock (as after the native revokeAll)
// and a session that booted at or before t is stale; one booted later takes
// the lock with its first user action, by the native fresh/passive/tookOver
// rules. The watermark never moves back.
const sessionLockUnits = [
    {
        id: 'lazy-chat-sync:session-lock:invalidate-before:1.10',
        file: sessionLockFile,
        type: 'replace',
        anchor: `    return { register, checkWrite, peek, revokeAll, activeId };
`,
        content: `    // After a storage reset: every page loaded at or before \`timestamp\` holds
    // the replaced data. Same meaning as revokeAll() with the reset time as
    // the boundary.
    function invalidateBefore(timestamp) {
        const boundary = active ? Math.max(active.lastWriteAt, timestamp) : timestamp;
        active = { id: null, lastWriteAt: boundary };
    }

    return { register, checkWrite, peek, revokeAll, activeId, invalidateBefore };
`,
    },
]

module.exports = [
    ...units.map(({ name, ...unit }) => ({
        id: `lazy-chat-sync:server-${name}:1.16`,
        file: serverFile,
        ...unit,
    })),
    ...sessionLockUnits,
]
