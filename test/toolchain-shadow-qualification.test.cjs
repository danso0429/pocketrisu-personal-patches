'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const {
    canonicalJsonBytes,
    parseJsonStrict,
    sha256,
} = require('../src/qualification-object-store.cjs')
const { sealDocument } = require('../src/verification-receipts.cjs')
const {
    BUILD_BOUNDARY_CLASS,
    CANONICAL_TARGET_TREE_SHA256,
    COMPILED_DECLARATION_SHA256,
    CONTRACT_SHA256,
    FIXTURE_DECLARATION_SHA256,
    GLOBAL_RECEIPT_SHA256,
    LOCAL_RECEIPT_SHA256,
    POLICY_SHA256,
    QUARANTINE_MANIFEST_SHA256,
    RECIPE_SHA256,
    SUBJECT_IMPLEMENTATION_COMMIT,
    SYNTHETIC_TARGET_TREE_SHA256,
    TARGET_COMMIT,
    assertFixtureDerivation,
    buildMachineClosureReceipt,
    buildSupportRecord,
    deriveFixtureIdentity,
    evaluateFocusedTestExecution,
    validateMachineClosureReceipt,
    validateQuarantineManifest,
    validateReceiptPair,
    validateSupportRecord,
} = require('../src/toolchain-shadow-qualification.cjs')

const subjectRoot = '/home/ubuntu/nai-studio-2/.worktrees/toolchain-hardening-shadow-pilot'
const quarantineRoot = '/home/ubuntu/.local/share/pocketrisu-patcher/evidence-quarantine/toolchain-shadow-closure-54c8307f87354ba1'
const localBytes = fs.readFileSync(path.join(quarantineRoot, 'local-synthetic-known-answer.json'))
const globalBytes = fs.readFileSync(path.join(quarantineRoot, 'global-synthetic-known-answer.json'))
const quarantineBytes = fs.readFileSync(path.join(quarantineRoot, 'QUARANTINE-MANIFEST.json'))
const receipts = validateReceiptPair(localBytes, globalBytes)
const focusedExecution = {
    exitCode: 0,
    signal: null,
    spawnError: null,
    outputError: null,
    stdout: 'TAP version 13\n1..7\n# tests 7\n# pass 7\n# fail 0\n',
    stderr: '',
}

function expectCode(action, code) {
    assert.throws(action, (error) => error?.code === code)
}

function receiptIdentity(bytes, receipt, kind) {
    return {
        kind,
        rawSha256: sha256(bytes),
        rawBytes: bytes.length,
        schema: receipt.schema,
        semanticSha256: sha256(canonicalJsonBytes(receipt)),
        payloadIntegritySha256: receipt.integrity.payloadSha256,
    }
}

function validSupport(overrides = {}) {
    const focusedTests = evaluateFocusedTestExecution(focusedExecution)
    const fixtureDerivation = deriveFixtureIdentity(subjectRoot)
    const base = {
        recordedAt: '2026-08-15T08:00:00.000Z',
        authority: {
            governanceRepository: 'danso0429/patch-verification-governance',
            governanceCommit: '49d891b12a51745b9da91bf23105d78869cf8664',
            governanceStatusVersion: 12,
            subjectImplementationCommit: SUBJECT_IMPLEMENTATION_COMMIT,
            subjectBranch: 'codex/toolchain-hardening-shadow-pilot',
            qualificationToolCommit: '3a0bff4000000000000000000000000000000000',
            qualificationToolClean: true,
            policySha256: POLICY_SHA256,
        },
        sourceIdentity: {
            sourcePreSha256: '1'.repeat(64),
            sourcePostSha256: '1'.repeat(64),
            catalogSha256: '2'.repeat(64),
            subjectSchemasSha256: '3'.repeat(64),
            qualificationSchemasSha256: '4'.repeat(64),
            localRouteSha256: '5'.repeat(64),
            globalProjectionRouteSha256: '6'.repeat(64),
            contractSha256: CONTRACT_SHA256,
            compiledDeclarationSha256: COMPILED_DECLARATION_SHA256,
        },
        targetIdentity: {
            role: 'canonical-audited-target',
            commit: TARGET_COMMIT,
            applicationTreeSha256: CANONICAL_TARGET_TREE_SHA256,
            targetPreSha256: '7'.repeat(64),
            targetPostSha256: '7'.repeat(64),
        },
        environment: {
            admittedBoundary: { ...BUILD_BOUNDARY_CLASS },
            libcVersionRuntime: '2.39',
            pnpmExecutable: '/isolated/task/node_modules/pnpm/bin/pnpm.cjs',
            pnpmExecutableSha256: '8'.repeat(64),
            provisioning: {
                method: 'unique-task-scoped-temporary-installation',
                command: { executable: 'npm', args: ['install', 'pnpm@10.34.1'] },
                installStdoutSha256: '9'.repeat(64),
                installStderrSha256: 'a'.repeat(64),
                installExitCode: 0,
                repositoryMutationAllowed: false,
                lockfileMutationAllowed: false,
                cleanupRequired: true,
            },
        },
        fixtureDerivation,
        receiptValidation: {
            quarantineManifestRawSha256: QUARANTINE_MANIFEST_SHA256,
            quarantineAuthoritative: false,
            local: {
                ...receiptIdentity(localBytes, receipts.localReceipt, 'synthetic-known-answer'),
                localMasks: 2,
                boundaryClasses: 4,
                expectedExecutions: 8,
                processedExecutions: 8,
                freshIsolation: true,
            },
            globalSynthetic: {
                ...receiptIdentity(globalBytes, receipts.globalReceipt, 'synthetic-projection'),
                sourceKind: 'synthetic-projection',
                processedMasks: 4096,
                mismatches: 0,
                canonicalGlobalExhaustiveExecuted: false,
            },
            pairLinked: true,
        },
        focusedTests,
        integrityChecks: {
            subjectCleanBefore: true,
            subjectCleanAfter: true,
            sourcePrePostMatched: true,
            targetPrePostMatched: true,
            repositoryFilesChanged: false,
            lockfileChanged: false,
            targetClean: true,
            receiptIntegrityPassed: true,
        },
    }
    for (const [key, value] of Object.entries(overrides)) base[key] = value
    return buildSupportRecord(base)
}

