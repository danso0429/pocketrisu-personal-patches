#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const {
    assertOutputOutsideInputs,
    captureInputFreeze,
    compareInputFreeze,
    parseCanonicalOutput,
    runChildWithFileCapture,
    sha256,
    validateVerificationResult,
    writeJsonAtomic,
} = require('../src/verification-evidence.cjs')
const {
    RECEIPT_DISPOSITIONS,
    sealDocument,
    validateDisposition,
} = require('../src/verification-receipts.cjs')
const {
    compareRuntimeEnvelopes,
    runtimeEnvelope,
} = require('../src/verification-runtime.cjs')

function parseArgs(argv) {
    let root = null
    let output = null
    let jobs = null
    let allowReviewing = false
    let disposition = 'current-active'
    let targetProvenance = null
    let verificationKind = 'global-exhaustive'
    for (let index = 2; index < argv.length; index += 1) {
        const argument = argv[index]
        if (argument === '--root') root = argv[++index]
        else if (argument === '--output') output = argv[++index]
        else if (argument === '--allow-reviewing') allowReviewing = true
        else if (argument === '--disposition') {
            disposition = argv[++index]
            if (!validateDisposition(disposition)) {
                throw new Error(
                    `--disposition must be one of: ${RECEIPT_DISPOSITIONS.join(', ')}`,
                )
            }
        }
        else if (argument === '--target-provenance') {
            targetProvenance = argv[++index]
            if (!/^sha256:[0-9a-f]{64}$/.test(targetProvenance ?? '')) {
                throw new Error('--target-provenance requires sha256:<64 lowercase hex>')
            }
        }
        else if (argument === '--verification') {
            verificationKind = argv[++index]
            if (!['global-exhaustive', 'cache-differential'].includes(verificationKind)) {
                throw new Error(
                    '--verification must be global-exhaustive or cache-differential',
                )
            }
        }
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
            + '--output RECEIPT.json [--jobs N] [--allow-reviewing] '
            + '[--disposition VALUE] [--target-provenance sha256:HEX] '
            + '[--verification global-exhaustive|cache-differential]',
        )
    }
    return {
        root: path.resolve(root),
        output: path.resolve(output),
        jobs,
        allowReviewing,
        disposition,
        targetProvenance,
        verificationKind,
    }
}

async function main(argv = process.argv) {
    const options = parseArgs(argv)
    const sourceRoot = path.resolve(__dirname, '..')
    assertOutputOutsideInputs(options.output, [sourceRoot, options.root])
    if (!fs.existsSync(path.dirname(options.output))) {
        throw new Error(`Evidence output parent does not exist: ${path.dirname(options.output)}`)
    }
    const verifier = path.join(
        sourceRoot,
        'scripts',
        options.verificationKind === 'cache-differential'
            ? 'verify-cache-differential.cjs'
            : 'verify-all-combinations.cjs',
    )
    const verifierArgs = ['--root', options.root, '--json']
    if (options.jobs !== null) verifierArgs.push('--jobs', String(options.jobs))
    if (options.allowReviewing) verifierArgs.push('--allow-reviewing')
    const command = [process.execPath, verifier, ...verifierArgs]
    const runtimeBefore = runtimeEnvelope({ root: options.root })
    const before = await captureInputFreeze({
        sourceRoot,
        targetRoot: options.root,
        targetProvenance: options.targetProvenance,
    })
    const execution = await runChildWithFileCapture(command[0], command.slice(1), {
        cwd: sourceRoot,
    })
    const after = await captureInputFreeze({
        sourceRoot,
        targetRoot: options.root,
        targetProvenance: options.targetProvenance,
    })
    const runtimeAfter = runtimeEnvelope({ root: options.root })
    const runtimeComparison = compareRuntimeEnvelopes(runtimeBefore, runtimeAfter)
    const stability = compareInputFreeze(before, after)
    const verifierResult = parseCanonicalOutput(execution.stdout)
    const verifierErrors = validateVerificationResult(
        options.verificationKind,
        verifierResult,
    )
    const stdoutBytes = Buffer.byteLength(execution.stdout)
    const accepted = execution.spawnError === null
        && execution.outputError === null
        && execution.exitCode === 0
        && execution.signal === null
        && stdoutBytes > 0
        && verifierErrors.length === 0
        && stability.matched
        && runtimeComparison.matched
    const receipt = sealDocument({
        schema: 'patch-verification-execution-receipt-v2',
        verificationKind: options.verificationKind,
        disposition: options.disposition,
        timestamp: new Date().toISOString(),
        command,
        options: {
            jobs: options.jobs,
            allowReviewing: options.allowReviewing,
            targetProvenance: options.targetProvenance,
        },
        before,
        after,
        stability,
        runtime: {
            before: runtimeBefore,
            after: runtimeAfter,
            comparison: runtimeComparison,
        },
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
    })
    writeJsonAtomic(options.output, receipt)
    process.stdout.write(`${JSON.stringify({
        receipt: options.output,
        accepted,
        exitCode: execution.exitCode,
        signal: execution.signal,
        spawnError: execution.spawnError,
        verifierErrors,
        stability,
        runtimeComparison,
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
