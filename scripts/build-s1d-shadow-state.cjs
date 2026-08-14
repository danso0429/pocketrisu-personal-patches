#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { loadCatalog, resolveProfile } = require('../src/catalog.cjs')
const { planTransition } = require('../src/manager.cjs')
const { compileS1DShadowState } = require('../src/s1d-shadow-state.cjs')
const {
    assertOutputOutsideInputs,
    canonicalOutputPath,
    writeJsonAtomic,
} = require('../src/verification-evidence.cjs')

function parseArgs(argv) {
    const options = { capabilityReceipt: null, targetRoot: null, output: null, profile: 'all' }
    for (let index = 2; index < argv.length; index += 1) {
        if (argv[index] === '--capability-receipt') options.capabilityReceipt = argv[++index]
        else if (argv[index] === '--target-root') options.targetRoot = argv[++index]
        else if (argv[index] === '--output') options.output = argv[++index]
        else if (argv[index] === '--profile') options.profile = argv[++index]
        else throw new Error(`Unknown argument: ${argv[index]}`)
    }
    if (!options.capabilityReceipt || !options.targetRoot || !options.output) {
        throw new Error('Usage: build-s1d-shadow-state.cjs --capability-receipt FILE --target-root DIR --output FILE [--profile all]')
    }
    return {
        ...options,
        capabilityReceipt: path.resolve(options.capabilityReceipt),
        targetRoot: fs.realpathSync(path.resolve(options.targetRoot)),
        output: canonicalOutputPath(options.output),
    }
}

function main(argv = process.argv) {
    const options = parseArgs(argv)
    const sourceRoot = path.resolve(__dirname, '..')
    assertOutputOutsideInputs(options.output, [sourceRoot, options.targetRoot])
    const phase2 = JSON.parse(fs.readFileSync(options.capabilityReceipt, 'utf8'))
    if (phase2.schema !== 'patch-capability-audit-receipt-v1' || phase2.status !== 'passed') {
        throw new Error('Phase 4 requires a passed Phase 2 capability receipt')
    }
    const catalog = loadCatalog(sourceRoot)
    const profile = resolveProfile(options.profile, catalog)
    const transition = planTransition({
        root: options.targetRoot,
        catalog,
        packIds: profile.defaults,
        profile: profile.id,
    })
    if (transition.state === null) throw new Error('S1-D audit requires a non-empty prospective state')
    const receipt = compileS1DShadowState({
        globalState: transition.state,
        graph: phase2.resolvedSelection.graph,
    })
    writeJsonAtomic(options.output, receipt)
    process.stdout.write(`${JSON.stringify({
        schema: receipt.schema,
        status: receipt.status,
        output: options.output,
        componentCount: receipt.components.length,
        globalStateSha256: receipt.globalStateSha256,
        receiptSha256: receipt.receiptSha256,
        productionStateWritten: receipt.canonicalProtection.productionStateWritten,
    })}\n`)
    return receipt
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
