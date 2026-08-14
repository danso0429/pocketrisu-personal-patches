#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { jsonSha256 } = require('../src/capability-contract.cjs')
const { validateCompositionalTheoremReceipt } = require('../src/compositional-theorem.cjs')
const { writeJsonAtomic } = require('../src/verification-evidence.cjs')

function parseArgs(argv) {
    let theoremReceipt = null
    let output = null
    for (let index = 2; index < argv.length; index += 1) {
        if (argv[index] === '--theorem-receipt') theoremReceipt = argv[++index]
        else if (argv[index] === '--output') output = argv[++index]
        else throw new Error(`Unknown argument: ${argv[index]}`)
    }
    if (!theoremReceipt || !output) throw new Error('Usage: build-certificate-audit.cjs --theorem-receipt FILE --output FILE')
    return { theoremReceipt: path.resolve(theoremReceipt), output: path.resolve(output) }
}

function main(argv = process.argv) {
    const options = parseArgs(argv)
    const theorem = JSON.parse(fs.readFileSync(options.theoremReceipt, 'utf8'))
    validateCompositionalTheoremReceipt(theorem)
    if (theorem.outcome !== 'global-fallback') {
        throw new Error('Current certificate audit expects the fail-closed current catalog theorem')
    }
    const payload = {
        schema: 'patch-certificate-admission-report-v1',
        status: 'not-issued-global-fallback',
        theoremOutcome: theorem.outcome,
        recordsGenerated: 0,
        recordsAccepted: 0,
        masksSkipped: 0,
        canonicalProtection: {
            canonicalGate: 'Global Exhaustive',
            fallbackRetained: true,
            productionCertificates: 0,
            productionStateWritten: false,
            defaultChanged: false,
        },
    }
    const report = { ...payload, reportSha256: jsonSha256(payload) }
    writeJsonAtomic(options.output, report)
    process.stdout.write(`${JSON.stringify({ ...report, output: options.output })}\n`)
    return report
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
