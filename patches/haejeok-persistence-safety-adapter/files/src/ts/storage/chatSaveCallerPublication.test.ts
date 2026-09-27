import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { publishChatView, rebaseChatSave, rebaseChatInput, snapshotChatView, mergeDerivedChat, trackDerivedChat, acknowledgeDerivedFields, ChatViewConflictError } from './chatSaveRebase'
import { startGeneration, endGeneration, endGenerationIfOwned, isChatGenerating, generationStates, chatGenKey } from '../process/generationState'
import { get, writable } from 'svelte/store'

// Execute the generated caller bodies, with UI effects replaced by observers.
// Only TypeScript annotations are removed; production control flow is retained.
const chatSource = readFileSync('src/lib/ChatScreens/Chat.svelte', 'utf8')
const rmBody = chatSource.split('    async function rm(){')[1].split('\n    async function edit(){')[0].trim().replace(/}\s*$/, '').replace('const actions: AlertAction[]', 'const actions')
const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor
const remove = new AsyncFunction('DBState', 'selIdState', 'idx', 'alertConfirmMulti', 'language', 'notifySuccess', 'notifyInfo', rmBody)
const language = { removeMessageOnly: 'remove', removeMessageAndAfter: '{}', removeChat: 'confirm', messagesRemoved: '{}', messageRemoved: 'removed' }
const message = (chatId: string, data = chatId) => ({ chatId, data, role: 'user' })

describe('delete confirmation across publication', () => {
    it.each([false, true])('removes the selected message after insertion, cascade=%s', async cascade => {
        const target = message('next'), chat = { message: [message('q'), target] }
        const DBState = { db: { characters: [{ chatPage: 0, chats: [chat] }] } }
        let confirm!: (value: number) => void
        const pending = remove(DBState, { selId: 0 }, 1, () => new Promise(resolve => { confirm = resolve }), language, vi.fn(), vi.fn())
        publishChatView(chat.message, [message('q'), message('a'), message('next')])
        confirm(cascade ? 1 : 0)
        await pending
        expect(chat.message.map(item => item.chatId)).toEqual(['q', 'a'])
    })
    it.each(['new suffix', 'target edited', 'selection changed'])('keeps content when confirmation became stale: %s', async condition => {
        const chat = { message: [message('q'), message('next')] }
        const other = { message: [message('other')] }
        const character = { chatPage: 0, chats: [chat, other] }
        let confirm!: (value: number) => void
        const pending = remove({ db: { characters: [character] } }, { selId: 0 }, 1, () => new Promise(resolve => { confirm = resolve }), language, vi.fn(), vi.fn())
        if (condition === 'new suffix') chat.message.push(message('new'))
        if (condition === 'target edited') chat.message[1].data = 'changed'
        if (condition === 'selection changed') character.chatPage = 1
        const before = snapshotChatView(character)
        confirm(1)
        await pending
        expect(character).toEqual(before)
    })
})

const inputSource = readFileSync('src/lib/ChatScreens/DefaultChatScreen.svelte', 'utf8')
const inputMarker = 'POCKETRISU-PATCH:haejeok-persistence-safety-adapter:chat-publication-input-merge'
const inputBody = inputSource.split(`/* ${inputMarker}:START */`)[1].split(`/* ${inputMarker}:END */`)[0].replace(' as const', '')
const applyInput = new Function('DBState', 'inputBase', 'cha', 'notifyError', 'removeChatDraft', 'snapshotChatView', 'rebaseChatInput', 'publishChatView', 'lateDraft', 'inputTriggerChat', 'activeChat', `
    const selectedChar = 0, activeChaId = 'char', draftChaId = 'char', draftChatId = 'chat';
    let messageInput = 'pending input', messageInputTranslate = 'translated';
    activeChat ||= DBState.db.characters[0].chats[0];
    const preparedInput = messageInput, preparedTranslation = messageInputTranslate, preparedDraftId = 'draft', draftInputId = 'draft';
    if (lateDraft) messageInput = lateDraft;
    const apply = () => { ${inputBody} };
    apply(); return { messageInput, messageInputTranslate };
`)

