#!/usr/bin/env node
'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const {
    canonicalJsonBytes,
    parseJsonStrict,
} = require('../src/qualification-object-store.cjs')
const {
    buildValidationResult,
} = require('../src/qualification-registry.cjs')
const {
    assertQuarantineIsNotAcceptedStore,
    verifyContentQualification,
    verifyFinalQualification,
    verifyQualificationRegistry,
} = require('../src/qualification-verifier.cjs')
const { runChild } = require('../src/verification-evidence.cjs')

function parseArgs(argv) {
    const options = { toolRoot: path.resolve(__dirname, '..'), requireCurrentRef: false }
    const values = argv.slice(2)
    for (let index = 0; index < values.length; index += 1) {
        const flag = values[index]
        if (flag === '--require-current-ref') { options.requireCurrentRef = true; continue }
        if (index + 1 >= values.length) throw new Error(`Missing value for ${flag}`)
        const key = {
            '--store': 'storeRoot',
            '--content-manifest': 'contentManifest',
            '--qualification-manifest': 'qualificationManifest',
            '--registry': 'registry',
            '--subject': 'subjectFile',
            '--validation-output': 'validationOutput',
            '--tool-root': 'toolRoot',
        }[flag]
        if (!key) throw new Error(`Unknown option: ${flag}`)
        options[key] = values[++index]
    }
    if (!options.storeRoot || !options.subjectFile) throw new Error('--store and --subject are required')
    const modes = ['contentManifest', 'qualificationManifest', 'registry'].filter((key) => options[key])
    if (modes.length !== 1) throw new Error('Exactly one of --content-manifest, --qualification-manifest or --registry is required')
    if ((options.validationOutput !== undefined) !== (options.contentManifest !== undefined)) {
        throw new Error('--validation-output is required only with --content-manifest')
    }
    for (const key of ['contentManifest', 'qualificationManifest', 'registry']) {
        if (options[key] && !/^[0-9a-f]{64}$/.test(options[key])) throw new Error(`${key} is not a SHA-256 digest`)
    }
    options.storeRoot = path.resolve(options.storeRoot)
    options.subjectFile = path.resolve(options.subjectFile)
    options.toolRoot = path.resolve(options.toolRoot)
    if (options.validationOutput) options.validationOutput = path.resolve(options.validationOutput)
    return options
}

async function gitCommit(root) {
    const result = await runChild('git', ['--no-pager', '-C', root, 'rev-parse', 'HEAD'], {
        env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }, maxOutputBytes: 1024 * 1024,
    })
    if (result.spawnError !== null || result.outputError !== null || result.exitCode !== 0
        || result.signal !== null || !/^[0-9a-f]{40}\n?$/.test(result.stdout)) {
        throw new Error('Independent verifier cannot resolve its tool commit')
    }
    return result.stdout.trim()
}

function writeCanonicalOutput(file, document) {
    if (fs.existsSync(file)) throw new Error(`Validation output already exists: ${file}`)
    const bytes = canonicalJsonBytes(document)
    const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${crypto.randomUUID()}.tmp`)
    try {
        const descriptor = fs.openSync(temporary, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o600)
        try {
            let offset = 0
            while (offset < bytes.length) offset += fs.writeSync(descriptor, bytes, offset)
            fs.fsyncSync(descriptor)
        } finally { fs.closeSync(descriptor) }
        if (!fs.readFileSync(temporary).equals(bytes)) throw new Error('Independent validation output reread failed')
        fs.linkSync(temporary, file)
        const directory = fs.openSync(path.dirname(file), fs.constants.O_RDONLY)
        try { fs.fsyncSync(directory) } finally { fs.closeSync(directory) }
    } finally {
        try { fs.unlinkSync(temporary) } catch (error) { if (error.code !== 'ENOENT') throw error }
    }
}

async function main(argv = process.argv) {
    const options = parseArgs(argv)
    assertQuarantineIsNotAcceptedStore(options.storeRoot)
    const subject = parseJsonStrict(fs.readFileSync(options.subjectFile), 'expected qualification subject')
    let report
    if (options.contentManifest) {
        const verified = verifyContentQualification({
            storeRoot: options.storeRoot,
            contentManifestDescriptorSha256: options.contentManifest,
            expectedSubject: subject,
        })
        const result = buildValidationResult({
            validatedAt: new Date().toISOString(),
            qualificationToolCommit: await gitCommit(options.toolRoot),
            storeIdentityHash: verified.identity.storeIdentityHash,
            contentManifestDescriptorSha256: options.contentManifest,
            checkedDescriptors: verified.checkedDescriptors,
            checks: verified.checks,
            failures: [],
        })
        writeCanonicalOutput(options.validationOutput, result)
        report = { mode: 'content', passed: true, validationOutput: options.validationOutput }
    } else if (options.qualificationManifest) {
        const verified = verifyFinalQualification({
            storeRoot: options.storeRoot,
            qualificationManifestDescriptorSha256: options.qualificationManifest,
            expectedSubject: subject,
        })
        report = { mode: 'final-manifest', passed: true, checkedDescriptors: verified.checkedDescriptors.length }
    } else {
        const verified = verifyQualificationRegistry({
            storeRoot: options.storeRoot,
            registryDescriptorSha256: options.registry,
            expectedSubject: subject,
            requireCurrentRef: options.requireCurrentRef,
        })
        report = {
            mode: 'registry', passed: true, registryRootSha256: verified.registryRootSha256,
            currentRefVerified: verified.currentRefVerified,
        }
    }
    process.stdout.write(`${JSON.stringify(report)}\n`)
    return report
}

if (require.main === module) {
    main().catch((error) => {
        process.stderr.write(`${JSON.stringify({ code: error.code ?? null, message: error.message, details: error.details ?? null })}\n`)
        process.exitCode = 1
    })
}

module.exports = { main, parseArgs, writeCanonicalOutput }
