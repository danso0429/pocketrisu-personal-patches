import { describe, expect, it } from 'vitest'
import journalPackage from './chatWriteJournal.cjs'
import deltaPackage from './chatDelta.cjs'

const { commitSnapshotRestore, createChatWriteJournal } = journalPackage as {
    commitSnapshotRestore: (options: {
        runTransaction: (operation: () => void) => void
        restoreDatabase: () => void
        discardJournal: () => void
        discardCommitRecovery?: () => void
        resetJournalMemory: () => void
    }) => void
    createChatWriteJournal: (options: any) => {
        prefix: string
        prepareStage: (
            chaId: string,
            chatId: string,
            chat: any,
            options: { awaitingMetadata: boolean; commitOperationId?: string; retentionVersion?: 1 },
        ) => Promise<any>
        describePreparedStage: (prepared: any) => { storageKey: string; storageBytes: number }
        writePreparedStage: (prepared: any) => { storageKey: string; storageBytes: number }
        publishPreparedStage: (prepared: any) => void
        restoreDurableStage: (
            chaId: string,
            chatId: string,
            options?: {
                validate?: (record: any) => boolean
                expectedStorageKey?: string
            },
        ) => Promise<any | null>
        prepareRetirement: (chaId: string, chatId: string, options: any) => Promise<any>
        writeRetirement: (prepared: any) => void
        publishRetirement: (prepared: any) => void
        stage: (chaId: string, chatId: string, chat: any, options: { awaitingMetadata: boolean }) => Promise<void>
        restoreInto: (store: Map<string, Map<string, any>>) => Promise<void>
        clearAfterDatabasePersist: (database: any) => Promise<void>
        isAwaitingMetadata: (chaId: string, chatId: string) => Promise<boolean>
        size: () => number
        stats: () => {
            records: number
            awaitingRecords: number
            awaitingBytes: number
            maxAwaitingRecords: number
            maxAwaitingBytes: number
            operationRecords: number
            operationBytes: number
            residentChatRecords: number
        }
    }
}
const { validateStrippedDatabase } = deltaPackage as {
    validateStrippedDatabase: (
        database: any,
        hasFullChat: (chaId: string, chatId: string) => boolean,
    ) => boolean
}

