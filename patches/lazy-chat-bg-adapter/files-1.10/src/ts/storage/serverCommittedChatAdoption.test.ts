import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import { orchestrationChatRevision } from '../bgOrchestrationMerge'
import { NodeStorage } from './nodeStorage'

const storageMock = vi.hoisted(() => ({ realStorage: null as any }))
const tickMock = vi.hoisted(() => vi.fn(async () => {}))
const rememberSnapshotMock = vi.hoisted(() => vi.fn())

vi.mock('../globalApi.svelte', () => ({ forageStorage: storageMock }))
vi.mock('src/lang', () => ({ language: {} }))
vi.mock('../alert', () => ({ alertInput: vi.fn(), waitAlert: vi.fn(), notifyError: vi.fn() }))
vi.mock('./risuSave', async () => {
    const { default: codec } = await import('../../../server/node/utils.cjs')
    return { encodeRisuSaveLegacy: codec.encodeRisuSaveLegacy, decodeRisuSave: codec.decodeRisuSave }
})
vi.mock('svelte', () => ({ tick: tickMock }))
vi.mock('./database.svelte', () => ({
    appVer: 'test', nodeOnlyVer: 'test', normalizeChat: (chat: any) => chat,
    isChatStub: (value: any) => value?._stub === true && !Array.isArray(value?.message),
}))

const { adoptServerCommittedChat, isHydrating, peekServerChatSnapshot } = await import('./chatStorage')

function chat(data: string) {
    return {
        id: 'chat-1',
        name: 'Chat',
        message: [{ role: 'user', data, chatId: 'user-1' }],
    } as any
}

