import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ db: {} as any, setDatabase: vi.fn() }))

vi.mock('../storage/database.svelte', () => ({
    getDatabase: () => state.db,
    setDatabase: (db: unknown) => state.setDatabase(db),
    getCurrentCharacter: () => state.db.characters[0],
    getCurrentChat: () => state.db.characters[0].chats[state.db.characters[0].chatPage],
    setCurrentChat: () => {},
}))
vi.mock('../stores.svelte', async () => {
    const { writable } = await import('svelte/store')
    return { selectedCharID: writable(0) }
})
vi.mock('../parser/parser.svelte', () => ({ risuChatParser: (value: string) => value }))
vi.mock('../alert', () => ({
    alertInput: async () => '',
    alertMd: () => {},
    alertNormal: () => {},
    alertSelect: async () => '',
    notifyError: () => {},
}))
vi.mock('./tts', () => ({ sayTTS: async () => {} }))
vi.mock('./index.svelte', () => ({ sendChat: async () => {} }))
vi.mock('./generationState', () => ({ chatGenKey: () => '', endGeneration: () => {} }))
vi.mock('./lorebook.svelte', () => ({ loadLoreBookV3Prompt: async () => ({ actives: [] }) }))
vi.mock('./triggers', () => ({ runTrigger: async () => ({}) }))
vi.mock('../storage/chatSaveRebase', () => ({ ChatViewConflictError: class extends Error {} }))

import { processMultiCommand } from './command'

const setup = (chat: any) => {
    state.db = { characters: [{ type: 'character', chatPage: 0, chats: [chat] }] }
    return chat
}

describe('slash command variable reads', () => {
    beforeEach(() => {
        state.setDatabase.mockClear()
        vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    it('does not create scriptstate when reading from a chat without one', async () => {
        const chat = setup({ message: [] })
        await expect(processMultiCommand('/getvar key=k')).rejects.toThrow(/reading 'toString'/)
        expect(Object.prototype.hasOwnProperty.call(chat, 'scriptstate')).toBe(false)
    })

    it('does not replace a null scriptstate when reading', async () => {
        const chat = setup({ message: [], scriptstate: null })
        await expect(processMultiCommand('/getvar key=k')).rejects.toThrow(/reading 'toString'/)
        expect(chat.scriptstate).toBeNull()
    })

    it('returns a present variable and leaves the chat unchanged', async () => {
        const chat = setup({ message: [], scriptstate: { $k: 'v' } })
        const before = structuredClone(chat)
        expect(await processMultiCommand('/getvar key=k')).toBe('v')
        expect(chat).toEqual(before)
    })

    it('still creates scriptstate when setvar writes', async () => {
        const chat = setup({ message: [] })
        await processMultiCommand('/setvar key=k x')
        expect(chat.scriptstate.$k).toBe('x')
        expect(state.setDatabase).toHaveBeenCalled()
    })
})
