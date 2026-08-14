#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { jsonSha256 } = require('../src/capability-contract.cjs')
const { validateCompositionalTheoremReceipt } = require('../src/compositional-theorem.cjs')
const { validateFreshShadowReceipt } = require('../src/fresh-shadow-verifier.cjs')
const { buildQualificationReceipt, validateQualificationReceipt } = require('../src/qualification.cjs')
const { writeJsonAtomic } = require('../src/verification-evidence.cjs')

function parseArgs(argv) {
    const options = {
        referenceOracle: null, candidateOracle: null, shadowReceipt: null,
        theoremReceipt: null, certificateReport: null, samples: null,
        adversarialResults: null, safetyFactor: null, output: null,
    }
    for (let index = 2; index < argv.length; index += 1) {
        const key = argv[index]
        const value = argv[++index]
        if (key === '--reference-oracle') options.referenceOracle = value
        else if (key === '--candidate-oracle') options.candidateOracle = value
        else if (key === '--shadow-receipt') options.shadowReceipt = value
        else if (key === '--theorem-receipt') options.theoremReceipt = value
        else if (key === '--certificate-report') options.certificateReport = value
        else if (key === '--samples') options.samples = value
        else if (key === '--adversarial-results') options.adversarialResults = value
        else if (key === '--safety-factor') options.safetyFactor = Number(value)
        else if (key === '--output') options.output = value
        else throw new Error(`Unknown argument: ${key}`)
    }
    if (Object.values(options).some((value) => value === null)) {
        throw new Error('Phase 7 qualification requires every receipt, sample, safety-factor, adversarial and output option')
    }
    return Object.fromEntries(Object.entries(options).map(([key, value]) => [
        key,
        typeof value === 'string' && key !== 'safetyFactor' ? path.resolve(value) : value,
    ]))
}

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function main(argv = process.argv) {
    const options = parseArgs(argv)
    const shadowReceipt = validateFreshShadowReceipt(readJson(options.shadowReceipt))
    const theoremReceipt = validateCompositionalTheoremReceipt(readJson(options.theoremReceipt))
    const certificateReport = readJson(options.certificateReport)
    const { reportSha256, ...certificatePayload } = certificateReport
    if (certificateReport.schema !== 'patch-certificate-admission-report-v1' || reportSha256 !== jsonSha256(certificatePayload)) {
        throw new Error('Certificate admission report is invalid')
    }
    const receipt = buildQualificationReceipt({
        referenceOracle: readJson(options.referenceOracle),
        candidateOracle: readJson(options.candidateOracle),
        shadowReceipt,
        theoremReceipt,
        certificateReport,
        samples: readJson(options.samples),
        safetyFactor: options.safetyFactor,
        adversarialResults: readJson(options.adversarialResults),
    })
    validateQualificationReceipt(receipt)
    if (receipt.status !== 'passed-global-only') throw new Error('Phase 7 global-only qualification failed')
    writeJsonAtomic(options.output, receipt)
    process.stdout.write(`${JSON.stringify({
        schema: receipt.schema,
        status: receipt.status,
        scope: receipt.scope,
        output: options.output,
        receiptSha256: receipt.receiptSha256,
        oracleMismatches: receipt.oracleComparison.mismatches.length,
        productionLocalClassesAdmitted: receipt.canonicalProtection.productionLocalClassesAdmitted,
    })}\n`)
    return receipt
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
