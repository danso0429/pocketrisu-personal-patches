'use strict';

const crypto = require('crypto');
const path = require('path');
const fs = require('fs/promises');

const PIN_PREFIX = '.point-in-time-';
const COPY_PAGE_BYTES = 256 * 1024;

class BackupSourceError extends Error {
    constructor(code, message, statusCode, details = {}) {
        super(message);
        this.name = 'BackupSourceError';
        this.code = code;
        this.statusCode = statusCode;
        Object.assign(this, details);
    }
}

function throwIfAborted(shouldAbort) {
    if (!shouldAbort?.()) return;
    const error = new Error('Backup source capture was cancelled');
    error.name = 'AbortError';
    throw error;
}

function sameSourceStat(actual, planned) {
    return actual.isFile()
        && actual.size === planned.size
        && actual.dev === planned.dev
        && actual.ino === planned.ino
        && actual.mtimeMs === planned.mtimeMs
        && actual.ctimeMs === planned.ctimeMs;
}

async function hashOpenFile(handle, size, shouldAbort) {
    const digest = crypto.createHash('sha256');
    const page = Buffer.allocUnsafe(COPY_PAGE_BYTES);
    let offset = 0;
    while (offset < size) {
        throwIfAborted(shouldAbort);
        const length = Math.min(page.length, size - offset);
        const { bytesRead } = await handle.read(page, 0, length, offset);
        if (bytesRead <= 0) break;
        digest.update(page.subarray(0, bytesRead));
        offset += bytesRead;
    }
    if (offset !== size) {
        throw new BackupSourceError(
            'BACKUP_SOURCE_CHANGED',
            'Backup filesystem source ended before its planned size',
            409,
        );
    }
    return digest.digest('hex');
}

async function copyPinnedFile(entry, destination, shouldAbort) {
    const source = await fs.open(entry.sourcePath, 'r');
    let output = null;
    try {
        const before = await source.stat();
        if (!sameSourceStat(before, entry.sourceStat)) {
            throw new BackupSourceError(
                'BACKUP_SOURCE_CHANGED',
                `Backup source changed before capture: ${entry.backupName}`,
                409,
            );
        }
        output = await fs.open(destination, 'wx', 0o600);
        const page = Buffer.allocUnsafe(COPY_PAGE_BYTES);
        const pinnedDigest = crypto.createHash('sha256');
        let offset = 0;
        while (offset < before.size) {
            throwIfAborted(shouldAbort);
            const length = Math.min(page.length, before.size - offset);
            const { bytesRead } = await source.read(page, 0, length, offset);
            if (bytesRead <= 0) break;
            const chunk = page.subarray(0, bytesRead);
            let written = 0;
            while (written < chunk.length) {
                throwIfAborted(shouldAbort);
                const result = await output.write(
                    chunk,
                    written,
                    chunk.length - written,
                    offset + written,
                );
                if (result.bytesWritten <= 0) {
                    throw new Error(`Backup pin write made no progress: ${entry.backupName}`);
                }
                written += result.bytesWritten;
            }
            pinnedDigest.update(chunk);
            offset += bytesRead;
        }
        const after = await source.stat();
        const pathAfter = await fs.stat(entry.sourcePath).catch(() => null);
        if (offset !== before.size
            || !sameSourceStat(after, entry.sourceStat)
            || !pathAfter
            || !sameSourceStat(pathAfter, entry.sourceStat)) {
            throw new BackupSourceError(
                'BACKUP_SOURCE_CHANGED',
                `Backup source changed during capture: ${entry.backupName}`,
                409,
            );
        }
        const stableDigest = await hashOpenFile(source, before.size, shouldAbort);
        if (pinnedDigest.digest('hex') !== stableDigest) {
            throw new BackupSourceError(
                'BACKUP_SOURCE_CHANGED',
                `Backup source bytes changed during capture: ${entry.backupName}`,
                409,
            );
        }
        await output.sync();
        await output.close();
        output = null;
        return {
            kind: 'file',
            sourcePath: destination,
            backupName: entry.backupName,
            sortKey: entry.sortKey,
            size: before.size,
        };
    } finally {
        await output?.close().catch(() => {});
        await source.close().catch(() => {});
    }
}

