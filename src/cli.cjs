'use strict'

const fs = require('node:fs')
const path = require('node:path')
const {
    DEFAULT_STATE_PATH,
    applyTransition,
    loadState,
    packEtag,
    planTransition,
    restoreJournal,
    status,
} = require('./manager.cjs')
const {
    loadCatalog,
    resolveProfile,
    validateProfileSelection,
    validateProfileTransition,
} = require('./catalog.cjs')

function parseArgs(argv) {
    const options = {
        command: argv[2] ?? 'status',
        root: process.cwd(),
        profile: null,
        packIds: null,
        json: false,
    }
    for (let index = 3; index < argv.length; index += 1) {
        const value = argv[index]
        if (value === '--root') options.root = argv[++index]
        else if (value === '--profile') options.profile = argv[++index]
        else if (value === '--packs') {
            options.packIds = argv[++index].split(',').map((id) => id.trim()).filter(Boolean)
        }
        else if (value === '--json') options.json = true
        else throw new Error(`Unknown argument: ${value}`)
    }
    return options
}

function assertPocketRisuRoot(root) {
    const packagePath = path.join(root, 'package.json')
    if (!fs.existsSync(packagePath)) throw new Error(`No package.json under ${root}`)
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
    if (pkg.name !== 'pocketrisu') {
        throw new Error(`Target is not a PocketRisu root: ${root}`)
    }
}

function print(value, json) {
    if (json) console.log(JSON.stringify(value, null, 2))
    else if (typeof value === 'string') console.log(value)
    else console.log(JSON.stringify(value, null, 2))
}

function summarizeTransition(transition) {
    return {
        profile: transition.profile,
        packs: transition.packs,
        order: transition.order,
        collisions: transition.collisions,
        changedFiles: transition.changes.map((change) => change.path),
        skippedFiles: transition.skippedFiles,
    }
}

async function runCli({
    argv = process.argv,
    catalog = null,
    fixedProfile = null,
    repositoryRoot,
} = {}) {
    const options = parseArgs(argv)
    const profileId = fixedProfile ?? options.profile
    if (!profileId && !['status', 'list'].includes(options.command)) {
        throw new Error('Pass --profile <features|all>')
    }
    if (fixedProfile && options.profile && options.profile !== fixedProfile) {
        throw new Error(`This artifact is fixed to the ${fixedProfile} profile`)
    }

    const loadedCatalog = catalog ?? loadCatalog(repositoryRoot)
    if (options.command === 'list') {
        print(loadedCatalog.map((pack) => ({
            id: pack.id,
            version: pack.version,
            etag: packEtag(pack),
            units: pack.units.length,
        })), options.json)
        return
    }

    assertPocketRisuRoot(options.root)
    const recovered = restoreJournal(options.root)
    if (recovered.recovered) {
        console.error(`[pocketrisu-patches] recovered interrupted transaction ${recovered.transactionId}`)
    }

    if (options.command === 'status') {
        const current = status({ root: options.root })
        const currentEtags = new Map(loadedCatalog.map((pack) => [pack.id, packEtag(pack)]))
        current.packs = current.packs.map((pack) => ({
            ...pack,
            catalogStatus: currentEtags.get(pack.id) === pack.etag ? 'current' : 'update-available',
        }))
        print(current, options.json)
        return
    }

    if (!['plan', 'apply', 'revert'].includes(options.command)) {
        throw new Error('Usage: <plan|apply|revert|status|list> [--root PATH] [--packs a,b] [--json]')
    }

    const profile = resolveProfile(profileId)
    const previous = loadState(options.root, DEFAULT_STATE_PATH)
    validateProfileTransition(profile, previous)
    const packIds = options.command === 'revert'
        ? []
        : (options.packIds ?? profile.defaults)
    if (options.command !== 'revert') validateProfileSelection(profile, packIds)

    const transition = planTransition({
        root: options.root,
        catalog: loadedCatalog,
        packIds,
        profile: profile.id,
    })
    if (options.command === 'plan') {
        print(summarizeTransition(transition), options.json)
        return
    }

    const outcome = applyTransition({ root: options.root, transition })
    print({ ...summarizeTransition(transition), outcome }, options.json)
}

if (require.main === module) {
    runCli().catch((error) => {
        console.error(`[pocketrisu-patches] ${error.message}`)
        if (error.code) console.error(`[${error.code}]`)
        process.exitCode = 1
    })
}

module.exports = { parseArgs, runCli }
