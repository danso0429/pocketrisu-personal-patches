#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { evaluateExecutionReceipt } = require('../src/verification-receipts.cjs')

function parseArgs(argv) {
    if (argv.length !== 4 || argv[2] !== '--receipt') {
        throw new Error('Usage: verify-verification-receipt.cjs --receipt RECEIPT.json')
    }
    return { receipt: path.resolve(argv[3]) }
}

function requiredExitCode(evaluation) {
    return evaluation.receiptValid && evaluation.executionAccepted ? 0 : 1
}

function main(argv = process.argv) {
    const options = parseArgs(argv)
    const receipt = JSON.parse(fs.readFileSync(options.receipt, 'utf8'))
    const evaluation = evaluateExecutionReceipt(receipt)
    process.stdout.write(`${JSON.stringify({
        receipt: options.receipt,
        disposition: receipt.disposition ?? null,
        ...evaluation,
    })}\n`)
    process.exitCode = requiredExitCode(evaluation)
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

module.exports = { main, parseArgs, requiredExitCode }
