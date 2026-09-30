import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import crypto from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'
import anchorPackage from './chatAnchorCommit.cjs'
const { captureChatAnchor, captureExecutionChatAnchor, resolveChatAnchor, checkChatAnchor, anchoredAssistantMessages } = anchorPackage as any
const message = (chatId: string, data: string, role = 'char') => ({ chatId, data, role })
const base = () => ({ id: 'chat', name: 'before', scriptstate: { a: '0', b: '0' },
    message: [message('old', 'before'), message('input', 'question', 'user')] })
const result = (chat: any) => ({ ...structuredClone(chat), message: [...structuredClone(chat.message), message('answer', 'response')] })

describe('anchored chat resolution', () => {
    it.each([false, true])('does not duplicate legacy history when native generation assigns IDs (edited=%s)', edited => {
        const canonical: any = base()
        delete canonical.message[0].chatId
        canonical.message[0].optional = undefined
        const execution = JSON.parse(JSON.stringify(canonical))
        const anchor = captureExecutionChatAnchor(execution)
        const generated = result(execution)
        generated.message[0].data = 'server history edit'
        const current = structuredClone(canonical)
        current.name = 'user rename'
        if (edited) current.message[0].data = 'user history edit'
        const output = resolveChatAnchor(anchor, generated, current)
        expect(output.chat.message).toHaveLength(3)
        expect(output.chat.message[0].data).toBe(edited ? 'user history edit' : 'server history edit')
        expect(output.chat.message[1].chatId).toBe('input')
        expect(output.chat.message[2].chatId).toBe('answer')
        expect(output.unreflected).toBe(edited)
        expect(output.chat.name).toBe('user rename')
    })

    it('identifies the answer even when a script deleted earlier history', () => {
        const before = base(), generated = result(before), anchor = captureChatAnchor(before)
        generated.message.shift()
        expect(generated.message.length).toBe(before.message.length)
        expect(anchoredAssistantMessages(anchor, generated).map((m: any) => m.chatId)).toEqual(['answer'])
        expect(resolveChatAnchor(anchor, generated, before).chat.message.map((m: any) => m.chatId))
            .toEqual(['input', 'answer'])
    })

    it('does not classify a duplicated legacy trailing message as known', () => {
        const before: any = base()
        before.message.push({ role: 'system', data: 'known' })
        const current = structuredClone(before)
        current.message.push({ role: 'system', data: 'known' })
        expect(checkChatAnchor(captureChatAnchor(before), current)).toBe('unknown_suffix')
    })

    it.each([false, true])('captures before mutation and preserves the actual pipeline result (malformed script message=%s)', async malformed => {
        const source = readFileSync(new URL('./bgOrchestrator.cjs', import.meta.url), 'utf8')
        const start = source.indexOf('async function runServerPreview(')
        const end = source.indexOf('\n// S2-C:', start)
        expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start)
        let database: any
        const bg = {
            dbmod: { setDatabase: (value: any) => { database = value }, getDatabase: () => database },
            stores: { selectedCharID: { set: () => {} } },
            idx: {
                chatProcessStage: { set: () => {}, subscribe: () => () => {} },
                sendChatWithDirectLifecycle: async () => {
                    const chat = database.characters[0].chats[0]
                    chat.message[0].data = 'script changed history'
                    chat.message.push(message('answer', 'response'))
                    chat.message.push(malformed ? null : { role: 'user', data: 'script-added note' })
                },
            },
        }
        const run = new Function('loadBundle', 'nodeCrypto', 'require', 'orchestrationAbortContext',
            'withExternalHeaderConversation', 'diffGlobalVariables', `
            let _previewLock = Promise.resolve(); const _orchStage = {}, _orchStatus = {};
            const stageKey = (a, b) => a + ':' + b;
            ${source.slice(start, end)}
            return runServerPreview;
        `)(async () => bg, crypto, createRequire(import.meta.url), new AsyncLocalStorage(),
            (_key: string, task: () => unknown) => task(), () => ({ changed: {}, deleted: [], expected: {} }))
        const initial: any = base()
        delete initial.message[0].chatId
        const snapshot = structuredClone(initial)
        const output = await run({
            DB_HEX_KEY: 'db', getDbCache: () => ({ db: {
                characters: [{ chaId: 'char', chats: [{ id: 'chat', name: 'metadata name', _stub: true }] }],
                globalChatVariables: {}, statics: { messages: 0 },
            } }),
        }, 'char', 'chat', initial, 'full', { serverChatCommitVersion: 1, inputCommandVersion: 0 })
        expect(output.executionAnchor.chat).toEqual({ ...snapshot, message: [
            { ...snapshot.message[0], chatId: expect.any(String) }, snapshot.message[1],
        ] })
        expect(output.executionAnchor.legacy[0].original).toEqual(snapshot.message[0])
        expect(output.executionAnchor.inputId).toBe('input')
        expect(output.executionAnchor.metadata).toEqual({ name: 'metadata name' })
        expect(output.chat.message[0].data).toBe('script changed history')
        expect(output.chat.message.at(-2).chatId).toBe('answer')
        expect(output.chat.message[0].chatId).toBe(output.executionAnchor.chat.message[0].chatId)
        if (malformed) {
            expect(output.chat.message.at(-1)).toBeNull()
            expect(output.threw).toContain('identity')
        } else {
            expect(output.chat.message.at(-1)).toMatchObject({ role: 'user', data: 'script-added note', chatId: expect.any(String) })
            expect(output.threw).toBeNull()
            expect(new Set(output.chat.message.map((entry: any) => entry.chatId)).size).toBe(4)
        }
    })

    it('keeps a prior edit, applies independent script variables and inserts the answer', () => {
        const before = base(), anchor = captureChatAnchor(before), generated = result(before)
        generated.scriptstate.b = 'server'
        const current = structuredClone(before)
        current.message[0].data = 'user edit'
        current.name = 'renamed'
        current.scriptstate.a = 'user'
        const output = resolveChatAnchor(anchor, generated, current)
        expect(output.status).toBe('resolved')
        expect(output.unreflected).toBe(false)
        expect(output.chat).toEqual({ ...current, scriptstate: { a: 'user', b: 'server' },
            message: [...current.message, message('answer', 'response')] })
        expect(current.message).toHaveLength(2)
    })

    it('preserves overlapping user edits and reports skipped server effects', () => {
        const before = base(), generated = result(before), current = structuredClone(before)
        generated.message[0].data = 'script edit'
        generated.scriptstate.a = 'script'
        current.message[0].data = 'user edit'
        current.scriptstate.a = 'user'
        const output = resolveChatAnchor(captureChatAnchor(before), generated, current)
        expect(output.unreflected).toBe(true)
        expect(output.chat.message[0].data).toBe('user edit')
        expect(output.chat.scriptstate.a).toBe('user')
        expect(output.chat.message.at(-1).chatId).toBe('answer')
    })

    it('does not resurrect deleted earlier messages and preserves inserted user history', () => {
        const before = base(), generated = result(before)
        generated.message[0].data = 'script edit'
        const current = { ...before, message: [message('inserted', 'new earlier message'), before.message[1]] }
        const output = resolveChatAnchor(captureChatAnchor(before), generated, current)
        expect(output.chat.message.map((m: any) => m.chatId)).toEqual(['inserted', 'input', 'answer'])
        expect(output.unreflected).toBe(true)
    })

    it.each(['chat_deleted', 'input_deleted', 'unknown_suffix'])('rejects %s without modifying current data', reason => {
        const before = base(), anchor = captureChatAnchor(before)
        const current = reason === 'chat_deleted' ? null : structuredClone(before)
        if (reason === 'input_deleted') current.message.pop()
        if (reason === 'unknown_suffix') current.message.push(message('other', 'unrelated'))
        const saved = structuredClone(current)
        expect(resolveChatAnchor(anchor, result(before), current)).toEqual({ status: 'conflict', reason })
        expect(current).toEqual(saved)
    })

    it('admits earlier changes without whole-chat fingerprint equality', () => {
        const before = base(), current = structuredClone(before)
        current.name = 'edited'; current.message[0].data = 'changed'
        expect(checkChatAnchor(captureChatAnchor(before), current)).toBeNull()
    })

    it('inserts a generated suffix before known trailing messages', () => {
        const before = base()
        before.message.push(message('known', 'known trailer'))
        const generated = result(before)
        const output = resolveChatAnchor(captureChatAnchor(before), generated, before)
        expect(output.chat.message.map((m: any) => m.chatId)).toEqual(['old', 'input', 'answer', 'known'])
    })

    it('preserves server history additions and memory when the user edits another field', () => {
        const before = base(), generated = result(before)
        generated.message.splice(1, 0, message('script-added', 'script history'))
        ;(generated as any).hypaV3Data = { memory: 'new' }
        const current = { ...structuredClone(before), name: 'renamed' }
        const output = resolveChatAnchor(captureChatAnchor(before), generated, current)
        expect(output.chat.message.map((m: any) => m.chatId)).toEqual(['old', 'script-added', 'input', 'answer'])
        expect(output.chat.hypaV3Data).toEqual({ memory: 'new' })
        expect(output.chat.name).toBe('renamed')
    })
})
