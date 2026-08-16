'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const {
    BUILD_BOUNDARY_CLASS,
} = require('../src/toolchain-shadow-boundaries.cjs')
const {
    buildOperatingBoundaryFailure,
    buildProvisioningReceipt,
    operatingEnvironmentRouteInput,
    provisionExactPnpm,
    requireAdmittedOperatingBoundary,
    runtimeObservation,
    validateOperatingBoundaryFailure,
    validateProvisioningReceipt,
    verifyCurrentOperatingBuildEnvironment,
} = require('../src/operating-build-environment.cjs')
const {
    decideOperatingCohortRoute,
    declarationHash,
} = require('../src/operating-cohort-route.cjs')
const { verifyDocumentIntegrity } = require('../src/verification-receipts.cjs')
const {
    buildLocalFailureDetails,
    publishPreMaterialFailure,
} = require('../scripts/run-c0-evidence.cjs')

const repositoryRoot = path.resolve(__dirname, '..')
const declarationFile = path.join(repositoryRoot, 'contracts/first-material-c0-toolchain-hardening-v1.json')
const CONTEXT = Object.freeze({
    subjectCommit: '1'.repeat(40),
    toolingCommit: '2'.repeat(40),
    toolingStatusSha256: 'a'.repeat(64),
    targetCommit: '3'.repeat(40),
    targetApplicationTreeSha256: '4'.repeat(64),
})

function successfulSpawn(version = '10.34.1') {
    return () => ({
        error: undefined,
        signal: null,
        status: 0,
        stdout: `${version}\n`,
        stderr: '',
    })
}

function fixture(t, {
    pnpmVersion = '10.34.1',
    libcVersionRuntime = '2.39',
    ambientPath = '/ambient/bin',
    suffix = 'a',
} = {}) {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'operating-boundary-test-'))
    t.after(() => fs.rmSync(parent, { recursive: true, force: true }))
    const root = path.join(parent, `operating-pnpm-10.34.1-${suffix}`)
    const bin = path.join(root, 'node_modules', '.bin')
    fs.mkdirSync(bin, { recursive: true })
    const launcher = path.join(bin, 'pnpm')
    fs.writeFileSync(launcher, '#!/usr/bin/env node\n', { mode: 0o700 })
    const provisioned = {
        root,
        executable: launcher,
        binDirectory: bin,
        receipt: {
            method: 'unique-task-scoped-temporary-installation',
            methodVersion: 'exact-task-scoped-pnpm-v1',
            command: { executable: 'npm', args: [
                'install', '--prefix', root, '--no-package-lock', '--ignore-scripts',
                '--no-audit', '--no-fund', 'pnpm@10.34.1',
            ] },
            installStdoutSha256: '5'.repeat(64),
            installStderrSha256: '6'.repeat(64),
            installExitCode: 0,
            repositoryMutationAllowed: false,
            lockfileMutationAllowed: false,
            cleanupRequired: true,
        },
    }
    const effectivePath = `${bin}${path.delimiter}${ambientPath}`
    const observation = runtimeObservation({
        pnpmExecutable: launcher,
        env: { PATH: effectivePath },
        spawnSync: successfulSpawn(pnpmVersion),
        nodeExecutable: process.execPath,
        nodeVersion: 'v25.9.0',
        platform: 'linux',
        architecture: 'arm64',
        reportHeader: { glibcVersionRuntime: libcVersionRuntime },
    })
    const receipt = buildProvisioningReceipt({
        provisioned,
        observation,
        context: CONTEXT,
        ambientPath,
        effectivePath,
        createdAt: '2026-08-16T00:00:00.000Z',
    })
    return { parent, provisioned, observation, receipt }
}

function materialDeclaration() {
    const declaration = JSON.parse(fs.readFileSync(declarationFile, 'utf8'))
    declaration.declarationSha256 = declarationHash(declaration)
    return declaration
}

