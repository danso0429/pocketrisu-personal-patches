import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import journalPackage from './chatWriteJournal.cjs'
import commitPackage from './serverChatCommit.cjs'
import utilsPackage from './utils.cjs'

const { createChatWriteJournal } = journalPackage as any
const { decodeRisuSave, encodeRisuSaveLegacy } = utilsPackage as any
const {
    HOST_CHANGE_INTENT_CONTRACT,
    SERVER_CHAT_COMMIT_CONTRACT,
    SERVER_CHAT_INPUT_RECEIPT_CONTRACT,
    commitStorageKey,
    createServerChatCommitter,
    stableJSON,
} = commitPackage as any

const cleanup: Array<() => void> = []

afterEach(() => {
    while (cleanup.length > 0) cleanup.pop()?.()
})

function revision(chat: unknown): string {
    return crypto.createHash('sha256').update(stableJSON(chat)).digest('hex')
}

function chat(answer = 'synthetic answer') {
    return {
        id: 'chat-1',
        name: 'Synthetic chat',
        message: [
            { role: 'user', data: 'synthetic input', chatId: 'user-1' },
            { role: 'char', data: answer, chatId: 'assistant-1' },
        ],
        localLore: [],
        modules: [],
        lastDate: 1234,
    }
}

function request(answer = 'synthetic answer') {
    const committedAt = '2026-09-13T01:02:03.000Z'
    const payload = chat(answer)
    const operationId = 'operation-c1-0001'
    const bindingEpoch = 'binding-7'
    const storedRevision = revision(payload)
    return {
        contractVersion: SERVER_CHAT_COMMIT_CONTRACT,
        operationId,
        resultId: 'result-c1-0001',
        publishSeq: 2,
        requestedCharId: 'char-1',
        requestedChatId: 'chat-1',
        storedChatId: 'chat-1',
        baseChatRevision: 'base-revision-1',
        storedRevision,
        settingsDigest: revision({ settings: 'snapshot-1' }),
        executionContextId: 'execution-context-1',
        archiveCenterRequestCorrelationId: 'ac-correlation-1',
        prepareKey: 'prepare-key-1',
        prepareFingerprint: revision({ prepare: 'fingerprint-1' }),
        bindingEpoch,
        hostChangeSeq: 2,
        inputReceipt: {
            contractVersion: SERVER_CHAT_INPUT_RECEIPT_CONTRACT,
            receiptId: 'input-receipt-1',
            inputCommandId: 'input-command-1',
            operationId,
            charId: 'char-1',
            chatId: 'chat-1',
            messageId: 'user-1',
            role: 'user',
            revision: 'base-revision-1',
            hostChangeSeq: 1,
        },
        claimEpoch: 41,
        chat: payload,
        metadata: {
            id: 'chat-1',
            name: 'Synthetic chat',
            _stub: true,
            lastDate: 1234,
            modules: [],
        },
        hostChangeIntent: {
            contractVersion: HOST_CHANGE_INTENT_CONTRACT,
            eventId: 'binding-7-response-2',
            hostInstanceId: 'host-instance-1',
            charId: 'char-1',
            chatId: 'chat-1',
            bindingEpoch,
            seq: 2,
            previousSeq: 1,
            operationId,
            kind: 'response_commit',
            beforeRevision: 'base-revision-1',
            afterRevision: storedRevision,
            messageIdentities: ['user-1', 'assistant-1'],
            sourceGeneration: 'assistant-generation-1',
            committedAt,
            payloadRef: commitStorageKey(operationId),
            delivery: 'pending',
        },
        owners: [{
            messageId: 'assistant-1',
            sourceRevision: storedRevision,
            sourceGeneration: 'assistant-generation-1',
            operationId,
            authority: 'server',
            acState: 'pending',
            automaticBackfill: 'excluded',
        }],
        effectIntents: {
            globalVariables: { changed: {}, deleted: [], expected: {} },
            staticsMessagesDelta: 1,
        },
        acOwner: 'server',
        acState: 'pending',
        readyForNextTurn: false,
        awaitingMetadata: true,
        committedAt,
    }
}

