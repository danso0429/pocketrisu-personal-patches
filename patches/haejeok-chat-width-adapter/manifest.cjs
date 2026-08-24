'use strict'

const fs = require('node:fs')
const path = require('node:path')

const filesRoot = path.join(__dirname, 'files')
const owned = (relative) => fs.readFileSync(path.join(filesRoot, relative), 'utf8')
const pocketRisu1100 = { pocketrisu: ['1.10.0'] }

const databaseOwners = [
    'bg-preserve:hook:regex-multitype-field',
    'persona-organizer:model-normalization:1.10',
    'persona-organizer:image-gallery-normalization:1.10',
    'persona-organizer:persona-folder-field',
    'persona-organizer:persona-image-gallery-field',
    'persona-organizer:folder-interface',
    'persona-organizer:database-folder-field',
    'personal-settings:database-type-import',
    'personal-settings:database-field',
    'preset-integrity:normalizer:1.9',
    'preset-integrity:load-normalization:1.9',
    'preset-integrity:save-normalization:1.9',
    'preset-integrity:change-guard:1.9',
    'kei-mobile-navigation-base-adapter:database-enable-hotkeys-default:1.9',
    'kei-mobile-navigation-base-adapter:database-mobile-back-default:1.9',
    'kei-mobile-navigation-base-adapter:database-mobile-back-field:1.9',
    'kei-mobile-navigation-base-adapter:database-enable-hotkeys-field:1.9',
    'kei-mobile-navigation-lazy-adapter:database-enable-hotkeys-default:1.9',
    'kei-mobile-navigation-lazy-adapter:database-mobile-back-default:1.9',
    'kei-mobile-navigation-lazy-adapter:database-mobile-back-field:1.9',
    'kei-mobile-navigation-lazy-adapter:database-enable-hotkeys-field:1.9',
    'kei-prompt-role-compat-core:normalizer-export:1.9',
    'kei-prompt-role-compat-core:typed-role-fallback:1.9',
    'kei-text-theme-normalization-core:database-import:1.9',
    'kei-text-theme-normalization-core:database-load:1.9',
    'kei-text-theme-normalization-core:preset-activation:1.9',
]

