import { describe, expect, it } from 'vitest'
import pkg from './chatDelta.cjs'

const {
    chatRevision,
    evaluateChatRevisionPrecondition,
    evaluateFullChatWritePrecondition,
    applyChatDelta,
    validateChatPatch,
    canonicalizeStrippedDatabase,
    resolveChatReadTarget,
    chatIdentityKey,
    collectMissingFullChatKeys,
    validateStrippedDatabase,
    validateStrippedDatabaseTransition,
} = pkg as {
    chatRevision: (chat: any) => string
    evaluateChatRevisionPrecondition: (
        chat: any,
        baseRevision?: string,
    ) => { currentRevision: string | null, matches: boolean }
    evaluateFullChatWritePrecondition: (
        chat: any,
        options?: { baseRevision?: string, createOnly?: boolean },
    ) => {
        currentRevision: string | null
        matches: boolean
        status: number | null
        error: string | null
    }
    applyChatDelta: (chat: any, patch: any[], expectedChatId: string) => any
    validateChatPatch: (patch: any[]) => void
    canonicalizeStrippedDatabase: (database: any) => any
    resolveChatReadTarget: (
        character: any,
        chatIndex: number,
        expectedChatId?: string,
    ) => any | null
    chatIdentityKey: (chaId: string, chatId: string) => string
    collectMissingFullChatKeys: (
        database: any,
        hasFullChat: (chaId: string, chatId: string) => boolean,
    ) => Set<string>
    validateStrippedDatabase: (
        database: any,
        hasFullChat: (chaId: string, chatId: string) => boolean,
        allowMissingFullChat?: (chaId: string, chatId: string) => boolean,
    ) => boolean
    validateStrippedDatabaseTransition: (
        previousDatabase: any,
        nextDatabase: any,
        hasFullChat: (chaId: string, chatId: string) => boolean,
    ) => boolean
}

function baseChat() {
    return {
        id: 'chat-1',
        name: 'Session',
        message: [
            { chatId: 'u1', role: 'user', data: 'hello' },
            { chatId: 'a1', role: 'char', data: 'hi', swipeId: 0, swipes: ['hi'] },
        ],
        localLore: [],
        scriptstate: { archive: { turn: 1 } },
    }
}

function strippedDatabase() {
    return {
        characters: [{
            chaId: 'char-1',
            chats: [{ id: 'chat-1', name: 'Session', _stub: true }],
        }],
    }
}

