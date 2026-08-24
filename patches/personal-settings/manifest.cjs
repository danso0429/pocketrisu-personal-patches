'use strict'

const coreUnits = require('./core/units.cjs')
const importNavigationUnits = require('./settings/import-navigation/units.cjs')
const appearanceUnits = require('./settings/appearance/units.cjs')
const searchUnits = require('./settings/search/units.cjs')

module.exports = {
    id: 'personal-settings',
    title: 'Personal settings',
    version: '0.4.3',
    targets: {
        pocketrisu: {
            verified: ['1.8.1', '1.9.0'],
            reviewing: ['1.10.0'],
        },
    },
    userSelectable: true,
    units: [
        ...coreUnits,
        ...importNavigationUnits,
        ...appearanceUnits,
        ...searchUnits,
    ],
}
