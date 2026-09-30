import { describe, expect, it } from 'vitest'
import attachPackage from './chatInputAttach.cjs'
const { captureInputTransformBase, resolveInputAttachment } = attachPackage as any
const input = { chatId: 'new-input', role: 'user', data: 'new input' }
describe('completed input transform attachment', () => {
    it.each([false, true])('retains user edits and attaches exactly once (legacy=%s)', legacy => {
        const original: any = { id: 'chat', scriptstate: { a: '0', b: '0' }, message: [
            { ...(legacy ? {} : { chatId: 'history' }), role: 'char', data: 'history' },
            { chatId: 'tail', role: 'char', data: 'tail' },
        ] }
        const execution = structuredClone(original)
        const captured = captureInputTransformBase(execution, null, input.chatId)
        execution.message[0].data = 'script edit'; execution.scriptstate.b = 'script'
        execution.message.push(input)
        const latest = structuredClone(original)
        latest.message[0].data = 'user edit'; latest.scriptstate.a = 'user'
        const merged = resolveInputAttachment(captured, execution, latest, null)
        expect(merged.status).toBe('resolved')
        expect(merged.chat.message.map((m: any) => m.data)).toEqual(['user edit', 'tail', 'new input'])
        expect(merged.chat.scriptstate).toEqual({ a: 'user', b: 'script' })
        expect(merged.unreflected).toBe(true)
        expect(JSON.stringify(merged.chat)).not.toContain(captured.sentinel.chatId)
    })
    it('supports an empty new chat and refuses an unrelated appended message', () => {
        const base = { id: 'chat', message: [] }
        const captured = captureInputTransformBase(base, null, input.chatId)
        expect(resolveInputAttachment(captured, { ...base, message: [input] }, base, null).chat.message).toEqual([input])
        expect(resolveInputAttachment(captured, { ...base, message: [input] }, { ...base, message: [{ chatId: 'other', role: 'user', data: 'other' }] }, null))
            .toMatchObject({ status: 'conflict', reason: 'unknown_suffix' })
    })
})
