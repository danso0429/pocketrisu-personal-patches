import { describe, expect, it } from 'vitest'
import { assignMissingChatIdsToNewCharacters } from './chatIdentityRepair'

const fullChat = (id?: string) => ({
    id,
    message: [],
    note: '',
    name: 'Chat 1',
    localLore: [],
})

describe('new character chat identity repair', () => {
    it('assigns a stable ID only to a hydrated chat on a server-unknown character', () => {
        const candidate = {
            characters: [
                { chaId: 'existing-character', chats: [fullChat('existing-chat')] },
                { chaId: 'new-character', chats: [fullChat()] },
            ],
        }
        const confirmed = {
            characters: [
                { chaId: 'existing-character', chats: [{ id: 'existing-chat', _stub: true }] },
            ],
        }

        const result = assignMissingChatIdsToNewCharacters(
            candidate,
            confirmed,
            () => 'assigned-chat',
        )

        expect(result).toEqual([{
            chaId: 'new-character',
            chatIndex: 0,
            chatId: 'assigned-chat',
        }])
        expect(candidate.characters[0].chats[0].id).toBe('existing-chat')
        expect(candidate.characters[1].chats[0].id).toBe('assigned-chat')
    })

    it('refuses to invent a replacement identity for an existing character', () => {
        const missing = fullChat()
        const candidate = {
            characters: [
                { chaId: 'new-character', chats: [fullChat()] },
                { chaId: 'existing-character', chats: [missing] },
            ],
        }

        expect(() => assignMissingChatIdsToNewCharacters(candidate, {
            characters: [{ chaId: 'existing-character', chats: [{ id: 'server-chat' }] }],
        }, () => 'assigned-chat')).toThrow('existing character')
        expect(candidate.characters[0].chats[0].id).toBeUndefined()
        expect(missing.id).toBeUndefined()
    })

    it.each([
        { message: [], _placeholder: true },
        { _stub: true },
        { name: 'missing payload' },
    ])('refuses to turn an unhydrated lazy entry into a new chat: %j', (chat) => {
        const candidate = {
            characters: [{ chaId: 'new-character', chats: [chat] }],
        }

        expect(() => assignMissingChatIdsToNewCharacters(
            candidate,
            { characters: [] },
            () => 'assigned-chat',
        )).toThrow('unhydrated new character')
        expect(chat).not.toHaveProperty('id')
    })

    it('fails closed when no confirmed baseline can prove the character is new', () => {
        const candidate = {
            characters: [{ chaId: 'unknown-character', chats: [fullChat()] }],
        }

        expect(() => assignMissingChatIdsToNewCharacters(
            candidate,
            null,
            () => 'assigned-chat',
        )).toThrow('without a confirmed database baseline')
        expect(candidate.characters[0].chats[0].id).toBeUndefined()
    })

    it('retries collisions without changing already valid identities', () => {
        const generated = ['existing-chat', 'new-character', 'assigned-chat']
        const candidate = {
            characters: [{
                chaId: 'new-character',
                chats: [fullChat('existing-chat'), fullChat()],
            }],
        }

        assignMissingChatIdsToNewCharacters(
            candidate,
            { characters: [] },
            () => generated.shift()!,
        )

        expect(candidate.characters[0].chats.map(chat => chat.id))
            .toEqual(['existing-chat', 'assigned-chat'])
    })
})
