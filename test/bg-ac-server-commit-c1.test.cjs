'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const test = require('node:test')

const {
    createChatWriteJournal,
} = require('../patches/lazy-chat-sync/files/server/node/chatWriteJournal.cjs')
const {
    HOST_CHANGE_INTENT_CONTRACT,
    SERVER_CHAT_COMMIT_CONTRACT,
    SERVER_CHAT_INPUT_RECEIPT_CONTRACT,
    commitStorageKey,
    createServerChatCommitter,
    stableJSON,
} = require('../patches/lazy-chat-sync/files-1.10/server/node/serverChatCommit.cjs')

function revision(chat) {
    return crypto.createHash('sha256').update(stableJSON(chat)).digest('hex')
}

function request(answer = 'synthetic answer') {
    const operationId = 'operation-c1-root-0001'
    const committedAt = '2026-09-13T01:02:03.000Z'
    const chat = {
        id: 'chat-1',
        name: 'Synthetic chat',
        message: [
            { role: 'user', data: 'synthetic input', chatId: 'user-1' },
            { role: 'char', data: answer, chatId: 'assistant-1' },
        ],
        localLore: [],
        modules: [],
    }
    const storedRevision = revision(chat)
    return {
        contractVersion: SERVER_CHAT_COMMIT_CONTRACT,
        operationId,
        resultId: 'result-c1-root-0001',
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
        bindingEpoch: 'binding-7',
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
        chat,
        metadata: { id: 'chat-1', name: 'Synthetic chat', _stub: true, modules: [] },
        hostChangeIntent: {
            contractVersion: HOST_CHANGE_INTENT_CONTRACT,
            eventId: 'binding-7-response-2',
            hostInstanceId: 'host-instance-1',
            charId: 'char-1',
            chatId: 'chat-1',
            bindingEpoch: 'binding-7',
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

function createHarness() {
    const kv = new Map()
    let failAt = 0
    let writeCount = 0
    let publicationFailures = 0
    let storageQueue = Promise.resolve()
    const kvGet = key => kv.get(key) ?? null
    const kvSet = (key, value) => {
        writeCount += 1
        kv.set(key, Buffer.from(value))
        if (writeCount === failAt) throw new Error(`injected-write-${failAt}`)
    }
    const kvList = prefix => [...kv.keys()].filter(key => key.startsWith(prefix))
    const journal = createChatWriteJournal({
        kvGet,
        kvSet,
        kvDel: key => kv.delete(key),
        kvList,
        encode: value => Buffer.from(JSON.stringify(value), 'utf8'),
        decode: async value => JSON.parse(Buffer.from(value).toString('utf8')),
    })
    const queueStorageOperation = operation => {
        const run = storageQueue.then(operation, operation)
        storageQueue = run.catch(() => {})
        return run
    }
    const runTransaction = operation => {
        const before = new Map(kv)
        try {
            return operation()
        } catch (error) {
            kv.clear()
            for (const [key, value] of before) kv.set(key, value)
            throw error
        }
    }
    const readJson = key => {
        const value = kvGet(key)
        return value ? JSON.parse(value.toString('utf8')) : null
    }
    const writeJson = (key, value) => kvSet(key, stableJSON(value))
    const published = new Map()
    const operationKey = operationId => `operation/${operationId}`
    const revisionKey = (charId, chatId) => `revision/${charId}/${chatId}`
    const makeCommitter = (overrides = {}) => createServerChatCommitter({
        journal,
        kvGet,
        kvSet,
        kvList,
        queueStorageOperation,
        runTransaction,
        readCurrentRevision: (charId, chatId) => (
            kvGet(revisionKey(charId, chatId))?.toString('utf8') ?? null
        ),
        readOperationState: operationId => readJson(operationKey(operationId)),
        calculateRevision: revision,
        writeCanonicalState: ({ request: commitRequest }) => {
            writeJson(`canonical/metadata/${commitRequest.storedChatId}`, commitRequest.metadata)
            kvSet(
                revisionKey(commitRequest.requestedCharId, commitRequest.storedChatId),
                commitRequest.storedRevision,
            )
            writeJson(`canonical/intent/${commitRequest.operationId}`, commitRequest.hostChangeIntent)
            writeJson(`canonical/owners/${commitRequest.storedChatId}`, commitRequest.owners)
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
        },
        writeCommittedOperationState: (operationId, state) => {
            writeJson(operationKey(operationId), state)
            return { written: true }
        },
        publishCanonicalState: async (record, context) => {
            if (publicationFailures > 0) {
                publicationFailures -= 1
                throw new Error('injected-publication-failure')
            }
            published.set(record.recovery.storedChatId, {
                chat: context.chat,
                metadata: record.recovery.metadata,
            })
        },
        ...overrides,
    })
    const prime = commitRequest => {
        kv.set(
            revisionKey(commitRequest.requestedCharId, commitRequest.requestedChatId),
            Buffer.from(commitRequest.baseChatRevision),
        )
        kv.set(operationKey(commitRequest.operationId), Buffer.from(stableJSON({
            operationId: commitRequest.operationId,
            charId: commitRequest.requestedCharId,
            chatId: commitRequest.requestedChatId,
            claimEpoch: commitRequest.claimEpoch,
            state: 'result-ready',
        })))
    }
    return {
        journal,
        kv,
        kvGet,
        kvList,
        makeCommitter,
        operationKey,
        prime,
        published,
        readJson,
        resetFailure: step => { failAt = step; writeCount = 0 },
        setPublicationFailures: count => { publicationFailures = count },
    }
}

test('C1: immutable commit replays exactly and changed operation content conflicts', async () => {
    const harness = createHarness()
    const commitRequest = request()
    harness.prime(commitRequest)
    const committer = harness.makeCommitter()

    const first = await committer.commit(commitRequest)
    assert.equal(first.status, 'committed')
    assert.equal(first.publication, 'published')
    assert.equal(first.receipt.chatCommitted, true)
    assert.equal(first.receipt.storedRevision, commitRequest.storedRevision)
    const committedState = harness.readJson(harness.operationKey(commitRequest.operationId))
    assert.deepEqual(
        {
            state: committedState.state,
            bindingEpoch: committedState.bindingEpoch,
            claimEpoch: committedState.claimEpoch,
        },
        { state: 'chat-committed', bindingEpoch: 'binding-7', claimEpoch: 41 },
    )

    const replay = await committer.commit(structuredClone(commitRequest))
    assert.equal(replay.reason, 'commit_replayed')
    assert.equal(replay.reused, true)
    assert.deepEqual(replay.receipt, first.receipt)

    const conflict = await committer.commit(request('changed answer'))
    assert.deepEqual(
        { status: conflict.status, reason: conflict.reason },
        { status: 'conflict', reason: 'operation_fingerprint_conflict' },
    )

    const changedSettings = structuredClone(commitRequest)
    changedSettings.settingsDigest = revision({ settings: 'snapshot-2' })
    const settingsConflict = await committer.commit(changedSettings)
    assert.equal(settingsConflict.reason, 'operation_fingerprint_conflict')
})

test('C1: transaction failure rolls journal, canonical state, receipt, and owner back', async () => {
    for (let step = 1; step <= 7; step += 1) {
        const harness = createHarness()
        const commitRequest = request()
        harness.prime(commitRequest)
        const committer = harness.makeCommitter()
        harness.resetFailure(step)
        await assert.rejects(committer.commit(commitRequest), error => (
            error?.commitState === 'not_committed'
        ))
        assert.equal(harness.kvGet(commitStorageKey(commitRequest.operationId)), null)
        assert.deepEqual(harness.kvList('internal/chat-write/v1/'), [])
        assert.deepEqual(harness.kvList('canonical/'), [])
        assert.equal(harness.readJson(harness.operationKey(commitRequest.operationId)).state, 'result-ready')
        assert.equal(harness.journal.size(), 0)

        harness.resetFailure(0)
        const retry = await committer.commit(commitRequest)
        assert.equal(retry.status, 'committed')
    }
})

test('C1: cancellation and commit have one durable winner', async () => {
    const harness = createHarness()
    const commitRequest = request()
    harness.prime(commitRequest)
    harness.kv.set(harness.operationKey(commitRequest.operationId), Buffer.from(stableJSON({
        operationId: commitRequest.operationId,
        charId: commitRequest.requestedCharId,
        chatId: commitRequest.requestedChatId,
        claimEpoch: commitRequest.claimEpoch,
        state: 'cancelled',
    })))
    const cancelled = await harness.makeCommitter().commit(commitRequest)
    assert.equal(cancelled.status, 'cancelled')
    assert.equal(harness.kvGet(commitStorageKey(commitRequest.operationId)), null)

    const committedHarness = createHarness()
    committedHarness.prime(commitRequest)
    const committed = await committedHarness.makeCommitter().commit(commitRequest)
    assert.equal(committed.status, 'committed')
    assert.equal(
        committedHarness.readJson(committedHarness.operationKey(commitRequest.operationId)).state,
        'chat-committed',
    )
})

test('C1: a concurrent base revision wins before any commit write', async () => {
    const harness = createHarness()
    const commitRequest = request()
    harness.prime(commitRequest)
    harness.kv.set('revision/char-1/chat-1', Buffer.from('concurrent-revision'))

    const conflict = await harness.makeCommitter().commit(commitRequest)
    assert.equal(conflict.status, 'conflict')
    assert.equal(conflict.reason, 'base_revision_changed')
    assert.equal(conflict.currentRevision, 'concurrent-revision')
    assert.equal(harness.kvGet(commitStorageKey(commitRequest.operationId)), null)
    assert.deepEqual(harness.kvList('internal/chat-write/v1/'), [])
    assert.deepEqual(harness.kvList('canonical/'), [])
})

test('C1: a failed non-prompt effect remains in the durable committed receipt', async () => {
    const harness = createHarness()
    const commitRequest = request()
    commitRequest.effectIntents.globalVariables.changed.mood = 'new'
    commitRequest.effectIntents.globalVariables.expected.mood = { present: true, value: 'old' }
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
    assert.equal(result.status, 'committed')
    assert.equal(result.receipt.chatCommitted, true)
    assert.equal(result.receipt.effects.globals.status, 'conflict')
    assert.equal(result.receipt.effects.stats.status, 'failed')
    assert.deepEqual(committer.status(commitRequest.operationId).receipt, result.receipt)
    assert.deepEqual(committer.readRecovery(commitRequest.operationId).canonicalWrite, {
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
    })
})

test('C1: deeply nested recovery input fails before entering the storage queue', async () => {
    const harness = createHarness()
    const commitRequest = request()
    let nested = { leaf: true }
    for (let depth = 0; depth < 140; depth += 1) nested = { nested }
    commitRequest.effectIntents.globalVariables.changed.deep = nested
    commitRequest.effectIntents.globalVariables.expected.deep = { present: false }
    harness.prime(commitRequest)

    await assert.rejects(harness.makeCommitter().commit(commitRequest), error => (
        error?.code === 'SERVER_CHAT_COMMIT_INVALID'
        && /nesting is too deep/.test(error.message)
    ))
    assert.equal(harness.kvGet(commitStorageKey(commitRequest.operationId)), null)
    assert.deepEqual(harness.kvList('internal/chat-write/v1/'), [])
})

test('C1: inconsistent per-key effect receipts roll the transaction back', async () => {
    const harness = createHarness()
    const commitRequest = request()
    commitRequest.effectIntents.globalVariables.changed.mood = 'new'
    commitRequest.effectIntents.globalVariables.expected.mood = { present: true, value: 'old' }
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

    await assert.rejects(committer.commit(commitRequest), error => (
        error?.commitState === 'not_committed'
        && /aggregate status/.test(error.cause?.message ?? '')
    ))
    assert.equal(harness.kvGet(commitStorageKey(commitRequest.operationId)), null)
    assert.deepEqual(harness.kvList('internal/chat-write/v1/'), [])
})

test('C1: post-commit publication failure recovers body and metadata without a second commit', async () => {
    const harness = createHarness()
    const commitRequest = request()
    harness.prime(commitRequest)
    harness.setPublicationFailures(1)
    const committer = harness.makeCommitter()
    const committed = await committer.commit(commitRequest)
    assert.equal(committed.status, 'committed')
    assert.equal(committed.publication, 'pending_recovery')
    assert.ok(harness.kvGet(commitStorageKey(commitRequest.operationId)))

    const recovered = await committer.recover(commitRequest.operationId)
    assert.equal(recovered.status, 'committed')
    assert.equal(recovered.reason, 'commit_recovered')
    assert.deepEqual(harness.published.get('chat-1'), {
        chat: commitRequest.chat,
        metadata: commitRequest.metadata,
    })
})
