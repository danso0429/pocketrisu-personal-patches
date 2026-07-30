'use strict'

const coreUnits = require('./core/units.cjs')
const importNavigationUnits = require('./settings/import-navigation/units.cjs')

module.exports = {
    id: 'personal-settings',
    title: 'Personal settings',
    version: '0.1.1',
    userSelectable: true,
    presetDefaults: ['features'],
    units: [
        ...coreUnits,
        ...importNavigationUnits,
    ],
}
