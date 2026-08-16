'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
    DEFAULT_INTENT_PATH,
    DEFAULT_JOURNAL_PATH,
    DEFAULT_LOCK_PATH,
    DEFAULT_STATE_PATH,
    applyTransition,
    createPackEtagCache,
    createStateEncodingCache,
    planTransition,
    status,
} = require('./manager.cjs')
const { createCompositionCache, createPairAnalysisCache } = require('./compose.cjs')
const {
    copyVerificationRoot,
    inspectTarget,
    sameSnapshot,
    snapshot,
} = require('../scripts/verify-all-combinations.cjs')
const {
    loadToolchainShadowDeclaration,
    MANAGED_PATHS,
} = require('./toolchain-shadow-contract.cjs')
const {
    canonicalJson,
    sealDocument,
    verifyDocumentIntegrity,
} = require('./verification-receipts.cjs')
const {
    sha256,
    sourceFreezeDescriptor,
    targetFreezeDescriptor,
} = require('./verification-evidence.cjs')
const { validateLocalShadowReceipt } = require('./toolchain-shadow-local.cjs')
const {
    COHERENT_OBSERVATION_PHASE,
    candidateBoundaryConsensus,
    candidateMappingContract,
    candidateMaskForGlobalMask,
    canonicalCandidateProjection,
    canonicalManagedFileBaseline,
    validateCanonicalCandidateProjection,
} = require('./toolchain-shadow-canonical-projection.cjs')

const GLOBAL_PROJECTION_SCHEMA = 'patch-toolchain-shadow-global-projection-v1'
const METADATA_PATHS = [DEFAULT_INTENT_PATH, DEFAULT_JOURNAL_PATH, DEFAULT_LOCK_PATH, DEFAULT_STATE_PATH]
const SOURCE_KINDS = Object.freeze(['global-projection-one-worker', 'synthetic-known-answer'])

class ToolchainShadowGlobalError extends Error {
    constructor(code, message, details = {}) {
        super(message)
        this.name = 'ToolchainShadowGlobalError'
        this.code = code
        this.details = details
    }
}

function allocatedBytes(root) {
    let total = 0
    function walk(absolute) {
        let stat
        try { stat = fs.lstatSync(absolute) } catch (error) {
            if (error.code === 'ENOENT') return
            throw error
        }
        total += Number(stat.blocks ?? 0) * 512
        if (stat.isDirectory()) for (const name of fs.readdirSync(absolute)) walk(path.join(absolute, name))
    }
    walk(root)
    return total
}

function localProjectionReferences(localReceipt) {
    validateLocalShadowReceipt(localReceipt)
    if (localReceipt.schema === 'patch-toolchain-shadow-local-receipt-v2') {
        return candidateBoundaryConsensus(
            localReceipt.observations,
            localReceipt.boundaryClasses,
        ).references
    }
    const references = {}
    for (const mask of [0, 1]) {
        const values = localReceipt.observations
            .filter((entry) => entry.mask === mask)
            .map((entry) => entry.candidateProjection.projectionSha256)
        if (values.length !== 4 || new Set(values).size !== 1) {
            throw new ToolchainShadowGlobalError(
                'LOCAL_BOUNDARY_PROJECTION_MISMATCH',
                `Local mask ${mask} differs across admissible boundary classes`,
            )
        }
        references[mask] = values[0]
    }
    return references
}

