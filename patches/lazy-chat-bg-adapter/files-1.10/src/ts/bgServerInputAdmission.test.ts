import { describe, expect, it } from 'vitest'
import { chooseServerInputBase } from './bgServerInputAdmission'

const base = 'a'.repeat(64)
const successor = 'b'.repeat(64)
const knownInput = {
    charId: 'char-1', chatId: 'chat-1', operationId: 'operation-n', localRevision: base,
}

describe('server input base admission', () => {
    it('accepts an exact canonical local chat', () => {
        expect(chooseServerInputBase({
            charId: 'char-1', chatId: 'chat-1', localRevision: base,
            serverRevision: base, pendingInputs: [], knownInput: null,
        })).toEqual({ ready: true, baseRevision: base })
    })

    it('accepts a stale local view only when its exact prior operation is still active', () => {
        expect(chooseServerInputBase({
            charId: 'char-1', chatId: 'chat-1', localRevision: base,
            serverRevision: successor,
            pendingInputs: [{ operationId: 'operation-n', admissionSeq: 1, state: 'generating' }],
            knownInput,
        })).toEqual({ ready: true, baseRevision: successor })
    })

    it('blocks an edit, other chat, completed marker, or unknown execution', () => {
        for (const candidate of [
            { ...knownInput, localRevision: successor },
            { ...knownInput, chatId: 'other-chat' },
            null,
        ]) {
            expect(chooseServerInputBase({
                charId: 'char-1', chatId: 'chat-1', localRevision: base,
                serverRevision: successor,
                pendingInputs: [{ operationId: 'operation-n', admissionSeq: 1, state: 'attached' }],
                knownInput: candidate,
            })).toEqual({ ready: false, reason: 'local-chat-changed' })
        }
        expect(chooseServerInputBase({
            charId: 'char-1', chatId: 'chat-1', localRevision: base,
            serverRevision: successor,
            pendingInputs: [{ operationId: 'operation-n', admissionSeq: 1, state: 'execution_unknown' }],
            knownInput,
        })).toEqual({ ready: false, reason: 'local-chat-changed' })
    })

    it('does not admit without a canonical server revision', () => {
        expect(chooseServerInputBase({
            charId: 'char-1', chatId: 'chat-1', localRevision: base,
            serverRevision: null, pendingInputs: [], knownInput: null,
        })).toEqual({ ready: false, reason: 'server-chat-unavailable' })
    })

    it('refuses a new send while any server-owned input needs manual resolution', () => {
        for (const state of ['blocked_edit', 'execution_unknown'] as const) {
            expect(chooseServerInputBase({
                charId: 'char-1', chatId: 'chat-1', localRevision: base,
                serverRevision: base, knownInput: null,
                pendingInputs: [{ operationId: 'old', admissionSeq: 1, state }],
            })).toEqual({ ready: false, reason: 'unresolved-server-input' })
        }
    })
})