describe('incremental chat persistence', () => {
    it('applies an appended user/assistant turn without replacing the full chat', () => {
        const before = baseChat()
        const after = structuredClone(before)
        after.message.push(
            { chatId: 'u2', role: 'user', data: 'next' },
            { chatId: 'a2', role: 'char', data: 'answer', swipeId: 0, swipes: ['answer'] },
        )
        const patch = [
            { op: 'add', path: '/message/2', value: after.message[2] },
            { op: 'add', path: '/message/3', value: after.message[3] },
        ]

        expect(JSON.stringify(patch).length).toBeLessThan(JSON.stringify(after).length)
        expect(applyChatDelta(before, patch, before.id)).toEqual(after)
    })

    it('preserves reroll/swipe replacement exactly', () => {
        const before = baseChat()
        const after = structuredClone(before)
        after.message[1].swipes.push('rerolled')
        after.message[1].swipeId = 1
        after.message[1].data = 'rerolled'

        const patch = [
            { op: 'add', path: '/message/1/swipes/1', value: 'rerolled' },
            { op: 'replace', path: '/message/1/swipeId', value: 1 },
            { op: 'replace', path: '/message/1/data', value: 'rerolled' },
        ]
        expect(applyChatDelta(before, patch, before.id)).toEqual(after)
    })

    it('supports message deletion and plugin state changes', () => {
        const before = baseChat()
        const after = structuredClone(before)
        after.message.splice(1, 1)
        after.scriptstate.archive.turn = 0

        const patch = [
            { op: 'remove', path: '/message/1' },
            { op: 'replace', path: '/scriptstate/archive/turn', value: 0 },
        ]
        expect(applyChatDelta(before, patch, before.id)).toEqual(after)
    })

    it('rejects unsupported operations, root paths, prototype paths, and chat ID replacement', () => {
        const before = baseChat()
        expect(() => validateChatPatch([{ op: 'move', from: '/name', path: '/note' }]))
            .toThrow(/unsupported operation/i)
        expect(() => validateChatPatch([{ op: 'replace', path: '', value: {} }]))
            .toThrow(/non-root/i)
        expect(() => validateChatPatch([{ op: 'replace', path: '/bad~2escape', value: {} }]))
            .toThrow(/invalid JSON pointer escape/i)
        expect(() => applyChatDelta(before, [{ op: 'add', path: '/__proto__/polluted', value: true }], before.id))
            .toThrow(/blocked object path/i)
        expect(() => applyChatDelta(before, [{ op: 'replace', path: '/id', value: 'other' }], before.id))
            .toThrow(/chat ID/i)
    })

    it('rejects a delta that removes the message array', () => {
        const before = baseChat()
        expect(() => applyChatDelta(before, [{ op: 'remove', path: '/message' }], before.id))
            .toThrow(/invalid chat/i)
    })

    it('evaluates full-save revision preconditions without treating an absent precondition as a conflict', () => {
        const chat = baseChat()
        const revision = chatRevision(chat)
        expect(evaluateChatRevisionPrecondition(chat, undefined)).toEqual({
            currentRevision: revision,
            matches: true,
        })
        expect(evaluateChatRevisionPrecondition(chat, revision).matches).toBe(true)
        expect(evaluateChatRevisionPrecondition(chat, 'stale').matches).toBe(false)
        expect(evaluateChatRevisionPrecondition(null, revision)).toEqual({
            currentRevision: null,
            matches: false,
        })
    })

    it('enforces create-only and CAS semantics for the full chat endpoint', () => {
        const existing = baseChat()
        const revision = chatRevision(existing)

        expect(evaluateFullChatWritePrecondition(null, { createOnly: true })).toMatchObject({
            matches: true,
            status: null,
        })
        expect(evaluateFullChatWritePrecondition(existing, { createOnly: true })).toMatchObject({
            currentRevision: revision,
            matches: false,
            status: 412,
        })
        expect(evaluateFullChatWritePrecondition(existing)).toMatchObject({
            currentRevision: revision,
            matches: false,
            status: 428,
        })
        expect(evaluateFullChatWritePrecondition(existing, { baseRevision: revision })).toMatchObject({
            matches: true,
            status: null,
        })
        expect(evaluateFullChatWritePrecondition(null, { baseRevision: revision })).toMatchObject({
            currentRevision: null,
            matches: false,
            status: 409,
        })
    })
})

describe('stable chat read resolution', () => {
    const oldChat = { id: 'chat-old', name: 'Old', message: [] }
    const shiftedChat = { id: 'chat-shifted', name: 'Shifted', message: [] }
    const character = {
        chaId: 'char-1',
        chats: [oldChat, shiftedChat],
    }

    it('does not substitute an occupied path index for an absent stable ID', () => {
        expect(resolveChatReadTarget(character, 0, 'chat-new')).toBeNull()
    })

    it('finds an existing stable ID after its index shifts', () => {
        expect(resolveChatReadTarget(character, 0, 'chat-shifted')).toBe(shiftedChat)
    })

    it('retains index lookup for legacy callers without a stable ID header', () => {
        expect(resolveChatReadTarget(character, 1)).toBe(shiftedChat)
        expect(resolveChatReadTarget(character, 5)).toBeNull()
    })

    it('returns the exact legacy shell so the route can preserve its missing-payload response', () => {
        const legacyShell = { id: 'chat-legacy', name: 'Legacy', _stub: true }
        const withLegacyShell = {
            chaId: 'char-1',
            chats: [oldChat, legacyShell],
        }
        expect(resolveChatReadTarget(withLegacyShell, 0, 'chat-legacy')).toBe(legacyShell)
    })
})

