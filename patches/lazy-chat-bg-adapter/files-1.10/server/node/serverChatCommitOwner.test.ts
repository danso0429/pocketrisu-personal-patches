import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import commitPackage from './serverChatCommit.cjs'
import journalPackage from './chatWriteJournal.cjs'
import operationPackage from './bgOrchestrationOperationStore.cjs'
import ownerPackage from './serverChatCommitOwner.cjs'
import utilsPackage from './utils.cjs'

const { commitStorageKey, stableJSON } = commitPackage as any
const { createChatWriteJournal } = journalPackage as any
const { operationStateKey } = operationPackage as any
const {
    SERVER_CHAT_COMMIT_APPLIED_FIELD,
    SERVER_CHAT_COMMIT_SEQUENCE_KEY,
    createServerChatCommitOwner,
} = ownerPackage as any
const { decodeRisuSave, encodeRisuSaveLegacy } = utilsPackage as any

const cleanup: Array<() => void> = []

afterEach(() => {
    while (cleanup.length > 0) cleanup.pop()?.()
})

function revision(chat: unknown): string {
    return crypto.createHash('sha256').update(Buffer.from(encodeRisuSaveLegacy(chat))).digest('hex')
}

function digest(value: unknown): string {
    return crypto.createHash('sha256').update(stableJSON(value)).digest('hex')
}

function baseChat() {
    return {
        id: 'chat-1',
        name: 'Synthetic chat',
        message: [{ role: 'user', data: 'hello', chatId: 'user-1' }],
        localLore: [],
        modules: [],
    }
}

function withAnswer(chat: any, data: string, id: string) {
    return {
        ...structuredClone(chat),
        message: [
            ...structuredClone(chat.message),
            { role: 'char', data, chatId: id },
        ],
    }
}

function result(chat: any, from: string, to: string) {
    return {
        chat,
        staticsMessagesDelta: 1,
        globalChatVariables: { mood: to },
        globalChatVariablesDeleted: [],
        globalChatVariablesExpected: {
            mood: { present: true, value: from },
        },
        threw: null,
    }
}

function makeHarness() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'server-chat-owner-c2-'))
    const db = new Database(path.join(root, 'owner.sqlite'))
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
    const kvSet = (key: string, value: string | Buffer | Uint8Array) => {
        set.run(key, typeof value === 'string' ? value : Buffer.from(value), Date.now())
    }
    const kvDel = (key: string) => del.run(key)
    const escapedPrefix = (prefix: string) => `${prefix.replace(/[\\%_]/g, '\\$&')}%`
    const kvList = (prefix: string) => (
        list.all(escapedPrefix(prefix)) as Array<{ key: string }>
    ).map(row => row.key)
    const kvDelPrefix = (prefix: string) => delPrefix.run(escapedPrefix(prefix))
    const databaseKey = 'database-key'
    const runtime = {
        database: {
            characters: [{
                chaId: 'char-1',
                chats: [{ id: 'chat-1', name: 'Synthetic chat', _stub: true, modules: [] }],
            }],
            globalChatVariables: { mood: 'old' },
            statics: { messages: 10 },
        } as any,
        fullStore: new Map([['char-1', new Map([['chat-1', baseChat()]])]]),
        schedules: 0,
        ensures: 0,
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
    const makeOwner = (journal = makeJournal()) => createServerChatCommitOwner({
        chatWriteJournal: journal,
        kvGet,
        kvSet,
        kvDel,
        kvDelPrefix,
        kvList,
        sqliteDb: db,
        queueStorageOperation,
        chatRevision: revision,
        ensureCanonicalState: async () => { runtime.ensures += 1 },
        getDbCache: () => ({ [databaseKey]: runtime.database }),
        getFullChatStore: () => runtime.fullStore,
        databaseKey,
        cacheStrippedDatabase: (database: any) => {
            if (runtime.cacheFailures > 0) {
                runtime.cacheFailures -= 1
                throw new Error('injected-cache-publication-failure')
            }
            runtime.database = database
        },
        scheduleChatStorePersist: () => { runtime.schedules += 1 },
    })
    const primeOperation = (
        operationId: string,
        chatId = 'chat-1',
        state = 'result-ready',
    ) => {
        kvSet(operationStateKey(operationId), JSON.stringify({
            operationId,
            charId: 'char-1',
            chatId,
            state,
        }))
    }
    const commitInput = (
        operationId: string,
        commitResult: any,
        baselineMessageCount: number,
        baseChatRevision: string,
    ) => ({
        operationId,
        resultId: `result-${operationId}`,
        publishSeq: 2,
        charId: 'char-1',
        chatId: 'chat-1',
        baseChatRevision,
        baselineMessageCount,
        settingsDigest: digest({ operationId, settings: 'actual-server-input' }),
        result: commitResult,
        committedAt: '2026-09-14T01:02:03.000Z',
    })
    cleanup.push(() => {
        db.close()
        fs.rmSync(root, { recursive: true, force: true })
    })
    return {
        db,
        runtime,
        kvGet,
        kvList,
        makeJournal,
        makeOwner,
        primeOperation,
        commitInput,
    }
}

