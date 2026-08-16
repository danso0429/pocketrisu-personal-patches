'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { loadCatalog } = require('../src/catalog.cjs')
const { applyTransition, planTransition } = require('../src/manager.cjs')
const { verifyShard } = require('../scripts/verify-all-combinations.cjs')
const {
    COHERENT_OBSERVATION_PHASE,
    candidateBoundaryConsensus,
    candidateMappingContract,
    canonicalCandidatePackIdentity,
    canonicalCandidateProjection,
    canonicalFileObservation,
    canonicalManagedFileBaseline,
    hashCanonicalCandidateProjection,
    validateCanonicalFileObservation,
    validateGlobalCandidateMapping,
    validateProjectionSnapshotCoherence,
} = require('../src/toolchain-shadow-canonical-projection.cjs')
const { createToolchainKnownAnswerTarget } = require('../src/toolchain-shadow-known-answer.cjs')

const ROOT = path.resolve(__dirname, '..')
const BOUNDARIES = ['a', 'b', 'c', 'd']

function project(target, mask, catalog = loadCatalog(ROOT)) {
    const baselineManagedFiles = canonicalManagedFileBaseline(target.root)
    const selected = mask === 1 ? ['toolchain-hardening'] : []
    const transition = planTransition({ root: target.root, catalog, packIds: selected, profile: 'test' })
    applyTransition({ root: target.root, transition })
    return canonicalCandidateProjection({
        mask,
        root: target.root,
        state: transition.state,
        catalog,
        target: transition.target,
        baselineManagedFiles,
        observationPhase: COHERENT_OBSERVATION_PHASE,
    })
}

function observations(projection) {
    return BOUNDARIES.map((boundaryClassId) => ({
        boundaryClassId,
        mask: projection.mask,
        candidateProjection: structuredClone(projection),
    }))
}

test('canonical file observation rejects asymmetric legacy descriptors and unsupported kinds', (t) => {
    const target = createToolchainKnownAnswerTarget(ROOT)
    t.after(() => fs.rmSync(target.root, { recursive: true, force: true }))
    const observed = canonicalFileObservation({ root: target.root, relativePath: 'package.json' })
    assert.deepEqual(Object.keys(observed).sort(), ['kind', 'mode', 'path', 'schema', 'sha256'])
    assert.throws(
        () => validateCanonicalFileObservation({
            type: 'file', bytes: 1, sha256: observed.sha256, mode: observed.mode,
        }),
        (error) => error.code === 'INVALID_CANONICAL_PROJECTION',
    )
    assert.throws(
        () => validateCanonicalFileObservation({
            schema: observed.schema, path: observed.path, kind: 'missing',
            sha256: observed.sha256, mode: observed.mode,
        }),
        (error) => error.code === 'INVALID_CANONICAL_FILE_OBSERVATION',
    )
    fs.symlinkSync('package.json', path.join(target.root, 'linked.json'))
    assert.throws(
        () => canonicalFileObservation({ root: target.root, relativePath: 'linked.json' }),
        (error) => error.code === 'UNSUPPORTED_CANONICAL_FILE_KIND',
    )
})

test('local and full-catalog paths derive one canonical projection independent of roots and metadata', (t) => {
    const local = createToolchainKnownAnswerTarget(ROOT)
    const global = createToolchainKnownAnswerTarget(ROOT)
    t.after(() => fs.rmSync(local.root, { recursive: true, force: true }))
    t.after(() => fs.rmSync(global.root, { recursive: true, force: true }))
    const globalBaseline = canonicalManagedFileBaseline(global.root)
    const localProjection = project(local, 1)
    const globalProjection = project(global, 1, loadCatalog(ROOT))
    assert.deepEqual(localProjection, globalProjection)
    const reordered = Object.fromEntries(Object.entries(localProjection).reverse())
    assert.equal(hashCanonicalCandidateProjection(reordered), localProjection.projectionSha256)
    assert.equal(canonicalCandidateProjection({
        mask: 1,
        root: global.root,
        state: planTransition({
            root: global.root, catalog: loadCatalog(ROOT), packIds: ['toolchain-hardening'], profile: 'test',
        }).state,
        catalog: loadCatalog(ROOT),
        target: { packageName: 'pocketrisu', packageVersion: '1.9.0' },
        baselineManagedFiles: globalBaseline,
        runId: 'ignored-run',
        receiptId: 'ignored-receipt',
        executionAttemptId: 'ignored-attempt',
        temporaryRoot: '/ignored',
    }).projectionSha256, globalProjection.projectionSha256)
})

