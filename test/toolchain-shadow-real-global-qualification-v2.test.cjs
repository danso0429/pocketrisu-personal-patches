'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const {
    buildSameGlobalComparison,
    sameGlobalReferenceFromComparison,
    validateSameGlobalComparison,
    validateSameGlobalReference,
} = require('../src/toolchain-shadow-same-global.cjs')
const {
    PROJECTION_SCHEMA,
    SEMANTIC_FIELD_SET_SHA256,
} = require('../src/toolchain-shadow-canonical-projection.cjs')
const {
    CANONICAL_PROTECTION,
    CONTENT_MANIFEST_V2_SCHEMA,
    OPERATING_COUNTS,
    REAL_GLOBAL_QUALIFICATION_TYPE,
    VALIDATION_RESULT_V2_SCHEMA,
    appendRegistryEntry,
    buildContentManifestV2,
    buildQualificationManifest,
    buildValidationResultV2,
    effectiveRegistryEntry,
    validateContentManifestV2,
    validateQualificationManifest,
    validateRegistry,
    validateValidationResultV2,
} = require('../src/qualification-registry.cjs')
const {
    validateRealGlobalQualificationRecord,
} = require('../src/toolchain-shadow-real-global-qualification.cjs')
const { sealDocument } = require('../src/verification-receipts.cjs')
const { loadToolchainShadowDeclaration } = require('../src/toolchain-shadow-contract.cjs')
const {
    MATERIAL_DECLARATION_V2_SCHEMA,
    TOOLCHAIN_IMPACT_REASON,
    declarationHash,
} = require('../src/operating-cohort-route.cjs')
const {
    candidateContractRoot,
    candidateContractVersion,
    preflightOperatingCohortWithTestDependencies,
} = require('../src/operating-cohort-preflight.cjs')
const { EXCLUDED_PURPOSES } = require('../src/toolchain-shadow-qualification.cjs')
const { BUILD_BOUNDARY_CLASS } = require('../src/toolchain-shadow-boundaries.cjs')

const HASH = (value) => value.repeat(64)
const COMMIT = (value) => value.repeat(40)
const visiblePacks = [
    'bg-stream-preserve', 'core-transaction', 'generation-profile', 'kei-chat-render',
    'kei-hypa-tools', 'kei-mobile-navigation', 'kei-partial-edit', 'kei-stream-parser',
    'lazy-chat-sync', 'persona-organizer', 'preset-integrity', 'toolchain-hardening',
]
const repositoryRoot = path.resolve(__dirname, '..')

function subject(seed = '1') {
    return {
        implementationCommit: '54c8307f87354ba14f6f94b3344cc228cfdea1f7',
        qualificationToolCommit: COMMIT(seed),
        policySha256: HASH('2'), contractSha256: HASH('3'),
        compiledDeclarationSha256: HASH('4'),
        targetCommit: COMMIT('5'), targetApplicationTreeSha256: HASH('6'),
    }
}

function reference() {
    return validateSameGlobalReference({
        schema: 'patch-toolchain-shadow-same-global-reference-v2',
        context: 'real-global-qualification',
        candidateId: 'toolchain-hardening',
        candidateDeclarationSha256: HASH('4'),
        projectionSchema: PROJECTION_SCHEMA,
        semanticFieldSetSha256: SEMANTIC_FIELD_SET_SHA256,
        localReceiptPayloadSha256: HASH('7'),
        references: { 0: HASH('8'), 1: HASH('9') },
    })
}

function observations(localReference = reference()) {
    return Array.from({ length: 4096 }, (_, mask) => {
        const candidateMask = Math.floor(mask / (2 ** 11)) % 2
        return {
            mask,
            candidateMask,
            projectionSha256: localReference.references[String(candidateMask)],
            matchesLocal: true,
        }
    })
}

function globalResult(comparison) {
    return {
        visiblePacks,
        rawSelections: 4096,
        verifiedSelections: 4096,
        toolchainShadowComparison: comparison,
    }
}

test('v2 qualification compares independently mapped real-Global projections without copied synthesis', () => {
    const localReference = reference()
    const comparison = buildSameGlobalComparison({
        reference: localReference,
        visiblePacks,
        observations: observations(localReference),
    })
    assert.equal(comparison.schema, 'patch-toolchain-shadow-same-global-comparison-v2')
    assert.equal(comparison.context, 'real-global-qualification')
    assert.equal(comparison.coverage.rawMasks, 4096)
    assert.equal(comparison.coverage.candidateOffMasks, 2048)
    assert.equal(comparison.coverage.candidateOnMasks, 2048)
    assert.equal(comparison.matches, 4096)
    assert.equal(comparison.mismatches, 0)
    assert.deepEqual(sameGlobalReferenceFromComparison(comparison), localReference)
    assert.equal(validateSameGlobalComparison(comparison, globalResult(comparison)), comparison)
})

