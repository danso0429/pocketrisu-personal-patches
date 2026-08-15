#!/usr/bin/env node
'use strict'

const path = require('node:path')
const { canonicalJsonBytes } = require('../src/qualification-object-store.cjs')
const { planQualificationRetention } = require('../src/qualification-retention.cjs')

function parseArgs(argv) {
    const options = { quarantineRoots: [] }
    for (let index = 2; index < argv.length; index += 2) {
        const flag = argv[index]
        if (index + 1 >= argv.length) throw new Error(`Missing value for ${flag}`)
        const value = path.resolve(argv[index + 1])
        if (flag === '--store') options.storeRoot = value
        else if (flag === '--quarantine-root') options.quarantineRoots.push(value)
        else throw new Error(`Unknown option: ${flag}`)
    }
    if (!options.storeRoot) throw new Error('--store is required')
    return options
}

function main(argv = process.argv) {
    const options = parseArgs(argv)
    const plan = planQualificationRetention(options)
    process.stdout.write(`${canonicalJsonBytes(plan).toString()}\n`)
    return plan
}

if (require.main === module) {
    try { main() } catch (error) {
        process.stderr.write(`${JSON.stringify({ code: error.code ?? null, message: error.message })}\n`)
        process.exitCode = 1
    }
}

module.exports = { main, parseArgs }
