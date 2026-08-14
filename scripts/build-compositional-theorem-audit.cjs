#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { jsonSha256 } = require('../src/capability-contract.cjs')
const {
    REQUIRED_PREMISES,
    verifyCompositionalAdmission,
} = require('../src/compositional-theorem.cjs')

function parseArgs(argv) {
    const options = { capabilityReceipt: null, shadowReceipt: null, output: null }
    for (let index = 2; index < argv.length; index += 1) {
        if (argv[index] === '--capability-receipt') options.capabilityReceipt = argv[++index]
        else if (argv[index] === '--shadow-receipt') options.shadowReceipt = argv[++index]
        else if (argv[index] === '--output') options.output = argv[++index]
        else throw new Error(`Unknown argument: ${argv[index]}`)
    }
    if (!options.capabilityReceipt || !options.shadowReceipt || !options.output) {
        throw new Error('Usage: build-compositional-theorem-audit.cjs --capability-receipt FILE --shadow-receipt FILE --output FILE')
    }
    return Object.fromEntries(Object.entries(options).map(([key, value]) => [key, path.resolve(value)]))
}

function currentPremises() {
    return REQUIRED_PREMISES.map((id) => ({
        id,
        status: 'unverified',
        sourceRepresentation: `phase-3B-current-catalog:${id}`,
        runtimeEnforcement: 'not-admitted-current-catalog-global-fallback',
        evidenceSha256: null,
        independentValidator: `phase-3B-independent:${id}`,
        failureAction: id === 'component-join-split-rules' ? 'broader-component' : 'global-fallback',
    }))
}

function main(argv = process.argv) {
    const options = parseArgs(argv)
    const phase2 = JSON.parse(fs.readFileSync(options.capabilityReceipt, 'utf8'))
    const shadow = JSON.parse(fs.readFileSync(options.shadowReceipt, 'utf8'))
    if (phase2.schema !== 'patch-capability-audit-receipt-v1' || phase2.status !== 'passed') {
        throw new Error('Phase 3B requires a passed Phase 2 capability receipt')
    }
    const contract = phase2.resolvedSelection.contract
    const graph = phase2.resolvedSelection.graph
    const receipt = verifyCompositionalAdmission({
        contract,
        graph,
        premises: currentPremises(),
        boundaryCoverage: [],
        shadowReceipts: [shadow],
    })
    if (receipt.outcome !== 'global-fallback' || graph.fallback.required !== true) {
        throw new Error('Current catalog must remain on Global Exhaustive fallback')
    }
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
        outcome: receipt.outcome,
        output: options.output,
        receiptSha256: receipt.receiptSha256,
        inputsSha256: jsonSha256({
            capabilityReceipt: phase2.payloadSha256,
            shadowReceipt: shadow.receiptSha256,
        }),
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

module.exports = { currentPremises, main, parseArgs }
