import { describe, expect, it } from 'vitest'
import { createReconciliationReadiness, RECONCILIATION_MAX_OPERATIONS } from './bgReconciliation'

describe('target reconciliation readiness', () => {
    const marker = (operationId: string, chatId = 'chat') => ({ charId: 'char', chatId, operationId, ts: Date.now() })
    it('bounds pathological unresolved sessions without silently authorizing suggestions', () => {
        const state = createReconciliationReadiness()
        for (let i = 0; i <= RECONCILIATION_MAX_OPERATIONS; i++) state.register(marker('op-' + i, 'chat-' + i))
        expect(state.targets()).toHaveLength(RECONCILIATION_MAX_OPERATIONS)
        expect(state.pending('char', 'untracked')).toBe(true)
        state.classifyTerminal('char', 'chat-0', 'op-0')
        expect(state.verifyTarget('char', 'chat-0', state.capture('char', 'chat-0'))).toBe(false)
    })
    it('seeds synchronously and does not reinstate verified operations during repeated scans', () => {
        const state = createReconciliationReadiness()
        state.seed([marker('one')])
        let pending = false
        const stop = state.subscribe(() => { pending = state.pending('char', 'chat') })
        expect(pending).toBe(true)
        state.resolveOperation('char', 'chat', 'one')
        state.seed([marker('one')])
        expect(pending).toBe(false)
        stop()
    })
    it('resolves only the captured target epoch and leaves other operations blocked', () => {
        const state = createReconciliationReadiness()
        state.seed([marker('one'), marker('other', 'other')])
        const epoch = state.capture('char', 'chat')
        state.register(marker('two'))
        expect(state.verifyTarget('char', 'chat', epoch)).toBe(false)
        state.resolveOperation('char', 'chat', 'one')
        expect(state.pending('char', 'chat')).toBe(true)
        state.classifyTerminal('char', 'chat', 'two')
        expect(state.verifyTarget('char', 'chat', state.capture('char', 'chat'))).toBe(true)
        expect(state.pending('char', 'other')).toBe(true)
    })
    it('requires terminal classification before equal-view verification and ignores expired seeds', () => {
        const state = createReconciliationReadiness()
        state.seed([marker('active')])
        expect(state.verifyTarget('char', 'chat', state.capture('char', 'chat'))).toBe(false)
        state.classifyTerminal('char', 'chat', 'active')
        expect(state.verifyTarget('char', 'chat', state.capture('char', 'chat'))).toBe(true)
        let publications = 0
        state.subscribe(() => publications++)
        state.seed([{ ...marker('expired'), ts: 1 }])
        state.seed([{ ...marker('expired'), ts: 1 }])
        expect(publications).toBe(1)
    })
})
