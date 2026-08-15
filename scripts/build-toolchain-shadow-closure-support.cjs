#!/usr/bin/env node
'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
    canonicalJsonBytes,
    pathIsInside,
    sha256,
} = require('../src/qualification-object-store.cjs')
const {
    collectMachineSupport,
    provisionExactPnpm,
} = require('../src/toolchain-shadow-qualification.cjs')

function positiveInteger(value, flag) {
    if (!/^[1-9]\d*$/.test(value ?? '')) throw new Error(`${flag} requires a positive integer`)
    return Number(value)
}

function parseArgs(argv) {
    const options = {
        qualificationToolRoot: path.resolve(__dirname, '..'),
        temporaryParent: os.tmpdir(),
    }
    const values = argv.slice(2)
    for (let index = 0; index < values.length; index += 2) {
        const flag = values[index]
        if (index + 1 >= values.length) throw new Error(`Missing value for ${flag}`)
        const value = values[index + 1]
        const key = {
            '--subject-root': 'subjectRoot',
            '--target-root': 'targetRoot',
            '--quarantine-root': 'quarantineRoot',
            '--support-output': 'supportOutput',
            '--closure-output': 'closureOutput',
            '--governance-commit': 'governanceCommit',
            '--governance-status-version': 'governanceStatusVersion',
            '--temporary-parent': 'temporaryParent',
        }[flag]
        if (!key) throw new Error(`Unknown option: ${flag}`)
        options[key] = key === 'governanceStatusVersion' ? positiveInteger(value, flag) : value
    }
    for (const key of [
        'subjectRoot', 'targetRoot', 'quarantineRoot', 'supportOutput', 'closureOutput',
        'governanceCommit', 'governanceStatusVersion',
    ]) if (!options[key]) throw new Error(`Missing required option: ${key}`)
    for (const key of ['subjectRoot', 'targetRoot', 'quarantineRoot', 'supportOutput', 'closureOutput', 'temporaryParent']) {
        options[key] = path.resolve(options[key])
    }
    if (!/^[0-9a-f]{40}$/.test(options.governanceCommit)) throw new Error('--governance-commit is invalid')
    if (options.supportOutput === options.closureOutput) throw new Error('Support and closure outputs must differ')
    for (const output of [options.supportOutput, options.closureOutput]) {
        for (const inputRoot of [options.qualificationToolRoot, options.subjectRoot, options.targetRoot, options.quarantineRoot]) {
            if (pathIsInside(output, inputRoot)) throw new Error(`Machine output must be outside input root: ${inputRoot}`)
        }
        if (fs.existsSync(output)) throw new Error(`Machine output already exists: ${output}`)
        if (!fs.statSync(path.dirname(output)).isDirectory()) throw new Error(`Machine output parent is missing: ${output}`)
    }
    return options
}

function fsyncDirectory(directory) {
    const descriptor = fs.openSync(directory, fs.constants.O_RDONLY)
    try { fs.fsyncSync(descriptor) } finally { fs.closeSync(descriptor) }
}

function writeCanonicalOutput(file, document) {
    const bytes = canonicalJsonBytes(document)
    const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${crypto.randomUUID()}.tmp`)
    try {
        const descriptor = fs.openSync(temporary, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o600)
        try {
            let offset = 0
            while (offset < bytes.length) offset += fs.writeSync(descriptor, bytes, offset)
            fs.fsyncSync(descriptor)
        } finally { fs.closeSync(descriptor) }
        if (!fs.readFileSync(temporary).equals(bytes)) throw new Error(`Machine output reread failed: ${file}`)
        fs.linkSync(temporary, file)
        fsyncDirectory(path.dirname(file))
    } finally {
        try { fs.unlinkSync(temporary) } catch (error) { if (error.code !== 'ENOENT') throw error }
    }
    return { path: file, bytes: bytes.length, sha256: sha256(bytes) }
}

async function main(argv = process.argv) {
    const options = parseArgs(argv)
    const quarantineManifest = path.join(options.quarantineRoot, 'QUARANTINE-MANIFEST.json')
    const localReceipt = path.join(options.quarantineRoot, 'local-synthetic-known-answer.json')
    const globalReceipt = path.join(options.quarantineRoot, 'global-synthetic-known-answer.json')
    for (const file of [quarantineManifest, localReceipt, globalReceipt]) {
        if (!fs.statSync(file).isFile()) throw new Error(`Quarantine source object is missing: ${file}`)
    }
    const provisioned = await provisionExactPnpm({ temporaryParent: options.temporaryParent })
    let completed = false
    try {
        const result = await collectMachineSupport({
            subjectRoot: options.subjectRoot,
            qualificationToolRoot: options.qualificationToolRoot,
            targetRoot: options.targetRoot,
            quarantineManifestBytes: fs.readFileSync(quarantineManifest),
            localReceiptBytes: fs.readFileSync(localReceipt),
            globalReceiptBytes: fs.readFileSync(globalReceipt),
            governanceCommit: options.governanceCommit,
            governanceStatusVersion: options.governanceStatusVersion,
            pnpmExecutable: provisioned.executable,
            pnpmProvisioning: provisioned.receipt,
        })
        fs.rmSync(provisioned.root, { recursive: true, force: true })
        completed = true
        const support = writeCanonicalOutput(options.supportOutput, result.supportRecord)
        const closure = writeCanonicalOutput(options.closureOutput, result.closureReceipt)
        const report = {
            result: result.closureReceipt.result,
            support,
            closure,
            subjectImplementationCommit: result.supportRecord.authority.subjectImplementationCommit,
            qualificationToolCommit: result.supportRecord.authority.qualificationToolCommit,
            closureRerunPerformed: false,
            localRouteRerunPerformed: false,
            globalProjectionRerunPerformed: false,
            taskScopedPnpmCleaned: true,
        }
        process.stdout.write(`${JSON.stringify(report)}\n`)
        return report
    } finally {
        if (!completed && fs.existsSync(provisioned.root)) {
            process.stderr.write(`${JSON.stringify({
                code: 'SUPPORT_COLLECTION_FAILED_TEMP_RETAINED',
                temporaryRoot: provisioned.root,
            })}\n`)
        }
    }
}

if (require.main === module) {
    main().catch((error) => {
        process.stderr.write(`${JSON.stringify({ code: error.code ?? null, message: error.message, details: error.details ?? null })}\n`)
        process.exitCode = 1
    })
}

module.exports = { main, parseArgs, writeCanonicalOutput }
