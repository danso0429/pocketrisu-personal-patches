export interface ChatRenderIdentityInput {
    message: string
    chatId?: string
    index: number
    largePortrait: boolean
    disabled?: boolean | 'allBefore'
    reloadPointer: number
    swipeId: number
    swipeCount: number
    isRerollTarget: boolean
    model?: string
    role: 'user' | 'char'
    chatStreaming: boolean
    generationActive: boolean
    isLastMessage: boolean
}

export interface ChatRenderIdentity {
    identity: string
    streaming: boolean
}

export function isActiveStreamingMessage(
    input: Pick<
        ChatRenderIdentityInput,
        'role' | 'chatStreaming' | 'generationActive' | 'isLastMessage'
    >,
): boolean {
    return input.role === 'char'
        && input.chatStreaming
        && input.generationActive
        && input.isLastMessage
}

export function getChatRenderIdentity(
    input: ChatRenderIdentityInput,
): ChatRenderIdentity {
    const streaming = isActiveStreamingMessage(input)
    const message = streaming ? '' : input.message
    const reloadPointer = streaming ? 0 : input.reloadPointer
    const model = streaming ? '' : (input.model ?? '')
    const identity = message
        + model
        + (input.chatId ?? '')
        + input.index.toString()
        + input.largePortrait.toString()
        + input.disabled?.toString()
        + reloadPointer.toString()
        + input.swipeId.toString()
        + input.swipeCount.toString()
        + input.isRerollTarget.toString()
        + streaming.toString()

    return { identity, streaming }
}

export function getChatBodyReloadPointer(
    guiReloadPointer: number,
    messageReloadPointer: number,
    streaming: boolean,
): number {
    return guiReloadPointer + (streaming ? 0 : messageReloadPointer)
}
