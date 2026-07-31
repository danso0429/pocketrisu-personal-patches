import { describe, expect, it } from 'vitest'

import {
    getChatBodyReloadPointer,
    getChatRenderIdentity,
    isActiveStreamingMessage,
    type ChatRenderIdentityInput,
} from './keiChatRender'

function renderInput(
    overrides: Partial<ChatRenderIdentityInput> = {},
): ChatRenderIdentityInput {
    return {
        message: 'partial response',
        chatId: 'generation-id',
        index: 4,
        largePortrait: false,
        disabled: false,
        reloadPointer: 3,
        swipeId: 0,
        swipeCount: 1,
        isRerollTarget: true,
        model: 'model-a',
        role: 'char',
        chatStreaming: true,
        generationActive: true,
        isLastMessage: true,
        ...overrides,
    }
}

describe('active streaming message selection', () => {
    it('selects only the last character reply in an actively streaming chat', () => {
        expect(isActiveStreamingMessage(renderInput())).toBe(true)
        expect(isActiveStreamingMessage(renderInput({ role: 'user' }))).toBe(false)
        expect(isActiveStreamingMessage(renderInput({ isLastMessage: false }))).toBe(false)
        expect(isActiveStreamingMessage(renderInput({ chatStreaming: false }))).toBe(false)
        expect(isActiveStreamingMessage(renderInput({ generationActive: false }))).toBe(false)
    })

    it('uses the active chat state for per-preset streams independent of global settings', () => {
        expect(isActiveStreamingMessage(renderInput({
            chatStreaming: true,
            generationActive: true,
        }))).toBe(true)
    })
})

describe('chat render identity', () => {
    it('stays stable across content, model, and local reload updates while streaming', () => {
        const first = getChatRenderIdentity(renderInput())
        const next = getChatRenderIdentity(renderInput({
            message: 'partial response with another chunk',
            model: 'model-b',
            reloadPointer: 99,
        }))

        expect(first.streaming).toBe(true)
        expect(next.streaming).toBe(true)
        expect(next.identity).toBe(first.identity)
    })

    it('changes for content and explicit message reloads outside streaming', () => {
        const base = getChatRenderIdentity(renderInput({
            chatStreaming: false,
        }))
        const content = getChatRenderIdentity(renderInput({
            chatStreaming: false,
            message: 'completed response',
        }))
        const reloaded = getChatRenderIdentity(renderInput({
            chatStreaming: false,
            reloadPointer: 4,
        }))

        expect(base.streaming).toBe(false)
        expect(content.identity).not.toBe(base.identity)
        expect(reloaded.identity).not.toBe(base.identity)
    })

    it('remounts at both streaming lifecycle boundaries', () => {
        const before = getChatRenderIdentity(renderInput({
            chatStreaming: false,
            message: '',
        }))
        const active = getChatRenderIdentity(renderInput({
            message: '',
        }))
        const complete = getChatRenderIdentity(renderInput({
            chatStreaming: false,
            message: 'completed response',
        }))

        expect(active.identity).not.toBe(before.identity)
        expect(complete.identity).not.toBe(active.identity)
    })

    it('keeps structural message changes visible during streaming', () => {
        const base = getChatRenderIdentity(renderInput())
        for (const changed of [
            renderInput({ chatId: 'other-generation' }),
            renderInput({ index: 5 }),
            renderInput({ largePortrait: true }),
            renderInput({ disabled: true }),
            renderInput({ swipeId: 1 }),
            renderInput({ swipeCount: 2 }),
            renderInput({ isRerollTarget: false }),
        ]) {
            expect(getChatRenderIdentity(changed).identity).not.toBe(base.identity)
        }
    })
})

describe('ChatBody reload pointer', () => {
    it('keeps global reloads active while suppressing per-message streaming churn', () => {
        expect(getChatBodyReloadPointer(7, 11, true)).toBe(7)
        expect(getChatBodyReloadPointer(7, 11, false)).toBe(18)
    })
})
