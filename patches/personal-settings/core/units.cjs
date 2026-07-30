'use strict'

const { owned } = require('../manifest-helpers.cjs')

module.exports = [
    {
        id: 'personal-settings:storage',
        file: 'src/ts/personalSettings/core.ts',
        type: 'owned',
        content: owned(__dirname, 'src/ts/personalSettings/core.ts'),
    },
    {
        id: 'personal-settings:logic',
        file: 'src/ts/personalSettings.ts',
        type: 'owned',
        content: owned(__dirname, 'src/ts/personalSettings.ts'),
        requires: [
            'personal-settings:storage',
            'personal-settings:import-navigation-logic',
        ],
    },
    {
        id: 'personal-settings:logic-tests',
        file: 'src/ts/personalSettings.test.ts',
        type: 'owned',
        content: owned(__dirname, 'src/ts/personalSettings.test.ts'),
        requires: ['personal-settings:logic'],
    },
    {
        id: 'personal-settings:page',
        file: 'src/lib/Setting/Pages/PersonalSettings.svelte',
        type: 'owned',
        content: owned(__dirname, 'src/lib/Setting/Pages/PersonalSettings.svelte'),
        requires: ['personal-settings:import-navigation-section'],
    },
    {
        id: 'personal-settings:database-type-import',
        file: 'src/ts/storage/database.svelte.ts',
        type: 'insert',
        where: 'after',
        anchor: "import { emptyModelBinding } from '../preset/types';\n",
        content: "import type { PocketRisuPersonalSettings } from '../personalSettings';\n",
        requires: ['personal-settings:logic'],
    },
    {
        id: 'personal-settings:database-field',
        file: 'src/ts/storage/database.svelte.ts',
        type: 'insert',
        where: 'after',
        anchor: '    goCharacterOnImport:boolean\n',
        content: '    pocketRisuPersonalSettings?:PocketRisuPersonalSettings\n',
        requires: ['personal-settings:database-type-import'],
    },
    {
        id: 'personal-settings:settings-page-import',
        file: 'src/lib/Setting/Settings.svelte',
        type: 'insert',
        where: 'after',
        anchor: '    import SystemSettings from "./Pages/SystemSettings.svelte";\n',
        content: '    import PersonalSettings from "./Pages/PersonalSettings.svelte";\n',
        requires: ['personal-settings:page'],
    },
    {
        id: 'personal-settings:settings-menu',
        file: 'src/lib/Setting/Settings.svelte',
        type: 'insert',
        where: 'before',
        anchor: '                    {#if devPanelEnabled}\n',
        managed: `                    <!-- POCKETRISU-PATCH:personal-settings:settings-menu:START -->
                    <button class="flex gap-2 items-center hover:text-textcolor"
                        class:text-textcolor={$SettingsMenuIndex === 24}
                        class:text-textcolor2={$SettingsMenuIndex !== 24}
                        onclick={() => {
                        $SettingsMenuIndex = 24
                    }}>
                        <UserIcon />
                        <span>개인 설정</span>
                    </button>
                    <!-- POCKETRISU-PATCH:personal-settings:settings-menu:END -->
`,
        markerNeedle: 'POCKETRISU-PATCH:personal-settings:settings-menu:START',
        requires: ['personal-settings:settings-page-import'],
    },
    {
        id: 'personal-settings:settings-render',
        file: 'src/lib/Setting/Settings.svelte',
        type: 'insert',
        where: 'before',
        anchor: '                        {:else if $SettingsMenuIndex === 99 && devPanelEnabled}\n',
        managed: `                        <!-- POCKETRISU-PATCH:personal-settings:settings-render:START -->
                        {:else if $SettingsMenuIndex === 24}
                            <PersonalSettings/>
                        <!-- POCKETRISU-PATCH:personal-settings:settings-render:END -->
`,
        markerNeedle: 'POCKETRISU-PATCH:personal-settings:settings-render:START',
        requires: ['personal-settings:settings-menu'],
    },
    {
        id: 'personal-settings:routing',
        file: 'src/ts/routing.ts',
        type: 'insert',
        where: 'after',
        anchor: '    System: 22 as const,\n',
        content: '    Personal: 24 as const,\n',
    },
]
