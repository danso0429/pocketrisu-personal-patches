#!/usr/bin/env node
'use strict'

const path = require('node:path')
const { runFreshLocalShadow } = require('../src/toolchain-shadow-local.cjs')
const { writeJsonAtomic } = require('../src/verification-evidence.cjs')

function parseArgs(argv) {
    const options = { disposition: null, targetProvenance: null }
    const values = argv.slice(2)
    for (let index = 0; index < values.length; index += 1) {
        const value = values[index]
        if (value === '--dry-run') options.disposition = 'dry-run'
        else if (value === '--qualification-v2') options.disposition = 'qualification-v2'
        else if (value === '--material-shadow') options.disposition = 'material-shadow'
        else {
            const mapped = {
                '--root': 'root', '--target': 'target', '--receipt': 'receipt',
                '--target-provenance': 'targetProvenance',
            }[value]
            if (!mapped || index + 1 >= values.length) throw new Error(`Unknown or incomplete option: ${value}`)
            options[mapped] = values[++index]
        }
    }
    for (const key of ['root', 'target', 'receipt', 'disposition']) {
        if (!options[key]) throw new Error(`Missing ${key}`)
    }
    return options
}

async function main(argv = process.argv) {
    const options = parseArgs(argv)
    const receipt = await runFreshLocalShadow({
        sourceRoot: path.resolve(options.root),
        targetRoot: path.resolve(options.target),
        targetProvenance: options.targetProvenance,
        disposition: options.disposition,
    })
    writeJsonAtomic(path.resolve(options.receipt), receipt)
    process.stdout.write(`${JSON.stringify({
        receipt: path.resolve(options.receipt),
        status: receipt.status,
        disposition: receipt.disposition,
        coverage: receipt.coverage,
        productionClassification: receipt.candidate.productionClass,
    })}\n`)
    return receipt
}

if (require.main === module) main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ code: error.code ?? null, message: error.message, details: error.details ?? null })}\n`)
    process.exitCode = 1
})

module.exports = { main, parseArgs }
