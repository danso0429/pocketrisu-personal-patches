#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const {
    evaluateC0EvidenceBundle,
    requiredExitCode,
} = require('../src/c0-evidence.cjs')
const {
    loadEvidenceObject,
} = require('../src/c0-retention.cjs')

function parseArgs(argv) {
    const values = argv.slice(2)
    const options = { allowSynthetic: false }
    for (let index = 0; index < values.length; index += 1) {
        const value = values[index]
        if (value === '--allow-synthetic-known-answer') {
            options.allowSynthetic = true
            continue
        }
        if (!['--bundle', '--bundle-object', '--global-receipt', '--store'].includes(value) || index + 1 >= values.length) {
            throw new Error('Usage: verify-c0-evidence.cjs (--bundle BUNDLE.json | --bundle-object SHA256 --store STORE) [--global-receipt RECEIPT.json | --store STORE] [--allow-synthetic-known-answer]')
        }
        const key = {
            '--bundle': 'bundle',
            '--bundle-object': 'bundleObject',
            '--global-receipt': 'globalReceipt',
            '--store': 'store',
        }[value]
        if (options[key]) throw new Error(`Duplicate argument: ${value}`)
        options[key] = key === 'bundleObject' ? values[index + 1] : path.resolve(values[index + 1])
        index += 1
    }
    if ((options.bundle ? 1 : 0) + (options.bundleObject ? 1 : 0) !== 1) throw new Error('Exactly one of --bundle or --bundle-object is required')
    if (options.bundleObject && !options.store) throw new Error('--bundle-object requires --store')
    if (!options.globalReceipt && !options.store) throw new Error('Either --global-receipt or --store is required')
    return options
}

function main(argv = process.argv) {
    const options = parseArgs(argv)
    const bundleRecord = options.bundleObject
        ? loadEvidenceObject(options.store, options.bundleObject)
        : null
    const bundle = bundleRecord?.document ?? JSON.parse(fs.readFileSync(options.bundle, 'utf8'))
    const globalReceipt = options.globalReceipt
        ? JSON.parse(fs.readFileSync(options.globalReceipt, 'utf8'))
        : loadEvidenceObject(options.store, bundle.globalReceipt.objectSha256).document
    const operating = bundle.schema === 'patch-c0-evidence-bundle-v2'
    if (operating && !options.store) throw new Error('Operating evidence verification requires --store for attempt references')
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
        globalReceipt,
        ...(bundle.attemptEvidence?.localEvidenceKind === 'failure'
            ? { localFailure: localEvidence }
            : { localReceipt: localEvidence }),
        gateEvidenceDocuments,
        globalLaunchClaim,
    })
    process.stdout.write(`${JSON.stringify({
        bundle: options.bundle ?? `sha256:${options.bundleObject}`,
        globalReceipt: options.globalReceipt ?? `sha256:${bundle.globalReceipt.objectSha256}`,
        runKind: bundle.runKind ?? null,
        disposition: bundle.disposition ?? null,
        ...evaluation,
    })}\n`)
    process.exitCode = requiredExitCode(evaluation, { allowSynthetic: options.allowSynthetic })
    return evaluation
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
