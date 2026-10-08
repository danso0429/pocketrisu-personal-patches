import { describe, expect, it, vi } from 'vitest'
import {
    hydrateServerCommittedOrchestration,
    serverChatDeliveryDisposition,
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
    function terminalOptions() {
        return {
            data: { found: true, final: true, kind: 'terminal-success', operationId: receipt().operationId,
                resultId: receipt().resultId, publishSeq: 2, serverChatCommit: receipt() },
            operationId: receipt().operationId, charId: 'char-1', chatId: 'chat-1',
            allowedCurrentRevisions: ['old'],
            readProjection: vi.fn<() => Promise<unknown>>(async () => projection()),
            adoptChat: vi.fn(async (_input: any) => ({ adopted: true, chat: { id: 'chat-1' } })),
        }
    }

    it.each(['present', 'absent', 'character-missing'] as const)('requires both-source absence (%s)', async local => {
        const options = terminalOptions()
        options.readProjection.mockResolvedValue({ kind: 'chat-missing', currentRevision: null })
        const result = await hydrateServerCommittedOrchestration({ ...options, localTarget: () => local })
        expect(result).toEqual({ hydrated: false, reason: local === 'absent' ? 'target-deleted' : 'server-chat-missing' })
        expect(options.adoptChat).not.toHaveBeenCalled()
    })

    it('does not turn failed projection body consumption into deletion', async () => {
        const options = terminalOptions()
        options.readProjection.mockRejectedValue(new DOMException('timed out', 'TimeoutError'))
        await expect(hydrateServerCommittedOrchestration({ ...options, localTarget: () => 'absent' }))
            .resolves.toEqual({ hydrated: false, reason: 'projection-unavailable' })
        expect(options.adoptChat).not.toHaveBeenCalled()
    })

    it('requires fresh no-replacement proof before retiring a newer ownerless projection', async () => {
        const options = terminalOptions()
        options.readProjection.mockResolvedValue({ ...projection(), chatRevision: 'newer', owners: [] })
        await expect(hydrateServerCommittedOrchestration(options))
            .resolves.toMatchObject({ hydrated: false, reason: 'superseded-current' })
        expect(options.adoptChat).toHaveBeenCalledWith(expect.objectContaining({
            expectedServerRevision: 'newer', requireCurrent: true,
        }))
    })

    it('never infers supersession from owner absence at the original revision', async () => {
        const options = terminalOptions()
        options.readProjection.mockResolvedValue({ ...projection(), owners: [] })
        await expect(hydrateServerCommittedOrchestration(options))
            .resolves.toEqual({ hydrated: false, reason: 'projection-invalid' })
        expect(options.adoptChat).not.toHaveBeenCalled()
    })

    it('rechecks epoch after the projection read', async () => {
        const options = terminalOptions()
        let current = true
        options.readProjection.mockImplementation(async () => { current = false; return projection() })
        await expect(hydrateServerCommittedOrchestration({ ...options, isCurrent: () => current }))
            .resolves.toEqual({ hydrated: false, reason: 'stale-recovery' })
        expect(options.adoptChat).not.toHaveBeenCalled()
    })

    it('passes the saved wire revision separately from browser display fingerprints', async () => {
        const anchoredBaseRevision = 'a'.repeat(64)
        const committed = { ...receipt(), anchoredBaseRevision }
        const adoptChat = vi.fn(async (_input: { allowedCurrentRevisions: string[], savedServerRevision?: string }) => (
            { adopted: false, reason: 'local-revision-conflict' }
        ))
        const options = {
            data: { serverChatCommit: committed }, operationId: committed.operationId,
            charId: 'char-1', chatId: 'chat-1', allowedCurrentRevisions: ['original-local'],
            readProjection: async () => projection(), adoptChat,
        }
        expect(await hydrateServerCommittedOrchestration(options)).toMatchObject({ hydrated: false })
        expect(adoptChat.mock.calls[0][0].allowedCurrentRevisions)
            .toEqual(['original-local'])
        expect(adoptChat.mock.calls[0][0].savedServerRevision).toBe(anchoredBaseRevision)
        expect(serverChatCommitReceipt({ serverChatCommit: { ...committed, anchoredBaseRevision: 'invalid' } }))
            .toBeNull()
    })

    it('accepts both wrapped result and direct status receipt shapes', () => {
        expect(serverChatCommitReceipt({
            serverChatCommit: { status: 'committed', receipt: receipt() },
        })).toEqual(receipt())
        expect(serverChatCommitReceipt({ serverChatCommit: receipt() })).toEqual(receipt())
    })

    it('keeps server ownership for commit failures and invalid receipts', () => {
        expect(serverChatDeliveryDisposition({
            serverChatCommitVersion: 1,
            serverChatCommit: { status: 'committed', receipt: receipt() },
        })).toBe('server-committed')
        expect(serverChatDeliveryDisposition({
            serverChatCommitVersion: 1,
            serverChatCommit: { status: 'failed', reason: 'commit_failed' },
        })).toBe('server-owned-uncommitted')
        expect(serverChatDeliveryDisposition({
            serverChatCommitVersion: 1,
            serverChatCommit: { status: 'conflict', reason: 'base_revision_changed' },
        })).toBe('server-owned-uncommitted')
        expect(serverChatDeliveryDisposition({
            serverChatCommitVersion: 1,
            serverChatCommit: { status: 'committed', receipt: { ...receipt(), storedRevision: '' } },
        })).toBe('server-owned-uncommitted')
        expect(serverChatDeliveryDisposition({
            serverChatCommitVersion: 1,
            serverChatCommit: null,
        })).toBe('server-owned-uncommitted')
        expect(serverChatDeliveryDisposition({ serverChatCommit: null }))
            .toBe('legacy-client-owned')
        expect(serverChatDeliveryDisposition({ chat: { id: 'chat-1' } }))
            .toBe('legacy-client-owned')
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

    it('accepts a committed no-result readback after an exact ACK was lost to page exit', async () => {
        const data = {
            found: false,
            operationId: 'operation-hydration-1',
            operationState: 'chat-committed',
            serverChatCommit: receipt(),
        }
        await expect(hydrateServerCommittedOrchestration({
            data,
            operationId: 'operation-hydration-1',
            charId: 'char-1',
            chatId: 'chat-1',
            allowedCurrentRevisions: ['stored-revision'],
            readProjection: async () => projection(),
            adoptChat: async () => ({ adopted: true, chat: { id: 'chat-1' } }),
        })).resolves.toMatchObject({ hydrated: true, receipt: receipt() })
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
