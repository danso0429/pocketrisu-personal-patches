#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const {
    canonicalJsonBytes,
    parseJsonStrict,
    sha256,
} = require('../src/qualification-object-store.cjs')
const {
    REAL_GLOBAL_QUALIFICATION_TYPE,
    effectiveRegistryEntry,
    resolveVerifiedQualificationRegistryHead,
} = require('../src/qualification-registry.cjs')
const {
    provisionRealGlobalQualificationEnvironment,
    validateProvisioningReceipt,
} = require('../src/toolchain-shadow-real-global-qualification.cjs')
const {
    cleanupProvisionedEnvironment,
    provisionOperatingBuildEnvironment,
} = require('../src/operating-build-environment.cjs')
const {
    buildCohortIdentity,
    buildMaterialInputIdentity,
    buildVerificationIdentities,
} = require('../src/operating-cohort-identity.cjs')
const {
    preflightOperatingCohort,
} = require('../src/operating-cohort-preflight.cjs')
const {
    buildSameGlobalReference,
    validateSameGlobalComparison,
} = require('../src/toolchain-shadow-same-global.cjs')
const {
    runFreshLocalShadow,
    validateLocalShadowReceipt,
} = require('../src/toolchain-shadow-local.cjs')
const {
    loadToolchainShadowDeclaration,
} = require('../src/toolchain-shadow-contract.cjs')
const {
    evaluateExecutionReceipt,
} = require('../src/verification-receipts.cjs')
const {
    runChild,
    writeJsonAtomic,
} = require('../src/verification-evidence.cjs')
const {
    accountingFromOutputDirectory,
} = require('../src/toolchain-shadow-qualification-run-accounting.cjs')
const {
    buildQualificationRunIdentity,
    createInitialExecutionState,
    persistQualificationExecutionState,
    preservePrimaryError,
    transitionExecutionState,
} = require('../src/toolchain-shadow-qualification-execution-state.cjs')

function parseArgs(argv) {
    const options = { toolRoot: path.resolve(__dirname, '..'), jobs: null }
    const mapping = {
        '--tool-root': 'toolRoot', '--subject-root': 'subjectRoot', '--target-root': 'targetRoot',
        '--store': 'storeRoot', '--output-directory': 'outputDirectory', '--jobs': 'jobs',
    }
    for (let index = 2; index < argv.length; index += 2) {
        const key = mapping[argv[index]]
        if (!key || index + 1 >= argv.length) throw new Error(`Unknown or incomplete option: ${argv[index]}`)
        options[key] = key === 'jobs' ? Number(argv[index + 1]) : path.resolve(argv[index + 1])
    }
    for (const key of ['subjectRoot', 'targetRoot', 'storeRoot', 'outputDirectory']) {
        if (!options[key]) throw new Error(`Missing required option: ${key}`)
    }
    if (options.jobs !== null && (!Number.isSafeInteger(options.jobs) || options.jobs <= 0)) {
        throw new Error('--jobs requires a positive safe integer')
    }
    return options
}

function requireSuccessfulChild(result, label) {
    if (result.spawnError !== null || result.outputError !== null || result.exitCode !== 0
        || result.signal !== null || result.stderr !== '') {
        const error = new Error(`${label} failed`)
        error.code = `${label.toUpperCase().replaceAll(/[^A-Z0-9]+/g, '_')}_FAILED`
        error.details = result
        throw error
    }
    return result
}

async function toolingRepository(toolRoot) {
    const result = requireSuccessfulChild(await runChild('git', [
        '--no-pager', '-C', toolRoot, 'remote', 'get-url', 'origin',
    ], { cwd: toolRoot, maxOutputBytes: 1024 * 1024 }), 'tooling repository identity')
    const repository = result.stdout.trim()
    if (repository.length === 0) throw new Error('Tooling repository identity is empty')
    return repository
}

