'use strict'

const {
    managedTypeScript,
    owned,
} = require('../../manifest-helpers.cjs')

module.exports = [
    {
        id: 'personal-settings:import-navigation-logic',
        file: 'src/ts/personalSettings/importNavigation.ts',
        type: 'owned',
        content: owned(__dirname, 'src/ts/personalSettings/importNavigation.ts'),
        requires: ['personal-settings:storage'],
    },
    {
        id: 'personal-settings:import-navigation-logic-tests',
        file: 'src/ts/personalSettings/importNavigation.test.ts',
        type: 'owned',
        content: owned(__dirname, 'src/ts/personalSettings/importNavigation.test.ts'),
        requires: ['personal-settings:import-navigation-logic'],
    },
    {
        id: 'personal-settings:import-navigation-section',
        file: 'src/lib/Setting/Pages/PersonalSettings/ImportNavigationSetting.svelte',
        type: 'owned',
        content: owned(
            __dirname,
            'src/lib/Setting/Pages/PersonalSettings/ImportNavigationSetting.svelte',
        ),
        requires: ['personal-settings:import-navigation-logic'],
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
]