function compatibleRouteInputs(declaration, receipt) {
    return {
        declaration,
        qualificationState: {
            accepted: true,
            registryIntegrity: true,
            subject: structuredClone(declaration.qualification.subject),
            compatibility: structuredClone(declaration.qualification.compatibility),
            environment: structuredClone(declaration.environment),
        },
        freshVerification: 'passed',
        candidateDomain: {
            candidateId: 'toolchain-hardening',
            localMasksExpected: 2,
            boundaryClassesExpected: 4,
            totalLocalCasesExpected: 8,
            compiledDeclarationSha256: declaration.qualification.subject.compiledDeclarationSha256,
        },
        ...operatingEnvironmentRouteInput(receipt),
    }
}

test('exact task-scoped Node, pnpm, platform, architecture and libc boundary is admitted', (t) => {
    const { receipt } = fixture(t)
    assert.equal(validateProvisioningReceipt(receipt).status, 'passed')
    assert.equal(requireAdmittedOperatingBoundary(receipt).boundaryComparison.equal, true)
    assert.equal(receipt.requested.nodeVersion, 'v25.9.0')
    assert.equal(receipt.pnpm.observedVersion, '10.34.1')
    assert.equal(receipt.runtime.libc, 'glibc')
})

test('wrong ambient pnpm is ignored in favor of the explicit task-scoped executable', (t) => {
    const { provisioned } = fixture(t)
    let invoked = null
    const observation = runtimeObservation({
        pnpmExecutable: provisioned.executable,
        env: { PATH: '/ambient/pnpm-10.33.0/bin' },
        spawnSync: (command) => {
            invoked = command
            return successfulSpawn()()
        },
        nodeVersion: 'v25.9.0',
        platform: 'linux',
        architecture: 'arm64',
        reportHeader: { glibcVersionRuntime: '2.39' },
    })
    assert.equal(invoked, provisioned.executable)
    assert.equal(observation.comparison.equal, true)
})

test('missing ambient pnpm is immaterial when exact provisioning constructs the executable', async (t) => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'operating-provision-test-'))
    t.after(() => fs.rmSync(parent, { recursive: true, force: true }))
    const provisioned = await provisionExactPnpm({
        temporaryParent: parent,
        purpose: 'operating',
        runChildImpl: async (_command, args) => {
            const root = args[args.indexOf('--prefix') + 1]
            const bin = path.join(root, 'node_modules', '.bin')
            fs.mkdirSync(bin, { recursive: true })
            fs.writeFileSync(path.join(bin, 'pnpm'), '#!/usr/bin/env node\n', { mode: 0o700 })
            return {
                spawnError: null, outputError: null, exitCode: 0, signal: null,
                stdout: 'installed', stderr: '',
            }
        },
    })
    assert.equal(fs.existsSync(provisioned.executable), true)
    assert.equal(provisioned.receipt.repositoryMutationAllowed, false)
    assert.equal(provisioned.receipt.lockfileMutationAllowed, false)
})

test('wrong provisioned pnpm version fails before material execution with a field diff', (t) => {
    const { receipt } = fixture(t, { pnpmVersion: '10.33.0' })
    assert.equal(receipt.status, 'failed')
    assert.throws(() => requireAdmittedOperatingBoundary(receipt), (error) => {
        assert.equal(error.code, 'BUILD_BOUNDARY_MISMATCH')
        assert.equal(error.details.comparison.fields.pnpmVersion.expected, '10.34.1')
        assert.equal(error.details.comparison.fields.pnpmVersion.observed, '10.33.0')
        assert.equal(error.details.casesStarted, 0)
        assert.equal(error.details.globalLaunchClaimState, 'absent')
        assert.equal(error.details.globalExecutions, 0)
        return true
    })
})