function makeHarness(kv = new Map<string, Buffer>(), options: Record<string, unknown> = {}) {
    const journal = createChatWriteJournal({
        kvGet: (key: string) => kv.get(key) ?? null,
        kvSet: (key: string, value: Uint8Array) => kv.set(key, Buffer.from(value)),
        kvDel: (key: string) => kv.delete(key),
        kvList: (prefix: string) => [...kv.keys()].filter(key => key.startsWith(prefix)),
        encode: (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8'),
        decode: async (value: Uint8Array) => JSON.parse(Buffer.from(value).toString('utf8')),
        ...options,
    })
    return { journal, kv }
}

function chat(data = 'answer', id = 'chat-new') {
    return {
        id,
        name: 'New chat',
        message: [{ role: 'char', data }],
        localLore: [],
    }
}

function databaseWithChats(chats: any[]) {
    return {
        characters: [{
            chaId: 'char-1',
            chats,
        }],
    }
}

describe('durable chat write journal', () => {
    it('retires only a validated new operation payload and publishes memory cleanup after the durable transaction', async () => {
        const { journal, kv } = makeHarness()
        const payload = chat('new recoverable payload')
        const prepared = await journal.prepareStage('char-1', payload.id, payload,
            { awaitingMetadata: false, commitOperationId: 'operation-g18-retire', retentionVersion: 1 })
        const descriptor = journal.writePreparedStage(prepared)
        journal.publishPreparedStage(prepared)
        const before = Buffer.from(kv.get(descriptor.storageKey)!)
        const retirement = await journal.prepareRetirement('char-1', payload.id,
            { expectedStorageKey: descriptor.storageKey, validate: value => value.chat.message[0].data === 'new recoverable payload' })
        expect(() => journal.publishRetirement(retirement)).toThrow('not committed')
        kv.set(descriptor.storageKey, Buffer.concat([before, Buffer.from(' ')]))
        expect(() => journal.writeRetirement(retirement)).toThrow('changed')
        expect(journal.size()).toBe(1)
        kv.set(descriptor.storageKey, before)
        journal.writeRetirement(retirement)
        expect(kv.has(descriptor.storageKey)).toBe(false)
        expect(journal.size()).toBe(1)
        // Model a surrounding transaction rollback: durable bytes return,
        // and the owner must not publish the failed retirement.
        kv.set(descriptor.storageKey, before)
        expect((await journal.restoreDurableStage('char-1', payload.id,
            { expectedStorageKey: descriptor.storageKey })).chat).toEqual(payload)
        journal.writeRetirement(retirement)
        journal.publishRetirement(retirement)
        expect(journal.size()).toBe(0)
        expect(() => journal.publishRetirement(retirement)).toThrow('not committed')
    })

    it('preserves legacy and ordinary journals even if a caller asks to retire them', async () => {
        const { journal, kv } = makeHarness()
        const payload = chat('legacy payload')
        const prepared = await journal.prepareStage('char-1', payload.id, payload,
            { awaitingMetadata: false, commitOperationId: 'operation-g18-legacy' })
        const descriptor = journal.writePreparedStage(prepared)
        journal.publishPreparedStage(prepared)
        const before = Buffer.from(kv.get(descriptor.storageKey)!)
        await expect(journal.prepareRetirement('char-1', payload.id,
            { expectedStorageKey: descriptor.storageKey })).rejects.toThrow('legacy')
        await journal.stage('char-1', 'ordinary', chat('ordinary', 'ordinary'), { awaitingMetadata: false })
        await expect(journal.prepareRetirement('char-1', 'ordinary', {})).rejects.toThrow('legacy')
        expect(kv.get(descriptor.storageKey)).toEqual(before)
        expect(journal.size()).toBe(2)
    })
    it('keeps operation payloads on disk and returns them on demand without retaining them in the ordinary chat cache', async () => {
        const { journal, kv } = makeHarness()
        const ordinary = chat('ordinary', 'chat-ordinary')
        await journal.stage('char-1', ordinary.id, ordinary, { awaitingMetadata: false })
        const operation = chat('operation payload', 'chat-operation')
        const prepared = await journal.prepareStage('char-1', operation.id, operation,
            { awaitingMetadata: false, commitOperationId: 'operation-g18-journal' })
        const descriptor = journal.writePreparedStage(prepared)
        journal.publishPreparedStage(prepared)
        const stored = Buffer.from(kv.get(descriptor.storageKey)!)
        expect(journal.stats()).toMatchObject({ records: 2, residentChatRecords: 1, operationRecords: 1,
            operationBytes: stored.byteLength, awaitingRecords: 0 })
        const restored = await journal.restoreDurableStage('char-1', operation.id,
            { expectedStorageKey: descriptor.storageKey, validate: value => value.chat.message[0].data === 'operation payload' })
        expect(restored.chat).toEqual(operation)
        expect(journal.stats().residentChatRecords).toBe(1)
        const restarted = makeHarness(kv).journal
        const store = new Map<string, Map<string, any>>()
        await restarted.restoreInto(store)
        expect(store.get('char-1')?.get(ordinary.id)).toEqual(ordinary)
        expect(store.get('char-1')?.has(operation.id)).toBe(false)
        expect(restarted.stats()).toMatchObject({ residentChatRecords: 1, operationRecords: 1 })
        await restarted.clearAfterDatabasePersist(databaseWithChats([{ id: ordinary.id }]))
        expect(kv.get(descriptor.storageKey)).toEqual(stored)
        expect(restarted.stats()).toMatchObject({ records: 1, residentChatRecords: 0, operationRecords: 1 })
    })
    it('splits async preparation, synchronous durable write, and post-commit publication', async () => {
        const { journal, kv } = makeHarness()
        const prepared = await journal.prepareStage(
            'char-1',
            'chat-new',
            chat(),
            { awaitingMetadata: true },
        )

        expect(kv.size).toBe(0)
        expect(journal.size()).toBe(0)
        expect(() => journal.publishPreparedStage(prepared)).toThrow('unwritten')
        expect(journal.describePreparedStage(prepared).storageKey).toMatch(/^internal\/chat-write\/v1\//)

        const write = journal.writePreparedStage(prepared)
        expect(write.storageKey).toMatch(/^internal\/chat-write\/v1\//)
        expect(write.storageBytes).toBeGreaterThan(0)
        expect(kv.size).toBe(1)
        expect(journal.size()).toBe(0)

        journal.publishPreparedStage(prepared)
        expect(journal.size()).toBe(1)
        expect(() => journal.publishPreparedStage(prepared)).toThrow('unknown or already-published')
    })

    it('reuses prepared bytes after a surrounding transaction rolls back', async () => {
        const { journal, kv } = makeHarness()
        const prepared = await journal.prepareStage(
            'char-1',
            'chat-new',
            chat(),
            { awaitingMetadata: true },
        )
        const receipts = new Map<string, string>()
        const runTransaction = (operation: () => void) => {
            const kvBefore = new Map(kv)
            const receiptBefore = new Map(receipts)
            try {
                operation()
            } catch (error) {
                kv.clear()
                for (const [key, value] of kvBefore) kv.set(key, value)
                receipts.clear()
                for (const [key, value] of receiptBefore) receipts.set(key, value)
                throw error
            }
        }

        expect(() => runTransaction(() => {
            journal.writePreparedStage(prepared)
            receipts.set('intent', 'pending')
            throw new Error('owner receipt failed')
        })).toThrow('owner receipt failed')
        expect(kv.size).toBe(0)
        expect(receipts.size).toBe(0)
        expect(journal.size()).toBe(0)

        runTransaction(() => {
            journal.writePreparedStage(prepared)
            receipts.set('intent', 'pending')
            receipts.set('owner', 'server')
        })
        journal.publishPreparedStage(prepared)
        expect(kv.size).toBe(1)
        expect(receipts).toEqual(new Map([
            ['intent', 'pending'],
            ['owner', 'server'],
        ]))
        expect(journal.size()).toBe(1)
    })

    it('rejects a prepared stage superseded before its durable write', async () => {
        const { journal } = makeHarness()
        const stale = await journal.prepareStage(
            'char-1',
            'chat-new',
            chat('first'),
            { awaitingMetadata: false },
        )
        await journal.stage('char-1', 'chat-new', chat('newer'), {
            awaitingMetadata: false,
        })

        expect(() => journal.writePreparedStage(stale)).toThrow('stale prepared')
    })

    it('rehydrates one transaction-committed record for post-commit recovery', async () => {
        const first = makeHarness()
        const prepared = await first.journal.prepareStage(
            'char-1',
            'chat-new',
            chat('committed'),
            { awaitingMetadata: true },
        )
        first.journal.writePreparedStage(prepared)
        expect(first.journal.size()).toBe(0)

        const restarted = makeHarness(first.kv).journal
        const restored = await restarted.restoreDurableStage('char-1', 'chat-new')
        expect(restored).toMatchObject({
            chaId: 'char-1',
            chatId: 'chat-new',
            awaitingMetadata: true,
            chat: chat('committed'),
        })
        expect(restarted.size()).toBe(1)
        expect(await restarted.restoreDurableStage('char-1', 'missing')).toBeNull()

        const rejected = makeHarness(first.kv).journal
        await expect(rejected.restoreDurableStage('char-1', 'chat-new', {
            validate: () => false,
        })).rejects.toThrow('rejected by its commit receipt')
        expect(rejected.size()).toBe(0)
    })

    it('keeps operation-scoped commit records distinct and out of ordinary replay cleanup', async () => {
        const first = makeHarness()
        const writes = []
        for (const [operationId, data] of [
            ['operation-journal-1', 'first'],
            ['operation-journal-2', 'second'],
        ]) {
            const prepared = await first.journal.prepareStage(
                'char-1',
                'chat-new',
                chat(data),
                { awaitingMetadata: false, commitOperationId: operationId },
            )
            writes.push(first.journal.writePreparedStage(prepared))
            first.journal.publishPreparedStage(prepared)
        }
        expect(first.kv.size).toBe(2)
        expect(first.journal.size()).toBe(2)
        expect(writes[0].storageKey).not.toBe(writes[1].storageKey)

        const ordinaryRestore = new Map<string, Map<string, any>>()
        await first.journal.restoreInto(ordinaryRestore)
        expect(ordinaryRestore.size).toBe(0)
        await first.journal.clearAfterDatabasePersist(databaseWithChats([
            { id: 'chat-new', name: 'New chat', _stub: true },
        ]))
        expect(first.kv.size).toBe(2)

        const restarted = makeHarness(first.kv).journal
        const firstRecord = await restarted.restoreDurableStage('char-1', 'chat-new', {
            expectedStorageKey: writes[0].storageKey,
        })
        const secondRecord = await restarted.restoreDurableStage('char-1', 'chat-new', {
            expectedStorageKey: writes[1].storageKey,
        })
        expect(firstRecord.chat).toEqual(chat('first'))
        expect(secondRecord.chat).toEqual(chat('second'))
    })

    it('commits snapshot swap and journal discard as one failure-atomic transition', () => {
        const values = new Map<string, string>([
            ['database', 'current'],
            ['journal', 'acknowledged'],
            ['commit', 'receipt'],
        ])
        const runTransaction = (operation: () => void) => {
            const before = new Map(values)
            try { operation() }
            catch (error) {
                values.clear()
                for (const [key, value] of before) values.set(key, value)
                throw error
            }
        }
        let resets = 0

        expect(() => commitSnapshotRestore({
            runTransaction,
            restoreDatabase: () => values.set('database', 'selected'),
            discardJournal: () => { throw new Error('journal delete failed') },
            resetJournalMemory: () => { resets += 1 },
        })).toThrow('journal delete failed')
        expect(values).toEqual(new Map([
            ['database', 'current'],
            ['journal', 'acknowledged'],
            ['commit', 'receipt'],
        ]))
        expect(resets).toBe(0)

        expect(() => commitSnapshotRestore({
            runTransaction,
            restoreDatabase: () => values.set('database', 'selected'),
            discardJournal: () => { values.delete('journal') },
            discardCommitRecovery: () => { throw new Error('commit recovery delete failed') },
            resetJournalMemory: () => { resets += 1 },
        })).toThrow('commit recovery delete failed')
        expect(values).toEqual(new Map([
            ['database', 'current'],
            ['journal', 'acknowledged'],
            ['commit', 'receipt'],
        ]))
        expect(resets).toBe(0)

        commitSnapshotRestore({
            runTransaction,
            restoreDatabase: () => values.set('database', 'selected'),
            discardJournal: () => { values.delete('journal') },
            discardCommitRecovery: () => { values.delete('commit') },
            resetJournalMemory: () => { resets += 1 },
        })
        expect(values).toEqual(new Map([['database', 'selected']]))
        expect(resets).toBe(1)
    })

    it('preserves an ACKed new chat across a stub-less flush and process restart', async () => {
        const { journal, kv } = makeHarness()
        await journal.stage('char-1', 'chat-new', chat(), { awaitingMetadata: true })

        // The 5-second DB flush still has the old stripped DB. It must not
        // retire the only durable copy of the newly-created chat.
        await journal.clearAfterDatabasePersist(databaseWithChats([]))
        expect(journal.size()).toBe(1)
        expect(kv.size).toBe(1)

        // Simulate a process restart after that flush.
        const restarted = makeHarness(kv).journal
        const restoredStore = new Map<string, Map<string, any>>()
        await restarted.restoreInto(restoredStore)
        expect(restoredStore.get('char-1')?.get('chat-new')).toEqual(chat())

        // The later database patch can now add the stub: invariant validation
        // sees the replayed payload instead of rejecting it as an orphan.
        const withStub = databaseWithChats([
            { id: 'chat-new', name: 'New chat', _stub: true },
        ])
        expect(validateStrippedDatabase(
            withStub,
            (chaId, chatId) => !!restoredStore.get(chaId)?.get(chatId),
        )).toBe(true)

        await restarted.clearAfterDatabasePersist(withStub)
        expect(restarted.size()).toBe(0)
        expect(kv.size).toBe(0)
    })

    it('keeps awaiting-metadata state across repeated writes to the new chat', async () => {
        const { journal } = makeHarness()
        await journal.stage('char-1', 'chat-new', chat('first'), { awaitingMetadata: true })
        await journal.stage('char-1', 'chat-new', chat('second'), { awaitingMetadata: false })

        expect(await journal.isAwaitingMetadata('char-1', 'chat-new')).toBe(true)
        const restoredStore = new Map<string, Map<string, any>>()
        await journal.restoreInto(restoredStore)
        expect(restoredStore.get('char-1')?.get('chat-new')?.message[0].data).toBe('second')
    })

    it('clears an existing-chat write after a durable DB persist even when deletion wins', async () => {
        const { journal, kv } = makeHarness()
        await journal.stage('char-1', 'chat-new', chat('updated'), { awaitingMetadata: false })

        // A concurrent metadata save intentionally deleted this existing chat.
        // Its old journal must not resurrect it on a later ID reuse.
        await journal.clearAfterDatabasePersist(databaseWithChats([]))
        expect(journal.size()).toBe(0)
        expect(kv.size).toBe(0)
    })

    it('replays the acknowledged journal value over an older database value', async () => {
        const { journal } = makeHarness()
        await journal.stage('char-1', 'chat-new', chat('newer'), { awaitingMetadata: false })
        const store = new Map([
            ['char-1', new Map([['chat-new', chat('older')]])],
        ])

        await journal.restoreInto(store)
        expect(store.get('char-1')?.get('chat-new')?.message[0].data).toBe('newer')
    })

    it('bounds awaiting-metadata growth without deleting recoverable payloads', async () => {
        const pressure: any[] = []
        const { journal, kv } = makeHarness(new Map(), {
            maxAwaitingRecords: 3,
            maxAwaitingBytes: 1024 * 1024,
            onPressure: (stats: any) => pressure.push(stats),
        })
        for (let index = 0; index < 3; index += 1) {
            const id = `chat-${index}`
            await journal.stage('char-1', id, chat(`answer-${index}`, id), {
                awaitingMetadata: true,
            })
        }

        await expect(journal.stage(
            'char-1',
            'chat-overflow',
            chat('must-not-be-acked', 'chat-overflow'),
            { awaitingMetadata: true },
        )).rejects.toMatchObject({ code: 'CHAT_JOURNAL_CAPACITY' })

        expect(journal.stats().awaitingRecords).toBe(3)
        expect(kv.size).toBe(3)
        expect(pressure).toHaveLength(1)
        const restored = new Map<string, Map<string, any>>()
        await makeHarness(kv).journal.restoreInto(restored)
        expect([...restored.get('char-1')!.keys()]).toEqual([
            'chat-0',
            'chat-1',
            'chat-2',
        ])
    })

    it('does not apply orphan capacity to existing-chat WAL records', async () => {
        const { journal } = makeHarness(new Map(), {
            maxAwaitingRecords: 0,
            maxAwaitingBytes: 0,
        })
        for (let index = 0; index < 4; index += 1) {
            const id = `existing-${index}`
            await journal.stage('char-1', id, chat(`answer-${index}`, id), {
                awaitingMetadata: false,
            })
        }
        expect(journal.stats()).toMatchObject({
            records: 4,
            awaitingRecords: 0,
            awaitingBytes: 0,
        })
    })

    it('rejects an awaiting-metadata ACK before exceeding byte capacity', async () => {
        const { journal, kv } = makeHarness(new Map(), {
            maxAwaitingRecords: 10,
            maxAwaitingBytes: 1,
        })
        await expect(journal.stage(
            'char-1',
            'chat-new',
            chat(),
            { awaitingMetadata: true },
        )).rejects.toMatchObject({ code: 'CHAT_JOURNAL_CAPACITY' })
        expect(journal.size()).toBe(0)
        expect(kv.size).toBe(0)
    })

    it('reports retained awaiting-metadata backlog after a restart', async () => {
        const first = makeHarness()
        await first.journal.stage('char-1', 'chat-new', chat(), {
            awaitingMetadata: true,
        })
        const backlog: any[] = []
        const restarted = makeHarness(first.kv, {
            onBacklog: (stats: any) => backlog.push(stats),
        }).journal
        await restarted.restoreInto(new Map())
        expect(backlog).toHaveLength(1)
        expect(backlog[0]).toMatchObject({ awaitingRecords: 1 })
    })
})
