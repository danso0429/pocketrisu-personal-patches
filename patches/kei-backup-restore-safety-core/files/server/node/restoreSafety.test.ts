import { describe, expect, it, vi } from 'vitest'
import restoreSafetyPackage from './restoreSafety.cjs'

const {
    copyVerifiedSnapshot,
    createRestoreConfirmationOwner,
    createDeferredAsyncIterable,
    FRESH_SNAPSHOT_REQUIRED_CODE,
    nextUniqueSnapshotKey,
    prepareFreshRestoreSnapshot,
    prepareLazyChatSnapshotOwner,
    readLazyChatSnapshotState,
    requireLazyChatSnapshotCompleteness,
    restoreTargetForLocalImport,
    restoreSnapshotValue,
    restoreSafetyErrorPayload,
    selectProtectedSnapshotKeysToDelete,
} = restoreSafetyPackage as any

function confirmationHeaders(confirmationToken: string) {
    return {
        'x-risu-restore-without-fresh-snapshot': '1',
        'x-risu-restore-confirmation': confirmationToken,
    }
}

function deterministicConfirmationOwner(options: Record<string, unknown> = {}) {
    let sequence = 0
    return createRestoreConfirmationOwner({
        token: () => `confirmation-${++sequence}`,
        ...options,
    })
}

