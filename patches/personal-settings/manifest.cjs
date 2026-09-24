'use strict'

const coreUnits = require('./core/units.cjs')
const importNavigationUnits = require('./settings/import-navigation/units.cjs')
const appearanceUnits = require('./settings/appearance/units.cjs')
const searchUnits = require('./settings/search/units.cjs')
const editorUnits = require('./settings/appearance/editor-units.cjs')

module.exports = {
    id: 'personal-settings',
    title: 'Personal settings',
    version: '0.5.3',
    targets: {
        pocketrisu: {
            verified: ['1.8.1', '1.9.0', '1.10.0'],
            reviewing: [],
        },
    },
    userSelectable: true,
    units: [
        ...coreUnits,
        ...importNavigationUnits,
        ...appearanceUnits,
        ...searchUnits,
        ...editorUnits,
    ],
}