describe('server-owned BG chat commit', () => {
    it('keeps ordinary startup lazy when no commit recovery row exists', async () => {
        const harness = makeHarness()
        await expect(harness.makeOwner().recoverAll()).resolves.toEqual([])
        expect(harness.runtime.ensures).toBe(0)
    })

    it('commits chat, metadata, globals, stats, and owner state without a browser save', async () => {
        const harness = makeHarness()
        const owner = harness.makeOwner()
        const operationId = 'operation-c2-owner-1'
        const before = baseChat()
        const after = withAnswer(before, 'answer one', 'assistant-1')
        harness.primeOperation(operationId, 'chat-1', 'running-result-consumed')

        await expect(owner.captureBase('char-1', 'chat-1', before)).resolves.toMatchObject({
            revision: revision(before),
            matches: true,
        })
        await expect(owner.captureBase(
            'char-1',
            'chat-1',
            { ...before, note: 'stale submission' },
        )).resolves.toMatchObject({ matches: false })

        const committed = await owner.commitGenerationResult(
            harness.commitInput(operationId, result(after, 'old', 'new'), 1, revision(before)),
        )
        expect(committed).toMatchObject({
            status: 'committed',
            reused: false,
            receipt: {
                contractVersion: 'bg_server_chat_commit.v1',
                chatCommitted: true,
                acOwner: 'disabled',
                acState: 'disabled',
                readyForNextTurn: true,
            },
        })
        expect(harness.runtime.fullStore.get('char-1')?.get('chat-1')).toEqual(after)
        expect(harness.runtime.database.characters[0].chats[0]).toEqual({
            id: 'chat-1', name: 'Synthetic chat', _stub: true, modules: [],
        })
        expect(harness.runtime.database.globalChatVariables).toEqual({ mood: 'new' })
        expect(harness.runtime.database.statics.messages).toBe(11)
        expect(harness.runtime.database[SERVER_CHAT_COMMIT_APPLIED_FIELD]).toHaveLength(1)
        expect(JSON.parse(harness.kvGet(operationStateKey(operationId)).toString('utf8')))
            .toMatchObject({ state: 'chat-committed', commitSequence: 1 })
        expect(JSON.parse(harness.kvGet(SERVER_CHAT_COMMIT_SEQUENCE_KEY).toString('utf8')))
            .toEqual({ version: 1, value: 1 })
        expect(harness.kvGet(commitStorageKey(operationId))).not.toBeNull()

        const replay = await owner.commitGenerationResult(
            harness.commitInput(operationId, result(after, 'old', 'new'), 1, revision(before)),
        )
        expect(replay).toMatchObject({ status: 'committed', reused: true })
        expect(harness.runtime.database.statics.messages).toBe(11)
        expect(JSON.parse(harness.kvGet(SERVER_CHAT_COMMIT_SEQUENCE_KEY).toString('utf8')).value)
            .toBe(1)
    })

    it('records a per-key conflict and preserves the newer canonical global value', async () => {
        const harness = makeHarness()
        const operationId = 'operation-c2-owner-2'
        const before = baseChat()
        const after = withAnswer(before, 'answer conflict', 'assistant-2')
        harness.runtime.database.globalChatVariables.mood = 'newer-user-value'
        harness.primeOperation(operationId)

        const committed = await harness.makeOwner().commitGenerationResult(
            harness.commitInput(operationId, result(after, 'old', 'generated-value'), 1, revision(before)),
        )
        expect(committed.receipt.effects.globals.status).toBe('conflict')
        expect(harness.runtime.database.globalChatVariables.mood).toBe('newer-user-value')
        expect(harness.runtime.database.bgOrchestrationGlobalConflicts).toMatchObject([{
            operationId,
            conflicts: [{
                key: 'mood',
                action: 'set',
                serverValue: 'generated-value',
            }],
        }])
    })

    it('recovers a cache publication failure without a second commit or stat increment', async () => {
        const harness = makeHarness()
        const owner = harness.makeOwner()
        const operationId = 'operation-c2-publish-1'
        const before = baseChat()
        const after = withAnswer(before, 'publication answer', 'assistant-publication')
        harness.primeOperation(operationId)
        harness.runtime.cacheFailures = 1

        const committed = await owner.commitGenerationResult(harness.commitInput(
            operationId,
            result(after, 'old', 'new'),
            1,
            revision(before),
        ))
        expect(committed).toMatchObject({
            status: 'committed',
            reused: false,
            publication: 'pending_recovery',
        })
        expect(harness.runtime.fullStore.get('char-1')?.get('chat-1')).toEqual(before)
        expect(harness.runtime.database.globalChatVariables).toEqual({ mood: 'old' })
        expect(harness.runtime.database.statics.messages).toBe(10)
        expect(harness.kvGet(commitStorageKey(operationId))).not.toBeNull()

        const recovered = await owner.recover(operationId)
        expect(recovered).toMatchObject({
            status: 'committed',
            reason: 'commit_recovered',
            publication: 'published',
        })
        expect(harness.runtime.fullStore.get('char-1')?.get('chat-1')).toEqual(after)
        expect(harness.runtime.database.globalChatVariables).toEqual({ mood: 'new' })
        expect(harness.runtime.database.statics.messages).toBe(11)
        expect(JSON.parse(harness.kvGet(SERVER_CHAT_COMMIT_SEQUENCE_KEY).toString('utf8')).value)
            .toBe(1)
    })

    it('recovers two unflushed commits in commit-sequence order', async () => {
        const harness = makeHarness()
        const owner = harness.makeOwner()
        const originalChat = baseChat()
        const firstChat = withAnswer(originalChat, 'first answer', 'assistant-sequence-1')
        const secondChat = withAnswer(firstChat, 'second answer', 'assistant-sequence-2')
        const firstOperation = 'operation-c2-sequence-1'
        const secondOperation = 'operation-c2-sequence-2'
        harness.primeOperation(firstOperation)
        await owner.commitGenerationResult(harness.commitInput(
            firstOperation,
            result(firstChat, 'old', 'first'),
            1,
            revision(originalChat),
        ))
        harness.primeOperation(secondOperation)
        await owner.commitGenerationResult(harness.commitInput(
            secondOperation,
            result(secondChat, 'first', 'second'),
            2,
            revision(firstChat),
        ))
        expect(harness.kvList('internal/chat-write/v1/')).toHaveLength(2)
        const schedulesBeforeAppliedReplay = harness.runtime.schedules
        await owner.recoverAll()
        expect(harness.runtime.fullStore.get('char-1')?.get('chat-1')).toEqual(secondChat)
        expect(harness.runtime.database.globalChatVariables).toEqual({ mood: 'second' })
        expect(harness.runtime.database.statics.messages).toBe(12)
        expect(harness.runtime.schedules).toBe(schedulesBeforeAppliedReplay)

        // Simulate process death before the debounced database blob persist.
        harness.runtime.database = {
            characters: [{
                chaId: 'char-1',
                chats: [{ id: 'chat-1', name: 'Synthetic chat', _stub: true, modules: [] }],
            }],
            globalChatVariables: { mood: 'old' },
            statics: { messages: 10 },
        }
        harness.runtime.fullStore = new Map([['char-1', new Map([['chat-1', originalChat]])]])
        harness.runtime.schedules = 0

        const restarted = harness.makeOwner(harness.makeJournal())
        const recovered = await restarted.recoverAll()
        expect(recovered.map((entry: any) => entry.receipt.operationId)).toEqual([
            firstOperation,
            secondOperation,
        ])
        expect(recovered.every((entry: any) => entry.publication === 'published')).toBe(true)
        expect(harness.runtime.fullStore.get('char-1')?.get('chat-1')).toEqual(secondChat)
        expect(harness.runtime.database.globalChatVariables).toEqual({ mood: 'second' })
        expect(harness.runtime.database.statics.messages).toBe(12)
        expect(harness.runtime.database[SERVER_CHAT_COMMIT_APPLIED_FIELD])
            .toMatchObject([
                { operationId: firstOperation, commitSequence: 1 },
                { operationId: secondOperation, commitSequence: 2 },
            ])
        expect(harness.runtime.schedules).toBe(2)
    })

    it('leaves a revision conflict and cancellation uncommitted', async () => {
        const conflictHarness = makeHarness()
        const conflictOperation = 'operation-c2-conflict-1'
        const before = baseChat()
        const after = withAnswer(before, 'conflicted answer', 'assistant-conflict')
        conflictHarness.primeOperation(conflictOperation)
        conflictHarness.runtime.fullStore.get('char-1')?.set(
            'chat-1',
            { ...before, note: 'concurrent edit' },
        )
        const conflict = await conflictHarness.makeOwner().commitGenerationResult(
            conflictHarness.commitInput(
                conflictOperation,
                result(after, 'old', 'generated'),
                1,
                revision(before),
            ),
        )
        expect(conflict).toMatchObject({ status: 'conflict', reason: 'base_revision_changed' })
        expect(conflictHarness.kvGet(commitStorageKey(conflictOperation))).toBeNull()

        const cancelledHarness = makeHarness()
        const cancelledOperation = 'operation-c2-cancelled-1'
        cancelledHarness.primeOperation(cancelledOperation)
        cancelledHarness.db.prepare('UPDATE kv SET value = ? WHERE key = ?').run(
            JSON.stringify({
                operationId: cancelledOperation,
                charId: 'char-1',
                chatId: 'chat-1',
                state: 'cancelled',
            }),
            operationStateKey(cancelledOperation),
        )
        const cancelled = await cancelledHarness.makeOwner().commitGenerationResult(
            cancelledHarness.commitInput(
                cancelledOperation,
                result(after, 'old', 'generated'),
                1,
                revision(before),
            ),
        )
        expect(cancelled).toMatchObject({ status: 'cancelled', reason: 'cancel_won' })
        expect(cancelledHarness.kvGet(commitStorageKey(cancelledOperation))).toBeNull()
    })

    it('clears only commit recovery and its sequence owner', async () => {
        const harness = makeHarness()
        const operationId = 'operation-c2-discard-1'
        const before = baseChat()
        const after = withAnswer(before, 'discard answer', 'assistant-discard')
        harness.primeOperation(operationId)
        const owner = harness.makeOwner()
        await owner.commitGenerationResult(harness.commitInput(
            operationId,
            result(after, 'old', 'new'),
            1,
            revision(before),
        ))
        expect(harness.kvGet(commitStorageKey(operationId))).not.toBeNull()
        owner.discardRecovery()
        expect(harness.kvGet(commitStorageKey(operationId))).toBeNull()
        expect(harness.kvGet(SERVER_CHAT_COMMIT_SEQUENCE_KEY)).toBeNull()
        expect(harness.kvList('internal/chat-write/v1/')).toHaveLength(1)
    })
})
