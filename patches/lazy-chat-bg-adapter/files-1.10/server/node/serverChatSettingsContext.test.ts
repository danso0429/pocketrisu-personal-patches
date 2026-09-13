import { describe, expect, it } from 'vitest'
import settingsPackage from './serverChatSettingsContext.cjs'

const { DYNAMIC_ROOT_FIELDS, overlayServerChatDynamicState } = settingsPackage as any

function snapshotDatabase() {
    return {
        temperature: 0.2,
        globalChatVariables: { turn: 'before' },
        statics: { messages: 10 },
        serverChatCommitApplied: [{ operationId: 'old-operation' }],
        bgOrchestrationGlobalConflicts: [{ operationId: 'old-conflict' }],
        serverChatExecutionState: { entries: [{ chatId: 'old-chat' }] },
        bgOrchestrationDeliveries: [{ operationId: 'old-delivery' }],
        characters: [{
            chaId: 'char-1',
            systemPrompt: 'frozen prompt',
            chats: [{ id: 'chat-1', name: 'Before', _stub: true }],
        }],
    }
}

function currentDatabase() {
    return {
        temperature: 1.7,
        globalChatVariables: { turn: 'predecessor-result' },
        statics: { messages: 11, bgOrchestrationApplied: [{ operationId: 'operation-1' }] },
        serverChatCommitApplied: [{ operationId: 'operation-1' }],
        bgOrchestrationGlobalConflicts: [],
        serverChatExecutionState: { entries: [{ chatId: 'chat-1' }] },
        bgOrchestrationDeliveries: [{ operationId: 'operation-1' }],
        characters: [{
            chaId: 'char-1',
            systemPrompt: 'later edit',
            chats: [{ id: 'chat-1', name: 'After', _stub: true, lastDate: 2 }],
        }],
    }
}

describe('server chat settings context overlay', () => {
    it('keeps frozen settings while adopting caller-supplied dynamic roots', () => {
        const snapshot = snapshotDatabase()
        const current = currentDatabase()
        const result = overlayServerChatDynamicState(snapshot, current)

        expect(result.temperature).toBe(0.2)
        expect(result.characters[0].systemPrompt).toBe('frozen prompt')
        expect(result.characters[0].chats).toEqual(snapshotDatabase().characters[0].chats)
        for (const field of DYNAMIC_ROOT_FIELDS) {
            expect(result[field]).toEqual((current as any)[field])
            expect(result[field]).not.toBe((current as any)[field])
        }
        expect(current.temperature).toBe(1.7)
        expect(current.characters[0].systemPrompt).toBe('later edit')
    })

    it('fails closed when either database is unavailable', () => {
        expect(() => overlayServerChatDynamicState(
            null,
            currentDatabase(),
        )).toThrow('snapshot settings database is invalid')
        expect(() => overlayServerChatDynamicState(
            snapshotDatabase(),
            null,
        )).toThrow('current settings database is invalid')
    })
})