const chatOwners = [
    'bg-preserve:hook:chat-risu-control-touch-import',
    'bg-preserve:hook:chat-risu-control-touch-bridge',
    'bg-preserve:hook:chat-standard-risu-control-touch-events',
    'bg-preserve:hook:chat-themed-risu-control-touch-events',
    'kei-chat-render-base-adapter:chat-helper-import:1.9',
    'kei-chat-render-base-adapter:chat-reactive-metadata:1.9',
    'kei-chat-render-base-adapter:chat-reload-key:1.9',
    'kei-chat-render-base-adapter:chat-body-streaming-prop:1.9',
    'kei-chat-render-bg-adapter:chat-helper-import:1.9',
    'kei-chat-render-bg-adapter:chat-reactive-metadata:1.9',
    'kei-chat-render-bg-adapter:chat-reload-key:1.9',
    'kei-chat-render-bg-adapter:chat-body-streaming-prop:1.9',
    'kei-partial-edit-base-adapter:chat-remove-controller-import:1.9',
    'kei-partial-edit-base-adapter:chat-root-state:1.9',
    'kei-partial-edit-base-adapter:chat-remove-controller-state:1.9',
    'kei-partial-edit-base-adapter:chat-remove-controller-save:1.9',
    'kei-partial-edit-base-adapter:chat-translation-bridge:1.9',
    'kei-partial-edit-base-adapter:chat-remove-controller:1.9',
    'kei-partial-edit-base-adapter:chat-standard-root:1.9',
    'kei-partial-edit-base-adapter:chat-themed-root:1.9',
    'kei-partial-edit-bg-adapter:chat-remove-controller-import:1.9',
    'kei-partial-edit-bg-adapter:chat-root-state:1.9',
    'kei-partial-edit-bg-adapter:chat-remove-controller-state:1.9',
    'kei-partial-edit-bg-adapter:chat-remove-controller-save:1.9',
    'kei-partial-edit-bg-adapter:chat-translation-bridge:1.9',
    'kei-partial-edit-bg-adapter:chat-remove-controller:1.9',
    'kei-partial-edit-bg-adapter:chat-standard-root:1.9',
    'kei-partial-edit-bg-adapter:chat-themed-root:1.9',
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
    'haejeok-persistence-safety-adapter:chat-helper-import',
    'haejeok-persistence-safety-adapter:chat-durable-save-import',
    'haejeok-persistence-safety-adapter:chat-append-state',
    'haejeok-persistence-safety-adapter:chat-say-nothing-append',
    'haejeok-persistence-safety-adapter:chat-character-append',
    'haejeok-persistence-safety-adapter:chat-group-append',
    'haejeok-persistence-safety-adapter:chat-save-before-generation',
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

const languageOwners = [
    'bg-preserve:hook:language-en-cache-source-badges',
    'bg-preserve:hook:language-ko-cache-source-badges',
    'personal-settings:appearance-language-en-1.9',
    'personal-settings:appearance-language-ko-1.9',
    'kei-mobile-navigation-base-adapter:language-en-hotkey-toggle:1.9',
    'kei-mobile-navigation-base-adapter:language-en-mobile-back:1.9',
    'kei-mobile-navigation-base-adapter:language-ko-hotkey-toggle:1.9',
    'kei-mobile-navigation-base-adapter:language-ko-mobile-back:1.9',
    'kei-mobile-navigation-lazy-adapter:language-en-hotkey-toggle:1.9',
    'kei-mobile-navigation-lazy-adapter:language-en-mobile-back:1.9',
    'kei-mobile-navigation-lazy-adapter:language-ko-hotkey-toggle:1.9',
    'kei-mobile-navigation-lazy-adapter:language-ko-mobile-back:1.9',
    'kei-hypa-tools-base-adapter:lang-en:1.9',
    'kei-hypa-tools-base-adapter:lang-ko:1.9',
    'kei-hypa-tools-bg-adapter:lang-en:1.9',
    'kei-hypa-tools-bg-adapter:lang-ko:1.9',
    'kei-partial-edit-base-adapter:lang-en-match-confidence:1.9',
    'kei-partial-edit-base-adapter:lang-ko-match-confidence:1.9',
    'kei-partial-edit-bg-adapter:lang-en-match-confidence:1.9',
    'kei-partial-edit-bg-adapter:lang-ko-match-confidence:1.9',
    'kei-translation-tools-base-adapter:language-en:1.9',
    'kei-translation-tools-base-adapter:language-ko:1.9',
    'kei-translation-tools-bg-adapter:language-en:1.9',
    'kei-translation-tools-bg-adapter:language-ko:1.9',
]

module.exports = {
    id: 'haejeok-chat-width-adapter',
    title: 'Haejeok Small chat-width adapter',
    version: '0.1.0',
    source: 'Haejeok RisuAI 0243d078 Small width outcome adaptation',
    targets: {
        pocketrisu: {
            // No units apply to these historical targets.
            verified: ['1.8.1', '1.9.0', '1.10.0'],
            reviewing: [],
        },
    },
    userSelectable: false,
    requires: ['personal-settings'],
    autoWhen: {
        all: ['personal-settings'],
    },
    units: [
        {
            id: 'haejeok-chat-width-adapter:helper:1.10',
            file: 'src/ts/haejeokChatWidth.ts',
            type: 'owned',
            content: owned('src/ts/haejeokChatWidth.ts'),
            targetVersions: pocketRisu1100,
        },
        {
            id: 'haejeok-chat-width-adapter:helper-tests:1.10',
            file: 'src/ts/haejeokChatWidth.test.ts',
            type: 'owned',
            content: owned('src/ts/haejeokChatWidth.test.ts'),
            requires: ['haejeok-chat-width-adapter:helper:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'haejeok-chat-width-adapter:database-import:1.10',
            file: 'src/ts/storage/database.svelte.ts',
            type: 'insert',
            where: 'after',
            anchor: `import { normalizeTextTheme } from '../gui/textTheme';\n`,
            content: `import { normalizeNodeOnlyStandardChatWidth, type NodeOnlyStandardChatWidth } from '../haejeokChatWidth';\n`,
            requires: ['haejeok-chat-width-adapter:helper:1.10'],
            after: databaseOwners,
            targetVersions: pocketRisu1100,
        },
        {
            id: 'haejeok-chat-width-adapter:database-normalization:1.10',
            file: 'src/ts/storage/database.svelte.ts',
            type: 'replace',
            anchor: `    if(data.nodeOnlyStandardChatWidth !== 'standard' && data.nodeOnlyStandardChatWidth !== 'wide' && data.nodeOnlyStandardChatWidth !== 'full'){
        data.nodeOnlyStandardChatWidth = 'standard'
    }
`,
            content: `    data.nodeOnlyStandardChatWidth = normalizeNodeOnlyStandardChatWidth(data.nodeOnlyStandardChatWidth)
`,
            requires: ['haejeok-chat-width-adapter:database-import:1.10'],
            after: databaseOwners,
            targetVersions: pocketRisu1100,
        },
        {
            id: 'haejeok-chat-width-adapter:database-field-type:1.10',
            file: 'src/ts/storage/database.svelte.ts',
            type: 'replace',
            anchor: `    theme: string
    nodeOnlyStandardChatWidth: 'standard' | 'wide' | 'full'
`,
            content: `    theme: string
    nodeOnlyStandardChatWidth: NodeOnlyStandardChatWidth
`,
            requires: ['haejeok-chat-width-adapter:database-normalization:1.10'],
            after: databaseOwners,
            targetVersions: pocketRisu1100,
        },
        {
            id: 'haejeok-chat-width-adapter:preset-field-type:1.10',
            file: 'src/ts/storage/database.svelte.ts',
            type: 'replace',
            anchor: `    // Theme tab (submenu 0)
    theme: string
    nodeOnlyStandardChatWidth?: 'standard' | 'wide' | 'full'
`,
            content: `    // Theme tab (submenu 0)
    theme: string
    nodeOnlyStandardChatWidth?: NodeOnlyStandardChatWidth
`,
            requires: ['haejeok-chat-width-adapter:database-field-type:1.10'],
            after: databaseOwners,
            targetVersions: pocketRisu1100,
        },
        {
            id: 'haejeok-chat-width-adapter:setting-option:1.10',
            file: 'src/ts/setting/displaySettingsData.svelte.ts',
            type: 'insert',
            where: 'before',
            anchor: `                { value: 'standard', labelKey: 'chatWidthStandard' },\n`,
            content: `                { value: 'small', labelKey: 'chatWidthSmall' },\n`,
            requires: ['haejeok-chat-width-adapter:database-field-type:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'haejeok-chat-width-adapter:language-en:1.10',
            file: 'src/lang/en.ts',
            type: 'insert',
            where: 'before',
            anchor: `    chatWidthStandard: "Standard",\n`,
            content: `    chatWidthSmall: "Small (600px)",\n`,
            after: languageOwners,
            targetVersions: pocketRisu1100,
        },
        {
            id: 'haejeok-chat-width-adapter:language-ko:1.10',
            file: 'src/lang/ko.ts',
            type: 'insert',
            where: 'before',
            anchor: `  chatWidthStandard: "표준",\n`,
            content: `  chatWidthSmall: "작게 (600px)",\n`,
            requires: ['haejeok-chat-width-adapter:language-en:1.10'],
            after: languageOwners,
            targetVersions: pocketRisu1100,
        },
        {
            id: 'haejeok-chat-width-adapter:language-zh-hant:1.10',
            file: 'src/lang/zh-Hant.ts',
            type: 'insert',
            where: 'before',
            anchor: `    "chatWidthStandard": "標準",\n`,
            content: `    "chatWidthSmall": "窄版 (600px)",\n`,
            requires: ['haejeok-chat-width-adapter:language-ko:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'haejeok-chat-width-adapter:chat-import:1.10',
            file: 'src/lib/ChatScreens/Chat.svelte',
            type: 'insert',
            where: 'after',
            anchor: `    import { getCurrentCharacter, getCurrentChat, setCurrentChat, type MessageGenerationInfo, type StreamingDisplayOptimizationMode } from "../../ts/storage/database.svelte"\n`,
            content: `    import { nodeOnlyStandardChatWidthClass } from "../../ts/haejeokChatWidth"\n`,
            requires: ['haejeok-chat-width-adapter:helper:1.10'],
            after: chatOwners,
            targetVersions: pocketRisu1100,
        },
        {
            id: 'haejeok-chat-width-adapter:chat-class:1.10',
            file: 'src/lib/ChatScreens/Chat.svelte',
            type: 'replace',
            anchor: `            {@const nodeOnlyWidthClass =
                DBState.db.nodeOnlyStandardChatWidth === 'full' ? 'max-w-full' :
                DBState.db.nodeOnlyStandardChatWidth === 'wide' ? 'max-w-6xl' :
                'max-w-3xl'}
`,
            managed: `            <!-- POCKETRISU-PATCH:haejeok-chat-width-adapter:chat-class:1.10 -->
            {@const nodeOnlyWidthClass = nodeOnlyStandardChatWidthClass(DBState.db.nodeOnlyStandardChatWidth)}
`,
            markerNeedle: 'POCKETRISU-PATCH:haejeok-chat-width-adapter:chat-class:1.10',
            requires: ['haejeok-chat-width-adapter:chat-import:1.10'],
            after: chatOwners,
            targetVersions: pocketRisu1100,
        },
        {
            id: 'haejeok-chat-width-adapter:default-chat-import:1.10',
            file: 'src/lib/ChatScreens/DefaultChatScreen.svelte',
            type: 'insert',
            where: 'after',
            anchor: `    import { getAdditionalChatLoadPages, getInitialChatLoadPages } from 'src/ts/chatLoadPages';\n`,
            content: `    import { nodeOnlyStandardChatWidthClass } from 'src/ts/haejeokChatWidth';\n`,
            requires: ['haejeok-chat-width-adapter:helper:1.10'],
            after: defaultChatOwners,
            targetVersions: pocketRisu1100,
        },
        {
            id: 'haejeok-chat-width-adapter:composer-class:1.10',
            file: 'src/lib/ChatScreens/DefaultChatScreen.svelte',
            type: 'replace',
            anchor: `    let composerWidthClass = $derived(
        !isStandardTheme ? '' :
        DBState.db.nodeOnlyStandardChatWidth === 'full' ? 'max-w-full' :
        DBState.db.nodeOnlyStandardChatWidth === 'wide' ? 'max-w-6xl' :
        'max-w-3xl'
    )
`,
            content: `    let composerWidthClass = $derived(
        isStandardTheme
            ? nodeOnlyStandardChatWidthClass(DBState.db.nodeOnlyStandardChatWidth)
            : ''
    )
`,
            requires: ['haejeok-chat-width-adapter:default-chat-import:1.10'],
            after: defaultChatOwners,
            targetVersions: pocketRisu1100,
        },
        {
            id: 'haejeok-chat-width-adapter:default-chat-root-class:1.10',
            file: 'src/lib/ChatScreens/DefaultChatScreen.svelte',
            type: 'replace',
            anchor: `        <!-- POCKETRISU-PATCH:kei-partial-edit:bg:default-chat-root-binding -->
        <div class="h-full w-full flex flex-col-reverse overflow-y-auto overscroll-y-contain relative default-chat-screen"
            bind:this={chatScreenRoot}
            class:nodeonly-standard={DBState.db.theme === ''}
            class:no-chat-width-wide={DBState.db.theme === '' && DBState.db.nodeOnlyStandardChatWidth === 'wide'}
            class:no-chat-width-full={DBState.db.theme === '' && DBState.db.nodeOnlyStandardChatWidth === 'full'}
`,
            managed: `        <!-- POCKETRISU-PATCH:kei-partial-edit:bg:default-chat-root-binding -->
        <!-- POCKETRISU-PATCH:haejeok-chat-width-adapter:default-chat-root-class:1.10 -->
        <div class="h-full w-full flex flex-col-reverse overflow-y-auto overscroll-y-contain relative default-chat-screen"
            bind:this={chatScreenRoot}
            class:nodeonly-standard={DBState.db.theme === ''}
            class:no-chat-width-small={DBState.db.theme === '' && DBState.db.nodeOnlyStandardChatWidth === 'small'}
            class:no-chat-width-wide={DBState.db.theme === '' && DBState.db.nodeOnlyStandardChatWidth === 'wide'}
            class:no-chat-width-full={DBState.db.theme === '' && DBState.db.nodeOnlyStandardChatWidth === 'full'}
`,
            markerNeedle: 'POCKETRISU-PATCH:haejeok-chat-width-adapter:default-chat-root-class:1.10',
            requires: ['haejeok-chat-width-adapter:composer-class:1.10'],
            after: defaultChatOwners,
            targetVersions: pocketRisu1100,
        },
        {
            id: 'haejeok-chat-width-adapter:standard-css:1.10',
            file: 'src/styles/nodeonly-standard.css',
            type: 'insert',
            where: 'after',
            anchor: `.nodeonly-standard.no-chat-width-full { --no-chat-max-width: 100%; }\n`,
            managed: `/* POCKETRISU-PATCH:haejeok-chat-width-adapter:standard-css:1.10:START */
.nodeonly-standard.no-chat-width-small { --no-chat-max-width: 37.5rem; }
.nodeonly-standard .nodeonly-chat-width-small { max-width: 37.5rem; }
/* POCKETRISU-PATCH:haejeok-chat-width-adapter:standard-css:1.10:END */
`,
            markerNeedle: 'POCKETRISU-PATCH:haejeok-chat-width-adapter:standard-css:1.10:START',
            requires: [
                'haejeok-chat-width-adapter:chat-class:1.10',
                'haejeok-chat-width-adapter:default-chat-root-class:1.10',
            ],
            targetVersions: pocketRisu1100,
        },
    ],
}
