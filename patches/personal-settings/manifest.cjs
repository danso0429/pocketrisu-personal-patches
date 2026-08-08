'use strict'

const coreUnits = require('./core/units.cjs')
const importNavigationUnits = require('./settings/import-navigation/units.cjs')
const appearanceUnits = require('./settings/appearance/units.cjs')
const searchUnits = require('./settings/search/units.cjs')

module.exports = {
    id: 'personal-settings',
    title: 'Personal settings',
    version: '0.3.0',
    targets: {
        pocketrisu: {
            verified: ['1.8.1', '1.9.0'],
            reviewing: [],
        },
    },
    userSelectable: true,
    presetDefaults: ['features'],
    units: [
        ...coreUnits,
        ...importNavigationUnits,
        ...appearanceUnits,
        ...searchUnits,
    ],
}
