import { describe, expect, it } from 'vitest'
import {
    classifyChatSaveIntent,
    collectUnconfirmedChatPayloads,
    findRecoverableChatPayload,
} from './chatSaveIntent'

describe('chat save intent classification', () => {
    const baseline = {
        characters: [{
            chaId: 'char-1',
            chats: [
                { id: 'chat-existing', _stub: true },
                { id: 'chat-shifted', _stub: true },
            ],
        }],
    }

    it('classifies an ID absent from the last confirmed server DB as create', () => {
        expect(classifyChatSaveIntent(baseline, 'char-1', 'chat-new')).toBe('create')
    })

    it('classifies a confirmed ID as update regardless of its current index', () => {
        expect(classifyChatSaveIntent(baseline, 'char-1', 'chat-shifted')).toBe('update')
    })

    it('does not treat a different character identity as the same chat', () => {
        expect(classifyChatSaveIntent(baseline, 'char-other', 'chat-existing')).toBe('create')
    })

    it('fails closed to update when no valid confirmed baseline exists', () => {
        expect(classifyChatSaveIntent(null, 'char-1', 'chat-new')).toBe('update')
        expect(classifyChatSaveIntent({ characters: undefined }, 'char-1', 'chat-new'))
            .toBe('update')
    })
})

describe('new chat payload planning', () => {
    const baseline = {
        characters: [{
            chaId: 'char-1',
            chats: [{ id: 'chat-existing' }],
        }],
    }

    it('enlists a new empty full chat even when the dirty tracker omitted it', () => {
        const current = {
            characters: [{
                chaId: 'char-1',
                chats: [
                    { id: 'chat-new', message: [] },
                    { id: 'chat-existing', message: [{ role: 'user', data: 'kept' }] },
                ],
            }],
        }
        expect(collectUnconfirmedChatPayloads(baseline, current)).toEqual([
            { chaId: 'char-1', chatId: 'chat-new' },
        ])
    })

    it('includes full chats on a newly introduced character', () => {
        const current = {
            characters: [{
                chaId: 'char-new',
                chats: [{ id: 'chat-new', message: [] }],
            }],
        }
        expect(collectUnconfirmedChatPayloads(baseline, current)).toEqual([
            { chaId: 'char-new', chatId: 'chat-new' },
        ])
    })

    it('ignores placeholders, malformed payloads, and an unknown baseline', () => {
        const current = {
            characters: [{
                chaId: 'char-1',
                chats: [
                    { id: 'chat-placeholder', _placeholder: true, message: [] },
                    { id: 'chat-metadata-only' },
                ],
            }],
        }
        expect(collectUnconfirmedChatPayloads(baseline, current)).toEqual([])
        expect(collectUnconfirmedChatPayloads(null, current)).toEqual([])
    })

    it('recovers only an exact full payload identity', () => {
        const current = {
            characters: [{
                chaId: 'char-1',
                chats: [
                    { id: 'chat-full', message: [] },
                    { id: 'chat-placeholder', _placeholder: true, message: [] },
                ],
            }],
        }
        expect(findRecoverableChatPayload(current, { chaId: 'char-1', chatId: 'chat-full' }))
            .toEqual({ chaId: 'char-1', chatId: 'chat-full' })
        expect(findRecoverableChatPayload(current, { chaId: 'char-1', chatId: 'chat-placeholder' }))
            .toBeNull()
        expect(findRecoverableChatPayload(current, { chaId: 'char-1', chatId: 'missing' }))
            .toBeNull()
    })
})