function validateGlobalProjectionReceipt(receipt) {
    if (!verifyDocumentIntegrity(receipt) || receipt.schema !== GLOBAL_PROJECTION_SCHEMA) {
        throw new ToolchainShadowGlobalError('CORRUPT_GLOBAL_PROJECTION', 'Global projection integrity or schema is invalid')
    }
    if (!SOURCE_KINDS.includes(receipt.sourceKind) || !['passed', 'failed'].includes(receipt.status)) {
        throw new ToolchainShadowGlobalError('GLOBAL_PROJECTION_FAILED', 'Global projection source or status is unsupported')
    }
    if (canonicalJson(receipt.candidate) !== canonicalJson({
        packId: 'toolchain-hardening', productionClass: 'G', shadowClass: 'B',
    })) throw new ToolchainShadowGlobalError('PRODUCTION_CLASSIFICATION_CHANGED', 'Global projection changed candidate class')
    const visible = receipt.visiblePacks
    if (!Array.isArray(visible) || visible.length !== 12 || new Set(visible).size !== 12
        || canonicalJson(visible) !== canonicalJson([...visible].sort())
        || visible[receipt.candidateBitIndex] !== 'toolchain-hardening') {
        throw new ToolchainShadowGlobalError('INVALID_GLOBAL_DOMAIN', 'Global projection visible domain is invalid')
    }
    if (canonicalJson(receipt.coverage) !== canonicalJson({
        rawMasks: 4096,
        processedMasks: 4096,
        candidateOffMasks: 2048,
        candidateOnMasks: 2048,
        orderedMasksSha256: sha256(canonicalJson(Array.from({ length: 4096 }, (_, mask) => mask))),
    }) || receipt.observations.length !== 4096) {
        throw new ToolchainShadowGlobalError('INCOMPLETE_GLOBAL_PROJECTION', 'Global projection coverage is incomplete')
    }
    let off = 0
    let on = 0
    for (let mask = 0; mask < 4096; mask += 1) {
        const observation = receipt.observations[mask]
        const candidateMask = Math.floor(mask / (2 ** receipt.candidateBitIndex)) % 2
        if (observation?.mask !== mask || observation.candidateMask !== candidateMask
            || !/^[0-9a-f]{64}$/.test(observation.projectionSha256 ?? '')
            || (observation.projectionObservationPhase !== undefined
                && observation.projectionObservationPhase !== COHERENT_OBSERVATION_PHASE)
            || observation.repeatedPlanChangeCount !== 0
            || observation.restored !== true
            || typeof observation.matchesLocal !== 'boolean') {
            throw new ToolchainShadowGlobalError('INVALID_GLOBAL_OBSERVATION', `Global projection mask ${mask} is invalid`)
        }
        if (observation.candidateProjection !== undefined) {
            const projection = validateCanonicalCandidateProjection(observation.candidateProjection)
            if (projection.mask !== candidateMask
                || projection.projectionSha256 !== observation.projectionSha256) {
                throw new ToolchainShadowGlobalError(
                    'INVALID_GLOBAL_OBSERVATION',
                    `Global projection mask ${mask} preimage is invalid`,
                )
            }
        }
        if (candidateMask === 0) off += 1
        else on += 1
    }
    const mismatches = receipt.observations.filter((entry) => !entry.matchesLocal).length
    if (off !== 2048 || on !== 2048 || receipt.comparison?.mismatches !== mismatches
        || !['not-authorized', 'denied'].includes(receipt.comparison?.candidateAdmission)
        || (receipt.status === 'passed' && (mismatches !== 0 || receipt.comparison.candidateAdmission !== 'not-authorized'))
        || (receipt.status === 'failed' && (mismatches === 0 || receipt.comparison.candidateAdmission !== 'denied'))) {
        throw new ToolchainShadowGlobalError('GLOBAL_LOCAL_MISMATCH', 'Global projection status differs from mismatch evidence')
    }
    if (receipt.sourceKind === 'synthetic-known-answer'
        && receipt.materialEligibility !== 'synthetic-only') {
        throw new ToolchainShadowGlobalError('SYNTHETIC_PROMOTION', 'Synthetic projection cannot become material evidence')
    }
    if (receipt.sourceKind === 'global-projection-one-worker'
        && receipt.materialEligibility !== 'requires-bound-c0-global-receipt') {
        throw new ToolchainShadowGlobalError('MISSING_GLOBAL_REFERENCE', 'Material projection requires a bound C0 Global receipt')
    }
    const protection = receipt.canonicalProtection
    if (protection?.canonicalGate !== 'Global Exhaustive'
        || protection.globalRunReplaced !== false
        || protection.globalMasksSkipped !== 0
        || protection.productionClassification !== 'G'
        || protection.productionCertificates !== 0
        || protection.productionStateChanged !== false
        || protection.c1Authorized !== false) {
        throw new ToolchainShadowGlobalError('CANONICAL_PROTECTION_WEAKENED', 'Global projection weakens canonical protection')
    }
    return receipt
}

