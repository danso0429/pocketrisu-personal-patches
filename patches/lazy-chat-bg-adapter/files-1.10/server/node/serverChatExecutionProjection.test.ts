import crypto from 'node:crypto'
import { describe, expect, it } from 'vitest'
import commitPackage from './serverChatCommit.cjs'
import projectionPackage from './serverChatExecutionProjection.cjs'

const { stableJSON } = commitPackage as any
const {
    SERVER_CHAT_EXECUTION_FIELD,
    applyCommitProjection,
    copyServerOwnedRootState,
    projectChatExecution,
    readProjectionStore,
} = projectionPackage as any

function hash(value: unknown): string {
    return crypto.createHash('sha256').update(stableJSON(value)).digest('hex')
}

function message(role: 'user' | 'char', data: string, chatId: string) {
    return { role, data, chatId }
}

function record(
    operationId: string,
    commitSequence: number,
    chatRevision: string,
    ownedMessage: ReturnType<typeof message>,
) {
    return {
        operationId,
        commitSequence,
        recovery: {
            requestedCharId: 'char-1',
            storedChatId: 'chat-1',
            storedRevision: chatRevision,
            bindingEpoch: `ac-disabled-${operationId}`,
            hostChangeSeq: 1,
            owners: [{
                messageId: ownedMessage.chatId,
                sourceRevision: hash(ownedMessage),
                sourceGeneration: hash({ operationId, messageId: ownedMessage.chatId }),
                operationId,
                authority: 'server',
                acState: 'disabled',
                automaticBackfill: 'eligible',
            }],
        },
    }
}

