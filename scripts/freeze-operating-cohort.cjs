#!/usr/bin/env node
'use strict'

const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const {
    buildCohortIdentity,
    buildFrozenCohortDeclaration,
    buildMaterialInputIdentity,
    buildVerificationIdentities,
    classifyMaterialDistinctness,
    createExecutionAttempt,
    publishFrozenCohortDeclaration,
} = require('../src/operating-cohort-identity.cjs')
const { preflightOperatingCohort } = require('../src/operating-cohort-preflight.cjs')
const { loadToolchainShadowDeclaration } = require('../src/toolchain-shadow-contract.cjs')
const { captureInputFreeze, sha256, writeJsonAtomic } = require('../src/verification-evidence.cjs')
const { listEvidenceObjects } = require('../src/c0-retention.cjs')
const { validateCohortLedger } = require('../src/c0-ledgers.cjs')

const DEFAULT_GOVERNANCE_REPOSITORY = 'https://github.com/danso0429/patch-verification-governance'

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
        materiallyDistinct: true,
        repeatedPerformanceTrial: false,
    }
    for (let index = 2; index < argv.length; index += 1) {
        const flag = argv[index]
        const next = () => {
            if (index + 1 >= argv.length) throw new Error(`${flag} requires a value`)
            return argv[++index]
        }
        if (flag === '--store') options.store = path.resolve(next())
        else if (flag === '--qualification-store') options.qualificationStore = path.resolve(next())
        else if (flag === '--expectation') options.expectation = path.resolve(next())
        else if (flag === '--subject-root') options.subjectRoot = path.resolve(next())
        else if (flag === '--target-root') options.targetRoot = path.resolve(next())
        else if (flag === '--governance-repository') options.governanceRepository = next()
        else if (flag === '--governance-commit') options.governanceCommit = next()
        else if (flag === '--governance-status-version') options.governanceStatusVersion = positiveInteger(next(), flag)
        else if (flag === '--jobs') options.jobs = positiveInteger(next(), flag)
        else if (flag === '--output') options.output = path.resolve(next())
        else if (flag === '--attempt-created-at') options.attemptCreatedAt = next()
        else if (flag === '--attempt-nonce') options.attemptNonce = next()
        else if (flag === '--repeated-performance-trial') {
            options.materiallyDistinct = false
            options.repeatedPerformanceTrial = true
        }
        else throw new Error(`Unknown option: ${flag}`)
    }
    for (const key of [
        'store', 'qualificationStore', 'expectation', 'subjectRoot', 'targetRoot',
        'governanceCommit', 'governanceStatusVersion', 'output',
    ]) if (!options[key]) throw new Error(`Missing required option: ${key}`)
    if (!/^[0-9a-f]{40}$/.test(options.governanceCommit)) throw new Error('--governance-commit is invalid')
    if (!fs.existsSync(path.dirname(options.output)) || fs.existsSync(options.output)) {
        throw new Error('Freeze output parent must exist and output must be new')
    }
    return options
}

function toolingRepository(sourceRoot) {
    return execFileSync('git', ['--no-pager', '-C', sourceRoot, 'remote', 'get-url', 'origin'], {
        encoding: 'utf8',
        env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
    }).trim()
}

function acceptedEntries(storeRoot) {
    if (!fs.existsSync(storeRoot)) return []
    const ledgers = listEvidenceObjects(storeRoot)
        .map((record) => record.document)
        .filter((document) => document?.schema === 'patch-c0-cohort-ledger-v2')
    if (ledgers.length === 0) return []
    const baseHashes = new Set(ledgers.map((ledger) => ledger.baseLedgerObjectSha256).filter(Boolean))
    const heads = ledgers.filter((ledger) => !baseHashes.has(require('../src/c0-retention.cjs').objectSha256(ledger)))
    if (heads.length !== 1) throw new Error('C0 cohort ledger does not have one unique maximal head')
    const evaluation = validateCohortLedger(heads[0], { expectedKind: 'cohort' })
    if (!evaluation.valid) throw new Error(`C0 cohort ledger is invalid: ${evaluation.errors.join('; ')}`)
    return heads[0].entries
}

