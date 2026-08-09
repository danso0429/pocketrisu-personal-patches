import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    failFirstA: true,
    setItem: vi.fn(),
    unsafe: vi.fn(),
}))

vi.mock('../globalApi.svelte', () => ({
    forageStorage: {
        keys: vi.fn(async () => []),
        getItem: vi.fn(async () => null),
        removeItem: vi.fn(async () => undefined),
        setItem: mocks.setItem,
    },
}))

vi.mock('./clientBuildHandshake', () => ({
    setClientBuildDraftUnsafe: mocks.unsafe,
}))

import { flushChatDraft, loadChatDraft } from './chatDraft'

describe('client build draft failure ownership', () => {
    it('keeps one chat unsafe when a different chat later saves successfully', async () => {
        mocks.setItem.mockImplementation(async (key: string) => {
            if (key.endsWith('/chat-a') && mocks.failFirstA) {
                mocks.failFirstA = false
                throw new Error('simulated draft write failure')
            }
        })

        flushChatDraft('character', 'chat-a', { m: 'draft a', t: '' })
        flushChatDraft('character', 'chat-b', { m: 'draft b', t: '' })
        await loadChatDraft('character', 'queue-drain-1')

        expect(mocks.setItem).toHaveBeenCalledTimes(2)
        expect(mocks.unsafe.mock.calls.at(-1)?.[0]).toBe(true)
        expect(mocks.unsafe.mock.calls.at(-1)?.[1]).toContain('draft a')

        flushChatDraft('character', 'chat-a', { m: 'newer draft a', t: '' })
        await loadChatDraft('character', 'queue-drain-2')

        expect(mocks.setItem).toHaveBeenCalledTimes(3)
        expect(mocks.unsafe.mock.calls.at(-1)?.[0]).toBe(false)
    })
})