function createBackupSourceManager({ rootDir, maxActive = 2 }) {
    const activeTokens = new Set();
    let reservedBytes = 0;

    function activeCount() {
        return activeTokens.size;
    }

    function hasActive() {
        return activeCount() > 0;
    }

    async function sweep() {
        await fs.mkdir(rootDir, { recursive: true, mode: 0o700 });
        const entries = await fs.readdir(rootDir, { withFileTypes: true });
        await Promise.all(entries
            .filter((entry) => entry.isDirectory() && entry.name.startsWith(PIN_PREFIX))
            .map((entry) => fs.rm(path.join(rootDir, entry.name), {
                recursive: true,
                force: true,
            })));
    }

    async function acquire({ capture, shouldAbort = () => false }) {
        throwIfAborted(shouldAbort);
        await fs.mkdir(rootDir, { recursive: true, mode: 0o700 });
        if (activeTokens.size >= maxActive) {
            throw new BackupSourceError(
                'BACKUP_SOURCE_CAPACITY',
                'Too many point-in-time backup sources are active',
                503,
            );
        }
        const token = crypto.randomUUID();
        activeTokens.add(token);
        let snapshot = null;
        let pinDir = null;
        let reservation = 0;
        let closed = false;

        async function close() {
            if (closed) return;
            closed = true;
            try { snapshot?.close(); } catch {}
            if (pinDir) {
                await fs.rm(pinDir, { recursive: true, force: true }).catch(() => {});
            }
            reservedBytes = Math.max(0, reservedBytes - reservation);
            activeTokens.delete(token);
        }

        try {
            const captured = await capture();
            snapshot = captured.snapshot;
            const filesystemEntries = captured.filesystemEntries ?? [];
            throwIfAborted(shouldAbort);

            for (const entry of filesystemEntries) {
                const nameBytes = Buffer.byteLength(entry.backupName, 'utf-8');
                if (!Number.isSafeInteger(entry.size) || entry.size < 0) {
                    throw new BackupSourceError(
                        'BACKUP_SOURCE_TOO_LARGE',
                        `Backup filesystem entry has an unsafe size: ${entry.backupName}`,
                        413,
                    );
                }
                if (nameBytes > 0xffffffff || entry.size > 0xffffffff) {
                    throw new BackupSourceError(
                        'BACKUP_ENTRY_TOO_LARGE',
                        `Backup entry exceeds the 32-bit archive frame limit: ${entry.backupName}`,
                        413,
                    );
                }
            }

            const payloadBytes = filesystemEntries.reduce((sum, entry) => sum + entry.size, 0);
            if (!Number.isSafeInteger(payloadBytes)) {
                throw new BackupSourceError(
                    'BACKUP_SOURCE_TOO_LARGE',
                    'Backup filesystem source exceeds the safe byte range',
                    413,
                );
            }
            if (payloadBytes > 0) {
                const required = Math.ceil(payloadBytes * 1.05) + 16 * 1024 * 1024;
                const statfs = await fs.statfs(rootDir);
                const available = statfs.bsize * statfs.bavail;
                if (available - reservedBytes < required) {
                    throw new BackupSourceError(
                        'BACKUP_SOURCE_DISK_SPACE',
                        'Insufficient disk space to pin a point-in-time backup source',
                        507,
                        { required, available, reserved: reservedBytes },
                    );
                }
                reservation = required;
                reservedBytes += reservation;
            }

            if (filesystemEntries.length > 0) {
                pinDir = await fs.mkdtemp(path.join(rootDir, PIN_PREFIX));
            }
            const pinnedEntries = [];
            for (let index = 0; index < filesystemEntries.length; index++) {
                throwIfAborted(shouldAbort);
                const destination = path.join(pinDir, `${String(index).padStart(8, '0')}.pin`);
                pinnedEntries.push(await copyPinnedFile(
                    filesystemEntries[index],
                    destination,
                    shouldAbort,
                ));
            }

            // Re-check the complete plan after every copy. This catches an
            // out-of-band replacement of an earlier source while a later file
            // was being pinned; in-process writers are already queue-serialized.
            for (const entry of filesystemEntries) {
                throwIfAborted(shouldAbort);
                const finalStat = await fs.stat(entry.sourcePath).catch(() => null);
                if (!finalStat || !sameSourceStat(finalStat, entry.sourceStat)) {
                    throw new BackupSourceError(
                        'BACKUP_SOURCE_CHANGED',
                        `Backup source changed before capture completed: ${entry.backupName}`,
                        409,
                    );
                }
            }

            return {
                token,
                snapshot,
                filesystemEntries: pinnedEntries,
                close,
            };
        } catch (error) {
            await close();
            throw error;
        }
    }

    return { acquire, sweep, activeCount, hasActive };
}

module.exports = {
    BackupSourceError,
    createBackupSourceManager,
    sameSourceStat,
};
