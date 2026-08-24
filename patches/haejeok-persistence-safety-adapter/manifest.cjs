'use strict'

const fs = require('node:fs')
const path = require('node:path')

const filesRoot = path.join(__dirname, 'files')
const owned = (relative) => fs.readFileSync(path.join(filesRoot, relative), 'utf8')
const pocketRisu1100 = { pocketrisu: ['1.10.0'] }
const globalApiOwners = [
    'lazy-chat-sync:replace:src:ts:globalApi-svelte-ts:1.10',
    'bg-preserve:hook:globalapi-durable-save-api',
    'bg-preserve:hook:globalapi-durable-save-outcome',
    'bg-preserve:hook:globalapi-durable-save-rethrow',
    'bg-preserve:hook:globalapi-durable-save-impl',
    'bg-preserve:hook:globalapi-fetch-impl-register:1.9',
    'bg-preserve:hook:globalapi-fetchnative-bgsubkey-arg',
    'bg-preserve:hook:globalapi-gemini-main-branch',
    'lazy-chat-bg-adapter:durable-flush',
    'lazy-chat-bg-adapter:global-import',
    'persona-organizer:uncleanable-gallery-assets',
    'persona-organizer:uncleanable-folder-assets',
    'persona-organizer:replace-gallery-assets',
    'client-build-fence:global-import:1.9',
    'client-build-fence:global-dirty-probe:1.9',
    'client-build-fence:global-flush:1.9',
    'client-build-fence:global-proxy-stream-cancel:1.9',
    'client-build-fence:global-proxy-stream-abort:1.9',
]
const defaultChatOwners = [
    'bg-preserve:hook:defaultchatscreen-import-orchestrating',
    'bg-preserve:hook:defaultchatscreen-sendmain-orchestrating-gate',
    'bg-preserve:hook:defaultchatscreen-reroll-orchestrating-gate',
    'bg-preserve:hook:defaultchatscreen-unreroll-orchestrating-gate',
    'bg-preserve:hook:defaultchatscreen-suppress-abort-alert',
    'bg-preserve:hook:defaultchatscreen-terminal-completion-sound',
    'bg-preserve:hook:defaultchatscreen-cancel-server-orchestration',
    'bg-preserve:hook:defaultchatscreen-blank-message-a11y-button',
    'bg-preserve:hook:defaultchatscreen-sticker-a11y-button',
    'bg-preserve:hook:defaultchatscreen-composer-orchestrating-gate:1.9',
    'bg-preserve:hook:defaultchatscreen-reroll-blocking-call',
    'bg-preserve:hook:defaultchatscreen-sendchatmain-nobgorch-arg',
    'bg-preserve:hook:defaultchatscreen-forward-nobgorch',
    'client-build-fence:composer-import:1.9',
    'client-build-fence:composer-dirty-state:1.9',
    'lazy-chat-sync:chat-missing-payload-notice',
    'personal-settings:appearance-composer-hook-1.9',
    'personal-settings:appearance-chat-render-imports-1.9',
    'personal-settings:appearance-send-icon-render-1.9',
    'kei-chat-render-base-adapter:default-chat-generation-state:1.9',
    'kei-chat-render-bg-adapter:default-chat-generation-state:1.9',
    'kei-partial-edit-base-adapter:default-chat-import:1.9',
    'kei-partial-edit-base-adapter:default-chat-root-state:1.9',
    'kei-partial-edit-base-adapter:default-chat-root-binding:1.9',
    'kei-partial-edit-base-adapter:default-chat-manager:1.9',
    'kei-partial-edit-bg-adapter:default-chat-import:1.9',
    'kei-partial-edit-bg-adapter:default-chat-root-state:1.9',
    'kei-partial-edit-bg-adapter:default-chat-root-binding:1.9',
    'kei-partial-edit-bg-adapter:default-chat-manager:1.9',
]

