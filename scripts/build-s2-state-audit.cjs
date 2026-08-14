#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { loadCatalog, resolveProfile } = require('../src/catalog.cjs')
const { planTransition } = require('../src/manager.cjs')
const { createS2Snapshot, publishS2Snapshot } = require('../src/s2-state.cjs')
const { pathIsInside } = require('../src/verification-evidence.cjs')

function parseArgs(argv) {
    const options = { capabilityReceipt: null, targetRoot: null, outputRoot: null, profile: 'all' }
    for (let index = 2; index < argv.length; index += 1) {
        if (argv[index] === '--capability-receipt') options.capabilityReceipt = argv[++index]
        else if (argv[index] === '--target-root') options.targetRoot = argv[++index]
        else if (argv[index] === '--output-root') options.outputRoot = argv[++index]
        else if (argv[index] === '--profile') options.profile = argv[++index]
        else throw new Error(`Unknown argument: ${argv[index]}`)
    }
    if (!options.capabilityReceipt || !options.targetRoot || !options.outputRoot) {
        throw new Error('Usage: build-s2-state-audit.cjs --capability-receipt FILE --target-root DIR --output-root DIR')
    }
    return {
        ...options,
        capabilityReceipt: path.resolve(options.capabilityReceipt),
        targetRoot: fs.realpathSync(path.resolve(options.targetRoot)),
        outputRoot: path.resolve(options.outputRoot),
    }
}

function main(argv = process.argv) {
    const options = parseArgs(argv)
    const sourceRoot = path.resolve(__dirname, '..')
    if (pathIsInside(options.outputRoot, sourceRoot) || pathIsInside(options.outputRoot, options.targetRoot)) {
        throw new Error('S2 isolated output must be outside source and target roots')
    }
    const phase2 = JSON.parse(fs.readFileSync(options.capabilityReceipt, 'utf8'))
    if (phase2.schema !== 'patch-capability-audit-receipt-v1' || phase2.status !== 'passed') {
        throw new Error('Phase 5 requires a passed Phase 2 capability receipt')
    }
    const catalog = loadCatalog(sourceRoot)
    const profile = resolveProfile(options.profile, catalog)
    const transition = planTransition({
        root: options.targetRoot, catalog, packIds: profile.defaults, profile: profile.id,
    })
    if (transition.state === null) throw new Error('S2 audit requires a non-empty prospective state')
    const snapshot = createS2Snapshot({
        globalState: transition.state,
        graph: phase2.resolvedSelection.graph,
    })
    publishS2Snapshot(options.outputRoot, snapshot)
    process.stdout.write(`${JSON.stringify({
        schema: snapshot.schema,
        status: 'passed',
        outputRoot: options.outputRoot,
        componentCount: snapshot.records.length,
        merkleRoot: snapshot.registry.merkleRoot,
        registrySha256: snapshot.registry.registrySha256,
        snapshotSha256: snapshot.snapshotSha256,
        productionMigrationActivated: snapshot.canonicalProtection.productionMigrationActivated,
    })}\n`)
    return snapshot
}

if (require.main === module) {
    try {
        main()
    } catch (error) {
        process.stderr.write(`${JSON.stringify({ code: error.code ?? null, message: error.message })}\n`)
        process.exitCode = 1
    }
}

module.exports = { main, parseArgs }
