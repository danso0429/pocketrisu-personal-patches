import { describe, expect, it } from 'vitest'
import { rebaseChatSave } from './chatSaveRebase'

const message = (chatId: string, data: string, role = 'user') => ({ chatId, data, role })
const base = () => ({ id: 'chat', note: '', message: [message('old', 'before', 'char'), message('input', 'question')] })
describe('chat save rebase', () => {
    it('preserves server insertion before the locally queued next message', () => {
        const original = base(), local = structuredClone(original), remote = structuredClone(original)
        local.message[0].data = 'edited'
        local.message.push(message('next', 'N+1'))
        remote.message.push(message('answer', 'N answer', 'char'))
        const result = rebaseChatSave(original, local, remote)
        expect(result).toMatchObject({ ok: true })
        if (!result.ok) throw new Error('rebase failed')
        expect(result.chat.message.map((m: any) => m.chatId)).toEqual(['old', 'input', 'answer', 'next'])
        expect(result.chat.message[0].data).toBe('edited')
        expect(remote.message[0].data).toBe('before')
    })
    it('does not resurrect a deleted message while merging an independent addition', () => {
        const original = base(), local = structuredClone(original), remote = structuredClone(original)
        local.message.shift()
        remote.message.push(message('answer', 'answer', 'char'))
        const result = rebaseChatSave(original, local, remote)
        expect(result).toMatchObject({ ok: true })
        if (result.ok) expect(result.chat.message.map((m: any) => m.chatId)).toEqual(['input', 'answer'])
    })
    it('rejects edit/edit and delete/edit overlaps without mutating either side', () => {
        const original = base(), local = structuredClone(original), remote = structuredClone(original)
        local.message[0].data = 'local'; remote.message[0].data = 'remote'
        expect(rebaseChatSave(original, local, remote)).toEqual({ ok: false })
        local.message.shift()
        expect(rebaseChatSave(original, local, remote)).toEqual({ ok: false })
        expect(remote.message[0].data).toBe('remote')
    })
    it('handles undefined key presence without turning absence into an overwrite', () => {
        const original: any = { ...base(), optional: undefined }
        const local = structuredClone(original), remote = structuredClone(original)
        local.note = 'edited'; remote.message.push(message('answer', 'answer', 'char'))
        const result = rebaseChatSave(original, local, remote)
        expect(result).toMatchObject({ ok: true })
        if (result.ok) expect(Object.hasOwn(result.chat, 'optional')).toBe(true)
        delete original.optional; remote.optional = 'remote'
        expect(rebaseChatSave(original, local, remote)).toEqual({ ok: false })
    })
    it('only merges legacy unkeyed messages against an exact remote prefix', () => {
        const original = { id: 'chat', message: [{ role: 'user', data: 'question' }] }
        const local = { id: 'chat', message: [{ role: 'user', data: 'edited' }] }
        const remote = { id: 'chat', message: [...original.message, { role: 'char', data: 'answer' }] }
        expect(rebaseChatSave(original, local, remote)).toEqual({ ok: true, chat: { id: 'chat', message: [...local.message, remote.message[1]] } })
        remote.message[0] = { role: 'user', data: 'other edit' }
        expect(rebaseChatSave(original, local, remote)).toEqual({ ok: false })
    })
    it('rejects duplicate identities and reordered concurrent histories', () => {
        const original = base(), local = structuredClone(original), remote = structuredClone(original)
        local.message.reverse(); remote.message.push(message('answer', 'answer', 'char'))
        expect(rebaseChatSave(original, local, remote)).toEqual({ ok: false })
        local.message = [message('old', 'changed'), message('old', 'duplicate')]
        expect(rebaseChatSave(original, local, remote)).toEqual({ ok: false })
    })
})
