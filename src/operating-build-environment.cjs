'use strict'

const childProcess = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
    canonicalJson,
    sealDocument,
    verifyDocumentIntegrity,
} = require('./verification-receipts.cjs')
const {
    BUILD_BOUNDARY_CLASS,
    compareBuildBoundaries,
} = require('./toolchain-shadow-boundaries.cjs')
const {
    runChild,
    sha256,
} = require('./verification-evidence.cjs')

const OPERATING_PROVISIONING_SCHEMA = 'patch-operating-build-environment-provisioning-v1'
const OPERATING_PROVISIONING_BINDING_SCHEMA = 'patch-operating-build-environment-binding-v1'
const OPERATING_BOUNDARY_FAILURE_SCHEMA = 'patch-operating-build-boundary-failure-v1'
const PROVISIONING_METHOD = 'unique-task-scoped-temporary-installation'
const PROVISIONING_METHOD_VERSION = 'exact-task-scoped-pnpm-v1'
const ADMITTED_PNPM_VERSION = BUILD_BOUNDARY_CLASS.pnpmVersion
const SHA256_PATTERN = /^[0-9a-f]{64}$/
const COMMIT_PATTERN = /^[0-9a-f]{40}$/

class OperatingBuildEnvironmentError extends Error {
    constructor(code, message, details = null) {
        super(message)
        this.name = 'OperatingBuildEnvironmentError'
        this.code = code
        this.details = details
    }
}

function fail(code, message, details = null) {
    throw new OperatingBuildEnvironmentError(code, message, details)
}

function exactKeys(value, expected) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        && canonicalJson(Object.keys(value).sort()) === canonicalJson([...expected].sort())
}

function executableSha256(file, label) {
    const absolute = fs.realpathSync(path.resolve(file))
    const stat = fs.lstatSync(absolute)
    if (!stat.isFile()) fail('INVALID_OPERATING_EXECUTABLE', `${label} is not a regular file`, { absolute })
    return { absolute, sha256: sha256(fs.readFileSync(absolute)) }
}

function runtimeObservation({
    pnpmExecutable,
    env = process.env,
    spawnSync = childProcess.spawnSync,
    nodeExecutable = process.execPath,
    nodeVersion = process.version,
    platform = process.platform,
    architecture = process.arch,
    reportHeader = process.report?.getReport()?.header ?? {},
} = {}) {
    if (typeof pnpmExecutable !== 'string' || pnpmExecutable.length === 0) {
        fail('PNPM_OBSERVATION_FAILED', 'An explicit provisioned pnpm executable is required')
    }
    const launcherExecutable = path.resolve(pnpmExecutable)
    let pnpmIdentity = null
    let nodeIdentity = null
    try {
        pnpmIdentity = executableSha256(launcherExecutable, 'pnpm executable')
        nodeIdentity = executableSha256(nodeExecutable, 'Node executable')
    } catch (error) {
        if (error instanceof OperatingBuildEnvironmentError) throw error
        fail('OPERATING_EXECUTABLE_OBSERVATION_FAILED', 'Operating executable identity could not be observed', {
            code: error.code ?? null,
            message: error.message,
            launcherExecutable,
            nodeExecutable,
        })
    }
    const result = spawnSync(launcherExecutable, ['--version'], {
        encoding: 'utf8',
        env,
        timeout: 10_000,
        windowsHide: true,
    })
    if (result.error || result.signal !== null || result.status !== 0
        || typeof result.stdout !== 'string' || result.stdout.trim() === ''
        || typeof result.stderr !== 'string' || result.stderr !== '') {
        fail('PNPM_OBSERVATION_FAILED', 'Exact provisioned pnpm version observation failed', {
            launcherExecutable,
            resolvedExecutable: pnpmIdentity.absolute,
            exitCode: result.status,
            signal: result.signal,
            spawnError: result.error === undefined ? null : {
                code: result.error.code ?? null,
                message: result.error.message,
            },
            stdout: result.stdout ?? null,
            stderr: result.stderr ?? null,
        })
    }
    const libc = reportHeader.glibcVersionRuntime ? 'glibc' : 'unknown'
    const pnpmVersion = result.stdout.trim()
    const observedBoundary = {
        id: `toolchain:${platform}-${architecture}-${libc === 'glibc' ? 'glibc' : 'unknown-libc'}-node-${nodeVersion.slice(1)}-pnpm-${pnpmVersion}`,
        nodeVersion,
        platform,
        architecture,
        libc,
        pnpmVersion,
    }
    return {
        observedBoundary,
        comparison: compareBuildBoundaries(BUILD_BOUNDARY_CLASS, observedBoundary),
        node: {
            version: nodeVersion,
            executable: nodeIdentity.absolute,
            executableSha256: nodeIdentity.sha256,
        },
        pnpm: {
            requestedVersion: ADMITTED_PNPM_VERSION,
            observedVersion: pnpmVersion,
            launcherExecutable,
            resolvedExecutable: pnpmIdentity.absolute,
            executableSha256: pnpmIdentity.sha256,
        },
        runtime: {
            platform,
            architecture,
            libc,
            libcVersionRuntime: reportHeader.glibcVersionRuntime ?? null,
        },
    }
}