module.exports = {
    id: 'haejeok-persistence-safety-adapter',
    title: 'Haejeok persistence safety adapter',
    version: '0.1.0',
    source: 'Haejeok RisuAI e9d03568 focused persistence ordering adaptation',
    targets: {
        pocketrisu: {
            // The adapter has no units on these historical targets, so their
            // previously qualified complete graphs remain byte-identical.
            verified: ['1.8.1', '1.9.0', '1.10.0'],
            reviewing: [],
        },
    },
    userSelectable: false,
    requires: ['bg-preserve', 'lazy-chat-sync'],
    autoWhen: {
        all: ['bg-preserve', 'lazy-chat-sync'],
    },
    units: [
        {
            id: 'haejeok-persistence-safety-adapter:helper',
            file: 'src/ts/haejeokPersistenceSafety.ts',
            type: 'owned',
            content: owned('src/ts/haejeokPersistenceSafety.ts'),
            targetVersions: pocketRisu1100,
        },
        {
            id: 'haejeok-persistence-safety-adapter:helper-tests',
            file: 'src/ts/haejeokPersistenceSafety.test.ts',
            type: 'owned',
            content: owned('src/ts/haejeokPersistenceSafety.test.ts'),
            requires: ['haejeok-persistence-safety-adapter:helper'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'haejeok-persistence-safety-adapter:durable-save-plugin-scope',
            file: 'src/ts/globalApi.svelte.ts',
            type: 'replace',
            anchor: `interface DurableSaveScope {
    chat?: [string, string]
    root?: boolean
}
`,
            content: `interface DurableSaveScope {
    chat?: [string, string]
    root?: boolean
    plugins?: boolean
}
`,
            requires: ['bg-preserve:hook:globalapi-durable-save-api'],
            after: globalApiOwners,
            targetVersions: pocketRisu1100,
        },
        {
            id: 'haejeok-persistence-safety-adapter:durable-chat-payload-api',
            file: 'src/ts/globalApi.svelte.ts',
            type: 'insert',
            where: 'after',
            anchor: `export function requestDurableSave(scope?: DurableSaveScope): Promise<void> {
    return requestDurableSaveImpl(scope)
}
/* BG-PRESERVE:END */
`,
            content: `
type DurableChatPayload = Parameters<typeof saveChatToServer>[3]
let requestDurableChatPayloadSaveImpl: ((
    chaId: string,
    chatId: string,
    chat: DurableChatPayload,
) => Promise<void>) = async () => {
    throw new Error('durable chat payload save is not initialized')
}
export function requestDurableChatPayloadSave(
    chaId: string,
    chatId: string,
    chat: DurableChatPayload,
): Promise<void> {
    return requestDurableChatPayloadSaveImpl(chaId, chatId, chat)
}
`,
            requires: [
                'haejeok-persistence-safety-adapter:durable-save-plugin-scope',
                'bg-preserve:hook:globalapi-durable-save-api',
            ],
            after: globalApiOwners,
            targetVersions: pocketRisu1100,
        },
        {
            id: 'haejeok-persistence-safety-adapter:durable-save-plugin-enlistment',
            file: 'src/ts/globalApi.svelte.ts',
            type: 'replace',
            anchor: `        if (scope?.root) changeTracker.root = true
        changed = true
`,
            content: `        if (scope?.root) changeTracker.root = true
        if (scope?.plugins) changeTracker.plugins = true
        changed = true
`,
            requires: [
                'haejeok-persistence-safety-adapter:durable-chat-payload-api',
                'bg-preserve:hook:globalapi-durable-save-impl',
            ],
            after: [
                ...globalApiOwners,
                'haejeok-persistence-safety-adapter:durable-chat-payload-api',
            ],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'haejeok-persistence-safety-adapter:durable-chat-payload-impl',
            file: 'src/ts/globalApi.svelte.ts',
            type: 'insert',
            where: 'before',
            anchor: `    requestImmediateSaveImpl = async (options) => {
`,
            content: `    requestDurableChatPayloadSaveImpl = async (chaId, chatId, chat) => {
        const database = getDatabase()
        const character = database.characters?.find((item) => item?.chaId === chaId)
        if (!character) throw new Error('durable chat payload character is unavailable')
        const chatIndex = character.chats?.findIndex((item) => item?.id === chatId) ?? -1
        if (chatIndex < 0) throw new Error('durable chat payload target is unavailable')
        if (!chat || chat.id !== chatId || !Array.isArray(chat.message)) {
            throw new Error('refusing to persist an invalid script-mutated chat payload')
        }
        const liveChat = character.chats[chatIndex]
        if (!liveChat || liveChat._placeholder) {
            throw new Error('refusing to replace an unavailable live chat payload')
        }
        // Script APIs mutate messages only. Merge that exact field into the lazy-chat owner before
        // enlisting its existing strict transaction; a parallel direct writer could be overwritten
        // by an older autosave that was already in flight.
        liveChat.message = safeStructuredClone(chat.message)
        await requestDurableSaveImpl({ chat: [chaId, chatId] })
    }
`,
            requires: [
                'haejeok-persistence-safety-adapter:durable-chat-payload-api',
                'haejeok-persistence-safety-adapter:durable-save-plugin-enlistment',
                'bg-preserve:hook:globalapi-durable-save-impl',
                'lazy-chat-bg-adapter:durable-flush',
            ],
            after: [
                ...globalApiOwners,
                'haejeok-persistence-safety-adapter:durable-save-plugin-enlistment',
            ],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'haejeok-persistence-safety-adapter:chat-helper-import',
            file: 'src/lib/ChatScreens/DefaultChatScreen.svelte',
            type: 'insert',
            where: 'after',
            anchor: `    import { loadChatDraft, scheduleSaveChatDraft, flushChatDraft, removeChatDraft } from 'src/ts/storage/chatDraft';
`,
            content: `    import { persistActiveChatBeforeGeneration } from 'src/ts/haejeokPersistenceSafety';
`,
            requires: ['haejeok-persistence-safety-adapter:helper'],
            after: defaultChatOwners,
            targetVersions: pocketRisu1100,
        },
        {
            id: 'haejeok-persistence-safety-adapter:chat-durable-save-import',
            file: 'src/lib/ChatScreens/DefaultChatScreen.svelte',
            type: 'replace',
            anchor: `    import { aiLawApplies, chatFoldedState, chatFoldedStateMessageIndex, downloadFile } from 'src/ts/globalApi.svelte';
`,
            content: `    import { aiLawApplies, chatFoldedState, chatFoldedStateMessageIndex, downloadFile, requestDurableSave } from 'src/ts/globalApi.svelte';
`,
            requires: ['haejeok-persistence-safety-adapter:durable-save-plugin-scope'],
            after: [
                ...defaultChatOwners,
                'haejeok-persistence-safety-adapter:chat-helper-import',
            ],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'haejeok-persistence-safety-adapter:chat-append-state',
            file: 'src/lib/ChatScreens/DefaultChatScreen.svelte',
            type: 'insert',
            where: 'after',
            anchor: `        let cha = activeChat.message
`,
            content: `        const activeChaId = DBState.db.characters[selectedChar]?.chaId
        let appendedUserMessage = false
        const appendUserMessage = (entry: Message) => {
            cha.push(entry)
            appendedUserMessage = true
        }
`,
            requires: [
                'haejeok-persistence-safety-adapter:chat-helper-import',
                'haejeok-persistence-safety-adapter:chat-durable-save-import',
                'lazy-chat-sync:chat-missing-payload-notice',
            ],
            after: [
                ...defaultChatOwners,
                'haejeok-persistence-safety-adapter:chat-durable-save-import',
            ],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'haejeok-persistence-safety-adapter:chat-say-nothing-append',
            file: 'src/lib/ChatScreens/DefaultChatScreen.svelte',
            type: 'replace',
            anchor: `                if(DBState.db.useSayNothing){
                    cha.push({
                        role: 'user',
                        data: '*says nothing*',
                        name: null
                    })
                }
`,
            content: `                if(DBState.db.useSayNothing){
                    appendUserMessage({
                        role: 'user',
                        data: '*says nothing*',
                        name: null
                    })
                }
`,
            requires: ['haejeok-persistence-safety-adapter:chat-append-state'],
            after: ['haejeok-persistence-safety-adapter:chat-append-state'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'haejeok-persistence-safety-adapter:chat-character-append',
            file: 'src/lib/ChatScreens/DefaultChatScreen.svelte',
            type: 'replace',
            anchor: `                cha.push({
                    role: 'user',
                    data: await processScript(char,messageInput,'editinput'),
                    time: Date.now(),
                    name: null
                })
`,
            content: `                appendUserMessage({
                    role: 'user',
                    data: await processScript(char,messageInput,'editinput'),
                    time: Date.now(),
                    name: null
                })
`,
            requires: ['haejeok-persistence-safety-adapter:chat-say-nothing-append'],
            after: ['haejeok-persistence-safety-adapter:chat-say-nothing-append'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'haejeok-persistence-safety-adapter:chat-group-append',
            file: 'src/lib/ChatScreens/DefaultChatScreen.svelte',
            type: 'replace',
            anchor: `                cha.push({
                    role: 'user',
                    data: messageInput,
                    time: Date.now(),
                    name: null
                })
`,
            content: `                appendUserMessage({
                    role: 'user',
                    data: messageInput,
                    time: Date.now(),
                    name: null
                })
`,
            requires: ['haejeok-persistence-safety-adapter:chat-character-append'],
            after: ['haejeok-persistence-safety-adapter:chat-character-append'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'haejeok-persistence-safety-adapter:chat-save-before-generation',
            file: 'src/lib/ChatScreens/DefaultChatScreen.svelte',
            type: 'insert',
            where: 'after',
            anchor: `        DBState.db.characters[selectedChar].chats[DBState.db.characters[selectedChar].chatPage].message = cha
`,
            content: `        await persistActiveChatBeforeGeneration({
            appendedUserMessage,
            chaId: activeChaId,
            chatId: activeChat.id,
        }, requestDurableSave)
`,
            requires: [
                'haejeok-persistence-safety-adapter:chat-say-nothing-append',
                'haejeok-persistence-safety-adapter:chat-character-append',
                'haejeok-persistence-safety-adapter:chat-group-append',
            ],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'haejeok-persistence-safety-adapter:script-imports',
            file: 'src/ts/process/scriptings.ts',
            type: 'replace',
            anchor: `import { fetchNative, readImage } from "../globalApi.svelte";
`,
            content: `import { fetchNative, readImage, requestDurableChatPayloadSave } from "../globalApi.svelte";
import { persistScriptMessagesBeforeReturn } from "../haejeokPersistenceSafety";
`,
            requires: [
                'haejeok-persistence-safety-adapter:helper',
                'haejeok-persistence-safety-adapter:durable-chat-payload-api',
            ],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'haejeok-persistence-safety-adapter:script-mutation-state',
            file: 'src/ts/process/scriptings.ts',
            type: 'replace',
            anchor: `    moduleId?: string,
}
`,
            content: `    moduleId?: string,
    messagesMutated?: boolean,
}
`,
            requires: ['haejeok-persistence-safety-adapter:script-imports'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'haejeok-persistence-safety-adapter:script-mutation-reset',
            file: 'src/ts/process/scriptings.ts',
            type: 'insert',
            where: 'after',
            anchor: `        ScriptingEngineState.getVar = getVar
`,
            content: `        ScriptingEngineState.messagesMutated = false
`,
            requires: ['haejeok-persistence-safety-adapter:script-mutation-state'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'haejeok-persistence-safety-adapter:script-set-chat',
            file: 'src/ts/process/scriptings.ts',
            type: 'replace',
            anchor: `                const message = ScriptingEngineState.chat.message?.at(index)
                if(message){
                    message.data = value ?? ''
                }
`,
            content: `                const message = ScriptingEngineState.chat.message?.at(index)
                const nextValue = value ?? ''
                if(message && message.data !== nextValue){
                    message.data = nextValue
                    ScriptingEngineState.messagesMutated = true
                }
`,
            requires: ['haejeok-persistence-safety-adapter:script-mutation-reset'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'haejeok-persistence-safety-adapter:script-set-role',
            file: 'src/ts/process/scriptings.ts',
            type: 'replace',
            anchor: `                const message = ScriptingEngineState.chat.message?.at(index)
                if(message){
                    message.role = value === 'user' ? 'user' : 'char'
                }
`,
            content: `                const message = ScriptingEngineState.chat.message?.at(index)
                const nextRole = value === 'user' ? 'user' : 'char'
                if(message && message.role !== nextRole){
                    message.role = nextRole
                    ScriptingEngineState.messagesMutated = true
                }
`,
            requires: ['haejeok-persistence-safety-adapter:script-mutation-reset'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'haejeok-persistence-safety-adapter:script-cut-chat',
            file: 'src/ts/process/scriptings.ts',
            type: 'replace',
            anchor: `                ScriptingEngineState.chat.message = ScriptingEngineState.chat.message.slice(start,end)
`,
            content: `                ScriptingEngineState.chat.message = ScriptingEngineState.chat.message.slice(start,end)
                ScriptingEngineState.messagesMutated = true
`,
            requires: ['haejeok-persistence-safety-adapter:script-mutation-reset'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'haejeok-persistence-safety-adapter:script-remove-chat',
            file: 'src/ts/process/scriptings.ts',
            type: 'replace',
            anchor: `                ScriptingEngineState.chat.message.splice(index, 1)
`,
            content: `                if(ScriptingEngineState.chat.message.splice(index, 1).length > 0){
                    ScriptingEngineState.messagesMutated = true
                }
`,
            requires: ['haejeok-persistence-safety-adapter:script-mutation-reset'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'haejeok-persistence-safety-adapter:script-add-chat',
            file: 'src/ts/process/scriptings.ts',
            type: 'insert',
            where: 'after',
            anchor: `                ScriptingEngineState.chat.message.push({role: roleData, data: value ?? ''})
`,
            content: `                ScriptingEngineState.messagesMutated = true
`,
            requires: ['haejeok-persistence-safety-adapter:script-mutation-reset'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'haejeok-persistence-safety-adapter:script-insert-chat',
            file: 'src/ts/process/scriptings.ts',
            type: 'insert',
            where: 'after',
            anchor: `                ScriptingEngineState.chat.message.splice(index, 0, {role: roleData, data: value ?? ''})
`,
            content: `                ScriptingEngineState.messagesMutated = true
`,
            requires: ['haejeok-persistence-safety-adapter:script-mutation-reset'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'haejeok-persistence-safety-adapter:script-set-full-chat',
            file: 'src/ts/process/scriptings.ts',
            type: 'insert',
            where: 'after',
            anchor: `                ScriptingEngineState.chat.message = realValue.map((v) => {
                    return {
                        role: v.role,
                        data: v.data
                    }
                })
`,
            content: `                ScriptingEngineState.messagesMutated = true
`,
            requires: ['haejeok-persistence-safety-adapter:script-mutation-reset'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'haejeok-persistence-safety-adapter:script-save-before-return',
            file: 'src/ts/process/scriptings.ts',
            type: 'insert',
            where: 'after',
            anchor: `        chat = ScriptingEngineState.chat
`,
            content: `        await persistScriptMessagesBeforeReturn({
            messagesMutated: Boolean(ScriptingEngineState.messagesMutated),
            chaId: char?.chaId,
            chatId: chat?.id,
            chat,
        }, requestDurableChatPayloadSave)
`,
            requires: [
                'haejeok-persistence-safety-adapter:script-set-chat',
                'haejeok-persistence-safety-adapter:script-set-role',
                'haejeok-persistence-safety-adapter:script-cut-chat',
                'haejeok-persistence-safety-adapter:script-remove-chat',
                'haejeok-persistence-safety-adapter:script-add-chat',
                'haejeok-persistence-safety-adapter:script-insert-chat',
                'haejeok-persistence-safety-adapter:script-set-full-chat',
                'haejeok-persistence-safety-adapter:durable-chat-payload-impl',
            ],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'haejeok-persistence-safety-adapter:plugin-imports',
            file: 'src/ts/plugins/plugins.svelte.ts',
            type: 'replace',
            anchor: `import { fetchNative, globalFetch, readImage, requestImmediateSave, saveAsset, toGetter } from "../globalApi.svelte";
`,
            content: `import { fetchNative, globalFetch, readImage, requestDurableSave, saveAsset, toGetter } from "../globalApi.svelte";
import { persistPluginsBeforeReload } from "../haejeokPersistenceSafety";
`,
            requires: [
                'haejeok-persistence-safety-adapter:helper',
                'haejeok-persistence-safety-adapter:durable-save-plugin-scope',
            ],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'haejeok-persistence-safety-adapter:plugin-save-before-reload',
            file: 'src/ts/plugins/plugins.svelte.ts',
            type: 'replace',
            anchor: `        setDatabaseLite(db)
        void requestImmediateSave()

        loadPlugins()
`,
            content: `        setDatabaseLite(db)
        await persistPluginsBeforeReload(
            requestDurableSave,
            loadPlugins,
        )
`,
            requires: [
                'haejeok-persistence-safety-adapter:plugin-imports',
                'haejeok-persistence-safety-adapter:durable-save-plugin-enlistment',
            ],
            targetVersions: pocketRisu1100,
        },
    ],
}
