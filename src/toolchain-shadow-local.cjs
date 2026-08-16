'use strict'

const childProcess = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
    enumerateBoundaryClasses,
    BUILD_BOUNDARY_CLASS,
    observeBuildBoundary,
    validateBuildBoundary,
    validateCapabilityReceipt,
} = require('./toolchain-shadow-boundaries.cjs')
const {
    BOUNDARY_CLASS_IDS,
    MANAGED_PATHS,
    STATE_PATHS,
    loadToolchainShadowDeclaration,
    validateToolchainShadowDeclaration,
} = require('./toolchain-shadow-contract.cjs')
const {
    canonicalJson,
    sealDocument,
    verifyDocumentIntegrity,
} = require('./verification-receipts.cjs')
const {
    sha256,
    targetFreezeDescriptor,
} = require('./verification-evidence.cjs')
const { canonicalSha256 } = require('./operating-cohort-identity.cjs')
const {
    candidateBoundaryConsensus,
    validateCanonicalCandidateProjection,
} = require('./toolchain-shadow-canonical-projection.cjs')

const LEGACY_LOCAL_RECEIPT_SCHEMA = 'patch-toolchain-shadow-local-receipt-v1'
const LOCAL_RECEIPT_SCHEMA = 'patch-toolchain-shadow-local-receipt-v2'
const DISPOSITIONS = Object.freeze([
    'synthetic-known-answer', 'dry-run', 'qualification-v2', 'material-shadow',
    'defect-reproduction',
])
const SYNTHETIC_FAULTS = Object.freeze([
    'apply-failure',
    'interrupted-worker',
    'repeated-plan-failure',
    'revert-corruption',
    'target-integrity-failure',
])

class ToolchainShadowLocalError extends Error {
    constructor(code, message, details = {}) {
        super(message)
        this.name = 'ToolchainShadowLocalError'
        this.code = code
        this.details = details
    }
}

function copyProjectionFile(sourceRoot, targetRoot, relative) {
    const source = path.join(sourceRoot, relative)
    const destination = path.join(targetRoot, relative)
    const stat = fs.lstatSync(source)
    if (!stat.isFile() || stat.isSymbolicLink()) {
        throw new ToolchainShadowLocalError('UNSUPPORTED_PROJECTION_ENTRY', `${relative} is not a regular file`)
    }
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(source, destination)
    fs.chmodSync(destination, stat.mode & 0o7777)
}

function spawnMask({ sourceRoot, projectionRoot, mask, boundaryClassId, declaration, syntheticFault }) {
    const worker = path.join(sourceRoot, 'scripts/run-toolchain-shadow-mask.cjs')
    const result = childProcess.spawnSync(process.execPath, [worker], {
        cwd: sourceRoot,
        env: { LANG: 'C', LC_ALL: 'C', TZ: 'UTC', PATH: process.env.PATH ?? '' },
        encoding: 'utf8',
        input: JSON.stringify({
            sourceRoot,
            targetRoot: projectionRoot,
            mask,
            boundaryClassId,
            declaration,
            syntheticFault,
        }),
        maxBuffer: 32 * 1024 * 1024,
        timeout: 30_000,
        windowsHide: true,
    })
    if (result.error) {
        throw new ToolchainShadowLocalError('SHADOW_WORKER_SPAWN_ERROR', 'Fresh mask worker did not start', {
            code: result.error.code ?? null,
            message: result.error.message,
        })
    }
    if (result.signal !== null || result.status !== 0) {
        let workerError = null
        try { workerError = JSON.parse(String(result.stderr).trim()) } catch {}
        throw new ToolchainShadowLocalError('SHADOW_WORKER_FAILED', 'Fresh mask worker failed', {
            exitCode: result.status,
            signal: result.signal,
            stdout: result.stdout,
            stderr: result.stderr,
            workerError,
        })
    }
    if (typeof result.stdout !== 'string' || result.stdout.trim().length === 0) {
        throw new ToolchainShadowLocalError('SHADOW_WORKER_EMPTY_OUTPUT', 'Fresh mask worker returned no output')
    }
    if (typeof result.stderr !== 'string' || result.stderr.length !== 0) {
        throw new ToolchainShadowLocalError('SHADOW_WORKER_STDERR', 'Fresh mask worker emitted stderr', {
            stderr: result.stderr,
        })
    }
    try {
        return JSON.parse(result.stdout)
    } catch (error) {
        throw new ToolchainShadowLocalError('SHADOW_WORKER_INVALID_OUTPUT', 'Fresh mask output is not JSON', {
            cause: error.message,
        })
    }
}