test('coherent snapshot rejects restored-file/active-state and applied-file/inactive-state hybrids', (t) => {
    const offTarget = createToolchainKnownAnswerTarget(ROOT)
    const onTarget = createToolchainKnownAnswerTarget(ROOT)
    t.after(() => fs.rmSync(offTarget.root, { recursive: true, force: true }))
    t.after(() => fs.rmSync(onTarget.root, { recursive: true, force: true }))
    const baseline = canonicalManagedFileBaseline(offTarget.root)
    const off = project(offTarget, 0)
    const on = project(onTarget, 1)

    const activeWithRestoredFiles = structuredClone(on)
    activeWithRestoredFiles.managedFiles = structuredClone(baseline)
    activeWithRestoredFiles.projectionSha256 = hashCanonicalCandidateProjection(activeWithRestoredFiles)
    assert.throws(
        () => validateProjectionSnapshotCoherence(activeWithRestoredFiles, {
            baselineManagedFiles: baseline,
            observationPhase: COHERENT_OBSERVATION_PHASE,
        }),
        (error) => error.code === 'INCOHERENT_CANDIDATE_PROJECTION_SNAPSHOT',
    )

    const inactiveWithAppliedFiles = structuredClone(off)
    inactiveWithAppliedFiles.managedFiles = structuredClone(on.managedFiles)
    inactiveWithAppliedFiles.projectionSha256 = hashCanonicalCandidateProjection(inactiveWithAppliedFiles)
    assert.throws(
        () => validateProjectionSnapshotCoherence(inactiveWithAppliedFiles, {
            baselineManagedFiles: baseline,
            observationPhase: COHERENT_OBSERVATION_PHASE,
        }),
        (error) => error.code === 'INCOHERENT_CANDIDATE_PROJECTION_SNAPSHOT',
    )
})

test('active projection binds the three former regression files to applied persisted outputs', (t) => {
    const target = createToolchainKnownAnswerTarget(ROOT)
    t.after(() => fs.rmSync(target.root, { recursive: true, force: true }))
    const projection = project(target, 1)
    const outputs = new Map(projection.candidateState.persistedFiles
        .map((file) => [file.path, [file.outputSha256, file.outputMode]]))
    assert.deepEqual([...outputs.keys()], ['package.json', 'pnpm-lock.yaml', 'vitest.setup.ts'])
    for (const file of projection.managedFiles) {
        assert.deepEqual([file.sha256, file.mode], outputs.get(file.path))
    }
})

test('local runner captures the coherent projection before revert and still validates restoration', () => {
    const source = fs.readFileSync(path.join(ROOT, 'scripts/run-toolchain-shadow-mask.cjs'), 'utf8')
    const capture = source.indexOf("phase = 'projection-capture'")
    const revertPlan = source.indexOf("phase = 'revert-plan'")
    const revertApply = source.indexOf("phase = 'revert-apply'")
    const restoration = source.indexOf("phase = 'restoration'")
    assert.ok(capture > source.indexOf("phase = 'repeated-plan'"))
    assert.ok(capture < revertPlan)
    assert.ok(revertPlan < revertApply)
    assert.ok(revertApply < restoration)
    assert.match(source, /canonicalJson\(restoredSnapshot\) === canonicalJson\(baseline\)/)
})

