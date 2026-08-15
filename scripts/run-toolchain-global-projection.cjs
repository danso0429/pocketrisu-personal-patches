#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { runGlobalProjection } = require('../src/toolchain-shadow-global.cjs')
const { writeJsonAtomic } = require('../src/verification-evidence.cjs')

function parseArgs(argv) {
    const options = {}
    for (let index = 2; index < argv.length; index += 1) {
        const key = argv[index]
        if (!['--root', '--target', '--local-receipt', '--receipt', '--target-provenance'].includes(key)
            || index + 1 >= argv.length) throw new Error('Usage: run-toolchain-global-projection.cjs --root REPO --target TARGET --local-receipt LOCAL.json --receipt OUTPUT.json [--target-provenance VALUE]')
        options[key.slice(2).replace('-receipt', 'Receipt').replace('-provenance', 'Provenance')] = argv[++index]
    }
    for (const key of ['root', 'target', 'localReceipt', 'receipt']) {
        if (!options[key]) throw new Error(`Missing --${key}`)
    }
    return options
}

async function main(argv = process.argv) {
    const options = parseArgs(argv)
    const localReceipt = JSON.parse(fs.readFileSync(options.localReceipt, 'utf8'))
    if (localReceipt.disposition === 'material-shadow') {
        const error = new Error('Separate material Global projection is forbidden; use the one-Global combined C0 route')
        error.code = 'SEPARATE_MATERIAL_GLOBAL_PROJECTION_FORBIDDEN'
        throw error
    }
    const receipt = await runGlobalProjection({
        sourceRoot: path.resolve(options.root),
        targetRoot: path.resolve(options.target),
        localReceipt,
        targetProvenance: options.targetProvenance ?? null,
    })
    writeJsonAtomic(path.resolve(options.receipt), receipt)
    process.stdout.write(`${JSON.stringify({ status: receipt.status, receipt: path.resolve(options.receipt), coverage: receipt.coverage })}\n`)
    return receipt
}

if (require.main === module) main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ code: error.code ?? null, message: error.message, details: error.details ?? null })}\n`)
    process.exitCode = 1
})

module.exports = { main, parseArgs }
