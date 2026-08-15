#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const {
    evaluateC0EvidenceBundle,
    requiredExitCode,
} = require('../src/c0-evidence.cjs')

function parseArgs(argv) {
    const values = argv.slice(2)
    const options = { allowSynthetic: false }
    for (let index = 0; index < values.length; index += 1) {
        const value = values[index]
        if (value === '--allow-synthetic-known-answer') {
            options.allowSynthetic = true
            continue
        }
        if (!['--bundle', '--global-receipt'].includes(value) || index + 1 >= values.length) {
            throw new Error('Usage: verify-c0-evidence.cjs --bundle BUNDLE.json --global-receipt RECEIPT.json [--allow-synthetic-known-answer]')
        }
        const key = value === '--bundle' ? 'bundle' : 'globalReceipt'
        if (options[key]) throw new Error(`Duplicate argument: ${value}`)
        options[key] = path.resolve(values[index + 1])
        index += 1
    }
    if (!options.bundle || !options.globalReceipt) {
        throw new Error('Both --bundle and --global-receipt are required')
    }
    return options
}

function main(argv = process.argv) {
    const options = parseArgs(argv)
    const bundle = JSON.parse(fs.readFileSync(options.bundle, 'utf8'))
    const globalReceipt = JSON.parse(fs.readFileSync(options.globalReceipt, 'utf8'))
    const evaluation = evaluateC0EvidenceBundle(bundle, { globalReceipt })
    process.stdout.write(`${JSON.stringify({
        bundle: options.bundle,
        globalReceipt: options.globalReceipt,
        runKind: bundle.runKind ?? null,
        disposition: bundle.disposition ?? null,
        ...evaluation,
    })}\n`)
    process.exitCode = requiredExitCode(evaluation, { allowSynthetic: options.allowSynthetic })
    return evaluation
}

if (require.main === module) {
    try {
        main()
    } catch (error) {
        console.error(error.stack || error.message)
        process.exitCode = 1
    }
}

module.exports = { main, parseArgs }