function validateLocalShadowReceipt(receipt) {
    const legacy = receipt?.schema === LEGACY_LOCAL_RECEIPT_SCHEMA
    if (!verifyDocumentIntegrity(receipt)
        || (!legacy && receipt.schema !== LOCAL_RECEIPT_SCHEMA)) {
        throw new ToolchainShadowLocalError('CORRUPT_LOCAL_RECEIPT', 'Local receipt integrity or schema is invalid')
    }
    if (!DISPOSITIONS.includes(receipt.disposition)) {
        throw new ToolchainShadowLocalError('UNKNOWN_LOCAL_DISPOSITION', 'Local receipt disposition is invalid')
    }
    if (receipt.operatingCohort !== undefined) {
        const binding = receipt.operatingCohort
        if (canonicalJson(Object.keys(binding).sort()) !== canonicalJson([
            'cohortId', 'executionAttemptId', 'frozenDeclarationSha256', 'materialInputKey',
        ]) || Object.values(binding).some((value) => !/^[0-9a-f]{64}$/.test(value ?? ''))
            || !/^[0-9a-f]{64}$/.test(receipt.localRunId ?? '')
            || receipt.localRunId !== computeLocalRunId(receipt)) {
            throw new ToolchainShadowLocalError('LOCAL_COHORT_BINDING_MISMATCH', 'Local receipt does not bind one frozen execution attempt')
        }
    } else if (receipt.localRunId !== undefined) {
        throw new ToolchainShadowLocalError('LOCAL_COHORT_BINDING_MISMATCH', 'Unbound local receipt contains a run ID')
    }
    if (canonicalJson(receipt.candidate) !== canonicalJson({
        packId: 'toolchain-hardening',
        productionClass: 'G',
        shadowClass: 'B',
        admission: 'not-production-admitted',
    })) throw new ToolchainShadowLocalError('PRODUCTION_CLASSIFICATION_CHANGED', 'Candidate protection changed')
    const expectedBuildSource = receipt.disposition === 'synthetic-known-answer'
        ? 'synthetic-contract-fixture'
        : 'observed-runtime'
    if (receipt.buildBoundary?.source !== expectedBuildSource
        || canonicalJson(receipt.buildBoundary?.observed) !== canonicalJson(BUILD_BOUNDARY_CLASS)
        || receipt.buildBoundary?.preflightCapabilityReceipt?.schema
            !== 'patch-toolchain-capability-receipt-v1') {
        throw new ToolchainShadowLocalError('BUILD_BOUNDARY_MISMATCH', 'Build boundary is missing or unobserved')
    }
    if (!Array.isArray(receipt.boundaryClasses)) {
        throw new ToolchainShadowLocalError('INCOMPLETE_LOCAL_COVERAGE', 'Boundary coverage is absent')
    }
    const boundaryClasses = [...receipt.boundaryClasses].sort()
    if (new Set(boundaryClasses).size !== boundaryClasses.length
        || canonicalJson(boundaryClasses) !== canonicalJson([...BOUNDARY_CLASS_IDS].sort())) {
        throw new ToolchainShadowLocalError('INCOMPLETE_LOCAL_COVERAGE', 'Boundary coverage is incomplete')
    }
    if (canonicalJson(receipt.coverage) !== canonicalJson({
        localMasks: 2,
        boundaryClasses: 4,
        expectedExecutions: 8,
        processedExecutions: 8,
    }) || receipt.observations.length !== 8) {
        throw new ToolchainShadowLocalError('INCOMPLETE_LOCAL_COVERAGE', 'Local mask coverage is incomplete')
    }
    const seen = new Set()
    const processes = new Set()
    const projections = new Set()
    for (const observation of receipt.observations) {
        if (!observation || observation.schema !== (legacy
            ? 'patch-toolchain-shadow-mask-observation-v1'
            : 'patch-toolchain-shadow-mask-observation-v2')
            || !/^[0-9a-f-]{36}$/.test(observation.processInstanceId ?? '')
            || !/^[0-9a-f-]{36}$/.test(observation.projectionId ?? '')
            || !Number.isInteger(observation.workerPid) || observation.workerPid <= 0
            || !/^[0-9a-f]{64}$/.test(observation.observationSha256 ?? '')) {
            throw new ToolchainShadowLocalError('INVALID_LOCAL_OBSERVATION', 'Local observation is malformed')
        }
        if (![0, 1].includes(observation.mask) || !boundaryClasses.includes(observation.boundaryClassId)) {
            throw new ToolchainShadowLocalError('OUT_OF_RANGE_LOCAL_COVERAGE', 'Mask or boundary is out of range')
        }
        const key = `${observation.boundaryClassId}:${observation.mask}`
        if (seen.has(key)) throw new ToolchainShadowLocalError('DUPLICATE_LOCAL_COVERAGE', `Duplicate ${key}`)
        seen.add(key)
        if (processes.has(observation.processInstanceId) || projections.has(observation.projectionId)) {
            throw new ToolchainShadowLocalError('REUSED_LOCAL_HISTORY', 'Process or projection was reused')
        }
        processes.add(observation.processInstanceId)
        projections.add(observation.projectionId)
        const selected = observation.mask === 1 ? ['toolchain-hardening'] : []
        const expectedStatus = observation.mask === 1 ? 'current' : 'clean'
        const expectedPaths = observation.mask === 1
            ? [...MANAGED_PATHS, STATE_PATHS.find((entry) => entry.endsWith('/state.json'))].sort()
            : []
        const { projectionSha256, ...projectionPayload } = observation.candidateProjection ?? {}
        if (!legacy) validateCanonicalCandidateProjection(observation.candidateProjection)
        const projectionValid = legacy
            ? (observation.candidateProjection?.mask === observation.mask
                && observation.candidateProjection?.active === (observation.mask === 1)
                && /^[0-9a-f]{64}$/.test(observation.candidateProjection?.filesSha256 ?? '')
                && /^[0-9a-f]{64}$/.test(observation.candidateProjection?.stateSha256 ?? '')
                && projectionSha256 === sha256(canonicalJson(projectionPayload)))
            : (observation.candidateProjection?.mask === observation.mask
                && observation.candidateProjection?.active === (observation.mask === 1))
        if (canonicalJson(observation.selectedPackIds) !== canonicalJson(selected)
            || observation.apply?.status !== expectedStatus
            || canonicalJson(Object.keys(observation.apply?.paths ?? {}).sort())
                !== canonicalJson([...MANAGED_PATHS, ...STATE_PATHS].sort())
            || canonicalJson(observation.initialPlan?.candidatePaths) !== canonicalJson(expectedPaths)
            || observation.initialPlan?.changeCount !== expectedPaths.length
            || observation.repeatedPlan?.changeCount !== 0
            || observation.revert?.changeCount !== expectedPaths.length
            || observation.symbolObservation?.classId !== observation.boundaryClassId
            || observation.symbolObservation?.mask !== observation.mask
            || observation.symbolObservation?.getterCalls !== 0
            || observation.symbolObservation?.safeStructuredCloneProvided !== true
            || !projectionValid
            || observation.capabilityReceipt?.schema !== 'patch-toolchain-capability-receipt-v1'
            || !/^[0-9a-f]{64}$/.test(observation.capabilityReceipt?.receiptSha256 ?? '')
            || observation.restoration.restored !== true
            || observation.boundaryPreserved !== true
            || observation.restoration.remainingArtifacts.length !== 0) {
            throw new ToolchainShadowLocalError('FAILED_LOCAL_OBSERVATION', `${key} did not restore exactly`)
        }
    }
    if (!legacy) {
        const consensus = candidateBoundaryConsensus(receipt.observations, boundaryClasses)
        if (canonicalJson(consensus) !== canonicalJson(receipt.boundaryConsensus)) {
            throw new ToolchainShadowLocalError(
                'LOCAL_BOUNDARY_PROJECTION_MISMATCH',
                'Local boundary consensus receipt differs from canonical projections',
            )
        }
    } else if (receipt.boundaryConsensus !== undefined) {
        throw new ToolchainShadowLocalError('CORRUPT_LOCAL_RECEIPT', 'Legacy receipt contains v2 boundary consensus')
    }
    if (receipt.status !== 'passed') {
        throw new ToolchainShadowLocalError('LOCAL_SHADOW_FAILED', 'Local receipt did not pass')
    }
    if (receipt.isolation?.target !== 'fresh-target-projection-per-local-mask-and-boundary'
        || receipt.isolation?.process !== 'fresh-process-per-local-mask-and-boundary'
        || receipt.isolation?.moduleGraph !== 'fresh-process-module-graph'
        || receipt.isolation?.calculationCaches !== 'empty-per-process'
        || receipt.isolation?.unmanagedHistory !== 'unique-temporary-root-per-process'
        || receipt.isolation?.persistentLocalWorkers !== false) {
        throw new ToolchainShadowLocalError('REUSED_LOCAL_HISTORY', 'Fresh-isolation contract is invalid')
    }
    const resourceNumbers = [
        receipt.resources?.wallMs,
        receipt.resources?.childCpuUserMs,
        receipt.resources?.childCpuSystemMs,
        receipt.resources?.childCpuTotalMs,
        receipt.resources?.maximumRssKiB,
        receipt.resources?.temporaryPeakBytes,
        receipt.resources?.temporaryPostRunResidueBytes,
        receipt.resources?.logicalReceiptBytes,
    ]
    if (resourceNumbers.some((value) => !Number.isFinite(value) || value < 0)
        || receipt.resources.childCpuTotalMs
            !== receipt.resources.childCpuUserMs + receipt.resources.childCpuSystemMs
        || receipt.resources.temporaryPostRunResidueBytes !== 0
        || receipt.resources.logicalReceiptBytes !== Buffer.byteLength(JSON.stringify(receipt))) {
        throw new ToolchainShadowLocalError('INVALID_RESOURCE_MEASUREMENT', 'Local resource measurement is invalid')
    }
    const protection = receipt.canonicalProtection
    if (protection.canonicalGate !== 'Global Exhaustive'
        || protection.globalFallbackRequired !== true
        || protection.productionClassification !== 'G'
        || protection.defaultChanged !== false
        || protection.productionStateChanged !== false
        || protection.productionCertificates !== 0
        || protection.canonicalMasksSkipped !== 0
        || protection.c1Authorized !== false) {
        throw new ToolchainShadowLocalError('CANONICAL_PROTECTION_WEAKENED', 'Local receipt weakens Global protection')
    }
    return receipt
}

