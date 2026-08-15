'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { initializeQualificationStore } = require('../src/qualification-object-store.cjs')
const { CANONICAL_PROTECTION, OPERATING_COUNTS } = require('../src/qualification-registry.cjs')
const {
    EXPECTATION_SCHEMA,
    preflightOperatingCohort,
    treeIdentity,
} = require('../src/operating-cohort-preflight.cjs')
const {
    CANONICAL_TARGET_TREE_SHA256,
    COMPILED_DECLARATION_SHA256,
    CONTRACT_SHA256,
    POLICY_SHA256,
    SUBJECT_IMPLEMENTATION_COMMIT,
    TARGET_COMMIT,
} = require('../src/toolchain-shadow-qualification.cjs')

const repositoryRoot = path.resolve(__dirname, '..')
const fixtureParent = path.resolve(repositoryRoot, '../..')
const quarantineRoot = '/home/ubuntu/.local/share/pocketrisu-patcher/evidence-quarantine/toolchain-shadow-closure-54c8307f87354ba1'
const TOOL_COMMIT = '3'.repeat(40)

function fixture(t) {
    const parent = fs.mkdtempSync(path.join(fixtureParent, '.qualification-preflight-test-'))
    t.after(() => fs.rmSync(parent, { recursive: true, force: true }))
    const storeRoot = path.join(parent, 'store')
    const identity = initializeQualificationStore({
        storeRoot,
        forbiddenRoots: [repositoryRoot, quarantineRoot],
        createdAt: '2026-08-15T11:00:00.000Z',
    })
    return { storeRoot, identity }
}

function expectation() {
    return {
        schema: EXPECTATION_SCHEMA,
        subject: {
            implementationCommit: SUBJECT_IMPLEMENTATION_COMMIT,
            qualificationToolCommit: TOOL_COMMIT,
            policySha256: POLICY_SHA256,
            contractSha256: CONTRACT_SHA256,
            compiledDeclarationSha256: COMPILED_DECLARATION_SHA256,
            targetCommit: TARGET_COMMIT,
            targetApplicationTreeSha256: CANONICAL_TARGET_TREE_SHA256,
        },
        compatibility: {
            subjectSchemasSha256: '1'.repeat(64),
            qualificationSchemasSha256: '2'.repeat(64),
            localRouteSha256: '3'.repeat(64),
            globalProjectionRouteSha256: '4'.repeat(64),
        },
    }
}

function acceptedVerification(overrides = {}) {
    const expected = expectation()
    const support = {
        sourceIdentity: { ...expected.compatibility },
        targetIdentity: { role: 'canonical-audited-target' },
    }
    const verified = {
        registryDescriptorSha256: '5'.repeat(64),
        registryRootSha256: '6'.repeat(64),
        effectiveEntry: {
            action: 'accept', disposition: 'accepted-qualification',
            qualificationType: 'toolchain-hardening-shadow-pilot-closure',
            operatingCounts: { ...OPERATING_COUNTS },
        },
        qualification: {
            support,
            finalManifest: {
                qualificationType: 'toolchain-hardening-shadow-pilot-closure',
                disposition: 'accepted-qualification',
                subject: expected.subject,
                operatingCounts: { ...OPERATING_COUNTS },
                canonicalProtection: { ...CANONICAL_PROTECTION },
            },
        },
    }
    return Object.assign(verified, overrides)
}

function runWith(t, verified = acceptedVerification(), expected = expectation()) {
    const { storeRoot } = fixture(t)
    const result = preflightOperatingCohort({
        storeRoot,
        expectation: expected,
        checkedAt: '2026-08-15T11:00:01.000Z',
        dependencies: { verifyQualificationRegistry: () => verified },
    })
    return { storeRoot, result }
}

test('valid durable compatible qualification permits shadow-cohort prompt construction only', (t) => {
    const { result } = runWith(t)
    assert.equal(result.toolchainPilotClosurePassed, true)
    assert.equal(result.reason, 'accepted-durable-compatible-qualification')
    assert.equal(result.readOnly, true)
    assert.equal(result.automaticallyAuthorizesC1, false)
})

