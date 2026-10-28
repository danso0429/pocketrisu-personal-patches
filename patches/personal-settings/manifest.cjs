'use strict'

const fs = require('node:fs')
const path = require('node:path')
const coreUnits = require('./core/units.cjs')
const importNavigationUnits = require('./settings/import-navigation/units.cjs')
const appearanceUnits = require('./settings/appearance/units.cjs')
const searchUnits = require('./settings/search/units.cjs')
const editorUnits = require('./settings/appearance/editor-units.cjs')
const externalHeaderUnits = require('./settings/external-headers/units.cjs')

const files116Root = path.join(__dirname, 'files-1.16')
const owned116 = (relative) => fs.readFileSync(path.join(files116Root, relative), 'utf8')

const testUnits = [
    ['personal-settings:persistence-tests:1.16', 'src/ts/personalSettingsPersistence.e2-4.test.ts'],
    ['personal-settings:route-tests:1.16', 'src/ts/personalSettingsRoute.e2-4.test.ts'],
    ['personal-settings:compatibility-tests:1.16', 'src/ts/personalSettingsCompatibility.e2-4.test.ts'],
    ['personal-settings:server-compat-tests:1.16', 'test/compat/personal-settings-server.e2-4.test.ts'],
].map(([id, file]) => ({ id, file, type: 'owned', content: owned116(file) }))

module.exports = {
    id: 'personal-settings',
    title: 'Personal settings',
    version: '0.5.16',
    targets: {
        pocketrisu: {
            verified: [],
            reviewing: ['1.16.1'],
        },
    },
    userSelectable: true,
    units: [
        ...coreUnits,
        ...importNavigationUnits,
        ...appearanceUnits,
        ...searchUnits,
        ...editorUnits,
        ...externalHeaderUnits,
        ...testUnits,
    ],
}
