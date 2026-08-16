'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { parseArgs: parseLegacyPilotArgs } = require('../scripts/run-toolchain-shadow-pilot.cjs')
const {
    ROUTE_COMBINED,
    ROUTE_GLOBAL,
    createOneGlobalExecutionGuard,
    declarationHash,
    decideOperatingCohortRoute,
    rejectLegacyOperatingInstruction,
    validateReusableGlobalAnchor,
} = require('../src/operating-cohort-route.cjs')

const repositoryRoot = path.resolve(__dirname, '..')
const declarationFile = path.join(repositoryRoot, 'contracts/first-material-c0-toolchain-hardening-v1.json')

function declaration(changes = null) {
    const value = JSON.parse(fs.readFileSync(declarationFile, 'utf8'))
    if (changes) changes(value)
    value.declarationSha256 = declarationHash(value)
    return value
}

function qualification(value) {
    return {
        accepted: true,
        registryIntegrity: true,
        reason: 'accepted-durable-compatible-qualification',
        subject: structuredClone(value.qualification.subject),
        compatibility: structuredClone(value.qualification.compatibility),
        environment: structuredClone(value.environment),
    }
}

function domain(value) {
    return {
        candidateId: 'toolchain-hardening',
        localMasksExpected: 2,
        boundaryClassesExpected: 4,
        totalLocalCasesExpected: 8,
        compiledDeclarationSha256: value.qualification.subject.compiledDeclarationSha256,
    }
}

function decide(value, overrides = {}) {
    return decideOperatingCohortRoute({
        declaration: value,
        qualificationState: qualification(value),
        freshVerification: 'passed',
        candidateDomain: domain(value),
        operatingEnvironmentProvisioned: true,
        operatingBuildBoundaryVerification: 'passed',
        ...overrides,
    })
}

test('candidate-unaffected material cohort selects one Global and zero local cases', () => {
    const value = declaration((draft) => {
        draft.candidateImpact = { affected: false, candidateId: null, reason: 'candidate-unaffected' }
    })
    const result = decideOperatingCohortRoute({ declaration: value })
    assert.equal(result.routeId, ROUTE_GLOBAL)
    assert.equal(result.globalExecutionsExpected, 1)
    assert.equal(result.totalLocalCasesExpected, 0)
})

test('qualification success and operating-boundary failure remain distinct and fail closed', () => {
    const value = declaration()
    const result = decide(value, {
        operatingEnvironmentProvisioned: true,
        operatingBuildBoundaryVerification: 'failed',
    })
    assert.equal(result.qualificationFreshVerification, 'passed')
    assert.equal(result.operatingBuildBoundaryVerification, 'failed')
    assert.equal(result.safeToExecute, false)
    assert.deepEqual(result.blockers, ['operating-build-boundary-verification-failed'])
})

test('exact qualified affected toolchain candidate selects one Global plus eight local cases', () => {
    const value = declaration()
    const result = decide(value)
    assert.equal(result.routeId, ROUTE_COMBINED)
    assert.equal(result.globalExecutionsExpected, 1)
    assert.equal(result.localMasksExpected, 2)
    assert.equal(result.boundaryClassesExpected, 4)
    assert.equal(result.totalLocalCasesExpected, 8)
    assert.equal(result.candidateOperatingSampleEligible, true)
})

test('stale candidate contract fails closed to Global without an operating sample', () => {
    const value = declaration()
    const state = qualification(value)
    state.subject.contractSha256 = '0'.repeat(64)
    const result = decide(value, { qualificationState: state })
    assert.equal(result.routeId, ROUTE_GLOBAL)
    assert.equal(result.candidateOperatingSampleEligible, false)
    assert.equal(result.candidateSkipReason, 'stale-qualified-contract')
})

test('stale target fails closed to Global without an operating sample', () => {
    const value = declaration()
    const state = qualification(value)
    state.subject.targetCommit = '0'.repeat(40)
    const result = decide(value, { qualificationState: state })
    assert.equal(result.routeId, ROUTE_GLOBAL)
    assert.equal(result.candidateSkipReason, 'stale-qualified-target')
})

test('stale policy fails closed to Global without an operating sample', () => {
    const value = declaration()
    const state = qualification(value)
    state.subject.policySha256 = '0'.repeat(64)
    const result = decide(value, { qualificationState: state })
    assert.equal(result.routeId, ROUTE_GLOBAL)
    assert.equal(result.candidateSkipReason, 'stale-qualified-policy')
})

test('revoked qualification cannot produce a candidate operating sample', () => {
    const value = declaration()
    const state = qualification(value)
    state.accepted = false
    state.reason = 'revoked-qualification'
    const result = decide(value, { qualificationState: state })
    assert.equal(result.routeId, ROUTE_GLOBAL)
    assert.equal(result.candidateOperatingSampleEligible, false)
    assert.equal(result.candidateSkipReason, 'revoked-qualification')
})

