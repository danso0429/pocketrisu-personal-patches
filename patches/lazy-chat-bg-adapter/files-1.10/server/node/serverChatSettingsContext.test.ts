import { describe, expect, it } from 'vitest'
import settingsPackage from './serverChatSettingsContext.cjs'

const { DYNAMIC_ROOT_FIELDS, overlayServerChatDynamicState } = settingsPackage as any

function predecessorLineage() {
    return {
        resolution: {
            operationId: 'operation-1', state: 'completed', revision: 'result-revision',
        },
        input: {
            operationId: 'operation-1', inputReceipt: { receiptId: 'input-receipt-1' },
            globalIntent: { changed: {}, deleted: [] }, globalOutcomes: [],
        },
        response: {
            operationId: 'operation-1', inputReceiptId: 'input-receipt-1',
            storedRevision: 'result-revision',
            globalIntent: { changed: { turn: 'predecessor-result' }, deleted: [] },
            globalOutcomes: [{ key: 'turn', status: 'committed' }],
            staticsMessagesAppliedDelta: 1, statsStatus: 'committed',
        },
    }
}

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
        statics: { messages: 11, bgOrchestrationApplied: [{ operationId: 'operation-1', cumulative: 1 }] },
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
    it('keeps frozen settings and owner roots while adopting receipt-attested prompt effects', () => {
        const snapshot = snapshotDatabase()
        const current = currentDatabase()
        const result = overlayServerChatDynamicState(snapshot, current, predecessorLineage())

        expect(DYNAMIC_ROOT_FIELDS).toEqual(['globalChatVariables', 'statics'])
        expect(result.temperature).toBe(0.2)
        expect(result.characters[0].systemPrompt).toBe('frozen prompt')
        expect(result.characters[0].chats).toEqual(snapshotDatabase().characters[0].chats)
        for (const field of DYNAMIC_ROOT_FIELDS) {
            expect(result[field]).toEqual((current as any)[field])
            expect(result[field]).not.toBe((current as any)[field])
        }
        for (const field of [
            'serverChatCommitApplied', 'bgOrchestrationGlobalConflicts',
            'serverChatExecutionState', 'bgOrchestrationDeliveries',
        ]) {
            expect(result[field]).toEqual((snapshotDatabase() as any)[field])
        }
        expect(current.temperature).toBe(1.7)
        expect(current.characters[0].systemPrompt).toBe('later edit')
    })

    it('fails closed when either database is unavailable', () => {
        expect(() => overlayServerChatDynamicState(
            null,
            currentDatabase(),
            predecessorLineage(),
        )).toThrow('snapshot settings database is invalid')
        expect(() => overlayServerChatDynamicState(
            snapshotDatabase(),
            null,
            predecessorLineage(),
        )).toThrow('current settings database is invalid')
    })

    it('blocks unrelated current global or statics mutations after admission', () => {
        const globals: any = currentDatabase()
        globals.globalChatVariables = { turn: 'predecessor-result', unrelated: 'later edit' }
        expect(() => overlayServerChatDynamicState(
            snapshotDatabase(), globals, predecessorLineage(),
        )).toThrow('global lineage changed outside predecessor receipts')
        const statics = currentDatabase()
        statics.statics.messages += 1
        expect(() => overlayServerChatDynamicState(
            snapshotDatabase(), statics, predecessorLineage(),
        )).toThrow('statics lineage changed outside predecessor receipt')
    })

    it('blocks missing or conflicting predecessor receipts', () => {
        expect(() => overlayServerChatDynamicState(
            snapshotDatabase(), currentDatabase(), null,
        )).toThrow('predecessor lineage is unavailable')
        const changedReceipt = predecessorLineage()
        changedReceipt.response.inputReceiptId = 'unrelated-input'
        expect(() => overlayServerChatDynamicState(
            snapshotDatabase(), currentDatabase(), changedReceipt,
        )).toThrow('response lineage is unavailable')
        const conflict = predecessorLineage()
        conflict.response.globalOutcomes = [{ key: 'turn', status: 'conflict' }]
        expect(() => overlayServerChatDynamicState(
            snapshotDatabase(), currentDatabase(), conflict,
        )).toThrow('effect lineage is unresolved')
    })

    it('carries an attached input effect over a cancelled predecessor without inventing a response', () => {
        const snapshot = snapshotDatabase()
        const current = snapshotDatabase()
        current.globalChatVariables.turn = 'input-effect'
        const lineage: any = predecessorLineage()
        lineage.resolution.state = 'cancelled'
        lineage.input.globalIntent.changed = { turn: 'input-effect' }
        lineage.input.globalOutcomes = [{ key: 'turn', status: 'committed' }]
        lineage.response = null
        const result = overlayServerChatDynamicState(snapshot, current, lineage)
        expect(result.globalChatVariables).toEqual({ turn: 'input-effect' })
        expect(result.statics).toEqual({ messages: 10 })
    })

    it('treats a special global key as data rather than changing the settings object prototype', () => {
        const snapshot = snapshotDatabase()
        snapshot.globalChatVariables = {} as any
        const current = snapshotDatabase()
        current.globalChatVariables = {} as any
        const value = { safe: true }
        Object.defineProperty(current.globalChatVariables, '__proto__', {
            value, enumerable: true, writable: true, configurable: true,
        })
        const lineage: any = predecessorLineage()
        lineage.response.globalIntent.changed = {}
        Object.defineProperty(lineage.response.globalIntent.changed, '__proto__', {
            value, enumerable: true, writable: true, configurable: true,
        })
        lineage.response.globalOutcomes = [{ key: '__proto__', status: 'committed' }]
        lineage.response.staticsMessagesAppliedDelta = 0
        lineage.response.statsStatus = 'skipped'
        const result = overlayServerChatDynamicState(snapshot, current, lineage)
        expect(Object.prototype.hasOwnProperty.call(result.globalChatVariables, '__proto__')).toBe(true)
        expect(Object.getPrototypeOf(result.globalChatVariables)).toBe(Object.prototype)
        expect(result.globalChatVariables.__proto__).toEqual(value)
    })
})
