#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const {
    assertOutputOutsideInputs,
    captureInputFreeze,
    compareInputFreeze,
    pathIsInside,
    parseCanonicalOutput,
    runChildWithFileCapture,
    runChild,
    sha256,
    validateVerificationResult,
    writeJsonAtomic,
} = require('../src/verification-evidence.cjs')
const {
    RECEIPT_DISPOSITIONS,
    computeGlobalRunId,
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
    loadEvidenceObject,
} = require('../src/c0-retention.cjs')
const {
    candidateContractRoot,
    candidateContractVersion,
    preflightOperatingCohort,
} = require('../src/operating-cohort-preflight.cjs')
const { runFreshLocalShadow } = require('../src/toolchain-shadow-local.cjs')
const { loadToolchainShadowDeclaration } = require('../src/toolchain-shadow-contract.cjs')
const { buildSameGlobalReference } = require('../src/toolchain-shadow-same-global.cjs')
const {
    ROUTE_COMBINED,
    createOneGlobalExecutionGuard,
    validateRouteDecision,
} = require('../src/operating-cohort-route.cjs')
const {
    LINKAGE_SCHEMA_V2,
    buildCandidateOperatingLinkage,
    validateCandidateOperatingLinkageRecord,
} = require('../src/operating-cohort-linkage.cjs')
const {
    buildCohortIdentity,
    buildMaterialInputIdentity,
    buildVerificationIdentities,
    claimGlobalLaunch,
    loadOperatingEnvironmentForAttempt,
    validateFrozenCohortDeclaration,
} = require('../src/operating-cohort-identity.cjs')
const {
    buildOperatingGateEvidence,
    validateOperatingGateEvidence,
} = require('../src/operating-cohort-gates.cjs')
const {
    buildOperatingBoundaryFailure,
    cleanupProvisionedEnvironment,
    verifyCurrentOperatingBuildEnvironment,
} = require('../src/operating-build-environment.cjs')

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
        else if (argument === '--operating-expectation') options.operatingExpectation = path.resolve(next())
        else if (argument === '--qualification-store') options.qualificationStore = path.resolve(next())
        else if (argument === '--qualified-subject-root') options.qualifiedSubjectRoot = path.resolve(next())
        else if (argument === '--local-shadow-receipt') options.localShadowReceipt = path.resolve(next())
        else if (argument === '--candidate-linkage') options.candidateLinkage = path.resolve(next())
        else if (argument === '--frozen-declaration') options.frozenDeclaration = next()
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
    if (options.syntheticResult === null) {
        for (const field of ['operatingExpectation', 'qualificationStore', 'qualifiedSubjectRoot', 'frozenDeclaration']) {
            if (!options[field]) throw new Error(`Material C0 runs require --${field.replace(/[A-Z]/g, (value) => `-${value.toLowerCase()}`)}`)
        }
        if (!/^[0-9a-f]{64}$/.test(options.frozenDeclaration)) {
            throw new Error('--frozen-declaration requires an evidence object SHA-256')
        }
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

function prepareOperatingGateEvidence({
    file, gateKind, frozenDeclaration, frozenDeclarationObjectSha256, store,
}) {
    let document
    if (file === null) {
        document = buildOperatingGateEvidence({
            gateKind,
            frozenDeclaration,
            frozenDeclarationObjectSha256,
            gates: [{
                name: `${gateKind}-gates-not-supplied`,
                result: 'not-run',
                receiptObjectSha256: null,
                detailsSha256: null,
            }],
        })
    } else {
        document = JSON.parse(fs.readFileSync(file, 'utf8'))
        validateOperatingGateEvidence(document, {
            gateKind,
            frozenDeclaration,
            frozenDeclarationObjectSha256,
        })
    }
    const publication = publishEvidenceObject(store, document)
    return {
        document,
        publication,
        reference: {
            objectSha256: publication.objectSha256,
            payloadSha256: document.integrity.payloadSha256,
        },
    }
}

async function implementationRepository(sourceRoot) {
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')))
    env.GIT_CONFIG_NOSYSTEM = '1'
    env.GIT_CONFIG_GLOBAL = os.devNull
    env.GIT_OPTIONAL_LOCKS = '0'
    env.GIT_TERMINAL_PROMPT = '0'
    const result = await runChild('git', [
        '--no-pager',
        '-C',
        sourceRoot,
        'remote',
        'get-url',
        'origin',
    ], { cwd: sourceRoot, env })
    if (
        result.spawnError !== null
        || result.outputError !== null
        || result.exitCode !== 0
        || result.signal !== null
        || result.stderr !== ''
    ) {
        throw new Error(`Implementation origin lookup failed: ${JSON.stringify(result)}`)
    }
    const value = result.stdout.trim()
    if (!value) throw new Error('Implementation origin is missing')
    return value
}

async function validateCurrentFrozenInputs({
    sourceRoot,
    targetRoot,
    subjectRoot,
    declaration,
    routeDecision,
    preflight,
    frozenDeclaration,
    governance,
    jobs,
    dependencies = {},
}) {
    const capture = await (dependencies.captureInputFreeze ?? captureInputFreeze)({
        sourceRoot,
        targetRoot,
    })
    if (capture.source.git.status !== ''
        || capture.target.provenance.kind !== 'git'
        || capture.target.provenance.status !== ''
        || capture.target.provenance.commit !== frozenDeclaration.target.commit
        || capture.target.applicationTree.rootSha256 !== frozenDeclaration.target.applicationTreeSha256) {
        throw new Error('Current source or target differs from the frozen pre-execution contract')
    }
    const compiled = (dependencies.loadToolchainShadowDeclaration
        ?? loadToolchainShadowDeclaration)(candidateContractRoot(
        subjectRoot, declaration, sourceRoot,
    ), {
        targetRoot,
        contractVersion: candidateContractVersion(declaration),
    })
    const localDomain = routeDecision.totalLocalCasesExpected === 0 ? {
        candidateId: null,
        masks: [],
        boundaryClasses: [],
        totalLocalCases: 0,
    } : {
        candidateId: compiled.pack.id,
        masks: [0, 1],
        boundaryClasses: [...compiled.boundaryClassIds],
        totalLocalCases: 2 * compiled.boundaryClassIds.length,
    }
    const materialInput = buildMaterialInputIdentity({ declaration, governance })
    const currentCohort = buildCohortIdentity({
        declaration,
        governance,
        routeDecision,
        routeDecisionInputs: preflight.routeDecisionInputs,
        preflight,
        materialInput,
        tooling: {
            repository: await (dependencies.implementationRepository
                ?? implementationRepository)(sourceRoot),
            commit: capture.source.git.commit,
            statusSha256: sha256(capture.source.git.status),
        },
        verificationIdentities: (dependencies.buildVerificationIdentities
            ?? buildVerificationIdentities)(sourceRoot),
        jobs,
        localDomain,
    })
    if (materialInput.materialInputKey !== frozenDeclaration.materialInputKey
        || currentCohort.cohortId !== frozenDeclaration.cohortId) {
        throw new Error('Current material or verification inputs differ from the frozen cohort identity')
    }
    return { capture, materialInput, cohort: currentCohort }
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

function publishLocalEvidenceBeforeGlobal({ store, localReceipt, localFailure }) {
    if (localReceipt !== null && localFailure !== null) {
        throw new Error('Local receipt and local failure cannot both be preserved')
    }
    const localEvidence = localReceipt ?? localFailure
    return localEvidence === null ? null : publishEvidenceObject(store, localEvidence)
}

function buildLocalFailureDetails(error, operatingEnvironmentReceipt) {
    if (error.code !== 'BUILD_BOUNDARY_MISMATCH' || operatingEnvironmentReceipt === null) {
        return error.details ?? null
    }
    return {
        ...(error.details ?? {}),
        nodeExecutable: operatingEnvironmentReceipt.node.executable,
        nodeExecutableSha256: operatingEnvironmentReceipt.node.executableSha256,
        pnpmExecutable: operatingEnvironmentReceipt.pnpm.resolvedExecutable,
        pnpmExecutableSha256: operatingEnvironmentReceipt.pnpm.executableSha256,
        resolution: operatingEnvironmentReceipt.resolution,
        provisioningIdentity: {
            schema: operatingEnvironmentReceipt.schema,
            integrityPayloadSha256: operatingEnvironmentReceipt.integrity.payloadSha256,
        },
    }
}

function publishPreMaterialFailure({
    store,
    bundleOutput,
    localShadowOutput,
    frozenDeclaration,
    frozenDeclarationObjectSha256,
    provisioningReceiptObjectSha256,
    error,
    operatingPreflight,
    emitResult = true,
}) {
    const failure = buildOperatingBoundaryFailure({
        error,
        frozenDeclaration,
        frozenDeclarationSha256: frozenDeclarationObjectSha256,
        provisioningReceiptSha256: provisioningReceiptObjectSha256,
    })
    const publication = publishEvidenceObject(store, failure)
    writeJsonAtomic(bundleOutput, failure)
    if (localShadowOutput !== null) writeJsonAtomic(localShadowOutput, failure)
    const result = {
        schema: 'patch-c0-pre-material-failure-result-v1',
        status: 'failed-before-material-execution',
        code: failure.code,
        materialInputKey: frozenDeclaration?.materialInputKey ?? null,
        cohortId: frozenDeclaration?.cohortId ?? null,
        executionAttemptId: frozenDeclaration?.executionAttemptId ?? null,
        evidenceBundleId: failure.evidenceBundleId,
        failureObjectSha256: publication.objectSha256,
        bundle: bundleOutput,
        localShadowReceipt: localShadowOutput,
        globalReceipt: null,
        operatingPreflight,
        localCasesStarted: 0,
        localCasesCompleted: 0,
        globalLaunchClaims: 0,
        globalExecutions: 0,
        materialCohortAccepted: false,
        candidateOperatingSampleAccepted: false,
        publication,
    }
    if (emitResult) {
        process.stdout.write(`${JSON.stringify(result)}\n`)
        process.exitCode = 1
    }
    return { failure, result }
}

async function internalCapture(request) {
    const wrapperCpuStart = process.cpuUsage()
    const sourceRoot = request.sourceRoot
    const verifier = request.syntheticResult === null
        ? path.join(sourceRoot, 'scripts', 'verify-all-combinations.cjs')
        : makeSyntheticVerifier(request.temporaryRoot, request.syntheticResult)
    let localReceipt = null
    let localFailure = null
    let sameGlobalReference = null
    const operatingCohort = request.frozenDeclaration === null ? null : {
        materialInputKey: request.frozenDeclaration.materialInputKey,
        cohortId: request.frozenDeclaration.cohortId,
        executionAttemptId: request.frozenDeclaration.executionAttemptId,
        frozenDeclarationSha256: request.frozenDeclarationObjectSha256,
    }
    if (request.routeDecision?.routeId === ROUTE_COMBINED) {
        try {
            localReceipt = await runFreshLocalShadow({
                sourceRoot: candidateContractRoot(
                    request.qualifiedSubjectRoot,
                    request.materialDeclaration,
                    request.sourceRoot,
                ),
                targetRoot: request.root,
                disposition: 'material-shadow',
                operatingCohort,
                buildBoundaryObserver: () => require('../src/toolchain-shadow-boundaries.cjs')
                    .observeBuildBoundary({
                        pnpmExecutable: request.operatingEnvironmentReceipt.pnpm.launcherExecutable,
                        env: process.env,
                    }),
            })
            sameGlobalReference = buildSameGlobalReference({
                localReceipt,
                materialDeclarationSha256: request.materialDeclaration.declarationSha256,
                materialInputKey: operatingCohort?.materialInputKey ?? null,
                cohortId: operatingCohort?.cohortId ?? null,
                executionAttemptId: operatingCohort?.executionAttemptId ?? null,
                frozenDeclarationSha256: operatingCohort?.frozenDeclarationSha256 ?? null,
            })
        } catch (error) {
            const preCaseBoundaryFailure = ['BUILD_BOUNDARY_MISMATCH',
                'BUILD_BOUNDARY_OBSERVATION_FAILED'].includes(error.code)
            const localFailureDetails = buildLocalFailureDetails(
                error,
                request.operatingEnvironmentReceipt,
            )
            localFailure = sealDocument({
                schema: 'patch-toolchain-shadow-local-failure-v1',
                status: 'failed',
                code: error.code ?? 'UNKNOWN_LOCAL_SHADOW_FAILURE',
                message: error.message,
                details: localFailureDetails,
                phase: error.code === 'BUILD_BOUNDARY_MISMATCH'
                    ? 'local-runtime-build-boundary-admission'
                    : 'local-shadow',
                executionState: {
                    casesStarted: preCaseBoundaryFailure ? 0 : null,
                    casesCompleted: preCaseBoundaryFailure ? 0 : null,
                    globalLaunchClaim: 'absent',
                    globalExecutions: 0,
                },
                materialDeclarationSha256: request.materialDeclaration.declarationSha256,
                ...(operatingCohort === null ? {} : { operatingCohort }),
                recordedAt: new Date().toISOString(),
            })
        }
    }
    const localPublication = publishLocalEvidenceBeforeGlobal({
        store: request.store,
        localReceipt,
        localFailure,
    })
    const verifierArgs = ['--root', request.root, '--json']
    if (request.jobs !== null) verifierArgs.push('--jobs', String(request.jobs))
    if (sameGlobalReference !== null) {
        verifierArgs.push(
            '--toolchain-shadow-reference-base64',
            Buffer.from(JSON.stringify(sameGlobalReference)).toString('base64url'),
        )
    }
    const command = [process.execPath, verifier, ...verifierArgs]
    const runtimeBefore = runtimeEnvelope({ root: request.root })
    const before = await captureInputFreeze({ sourceRoot, targetRoot: request.root })
    const globalGuard = createOneGlobalExecutionGuard((...args) => runChildWithFileCapture(...args))
    let launchClaim = null
    if (request.frozenDeclaration !== null) {
        launchClaim = claimGlobalLaunch({
            storeRoot: request.store,
            frozenDeclaration: request.frozenDeclaration,
            frozenDeclarationObjectSha256: request.frozenDeclarationObjectSha256,
        })
    }
    const execution = await globalGuard.execute(command[0], command.slice(1), {
        cwd: sourceRoot, env: process.env,
    })
    if (globalGuard.executions() !== 1) throw new Error('Material C0 route did not execute Global exactly once')
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
    const receiptPayload = {
        schema: 'patch-verification-execution-receipt-v2',
        verificationKind: 'global-exhaustive',
        disposition,
        timestamp: new Date().toISOString(),
        command,
        options: {
            jobs: request.jobs,
            allowReviewing: false,
            targetProvenance: null,
            ...(request.routeDecision === null ? {} : { operatingRoute: {
                routeId: request.routeDecision.routeId,
                materialDeclarationSha256: request.routeDecision.materialDeclarationSha256,
                decisionSha256: request.routeDecision.decisionSha256,
                globalExecutionsExpected: request.routeDecision.globalExecutionsExpected,
                candidateComparisonStatus: request.routeDecision.routeId === ROUTE_COMBINED
                    ? (localFailure === null ? 'required' : 'skipped-local-failure')
                    : 'not-applicable',
                operatingCohort,
            } }),
        },
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
        ...(operatingCohort === null ? {} : { globalRunId: '0'.repeat(64) }),
    }
    if (operatingCohort !== null) receiptPayload.globalRunId = computeGlobalRunId(receiptPayload)
    const receipt = sealDocument(receiptPayload)
    const wrapperCpu = process.cpuUsage(wrapperCpuStart)
    return {
        receipt,
        localReceipt,
        localFailure,
        localPublication,
        globalExecutions: globalGuard.executions(),
        launchClaim,
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
    let materialDeclaration = null
    let operatingPreflight = null
    let routeDecision = null
    let frozenDeclaration = null
    let frozenDeclarationObjectSha256 = null
    let operatingGateEvidence = null
    let operatingEnvironment = null
    let currentOperatingEnvironment = null
    const bundleOutput = assertOutputOutsideInputs(options.bundle, [sourceRoot, options.root])
    const receiptOutput = assertOutputOutsideInputs(options.globalReceipt, [sourceRoot, options.root])
    const localShadowOutput = options.localShadowReceipt === undefined
        ? null
        : assertOutputOutsideInputs(options.localShadowReceipt, [sourceRoot, options.root])
    const candidateLinkageOutput = options.candidateLinkage === undefined
        ? null
        : assertOutputOutsideInputs(options.candidateLinkage, [sourceRoot, options.root])
    if (bundleOutput === receiptOutput) throw new Error('Bundle and Global receipt outputs must differ')
    if (pathIsInside(options.store, sourceRoot) || pathIsInside(options.store, options.root)) {
        throw new Error('Evidence store must be outside source and target input roots')
    }
    if ([bundleOutput, receiptOutput, localShadowOutput, candidateLinkageOutput]
        .filter((value) => value !== null).some((value) => fs.existsSync(value))) {
        throw new Error('Evidence outputs already exist; immutable outputs are never overwritten')
    }
    if (options.syntheticResult === null) {
        materialDeclaration = JSON.parse(fs.readFileSync(options.operatingExpectation, 'utf8'))
        const frozenRecord = loadEvidenceObject(options.store, options.frozenDeclaration)
        frozenDeclaration = validateFrozenCohortDeclaration(frozenRecord.document)
        frozenDeclarationObjectSha256 = frozenRecord.objectSha256
        let preMaterialError = null
        try {
            operatingEnvironment = loadOperatingEnvironmentForAttempt({
                storeRoot: options.store,
                frozenDeclaration,
                frozenDeclarationObjectSha256,
                requireExecutable: true,
            })
            currentOperatingEnvironment = verifyCurrentOperatingBuildEnvironment(
                operatingEnvironment.receipt,
            )
        } catch (error) {
            preMaterialError = error
        }
        operatingPreflight = preflightOperatingCohort({
            storeRoot: options.qualificationStore,
            expectation: materialDeclaration,
            subjectRoot: options.qualifiedSubjectRoot,
            operatingEnvironmentReceipt: preMaterialError === null
                ? operatingEnvironment.receipt
                : null,
        })
        routeDecision = validateRouteDecision(operatingPreflight.machineRouteDecision, {
            declaration: materialDeclaration,
            ...operatingPreflight.routeDecisionInputs,
        })
        if (preMaterialError !== null || !routeDecision.safeToExecute) {
            const error = preMaterialError ?? Object.assign(
                new Error(`Operating route is not safe to execute: ${routeDecision.blockers.join(', ')}`),
                {
                    code: 'OPERATING_PREFLIGHT_BLOCKED',
                    details: {
                        phase: 'pre-material-operating-route-admission',
                        blockers: routeDecision.blockers,
                        qualificationFreshVerification:
                            operatingPreflight.freshVerificationInCurrentExecutionEnvironment,
                        operatingEnvironmentProvisioned: routeDecision.operatingEnvironmentProvisioned,
                        operatingBuildBoundaryVerification:
                            routeDecision.operatingBuildBoundaryVerification,
                        casesStarted: 0,
                        globalLaunchClaimState: 'absent',
                        globalExecutions: 0,
                    },
                },
            )
            const publishedFailure = publishPreMaterialFailure({
                store: options.store,
                bundleOutput,
                localShadowOutput,
                frozenDeclaration,
                frozenDeclarationObjectSha256,
                provisioningReceiptObjectSha256:
                    operatingEnvironment?.receiptObjectSha256
                        ?? preMaterialError?.details?.provisioningReceiptObjectSha256
                        ?? null,
                error,
                operatingPreflight,
                emitResult: false,
            })
            publishedFailure.result.operatingEnvironmentCleaned = operatingEnvironment === null
                ? null
                : cleanupProvisionedEnvironment(
                    operatingEnvironment.receipt.resolution.temporaryRoot,
                )
            process.stdout.write(`${JSON.stringify(publishedFailure.result)}\n`)
            process.exitCode = 1
            return publishedFailure
        }
        if (routeDecision.routeId === ROUTE_COMBINED
            && (!options.localShadowReceipt || !options.candidateLinkage)) {
            throw new Error('Combined material route requires --local-shadow-receipt and --candidate-linkage')
        }
        if (routeDecision.routeId !== ROUTE_COMBINED
            && (options.localShadowReceipt || options.candidateLinkage)) {
            throw new Error('Global-only material route cannot request candidate shadow outputs')
        }
        if (frozenDeclaration.materialDeclarationSha256 !== materialDeclaration.declarationSha256
            || frozenDeclaration.route.routeId !== routeDecision.routeId
            || frozenDeclaration.route.decisionSha256 !== routeDecision.decisionSha256
            || frozenDeclaration.route.globalExecutionsExpected !== routeDecision.globalExecutionsExpected
            || JSON.stringify(frozenDeclaration.cohortIdentity.qualification)
                !== JSON.stringify(operatingPreflight.qualificationIdentity)
            || frozenDeclaration.materialClassification.materiallyDistinct !== options.materiallyDistinct
            || frozenDeclaration.materialClassification.repeatedPerformanceTrial !== options.repeatedPerformanceTrial) {
            throw new Error('Frozen declaration differs from the current machine preflight')
        }
        await validateCurrentFrozenInputs({
            sourceRoot,
            targetRoot: options.root,
            subjectRoot: options.qualifiedSubjectRoot,
            declaration: materialDeclaration,
            routeDecision,
            preflight: operatingPreflight,
            frozenDeclaration,
            governance: {
                repository: options.governanceRepository,
                commit: options.governanceCommit,
                statusVersion: options.governanceStatusVersion,
            },
            jobs: options.jobs,
        })
        if (options.focusedGates === null) {
            throw new Error('Material C0 execution requires frozen focused-gate evidence')
        }
    }
    if (!fs.existsSync(GNU_TIME)) throw new Error(`${GNU_TIME} is required for process-group resource capture`)
    if (frozenDeclaration !== null) {
        operatingGateEvidence = {
            focused: prepareOperatingGateEvidence({
                file: options.focusedGates,
                gateKind: 'focused',
                frozenDeclaration,
                frozenDeclarationObjectSha256,
                store: options.store,
            }),
            product: prepareOperatingGateEvidence({
                file: options.productGates,
                gateKind: 'product',
                frozenDeclaration,
                frozenDeclarationObjectSha256,
                store: options.store,
            }),
        }
        const blockingFocusedGates = operatingGateEvidence.focused.document.gates
            .filter((gate) => !['passed', 'not-applicable'].includes(gate.result))
        if (blockingFocusedGates.length > 0) {
            throw new Error(`Focused gates do not permit material execution: ${blockingFocusedGates
                .map((gate) => `${gate.name}:${gate.result}`).join(', ')}`)
        }
    }
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
        qualifiedSubjectRoot: options.qualifiedSubjectRoot ?? null,
        materialDeclaration,
        routeDecision,
        store: options.store,
        frozenDeclaration,
        frozenDeclarationObjectSha256,
        operatingEnvironmentReceipt: operatingEnvironment?.receipt ?? null,
    })
    const measured = await runMeasuredWrapper(process.execPath, [
        path.resolve(__filename),
        '--internal-capture',
        requestFile,
        '--internal-result',
        internalResultFile,
    ], {
        cwd: sourceRoot,
        env: {
            ...(currentOperatingEnvironment?.effectiveEnv ?? process.env),
            TMPDIR: temporaryRoot,
            TMP: temporaryRoot,
            TEMP: temporaryRoot,
        },
        temporaryRoot,
    })
    let operatingEnvironmentCleaned = null
    if (operatingEnvironment !== null) {
        operatingEnvironmentCleaned = cleanupProvisionedEnvironment(
            operatingEnvironment.receipt.resolution.temporaryRoot,
        )
    }
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
    if (internalResult.globalExecutions !== 1) throw new Error('Global execution count differs from one')
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
    let localPublication = internalResult.localPublication ?? null
    const localEvidence = internalResult.localReceipt ?? internalResult.localFailure
    if (localEvidence !== null) {
        const independentlyPublished = publishEvidenceObject(options.store, localEvidence)
        if (localPublication === null) localPublication = independentlyPublished
        else if (localPublication.objectSha256 !== independentlyPublished.objectSha256) {
            throw new Error('Pre-Global local evidence publication identity changed')
        }
    }
    const bundle = buildEvidenceBundle({
        sourceRoot,
        globalReceipt,
        resources,
        governanceRepository: options.governanceRepository,
        governanceCommit: options.governanceCommit,
        governanceStatusVersion: options.governanceStatusVersion,
        implementationRepository: await implementationRepository(sourceRoot),
        runKind,
        cohortClass: options.cohortClass,
        trialId: options.trialId,
        materiallyDistinct: options.materiallyDistinct,
        repeatedPerformanceTrial: options.repeatedPerformanceTrial,
        focusedGates: operatingGateEvidence?.focused.document.gates
            ?? readGateList(options.focusedGates, 'focused'),
        productGates: operatingGateEvidence?.product.document.gates
            ?? readGateList(options.productGates, 'product'),
        gateEvidence: operatingGateEvidence === null ? null : {
            focused: operatingGateEvidence.focused.reference,
            product: operatingGateEvidence.product.reference,
        },
        globalLaunchClaimObjectSha256:
            internalResult.launchClaim?.objectPublication?.objectSha256 ?? null,
        c0Decision,
        referencedObjectsNewPhysicalBytes: receiptPublication.newPhysicalBytes
            + (localPublication?.newPhysicalBytes ?? 0)
            + (operatingGateEvidence?.focused.publication.newPhysicalBytes ?? 0)
            + (operatingGateEvidence?.product.publication.newPhysicalBytes ?? 0)
            + (internalResult.launchClaim?.objectPublication?.newPhysicalBytes ?? 0)
            + (internalResult.launchClaim?.appendOnlyPublication?.physicalBytes ?? 0),
        operatingRoute: routeDecision === null ? null : {
            routeId: routeDecision.routeId,
            materialDeclarationSha256: routeDecision.materialDeclarationSha256,
            decisionSha256: routeDecision.decisionSha256,
            globalExecutionsExpected: routeDecision.globalExecutionsExpected,
            candidateShadowExpected: routeDecision.routeId === ROUTE_COMBINED,
        },
        frozenDeclaration,
        frozenDeclarationObjectSha256,
        localReceipt: internalResult.localReceipt,
        localReceiptObjectSha256: internalResult.localReceipt === null
            ? null : localPublication?.objectSha256 ?? null,
        localFailure: internalResult.localFailure,
        localFailureObjectSha256: internalResult.localFailure === null
            ? null : localPublication?.objectSha256 ?? null,
    })
    const evaluation = evaluateC0EvidenceBundle(bundle, {
        globalReceipt,
        localReceipt: internalResult.localReceipt,
        localFailure: internalResult.localFailure,
        gateEvidenceDocuments: operatingGateEvidence === null ? null : {
            focused: operatingGateEvidence.focused.document,
            product: operatingGateEvidence.product.document,
        },
        globalLaunchClaim: internalResult.launchClaim?.claim ?? null,
    })
    if (!evaluation.bundleValid) {
        throw new Error(`Generated C0 evidence bundle is invalid: ${evaluation.structuralErrors.join('; ')}`)
    }
    const bundlePublication = publishEvidenceObject(options.store, bundle)
    let candidateLinkage = null
    let candidateLinkagePublication = null
    if (routeDecision?.routeId === ROUTE_COMBINED) {
        if (internalResult.localReceipt !== null
            && globalReceipt.verifierResult?.toolchainShadowComparison !== undefined) {
            candidateLinkage = buildCandidateOperatingLinkage({
                bundle, globalReceipt, localReceipt: internalResult.localReceipt,
                localReceiptObjectSha256: localPublication.objectSha256,
                declaration: materialDeclaration, routeDecision,
            })
        } else {
            candidateLinkage = sealDocument({
                schema: LINKAGE_SCHEMA_V2,
                status: 'failed',
                routeId: ROUTE_COMBINED,
                materialInputKey: bundle.cohort.materialInputKey,
                cohortId: bundle.cohort.cohortId,
                executionAttemptId: bundle.cohort.executionAttemptId,
                frozenDeclarationSha256: bundle.frozenDeclarationObjectSha256,
                localRunId: internalResult.localReceipt?.localRunId ?? null,
                globalRunId: globalReceipt.globalRunId,
                evidenceBundleId: bundle.evidenceBundleId,
                materialDeclarationSha256: materialDeclaration.declarationSha256,
                routeDecisionSha256: routeDecision.decisionSha256,
                localFailure: internalResult.localFailure,
                localEvidenceObjectSha256: localPublication?.objectSha256 ?? null,
                globalReceiptObjectSha256: receiptPublication.objectSha256,
                reason: internalResult.localFailure !== null
                    ? 'local-shadow-failed-before-same-Global-comparison'
                    : 'global-execution-did-not-produce-same-Global-comparison',
            })
        }
        validateCandidateOperatingLinkageRecord(candidateLinkage,
            internalResult.localReceipt !== null
                && globalReceipt.verifierResult?.toolchainShadowComparison !== undefined ? {
                bundle, globalReceipt, localReceipt: internalResult.localReceipt,
                localReceiptObjectSha256: localPublication.objectSha256,
                declaration: materialDeclaration, routeDecision,
            } : null)
        candidateLinkagePublication = publishEvidenceObject(options.store, candidateLinkage)
    }
    writeJsonAtomic(receiptOutput, globalReceipt)
    writeJsonAtomic(bundleOutput, bundle)
    if (localShadowOutput !== null) writeJsonAtomic(localShadowOutput, localEvidence)
    if (candidateLinkageOutput !== null) writeJsonAtomic(candidateLinkageOutput, candidateLinkage)
    process.stdout.write(`${JSON.stringify({
        schema: 'patch-c0-evidence-run-result-v1',
        bundle: bundleOutput,
        globalReceipt: receiptOutput,
        cohortId: bundle.cohort.cohortId,
        executionAttemptId: bundle.cohort.executionAttemptId ?? null,
        evidenceBundleId: bundle.evidenceBundleId ?? bundle.cohort.runId,
        globalRunId: globalReceipt.globalRunId ?? bundle.cohort.runId,
        runKind,
        route: routeDecision,
        operatingPreflight,
        operatingEnvironment: operatingEnvironment === null ? null : {
            provisioningReceiptObjectSha256: operatingEnvironment.receiptObjectSha256,
            bindingObjectSha256: operatingEnvironment.bindingObjectSha256,
            currentBuildBoundaryVerification: currentOperatingEnvironment.status,
            provisionedEnvironmentCleaned: operatingEnvironmentCleaned,
        },
        localShadowReceipt: localShadowOutput,
        candidateLinkage: candidateLinkageOutput,
        temporaryRetained,
        resources,
        publications: {
            globalReceipt: receiptPublication,
            bundle: bundlePublication,
            totalNewPhysicalBytes: receiptPublication.newPhysicalBytes
                + bundlePublication.newPhysicalBytes
                + (localPublication?.newPhysicalBytes ?? 0)
                + (candidateLinkagePublication?.newPhysicalBytes ?? 0)
                + (operatingGateEvidence?.focused.publication.newPhysicalBytes ?? 0)
                + (operatingGateEvidence?.product.publication.newPhysicalBytes ?? 0)
                + (internalResult.launchClaim?.objectPublication?.newPhysicalBytes ?? 0)
                + (internalResult.launchClaim?.appendOnlyPublication?.physicalBytes ?? 0),
            localShadow: localPublication,
            candidateLinkage: candidateLinkagePublication,
            focusedGateEvidence: operatingGateEvidence?.focused.publication ?? null,
            productGateEvidence: operatingGateEvidence?.product.publication ?? null,
            globalLaunchClaim: internalResult.launchClaim ?? null,
        },
        evaluation,
    })}\n`)
    if (!evaluation.bundleValid || (runKind === 'production-c0' && !evaluation.operatingEvidenceAccepted)
        || candidateLinkage?.status === 'failed') {
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
    buildLocalFailureDetails,
    implementationRepository,
    internalCapture,
    main,
    validateCurrentFrozenInputs,
    parseArgs,
    parseGnuTime,
    publishLocalEvidenceBeforeGlobal,
    publishPreMaterialFailure,
    runMeasuredWrapper,
}