function sealMeasuredReceipt(payload) {
    let logicalReceiptBytes = 0
    for (let attempt = 0; attempt < 8; attempt += 1) {
        payload.resources.logicalReceiptBytes = logicalReceiptBytes
        const receipt = sealDocument(payload)
        const measured = Buffer.byteLength(JSON.stringify(receipt))
        if (measured === logicalReceiptBytes) return receipt
        logicalReceiptBytes = measured
    }
    throw new ToolchainShadowLocalError('UNSTABLE_RECEIPT_MEASUREMENT', 'Receipt byte measurement did not stabilize')
}

function computeLocalRunId(receipt) {
    const { integrity, ...payload } = receipt
    return canonicalSha256({
        schema: receipt.schema === LOCAL_RECEIPT_SCHEMA
            ? 'patch-toolchain-shadow-local-run-identity-v2'
            : 'patch-toolchain-shadow-local-run-identity-v1',
        receipt: { ...payload, localRunId: null },
    })
}

async function runFreshLocalShadow({
    sourceRoot,
    targetRoot,
    targetProvenance = null,
    disposition = 'dry-run',
    compiledContract = null,
    recordedAt = new Date().toISOString(),
    syntheticFault = null,
    buildBoundaryObserver = observeBuildBoundary,
    operatingCohort = null,
}) {
    if (!DISPOSITIONS.includes(disposition)) {
        throw new ToolchainShadowLocalError('UNKNOWN_LOCAL_DISPOSITION', `Unknown disposition ${disposition}`)
    }
    if (syntheticFault !== null && !SYNTHETIC_FAULTS.includes(syntheticFault)) {
        throw new ToolchainShadowLocalError('UNKNOWN_FAULT_INJECTION', 'Fault injection value is unknown')
    }
    if (syntheticFault !== null && disposition !== 'synthetic-known-answer') {
        throw new ToolchainShadowLocalError('FAULT_INJECTION_FORBIDDEN', 'Fault injection is synthetic-only')
    }
    const source = fs.realpathSync(path.resolve(sourceRoot))
    const target = fs.realpathSync(path.resolve(targetRoot))
    const compiled = compiledContract ?? loadToolchainShadowDeclaration(source, { targetRoot: target })
    if (compiledContract !== null) {
        validateToolchainShadowDeclaration(compiled.declaration, {
            repositoryRoot: source,
            targetRoot: target,
            compareCanonicalManifest: true,
        })
    }
    const buildBoundary = disposition === 'synthetic-known-answer'
        ? validateBuildBoundary({ ...BUILD_BOUNDARY_CLASS })
        : buildBoundaryObserver()
    const preflightCapabilityReceipt = validateCapabilityReceipt([
        { kind: 'environment', mode: 'read', resource: 'PATH-for-pnpm-pilot-preflight' },
        { kind: 'subprocess', mode: 'read', resource: 'pnpm-version-pilot-preflight' },
    ], compiled.declaration)
    const targetBefore = await targetFreezeDescriptor(target, { targetProvenance })
    if (targetBefore.applicationTree.rootSha256 !== compiled.declaration.target.applicationTreeSha256) {
        throw new ToolchainShadowLocalError('TARGET_BASELINE_DRIFT', 'Complete target application tree differs')
    }
    if (targetBefore.provenance.kind === 'git'
        && targetBefore.provenance.commit !== compiled.declaration.target.commit) {
        throw new ToolchainShadowLocalError('TARGET_BASELINE_DRIFT', 'Target Git commit differs')
    }
    const boundaryClasses = enumerateBoundaryClasses(compiled.declaration)
    const observations = []
    const started = process.hrtime.bigint()
    let peakTemporaryBytes = 0
    let maximumRssKiB = 0
    let childCpuUserMs = 0
    let childCpuSystemMs = 0
    for (const boundaryClassId of boundaryClasses) {
        for (const mask of [0, 1]) {
            const projectionId = crypto.randomUUID()
            const projectionRoot = fs.mkdtempSync(path.join(os.tmpdir(), `toolchain-shadow-${projectionId}-`))
            try {
                for (const relative of MANAGED_PATHS) copyProjectionFile(target, projectionRoot, relative)
                const observation = spawnMask({
                    sourceRoot: source,
                    projectionRoot,
                    mask,
                    boundaryClassId,
                    declaration: compiled.declaration,
                    syntheticFault,
                })
                observations.push({ projectionId, ...observation })
                peakTemporaryBytes = Math.max(peakTemporaryBytes, observation.resources.temporaryPeakBytes)
                maximumRssKiB = Math.max(maximumRssKiB, observation.resources.maximumRssKiB)
                childCpuUserMs += observation.resources.cpuUserMs
                childCpuSystemMs += observation.resources.cpuSystemMs
                fs.rmSync(projectionRoot, { recursive: true, force: true })
            } catch (error) {
                throw new ToolchainShadowLocalError('FRESH_LOCAL_FIRST_FAILURE', 'Fresh local execution failed', {
                    boundaryClassId,
                    mask,
                    projectionId,
                    projectionRoot,
                    causeCode: error.code ?? null,
                    cause: error.message,
                    worker: error.details ?? null,
                })
            }
        }
    }
    if (syntheticFault === 'target-integrity-failure') {
        fs.appendFileSync(path.join(target, 'package.json'), ' ')
    }
    const targetAfter = await targetFreezeDescriptor(target, { targetProvenance })
    if (sha256(canonicalJson(targetBefore)) !== sha256(canonicalJson(targetAfter))) {
        throw new ToolchainShadowLocalError('TARGET_INTEGRITY_FAILURE', 'Source target changed during local shadow')
    }
    if (operatingCohort !== null && (canonicalJson(Object.keys(operatingCohort).sort()) !== canonicalJson([
        'cohortId', 'executionAttemptId', 'frozenDeclarationSha256', 'materialInputKey',
    ]) || Object.values(operatingCohort).some((value) => !/^[0-9a-f]{64}$/.test(value ?? '')))) {
        throw new ToolchainShadowLocalError('LOCAL_COHORT_BINDING_MISMATCH', 'Local execution cohort binding is invalid')
    }
    const payload = {
        schema: LOCAL_RECEIPT_SCHEMA,
        status: 'passed',
        disposition,
        recordedAt,
        ...(operatingCohort === null ? {} : {
            operatingCohort: structuredClone(operatingCohort),
            localRunId: '0'.repeat(64),
        }),
        candidate: {
            packId: 'toolchain-hardening',
            productionClass: 'G',
            shadowClass: 'B',
            admission: 'not-production-admitted',
        },
        declarationSha256: compiled.declarationSha256,
        buildBoundary: {
            source: disposition === 'synthetic-known-answer'
                ? 'synthetic-contract-fixture'
                : 'observed-runtime',
            observed: buildBoundary,
            preflightCapabilityReceipt,
        },
        target: {
            commit: compiled.declaration.target.commit,
            applicationTreeSha256: targetBefore.applicationTree.rootSha256,
            beforeSha256: sha256(canonicalJson(targetBefore)),
            afterSha256: sha256(canonicalJson(targetAfter)),
        },
        component: {
            id: compiled.declaration.component.id,
            packIds: [...compiled.declaration.component.packIds],
            visiblePackIds: [...compiled.declaration.component.visiblePackIds],
            unitIds: [...compiled.declaration.component.unitIds],
        },
        boundaryClasses,
        coverage: {
            localMasks: 2,
            boundaryClasses: boundaryClasses.length,
            expectedExecutions: 2 * boundaryClasses.length,
            processedExecutions: observations.length,
        },
        observations,
        boundaryConsensus: candidateBoundaryConsensus(observations, boundaryClasses),
        isolation: {
            target: 'fresh-target-projection-per-local-mask-and-boundary',
            process: 'fresh-process-per-local-mask-and-boundary',
            moduleGraph: 'fresh-process-module-graph',
            calculationCaches: 'empty-per-process',
            unmanagedHistory: 'unique-temporary-root-per-process',
            persistentLocalWorkers: false,
        },
        resources: {
            wallMs: Number(process.hrtime.bigint() - started) / 1e6,
            childCpuUserMs,
            childCpuSystemMs,
            childCpuTotalMs: childCpuUserMs + childCpuSystemMs,
            maximumRssKiB,
            temporaryPeakBytes: peakTemporaryBytes,
            temporaryPostRunResidueBytes: 0,
            logicalReceiptBytes: 0,
        },
        canonicalProtection: {
            canonicalGate: 'Global Exhaustive',
            globalFallbackRequired: true,
            productionClassification: 'G',
            defaultChanged: false,
            productionStateChanged: false,
            productionCertificates: 0,
            canonicalMasksSkipped: 0,
            c1Authorized: false,
        },
    }
    let receipt = sealMeasuredReceipt(payload)
    if (operatingCohort !== null) {
        payload.localRunId = computeLocalRunId(receipt)
        receipt = sealMeasuredReceipt(payload)
    }
    return validateLocalShadowReceipt(receipt)
}

module.exports = {
    DISPOSITIONS,
    LEGACY_LOCAL_RECEIPT_SCHEMA,
    LOCAL_RECEIPT_SCHEMA,
    SYNTHETIC_FAULTS,
    ToolchainShadowLocalError,
    runFreshLocalShadow,
    computeLocalRunId,
    validateLocalShadowReceipt,
}
