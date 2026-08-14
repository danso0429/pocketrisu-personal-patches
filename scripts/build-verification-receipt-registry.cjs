#!/usr/bin/env node
'use strict'

const path = require('node:path')
const { writeJsonAtomic } = require('../src/verification-evidence.cjs')
const { buildReceiptRegistry } = require('../src/verification-receipts.cjs')

function parseArgs(argv) {
    const outputIndex = argv.indexOf('--output')
    if (outputIndex !== 2 || !argv[3] || argv.length < 5) {
        throw new Error(
            'Usage: build-verification-receipt-registry.cjs '
            + '--output REGISTRY.json RECEIPT.json...',
        )
    }
    return {
        output: path.resolve(argv[3]),
        receipts: argv.slice(4).map((file) => path.resolve(file)),
    }
}

function main(argv = process.argv) {
    const options = parseArgs(argv)
    const registry = buildReceiptRegistry(options.receipts)
    writeJsonAtomic(options.output, registry)
    process.stdout.write(`${JSON.stringify({
        registry: options.output,
        receipts: registry.entries.length,
        counts: registry.counts,
        integrity: registry.integrity,
    })}\n`)
    return registry
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
