#!/usr/bin/env node
'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { loadCatalog } = require('../src/catalog.cjs')
const {
    assertTargetReviewable,
    assertTargetVerified,
    evaluateTargetCompatibility,
} = require('../src/compatibility.cjs')
const {
    DEFAULT_STATE_PATH,
    applyTransition,
    planTransition,
    status,
} = require('../src/manager.cjs')

function parseArgs(argv) {
    let root = null
    let json = false
    let allowReviewing = false
    for (let index = 2; index < argv.length; index += 1) {
        if (argv[index] === '--root') root = argv[++index]
        else if (argv[index] === '--json') json = true
        else if (argv[index] === '--allow-reviewing') allowReviewing = true
        else throw new Error(`Unknown argument: ${argv[index]}`)
    }
    if (!root) {
        throw new Error(
            'Usage: verify-all-combinations.cjs --root PRISTINE_POCKETRISU '
            + '[--allow-reviewing] [--json]',
        )
    }
    return { root: path.resolve(root), json, allowReviewing }
}

function fingerprint(root, relative) {
    const absolute = path.join(root, relative)
    let stat
    try {
        stat = fs.lstatSync(absolute)
    } catch (error) {
        if (error.code === 'ENOENT') return null
        throw error
    }
    if (!stat.isFile()) {
        throw new Error(`Managed baseline path is not a regular file: ${relative}`)
    }
    return {
        sha256: crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex'),
        mode: stat.mode & 0o7777,
    }
}

function snapshot(root, paths) {
    return Object.fromEntries(paths.map((relative) => [
        relative,
        fingerprint(root, relative),
    ]))
}

function sameSnapshot(left, right) {
    return JSON.stringify(left) === JSON.stringify(right)
}

function main(argv = process.argv) {
    const options = parseArgs(argv)
    const pkg = JSON.parse(fs.readFileSync(path.join(options.root, 'package.json'), 'utf8'))
    if (pkg.name !== 'pocketrisu') {
        throw new Error('Combination target is not a PocketRisu source root')
    }
    if (fs.existsSync(path.join(options.root, DEFAULT_STATE_PATH))) {
        throw new Error('Combination target already has applied patch state')
    }

    const repositoryRoot = path.resolve(__dirname, '..')
    const catalog = loadCatalog(repositoryRoot)
    const compatibility = evaluateTargetCompatibility(options.root, catalog)
    if (options.allowReviewing) assertTargetReviewable(compatibility)
    else assertTargetVerified(compatibility)
    const visible = catalog
        .filter((pack) => pack.userSelectable !== false)
        .map((pack) => pack.id)
        .sort()
    const managedPaths = [...new Set(
        catalog.flatMap((pack) => pack.units.map((unit) => unit.file)),
    )].sort()
    const baseline = snapshot(options.root, managedPaths)
    const graphs = new Set()
    let maximumResolvedUnits = 0

    for (let mask = 0; mask < 2 ** visible.length; mask += 1) {
        const selected = visible.filter((_, index) => mask & (2 ** index))
        try {
            const transition = planTransition({
                root: options.root,
                catalog,
                packIds: selected,
                profile: 'combination-test',
            })
            graphs.add(transition.resolution.resolvedIds.join(','))
            maximumResolvedUnits = Math.max(
                maximumResolvedUnits,
                transition.order.length,
            )
            applyTransition({ root: options.root, transition })

            const current = status({ root: options.root })
            const expectedStatus = selected.length === 0 ? 'clean' : 'current'
            if (current.status !== expectedStatus) {
                throw new Error(
                    `Expected ${expectedStatus} status, observed ${current.status}`,
                )
            }

            const repeated = planTransition({
                root: options.root,
                catalog,
                packIds: selected,
                profile: 'combination-test',
            })
            if (repeated.changes.length > 0) {
                throw new Error(
                    `Repeated plan changed: ${repeated.changes
                        .map((change) => change.path)
                        .join(', ')}`,
                )
            }

            const reverted = planTransition({
                root: options.root,
                catalog,
                packIds: [],
                profile: 'combination-test',
            })
            applyTransition({ root: options.root, transition: reverted })
            if (!sameSnapshot(snapshot(options.root, managedPaths), baseline)) {
                throw new Error('Managed byte/mode snapshot differs after revert')
            }
        } catch (error) {
            error.selection = selected
            throw error
        }
    }

    const result = {
        target: {
            packageName: pkg.name,
            packageVersion: pkg.version ?? null,
        },
        compatibility: compatibility.status,
        visiblePacks: visible,
        rawSelections: 2 ** visible.length,
        normalizedGraphs: graphs.size,
        managedPaths: managedPaths.length,
        maximumResolvedUnits,
        roundTrips: 'passed',
    }
    if (options.json) console.log(JSON.stringify(result, null, 2))
    else console.log(
        `${result.rawSelections} selections / ${result.normalizedGraphs} graphs passed`,
    )
    return result
}

if (require.main === module) {
    try {
        main()
    } catch (error) {
        console.error(`[combination-check] ${error.message}`)
        if (error.code) console.error(`[${error.code}]`)
        if (error.selection) console.error(`[selection] ${error.selection.join(',') || '(none)'}`)
        process.exitCode = 1
    }
}

module.exports = { main }
