import { describe, expect, it, vi } from 'vitest'
import { assertServerInputCanContinue, rejectUnsupportedServerInput } from '../../src/ts/bgServerInputExecution'

const { transformServerChatInput } = require('./serverChatInputTransform.cjs')

const command = {
    rawText: 'raw input', userMessageId: 'user-input-1', submittedAt: 1_700_000_000_000,
}

describe('server chat input transform parity', () => {
    it('keeps the stop attached to an async descendant after the transformer returns', async () => {
        const chat = { id: 'chat-1', message: [] }
        let release!: () => void
        const gate = new Promise<void>(resolve => { release = resolve })
        let late!: Promise<unknown>
        await expect(transformServerChatInput({ type: 'character' }, chat, command, {
            runTrigger: async () => {
                late = gate.then(() => assertServerInputCanContinue()).then(() => 'continued', error => error.code)
                try { rejectUnsupportedServerInput('interactive_ui') } catch {}
                return { chat }
            },
        }, { processScript: vi.fn() }, vi.fn())).rejects.toMatchObject({ code: 'BG_INPUT_HOST_UNSUPPORTED' })
        expect(() => assertServerInputCanContinue()).not.toThrow()
        release()
        expect(await late).toBe('BG_INPUT_HOST_UNSUPPORTED')
    })

    it('retains a swallowed unsupported-host failure and never appends partial input', async () => {
        const chat = { id: 'chat-1', message: [] }
        const scripts = { processScript: vi.fn() }
        const publish = vi.fn()
        const globals = globalThis as any
        const previous = globals.__bgGetServerInputExecution
        try {
            await expect(transformServerChatInput({ type: 'character' }, chat, command, {
                runTrigger: async () => {
                    try { rejectUnsupportedServerInput('interactive_ui') } catch { /* Lua pcall */ }
                    return { chat }
                },
            }, scripts, publish)).rejects.toMatchObject({
                code: 'BG_INPUT_HOST_UNSUPPORTED', api: 'interactive_ui',
            })
            expect(scripts.processScript).not.toHaveBeenCalled()
            expect(publish).not.toHaveBeenCalled()
            expect(chat.message).toEqual([])
            expect(globals.__bgGetServerInputExecution()).toBeUndefined()
        } finally { expect(globals.__bgGetServerInputExecution).toBe(previous) }
    })

    it('runs the character input trigger and editinput exactly once', async () => {
        const chat = { id: 'chat-1', message: [] as any[] }
        const triggers = {
            runTrigger: vi.fn(async () => ({ chat })),
        }
        const scripts = {
            processScript: vi.fn(async () => {
                expect(published).toBe(chat)
                return 'edited input'
            }),
        }
        const character = { type: 'character' }
        let published: unknown = null
        const transformed = await transformServerChatInput(
            character, chat, command, triggers, scripts, (value: unknown) => { published = value },
        )
        expect(triggers.runTrigger).toHaveBeenCalledExactlyOnceWith(
            character, 'input', { chat },
        )
        expect(scripts.processScript).toHaveBeenCalledExactlyOnceWith(
            character, 'raw input', 'editinput',
        )
        expect(transformed.message).toEqual([{
            role: 'user', data: 'edited input', time: command.submittedAt,
            name: null, chatId: 'user-input-1',
        }])
    })

    it('keeps group input raw without character-only trigger or editinput', async () => {
        const chat = { id: 'chat-1', message: [] as any[] }
        const triggers = { runTrigger: vi.fn() }
        const scripts = { processScript: vi.fn() }
        const transformed = await transformServerChatInput(
            { type: 'group' }, chat, command, triggers, scripts, () => {},
        )
        expect(triggers.runTrigger).not.toHaveBeenCalled()
        expect(scripts.processScript).not.toHaveBeenCalled()
        expect(transformed.message[0].data).toBe('raw input')
    })

    it('rejects a duplicate input identity before appending', async () => {
        const chat = {
            id: 'chat-1', message: [{ role: 'user', data: 'old', chatId: 'user-input-1' }],
        }
        await expect(transformServerChatInput(
            { type: 'group' }, chat, command, null, null, () => {},
        )).rejects.toThrow('identity already exists')
        expect(chat.message).toHaveLength(1)
    })
})