describe('stripped database invariant', () => {
    const hasFullChat = (chaId: string, chatId: string) => chaId === 'char-1' && chatId === 'chat-1'

    it('canonicalizes only a missing characters field for a brand-new database', () => {
        const emptyDatabase = canonicalizeStrippedDatabase({})
        expect(emptyDatabase).toEqual({ characters: [] })
        expect(validateStrippedDatabase(emptyDatabase, () => false)).toBe(true)
        expect(canonicalizeStrippedDatabase({ format: 1 })).toEqual({ format: 1, characters: [] })

        for (const malformed of [
            { characters: null },
            { characters: {} },
            { characters: 'invalid' },
        ]) {
            const canonical = canonicalizeStrippedDatabase(malformed)
            expect(canonical).toBe(malformed)
            expect(() => validateStrippedDatabase(canonical, () => false)).toThrow(/characters must be an array/i)
        }
    })

    it('accepts canonical stubs backed by the full chat store', () => {
        expect(validateStrippedDatabase(strippedDatabase(), hasFullChat)).toBe(true)
    })

    it('rejects duplicate or empty character and chat identities', () => {
        const duplicateCharacter = strippedDatabase()
        duplicateCharacter.characters.push(structuredClone(duplicateCharacter.characters[0]))
        expect(() => validateStrippedDatabase(duplicateCharacter, hasFullChat)).toThrow(/duplicate chaId/i)

        const duplicateChat = strippedDatabase()
        duplicateChat.characters[0].chats.push(structuredClone(duplicateChat.characters[0].chats[0]))
        expect(() => validateStrippedDatabase(duplicateChat, hasFullChat)).toThrow(/duplicate chat id/i)

        const emptyId = strippedDatabase()
        emptyId.characters[0].chats[0].id = ''
        expect(() => validateStrippedDatabase(emptyId, hasFullChat)).toThrow(/empty id/i)

        const blankCharacterId = strippedDatabase()
        blankCharacterId.characters[0].chaId = '   '
        expect(() => validateStrippedDatabase(blankCharacterId, hasFullChat)).toThrow(/empty chaId/i)
    })

    it('rejects payload-bearing, noncanonical, or orphaned stubs', () => {
        const payload = strippedDatabase()
        Object.assign(payload.characters[0].chats[0], { message: [] })
        expect(() => validateStrippedDatabase(payload, hasFullChat)).toThrow(/canonical stub/i)

        const leakedField = strippedDatabase()
        Object.assign(leakedField.characters[0].chats[0], { scriptstate: {} })
        expect(() => validateStrippedDatabase(leakedField, hasFullChat)).toThrow(/non-stub fields/i)

        expect(() => validateStrippedDatabase(strippedDatabase(), () => false)).toThrow(/no full-chat payload/i)
    })

    it('grandfathers only baseline orphan identities while rejecting new ones', () => {
        const baseline = strippedDatabase()
        const noPayloads = () => false
        const grandfathered = collectMissingFullChatKeys(baseline, noPayloads)
        const allowBaseline = (chaId: string, chatId: string) =>
            grandfathered.has(chatIdentityKey(chaId, chatId))

        expect([...grandfathered]).toEqual([chatIdentityKey('char-1', 'chat-1')])
        expect(validateStrippedDatabase(baseline, noPayloads, allowBaseline)).toBe(true)
        expect(validateStrippedDatabaseTransition(baseline, baseline, noPayloads)).toBe(true)

        const metadataEdit = structuredClone(baseline)
        metadataEdit.characters[0].chats[0].name = 'Renamed legacy shell'
        expect(validateStrippedDatabaseTransition(baseline, metadataEdit, noPayloads)).toBe(true)

        const reordered = structuredClone(baseline)
        reordered.characters[0].chats.unshift({
            id: 'chat-backed',
            name: 'Backed',
            _stub: true,
        })
        expect(validateStrippedDatabaseTransition(
            baseline,
            reordered,
            (chaId, chatId) => chaId === 'char-1' && chatId === 'chat-backed',
        )).toBe(true)

        const introduced = structuredClone(baseline)
        introduced.characters[0].chats.push({
            id: 'chat-new-orphan',
            name: 'Unsafe',
            _stub: true,
        })
        expect(() => validateStrippedDatabaseTransition(baseline, introduced, noPayloads))
            .toThrow(/chat-new-orphan has no full-chat payload/i)

        const moved = structuredClone(baseline)
        moved.characters[0].chaId = 'char-other'
        expect(() => validateStrippedDatabaseTransition(baseline, moved, noPayloads))
            .toThrow(/chat-1 has no full-chat payload/i)
    })
})
