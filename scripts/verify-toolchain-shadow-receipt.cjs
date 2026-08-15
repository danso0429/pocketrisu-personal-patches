#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const {
    validatePilotIncident,
    validatePilotReceipt,
} = require('../src/toolchain-shadow-evidence.cjs')
const { loadEvidenceObject } = require('../src/c0-retention.cjs')

function parseArgs(argv) {
    const options = {}
    const values = argv.slice(2)
    for (let index = 0; index < values.length; index += 2) {
        const key = values[index]
        const mapped = {
            '--receipt': 'receipt', '--store': 'store', '--incident-object': 'incidentObject',
        }[key]
        if (!mapped || index + 1 >= values.length) throw new Error('Usage: verify-toolchain-shadow-receipt.cjs --receipt RECEIPT.json --store STORE [--incident-object SHA256]')
        options[mapped] = values[index + 1]
    }
    if (!options.receipt || !options.store) throw new Error('--receipt and --store are required')
    return options
}

function main(argv = process.argv) {
    const options = parseArgs(argv)
    const store = path.resolve(options.store)
    const receipt = JSON.parse(fs.readFileSync(path.resolve(options.receipt), 'utf8'))
    const localReceipt = loadEvidenceObject(store, receipt.references.localReceiptObjectSha256).document
    const globalProjection = loadEvidenceObject(store, receipt.references.globalProjectionObjectSha256).document
    const globalReceipt = receipt.references.globalReceiptObjectSha256 === null
        ? null
        : loadEvidenceObject(store, receipt.references.globalReceiptObjectSha256).document
    const c0Bundle = receipt.references.c0BundleObjectSha256 === null
        ? null
        : loadEvidenceObject(store, receipt.references.c0BundleObjectSha256).document
    validatePilotReceipt(receipt, { localReceipt, globalProjection, globalReceipt, c0Bundle })
    let incident = null
    if (receipt.incidentRequired) {
        if (!options.incidentObject) throw new Error('Failed pilot requires --incident-object')
        incident = loadEvidenceObject(store, options.incidentObject).document
        validatePilotIncident(incident)
        if (incident.pilotReceiptObjectSha256 !== require('../src/c0-retention.cjs').objectSha256(receipt)) {
            throw new Error('Incident references another pilot receipt')
        }
    } else if (options.incidentObject) {
        throw new Error('Passing pilot must not bind a failure incident')
    }
    const result = {
        accepted: true,
        mode: receipt.mode,
        materialPilotEvidence: receipt.mode === 'material-shadow',
        productionAdmissionEvidence: false,
        pilotCorrectness: receipt.result.pilotCorrectness,
        candidateAdmission: receipt.result.candidateAdmission,
        productionClassification: receipt.result.productionClassification,
        cohortId: receipt.cohort.cohortId,
        runId: receipt.cohort.runId,
        incidentId: incident?.incidentId ?? null,
    }
    process.stdout.write(`${JSON.stringify(result)}\n`)
    return result
}

if (require.main === module) {
    try { main() } catch (error) {
        process.stderr.write(`${JSON.stringify({ code: error.code ?? null, message: error.message })}\n`)
        process.exitCode = 1
    }
}

module.exports = { main, parseArgs }