test('wrong candidate bit, visible order, or one Global projection fails v2 qualification', () => {
    const localReference = reference()
    const wrongBit = observations(localReference)
    wrongBit[0] = { ...wrongBit[0], candidateMask: 1 }
    assert.throws(() => buildSameGlobalComparison({
        reference: localReference, visiblePacks, observations: wrongBit,
    }), /observation 0 is invalid/)
    assert.throws(() => buildSameGlobalComparison({
        reference: localReference,
        visiblePacks: [...visiblePacks].reverse(),
        observations: observations(localReference),
    }), /Visible pack order|Candidate bit index/)
    const mismatch = observations(localReference)
    mismatch[4095] = { ...mismatch[4095], projectionSha256: HASH('a'), matchesLocal: false }
    const comparison = buildSameGlobalComparison({ reference: localReference, visiblePacks, observations: mismatch })
    assert.equal(comparison.matches, 4095)
    assert.equal(comparison.mismatches, 1)
    assert.equal(comparison.status, 'failed')
})

test('registry preserves historical v1 and addresses accepted v2 by qualification type', () => {
    const v1Subject = subject('1')
    const v1 = appendRegistryEntry({
        storeIdentityHash: HASH('b'), action: 'accept', subject: v1Subject,
        qualificationManifestDescriptorSha256: HASH('c'), reason: 'historical v1',
        timestamp: '2026-08-16T00:00:00.000Z',
    })
    const v2Subject = subject('d')
    const v2 = appendRegistryEntry({
        baseRegistry: v1.registry, baseRegistryDescriptorSha256: HASH('e'),
        storeIdentityHash: HASH('b'), action: 'accept', subject: v2Subject,
        qualificationType: REAL_GLOBAL_QUALIFICATION_TYPE,
        qualificationManifestDescriptorSha256: HASH('f'), reason: 'accepted v2',
        timestamp: '2026-08-16T00:01:00.000Z',
    })
    validateRegistry(v2.registry)
    assert.equal(v2.registry.entries.length, 2)
    assert.equal(effectiveRegistryEntry(v2.registry, v1Subject).entry.qualificationType,
        'toolchain-hardening-shadow-pilot-closure')
    assert.equal(effectiveRegistryEntry(
        v2.registry, v2Subject, REAL_GLOBAL_QUALIFICATION_TYPE,
    ).entry.qualificationType, REAL_GLOBAL_QUALIFICATION_TYPE)
})

test('v2 content, validation, final manifest, and machine record stay non-operating', () => {
    const frozenSubject = subject('1')
    const objects = {
        qualificationRecordDescriptorSha256: HASH('1'),
        provisioningReceiptDescriptorSha256: HASH('2'),
        localReceiptDescriptorSha256: HASH('3'),
        globalReceiptDescriptorSha256: HASH('4'),
    }
    const content = buildContentManifestV2({
        createdAt: '2026-08-16T00:00:00.000Z', subject: frozenSubject, objects,
    })
    assert.equal(content.schema, CONTENT_MANIFEST_V2_SCHEMA)
    assert.equal(validateContentManifestV2(content), content)
    const checks = Object.fromEntries([
        'storeIdentityValid', 'objectHashesValid', 'objectTypesValid', 'schemasValid',
        'manifestReferencesComplete', 'receiptsValid', 'realGlobalProjectionValid',
        'authorityCompatible', 'operatingCountsIsolated', 'productionProtectionValid',
        'quarantineNotAuthority',
    ].map((key) => [key, true]))
    const validation = buildValidationResultV2({
        validatedAt: '2026-08-16T00:01:00.000Z', qualificationToolCommit: COMMIT('1'),
        storeIdentityHash: HASH('5'), contentManifestDescriptorSha256: HASH('6'),
        checkedDescriptors: Object.values(objects), checks,
    })
    assert.equal(validation.schema, VALIDATION_RESULT_V2_SCHEMA)
    assert.equal(validateValidationResultV2(validation), validation)
    const finalManifest = buildQualificationManifest({
        createdAt: '2026-08-16T00:02:00.000Z', subject: frozenSubject,
        qualificationType: REAL_GLOBAL_QUALIFICATION_TYPE,
        contentManifestDescriptorSha256: HASH('6'),
        validationResultDescriptorSha256: HASH('7'),
    })
    assert.equal(validateQualificationManifest(finalManifest), finalManifest)
    assert.deepEqual(finalManifest.operatingCounts, OPERATING_COUNTS)
    assert.deepEqual(finalManifest.canonicalProtection, CANONICAL_PROTECTION)
    const record = sealDocument({
        schema: REAL_GLOBAL_QUALIFICATION_TYPE,
        version: 2,
        recordedAt: '2026-08-16T00:02:00.000Z',
        result: 'passed', qualificationType: REAL_GLOBAL_QUALIFICATION_TYPE,
        subject: frozenSubject,
        sourceIdentity: {
            subjectSchemasSha256: HASH('1'), qualificationSchemasSha256: HASH('2'),
            localRouteSha256: HASH('3'), globalProjectionRouteSha256: HASH('4'),
            contractSha256: frozenSubject.contractSha256,
            compiledDeclarationSha256: frozenSubject.compiledDeclarationSha256,
            projectionSchema: PROJECTION_SCHEMA,
        },
        targetIdentity: {
            role: 'canonical-audited-target', commit: frozenSubject.targetCommit,
            applicationTreeSha256: frozenSubject.targetApplicationTreeSha256,
        },
        environment: {
            admittedBoundary: { ...BUILD_BOUNDARY_CLASS },
            provisioningReceiptPayloadSha256: HASH('5'),
        },
        projection: { schema: PROJECTION_SCHEMA, semanticFieldSetSha256: SEMANTIC_FIELD_SET_SHA256 },
        observations: {
            localCasesExpected: 8, localCasesCompleted: 8, boundaryConsensusPassed: true,
            globalMasksExpected: 4096, globalMasksCompleted: 4096, globalExecutionCount: 1,
            comparisons: 4096, matches: 4096, mismatches: 0,
        },
        receiptBindings: {
            provisioningReceiptPayloadSha256: HASH('5'), localReceiptPayloadSha256: HASH('6'),
            globalRunId: HASH('8'),
            globalReceiptPayloadSha256: HASH('7'),
        },
        checks: {
            admittedBuildBoundary: true, independentLocalGeneration: true,
            independentCanonicalGlobalGeneration: true, sharedCanonicalProjection: true,
            completeMapping: true, boundaryConsensus: true, allComparisonsMatched: true,
            targetIntegrity: true, receiptIntegrity: true,
        },
        acceptedPurpose: 'prerequisite-for-material-shadow-cohort-collection',
        excludedPurposes: [...EXCLUDED_PURPOSES], operatingCounts: { ...OPERATING_COUNTS },
        canonicalProtection: { ...CANONICAL_PROTECTION },
    })
    assert.equal(validateRealGlobalQualificationRecord(record), record)
})

