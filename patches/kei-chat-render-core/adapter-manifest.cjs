'use strict'

const pocketRisu1100 = { pocketrisu: ['1.10.0'] }

function createChatRenderAdapterManifest({ id, title }) {
    const chatAfter = [
        'bg-preserve:hook:chat-risu-control-touch-import',
        'bg-preserve:hook:chat-risu-control-touch-bridge',
        'bg-preserve:hook:chat-standard-risu-control-touch-events',
        'bg-preserve:hook:chat-themed-risu-control-touch-events',
    ]
    const defaultChatAfter = [
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
    ]
    const prefix = `${id}:`
    const marker = (name) =>
        `POCKETRISU-PATCH:kei-chat-render:bg:${name}`

    return {
        id,
        title,
        version: '0.2.1',
        userSelectable: false,
        targets: {
            pocketrisu: {
                verified: ['1.10.0'],
                reviewing: [],
            },
        },
        requires: ['kei-chat-render-core', 'bg-preserve'],
        autoWhen: {
            all: ['kei-chat-render-core', 'bg-preserve'],
        },
        units: [
            {
                id: `${prefix}chats-helper-import:1.9`,
                file: 'src/lib/ChatScreens/Chats.svelte',
                type: 'replace',
                anchor: `    import { get } from 'svelte/store';
`,
                managed: `    import { get } from 'svelte/store';
    /* ${marker('chats-helper-import:1.9')} */
    import { isActiveStreamingMessage } from './keiChatRender';
`,
                markerNeedle: marker('chats-helper-import:1.9'),
                anchorPolicy: 'first',
                requires: ['kei-chat-render-core:identity'],
            },
            {
                id: `${prefix}chats-generation-prop:1.9`,
                file: 'src/lib/ChatScreens/Chats.svelte',
                type: 'replace',
                anchor: `        userIconPortrait,
        hasNewUnreadMessage = $bindable(false)
`,
                managed: `        userIconPortrait,
        /* ${marker('chats-generation-prop:1.9')} */
        generationActive = false,
        hasNewUnreadMessage = $bindable(false)
`,
                markerNeedle: marker('chats-generation-prop:1.9'),
                anchorPolicy: 'first',
                requires: [`${prefix}chats-helper-import:1.9`],
            },
            {
                id: `${prefix}chats-generation-prop-type:1.9`,
                file: 'src/lib/ChatScreens/Chats.svelte',
                type: 'replace',
                anchor: `        userIconPortrait?: boolean
        hasNewUnreadMessage?: boolean
`,
                managed: `        userIconPortrait?: boolean
        /* ${marker('chats-generation-prop-type:1.9')} */
        generationActive?: boolean
        hasNewUnreadMessage?: boolean
`,
                markerNeedle: marker('chats-generation-prop-type:1.9'),
                anchorPolicy: 'first',
                requires: [`${prefix}chats-generation-prop:1.9`],
            },
            {
                id: `${prefix}chats-instance-metadata:1.9`,
                file: 'src/lib/ChatScreens/Chats.svelte',
                type: 'replace',
                anchor: `    type ChatInstance = {
        updateStreamingDisplay?: (state: {
            isOptimizedStreamingMessage: boolean
            streamingOptimizationMode: StreamingDisplayOptimizationMode
            rawStreamingText: string
        }) => void
    }
`,
                managed: `    type ChatInstance = {
        updateStreamingDisplay?: (state: {
            isOptimizedStreamingMessage: boolean
            streamingOptimizationMode: StreamingDisplayOptimizationMode
            rawStreamingText: string
            /* ${marker('chats-instance-metadata:1.9')} */
            messageGenerationInfo: Message['generationInfo']
        }) => void
    }
`,
                markerNeedle: marker('chats-instance-metadata:1.9'),
                anchorPolicy: 'first',
                requires: [`${prefix}chats-generation-prop-type:1.9`],
            },
            {
                id: `${prefix}chats-live-streaming-identity:1.9`,
                file: 'src/lib/ChatScreens/Chats.svelte',
                type: 'replace',
                anchor: `            const activeStreamingMessage = i === activeStreamingIndex && message.role === 'char';
            const hashMessageData = activeStreamingMessage ? '' : message.data;
            let hashd = hashMessageData + (message.chatId ?? '') + i.toString() + messageLargePortrait.toString() + message.disabled?.toString() + reloadPointer.toString() + (message.swipeId ?? 0).toString() + (message.swipes?.length ?? 0).toString() + isRerollTarget.toString();
            const currentHash = hashCode(hashd);
`,
                managed: `            /* ${marker('chats-live-streaming-identity:1.9')}:START */
            const activeStreamingMessage = isActiveStreamingMessage({
                role: message.role,
                chatStreaming: currentChat?.isStreaming === true,
                generationActive,
                isLastMessage: i === activeStreamingIndex,
            });
            const hashMessageData = activeStreamingMessage ? '' : message.data;
            const hashReloadPointer = activeStreamingMessage ? 0 : reloadPointer;
            let hashd = hashMessageData + (message.chatId ?? '') + i.toString() + messageLargePortrait.toString() + message.disabled?.toString() + hashReloadPointer.toString() + (message.swipeId ?? 0).toString() + (message.swipes?.length ?? 0).toString() + isRerollTarget.toString() + activeStreamingMessage.toString();
            const currentHash = hashCode(hashd);
            /* ${marker('chats-live-streaming-identity:1.9')}:END */
`,
                markerNeedle: `${marker('chats-live-streaming-identity:1.9')}:START`,
                anchorPolicy: 'first',
                requires: [`${prefix}chats-instance-metadata:1.9`],
            },
            {
                id: `${prefix}chats-reactive-metadata:1.9`,
                file: 'src/lib/ChatScreens/Chats.svelte',
                type: 'replace',
                anchor: `                mountInstances.get(currentHash)?.updateStreamingDisplay?.({
                    isOptimizedStreamingMessage: activeStreamingMessage,
                    streamingOptimizationMode: performanceMode,
                    rawStreamingText: message.data,
                })
`,
                managed: `                mountInstances.get(currentHash)?.updateStreamingDisplay?.({
                    isOptimizedStreamingMessage: activeStreamingMessage,
                    streamingOptimizationMode: performanceMode,
                    rawStreamingText: message.data,
                    /* ${marker('chats-reactive-metadata:1.9')} */
                    messageGenerationInfo: message.generationInfo,
                })
`,
                markerNeedle: marker('chats-reactive-metadata:1.9'),
                anchorPolicy: 'first',
                requires: [`${prefix}chats-live-streaming-identity:1.9`],
            },
            {
                id: `${prefix}default-chat-generation-state:1.9`,
                file: 'src/lib/ChatScreens/DefaultChatScreen.svelte',
                type: 'replace',
                anchor: `                messages={currentChat}
                loadPages={loadPages}
`,
                managed: `                messages={currentChat}
                loadPages={loadPages}
                /* ${marker('default-chat-generation-state:1.9')} */
                generationActive={$doingChat}
`,
                markerNeedle: marker('default-chat-generation-state:1.9'),
                anchorPolicy: 'first',
                requires: [`${prefix}chats-generation-prop-type:1.9`],
                after: defaultChatAfter,
            },
            {
                id: `${prefix}chat-helper-import:1.9`,
                file: 'src/lib/ChatScreens/Chat.svelte',
                type: 'replace',
                anchor: `    import ChatBody from './ChatBody.svelte'
`,
                managed: `    import ChatBody from './ChatBody.svelte'
    /* ${marker('chat-helper-import:1.9')} */
    import { getChatBodyReloadPointer } from './keiChatRender'
`,
                markerNeedle: marker('chat-helper-import:1.9'),
                anchorPolicy: 'first',
                requires: ['kei-chat-render-core:identity'],
                after: chatAfter,
            },
            {
                id: `${prefix}chat-reactive-metadata:1.9`,
                file: 'src/lib/ChatScreens/Chat.svelte',
                type: 'replace',
                anchor: `    export function updateStreamingDisplay(state: {
        isOptimizedStreamingMessage: boolean
        streamingOptimizationMode: StreamingDisplayOptimizationMode
        rawStreamingText: string
    }){
        isOptimizedStreamingMessage = state.isOptimizedStreamingMessage
        streamingOptimizationMode = state.streamingOptimizationMode
        rawStreamingText = state.rawStreamingText
    }
`,
                managed: `    export function updateStreamingDisplay(state: {
        isOptimizedStreamingMessage: boolean
        streamingOptimizationMode: StreamingDisplayOptimizationMode
        rawStreamingText: string
        messageGenerationInfo: MessageGenerationInfo|null|undefined
    }){
        isOptimizedStreamingMessage = state.isOptimizedStreamingMessage
        streamingOptimizationMode = state.streamingOptimizationMode
        rawStreamingText = state.rawStreamingText
        /* ${marker('chat-reactive-metadata:1.9')} */
        message = state.rawStreamingText
        messageGenerationInfo = state.messageGenerationInfo ?? null
    }
`,
                markerNeedle: marker('chat-reactive-metadata:1.9'),
                anchorPolicy: 'first',
                requires: [`${prefix}chat-helper-import:1.9`],
                after: chatAfter,
            },
            {
                id: `${prefix}chat-reload-key:1.9`,
                file: 'src/lib/ChatScreens/Chat.svelte',
                type: 'replace',
                anchor: `        {@const chatReloadPointer = $ReloadGUIPointer + ($ReloadChatPointer[idx] ?? 0)}
`,
                managed: `        <!-- ${marker('chat-reload-key:1.9')}:START -->
        {@const chatReloadPointer = getChatBodyReloadPointer(
            $ReloadGUIPointer,
            $ReloadChatPointer[idx] ?? 0,
            isOptimizedStreamingMessage,
        )}
        <!-- ${marker('chat-reload-key:1.9')}:END -->
`,
                markerNeedle: `${marker('chat-reload-key:1.9')}:START`,
                anchorPolicy: 'first',
                requires: [`${prefix}chat-reactive-metadata:1.9`],
                after: chatAfter,
            },
            {
                id: `${prefix}chat-body-streaming-prop:1.9`,
                file: 'src/lib/ChatScreens/Chat.svelte',
                type: 'replace',
                anchor: `                    {renderRawStreaming}
                    {rawStreamingText} />
`,
                managed: `                    {renderRawStreaming}
                    {rawStreamingText}
                    {isOptimizedStreamingMessage} />
                <!-- ${marker('chat-body-streaming-prop:1.9')} -->
`,
                markerNeedle: marker('chat-body-streaming-prop:1.9'),
                anchorPolicy: 'first',
                requires: [`${prefix}chat-reload-key:1.9`],
                after: chatAfter,
            },
            {
                id: `${prefix}chatbody-streaming-prop:1.9`,
                file: 'src/lib/ChatScreens/ChatBody.svelte',
                type: 'replace',
                anchor: `        renderRawStreaming?: boolean
        rawStreamingText?: string
`,
                managed: `        renderRawStreaming?: boolean
        rawStreamingText?: string
        /* ${marker('chatbody-streaming-prop:1.9')} */
        isOptimizedStreamingMessage?: boolean
`,
                markerNeedle: marker('chatbody-streaming-prop:1.9'),
                anchorPolicy: 'first',
                requires: [`${prefix}chat-body-streaming-prop:1.9`],
            },
            {
                id: `${prefix}chatbody-streaming-default:1.9`,
                file: 'src/lib/ChatScreens/ChatBody.svelte',
                type: 'replace',
                anchor: `        renderRawStreaming = false,
        rawStreamingText = '',
`,
                managed: `        renderRawStreaming = false,
        rawStreamingText = '',
        /* ${marker('chatbody-streaming-default:1.9')} */
        isOptimizedStreamingMessage = false,
`,
                markerNeedle: marker('chatbody-streaming-default:1.9'),
                anchorPolicy: 'first',
                requires: [`${prefix}chatbody-streaming-prop:1.9`],
            },
            {
                id: `${prefix}chatbody-capture-streaming:1.9`,
                file: 'src/lib/ChatScreens/ChatBody.svelte',
                type: 'replace',
                anchor: `        translated;
        retranslate;
        let lastParsedQueue = ''
`,
                managed: `        translated;
        retranslate;
        /* ${marker('chatbody-capture-streaming:1.9')} */
        const streamingDisplay = isOptimizedStreamingMessage
        let lastParsedQueue = ''
`,
                markerNeedle: marker('chatbody-capture-streaming:1.9'),
                anchorPolicy: 'first',
                requires: [`${prefix}chatbody-streaming-default:1.9`],
            },
            {
                id: `${prefix}chatbody-defer-auto-translation:1.9`,
                file: 'src/lib/ChatScreens/ChatBody.svelte',
                type: 'replace',
                anchor: `                    if(DBState.db.autoTranslate){
`,
                managed: `                    /* ${marker('chatbody-defer-auto-translation:1.9')} */
                    if(!streamingDisplay && DBState.db.autoTranslate){
`,
                markerNeedle: marker('chatbody-defer-auto-translation:1.9'),
                anchorPolicy: 'first',
                requires: [`${prefix}chatbody-capture-streaming:1.9`],
            },
            {
                id: `${prefix}chatbody-translation-gate:1.9`,
                file: 'src/lib/ChatScreens/ChatBody.svelte',
                type: 'replace',
                anchor: `            if(retranslate || translated){
`,
                managed: `            /* ${marker('chatbody-translation-gate:1.9')} */
            if(!streamingDisplay && (retranslate || translated)){
`,
                markerNeedle: marker('chatbody-translation-gate:1.9'),
                anchorPolicy: 'first',
                requires: [`${prefix}chatbody-defer-auto-translation:1.9`],
            },
        ].map((unit) => ({ ...unit, targetVersions: pocketRisu1100 })),
    }
}

module.exports = {
    createChatRenderAdapterManifest,
}
