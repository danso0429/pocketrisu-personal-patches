import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import inputPackage from './serverChatInputOwner.cjs'
import journalPackage from './chatWriteJournal.cjs'
import operationPackage from './bgOrchestrationOperationStore.cjs'
import utilsPackage from './utils.cjs'

const {
    SERVER_CHAT_INPUT_COMMAND_PREFIX,
    commandKey,
    createServerChatInputOwner,
} = inputPackage as any
const { createChatWriteJournal } = journalPackage as any
const { operationResultKey, operationStateKey } = operationPackage as any
const { decodeRisuSave, encodeRisuSaveLegacy } = utilsPackage as any

const cleanup: Array<() => void> = []
afterEach(() => {
    while (cleanup.length > 0) cleanup.pop()?.()
})

function revision(chat: unknown): string {
    return crypto.createHash('sha256').update(Buffer.from(encodeRisuSaveLegacy(chat))).digest('hex')
}

function baseChat() {
    return {
        id: 'chat-1',
        name: 'Chat',
        message: [{ role: 'char', data: 'prior', chatId: 'assistant-prior' }],
        localLore: [],
    }
}

function admission(operationId: string, rawText = 'hello') {
    return {
        operationId,
        inputCommandId: `input-${operationId}`,
        userMessageId: `user-${operationId}`,
        charId: 'char-1',
        chatId: 'chat-1',
        rawText,
        submittedBaseRevision: revision(baseChat()),
        settingsSnapshotRef: 'pocketrisu-server-runtime-v1',
        submittedAt: 1_700_000_000_000,
    }
}

function makeHarness() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'server-chat-input-c3-'))
    const db = new Database(path.join(root, 'input.sqlite'))
    db.pragma('journal_mode = WAL')
    db.exec('CREATE TABLE kv (key TEXT PRIMARY KEY, value BLOB NOT NULL, updated_at INTEGER NOT NULL)')
    const get = db.prepare('SELECT value FROM kv WHERE key = ?')
    const set = db.prepare(`
        INSERT INTO kv(key, value, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `)
    const del = db.prepare('DELETE FROM kv WHERE key = ?')
    const list = db.prepare('SELECT key FROM kv WHERE key LIKE ? ORDER BY key')
    const delPrefix = db.prepare("DELETE FROM kv WHERE key LIKE ? ESCAPE '\\'")
    const kvGet = (key: string) => (
        get.get(key) as { value?: string | Buffer } | undefined
    )?.value ?? null
    let writeFailureAt = 0
    let writes = 0
    const kvSet = (key: string, value: string | Buffer | Uint8Array) => {
        writes += 1
        if (writeFailureAt > 0 && writes === writeFailureAt) {
            throw new Error('injected-input-write-failure')
        }
        set.run(key, typeof value === 'string' ? value : Buffer.from(value), Date.now())
    }
    const kvDel = (key: string) => del.run(key)
    const escaped = (prefix: string) => `${prefix.replace(/[\\%_]/g, '\\$&')}%`
    const kvList = (prefix: string) => (
        list.all(escaped(prefix)) as Array<{ key: string }>
    ).map(row => row.key)
    const kvDelPrefix = (prefix: string) => delPrefix.run(escaped(prefix))
    const runtime = {
        database: {
            characters: [{
                chaId: 'char-1',
                chats: [{ id: 'chat-1', name: 'Chat', _stub: true }],
            }],
            globalChatVariables: { mood: 'old' },
        } as any,
        fullStore: new Map([['char-1', new Map([['chat-1', baseChat()]])]]),
        schedules: 0,
        cacheFailures: 0,
    }
    let queue = Promise.resolve<unknown>(undefined)
    const queueStorageOperation = <T>(operation: () => T | Promise<T>): Promise<T> => {
        const run = queue.then(operation, operation)
        queue = run.catch(() => undefined)
        return run
    }
    const makeJournal = () => createChatWriteJournal({
        kvGet,
        kvSet,
        kvDel,
        kvList,
        encode: encodeRisuSaveLegacy,
        decode: decodeRisuSave,
    })
    const makeOwner = (journal = makeJournal()) => createServerChatInputOwner({
        chatWriteJournal: journal,
        kvGet,
        kvSet,
        kvDel,
        kvDelPrefix,
        kvList,
        sqliteDb: db,
        queueStorageOperation,
        chatRevision: revision,
        ensureCanonicalState: async () => {},
        getDbCache: () => ({ database: runtime.database }),
        getFullChatStore: () => runtime.fullStore,
        databaseKey: 'database',
        cacheStrippedDatabase: (database: any) => {
            if (runtime.cacheFailures > 0) {
                runtime.cacheFailures -= 1
                throw new Error('injected-input-publication-failure')
            }
            runtime.database = database
        },
        scheduleChatStorePersist: () => { runtime.schedules += 1 },
    })
    const transformed = (operationId: string, rawText = 'hello') => ({
        chat: {
            ...baseChat(),
            message: [
                ...baseChat().message,
                {
                    role: 'user',
                    data: rawText,
                    chatId: `user-${operationId}`,
                    time: 1_700_000_000_000,
                    name: null,
                },
            ],
        },
        globalIntent: {
            changed: { mood: 'input' },
            deleted: [],
            expected: { mood: { present: true, value: 'old' } },
        },
    })
    cleanup.push(() => {
        db.close()
        fs.rmSync(root, { recursive: true, force: true })
    })
    return {
        db,
        runtime,
        kvGet,
        kvSet,
        kvList,
        makeJournal,
        makeOwner,
        transformed,
        failWriteAt(value: number) { writes = 0; writeFailureAt = value },
    }
}

