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
    settingsSnapshotKey,
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
        ensureCanonicalHook: null as null | (() => void | Promise<void>),
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
        ensureCanonicalState: async () => {
            await runtime.ensureCanonicalHook?.()
        },
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
        encodeSettingsSnapshot: encodeRisuSaveLegacy,
    })
    const transformed = (operationId: string, rawText = 'hello', sourceChat = baseChat()) => ({
        chat: {
            ...sourceChat,
            message: [
                ...sourceChat.message,
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
        kvDel,
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
                recordVersion: 4,
                admissionSeq: 1,
                queuePredecessorId: null,
                executionPredecessorId: null,
                transformState: 'not_run',
                inputState: 'queued',
                admission: {
                    settingsSnapshotRef: settingsSnapshotKey(operationId),
                    settingsSnapshotMode: 'volatile',
                    settingsContextDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
                },
            },
        })
        const settingsSnapshot = owner.loadSettingsSnapshot(operationId)
        expect(settingsSnapshot).toMatchObject({
            status: 'ready',
            ref: settingsSnapshotKey(operationId),
            contextDigest: first.record.admission.settingsContextDigest,
        })
        await expect(decodeRisuSave(settingsSnapshot.bytes))
            .resolves.toEqual(harness.runtime.database)
        expect(owner.settingsSnapshotStats()).toMatchObject({
            contexts: 1,
            maxContexts: 2,
            maxBytes: 512 * 1024 * 1024,
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
            status: 'admitted',
            record: {
                admissionSeq: 2,
                queuePredecessorId: operationId,
                executionPredecessorId: operationId,
            },
        })
    })

    it('records an edited head as blocked instead of leaving a queued pending command', async () => {
        const harness = makeHarness()
        const owner = harness.makeOwner()
        const operationId = 'operation-input-edited-head-1'
        await owner.admit(admission(operationId))
        const original = harness.runtime.fullStore.get('char-1')?.get('chat-1') as any
        harness.runtime.fullStore.get('char-1')?.set('chat-1', {
            ...original,
            message: [...original.message, { role: 'user', data: 'new edit', chatId: 'user-edit' }],
        })
        await expect(owner.loadExecution(operationId)).resolves.toMatchObject({
            status: 'blocked',
            reason: 'base_revision_changed',
        })
        expect(owner.pendingProjection('char-1', 'chat-1')).toMatchObject([{
            operationId,
            state: 'blocked_edit',
        }])
        expect(owner.settingsSnapshotStats().contexts).toBe(0)
        await expect(owner.loadExecution(operationId)).resolves.toMatchObject({
            status: 'blocked',
            reason: 'base_revision_changed',
        })
    })

    it('propagates a blocked head to its waiting successor without starting either', async () => {
        const harness = makeHarness()
        const owner = harness.makeOwner()
        const first = 'operation-input-blocked-chain-1'
        const second = 'operation-input-blocked-chain-2'
        await owner.admit(admission(first))
        await owner.admit(admission(second))
        const original = harness.runtime.fullStore.get('char-1')?.get('chat-1') as any
        harness.runtime.fullStore.get('char-1')?.set('chat-1', {
            ...original,
            message: [...original.message, { role: 'user', data: 'concurrent edit', chatId: 'user-edit' }],
        })
        await expect(owner.loadExecution(first)).resolves.toMatchObject({
            status: 'blocked', reason: 'base_revision_changed',
        })
        await expect(owner.loadExecution(second)).resolves.toMatchObject({
            status: 'blocked', reason: 'predecessor_blocked_edit',
        })
        expect(owner.pendingProjection('char-1', 'chat-1')).toMatchObject([
            { operationId: first, state: 'blocked_edit' },
            { operationId: second, state: 'blocked_edit' },
        ])
        expect(owner.settingsSnapshotStats().contexts).toBe(0)
    })

    it('fails closed on the pre-fix record v3 schema before product activation', async () => {
        const harness = makeHarness()
        const owner = harness.makeOwner()
        const operationId = 'operation-input-record-v3-1'
        await owner.admit(admission(operationId))
        const legacy = JSON.parse(harness.kvGet(commandKey(operationId)).toString('utf8'))
        legacy.recordVersion = 3
        delete legacy.executionPredecessorId
        harness.kvSet(commandKey(operationId), JSON.stringify(legacy))

        expect(owner.read(operationId)).toBeNull()
        await expect(owner.loadExecution(operationId)).resolves.toEqual({ status: 'missing' })
    })

    it('reuses one immutable server settings snapshot and rejects missing snapshot recovery', async () => {
        const harness = makeHarness()
        const owner = harness.makeOwner()
        const operationId = 'operation-input-settings-snapshot-1'
        harness.runtime.database.providerSecret = 'SYNTHETIC_SETTINGS_SECRET_MARKER'
        const admitted = await owner.admit(admission(operationId))
        expect(harness.kvGet(commandKey(operationId)).toString('utf8'))
            .not.toContain('SYNTHETIC_SETTINGS_SECRET_MARKER')
        const initialSettings = owner.loadSettingsSnapshot(operationId)
        expect(initialSettings).toMatchObject({ status: 'ready' })
        const originalSnapshot = await decodeRisuSave(initialSettings.bytes)
        expect(originalSnapshot.providerSecret).toBe('SYNTHETIC_SETTINGS_SECRET_MARKER')
        await expect(owner.loadExecution(operationId)).resolves.toMatchObject({
            status: 'transform-required',
            chat: baseChat(),
        })
        harness.runtime.database = {
            ...harness.runtime.database,
            temperature: 1.7,
        }

        await expect(owner.admit(admission(operationId))).resolves.toMatchObject({
            status: 'admitted',
            reused: true,
            record: {
                requestFingerprint: admitted.record.requestFingerprint,
                admission: {
                    settingsSnapshotRef: settingsSnapshotKey(operationId),
                },
            },
        })
        const loaded = owner.loadSettingsSnapshot(operationId)
        expect(loaded).toMatchObject({
            status: 'ready',
            ref: settingsSnapshotKey(operationId),
            contextDigest: admitted.record.admission.settingsContextDigest,
        })
        await expect(decodeRisuSave(loaded.bytes)).resolves.toEqual(originalSnapshot)
        expect(originalSnapshot).not.toHaveProperty('temperature')

        const restarted = harness.makeOwner(harness.makeJournal())
        await expect(restarted.loadExecution(operationId)).resolves.toMatchObject({
            status: 'blocked',
            reason: 'settings_context_unavailable',
        })
        expect(restarted.loadSettingsSnapshot(operationId)).toMatchObject({
            status: 'blocked',
            reason: 'settings_context_unavailable',
        })
        await expect(restarted.beginTransform(operationId)).resolves.toEqual({
            status: 'blocked',
            reason: 'settings_context_unavailable',
        })
        await expect(restarted.recoverAll()).resolves.toMatchObject([{
            operationId,
            status: 'blocked',
            reason: 'settings_context_unavailable',
        }])
    })

    it('bounds volatile settings contexts across chats before admitting another command', async () => {
        const harness = makeHarness()
        const owner = harness.makeOwner()
        const commandFor = (index: number) => {
            const chat = { ...baseChat(), id: `chat-${index}` }
            const charId = `char-${index}`
            harness.runtime.database.characters.push({
                chaId: charId,
                chats: [{ id: chat.id, name: 'Chat', _stub: true }],
            })
            harness.runtime.fullStore.set(charId, new Map([[chat.id, chat]]))
            return {
                ...admission(`operation-input-capacity-${index}`),
                inputCommandId: `input-capacity-${index}`,
                userMessageId: `user-capacity-${index}`,
                charId,
                chatId: chat.id,
                submittedBaseRevision: revision(chat),
            }
        }
        const first = commandFor(2)
        const second = commandFor(3)
        const refused = commandFor(4)

        await expect(owner.admit(first)).resolves.toMatchObject({ status: 'admitted' })
        await expect(owner.admit(second)).resolves.toMatchObject({ status: 'admitted' })
        expect(owner.settingsSnapshotStats()).toMatchObject({ contexts: 2, maxContexts: 2 })
        await expect(owner.admit(refused)).resolves.toEqual({
            status: 'conflict',
            reason: 'settings_context_capacity',
        })
        expect(owner.read(refused.operationId)).toBeNull()
        expect(owner.settingsSnapshotStats()).toMatchObject({ contexts: 2 })
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

    it('admits N+1 outside canonical chat and advances only after N publishes', async () => {
        const harness = makeHarness()
        const owner = harness.makeOwner()
        const firstOperation = 'operation-input-sequence-1'
        await owner.admit(admission(firstOperation))
        await owner.beginTransform(firstOperation)
        const attached = await owner.attachTransformed(firstOperation, harness.transformed(firstOperation))

        const secondOperation = 'operation-input-sequence-2'
        const secondAdmission = {
            ...admission(secondOperation),
            submittedBaseRevision: attached.record.executionBaseRevision,
        }
        const attachedChat = harness.runtime.fullStore.get('char-1')?.get('chat-1') as any
        await expect(owner.admit({
            ...secondAdmission,
            inputCommandId: `input-${firstOperation}`,
        })).resolves.toMatchObject({
            status: 'conflict',
            reason: 'input_command_identity_conflict',
            existingOperationId: firstOperation,
        })
        await expect(owner.admit(secondAdmission)).resolves.toMatchObject({
            status: 'admitted',
            record: {
                admissionSeq: 2,
                queuePredecessorId: firstOperation,
                executionPredecessorId: firstOperation,
            },
        })
        expect(harness.runtime.fullStore.get('char-1')?.get('chat-1')).toEqual(attachedChat)
        expect(owner.pendingProjection('char-1', 'chat-1')).toMatchObject([{
            operationId: secondOperation,
            predecessorOperationId: firstOperation,
            state: 'waiting_predecessor',
        }])
        await expect(owner.loadExecution(secondOperation)).resolves.toMatchObject({
            status: 'waiting',
            reason: 'predecessor_active',
            predecessorOperationId: firstOperation,
        })
        await expect(owner.admit({
            ...secondAdmission,
            operationId: 'operation-input-sequence-3',
            inputCommandId: 'input-operation-input-sequence-3',
            userMessageId: 'user-operation-input-sequence-3',
        })).resolves.toMatchObject({
            status: 'conflict',
            reason: 'chat_input_queue_full',
            blockingOperationIds: [firstOperation, secondOperation],
        })
        const resultChat = {
            ...attachedChat,
            message: [
                ...attachedChat.message,
                { role: 'char', data: 'first answer', chatId: 'assistant-sequence-1' },
            ],
        }
        const resultRevision = revision(resultChat)
        expect(owner.settleSynchronously(firstOperation, 'completed', resultRevision)).toBe(true)
        expect(owner.settingsSnapshotStats()).toMatchObject({ contexts: 1 })
        await expect(owner.loadExecution(secondOperation)).resolves.toMatchObject({
            status: 'waiting',
            reason: 'predecessor_publication_pending',
        })

        harness.runtime.fullStore.get('char-1')?.set('chat-1', resultChat)
        await expect(owner.loadExecution(secondOperation)).resolves.toMatchObject({
            status: 'transform-required',
            chat: resultChat,
            record: {
                effectiveBaseRevision: resultRevision,
                predecessorResolution: {
                    operationId: firstOperation,
                    state: 'completed',
                    revision: resultRevision,
                },
            },
        })
        expect(JSON.parse(harness.kvGet(operationStateKey(secondOperation)).toString('utf8')))
            .toMatchObject({
                state: 'queued',
                baseChatRevision: resultRevision,
                serverBaseChatRevision: resultRevision,
            })
        await expect(owner.beginTransform(secondOperation)).resolves.toMatchObject({
            status: 'started',
        })
        await expect(owner.attachTransformed(
            secondOperation,
            harness.transformed(secondOperation, 'hello', resultChat),
        )).resolves.toMatchObject({ status: 'attached', publication: 'published' })
        expect(harness.runtime.fullStore.get('char-1')?.get('chat-1')?.message.at(-1))
            .toMatchObject({ chatId: `user-${secondOperation}`, data: 'hello' })
    })

    it.each(['failed', 'cancelled'] as const)(
        'advances N+1 over an input-only predecessor that settles %s',
        async (terminalState) => {
            const harness = makeHarness()
            const owner = harness.makeOwner()
            const firstOperation = `operation-input-lineage-${terminalState}-1`
            await owner.admit(admission(firstOperation))
            await owner.beginTransform(firstOperation)
            const attached = await owner.attachTransformed(
                firstOperation,
                harness.transformed(firstOperation),
            )
            const secondOperation = `operation-input-lineage-${terminalState}-2`
            await owner.admit({
                ...admission(secondOperation),
                submittedBaseRevision: attached.record.executionBaseRevision,
            })
            expect(owner.settleSynchronously(firstOperation, terminalState)).toBe(true)

            await expect(owner.loadExecution(secondOperation)).resolves.toMatchObject({
                status: 'transform-required',
                record: {
                    effectiveBaseRevision: attached.record.executionBaseRevision,
                    predecessorResolution: {
                        operationId: firstOperation,
                        state: terminalState,
                    },
                },
            })
        },
    )

    it('advances N+1 over a cancelled predecessor that never attached input', async () => {
        const harness = makeHarness()
        const owner = harness.makeOwner()
        const firstOperation = 'operation-input-lineage-cancel-before-1'
        const secondOperation = 'operation-input-lineage-cancel-before-2'
        await owner.admit(admission(firstOperation))
        await owner.admit(admission(secondOperation))
        expect(owner.settleSynchronously(firstOperation, 'cancelled')).toBe(true)

        await expect(owner.loadExecution(secondOperation)).resolves.toMatchObject({
            status: 'transform-required',
            chat: baseChat(),
            record: {
                effectiveBaseRevision: revision(baseChat()),
                predecessorResolution: {
                    operationId: firstOperation,
                    state: 'cancelled',
                },
            },
        })
    })

    it('keeps the oldest unresolved execution dependency after a waiting admission is cancelled', async () => {
        const harness = makeHarness()
        const owner = harness.makeOwner()
        const firstOperation = 'operation-input-cancel-skip-1'
        const cancelledOperation = 'operation-input-cancel-skip-2'
        const thirdOperation = 'operation-input-cancel-skip-3'

        await owner.admit(admission(firstOperation))
        await owner.beginTransform(firstOperation)
        const attached = await owner.attachTransformed(
            firstOperation,
            harness.transformed(firstOperation),
        )
        await owner.admit({
            ...admission(cancelledOperation),
            submittedBaseRevision: attached.record.executionBaseRevision,
        })
        expect(owner.settleSynchronously(cancelledOperation, 'cancelled')).toBe(true)

        await expect(owner.admit({
            ...admission(thirdOperation),
            submittedBaseRevision: attached.record.executionBaseRevision,
        })).resolves.toMatchObject({
            status: 'admitted',
            record: {
                admissionSeq: 3,
                queuePredecessorId: cancelledOperation,
                executionPredecessorId: firstOperation,
            },
        })
        await expect(owner.loadExecution(thirdOperation)).resolves.toMatchObject({
            status: 'waiting',
            reason: 'predecessor_active',
            predecessorOperationId: firstOperation,
        })
        await expect(owner.beginTransform(thirdOperation)).resolves.toMatchObject({
            status: 'waiting',
            predecessorOperationId: firstOperation,
        })
    })

    it('starts a fresh head from a current user-edited revision after the prior operation completed', async () => {
        const harness = makeHarness()
        const owner = harness.makeOwner()
        const firstOperation = 'operation-input-completed-edit-1'
        const secondOperation = 'operation-input-completed-edit-2'

        await owner.admit(admission(firstOperation))
        await owner.beginTransform(firstOperation)
        const attached = await owner.attachTransformed(
            firstOperation,
            harness.transformed(firstOperation),
        )
        const attachedChat = harness.runtime.fullStore.get('char-1')?.get('chat-1') as any
        const resultChat = {
            ...attachedChat,
            message: [
                ...attachedChat.message,
                { role: 'char', data: 'first answer', chatId: 'assistant-completed-edit-1' },
            ],
        }
        const resultRevision = revision(resultChat)
        expect(owner.settleSynchronously(firstOperation, 'completed', resultRevision)).toBe(true)
        expect(owner.markResultPublishedSynchronously(firstOperation, resultRevision)).toBe(true)
        const editedChat = {
            ...resultChat,
            message: resultChat.message.map((message: any) => (
                message.chatId === 'assistant-completed-edit-1'
                    ? { ...message, data: 'user edited answer' }
                    : message
            )),
        }
        harness.runtime.fullStore.get('char-1')?.set('chat-1', editedChat)

        await expect(owner.admit({
            ...admission(secondOperation),
            submittedBaseRevision: revision(editedChat),
        })).resolves.toMatchObject({
            status: 'admitted',
            record: {
                queuePredecessorId: firstOperation,
                executionPredecessorId: null,
                effectiveBaseRevision: revision(editedChat),
            },
        })
        await expect(owner.loadExecution(secondOperation)).resolves.toMatchObject({
            status: 'transform-required',
            chat: editedChat,
            record: {
                predecessorResolution: null,
                effectiveBaseRevision: revision(editedChat),
            },
        })
    })

    it('starts a fresh head after a published answer is deleted back to the input revision', async () => {
        const harness = makeHarness()
        const owner = harness.makeOwner()
        const firstOperation = 'operation-input-published-delete-1'
        const secondOperation = 'operation-input-published-delete-2'

        await owner.admit(admission(firstOperation))
        await owner.beginTransform(firstOperation)
        const attached = await owner.attachTransformed(
            firstOperation,
            harness.transformed(firstOperation),
        )
        const attachedChat = structuredClone(
            harness.runtime.fullStore.get('char-1')?.get('chat-1'),
        )
        const resultChat = {
            ...attachedChat,
            message: [
                ...attachedChat.message,
                { role: 'char', data: 'deletable answer', chatId: 'assistant-published-delete-1' },
            ],
        }
        const resultRevision = revision(resultChat)
        expect(owner.settleSynchronously(firstOperation, 'completed', resultRevision)).toBe(true)
        expect(owner.markResultPublishedSynchronously(firstOperation, resultRevision)).toBe(true)
        harness.runtime.fullStore.get('char-1')?.set('chat-1', attachedChat)

        await expect(owner.admit({
            ...admission(secondOperation),
            submittedBaseRevision: attached.record.executionBaseRevision,
        })).resolves.toMatchObject({
            status: 'admitted',
            record: {
                executionPredecessorId: null,
                effectiveBaseRevision: attached.record.executionBaseRevision,
            },
        })
        await expect(owner.loadExecution(secondOperation)).resolves.toMatchObject({
            status: 'transform-required',
            chat: attachedChat,
        })
    })

    it('keeps a durably completed but unpublished result as an execution dependency', async () => {
        const harness = makeHarness()
        const owner = harness.makeOwner()
        const firstOperation = 'operation-input-unpublished-result-1'
        const secondOperation = 'operation-input-unpublished-result-2'

        await owner.admit(admission(firstOperation))
        await owner.beginTransform(firstOperation)
        const attached = await owner.attachTransformed(
            firstOperation,
            harness.transformed(firstOperation),
        )
        const attachedChat = harness.runtime.fullStore.get('char-1')?.get('chat-1') as any
        const resultChat = {
            ...attachedChat,
            message: [
                ...attachedChat.message,
                { role: 'char', data: 'pending answer', chatId: 'assistant-unpublished-result-1' },
            ],
        }
        expect(owner.settleSynchronously(
            firstOperation,
            'completed',
            revision(resultChat),
        )).toBe(true)

        await expect(owner.admit({
            ...admission(secondOperation),
            submittedBaseRevision: attached.record.executionBaseRevision,
        })).resolves.toMatchObject({
            status: 'admitted',
            record: { executionPredecessorId: firstOperation },
        })
        await expect(owner.loadExecution(secondOperation)).resolves.toMatchObject({
            status: 'waiting',
            reason: 'predecessor_publication_pending',
            predecessorOperationId: firstOperation,
        })
    })

    it('blocks an already waiting successor when the completed predecessor revision was edited', async () => {
        const harness = makeHarness()
        const owner = harness.makeOwner()
        const firstOperation = 'operation-input-waiting-edit-1'
        const secondOperation = 'operation-input-waiting-edit-2'

        await owner.admit(admission(firstOperation))
        await owner.beginTransform(firstOperation)
        const attached = await owner.attachTransformed(
            firstOperation,
            harness.transformed(firstOperation),
        )
        await owner.admit({
            ...admission(secondOperation),
            submittedBaseRevision: attached.record.executionBaseRevision,
        })
        const attachedChat = harness.runtime.fullStore.get('char-1')?.get('chat-1') as any
        const resultChat = {
            ...attachedChat,
            message: [
                ...attachedChat.message,
                { role: 'char', data: 'first answer', chatId: 'assistant-waiting-edit-1' },
            ],
        }
        expect(owner.settleSynchronously(
            firstOperation,
            'completed',
            revision(resultChat),
        )).toBe(true)
        expect(owner.markResultPublishedSynchronously(
            firstOperation,
            revision(resultChat),
        )).toBe(true)
        harness.runtime.fullStore.get('char-1')?.set('chat-1', {
            ...resultChat,
            message: resultChat.message.map((message: any) => (
                message.chatId === 'assistant-waiting-edit-1'
                    ? { ...message, data: 'edited before successor start' }
                    : message
            )),
        })

        await expect(owner.loadExecution(secondOperation)).resolves.toMatchObject({
            status: 'blocked',
            reason: 'predecessor_revision_changed',
            predecessorOperationId: firstOperation,
        })
        expect(owner.pendingProjection('char-1', 'chat-1')).toMatchObject([{
            operationId: secondOperation,
            state: 'blocked_edit',
        }])
        expect(owner.settingsSnapshotStats().contexts).toBe(0)
        await expect(owner.loadExecution(secondOperation)).resolves.toMatchObject({
            status: 'blocked',
            reason: 'predecessor_revision_changed',
        })
    })

    it('blocks N+1 when its predecessor input outcome is unknown', async () => {
        const harness = makeHarness()
        const owner = harness.makeOwner()
        const firstOperation = 'operation-input-lineage-unknown-1'
        const secondOperation = 'operation-input-lineage-unknown-2'
        await owner.admit(admission(firstOperation))
        await owner.admit(admission(secondOperation))
        await owner.beginTransform(firstOperation)
        expect(owner.markRunFailureSynchronously(firstOperation, false)).toBe(true)

        await expect(owner.loadExecution(secondOperation)).resolves.toMatchObject({
            status: 'blocked',
            reason: 'predecessor_outcome_unknown',
            predecessorOperationId: firstOperation,
        })
        expect(owner.pendingProjection('char-1', 'chat-1')).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ operationId: firstOperation, state: 'blocked_edit' }),
                expect.objectContaining({ operationId: secondOperation, state: 'blocked_edit' }),
            ]),
        )
    })

    it('blocks a non-adjacent predecessor identity instead of skipping an admitted command', async () => {
        const harness = makeHarness()
        const owner = harness.makeOwner()
        const firstOperation = 'operation-input-lineage-adjacent-1'
        const secondOperation = 'operation-input-lineage-adjacent-2'
        const thirdOperation = 'operation-input-lineage-adjacent-3'
        await owner.admit(admission(firstOperation))
        expect(owner.settleSynchronously(firstOperation, 'cancelled')).toBe(true)
        await owner.admit(admission(secondOperation))
        expect(owner.settleSynchronously(secondOperation, 'cancelled')).toBe(true)
        await owner.admit(admission(thirdOperation))

        const thirdRecord = JSON.parse(
            harness.kvGet(commandKey(thirdOperation)).toString('utf8'),
        )
        thirdRecord.queuePredecessorId = firstOperation
        harness.kvSet(commandKey(thirdOperation), JSON.stringify(thirdRecord))

        await expect(owner.loadExecution(thirdOperation)).resolves.toMatchObject({
            status: 'blocked',
            reason: 'predecessor_identity_unavailable',
        })
    })

    it('blocks a tampered execution predecessor from bypassing a newer active command', async () => {
        const harness = makeHarness()
        const owner = harness.makeOwner()
        const firstOperation = 'operation-input-execution-tamper-1'
        const secondOperation = 'operation-input-execution-tamper-2'
        const thirdOperation = 'operation-input-execution-tamper-3'

        await owner.admit(admission(firstOperation))
        expect(owner.settleSynchronously(firstOperation, 'cancelled')).toBe(true)
        await owner.admit(admission(secondOperation))
        await owner.beginTransform(secondOperation)
        const attached = await owner.attachTransformed(
            secondOperation,
            harness.transformed(secondOperation),
        )
        await owner.admit({
            ...admission(thirdOperation),
            submittedBaseRevision: attached.record.executionBaseRevision,
        })

        const thirdRecord = JSON.parse(
            harness.kvGet(commandKey(thirdOperation)).toString('utf8'),
        )
        thirdRecord.executionPredecessorId = firstOperation
        harness.kvSet(commandKey(thirdOperation), JSON.stringify(thirdRecord))

        await expect(owner.loadExecution(thirdOperation)).resolves.toMatchObject({
            status: 'blocked',
            reason: 'predecessor_identity_unavailable',
            predecessorOperationId: secondOperation,
        })
    })

    it('blocks before provider work when input globals changed concurrently', async () => {
        const harness = makeHarness()
        const owner = harness.makeOwner()
        const operationId = 'operation-input-global-conflict-1'
        await owner.admit(admission(operationId))
        await owner.beginTransform(operationId)
        harness.runtime.database.globalChatVariables.mood = 'newer-user-value'

        await expect(owner.attachTransformed(
            operationId,
            harness.transformed(operationId),
        )).resolves.toMatchObject({
            status: 'blocked',
            reason: 'global_variables_changed',
            record: { inputState: 'blocked_edit' },
        })
        expect(harness.runtime.fullStore.get('char-1')?.get('chat-1')).toEqual(baseChat())
        expect(harness.runtime.database.globalChatVariables).toEqual({ mood: 'newer-user-value' })
        expect(owner.pendingProjection('char-1', 'chat-1')).toMatchObject([{
            operationId,
            state: 'blocked_edit',
            cancelAllowed: false,
        }])
        expect(owner.settingsSnapshotStats()).toMatchObject({ contexts: 0, bytes: 0 })
    })

    it('defers provider work when globals change after the durable attach write', async () => {
        const harness = makeHarness()
        const owner = harness.makeOwner()
        const operationId = 'operation-input-publication-conflict-1'
        await owner.admit(admission(operationId))
        await owner.beginTransform(operationId)
        harness.runtime.ensureCanonicalHook = () => {
            harness.runtime.ensureCanonicalHook = null
            harness.runtime.database.globalChatVariables.mood = 'newer-publication-value'
        }

        await expect(owner.attachTransformed(
            operationId,
            harness.transformed(operationId),
        )).resolves.toMatchObject({
            status: 'attached',
            publication: 'pending_recovery',
        })
        expect(harness.runtime.fullStore.get('char-1')?.get('chat-1')).toEqual(baseChat())
        expect(harness.runtime.database.globalChatVariables)
            .toEqual({ mood: 'newer-publication-value' })
        await expect(owner.loadExecution(operationId)).resolves.toMatchObject({
            status: 'blocked',
            reason: 'attached_chat_changed',
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

    it('republishes a durable attached input before reporting restart settings loss', async () => {
        const harness = makeHarness()
        const owner = harness.makeOwner()
        const operationId = 'operation-input-republish-before-settings-1'
        await owner.admit(admission(operationId))
        await owner.beginTransform(operationId)
        await owner.attachTransformed(
            operationId,
            harness.transformed(operationId),
        )

        harness.runtime.database = {
            characters: [{
                chaId: 'char-1',
                chats: [{ id: 'chat-1', name: 'Chat', _stub: true }],
            }],
            globalChatVariables: { mood: 'old' },
        }
        harness.runtime.fullStore = new Map([
            ['char-1', new Map([['chat-1', baseChat()]])],
        ])
        const restarted = harness.makeOwner(harness.makeJournal())

        await expect(restarted.loadExecution(operationId)).resolves.toMatchObject({
            status: 'blocked',
            reason: 'settings_context_unavailable',
        })
        expect(harness.runtime.fullStore.get('char-1')?.get('chat-1')?.message.at(-1))
            .toMatchObject({ chatId: `user-${operationId}`, data: 'hello' })
    })

    it.each(['failed', 'cancelled'] as const)(
        'recovers a durably attached input after the operation settles as %s',
        async (terminalState) => {
            const harness = makeHarness()
            const owner = harness.makeOwner()
            const operationId = `operation-input-terminal-recover-${terminalState}`
            await owner.admit(admission(operationId))
            await owner.beginTransform(operationId)
            const attached = await owner.attachTransformed(
                operationId,
                harness.transformed(operationId),
            )
            expect(owner.settleSynchronously(
                operationId,
                terminalState,
                attached.record.executionBaseRevision,
            )).toBe(true)

            harness.runtime.database = {
                characters: [{
                    chaId: 'char-1',
                    chats: [{ id: 'chat-1', name: 'Chat', _stub: true }],
                }],
                globalChatVariables: { mood: 'old' },
            }
            harness.runtime.fullStore = new Map([
                ['char-1', new Map([['chat-1', baseChat()]])],
            ])

            await expect(harness.makeOwner(harness.makeJournal()).recoverAll())
                .resolves.toMatchObject([{ operationId, status: 'attached' }])
            expect(harness.runtime.fullStore.get('char-1')?.get('chat-1')?.message.at(-1))
                .toMatchObject({ chatId: `user-${operationId}` })
            expect(harness.runtime.database.globalChatVariables).toEqual({ mood: 'input' })
            expect(owner.read(operationId)).toMatchObject({ inputState: terminalState })
        },
    )

    it('keeps a newer canonical descendant while recovering an attached terminal input', async () => {
        const harness = makeHarness()
        const owner = harness.makeOwner()
        const operationId = 'operation-input-descendant-recover-1'
        await owner.admit(admission(operationId))
        await owner.beginTransform(operationId)
        const attached = await owner.attachTransformed(
            operationId,
            harness.transformed(operationId),
        )
        expect(owner.settleSynchronously(
            operationId,
            'completed',
            attached.record.executionBaseRevision,
        )).toBe(true)
        const attachedChat = harness.runtime.fullStore.get('char-1')?.get('chat-1') as any
        const descendant = {
            ...attachedChat,
            message: [
                ...attachedChat.message,
                { role: 'char', data: 'newer reply', chatId: 'assistant-descendant' },
            ],
        }
        harness.runtime.fullStore.get('char-1')?.set('chat-1', descendant)
        const schedulesBeforeRecovery = harness.runtime.schedules

        await expect(harness.makeOwner(harness.makeJournal()).recoverAll())
            .resolves.toMatchObject([{ operationId, status: 'attached' }])
        expect(harness.runtime.fullStore.get('char-1')?.get('chat-1')).toBe(descendant)
        expect(harness.runtime.schedules).toBe(schedulesBeforeRecovery)
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

        await expect(owner.recoverAll()).resolves.toMatchObject([{
            operationId,
            status: 'blocked',
            reason: 'transform_outcome_unknown',
        }])
        expect(owner.settingsSnapshotStats()).toMatchObject({ contexts: 0, bytes: 0 })
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
        for (const failureAt of [1, 2, 3]) {
            const failureHarness = makeHarness()
            const failureOwner = failureHarness.makeOwner()
            failureHarness.failWriteAt(failureAt)
            await expect(failureOwner.admit(
                admission(`operation-input-failure-${failureAt}`),
            )).rejects.toThrow('injected-input-write-failure')
            expect(failureHarness.kvList(SERVER_CHAT_INPUT_COMMAND_PREFIX)).toEqual([])
            expect(failureOwner.loadSettingsSnapshot(
                `operation-input-failure-${failureAt}`,
            )).toEqual({ status: 'missing' })
        }

        const harness = makeHarness()
        const owner = harness.makeOwner()
        const operationId = 'operation-input-discard-1'
        await owner.admit(admission(operationId))
        harness.kvSet(operationResultKey(operationId), JSON.stringify({ operationId }))
        expect(owner.loadSettingsSnapshot(operationId)).toMatchObject({ status: 'ready' })
        owner.discardRecovery()
        expect(harness.kvGet(commandKey(operationId))).toBeNull()
        expect(owner.loadSettingsSnapshot(operationId)).toEqual({ status: 'missing' })
        expect(owner.settingsSnapshotStats()).toMatchObject({ contexts: 0, bytes: 0 })
        expect(harness.kvGet(operationStateKey(operationId))).toBeNull()
        expect(harness.kvGet(operationResultKey(operationId))).toBeNull()
    })
})