function operatingBuildEnvironmentContract() {
    return {
        schema: 'patch-operating-build-environment-contract-v1',
        provisioningMethod: PROVISIONING_METHOD,
        provisioningMethodVersion: PROVISIONING_METHOD_VERSION,
        expectedBoundary: { ...BUILD_BOUNDARY_CLASS },
        pnpmResolution: 'explicit-task-scoped-executable-with-prepended-path-v1',
        currentHostAdmission: 'required-before-focused-local-and-global-claim-v1',
        ephemeralInstanceAffectsCohortIdentity: false,
    }
}

async function provisionExactPnpm({
    temporaryParent = os.tmpdir(),
    purpose = 'qualification',
    runChildImpl = runChild,
} = {}) {
    const parent = fs.realpathSync(path.resolve(temporaryParent))
    const prefix = purpose === 'operating' ? 'operating-pnpm-10.34.1-' : 'qualification-pnpm-10.34.1-'
    const root = fs.mkdtempSync(path.join(parent, prefix))
    const args = [
        'install', '--prefix', root, '--no-package-lock', '--ignore-scripts',
        '--no-audit', '--no-fund', `pnpm@${ADMITTED_PNPM_VERSION}`,
    ]
    const result = await runChildImpl('npm', args, { maxOutputBytes: 32 * 1024 * 1024 })
    if (result.spawnError !== null || result.outputError !== null || result.exitCode !== 0 || result.signal !== null) {
        fail('PNPM_PROVISIONING_FAILED', 'Task-scoped pnpm provisioning failed; temporary root retained', {
            root,
            args,
            result,
        })
    }
    const executable = path.join(root, 'node_modules', '.bin', 'pnpm')
    if (!fs.existsSync(executable)) {
        fail('PNPM_PROVISIONING_FAILED', 'Task-scoped pnpm executable is missing; temporary root retained', {
            root,
            executable,
        })
    }
    return {
        root,
        executable,
        binDirectory: path.dirname(executable),
        receipt: {
            method: PROVISIONING_METHOD,
            methodVersion: PROVISIONING_METHOD_VERSION,
            command: { executable: 'npm', args },
            installStdoutSha256: sha256(result.stdout),
            installStderrSha256: sha256(result.stderr),
            installExitCode: result.exitCode,
            repositoryMutationAllowed: false,
            lockfileMutationAllowed: false,
            cleanupRequired: true,
        },
    }
}

function validateContext(context) {
    if (!context || typeof context !== 'object' || Array.isArray(context)) {
        fail('INVALID_OPERATING_PROVISIONING_CONTEXT', 'Operating provisioning context is missing')
    }
    if (!COMMIT_PATTERN.test(context.subjectCommit ?? '')
        || !COMMIT_PATTERN.test(context.toolingCommit ?? '')
        || !SHA256_PATTERN.test(context.toolingStatusSha256 ?? '')
        || !COMMIT_PATTERN.test(context.targetCommit ?? '')
        || !SHA256_PATTERN.test(context.targetApplicationTreeSha256 ?? '')) {
        fail('INVALID_OPERATING_PROVISIONING_CONTEXT', 'Operating provisioning identities are incomplete')
    }
    return context
}