test('pack identity excludes raw ETag source-format differences but binds semantic changes', () => {
    const catalog = loadCatalog(ROOT)
    const full = catalog.find((pack) => pack.id === 'toolchain-hardening')
    const standalone = structuredClone(full)
    delete standalone.presetDefaults
    standalone.targets.pocketrisu.verified = ['1.9.0']
    const target = { packageName: 'pocketrisu', packageVersion: '1.9.0' }
    const standaloneCatalog = catalog.map((pack) => pack.id === standalone.id ? standalone : pack)
    const canonical = canonicalCandidatePackIdentity({ catalog, target })
    assert.deepEqual(canonicalCandidatePackIdentity({ catalog: standaloneCatalog, target }), canonical)
    const unitChanged = structuredClone(full)
    unitChanged.units[0].managed += '\n'
    assert.notEqual(
        canonicalCandidatePackIdentity({
            catalog: catalog.map((pack) => pack.id === unitChanged.id ? unitChanged : pack), target,
        }).semanticSha256,
        canonical.semanticSha256,
    )
    const dependencyChanged = structuredClone(full)
    dependencyChanged.requires = ['another-pack']
    assert.notEqual(
        canonicalCandidatePackIdentity({
            catalog: catalog.map((pack) => pack.id === dependencyChanged.id ? dependencyChanged : pack), target,
        }).semanticSha256,
        canonical.semanticSha256,
    )
    const ownershipChanged = structuredClone(full)
    ownershipChanged.units[0].file = 'different.ts'
    assert.notEqual(
        canonicalCandidatePackIdentity({
            catalog: catalog.map((pack) => pack.id === ownershipChanged.id ? ownershipChanged : pack), target,
        }).semanticSha256,
        canonical.semanticSha256,
    )
    const relatedCatalog = structuredClone(catalog)
    relatedCatalog.find((pack) => pack.id !== 'toolchain-hardening').requires = ['toolchain-hardening']
    assert.notEqual(
        canonicalCandidatePackIdentity({ catalog: relatedCatalog, target }).semanticSha256,
        canonical.semanticSha256,
    )
    const collidingCatalog = structuredClone(catalog)
    collidingCatalog.find((pack) => pack.id !== 'toolchain-hardening').units[0].file = 'package.json'
    assert.notEqual(
        canonicalCandidatePackIdentity({ catalog: collidingCatalog, target }).semanticSha256,
        canonical.semanticSha256,
    )
    assert.throws(
        () => canonicalCandidatePackIdentity({
            catalog,
            target: { packageName: 'pocketrisu', packageVersion: '9.9.9' },
        }),
        (error) => error.code === 'CANDIDATE_TARGET_NOT_VERIFIED',
    )
})

test('boundary consensus requires four byte-identical semantic projections per mask', (t) => {
    const offTarget = createToolchainKnownAnswerTarget(ROOT)
    const onTarget = createToolchainKnownAnswerTarget(ROOT)
    t.after(() => fs.rmSync(offTarget.root, { recursive: true, force: true }))
    t.after(() => fs.rmSync(onTarget.root, { recursive: true, force: true }))
    const off = project(offTarget, 0)
    const on = project(onTarget, 1)
    const values = [...observations(off), ...observations(on)]
    const consensus = candidateBoundaryConsensus(values, BOUNDARIES)
    assert.equal(consensus.references['0'], off.projectionSha256)
    assert.equal(consensus.references['1'], on.projectionSha256)
    const changed = structuredClone(values)
    changed[0].candidateProjection.managedFiles[0].mode ^= 1
    const payload = changed[0].candidateProjection
    payload.projectionSha256 = hashCanonicalCandidateProjection(payload)
    assert.throws(
        () => candidateBoundaryConsensus(changed, BOUNDARIES),
        (error) => error.code === 'LOCAL_BOUNDARY_PROJECTION_MISMATCH',
    )
})

