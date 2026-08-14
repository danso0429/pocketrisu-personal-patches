#!/usr/bin/env node
'use strict'

const path = require('node:path')
const {
    parseCanonicalOutput,
    runChildWithFileCapture,
    validateCanonicalResult,
} = require('../src/verification-evidence.cjs')
const { routeCurrentC0, validateC0Decision } = require('../src/c0-policy.cjs')

function parseArgs(argv) {
    const options = {
        root: null,
        jobs: null,
        allowReviewing: false,
        requestedLane: null,
        changeCategories: [],
        stableRelease: false,
        dispute: false,
        evidenceConsistent: true,
        correctness: 'unknown',
        budget: 'unknown',
        unsupported: false,
        decisionOnly: false,
    }
    for (let index = 2; index < argv.length; index += 1) {
        const argument = argv[index]
        if (argument === '--root') options.root = path.resolve(argv[++index])
        else if (argument === '--jobs') {
            const value = argv[++index]
            if (!/^[1-9]\d*$/.test(value ?? '')) throw new Error('--jobs requires a positive integer')
            options.jobs = Number(value)
            if (!Number.isSafeInteger(options.jobs)) throw new Error('--jobs requires a positive safe integer')
        } else if (argument === '--allow-reviewing') options.allowReviewing = true
        else if (argument === '--lane') options.requestedLane = argv[++index]
        else if (argument === '--change-category') options.changeCategories.push(argv[++index])
        else if (argument === '--stable-release') options.stableRelease = true
        else if (argument === '--dispute') options.dispute = true
        else if (argument === '--inconsistent-evidence') options.evidenceConsistent = false
        else if (argument === '--correctness') options.correctness = argv[++index]
        else if (argument === '--budget') options.budget = argv[++index]
        else if (argument === '--unsupported') options.unsupported = true
        else if (argument === '--decision-only') options.decisionOnly = true
        else if (argument === '--json') continue
        else throw new Error(`Unknown argument: ${argument}`)
    }
    if (!options.decisionOnly && !options.root) {
        throw new Error('C0 execution requires --root unless --decision-only is used')
    }
    return options
}

async function executeC0(options, {
    runner = runChildWithFileCapture,
    sourceRoot = path.resolve(__dirname, '..'),
} = {}) {
    const decision = validateC0Decision(routeCurrentC0(options))
    if (options.decisionOnly || decision.outcome === 'admission-rejected') {
        return {
            schema: 'patch-c0-execution-v1',
            decision,
            canonicalResult: null,
            execution: null,
            accepted: options.decisionOnly,
        }
    }
    const checker = path.join(sourceRoot, 'scripts', 'verify-all-combinations.cjs')
    const checkerArgs = ['--root', options.root, '--json']
    if (options.jobs !== null) checkerArgs.push('--jobs', String(options.jobs))
    if (options.allowReviewing) checkerArgs.push('--allow-reviewing')
    const execution = await runner(process.execPath, [checker, ...checkerArgs], {
        cwd: sourceRoot,
    })
    const canonicalResult = parseCanonicalOutput(execution.stdout)
    const verifierErrors = validateCanonicalResult(canonicalResult)
    const accepted = execution.spawnError === null
        && execution.outputError === null
        && execution.exitCode === 0
        && execution.signal === null
        && Buffer.byteLength(execution.stdout) > 0
        && Buffer.byteLength(execution.stderr) === 0
        && verifierErrors.length === 0
    return {
        schema: 'patch-c0-execution-v1',
        decision,
        canonicalResult,
        execution: {
            exitCode: execution.exitCode,
            signal: execution.signal,
            spawnError: execution.spawnError,
            outputError: execution.outputError,
            stdoutBytes: Buffer.byteLength(execution.stdout),
            stderrBytes: Buffer.byteLength(execution.stderr),
            verifierErrors,
        },
        accepted,
    }
}

async function main(argv = process.argv) {
    const options = parseArgs(argv)
    const result = await executeC0(options)
    process.stdout.write(`${JSON.stringify(result)}\n`)
    if (!result.accepted) process.exitCode = 1
    return result
}

if (require.main === module) {
    main().catch((error) => {
        process.stderr.write(`${JSON.stringify({ code: error.code ?? null, message: error.message })}\n`)
        process.exitCode = 1
    })
}

module.exports = { executeC0, main, parseArgs }
