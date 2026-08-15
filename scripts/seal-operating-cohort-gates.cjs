#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { buildOperatingGateEvidence } = require('../src/operating-cohort-gates.cjs')
const { loadEvidenceObject, publishEvidenceObject } = require('../src/c0-retention.cjs')
const { writeJsonAtomic } = require('../src/verification-evidence.cjs')

function parseArgs(argv) {
    const options = {}
    for (let index = 2; index < argv.length; index += 1) {
        const flag = argv[index]
        if (index + 1 >= argv.length) throw new Error(`${flag} requires a value`)
        const value = argv[++index]
        if (flag === '--store') options.store = path.resolve(value)
        else if (flag === '--frozen-declaration') options.frozenDeclaration = value
        else if (flag === '--kind') options.kind = value
        else if (flag === '--gates') options.gates = path.resolve(value)
        else if (flag === '--output') options.output = path.resolve(value)
        else throw new Error(`Unknown option: ${flag}`)
    }
    for (const field of ['store', 'frozenDeclaration', 'kind', 'gates', 'output']) {
        if (!options[field]) throw new Error(`Missing required option: ${field}`)
    }
    if (!/^[0-9a-f]{64}$/.test(options.frozenDeclaration)
        || !['focused', 'product'].includes(options.kind)
        || !fs.existsSync(path.dirname(options.output)) || fs.existsSync(options.output)) {
        throw new Error('Operating gate evidence options are invalid')
    }
    return options
}

function main(argv = process.argv) {
    const options = parseArgs(argv)
    const frozen = loadEvidenceObject(options.store, options.frozenDeclaration)
    const document = buildOperatingGateEvidence({
        gateKind: options.kind,
        gates: JSON.parse(fs.readFileSync(options.gates, 'utf8')),
        frozenDeclaration: frozen.document,
        frozenDeclarationObjectSha256: frozen.objectSha256,
    })
    const publication = publishEvidenceObject(options.store, document)
    writeJsonAtomic(options.output, document)
    const result = {
        schema: 'patch-operating-cohort-gate-evidence-result-v1',
        output: options.output,
        objectSha256: publication.objectSha256,
        gateKind: options.kind,
        executionAttemptId: frozen.document.executionAttemptId,
        publication,
    }
    process.stdout.write(`${JSON.stringify(result)}\n`)
    return result
}

if (require.main === module) {
    try { main() } catch (error) {
        console.error(error.stack || error.message)
        process.exitCode = 1
    }
}

module.exports = { main, parseArgs }
