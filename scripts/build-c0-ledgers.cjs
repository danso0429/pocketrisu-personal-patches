#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const {
    evaluateC0EvidenceBundle,
} = require('../src/c0-evidence.cjs')
const {
    buildCohortLedger,
    buildDefectYieldSummary,
    buildStableReleaseLedger,
    objectSha256,
    validateIncidentChain,
} = require('../src/c0-ledgers.cjs')
const {
    writeJsonAtomic,
} = require('../src/verification-evidence.cjs')

function parseArgs(argv) {
    const options = {
        bundles: [],
        globalReceipts: [],
        stableReleaseInputs: [],
        incidents: [],
    }
    for (let index = 2; index < argv.length; index += 1) {
        const argument = argv[index]
        if (index + 1 >= argv.length) throw new Error(`${argument} requires a value`)
        const value = path.resolve(argv[++index])
        if (argument === '--bundle') options.bundles.push(value)
        else if (argument === '--global-receipt') options.globalReceipts.push(value)
        else if (argument === '--stable-release') options.stableReleaseInputs.push(value)
        else if (argument === '--incident') options.incidents.push(value)
        else if (argument === '--base-cohort-ledger') options.baseCohortLedger = value
        else if (argument === '--base-stable-release-ledger') options.baseStableReleaseLedger = value
        else if (argument === '--cohort-ledger-out') options.cohortLedgerOut = value
        else if (argument === '--stable-release-ledger-out') options.stableReleaseLedgerOut = value
        else if (argument === '--defect-yield-out') options.defectYieldOut = value
        else throw new Error(`Unknown argument: ${argument}`)
    }
    if (!options.cohortLedgerOut) throw new Error('--cohort-ledger-out is required')
    if (options.bundles.length !== options.globalReceipts.length) {
        throw new Error('Every --bundle requires one positionally matching --global-receipt')
    }
    if (options.stableReleaseInputs.length > 0 && !options.stableReleaseLedgerOut) {
        throw new Error('--stable-release-ledger-out is required when --stable-release is used')
    }
    if (options.incidents.length > 0 && !options.defectYieldOut) {
        throw new Error('--defect-yield-out is required when --incident is used')
    }
    const outputs = [options.cohortLedgerOut, options.stableReleaseLedgerOut, options.defectYieldOut].filter(Boolean)
    if (new Set(outputs).size !== outputs.length) throw new Error('Ledger outputs must be distinct')
    for (const output of outputs) {
        if (!fs.existsSync(path.dirname(output))) throw new Error(`Output parent does not exist: ${path.dirname(output)}`)
        if (fs.existsSync(output)) throw new Error(`Immutable ledger output already exists: ${output}`)
    }
    return options
}

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function stableReleaseRecords(files, bundles) {
    const byObject = new Map(bundles.map((bundle) => [objectSha256(bundle), bundle]))
    return files.map((file) => {
        const input = readJson(file)
        if (input?.schema !== 'patch-c0-stable-release-input-v1') {
            throw new Error(`Unsupported stable-release input: ${file}`)
        }
        const keys = Object.keys(input).sort()
        if (JSON.stringify(keys) !== JSON.stringify([
            'bundleObjectSha256',
            'productGateResult',
            'releaseId',
            'releaseTag',
            'schema',
        ])) throw new Error(`Stable-release input fields are missing or unknown: ${file}`)
        const bundle = byObject.get(input.bundleObjectSha256)
        if (!bundle) throw new Error(`Stable-release input references an unloaded bundle: ${input.bundleObjectSha256}`)
        return {
            releaseId: input.releaseId,
            releaseTag: input.releaseTag,
            productGateResult: input.productGateResult,
            bundle,
        }
    })
}

function main(argv = process.argv) {
    const options = parseArgs(argv)
    const bundles = options.bundles.map(readJson)
    const receipts = options.globalReceipts.map(readJson)
    for (let index = 0; index < bundles.length; index += 1) {
        const evaluation = evaluateC0EvidenceBundle(bundles[index], { globalReceipt: receipts[index] })
        if (!evaluation.bundleValid) {
            throw new Error(`C0 bundle ${options.bundles[index]} is invalid: ${evaluation.structuralErrors.join('; ')}`)
        }
    }
    const baseCohortLedger = options.baseCohortLedger ? readJson(options.baseCohortLedger) : null
    const cohortLedger = buildCohortLedger(bundles, { baseLedger: baseCohortLedger })
    let stableReleaseLedger = null
    if (options.stableReleaseLedgerOut) {
        const base = options.baseStableReleaseLedger ? readJson(options.baseStableReleaseLedger) : null
        stableReleaseLedger = buildStableReleaseLedger(
            stableReleaseRecords(options.stableReleaseInputs, bundles),
            { baseLedger: base },
        )
    }
    let defectYield = null
    if (options.defectYieldOut) {
        const incidents = options.incidents.map(readJson)
        const evaluation = validateIncidentChain(incidents)
        if (!evaluation.valid) throw new Error(`Incident chain is invalid: ${evaluation.errors.join('; ')}`)
        defectYield = buildDefectYieldSummary(cohortLedger, incidents)
    }
    writeJsonAtomic(options.cohortLedgerOut, cohortLedger)
    if (stableReleaseLedger !== null) writeJsonAtomic(options.stableReleaseLedgerOut, stableReleaseLedger)
    if (defectYield !== null) writeJsonAtomic(options.defectYieldOut, defectYield)
    const result = {
        schema: 'patch-c0-ledger-build-result-v1',
        cohortLedger: {
            file: options.cohortLedgerOut,
            objectSha256: objectSha256(cohortLedger),
            entries: cohortLedger.entries.length,
        },
        stableReleaseLedger: stableReleaseLedger === null ? null : {
            file: options.stableReleaseLedgerOut,
            objectSha256: objectSha256(stableReleaseLedger),
            entries: stableReleaseLedger.entries.length,
        },
        defectYield: defectYield === null ? null : {
            file: options.defectYieldOut,
            objectSha256: objectSha256(defectYield),
            confirmedProductionDefects: defectYield.confirmedProductionDefects,
            syntheticIncidentsExcluded: defectYield.syntheticIncidentsExcluded,
        },
    }
    process.stdout.write(`${JSON.stringify(result)}\n`)
    return result
}

if (require.main === module) {
    try {
        main()
    } catch (error) {
        console.error(error.stack || error.message)
        process.exitCode = 1
    }
}

module.exports = { main, parseArgs, stableReleaseRecords }
