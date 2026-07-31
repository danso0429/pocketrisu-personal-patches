import { describe, expect, it, vi } from 'vitest'
import {
    commitPartialEditTranslationCache,
    partialEditTranslationSaveMatchesIssue,
    samePartialEditMessageIdentity,
    type IssuedPartialEditTranslation,
    type PartialEditMessageIdentity,
    type PartialEditTranslationSaveRequest,
} from './keiPartialEditIdentity'

function makeIssue() {
    const issued: IssuedPartialEditTranslation = {
        token: {},
        key: 'translation-key',
        data: 'cached translation',
        chatRef: {},
        messageRef: {},
        messageIndex: 4,
        messageId: 'message-4',
        messageData: 'original message',
    }
    const request: PartialEditTranslationSaveRequest = {
        token: issued.token,
        key: issued.key,
        data: 'updated translation',
        expectedData: issued.data,
    }
    const current: PartialEditMessageIdentity = {
        chatRef: issued.chatRef,
        messageRef: issued.messageRef,
        messageIndex: issued.messageIndex,
        messageId: issued.messageId,
        messageData: issued.messageData,
    }
    return { issued, request, current }
}

describe('partial edit identity', () => {
    it('accepts only the exact issued token, cache, and message identity', () => {
        const { issued, request, current } = makeIssue()
        expect(partialEditTranslationSaveMatchesIssue(
            issued,
            request,
            current,
        )).toBe(true)
    })

    it.each([
        ['token', { token: {} }],
        ['key', { key: 'another-key' }],
        ['cached data', { expectedData: 'another translation' }],
    ])('rejects a changed %s', (_label, requestChange) => {
        const { issued, request, current } = makeIssue()
        expect(partialEditTranslationSaveMatchesIssue(
            issued,
            { ...request, ...requestChange },
            current,
        )).toBe(false)
    })

    it('rejects missing, reordered, replaced, or externally edited targets', () => {
        const { issued, request, current } = makeIssue()
        const invalidTargets: Array<PartialEditMessageIdentity | null> = [
            null,
            { ...current, chatRef: {} },
            { ...current, messageRef: {} },
            { ...current, messageIndex: current.messageIndex + 1 },
            { ...current, messageId: 'message-5' },
            { ...current, messageData: 'changed elsewhere' },
        ]
        for (const invalid of invalidTargets) {
            expect(partialEditTranslationSaveMatchesIssue(
                issued,
                request,
                invalid,
            )).toBe(false)
        }
    })

    it('does not equate separate id-less messages with equal text', () => {
        const chatRef = {}
        const expected: PartialEditMessageIdentity = {
            chatRef,
            messageRef: {},
            messageIndex: 1,
            messageId: null,
            messageData: 'same text',
        }
        expect(samePartialEditMessageIdentity({
            ...expected,
            messageRef: {},
        }, expected)).toBe(false)
    })

    it('commits a translated cache edit once when persistence succeeds', async () => {
        const write = vi.fn(async () => {})

        await expect(commitPartialEditTranslationCache(
            write,
            'translation-key',
            'updated translation',
            'cached translation',
        )).resolves.toBe(true)
        expect(write).toHaveBeenCalledTimes(1)
        expect(write).toHaveBeenCalledWith(
            'translation-key',
            'updated translation',
        )
    })

    it('attempts to restore the issued cache value when the write fails', async () => {
        const writes: string[] = []
        const write = vi.fn(async (_key: string, value: string) => {
            writes.push(value)
            if (value === 'updated translation') throw new Error('write failed')
        })

        await expect(commitPartialEditTranslationCache(
            write,
            'translation-key',
            'updated translation',
            'cached translation',
        )).resolves.toBe(false)
        expect(writes).toEqual([
            'updated translation',
            'cached translation',
        ])
    })

    it('returns false without leaking a rejection when restoration also fails', async () => {
        const write = vi.fn(async () => {
            throw new Error('storage unavailable')
        })

        await expect(commitPartialEditTranslationCache(
            write,
            'translation-key',
            'updated translation',
            'cached translation',
        )).resolves.toBe(false)
        expect(write).toHaveBeenCalledTimes(2)
    })
})
