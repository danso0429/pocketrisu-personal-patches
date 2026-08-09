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

describe('point-in-time KV snapshot', () => {
    it('keeps raw, chunked, list, and logical-size reads on one WAL epoch', async () => {
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
