'use strict'

function createChatRenderAdapterManifest({
    id,
    title,
    adapter,
    bgPreserve,
}) {
    const chatAfter = bgPreserve
        ? [
            'bg-preserve:hook:chat-risu-control-touch-import',
            'bg-preserve:hook:chat-risu-control-touch-bridge',
            'bg-preserve:hook:chat-standard-risu-control-touch-events',
            'bg-preserve:hook:chat-themed-risu-control-touch-events',
        ]
        : []
    const defaultChatAfter = bgPreserve
        ? [
            'bg-preserve:hook:defaultchatscreen-import-orchestrating',
            'bg-preserve:hook:defaultchatscreen-import-abort',
            'bg-preserve:hook:defaultchatscreen-sendmain-orchestrating-gate',
            'bg-preserve:hook:defaultchatscreen-reroll-orchestrating-gate',
            'bg-preserve:hook:defaultchatscreen-unreroll-orchestrating-gate',
            'bg-preserve:hook:defaultchatscreen-register-abort',
            'bg-preserve:hook:defaultchatscreen-suppress-abort-alert',
            'bg-preserve:hook:defaultchatscreen-terminal-completion-sound',
            'bg-preserve:hook:defaultchatscreen-cancel-server-orchestration',
            'bg-preserve:hook:defaultchatscreen-blank-message-a11y-button',
            'bg-preserve:hook:defaultchatscreen-sticker-a11y-button',
            'bg-preserve:hook:defaultchatscreen-composer-orchestrating-gate',
            'bg-preserve:hook:defaultchatscreen-reroll-blocking-call',
            'bg-preserve:hook:defaultchatscreen-sendchatmain-nobgorch-arg',
            'bg-preserve:hook:defaultchatscreen-forward-nobgorch',
        ]
        : []
    const prefix = `${id}:`
    const marker = (name) =>
        `POCKETRISU-PATCH:kei-chat-render:${adapter}:${name}`

    return {
        id,
        title,
        version: '0.1.0',
        userSelectable: false,
        requires: bgPreserve
            ? ['kei-chat-render-core', 'bg-preserve']
            : ['kei-chat-render-core'],
        conflicts: bgPreserve
            ? ['kei-chat-render-base-adapter']
            : ['bg-preserve', 'kei-chat-render-bg-adapter'],
        autoWhen: bgPreserve
            ? {
                all: ['kei-chat-render-core', 'bg-preserve'],
            }
            : {
                all: ['kei-chat-render-core'],
                none: ['bg-preserve'],
            },
        units: [
            {
                id: `${prefix}chats-imports`,
                file: 'src/lib/ChatScreens/Chats.svelte',
                type: 'replace',
                anchor: `    import { mount, onDestroy, unmount } from 'svelte';
    import Chat from './Chat.svelte';
`,
                managed: `    /* ${marker('chats-imports')} */
    import { mount, onDestroy, unmount, type ComponentProps } from 'svelte';
    import Chat from './Chat.svelte';
    import { getChatRenderIdentity } from './keiChatRender';
`,
                markerNeedle: marker('chats-imports'),
                anchorPolicy: 'first',
                requires: ['kei-chat-render-core:identity'],
            },
            {
                id: `${prefix}chats-generation-prop`,
                file: 'src/lib/ChatScreens/Chats.svelte',
                type: 'replace',
                anchor: `        userIconPortrait,
        hasNewUnreadMessage = $bindable(false)
`,
                managed: `        userIconPortrait,
        /* ${marker('chats-generation-prop')} */
        generationActive = false,
        hasNewUnreadMessage = $bindable(false)
`,
                markerNeedle: marker('chats-generation-prop'),
                anchorPolicy: 'first',
                requires: [`${prefix}chats-imports`],
            },
            {
                id: `${prefix}chats-generation-prop-type`,
                file: 'src/lib/ChatScreens/Chats.svelte',
                type: 'replace',
                anchor: `        userIconPortrait?: boolean
        hasNewUnreadMessage?: boolean
`,
                managed: `        userIconPortrait?: boolean
        /* ${marker('chats-generation-prop-type')} */
        generationActive?: boolean
        hasNewUnreadMessage?: boolean
`,
                markerNeedle: marker('chats-generation-prop-type'),
                anchorPolicy: 'first',
                requires: [`${prefix}chats-generation-prop`],
            },
            {
                id: `${prefix}chats-mount-entry`,
                file: 'src/lib/ChatScreens/Chats.svelte',
                type: 'replace',
                anchor: `    let mountInstances: Map<number, {}> = new Map();
`,
                managed: `    /* ${marker('chats-mount-entry')} */
    type ChatMountProps = ComponentProps<typeof Chat>
    type ChatMountEntry = {
        inst: {}
        props: ChatMountProps
    }
    let mountInstances: Map<number, ChatMountEntry> = new Map();
`,
                markerNeedle: marker('chats-mount-entry'),
                anchorPolicy: 'first',
                requires: [`${prefix}chats-generation-prop-type`],
            },
            {
                id: `${prefix}chats-render-identity`,
                file: 'src/lib/ChatScreens/Chats.svelte',
                type: 'replace',
                anchor: `            const message = messages[i];
            const messageLargePortrait = message.role === 'user' ? (userIconPortrait ?? false) : ((currentCharacter as character).largePortrait ?? false);
            const reloadPointer = reloadPointerMap[i] ?? 0;
            const isRerollTarget = i === lastRealCharIdx;
            let hashd = message.data + (message.chatId ?? '') + i.toString() + messageLargePortrait.toString() + message.disabled?.toString() + reloadPointer.toString() + (message.swipeId ?? 0).toString() + (message.swipes?.length ?? 0).toString() + isRerollTarget.toString();
            const currentHash = hashCode(hashd);
`,
                managed: `            /* ${marker('chats-render-identity')}:START */
            const message = messages[i];
            const messageLargePortrait = message.role === 'user' ? (userIconPortrait ?? false) : ((currentCharacter as character).largePortrait ?? false);
            const reloadPointer = reloadPointerMap[i] ?? 0;
            const isRerollTarget = i === lastRealCharIdx;
            const renderIdentity = getChatRenderIdentity({
                message: message.data,
                chatId: message.chatId,
                index: i,
                largePortrait: messageLargePortrait,
                disabled: message.disabled,
                reloadPointer,
                swipeId: message.swipeId ?? 0,
                swipeCount: message.swipes?.length ?? 0,
                isRerollTarget,
                model: message.generationInfo?.model,
                role: message.role,
                chatStreaming: currentCharacter.chats?.[currentCharacter.chatPage]?.isStreaming === true,
                generationActive,
                isLastMessage: i === messages.length - 1,
            })
            const isStreamingMessage = renderIdentity.streaming
            const currentHash = hashCode(renderIdentity.identity);
            /* ${marker('chats-render-identity')}:END */
`,
                markerNeedle: `${marker('chats-render-identity')}:START`,
                anchorPolicy: 'first',
                requires: [`${prefix}chats-mount-entry`],
            },
            {
                id: `${prefix}chats-reactive-mount`,
                file: 'src/lib/ChatScreens/Chats.svelte',
                type: 'replace',
                anchor: `                const swipes = message.swipes;
                const swipeId = message.swipeId ?? 0;
                const inst = mount(Chat, {
                    target: b,
                    props: {
                        message: message.data,
                        isLastMemory: false,
                        idx: i,
                        totalLength: messages.length,
                        img: message.role === 'user' ? userImage : charImage,
                        onReroll: onReroll,
                        onNextSwipe: i === lastRealCharIdx ? onNextSwipe : () => {},
                        unReroll: unReroll,
                        onDeleteSwipe: i === lastRealCharIdx ? onDeleteSwipe : () => {},
                        rerollIcon: i === lastRealCharIdx ? 'force' : false,
                        character: simpleChar,
                        largePortrait: message.role === 'user' ? (userIconPortrait ?? false) : ((currentCharacter as character).largePortrait ?? false),
                        messageGenerationInfo: message.generationInfo,
                        role: message.role,
                        name: message.role === 'user' ? currentUsername : currentCharacter.name,
                        isComment: message.isComment ?? false,
                        disabled: message.disabled ?? false,
                        ...(i === lastRealCharIdx ? {
                            currentPage: (swipeId ?? 0) + 1,
                            totalPages: swipes?.length ?? 1,
                        } : {}),
                    },

                })
                mountInstances.set(currentHash, inst);
`,
                managed: `                /* ${marker('chats-reactive-mount')}:START */
                const swipes = message.swipes;
                const swipeId = message.swipeId ?? 0;
                const props = $state<ChatMountProps>({
                    message: message.data,
                    isLastMemory: false,
                    idx: i,
                    totalLength: messages.length,
                    img: message.role === 'user' ? userImage : charImage,
                    onReroll: onReroll,
                    onNextSwipe: i === lastRealCharIdx ? onNextSwipe : () => {},
                    unReroll: unReroll,
                    onDeleteSwipe: i === lastRealCharIdx ? onDeleteSwipe : () => {},
                    rerollIcon: i === lastRealCharIdx ? 'force' : false,
                    isStreamingDisplay: isStreamingMessage,
                    character: simpleChar,
                    largePortrait: messageLargePortrait,
                    messageGenerationInfo: message.generationInfo,
                    role: message.role,
                    name: message.role === 'user' ? currentUsername : currentCharacter.name,
                    isComment: message.isComment ?? false,
                    disabled: message.disabled ?? false,
                    ...(i === lastRealCharIdx ? {
                        currentPage: (swipeId ?? 0) + 1,
                        totalPages: swipes?.length ?? 1,
                    } : {}),
                })
                const inst = mount(Chat, {
                    target: b,
                    props,
                })
                mountInstances.set(currentHash, { inst, props });
                /* ${marker('chats-reactive-mount')}:END */
`,
                markerNeedle: `${marker('chats-reactive-mount')}:START`,
                anchorPolicy: 'first',
                requires: [`${prefix}chats-render-identity`],
            },
            {
                id: `${prefix}chats-reactive-update`,
                file: 'src/lib/ChatScreens/Chats.svelte',
                type: 'replace',
                anchor: `            }
            nextHash = currentHash;
`,
                managed: `            }
            else{
                /* ${marker('chats-reactive-update')} */
                const entry = mountInstances.get(currentHash)
                if(entry){
                    if(entry.props.message !== message.data){
                        entry.props.message = message.data
                    }
                    if(entry.props.isStreamingDisplay !== isStreamingMessage){
                        entry.props.isStreamingDisplay = isStreamingMessage
                    }
                    if(entry.props.messageGenerationInfo !== message.generationInfo){
                        entry.props.messageGenerationInfo = message.generationInfo
                    }
                }
            }
            nextHash = currentHash;
`,
                markerNeedle: marker('chats-reactive-update'),
                anchorPolicy: 'first',
                requires: [`${prefix}chats-reactive-mount`],
            },
            {
                id: `${prefix}chats-reactive-remove`,
                file: 'src/lib/ChatScreens/Chats.svelte',
                type: 'replace',
                anchor: `            const inst = mountInstances.get(hash);
            if(inst){
                unmount(inst);
                mountInstances.delete(hash);
            }
`,
                managed: `            /* ${marker('chats-reactive-remove')} */
            const entry = mountInstances.get(hash);
            if(entry){
                unmount(entry.inst);
                mountInstances.delete(hash);
            }
`,
                markerNeedle: marker('chats-reactive-remove'),
                anchorPolicy: 'first',
                requires: [`${prefix}chats-reactive-update`],
            },
            {
                id: `${prefix}chats-reactive-destroy`,
                file: 'src/lib/ChatScreens/Chats.svelte',
                type: 'replace',
                anchor: `        mountInstances.forEach((inst) => {
            unmount(inst);
        });
`,
                managed: `        /* ${marker('chats-reactive-destroy')} */
        mountInstances.forEach((entry) => {
            unmount(entry.inst);
        });
`,
                markerNeedle: marker('chats-reactive-destroy'),
                anchorPolicy: 'first',
                requires: [`${prefix}chats-reactive-remove`],
            },
            {
                id: `${prefix}default-chat-generation-state`,
                file: 'src/lib/ChatScreens/DefaultChatScreen.svelte',
                type: 'replace',
                anchor: `                messages={currentChat}
                loadPages={loadPages}
`,
                managed: `                messages={currentChat}
                loadPages={loadPages}
                generationActive={$doingChat}
`,
                markerNeedle: '                generationActive={$doingChat}\n',
                anchorPolicy: 'first',
                requires: [`${prefix}chats-generation-prop-type`],
                after: defaultChatAfter,
            },
            {
                id: `${prefix}chat-import`,
                file: 'src/lib/ChatScreens/Chat.svelte',
                type: 'replace',
                anchor: `    import ChatBody from './ChatBody.svelte'
`,
                managed: `    import ChatBody from './ChatBody.svelte'
    /* ${marker('chat-import')} */
    import { getChatBodyReloadPointer } from './keiChatRender'
`,
                markerNeedle: marker('chat-import'),
                anchorPolicy: 'first',
                requires: ['kei-chat-render-core:identity'],
                after: chatAfter,
            },
            {
                id: `${prefix}chat-streaming-prop`,
                file: 'src/lib/ChatScreens/Chat.svelte',
                type: 'replace',
                anchor: `        totalPages?: number;
        isComment?: boolean;
`,
                managed: `        totalPages?: number;
        /* ${marker('chat-streaming-prop')} */
        isStreamingDisplay?: boolean;
        isComment?: boolean;
`,
                markerNeedle: marker('chat-streaming-prop'),
                anchorPolicy: 'first',
                requires: [`${prefix}chat-import`],
                after: chatAfter,
            },
            {
                id: `${prefix}chat-streaming-default`,
                file: 'src/lib/ChatScreens/Chat.svelte',
                type: 'replace',
                anchor: `        totalPages = 1,
        isComment = false,
`,
                managed: `        totalPages = 1,
        /* ${marker('chat-streaming-default')} */
        isStreamingDisplay = false,
        isComment = false,
`,
                markerNeedle: marker('chat-streaming-default'),
                anchorPolicy: 'first',
                requires: [`${prefix}chat-streaming-prop`],
                after: chatAfter,
            },
            {
                id: `${prefix}chat-reload-key`,
                file: 'src/lib/ChatScreens/Chat.svelte',
                type: 'replace',
                anchor: `        {@const chatReloadPointer = $ReloadGUIPointer + ($ReloadChatPointer[idx] ?? 0)}
`,
                managed: `        <!-- ${marker('chat-reload-key')}:START -->
        <!-- Streaming content reaches the mounted ChatBody through its reactive prop.
             Ignore only the per-message reload pointer while streaming so chunk updates
             do not reset the browser scroll anchor; global GUI reloads remain active. -->
        {@const chatReloadPointer = getChatBodyReloadPointer(
            $ReloadGUIPointer,
            $ReloadChatPointer[idx] ?? 0,
            isStreamingDisplay,
        )}
        <!-- ${marker('chat-reload-key')}:END -->
`,
                markerNeedle: `${marker('chat-reload-key')}:START`,
                anchorPolicy: 'first',
                requires: [`${prefix}chat-streaming-default`],
                after: chatAfter,
            },
            {
                id: `${prefix}chat-body-streaming-prop`,
                file: 'src/lib/ChatScreens/Chat.svelte',
                type: 'replace',
                anchor: `                    {bodyRoot}
                    modelShortName={
`,
                managed: `                    {bodyRoot}
                    {isStreamingDisplay}
                    modelShortName={
`,
                markerNeedle: '                    {isStreamingDisplay}\n',
                anchorPolicy: 'first',
                requires: [`${prefix}chat-reload-key`],
                after: chatAfter,
            },
            {
                id: `${prefix}chatbody-streaming-prop`,
                file: 'src/lib/ChatScreens/ChatBody.svelte',
                type: 'replace',
                anchor: `        bodyRoot?: HTMLElement|null
        modelShortName: string
`,
                managed: `        bodyRoot?: HTMLElement|null
        modelShortName: string
        /* ${marker('chatbody-streaming-prop')} */
        isStreamingDisplay?: boolean
`,
                markerNeedle: marker('chatbody-streaming-prop'),
                anchorPolicy: 'first',
            },
            {
                id: `${prefix}chatbody-streaming-default`,
                file: 'src/lib/ChatScreens/ChatBody.svelte',
                type: 'replace',
                anchor: `        bodyRoot,
        modelShortName = '',
`,
                managed: `        bodyRoot,
        modelShortName = '',
        /* ${marker('chatbody-streaming-default')} */
        isStreamingDisplay = false,
`,
                markerNeedle: marker('chatbody-streaming-default'),
                anchorPolicy: 'first',
                requires: [`${prefix}chatbody-streaming-prop`],
            },
            {
                id: `${prefix}chatbody-capture-streaming`,
                file: 'src/lib/ChatScreens/ChatBody.svelte',
                type: 'replace',
                anchor: `        translated;
        retranslate;
        let lastParsedQueue = ''
`,
                managed: `        translated;
        retranslate;
        /* ${marker('chatbody-capture-streaming')} */
        const streamingDisplay = isStreamingDisplay
        let lastParsedQueue = ''
`,
                markerNeedle: marker('chatbody-capture-streaming'),
                anchorPolicy: 'first',
                requires: [`${prefix}chatbody-streaming-default`],
            },
            {
                id: `${prefix}chatbody-defer-auto-translation`,
                file: 'src/lib/ChatScreens/ChatBody.svelte',
                type: 'replace',
                anchor: `                    if(DBState.db.autoTranslate){
`,
                managed: `                    /* ${marker('chatbody-defer-auto-translation')} */
                    if(!streamingDisplay && DBState.db.autoTranslate){
`,
                markerNeedle: marker('chatbody-defer-auto-translation'),
                anchorPolicy: 'first',
                requires: [`${prefix}chatbody-capture-streaming`],
            },
            {
                id: `${prefix}chatbody-translation-gate`,
                file: 'src/lib/ChatScreens/ChatBody.svelte',
                type: 'replace',
                anchor: `            if(retranslate || translated){
`,
                managed: `            /* ${marker('chatbody-translation-gate')} */
            if(!streamingDisplay && (retranslate || translated)){
`,
                markerNeedle: marker('chatbody-translation-gate'),
                anchorPolicy: 'first',
                requires: [`${prefix}chatbody-defer-auto-translation`],
            },
        ],
    }
}

module.exports = {
    createChatRenderAdapterManifest,
}