function syntheticGlobalProjection({ localReceipt, visiblePacks, recordedAt = new Date().toISOString() }) {
    const references = localProjectionReferences(localReceipt)
    const mapping = candidateMappingContract(visiblePacks)
    const candidateBitIndex = mapping.candidateBitIndex
    if (candidateBitIndex < 0) throw new ToolchainShadowGlobalError('INVALID_GLOBAL_DOMAIN', 'Candidate is not visible')
    const observations = Array.from({ length: 4096 }, (_, mask) => {
        const candidateMask = Math.floor(mask / (2 ** candidateBitIndex)) % 2
        return {
            mask,
            candidateMask,
            projectionSha256: references[candidateMask],
            status: 'synthetic-known-answer',
            repeatedPlanChangeCount: 0,
            revertPlanChangeCount: 0,
            restored: true,
            matchesLocal: true,
        }
    })
    return validateGlobalProjectionReceipt(sealDocument({
        schema: GLOBAL_PROJECTION_SCHEMA,
        status: 'passed',
        sourceKind: 'synthetic-known-answer',
        recordedAt,
        candidate: { packId: 'toolchain-hardening', productionClass: 'G', shadowClass: 'B' },
        declarationSha256: localReceipt.declarationSha256,
        source: { kind: 'synthetic-known-answer', sha256: sha256('toolchain-shadow-synthetic-source-v1') },
        target: localReceipt.target,
        visiblePacks: [...visiblePacks],
        candidateBitIndex,
        localReceiptPayloadSha256: localReceipt.integrity.payloadSha256,
        coverage: {
            rawMasks: 4096,
            processedMasks: 4096,
            candidateOffMasks: 2048,
            candidateOnMasks: 2048,
            orderedMasksSha256: sha256(canonicalJson(observations.map((entry) => entry.mask))),
        },
        observations,
        comparison: { mismatches: 0, candidateAdmission: 'not-authorized' },
        resources: {
            wallMs: 0, cpuUserMs: 0, cpuSystemMs: 0, maximumRssKiB: 0,
            temporaryBaselineBytes: 0, temporaryPeakBytes: 0, temporaryPostRunResidueBytes: 0,
        },
        materialEligibility: 'synthetic-only',
        canonicalProtection: {
            canonicalGate: 'Global Exhaustive', globalRunReplaced: false, globalMasksSkipped: 0,
            productionClassification: 'G', productionCertificates: 0,
            productionStateChanged: false, c1Authorized: false,
        },
    }))
}