function buildProvisioningReceipt({
    provisioned,
    observation,
    context,
    ambientPath,
    effectivePath,
    createdAt = new Date().toISOString(),
}) {
    validateContext(context)
    if (!provisioned || provisioned.receipt?.method !== PROVISIONING_METHOD
        || provisioned.receipt.methodVersion !== PROVISIONING_METHOD_VERSION
        || provisioned.receipt.repositoryMutationAllowed !== false
        || provisioned.receipt.lockfileMutationAllowed !== false
        || provisioned.receipt.cleanupRequired !== true) {
        fail('INVALID_PNPM_PROVISIONING', 'Operating pnpm provisioning contract is incomplete')
    }
    const comparison = observation.comparison
    return sealDocument({
        schema: OPERATING_PROVISIONING_SCHEMA,
        version: 1,
        status: comparison.equal ? 'passed' : 'failed',
        createdAt,
        provisioning: structuredClone(provisioned.receipt),
        requested: {
            nodeVersion: BUILD_BOUNDARY_CLASS.nodeVersion,
            pnpmVersion: ADMITTED_PNPM_VERSION,
        },
        node: structuredClone(observation.node),
        pnpm: structuredClone(observation.pnpm),
        runtime: structuredClone(observation.runtime),
        resolution: {
            strategy: 'explicit-provisioned-executable-with-prepended-path-v1',
            temporaryRoot: provisioned.root,
            temporaryRootIdentitySha256: sha256(canonicalJson({
                purpose: 'material-operating-cohort',
                root: provisioned.root,
            })),
            provisionedBinDirectory: provisioned.binDirectory,
            pathPrepend: provisioned.binDirectory,
            ambientPathSha256: sha256(ambientPath ?? ''),
            effectivePathSha256: sha256(effectivePath),
        },
        expectedBoundary: { ...BUILD_BOUNDARY_CLASS },
        observedBoundary: structuredClone(observation.observedBoundary),
        boundaryComparison: structuredClone(comparison),
        identities: {
            subjectCommit: context.subjectCommit,
            toolingCommit: context.toolingCommit,
            toolingStatusSha256: context.toolingStatusSha256,
            targetCommit: context.targetCommit,
            targetApplicationTreeSha256: context.targetApplicationTreeSha256,
        },
        cleanup: {
            required: true,
            eligibleOnlyAfterAttemptNoLongerNeedsExecutable: true,
            durableReceiptSurvivesCleanup: true,
        },
    })
}

async function provisionOperatingBuildEnvironment({
    temporaryParent = os.tmpdir(),
    context,
    env = process.env,
    createdAt = new Date().toISOString(),
    dependencies = {},
} = {}) {
    const provisioned = await (dependencies.provisionExactPnpm ?? provisionExactPnpm)({
        temporaryParent,
        purpose: 'operating',
        runChildImpl: dependencies.runChildImpl ?? runChild,
    })
    const ambientPath = env.PATH ?? ''
    const effectivePath = `${provisioned.binDirectory}${path.delimiter}${ambientPath}`
    const effectiveEnv = { ...env, PATH: effectivePath }
    let observation
    try {
        observation = (dependencies.runtimeObservation ?? runtimeObservation)({
            pnpmExecutable: provisioned.executable,
            env: effectiveEnv,
        })
    } catch (error) {
        error.details = {
            ...(error.details ?? {}),
            phase: 'operating-environment-provisioning-observation',
            provisioningRoot: provisioned.root,
            provisionedPnpmExecutable: provisioned.executable,
            casesStarted: 0,
            globalLaunchClaimState: 'absent',
            globalExecutions: 0,
        }
        throw error
    }
    const receipt = buildProvisioningReceipt({
        provisioned,
        observation,
        context,
        ambientPath,
        effectivePath,
        createdAt,
    })
    return {
        ...provisioned,
        env: effectiveEnv,
        receipt,
        boundaryPassed: receipt.boundaryComparison.equal,
    }
}