describe('server-committed chat adoption', () => {
    it.each(['saved', 'unsaved', 'evicted', 'during-read'])('bridges actual wire and view revisions only for an acknowledged %s snapshot', async state => {
        const { chatRevision } = createRequire(import.meta.url)('../../../server/node/chatDelta.cjs')
        const saved = chat('edited and saved')
        const before = structuredClone(saved)
        const after = { ...saved, message: [...saved.message, { role: 'char', chatId: 'answer', data: 'response' }] }
        const storage = new NodeStorage()
        storage.rememberChatContentSnapshot('char-1', 'chat-1', { chat: saved, revision: chatRevision(saved), encodedBytes: 200 })
        expect(orchestrationChatRevision(saved)).not.toBe(chatRevision(saved))
        if (state === 'unsaved') before.message[0].data = 'later unsaved edit'
        if (state === 'evicted') for (let i = 0; i < 4; i++) {
            storage.rememberChatContentSnapshot('char-1', `other-${i}`, { chat: { ...saved, id: `other-${i}` }, revision: `other-${i}`, encodedBytes: 200 })
        }
        const peek = vi.spyOn(storage, 'peekChatContentSnapshot').mockImplementation(async () => {
            if (state === 'during-read') before.message[0].data = 'edited during read'
            return { chat: after, revision: chatRevision(after), encodedBytes: 300 }
        })
        storageMock.realStorage = storage
        const chats = [before]
        const outcome = await adoptServerCommittedChat(chats, 'char-1', 'chat-1', chatRevision(after),
            ['original-delegation-display-revision'], orchestrationChatRevision, chatRevision(saved))
        expect(outcome.adopted).toBe(state === 'saved')
        if (state === 'saved') expect(chats[0].message.map((m: any) => m.data)).toEqual(['edited and saved', 'response'])
        else { expect(chats[0]).toBe(before); if (state !== 'during-read') expect(peek).not.toHaveBeenCalled() }
    })

    beforeEach(() => {
        tickMock.mockClear()
        rememberSnapshotMock.mockClear()
    })

    it('peeks at the canonical chat without advancing the client save baseline', async () => {
        const snapshot = { chat: chat('server'), revision: 'server-revision', encodedBytes: 123 }
        const peekChatContentSnapshot = vi.fn().mockResolvedValue(snapshot)
        storageMock.realStorage = {
            peekChatContentSnapshot,
            rememberChatContentSnapshot: rememberSnapshotMock,
        }
        await expect(peekServerChatSnapshot('char-1', 0, 'chat-1')).resolves.toBe(snapshot)
        expect(peekChatContentSnapshot).toHaveBeenCalledWith('char-1', 0, 'chat-1')
        expect(rememberSnapshotMock).not.toHaveBeenCalled()
    })

    it('replaces an unchanged full slot and adopts the server revision baseline', async () => {
        const before = chat('before')
        const after = chat('after')
        after.isStreaming = true
        after.activeStreamingDisplayOptimizationMode = 'enabled'
        const chats = [before]
        const snapshot = {
            chat: after,
            revision: 'stored-revision',
            encodedBytes: 123,
        }
        const peekChatContentSnapshot = vi.fn().mockResolvedValue(snapshot)
        storageMock.realStorage = {
            peekChatContentSnapshot,
            rememberChatContentSnapshot: rememberSnapshotMock,
        }

        await expect(adoptServerCommittedChat(
            chats,
            'char-1',
            'chat-1',
            'stored-revision',
            ['base-revision'],
            (value) => value === before ? 'base-revision' : 'unexpected',
        )).resolves.toMatchObject({ adopted: true, revision: 'stored-revision', chat: { ...after, isStreaming: false, activeStreamingDisplayOptimizationMode: undefined } })
        expect(chats[0]).not.toBe(after)
        expect(after.isStreaming).toBe(true)
        expect(after.activeStreamingDisplayOptimizationMode).toBe('enabled')
        expect(peekChatContentSnapshot).toHaveBeenCalledWith('char-1', 0, 'chat-1')
        expect(rememberSnapshotMock).toHaveBeenCalledWith('char-1', 'chat-1', snapshot)
        expect(tickMock).toHaveBeenCalledTimes(1)
        expect(isHydrating('char-1', 'chat-1')).toBe(false)
    })

    it('refuses an edited local slot before fetching server content', async () => {
        const chats = [chat('local edit')]
        const peekChatContentSnapshot = vi.fn()
        storageMock.realStorage = {
            peekChatContentSnapshot,
            rememberChatContentSnapshot: rememberSnapshotMock,
        }

        await expect(adoptServerCommittedChat(
            chats,
            'char-1',
            'chat-1',
            'stored-revision',
            ['base-revision'],
            () => 'local-edit-revision',
        )).resolves.toEqual({ adopted: false, reason: 'local-revision-conflict' })
        expect(peekChatContentSnapshot).not.toHaveBeenCalled()
        expect(rememberSnapshotMock).not.toHaveBeenCalled()
    })

    it('keeps the local slot when the fetched server revision differs from the receipt', async () => {
        const before = chat('before')
        const chats = [before]
        storageMock.realStorage = {
            peekChatContentSnapshot: vi.fn().mockResolvedValue({
                chat: chat('newer'),
                revision: 'newer-revision',
                encodedBytes: 123,
            }),
            rememberChatContentSnapshot: rememberSnapshotMock,
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
        expect(rememberSnapshotMock).not.toHaveBeenCalled()
    })

    it('does not overwrite a slot replaced while canonical fetch is in flight', async () => {
        const before = chat('before')
        const replacement = chat('replacement')
        const chats = [before]
        let resolveFetch!: (value: unknown) => void
        storageMock.realStorage = {
            peekChatContentSnapshot: vi.fn().mockReturnValue(new Promise(resolve => {
                resolveFetch = resolve
            })),
            rememberChatContentSnapshot: rememberSnapshotMock,
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
        resolveFetch({ chat: chat('server'), revision: 'stored-revision', encodedBytes: 123 })

        await expect(adopting).resolves.toEqual({
            adopted: false,
            reason: 'local-slot-replaced',
        })
        expect(chats[0]).toBe(replacement)
        expect(rememberSnapshotMock).not.toHaveBeenCalled()
    })

    it('hydrates a placeholder because it cannot contain an unsaved local edit', async () => {
        const placeholder = { id: 'chat-1', name: 'Chat', message: [], _placeholder: true } as any
        const after = chat('server')
        const chats = [placeholder]
        storageMock.realStorage = {
            peekChatContentSnapshot: vi.fn().mockResolvedValue({
                chat: after,
                revision: 'stored-revision',
                encodedBytes: 123,
            }),
            rememberChatContentSnapshot: rememberSnapshotMock,
        }

        await expect(adoptServerCommittedChat(
            chats,
            'char-1',
            'chat-1',
            'stored-revision',
            ['base-revision'],
            () => 'placeholder-revision',
        )).resolves.toMatchObject({ adopted: true, chat: after })
        expect(rememberSnapshotMock).toHaveBeenCalledTimes(1)
    })
})
