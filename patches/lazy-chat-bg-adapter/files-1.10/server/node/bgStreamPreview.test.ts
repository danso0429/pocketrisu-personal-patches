import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
const { createBgStreamPreview, STREAM_PREVIEW_MAX_BYTES } = createRequire(import.meta.url)('./bgStreamPreview.cjs')

describe('read-only native streaming preview', () => {
    const identity = { operationId: 'operation-one', charId: 'character', chatId: 'chat' }
    const chat = () => ({ id: 'chat', isStreaming: true, message: [
        { role: 'user', data: 'private input', promptInfo: 'private prompt' },
        { role: 'char', chatId: 'actual-row', data: 'answer', generationInfo: { secret: 'never relayed' } },
    ] })
    it('reads the latest native row without mutating it, or transmitting hidden metadata', () => {
        const native = chat(), before = structuredClone(native)
        const relay = createBgStreamPreview(), close = relay.begin(identity, () => native)
        expect(relay.read('character', 'chat')).toEqual({ active: true, streaming: true,
            operationId: 'operation-one', rowChatId: 'actual-row', revision: 1, oversized: false, text: 'answer' })
        expect(native).toEqual(before)
        expect(relay.read('other', 'chat')).toEqual({ active: false })
        expect(relay.read('character', 'other')).toEqual({ active: false })
        close(); expect(relay.read('character', 'chat')).toEqual({ active: false })
    })
    it('supports shrinking/replaced text and stable row identity across continuation', () => {
        const native = chat(), relay = createBgStreamPreview()
        relay.begin(identity, () => native)
        const first = relay.read('character', 'chat')
        expect(relay.read('character', 'chat', first.operationId, first.revision).unchanged).toBe(true)
        expect(relay.read('character', 'chat', 'old-operation', first.revision).text).toBe('answer')
        native.message[1].data = 'a'
        expect(relay.read('character', 'chat')).toMatchObject({ text: 'a', revision: 2, rowChatId: 'actual-row' })
        native.message[1].data = 'a continuation'
        expect(relay.read('character', 'chat')).toMatchObject({ text: 'a continuation', revision: 3 })
        native.message.push({ role: 'char', chatId: 'resend-row', data: 'resend' } as any)
        expect(relay.read('character', 'chat')).toMatchObject({ rowChatId: 'resend-row', revision: 4 })
    })
    it('does not expose nonstream, malformed rows, cancelled operations or a replaced chat', () => {
        const native = chat(), relay = createBgStreamPreview(); let cancelled = false
        relay.begin(identity, () => native, () => cancelled)
        native.isStreaming = false
        expect(relay.read('character', 'chat')).toEqual({ active: true, streaming: false, operationId: 'operation-one', answerReady: true })
        native.isStreaming = true; native.message[1].role = 'user'
        expect(relay.read('character', 'chat').streaming).toBe(false)
        native.message[1].role = 'char'; cancelled = true
        expect(relay.read('character', 'chat')).toEqual({ active: false })
        cancelled = false; native.id = 'replaced'
        expect(relay.read('character', 'chat')).toEqual({ active: false })
    })
    it('distinguishes pre-answer control from a completed nonstream answer without relaying either body', () => {
        const native = { id: 'chat', isStreaming: false, message: [{ role: 'user', data: 'private input' }] } as any
        const relay = createBgStreamPreview(); const close = relay.begin(identity, () => native)
        expect(relay.read('character', 'chat')).toEqual({ active: true, streaming: false, operationId: 'operation-one', answerReady: false })
        native.message.push({ role: 'char', chatId: 'finished-row', data: 'finished private answer' })
        expect(relay.read('character', 'chat')).toEqual({ active: true, streaming: false, operationId: 'operation-one', answerReady: true })
        close(); expect(relay.read('character', 'chat')).toEqual({ active: false })
    })
    it('withholds oversized UTF8 data without changing the generated answer, then recovers', () => {
        const native = chat(), relay = createBgStreamPreview(); relay.begin(identity, () => native)
        native.message[1].data = '가'.repeat(STREAM_PREVIEW_MAX_BYTES)
        expect(relay.read('character', 'chat')).toMatchObject({ text: '', oversized: true })
        expect(native.message[1].data.length).toBe(STREAM_PREVIEW_MAX_BYTES)
        native.message[1].data = 'safe'; expect(relay.read('character', 'chat')).toMatchObject({ text: 'safe', oversized: false })
    })
    it('does not release a successor through an old cleanup, and refuses overlapping owners', () => {
        const relay = createBgStreamPreview(), close = relay.begin(identity, chat)
        expect(() => relay.begin(identity, chat)).toThrow('still active')
        close(); relay.begin({ ...identity, operationId: 'operation-two' }, chat); close()
        expect(relay.read('character', 'chat').operationId).toBe('operation-two')
    })
})
