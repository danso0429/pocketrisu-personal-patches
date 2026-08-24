/**
 * Focused PocketRisu adaptation of Haejeok RisuAI's pre-generation message,
 * script-message, and plugin-update persistence ordering.
 *
 * Source basis: Haejeok RisuAI e9d035683cdf9f0207eed193ee36f9bdb117f658
 * (commits 0fd90fcf, 23bb7437, 313ecdff, and 3b5b3d39).
 */

export interface HaejeokDurableSaveScope {
    chat?: [string, string]
    plugins?: boolean
}

export type HaejeokDurableSave = (
    scope: HaejeokDurableSaveScope,
) => Promise<void>

export type HaejeokDurableChatPayloadSave<T> = (
    chaId: string,
    chatId: string,
    chat: T,
) => Promise<void>

export function isServerOrchestrationRuntime(): boolean {
    try {
        return !!(globalThis as typeof globalThis & { __bgOrch?: unknown }).__bgOrch
    } catch {
        return false
    }
}

export async function persistActiveChatBeforeGeneration(input: {
    appendedUserMessage: boolean
    chaId?: string
    chatId?: string
}, save: HaejeokDurableSave): Promise<boolean> {
    if (
        !input.appendedUserMessage
        || !input.chaId
        || !input.chatId
        || isServerOrchestrationRuntime()
    ) return false

    await save({ chat: [input.chaId, input.chatId] })
    return true
}

export async function persistScriptMessagesBeforeReturn<T>(input: {
    messagesMutated: boolean
    chaId?: string
    chatId?: string
    chat?: T
}, save: HaejeokDurableChatPayloadSave<T>): Promise<boolean> {
    if (
        !input.messagesMutated
        || !input.chaId
        || !input.chatId
        || !input.chat
        || isServerOrchestrationRuntime()
    ) return false

    await save(input.chaId, input.chatId, input.chat)
    return true
}

export async function persistPluginsBeforeReload(
    save: HaejeokDurableSave,
    reload: () => Promise<void>,
): Promise<void> {
    await save({ plugins: true })
    await reload()
}
