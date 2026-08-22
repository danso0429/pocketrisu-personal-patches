'use strict'

const pocketRisu181 = { pocketrisu: ['1.8.1'] }
const pocketRisu190 = { pocketrisu: ['1.9.0', '1.10.0'] }

function createPartialEditAdapterManifest({
    id,
    title,
    adapter,
    bgPreserve,
}) {
    const prefix = `${id}:`
    const marker = (name) =>
        `POCKETRISU-PATCH:kei-partial-edit:${adapter}:${name}`
    const chatRenderAdapter = `kei-chat-render-${adapter}-adapter`
    const rootAfter = [
        `${chatRenderAdapter}:chat-body-streaming-prop`,
        ...(bgPreserve
            ? [
            'bg-preserve:hook:chat-standard-risu-control-touch-events',
            'bg-preserve:hook:chat-themed-risu-control-touch-events',
            ]
            : []),
    ]

    const standardRootAnchor = bgPreserve
        ? `<!-- NodeOnly Standard: 전용 외부 구조 -->
<!-- BG-PRESERVE:START risu-control-touch-standard -->
<div class="flex max-w-full justify-center risu-chat"
     data-chat-index={idx}
     data-chat-id={DBState.db.characters?.[selIdState.selId]?.chats?.[DBState.db.characters?.[selIdState.selId]?.chatPage]?.message?.[idx]?.chatId ?? ''}
`
        : `<!-- NodeOnly Standard: 전용 외부 구조 -->
<div class="flex max-w-full justify-center risu-chat"
     data-chat-index={idx}
     data-chat-id={DBState.db.characters?.[selIdState.selId]?.chats?.[DBState.db.characters?.[selIdState.selId]?.chatPage]?.message?.[idx]?.chatId ?? ''}
`
    const standardRootManaged = bgPreserve
        ? `<!-- NodeOnly Standard: 전용 외부 구조 -->
<!-- BG-PRESERVE:START risu-control-touch-standard -->
<!-- ${marker('chat-standard-root')} -->
<div class="flex max-w-full justify-center risu-chat"
     bind:this={partialEditRoot}
     data-chat-index={idx}
     data-chat-id={DBState.db.characters?.[selIdState.selId]?.chats?.[DBState.db.characters?.[selIdState.selId]?.chatPage]?.message?.[idx]?.chatId ?? ''}
     data-partial-edit-disabled={editMode || editTranslationMode || translating || retranslate || isStreamingDisplay || (translated && DBState.db.translatorType !== 'llm')}
     data-partial-edit-translated={translated && DBState.db.translatorType === 'llm'}
`
        : `<!-- NodeOnly Standard: 전용 외부 구조 -->
<!-- ${marker('chat-standard-root')} -->
<div class="flex max-w-full justify-center risu-chat"
     bind:this={partialEditRoot}
     data-chat-index={idx}
     data-chat-id={DBState.db.characters?.[selIdState.selId]?.chats?.[DBState.db.characters?.[selIdState.selId]?.chatPage]?.message?.[idx]?.chatId ?? ''}
     data-partial-edit-disabled={editMode || editTranslationMode || translating || retranslate || isStreamingDisplay || (translated && DBState.db.translatorType !== 'llm')}
     data-partial-edit-translated={translated && DBState.db.translatorType === 'llm'}
`
    const themedRootAnchor = bgPreserve
        ? `<!-- 기존 테마: 공유 외부 구조 -->
<!-- BG-PRESERVE:START risu-control-touch-themed -->
<div class="flex max-w-full justify-center risu-chat"
     data-chat-index={idx}
     data-chat-id={DBState.db.characters?.[selIdState.selId]?.chats?.[DBState.db.characters?.[selIdState.selId]?.chatPage]?.message?.[idx]?.chatId ?? ''}
`
        : `<!-- 기존 테마: 공유 외부 구조 -->
<div class="flex max-w-full justify-center risu-chat"
     data-chat-index={idx}
     data-chat-id={DBState.db.characters?.[selIdState.selId]?.chats?.[DBState.db.characters?.[selIdState.selId]?.chatPage]?.message?.[idx]?.chatId ?? ''}
`
    const themedRootManaged = bgPreserve
        ? `<!-- 기존 테마: 공유 외부 구조 -->
<!-- BG-PRESERVE:START risu-control-touch-themed -->
<!-- ${marker('chat-themed-root')} -->
<div class="flex max-w-full justify-center risu-chat"
     bind:this={partialEditRoot}
     data-chat-index={idx}
     data-chat-id={DBState.db.characters?.[selIdState.selId]?.chats?.[DBState.db.characters?.[selIdState.selId]?.chatPage]?.message?.[idx]?.chatId ?? ''}
     data-partial-edit-disabled={editMode || editTranslationMode || translating || retranslate || isStreamingDisplay || (translated && DBState.db.translatorType !== 'llm')}
     data-partial-edit-translated={translated && DBState.db.translatorType === 'llm'}
`
        : `<!-- 기존 테마: 공유 외부 구조 -->
<!-- ${marker('chat-themed-root')} -->
<div class="flex max-w-full justify-center risu-chat"
     bind:this={partialEditRoot}
     data-chat-index={idx}
     data-chat-id={DBState.db.characters?.[selIdState.selId]?.chats?.[DBState.db.characters?.[selIdState.selId]?.chatPage]?.message?.[idx]?.chatId ?? ''}
     data-partial-edit-disabled={editMode || editTranslationMode || translating || retranslate || isStreamingDisplay || (translated && DBState.db.translatorType !== 'llm')}
     data-partial-edit-translated={translated && DBState.db.translatorType === 'llm'}
`

    const units181 = [
            {
                id: `${prefix}default-chat-import`,
                file: 'src/lib/ChatScreens/DefaultChatScreen.svelte',
                type: 'replace',
                anchor: `    import Chats from './Chats.svelte';
`,
                managed: `    import Chats from './Chats.svelte';
    /* ${marker('default-chat-import')} */
    import PartialEditManager from './PartialEditManager.svelte';
`,
                markerNeedle: marker('default-chat-import'),
                anchorPolicy: 'first',
                requires: ['kei-partial-edit-core:manager'],
            },
            {
                id: `${prefix}default-chat-root-state`,
                file: 'src/lib/ChatScreens/DefaultChatScreen.svelte',
                type: 'replace',
                anchor: `    let chatsInstance: any = $state()
    let isScrollingToMessage = $state(false)
`,
                managed: `    let chatsInstance: any = $state()
    /* ${marker('default-chat-root-state')} */
    let chatScreenRoot: HTMLDivElement | null = $state(null)
    let isScrollingToMessage = $state(false)
`,
                markerNeedle: marker('default-chat-root-state'),
                anchorPolicy: 'first',
                requires: [`${prefix}default-chat-import`],
            },
            {
                id: `${prefix}default-chat-root-binding`,
                file: 'src/lib/ChatScreens/DefaultChatScreen.svelte',
                type: 'replace',
                anchor: `        <div class="h-full w-full flex flex-col-reverse overflow-y-auto relative default-chat-screen"
            class:nodeonly-standard={DBState.db.theme === ''}
`,
                managed: `        <!-- ${marker('default-chat-root-binding')} -->
        <div class="h-full w-full flex flex-col-reverse overflow-y-auto relative default-chat-screen"
            bind:this={chatScreenRoot}
            class:nodeonly-standard={DBState.db.theme === ''}
`,
                markerNeedle: marker('default-chat-root-binding'),
                anchorPolicy: 'first',
                requires: [`${prefix}default-chat-root-state`],
            },
            {
                id: `${prefix}default-chat-manager`,
                file: 'src/lib/ChatScreens/DefaultChatScreen.svelte',
                type: 'replace',
                anchor: `            <Chats
                bind:this={chatsInstance}
`,
                managed: `            <!-- ${marker('default-chat-manager')}:START -->
            {#if chatScreenRoot && (DBState.db.enableBlockPartialEdit || DBState.db.enableDragPartialEdit)}
                <PartialEditManager
                    screenRoot={chatScreenRoot}
                    messages={currentChat}
                    characterIndex={$selectedCharID}
                    chatPage={currentCharacter.chatPage}
                    chatId={currentChatSlot?.id ?? null}
                    blockEditEnabled={DBState.db.enableBlockPartialEdit}
                    dragEditEnabled={DBState.db.enableDragPartialEdit}
                />
            {/if}
            <!-- ${marker('default-chat-manager')}:END -->

            <Chats
                bind:this={chatsInstance}
`,
                markerNeedle: `${marker('default-chat-manager')}:START`,
                anchorPolicy: 'first',
                requires: [
                    `${prefix}default-chat-root-binding`,
                    `${chatRenderAdapter}:default-chat-generation-state`,
                ],
            },
            {
                id: `${prefix}chat-remove-controller-import`,
                file: 'src/lib/ChatScreens/Chat.svelte',
                type: 'replace',
                anchor: `    import PartialEditController from './PartialEditController.svelte';
`,
                managed: `    /* ${marker('chat-remove-controller-import')} */
    import {
        commitPartialEditTranslationCache,
        partialEditTranslationSaveMatchesIssue,
        samePartialEditMessageIdentity,
        type IssuedPartialEditTranslation,
        type PartialEditMessageIdentity,
        type PartialEditTranslationContext,
        type PartialEditTranslationSaveRequest,
    } from './keiPartialEditIdentity'
`,
                markerNeedle: marker('chat-remove-controller-import'),
                anchorPolicy: 'first',
                requires: ['kei-partial-edit-core:identity'],
            },
            {
                id: `${prefix}chat-root-state`,
                file: 'src/lib/ChatScreens/Chat.svelte',
                type: 'replace',
                anchor: `    let bodyRoot:HTMLElement|null = $state(null)
`,
                managed: `    let bodyRoot:HTMLElement|null = $state(null)
    /* ${marker('chat-root-state')} */
    let partialEditRoot: HTMLDivElement | null = $state(null)
`,
                markerNeedle: marker('chat-root-state'),
                anchorPolicy: 'first',
                requires: [`${prefix}chat-remove-controller-import`],
                after: [`${chatRenderAdapter}:chat-streaming-default`],
            },
            {
                id: `${prefix}chat-remove-controller-state`,
                file: 'src/lib/ChatScreens/Chat.svelte',
                type: 'replace',
                anchor: `    let partialEditEnabled = $state(true)
`,
                managed: `    /* ${marker('chat-remove-controller-state')} */
`,
                markerNeedle: marker('chat-remove-controller-state'),
                anchorPolicy: 'first',
                requires: [`${prefix}chat-root-state`],
            },
            {
                id: `${prefix}chat-remove-controller-save`,
                file: 'src/lib/ChatScreens/Chat.svelte',
                type: 'replace',
                anchor: `    function handlePartialEditSave(e: CustomEvent<{ newData: string }>) {
        if (idx >= 0) {
            message = e.detail.newData
            const msg = DBState.db.characters[selIdState.selId].chats[DBState.db.characters[selIdState.selId].chatPage].message[idx]
            msg.data = e.detail.newData
            if (msg.swipes && msg.swipeId !== undefined) {
                msg.swipes[msg.swipeId] = e.detail.newData
            }
            displaya(e.detail.newData)
        }
    }
`,
                managed: `    /* ${marker('chat-remove-controller-save')} */
`,
                markerNeedle: marker('chat-remove-controller-save'),
                anchorPolicy: 'first',
                requires: [`${prefix}chat-remove-controller-state`],
            },
            {
                id: `${prefix}chat-translation-bridge`,
                file: 'src/lib/ChatScreens/Chat.svelte',
                type: 'insert',
                where: 'after',
                anchor: `    async function saveTranslationEdit() {
        const key = await getTranslationCacheKey()
        await setLLMCache(key, editTranslationText)
        editTranslationMode = false
    }
`,
                content: `    let issuedPartialEditTranslation: IssuedPartialEditTranslation | null = null

    function currentPartialEditIdentity(): PartialEditMessageIdentity | null {
        if (idx < 0) return null
        const character = DBState.db.characters[selIdState.selId]
        const chat = character?.chats?.[character.chatPage]
        const messageRef = chat?.message?.[idx]
        if (!chat || !messageRef || messageRef.data !== message) return null
        return {
            chatRef: chat as object,
            messageRef: messageRef as object,
            messageIndex: idx,
            messageId: messageRef.chatId ?? null,
            messageData: messageRef.data,
        }
    }

    function partialEditTranslationAvailable() {
        return translated
            && DBState.db.translatorType === 'llm'
            && !editMode
            && !editTranslationMode
            && !translating
            && !retranslate
            && !isStreamingDisplay
    }

    function issuedTranslationIsCurrent(issued: IssuedPartialEditTranslation) {
        if (issuedPartialEditTranslation !== issued || !partialEditTranslationAvailable()) {
            return false
        }
        if (
            !partialEditRoot
            || partialEditRoot.dataset.chatIndex !== String(issued.messageIndex)
            || (partialEditRoot.dataset.chatId || null) !== issued.messageId
            || partialEditRoot.dataset.partialEditTranslated !== 'true'
            || partialEditRoot.dataset.partialEditDisabled === 'true'
        ) {
            return false
        }
        return samePartialEditMessageIdentity(currentPartialEditIdentity(), issued)
    }

    async function getTranslationPartialEditContext(): Promise<PartialEditTranslationContext | null> {
        if (!partialEditTranslationAvailable()) return null
        const identity = currentPartialEditIdentity()
        if (!identity) return null
        const key = await getTranslationCacheKey()
        if (
            !partialEditTranslationAvailable()
            || !samePartialEditMessageIdentity(currentPartialEditIdentity(), identity)
        ) {
            return null
        }
        const data = await getLLMCache(key)
        if (data === null || !partialEditTranslationAvailable()) return null
        if (!samePartialEditMessageIdentity(currentPartialEditIdentity(), identity)) {
            return null
        }
        const issued: IssuedPartialEditTranslation = {
            ...identity,
            token: {},
            key,
            data,
        }
        issuedPartialEditTranslation = issued
        return {
            token: issued.token,
            key: issued.key,
            data: issued.data,
        }
    }

    function handlePartialEditTranslationContext(event: Event) {
        const detail = (event as CustomEvent<{
            respond: (context: Promise<PartialEditTranslationContext | null>) => void
        }>).detail
        if (typeof detail?.respond !== 'function') return
        detail.respond(getTranslationPartialEditContext())
    }

    function handlePartialEditTranslationSave(event: Event) {
        const detail = (event as CustomEvent<PartialEditTranslationSaveRequest & {
            respond: (result: Promise<boolean>) => void
        }>).detail
        if (typeof detail?.respond !== 'function') return
        detail.respond((async () => {
            const issued = issuedPartialEditTranslation
            if (
                !issued
                || !partialEditTranslationSaveMatchesIssue(
                    issued,
                    detail,
                    currentPartialEditIdentity(),
                )
                || !issuedTranslationIsCurrent(issued)
            ) {
                return false
            }

            const currentKey = await getTranslationCacheKey()
            if (currentKey !== issued.key || !issuedTranslationIsCurrent(issued)) return false
            const currentData = await getLLMCache(issued.key)
            if (currentData !== issued.data || !issuedTranslationIsCurrent(issued)) return false

            issuedPartialEditTranslation = null
            const saved = await commitPartialEditTranslationCache(
                setLLMCache,
                issued.key,
                detail.data,
                issued.data,
            )
            if (!saved) return false
            if (
                partialEditTranslationAvailable()
                && samePartialEditMessageIdentity(currentPartialEditIdentity(), issued)
            ) {
                ReloadChatPointer.update((value) => ({
                    ...value,
                    [issued.messageIndex]: (value[issued.messageIndex] ?? 0) + 1,
                }))
            }
            return true
        })())
    }

    $effect(() => {
        const identity = [
            idx,
            message,
            translated,
            editMode,
            editTranslationMode,
            translating,
            retranslate,
            isStreamingDisplay,
            partialEditRoot,
        ] as const
        void identity
        issuedPartialEditTranslation = null
    })

    $effect(() => {
        const root = partialEditRoot
        if (
            !root
            || (!DBState.db.enableBlockPartialEdit && !DBState.db.enableDragPartialEdit)
        ) return
        root.addEventListener(
            'risu-partial-edit-translation-context',
            handlePartialEditTranslationContext,
        )
        root.addEventListener(
            'risu-partial-edit-translation-save',
            handlePartialEditTranslationSave,
        )
        return () => {
            root.removeEventListener(
                'risu-partial-edit-translation-context',
                handlePartialEditTranslationContext,
            )
            root.removeEventListener(
                'risu-partial-edit-translation-save',
                handlePartialEditTranslationSave,
            )
            issuedPartialEditTranslation = null
        }
    })
`,
                anchorPolicy: 'first',
                requires: [`${prefix}chat-root-state`],
            },
            {
                id: `${prefix}chat-remove-controller`,
                file: 'src/lib/ChatScreens/Chat.svelte',
                type: 'replace',
                anchor: `            {#if idx >= 0 && !editMode && partialEditEnabled && (DBState.db.enableBlockPartialEdit || DBState.db.enableDragPartialEdit)}
                <PartialEditController
                    messageData={message}
                    chatIndex={idx}
                    {bodyRoot}
                    blockEditEnabled={DBState.db.enableBlockPartialEdit}
                    dragEditEnabled={DBState.db.enableDragPartialEdit}
                    on:save={handlePartialEditSave}
                />
            {/if}
`,
                managed: `            <!-- ${marker('chat-controller-component-removal')} -->
`,
                markerNeedle: marker('chat-controller-component-removal'),
                anchorPolicy: 'first',
                requires: [
                    `${prefix}chat-remove-controller-save`,
                    `${prefix}chat-translation-bridge`,
                ],
                after: [`${chatRenderAdapter}:chat-body-streaming-prop`],
            },
            {
                id: `${prefix}chat-standard-root`,
                file: 'src/lib/ChatScreens/Chat.svelte',
                type: 'replace',
                anchor: standardRootAnchor,
                managed: standardRootManaged,
                markerNeedle: marker('chat-standard-root'),
                anchorPolicy: 'first',
                requires: [`${prefix}chat-remove-controller`],
                after: rootAfter,
            },
            {
                id: `${prefix}chat-themed-root`,
                file: 'src/lib/ChatScreens/Chat.svelte',
                type: 'replace',
                anchor: themedRootAnchor,
                managed: themedRootManaged,
                markerNeedle: marker('chat-themed-root'),
                anchorPolicy: 'first',
                requires: [`${prefix}chat-standard-root`],
                after: rootAfter,
            },
            {
                id: `${prefix}lang-en-match-confidence`,
                file: 'src/lang/en.ts',
                type: 'replace',
                anchor: `        editModalTitle: "Partial Edit",
`,
                managed: `        editModalTitle: "Partial Edit",
        /* ${marker('lang-en-match-confidence')} */
        matchConfidence: (confidence: number) => \`Match confidence \${confidence}%\`,
        saveFailedMessage: "The translated partial edit could not be saved. Keep a copy of your edit, reopen partial edit, and try again.",
`,
                markerNeedle: marker('lang-en-match-confidence'),
                anchorPolicy: 'first',
            },
            {
                id: `${prefix}lang-ko-match-confidence`,
                file: 'src/lang/ko.ts',
                type: 'replace',
                anchor: `    editModalTitle: "부분 수정",
`,
                managed: `    editModalTitle: "부분 수정",
    /* ${marker('lang-ko-match-confidence')} */
    matchConfidence: (confidence: number) => \`매칭 신뢰도 \${confidence}%\`,
    saveFailedMessage: "번역 부분 수정을 저장하지 못했습니다. 수정 내용을 복사해 둔 뒤 부분 수정을 다시 열어 시도하세요.",
`,
                markerNeedle: marker('lang-ko-match-confidence'),
                anchorPolicy: 'first',
                requires: [`${prefix}lang-en-match-confidence`],
            },
        ]

    const bySuffix = (suffix) => units181.find((unit) =>
        unit.id === `${prefix}${suffix}`
    )
    const defaultChatRootBinding190 = {
        ...bySuffix('default-chat-root-binding'),
        anchor: `        <div class="h-full w-full flex flex-col-reverse overflow-y-auto overscroll-y-contain relative default-chat-screen"
            class:nodeonly-standard={DBState.db.theme === ''}
`,
        managed: `        <!-- ${marker('default-chat-root-binding')} -->
        <div class="h-full w-full flex flex-col-reverse overflow-y-auto overscroll-y-contain relative default-chat-screen"
            bind:this={chatScreenRoot}
            class:nodeonly-standard={DBState.db.theme === ''}
`,
    }
    const chatTranslationBridge190 = {
        ...bySuffix('chat-translation-bridge'),
        content: bySuffix('chat-translation-bridge').content.replaceAll(
            'isStreamingDisplay',
            'isOptimizedStreamingMessage',
        ),
    }
    const chatRemoveController190 = {
        ...bySuffix('chat-remove-controller'),
        anchor: `            {#if idx >= 0 && !editMode && !isOptimizedStreamingMessage && partialEditEnabled && (DBState.db.enableBlockPartialEdit || DBState.db.enableDragPartialEdit)}
                <PartialEditController
                    messageData={message}
                    chatIndex={idx}
                    {bodyRoot}
                    blockEditEnabled={DBState.db.enableBlockPartialEdit}
                    dragEditEnabled={DBState.db.enableDragPartialEdit}
                    on:save={handlePartialEditSave}
                />
            {/if}
`,
    }
    const chatStandardRoot190 = {
        ...bySuffix('chat-standard-root'),
        managed: bySuffix('chat-standard-root').managed.replaceAll(
            'isStreamingDisplay',
            'isOptimizedStreamingMessage',
        ),
    }
    const chatThemedRoot190 = {
        ...bySuffix('chat-themed-root'),
        managed: bySuffix('chat-themed-root').managed.replaceAll(
            'isStreamingDisplay',
            'isOptimizedStreamingMessage',
        ),
    }
    const replacements190 = new Map([
        [`${prefix}default-chat-root-binding`, defaultChatRootBinding190],
        [`${prefix}chat-translation-bridge`, chatTranslationBridge190],
        [`${prefix}chat-remove-controller`, chatRemoveController190],
        [`${prefix}chat-standard-root`, chatStandardRoot190],
        [`${prefix}chat-themed-root`, chatThemedRoot190],
    ])
    const units190Source = units181.map((unit) =>
        replacements190.get(unit.id) ?? unit
    )
    const units190Ids = new Set(units190Source.map((unit) => unit.id))
    const target190Dependency = (dependency) => {
        if (units190Ids.has(dependency)) return `${dependency}:1.9`
        if (dependency === `${chatRenderAdapter}:chat-streaming-default`) {
            return `${chatRenderAdapter}:chat-reactive-metadata:1.9`
        }
        if (
            dependency === `${chatRenderAdapter}:default-chat-generation-state`
            || dependency === `${chatRenderAdapter}:chat-body-streaming-prop`
        ) return `${dependency}:1.9`
        return dependency
    }
    const units190 = units190Source.map((unit) => ({
        ...unit,
        id: `${unit.id}:1.9`,
        requires: unit.requires?.map(target190Dependency),
        after: unit.after?.map(target190Dependency),
        targetVersions: pocketRisu190,
    }))

    return {
        id,
        title,
        version: '0.2.1',
        userSelectable: false,
        targets: {
            pocketrisu: {
                verified: ['1.8.1', '1.9.0'],
            reviewing: ['1.10.0'],
            },
        },
        requires: bgPreserve
            ? [
                'kei-partial-edit-core',
                'kei-chat-render-bg-adapter',
                'bg-preserve',
            ]
            : [
                'kei-partial-edit-core',
                'kei-chat-render-base-adapter',
            ],
        conflicts: bgPreserve
            ? ['kei-partial-edit-base-adapter']
            : ['bg-preserve', 'kei-partial-edit-bg-adapter'],
        autoWhen: bgPreserve
            ? {
                all: ['kei-partial-edit-core', 'bg-preserve'],
            }
            : {
                all: ['kei-partial-edit-core'],
                none: ['bg-preserve'],
            },
        units: [
            ...units181.map((unit) => ({
                ...unit,
                targetVersions: pocketRisu181,
            })),
            ...units190,
        ],
    }
}

module.exports = {
    createPartialEditAdapterManifest,
}
