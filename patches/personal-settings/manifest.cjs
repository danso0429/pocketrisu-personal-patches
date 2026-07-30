'use strict'

const fs = require('node:fs')
const path = require('node:path')

function owned(relative) {
    return fs.readFileSync(path.join(__dirname, 'files', relative), 'utf8')
}

function managedTypeScript(id, content) {
    const body = content.endsWith('\n') ? content : `${content}\n`
    return `/* POCKETRISU-PATCH:${id}:START */\n${body}/* POCKETRISU-PATCH:${id}:END */\n`
}

module.exports = {
    id: 'personal-settings',
    title: 'Personal settings',
    version: '0.1.0',
    userSelectable: true,
    presetDefaults: ['features'],
    units: [
        {
            id: 'personal-settings:logic',
            file: 'src/ts/personalSettings.ts',
            type: 'owned',
            content: owned('src/ts/personalSettings.ts'),
        },
        {
            id: 'personal-settings:logic-tests',
            file: 'src/ts/personalSettings.test.ts',
            type: 'owned',
            content: owned('src/ts/personalSettings.test.ts'),
            requires: ['personal-settings:logic'],
        },
        {
            id: 'personal-settings:page',
            file: 'src/lib/Setting/Pages/PersonalSettings.svelte',
            type: 'owned',
            content: owned('src/lib/Setting/Pages/PersonalSettings.svelte'),
            requires: ['personal-settings:logic'],
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
        {
            id: 'personal-settings:local-import-helper',
            file: 'src/ts/characters.ts',
            type: 'insert',
            where: 'after',
            anchor: 'import { importCharacterPackage } from "./characterPackage";\n',
            content: 'import { shouldStayOnCurrentCharacterAfterImport } from "./personalSettings";\n',
            requires: ['personal-settings:logic'],
        },
        {
            id: 'personal-settings:local-import-navigation',
            file: 'src/ts/characters.ts',
            type: 'replace',
            anchor: `    let db = getDatabase()
    if(db.characters[db.characters.length-1]){
        changeChar(db.characters.length-1)
    }
`,
            managed: managedTypeScript('personal-settings:local-import-navigation', `    let db = getDatabase()
    const importedCharacter = r === 'importCharacter' || r === 'importPackage'
    if(
        db.characters[db.characters.length-1]
        && (!importedCharacter || !shouldStayOnCurrentCharacterAfterImport(db))
    ){
        changeChar(db.characters.length-1)
    }
`),
            markerNeedle: 'POCKETRISU-PATCH:personal-settings:local-import-navigation:START',
            requires: ['personal-settings:local-import-helper'],
        },
        {
            id: 'personal-settings:realm-import-helper',
            file: 'src/ts/characterCards.ts',
            type: 'insert',
            where: 'after',
            anchor: 'import { exportModuleLegacy, readModule, type RisuModule } from "./process/modules"\n',
            content: 'import { shouldStayOnCurrentCharacterAfterImport } from "./personalSettings"\n',
            requires: ['personal-settings:logic'],
            after: ['character-import-ux:character-cards'],
        },
        {
            id: 'personal-settings:realm-import-navigation-with-keys',
            file: 'src/ts/characterCards.ts',
            type: 'replace',
            anchor: '            if(db.characters[db.characters.length-1] && (db.goCharacterOnImport || arg.forceRedirect)){\n',
            managed: managedTypeScript('personal-settings:realm-import-navigation-with-keys', `            if(
                db.characters[db.characters.length-1]
                && !shouldStayOnCurrentCharacterAfterImport(db)
                && (db.goCharacterOnImport || arg.forceRedirect)
            ){
`),
            markerNeedle: 'POCKETRISU-PATCH:personal-settings:realm-import-navigation-with-keys:START',
            requires: ['personal-settings:realm-import-helper'],
        },
        {
            id: 'personal-settings:realm-import-navigation',
            file: 'src/ts/characterCards.ts',
            type: 'replace',
            anchor: '        if(db.characters[db.characters.length-1] && (db.goCharacterOnImport || arg.forceRedirect)){\n',
            managed: managedTypeScript('personal-settings:realm-import-navigation', `        if(
            db.characters[db.characters.length-1]
            && !shouldStayOnCurrentCharacterAfterImport(db)
            && (db.goCharacterOnImport || arg.forceRedirect)
        ){
`),
            markerNeedle: 'POCKETRISU-PATCH:personal-settings:realm-import-navigation:START',
            requires: ['personal-settings:realm-import-navigation-with-keys'],
        },
    ],
}
