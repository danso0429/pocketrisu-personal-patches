import { describe, expect, it } from 'vitest'
import { legacyDraftIdentity, validDraftIdentity } from './bgDraftIdentity'

describe('shared draft submission identity', () => {
    it('derives the same opaque identity for two loads of one legacy draft', async () => {
        const first = await legacyDraftIdentity('char-1', 'chat-1', 'same text', '')
        expect(await legacyDraftIdentity('char-1', 'chat-1', 'same text', '')).toBe(first)
        expect(validDraftIdentity(first)).toBe(true)
        expect(await legacyDraftIdentity('char-1', 'chat-1', 'changed text', ''))
            .not.toBe(first)
    })

    it('rejects a missing or malformed identity', () => {
        expect(validDraftIdentity(undefined)).toBe(false)
        expect(validDraftIdentity('short')).toBe(false)
        expect(validDraftIdentity('draft-original-1')).toBe(true)
    })
})