describe('fresh pre-restore snapshot owner', () => {
    it('bypasses the ordinary key collision and flushes before copying', async () => {
        const events: string[] = []
        const existing = new Set(['database/dbbackup-1000.bin', 'database/dbbackup-1001.bin'])
        const key = nextUniqueSnapshotKey({
            prefix: 'database/dbbackup-',
            now: 100_000,
            existingKeys: existing,
        })
        expect(key).toBe('database/dbbackup-1002.bin')

        const result = await prepareFreshRestoreSnapshot({
            flushPendingDb: async () => { events.push('flush') },
            createFreshSnapshot: async () => { events.push('copy'); return key },
        })
        expect(events).toEqual(['flush', 'copy'])
        expect(result).toEqual({ snapshotKey: key, bypassed: false })
    })

    it('allocates above future-dated keys after a clock rollback', () => {
        expect(nextUniqueSnapshotKey({
            prefix: 'database/dbbackup-',
            now: 100_000,
            existingKeys: [
                'database/dbbackup-5000.bin',
                'database/dbbackup-not-a-tick.bin',
                'another-prefix-9000.bin',
            ],
        })).toBe('database/dbbackup-5001.bin')
    })

    it('aborts when snapshot creation fails without an acknowledgement', async () => {
        const destructiveWrite = vi.fn()
        const confirmationOwner = deterministicConfirmationOwner()
        const restore = async () => {
            await prepareFreshRestoreSnapshot({
                confirmationOwner,
                confirmationHeaders: {},
                restoreTarget: 'snapshot:selected',
                flushPendingDb: async () => undefined,
                createFreshSnapshot: async () => { throw new Error('disk full') },
            })
            destructiveWrite()
        }
        await expect(restore()).rejects.toMatchObject({
            code: FRESH_SNAPSHOT_REQUIRED_CODE,
            message: expect.stringContaining('Restore was not started'),
            confirmationToken: 'confirmation-1',
        })
        expect(destructiveWrite).not.toHaveBeenCalled()
        expect(confirmationOwner.size()).toBe(1)
    })

    it('retries creation and permits only an explicitly acknowledged request', async () => {
        const logger = { warn: vi.fn() }
        const confirmationOwner = deterministicConfirmationOwner()
        const createFreshSnapshot = vi.fn(async () => { throw new Error('read-only filesystem') })
        const firstFailure = await prepareFreshRestoreSnapshot({
            confirmationOwner,
            confirmationHeaders: {},
            restoreTarget: 'server:backup.bin',
            flushPendingDb: async () => undefined,
            createFreshSnapshot,
        }).catch((error: any) => error)
        expect(firstFailure).toMatchObject({
            code: FRESH_SNAPSHOT_REQUIRED_CODE,
            confirmationToken: 'confirmation-1',
        })
        const result = await prepareFreshRestoreSnapshot({
            confirmationOwner,
            confirmationHeaders: confirmationHeaders(firstFailure.confirmationToken),
            restoreTarget: 'server:backup.bin',
            flushPendingDb: async () => undefined,
            createFreshSnapshot,
            logger,
        })
        expect(result).toEqual({ snapshotKey: null, bypassed: true })
        expect(createFreshSnapshot).toHaveBeenCalledTimes(2)
        expect(logger.warn).toHaveBeenCalledTimes(1)
        expect(confirmationOwner.size()).toBe(0)
    })

    it('never treats flush failure as an overridable snapshot failure', async () => {
        const confirmationOwner = deterministicConfirmationOwner()
        const confirmationToken = confirmationOwner.issue('local:42:0')
        const createFreshSnapshot = vi.fn()
        await expect(prepareFreshRestoreSnapshot({
            confirmationOwner,
            confirmationHeaders: confirmationHeaders(confirmationToken),
            restoreTarget: 'local:42:0',
            flushPendingDb: async () => { throw new Error('pending write failed') },
            createFreshSnapshot,
        })).rejects.toThrow('pending write failed')
        expect(createFreshSnapshot).not.toHaveBeenCalled()
        expect(confirmationOwner.size()).toBe(1)
    })

    it('consumes the one-use confirmation even when the retry creates a fresh snapshot', async () => {
        const confirmationOwner = deterministicConfirmationOwner()
        const confirmationToken = confirmationOwner.issue('snapshot:selected')
        await expect(prepareFreshRestoreSnapshot({
            confirmationOwner,
            confirmationHeaders: confirmationHeaders(confirmationToken),
            restoreTarget: 'snapshot:selected',
            flushPendingDb: async () => undefined,
            createFreshSnapshot: async () => 'database/dbbackup-fresh.bin',
        })).resolves.toEqual({
            snapshotKey: 'database/dbbackup-fresh.bin',
            bypassed: false,
        })
        expect(confirmationOwner.size()).toBe(0)

        await expect(prepareFreshRestoreSnapshot({
            confirmationOwner,
            confirmationHeaders: confirmationHeaders(confirmationToken),
            restoreTarget: 'snapshot:selected',
            flushPendingDb: async () => undefined,
            createFreshSnapshot: async () => { throw new Error('disk full later') },
        })).rejects.toMatchObject({
            code: FRESH_SNAPSHOT_REQUIRED_CODE,
            confirmationToken: 'confirmation-2',
        })
        expect(confirmationOwner.size()).toBe(1)
    })

    it('binds a bounded one-use confirmation to the failed restore target', () => {
        let now = 1000
        const owner = deterministicConfirmationOwner({ now: () => now, ttlMs: 50, maxEntries: 2 })
        const first = owner.issue('snapshot:a')
        expect(owner.consume(confirmationHeaders(first), 'snapshot:b')).toBe(false)
        expect(owner.consume({ 'x-risu-restore-confirmation': first }, 'snapshot:a')).toBe(false)
        expect(owner.consume(confirmationHeaders(first), 'snapshot:a')).toBe(true)
        expect(owner.consume(confirmationHeaders(first), 'snapshot:a')).toBe(false)

        const expired = owner.issue('server:old.bin')
        now += 51
        expect(owner.consume(confirmationHeaders(expired), 'server:old.bin')).toBe(false)

        owner.issue('one')
        owner.issue('two')
        owner.issue('three')
        expect(owner.size()).toBe(2)

        expect(restoreTargetForLocalImport({
            'x-risu-restore-source-id': '42:1234',
            'content-length': '42',
        })).toBe('local:42:1234')
        expect(restoreTargetForLocalImport({ 'content-length': '99' })).toBe('local:99')

        expect(restoreSafetyErrorPayload({
            code: FRESH_SNAPSHOT_REQUIRED_CODE,
            message: 'snapshot failed',
            confirmationToken: 'confirmation-7',
        })).toEqual({
            code: FRESH_SNAPSHOT_REQUIRED_CODE,
            message: 'snapshot failed',
            confirmationToken: 'confirmation-7',
        })
    })

    it('protects the fresh and selected snapshots while respecting limits when possible', () => {
        const entries = [
            { key: 'snapshot-new', size: 4 },
            { key: 'snapshot-middle', size: 4 },
            { key: 'snapshot-selected', size: 4 },
            { key: 'snapshot-old', size: 1 },
        ]
        expect(selectProtectedSnapshotKeysToDelete({
            entries,
            maxCount: 2,
            maxBytes: 8,
            protectedSnapshotKeys: ['snapshot-new', 'snapshot-selected'],
        })).toEqual(['snapshot-middle', 'snapshot-old'])

        // A maxCount of one cannot hold both the newly created rollback point
        // and the selected restore source. Both remain until post-copy cleanup.
        expect(selectProtectedSnapshotKeysToDelete({
            entries: [entries[0], entries[2]],
            maxCount: 1,
            maxBytes: 4,
            protectedSnapshotKeys: ['snapshot-new', 'snapshot-selected'],
        })).toEqual([])
    })

    it('verifies a forced snapshot both before and after protected rotation', () => {
        const sizes = new Map<string, number>([['database/database.bin', 42]])
        const events: string[] = []
        const result = copyVerifiedSnapshot({
            sourceKey: 'database/database.bin',
            destinationKey: 'database/dbbackup-5001.bin',
            sizeValue: (key: string) => sizes.get(key) ?? null,
            copyValue: (source: string, destination: string) => {
                events.push('copy')
                sizes.set(destination, sizes.get(source)!)
            },
            rotate: () => { events.push('rotate') },
        })
        expect(result).toBe('database/dbbackup-5001.bin')
        expect(events).toEqual(['copy', 'rotate'])

        expect(() => copyVerifiedSnapshot({
            sourceKey: 'missing',
            destinationKey: 'snapshot',
            sizeValue: () => null,
            copyValue: vi.fn(),
            rotate: vi.fn(),
        })).toThrow('live database is missing')

        expect(() => copyVerifiedSnapshot({
            sourceKey: 'database/database.bin',
            destinationKey: 'snapshot-deleted-by-rotation',
            sizeValue: (key: string) => sizes.get(key) ?? null,
            copyValue: (source: string, destination: string) => {
                sizes.set(destination, sizes.get(source)!)
            },
            rotate: () => { sizes.delete('snapshot-deleted-by-rotation') },
        })).toThrow('verification failed after rotation')
    })

    it('holds and verifies the selected restore value across the fresh-snapshot await', () => {
        const values = new Map<string, Buffer>([
            ['snapshot-selected', Buffer.from('selected-state')],
            ['database/database.bin', Buffer.from('current-state')],
        ])
        const selectedValue = values.get('snapshot-selected')
        values.delete('snapshot-selected')
        expect(restoreSnapshotValue({
            sourceValue: selectedValue,
            destinationKey: 'database/database.bin',
            setValue: (key: string, value: Buffer) => { values.set(key, Buffer.from(value)) },
            sizeValue: (key: string) => values.get(key)?.byteLength ?? null,
        })).toBe(Buffer.byteLength('selected-state'))
        expect(values.get('database/database.bin')?.toString()).toBe('selected-state')

        expect(() => restoreSnapshotValue({
            sourceValue: null,
            destinationKey: 'database/database.bin',
            setValue: vi.fn(),
            sizeValue: (key: string) => values.get(key)?.byteLength ?? null,
        })).toThrow('selected snapshot is no longer available')
    })

    it('reconciles a cold lazy owner before persist and exposes unrepresentable journal rows', async () => {
        const events: string[] = []
        await prepareLazyChatSnapshotOwner({
            ensureChatStore: async () => { events.push('migrate+replay') },
        })
        events.push('persist')
        const state = readLazyChatSnapshotState({
            getJournalStats: () => ({ awaitingRecords: 2, awaitingBytes: 8192 }),
        })
        expect(events).toEqual(['migrate+replay', 'persist'])
        expect(state).toEqual({ awaitingRecords: 2, awaitingBytes: 8192 })
        expect(() => requireLazyChatSnapshotCompleteness(state)).toThrow(
            'cannot be represented by a database snapshot',
        )
        expect(() => requireLazyChatSnapshotCompleteness({
            awaitingRecords: 0,
            awaitingBytes: 0,
        })).not.toThrow()
    })

    it('passes reconciled lazy journal state into the creation gate on both attempts', async () => {
        const events: string[] = []
        const flushPendingDb = async () => {
            await prepareLazyChatSnapshotOwner({
                ensureChatStore: async () => { events.push('migrate+replay') },
            })
            events.push('persist')
            return readLazyChatSnapshotState({
                getJournalStats: () => ({ awaitingRecords: 1, awaitingBytes: 256 }),
            })
        }
        const createFreshSnapshot = vi.fn((state) => {
            events.push('create-gate')
            requireLazyChatSnapshotCompleteness(state)
            return 'must-not-be-created'
        })

        await expect(prepareFreshRestoreSnapshot({
            confirmationOwner: deterministicConfirmationOwner(),
            confirmationHeaders: {},
            restoreTarget: 'local:journal-test',
            flushPendingDb,
            createFreshSnapshot,
        })).rejects.toMatchObject({ code: FRESH_SNAPSHOT_REQUIRED_CODE })
        const confirmationOwner = deterministicConfirmationOwner()
        const confirmationToken = confirmationOwner.issue('local:journal-test')
        await expect(prepareFreshRestoreSnapshot({
            confirmationOwner,
            confirmationHeaders: confirmationHeaders(confirmationToken),
            restoreTarget: 'local:journal-test',
            flushPendingDb,
            createFreshSnapshot,
        })).resolves.toEqual({ snapshotKey: null, bypassed: true })
        expect(events).toEqual([
            'migrate+replay', 'persist', 'create-gate',
            'migrate+replay', 'persist', 'create-gate',
        ])
        expect(createFreshSnapshot).toHaveBeenCalledTimes(2)
    })

    it('does not open a deferred server backup stream before consumption and always destroys it', async () => {
        let created = 0
        let destroyed = 0
        const source = createDeferredAsyncIterable(() => {
            created += 1
            return {
                async *[Symbol.asyncIterator]() {
                    yield Buffer.from('one')
                    yield Buffer.from('two')
                },
                destroy() { destroyed += 1 },
            }
        })
        expect(created).toBe(0)
        const received: string[] = []
        for await (const chunk of source) {
            received.push(chunk.toString())
            break
        }
        expect(received).toEqual(['one'])
        expect(created).toBe(1)
        expect(destroyed).toBe(1)
    })
})