async function main(argv = process.argv) {
    const options = parseArgs(argv)
    if (fs.existsSync(options.outputDirectory)) throw new Error('Qualification output directory already exists')
    fs.mkdirSync(options.outputDirectory, { recursive: false, mode: 0o700 })
    const files = Object.fromEntries(Object.entries({
        subject: 'subject.json', sourceIdentity: 'source-identity.json',
        materialDeclaration: 'material-declaration-v2.json', provisioning: 'provisioning.json',
        local: 'local-receipt.json', reference: 'same-global-reference.json',
        global: 'global-receipt.json', registration: 'registration.json',
        operatingProvisioning: 'operating-preflight-provisioning.json',
        operatingPreflight: 'operating-preflight.json',
        qualificationRun: 'qualification-run.json',
        executionState: 'execution-state.json',
        accounting: 'run-accounting.json',
    }).map(([key, name]) => [key, path.join(options.outputDirectory, name)]))
    const identityResult = requireSuccessfulChild(await runChild(process.execPath, [
        path.join(__dirname, 'build-toolchain-shadow-v2-identities.cjs'),
        '--tool-root', options.toolRoot, '--subject-root', options.subjectRoot,
        '--target-root', options.targetRoot, '--subject-output', files.subject,
        '--source-identity-output', files.sourceIdentity,
        '--material-declaration-output', files.materialDeclaration,
    ], { cwd: options.toolRoot, maxOutputBytes: 8 * 1024 * 1024 }), 'identity construction')
    const subject = parseJsonStrict(fs.readFileSync(files.subject), 'v2 subject')
    const sourceIdentity = parseJsonStrict(fs.readFileSync(files.sourceIdentity), 'v2 source identity')
    const materialDeclaration = parseJsonStrict(
        fs.readFileSync(files.materialDeclaration), 'v2 material declaration',
    )
    const current = resolveVerifiedQualificationRegistryHead(options.storeRoot)
    const existing = effectiveRegistryEntry(current.registry, subject, REAL_GLOBAL_QUALIFICATION_TYPE)
    if (existing.state !== 'not-found') throw new Error('V2 qualification already has a registry disposition')
    let provisioned = null
    let localLaunches = 0
    let globalLaunches = 0
    const qualificationRun = buildQualificationRunIdentity({
        subject, sourceIdentity, materialDeclaration,
    })
    writeJsonAtomic(files.qualificationRun, qualificationRun)
    let executionState = createInitialExecutionState({ runIdentity: qualificationRun })
    persistQualificationExecutionState(files.executionState, {
        next: executionState,
        runIdentity: qualificationRun,
    })
    const advanceExecutionState = (transition) => {
        const next = transitionExecutionState(executionState, {
            ...transition,
            runIdentity: qualificationRun,
        })
        persistQualificationExecutionState(files.executionState, {
            previous: executionState,
            next,
            runIdentity: qualificationRun,
        })
        executionState = next
        return executionState
    }
    try {
        provisioned = await provisionRealGlobalQualificationEnvironment({
            context: subject,
            temporaryParent: options.outputDirectory,
        })
        writeJsonAtomic(files.provisioning, provisioned.receipt)
        validateProvisioningReceipt(provisioned.receipt, { requireExecutable: true })
        advanceExecutionState({
            phase: 'provisioning-retained',
            provisioningReceiptSha256: sha256(canonicalJsonBytes(provisioned.receipt)),
        })
        const originalPath = process.env.PATH
        process.env.PATH = provisioned.env.PATH
        let localReceipt
        try {
            if (localLaunches !== 0) throw new Error('Second local qualification launch is forbidden')
            advanceExecutionState({
                phase: 'local-launch-recorded-before-execution',
                local: { ...executionState.local, launches: 1 },
            })
            localLaunches = 1
            localReceipt = await runFreshLocalShadow({
                sourceRoot: options.toolRoot,
                targetRoot: options.targetRoot,
                disposition: 'qualification-v2',
            })
        } finally {
            if (originalPath === undefined) delete process.env.PATH
            else process.env.PATH = originalPath
        }
        validateLocalShadowReceipt(localReceipt)
        writeJsonAtomic(files.local, localReceipt)
        advanceExecutionState({
            phase: 'local-receipt-retained',
            local: {
                launches: 1,
                casesCompleted: localReceipt.coverage.processedExecutions,
                receiptRetained: true,
            },
        })
        const reference = buildSameGlobalReference({ localReceipt })
        writeJsonAtomic(files.reference, reference)
        if (globalLaunches !== 0) throw new Error('Second Global qualification launch is forbidden')
        advanceExecutionState({
            phase: 'global-launch-recorded-before-execution',
            global: { ...executionState.global, launches: 1 },
        })
        globalLaunches = 1
        const globalArgs = [
            path.join(__dirname, 'run-verification-evidence.cjs'),
            '--root', options.targetRoot, '--output', files.global,
            '--disposition', 'diagnostic-only', '--verification', 'global-exhaustive',
            '--toolchain-shadow-reference', files.reference,
        ]
        if (options.jobs !== null) globalArgs.push('--jobs', String(options.jobs))
        requireSuccessfulChild(await runChild(process.execPath, globalArgs, {
            cwd: options.toolRoot,
            env: provisioned.env,
            maxOutputBytes: 16 * 1024 * 1024,
        }), 'real Global qualification')
        const globalReceipt = parseJsonStrict(fs.readFileSync(files.global), 'v2 Global receipt')
        advanceExecutionState({
            phase: 'global-receipt-retained',
            global: {
                launches: 1,
                masksCompleted: globalReceipt.verifierResult?.verifiedSelections ?? null,
                receiptRetained: true,
            },
        })
        const evaluation = evaluateExecutionReceipt(globalReceipt)
        const comparison = globalReceipt.verifierResult?.toolchainShadowComparison
        validateSameGlobalComparison(comparison, globalReceipt.verifierResult)
        if (!evaluation.receiptValid || !evaluation.executionAccepted
            || comparison.status !== 'passed' || comparison.mismatches !== 0) {
            throw new Error('V2 real-Global qualification comparison did not pass')
        }
        advanceExecutionState({ phase: 'comparison-passed' })
        advanceExecutionState({ phase: 'verification-and-registration-started' })
        const registrationResult = requireSuccessfulChild(await runChild(process.execPath, [
            path.join(__dirname, 'register-toolchain-shadow-real-global-qualification-v2.cjs'),
            '--store', options.storeRoot, '--subject', files.subject,
            '--source-identity', files.sourceIdentity, '--provisioning', files.provisioning,
            '--local-receipt', files.local, '--global-receipt', files.global,
            '--reason', 'canonical-projection-v2-real-global-requalification',
            '--tool-root', options.toolRoot, '--subject-root', options.subjectRoot,
        ], {
            cwd: options.toolRoot, env: provisioned.env, maxOutputBytes: 32 * 1024 * 1024,
        }), 'v2 qualification registration')
        const registration = parseJsonStrict(registrationResult.stdout, 'v2 registration report')
        writeJsonAtomic(files.registration, registration)
        advanceExecutionState({ phase: 'registration-complete' })
        let operatingProvisioned = null
        let operatingPreflight
        let materialInput
        let cohort
        try {
            operatingProvisioned = await provisionOperatingBuildEnvironment({
                temporaryParent: options.outputDirectory,
                context: {
                    subjectCommit: subject.implementationCommit,
                    toolingCommit: subject.qualificationToolCommit,
                    toolingStatusSha256: sha256(''),
                    targetCommit: subject.targetCommit,
                    targetApplicationTreeSha256: subject.targetApplicationTreeSha256,
                },
            })
            writeJsonAtomic(files.operatingProvisioning, operatingProvisioned.receipt)
            operatingPreflight = preflightOperatingCohort({
                storeRoot: options.storeRoot,
                expectation: materialDeclaration,
                subjectRoot: options.subjectRoot,
                operatingEnvironmentReceipt: operatingProvisioned.receipt,
            })
            if (operatingPreflight.freshVerificationInCurrentExecutionEnvironment !== 'passed'
                || operatingPreflight.candidate.qualificationVersion !== 'v2'
                || operatingPreflight.candidate.projectionVersion !== 'v2'
                || operatingPreflight.candidate.qualificationCompatible !== true
                || operatingPreflight.route.routeId !== 'material-c0-global-plus-toolchain-shadow'
                || operatingPreflight.route.safeToExecute !== true
                || operatingPreflight.candidate.totalLocalCasesExpected !== 8
                || operatingPreflight.route.globalExecutionsExpected !== 1
                || operatingPreflight.blockers.length !== 0) {
                throw new Error('Accepted v2 qualification did not produce an executable non-material preflight')
            }
            const governance = {
                repository: 'https://github.com/danso0429/patch-verification-governance',
                commit: '49d891b12a51745b9da91bf23105d78869cf8664',
                statusVersion: 12,
            }
            const compiled = loadToolchainShadowDeclaration(options.toolRoot, {
                targetRoot: options.targetRoot,
            })
            const localDomain = {
                candidateId: compiled.pack.id,
                masks: [0, 1],
                boundaryClasses: [...compiled.boundaryClassIds],
                totalLocalCases: 2 * compiled.boundaryClassIds.length,
            }
            materialInput = buildMaterialInputIdentity({
                declaration: materialDeclaration,
                governance,
            })
            cohort = buildCohortIdentity({
                declaration: materialDeclaration,
                governance,
                routeDecision: operatingPreflight.machineRouteDecision,
                routeDecisionInputs: operatingPreflight.routeDecisionInputs,
                preflight: operatingPreflight,
                materialInput,
                tooling: {
                    repository: await toolingRepository(options.toolRoot),
                    commit: subject.qualificationToolCommit,
                    statusSha256: sha256(''),
                },
                verificationIdentities: buildVerificationIdentities(options.toolRoot),
                jobs: options.jobs,
                localDomain,
            })
            writeJsonAtomic(files.operatingPreflight, operatingPreflight)
            advanceExecutionState({ phase: 'operating-preflight-complete' })
        } finally {
            if (operatingProvisioned !== null) cleanupProvisionedEnvironment(operatingProvisioned.root)
        }
        advanceExecutionState({ phase: 'completed' })
        const accounting = accountingFromOutputDirectory(options.outputDirectory, { status: 'passed' })
        writeJsonAtomic(files.accounting, accounting)
        const report = {
            schema: 'patch-toolchain-shadow-real-global-qualification-run-v2',
            status: 'passed',
            qualificationType: REAL_GLOBAL_QUALIFICATION_TYPE,
            localLaunches,
            localCasesCompleted: localReceipt.coverage.processedExecutions,
            globalLaunches,
            globalRunId: globalReceipt.globalRunId,
            globalMasksCompleted: globalReceipt.verifierResult.verifiedSelections,
            comparisons: comparison.coverage.processedMasks,
            matches: comparison.matches,
            mismatches: comparison.mismatches,
            provisioningReceiptSha256: sha256(canonicalJsonBytes(provisioned.receipt)),
            localReceiptSha256: sha256(fs.readFileSync(files.local)),
            globalReceiptSha256: sha256(fs.readFileSync(files.global)),
            qualificationIdentity: registration.qualificationIdentity,
            registryEntrySha256: registration.registryEntrySha256,
            registryDescriptorSha256: registration.registryDescriptorSha256,
            registryHeadValid: registration.verifiedRegistryHead.uniqueMaximalHead === true
                && registration.verifiedRegistryHead.currentRefMatchesMaximalHead === true,
            historicalV1StillVerifiable: registration.historicalV1StillVerifiable === true,
            materialInputKey: materialInput.materialInputKey,
            cohortId: cohort.cohortId,
            operatingPreflight: {
                qualificationFreshVerification:
                    operatingPreflight.freshVerificationInCurrentExecutionEnvironment,
                qualificationVersion: operatingPreflight.candidate.qualificationVersion,
                projectionVersion: operatingPreflight.candidate.projectionVersion,
                candidateQualificationCompatible:
                    operatingPreflight.candidate.qualificationCompatible,
                operatingBuildBoundaryVerification:
                    operatingPreflight.operatingEnvironment.buildBoundaryVerification,
                routeId: operatingPreflight.route.routeId,
                safeToExecute: operatingPreflight.route.safeToExecute,
                localCasesExpected: operatingPreflight.candidate.totalLocalCasesExpected,
                globalExecutionsExpected: operatingPreflight.route.globalExecutionsExpected,
                blockers: operatingPreflight.blockers,
            },
            materialExecutions: 0,
            materialGlobalLaunchClaims: 0,
            materialCohortsAccepted: 0,
            candidateOperatingSamplesAccepted: 0,
            identityResultSha256: sha256(identityResult.stdout),
            qualificationRunId: qualificationRun.qualificationRunId,
            executionAccounting: accounting,
            outputs: files,
        }
        process.stdout.write(`${JSON.stringify(report)}\n`)
        return report
    } catch (error) {
        const primaryError = error
        if (!['completed', 'failed'].includes(executionState.phase)) {
            try {
                advanceExecutionState({
                    phase: 'failed',
                    failure: {
                        code: String(primaryError.code ?? 'QUALIFICATION_FAILED'),
                        message: String(primaryError.message),
                    },
                })
            } catch (persistenceError) {
                preservePrimaryError(primaryError, persistenceError)
            }
        }
        let accounting = null
        let accountingFailure = null
        try {
            accounting = accountingFromOutputDirectory(options.outputDirectory, { status: 'failed' })
            writeJsonAtomic(files.accounting, accounting)
        } catch (accountingError) {
            accountingFailure = {
                code: accountingError.code ?? null,
                message: accountingError.message,
            }
        }
        primaryError.details = {
            ...(primaryError.details && typeof primaryError.details === 'object'
                ? primaryError.details
                : {}),
            executionAccounting: accounting,
            accountingPath: files.accounting,
            executionStatePath: files.executionState,
            qualificationRunPath: files.qualificationRun,
            accountingFailure,
        }
        throw primaryError
    } finally {
        if (provisioned !== null) {
            const resolved = path.resolve(provisioned.root)
            if (!path.basename(resolved).startsWith('qualification-pnpm-10.34.1-')
                || path.dirname(resolved) !== options.outputDirectory) {
                throw new Error('Refusing to clean an unrecognized qualification provisioning root')
            }
            fs.rmSync(resolved, { recursive: true, force: true })
        }
    }
}

if (require.main === module) main().catch((error) => {
    process.stderr.write(`${JSON.stringify({
        code: error.code ?? null, message: error.message, details: error.details ?? null,
    })}\n`)
    process.exitCode = 1
})

module.exports = { main, parseArgs, requireSuccessfulChild }