function makeHarness() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'server-chat-commit-c1-'))
    const db = new Database(path.join(root, 'commit.sqlite'))
    db.pragma('journal_mode = WAL')
    db.exec(`
        CREATE TABLE kv (
            key TEXT PRIMARY KEY,
            value BLOB NOT NULL,
            updated_at INTEGER NOT NULL
        )
    `)
    const get = db.prepare('SELECT value FROM kv WHERE key = ?')
    const set = db.prepare(`
        INSERT INTO kv(key, value, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `)
    const list = db.prepare('SELECT key FROM kv WHERE key LIKE ? ORDER BY key')
    const putRaw = (key: string, value: string | Buffer) => {
        set.run(key, Buffer.from(value), Date.now())
    }
    const kvGet = (key: string) => (get.get(key) as { value?: Buffer } | undefined)?.value ?? null
    let failAtWrite = 0
    let commitWriteCount = 0
    const kvSet = (key: string, value: string | Buffer | Uint8Array) => {
        commitWriteCount += 1
        set.run(key, Buffer.from(value), Date.now())
        if (failAtWrite === commitWriteCount) throw new Error(`injected-write-${failAtWrite}`)
    }
    const kvList = (prefix: string) => (
        list.all(`${prefix.replace(/[\\%_]/g, '\\$&')}%`) as Array<{ key: string }>
    ).map(row => row.key)
    const kvDel = (key: string) => db.prepare('DELETE FROM kv WHERE key = ?').run(key)
    const journal = createChatWriteJournal({
        kvGet,
        kvSet,
        kvDel,
        kvList,
        encode: encodeRisuSaveLegacy,
        decode: decodeRisuSave,
    })
    let storageQueue = Promise.resolve<unknown>(undefined)
    const queueStorageOperation = <T>(operation: () => T | Promise<T>): Promise<T> => {
        const run = storageQueue.then(operation, operation)
        storageQueue = run.catch(() => undefined)
        return run
    }
    const published = new Map<string, unknown>()
    let publicationFailures = 0
    const operationKey = (operationId: string) => `operation/${operationId}`
    const revisionKey = (charId: string, chatId: string) => `revision/${charId}/${chatId}`
    const readJson = (key: string) => {
        const value = kvGet(key)
        return value ? JSON.parse(value.toString('utf8')) : null
    }
    const writeJson = (key: string, value: unknown) => kvSet(key, stableJSON(value))
    const writer = ({ request: commitRequest }: any) => {
        writeJson(`canonical/metadata/${commitRequest.storedChatId}`, commitRequest.metadata)
        kvSet(
            revisionKey(commitRequest.requestedCharId, commitRequest.storedChatId),
            commitRequest.storedRevision,
        )
        writeJson(`canonical/intent/${commitRequest.operationId}`, commitRequest.hostChangeIntent)
        writeJson(`canonical/input/${commitRequest.operationId}`, commitRequest.inputReceipt)
        writeJson(`canonical/owners/${commitRequest.storedChatId}`, commitRequest.owners)
        writeJson(`canonical/effects/${commitRequest.operationId}`, commitRequest.effectIntents)
        return {
            effects: {
                chat: { status: 'committed' },
                metadata: { status: 'committed' },
                globals: { status: 'committed' },
                stats: { status: 'committed' },
            },
            globalVariableOutcomes: [],
            staticsMessagesAppliedDelta: commitRequest.effectIntents.staticsMessagesDelta,
            promptEffectsResolved: true,
        }
    }
    const makeCommitter = (overrides: Record<string, unknown> = {}) => createServerChatCommitter({
        journal,
        kvGet,
        kvSet,
        kvList,
        queueStorageOperation,
        runTransaction: (operation: () => unknown) => db.transaction(operation)(),
        readCurrentRevision: (charId: string, chatId: string) => {
            const value = kvGet(revisionKey(charId, chatId))
            return value ? value.toString('utf8') : null
        },
        readOperationState: (operationId: string) => readJson(operationKey(operationId)),
        calculateRevision: revision,
        writeCanonicalState: writer,
        writeCommittedOperationState: (operationId: string, state: unknown) => {
            writeJson(operationKey(operationId), state)
            return { written: true }
        },
        publishCanonicalState: async (record: any, context: any) => {
            if (publicationFailures > 0) {
                publicationFailures -= 1
                throw new Error('injected-publication-failure')
            }
            published.set(record.recovery.storedChatId, {
                chat: context.chat,
                metadata: record.recovery.metadata,
                revision: record.recovery.storedRevision,
            })
        },
        ...overrides,
    })
    const prime = (commitRequest = request()) => {
        putRaw(
            revisionKey(commitRequest.requestedCharId, commitRequest.requestedChatId),
            commitRequest.baseChatRevision,
        )
        putRaw(operationKey(commitRequest.operationId), stableJSON({
            operationId: commitRequest.operationId,
            charId: commitRequest.requestedCharId,
            chatId: commitRequest.requestedChatId,
            claimEpoch: commitRequest.claimEpoch,
            state: 'result-ready',
        }))
    }
    const resetWriteFailure = (step = 0) => {
        failAtWrite = step
        commitWriteCount = 0
    }
    cleanup.push(() => {
        db.close()
        fs.rmSync(root, { recursive: true, force: true })
    })
    return {
        db,
        journal,
        kvGet,
        kvList,
        makeCommitter,
        operationKey,
        prime,
        published,
        putRaw,
        readJson,
        resetWriteFailure,
        revisionKey,
        setPublicationFailures: (count: number) => { publicationFailures = count },
    }
}