test('quarantine-only evidence is never accepted', () => {
    const result = preflightOperatingCohort({ storeRoot: quarantineRoot, expectation: expectation() })
    assert.equal(result.toolchainPilotClosurePassed, false)
    assert.equal(result.reason, 'quarantine-only-evidence')
})

test('stale compatibility and subject identity fail closed', (t) => {
    const staleSupport = acceptedVerification()
    staleSupport.qualification.support.sourceIdentity.localRouteSha256 = 'f'.repeat(64)
    assert.equal(runWith(t, staleSupport).result.reason, 'stale-qualification')
    const staleSubject = acceptedVerification()
    staleSubject.qualification.finalManifest.subject = {
        ...staleSubject.qualification.finalManifest.subject,
        contractSha256: 'f'.repeat(64),
    }
    assert.equal(runWith(t, staleSubject).result.reason, 'stale-qualification')
})

test('revoked, superseded, and wrong-store verifier failures fail closed', (t) => {
    for (const [code, reason] of [
        ['QUALIFICATION_REVOKED', 'revoked-qualification'],
        ['STALE_QUALIFICATION_CURRENT_REF', 'superseded-qualification'],
        ['STORE_IDENTITY_MISMATCH', 'invalid-durable-qualification:STORE_IDENTITY_MISMATCH'],
    ]) {
        const { storeRoot } = fixture(t)
        const result = preflightOperatingCohort({
            storeRoot, expectation: expectation(),
            dependencies: { verifyQualificationRegistry: () => { const error = new Error(code); error.code = code; throw error } },
        })
        assert.equal(result.toolchainPilotClosurePassed, false)
        assert.equal(result.reason, reason)
    }
})

test('nonzero operating counts fail closed', (t) => {
    for (const key of Object.keys(OPERATING_COUNTS)) {
        const verified = acceptedVerification()
        verified.effectiveEntry.operatingCounts[key] = true
        const result = runWith(t, verified).result
        assert.equal(result.toolchainPilotClosurePassed, false)
        assert.match(result.reason, /OPERATING_COUNT_ISOLATION_FAILED/)
    }
})

test('preflight rejects non-accepted final disposition and non-accept effective action', (t) => {
    const diagnostic = acceptedVerification()
    diagnostic.qualification.finalManifest.disposition = 'diagnostic'
    assert.equal(runWith(t, diagnostic).result.reason, 'no-compatible-accepted-qualification')
    const superseded = acceptedVerification()
    superseded.effectiveEntry.action = 'supersede'
    assert.equal(runWith(t, superseded).result.reason, 'no-compatible-accepted-qualification')
})

test('production certificate, skipped mask, migration, and C1 changes fail closed', (t) => {
    for (const [key, value] of [
        ['productionCertificatesIssued', 1],
        ['canonicalMasksSkipped', 1],
        ['productionStateMigrated', true],
        ['c1RelaxationAuthorized', true],
    ]) {
        const verified = acceptedVerification()
        verified.qualification.finalManifest.canonicalProtection[key] = value
        const result = runWith(t, verified).result
        assert.equal(result.toolchainPilotClosurePassed, false)
        assert.match(result.reason, /CANONICAL_PROTECTION_WEAKENED/)
    }
})

test('preflight leaves every store byte unchanged', (t) => {
    const { storeRoot } = fixture(t)
    const before = treeIdentity(storeRoot)
    const result = preflightOperatingCohort({
        storeRoot, expectation: expectation(),
        dependencies: { verifyQualificationRegistry: () => acceptedVerification() },
    })
    assert.equal(result.toolchainPilotClosurePassed, true)
    assert.equal(treeIdentity(storeRoot), before)
})

test('qualification package commands are additive and defaults remain unchanged', () => {
    const scripts = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8')).scripts
    assert.equal(scripts.test, 'node --test test/*.test.cjs')
    assert.equal(scripts['verify:combinations'], 'node scripts/verify-all-combinations.cjs')
    assert.equal(scripts['verify:c0'], 'node scripts/verify-c0.cjs')
    for (const name of [
        'qualification:store:init', 'qualification:closure:support',
        'qualification:register:toolchain-shadow', 'qualification:verify',
        'qualification:gc:plan', 'qualification:preflight',
    ]) assert.equal(typeof scripts[name], 'string')
})
