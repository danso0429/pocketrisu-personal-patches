#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { canonicalJsonBytes, parseJsonStrict } = require('../src/qualification-object-store.cjs')
const { preflightOperatingCohort } = require('../src/operating-cohort-preflight.cjs')

function parseArgs(argv) {
    const options = {}
    for (let index = 2; index < argv.length; index += 2) {
        const flag = argv[index]
        if (index + 1 >= argv.length) throw new Error(`Missing value for ${flag}`)
        const value = argv[index + 1]
        if (flag === '--store') options.storeRoot = path.resolve(value)
        else if (flag === '--expectation') options.expectationFile = path.resolve(value)
        else if (flag === '--subject-root') options.subjectRoot = path.resolve(value)
        else if (flag === '--operating-environment-receipt') {
            options.operatingEnvironmentReceiptFile = path.resolve(value)
        }
        else throw new Error(`Unknown option: ${flag}`)
    }
    if (!options.storeRoot || !options.expectationFile || !options.subjectRoot) throw new Error('--store, --expectation and --subject-root are required')
    return options
}

function main(argv = process.argv) {
    const options = parseArgs(argv)
    const expectation = parseJsonStrict(fs.readFileSync(options.expectationFile), 'operating preflight expectation')
    const operatingEnvironmentReceipt = options.operatingEnvironmentReceiptFile === undefined
        ? null
        : parseJsonStrict(fs.readFileSync(options.operatingEnvironmentReceiptFile), 'operating environment receipt')
    const result = preflightOperatingCohort({
        storeRoot: options.storeRoot,
        expectation,
        subjectRoot: options.subjectRoot,
        operatingEnvironmentReceipt,
    })
    process.stdout.write(`${canonicalJsonBytes(result).toString()}\n`)
    return result
}

if (require.main === module) {
    try { main() } catch (error) {
        process.stderr.write(`${JSON.stringify({ code: error.code ?? null, message: error.message })}\n`)
        process.exitCode = 1
    }
}

module.exports = { main, parseArgs }
