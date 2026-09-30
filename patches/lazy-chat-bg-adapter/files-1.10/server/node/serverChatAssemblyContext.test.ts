import { describe, expect, it } from 'vitest'
import contextPackage from './serverChatAssemblyContext.cjs'
const { captureAssemblyContext, promptInputsChanged } = contextPackage as any

describe('assembly snapshot and conservative chat input scope', () => {
    const base = () => ({ id: 'chat', note: '', localLore: [], message: [
        { chatId: 'old', role: 'user', data: 'history', disabled: true },
        { chatId: 'input', role: 'user', data: 'question' },
    ] })
    it('keeps current credentials only in the owned graph with a content-independent identity', () => {
        const db = { apiKey: 'synthetic-secret', characters: [{ chaId: 'char', chats: [{ id: 'chat', name: 'latest', _stub: true }] }] }
        const first = captureAssemblyContext(db, base(), 'char', 'chat')
        const second = captureAssemblyContext(db, base(), 'char', 'chat')
        expect(first.database.apiKey).toBe('synthetic-secret')
        expect(first.contextDigest).toMatch(/^[a-f0-9]{64}$/)
        expect(first.contextDigest).not.toBe(second.contextDigest)
        first.database.apiKey = 'execution-only'
        expect(db.apiKey).toBe('synthetic-secret')
    })
    it.each(['history', 'input', 'insert', 'delete', 'note', 'lore', 'variables'])('detects a changed %s dependency', change => {
        const before = base(), latest: any = structuredClone(before)
        if (change === 'history') latest.message[0].data = 'changed even when disabled or trimmed'
        if (change === 'input') latest.message[1].data = 'changed input'
        if (change === 'insert') latest.message.unshift({ role: 'char', data: 'new history' })
        if (change === 'delete') latest.message.shift()
        if (change === 'note') latest.note = 'new note'
        if (change === 'lore') latest.localLore.push({ content: 'new lore' })
        if (change === 'variables') latest.scriptstate = { counter: 1 }
        expect(promptInputsChanged(before, latest)).toBe(true)
    })
    it('ignores display metadata, IDs and key insertion order', () => {
        const before = base(), latest: any = structuredClone(before)
        latest.name = 'renamed'; latest.folderId = 'folder'; latest.isStreaming = true
        latest.message[0] = { data: 'history', role: 'user', disabled: true,
            chatId: 'backfilled', time: 123, generationInfo: { outputTokens: 10 } }
        expect(promptInputsChanged(before, latest)).toBe(false)
    })
})