async function freezeOperatingCohort(options, dependencies = {}) {
    const sourceRoot = path.resolve(__dirname, '..')
    const declaration = JSON.parse(fs.readFileSync(options.expectation, 'utf8'))
    const preflight = (dependencies.preflightOperatingCohort ?? preflightOperatingCohort)({
        storeRoot: options.qualificationStore,
        expectation: declaration,
        subjectRoot: options.subjectRoot,
    })
    const routeDecision = preflight.machineRouteDecision
    if (!routeDecision.safeToExecute) {
        throw new Error(`Operating route is not safe to freeze: ${routeDecision.blockers.join(', ')}`)
    }
    const freeze = await (dependencies.captureInputFreeze ?? captureInputFreeze)({
        sourceRoot,
        targetRoot: options.targetRoot,
    })
    if (freeze.source.git.status !== '' || freeze.source.git.commit.length !== 40) {
        throw new Error('Verification tooling must be clean before cohort freeze')
    }
    if (freeze.target.provenance.kind !== 'git'
        || freeze.target.provenance.status !== ''
        || freeze.target.provenance.commit !== declaration.qualification.subject.targetCommit
        || freeze.target.applicationTree.rootSha256
            !== declaration.qualification.subject.targetApplicationTreeSha256) {
        throw new Error('Target identity differs before cohort freeze')
    }
    const compiled = (dependencies.loadToolchainShadowDeclaration
        ?? loadToolchainShadowDeclaration)(options.subjectRoot, { targetRoot: options.targetRoot })
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
    const governance = {
        repository: options.governanceRepository,
        commit: options.governanceCommit,
        statusVersion: options.governanceStatusVersion,
    }
    const materialInput = buildMaterialInputIdentity({ declaration, governance })
    const classification = classifyMaterialDistinctness({
        materialInputKey: materialInput.materialInputKey,
        acceptedEntries: (dependencies.acceptedEntries ?? acceptedEntries)(options.store),
        requestedMateriallyDistinct: options.materiallyDistinct,
        requestedRepeatedPerformanceTrial: options.repeatedPerformanceTrial,
    })
    const tooling = {
        repository: (dependencies.toolingRepository ?? toolingRepository)(sourceRoot),
        commit: freeze.source.git.commit,
        statusSha256: sha256(freeze.source.git.status),
    }
    const cohort = buildCohortIdentity({
        declaration,
        governance,
        routeDecision,
        routeDecisionInputs: preflight.routeDecisionInputs,
        preflight,
        materialInput,
        tooling,
        verificationIdentities: (dependencies.buildVerificationIdentities
            ?? buildVerificationIdentities)(sourceRoot),
        jobs: options.jobs,
        localDomain,
    })
    const attempt = createExecutionAttempt({
        cohortId: cohort.cohortId,
        toolingCommit: tooling.commit,
        createdAt: options.attemptCreatedAt,
        nonce: options.attemptNonce,
        creator: 'scripts/freeze-operating-cohort.cjs',
    })
    const frozenDeclaration = buildFrozenCohortDeclaration({
        materialInput,
        cohort,
        attempt,
        declaration,
        routeDecision,
        materialClassification: classification,
    })
    const published = publishFrozenCohortDeclaration(options.store, frozenDeclaration)
    writeJsonAtomic(options.output, frozenDeclaration)
    return {
        schema: 'patch-operating-cohort-freeze-result-v1',
        output: options.output,
        materialInputKey: materialInput.materialInputKey,
        cohortId: cohort.cohortId,
        executionAttemptId: attempt.executionAttemptId,
        frozenDeclarationSha256: published.publication.objectSha256,
        routeId: routeDecision.routeId,
        globalExecutionsExpected: routeDecision.globalExecutionsExpected,
        localCasesExpected: routeDecision.totalLocalCasesExpected,
        safeToExecute: routeDecision.safeToExecute,
        sameInputCohortFound: classification.sameInputCohortFound,
        materiallyDistinct: classification.materiallyDistinct,
        repeatedPerformanceTrial: classification.repeatedPerformanceTrial,
        localExecutionsPerformed: 0,
        globalExecutionsPerformed: 0,
        publication: published,
        preflight,
    }
}

async function main(argv = process.argv) {
    const options = parseArgs(argv)
    const result = await freezeOperatingCohort(options)
    process.stdout.write(`${JSON.stringify(result)}\n`)
    return result
}

if (require.main === module) {
    main().catch((error) => {
        process.stderr.write(`${JSON.stringify({ code: error.code ?? null, message: error.message, details: error.details ?? null })}\n`)
        process.exitCode = 1
    })
}

module.exports = { acceptedEntries, freezeOperatingCohort, main, parseArgs, toolingRepository }