test('libc mismatch preserves exact expected and observed values and fails closed', (t) => {
    const { receipt } = fixture(t, { libcVersionRuntime: null })
    assert.throws(() => requireAdmittedOperatingBoundary(receipt), (error) => {
        assert.equal(error.details.comparison.fields.libc.expected, 'glibc')
        assert.equal(error.details.comparison.fields.libc.observed, 'unknown')
        return true
    })
})

test('PATH ambiguity records deterministic explicit resolution without storing ambient PATH text', (t) => {
    const ambient = '/first/pnpm:/second/pnpm'
    const { receipt, provisioned } = fixture(t, { ambientPath: ambient })
    assert.equal(receipt.pnpm.launcherExecutable, provisioned.executable)
    assert.equal(receipt.resolution.pathPrepend, provisioned.binDirectory)
    assert.match(receipt.resolution.ambientPathSha256, /^[0-9a-f]{64}$/)
    assert.doesNotMatch(JSON.stringify(receipt), /\/first\/pnpm/)
})

test('BUILD_BOUNDARY_MISMATCH details survive the durable failure publication model', (t) => {
    const { receipt } = fixture(t, { pnpmVersion: '10.33.0' })
    let mismatch
    try { requireAdmittedOperatingBoundary(receipt) } catch (error) { mismatch = error }
    const failure = buildOperatingBoundaryFailure({
        error: mismatch,
        frozenDeclaration: {
            materialInputKey: '7'.repeat(64),
            cohortId: '8'.repeat(64),
            executionAttemptId: '9'.repeat(64),
        },
        frozenDeclarationSha256: 'a'.repeat(64),
        provisioningReceiptSha256: 'b'.repeat(64),
        recordedAt: '2026-08-16T00:00:01.000Z',
    })
    assert.equal(verifyDocumentIntegrity(failure), true)
    assert.equal(validateOperatingBoundaryFailure(failure), failure)
    assert.equal(failure.details.expected.pnpmVersion, '10.34.1')
    assert.equal(failure.details.observed.pnpmVersion, '10.33.0')
    assert.equal(failure.details.comparison.fields.pnpmVersion.equal, false)
    assert.deepEqual(failure.executionState, {
        localCasesStarted: 0,
        localCasesCompleted: 0,
        globalLaunchClaim: 'absent',
        globalExecutions: 0,
    })
})

test('pre-material runner publication retains mismatch details and creates no execution claim', (t) => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'operating-failure-publication-'))
    t.after(() => fs.rmSync(parent, { recursive: true, force: true }))
    const bundleOutput = path.join(parent, 'failure-bundle.json')
    const localOutput = path.join(parent, 'local-failure.json')
    const error = Object.assign(new Error('Build environment is not admitted'), {
        code: 'BUILD_BOUNDARY_MISMATCH',
        details: {
            phase: 'pre-material-current-host-build-boundary-admission',
            expected: { ...BUILD_BOUNDARY_CLASS },
            observed: { ...BUILD_BOUNDARY_CLASS, pnpmVersion: '10.33.0' },
            comparison: { pnpmVersion: { expected: '10.34.1', observed: '10.33.0', equal: false } },
        },
    })
    const published = publishPreMaterialFailure({
        store: path.join(parent, 'store'),
        bundleOutput,
        localShadowOutput: localOutput,
        frozenDeclaration: {
            materialInputKey: '1'.repeat(64),
            cohortId: '2'.repeat(64),
            executionAttemptId: '3'.repeat(64),
        },
        frozenDeclarationObjectSha256: '4'.repeat(64),
        provisioningReceiptObjectSha256: '5'.repeat(64),
        error,
        operatingPreflight: { qualificationFreshVerification: 'passed' },
        emitResult: false,
    })
    const bundle = JSON.parse(fs.readFileSync(bundleOutput, 'utf8'))
    assert.deepEqual(bundle.details, error.details)
    assert.equal(bundle.evidenceBundleId, published.failure.evidenceBundleId)
    assert.deepEqual(bundle.executionState, {
        localCasesStarted: 0,
        localCasesCompleted: 0,
        globalLaunchClaim: 'absent',
        globalExecutions: 0,
    })
    assert.deepEqual(JSON.parse(fs.readFileSync(localOutput, 'utf8')), bundle)
    assert.equal(fs.existsSync(path.join(parent, 'store', 'attempts')), false)
})

