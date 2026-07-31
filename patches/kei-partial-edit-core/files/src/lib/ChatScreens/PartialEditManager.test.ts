// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const storeMocks = vi.hoisted(() => {
    let reloadValue: Record<number, number> = {}
    return {
        DBState: { db: {} as any },
        selIdState: { selId: 0 },
        ReloadChatPointer: {
            subscribe(run: (value: Record<number, number>) => void) {
                run(reloadValue)
                return () => {}
            },
            set(value: Record<number, number>) {
                reloadValue = value
            },
            update(updater: (value: Record<number, number>) => Record<number, number>) {
                reloadValue = updater(reloadValue)
            },
        },
    }
})

vi.mock('src/ts/stores.svelte', () => storeMocks)

import { mount, tick, unmount } from 'svelte'
import { get } from 'svelte/store'
import PartialEditManager from './PartialEditManager.svelte'
import { DBState, ReloadChatPointer } from 'src/ts/stores.svelte'
import type { Message } from 'src/ts/storage/database.svelte'

const mountedComponents: unknown[] = []

function createChatScreen(messages: Message[]) {
    const screenRoot = document.createElement('div')
    screenRoot.className = 'default-chat-screen'

    messages.forEach((message, index) => {
        const chatRoot = document.createElement('div')
        chatRoot.className = 'risu-chat'
        chatRoot.dataset.chatIndex = String(index)
        chatRoot.dataset.chatId = message.chatId ?? ''
        chatRoot.dataset.partialEditDisabled = 'false'
        chatRoot.dataset.partialEditTranslated = 'false'

        const bodyRoot = document.createElement('span')
        bodyRoot.className = 'chattext'
        const paragraph = document.createElement('p')
        paragraph.textContent = message.data
        paragraph.getBoundingClientRect = () => new DOMRect(20, 100, 240, 40)
        bodyRoot.appendChild(paragraph)
        chatRoot.appendChild(bodyRoot)
        screenRoot.appendChild(chatRoot)
    })

    document.body.appendChild(screenRoot)
    return screenRoot
}

function renderManager(
    screenRoot: HTMLElement,
    messages: Message[],
    options: {
        blockEditEnabled?: boolean
        dragEditEnabled?: boolean
    } = {},
) {
    const target = document.createElement('div')
    document.body.appendChild(target)
    const mounted = mount(PartialEditManager, {
        target,
        props: {
            screenRoot,
            messages,
            characterIndex: 0,
            chatPage: 0,
            chatId: 'chat-1',
            blockEditEnabled: options.blockEditEnabled ?? true,
            dragEditEnabled: options.dragEditEnabled ?? true,
        },
    })
    mountedComponents.push(mounted)
    return { target, mounted }
}

async function openBlockEditor(
    screenRoot: HTMLElement,
    messageIndex: number,
) {
    await tick()
    const paragraph = screenRoot.querySelectorAll('p')[messageIndex] as HTMLParagraphElement
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(paragraph)
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 30, clientY: 110 }))
    await tick()
    const editButton = document.body.querySelector<HTMLButtonElement>('.partial-edit-btn-edit')
    expect(editButton).not.toBeNull()
    editButton?.click()
    await tick()
}

async function replaceEditorText(value: string) {
    const textarea = document.body.querySelector<HTMLTextAreaElement>('textarea')
    expect(textarea).not.toBeNull()
    textarea!.value = value
    textarea!.dispatchEvent(new Event('input', { bubbles: true }))
    await tick()
}

beforeEach(() => {
    DBState.db = {
        zoomsize: 100,
        lineHeight: 1.25,
        characters: [{
            chatPage: 0,
            chats: [{
                id: 'chat-1',
                message: [],
            }],
        }],
    } as typeof DBState.db
    ReloadChatPointer.set({})
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
        queueMicrotask(() => callback(0))
        return 1
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
})

