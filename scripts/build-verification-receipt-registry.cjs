#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { writeJsonAtomic } = require('../src/verification-evidence.cjs')
const { buildReceiptRegistry } = require('../src/verification-receipts.cjs')

function parseArgs(argv) {
    const outputIndex = argv.indexOf('--output')
    if (outputIndex !== 2 || !argv[3] || argv.length < 5) {
        throw new Error(
            'Usage: build-verification-receipt-registry.cjs '
            + '--output REGISTRY.json [--classifications FILE.json] RECEIPT.json...',
        )
    }
    let cursor = 4
    let classifications = null
    if (argv[cursor] === '--classifications') {
        classifications = argv[cursor + 1]
        if (!classifications) throw new Error('--classifications requires a JSON file')
        cursor += 2
    }
    if (cursor >= argv.length) throw new Error('At least one receipt is required')
    return {
        output: path.resolve(argv[3]),
        classifications: classifications === null ? null : path.resolve(classifications),
        receipts: argv.slice(cursor).map((file) => path.resolve(file)),
    }
}

function main(argv = process.argv) {
    const options = parseArgs(argv)
    const dispositionOverrides = options.classifications === null
        ? null
        : JSON.parse(fs.readFileSync(options.classifications, 'utf8'))
    const registry = buildReceiptRegistry(options.receipts, { dispositionOverrides })
    writeJsonAtomic(options.output, registry)
    process.stdout.write(`${JSON.stringify({
        registry: options.output,
        receipts: registry.entries.length,
        counts: registry.counts,
        overrides: registry.dispositionOverrides?.entries.length ?? 0,
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
