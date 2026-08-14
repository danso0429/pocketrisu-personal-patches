#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const {
    assertOutputOutsideInputs,
    captureInputFreeze,
    compareInputFreeze,
    parseCanonicalOutput,
    runChild,
    sha256,
    validateCanonicalResult,
    writeJsonAtomic,
} = require('../src/verification-evidence.cjs')

function parseArgs(argv) {
    let root = null
    let output = null
    let jobs = null
    let allowReviewing = false
    for (let index = 2; index < argv.length; index += 1) {
        const argument = argv[index]
        if (argument === '--root') root = argv[++index]
        else if (argument === '--output') output = argv[++index]
        else if (argument === '--allow-reviewing') allowReviewing = true
        else if (argument === '--jobs') {
            const value = argv[++index]
            if (!/^[1-9]\d*$/.test(value ?? '')) {
                throw new Error('--jobs requires a positive integer')
            }
            jobs = Number(value)
            if (!Number.isSafeInteger(jobs)) {
                throw new Error('--jobs requires a positive safe integer')
            }
        } else throw new Error(`Unknown argument: ${argument}`)
    }
    if (!root || !output) {
        throw new Error(
            'Usage: run-verification-evidence.cjs --root PRISTINE_POCKETRISU '
            + '--output RECEIPT.json [--jobs N] [--allow-reviewing]',
        )
    }
    return {
        root: path.resolve(root),
        output: path.resolve(output),
        jobs,
        allowReviewing,
    }
}

async function main(argv = process.argv) {
    const options = parseArgs(argv)
    const sourceRoot = path.resolve(__dirname, '..')
    assertOutputOutsideInputs(options.output, [sourceRoot, options.root])
    if (!fs.existsSync(path.dirname(options.output))) {
        throw new Error(`Evidence output parent does not exist: ${path.dirname(options.output)}`)
    }
    const verifier = path.join(sourceRoot, 'scripts/verify-all-combinations.cjs')
    const verifierArgs = ['--root', options.root, '--json']
    if (options.jobs !== null) verifierArgs.push('--jobs', String(options.jobs))
    if (options.allowReviewing) verifierArgs.push('--allow-reviewing')
    const command = [process.execPath, verifier, ...verifierArgs]
    const before = await captureInputFreeze({ sourceRoot, targetRoot: options.root })
    const execution = await runChild(command[0], command.slice(1), { cwd: sourceRoot })
    const after = await captureInputFreeze({ sourceRoot, targetRoot: options.root })
    const stability = compareInputFreeze(before, after)
    const verifierResult = parseCanonicalOutput(execution.stdout)
    const verifierErrors = validateCanonicalResult(verifierResult)
    const stdoutBytes = Buffer.byteLength(execution.stdout)
    const accepted = execution.spawnError === null
        && execution.outputError === null
        && execution.exitCode === 0
        && execution.signal === null
        && stdoutBytes > 0
        && verifierErrors.length === 0
        && stability.matched
    const receipt = {
        schema: 'patch-verification-execution-receipt-v1',
        timestamp: new Date().toISOString(),
        command,
        options: {
            jobs: options.jobs,
            allowReviewing: options.allowReviewing,
        },
        before,
        after,
        stability,
        execution: {
            ...execution,
            stdoutBytes,
            stdoutSha256: sha256(execution.stdout),
            stderrBytes: Buffer.byteLength(execution.stderr),
            stderrSha256: sha256(execution.stderr),
        },
        verifierResult,
        verifierErrors,
        accepted,
    }
    writeJsonAtomic(options.output, receipt)
    process.stdout.write(`${JSON.stringify({
        receipt: options.output,
        accepted,
        exitCode: execution.exitCode,
        signal: execution.signal,
        spawnError: execution.spawnError,
        verifierErrors,
        stability,
    })}\n`)
    if (!accepted) process.exitCode = 1
    return receipt
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error.stack || error.message)
        process.exitCode = 1
    })
}

module.exports = { main, parseArgs }
