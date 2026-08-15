#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const {
    objectSha256,
} = require('../src/c0-ledgers.cjs')
const {
    planC0EvidenceRetention,
    publishEvidenceObject,
} = require('../src/c0-retention.cjs')
const {
    writeJsonAtomic,
} = require('../src/verification-evidence.cjs')

function parseArgs(argv) {
    const options = { rootObjects: [], rootFiles: [], protectedObjects: [] }
    for (let index = 2; index < argv.length; index += 1) {
        const argument = argv[index]
        if (index + 1 >= argv.length) throw new Error(`${argument} requires a value`)
        const value = argv[++index]
        if (argument === '--store') options.store = path.resolve(value)
        else if (argument === '--root-object') options.rootObjects.push(value)
        else if (argument === '--root-file') options.rootFiles.push(path.resolve(value))
        else if (argument === '--protect-object') options.protectedObjects.push(value)
        else if (argument === '--output') options.output = path.resolve(value)
        else throw new Error(`Unknown argument: ${argument}`)
    }
    if (!options.store || !options.output) throw new Error('--store and --output are required')
    if (!fs.existsSync(path.dirname(options.output))) throw new Error(`Output parent does not exist: ${path.dirname(options.output)}`)
    if (fs.existsSync(options.output)) throw new Error(`Immutable retention-plan output already exists: ${options.output}`)
    return options
}

function main(argv = process.argv) {
    const options = parseArgs(argv)
    const rootDocuments = options.rootFiles.map((file) => ({
        label: `file:${file}`,
        document: JSON.parse(fs.readFileSync(file, 'utf8')),
    }))
    const plan = planC0EvidenceRetention({
        storeRoot: options.store,
        rootObjectSha256s: options.rootObjects,
        rootDocuments,
        explicitlyProtectedObjectSha256s: options.protectedObjects,
    })
    const published = publishEvidenceObject(options.store, plan)
    writeJsonAtomic(options.output, plan)
    process.stdout.write(`${JSON.stringify({
        schema: 'patch-c0-retention-plan-result-v1',
        output: options.output,
        objectSha256: objectSha256(plan),
        publication: published,
        dryRun: true,
        summary: plan.summary,
    })}\n`)
    return plan
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
