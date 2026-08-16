#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const {
    accountingFromOutputDirectory,
} = require('../src/toolchain-shadow-qualification-run-accounting.cjs')

function parseArgs(argv) {
    const options = { successReport: null }
    for (let index = 2; index < argv.length; index += 2) {
        const value = argv[index + 1]
        if (value === undefined) throw new Error(`Missing value for ${argv[index]}`)
        if (argv[index] === '--output-directory') options.outputDirectory = path.resolve(value)
        else if (argv[index] === '--status') options.status = value
        else if (argv[index] === '--success-report') options.successReport = path.resolve(value)
        else throw new Error(`Unknown option: ${argv[index]}`)
    }
    if (!options.outputDirectory || !['passed', 'failed'].includes(options.status)) {
        throw new Error('Usage: summarize-toolchain-shadow-qualification-run.cjs --output-directory DIR --status passed|failed [--success-report FILE]')
    }
    return options
}

function main(argv = process.argv) {
    const options = parseArgs(argv)
    const successReport = options.successReport === null
        ? null
        : JSON.parse(fs.readFileSync(options.successReport, 'utf8'))
    const accounting = accountingFromOutputDirectory(options.outputDirectory, {
        status: options.status,
        successReport,
    })
    process.stdout.write(`${JSON.stringify(accounting)}\n`)
    return accounting
}

if (require.main === module) {
    try { main() } catch (error) {
        process.stderr.write(`${JSON.stringify({
            code: error.code ?? null,
            message: error.message,
            details: error.details ?? null,
        })}\n`)
        process.exitCode = 1
    }
}

module.exports = { main, parseArgs }
