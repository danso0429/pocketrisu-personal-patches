import { beforeEach, describe, expect, it, vi } from 'vitest'

const storageMock = vi.hoisted(() => ({ realStorage: null as any }))
const tickMock = vi.hoisted(() => vi.fn(async () => {}))

vi.mock('../globalApi.svelte', () => ({ forageStorage: storageMock }))
vi.mock('svelte', () => ({ tick: tickMock }))
vi.mock('./database.svelte', () => ({
    isChatStub: (value: any) => value?._stub === true && !Array.isArray(value?.message),
}))

const { adoptServerCommittedChat, isHydrating } = await import('./chatStorage')

function chat(data: string) {
    return {
        id: 'chat-1',
        name: 'Chat',
        message: [{ role: 'user', data, chatId: 'user-1' }],
    } as any
}

describe('server-committed chat adoption', () => {
    beforeEach(() => {
        tickMock.mockClear()
    })

    it('replaces an unchanged full slot and adopts the server revision baseline', async () => {
        const before = chat('before')
        const after = chat('after')
        const chats = [before]
        const fetchChatContentSnapshot = vi.fn().mockResolvedValue({
            chat: after,
            revision: 'stored-revision',
        })
        storageMock.realStorage = { fetchChatContentSnapshot }

        await expect(adoptServerCommittedChat(
            chats,
            'char-1',
            'chat-1',
            'stored-revision',
            ['base-revision'],
            (value) => value === before ? 'base-revision' : 'unexpected',
        )).resolves.toMatchObject({ adopted: true, revision: 'stored-revision', chat: after })
        expect(chats[0]).toBe(after)
        expect(fetchChatContentSnapshot).toHaveBeenCalledWith('char-1', 0, 'chat-1')
        expect(tickMock).toHaveBeenCalledTimes(1)
        expect(isHydrating('char-1', 'chat-1')).toBe(false)
    })

    it('refuses an edited local slot before fetching server content', async () => {
        const chats = [chat('local edit')]
        const fetchChatContentSnapshot = vi.fn()
        storageMock.realStorage = { fetchChatContentSnapshot }

        await expect(adoptServerCommittedChat(
            chats,
            'char-1',
            'chat-1',
            'stored-revision',
            ['base-revision'],
            () => 'local-edit-revision',
        )).resolves.toEqual({ adopted: false, reason: 'local-revision-conflict' })
        expect(fetchChatContentSnapshot).not.toHaveBeenCalled()
    })

    it('keeps the local slot when the fetched server revision differs from the receipt', async () => {
        const before = chat('before')
        const chats = [before]
        storageMock.realStorage = {
            fetchChatContentSnapshot: vi.fn().mockResolvedValue({
                chat: chat('newer'),
                revision: 'newer-revision',
            }),
        }

        await expect(adoptServerCommittedChat(
            chats,
            'char-1',
            'chat-1',
            'stored-revision',
            ['base-revision'],
            () => 'base-revision',
        )).resolves.toEqual({
            adopted: false,
            reason: 'server-revision-mismatch',
            currentRevision: 'newer-revision',
        })
        expect(chats[0]).toBe(before)
    })

    it('does not overwrite a slot replaced while canonical fetch is in flight', async () => {
        const before = chat('before')
        const replacement = chat('replacement')
        const chats = [before]
        let resolveFetch!: (value: unknown) => void
        storageMock.realStorage = {
            fetchChatContentSnapshot: vi.fn().mockReturnValue(new Promise(resolve => {
                resolveFetch = resolve
            })),
        }
        const adopting = adoptServerCommittedChat(
            chats,
            'char-1',
            'chat-1',
            'stored-revision',
            ['base-revision'],
            () => 'base-revision',
        )
        chats[0] = replacement
        resolveFetch({ chat: chat('server'), revision: 'stored-revision' })

        await expect(adopting).resolves.toEqual({
            adopted: false,
            reason: 'local-slot-replaced',
        })
        expect(chats[0]).toBe(replacement)
    })

    it('hydrates a placeholder because it cannot contain an unsaved local edit', async () => {
        const placeholder = { id: 'chat-1', name: 'Chat', message: [], _placeholder: true } as any
        const after = chat('server')
        const chats = [placeholder]
        storageMock.realStorage = {
            fetchChatContentSnapshot: vi.fn().mockResolvedValue({
                chat: after,
                revision: 'stored-revision',
            }),
        }

        await expect(adoptServerCommittedChat(
            chats,
            'char-1',
            'chat-1',
            'stored-revision',
            ['base-revision'],
            () => 'placeholder-revision',
        )).resolves.toMatchObject({ adopted: true, chat: after })
    })
})