describe('input preparation across publication', () => {
    it.each(['unassigned', 'assigned during preparation', 'replaced slot'])('keeps persistent identity repair with its existing owner: %s', state => {
        const original: any = { message: [message('q')] }, inputBase = snapshotChatView(original)
        const chat = state === 'replaced slot' ? { message: [message('different')] } : original
        if (state === 'assigned during preparation') chat.id = 'new-persistent-id'
        const notify = vi.fn(), clear = vi.fn()
        applyInput({ db: { characters: [{ chaId: 'char', chatPage: 0, chats: [chat] }] } }, inputBase, [...inputBase.message, message('next')], notify, clear, snapshotChatView, rebaseChatInput, publishChatView, undefined, undefined, original)
        expect(chat.message.at(-1)?.chatId).toBe(state === 'replaced slot' ? 'different' : 'next')
        expect(notify).toHaveBeenCalledTimes(state === 'replaced slot' ? 1 : 0)
        if (state === 'unassigned') expect(chat.id).toBeUndefined()
        if (state === 'assigned during preparation') expect(chat.id).toBe('new-persistent-id')
    })
    it.each([Object.freeze({ value: 1 }), new Uint8Array([1, 2])])('preserves an unchanged extension field while applying input', extra => {
        const chat = { id: 'chat', message: [message('q')], extra }
        const inputBase = { id: chat.id, message: snapshotChatView(chat.message) }
        applyInput({ db: { characters: [{ chaId: 'char', chatPage: 0, chats: [chat] }] } }, inputBase, [...inputBase.message, message('next')], vi.fn(), vi.fn(), snapshotChatView, rebaseChatInput, publishChatView)
        expect(chat.extra).toBe(extra)
        expect(chat.message.map(item => item.chatId)).toEqual(['q', 'next'])
    })
    it('keeps text typed while the trigger was waiting', () => {
        const chat = { id: 'chat', message: [message('q')] }, inputBase = snapshotChatView(chat)
        const clear = vi.fn()
        const result = applyInput({ db: { characters: [{ chaId: 'char', chatPage: 0, chats: [chat] }] } }, inputBase, [...inputBase.message, message('next')], vi.fn(), clear, snapshotChatView, rebaseChatInput, publishChatView, 'new draft')
        expect(result.messageInput).toBe('new draft')
        expect(clear).not.toHaveBeenCalled()
        expect(chat.message.map(item => item.chatId)).toEqual(['q', 'next'])
    })
    it.each([false, true])('preserves live message identity and remote additions, overlap=%s', overlap => {
        const chat = { id: 'chat', message: [message('q')] }, first = chat.message[0]
        const inputBase = snapshotChatView(chat), draft = snapshotChatView(chat.message)
        draft.push(message('next'))
        chat.message.push(message('a'))
        if (overlap) { draft[0].data = 'trigger edit'; chat.message[0].data = 'user edit' }
        const notify = vi.fn(), clear = vi.fn()
        const result = applyInput({ db: { characters: [{ chaId: 'char', chatPage: 0, chats: [chat] }] } }, inputBase, draft, notify, clear, snapshotChatView, rebaseChatInput, publishChatView)
        expect(chat.message[0]).toBe(first)
        expect(chat.message.map(item => item.chatId)).toEqual(overlap ? ['q', 'a'] : ['q', 'a', 'next'])
        expect(result.messageInput).toBe(overlap ? 'pending input' : '')
        expect(clear).toHaveBeenCalledTimes(overlap ? 0 : 1)
        expect(notify).toHaveBeenCalledTimes(overlap ? 1 : 0)
    })
})

const sendSource = readFileSync('src/ts/process/index.svelte.ts', 'utf8')
const sendCatch = sendSource.split('POCKETRISU-PATCH:haejeok-persistence-safety-adapter:chat-publication-send-conflict-end:START */')[1]
    .split('} catch (error) {')[1].split('\n    }\n}')[0]
const handleSendConflict = new AsyncFunction('failure', 'ChatViewConflictError', 'endGenerationIfOwned', 'clearPendingSend', 'chatProcessStage', 'alertError', `
    const genKey = 'chat', generationId = 'owner', realChatId = 'chat';
    try { throw failure } catch (error) { ${sendCatch} }
`)

it.each([false, true])('the send body releases only its own generation, replacement=%s', async replacement => {
    startGeneration('chat', replacement ? 'replacement' : 'owner')
    const pending = new Set(['chat']), clear = vi.fn((id: string) => pending.delete(id)), alert = vi.fn()
    const failure = new ChatViewConflictError()
    failure.notified = true
    try {
        expect(await handleSendConflict(failure, ChatViewConflictError, endGenerationIfOwned, clear, { set: vi.fn() }, alert)).toBe(false)
        expect(isChatGenerating('chat')).toBe(replacement)
        expect(pending.has('chat')).toBe(replacement)
        expect(alert).not.toHaveBeenCalled()
    } finally { endGeneration('chat') }
})

