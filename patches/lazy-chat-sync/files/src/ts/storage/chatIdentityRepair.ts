export type ChatIdentityLike = {
    id?: unknown
    message?: unknown
    _placeholder?: boolean
    _stub?: boolean
}

export type CharacterIdentityLike = {
    chaId?: unknown
    chats?: unknown
}

export type ChatIdentityDatabaseLike = {
    characters?: unknown
}

export type AssignedChatIdentity = {
    chaId: string
    chatIndex: number
    chatId: string
}

type PendingAssignment = {
    chaId: string
    chatIndex: number
    chat: ChatIdentityLike
}

const MAX_ID_GENERATION_ATTEMPTS = 16

function isStableId(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0
}

function characterCollection(database: ChatIdentityDatabaseLike | null | undefined): CharacterIdentityLike[] | null {
    return Array.isArray(database?.characters)
        ? database.characters as CharacterIdentityLike[]
        : null
}

function collectReservedIds(
    candidateCharacters: CharacterIdentityLike[],
    confirmedCharacters: CharacterIdentityLike[] | null,
): Set<string> {
    const reserved = new Set<string>()
    for (const character of [
        ...candidateCharacters,
        ...(confirmedCharacters ?? []),
    ]) {
        if (isStableId(character?.chaId)) reserved.add(character.chaId)
        if (!Array.isArray(character?.chats)) continue
        for (const chat of character.chats as ChatIdentityLike[]) {
            if (isStableId(chat?.id)) reserved.add(chat.id)
        }
    }
    return reserved
}

function createUniqueId(createId: () => string, reserved: Set<string>): string {
    for (let attempt = 0; attempt < MAX_ID_GENERATION_ATTEMPTS; attempt++) {
        const candidate = createId()
        if (!isStableId(candidate) || reserved.has(candidate)) continue
        reserved.add(candidate)
        return candidate
    }
    throw new Error('Unable to allocate a unique stable chat ID')
}

/**
 * Repairs the one identity omission that can be resolved without guessing:
 * a fully hydrated chat belonging to a character absent from the confirmed
 * baseline. Existing characters may have payloads in lazy storage keyed by
 * their chat ID, so assigning them a replacement ID would silently fork or
 * orphan data and is deliberately rejected.
 *
 * Validation and ID generation complete before candidate state is mutated.
 */
export function assignMissingChatIdsToNewCharacters(
    candidateDatabase: ChatIdentityDatabaseLike,
    confirmedDatabase: ChatIdentityDatabaseLike | null | undefined,
    createId: () => string,
): AssignedChatIdentity[] {
    const candidateCharacters = characterCollection(candidateDatabase)
    if (!candidateCharacters) return []

    const confirmedCharacters = characterCollection(confirmedDatabase)
    const confirmedCharacterIds = new Set(
        (confirmedCharacters ?? [])
            .map(character => character?.chaId)
            .filter(isStableId),
    )
    const pending: PendingAssignment[] = []

    for (const character of candidateCharacters) {
        const chaId = character?.chaId
        if (!isStableId(chaId) || !Array.isArray(character.chats)) continue

        const isConfirmedCharacter = confirmedCharacters === null
            ? null
            : confirmedCharacterIds.has(chaId)

        for (let chatIndex = 0; chatIndex < character.chats.length; chatIndex++) {
            const chat = character.chats[chatIndex] as ChatIdentityLike
            if (isStableId(chat?.id)) continue

            if (isConfirmedCharacter === null) {
                throw new Error(
                    `Cannot safely assign an ID to ${chaId} chat ${chatIndex} without a confirmed database baseline`,
                )
            }
            if (isConfirmedCharacter) {
                throw new Error(
                    `Refusing to replace the missing ID of existing character ${chaId} chat ${chatIndex}`,
                )
            }
            if (!chat || typeof chat !== 'object' || Array.isArray(chat)
                || chat._placeholder || chat._stub || !Array.isArray(chat.message)) {
                throw new Error(
                    `Cannot assign an ID to unhydrated new character ${chaId} chat ${chatIndex}`,
                )
            }
            pending.push({ chaId, chatIndex, chat })
        }
    }

    const reserved = collectReservedIds(candidateCharacters, confirmedCharacters)
    const assignments = pending.map(item => ({
        ...item,
        chatId: createUniqueId(createId, reserved),
    }))

    for (const assignment of assignments) {
        assignment.chat.id = assignment.chatId
    }
    return assignments.map(({ chaId, chatIndex, chatId }) => ({
        chaId,
        chatIndex,
        chatId,
    }))
}