test('registry rollback, fork, and integrity failures cannot produce candidate samples', () => {
    const value = declaration()
    for (const reason of ['registry-head-rollback', 'registry-fork', 'qualification-registry-integrity-failure']) {
        const state = qualification(value)
        state.registryIntegrity = false
        state.reason = reason
        const result = decide(value, { qualificationState: state })
        assert.equal(result.routeId, ROUTE_GLOBAL)
        assert.equal(result.candidateSkipReason, reason)
        assert.equal(result.candidateOperatingSampleEligible, false)
    }
})

test('local domain differing from declared 2 by 4 fails closed', () => {
    const value = declaration()
    const changedDomain = { ...domain(value), boundaryClassesExpected: 5, totalLocalCasesExpected: 10 }
    const result = decide(value, { candidateDomain: changedDomain })
    assert.equal(result.routeId, ROUTE_GLOBAL)
    assert.equal(result.candidateSkipReason, 'candidate-local-domain-mismatch')
})

test('combined execution guard rejects before a second Global execution', async () => {
    let calls = 0
    const guard = createOneGlobalExecutionGuard(async () => { calls += 1; return calls })
    assert.equal(await guard.execute(), 1)
    await assert.rejects(() => guard.execute(), { code: 'SECOND_GLOBAL_EXECUTION_FORBIDDEN' })
    assert.equal(calls, 1)
    assert.equal(guard.executions(), 1)
})

function anchor() {
    return {
        cohortId: '1'.repeat(64),
        globalRunId: '2'.repeat(64),
        subjectCommit: '3'.repeat(40),
        policySha256: '4'.repeat(64),
        targetCommit: '5'.repeat(40),
        targetApplicationTreeSha256: '6'.repeat(64),
        workerScheduleSha256: '7'.repeat(64),
        cacheHistorySha256: 'b'.repeat(64),
        runtimeSemanticSha256: '8'.repeat(64),
        materialDeclarationSha256: '9'.repeat(64),
    }
}

test('Global receipt from another cohort is rejected', () => {
    const expected = anchor()
    assert.throws(() => validateReusableGlobalAnchor({ ...expected, cohortId: 'a'.repeat(64) }, expected), {
        code: 'CROSS_COHORT_GLOBAL_RECEIPT',
    })
})

test('candidate comparison receiving another Global run ID is rejected', () => {
    const expected = anchor()
    assert.throws(() => validateReusableGlobalAnchor({ ...expected, globalRunId: 'a'.repeat(64) }, expected), {
        code: 'GLOBAL_RUN_ID_MISMATCH',
    })
})

test('candidate comparison rejects a different canonical history contract', () => {
    const expected = anchor()
    assert.throws(() => validateReusableGlobalAnchor({
        ...expected,
        cacheHistorySha256: 'a'.repeat(64),
    }, expected), { code: 'GLOBAL_ANCHOR_IDENTITY_MISMATCH' })
})

test('ambiguous historical instruction 6A shape is not a route decision', () => {
    assert.throws(() => rejectLegacyOperatingInstruction({ instruction: '6A', candidateAffected: true }), {
        code: 'LEGACY_OPERATING_ROUTE_REJECTED',
    })
})

test('current operating route IDs contain no canonical section-number aliases', () => {
    assert.deepEqual([ROUTE_GLOBAL, ROUTE_COMBINED], [
        'material-c0-global', 'material-c0-global-plus-toolchain-shadow',
    ])
    const surfaces = [
        'src/operating-cohort-route.cjs',
        'src/operating-cohort-preflight.cjs',
        'scripts/preflight-operating-cohort.cjs',
        'scripts/run-c0-evidence.cjs',
        'docs/C0-EVIDENCE-OPERATING-PROGRAM.md',
        'docs/TOOLCHAIN-HARDENING-SHADOW-PILOT.md',
    ].map((relative) => fs.readFileSync(path.join(repositoryRoot, relative), 'utf8')).join('\n')
    assert.doesNotMatch(surfaces, /routeId\s*[:=][^\n]*(?:6A|6B)/)
    assert.doesNotMatch(surfaces, /instruction:\s*(?:6A|6B)/)
})

test('legacy material pilot entrypoint cannot execute a second 4096-mask projection', () => {
    assert.throws(() => parseLegacyPilotArgs([
        'node', 'run-toolchain-shadow-pilot.cjs', '--material-shadow',
        '--root', repositoryRoot,
        '--store', '/tmp/store',
        '--receipt', '/tmp/receipt.json',
        '--governance-commit', '1'.repeat(40),
        '--trial-id', 'legacy-material',
    ]), { code: 'LEGACY_MATERIAL_SHADOW_ROUTE_REMOVED' })
    const source = fs.readFileSync(path.join(repositoryRoot, 'scripts/run-toolchain-global-projection.cjs'), 'utf8')
    assert.match(source, /SEPARATE_MATERIAL_GLOBAL_PROJECTION_FORBIDDEN/)
})

test('canonical policy keeps its unrelated 6A generation and 6B verifier meanings', () => {
    const policy = fs.readFileSync(path.join(repositoryRoot, 'docs/patch-combination-verification-instructions.md'), 'utf8')
    assert.match(policy, /6A generation is immutable, content-addressed and write-only\./)
    assert.match(policy, /6B uses a\s+separate verifier path to re-hash keys, manifests, leaves and proofs/)
})