const manualBody = chatSource.split('    async function runButtonTriggerWithin(origin: Element) {')[1].split('\n    async function handleButtonTriggerWithin')[0].trim().replace(/}\s*$/, '')
const runManualButton = new AsyncFunction('failure', 'ChatViewConflictError', 'notifyInfo', 'readManualStore', 'CurrentTriggerIdStore', `
    const origin = {getAttribute: () => 'trigger'}, getCurrentCharacter = () => ({}), getCurrentChat = () => ({});
    const runTrigger = async () => { throw failure }, runLuaButtonTrigger = runTrigger;
    ${manualBody}
`)
const commandSource = readFileSync('src/ts/process/command.ts', 'utf8')
const manualCommandBody = commandSource.split("        case 'trigger':{")[1].split("        case '?':{")[0]
    .replace(/\/\* POCKETRISU-PATCH:[^\n]*\*\//g, '').trim().replace(/}\s*$/, '')
const runManualCommand = new AsyncFunction('failure', 'ChatViewConflictError', 'notifyChatViewConflict', `
    const getCurrentCharacter = () => ({}), getCurrentChat = () => ({}), arg = 'trigger';
    const runTrigger = async () => { throw failure };
    ${manualCommandBody}
`)
it.each([runManualButton, runManualCommand])('handles a manual trigger conflict without an unhandled rejection or duplicate notice', async run => {
    const error = new ChatViewConflictError(), notify = vi.fn()
    await expect(run(error, ChatViewConflictError, notify, get, writable('trigger'))).resolves.toBeUndefined()
    expect(notify).toHaveBeenCalledTimes(1)
    await run(error, ChatViewConflictError, notify, get, writable('trigger'))
    expect(notify).toHaveBeenCalledTimes(1)
})

const previewSource = readFileSync('src/lib/SideBars/DevTool.svelte', 'utf8')
const previewPrefix = previewSource.split('    const preview = async () => {')[1].split("        let md = ''")[0]
const runPreviewPrefix = new AsyncFunction('scope', `with (scope) { ${previewPrefix} return 'continue' }`)
it.each(['failure', 'error alert', 'success', 'replacement owner', 'blocked owner'])('preserves preview alerts and generation ownership: %s', async outcome => {
    const previewAlertStore = writable({ type: 'wait' })
    const errorAlert = { type: 'error' }, clear = vi.fn(() => previewAlertStore.set({ type: 'none' }))
    if (outcome === 'blocked owner') startGeneration('preview-chat', 'existing', 'background')
    const scope = {
        $doingChat: false, previewJoin: 'prompt', alertWait: vi.fn(), alertClear: clear,
        DBState: { db: { characters: [{ chatPage: 0, chats: [{ id: 'preview-chat' }] }] } }, $selectedCharID: 0,
        chatGenKey, endGenerationIfOwned, generationStates, previewAlertStore, readChatStore: get,
        sendChat: async () => {
            if (outcome === 'blocked owner') return false
            startGeneration('preview-chat', 'preview')
            if (outcome === 'error alert') previewAlertStore.set(errorAlert)
            if (outcome === 'replacement owner') { await Promise.resolve(); startGeneration('preview-chat', 'replacement') }
            return outcome === 'success'
        },
    }
    try {
        expect(await runPreviewPrefix(scope)).toBe(outcome === 'success' ? 'continue' : false)
        expect(clear).toHaveBeenCalledTimes(['failure', 'replacement owner', 'blocked owner'].includes(outcome) ? 1 : 0)
        if (outcome === 'error alert') expect(get(previewAlertStore)).toBe(errorAlert)
        const expectedOwner = outcome === 'success' ? 'preview' : outcome === 'replacement owner' ? 'replacement' : outcome === 'blocked owner' ? 'existing' : undefined
        expect(get(generationStates).get('preview-chat')?.generationId).toBe(expectedOwner)
    } finally { endGeneration('preview-chat') }
})

const earlyInputMarker = 'POCKETRISU-PATCH:haejeok-persistence-safety-adapter:chat-publication-input-trigger-error'
const earlyInputBody = inputSource.split(`/* ${earlyInputMarker}:START */`)[1].split(`/* ${earlyInputMarker}:END */`)[0]
const runEarlyInput = new AsyncFunction('scope', `with (scope) { ${earlyInputBody} return 'continue' }`)
it.each([false, true])('notifies an early input trigger conflict and restores only its display context, replaced=%s', async replaced => {
    const CurrentTriggerIdStore = writable<string | null>('previous')
    const error = new ChatViewConflictError(), notify = vi.fn()
    const scope = {
        char: {}, activeChat: {}, ChatViewConflictError, notifyError: notify,
        CurrentTriggerIdStore, readChatStore: get,
        runTrigger: async () => { CurrentTriggerIdStore.set(replaced ? 'another-trigger' : null); throw error },
    }
    expect(await runEarlyInput(scope)).toBeUndefined()
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify.mock.calls[0][1].description).toContain('Changes already made by triggers remain')
    expect(get(CurrentTriggerIdStore)).toBe(replaced ? 'another-trigger' : 'previous')
})

