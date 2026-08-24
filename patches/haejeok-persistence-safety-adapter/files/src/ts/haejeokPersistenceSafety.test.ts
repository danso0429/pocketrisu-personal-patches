import { afterEach, describe, expect, test, vi } from 'vitest'
import {
    persistActiveChatBeforeGeneration,
    persistPluginsBeforeReload,
    persistScriptMessagesBeforeReturn,
} from './haejeokPersistenceSafety'

const runtime = globalThis as typeof globalThis & { __bgOrch?: unknown }

afterEach(() => {
    delete runtime.__bgOrch
})

describe('Haejeok persistence safety adaptation', () => {
    test('a newly appended user message is durable before generation', async () => {
        const save = vi.fn(async () => {})
        await expect(persistActiveChatBeforeGeneration({
            appendedUserMessage: true,
            chaId: 'char-1',
            chatId: 'chat-1',
        }, save)).resolves.toBe(true)
        expect(save).toHaveBeenCalledWith({ chat: ['char-1', 'chat-1'] })
    })

    test('rerolls and missing identities do not invent a chat save', async () => {
        const save = vi.fn(async () => {})
        await expect(persistActiveChatBeforeGeneration({
            appendedUserMessage: false,
            chaId: 'char-1',
            chatId: 'chat-1',
        }, save)).resolves.toBe(false)
        await expect(persistActiveChatBeforeGeneration({
            appendedUserMessage: true,
            chaId: '',
            chatId: 'chat-1',
        }, save)).resolves.toBe(false)
        expect(save).not.toHaveBeenCalled()
    })

    test('script-mutated clone payload is committed before returning', async () => {
        const chat = { id: 'chat-1', message: [{ role: 'user', data: 'changed' }] }
        const save = vi.fn(async () => {})
        await expect(persistScriptMessagesBeforeReturn({
            messagesMutated: true,
            chaId: 'char-1',
            chatId: chat.id,
            chat,
        }, save)).resolves.toBe(true)
        expect(save).toHaveBeenCalledWith('char-1', 'chat-1', chat)
    })

    test('read-only scripts and server orchestration never write browser storage', async () => {
        const chat = { id: 'chat-1', message: [] }
        const save = vi.fn(async () => {})
        await expect(persistScriptMessagesBeforeReturn({
            messagesMutated: false,
            chaId: 'char-1',
            chatId: chat.id,
            chat,
        }, save)).resolves.toBe(false)

        runtime.__bgOrch = {}
        await expect(persistScriptMessagesBeforeReturn({
            messagesMutated: true,
            chaId: 'char-1',
            chatId: chat.id,
            chat,
        }, save)).resolves.toBe(false)
        expect(save).not.toHaveBeenCalled()
    })

    test('plugin runtime reload waits for the strict plugin save', async () => {
        const order: string[] = []
        await persistPluginsBeforeReload(
            async () => { order.push('save') },
            async () => { order.push('reload') },
        )
        expect(order).toEqual(['save', 'reload'])

        const reload = vi.fn(async () => {})
        await expect(persistPluginsBeforeReload(
            async () => { throw new Error('save failed') },
            reload,
        )).rejects.toThrow('save failed')
        expect(reload).not.toHaveBeenCalled()
    })
})
