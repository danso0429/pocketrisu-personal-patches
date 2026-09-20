export type ChatSaveIntent = 'create' | 'update'

type ServerDatabaseIdentityShape = {
    characters?: Array<{
        chaId?: string
        chats?: Array<{ id?: string } | null>
    } | null>
}

type CurrentDatabasePayloadShape = {
    characters?: Array<{
        chaId?: string
        chats?: Array<{
            id?: string
            message?: unknown
            _placeholder?: boolean
        } | null>
    } | null>
}

export interface ChatIdentity {
    chaId: string
    chatId: string
}

/**
 * Classify against the last server-confirmed database, never the mutable live
 * array. New chats are inserted into the live array before their payload is
 * saved, while a remotely deleted existing chat must remain an update conflict
 * rather than being recreated.
 */
export function classifyChatSaveIntent(
    serverDatabase: ServerDatabaseIdentityShape | null | undefined,
    chaId: string,
    chatId: string,
): ChatSaveIntent {
    if (!Array.isArray(serverDatabase?.characters)) return 'update'
    const character = serverDatabase.characters.find((entry) => entry?.chaId === chaId)
    if (!character) return 'create'
    if (!Array.isArray(character.chats)) return 'update'
    return character.chats.some((chat) => chat?.id === chatId)
        ? 'update'
        : 'create'
}

/**
 * Find full chat payloads present in the mutable client database but absent
 * from the last server-confirmed metadata snapshot. This is independent of
 * the reactive dirty tracker: a newly inserted empty chat must reach the chat
 * endpoint before any database patch can publish its stub.
 */
export function collectUnconfirmedChatPayloads(
    serverDatabase: ServerDatabaseIdentityShape | null | undefined,
    currentDatabase: CurrentDatabasePayloadShape | null | undefined,
): ChatIdentity[] {
    if (!Array.isArray(serverDatabase?.characters)) return []
    if (!Array.isArray(currentDatabase?.characters)) return []

    const confirmed = new Map<string, Set<string>>()
    for (const character of serverDatabase.characters) {
        if (!character?.chaId || !Array.isArray(character.chats)) continue
        confirmed.set(
            character.chaId,
            new Set(character.chats.map(chat => chat?.id).filter((id): id is string => !!id)),
        )
    }

    const result: ChatIdentity[] = []
    const seen = new Set<string>()
    for (const character of currentDatabase.characters) {
        if (!character?.chaId || !Array.isArray(character.chats)) continue
        const confirmedChats = confirmed.get(character.chaId)
        for (const chat of character.chats) {
            if (!chat?.id || chat._placeholder || !Array.isArray(chat.message)) continue
            if (confirmedChats?.has(chat.id)) continue
            const key = `${character.chaId}|${chat.id}`
            if (seen.has(key)) continue
            seen.add(key)
            result.push({ chaId: character.chaId, chatId: chat.id })
        }
    }
    return result
}

export function findRecoverableChatPayload(
    currentDatabase: CurrentDatabasePayloadShape | null | undefined,
    identity: ChatIdentity | null | undefined,
): ChatIdentity | null {
    if (!identity?.chaId || !identity.chatId || !Array.isArray(currentDatabase?.characters)) return null
    const character = currentDatabase.characters.find(entry => entry?.chaId === identity.chaId)
    const chat = character?.chats?.find(entry => entry?.id === identity.chatId)
    if (!chat || chat._placeholder || !Array.isArray(chat.message)) return null
    return identity
}
