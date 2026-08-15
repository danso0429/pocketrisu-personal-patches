#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const {
    evaluateC0EvidenceBundle,
} = require('../src/c0-evidence.cjs')
const {
    buildCohortLedger,
    buildCandidateOperatingSampleLedger,
    buildDefectYieldSummary,
    buildStableReleaseLedger,
    objectSha256,
    validateIncidentChain,
    validateIncidentBundleBinding,
} = require('../src/c0-ledgers.cjs')
const {
    writeJsonAtomic,
} = require('../src/verification-evidence.cjs')
const {
    loadEvidenceObject,
    publishEvidenceObject,
} = require('../src/c0-retention.cjs')

function parseArgs(argv) {
    const options = {
        bundles: [],
        globalReceipts: [],
        stableReleaseInputs: [],
        incidents: [],
        candidateLinkages: [],
    }
    for (let index = 2; index < argv.length; index += 1) {
        const argument = argv[index]
        if (index + 1 >= argv.length) throw new Error(`${argument} requires a value`)
        const value = path.resolve(argv[++index])
        if (argument === '--bundle') options.bundles.push(value)
        else if (argument === '--global-receipt') options.globalReceipts.push(value)
        else if (argument === '--stable-release') options.stableReleaseInputs.push(value)
        else if (argument === '--incident') options.incidents.push(value)
        else if (argument === '--candidate-linkage') options.candidateLinkages.push(value)
        else if (argument === '--base-cohort-ledger') options.baseCohortLedger = value
        else if (argument === '--base-stable-release-ledger') options.baseStableReleaseLedger = value
        else if (argument === '--cohort-ledger-out') options.cohortLedgerOut = value
        else if (argument === '--stable-release-ledger-out') options.stableReleaseLedgerOut = value
        else if (argument === '--defect-yield-out') options.defectYieldOut = value
        else if (argument === '--base-candidate-sample-ledger') options.baseCandidateSampleLedger = value
        else if (argument === '--candidate-sample-ledger-out') options.candidateSampleLedgerOut = value
        else if (argument === '--store') options.store = value
        else throw new Error(`Unknown argument: ${argument}`)
    }
    if (!options.cohortLedgerOut || !options.store) throw new Error('--store and --cohort-ledger-out are required')
    if (options.bundles.length !== options.globalReceipts.length) {
        throw new Error('Every --bundle requires one positionally matching --global-receipt')
    }
    if (options.stableReleaseInputs.length > 0 && !options.stableReleaseLedgerOut) {
        throw new Error('--stable-release-ledger-out is required when --stable-release is used')
    }
    if (options.incidents.length > 0 && !options.defectYieldOut) {
        throw new Error('--defect-yield-out is required when --incident is used')
    }
    if (options.candidateLinkages.length > 0 && !options.candidateSampleLedgerOut) {
        throw new Error('--candidate-sample-ledger-out is required when --candidate-linkage is used')
    }
    const outputs = [options.cohortLedgerOut, options.stableReleaseLedgerOut,
        options.defectYieldOut, options.candidateSampleLedgerOut].filter(Boolean)
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
        const bundle = bundles[index]
        const operating = bundle.schema === 'patch-c0-evidence-bundle-v2'
        const localEvidence = operating && bundle.attemptEvidence.localEvidenceObjectSha256 !== null
            ? loadEvidenceObject(options.store, bundle.attemptEvidence.localEvidenceObjectSha256).document
            : null
        const gateEvidenceDocuments = operating ? {
            focused: loadEvidenceObject(options.store, bundle.gateEvidence.focused.objectSha256).document,
            product: loadEvidenceObject(options.store, bundle.gateEvidence.product.objectSha256).document,
        } : null
        const globalLaunchClaim = operating
            ? loadEvidenceObject(options.store, bundle.attemptEvidence.globalLaunchClaimObjectSha256).document
            : null
        const evaluation = evaluateC0EvidenceBundle(bundle, {
            globalReceipt: receipts[index], gateEvidenceDocuments, globalLaunchClaim,
            ...(bundle.attemptEvidence?.localEvidenceKind === 'failure'
                ? { localFailure: localEvidence }
                : { localReceipt: localEvidence }),
        })
        if (!evaluation.bundleValid) {
            throw new Error(`C0 bundle ${options.bundles[index]} is invalid: ${evaluation.structuralErrors.join('; ')}`)
        }
        loadEvidenceObject(options.store, objectSha256(bundles[index]))
        loadEvidenceObject(options.store, bundles[index].globalReceipt.objectSha256)
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
        for (let index = 0; index < incidents.length; index += 1) {
            const incident = incidents[index]
            loadEvidenceObject(options.store, objectSha256(incident))
            if (incident.schema === 'patch-c0-incident-record-v2') {
                const incidentBundle = loadEvidenceObject(options.store,
                    incident.bundleObjectSha256).document
                validateIncidentBundleBinding(incident, incidentBundle, {
                    previousRecord: index === 0 ? null : incidents[index - 1],
                })
            }
        }
        defectYield = buildDefectYieldSummary(cohortLedger, incidents)
    }
    let candidateSampleLedger = null
    if (options.candidateSampleLedgerOut) {
        const linkages = options.candidateLinkages.map((file) => {
            const linkage = readJson(file)
            return { linkage, linkageObjectSha256: objectSha256(linkage) }
        })
        for (const record of linkages) loadEvidenceObject(options.store, record.linkageObjectSha256)
        const base = options.baseCandidateSampleLedger ? readJson(options.baseCandidateSampleLedger) : null
        candidateSampleLedger = buildCandidateOperatingSampleLedger(linkages, cohortLedger, { baseLedger: base })
    }
    const publications = {
        cohortLedger: publishEvidenceObject(options.store, cohortLedger),
        stableReleaseLedger: stableReleaseLedger === null ? null : publishEvidenceObject(options.store, stableReleaseLedger),
        defectYield: defectYield === null ? null : publishEvidenceObject(options.store, defectYield),
        candidateSampleLedger: candidateSampleLedger === null
            ? null : publishEvidenceObject(options.store, candidateSampleLedger),
    }
    writeJsonAtomic(options.cohortLedgerOut, cohortLedger)
    if (stableReleaseLedger !== null) writeJsonAtomic(options.stableReleaseLedgerOut, stableReleaseLedger)
    if (defectYield !== null) writeJsonAtomic(options.defectYieldOut, defectYield)
    if (candidateSampleLedger !== null) writeJsonAtomic(options.candidateSampleLedgerOut, candidateSampleLedger)
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
        candidateSampleLedger: candidateSampleLedger === null ? null : {
            file: options.candidateSampleLedgerOut,
            objectSha256: objectSha256(candidateSampleLedger),
            entries: candidateSampleLedger.entries.length,
        },
        publications,
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
