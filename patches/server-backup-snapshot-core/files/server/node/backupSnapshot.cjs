'use strict';

const Database = require('better-sqlite3');
const { CHUNK_MARKER } = require('./chunkStore.cjs');

function escapeLikePrefix(prefix) {
    return prefix.replace(/[\\%_]/g, '\\$&');
}

function createSnapshotReader(db) {
    const selectValue = db.prepare('SELECT value FROM kv WHERE key = ?');
    const selectKeys = db.prepare('SELECT key FROM kv ORDER BY key');
    const selectPrefixKeys = db.prepare(`SELECT key FROM kv WHERE key LIKE ? ESCAPE '\\' ORDER BY key`);
    const selectPrefixSizes = db.prepare(
        `SELECT key, LENGTH(value) AS stored_size, value = @chunkMarker AS is_chunked
         FROM kv WHERE key LIKE @pattern ESCAPE '\\' ORDER BY key`,
    );
    const selectManifest = db.prepare(
        'SELECT hash FROM manifest_chunks WHERE manifest_key = ? ORDER BY seq',
    );
    const selectChunk = db.prepare('SELECT data FROM chunks WHERE hash = ?');
    const selectChunkSize = db.prepare(
        `SELECT COUNT(*) AS chunk_count, COALESCE(SUM(LENGTH(c.data)), 0) AS logical_size
         FROM manifest_chunks m
         LEFT JOIN chunks c ON c.hash = m.hash
         WHERE m.manifest_key = ?`,
    );

    function chunkRows(key, storedValue) {
        if (!Buffer.isBuffer(storedValue) || !storedValue.equals(CHUNK_MARKER)) {
            return null;
        }
        const rows = selectManifest.all(key);
        // Preserve chunkStore's raw-marker collision behavior. A real chunked
        // value always has at least one manifest row.
        return rows.length === 0 ? null : rows;
    }

    function kvGet(key) {
        const row = selectValue.get(key);
        if (!row) return null;
        const rows = chunkRows(key, row.value);
        if (!rows) return row.value;
        return Buffer.concat(rows.map((entry) => {
            const chunk = selectChunk.get(entry.hash);
            if (!chunk || !Buffer.isBuffer(chunk.data)) {
                const error = new Error(`Pinned backup snapshot is missing chunk ${entry.hash} for ${key}`);
                error.code = 'BACKUP_SNAPSHOT_CORRUPT';
                throw error;
            }
            return chunk.data;
        }));
    }

    function kvList(prefix) {
        if (prefix) {
            return selectPrefixKeys
                .all(`${escapeLikePrefix(prefix)}%`)
                .map((row) => row.key);
        }
        return selectKeys.all().map((row) => row.key);
    }

    function logicalSize(key, storedSize, isChunked) {
        if (!isChunked) return storedSize;
        const row = selectChunkSize.get(key);
        return row.chunk_count > 0 ? row.logical_size : storedSize;
    }

    function kvListWithSizes(prefix) {
        return selectPrefixSizes.all({
            chunkMarker: CHUNK_MARKER,
            pattern: `${escapeLikePrefix(prefix)}%`,
        }).map((row) => ({
            key: row.key,
            size: logicalSize(row.key, row.stored_size, row.is_chunked),
        }));
    }

    function kvSize(key) {
        const row = selectValue.get(key);
        if (!row) return null;
        const isChunked = Buffer.isBuffer(row.value) && row.value.equals(CHUNK_MARKER);
        return logicalSize(key, row.value.length, isChunked);
    }

    return { kvGet, kvList, kvListWithSizes, kvSize };
}

function openKvSnapshot(dbPath) {
    const snapshotDb = new Database(dbPath, { readonly: true, fileMustExist: true });
    let transactionOpen = false;
    let closed = false;
    try {
        snapshotDb.pragma('busy_timeout = 5000');
        snapshotDb.exec('BEGIN');
        transactionOpen = true;
        // SQLite fixes a WAL read transaction on its first read, not on BEGIN.
        snapshotDb.prepare('SELECT 1 FROM sqlite_master LIMIT 1').get();
        const reader = createSnapshotReader(snapshotDb);
        return {
            ...reader,
            close() {
                if (closed) return;
                closed = true;
                try {
                    if (transactionOpen) snapshotDb.exec('ROLLBACK');
                } catch {}
                transactionOpen = false;
                try { snapshotDb.close(); } catch {}
            },
        };
    } catch (error) {
        try {
            if (transactionOpen) snapshotDb.exec('ROLLBACK');
        } catch {}
        try { snapshotDb.close(); } catch {}
        throw error;
    }
}

module.exports = { createSnapshotReader, openKvSnapshot };
