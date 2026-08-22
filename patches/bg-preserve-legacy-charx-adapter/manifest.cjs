'use strict'

const fs = require('node:fs')
const path = require('node:path')

const source = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'bg-preserve.json'),
    'utf8',
))
const unitId = 'bg-preserve:hook:processzip-asset-save-aggregate-cause'
const unit = source.units.find((candidate) => candidate.id === unitId)
if (!unit) throw new Error(`Missing ${unitId} in bg-preserve source bundle`)

module.exports = {
    id: 'bg-preserve-legacy-charx-adapter',
    title: 'Background preservation legacy CharX error adapter',
    version: '0.1.0',
    targets: {
        pocketrisu: {
            verified: ['1.8.1', '1.9.0'],
            reviewing: ['1.10.0'],
        },
    },
    userSelectable: false,
    autoWhen: {
        all: ['bg-preserve'],
        none: ['charx-archive-integrity'],
    },
    units: [unit],
}