function mutateSupport(record, mutation) {
    const clone = structuredClone(record)
    delete clone.integrity
    mutation(clone)
    return sealDocument(clone)
}

test('quarantine source hashes and non-authoritative disposition validate exactly', () => {
    const manifest = validateQuarantineManifest(quarantineBytes, localBytes, globalBytes)
    assert.equal(sha256(quarantineBytes), QUARANTINE_MANIFEST_SHA256)
    assert.equal(manifest.authoritative, false)
    assert.equal(manifest.acceptedQualification, false)
})

test('existing local and Global synthetic receipts validate with exact full hashes', () => {
    assert.equal(sha256(localBytes), LOCAL_RECEIPT_SHA256)
    assert.equal(sha256(globalBytes), GLOBAL_RECEIPT_SHA256)
    assert.equal(receipts.localReceipt.coverage.expectedExecutions, 8)
    assert.equal(receipts.globalReceipt.coverage.processedMasks, 4096)
    assert.equal(receipts.globalReceipt.comparison.mismatches, 0)
    assert.equal(receipts.globalReceipt.materialEligibility, 'synthetic-only')
})

test('exact fixture derivation reproduces full declaration and target hashes', () => {
    const derivation = deriveFixtureIdentity(subjectRoot)
    assert.equal(derivation.inputDeclarationSha256, COMPILED_DECLARATION_SHA256)
    assert.equal(derivation.outputFixtureDeclarationSha256, FIXTURE_DECLARATION_SHA256)
    assert.equal(derivation.outputSyntheticTargetTreeSha256, SYNTHETIC_TARGET_TREE_SHA256)
    assert.equal(derivation.recipeSha256, RECIPE_SHA256)
    assert.equal(derivation.syntheticTargetRole, 'nonmaterial-known-answer-fixture')
})

test('prefix-only or changed fixture derivation requires closure rerun', () => {
    expectCode(() => assertFixtureDerivation(FIXTURE_DECLARATION_SHA256.slice(0, 8), SYNTHETIC_TARGET_TREE_SHA256), 'CLOSURE_RERUN_REQUIRED')
    expectCode(() => assertFixtureDerivation('f'.repeat(64), SYNTHETIC_TARGET_TREE_SHA256), 'CLOSURE_RERUN_REQUIRED')
})

test('valid machine support and authoritative closure receipt pass without narrative', () => {
    const support = validSupport()
    const closure = buildMachineClosureReceipt({
        supportRecord: support,
        localReceipt: receipts.localReceipt,
        globalReceipt: receipts.globalReceipt,
        recordedAt: '2026-08-15T08:00:01.000Z',
    })
    assert.equal(closure.result, 'passed')
    assert.equal(closure.observations.globalEvidenceKind, 'synthetic-projection-not-canonical-global-exhaustive')
    assert.equal(closure.canonicalProtection.productionClass, 'G')
    assert.equal(closure.canonicalProtection.canonicalMasksSkipped, 0)
    assert.equal(validateMachineClosureReceipt(closure, {
        supportRecord: support,
        localReceipt: receipts.localReceipt,
        globalReceipt: receipts.globalReceipt,
    }), closure)
})