function validateProvisioningReceipt(receipt, {
    expectedBoundary = BUILD_BOUNDARY_CLASS,
    requireExecutable = false,
} = {}) {
    const expectedInstallArgs = [
        'install', '--prefix', receipt?.resolution?.temporaryRoot, '--no-package-lock',
        '--ignore-scripts', '--no-audit', '--no-fund', `pnpm@${ADMITTED_PNPM_VERSION}`,
    ]
    if (!verifyDocumentIntegrity(receipt) || receipt?.schema !== OPERATING_PROVISIONING_SCHEMA
        || receipt.version !== 1
        || !exactKeys(receipt, [
            'schema', 'version', 'status', 'createdAt', 'provisioning', 'requested',
            'node', 'pnpm', 'runtime', 'resolution', 'expectedBoundary',
            'observedBoundary', 'boundaryComparison', 'identities', 'cleanup', 'integrity',
        ])
        || Number.isNaN(Date.parse(receipt.createdAt))
        || new Date(receipt.createdAt).toISOString() !== receipt.createdAt
        || !exactKeys(receipt.provisioning, [
            'method', 'methodVersion', 'command', 'installStdoutSha256',
            'installStderrSha256', 'installExitCode', 'repositoryMutationAllowed',
            'lockfileMutationAllowed', 'cleanupRequired',
        ])
        || !exactKeys(receipt.provisioning?.command, ['executable', 'args'])
        || receipt.provisioning?.method !== PROVISIONING_METHOD
        || receipt.provisioning?.methodVersion !== PROVISIONING_METHOD_VERSION
        || receipt.provisioning?.command?.executable !== 'npm'
        || canonicalJson(receipt.provisioning?.command?.args) !== canonicalJson(expectedInstallArgs)
        || receipt.provisioning?.installExitCode !== 0
        || !SHA256_PATTERN.test(receipt.provisioning?.installStdoutSha256 ?? '')
        || !SHA256_PATTERN.test(receipt.provisioning?.installStderrSha256 ?? '')
        || receipt.provisioning?.repositoryMutationAllowed !== false
        || receipt.provisioning?.lockfileMutationAllowed !== false
        || receipt.provisioning?.cleanupRequired !== true
        || !exactKeys(receipt.requested, ['nodeVersion', 'pnpmVersion'])
        || canonicalJson(receipt.requested) !== canonicalJson({
            nodeVersion: BUILD_BOUNDARY_CLASS.nodeVersion,
            pnpmVersion: ADMITTED_PNPM_VERSION,
        })
        || !exactKeys(receipt.node, ['version', 'executable', 'executableSha256'])
        || !exactKeys(receipt.pnpm, [
            'requestedVersion', 'observedVersion', 'launcherExecutable',
            'resolvedExecutable', 'executableSha256',
        ])
        || !exactKeys(receipt.runtime, [
            'platform', 'architecture', 'libc', 'libcVersionRuntime',
        ])
        || receipt.node?.version !== receipt.observedBoundary?.nodeVersion
        || !SHA256_PATTERN.test(receipt.node?.executableSha256 ?? '')
        || receipt.pnpm?.requestedVersion !== ADMITTED_PNPM_VERSION
        || receipt.pnpm?.observedVersion !== receipt.observedBoundary?.pnpmVersion
        || !SHA256_PATTERN.test(receipt.pnpm?.executableSha256 ?? '')
        || receipt.runtime?.platform !== receipt.observedBoundary?.platform
        || receipt.runtime?.architecture !== receipt.observedBoundary?.architecture
        || receipt.runtime?.libc !== receipt.observedBoundary?.libc
        || !exactKeys(receipt.resolution, [
            'strategy', 'temporaryRoot', 'temporaryRootIdentitySha256',
            'provisionedBinDirectory', 'pathPrepend', 'ambientPathSha256',
            'effectivePathSha256',
        ])
        || receipt.resolution?.strategy !== 'explicit-provisioned-executable-with-prepended-path-v1'
        || path.resolve(receipt.resolution?.provisionedBinDirectory ?? '')
            !== path.join(path.resolve(receipt.resolution?.temporaryRoot ?? ''), 'node_modules', '.bin')
        || path.resolve(receipt.pnpm?.launcherExecutable ?? '')
            !== path.join(path.resolve(receipt.resolution?.temporaryRoot ?? ''), 'node_modules', '.bin', 'pnpm')
        || receipt.resolution?.pathPrepend !== receipt.resolution?.provisionedBinDirectory
        || receipt.resolution?.temporaryRootIdentitySha256 !== sha256(canonicalJson({
            purpose: 'material-operating-cohort',
            root: receipt.resolution?.temporaryRoot,
        }))
        || !SHA256_PATTERN.test(receipt.resolution?.ambientPathSha256 ?? '')
        || !SHA256_PATTERN.test(receipt.resolution?.effectivePathSha256 ?? '')
        || !exactKeys(receipt.identities, [
            'subjectCommit', 'toolingCommit', 'toolingStatusSha256',
            'targetCommit', 'targetApplicationTreeSha256',
        ])
        || !COMMIT_PATTERN.test(receipt.identities?.subjectCommit ?? '')
        || !COMMIT_PATTERN.test(receipt.identities?.toolingCommit ?? '')
        || !SHA256_PATTERN.test(receipt.identities?.toolingStatusSha256 ?? '')
        || !COMMIT_PATTERN.test(receipt.identities?.targetCommit ?? '')
        || !SHA256_PATTERN.test(receipt.identities?.targetApplicationTreeSha256 ?? '')
        || !exactKeys(receipt.expectedBoundary, [
            'id', 'nodeVersion', 'platform', 'architecture', 'libc', 'pnpmVersion',
        ])
        || !exactKeys(receipt.observedBoundary, [
            'id', 'nodeVersion', 'platform', 'architecture', 'libc', 'pnpmVersion',
        ])
        || !exactKeys(receipt.cleanup, [
            'required', 'eligibleOnlyAfterAttemptNoLongerNeedsExecutable',
            'durableReceiptSurvivesCleanup',
        ])
        || canonicalJson(receipt.cleanup) !== canonicalJson({
            required: true,
            eligibleOnlyAfterAttemptNoLongerNeedsExecutable: true,
            durableReceiptSurvivesCleanup: true,
        })
        || canonicalJson(receipt.expectedBoundary) !== canonicalJson(expectedBoundary)
        || canonicalJson(receipt.boundaryComparison)
            !== canonicalJson(compareBuildBoundaries(receipt.expectedBoundary, receipt.observedBoundary))) {
        fail('INVALID_OPERATING_PROVISIONING_RECEIPT', 'Operating provisioning receipt is invalid')
    }
    if (receipt.status !== (receipt.boundaryComparison.equal ? 'passed' : 'failed')) {
        fail('INVALID_OPERATING_PROVISIONING_RECEIPT', 'Operating provisioning disposition differs from its boundary result')
    }
    if (requireExecutable) {
        const observed = executableSha256(receipt.pnpm.launcherExecutable, 'provisioned pnpm executable')
        const node = executableSha256(receipt.node.executable, 'provisioned Node executable')
        if (observed.absolute !== receipt.pnpm.resolvedExecutable
            || observed.sha256 !== receipt.pnpm.executableSha256
            || node.absolute !== receipt.node.executable
            || node.sha256 !== receipt.node.executableSha256) {
            fail('OPERATING_EXECUTABLE_IDENTITY_DRIFT', 'Provisioned executable identity changed after receipt publication', {
                expected: { node: receipt.node, pnpm: receipt.pnpm },
                observed: { node, pnpm: observed },
            })
        }
    }
    return receipt
}