test('local runtime catch enriches a boundary mismatch with the admitted executable identities', (t) => {
    const { receipt } = fixture(t)
    const error = Object.assign(new Error('Build environment drifted'), {
        code: 'BUILD_BOUNDARY_MISMATCH',
        details: {
            expected: { ...BUILD_BOUNDARY_CLASS },
            observed: { ...BUILD_BOUNDARY_CLASS, pnpmVersion: '10.33.0' },
            comparison: { equal: false },
        },
    })
    const details = buildLocalFailureDetails(error, receipt)
    assert.equal(details.nodeExecutable, receipt.node.executable)
    assert.equal(details.nodeExecutableSha256, receipt.node.executableSha256)
    assert.equal(details.pnpmExecutable, receipt.pnpm.resolvedExecutable)
    assert.equal(details.pnpmExecutableSha256, receipt.pnpm.executableSha256)
    assert.deepEqual(details.resolution, receipt.resolution)
    assert.deepEqual(details.provisioningIdentity, {
        schema: receipt.schema,
        integrityPayloadSha256: receipt.integrity.payloadSha256,
    })
})

test('qualification verification can pass while operating admission fails and route stays unsafe', (t) => {
    const declaration = materialDeclaration()
    const failed = fixture(t, { pnpmVersion: '10.33.0' }).receipt
    const decision = decideOperatingCohortRoute(compatibleRouteInputs(declaration, failed))
    assert.equal(decision.qualificationFreshVerification, 'passed')
    assert.equal(decision.operatingBuildBoundaryVerification, 'failed')
    assert.equal(decision.safeToExecute, false)
    assert.deepEqual(decision.blockers, ['operating-build-boundary-verification-failed'])
})

test('ephemeral provisioning paths do not alter route or material semantic identity inputs', (t) => {
    const declaration = materialDeclaration()
    const first = fixture(t, { suffix: 'first' }).receipt
    const second = fixture(t, { suffix: 'second' }).receipt
    assert.notEqual(first.resolution.temporaryRoot, second.resolution.temporaryRoot)
    const firstDecision = decideOperatingCohortRoute(compatibleRouteInputs(declaration, first))
    const secondDecision = decideOperatingCohortRoute(compatibleRouteInputs(declaration, second))
    assert.equal(firstDecision.decisionSha256, secondDecision.decisionSha256)
    assert.deepEqual(operatingEnvironmentRouteInput(first), operatingEnvironmentRouteInput(second))
})

test('current-host revalidation rejects executable or boundary drift before any material phase', (t) => {
    const { receipt } = fixture(t)
    assert.throws(() => verifyCurrentOperatingBuildEnvironment(receipt, {
        dependencies: {
            runtimeObservation: () => ({
                observedBoundary: { ...BUILD_BOUNDARY_CLASS, pnpmVersion: '10.33.0' },
                comparison: {
                    equal: false,
                    fields: Object.fromEntries(Object.keys(BUILD_BOUNDARY_CLASS).map((field) => [field, {
                        expected: BUILD_BOUNDARY_CLASS[field],
                        observed: field === 'pnpmVersion' ? '10.33.0' : BUILD_BOUNDARY_CLASS[field],
                        equal: field !== 'pnpmVersion',
                    }])),
                },
                node: receipt.node,
                pnpm: receipt.pnpm,
            }),
        },
    }), (error) => error.code === 'BUILD_BOUNDARY_MISMATCH'
        && error.details.casesStarted === 0
        && error.details.globalExecutions === 0)
})