afterEach(async () => {
    const components = mountedComponents.splice(0)
    await Promise.all(components.map((component) => unmount(component as never)))
    await tick()
    await new Promise((resolve) => window.setTimeout(resolve, 30))
    document.body.replaceChildren()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

describe('PartialEditManager', () => {
    it('registers one shared listener set regardless of message count', async () => {
        const messages: Message[] = Array.from({ length: 20 }, (_, index) => ({
            role: 'char',
            data: `message ${index}`,
            chatId: `message-${index}`,
        }))
        DBState.db.characters[0].chats[0].message = messages
        const screenRoot = createChatScreen(messages)
        const addSpy = vi.spyOn(document, 'addEventListener')
        const removeSpy = vi.spyOn(document, 'removeEventListener')

        const { mounted } = renderManager(screenRoot, messages)
        await tick()

        for (const eventName of ['mousemove', 'selectionchange', 'mousedown', 'scroll']) {
            expect(addSpy.mock.calls.filter(([name]) => name === eventName)).toHaveLength(1)
        }

        await unmount(mounted as never)
        mountedComponents.splice(mountedComponents.indexOf(mounted), 1)

        for (const eventName of ['mousemove', 'selectionchange', 'mousedown', 'scroll']) {
            expect(removeSpy.mock.calls.some(([name]) => name === eventName)).toBe(true)
        }
    })

    it('edits only the resolved message and its active swipe', async () => {
        const messages: Message[] = [
            { role: 'char', data: 'first message', chatId: 'message-0' },
            {
                role: 'char',
                data: 'second message',
                chatId: 'message-1',
                swipes: ['second message'],
                swipeId: 0,
            },
        ]
        DBState.db.characters[0].chats[0].message = messages
        const screenRoot = createChatScreen(messages)
        renderManager(screenRoot, messages, { dragEditEnabled: false })

        await openBlockEditor(screenRoot, 1)
        await replaceEditorText('updated message')
        document.body.querySelector<HTMLButtonElement>('.partial-edit-save-btn')?.click()
        await tick()

        expect(messages[0].data).toBe('first message')
        expect(messages[1].data).toBe('updated message')
        expect(messages[1].swipes?.[0]).toBe('updated message')
        expect(get(ReloadChatPointer)).toEqual({ 1: 1 })
        expect(document.body.querySelector('textarea')).toBeNull()
    })

    it('saves a translated selection only through its issued context', async () => {
        const messages: Message[] = [
            { role: 'char', data: 'original message', chatId: 'message-0' },
        ]
        DBState.db.characters[0].chats[0].message = messages
        const screenRoot = createChatScreen(messages)
        const chatRoot = screenRoot.querySelector<HTMLElement>('[data-chat-index="0"]')!
        const paragraph = chatRoot.querySelector('p')!
        const token = {}
        paragraph.textContent = 'translated message'
        chatRoot.dataset.partialEditTranslated = 'true'

        chatRoot.addEventListener('risu-partial-edit-translation-context', (event) => {
            const detail = (event as CustomEvent<{
                respond: (
                    context: Promise<{ token: object; key: string; data: string } | null>,
                ) => void
            }>).detail
            detail.respond(Promise.resolve({
                token,
                key: 'message-0-cache-key',
                data: 'translated message',
            }))
        })
        const writes: Array<Record<string, unknown>> = []
        chatRoot.addEventListener('risu-partial-edit-translation-save', (event) => {
            const detail = (event as CustomEvent<{
                token: object
                key: string
                expectedData: string
                data: string
                respond: (result: Promise<boolean>) => void
            }>).detail
            writes.push(detail)
            detail.respond(Promise.resolve(
                detail.token === token
                && detail.key === 'message-0-cache-key'
                && detail.expectedData === 'translated message',
            ))
        })
        renderManager(screenRoot, messages, { dragEditEnabled: false })

        await openBlockEditor(screenRoot, 0)
        await vi.waitFor(() => {
            expect(document.body.querySelector('textarea')).not.toBeNull()
        })
        await replaceEditorText('updated translation')
        document.body.querySelector<HTMLButtonElement>('.partial-edit-save-btn')?.click()
        await vi.waitFor(() => {
            expect(document.body.querySelector('textarea')).toBeNull()
        })

        expect(messages[0].data).toBe('original message')
        expect(get(ReloadChatPointer)).toEqual({})
        expect(writes).toHaveLength(1)
        expect(writes[0]).toMatchObject({
            token,
            key: 'message-0-cache-key',
            expectedData: 'translated message',
            data: 'updated translation',
        })
    })

    it.each([
        ['a false result', () => Promise.resolve(false)],
        ['a rejected result', () => Promise.reject(new Error('storage failed'))],
    ])('keeps the translated edit available after %s', async (_label, result) => {
        const messages: Message[] = [
            { role: 'char', data: 'original message', chatId: 'message-0' },
        ]
        DBState.db.characters[0].chats[0].message = messages
        const screenRoot = createChatScreen(messages)
        const chatRoot = screenRoot.querySelector<HTMLElement>('[data-chat-index="0"]')!
        chatRoot.querySelector('p')!.textContent = 'translated message'
        chatRoot.dataset.partialEditTranslated = 'true'

        chatRoot.addEventListener('risu-partial-edit-translation-context', (event) => {
            const detail = (event as CustomEvent<{
                respond: (
                    context: Promise<{ token: object; key: string; data: string } | null>,
                ) => void
            }>).detail
            detail.respond(Promise.resolve({
                token: {},
                key: 'message-0-cache-key',
                data: 'translated message',
            }))
        })
        chatRoot.addEventListener('risu-partial-edit-translation-save', (event) => {
            const detail = (event as CustomEvent<{
                respond: (saved: Promise<boolean>) => void
            }>).detail
            detail.respond(result())
        })
        renderManager(screenRoot, messages, { dragEditEnabled: false })

        await openBlockEditor(screenRoot, 0)
        await vi.waitFor(() => {
            expect(document.body.querySelector('textarea')).not.toBeNull()
        })
        await replaceEditorText('unsaved translation')
        document.body.querySelector<HTMLButtonElement>('.partial-edit-save-btn')?.click()
        await vi.waitFor(() => {
            expect(document.body.querySelector('[role="alert"]')).not.toBeNull()
        })

        expect(document.body.querySelector<HTMLTextAreaElement>('textarea')?.value)
            .toBe('unsaved translation')
        expect(document.body.querySelector('[role="alert"]')?.textContent)
            .toContain('could not be saved')
        expect(messages[0].data).toBe('original message')
        expect(get(ReloadChatPointer)).toEqual({})
    })

    it('does not fall back to the original when translation context is unavailable', async () => {
        const messages: Message[] = [
            { role: 'char', data: 'same rendered text', chatId: 'message-0' },
        ]
        DBState.db.characters[0].chats[0].message = messages
        const screenRoot = createChatScreen(messages)
        const chatRoot = screenRoot.querySelector<HTMLElement>('[data-chat-index="0"]')!
        chatRoot.dataset.partialEditTranslated = 'true'
        renderManager(screenRoot, messages, { dragEditEnabled: false })

        await openBlockEditor(screenRoot, 0)
        await tick()

        expect(document.body.querySelector('textarea')).toBeNull()
        expect(messages[0].data).toBe('same rendered text')
        expect(get(ReloadChatPointer)).toEqual({})
    })

    it('cancels an edit when equal-text messages reorder without ids', async () => {
        const first: Message = { role: 'char', data: 'same message' }
        const second: Message = { role: 'char', data: 'same message' }
        const messages = [first, second]
        DBState.db.characters[0].chats[0].message = messages
        const screenRoot = createChatScreen(messages)
        renderManager(screenRoot, messages, { dragEditEnabled: false })

        await openBlockEditor(screenRoot, 1)
        await replaceEditorText('must not be written')
        messages.splice(0, 2, second, first)
        document.body.querySelector<HTMLButtonElement>('.partial-edit-save-btn')?.click()
        await tick()

        expect(first.data).toBe('same message')
        expect(second.data).toBe('same message')
        expect(get(ReloadChatPointer)).toEqual({})
        expect(document.body.querySelector('textarea')).toBeNull()
    })

    it('clears a pending translation edit when the target changes during lookup', async () => {
        const messages: Message[] = [
            { role: 'char', data: 'original message', chatId: 'message-0' },
        ]
        DBState.db.characters[0].chats[0].message = messages
        const screenRoot = createChatScreen(messages)
        const chatRoot = screenRoot.querySelector<HTMLElement>('[data-chat-index="0"]')!
        chatRoot.querySelector('p')!.textContent = 'translated message'
        chatRoot.dataset.partialEditTranslated = 'true'
        let resolveContext!: (
            value: { token: object; key: string; data: string } | null,
        ) => void
        chatRoot.addEventListener('risu-partial-edit-translation-context', (event) => {
            const detail = (event as CustomEvent<{
                respond: (
                    context: Promise<{ token: object; key: string; data: string } | null>,
                ) => void
            }>).detail
            detail.respond(new Promise((resolve) => {
                resolveContext = resolve
            }))
        })
        const saveSpy = vi.fn()
        chatRoot.addEventListener('risu-partial-edit-translation-save', saveSpy)
        renderManager(screenRoot, messages, { dragEditEnabled: false })

        await openBlockEditor(screenRoot, 0)
        messages[0].data = 'changed elsewhere'
        resolveContext({
            token: {},
            key: 'stale-key',
            data: 'translated message',
        })
        await vi.waitFor(() => {
            expect(document.body.querySelector('textarea')).toBeNull()
            expect(document.body.querySelector('[role="dialog"]')).toBeNull()
        })

        expect(messages[0].data).toBe('changed elsewhere')
        expect(saveSpy).not.toHaveBeenCalled()
        expect(get(ReloadChatPointer)).toEqual({})
    })

    it('rejects greeting roots and invalidates a captured DOM identity', async () => {
        const messages: Message[] = [
            { role: 'char', data: 'editable message', chatId: 'message-0' },
        ]
        DBState.db.characters[0].chats[0].message = messages
        const screenRoot = createChatScreen(messages)
        const greeting = document.createElement('div')
        greeting.className = 'risu-chat'
        greeting.dataset.chatIndex = '-1'
        greeting.dataset.chatId = ''
        const greetingBody = document.createElement('span')
        greetingBody.className = 'chattext'
        const greetingParagraph = document.createElement('p')
        greetingParagraph.textContent = 'greeting'
        greetingBody.appendChild(greetingParagraph)
        greeting.appendChild(greetingBody)
        screenRoot.appendChild(greeting)

        const elementFromPoint = vi.spyOn(document, 'elementFromPoint')
        renderManager(screenRoot, messages, { dragEditEnabled: false })
        await tick()

        elementFromPoint.mockReturnValue(greetingParagraph)
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: 10, clientY: 10 }))
        await tick()
        expect(document.body.querySelector('.partial-edit-btn-wrapper')).toBeNull()

        const paragraph = screenRoot.querySelector<HTMLParagraphElement>('[data-chat-index="0"] p')!
        elementFromPoint.mockReturnValue(paragraph)
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: 30, clientY: 110 }))
        await tick()
        document.body.querySelector<HTMLButtonElement>('.partial-edit-btn-edit')?.click()
        await tick()
        expect(document.body.querySelector('textarea')).not.toBeNull()

        paragraph.closest<HTMLElement>('.risu-chat')!.dataset.chatIndex = '1'
        await tick()
        document.body.querySelector<HTMLButtonElement>('.partial-edit-save-btn')?.click()
        await tick()

        expect(messages[0].data).toBe('editable message')
        expect(get(ReloadChatPointer)).toEqual({})
        expect(document.body.querySelector('textarea')).toBeNull()
    })
})