test('operating preflight requires the accepted v2 qualification and remains blocked before host admission', (t) => {
    const compiled = loadToolchainShadowDeclaration(repositoryRoot)
    const frozenSubject = {
        ...subject('1'),
        contractSha256: HASH('3'),
        compiledDeclarationSha256: compiled.declarationSha256,
        targetCommit: compiled.declaration.target.commit,
        targetApplicationTreeSha256: compiled.declaration.target.applicationTreeSha256,
    }
    const compatibility = {
        subjectSchemasSha256: HASH('1'), qualificationSchemasSha256: HASH('2'),
        localRouteSha256: HASH('3'), globalProjectionRouteSha256: HASH('4'),
    }
    const declaration = {
        schema: MATERIAL_DECLARATION_V2_SCHEMA,
        version: 2,
        declarationId: 'first-material-c0-toolchain-hardening-v2',
        changeClass: 'patch', materiallyDistinct: true, stableRelease: false,
        releaseCandidate: 'not-applicable',
        materialReason: 'first-material-cohort-for-exact-subject-and-authority',
        candidateImpact: {
            affected: true, candidateId: 'toolchain-hardening', reason: TOOLCHAIN_IMPACT_REASON,
        },
        qualification: {
            type: REAL_GLOBAL_QUALIFICATION_TYPE, projectionSchema: PROJECTION_SCHEMA,
            subject: frozenSubject, compatibility,
        },
        environment: {
            id: 'toolchain:linux-arm64-glibc-node-25.9.0-pnpm-10.34.1',
            nodeVersion: 'v25.9.0', platform: 'linux', architecture: 'arm64',
            libc: 'glibc', pnpmVersion: '10.34.1',
        },
        globalContract: {
            canonicalGate: 'Global Exhaustive', workerSchedule: 'stride-v1',
            workerHistory: 'persistent-per-worker-v1', globalExecutionsExpected: 1,
        },
        declarationSha256: null,
    }
    declaration.declarationSha256 = declarationHash(declaration)
    const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-preflight-'))
    t.after(() => fs.rmSync(storeRoot, { recursive: true, force: true }))
    const qualificationRecord = {
        sourceIdentity: { ...compatibility },
        targetIdentity: { role: 'canonical-audited-target' },
        environment: { admittedBoundary: declaration.environment },
    }
    const verified = {
        registryDescriptorSha256: HASH('5'), registryRootSha256: HASH('6'),
        effectiveEntry: {
            action: 'accept', disposition: 'accepted-qualification',
            qualificationType: REAL_GLOBAL_QUALIFICATION_TYPE,
            qualificationManifestDescriptorSha256: HASH('7'), operatingCounts: { ...OPERATING_COUNTS },
        },
        qualification: {
            support: qualificationRecord,
            finalManifest: {
                qualificationType: REAL_GLOBAL_QUALIFICATION_TYPE,
                disposition: 'accepted-qualification', subject: frozenSubject,
                operatingCounts: { ...OPERATING_COUNTS }, canonicalProtection: { ...CANONICAL_PROTECTION },
            },
        },
    }
    const result = preflightOperatingCohortWithTestDependencies({
        storeRoot, expectation: declaration, subjectRoot: repositoryRoot,
        dependencies: {
            verifyQualificationRegistry: () => verified,
            loadStoreIdentity: () => ({ rootRealpath: storeRoot, storeIdentityHash: HASH('8') }),
        },
    })
    assert.equal(result.candidate.qualificationVersion, 'v2')
    assert.equal(result.candidate.projectionVersion, 'v2')
    assert.equal(result.candidate.qualificationCompatible, true)
    assert.equal(result.route.routeId, 'material-c0-global-plus-toolchain-shadow')
    assert.equal(result.route.safeToExecute, false)
    assert.deepEqual(result.blockers, ['operating-environment-not-provisioned'])
})