describe('server chat commit primitive', () => {
    it('durably commits one immutable envelope and exactly replays it', async () => {
        const harness = makeHarness()
        const commitRequest = request()
        harness.prime(commitRequest)
        const committer = harness.makeCommitter()

        const first = await committer.commit(commitRequest)
        expect(first).toMatchObject({
            status: 'committed',
            reason: 'commit_written',
            reused: false,
            publication: 'published',
        })
        expect(first.receipt).toMatchObject({
            contractVersion: SERVER_CHAT_COMMIT_CONTRACT,
            chatCommitted: true,
            storageDisposition: 'original',
            storedChatId: 'chat-1',
            storedRevision: commitRequest.storedRevision,
        })
        expect(harness.kvGet(commitStorageKey(commitRequest.operationId))).not.toBeNull()
        expect(harness.readJson(harness.operationKey(commitRequest.operationId))).toMatchObject({
            state: 'chat-committed',
            commitReceiptId: first.receipt.commitReceiptId,
            bindingEpoch: commitRequest.bindingEpoch,
            claimEpoch: commitRequest.claimEpoch,
            settingsDigest: commitRequest.settingsDigest,
        })

        const replay = await committer.commit(structuredClone(commitRequest))
        expect(replay).toMatchObject({
            status: 'committed',
            reason: 'commit_replayed',
            reused: true,
            publication: 'durable',
        })
        expect(replay.receipt).toEqual(first.receipt)

        const changed = request('different answer')
        const conflict = await committer.commit(changed)
        expect(conflict).toMatchObject({
            status: 'conflict',
            reason: 'operation_fingerprint_conflict',
        })
        const changedSettings = structuredClone(commitRequest)
        changedSettings.settingsDigest = revision({ settings: 'snapshot-2' })
        await expect(committer.commit(changedSettings)).resolves.toMatchObject({
            status: 'conflict',
            reason: 'operation_fingerprint_conflict',
        })
        expect(committer.status(commitRequest.operationId).receipt).toEqual(first.receipt)
    })

    it('rolls every synchronous write back and permits a clean retry', async () => {
        for (let failAt = 1; failAt <= 9; failAt += 1) {
            const harness = makeHarness()
            const commitRequest = request()
            harness.prime(commitRequest)
            const committer = harness.makeCommitter()
            harness.resetWriteFailure(failAt)

            await expect(committer.commit(commitRequest)).rejects.toMatchObject({
                commitState: 'not_committed',
            })
            expect(harness.kvGet(commitStorageKey(commitRequest.operationId))).toBeNull()
            expect(harness.kvList('internal/chat-write/v1/')).toEqual([])
            expect(harness.kvList('canonical/')).toEqual([])
            expect(harness.readJson(harness.operationKey(commitRequest.operationId))).toMatchObject({
                state: 'result-ready',
            })
            expect(harness.journal.size()).toBe(0)

            harness.resetWriteFailure()
            await expect(committer.commit(commitRequest)).resolves.toMatchObject({
                status: 'committed',
                reused: false,
            })
        }
    })

    it('rejects a changed canonical base before writing any commit state', async () => {
        const harness = makeHarness()
        const commitRequest = request()
        harness.prime(commitRequest)
        harness.putRaw(
            harness.revisionKey(commitRequest.requestedCharId, commitRequest.requestedChatId),
            'concurrent-revision',
        )

        const result = await harness.makeCommitter().commit(commitRequest)
        expect(result).toMatchObject({
            status: 'conflict',
            reason: 'base_revision_changed',
            currentRevision: 'concurrent-revision',
        })
        expect(harness.kvGet(commitStorageKey(commitRequest.operationId))).toBeNull()
        expect(harness.kvList('internal/chat-write/v1/')).toEqual([])
        expect(harness.kvList('canonical/')).toEqual([])
        expect(harness.journal.size()).toBe(0)
    })

    it('commits chat while retaining a non-prompt effect failure for reconciliation', async () => {
        const harness = makeHarness()
        const commitRequest = request()
        commitRequest.effectIntents.globalVariables.changed.mood = 'new'
        commitRequest.effectIntents.globalVariables.expected.mood = {
            present: true,
            value: 'old',
        }
        harness.prime(commitRequest)
        const committer = harness.makeCommitter({
            writeCanonicalState: () => ({
                effects: {
                    chat: { status: 'committed' },
                    metadata: { status: 'committed' },
                    globals: { status: 'conflict', reason: 'newer-value-preserved' },
                    stats: { status: 'failed', reason: 'retry-required' },
                },
                globalVariableOutcomes: [{
                    key: 'mood',
                    status: 'conflict',
                    reason: 'newer-value-preserved',
                }],
                staticsMessagesAppliedDelta: 0,
                promptEffectsResolved: true,
            }),
        })

        const result = await committer.commit(commitRequest)
        expect(result).toMatchObject({
            status: 'committed',
            receipt: {
                chatCommitted: true,
                promptEffectsResolved: true,
                effects: {
                    globals: { status: 'conflict', reason: 'newer-value-preserved' },
                    stats: { status: 'failed', reason: 'retry-required' },
                },
            },
        })
        expect(committer.status(commitRequest.operationId).receipt).toEqual(result.receipt)
        expect(committer.readRecovery(commitRequest.operationId).canonicalWrite).toMatchObject({
            globalVariableOutcomes: [{
                key: 'mood',
                status: 'conflict',
                reason: 'newer-value-preserved',
            }],
            staticsMessagesAppliedDelta: 0,
        })
    })

    it('lets cancellation win before commit and refuses cancellation after commit', async () => {
        const cancelled = makeHarness()
        const commitRequest = request()
        cancelled.prime(commitRequest)
        cancelled.putRaw(cancelled.operationKey(commitRequest.operationId), stableJSON({
            operationId: commitRequest.operationId,
            charId: commitRequest.requestedCharId,
            chatId: commitRequest.requestedChatId,
            claimEpoch: commitRequest.claimEpoch,
            state: 'cancelled',
        }))
        const cancelledResult = await cancelled.makeCommitter().commit(commitRequest)
        expect(cancelledResult).toMatchObject({ status: 'cancelled', reason: 'cancel_won' })
        expect(cancelled.kvGet(commitStorageKey(commitRequest.operationId))).toBeNull()
        expect(cancelled.kvList('internal/chat-write/v1/')).toEqual([])

        const committed = makeHarness()
        committed.prime(commitRequest)
        await committed.makeCommitter().commit(commitRequest)
        const lateCancel = committed.db.transaction(() => {
            if (committed.kvGet(commitStorageKey(commitRequest.operationId))) return false
            committed.putRaw(committed.operationKey(commitRequest.operationId), stableJSON({
                operationId: commitRequest.operationId,
                charId: commitRequest.requestedCharId,
                chatId: commitRequest.requestedChatId,
                state: 'cancelled',
            }))
            return true
        })()
        expect(lateCancel).toBe(false)
        expect(committed.readJson(committed.operationKey(commitRequest.operationId))).toMatchObject({
            state: 'chat-committed',
        })
    })

    it('rolls back inconsistent per-key and aggregate effect receipts', async () => {
        const harness = makeHarness()
        const commitRequest = request()
        commitRequest.effectIntents.globalVariables.changed.mood = 'new'
        commitRequest.effectIntents.globalVariables.expected.mood = {
            present: true,
            value: 'old',
        }
        harness.prime(commitRequest)
        const committer = harness.makeCommitter({
            writeCanonicalState: () => ({
                effects: {
                    chat: { status: 'committed' },
                    metadata: { status: 'committed' },
                    globals: { status: 'committed' },
                    stats: { status: 'committed' },
                },
                globalVariableOutcomes: [{ key: 'mood', status: 'conflict' }],
                staticsMessagesAppliedDelta: 1,
                promptEffectsResolved: true,
            }),
        })

        await expect(committer.commit(commitRequest)).rejects.toMatchObject({
            commitState: 'not_committed',
        })
        expect(harness.kvGet(commitStorageKey(commitRequest.operationId))).toBeNull()
        expect(harness.kvList('internal/chat-write/v1/')).toEqual([])
        expect(harness.kvList('canonical/')).toEqual([])
    })

    it('recovers post-commit publication and new-chat metadata without rerunning commit', async () => {
        const harness = makeHarness()
        const commitRequest = request()
        ;(commitRequest.chat as any).folderId = undefined
        ;(commitRequest.metadata as any).folderId = undefined
        harness.prime(commitRequest)
        harness.setPublicationFailures(1)
        const first = await harness.makeCommitter().commit(commitRequest)
        expect(first).toMatchObject({
            status: 'committed',
            publication: 'pending_recovery',
        })
        expect(harness.kvGet(commitStorageKey(commitRequest.operationId))).not.toBeNull()

        const restartedJournal = createChatWriteJournal({
            kvGet: harness.kvGet,
            kvSet: () => { throw new Error('recovery must not rewrite the commit') },
            kvDel: () => { throw new Error('recovery must not delete the journal') },
            kvList: harness.kvList,
            encode: encodeRisuSaveLegacy,
            decode: decodeRisuSave,
        })
        const recovered = new Map<string, unknown>()
        const restarted = harness.makeCommitter({
            journal: restartedJournal,
            publishCanonicalState: async (record: any, context: any) => {
                recovered.set(record.recovery.storedChatId, {
                    chat: context.chat,
                    metadata: record.recovery.metadata,
                })
            },
        })
        const result = await restarted.recover(commitRequest.operationId)
        expect(result).toMatchObject({
            status: 'committed',
            reason: 'commit_recovered',
            publication: 'published',
        })
        expect(recovered.get('chat-1')).toEqual({
            chat: commitRequest.chat,
            metadata: commitRequest.metadata,
        })
        expect(Object.prototype.hasOwnProperty.call(
            (recovered.get('chat-1') as any).metadata,
            'folderId',
        )).toBe(true)
    })

    it('rejects corrupt envelopes and async writes without overwriting durable state', async () => {
        const corrupt = makeHarness()
        const commitRequest = request()
        corrupt.prime(commitRequest)
        corrupt.putRaw(commitStorageKey(commitRequest.operationId), '{"recordVersion":1}')
        const corruptResult = await corrupt.makeCommitter().commit(commitRequest)
        expect(corruptResult).toMatchObject({
            status: 'conflict',
            reason: 'commit_record_invalid',
        })
        expect(corrupt.kvGet(commitStorageKey(commitRequest.operationId))?.toString('utf8'))
            .toBe('{"recordVersion":1}')

        const asynchronous = makeHarness()
        asynchronous.prime(commitRequest)
        const asyncCommitter = asynchronous.makeCommitter({
            writeCanonicalState: async () => ({
                effects: {
                    chat: { status: 'committed' },
                    metadata: { status: 'committed' },
                    globals: { status: 'committed' },
                    stats: { status: 'committed' },
                },
                globalVariableOutcomes: [],
                staticsMessagesAppliedDelta: commitRequest.effectIntents.staticsMessagesDelta,
                promptEffectsResolved: true,
            }),
        })
        await expect(asyncCommitter.commit(commitRequest)).rejects.toMatchObject({
            code: 'SERVER_CHAT_COMMIT_ASYNC_TRANSACTION_WRITE',
            commitState: 'not_committed',
        })
        expect(asynchronous.kvGet(commitStorageKey(commitRequest.operationId))).toBeNull()
        expect(asynchronous.kvList('internal/chat-write/v1/')).toEqual([])
    })
})
