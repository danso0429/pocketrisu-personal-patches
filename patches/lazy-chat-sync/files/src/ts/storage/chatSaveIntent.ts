export type ChatSaveIntent = 'create' | 'update'

type ServerDatabaseIdentityShape = {
    characters?: Array<{
        chaId?: string
        chats?: Array<{ id?: string } | null>
    } | null>
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
