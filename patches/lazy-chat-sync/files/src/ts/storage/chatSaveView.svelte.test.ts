import { expect, it, vi } from 'vitest'
import { flushSync } from 'svelte'
import { snapshotChatView, publishChatView } from './chatSaveRebase'

const env = vi.hoisted(() => ({ database: null as any, storage: null as any, generating: false }))
vi.mock('../globalApi.svelte', () => ({ forageStorage: { get realStorage() { return env.storage } } }))
vi.mock('./database.svelte', () => ({ getDatabase: () => env.database, isChatStub: (chat: any) => chat?._stub === true }))
vi.mock('../process/generationState', () => ({ isChatGenerating: () => env.generating, chatGenKey: (id: string) => id }))
const { saveChatToServer } = await import('./chatStorage')

it('validates the actual reactive slot and generation state at publication time', async () => {
    const database = $state({ characters: [{ chaId: 'char', chats: [{ id: 'chat', message: [], note: '', name: '', localLore: [] }] }] })
    env.database = database
    env.generating = false
    const chat = database.characters[0].chats[0]
    env.storage = { saveChatContent: async (_cha: any, _index: any, _id: any, _chat: any, _intent: any, canPublish: () => boolean) => {
        expect(canPublish()).toBe(true)
        env.generating = true
        expect(canPublish()).toBe(false)
        env.generating = false
        database.characters[0].chats[0] = { ...snapshotChatView(chat), name: 'replacement' }
        expect(canPublish()).toBe(false)
    } }
    await saveChatToServer('char', 0, 'chat', chat)
})

it('publishes through the real Svelte proxy and schedules subsequent local edits', () => {
    const chat = $state({ id: 'chat', message: [{ chatId: 'q', role: 'user', data: 'question' }] })
    const message = chat.message[0], messages = chat.message
    const renders: string[] = []
    const dispose = $effect.root(() => {
        $effect(() => { renders.push(chat.message.map(item => item.data).join('|')) })
    })
    try {
        flushSync()
        const merged = snapshotChatView(chat)
        merged.message.push({ chatId: 'a', role: 'char', data: 'answer' })
        publishChatView(chat, merged)
        flushSync()
        expect(renders.at(-1)).toBe('question|answer')
        expect(chat.message).toBe(messages)
        expect(chat.message[0]).toBe(message)
        message.data = 'later edit'
        flushSync()
        expect(renders.at(-1)).toBe('later edit|answer')
        expect(renders).toHaveLength(3)
    } finally { dispose() }
})
