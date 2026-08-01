'use strict'

const pocketRisu190 = { pocketrisu: ['1.9.0'] }

function appendAfter(unit, ids) {
    if (ids.length === 0) return unit
    return { ...unit, after: [...(unit.after ?? []), ...ids] }
}

function createBackupRestoreSafetyAdapterManifest({ id, title, lazyChat }) {
    const prefix = `${id}:`
    const marker = (name) => `POCKETRISU-PATCH:kei-backup-restore-safety:${lazyChat ? 'lazy' : 'standard'}:${name}`
    const serverAfter = lazyChat
        ? ['lazy-chat-sync:replace:server:node:server-cjs:1.9']
        : []
    const nodeAfter = lazyChat
        ? [
            'lazy-chat-sync:replace:src:ts:storage:nodeStorage-ts:1.9',
            // Optional when bg-preserve is absent. When present, run after the
            // complete BG nodeStorage adapter so both imports retain ownership.
            'lazy-chat-bg-adapter:asset-upload-error-detail',
        ]
        : []
    const autoAfter = lazyChat
        ? ['lazy-chat-sync:replace:src:ts:storage:autoStorage-ts:1.9']
        : []
    const snapshotRestoreIndent = lazyChat ? '                    ' : '            '
    const snapshotRestoreManaged = `/* ${marker('snapshot-restore-post-copy-rotation')}:START */
${snapshotRestoreIndent}restoreSnapshotValue({
${snapshotRestoreIndent}    sourceValue: blob,
${snapshotRestoreIndent}    destinationKey: DB_BLOB_KEY,
${snapshotRestoreIndent}    setValue: kvSet,
${snapshotRestoreIndent}    sizeValue: kvSize,
${snapshotRestoreIndent}});
${lazyChat ? '' : `${snapshotRestoreIndent}// Release the selected-source protection after the copy. If this
${snapshotRestoreIndent}// best-effort trim fails, the fresh rollback point remains safer
${snapshotRestoreIndent}// than reporting a false restore failure after destructive write.
${snapshotRestoreIndent}try { trimSnapshotsToLimits(); }
${snapshotRestoreIndent}catch (error) { logger.warn('[Snapshot restore] post-copy rotation failed:', error?.message || error); }
`}${snapshotRestoreIndent}/* ${marker('snapshot-restore-post-copy-rotation')}:END */
`

    const serverUnits = [
        {
            id: `${prefix}server-helper-import:1.9`,
            file: 'server/node/server.cjs',
            type: 'replace',
            anchor: `const { createRequestLogs } = require('./request-logs.cjs');
`,
            managed: `const { createRequestLogs } = require('./request-logs.cjs');
/* ${marker('server-helper-import')} */
const {
    copyVerifiedSnapshot,
    createRestoreConfirmationOwner,
    createDeferredAsyncIterable,
    isFreshSnapshotRequiredError,
    nextUniqueSnapshotKey,
    prepareFreshRestoreSnapshot,
    prepareLazyChatSnapshotOwner,
    readLazyChatSnapshotState,
    requireLazyChatSnapshotCompleteness,
    restoreTargetForLocalImport,
    restoreSnapshotValue,
    restoreSafetyErrorPayload,
    selectProtectedSnapshotKeysToDelete,
} = require('./restoreSafety.cjs');
const restoreConfirmationOwner = createRestoreConfirmationOwner();
`,
            markerNeedle: marker('server-helper-import'),
            requires: ['kei-backup-restore-safety-core:server-helper:1.9'],
        },
        {
            id: `${prefix}snapshot-protected-rotation:1.9`,
            file: 'server/node/server.cjs',
            type: 'replace',
            anchor: `function trimSnapshotsToLimits() {
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
`,
            managed: `/* ${marker('snapshot-protected-rotation')}:START */
function trimSnapshotsToLimits({ protectedSnapshotKeys = [] } = {}) {
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

    // Ordinary rotation keeps the native algorithm byte-for-byte equivalent.
    if (protectedSnapshotKeys.length === 0) {
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

    // Snapshot restore temporarily protects its selected source and the exact
    // newly-created rollback point; reserve both until the post-copy trim.
    const protected = protectedSnapshotKeys.filter((key) =>
        typeof key === 'string' && key.startsWith(DB_BACKUP_PREFIX));
    const toDelete = selectProtectedSnapshotKeysToDelete({
        entries,
        maxCount,
        maxBytes,
        protectedSnapshotKeys: protected,
    });
    for (const key of toDelete) kvDel(key);
    return { kept: entries.length - toDelete.length, removed: toDelete.length };
}
/* ${marker('snapshot-protected-rotation')}:END */
`,
            markerNeedle: `${marker('snapshot-protected-rotation')}:START`,
            requires: [`${prefix}server-helper-import:1.9`],
        },
        {
            id: `${prefix}snapshot-force-new:1.9`,
            file: 'server/node/server.cjs',
            type: 'replace',
            anchor: `function createBackupAndRotate() {
    const now = Date.now();
    if (lastBackupTime && now - lastBackupTime < BACKUP_INTERVAL_MS) {
        return;
    }
    lastBackupTime = now;

    const backupKey = \`\${DB_BACKUP_PREFIX}\${(now / 100).toFixed()}.bin\`;
    kvCopyValue('database/database.bin', backupKey);
    trimSnapshotsToLimits();
}
`,
            managed: `/* ${marker('snapshot-force-new')}:START */
function createBackupAndRotate({ force = false, protectedSnapshotKeys = [] } = {}) {
    const now = Date.now();
    if (!force) {
        // Preserve native ordinary rotation, including failure-path throttle.
        if (lastBackupTime && now - lastBackupTime < BACKUP_INTERVAL_MS) {
            return;
        }
        lastBackupTime = now;

        const backupKey = DB_BACKUP_PREFIX + (now / 100).toFixed() + '.bin';
        kvCopyValue('database/database.bin', backupKey);
        trimSnapshotsToLimits();
        return;
    }

    lastBackupTime = now;
    const backupKey = nextUniqueSnapshotKey({
        prefix: DB_BACKUP_PREFIX,
        now,
        existingKeys: kvList(DB_BACKUP_PREFIX),
    });
    return copyVerifiedSnapshot({
        sourceKey: 'database/database.bin',
        destinationKey: backupKey,
        copyValue: kvCopyValue,
        sizeValue: kvSize,
        rotate: () => trimSnapshotsToLimits({
            protectedSnapshotKeys: [...protectedSnapshotKeys, backupKey],
        }),
    });
}
/* ${marker('snapshot-force-new')}:END */
`,
            markerNeedle: `${marker('snapshot-force-new')}:START`,
            requires: [`${prefix}snapshot-protected-rotation:1.9`],
        },
        {
            id: `${prefix}flush-without-automatic-snapshot:1.9`,
            file: 'server/node/server.cjs',
            type: 'replace',
            anchor: `async function flushPendingDb() {
    if (saveTimers[DB_HEX_KEY]) {
        clearTimeout(saveTimers[DB_HEX_KEY]);
        delete saveTimers[DB_HEX_KEY];
`,
            managed: `/* ${marker('flush-without-automatic-snapshot')} */
async function flushPendingDb({
    createBackup = true,
    ${lazyChat ? 'reconcileForFreshSnapshot = false,' : ''}
} = {}) {
    if (saveTimers[DB_HEX_KEY]${lazyChat ? ' || reconcileForFreshSnapshot' : ''}) {
        clearTimeout(saveTimers[DB_HEX_KEY]);
        delete saveTimers[DB_HEX_KEY];
        ${lazyChat ? `if (reconcileForFreshSnapshot) {
            await prepareLazyChatSnapshotOwner({ ensureChatStore });
        }` : ''}
`,
            markerNeedle: marker('flush-without-automatic-snapshot'),
            requires: [`${prefix}snapshot-force-new:1.9`],
        },
        {
            id: `${prefix}flush-snapshot-gate:1.9`,
            file: 'server/node/server.cjs',
            type: 'replace',
            anchor: `        createBackupAndRotate();
    }
}

function invalidateDbCache() {
`,
            managed: lazyChat ? `        const freshSnapshotState = reconcileForFreshSnapshot
            ? readLazyChatSnapshotState({
                getJournalStats: () => chatWriteJournal.stats(),
            })
            : null;
        if (createBackup) createBackupAndRotate();
        return freshSnapshotState;
    }
}

function invalidateDbCache() {
` : `        if (createBackup) createBackupAndRotate();
    }
}

function invalidateDbCache() {
`,
            markerNeedle: 'if (createBackup) createBackupAndRotate();',
            requires: [`${prefix}flush-without-automatic-snapshot:1.9`],
        },
        {
            id: `${prefix}import-option:1.9`,
            file: 'server/node/server.cjs',
            type: 'replace',
            anchor: `async function importBackupFromSource(dataSource, { maxBytes = 0, totalBytes = 0, onProgress = null } = {}) {
`,
            managed: `/* ${marker('import-option')} */
async function importBackupFromSource(dataSource, {
    maxBytes = 0,
    totalBytes = 0,
    onProgress = null,
    restoreConfirmationHeaders = null,
    restoreTarget,
} = {}) {
    /* ${marker('import-preflight-fresh-snapshot')}:START */
    await prepareFreshRestoreSnapshot({
        confirmationOwner: restoreConfirmationOwner,
        confirmationHeaders: restoreConfirmationHeaders,
        restoreTarget,
        flushPendingDb: () => flushPendingDb({
            createBackup: false,
            ${lazyChat ? 'reconcileForFreshSnapshot: true,' : ''}
        }),
        createFreshSnapshot: (snapshotState) => {
            ${lazyChat ? 'requireLazyChatSnapshotCompleteness(snapshotState);' : ''}
            return createBackupAndRotate({ force: true });
        },
        logger,
    });
    /* ${marker('import-preflight-fresh-snapshot')}:END */
`,
            markerNeedle: marker('import-option'),
            requires: [`${prefix}flush-snapshot-gate:1.9`],
        },
        {
            id: `${prefix}import-fresh-snapshot:1.9`,
            file: 'server/node/server.cjs',
            type: 'replace',
            anchor: `    await flushPendingDb();
    createBackupAndRotate();

    sqliteDb.pragma('synchronous = OFF');
`,
            managed: `    /* ${marker('import-fresh-snapshot')}: fresh snapshot completed before staging */
    sqliteDb.pragma('synchronous = OFF');
`,
            markerNeedle: marker('import-fresh-snapshot'),
            requires: [`${prefix}import-option:1.9`],
        },
        {
            id: `${prefix}local-import-route-option:1.9`,
            file: 'server/node/server.cjs',
            type: 'replace',
            anchor: `            const result = await importBackupFromSource(req, {
                maxBytes: BACKUP_IMPORT_MAX_BYTES,
                totalBytes,
`,
            managed: `            const result = await importBackupFromSource(req, {
                /* ${marker('local-import-route-option')} */
                restoreConfirmationHeaders: req.headers,
                restoreTarget: restoreTargetForLocalImport(req.headers),
                maxBytes: BACKUP_IMPORT_MAX_BYTES,
                totalBytes,
`,
            markerNeedle: marker('local-import-route-option'),
            requires: [`${prefix}import-fresh-snapshot:1.9`],
        },
        {
            id: `${prefix}local-import-json-option:1.9`,
            file: 'server/node/server.cjs',
            type: 'replace',
            anchor: `            const result = await importBackupFromSource(req, { maxBytes: BACKUP_IMPORT_MAX_BYTES });
`,
            managed: `            const result = await importBackupFromSource(req, {
                /* ${marker('local-import-json-option')} */
                maxBytes: BACKUP_IMPORT_MAX_BYTES,
                restoreConfirmationHeaders: req.headers,
                restoreTarget: restoreTargetForLocalImport(req.headers),
            });
`,
            markerNeedle: marker('local-import-json-option'),
            requires: [`${prefix}local-import-route-option:1.9`],
        },
        {
            id: `${prefix}local-import-error-code:1.9`,
            file: 'server/node/server.cjs',
            type: 'replace',
            anchor: `    } catch (error) {
        if (wantsNdjson && res.headersSent) {
            try {
                res.write(JSON.stringify({ type: 'error', message: error?.message || 'backup import failed' }) + '\\n');
                res.end();
            } catch (_) {}
        } else {
            next(error);
        }
    } finally {
`,
            managed: `    } catch (error) {
        /* ${marker('local-import-error-code')}:START */
        const payload = restoreSafetyErrorPayload(error, 'backup import failed');
        if (wantsNdjson && res.headersSent) {
            try {
                res.write(JSON.stringify({ type: 'error', ...payload }) + '\\n');
                res.end();
            } catch (_) {}
        } else if (isFreshSnapshotRequiredError(error)) {
            res.status(409).json({ error: payload.message, ...payload });
        } else {
            next(error);
        }
        /* ${marker('local-import-error-code')}:END */
    } finally {
`,
            markerNeedle: `${marker('local-import-error-code')}:START`,
            requires: [`${prefix}local-import-json-option:1.9`],
        },
        {
            id: `${prefix}server-restore-deferred-stream:1.9`,
            file: 'server/node/server.cjs',
            type: 'replace',
            anchor: `        const { createReadStream } = require('fs');
        const stream = createReadStream(filePath, { highWaterMark: 256 * 1024 });
`,
            managed: `        const { createReadStream } = require('fs');
        /* ${marker('server-restore-deferred-stream')} */
        const stream = createDeferredAsyncIterable(() =>
            createReadStream(filePath, { highWaterMark: 256 * 1024 }));
`,
            markerNeedle: marker('server-restore-deferred-stream'),
            requires: [`${prefix}import-fresh-snapshot:1.9`],
        },
        {
            id: `${prefix}server-restore-route-option:1.9`,
            file: 'server/node/server.cjs',
            type: 'replace',
            anchor: `        const result = await importBackupFromSource(stream, {
            totalBytes: fileStat.size,
`,
            managed: `        const result = await importBackupFromSource(stream, {
            /* ${marker('server-restore-route-option')} */
            restoreConfirmationHeaders: req.headers,
            restoreTarget: 'server:' + filename,
            totalBytes: fileStat.size,
`,
            markerNeedle: marker('server-restore-route-option'),
            requires: [`${prefix}server-restore-deferred-stream:1.9`],
        },
        {
            id: `${prefix}server-restore-error-code:1.9`,
            file: 'server/node/server.cjs',
            type: 'replace',
            anchor: `    } catch (error) {
        if (!res.headersSent) {
            next(error);
        } else {
            res.write(JSON.stringify({ type: 'error', message: error.message }) + '\\n');
            res.end();
        }
    } finally {
        importInProgress = false;
    }
});

// Delete a server backup file
`,
            managed: `    } catch (error) {
        /* ${marker('server-restore-error-code')}:START */
        const payload = restoreSafetyErrorPayload(error, 'server backup restore failed');
        if (!res.headersSent) {
            if (isFreshSnapshotRequiredError(error)) {
                res.status(409).json({ error: payload.message, ...payload });
            } else {
                next(error);
            }
        } else {
            res.write(JSON.stringify({ type: 'error', ...payload }) + '\\n');
            res.end();
        }
        /* ${marker('server-restore-error-code')}:END */
    } finally {
        importInProgress = false;
    }
});

// Delete a server backup file
`,
            markerNeedle: `${marker('server-restore-error-code')}:START`,
            requires: [`${prefix}server-restore-route-option:1.9`],
        },
        {
            id: `${prefix}snapshot-restore-fresh-snapshot:1.9`,
            file: 'server/node/server.cjs',
            type: 'replace',
            anchor: `            // Drain any pending debounced persist first — same pattern as
            // /api/db/optimize. Without this, an in-flight save could land
            // after kvCopyValue and overwrite the restored snapshot.
            await flushPendingDb();
`,
            managed: `            // Drain any pending debounced persist first — same pattern as
            // /api/db/optimize. Without this, an in-flight save could land
            // after kvCopyValue and overwrite the restored snapshot.
            /* ${marker('snapshot-restore-fresh-snapshot')}:START */
            await prepareFreshRestoreSnapshot({
                confirmationOwner: restoreConfirmationOwner,
                confirmationHeaders: req.headers,
                restoreTarget: 'snapshot:' + key,
                flushPendingDb: () => flushPendingDb({
                    createBackup: false,
                    ${lazyChat ? 'reconcileForFreshSnapshot: true,' : ''}
                }),
                createFreshSnapshot: (snapshotState) => {
                    ${lazyChat ? 'requireLazyChatSnapshotCompleteness(snapshotState);' : ''}
                    return createBackupAndRotate({
                        force: true,
                        protectedSnapshotKeys: [key],
                    });
                },
                logger,
            });
            /* ${marker('snapshot-restore-fresh-snapshot')}:END */
`,
            markerNeedle: `${marker('snapshot-restore-fresh-snapshot')}:START`,
            requires: [`${prefix}local-import-error-code:1.9`],
        },
        {
            id: `${prefix}snapshot-restore-post-copy-rotation:1.9`,
            file: 'server/node/server.cjs',
            type: 'replace',
            anchor: `kvCopyValue(key, DB_BLOB_KEY);
`,
            managed: snapshotRestoreManaged,
            markerNeedle: `${marker('snapshot-restore-post-copy-rotation')}:START`,
            requires: [`${prefix}snapshot-restore-fresh-snapshot:1.9`],
        },
        ...(lazyChat ? [{
            id: `${prefix}snapshot-restore-post-commit-rotation:1.9`,
            file: 'server/node/server.cjs',
            type: 'replace',
            anchor: `            // Snapshot may pre-date the remote-block migration. Clear the marker
`,
            managed: `            /* ${marker('snapshot-restore-post-commit-rotation')}:START */
            // Keep best-effort capacity cleanup outside the DB+journal
            // transaction. SQLite can auto-rollback on SQLITE_FULL/IOERR;
            // swallowing that error inside the transaction could otherwise let
            // journal deletion run later in autocommit mode.
            try { trimSnapshotsToLimits(); }
            catch (error) { logger.warn('[Snapshot restore] post-copy rotation failed:', error?.message || error); }
            /* ${marker('snapshot-restore-post-commit-rotation')}:END */
            // Snapshot may pre-date the remote-block migration. Clear the marker
`,
            markerNeedle: `${marker('snapshot-restore-post-commit-rotation')}:START`,
            requires: [`${prefix}snapshot-restore-post-copy-rotation:1.9`],
        }] : []),
        {
            id: `${prefix}snapshot-restore-error-code:1.9`,
            file: 'server/node/server.cjs',
            type: 'replace',
            anchor: `        res.json({ ok: true });
    } catch (err) { next(err); }
});

// ── Boot-time backup reminder ───────────────────────────────────────────────
`,
            managed: `        res.json({ ok: true });
    } catch (err) {
        /* ${marker('snapshot-restore-error-code')} */
        if (isFreshSnapshotRequiredError(err)) {
            const payload = restoreSafetyErrorPayload(err, 'snapshot restore failed');
            res.status(409).json({ error: payload.message, ...payload });
        } else {
            next(err);
        }
    }
});

// ── Boot-time backup reminder ───────────────────────────────────────────────
`,
            markerNeedle: marker('snapshot-restore-error-code'),
            requires: [lazyChat
                ? `${prefix}snapshot-restore-post-commit-rotation:1.9`
                : `${prefix}snapshot-restore-post-copy-rotation:1.9`],
        },
    ].map((unit) => appendAfter({ ...unit, targetVersions: pocketRisu190 }, serverAfter))

    const nodeUnits = [
        {
            id: `${prefix}node-safety-import:1.9`,
            file: 'src/ts/storage/nodeStorage.ts',
            type: 'replace',
            anchor: `import { decodeRisuSave, encodeRisuSaveLegacy } from "./risuSave"
`,
            managed: `import { decodeRisuSave, encodeRisuSaveLegacy } from "./risuSave"
/* ${marker('node-safety-import')} */
import {
    localRestoreSourceHeaders,
    restoreErrorFromPayload,
    restoreSafetyHeaders,
    type RestoreSafetyOptions,
} from "./restoreSafety"
`,
            markerNeedle: marker('node-safety-import'),
            requires: ['kei-backup-restore-safety-core:client-helper:1.9'],
        },
        {
            id: `${prefix}node-local-option:1.9`,
            file: 'src/ts/storage/nodeStorage.ts',
            type: 'replace',
            anchor: `    async importBackup(
        file: Blob,
        onProgress?: (loaded: number, total: number) => void
    ): Promise<{ok: boolean, assetsRestored: number, coldStorageFailed?: number}> {
`,
            managed: `    /* ${marker('node-local-option')} */
    async importBackup(
        file: Blob,
        onProgress?: (loaded: number, total: number) => void,
        options: RestoreSafetyOptions = {},
    ): Promise<{ok: boolean, assetsRestored: number, coldStorageFailed?: number}> {
`,
            markerNeedle: marker('node-local-option'),
            requires: [`${prefix}node-safety-import:1.9`],
        },
        {
            id: `${prefix}node-local-header:1.9`,
            file: 'src/ts/storage/nodeStorage.ts',
            type: 'replace',
            anchor: `            xhr.open('POST', '/api/backup/import')
            xhr.setRequestHeader('content-type', 'application/x-risu-backup')
            xhr.setRequestHeader('risu-auth', authHeader)
            xhr.setRequestHeader('x-session-id', NodeStorage.sessionId)
            if (isUserActive()) xhr.setRequestHeader('x-user-active', '1')
`,
            managed: `            xhr.open('POST', '/api/backup/import')
            xhr.setRequestHeader('content-type', 'application/x-risu-backup')
            xhr.setRequestHeader('risu-auth', authHeader)
            xhr.setRequestHeader('x-session-id', NodeStorage.sessionId)
            /* ${marker('node-local-header')} */
            for (const [name, value] of Object.entries(restoreSafetyHeaders(options))) {
                xhr.setRequestHeader(name, value)
            }
            for (const [name, value] of Object.entries(localRestoreSourceHeaders(file))) {
                xhr.setRequestHeader(name, value)
            }
            if (isUserActive()) xhr.setRequestHeader('x-user-active', '1')
`,
            markerNeedle: marker('node-local-header'),
            requires: [`${prefix}node-local-option:1.9`],
        },
        {
            id: `${prefix}node-local-error-state:1.9`,
            file: 'src/ts/storage/nodeStorage.ts',
            type: 'replace',
            anchor: `            let serverErrorMsg: string | null = null
`,
            managed: `            /* ${marker('node-local-error-state')} */
            let serverError: unknown = null
`,
            markerNeedle: marker('node-local-error-state'),
            requires: [`${prefix}node-local-header:1.9`],
        },
        {
            id: `${prefix}node-local-error-parse:1.9`,
            file: 'src/ts/storage/nodeStorage.ts',
            type: 'replace',
            anchor: `                    } else if (msg.type === 'error') {
                        serverErrorMsg = typeof msg.message === 'string' ? msg.message : 'backup import failed'
                    }
`,
            managed: `                    } else if (msg.type === 'error') {
                        /* ${marker('node-local-error-parse')} */
                        serverError = msg
                    }
`,
            markerNeedle: marker('node-local-error-parse'),
            requires: [`${prefix}node-local-error-state:1.9`],
        },
        {
            id: `${prefix}node-local-http-error:1.9`,
            file: 'src/ts/storage/nodeStorage.ts',
            type: 'replace',
            anchor: `                if (xhr.status < 200 || xhr.status >= 300) {
                    let msg = \`backup import error: \${xhr.status}\`
                    try {
                        const body = JSON.parse(xhr.responseText)
                        if (body?.error) msg = String(body.error)
                    } catch {}
                    reject(new Error(msg))
                    return
                }
`,
            managed: `                if (xhr.status < 200 || xhr.status >= 300) {
                    /* ${marker('node-local-http-error')} */
                    let body: unknown = null
                    try { body = JSON.parse(xhr.responseText) } catch {}
                    reject(restoreErrorFromPayload(body, \`backup import error: \${xhr.status}\`))
                    return
                }
`,
            markerNeedle: marker('node-local-http-error'),
            requires: [`${prefix}node-local-error-parse:1.9`],
        },
        {
            id: `${prefix}node-local-stream-error:1.9`,
            file: 'src/ts/storage/nodeStorage.ts',
            type: 'replace',
            anchor: `                if (serverErrorMsg) reject(new Error(serverErrorMsg))
`,
            managed: `                /* ${marker('node-local-stream-error')} */
                if (serverError) reject(restoreErrorFromPayload(serverError, 'backup import failed'))
`,
            markerNeedle: marker('node-local-stream-error'),
            requires: [`${prefix}node-local-http-error:1.9`],
        },
        {
            id: `${prefix}node-server-option:1.9`,
            file: 'src/ts/storage/nodeStorage.ts',
            type: 'replace',
            anchor: `    async restoreServerBackup(
        filename: string,
        onProgress?: (bytes: number, totalBytes: number) => void
    ): Promise<{ok: boolean, assetsRestored: number, coldStorageFailed?: number}> {
`,
            managed: `    /* ${marker('node-server-option')} */
    async restoreServerBackup(
        filename: string,
        onProgress?: (bytes: number, totalBytes: number) => void,
        options: RestoreSafetyOptions = {},
    ): Promise<{ok: boolean, assetsRestored: number, coldStorageFailed?: number}> {
`,
            markerNeedle: marker('node-server-option'),
            requires: [`${prefix}node-safety-import:1.9`],
        },
        {
            id: `${prefix}node-server-header:1.9`,
            file: 'src/ts/storage/nodeStorage.ts',
            type: 'replace',
            anchor: `                'content-type': 'application/json',
                'x-session-id': NodeStorage.sessionId,
            },
            body: JSON.stringify({ filename }),
`,
            managed: `                'content-type': 'application/json',
                'x-session-id': NodeStorage.sessionId,
                /* ${marker('node-server-header')} */
                ...restoreSafetyHeaders(options),
            },
            body: JSON.stringify({ filename }),
`,
            markerNeedle: marker('node-server-header'),
            requires: [`${prefix}node-server-option:1.9`],
        },
        {
            id: `${prefix}node-server-http-error:1.9`,
            file: 'src/ts/storage/nodeStorage.ts',
            type: 'replace',
            anchor: `        if (da.status === 404) throw new Error('Backup file not found')
        if (da.status === 409) throw new Error('Another import is already in progress')
        if (da.status < 200 || da.status >= 300) {
            const body = await da.json().catch(() => ({}))
            throw new Error(body.error || \`server backup restore error: \${da.status}\`)
        }
`,
            managed: `        if (da.status === 404) throw new Error('Backup file not found')
        if (da.status < 200 || da.status >= 300) {
            /* ${marker('node-server-http-error')} */
            const body = await da.json().catch(() => ({}))
            const fallback = da.status === 409
                ? 'Another import is already in progress'
                : \`server backup restore error: \${da.status}\`
            throw restoreErrorFromPayload(body, fallback)
        }
`,
            markerNeedle: marker('node-server-http-error'),
            requires: [`${prefix}node-server-header:1.9`],
        },
        {
            id: `${prefix}node-server-stream-error:1.9`,
            file: 'src/ts/storage/nodeStorage.ts',
            type: 'replace',
            anchor: `                } else if (msg.type === 'error') {
                    throw new Error(msg.message)
                }
            }
        }
        if (!result) throw new Error('Server backup restore: no result received')
`,
            managed: `                } else if (msg.type === 'error') {
                    /* ${marker('node-server-stream-error')} */
                    throw restoreErrorFromPayload(msg, 'server backup restore failed')
                }
            }
        }
        if (!result) throw new Error('Server backup restore: no result received')
`,
            markerNeedle: marker('node-server-stream-error'),
            requires: [`${prefix}node-server-http-error:1.9`],
        },
    ].map((unit) => appendAfter({ ...unit, targetVersions: pocketRisu190 }, nodeAfter))

    const autoUnits = [
        {
            id: `${prefix}auto-safety-import:1.9`,
            file: 'src/ts/storage/autoStorage.ts',
            type: 'replace',
            anchor: `import { NodeStorage, type PatchItemResult, type ExportBackupOptions } from "./nodeStorage"
`,
            managed: `import { NodeStorage, type PatchItemResult, type ExportBackupOptions } from "./nodeStorage"
/* ${marker('auto-safety-import')} */
import type { RestoreSafetyOptions } from "./restoreSafety"
`,
            markerNeedle: marker('auto-safety-import'),
            requires: ['kei-backup-restore-safety-core:client-helper:1.9'],
        },
        {
            id: `${prefix}auto-local-option:1.9`,
            file: 'src/ts/storage/autoStorage.ts',
            type: 'replace',
            anchor: `    async importBackup(file: Blob, onProgress?: (loaded: number, total: number) => void) {
        await this.Init()
        return this.realStorage.importBackup(file, onProgress)
    }
`,
            managed: `    /* ${marker('auto-local-option')} */
    async importBackup(
        file: Blob,
        onProgress?: (loaded: number, total: number) => void,
        options: RestoreSafetyOptions = {},
    ) {
        await this.Init()
        return this.realStorage.importBackup(file, onProgress, options)
    }
`,
            markerNeedle: marker('auto-local-option'),
            requires: [`${prefix}auto-safety-import:1.9`],
        },
        {
            id: `${prefix}auto-server-option:1.9`,
            file: 'src/ts/storage/autoStorage.ts',
            type: 'replace',
            anchor: `    async restoreServerBackup(filename: string, onProgress?: (bytes: number, totalBytes: number) => void) { await this.Init(); return this.realStorage.restoreServerBackup(filename, onProgress) }
`,
            managed: `    /* ${marker('auto-server-option')} */
    async restoreServerBackup(filename: string, onProgress?: (bytes: number, totalBytes: number) => void, options: RestoreSafetyOptions = {}) { await this.Init(); return this.realStorage.restoreServerBackup(filename, onProgress, options) }
`,
            markerNeedle: marker('auto-server-option'),
            requires: [`${prefix}auto-local-option:1.9`],
        },
    ].map((unit) => appendAfter({ ...unit, targetVersions: pocketRisu190 }, autoAfter))

    return {
        id,
        title,
        version: '0.1.0',
        userSelectable: false,
        targets: {
            pocketrisu: {
                verified: ['1.8.1', '1.9.0'],
                reviewing: [],
            },
        },
        requires: lazyChat
            ? ['kei-backup-restore-safety-core', 'lazy-chat-sync']
            : ['kei-backup-restore-safety-core'],
        conflicts: lazyChat
            ? ['kei-backup-restore-safety-standard-adapter']
            : ['lazy-chat-sync', 'kei-backup-restore-safety-lazy-adapter'],
        autoWhen: lazyChat
            ? { all: ['kei-backup-restore-safety-core', 'lazy-chat-sync'] }
            : { all: ['kei-backup-restore-safety-core'], none: ['lazy-chat-sync'] },
        units: [...serverUnits, ...nodeUnits, ...autoUnits],
    }
}

module.exports = { createBackupRestoreSafetyAdapterManifest }
