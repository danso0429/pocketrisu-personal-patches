import { createRequire } from 'node:module'
import crypto from 'node:crypto'
import { describe, expect, test } from 'vitest'

const require = createRequire(import.meta.url)

async function optionalImport<T>(path: string): Promise<T | null> {
    try { return await import(/* @vite-ignore */ path) as T } catch { return null }
}

describe('[E2-3c] Rebuild the storage reset barrier over native 1.16.1', () => {
    test('[new] c5 invalidates pre-reset sessions while preserving native fresh passive and takeover states', () => {
        const { createSessionLock } = require('./session-lock.cjs')
        let clock = 1_000
        const lock = createSessionLock({ now: () => clock })
        lock.register('old')
        expect(lock.checkWrite('old')).toEqual({ ok: true })
        expect(typeof lock.invalidateBefore, 'reset invalidation API exists').toBe('function')
        lock.invalidateBefore(clock)
        expect(lock.checkWrite('old')).toEqual({ ok: false })

        clock = 2_000
        lock.register('new')
        expect(lock.peek('new')).toBe('fresh')
        expect(lock.checkWrite('new', false)).toEqual({ ok: true, passive: true })
        expect(lock.checkWrite('new', true)).toEqual({ ok: true, tookOver: true })
    })

    test('[new] c6 exposes the epoch-aware server chat commit owner', async () => {
        const subject = await optionalImport<any>('./serverChatCommit.cjs')
        expect(subject, 'serverChatCommit owned module exists').not.toBeNull()
        expect(typeof subject!.createServerChatCommitter).toBe('function')
    })

    test('[new] c7 exposes only the specified reset gate and trace hook surface', async () => {
        const subject = await optionalImport<any>('./storageResetTestHooks.cjs')
        expect(subject, 'storageResetTestHooks owned module exists').not.toBeNull()
        expect(typeof subject!.waitAtAdmissionGate).toBe('function')
        expect(typeof subject!.waitAtResetGate).toBe('function')
        expect(typeof subject!.trace).toBe('function')
    })

    test('[new] c6 a commit captured under the previous storage epoch is rejected without writes', async () => {
        const subject = await optionalImport<any>('./serverChatCommit.cjs')
        const journalModule = await optionalImport<any>('./chatWriteJournal.cjs')
        const kv = new Map<string, Buffer>()
        const get = (key: string) => kv.get(key) ?? null
        const set = (key: string, value: string | Uint8Array) => { kv.set(key, Buffer.from(value)) }
        const del = (key: string) => kv.delete(key)
        const list = (prefix: string) => [...kv.keys()].filter(key => key.startsWith(prefix))
        const stable = subject?.stableJSON ?? JSON.stringify
        const revision = (value: unknown) => crypto.createHash('sha256').update(stable(value)).digest('hex')
        const payload = { id: 'chat-1', name: 'epoch test', message: [{ role: 'user', data: 'before', chatId: 'm1' }] }
        const request = {
            contractVersion: subject?.SERVER_CHAT_COMMIT_CONTRACT ?? 'bg_server_chat_commit.v1',
            operationId: 'epoch-test-0001', resultId: 'result-0001', publishSeq: 1,
            requestedCharId: 'char-1', requestedChatId: 'chat-1', storedChatId: 'chat-1',
            baseChatRevision: 'base-revision', storedRevision: revision(payload),
            settingsDigest: revision({ settings: true }), executionContextId: 'context-1',
            archiveCenterRequestCorrelationId: 'correlation-1', prepareKey: 'prepare-1',
            prepareFingerprint: revision({ prepare: true }), bindingEpoch: 'binding-1', hostChangeSeq: 2,
            inputReceipt: {
                contractVersion: subject?.SERVER_CHAT_INPUT_RECEIPT_CONTRACT ?? 'bg_server_input_receipt.v1',
                receiptId: 'receipt-1', inputCommandId: 'command-1', operationId: 'epoch-test-0001',
                charId: 'char-1', chatId: 'chat-1', messageId: 'm1', role: 'user',
                revision: 'base-revision', hostChangeSeq: 1,
            },
            claimEpoch: 3, chat: payload,
            metadata: { id: 'chat-1', name: 'epoch test', _stub: true },
            hostChangeIntent: {
                contractVersion: subject?.HOST_CHANGE_INTENT_CONTRACT ?? 'pocketrisu_host_change_intent.v1',
                eventId: 'event-1', hostInstanceId: 'host-1', charId: 'char-1', chatId: 'chat-1',
                bindingEpoch: 'binding-1', seq: 2, previousSeq: 1, operationId: 'epoch-test-0001',
                kind: 'response_commit', beforeRevision: 'base-revision', afterRevision: revision(payload),
                messageIdentities: ['m1'], sourceGeneration: 'generation-1',
                committedAt: '2026-10-26T00:00:00.000Z', payloadRef: subject?.commitStorageKey?.('epoch-test-0001') ?? 'payload-1', delivery: 'pending',
            },
            owners: [{
                messageId: 'm1', sourceRevision: revision(payload), sourceGeneration: 'generation-1',
                operationId: 'epoch-test-0001', authority: 'server', acState: 'pending', automaticBackfill: 'excluded',
            }],
            effectIntents: { globalVariables: { changed: {}, deleted: [], expected: {} }, staticsMessagesDelta: 0 },
            acOwner: 'server', acState: 'pending', readyForNextTurn: false, awaitingMetadata: true,
            committedAt: '2026-10-26T00:00:00.000Z',
        }
        set('revision/char-1/chat-1', 'base-revision')
        set('operation/epoch-test-0001', stable({
            operationId: request.operationId, charId: 'char-1', chatId: 'chat-1', claimEpoch: 3,
            state: 'result-ready', storageEpoch: 1,
        }))
        const before = new Map(kv)
        if (!subject || !journalModule) {
            set('canonical/chat-1', stable(payload))
            expect({ status: 'committed', reason: null }).toMatchObject({ status: 'conflict', reason: 'storage_epoch_changed' })
            return
        }
        const journal = journalModule.createChatWriteJournal({
            kvGet: get, kvSet: set, kvDel: del, kvList: list,
            encode: (value: unknown) => Buffer.from(stable(value)),
            decode: async (value: Uint8Array) => JSON.parse(Buffer.from(value).toString()),
        })
        const committer = subject.createServerChatCommitter({
            journal, kvGet: get, kvSet: set, kvList: list,
            queueStorageOperation: async (operation: () => unknown) => operation(),
            runTransaction: (operation: () => unknown) => operation(),
            readCurrentRevision: () => 'base-revision',
            readOperationState: () => JSON.parse(get('operation/epoch-test-0001')!.toString()),
            readCurrentStorageEpoch: () => 2,
            calculateRevision: revision,
            writeCanonicalState: () => { set('canonical/chat-1', stable(payload)); return {} },
            writeCommittedOperationState: () => ({ written: true }),
            publishCanonicalState: async () => {},
        })
        const outcome = await committer.commit(request)
        expect(outcome).toMatchObject({ status: 'conflict', reason: 'storage_epoch_changed' })
        expect(kv).toEqual(before)
    })
})
