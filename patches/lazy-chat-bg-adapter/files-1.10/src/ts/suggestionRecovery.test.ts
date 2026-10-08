// @vitest-environment happy-dom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
let mount: typeof import('svelte').mount
let unmount: typeof import('svelte').unmount
let flushSync: typeof import('svelte').flushSync

const h = vi.hoisted(() => ({ db: {} as any, request: vi.fn(), selected: null as any, busy: null as any }))
vi.mock('@lucide/svelte', () => ({ CopyIcon: () => ({}), LanguagesIcon: () => ({}), RefreshCcwIcon: () => ({}) }))
vi.mock('./stores.svelte', async () => {
    const { writable } = await import('svelte/store')
    h.selected = writable(0)
    return { DBState: h, selectedCharID: h.selected }
})
vi.mock('./process/index.svelte', async () => {
    h.busy = (await import('./generationBusy')).doingChat
    return { doingChat: h.busy }
})
vi.mock('./process/request/request', () => ({ requestChatData: (...args: any[]) => h.request(...args) }))
vi.mock('./storage/database.svelte', () => ({ setDatabase: vi.fn() }))
vi.mock('./translator/translator', () => ({ translate: async (s: string) => s }))
vi.mock('./alert', () => ({ alertConfirm: async () => true }))
vi.mock('../lang', () => ({ language: { creatingSuggestions: 'suggestions', askReRollAutoSuggestions: 'refresh' } }))
vi.mock('./util', () => ({ getUserName: () => 'user', replacePlaceholders: (s: string) => s }))
vi.mock('./parser/parser.svelte', () => ({ ParseMarkdown: async (s: string) => s }))
vi.mock('./storage/defaultPrompts.js', () => ({ defaultAutoSuggestPrompt: 'suggest a reply' }))

let component: any, target: HTMLDivElement
const flush = async () => { flushSync(); for (let i = 0; i < 12; i++) await Promise.resolve(); flushSync() }
beforeEach(async () => {
    vi.resetModules()
    ;({ mount, unmount, flushSync } = await import('svelte'))
    // Vitest retains cached mock factories across resetModules.
    h.selected?.set(0)
    h.busy?.set(false)
    localStorage.clear()
    h.request = vi.fn(async () => ({ type: 'success', result: '- one' }))
    h.db = { characters: ['a', 'b'].map(id => ({ chaId: id, name: id, chatPage: 0,
        chats: [{ id: 'chat-' + id, message: [{ role: 'char', data: 'answer-' + id }] }] })),
    autoTranslate: false, translator: '', subModel: 'test', autoSuggestPrompt: '', useAutoSuggestions: true }
    target = document.createElement('div'); document.body.append(target)
})
afterEach(async () => { if (component) await unmount(component); component = null; target.remove() })
async function render() {
    const Suggestion = (await import('../lib/ChatScreens/Suggestion.svelte')).default
    component = mount(Suggestion, { target, props: { send: () => {}, messageInput: () => {} } })
    await flush()
}

describe('actual Suggestion recovery eligibility', () => {
    it('seeds a pending boot marker before mount and coalesces release without a busy pulse', async () => {
        const { writePendingMarker } = await import('./bgOrchestrationPending')
        writePendingMarker(localStorage, { charId: 'a', chatId: 'chat-a', operationId: 'pending',
            baselineMsgs: 1, deliveryVersion: 3, resultKeyVersion: 1, staticsMessagesApplied: 0,
            expectedChatRevision: 'base', ts: Date.now() })
        await render()
        expect(h.request).not.toHaveBeenCalled()
        expect(target.textContent).toContain('저장된 대화를 확인')
        const { reconciliationReadiness: readiness } = await import('./bgReconciliation')
        readiness.classifyTerminal('a', 'chat-a', 'pending')
        readiness.verifyTarget('a', 'chat-a', readiness.capture('a', 'chat-a'))
        h.busy.set(false)
        await flush()
        expect(h.request).toHaveBeenCalledTimes(1)
        expect(h.db.characters[0].chats[0].suggestMessages).toEqual(['one'])
    })
    it('aborts a page-zero request on character change and never writes or clears the newer request', async () => {
        const requests: Array<{ signal: AbortSignal, resolve: (value: any) => void }> = []
        h.request = vi.fn((_args, _model, signal) => new Promise(resolve => requests.push({ signal, resolve })))
        await render()
        expect(requests).toHaveLength(1)
        h.selected.set(1); await flush()
        expect(requests).toHaveLength(2)
        expect(requests[0].signal.aborted).toBe(true)
        requests[0].resolve({ type: 'success', result: '- stale' }); await flush()
        expect(h.db.characters[0].chats[0].suggestMessages).toBeUndefined()
        expect(h.db.characters[1].chats[0].suggestMessages).toBeUndefined()
        expect(target.textContent).toContain('suggestions')
        requests[1].resolve({ type: 'success', result: '- current' }); await flush()
        expect(h.db.characters[1].chats[0].suggestMessages).toEqual(['current'])
    })
    it('keeps an existing suggestion list on mount without another model call', async () => {
        h.db.characters[0].chats[0].suggestMessages = ['existing']
        await render()
        expect(h.request).not.toHaveBeenCalled()
        expect(target.textContent).toContain('existing')
    })
    it('refreshes suggestions after busy and replacement of the same chat slot', async () => {
        h.db.characters[0].chats[0].suggestMessages = ['old']
        await render()
        h.busy.set(true); await flush()
        const chat = h.db.characters[0].chats[0]
        h.db.characters[0].chats[0] = { ...chat, message: [...chat.message, { role: 'char', data: 'new answer' }] }
        h.busy.set(false); await flush()
        expect(h.request).toHaveBeenCalledTimes(1)
        expect(h.request.mock.calls[0][0].formated[1].content).toContain('new answer')
        expect(h.db.characters[0].chats[0].suggestMessages).toEqual(['one'])
    })
})
