import { describe, expect, it, vi } from 'vitest'
import { collectKnownTranslationSourceKeys } from './translationCacheUsage'
import type { Chat } from '../storage/database.svelte'

function chat(overrides: Partial<Chat> = {}): Chat {
    return {
        message: [],
        note: '',
        name: '',
        localLore: [],
        ...overrides,
    }
}

describe('translation cache usage scan', () => {
    it('collects greetings, messages, swipes, suggestions, and Hypa summaries', async () => {
        const fetchChat = vi.fn(async () => null)
        const keys = await collectKnownTranslationSourceKeys({
            characters: [{
                chaId: 'character',
                firstMessage: 'first',
                alternateGreetings: ['alternate'],
                chats: [chat({
                    message: [
                        {
                            role: 'char',
                            data: 'message',
                            swipes: ['swipe'],
                        },
                        {
                            role: 'user',
                            data: 'comment',
                            isComment: true,
                        },
                    ],
                    suggestMessages: ['suggestion'],
                    hypaV3Data: {
                        summaries: [{ text: 'summary' }],
                    } as Chat['hypaV3Data'],
                })],
            }],
        }, { fetchChat })

        expect(Array.from(keys).sort()).toEqual([
            'alternate',
            'first',
            'message',
            'suggestion',
            'summary',
            'swipe',
        ])
        expect(fetchChat).not.toHaveBeenCalled()
    })

    it('reads a lazy placeholder without replacing the database object', async () => {
        const placeholder = chat({
            id: 'chat-id',
            _placeholder: true,
        })
        const hydrated = chat({
            message: [{ role: 'char', data: 'server message' }],
        })
        const fetchChat = vi.fn(async () => hydrated)

        const keys = await collectKnownTranslationSourceKeys({
            characters: [{
                chaId: 'character',
                chats: [placeholder],
            }],
        }, { fetchChat })

        expect(keys.has('server message')).toBe(true)
        expect(fetchChat).toHaveBeenCalledWith('character', 0, 'chat-id')
        expect(placeholder._placeholder).toBe(true)
        expect(placeholder.message).toEqual([])
    })

    it('fails closed when a placeholder cannot be read', async () => {
        const fetchChat = vi.fn(async () => null)

        await expect(collectKnownTranslationSourceKeys({
            characters: [{
                chaId: 'character',
                chats: [chat({
                    id: 'chat-id',
                    _placeholder: true,
                })],
            }],
        }, { fetchChat })).rejects.toThrow('Failed to load chat')
    })

    it('stops between lazy reads when the scan is cancelled', async () => {
        const controller = new AbortController()
        const fetchChat = vi.fn(async () => {
            controller.abort()
            return chat()
        })

        await expect(collectKnownTranslationSourceKeys({
            characters: [{
                chaId: 'character',
                chats: [chat({
                    id: 'chat-id',
                    _placeholder: true,
                })],
            }],
        }, {
            signal: controller.signal,
            fetchChat,
        })).rejects.toMatchObject({ name: 'AbortError' })
    })

    it('yields so an in-memory scan can be cancelled from the UI', async () => {
        const controller = new AbortController()
        const yieldToEventLoop = vi.fn(async () => {
            controller.abort()
        })

        await expect(collectKnownTranslationSourceKeys({
            characters: [{
                chaId: 'character',
                chats: [chat({
                    message: [
                        { role: 'char', data: 'one' },
                        { role: 'char', data: 'two' },
                    ],
                })],
            }],
        }, {
            signal: controller.signal,
            batchSize: 1,
            fetchChat: vi.fn(async () => null),
            yieldToEventLoop,
        })).rejects.toMatchObject({ name: 'AbortError' })
        expect(yieldToEventLoop).toHaveBeenCalledOnce()
    })

    it('cancels promptly while a lazy chat read remains pending', async () => {
        const controller = new AbortController()
        const fetchStarted = vi.fn()
        const fetchChat = vi.fn(async () => {
            fetchStarted()
            return await new Promise<never>(() => {})
        })
        const scanning = collectKnownTranslationSourceKeys({
            characters: [{
                chaId: 'character',
                chats: [chat({
                    id: 'chat-id',
                    _placeholder: true,
                })],
            }],
        }, {
            signal: controller.signal,
            fetchChat,
        })
        await vi.waitFor(() => expect(fetchStarted).toHaveBeenCalledOnce())

        controller.abort()

        await expect(scanning).rejects.toMatchObject({ name: 'AbortError' })
    })
})
