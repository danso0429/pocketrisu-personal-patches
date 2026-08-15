#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn, execFileSync } = require('node:child_process')
const {
    assertOutputOutsideInputs,
    captureInputFreeze,
    compareInputFreeze,
    pathIsInside,
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
const {
    buildEvidenceBundle,
    evaluateC0EvidenceBundle,
} = require('../src/c0-evidence.cjs')
const {
    routeCurrentC0,
} = require('../src/c0-policy.cjs')
const {
    publishEvidenceObject,
} = require('../src/c0-retention.cjs')

const DEFAULT_GOVERNANCE_REPOSITORY = 'https://github.com/danso0429/patch-verification-governance'
const GNU_TIME = '/usr/bin/time'
const SAMPLE_INTERVAL_MS = 100
const MAX_WRAPPER_OUTPUT_BYTES = 16 * 1024 * 1024

function positiveInteger(value, flag) {
    if (!/^[1-9]\d*$/.test(value ?? '')) throw new Error(`${flag} requires a positive integer`)
    const parsed = Number(value)
    if (!Number.isSafeInteger(parsed)) throw new Error(`${flag} requires a positive safe integer`)
    return parsed
}

function parseArgs(argv) {
    const options = {
        governanceRepository: DEFAULT_GOVERNANCE_REPOSITORY,
        jobs: null,
        cohortClass: null,
        trialId: null,
        materiallyDistinct: false,
        repeatedPerformanceTrial: false,
        disposition: 'current-active',
        stableRelease: false,
        changeCategories: [],
        focusedGates: null,
        productGates: null,
        syntheticResult: null,
        temporaryParent: os.tmpdir(),
    }
    for (let index = 2; index < argv.length; index += 1) {
        const argument = argv[index]
        const next = () => {
            if (index + 1 >= argv.length) throw new Error(`${argument} requires a value`)
            index += 1
            return argv[index]
        }
        if (argument === '--root') options.root = path.resolve(next())
        else if (argument === '--bundle') options.bundle = path.resolve(next())
        else if (argument === '--global-receipt') options.globalReceipt = path.resolve(next())
        else if (argument === '--governance-repository') options.governanceRepository = next()
        else if (argument === '--governance-commit') options.governanceCommit = next()
        else if (argument === '--governance-status-version') options.governanceStatusVersion = positiveInteger(next(), argument)
        else if (argument === '--jobs') options.jobs = positiveInteger(next(), argument)
        else if (argument === '--cohort-class') options.cohortClass = next()
        else if (argument === '--trial-id') options.trialId = next()
        else if (argument === '--materially-distinct') options.materiallyDistinct = true
        else if (argument === '--repeated-performance-trial') options.repeatedPerformanceTrial = true
        else if (argument === '--stable-release') options.stableRelease = true
        else if (argument === '--change-category') options.changeCategories.push(next())
        else if (argument === '--focused-gates') options.focusedGates = path.resolve(next())
        else if (argument === '--product-gates') options.productGates = path.resolve(next())
        else if (argument === '--synthetic-known-answer-result') options.syntheticResult = path.resolve(next())
        else if (argument === '--temporary-parent') options.temporaryParent = path.resolve(next())
        else if (argument === '--store') options.store = path.resolve(next())
        else if (argument === '--disposition') options.disposition = next()
        else throw new Error(`Unknown argument: ${argument}`)
    }
    for (const field of ['root', 'bundle', 'globalReceipt', 'store', 'governanceCommit', 'governanceStatusVersion', 'cohortClass', 'trialId']) {
        if (options[field] === null || options[field] === undefined || options[field] === '') {
            throw new Error(`Missing required option: ${field}`)
        }
    }
    if (!/^[0-9a-f]{40}$/.test(options.governanceCommit)) {
        throw new Error('--governance-commit requires exactly 40 lowercase hex characters')
    }
    if (!['stable-release', 'patch', 'relation', 'core', 'audit'].includes(options.cohortClass)) {
        throw new Error('--cohort-class must be stable-release, patch, relation, core or audit')
    }
    if (!validateDisposition(options.disposition)) {
        throw new Error(`--disposition must be one of: ${RECEIPT_DISPOSITIONS.join(', ')}`)
    }
    if (!fs.statSync(options.temporaryParent).isDirectory()) {
        throw new Error('--temporary-parent must name an existing directory')
    }
    if (options.syntheticResult === null) {
        if (options.materiallyDistinct === options.repeatedPerformanceTrial) {
            throw new Error('Production runs require exactly one of --materially-distinct or --repeated-performance-trial')
        }
    } else if (options.materiallyDistinct || options.repeatedPerformanceTrial) {
        throw new Error('Synthetic known answers cannot be material cohorts or performance trials')
    }
    if (options.stableRelease && options.cohortClass !== 'stable-release') {
        throw new Error('--stable-release requires --cohort-class stable-release')
    }
    if (new Set(options.changeCategories).size !== options.changeCategories.length) {
        throw new Error('Duplicate --change-category values are not allowed')
    }
    return options
}

function parseInternalArgs(argv) {
    if (argv.length !== 6 || argv[2] !== '--internal-capture' || argv[4] !== '--internal-result') {
        throw new Error('Internal usage: run-c0-evidence.cjs --internal-capture REQUEST.json --internal-result RESULT.json')
    }
    return { request: path.resolve(argv[3]), result: path.resolve(argv[5]) }
}

function allocatedDirectoryBytes(root) {
    let total = 0
    const visit = (entry) => {
        let stat
        try {
            stat = fs.lstatSync(entry)
        } catch (error) {
            if (error.code === 'ENOENT') return
            throw error
        }
        total += Number(stat.blocks ?? 0) * 512
        if (!stat.isDirectory()) return
        for (const name of fs.readdirSync(entry)) visit(path.join(entry, name))
    }
    visit(root)
    return total
}

function parseGnuTime(encoded) {
    const line = encoded.trim().split(/\r?\n/).find((value) => value.startsWith('patch-c0-time-v1\t'))
    if (!line) throw new Error('GNU time resource record is missing')
    const fields = line.split('\t')
    if (fields.length !== 4) throw new Error('GNU time resource record is malformed')
    const userSeconds = Number(fields[1])
    const systemSeconds = Number(fields[2])
    const maximumRssKiB = Number(fields[3])
    if (
        !Number.isFinite(userSeconds)
        || userSeconds < 0
        || !Number.isFinite(systemSeconds)
        || systemSeconds < 0
        || !Number.isSafeInteger(maximumRssKiB)
        || maximumRssKiB < 0
    ) throw new Error('GNU time resource values are invalid')
    return {
        processGroupCpuMs: Number(((userSeconds + systemSeconds) * 1000).toFixed(3)),
        maximumRssKiB,
    }
}

function readCapturedFile(file, limit = MAX_WRAPPER_OUTPUT_BYTES) {
    const size = fs.statSync(file).size
    if (size > limit) throw new Error(`Wrapper capture exceeds ${limit} bytes: ${file}`)
    return fs.readFileSync(file, 'utf8')
}

function runMeasuredWrapper(command, args, { cwd, env, temporaryRoot }) {
    const stdoutFile = path.join(temporaryRoot, 'wrapper.stdout')
    const stderrFile = path.join(temporaryRoot, 'wrapper.stderr')
    const timeFile = path.join(temporaryRoot, 'wrapper.time')
    const stdoutFd = fs.openSync(stdoutFile, 'wx', 0o600)
    const stderrFd = fs.openSync(stderrFile, 'wx', 0o600)
    const baselineBytes = allocatedDirectoryBytes(temporaryRoot)
    let sampledPeakBytes = baselineBytes
    const started = process.hrtime.bigint()
    return new Promise((resolve) => {
        let spawnError = null
        const child = spawn(GNU_TIME, [
            '-f',
            'patch-c0-time-v1\t%U\t%S\t%M',
            '-o',
            timeFile,
            '--',
            command,
            ...args,
        ], {
            cwd,
            env: { ...env, LC_NUMERIC: 'C' },
            detached: process.platform !== 'win32',
            stdio: ['ignore', stdoutFd, stderrFd],
        })
        const sample = () => {
            try {
                sampledPeakBytes = Math.max(sampledPeakBytes, allocatedDirectoryBytes(temporaryRoot))
            } catch {
                // A final synchronous sample below is authoritative for post-run residue.
            }
        }
        const timer = setInterval(sample, SAMPLE_INTERVAL_MS)
        timer.unref()
        child.once('error', (error) => {
            spawnError = { code: error.code ?? null, message: error.message }
        })
        child.once('close', (exitCode, signal) => {
            clearInterval(timer)
            fs.closeSync(stdoutFd)
            fs.closeSync(stderrFd)
            const postRunResidueBytes = allocatedDirectoryBytes(temporaryRoot)
            sampledPeakBytes = Math.max(sampledPeakBytes, postRunResidueBytes)
            resolve({
                exitCode,
                signal,
                spawnError,
                wallMs: Number(process.hrtime.bigint() - started) / 1e6,
                baselineBytes,
                sampledPeakBytes,
                postRunResidueBytes,
                stdout: readCapturedFile(stdoutFile),
                stderr: readCapturedFile(stderrFile),
                time: fs.existsSync(timeFile) ? parseGnuTime(fs.readFileSync(timeFile, 'utf8')) : null,
            })
        })
    })
}

function readGateList(file, label) {
    if (file === null) return [{
        name: `${label}-gates-not-supplied`,
        result: 'not-run',
        receiptObjectSha256: null,
        detailsSha256: null,
    }]
    const value = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!Array.isArray(value)) throw new Error(`${label} gates must be a JSON array`)
    return value
}

