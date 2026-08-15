#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const {
    buildReviewTriggerReport,
    objectSha256,
} = require('../src/c0-ledgers.cjs')
const {
    writeJsonAtomic,
} = require('../src/verification-evidence.cjs')

function parseArgs(argv) {
    const options = { incidents: [] }
    for (let index = 2; index < argv.length; index += 1) {
        const argument = argv[index]
        if (index + 1 >= argv.length) throw new Error(`${argument} requires a value`)
        const value = path.resolve(argv[++index])
        if (argument === '--cohort-ledger') options.cohortLedger = value
        else if (argument === '--stable-release-ledger') options.stableReleaseLedger = value
        else if (argument === '--incident') options.incidents.push(value)
        else if (argument === '--output') options.output = value
        else throw new Error(`Unknown argument: ${argument}`)
    }
    for (const field of ['cohortLedger', 'stableReleaseLedger', 'output']) {
        if (!options[field]) throw new Error(`--${field.replace(/[A-Z]/g, (value) => `-${value.toLowerCase()}`)} is required`)
    }
    if (!fs.existsSync(path.dirname(options.output))) throw new Error(`Output parent does not exist: ${path.dirname(options.output)}`)
    if (fs.existsSync(options.output)) throw new Error(`Immutable review-trigger output already exists: ${options.output}`)
    return options
}

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function main(argv = process.argv) {
    const options = parseArgs(argv)
    const report = buildReviewTriggerReport({
        cohortLedger: readJson(options.cohortLedger),
        stableReleaseLedger: readJson(options.stableReleaseLedger),
        incidentRecords: options.incidents.map(readJson),
    })
    writeJsonAtomic(options.output, report)
    process.stdout.write(`${JSON.stringify({
        schema: 'patch-c0-review-trigger-result-v1',
        output: options.output,
        objectSha256: objectSha256(report),
        recommendation: report.recommendation,
        c1Authorized: false,
        unsatisfied: report.conditions.filter((condition) => !condition.satisfied).map((condition) => condition.id),
    })}\n`)
    return report
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
