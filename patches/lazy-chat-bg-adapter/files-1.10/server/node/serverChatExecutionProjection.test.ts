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
            statics: { messages: 12, bgOrchestrationApplied: [] },
        }

        expect(copyServerOwnedRootState(current, incoming)).toEqual({
            serverChatCommitApplied: current.serverChatCommitApplied,
            bgOrchestrationGlobalConflicts: current.bgOrchestrationGlobalConflicts,
            serverChatExecutionState: current.serverChatExecutionState,
            statics: {
                messages: 12,
                bgOrchestrationApplied: current.statics.bgOrchestrationApplied,
            },
        })
        expect(copyServerOwnedRootState({}, incoming)).toEqual({ statics: { messages: 12 } })
    })
})