function requireAdmittedOperatingBoundary(receipt, options = {}) {
    validateProvisioningReceipt(receipt, options)
    if (receipt.status !== 'passed' || receipt.boundaryComparison.equal !== true) {
        fail('BUILD_BOUNDARY_MISMATCH', 'Provisioned material operating environment is not admitted', {
            phase: 'pre-material-operating-build-boundary-admission',
            expected: receipt.expectedBoundary,
            observed: receipt.observedBoundary,
            comparison: receipt.boundaryComparison,
            nodeExecutable: receipt.node.executable,
            nodeExecutableSha256: receipt.node.executableSha256,
            pnpmExecutable: receipt.pnpm.resolvedExecutable,
            pnpmExecutableSha256: receipt.pnpm.executableSha256,
            resolution: receipt.resolution,
            casesStarted: 0,
            globalLaunchClaimState: 'absent',
            globalExecutions: 0,
        })
    }
    return receipt
}

function verifyCurrentOperatingBuildEnvironment(receipt, { dependencies = {}, env = process.env } = {}) {
    requireAdmittedOperatingBoundary(receipt, { requireExecutable: true })
    const effectivePath = `${receipt.resolution.provisionedBinDirectory}${path.delimiter}${env.PATH ?? ''}`
    const effectiveEnv = { ...env, PATH: effectivePath }
    const observation = (dependencies.runtimeObservation ?? runtimeObservation)({
        pnpmExecutable: receipt.pnpm.launcherExecutable,
        env: effectiveEnv,
    })
    const executableMatched = observation.node.executable === receipt.node.executable
        && observation.node.executableSha256 === receipt.node.executableSha256
        && observation.pnpm.resolvedExecutable === receipt.pnpm.resolvedExecutable
        && observation.pnpm.executableSha256 === receipt.pnpm.executableSha256
    if (!observation.comparison.equal || !executableMatched) {
        fail('BUILD_BOUNDARY_MISMATCH', 'Current material process tree differs from the admitted provisioned environment', {
            phase: 'pre-material-current-host-build-boundary-admission',
            expected: receipt.expectedBoundary,
            observed: observation.observedBoundary,
            comparison: observation.comparison,
            expectedExecutables: { node: receipt.node, pnpm: receipt.pnpm },
            observedExecutables: { node: observation.node, pnpm: observation.pnpm },
            resolution: {
                ...receipt.resolution,
                currentEffectivePathSha256: sha256(effectivePath),
            },
            casesStarted: 0,
            globalLaunchClaimState: 'absent',
            globalExecutions: 0,
        })
    }
    return {
        status: 'passed',
        observedBoundary: observation.observedBoundary,
        comparison: observation.comparison,
        node: observation.node,
        pnpm: observation.pnpm,
        effectiveEnv,
    }
}

