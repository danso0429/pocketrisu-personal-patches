#!/usr/bin/env node
'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const {
    DEFAULT_INTENT_PATH,
    DEFAULT_JOURNAL_PATH,
    DEFAULT_LOCK_PATH,
    DEFAULT_STATE_PATH,
    applyTransition,
    planTransition,
    status,
} = require('../src/manager.cjs')
const {
    executeLocalStorageBoundary,
    validateCapabilityReceipt,
} = require('../src/toolchain-shadow-boundaries.cjs')
const {
    validateToolchainShadowDeclaration,
} = require('../src/toolchain-shadow-contract.cjs')
const { canonicalJson } = require('../src/verification-receipts.cjs')
const { sha256 } = require('../src/verification-evidence.cjs')
const {
    COHERENT_OBSERVATION_PHASE,
    canonicalCandidateProjection,
    canonicalManagedFileBaseline,
} = require('../src/toolchain-shadow-canonical-projection.cjs')

const SYNTHETIC_FAULTS = new Set([
    null,
    'apply-failure',
    'interrupted-worker',
    'repeated-plan-failure',
    'revert-corruption',
    'target-integrity-failure',
])

const METADATA_PATHS = [DEFAULT_INTENT_PATH, DEFAULT_JOURNAL_PATH, DEFAULT_LOCK_PATH, DEFAULT_STATE_PATH]