test('canonical mapping fixes visible order, bit 11 and complete 2048/2048 coverage', () => {
    const visible = loadCatalog(ROOT).filter((pack) => pack.userSelectable !== false)
        .map((pack) => pack.id).sort()
    const mapping = candidateMappingContract(visible)
    assert.equal(mapping.candidateBitIndex, 11)
    const observations = Array.from({ length: 4096 }, (_, mask) => ({
        mask,
        candidateMask: Math.floor(mask / (2 ** mapping.candidateBitIndex)) % 2,
    }))
    assert.deepEqual(validateGlobalCandidateMapping({ visiblePacks: visible, observations }), mapping)
    assert.throws(
        () => candidateMappingContract([...visible].reverse()),
        (error) => error.code === 'INVALID_GLOBAL_MAPPING',
    )
    const wrongBitOrder = [...visible]
    ;[wrongBitOrder[10], wrongBitOrder[11]] = [wrongBitOrder[11], wrongBitOrder[10]]
    wrongBitOrder.sort((left, right) => left === 'toolchain-hardening' ? -1 : right === 'toolchain-hardening' ? 1 : left.localeCompare(right))
    assert.throws(
        () => candidateMappingContract(wrongBitOrder),
        (error) => error.code === 'INVALID_GLOBAL_MAPPING',
    )
    const wrongMapping = structuredClone(observations)
    wrongMapping[0].candidateMask = 1
    assert.throws(
        () => validateGlobalCandidateMapping({ visiblePacks: visible, observations: wrongMapping }),
        (error) => error.code === 'INVALID_GLOBAL_MAPPING',
    )
    assert.throws(
        () => validateGlobalCandidateMapping({ visiblePacks: visible, observations: observations.slice(1) }),
        (error) => error.code === 'INVALID_GLOBAL_MAPPING',
    )
})

test('canonical Global verifier emits the shared projection for both candidate masks', (t) => {
    const localOffTarget = createToolchainKnownAnswerTarget(ROOT)
    const localOnTarget = createToolchainKnownAnswerTarget(ROOT)
    const globalOffTarget = createToolchainKnownAnswerTarget(ROOT)
    const globalOnTarget = createToolchainKnownAnswerTarget(ROOT)
    for (const target of [localOffTarget, localOnTarget, globalOffTarget, globalOnTarget]) {
        t.after(() => fs.rmSync(target.root, { recursive: true, force: true }))
    }
    const references = {
        0: project(localOffTarget, 0, loadCatalog(ROOT)).projectionSha256,
        1: project(localOnTarget, 1, loadCatalog(ROOT)).projectionSha256,
    }
    const reference = { candidateId: 'toolchain-hardening', references }
    const off = verifyShard({
        root: globalOffTarget.root,
        allowReviewing: false,
        shardIndex: 0,
        shardCount: 4096,
        toolchainShadowReference: reference,
    })
    const on = verifyShard({
        root: globalOnTarget.root,
        allowReviewing: false,
        shardIndex: 2048,
        shardCount: 4096,
        toolchainShadowReference: reference,
    })
    assert.equal(off.toolchainShadowObservations.length, 1)
    assert.deepEqual({ ...off.toolchainShadowObservations[0], candidateProjection: undefined }, {
        mask: 0,
        candidateMask: 0,
        projectionSha256: references[0],
        projectionObservationPhase: COHERENT_OBSERVATION_PHASE,
        candidateProjection: undefined,
        matchesLocal: true,
    })
    assert.deepEqual(off.toolchainShadowObservations[0].candidateProjection.projectionSha256, references[0])
    assert.equal(on.toolchainShadowObservations.length, 1)
    assert.deepEqual({ ...on.toolchainShadowObservations[0], candidateProjection: undefined }, {
        mask: 2048,
        candidateMask: 1,
        projectionSha256: references[1],
        projectionObservationPhase: COHERENT_OBSERVATION_PHASE,
        candidateProjection: undefined,
        matchesLocal: true,
    })
    assert.deepEqual(on.toolchainShadowObservations[0].candidateProjection.projectionSha256, references[1])
})
