import { describe, expect, it } from 'vitest'
import contextPackage from './serverChatAssemblyContext.cjs'
const { captureAssemblyContext, describePromptInputChanges, promptInputChanges, promptInputsChanged } = contextPackage as any
import commitPackage from './serverChatCommit.cjs'
const { stableJSON } = commitPackage as any

describe('assembly snapshot and conservative chat input scope', () => {
    const base = () => ({ id: 'chat', note: '', localLore: [], message: [
        { chatId: 'old', role: 'user', data: 'history', disabled: true },
        { chatId: 'input', role: 'user', data: 'question' },
    ] })
    it('keeps current credentials only in the owned graph with a content-independent identity', () => {
        const db = { apiKey: 'synthetic-secret', characters: [{ chaId: 'char', chats: [{ id: 'chat', name: 'latest', _stub: true }] }] }
        const first = captureAssemblyContext(db, base(), 'char', 'chat')
        const second = captureAssemblyContext(db, base(), 'char', 'chat')
        expect(first.database.apiKey).toBe('synthetic-secret')
        expect(first.contextDigest).toMatch(/^[a-f0-9]{64}$/)
        expect(first.contextDigest).not.toBe(second.contextDigest)
        first.database.apiKey = 'execution-only'
        expect(db.apiKey).toBe('synthetic-secret')
    })
    it.each(['history', 'input', 'insert', 'delete', 'note', 'lore', 'variables'])('detects a changed %s dependency', change => {
        const before = base(), latest: any = structuredClone(before)
        if (change === 'history') latest.message[0].data = 'changed even when disabled or trimmed'
        if (change === 'input') latest.message[1].data = 'changed input'
        if (change === 'insert') latest.message.unshift({ role: 'char', data: 'new history' })
        if (change === 'delete') latest.message.shift()
        if (change === 'note') latest.note = 'new note'
        if (change === 'lore') latest.localLore.push({ content: 'new lore' })
        if (change === 'variables') latest.scriptstate = { counter: 1 }
        expect(promptInputsChanged(before, latest)).toBe(true)
    })
    it('ignores display metadata, IDs and key insertion order', () => {
        const before = base(), latest: any = structuredClone(before)
        latest.name = 'renamed'; latest.folderId = 'folder'; latest.isStreaming = true
        latest.message[0] = { data: 'history', role: 'user', disabled: true,
            chatId: 'backfilled', time: 123, generationInfo: { outputTokens: 10 } }
        expect(promptInputsChanged(before, latest)).toBe(false)
    })
})

// Reference copy of the boolean check as it was before the diagnostic existed.
function referencePromptInputsChanged(before: any, current: any) {
    const own = (value: any, key: string) => Object.prototype.hasOwnProperty.call(value, key)
    const fields = ['note', 'localLore', 'scriptstate', 'modules', 'bindedPersona',
        'bindedBotPreset', 'fmIndex', 'firstMessageDisabled', 'hypaV3Data', 'supaMemory',
        'savedToggleValues', 'useModelPreset', 'modelBinding', 'usePromptPresetParams']
    const messageFields = ['role', 'data', 'saying', 'name', 'otherUser', 'disabled', 'isComment']
    const select = (chat: any) => ({
        ...Object.fromEntries(fields.filter(key => own(chat, key)).map(key => [key, chat[key]])),
        message: chat.message.map((message: any) => Object.fromEntries(
            messageFields.filter(key => own(message, key)).map(key => [key, message[key]]),
        )),
    })
    if (!before || !current || !Array.isArray(before.message) || !Array.isArray(current.message)) return true
    return stableJSON(select(before)) !== stableJSON(select(current))
}

