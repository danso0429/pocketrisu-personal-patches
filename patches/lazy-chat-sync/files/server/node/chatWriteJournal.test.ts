import { describe, expect, it } from 'vitest'
import journalPackage from './chatWriteJournal.cjs'
import deltaPackage from './chatDelta.cjs'

const { commitSnapshotRestore, createChatWriteJournal } = journalPackage as {
    commitSnapshotRestore: (options: {
        runTransaction: (operation: () => void) => void
        restoreDatabase: () => void
        discardJournal: () => void
        resetJournalMemory: () => void
    }) => void
    createChatWriteJournal: (options: any) => {
        prefix: string
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
    it('commits snapshot swap and journal discard as one failure-atomic transition', () => {
        const values = new Map<string, string>([
            ['database', 'current'],
            ['journal', 'acknowledged'],
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
        ]))
        expect(resets).toBe(0)

        commitSnapshotRestore({
            runTransaction,
            restoreDatabase: () => values.set('database', 'selected'),
            discardJournal: () => { values.delete('journal') },
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
