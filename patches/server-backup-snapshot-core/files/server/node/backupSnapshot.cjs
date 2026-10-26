'use strict';

const Database = require('better-sqlite3');
const { CHUNK_MARKER } = require('./chunkStore.cjs');

// Same prefix rule as PocketRisu's db.cjs: a key range [prefix, upper) when the
// last character is printable ASCII (bumping it cannot cross a UTF-8 encoding
// boundary), otherwise an escaped LIKE. The range is case-sensitive like the
// live reader; LIKE alone would also match ASCII case variants.
function prefixRange(prefix) {
    const last = prefix.charCodeAt(prefix.length - 1);
    if (!(last >= 0x20 && last <= 0x7e)) return null;
    return [prefix, prefix.slice(0, -1) + String.fromCharCode(last + 1)];
}

function likePrefix(prefix) {
    return `${prefix.replace(/[\\%_]/g, '\\$&')}%`;
}

function createSnapshotReader(db) {
    const selectValue = db.prepare('SELECT value FROM kv WHERE key = ?');
    const selectKeys = db.prepare('SELECT key FROM kv ORDER BY key');
    const selectPrefixKeys = db.prepare(`SELECT key FROM kv WHERE key LIKE ? ESCAPE '\\' ORDER BY key`);
    const selectRangeKeys = db.prepare('SELECT key FROM kv WHERE key >= ? AND key < ? ORDER BY key');
    const selectPrefixSizes = db.prepare(
        `SELECT key, LENGTH(value) AS stored_size, value = @chunkMarker AS is_chunked
         FROM kv WHERE key LIKE @pattern ESCAPE '\\' ORDER BY key`,
    );
    const selectRangeSizes = db.prepare(
        `SELECT key, LENGTH(value) AS stored_size, value = @chunkMarker AS is_chunked
         FROM kv WHERE key >= @lower AND key < @upper ORDER BY key`,
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
            const range = prefixRange(prefix);
            const rows = range ? selectRangeKeys.all(...range) : selectPrefixKeys.all(likePrefix(prefix));
            return rows.map((row) => row.key);
        }
        return selectKeys.all().map((row) => row.key);
    }

    function logicalSize(key, storedSize, isChunked) {
        if (!isChunked) return storedSize;
        const row = selectChunkSize.get(key);
        return row.chunk_count > 0 ? row.logical_size : storedSize;
    }

    function kvListWithSizes(prefix) {
        const range = prefixRange(prefix);
        const rows = range
            ? selectRangeSizes.all({ chunkMarker: CHUNK_MARKER, lower: range[0], upper: range[1] })
            : selectPrefixSizes.all({ chunkMarker: CHUNK_MARKER, pattern: likePrefix(prefix) });
        return rows.map((row) => ({
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