function operatingEnvironmentRouteInput(receipt, expectedIdentities = null) {
    if (receipt === null || receipt === undefined) {
        return {
            operatingEnvironmentProvisioned: false,
            operatingBuildBoundaryVerification: 'not-checked',
        }
    }
    try {
        validateProvisioningReceipt(receipt)
        if (expectedIdentities !== null && (
            receipt.identities.subjectCommit !== expectedIdentities.subjectCommit
            || receipt.identities.targetCommit !== expectedIdentities.targetCommit
            || receipt.identities.targetApplicationTreeSha256
                !== expectedIdentities.targetApplicationTreeSha256
        )) {
            return {
                operatingEnvironmentProvisioned: false,
                operatingBuildBoundaryVerification: 'failed',
            }
        }
        return {
            operatingEnvironmentProvisioned: true,
            operatingBuildBoundaryVerification: receipt.boundaryComparison.equal ? 'passed' : 'failed',
        }
    } catch {
        return {
            operatingEnvironmentProvisioned: false,
            operatingBuildBoundaryVerification: 'failed',
        }
    }
}

function buildOperatingBoundaryFailure({
    error,
    frozenDeclaration,
    frozenDeclarationSha256,
    provisioningReceiptSha256 = null,
    recordedAt = new Date().toISOString(),
}) {
    const details = structuredClone(error?.details ?? {})
    const payload = {
        schema: OPERATING_BOUNDARY_FAILURE_SCHEMA,
        evidenceBundleId: null,
        disposition: 'pre-material-failed',
        status: 'failed',
        recordedAt,
        phase: details.phase ?? 'pre-material-operating-build-boundary-admission',
        code: error?.code ?? 'BUILD_BOUNDARY_OBSERVATION_FAILED',
        message: error?.message ?? 'Operating build-boundary admission failed',
        operatingCohort: frozenDeclaration === null ? null : {
            materialInputKey: frozenDeclaration.materialInputKey,
            cohortId: frozenDeclaration.cohortId,
            executionAttemptId: frozenDeclaration.executionAttemptId,
            frozenDeclarationSha256,
        },
        provisioningReceiptSha256,
        details,
        executionState: {
            localCasesStarted: 0,
            localCasesCompleted: 0,
            globalLaunchClaim: 'absent',
            globalExecutions: 0,
        },
        canonicalProtection: {
            canonicalGate: 'Global Exhaustive',
            productionClass: 'G',
            shadowClass: 'B',
            productionCertificatesIssued: 0,
            canonicalMasksSkipped: 0,
            productionStateMigrated: false,
            c1RelaxationAuthorized: false,
            materialCohortCounted: false,
            candidateOperatingSampleCounted: false,
        },
    }
    payload.evidenceBundleId = sha256(canonicalJson({
        schema: 'patch-operating-pre-material-failure-evidence-identity-v1',
        executionAttemptId: payload.operatingCohort?.executionAttemptId ?? null,
        evidence: payload,
    }))
    return sealDocument(payload)
}