async function runGlobalProjection({
    sourceRoot,
    targetRoot,
    localReceipt,
    targetProvenance = null,
    recordedAt = new Date().toISOString(),
}) {
    const source = fs.realpathSync(path.resolve(sourceRoot))
    const target = fs.realpathSync(path.resolve(targetRoot))
    const compiled = loadToolchainShadowDeclaration(source, { targetRoot: target })
    const references = localProjectionReferences(localReceipt)
    if (compiled.declarationSha256 !== localReceipt.declarationSha256) {
        throw new ToolchainShadowGlobalError('DECLARATION_MISMATCH', 'Local receipt uses another declaration')
    }
    const sourceBefore = await sourceFreezeDescriptor(source)
    const targetBefore = await targetFreezeDescriptor(target, { targetProvenance })
    if (targetBefore.applicationTree.rootSha256 !== compiled.declaration.target.applicationTreeSha256) {
        throw new ToolchainShadowGlobalError('TARGET_BASELINE_DRIFT', 'Global projection target differs from declaration')
    }
    const inspected = inspectTarget(target, false)
    const visiblePacks = inspected.visible
    if (visiblePacks.length !== 12 || !visiblePacks.includes('toolchain-hardening')) {
        throw new ToolchainShadowGlobalError('INVALID_GLOBAL_DOMAIN', 'Expected exact current 12-pack visible domain')
    }
    const mapping = candidateMappingContract(visiblePacks)
    const candidateBitIndex = mapping.candidateBitIndex
    if (inspected.catalog.every((pack) => pack.id !== 'toolchain-hardening')) {
        throw new ToolchainShadowGlobalError('INVALID_GLOBAL_DOMAIN', 'Candidate is absent from the canonical Global catalog')
    }
    const baseline = snapshot(target, [...inspected.managedPaths, ...METADATA_PATHS])
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'toolchain-global-projection-'))
    const projectionRoot = path.join(temporaryRoot, 'target')
    const started = process.hrtime.bigint()
    const cpuStarted = process.cpuUsage()
    let peakBytes = allocatedBytes(temporaryRoot)
    const observations = []
    let phase = 'copy-target'
    let currentMask = null
    try {
        copyVerificationRoot(target, projectionRoot, inspected.managedPaths, snapshot(target, inspected.managedPaths))
        peakBytes = Math.max(peakBytes, allocatedBytes(temporaryRoot))
        const compositionCache = createCompositionCache()
        const pairAnalysisCache = createPairAnalysisCache()
        const packEtagCache = createPackEtagCache()
        const stateEncodingCache = createStateEncodingCache()
        const candidateBaseline = canonicalManagedFileBaseline(projectionRoot)
        const sampledCandidateMasks = new Set()
        for (let mask = 0; mask < 4096; mask += 1) {
            currentMask = mask
            const selected = visiblePacks.filter((_, index) => Math.floor(mask / (2 ** index)) % 2 === 1)
            phase = 'initial-plan'
            const transition = planTransition({
                root: projectionRoot,
                catalog: inspected.catalog,
                packIds: selected,
                profile: 'toolchain-shadow-global-projection',
                compositionOptions: { compositionCache, pairAnalysisCache },
                packEtagCache,
                stateEncodingCache,
            })
            phase = 'apply'
            applyTransition({ root: projectionRoot, transition })
            peakBytes = Math.max(peakBytes, allocatedBytes(temporaryRoot))
            phase = 'status'
            const observedStatus = status({ root: projectionRoot }).status
            const expectedStatus = transition.state === null ? 'clean' : 'current'
            if (observedStatus !== expectedStatus) throw new Error(`Expected ${expectedStatus}, observed ${observedStatus}`)
            phase = 'repeated-plan'
            const repeated = planTransition({
                root: projectionRoot,
                catalog: inspected.catalog,
                packIds: selected,
                profile: 'toolchain-shadow-global-projection',
                compositionOptions: { compositionCache, pairAnalysisCache },
                packEtagCache,
                stateEncodingCache,
            })
            if (repeated.changes.length !== 0) throw new Error('Global projection repeated plan changed')
            const candidateMask = candidateMaskForGlobalMask(mask, mapping)
            const candidateProjection = canonicalCandidateProjection({
                mask: candidateMask,
                root: projectionRoot,
                state: transition.state,
                catalog: inspected.catalog,
                target: {
                    packageName: inspected.pkg.name,
                    packageVersion: inspected.pkg.version,
                },
                baselineManagedFiles: candidateBaseline,
                observationPhase: COHERENT_OBSERVATION_PHASE,
            })
            phase = 'revert-plan'
            const reverted = planTransition({
                root: projectionRoot,
                catalog: inspected.catalog,
                packIds: [],
                profile: 'toolchain-shadow-global-projection',
                compositionOptions: { compositionCache, pairAnalysisCache },
                packEtagCache,
                stateEncodingCache,
            })
            phase = 'revert-apply'
            applyTransition({ root: projectionRoot, transition: reverted })
            peakBytes = Math.max(peakBytes, allocatedBytes(temporaryRoot))
            phase = 'restoration'
            const restored = sameSnapshot(
                snapshot(projectionRoot, [...inspected.managedPaths, ...METADATA_PATHS]),
                baseline,
            )
            if (!restored) throw new Error('Global projection did not restore managed/state paths')
            observations.push({
                mask,
                candidateMask,
                projectionSha256: candidateProjection.projectionSha256,
                projectionObservationPhase: COHERENT_OBSERVATION_PHASE,
                ...(!sampledCandidateMasks.has(candidateMask)
                    ? { candidateProjection }
                    : {}),
                status: observedStatus,
                repeatedPlanChangeCount: repeated.changes.length,
                revertPlanChangeCount: reverted.changes.length,
                restored,
                matchesLocal: candidateProjection.projectionSha256 === references[candidateMask],
            })
            sampledCandidateMasks.add(candidateMask)
        }
        const mismatches = observations.filter((entry) => !entry.matchesLocal).length
        const sourceAfter = await sourceFreezeDescriptor(source)
        const targetAfter = await targetFreezeDescriptor(target, { targetProvenance })
        if (sha256(canonicalJson(sourceBefore)) !== sha256(canonicalJson(sourceAfter))
            || sha256(canonicalJson(targetBefore)) !== sha256(canonicalJson(targetAfter))) {
            throw new ToolchainShadowGlobalError('INPUT_INTEGRITY_FAILURE', 'Source or target changed during projection')
        }
        const cpu = process.cpuUsage(cpuStarted)
        fs.rmSync(temporaryRoot, { recursive: true, force: true })
        const receipt = sealDocument({
            schema: GLOBAL_PROJECTION_SCHEMA,
            status: mismatches === 0 ? 'passed' : 'failed',
            sourceKind: 'global-projection-one-worker',
            recordedAt,
            candidate: { packId: 'toolchain-hardening', productionClass: 'G', shadowClass: 'B' },
            declarationSha256: compiled.declarationSha256,
            source: {
                beforeSha256: sha256(canonicalJson(sourceBefore)),
                afterSha256: sha256(canonicalJson(sourceAfter)),
            },
            target: {
                commit: compiled.declaration.target.commit,
                beforeSha256: sha256(canonicalJson(targetBefore)),
                afterSha256: sha256(canonicalJson(targetAfter)),
                applicationTreeSha256: targetBefore.applicationTree.rootSha256,
            },
            visiblePacks,
            candidateBitIndex,
            localReceiptPayloadSha256: localReceipt.integrity.payloadSha256,
            coverage: {
                rawMasks: 4096, processedMasks: observations.length,
                candidateOffMasks: observations.filter((entry) => entry.candidateMask === 0).length,
                candidateOnMasks: observations.filter((entry) => entry.candidateMask === 1).length,
                orderedMasksSha256: sha256(canonicalJson(observations.map((entry) => entry.mask))),
            },
            observations,
            comparison: {
                mismatches,
                candidateAdmission: mismatches === 0 ? 'not-authorized' : 'denied',
            },
            resources: {
                wallMs: Number(process.hrtime.bigint() - started) / 1e6,
                cpuUserMs: cpu.user / 1_000,
                cpuSystemMs: cpu.system / 1_000,
                maximumRssKiB: process.resourceUsage().maxRSS,
                temporaryBaselineBytes: 0,
                temporaryPeakBytes: peakBytes,
                temporaryPostRunResidueBytes: 0,
            },
            materialEligibility: 'requires-bound-c0-global-receipt',
            canonicalProtection: {
                canonicalGate: 'Global Exhaustive', globalRunReplaced: false, globalMasksSkipped: 0,
                productionClassification: 'G', productionCertificates: 0,
                productionStateChanged: false, c1Authorized: false,
            },
        })
        return validateGlobalProjectionReceipt(receipt)
    } catch (error) {
        throw new ToolchainShadowGlobalError('GLOBAL_PROJECTION_FIRST_FAILURE', 'Global projection failed; projection retained', {
            mask: currentMask,
            phase,
            projectionRoot,
            causeCode: error.code ?? null,
            cause: error.message,
            details: error.details ?? null,
        })
    }
}

module.exports = {
    GLOBAL_PROJECTION_SCHEMA,
    ToolchainShadowGlobalError,
    localProjectionReferences,
    runGlobalProjection,
    syntheticGlobalProjection,
    validateGlobalProjectionReceipt,
}