it('clears the actual generation and pending-send owners when a trigger conflict rejects a send', async () => {
    const body = inputSource.split('    async function sendChatMain(')[1].split('\n    // Auto-resume')[0]
    const code = body.slice(body.indexOf('{') + 1).trim().replace(/}\s*$/, '').replaceAll(' as any', '')
    const execute = new AsyncFunction('currentChatGenKey', '$generationStates', 'registerAbort', 'sendChat', 'endGeneration', 'clearPendingSend', 'alertError', 'DBState', 'playNotificationSound', '$orchestrating', 'console', `
        let messageInput = '', $doingChat = false;
        const continued = false, noBgOrch = false;
        ${code}
    `)
    const owners = new Map(), pending = new Set<string>(), end = vi.fn((id: string) => owners.delete(id)), clear = vi.fn((id: string) => pending.delete(id))
    const error = new Error('Chat changed while the trigger was running; its result was not applied')
    const send = async () => { owners.set('chat', {}); pending.add('chat'); throw error }
    const alert = vi.fn()
    expect(await execute(() => 'chat', owners, vi.fn(), send, end, clear, alert, { db: { playMessage: false } }, vi.fn(), false, { error: vi.fn() })).toBe(false)
    expect(owners.size).toBe(0)
    expect(pending.size).toBe(0)
    expect(end).toHaveBeenCalledExactlyOnceWith('chat')
    expect(clear).toHaveBeenCalledExactlyOnceWith('chat')
    expect(alert).toHaveBeenCalledExactlyOnceWith(error)
})

const globalSource = readFileSync('src/ts/globalApi.svelte.ts', 'utf8')
const payloadBody = globalSource.split('    requestDurableChatPayloadSaveImpl = async (chaId, chatId, chat) => {')[1].split('\n    }\n')[0]
const persistPayload = new AsyncFunction('chaId', 'chatId', 'chat', 'getDatabase', 'safeStructuredClone', 'mergeDerivedChat', 'acknowledgeDerivedFields', 'requestDurableSaveImpl', payloadBody)

it.each(['edit', 'append'])('accepts a later input-script change after an intermediate script save: %s', async kind => {
    const live = { id: 'chat', message: [message('q')] }, inputBase = snapshotChatView(live), draft = snapshotChatView(live)
    trackDerivedChat(draft, live)
    if (kind === 'edit') draft.message[0].data = 'v1'
    else draft.message.push({ role: 'char', data: 'v1' })
    const database = { characters: [{ chaId: 'char', chatPage: 0, chats: [live] }] }, save = vi.fn(async () => {})
    await persistPayload('char', 'chat', draft, () => database, snapshotChatView, mergeDerivedChat, acknowledgeDerivedFields, save)
    draft.message.at(-1).data = 'v2'
    draft.message.push(message('next'))
    if (kind === 'edit') live.message.push(message('a'))
    expect(rebaseChatSave(inputBase, { id: 'chat', message: draft.message }, snapshotChatView(live)).ok).toBe(false)
    const notify = vi.fn(), clear = vi.fn()
    const result = applyInput({ db: database }, inputBase, draft.message, notify, clear, snapshotChatView, rebaseChatInput, publishChatView, undefined, draft)
    expect(notify).not.toHaveBeenCalled()
    expect(result.messageInput).toBe('')
    expect(live.message.some(item => item.data === 'v2')).toBe(true)
    expect(live.message.at(-1)?.chatId).toBe('next')
    if (kind === 'edit') expect(live.message.map(item => item.chatId)).toEqual(['q', 'a', 'next'])
    expect(save).toHaveBeenCalledTimes(1)
})

it('applies the actual script payload boundary and advances only its acknowledged messages', async () => {
    const live = { id: 'chat', message: [message('q')], note: 'before' }
    const draft = snapshotChatView(live)
    trackDerivedChat(draft, live)
    draft.note = 'pending note'
    draft.message.push(message('script'))
    live.message[0].data = 'first edit'
    live.message.push(message('a'))
    const save = vi.fn(async () => {})
    await persistPayload('char', 'chat', draft, () => ({ characters: [{ chaId: 'char', chats: [live] }] }), snapshotChatView, mergeDerivedChat, acknowledgeDerivedFields, save)
    expect(live.message.map(item => item.chatId)).toEqual(['q', 'a', 'script'])
    expect(live.note).toBe('before')
    live.message[0].data = 'second edit'
    expect(mergeDerivedChat(draft, live)).toMatchObject({ note: 'pending note', message: [{ data: 'second edit' }, { chatId: 'a' }, { chatId: 'script' }] })
    expect(save).toHaveBeenCalledWith({ chat: ['char', 'chat'] })
})