function validateOperatingBoundaryFailure(document) {
    if (!verifyDocumentIntegrity(document) || document?.schema !== OPERATING_BOUNDARY_FAILURE_SCHEMA
        || document.status !== 'failed' || document.disposition !== 'pre-material-failed'
        || !SHA256_PATTERN.test(document.evidenceBundleId ?? '')
        || document.executionState?.localCasesStarted !== 0
        || document.executionState?.localCasesCompleted !== 0
        || document.executionState?.globalLaunchClaim !== 'absent'
        || document.executionState?.globalExecutions !== 0) {
        fail('INVALID_OPERATING_BOUNDARY_FAILURE', 'Pre-material operating failure evidence is invalid')
    }
    const { integrity: ignored, ...payload } = document
    const expected = sha256(canonicalJson({
        schema: 'patch-operating-pre-material-failure-evidence-identity-v1',
        executionAttemptId: payload.operatingCohort?.executionAttemptId ?? null,
        evidence: { ...payload, evidenceBundleId: null },
    }))
    if (expected !== document.evidenceBundleId) {
        fail('INVALID_OPERATING_BOUNDARY_FAILURE', 'Pre-material failure evidence identity differs')
    }
    return document
}

function cleanupProvisionedEnvironment(root) {
    const resolved = path.resolve(root)
    if (!path.basename(resolved).startsWith('operating-pnpm-10.34.1-')) {
        fail('UNSAFE_PROVISIONING_CLEANUP_TARGET', 'Refusing to clean an unrecognized operating provisioning root', {
            root: resolved,
        })
    }
    fs.rmSync(resolved, { recursive: true, force: true })
    return !fs.existsSync(resolved)
}

module.exports = {
    ADMITTED_PNPM_VERSION,
    OPERATING_BOUNDARY_FAILURE_SCHEMA,
    OPERATING_PROVISIONING_BINDING_SCHEMA,
    OPERATING_PROVISIONING_SCHEMA,
    OperatingBuildEnvironmentError,
    PROVISIONING_METHOD,
    PROVISIONING_METHOD_VERSION,
    buildOperatingBoundaryFailure,
    buildProvisioningReceipt,
    cleanupProvisionedEnvironment,
    operatingEnvironmentRouteInput,
    operatingBuildEnvironmentContract,
    provisionExactPnpm,
    provisionOperatingBuildEnvironment,
    requireAdmittedOperatingBoundary,
    runtimeObservation,
    validateProvisioningReceipt,
    validateOperatingBoundaryFailure,
    verifyCurrentOperatingBuildEnvironment,
}
