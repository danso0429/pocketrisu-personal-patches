'use strict'

// Source-only recovery: restore the earlier UI while retaining the asset
// compatibility hooks required by already imported custom fonts.
const path = require('node:path')
const { loadCatalog, resolveProfile } = require('../src/catalog.cjs')
const { planTransition, applyTransition, status } = require('../src/manager.cjs')

const retained = new Set([
    'personal-settings:editor-asset-references-client',
    'personal-settings:editor-asset-remap',
    'personal-settings:editor-asset-references-server',
])
function compatibilityCatalog(catalog) {
    const ordinaryUnits = catalog.flatMap(pack => pack.units).filter(unit => !unit.id.startsWith('personal-settings:editor-'))
    return catalog.map(pack => pack.id !== 'personal-settings' ? pack : {
        ...pack,
        version: `${pack.version}-compat.1`,
        units: pack.units.filter(unit => !unit.id.startsWith('personal-settings:editor-') || retained.has(unit.id)).map(unit => retained.has(unit.id) ? {
            ...unit,
            after: [...new Set([...(unit.after ?? []), ...ordinaryUnits.filter(owner => owner.file === unit.file).map(owner => owner.id)])],
        } : unit),
    })
}
function rollbackSummary(command, transition, root) {
    return {
        operation: command,
        personalCssUi: 'legacy',
        passiveAssetUnits: [...retained],
        changedFiles: transition.changes.map(change => change.path),
        ...(command === 'apply' ? { status: status({ root }).status } : {}),
    }
}
if (require.main === module) {
    const [command, inputRoot] = process.argv.slice(2)
    if (!['plan', 'apply'].includes(command) || !inputRoot) throw new Error('Usage: node scripts/rollback-personal-css-ui.cjs plan|apply POCKETRISU_ROOT')
    const root = path.resolve(inputRoot)
    const catalog = compatibilityCatalog(loadCatalog())
    const transition = planTransition({ root, catalog, packIds: resolveProfile('all', catalog).defaults, profile: 'all' })
    if (transition.target.packageVersion !== '1.10.0') throw new Error('Compatibility rollback is qualified only on exact PocketRisu 1.10.0')
    if (command === 'apply') applyTransition({ root, transition })
    console.log(JSON.stringify(rollbackSummary(command, transition, root), null, 2))
}
module.exports = { compatibilityCatalog, rollbackSummary }