test('stale subject, dirty subject, policy, contract, declaration, and target fail closed', () => {
    const support = validSupport()
    const cases = [
        (value) => { value.authority.subjectImplementationCommit = 'f'.repeat(40) },
        (value) => { value.integrityChecks.subjectCleanBefore = false },
        (value) => { value.authority.policySha256 = 'f'.repeat(64) },
        (value) => { value.sourceIdentity.contractSha256 = 'f'.repeat(64) },
        (value) => { value.sourceIdentity.compiledDeclarationSha256 = 'f'.repeat(64) },
        (value) => { value.targetIdentity.applicationTreeSha256 = 'f'.repeat(64) },
    ]
    for (const mutation of cases) expectCode(() => validateSupportRecord(mutateSupport(support, mutation)), 'INVALID_SUPPORT_RECORD')
})

test('invalid pnpm boundary and task-scoped provisioning fail closed', () => {
    const support = validSupport()
    expectCode(() => validateSupportRecord(mutateSupport(support, (value) => {
        value.environment.admittedBoundary.pnpmVersion = '10.33.0'
    })), 'BUILD_BOUNDARY_MISMATCH')
    expectCode(() => validateSupportRecord(mutateSupport(support, (value) => {
        value.environment.provisioning.method = 'ambient-system-pnpm'
    })), 'INVALID_SUPPORT_RECORD')
})

test('repository and lockfile mutation are rejected', () => {
    const support = validSupport()
    for (const key of ['repositoryFilesChanged', 'lockfileChanged']) {
        expectCode(() => validateSupportRecord(mutateSupport(support, (value) => {
            value.integrityChecks[key] = true
        })), 'INVALID_SUPPORT_RECORD')
    }
})

test('altered derivation recipe, prefix hash, and wrong target role are rejected', () => {
    const support = validSupport()
    const cases = [
        (value) => { value.fixtureDerivation.recipeSha256 = 'f'.repeat(64) },
        (value) => { value.fixtureDerivation.outputFixtureDeclarationSha256 = FIXTURE_DECLARATION_SHA256.slice(0, 12) },
        (value) => { value.fixtureDerivation.syntheticTargetRole = 'canonical-production-target' },
    ]
    for (const mutation of cases) expectCode(() => validateSupportRecord(mutateSupport(support, mutation)), 'INVALID_SUPPORT_RECORD')
})

test('receipt hash mutation is rejected before receipt semantics are trusted', () => {
    const changedLocal = Buffer.concat([localBytes, Buffer.from(' ')])
    const changedGlobal = Buffer.concat([globalBytes, Buffer.from(' ')])
    expectCode(() => validateReceiptPair(changedLocal, globalBytes), 'LOCAL_RECEIPT_HASH_MISMATCH')
    expectCode(() => validateReceiptPair(localBytes, changedGlobal), 'GLOBAL_RECEIPT_HASH_MISMATCH')
})

test('local domain, Global coverage, and nonzero mismatches are rejected', () => {
    const support = validSupport()
    const cases = [
        (value) => { value.receiptValidation.local.expectedExecutions = 7 },
        (value) => { value.receiptValidation.globalSynthetic.processedMasks = 4095 },
        (value) => { value.receiptValidation.globalSynthetic.mismatches = 1 },
    ]
    for (const mutation of cases) expectCode(() => validateSupportRecord(mutateSupport(support, mutation)), 'INVALID_SUPPORT_RECORD')
})

test('focused tests reject failure, missing output, and spawn error despite zero status', () => {
    expectCode(() => evaluateFocusedTestExecution({ ...focusedExecution, exitCode: 1 }), 'FOCUSED_TESTS_FAILED')
    expectCode(() => evaluateFocusedTestExecution({ ...focusedExecution, stdout: '' }), 'FOCUSED_TESTS_FAILED')
    expectCode(() => evaluateFocusedTestExecution({ ...focusedExecution, spawnError: { code: 'EPERM', message: 'denied' } }), 'FOCUSED_TESTS_FAILED')
})

test('narrative-only or missing machine support cannot create a closure', () => {
    expectCode(() => buildMachineClosureReceipt({
        supportRecord: parseJsonStrict('{"narrative":"passed"}'),
        localReceipt: receipts.localReceipt,
        globalReceipt: receipts.globalReceipt,
        recordedAt: '2026-08-15T08:00:01.000Z',
    }), 'INVALID_SUPPORT_RECORD')
})

test('machine record keeps production protections and operating counts at zero', () => {
    const support = validSupport()
    for (const mutation of [
        (value) => { value.canonicalProtection.productionCertificatesIssued = 1 },
        (value) => { value.canonicalProtection.canonicalMasksSkipped = 1 },
        (value) => { value.canonicalProtection.productionStateMigrated = true },
        (value) => { value.canonicalProtection.c1RelaxationAuthorized = true },
        (value) => { value.canonicalProtection.materialCohortCounted = true },
    ]) expectCode(() => validateSupportRecord(mutateSupport(support, mutation)), 'CANONICAL_PROTECTION_WEAKENED')
})
