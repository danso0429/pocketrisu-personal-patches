#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { verifyFreshIsolatedComponent } = require('../src/fresh-shadow-verifier.cjs')

function parseArgs(argv) {
    let capabilityReceipt = null
    let output = null
    for (let index = 2; index < argv.length; index += 1) {
        if (argv[index] === '--capability-receipt') capabilityReceipt = argv[++index]
        else if (argv[index] === '--output') output = argv[++index]
        else throw new Error(`Unknown argument: ${argv[index]}`)
    }
    if (!capabilityReceipt || !output) {
        throw new Error('Usage: build-fresh-shadow-audit.cjs --capability-receipt FILE --output FILE')
    }
    return { capabilityReceipt: path.resolve(capabilityReceipt), output: path.resolve(output) }
}

function main(argv = process.argv) {
    const options = parseArgs(argv)
    const phase2 = JSON.parse(fs.readFileSync(options.capabilityReceipt, 'utf8'))
    if (phase2.schema !== 'patch-capability-audit-receipt-v1' || phase2.status !== 'passed') {
        throw new Error('Phase 3A requires a passed Phase 2 capability receipt')
    }
    const graph = phase2.resolvedSelection.graph
    if (graph.components.length !== 1) throw new Error('Current-catalog shadow audit requires one component')
    const receipt = verifyFreshIsolatedComponent({
        sourceRoot: path.resolve(__dirname, '..'),
        targetRoot: path.resolve(__dirname, '..'),
        catalog: [],
        contract: phase2.resolvedSelection.contract,
        graph,
        componentId: graph.components[0].id,
        boundaryClasses: [],
    })
    fs.mkdirSync(path.dirname(options.output), { recursive: true })
    const handle = fs.openSync(options.output, 'wx', 0o600)
    try {
        fs.writeFileSync(handle, `${JSON.stringify(receipt, null, 2)}\n`)
    } finally {
        fs.closeSync(handle)
    }
    process.stdout.write(`${JSON.stringify({
        schema: receipt.schema,
        status: receipt.status,
        output: options.output,
        receiptSha256: receipt.receiptSha256,
        canonicalExecutionSkipped: receipt.canonicalProtection.canonicalExecutionSkipped,
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
