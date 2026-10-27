import { describe, expect, test, vi } from 'vitest'
import fs from 'node:fs'

async function optionalImport<T>(path: string): Promise<T | null> {
    try {
        return await import(/* @vite-ignore */ path) as T
    } catch {
        return null
    }
}

const chat = (data: string) => ({ id: 'chat-1', message: [{ role: 'user', data }] })

function makeJournal(createChatWriteJournal: any, kv = new Map<string, Buffer>()) {
    return createChatWriteJournal({
        kvGet: (key: string) => kv.get(key) ?? null,
        kvSet: (key: string, value: Uint8Array) => kv.set(key, Buffer.from(value)),
        kvDel: (key: string) => kv.delete(key),
        kvList: (prefix: string) => [...kv.keys()].filter(key => key.startsWith(prefix)),
        encode: (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8'),
        decode: async (value: Uint8Array) => JSON.parse(Buffer.from(value).toString('utf8')),
    })
}

describe('[E2-3b] Rebuild server chat-write durability over native 1.16.1', () => {
    test('[new] b1 an acknowledged journal write replays after a fresh owner starts', async () => {
        const subject = await optionalImport<any>('./chatWriteJournal.cjs')
        expect(subject, 'chatWriteJournal owned module exists').not.toBeNull()

        const kv = new Map<string, Buffer>()
        const beforeCrash = makeJournal(subject!.createChatWriteJournal, kv)
        await beforeCrash.stage('cha-1', 'chat-1', chat('acknowledged'), { awaitingMetadata: false })

        const afterRestart = makeJournal(subject!.createChatWriteJournal, kv)
        const store = new Map([['cha-1', new Map([['chat-1', chat('old disk value')]])]])
        await afterRestart.restoreInto(store)
        expect(store.get('cha-1')?.get('chat-1')).toEqual(chat('acknowledged'))
    })

    test('[new] b2 persistence of A cannot retire a newer interleaved B journal record', async () => {
        const subject = await optionalImport<any>('./chatWriteJournal.cjs')
        expect(subject, 'chatWriteJournal owned module exists').not.toBeNull()

        const kv = new Map<string, Buffer>()
        const journal = makeJournal(subject!.createChatWriteJournal, kv)
        await journal.stage('cha-1', 'chat-1', chat('A'), { awaitingMetadata: false })
        const persistSnapshot = { characters: [{ chaId: 'cha-1', chats: [{ id: 'chat-1', _stub: true }] }] }
        await journal.stage('cha-1', 'chat-1', chat('B'), { awaitingMetadata: false })
        await journal.clearAfterDatabasePersist(persistSnapshot, chat('A'))

        const restarted = makeJournal(subject!.createChatWriteJournal, kv)
        const store = new Map([['cha-1', new Map([['chat-1', chat('A')]])]])
        await restarted.restoreInto(store)
        expect(store.get('cha-1')?.get('chat-1')).toEqual(chat('B'))
    })

    test('[new] b5 snapshot replacement discards durable journal rows in the same transaction', async () => {
        const subject = await optionalImport<any>('./chatWriteJournal.cjs')
        expect(subject, 'chatWriteJournal owned module exists').not.toBeNull()

        const events: string[] = []
        subject!.commitSnapshotRestore({
            runTransaction: (operation: () => void) => { events.push('begin'); operation(); events.push('commit') },
            restoreDatabase: () => events.push('database'),
            discardJournal: () => events.push('journal'),
            resetJournalMemory: () => events.push('memory'),
        })
        expect(events).toEqual(['begin', 'database', 'journal', 'commit', 'memory'])
    })

    test('[new] b7 reset preparation gives a server-created fallback chat fmIndex', async () => {
        const subject = await optionalImport<any>('./storageResetPrepare.cjs')
        expect(subject, 'storageResetPrepare owned module exists').not.toBeNull()
        const utils = await import('./utils.cjs')
        const codec = (utils as any).default ?? utils
        const rawDatabase = Buffer.from(codec.encodeRisuSaveLegacy({
            characters: [{
                name: 'Unavailable character',
                chaId: 'cold-char',
                coldstorage: 'missing-key',
                chats: [],
            }],
        }))
        const prepared = await (subject as any)!.prepareRestoredDatabase({
            rawDatabase,
            readEntry: vi.fn(() => null),
        }, {
            decodeRisuSave: codec.decodeRisuSave,
            normalizeJSON: (value: unknown) => value,
            encodeRisuSaveLegacy: codec.encodeRisuSaveLegacy,
            randomUUID: () => 'reset-default-chat',
            computeBufferEtag: vi.fn(() => 'etag'),
        })
        expect(prepared.database.characters[0].chats).toEqual([
            expect.objectContaining({ id: 'reset-default-chat', fmIndex: -1 }),
        ])
    })

    test('[new] BG contract modules expose the journal and server commit owners', async () => {
        const journal = await optionalImport<any>('./chatWriteJournal.cjs')
        expect(journal, 'chatWriteJournal owned module exists').not.toBeNull()
        expect(typeof journal!.createChatWriteJournal).toBe('function')
        const commit = await optionalImport<any>('./serverChatCommit.cjs')
        expect(commit, 'serverChatCommit owned module exists').not.toBeNull()
        expect(typeof commit!.createServerChatCommitter).toBe('function')
    })

    test('[unchanged] native decodeDatabaseWithPersistentChatIds remains available to the BG adapter', () => {
        const source = fs.readFileSync('server/node/server.cjs', 'utf8')
        expect(source).toMatch(/\bdecodeDatabaseWithPersistentChatIds\b/)
    })
})