describe('pre-canonical server chat input owner', () => {
    it('admits one immutable command without changing canonical chat', async () => {
        const harness = makeHarness()
        const owner = harness.makeOwner()
        const operationId = 'operation-input-admit-1'
        const before = structuredClone(harness.runtime.fullStore.get('char-1')?.get('chat-1'))
        const first = await owner.admit(admission(operationId))
        expect(first).toMatchObject({
            status: 'admitted',
            reused: false,
            record: {
                admissionSeq: 1,
                queuePredecessorId: null,
                transformState: 'not_run',
                inputState: 'queued',
            },
        })
        expect(harness.runtime.fullStore.get('char-1')?.get('chat-1')).toEqual(before)
        expect(JSON.parse(harness.kvGet(operationStateKey(operationId)).toString('utf8')))
            .toMatchObject({ state: 'queued', serverChatCommitVersion: 1 })

        await expect(owner.admit(admission(operationId))).resolves.toMatchObject({
            status: 'admitted', reused: true, record: { admissionSeq: 1 },
        })
        await expect(owner.admit(admission(operationId, 'changed'))).resolves.toMatchObject({
            status: 'conflict', reason: 'operation_fingerprint_conflict',
        })
        await expect(owner.admit(admission('operation-input-admit-2'))).resolves.toMatchObject({
            status: 'conflict', reason: 'chat_input_busy', blockingOperationId: operationId,
        })
    })

    it('runs the transform once, attaches one identified input, and exposes its receipt', async () => {
        const harness = makeHarness()
        const owner = harness.makeOwner()
        const operationId = 'operation-input-attach-1'
        await owner.admit(admission(operationId))
        await expect(owner.beginTransform(operationId)).resolves.toMatchObject({
            status: 'started', record: { transformState: 'running' },
        })
        const attached = await owner.attachTransformed(operationId, harness.transformed(operationId))
        expect(attached).toMatchObject({
            status: 'attached',
            reused: false,
            publication: 'published',
            record: {
                transformState: 'completed',
                inputState: 'attached',
                inputReceipt: {
                    contractVersion: 'bg_server_input_receipt.v1',
                    inputCommandId: `input-${operationId}`,
                    messageId: `user-${operationId}`,
                    hostChangeSeq: 1,
                },
            },
        })
        expect(harness.runtime.fullStore.get('char-1')?.get('chat-1')?.message.at(-1))
            .toMatchObject({ role: 'user', data: 'hello', chatId: `user-${operationId}` })
        expect(harness.runtime.database.globalChatVariables).toEqual({ mood: 'input' })
        expect(harness.runtime.schedules).toBe(1)
        await expect(owner.loadExecution(operationId)).resolves.toMatchObject({
            status: 'attached',
            record: { executionBaseRevision: attached.record.executionBaseRevision },
        })
        expect(owner.pendingProjection('char-1', 'chat-1')).toEqual([])
    })

    it('settles a completed input and assigns the next admission its predecessor', async () => {
        const harness = makeHarness()
        const owner = harness.makeOwner()
        const firstOperation = 'operation-input-sequence-1'
        await owner.admit(admission(firstOperation))
        await owner.beginTransform(firstOperation)
        const attached = await owner.attachTransformed(firstOperation, harness.transformed(firstOperation))
        expect(owner.settleSynchronously(
            firstOperation,
            'completed',
            attached.record.executionBaseRevision,
        )).toBe(true)

        const secondOperation = 'operation-input-sequence-2'
        const secondAdmission = {
            ...admission(secondOperation),
            submittedBaseRevision: attached.record.executionBaseRevision,
        }
        await expect(owner.admit(secondAdmission)).resolves.toMatchObject({
            status: 'admitted',
            record: { admissionSeq: 2, queuePredecessorId: firstOperation },
        })
    })

    it('recovers an attached input after publication failure without rerunning transform', async () => {
        const harness = makeHarness()
        const owner = harness.makeOwner()
        const operationId = 'operation-input-recover-1'
        await owner.admit(admission(operationId))
        await owner.beginTransform(operationId)
        harness.runtime.cacheFailures = 1
        await expect(owner.attachTransformed(
            operationId,
            harness.transformed(operationId),
        )).resolves.toMatchObject({ status: 'attached', publication: 'pending_recovery' })
        expect(harness.runtime.fullStore.get('char-1')?.get('chat-1')).toEqual(baseChat())

        await expect(harness.makeOwner(harness.makeJournal()).recoverAll()).resolves.toMatchObject([{
            operationId,
            status: 'attached',
        }])
        expect(harness.runtime.fullStore.get('char-1')?.get('chat-1')?.message.at(-1))
            .toMatchObject({ chatId: `user-${operationId}` })
    })

    it('rolls back every attach write while retaining the owned transform state', async () => {
        for (const failureAt of [1, 2, 3]) {
            const harness = makeHarness()
            const owner = harness.makeOwner()
            const operationId = `operation-input-rollback-${failureAt}`
            await owner.admit(admission(operationId))
            await owner.beginTransform(operationId)
            harness.failWriteAt(failureAt)

            await expect(owner.attachTransformed(
                operationId,
                harness.transformed(operationId),
            )).rejects.toThrow('injected-input-write-failure')
            expect(owner.read(operationId)).toMatchObject({
                transformState: 'running',
                inputState: 'queued',
                inputReceipt: null,
            })
            expect(harness.kvList('internal/chat-write/v1/')).toEqual([])
            expect(harness.runtime.fullStore.get('char-1')?.get('chat-1')).toEqual(baseChat())
            expect(harness.runtime.database.globalChatVariables).toEqual({ mood: 'old' })
        }
    })

    it('turns an interrupted transform into unknown instead of running it twice', async () => {
        const harness = makeHarness()
        const owner = harness.makeOwner()
        const operationId = 'operation-input-unknown-1'
        await owner.admit(admission(operationId))
        await owner.beginTransform(operationId)

        await expect(harness.makeOwner().recoverAll()).resolves.toMatchObject([{
            operationId,
            status: 'blocked',
            reason: 'transform_outcome_unknown',
        }])
        await expect(harness.makeOwner().loadExecution(operationId)).resolves.toMatchObject({
            status: 'blocked',
            reason: 'transform_outcome_unknown',
        })
        expect(harness.makeOwner().pendingProjection('char-1', 'chat-1')).toMatchObject([{
            operationId,
            rawText: 'hello',
            cancelAllowed: true,
            state: 'blocked_edit',
        }])
    })

    it('rolls back admission writes and clears linked lifecycle rows on replacement', async () => {
        const failureHarness = makeHarness()
        failureHarness.failWriteAt(2)
        await expect(failureHarness.makeOwner().admit(
            admission('operation-input-failure-1'),
        )).rejects.toThrow('injected-input-write-failure')
        expect(failureHarness.kvList(SERVER_CHAT_INPUT_COMMAND_PREFIX)).toEqual([])

        const harness = makeHarness()
        const owner = harness.makeOwner()
        const operationId = 'operation-input-discard-1'
        await owner.admit(admission(operationId))
        harness.kvSet(operationResultKey(operationId), JSON.stringify({ operationId }))
        owner.discardRecovery()
        expect(harness.kvGet(commandKey(operationId))).toBeNull()
        expect(harness.kvGet(operationStateKey(operationId))).toBeNull()
        expect(harness.kvGet(operationResultKey(operationId))).toBeNull()
    })
})