describe('prompt input change descriptors', () => {
    const base = (): any => ({ id: 'chat', note: 'n', localLore: [], message: [
        { role: 'user', data: 'history' }, { role: 'user', data: 'question' },
    ] })
    const sentinel = 'SENTINEL-VALUE-7f3a'
    it('returns no descriptors for equal inputs and ignores presentation fields', () => {
        const latest = base(); latest.name = 'renamed'; latest.message[0].time = 5
        expect(promptInputChanges(base(), latest)).toEqual([])
    })
    it('describes added, removed and changed chat fields', () => {
        const before = base(), latest = base()
        before.scriptstate = { a: 1 }
        latest.note = sentinel
        latest.localLore = [{ content: sentinel }]
        latest.bindedPersona = sentinel
        delete latest.scriptstate
        before.modules = ['a']; latest.modules = ['b']
        expect(promptInputChanges(before, latest)).toEqual([
            { field: 'note', kind: 'changed' }, { field: 'localLore', kind: 'changed' },
            { field: 'scriptstate', kind: 'removed' }, { field: 'modules', kind: 'changed' },
            { field: 'bindedPersona', kind: 'added' },
        ])
    })
    it('treats an own undefined field like an absent one, as the boolean check does', () => {
        const latest: any = base(); latest.fmIndex = undefined
        expect(promptInputChanges(base(), latest)).toEqual([])
    })
    it('describes message field changes by index and name', () => {
        const latest: any = base()
        latest.message[1].data = sentinel; latest.message[0].disabled = true; delete latest.message[0].role
        expect(promptInputChanges(base(), latest)).toEqual([
            { field: 'message[0].role', kind: 'removed' }, { field: 'message[0].disabled', kind: 'added' },
            { field: 'message[1].data', kind: 'changed' },
        ])
    })
    it('describes a message count change and still compares shared indexes', () => {
        const latest: any = base(); latest.message.push({ role: 'char', data: sentinel }); latest.message[0].data = 'x'
        expect(promptInputChanges(base(), latest)).toEqual([
            { field: 'message.count', from: 2, to: 3 }, { field: 'message[0].data', kind: 'changed' },
        ])
    })
    it.each([[null, base()], [base(), undefined], [{ id: 'x' }, base()], [base(), { message: 'no' }]])(
        'reports an unavailable side', (before: any, current: any) => {
            expect(promptInputChanges(before, current)).toEqual([{ field: 'chat', kind: 'unavailable' }])
            expect(promptInputsChanged(before, current)).toBe(true)
        })
    it('formats a log line without values and caps the descriptor list', () => {
        const latest: any = base()
        latest.note = sentinel; latest.name = sentinel; latest.message[1].data = sentinel
        latest.message.push({ role: 'char', data: sentinel, name: sentinel })
        const line = describePromptInputChanges('op-1', promptInputChanges(base(), latest))
        expect(line).toBe('[bg-assembly] prompt inputs changed op=op-1 changes=note:changed,message.count:2\u21923,message[1].data:changed')
        expect(line).not.toContain(sentinel)
        const many = Array.from({ length: 40 }, (_, i) => ({ field: `f${i}`, kind: 'changed' }))
        const capped = describePromptInputChanges('op-2', many)
        expect(capped.split('changes=')[1].split(',')).toHaveLength(33)
        expect(capped.endsWith(',+8 more')).toBe(true)
    })
    it('keeps the boolean identical to the previous implementation', () => {
        let seed = 12345
        const rand = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n }
        const fieldValues = [undefined, null, 0, 'a', 'b', { x: 1 }, { x: 2 }, [1], [2], true, false]
        const chatKeys = ['note', 'localLore', 'scriptstate', 'modules', 'bindedPersona', 'bindedBotPreset',
            'fmIndex', 'firstMessageDisabled', 'hypaV3Data', 'supaMemory', 'savedToggleValues', 'useModelPreset',
            'modelBinding', 'usePromptPresetParams', 'name', 'folderId', 'lastDate']
        const messageKeys = ['role', 'data', 'saying', 'name', 'otherUser', 'disabled', 'isComment', 'chatId', 'time']
        const makeObject = (keys: string[]) => Object.fromEntries(
            keys.filter(() => rand(3) === 0).map(key => [key, fieldValues[rand(fieldValues.length)]]))
        const makeChat = (): any => ({ ...makeObject(chatKeys),
            message: Array.from({ length: rand(4) }, () => makeObject(messageKeys)) })
        const mutate = (chat: any): any => {
            const copy = structuredClone(chat)
            for (let n = rand(3); n > 0; n -= 1) {
                const pick = rand(3)
                if (pick === 0) Object.assign(copy, makeObject(chatKeys))
                else if (pick === 1 && copy.message.length) Object.assign(copy.message[rand(copy.message.length)], makeObject(messageKeys))
                else if (rand(2)) copy.message.push(makeObject(messageKeys)); else copy.message.pop()
            }
            return copy
        }
        const cases: [any, any][] = [[null, base()], [base(), null], [{ message: 1 }, base()], [base(), base()]]
        for (let i = 0; i < 3000; i += 1) {
            const before = makeChat()
            cases.push([before, mutate(before)], [before, makeChat()])
        }
        let changed = 0
        for (const [before, current] of cases) {
            const expected = referencePromptInputsChanged(before, current)
            expect(promptInputsChanged(before, current)).toBe(expected)
            expect(promptInputChanges(before, current).length > 0).toBe(expected)
            if (expected) changed += 1
        }
        expect(changed).toBeGreaterThan(1000)
        expect(changed).toBeLessThan(cases.length)
    })
})
