import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sourcePkg from './backupSource.cjs'

const { createBackupSourceManager } = sourcePkg as {
    createBackupSourceManager: (options: { rootDir: string; maxActive?: number }) => {
        acquire: (options: {
            capture: () => Promise<{
                snapshot: { close: () => void }
                filesystemEntries: Array<Record<string, unknown>>
            }>
            shouldAbort?: () => boolean
        }) => Promise<{
            filesystemEntries: Array<{ sourcePath: string; size: number }>
            close: () => Promise<void>
        }>
        sweep: () => Promise<void>
        activeCount: () => number
        hasActive: () => boolean
    }
}

const tempDirs: string[] = []
afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, {
        recursive: true,
        force: true,
    })))
})

describe('filesystem backup pins', () => {
    it('copies exact bytes, survives source replacement, and cleans up idempotently', async () => {
        const directory = await mkdtemp(path.join(tmpdir(), 'backup-source-'))
        tempDirs.push(directory)
        const rootDir = path.join(directory, 'pins')
        const sourcePath = path.join(directory, 'inlay.bin')
        await writeFile(sourcePath, Buffer.from('old-inlay'))
        const sourceStat = await stat(sourcePath)
        let snapshotCloses = 0
        const manager = createBackupSourceManager({ rootDir })
        await manager.sweep()

        const source = await manager.acquire({
            capture: async () => ({
                snapshot: { close: () => { snapshotCloses++ } },
                filesystemEntries: [{
                    kind: 'source-file',
                    sourcePath,
                    sourceStat,
                    backupName: 'inlay/test.bin',
                    sortKey: 'inlay/test',
                    size: sourceStat.size,
                }],
            }),
        })
        await writeFile(sourcePath, Buffer.from('new-inlay'))
        expect((await readFile(source.filesystemEntries[0].sourcePath)).toString()).toBe('old-inlay')

        await source.close()
        await source.close()
        expect(snapshotCloses).toBe(1)
        expect(await readdir(rootDir)).toEqual([])
    })

    it('releases capacity and closes a captured snapshot when pinning fails', async () => {
        const directory = await mkdtemp(path.join(tmpdir(), 'backup-source-fail-'))
        tempDirs.push(directory)
        const rootDir = path.join(directory, 'pins')
        const sourcePath = path.join(directory, 'missing.bin')
        await writeFile(sourcePath, Buffer.from('present-at-plan'))
        const sourceStat = await stat(sourcePath)
        await rm(sourcePath)
        let snapshotCloses = 0
        const manager = createBackupSourceManager({ rootDir, maxActive: 1 })
        await manager.sweep()

        await expect(manager.acquire({
            capture: async () => ({
                snapshot: { close: () => { snapshotCloses++ } },
                filesystemEntries: [{
                    kind: 'source-file',
                    sourcePath,
                    sourceStat,
                    backupName: 'inlay/missing.bin',
                    sortKey: 'inlay/missing',
                    size: sourceStat.size,
                }],
            }),
        })).rejects.toThrow()
        expect(snapshotCloses).toBe(1)
        expect(await readdir(rootDir)).toEqual([])
    })

    it('enforces the active-source cap and releases the slot on close', async () => {
        const directory = await mkdtemp(path.join(tmpdir(), 'backup-source-cap-'))
        tempDirs.push(directory)
        const rootDir = path.join(directory, 'pins')
        const manager = createBackupSourceManager({ rootDir, maxActive: 1 })
        await manager.sweep()

        const first = await manager.acquire({
            capture: async () => ({
                snapshot: { close: () => {} },
                filesystemEntries: [],
            }),
        })
        expect(manager.activeCount()).toBe(1)
        expect(manager.hasActive()).toBe(true)
        await expect(manager.acquire({
            capture: async () => ({
                snapshot: { close: () => {} },
                filesystemEntries: [],
            }),
        })).rejects.toMatchObject({ code: 'BACKUP_SOURCE_CAPACITY', statusCode: 503 })

        await first.close()
        expect(manager.activeCount()).toBe(0)
        expect(manager.hasActive()).toBe(false)
        const replacement = await manager.acquire({
            capture: async () => ({
                snapshot: { close: () => {} },
                filesystemEntries: [],
            }),
        })
        expect(manager.activeCount()).toBe(1)
        await replacement.close()
        expect(manager.activeCount()).toBe(0)
        expect(await readdir(rootDir)).toEqual([])
    })

    it('rejects an oversized filesystem frame before opening or copying it', async () => {
        const directory = await mkdtemp(path.join(tmpdir(), 'backup-source-frame-'))
        tempDirs.push(directory)
        const rootDir = path.join(directory, 'pins')
        let snapshotCloses = 0
        const manager = createBackupSourceManager({ rootDir })

        await expect(manager.acquire({
            capture: async () => ({
                snapshot: { close: () => { snapshotCloses++ } },
                filesystemEntries: [{
                    kind: 'source-file',
                    sourcePath: path.join(directory, 'must-not-be-opened.bin'),
                    sourceStat: {},
                    backupName: 'inlay/oversized.bin',
                    sortKey: 'inlay/oversized',
                    size: 0x1_0000_0000,
                }],
            }),
        })).rejects.toMatchObject({
            code: 'BACKUP_ENTRY_TOO_LARGE',
            statusCode: 413,
        })
        expect(snapshotCloses).toBe(1)
        expect(manager.activeCount()).toBe(0)
        expect(await readdir(rootDir)).toEqual([])
    })
})
