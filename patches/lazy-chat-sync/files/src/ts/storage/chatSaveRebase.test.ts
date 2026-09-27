import { describe, expect, it } from 'vitest'
import { rebaseChatSave, rebaseChatInput, snapshotChatView, publishChatView, trackDerivedChat, mergeDerivedChat, acknowledgeDerivedFields, chatViewFingerprint } from './chatSaveRebase'

const message = (chatId: string, data: string, role = 'user') => ({ chatId, data, role })
const base = () => ({ id: 'chat', note: '', message: [message('old', 'before', 'char'), message('input', 'question')] })
describe('chat view publication and pending trigger results', () => {
    it('does not mask a known chat identity mismatch during input preparation', () => {
        const original = base()
        expect(rebaseChatInput(original, original.message, { ...original, id: 'another-chat' }, undefined, 'draft')).toEqual({ ok: false })
    })
    it('does not alias duplicate message IDs during publication', () => {
        const live = { id: 'chat', message: [message('duplicate', 'one'), message('duplicate', 'two')] }
        const next = snapshotChatView(live)
        next.message.push(message('answer', 'answer'))
        publishChatView(live, next)
        expect(live.message[0]).not.toBe(live.message[1])
        live.message[0].data = 'edit'
        expect(live.message[1].data).toBe('two')
    })
    it('refuses immutable nested data before publishing any other changes', () => {
        const live = { ...base(), note: 'before', extra: Object.freeze({ value: 'before' }) }
        const next = { ...snapshotChatView(live), note: 'after', extra: { value: 'after' } }
        expect(() => publishChatView(live, next)).toThrow(/mutable/)
        expect(live.note).toBe('before')
        expect(live.extra.value).toBe('before')
    })
    it('rejects a read-only array length before changing preceding fields', () => {
        const live = base(), next = snapshotChatView(live)
        Object.defineProperty(live.message, 'length', { writable: false })
        next.note = 'changed'
        next.message.push(message('a', 'answer'))
        expect(() => publishChatView(live, next)).toThrow(/mutable/)
        expect(live.note).toBe('')
        expect(live.message).toHaveLength(2)
    })
    it('uses a stable bounded fingerprint without equating absent and undefined fields', () => {
        expect(chatViewFingerprint({ a: 1, b: [undefined, 'u;'] })).toBe(chatViewFingerprint({ b: [undefined, 'u;'], a: 1 }))
        expect(chatViewFingerprint({ a: undefined })).not.toBe(chatViewFingerprint({}))
        expect(chatViewFingerprint({ a: 'undefined' })).not.toBe(chatViewFingerprint({ a: undefined }))
        expect(chatViewFingerprint({ a: -0 })).not.toBe(chatViewFingerprint({ a: 0 }))
        expect(chatViewFingerprint(base())).toHaveLength(64)
    })
    it('advances only applied fields so a later user edit is not a false trigger conflict', () => {
        const live = { ...base(), scriptstate: { a: 'before' } }, draft = structuredClone(live)
        trackDerivedChat(draft, live)
        draft.scriptstate.a = 'unsaved trigger variable'
        live.message[0].data = 'first edit'
        draft.message = mergeDerivedChat(draft, live, ['message']).message
        live.message = snapshotChatView(draft.message)
        acknowledgeDerivedFields(draft)
        live.message[0].data = 'second edit'
        const merged = mergeDerivedChat(draft, live)
        expect(merged.message[0].data).toBe('second edit')
        expect(merged.scriptstate.a).toBe('unsaved trigger variable')
    })
    it('snapshots proxies and publishes an insertion without replacing existing references', () => {
        const live = base(), messages = live.message, original = live.message[0]
        const proxy = new Proxy(live, {})
        const next = snapshotChatView(proxy)
        next.message[0].data = 'remote edit'
        next.message.splice(1, 0, message('answer', 'answer', 'char'))
        publishChatView(proxy, next)
        expect(live.message).toBe(messages)
        expect(live.message[0]).toBe(original)
        expect(original.data).toBe('remote edit')
        expect(snapshotChatView(proxy)).toEqual(next)
    })
    it('merges a delayed trigger copy with a newly published server answer', () => {
        const live = base(), draft = structuredClone(live)
        trackDerivedChat(draft, live)
        draft.message[0].data = 'trigger edit'
        live.message.push(message('answer', 'server answer', 'char'))
        const merged = mergeDerivedChat(draft, live)
        expect(merged.message.map((m: any) => m.chatId)).toEqual(['old', 'input', 'answer'])
        expect(merged.message[0].data).toBe('trigger edit')
        expect(live.message[0].data).toBe('before')
    })
    it('refuses overlapping delayed trigger edits without changing either copy', () => {
        const live = base(), draft = structuredClone(live)
        trackDerivedChat(draft, live)
        draft.message[0].data = 'trigger edit'
        live.message[0].data = 'remote edit'
        const before = snapshotChatView(live)
        expect(() => mergeDerivedChat(draft, live)).toThrow(/trigger/)
        expect(live).toEqual(before)
        expect(draft.message[0].data).toBe('trigger edit')
    })
    it('preserves an explicit untracked whole-chat replacement contract', () => {
        const live = base(), replacement = { ...base(), message: [] }
        expect(mergeDerivedChat(replacement, live)).toBe(replacement)
    })
})
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