function descriptor(root, relative) {
    const absolute = path.join(root, relative)
    let stat
    try {
        stat = fs.lstatSync(absolute)
    } catch (error) {
        if (error.code === 'ENOENT') return null
        throw error
    }
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Unsupported projected entry: ${relative}`)
    const encoded = fs.readFileSync(absolute)
    return { type: 'file', bytes: encoded.length, sha256: sha256(encoded), mode: stat.mode & 0o7777 }
}

function snapshot(root, paths) {
    return Object.fromEntries([...paths].sort().map((relative) => [relative, descriptor(root, relative)]))
}

function allocatedBytes(root) {
    let total = 0
    function walk(absolute) {
        let stat
        try {
            stat = fs.lstatSync(absolute)
        } catch (error) {
            if (error.code === 'ENOENT') return
            throw error
        }
        total += Number(stat.blocks ?? 0) * 512
        if (stat.isDirectory()) {
            for (const name of fs.readdirSync(absolute)) walk(path.join(absolute, name))
        }
    }
    walk(root)
    return total
}

function remainingArtifacts(root) {
    const metadataRoot = path.join(root, 'save/pocketrisu-patches')
    const files = []
    function walk(absolute, relative = '') {
        let stat
        try {
            stat = fs.lstatSync(absolute)
        } catch (error) {
            if (error.code === 'ENOENT') return
            throw error
        }
        if (!stat.isDirectory()) {
            files.push(relative)
            return
        }
        for (const name of fs.readdirSync(absolute).sort()) {
            walk(path.join(absolute, name), relative ? `${relative}/${name}` : name)
        }
    }
    walk(metadataRoot)
    return files
}

function capabilityAccesses(declaration, transition) {
    const accesses = declaration.manifestExecution.declaredReads.map((resource) => ({
        kind: 'filesystem', mode: 'read', resource,
    }))
    for (const pathName of [...new Set(transition.preconditions.map((entry) => entry.path))]) {
        accesses.push({
            kind: pathName.startsWith('save/pocketrisu-patches/') ? 'state' : 'filesystem',
            mode: 'read',
            resource: pathName,
        })
    }
    for (const change of transition.changes) {
        accesses.push({
            kind: change.path.startsWith('save/pocketrisu-patches/') ? 'state' : 'filesystem',
            mode: change.after === null ? 'delete' : 'write',
            resource: change.path,
        })
    }
    for (const resource of [DEFAULT_LOCK_PATH, DEFAULT_JOURNAL_PATH]) {
        for (const mode of ['delete', 'read', 'write']) accesses.push({ kind: 'state', mode, resource })
    }
    for (const resource of declaration.symbols.map((entry) => entry.id)) {
        accesses.push({ kind: 'symbol', mode: 'observe', resource })
    }
    for (const resource of ['vitest/vi', 'happy-dom/Storage', 'katex']) {
        accesses.push({ kind: 'module', mode: 'execute', resource })
    }
    accesses.push(
        { kind: 'process-global', mode: 'read', resource: 'manager-pid' },
        { kind: 'randomness', mode: 'read', resource: 'manager-transaction-token' },
        { kind: 'time', mode: 'read', resource: 'manager-transaction-timestamp' },
    )
    return accesses
}

function main() {
    const input = JSON.parse(fs.readFileSync(0, 'utf8'))
    if (!input || ![0, 1].includes(input.mask) || typeof input.boundaryClassId !== 'string') {
        throw Object.assign(new Error('Invalid shadow-mask input'), { code: 'INVALID_SHADOW_MASK_INPUT' })
    }
    if (!SYNTHETIC_FAULTS.has(input.syntheticFault ?? null)) {
        throw Object.assign(new Error('Unknown synthetic fault'), { code: 'UNKNOWN_FAULT_INJECTION' })
    }
    const compiled = validateToolchainShadowDeclaration(input.declaration, {
        repositoryRoot: input.sourceRoot,
        targetRoot: input.targetRoot,
        compareCanonicalManifest: true,
    })
    const paths = [...compiled.managedPaths, ...METADATA_PATHS]
    const baseline = snapshot(input.targetRoot, paths)
    const canonicalBaseline = canonicalManagedFileBaseline(input.targetRoot)
    const baselineBytes = allocatedBytes(input.targetRoot)
    let peakBytes = baselineBytes
    const cpuStarted = process.cpuUsage()
    const wallStarted = process.hrtime.bigint()
    let phase = 'initial-plan'
    try {
        if (input.syntheticFault === 'interrupted-worker') {
            process.kill(process.pid, 'SIGTERM')
        }
        const selectedPackIds = input.mask === 1 ? ['toolchain-hardening'] : []
        const transition = planTransition({
            root: input.targetRoot,
            catalog: [compiled.pack],
            packIds: selectedPackIds,
            profile: 'toolchain-shadow-pilot',
        })
        const capabilityReceipt = validateCapabilityReceipt(
            capabilityAccesses(compiled.declaration, transition),
            compiled.declaration,
        )
        phase = 'apply'
        if (input.syntheticFault === 'apply-failure') {
            throw Object.assign(new Error('Synthetic apply failure'), { code: 'SYNTHETIC_APPLY_FAILURE' })
        }
        applyTransition({ root: input.targetRoot, transition })
        peakBytes = Math.max(peakBytes, allocatedBytes(input.targetRoot))
        const applied = snapshot(input.targetRoot, paths)
        phase = 'status'
        const observedStatus = status({ root: input.targetRoot }).status
        const expectedStatus = transition.state === null ? 'clean' : 'current'
        if (observedStatus !== expectedStatus) {
            throw new Error(`Expected ${expectedStatus}, observed ${observedStatus}`)
        }
        phase = 'symbol-boundary'
        const storageUnit = compiled.pack.units.find((unit) => unit.id === 'toolchain-hardening:vitest-storage')
        const operation = compiled.declaration.operations.find((unit) => unit.id === storageUnit.id)
        const symbolObservation = executeLocalStorageBoundary({
            source: fs.readFileSync(path.join(input.targetRoot, 'vitest.setup.ts'), 'utf8'),
            mask: input.mask,
            classId: input.boundaryClassId,
            anchorSha256: operation.anchor.sha256,
            managedSha256: operation.managed.sha256,
        })
        phase = 'repeated-plan'
        const repeated = planTransition({
            root: input.targetRoot,
            catalog: [compiled.pack],
            packIds: selectedPackIds,
            profile: 'toolchain-shadow-pilot',
        })
        if (input.syntheticFault === 'repeated-plan-failure') {
            throw Object.assign(new Error('Synthetic repeated-plan failure'), { code: 'SYNTHETIC_REPEATED_PLAN_FAILURE' })
        }
        if (repeated.changes.length !== 0) throw new Error('Same-selection re-plan was not zero-change')
        phase = 'projection-capture'
        const candidateProjection = canonicalCandidateProjection({
            mask: input.mask,
            root: input.targetRoot,
            state: transition.state,
            catalog: compiled.catalog,
            target: transition.target,
            baselineManagedFiles: canonicalBaseline,
            observationPhase: COHERENT_OBSERVATION_PHASE,
        })
        phase = 'revert-plan'
        const reverted = planTransition({
            root: input.targetRoot,
            catalog: [compiled.pack],
            packIds: [],
            profile: 'toolchain-shadow-pilot',
        })
        phase = 'revert-apply'
        applyTransition({ root: input.targetRoot, transition: reverted })
        if (input.syntheticFault === 'revert-corruption') {
            fs.appendFileSync(path.join(input.targetRoot, 'package.json'), ' ')
        }
        peakBytes = Math.max(peakBytes, allocatedBytes(input.targetRoot))
        phase = 'restoration'
        const restoredSnapshot = snapshot(input.targetRoot, paths)
        const restored = canonicalJson(restoredSnapshot) === canonicalJson(baseline)
        const artifacts = remainingArtifacts(input.targetRoot)
        if (!restored || artifacts.length !== 0) {
            throw Object.assign(new Error('Managed/state/artifact restoration failed'), {
                code: 'RESTORATION_FAILED',
                details: { baseline, restoredSnapshot, artifacts },
            })
        }
        const cpu = process.cpuUsage(cpuStarted)
        const wallMs = Number(process.hrtime.bigint() - wallStarted) / 1e6
        const resourceUsage = process.resourceUsage()
        process.stdout.write(`${JSON.stringify({
            schema: 'patch-toolchain-shadow-mask-observation-v2',
            processInstanceId: crypto.randomUUID(),
            workerPid: process.pid,
            mask: input.mask,
            selectedPackIds,
            boundaryClassId: input.boundaryClassId,
            initialPlan: {
                changeCount: transition.changes.length,
                unitIds: [...transition.order],
                candidatePaths: transition.changes.map((change) => change.path).sort(),
                stateSha256: transition.state === null
                    ? null
                    : sha256(canonicalJson(transition.state)),
            },
            apply: { status: observedStatus, paths: applied },
            symbolObservation,
            candidateProjection,
            projectionObservationPhase: COHERENT_OBSERVATION_PHASE,
            capabilityReceipt,
            repeatedPlan: { changeCount: repeated.changes.length },
            revert: { changeCount: reverted.changes.length },
            restoration: { restored, remainingArtifacts: artifacts, paths: restoredSnapshot },
            boundaryPreserved: true,
            resources: {
                wallMs,
                cpuUserMs: cpu.user / 1_000,
                cpuSystemMs: cpu.system / 1_000,
                maximumRssKiB: resourceUsage.maxRSS,
                temporaryBaselineBytes: baselineBytes,
                temporaryPeakBytes: peakBytes,
                temporaryResidueBytes: allocatedBytes(input.targetRoot),
            },
            observationSha256: sha256(canonicalJson({
                mask: input.mask,
                boundaryClassId: input.boundaryClassId,
                initialPlan: transition.changes.map((change) => [change.path, change.beforeMode, change.afterMode]),
                applied,
                symbolObservation,
                restoredSnapshot,
            })),
        })}\n`)
    } catch (error) {
        error.phase = phase
        throw error
    }
}

try {
    main()
} catch (error) {
    process.stderr.write(`${JSON.stringify({
        code: error.code ?? null,
        phase: error.phase ?? null,
        message: error.message,
        details: error.details ?? null,
    })}\n`)
    process.exitCode = 1
}
