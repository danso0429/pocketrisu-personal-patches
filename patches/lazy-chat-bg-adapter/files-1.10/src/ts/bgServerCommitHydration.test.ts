import { describe, expect, it, vi } from 'vitest'
import {
    hydrateServerCommittedOrchestration,
    serverChatCommitReceipt,
} from './bgServerCommitHydration'

function receipt() {
    return {
        contractVersion: 'bg_server_chat_commit.v1',
        commitReceiptId: 'commit-receipt-1',
        operationId: 'operation-hydration-1',
        resultId: 'result-hydration-1',
        publishSeq: 2,
        requestedCharId: 'char-1',
        requestedChatId: 'chat-1',
        storedChatId: 'chat-1',
        baseChatRevision: 'base-revision',
        storedRevision: 'stored-revision',
        storageDisposition: 'original',
        chatCommitted: true,
        finalContentHash: 'stored-revision',
        effects: {
            chat: { status: 'committed' },
            metadata: { status: 'committed' },
        },
    }
}

function projection() {
    return {
        contract: 'bg_chat_execution_projection.v1',
        charId: 'char-1',
        chatId: 'chat-1',
        chatRevision: 'stored-revision',
        coverage: 'authoritative',
        owners: [{ operationId: 'operation-hydration-1' }],
        pendingInputCommands: [],
    }
}

describe('server-committed result hydration', () => {
    it('accepts both wrapped result and direct status receipt shapes', () => {
        expect(serverChatCommitReceipt({
            serverChatCommit: { status: 'committed', receipt: receipt() },
        })).toEqual(receipt())
        expect(serverChatCommitReceipt({ serverChatCommit: receipt() })).toEqual(receipt())
    })

    it('reads matching authoritative projection before adopting canonical chat', async () => {
        const readProjection = vi.fn().mockResolvedValue(projection())
        const adoptChat = vi.fn().mockResolvedValue({ adopted: true, chat: { id: 'chat-1' } })
        await expect(hydrateServerCommittedOrchestration({
            data: { serverChatCommit: { status: 'committed', receipt: receipt() } },
            operationId: 'operation-hydration-1',
            charId: 'char-1',
            chatId: 'chat-1',
            allowedCurrentRevisions: ['base-local-revision'],
            readProjection,
            adoptChat,
        })).resolves.toMatchObject({
            hydrated: true,
            receipt: receipt(),
            projection: projection(),
        })
        expect(readProjection).toHaveBeenCalledWith('char-1', 'chat-1', 'stored-revision')
        expect(adoptChat).toHaveBeenCalledWith({
            charId: 'char-1',
            chatId: 'chat-1',
            expectedServerRevision: 'stored-revision',
            allowedCurrentRevisions: ['base-local-revision'],
        })
    })

    it('does not fetch or mutate for a mismatched operation or coordinate', async () => {
        const readProjection = vi.fn()
        const adoptChat = vi.fn()
        await expect(hydrateServerCommittedOrchestration({
            data: { serverChatCommit: receipt() },
            operationId: 'operation-other-1',
            charId: 'char-1',
            chatId: 'chat-1',
            allowedCurrentRevisions: ['base-local-revision'],
            readProjection,
            adoptChat,
        })).resolves.toEqual({ hydrated: false, reason: 'commit-receipt-invalid' })
        expect(readProjection).not.toHaveBeenCalled()
        expect(adoptChat).not.toHaveBeenCalled()
    })

    it('adopts an authoritative descendant that still owns the receipt operation', async () => {
        const adoptChat = vi.fn().mockResolvedValue({
            adopted: true,
            chat: { id: 'chat-1' },
        })
        await expect(hydrateServerCommittedOrchestration({
            data: { serverChatCommit: receipt() },
            operationId: 'operation-hydration-1',
            charId: 'char-1',
            chatId: 'chat-1',
            allowedCurrentRevisions: ['base-local-revision'],
            readProjection: async () => ({ ...projection(), chatRevision: 'newer-revision' }),
            adoptChat,
        })).resolves.toMatchObject({
            hydrated: true,
            projection: { chatRevision: 'newer-revision' },
        })
        expect(adoptChat).toHaveBeenCalledWith({
            charId: 'char-1',
            chatId: 'chat-1',
            expectedServerRevision: 'newer-revision',
            allowedCurrentRevisions: ['base-local-revision'],
        })
    })

    it('refuses a descendant projection that no longer owns the receipt operation', async () => {
        const adoptChat = vi.fn()
        await expect(hydrateServerCommittedOrchestration({
            data: { serverChatCommit: receipt() },
            operationId: 'operation-hydration-1',
            charId: 'char-1',
            chatId: 'chat-1',
            allowedCurrentRevisions: ['base-local-revision'],
            readProjection: async () => ({
                ...projection(),
                chatRevision: 'newer-revision',
                owners: [{ operationId: 'operation-other-1' }],
            }),
            adoptChat,
        })).resolves.toEqual({ hydrated: false, reason: 'projection-invalid' })
        expect(adoptChat).not.toHaveBeenCalled()
    })

    it('preserves local state when canonical adoption refuses its revision fence', async () => {
        await expect(hydrateServerCommittedOrchestration({
            data: { serverChatCommit: receipt() },
            operationId: 'operation-hydration-1',
            charId: 'char-1',
            chatId: 'chat-1',
            allowedCurrentRevisions: ['base-local-revision'],
            readProjection: async () => projection(),
            adoptChat: async () => ({ adopted: false, reason: 'local-revision-conflict' }),
        })).resolves.toEqual({ hydrated: false, reason: 'local-revision-conflict' })
    })
})