test('v2 qualification orchestrator permits one local and one Global launch with no material path', () => {
    const source = fs.readFileSync(path.join(
        repositoryRoot, 'scripts/run-toolchain-shadow-real-global-qualification-v2.cjs',
    ), 'utf8')
    assert.equal((source.match(/runFreshLocalShadow\(\{/g) ?? []).length, 1)
    assert.equal((source.match(/runChild\(process\.execPath, globalArgs/g) ?? []).length, 1)
    assert.match(source, /if \(localLaunches !== 0\)/)
    assert.match(source, /if \(globalLaunches !== 0\)/)
    assert.doesNotMatch(source, /syntheticGlobalProjection/)
    assert.doesNotMatch(source, /run-c0-evidence|claimGlobalLaunch|freezeOperatingCohort/)
    assert.match(source, /materialExecutions: 0/)
    assert.match(source, /materialGlobalLaunchClaims: 0/)
    assert.match(source, /buildMaterialInputIdentity/)
    assert.match(source, /buildCohortIdentity/)
    assert.match(source, /historicalV1StillVerifiable/)
})

test('v2 registration re-verifies the immutable v1 qualification against the new registry head', () => {
    const source = fs.readFileSync(path.join(
        repositoryRoot, 'scripts/register-toolchain-shadow-real-global-qualification-v2.cjs',
    ), 'utf8')
    assert.match(source, /historicalV1Entries/)
    assert.match(source, /'--qualification-type', QUALIFICATION_TYPE/)
    assert.match(source, /historicalV1StillVerifiable: true/)
    assert.match(source, /uniqueMaximalHead: verifiedHead\.metrics\.maximalHeadCount === 1/)
    assert.match(source, /currentRefMatchesMaximalHead:/)
})

test('v2 operating paths resolve the candidate contract from the versioned tooling root', () => {
    const v2 = {
        qualification: { type: REAL_GLOBAL_QUALIFICATION_TYPE },
    }
    const v1 = { qualification: {} }
    const subjectRoot = path.join(repositoryRoot, 'not-the-v2-contract-root')
    assert.equal(candidateContractRoot(subjectRoot, v2, repositoryRoot), repositoryRoot)
    assert.equal(candidateContractRoot(subjectRoot, v1, repositoryRoot), subjectRoot)
    assert.equal(candidateContractVersion(v2), 2)
    assert.equal(candidateContractVersion(v1), 1)
    for (const relative of [
        'scripts/freeze-operating-cohort.cjs',
        'scripts/run-c0-evidence.cjs',
    ]) {
        const source = fs.readFileSync(path.join(repositoryRoot, relative), 'utf8')
        assert.match(source, /candidateContractRoot\(/)
        assert.doesNotMatch(source,
            /loadToolchainShadowDeclaration\)\(subjectRoot|loadToolchainShadowDeclaration\)\(options\.subjectRoot/)
    }
})

test('historical v1 contract remains explicitly verifiable without entering v2 admission', () => {
    const historicalRoot = path.resolve(
        repositoryRoot, '../toolchain-hardening-shadow-pilot',
    )
    const compiled = loadToolchainShadowDeclaration(historicalRoot, { contractVersion: 1 })
    assert.equal(compiled.declaration.schema, 'patch-toolchain-shadow-contract-v1')
    assert.equal(compiled.declaration.version, 1)
    assert.equal(compiled.declaration.declarationSha256,
        '55a0c3f60f170871a2d40135588c5945b8a3e2098aaab25747db30f4ad07db4a')
    assert.throws(() => loadToolchainShadowDeclaration(historicalRoot), /ENOENT/)
})
