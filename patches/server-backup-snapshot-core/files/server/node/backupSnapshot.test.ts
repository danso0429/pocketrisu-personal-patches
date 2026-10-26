import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import chunkStorePkg from './chunkStore.cjs'
import snapshotPkg from './backupSnapshot.cjs'

const { createChunkStore } = chunkStorePkg as {
    createChunkStore: (db: any, options?: { threshold?: number }) => {
        putValue: (key: string, value: Buffer) => void
        snapshotValue: (source: string, destination: string) => void
        dropValue: (key: string) => void
        gc: () => number
    }
}
const { openKvSnapshot } = snapshotPkg as {
    openKvSnapshot: (dbPath: string) => {
        kvGet: (key: string) => Buffer | null
        kvList: (prefix?: string) => string[]
        kvListWithSizes: (prefix: string) => Array<{ key: string; size: number }>
        kvSize: (key: string) => number | null
        close: () => void
    }
}

const tempDirs: string[] = []
afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, {
        recursive: true,
        force: true,
    })))
})

async function createWalDatabase() {
    const directory = await mkdtemp(path.join(tmpdir(), 'backup-snapshot-'))
    tempDirs.push(directory)
    const dbPath = path.join(directory, 'risuai.db')
    const db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('busy_timeout = 50')
    db.exec(
        'CREATE TABLE kv (key TEXT PRIMARY KEY, value BLOB NOT NULL, updated_at INTEGER NOT NULL DEFAULT 0)',
    )
    return { db, dbPath, store: createChunkStore(db, { threshold: 32 }) }
}

function nativePrefixKeys(db: any, prefix: string) {
    const last = prefix.charCodeAt(prefix.length - 1)
    if (last >= 0x20 && last <= 0x7e) {
        const upper = prefix.slice(0, -1) + String.fromCharCode(last + 1)
        return db.prepare('SELECT key FROM kv WHERE key >= ? AND key < ? ORDER BY key')
            .all(prefix, upper)
            .map((row: { key: string }) => row.key)
    }
    const pattern = `${prefix.replace(/[\\%_]/g, '\\$&')}%`
    return db.prepare("SELECT key FROM kv WHERE key LIKE ? ESCAPE '\\' ORDER BY key")
        .all(pattern)
        .map((row: { key: string }) => row.key)
}

describe('[E2-2b] Rebase the server backup snapshot core onto PocketRisu 1.16.1', () => {
    it('[unchanged] keeps raw, chunked, wildcard-literal, list, and logical-size reads on one WAL epoch', async () => {
        const { db, dbPath, store } = await createWalDatabase()
        const oldDb = Buffer.alloc(4096, 0x31)
        const newDb = Buffer.alloc(8192, 0x32)
        store.putValue('database/database.bin', oldDb)
        store.putValue('assets/old.bin', Buffer.from('old-asset'))
        store.putValue('assets/literal%_name.bin', Buffer.from('escaped'))

        const snapshot = openKvSnapshot(dbPath)
        store.putValue('database/database.bin', newDb)
        store.putValue('assets/old.bin', Buffer.from('new-asset-is-longer'))
        store.putValue('assets/new.bin', Buffer.from('new'))

        expect(snapshot.kvGet('database/database.bin')?.equals(oldDb)).toBe(true)
        expect(snapshot.kvSize('database/database.bin')).toBe(oldDb.length)
        expect(snapshot.kvGet('assets/old.bin')?.toString()).toBe('old-asset')
        expect(snapshot.kvGet('assets/new.bin')).toBeNull()
        expect(snapshot.kvList('assets/')).toEqual([
            'assets/literal%_name.bin',
            'assets/old.bin',
        ])
        expect(snapshot.kvList('assets/literal%_')).toEqual(['assets/literal%_name.bin'])
        expect(snapshot.kvListWithSizes('assets/')).toEqual([
            { key: 'assets/literal%_name.bin', size: 7 },
            { key: 'assets/old.bin', size: 9 },
        ])

        const busy = db.pragma('wal_checkpoint(TRUNCATE)') as Array<{ busy: number }>
        expect(busy[0].busy).toBe(1)
        snapshot.close()
        snapshot.close()
        const complete = db.pragma('wal_checkpoint(TRUNCATE)') as Array<{ busy: number }>
        expect(complete[0].busy).toBe(0)
        db.close()
    })

    it('[new] returns the native 1.16.1 key set for case-distinct and wildcard prefixes', async () => {
        const { db, dbPath, store } = await createWalDatabase()
        store.putValue('archive/one', Buffer.from('lower'))
        store.putValue('Archive/two', Buffer.from('upper'))
        store.putValue('assets/literal%_one', Buffer.from('literal'))
        store.putValue('assets/literalXXtwo', Buffer.from('wildcard-lookalike'))

        const snapshot = openKvSnapshot(dbPath)
        for (const prefix of ['archive/', 'Archive/', 'assets/literal%_']) {
            const nativeKeys = nativePrefixKeys(db, prefix)
            expect(snapshot.kvList(prefix)).toEqual(nativeKeys)
            expect(snapshot.kvListWithSizes(prefix).map(({ key }) => key)).toEqual(nativeKeys)
        }
        snapshot.close()
        db.close()
    })

    it('[unchanged] preserves a pinned view through snapshot rotation and plugin-blob cleanup', async () => {
        const { db, dbPath, store } = await createWalDatabase()
        const oldDatabase = Buffer.alloc(4096, 0x51)
        const newDatabase = Buffer.alloc(4096, 0x52)
        const pluginBlob = Buffer.alloc(2048, 0x61)
        store.putValue('database/database.bin', oldDatabase)
        store.snapshotValue('database/database.bin', 'dbbackup-old')
        store.putValue('plugin-storage/blob', pluginBlob)

        const snapshot = openKvSnapshot(dbPath)
        store.putValue('database/database.bin', newDatabase)
        store.snapshotValue('database/database.bin', 'dbbackup-new')
        store.dropValue('dbbackup-old')
        store.dropValue('plugin-storage/blob')
        store.gc()

        expect(snapshot.kvGet('database/database.bin')?.equals(oldDatabase)).toBe(true)
        expect(snapshot.kvGet('dbbackup-old')?.equals(oldDatabase)).toBe(true)
        expect(snapshot.kvGet('dbbackup-new')).toBeNull()
        expect(snapshot.kvGet('plugin-storage/blob')?.equals(pluginBlob)).toBe(true)
        snapshot.close()
        db.close()
    })
})

describe('point-in-time KV snapshot corruption handling', () => {
    it('fails closed when a pinned chunk manifest references missing data', async () => {
        const { db, dbPath, store } = await createWalDatabase()
        store.putValue('database/database.bin', Buffer.alloc(4096, 0x41))
        const missingHash = db.prepare(
            'SELECT hash FROM manifest_chunks WHERE manifest_key = ? ORDER BY seq LIMIT 1',
        ).get('database/database.bin').hash as string
        db.prepare('DELETE FROM chunks WHERE hash = ?').run(missingHash)

        const snapshot = openKvSnapshot(dbPath)
        expect(() => snapshot.kvGet('database/database.bin')).toThrow(/missing chunk/)
        snapshot.close()
        db.close()
    })
})