describe('server chat execution projection', () => {
    it('accumulates matching message owners across committed revisions', () => {
        const input = message('user', 'hello', 'user-1')
        const first = message('char', 'first', 'assistant-1')
        const secondInput = message('user', 'again', 'user-2')
        const second = message('char', 'second', 'assistant-2')
        const firstChat = { id: 'chat-1', message: [input, first] }
        const secondChat = { id: 'chat-1', message: [input, first, secondInput, second] }
        const database: Record<string, unknown> = {}
        const firstRecord = record('operation-projection-1', 1, hash(firstChat), first)
        const secondRecord = record('operation-projection-2', 2, hash(secondChat), second)

        applyCommitProjection(database, firstRecord, firstChat)
        applyCommitProjection(database, secondRecord, secondChat)

        expect(projectChatExecution({
            database,
            records: [secondRecord, firstRecord],
            chat: secondChat,
            charId: 'char-1',
            chatId: 'chat-1',
            chatRevision: hash(secondChat),
        })).toMatchObject({
            contract: 'bg_chat_execution_projection.v1',
            chatRevision: hash(secondChat),
            coverage: 'authoritative',
            owners: [
                { messageId: 'assistant-1', operationId: 'operation-projection-1' },
                { messageId: 'assistant-2', operationId: 'operation-projection-2' },
            ],
            pendingInputCommands: [],
        })
    })

    it('drops only an edited or removed message generation from current coverage', () => {
        const input = message('user', 'hello', 'user-1')
        const first = message('char', 'first', 'assistant-1')
        const second = message('char', 'second', 'assistant-2')
        const original = { id: 'chat-1', message: [input, first, second] }
        const database: Record<string, unknown> = {}
        const firstRecord = record('operation-projection-edit-1', 1, hash(original), first)
        const secondRecord = record('operation-projection-edit-2', 2, hash(original), second)
        applyCommitProjection(database, firstRecord, original)
        applyCommitProjection(database, secondRecord, original)
        const edited = {
            ...original,
            message: [input, { ...first, data: 'edited' }, second],
        }

        expect(projectChatExecution({
            database,
            records: [],
            chat: edited,
            charId: 'char-1',
            chatId: 'chat-1',
            chatRevision: hash(edited),
        })?.owners).toMatchObject([
            { messageId: 'assistant-2', operationId: 'operation-projection-edit-2' },
        ])
    })

    it('does not turn a chat with no durable owner history into authoritative empty coverage', () => {
        expect(projectChatExecution({
            database: {},
            records: [],
            chat: { id: 'chat-1', message: [] },
            charId: 'char-1',
            chatId: 'chat-1',
            chatRevision: hash({ id: 'chat-1', message: [] }),
        })).toBeNull()
    })

    it('fails closed on malformed stores and duplicate recovery sequences', () => {
        expect(() => readProjectionStore({
            [SERVER_CHAT_EXECUTION_FIELD]: {
                contractVersion: 'bg_chat_execution_store.v1',
                entries: [{ charId: 'char-1' }],
            },
        })).toThrow('entry is invalid')

        const answer = message('char', 'answer', 'assistant-1')
        const chat = { id: 'chat-1', message: [answer] }
        const first = record('operation-projection-dup-1', 3, hash(chat), answer)
        const second = record('operation-projection-dup-2', 3, hash(chat), answer)
        expect(() => projectChatExecution({
            database: {},
            records: [first, second],
            chat,
            charId: 'char-1',
            chatId: 'chat-1',
            chatRevision: hash(chat),
        })).toThrow('duplicate sequences')
    })

    it('preserves only current server-owned root state across a client database write', () => {
        const current = {
            serverChatCommitApplied: [{ operationId: 'operation-root-1' }],
            bgOrchestrationGlobalConflicts: [{ operationId: 'operation-root-1' }],
            serverChatExecutionState: {
                contractVersion: 'bg_chat_execution_store.v1',
                entries: [],
            },
            statics: { messages: 11, bgOrchestrationApplied: [{ operationId: 'operation-root-1' }] },
        }
        const incoming = {
            serverChatCommitApplied: [{ operationId: 'forged-operation' }],
            bgOrchestrationGlobalConflicts: [],
            serverChatExecutionState: { contractVersion: 'forged', entries: [] },
            statics: { messages: 11, bgOrchestrationApplied: [] },
        }

        expect(copyServerOwnedRootState(current, incoming)).toEqual({
            serverChatCommitApplied: current.serverChatCommitApplied,
            bgOrchestrationGlobalConflicts: current.bgOrchestrationGlobalConflicts,
            serverChatExecutionState: current.serverChatExecutionState,
            statics: {
                messages: 11,
                browserMessageEffects: [],
                bgOrchestrationApplied: current.statics.bgOrchestrationApplied,
            },
        })
        expect(copyServerOwnedRootState({}, incoming)).toEqual({ statics: { messages: 11 } })
        expect(copyServerOwnedRootState(current, {})).toEqual({
            serverChatCommitApplied: current.serverChatCommitApplied,
            bgOrchestrationGlobalConflicts: current.bgOrchestrationGlobalConflicts,
            serverChatExecutionState: current.serverChatExecutionState,
            statics: {
                messages: 11,
                browserMessageEffects: [],
                bgOrchestrationApplied: current.statics.bgOrchestrationApplied,
            },
        })
        expect(() => copyServerOwnedRootState(current, {
            statics: { messages: 10 },
        })).toThrow('browser statistic effect identity required')
    })

    it('applies each browser statistic effect once despite a concurrent BG commit or lost response', () => {
        const server = {
            serverChatCommitApplied: [{ operationId: 'operation-root-1' }],
            statics: {
                messages: 11,
                bgOrchestrationApplied: [{ operationId: 'operation-root-1', cumulative: 1 }],
            },
        }
        const attempt = { id: 'browser-attempt-1', delta: 1, createdAt: Date.now() }
        const incoming = {
            statics: { messages: 12, browserMessageEffects: [attempt] },
        }
        expect(() => copyServerOwnedRootState(server, {
            statics: { messages: 11, browserMessageEffects: [attempt] },
        })).toThrow('browser statistic effect identity required')
        const first = copyServerOwnedRootState(server, incoming)
        expect(first.statics).toMatchObject({
            messages: 12,
            browserMessageEffects: [attempt],
            bgOrchestrationApplied: server.statics.bgOrchestrationApplied,
        })
        const replay = copyServerOwnedRootState(first, {
            statics: { messages: 12, browserMessageEffects: [attempt] },
        })
        expect(replay.statics.messages).toBe(12)
        expect(replay.statics.browserMessageEffects).toEqual([attempt])
    })

    it('compacts expired browser identities without losing their count or admitting a replay', () => {
        const old = {
            id: 'browser-old-attempt-1',
            delta: 1,
            createdAt: Date.now() - 15 * 24 * 60 * 60 * 1000,
        }
        const current = { statics: { messages: 11, browserMessageEffects: [old] } }
        const compacted = copyServerOwnedRootState(current, current)
        expect(compacted.statics).toEqual({
            messages: 11,
            browserMessageEffects: [],
            browserMessageEffectCutoff: old.createdAt,
        })
        expect(() => copyServerOwnedRootState(compacted, {
            statics: { messages: 12, browserMessageEffects: [old] },
        })).toThrow('outside the recovery window')
        const fresh = {
            id: 'browser-fresh-attempt-1', delta: 1, createdAt: Date.now(),
        }
        expect(copyServerOwnedRootState(compacted, {
            statics: { messages: 12, browserMessageEffects: [fresh] },
        }).statics).toEqual({
            messages: 12,
            browserMessageEffects: [fresh],
            browserMessageEffectCutoff: old.createdAt,
        })
    })
})
