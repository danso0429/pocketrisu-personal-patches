export interface PartialEditMessageIdentity {
    chatRef: object
    messageRef: object
    messageIndex: number
    messageId: string | null
    messageData: string
}

export interface PartialEditTranslationContext {
    token: object
    key: string
    data: string
}

export interface IssuedPartialEditTranslation
    extends PartialEditTranslationContext, PartialEditMessageIdentity {}

export interface PartialEditTranslationSaveRequest
    extends PartialEditTranslationContext {
    expectedData: string
}

export type PartialEditTranslationCacheWriter = (
    key: string,
    value: string,
    expectedValue?: string,
) => Promise<void>

export function samePartialEditMessageIdentity(
    current: PartialEditMessageIdentity | null,
    expected: PartialEditMessageIdentity,
) {
    return !!current
        && current.chatRef === expected.chatRef
        && current.messageRef === expected.messageRef
        && current.messageIndex === expected.messageIndex
        && current.messageId === expected.messageId
        && current.messageData === expected.messageData
}

export function partialEditTranslationSaveMatchesIssue(
    issued: IssuedPartialEditTranslation | null,
    request: PartialEditTranslationSaveRequest,
    current: PartialEditMessageIdentity | null,
) {
    return !!issued
        && request.token === issued.token
        && request.key === issued.key
        && request.expectedData === issued.data
        && samePartialEditMessageIdentity(current, issued)
}

export async function commitPartialEditTranslationCache(
    write: PartialEditTranslationCacheWriter,
    key: string,
    nextData: string,
    previousData: string,
) {
    try {
        await write(key, nextData, previousData)
        return true
    }
    catch {
        try {
            await write(key, previousData, nextData)
        }
        catch {
            // The caller receives false either way. The storage implementation
            // remains the authority for reporting its own persistent failure.
        }
        return false
    }
}
