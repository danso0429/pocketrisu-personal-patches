'use strict'

const targetVersions = { pocketrisu: ['1.10.0'] }
const chatOwners = [
    ...['chat-risu-control-touch-import', 'chat-risu-control-touch-bridge', 'chat-standard-risu-control-touch-events', 'chat-themed-risu-control-touch-events'].map(name => `bg-preserve:hook:${name}`),
    ...['chat-import', 'chat-class'].map(name => `haejeok-chat-width-adapter:${name}:1.10`),
    ...['chat-helper-import', 'chat-reactive-metadata', 'chat-reload-key', 'chat-body-streaming-prop'].map(name => `kei-chat-render-bg-adapter:${name}:1.9`),
    ...['chat-remove-controller-import', 'chat-root-state', 'chat-remove-controller-state', 'chat-remove-controller-save', 'chat-translation-bridge', 'chat-remove-controller', 'chat-standard-root', 'chat-themed-root'].map(name => `kei-partial-edit-bg-adapter:${name}:1.9`),
    'pagefold-model-preset:chat-generation-badge:1.10',
]
const unit = (name, file, properties) => ({
    id: `haejeok-persistence-safety-adapter:${name}`,
    file, targetVersions, ...properties,
})

module.exports = ({ globalApiOwners, defaultChatOwners }) => [
    unit('chat-publication-trigger-import', 'src/ts/process/triggers.ts', {
        type: 'insert', where: 'before',
        anchor: "import { getCurrentCharacter, getCurrentChat, getDatabase, setCurrentCharacter, setDatabase, type Chat, type character } from \"../storage/database.svelte\";\n",
        content: "import { trackDerivedChat } from '../storage/chatSaveRebase';\n",
    }),
    unit('chat-publication-trigger-base', 'src/ts/process/triggers.ts', {
        type: 'insert', where: 'after',
        anchor: '    let chat = arg.displayMode ? arg.chat : safeStructuredClone(arg.chat ?? char.chats[char.chatPage])\n',
        content: '    if (!arg.displayMode) trackDerivedChat(chat, arg.chat ?? char.chats[char.chatPage])\n',
        requires: ['haejeok-persistence-safety-adapter:chat-publication-trigger-import'],
    }),
    unit('chat-publication-current-import', 'src/ts/storage/database.svelte.ts', {
        type: 'insert', where: 'before',
        anchor: 'export function setCurrentChat(chat:Chat){\n',
        content: "import { mergeDerivedChat, ChatViewConflictError } from './chatSaveRebase'\nimport { notifyError as notifyChatViewConflict } from '../alert'\n\n",
        after: [
            'bg-preserve:hook:regex-multitype-field',
            ...['database-import', 'database-normalization', 'database-field-type', 'preset-field-type'].map(name => `haejeok-chat-width-adapter:${name}:1.10`),
            ...['database-enable-hotkeys-default', 'database-mobile-back-default', 'database-mobile-back-field', 'database-enable-hotkeys-field'].map(name => `kei-mobile-navigation-lazy-adapter:${name}:1.9`),
            ...['normalizer-export', 'typed-role-fallback'].map(name => `kei-prompt-role-compat-core:${name}:1.9`),
            ...['database-import', 'database-load', 'preset-activation'].map(name => `kei-text-theme-normalization-core:${name}:1.9`),
            ...['database-role-normalizer-import', 'database-chat-role-normalizer', 'message-generation-info-type'].map(name => `pagefold-model-preset:${name}:1.10`),
            'persona-organizer:model-normalization:1.10', 'persona-organizer:image-gallery-normalization:1.10',
            ...['persona-folder-field', 'persona-image-gallery-field', 'folder-interface', 'database-folder-field'].map(name => `persona-organizer:${name}`),
            'personal-settings:database-type-import', 'personal-settings:database-field',
            ...['normalizer', 'load-normalization', 'save-normalization', 'change-guard'].map(name => `preset-integrity:${name}:1.9`),
        ],
    }),
    unit('chat-publication-current-merge', 'src/ts/storage/database.svelte.ts', {
        type: 'replace',
        anchor: '    char.chats[char.chatPage] = normalizeChat(chat)\n',
        content: `    let mergedChat: Chat
    try {
        mergedChat = mergeDerivedChat(chat, char.chats[char.chatPage])
    } catch (error) {
        if (error instanceof ChatViewConflictError) error.notified = true
        notifyChatViewConflict('Chat changed while the trigger was running', {
            description: 'The conflicting result was not applied. Review the current chat before running the trigger again.',
            source: 'chat-save',
        })
        throw error
    }
    char.chats[char.chatPage] = normalizeChat(mergedChat)
`,
        requires: ['haejeok-persistence-safety-adapter:chat-publication-current-import'],
    }),
    unit('chat-publication-input-import', 'src/lib/ChatScreens/DefaultChatScreen.svelte', {
        type: 'insert', where: 'before',
        anchor: "    import { persistActiveChatBeforeGeneration } from 'src/ts/haejeokPersistenceSafety';\n",
        content: "    import { snapshotChatView, rebaseChatInput, publishChatView, ChatViewConflictError } from 'src/ts/storage/chatSaveRebase';\n    import { CurrentTriggerIdStore } from 'src/ts/stores.svelte';\n    import { get as readChatStore } from 'svelte/store';\n",
        requires: ['haejeok-persistence-safety-adapter:chat-helper-import'],
    }),
    unit('chat-publication-input-base', 'src/lib/ChatScreens/DefaultChatScreen.svelte', {
        type: 'replace',
        anchor: '        let cha = activeChat.message\n',
        content: '        const inputBase = { id: activeChat.id, message: snapshotChatView(activeChat.message) }\n        let inputTriggerChat: ChatData | undefined\n        let cha = snapshotChatView(activeChat.message) as Message[]\n',
        requires: ['haejeok-persistence-safety-adapter:chat-publication-input-import'],
        after: ['haejeok-persistence-safety-adapter:chat-append-state'],
    }),
    unit('chat-publication-input-id', 'src/lib/ChatScreens/DefaultChatScreen.svelte', {
        type: 'replace',
        anchor: '            cha.push(entry)\n',
        content: '            cha.push({ ...entry, chatId: entry.chatId || v4() })\n',
        requires: ['haejeok-persistence-safety-adapter:chat-publication-input-base'],
    }),
    unit('chat-publication-input-draft', 'src/lib/ChatScreens/DefaultChatScreen.svelte', {
        type: 'insert', where: 'before',
        anchor: "        if(messageInput === ''){\n            if(cha.length === 0 || cha[cha.length - 1].role !== 'user'){\n",
        content: '        const preparedInput = messageInput\n        const preparedTranslation = messageInputTranslate\n        const preparedDraftId = draftInputId\n',
        requires: ['haejeok-persistence-safety-adapter:chat-publication-input-trigger-error'],
    }),
    unit('chat-publication-input-receipt', 'src/lib/ChatScreens/DefaultChatScreen.svelte', {
        type: 'insert', where: 'after',
        anchor: '                    cha = triggerResult.chat.message\n',
        content: '                    inputTriggerChat = triggerResult.chat\n',
        requires: ['haejeok-persistence-safety-adapter:chat-publication-input-id'],
    }),
    unit('chat-publication-input-trigger-error', 'src/lib/ChatScreens/DefaultChatScreen.svelte', {
        type: 'replace',
        anchor: "                let triggerResult = await runTrigger(char,'input', {chat: activeChat})\n",
        content: `                const previousTriggerId = readChatStore(CurrentTriggerIdStore)
                let triggerResult
                try {
                    triggerResult = await runTrigger(char,'input', {chat: activeChat})
                } catch (error) {
                    if (!(error instanceof ChatViewConflictError)) throw error
                    if (readChatStore(CurrentTriggerIdStore) === null) CurrentTriggerIdStore.set(previousTriggerId)
                    if (!error.notified) {
                        error.notified = true
                        notifyError('Chat changed while preparing the message', {
                            description: 'Your draft was kept. Changes already made by triggers remain; sending again runs preparation again.',
                            source: 'chat-save',
                        })
                    }
                    return
                }
`,
        requires: ['haejeok-persistence-safety-adapter:chat-publication-input-receipt'],
    }),
    unit('chat-publication-input-merge', 'src/lib/ChatScreens/DefaultChatScreen.svelte', {
        type: 'replace',
        anchor: `        messageInput = ''
        messageInputTranslate = ''
        removeChatDraft(draftChaId, draftChatId)
        DBState.db.characters[selectedChar].chats[DBState.db.characters[selectedChar].chatPage].message = cha
`,
        content: `        const currentCharacter = DBState.db.characters[selectedChar]
        const currentChat = currentCharacter?.chats?.[currentCharacter.chatPage]
        const hadStableId = typeof inputBase.id === 'string' && inputBase.id.trim().length > 0
        const sameChat = hadStableId ? currentChat?.id === inputBase.id : currentChat === activeChat
        const mergedInput = sameChat && currentCharacter?.chaId === activeChaId
            ? rebaseChatInput(inputBase, cha, currentChat, inputTriggerChat, preparedDraftId)
            : { ok: false as const }
        if (!mergedInput.ok) {
            notifyError('Chat changed while preparing the message', {
                description: 'Your draft was kept. Changes already made by triggers remain; sending again runs preparation again.',
                source: 'chat-save',
            })
            return
        }
        publishChatView(currentChat.message, mergedInput.chat.message)
        if (messageInput === preparedInput && messageInputTranslate === preparedTranslation && draftInputId === preparedDraftId) {
            messageInput = ''
            messageInputTranslate = ''
            removeChatDraft(draftChaId, draftChatId)
        }
`,
        requires: ['haejeok-persistence-safety-adapter:chat-publication-input-draft'],
        after: ['haejeok-persistence-safety-adapter:chat-save-before-generation'],
    }),
    unit('chat-publication-generation-draft', 'src/lib/ChatScreens/DefaultChatScreen.svelte', {
        type: 'replace',
        anchor: "        messageInput = ''\n        const genKey = currentChatGenKey()\n",
        content: '        const genKey = currentChatGenKey()\n',
        requires: ['haejeok-persistence-safety-adapter:chat-publication-input-merge'],
    }),
    unit('chat-publication-removal-capture', 'src/lib/ChatScreens/Chat.svelte', {
        type: 'replace',
        anchor: `    async function rm(){
        const messages = DBState.db.characters[selIdState.selId].chats[DBState.db.characters[selIdState.selId].chatPage].message
        const cascadeCount = messages.length - idx
`,
        content: `    async function rm(){
        const removalCharacter = DBState.db.characters[selIdState.selId]
        const removalChat = removalCharacter?.chats?.[removalCharacter.chatPage]
        const messages = removalChat?.message
        const removalTarget = messages?.[idx]
        if (!removalTarget) return
        const removalTail = messages.slice(idx).map(item => ({ item, data: item.data }))
        const cascadeCount = removalTail.length
`,
    }),
    unit('chat-publication-removal-check', 'src/lib/ChatScreens/Chat.svelte', {
        type: 'replace',
        anchor: `        let msg = DBState.db.characters[selIdState.selId].chats[DBState.db.characters[selIdState.selId].chatPage].message
        if(sel === 1){
            msg = msg.slice(0, idx)
`,
        content: `        const currentCharacter = DBState.db.characters[selIdState.selId]
        const currentChat = currentCharacter?.chats?.[currentCharacter.chatPage]
        if (currentCharacter !== removalCharacter || currentChat !== removalChat) return
        let msg = currentChat.message
        const removalIndex = msg.indexOf(removalTarget)
        if (removalIndex < 0 || removalTarget.data !== removalTail[0].data
            || (sel === 1 && (msg.length - removalIndex !== removalTail.length
                || removalTail.some(({ item, data }, offset) => msg[removalIndex + offset] !== item || item.data !== data)))) {
            notifyInfo('Chat changed while confirmation was open. Review the messages and try again.')
            return
        }
        if(sel === 1){
            msg = msg.slice(0, removalIndex)
`,
        requires: ['haejeok-persistence-safety-adapter:chat-publication-removal-capture'],
    }),
    unit('chat-publication-removal-apply', 'src/lib/ChatScreens/Chat.svelte', {
        type: 'replace',
        anchor: '            msg.splice(idx, 1)\n',
        content: '            msg.splice(removalIndex, 1)\n',
        requires: ['haejeok-persistence-safety-adapter:chat-publication-removal-check'],
    }),
    unit('chat-publication-send-conflict-import', 'src/ts/process/index.svelte.ts', {
        type: 'insert', where: 'before',
        anchor: 'import { clearPendingSend, registerPendingSend } from "./request/pendingSends";\n',
        content: "import { ChatViewConflictError } from '../storage/chatSaveRebase';\nimport { endGenerationIfOwned } from './generationState';\n",
        after: ['bg-preserve:hook:noorch-resend-recursion', 'lazy-chat-bg-adapter:browser-stat-effect-send:1.10', 'parser-hardening:main-thought-extraction', 'pagefold-model-preset:index-generation-info:1.10'],
    }),
    unit('chat-publication-send-conflict-start', 'src/ts/process/index.svelte.ts', {
        type: 'insert', where: 'before',
        anchor: '    if(chatProcessIndex === -1 && DBState.db.presetChain){\n',
        content: '    try {\n',
        requires: ['haejeok-persistence-safety-adapter:chat-publication-send-conflict-import'],
    }),
    unit('chat-publication-send-conflict-end', 'src/ts/process/index.svelte.ts', {
        type: 'replace',
        anchor: '    if (realChatId) clearPendingSend(realChatId)\n    return true\n}\n\nfunction systemizeChat',
        content: `    if (realChatId) clearPendingSend(realChatId)
    return true
    } catch (error) {
        if (!(error instanceof ChatViewConflictError)) throw error
        if (endGenerationIfOwned(genKey, generationId)) {
            if (realChatId) clearPendingSend(realChatId)
            chatProcessStage.set(0)
        }
        if (!error.notified) {
            error.notified = true
            alertError(error)
        }
        return false
    }
}

function systemizeChat`,
        requires: ['haejeok-persistence-safety-adapter:chat-publication-send-conflict-start'],
    }),
    unit('chat-publication-manual-import', 'src/lib/ChatScreens/Chat.svelte', {
        type: 'insert', where: 'before',
        anchor: '    async function runButtonTriggerWithin(origin: Element) {\n',
        content: "    import { ChatViewConflictError } from '../../ts/storage/chatSaveRebase'\n    import { get as readManualStore } from 'svelte/store'\n\n",
        requires: ['haejeok-persistence-safety-adapter:chat-publication-removal-apply'],
    }),
    unit('chat-publication-manual-start', 'src/lib/ChatScreens/Chat.svelte', {
        type: 'insert', where: 'before',
        anchor: '        const triggerResult =\n            triggerName ?\n',
        content: '        try {\n',
        requires: ['haejeok-persistence-safety-adapter:chat-publication-manual-import'],
    }),
    unit('chat-publication-manual-end', 'src/lib/ChatScreens/Chat.svelte', {
        type: 'insert', where: 'before',
        anchor: '    }\n\n    async function handleButtonTriggerWithin(event: UIEvent) {\n',
        content: `        } catch (error) {
            if (!(error instanceof ChatViewConflictError)) throw error
            if (triggerId && readManualStore(CurrentTriggerIdStore) === triggerId) CurrentTriggerIdStore.set(null)
            if (!error.notified) {
                error.notified = true
                notifyInfo(error.message)
            }
        }
`,
        requires: ['haejeok-persistence-safety-adapter:chat-publication-manual-start'],
    }),
    unit('chat-publication-command-import', 'src/ts/process/command.ts', {
        type: 'insert', where: 'before',
        anchor: 'export async function processMultiCommand(command:string) {\n',
        content: "import { ChatViewConflictError } from '../storage/chatSaveRebase'\nimport { notifyError as notifyChatViewConflict } from '../alert'\n\n",
        after: ['bg-preserve:hook:noorch-multisend-command'],
    }),
    unit('chat-publication-command-trigger', 'src/ts/process/command.ts', {
        type: 'replace',
        anchor: `        case 'trigger':{
            const currentChar = getCurrentCharacter()
            const triggerResult = await runTrigger(currentChar, 'manual', {
                chat: getCurrentChat(),
                manualName: arg
            });

            if(triggerResult){
               setCurrentChat(triggerResult.chat);
            }
            return
        }
`,
        content: `        case 'trigger':{
            try {
                const currentChar = getCurrentCharacter()
                const triggerResult = await runTrigger(currentChar, 'manual', { chat: getCurrentChat(), manualName: arg })
                if (triggerResult) setCurrentChat(triggerResult.chat)
            } catch (error) {
                if (!(error instanceof ChatViewConflictError)) throw error
                if (!error.notified) {
                    error.notified = true
                    notifyChatViewConflict(error.message, { source: 'chat-save' })
                }
            }
            return
        }
`,
        requires: ['haejeok-persistence-safety-adapter:chat-publication-command-import'],
    }),
    unit('chat-publication-preview-import', 'src/lib/SideBars/DevTool.svelte', {
        type: 'insert', where: 'before',
        anchor: '    let previewMode = $state(\'chat\')\n',
        content: '    import { alertStore as previewAlertStore } from "src/ts/stores.svelte";\n    import { alertClear } from "src/ts/alert";\n    import { chatGenKey, endGenerationIfOwned, generationStates } from "src/ts/process/generationState";\n    import { get as readChatStore } from "svelte/store";\n\n',
    }),
    unit('chat-publication-preview-result', 'src/lib/SideBars/DevTool.svelte', {
        type: 'replace',
        anchor: `        alertWait("Loading...")
        await sendChat(-1, {
            preview: previewJoin !== 'prompt',
            previewPrompt: previewJoin === 'prompt'
        })
`,
        content: `        alertWait("Loading...")
        const waitingAlert = readChatStore(previewAlertStore)
        const previewCharacter = DBState.db.characters[$selectedCharID]
        const previewKey = chatGenKey(previewCharacter?.chats?.[previewCharacter.chatPage]?.id)
        const previousOwner = readChatStore(generationStates).get(previewKey)?.generationId
        // Preview skips server delegation and registers its native owner
        // synchronously before sendChat's first await.
        const pendingPreview = sendChat(-1, {
            preview: previewJoin !== 'prompt',
            previewPrompt: previewJoin === 'prompt'
        })
        const previewOwner = readChatStore(generationStates).get(previewKey)?.generationId
        const succeeded = await pendingPreview
        if (succeeded === false) {
            if (previewOwner && previewOwner !== previousOwner) endGenerationIfOwned(previewKey, previewOwner)
            if (readChatStore(previewAlertStore) === waitingAlert) alertClear()
            return false
        }
`,
        requires: ['haejeok-persistence-safety-adapter:chat-publication-preview-import'],
    }),
].map(entry => ({ ...entry, after: [
    ...(entry.file === 'src/lib/ChatScreens/Chat.svelte' ? chatOwners : []),
    ...(entry.file === 'src/ts/globalApi.svelte.ts' ? globalApiOwners : []),
    ...(entry.file === 'src/lib/ChatScreens/DefaultChatScreen.svelte' ? [
        ...defaultChatOwners,
        ...['default-chat-import', 'composer-class', 'default-chat-root-class'].map(name => `haejeok-chat-width-adapter:${name}:1.10`),
        ...['chat-helper-import', 'chat-durable-save-import', 'chat-append-state', 'chat-say-nothing-append', 'chat-character-append', 'chat-group-append', 'chat-save-before-generation'].map(name => `haejeok-persistence-safety-adapter:${name}`),
        ...['server-pending-ui-import', 'server-pending-ui-selection', 'server-pending-ui-render', 'server-input-client-send', 'server-input-client-busy-ui', 'composer-draft-identity-state', 'composer-draft-identity-reset', 'composer-draft-identity-load', 'composer-draft-identity-persist', 'composer-draft-identity-cleanup', 'composer-draft-identity-save'].map(name => `lazy-chat-bg-adapter:${name}:1.10`),
        'personal-settings:editor-hook-send-icon-render',
    ] : []),
    ...(entry.requires || []),
    ...(entry.after || []),
] }))