function implementationRepository(sourceRoot) {
    const value = execFileSync('git', [
        '--no-pager',
        '-C',
        sourceRoot,
        'remote',
        'get-url',
        'origin',
    ], { encoding: 'utf8' }).trim()
    if (!value) throw new Error('Implementation origin is missing')
    return value
}

function makeSyntheticVerifier(temporaryRoot, resultFile) {
    const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'))
    const errors = validateVerificationResult('global-exhaustive', result)
    if (errors.length > 0) throw new Error(`Synthetic known-answer result is invalid: ${errors.join('; ')}`)
    const scripts = path.join(temporaryRoot, 'scripts')
    fs.mkdirSync(scripts, { mode: 0o700 })
    const verifier = path.join(scripts, 'verify-all-combinations.cjs')
    fs.writeFileSync(
        verifier,
        `#!/usr/bin/env node\n'use strict'\nprocess.stdout.write(${JSON.stringify(`${JSON.stringify(result)}\n`)})\n`,
        { mode: 0o700, flag: 'wx' },
    )
    return verifier
}

async function internalCapture(request) {
    const wrapperCpuStart = process.cpuUsage()
    const sourceRoot = request.sourceRoot
    const verifier = request.syntheticResult === null
        ? path.join(sourceRoot, 'scripts', 'verify-all-combinations.cjs')
        : makeSyntheticVerifier(request.temporaryRoot, request.syntheticResult)
    const verifierArgs = ['--root', request.root, '--json']
    if (request.jobs !== null) verifierArgs.push('--jobs', String(request.jobs))
    const command = [process.execPath, verifier, ...verifierArgs]
    const runtimeBefore = runtimeEnvelope({ root: request.root })
    const before = await captureInputFreeze({ sourceRoot, targetRoot: request.root })
    const execution = await runChildWithFileCapture(command[0], command.slice(1), {
        cwd: sourceRoot,
        env: process.env,
    })
    const after = await captureInputFreeze({ sourceRoot, targetRoot: request.root })
    const runtimeAfter = runtimeEnvelope({ root: request.root })
    const runtimeComparison = compareRuntimeEnvelopes(runtimeBefore, runtimeAfter)
    const stability = compareInputFreeze(before, after)
    const verifierResult = parseCanonicalOutput(execution.stdout)
    const verifierErrors = validateVerificationResult('global-exhaustive', verifierResult)
    const stdoutBytes = Buffer.byteLength(execution.stdout)
    const accepted = execution.spawnError === null
        && execution.outputError === null
        && execution.exitCode === 0
        && execution.signal === null
        && stdoutBytes > 0
        && Buffer.byteLength(execution.stderr) === 0
        && verifierErrors.length === 0
        && stability.matched
        && runtimeComparison.matched
    const disposition = accepted
        ? request.disposition
        : (request.disposition === 'current-active' ? 'defect-reproduction' : request.disposition)
    const receipt = sealDocument({
        schema: 'patch-verification-execution-receipt-v2',
        verificationKind: 'global-exhaustive',
        disposition,
        timestamp: new Date().toISOString(),
        command,
        options: { jobs: request.jobs, allowReviewing: false, targetProvenance: null },
        before,
        after,
        stability,
        runtime: { before: runtimeBefore, after: runtimeAfter, comparison: runtimeComparison },
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
    const wrapperCpu = process.cpuUsage(wrapperCpuStart)
    return {
        receipt,
        wrapperCpuMs: Number(((wrapperCpu.user + wrapperCpu.system) / 1000).toFixed(3)),
    }
}

async function internalMain(argv) {
    const options = parseInternalArgs(argv)
    const request = JSON.parse(fs.readFileSync(options.request, 'utf8'))
    const result = await internalCapture(request)
    writeJsonAtomic(options.result, result)
    return result
}

async function main(argv = process.argv) {
    if (argv[2] === '--internal-capture') return internalMain(argv)
    const options = parseArgs(argv)
    const sourceRoot = path.resolve(__dirname, '..')
    const bundleOutput = assertOutputOutsideInputs(options.bundle, [sourceRoot, options.root])
    const receiptOutput = assertOutputOutsideInputs(options.globalReceipt, [sourceRoot, options.root])
    if (bundleOutput === receiptOutput) throw new Error('Bundle and Global receipt outputs must differ')
    if (pathIsInside(options.store, sourceRoot) || pathIsInside(options.store, options.root)) {
        throw new Error('Evidence store must be outside source and target input roots')
    }
    if (fs.existsSync(bundleOutput) || fs.existsSync(receiptOutput)) {
        throw new Error('Evidence outputs already exist; immutable outputs are never overwritten')
    }
    if (!fs.existsSync(GNU_TIME)) throw new Error(`${GNU_TIME} is required for process-group resource capture`)
    const temporaryRoot = fs.mkdtempSync(path.join(options.temporaryParent, 'patch-c0-evidence-'))
    const requestFile = path.join(temporaryRoot, 'request.json')
    const internalResultFile = path.join(temporaryRoot, 'internal-result.json')
    writeJsonAtomic(requestFile, {
        sourceRoot,
        root: options.root,
        jobs: options.jobs,
        disposition: options.disposition,
        syntheticResult: options.syntheticResult,
        temporaryRoot,
    })
    const measured = await runMeasuredWrapper(process.execPath, [
        path.resolve(__filename),
        '--internal-capture',
        requestFile,
        '--internal-result',
        internalResultFile,
    ], {
        cwd: sourceRoot,
        env: { ...process.env, TMPDIR: temporaryRoot, TMP: temporaryRoot, TEMP: temporaryRoot },
        temporaryRoot,
    })
    if (measured.spawnError !== null || measured.exitCode !== 0 || measured.signal !== null || measured.stderr !== '') {
        throw new Error(`C0 evidence capture wrapper failed: ${JSON.stringify({
            exitCode: measured.exitCode,
            signal: measured.signal,
            spawnError: measured.spawnError,
            stderr: measured.stderr,
        })}`)
    }
    if (measured.stdout !== '') throw new Error('C0 evidence capture wrapper emitted unexpected stdout')
    if (!measured.time) throw new Error('C0 evidence process-group resource measurement is missing')
    const internalResult = JSON.parse(fs.readFileSync(internalResultFile, 'utf8'))
    const globalReceipt = internalResult.receipt
    const totalCpuMs = Math.max(measured.time.processGroupCpuMs, internalResult.wrapperCpuMs)
    const wrapperCpuMs = Math.min(internalResult.wrapperCpuMs, totalCpuMs)
    const childCpuMs = Number((totalCpuMs - wrapperCpuMs).toFixed(3))
    const acceptedExecution = globalReceipt.accepted === true
    let temporaryRetained = !acceptedExecution
    if (acceptedExecution) {
        fs.rmSync(temporaryRoot, { recursive: true })
        temporaryRetained = false
    }
    const resources = {
        measurementSchema: 'patch-c0-resource-measurement-v1',
        wallMs: measured.wallMs,
        cpu: { wrapperMs: wrapperCpuMs, childrenMs: childCpuMs, totalMs: totalCpuMs },
        maximumRssKiB: measured.time.maximumRssKiB,
        temporary: {
            root: temporaryRoot,
            baselineBytes: measured.baselineBytes,
            sampledPeakBytes: measured.sampledPeakBytes,
            postRunResidueBytes: measured.postRunResidueBytes,
            sampleIntervalMs: SAMPLE_INTERVAL_MS,
            retained: temporaryRetained,
        },
    }
    const runKind = options.syntheticResult === null ? 'production-c0' : 'synthetic-known-answer'
    const correctness = acceptedExecution ? 'passed' : 'failed'
    const c0Decision = routeCurrentC0({
        changeCategories: options.changeCategories,
        stableRelease: options.stableRelease,
        correctness,
        budget: 'unknown',
    })
    const receiptPublication = publishEvidenceObject(options.store, globalReceipt)
    const bundle = buildEvidenceBundle({
        sourceRoot,
        globalReceipt,
        resources,
        governanceRepository: options.governanceRepository,
        governanceCommit: options.governanceCommit,
        governanceStatusVersion: options.governanceStatusVersion,
        implementationRepository: implementationRepository(sourceRoot),
        runKind,
        cohortClass: options.cohortClass,
        trialId: options.trialId,
        materiallyDistinct: options.materiallyDistinct,
        repeatedPerformanceTrial: options.repeatedPerformanceTrial,
        focusedGates: readGateList(options.focusedGates, 'focused'),
        productGates: readGateList(options.productGates, 'product'),
        c0Decision,
        referencedObjectsNewPhysicalBytes: receiptPublication.newPhysicalBytes,
    })
    const evaluation = evaluateC0EvidenceBundle(bundle, { globalReceipt })
    if (!evaluation.bundleValid) {
        throw new Error(`Generated C0 evidence bundle is invalid: ${evaluation.structuralErrors.join('; ')}`)
    }
    const bundlePublication = publishEvidenceObject(options.store, bundle)
    writeJsonAtomic(receiptOutput, globalReceipt)
    writeJsonAtomic(bundleOutput, bundle)
    process.stdout.write(`${JSON.stringify({
        schema: 'patch-c0-evidence-run-result-v1',
        bundle: bundleOutput,
        globalReceipt: receiptOutput,
        cohortId: bundle.cohort.cohortId,
        runId: bundle.cohort.runId,
        runKind,
        temporaryRetained,
        resources,
        publications: {
            globalReceipt: receiptPublication,
            bundle: bundlePublication,
            totalNewPhysicalBytes: receiptPublication.newPhysicalBytes + bundlePublication.newPhysicalBytes,
        },
        evaluation,
    })}\n`)
    if (!evaluation.bundleValid || (runKind === 'production-c0' && !evaluation.operatingEvidenceAccepted)) {
        process.exitCode = 1
    }
    return { bundle, globalReceipt, evaluation }
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error.stack || error.message)
        process.exitCode = 1
    })
}

module.exports = {
    allocatedDirectoryBytes,
    internalCapture,
    main,
    parseArgs,
    parseGnuTime,
    runMeasuredWrapper,
}
