'use strict'

const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const {
    canonicalJsonBytes, initializeQualificationStore, parseJsonStrict,
    publishEvidenceBatch, sha256,
} = require('../src/qualification-object-store.cjs')
const {
    CANONICAL_PROTECTION, OPERATING_COUNTS, appendRegistryEntry, buildContentManifest,
    buildCurrentRef, buildQualificationManifest, publishRegistrySnapshot, updateCurrentRef,
    validateValidationResult,
} = require('../src/qualification-registry.cjs')
const { fullSchemaRegistry } = require('../src/qualification-verifier.cjs')
const {
    EXPECTATION_SCHEMA,
    preflightOperatingCohort,
    preflightOperatingCohortWithTestDependencies,
    treeIdentity,
} = require('../src/operating-cohort-preflight.cjs')
const {
    CANONICAL_TARGET_TREE_SHA256,
    COMPILED_DECLARATION_SHA256,
    CONTRACT_SHA256,
    POLICY_SHA256,
    SUBJECT_IMPLEMENTATION_COMMIT,
    TARGET_COMMIT,
    BUILD_BOUNDARY_CLASS,
    QUARANTINE_MANIFEST_SHA256,
    buildMachineClosureReceipt,
    buildSupportRecord,
    deriveFixtureIdentity,
    evaluateFocusedTestExecution,
    validateReceiptPair,
} = require('../src/toolchain-shadow-qualification.cjs')
const { runChild } = require('../src/verification-evidence.cjs')
const { declarationHash } = require('../src/operating-cohort-route.cjs')
const { compareBuildBoundaries } = require('../src/toolchain-shadow-boundaries.cjs')
const { sealDocument } = require('../src/verification-receipts.cjs')

const repositoryRoot = path.resolve(__dirname, '..')
const fixtureParent = path.resolve(repositoryRoot, '../..')
const quarantineRoot = '/home/ubuntu/.local/share/pocketrisu-patcher/evidence-quarantine/toolchain-shadow-closure-54c8307f87354ba1'
const TOOL_COMMIT = '3'.repeat(40)
const subjectRoot = '/home/ubuntu/nai-studio-2/.worktrees/toolchain-hardening-shadow-pilot'
const targetRoot = '/tmp/pocketrisu-v190-audit'
const durableFixtureParent = '/home/ubuntu/.local/share/pocketrisu-patcher/qualification-test-fixtures'
const materialDeclarationFile = path.join(repositoryRoot, 'contracts/first-material-c0-toolchain-hardening-v1.json')
const localBytes = fs.readFileSync(path.join(quarantineRoot, 'local-synthetic-known-answer.json'))
const globalBytes = fs.readFileSync(path.join(quarantineRoot, 'global-synthetic-known-answer.json'))
const receiptPair = validateReceiptPair(localBytes, globalBytes)

function currentToolCommit() {
    return execFileSync('git', ['--no-pager', '-C', repositoryRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
}

function receiptIdentity(bytes, receipt, kind) {
    return {
        kind, rawSha256: sha256(bytes), rawBytes: bytes.length, schema: receipt.schema,
        semanticSha256: sha256(canonicalJsonBytes(receipt)),
        payloadIntegritySha256: receipt.integrity.payloadSha256,
    }
}

function machineSupport(toolCommit) {
    const fixtureDerivation = deriveFixtureIdentity(subjectRoot)
    return buildSupportRecord({
        recordedAt: '2026-08-15T14:00:00.000Z',
        authority: {
            governanceRepository: 'danso0429/patch-verification-governance',
            governanceCommit: '49d891b12a51745b9da91bf23105d78869cf8664',
            governanceStatusVersion: 12, subjectImplementationCommit: SUBJECT_IMPLEMENTATION_COMMIT,
            subjectBranch: 'codex/toolchain-hardening-shadow-pilot', qualificationToolCommit: toolCommit,
            qualificationToolClean: true, policySha256: POLICY_SHA256,
        },
        sourceIdentity: {
            sourcePreSha256: '1'.repeat(64), sourcePostSha256: '1'.repeat(64), catalogSha256: '2'.repeat(64),
            subjectSchemasSha256: '3'.repeat(64), qualificationSchemasSha256: '4'.repeat(64),
            localRouteSha256: '5'.repeat(64), globalProjectionRouteSha256: '6'.repeat(64),
            contractSha256: CONTRACT_SHA256, compiledDeclarationSha256: COMPILED_DECLARATION_SHA256,
        },
        targetIdentity: {
            role: 'canonical-audited-target', commit: TARGET_COMMIT,
            applicationTreeSha256: CANONICAL_TARGET_TREE_SHA256,
            targetPreSha256: '7'.repeat(64), targetPostSha256: '7'.repeat(64),
        },
        environment: {
            admittedBoundary: { ...BUILD_BOUNDARY_CLASS }, libcVersionRuntime: '2.39',
            pnpmExecutable: '/isolated/task/node_modules/.bin/pnpm', pnpmExecutableSha256: '8'.repeat(64),
            provisioning: {
                method: 'unique-task-scoped-temporary-installation',
                command: { executable: 'npm', args: ['install', 'pnpm@10.34.1'] },
                installStdoutSha256: '9'.repeat(64), installStderrSha256: 'a'.repeat(64), installExitCode: 0,
                repositoryMutationAllowed: false, lockfileMutationAllowed: false, cleanupRequired: true,
            },
        },
        fixtureDerivation,
        receiptValidation: {
            quarantineManifestRawSha256: QUARANTINE_MANIFEST_SHA256, quarantineAuthoritative: false,
            local: {
                ...receiptIdentity(localBytes, receiptPair.localReceipt, 'synthetic-known-answer'),
                localMasks: 2, boundaryClasses: 4, expectedExecutions: 8, processedExecutions: 8, freshIsolation: true,
            },
            globalSynthetic: {
                ...receiptIdentity(globalBytes, receiptPair.globalReceipt, 'synthetic-projection'),
                sourceKind: 'synthetic-projection', processedMasks: 4096, mismatches: 0,
                canonicalGlobalExhaustiveExecuted: false,
            },
            pairLinked: true,
        },
        focusedTests: evaluateFocusedTestExecution({
            exitCode: 0, signal: null, spawnError: null, outputError: null,
            stdout: 'TAP version 13\n1..2\n# tests 2\n# pass 2\n# fail 0\n', stderr: '',
        }),
        integrityChecks: {
            subjectCleanBefore: true, subjectCleanAfter: true, sourcePrePostMatched: true,
            targetPrePostMatched: true, repositoryFilesUnchanged: true, lockfileUnchanged: true,
            targetClean: true, receiptIntegrityPassed: true,
        },
    })
}

function publish(storeRoot, toolCommit, entries) {
    return publishEvidenceBatch({
        storeRoot, entries, schemaRegistry: fullSchemaRegistry(),
        publisherToolIdentity: { qualificationToolCommit: toolCommit },
        createdAt: '2026-08-15T14:00:01.000Z',
    }).objects
}

async function durableChain(t, { finalDisposition = 'accepted-qualification' } = {}) {
    fs.mkdirSync(durableFixtureParent, { recursive: true, mode: 0o700 })
    fs.chmodSync(durableFixtureParent, 0o700)
    const parent = fs.mkdtempSync(path.join(durableFixtureParent, 'e2e-'))
    t.after(() => fs.rmSync(parent, { recursive: true, force: true }))
    const storeRoot = path.join(parent, 'store')
    const identity = initializeQualificationStore({
        storeRoot, forbiddenRoots: [repositoryRoot, subjectRoot, targetRoot, path.dirname(quarantineRoot)],
        createdAt: '2026-08-15T14:00:00.000Z',
    })
    const toolCommit = currentToolCommit()
    const support = machineSupport(toolCommit)
    const closure = buildMachineClosureReceipt({
        supportRecord: support, localReceipt: receiptPair.localReceipt,
        globalReceipt: receiptPair.globalReceipt, recordedAt: '2026-08-15T14:00:01.000Z',
    })
    const [supportObject, closureObject, localObject, globalObject] = publish(storeRoot, toolCommit, [
        { payloadModel: 'canonical-json', mediaType: 'application/json', role: 'machine-support-authority-environment', referencedSchema: support.schema, value: support },
        { payloadModel: 'canonical-json', mediaType: 'application/vnd.pocketrisu.toolchain-shadow-pilot-closure+json', role: 'machine-closure-receipt', referencedSchema: closure.schema, value: closure },
        { payloadModel: 'raw-blob', mediaType: 'application/json', role: 'local-synthetic-exact-receipt', referencedSchema: receiptPair.localReceipt.schema, value: localBytes },
        { payloadModel: 'raw-blob', mediaType: 'application/json', role: 'global-synthetic-exact-receipt', referencedSchema: receiptPair.globalReceipt.schema, value: globalBytes },
    ])
    const subject = {
        implementationCommit: SUBJECT_IMPLEMENTATION_COMMIT, qualificationToolCommit: toolCommit,
        policySha256: POLICY_SHA256, contractSha256: CONTRACT_SHA256,
        compiledDeclarationSha256: COMPILED_DECLARATION_SHA256, targetCommit: TARGET_COMMIT,
        targetApplicationTreeSha256: CANONICAL_TARGET_TREE_SHA256,
    }
    const content = buildContentManifest({
        createdAt: '2026-08-15T14:00:02.000Z', subject,
        objects: {
            machineClosureDescriptorSha256: closureObject.descriptorSha256,
            machineSupportDescriptorSha256: supportObject.descriptorSha256,
            authorityEnvironmentDescriptorSha256: supportObject.descriptorSha256,
            localReceiptDescriptorSha256: localObject.descriptorSha256,
            globalSyntheticReceiptDescriptorSha256: globalObject.descriptorSha256,
            closureNarrativeDescriptorSha256: null, sourceEventDescriptorSha256: null,
            environmentNarrativeDescriptorSha256: null,
        },
    })
    const [contentObject] = publish(storeRoot, toolCommit, [{
        payloadModel: 'canonical-json', mediaType: 'application/vnd.pocketrisu.qualification-manifest+json',
        role: 'qualification-content-manifest', referencedSchema: content.schema, value: content,
    }])
    const subjectFile = path.join(parent, 'subject.json')
    const validationFile = path.join(parent, 'validation.json')
    fs.writeFileSync(subjectFile, canonicalJsonBytes(subject), { mode: 0o600 })
    const verifyResult = await runChild(process.execPath, [
        path.join(repositoryRoot, 'scripts/verify-qualification-evidence.cjs'),
        '--store', storeRoot, '--content-manifest', contentObject.descriptorSha256,
        '--subject', subjectFile, '--subject-root', subjectRoot,
        '--validation-output', validationFile, '--tool-root', repositoryRoot,
    ], { cwd: repositoryRoot, maxOutputBytes: 16 * 1024 * 1024 })
    assert.equal(verifyResult.spawnError, null)
    assert.equal(verifyResult.exitCode, 0, verifyResult.stderr)
    const validation = validateValidationResult(parseJsonStrict(fs.readFileSync(validationFile), 'fixture validation'))
    const [validationObject] = publish(storeRoot, toolCommit, [{
        payloadModel: 'canonical-json', mediaType: 'application/vnd.pocketrisu.qualification-validation+json',
        role: 'independent-qualification-validation', referencedSchema: validation.schema, value: validation,
    }])
    const final = buildQualificationManifest({
        createdAt: '2026-08-15T14:00:03.000Z', subject,
        contentManifestDescriptorSha256: contentObject.descriptorSha256,
        validationResultDescriptorSha256: validationObject.descriptorSha256,
        disposition: finalDisposition,
    })
    const [finalObject] = publish(storeRoot, toolCommit, [{
        payloadModel: 'canonical-json', mediaType: 'application/vnd.pocketrisu.qualification-manifest+json',
        role: 'final-qualification-manifest', referencedSchema: final.schema, value: final,
    }])
    const appended = appendRegistryEntry({
        storeIdentityHash: identity.storeIdentityHash, action: 'accept', subject,
        qualificationManifestDescriptorSha256: finalObject.descriptorSha256,
        reason: 'real e2e qualification fixture', timestamp: '2026-08-15T14:00:04.000Z',
    })
    const registryObject = publishRegistrySnapshot({
        storeRoot, registry: appended.registry, qualificationToolCommit: toolCommit,
        createdAt: '2026-08-15T14:00:04.000Z',
    })
    updateCurrentRef(storeRoot, buildCurrentRef({
        storeIdentityHash: identity.storeIdentityHash,
        registryId: appended.registry.registryId,
        registryDescriptorSha256: registryObject.descriptorSha256,
        snapshotSequence: appended.registry.snapshotSequence,
        registryRootSha256: appended.registry.registryRootSha256,
        updatedAt: '2026-08-15T14:00:05.000Z',
    }))
    return {
        parent, storeRoot, subject, support, finalObject, localObject, globalObject,
        registry: appended.registry, registryObject,
    }
}

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

function expectation(toolCommit = TOOL_COMMIT) {
    const value = JSON.parse(fs.readFileSync(materialDeclarationFile, 'utf8'))
    assert.equal(value.schema, EXPECTATION_SCHEMA)
    value.qualification.subject.qualificationToolCommit = toolCommit
    value.qualification.compatibility = {
        subjectSchemasSha256: '1'.repeat(64),
        qualificationSchemasSha256: '2'.repeat(64),
        localRouteSha256: '3'.repeat(64),
        globalProjectionRouteSha256: '4'.repeat(64),
    }
    value.declarationSha256 = declarationHash(value)
    return value
}

function expectationForFixture(fixture) {
    const expected = expectation(fixture.subject.qualificationToolCommit)
    expected.qualification.compatibility = {
        subjectSchemasSha256: fixture.support.sourceIdentity.subjectSchemasSha256,
        qualificationSchemasSha256: fixture.support.sourceIdentity.qualificationSchemasSha256,
        localRouteSha256: fixture.support.sourceIdentity.localRouteSha256,
        globalProjectionRouteSha256: fixture.support.sourceIdentity.globalProjectionRouteSha256,
    }
    expected.declarationSha256 = declarationHash(expected)
    return expected
}

function acceptedVerification(overrides = {}) {
    const expected = expectation()
    const support = {
        sourceIdentity: { ...expected.qualification.compatibility },
        targetIdentity: { role: 'canonical-audited-target' },
        environment: { admittedBoundary: expected.environment },
    }
    const verified = {
        registryDescriptorSha256: '5'.repeat(64),
        registryRootSha256: '6'.repeat(64),
        effectiveEntry: {
            action: 'accept', disposition: 'accepted-qualification',
            qualificationType: 'toolchain-hardening-shadow-pilot-closure',
            qualificationManifestDescriptorSha256: '7'.repeat(64),
            operatingCounts: { ...OPERATING_COUNTS },
        },
        qualification: {
            support,
            finalManifest: {
                qualificationType: 'toolchain-hardening-shadow-pilot-closure',
                disposition: 'accepted-qualification',
                subject: expected.qualification.subject,
                operatingCounts: { ...OPERATING_COUNTS },
                canonicalProtection: { ...CANONICAL_PROTECTION },
            },
        },
    }
    return Object.assign(verified, overrides)
}

function operatingReceipt() {
    const expected = expectation()
    const comparison = compareBuildBoundaries(BUILD_BOUNDARY_CLASS, BUILD_BOUNDARY_CLASS)
    return sealDocument({
        schema: 'patch-operating-build-environment-provisioning-v1',
        version: 1,
        status: 'passed',
        createdAt: '2026-08-15T11:00:00.000Z',
        provisioning: {
            method: 'unique-task-scoped-temporary-installation',
            methodVersion: 'exact-task-scoped-pnpm-v1',
            command: { executable: 'npm', args: [
                'install', '--prefix', '/task', '--no-package-lock', '--ignore-scripts',
                '--no-audit', '--no-fund', 'pnpm@10.34.1',
            ] },
            installStdoutSha256: 'a'.repeat(64),
            installStderrSha256: 'b'.repeat(64),
            installExitCode: 0,
            repositoryMutationAllowed: false,
            lockfileMutationAllowed: false,
            cleanupRequired: true,
        },
        requested: { nodeVersion: 'v25.9.0', pnpmVersion: '10.34.1' },
        node: { version: 'v25.9.0', executable: '/node', executableSha256: 'c'.repeat(64) },
        pnpm: {
            requestedVersion: '10.34.1', observedVersion: '10.34.1',
            launcherExecutable: '/task/node_modules/.bin/pnpm',
            resolvedExecutable: '/task/node_modules/pnpm/bin/pnpm.cjs',
            executableSha256: 'd'.repeat(64),
        },
        runtime: { platform: 'linux', architecture: 'arm64', libc: 'glibc', libcVersionRuntime: '2.39' },
        resolution: {
            strategy: 'explicit-provisioned-executable-with-prepended-path-v1',
            temporaryRoot: '/task',
            temporaryRootIdentitySha256: sha256(canonicalJsonBytes({
                purpose: 'material-operating-cohort', root: '/task',
            })),
            provisionedBinDirectory: '/task/node_modules/.bin',
            pathPrepend: '/task/node_modules/.bin',
            ambientPathSha256: 'f'.repeat(64), effectivePathSha256: '0'.repeat(64),
        },
        expectedBoundary: { ...BUILD_BOUNDARY_CLASS },
        observedBoundary: { ...BUILD_BOUNDARY_CLASS },
        boundaryComparison: comparison,
        identities: {
            subjectCommit: expected.qualification.subject.implementationCommit,
            toolingCommit: '2'.repeat(40),
            toolingStatusSha256: 'e'.repeat(64),
            targetCommit: expected.qualification.subject.targetCommit,
            targetApplicationTreeSha256:
                expected.qualification.subject.targetApplicationTreeSha256,
        },
        cleanup: {
            required: true,
            eligibleOnlyAfterAttemptNoLongerNeedsExecutable: true,
            durableReceiptSurvivesCleanup: true,
        },
    })
}

function runWith(t, verified = acceptedVerification(), expected = expectation(), receipt = null) {
    const { storeRoot } = fixture(t)
    const result = preflightOperatingCohortWithTestDependencies({
        storeRoot,
        expectation: expected,
        subjectRoot,
        operatingEnvironmentReceipt: receipt,
        checkedAt: '2026-08-15T11:00:01.000Z',
        dependencies: {
            verifyQualificationRegistry: () => verified,
            verifyCurrentOperatingBuildEnvironment: () => ({ status: 'passed' }),
        },
    })
    return { storeRoot, result }
}

test('legacy v1 qualification stays verifiable but is ineligible for v2 shadow admission', (t) => {
    const { result } = runWith(t)
    assert.equal(result.toolchainPilotClosurePassed, true, JSON.stringify(result))
    assert.equal(result.reason, 'accepted-durable-compatible-qualification')
    assert.equal(result.readOnly, true)
    assert.equal(result.automaticallyAuthorizesC1, false)
    assert.equal(result.route.routeId, 'material-c0-global')
    assert.equal(result.route.safeToExecute, true)
    assert.equal(result.candidate.qualificationCompatible, false)
    assert.equal(result.candidate.executionSkipped, true)
    assert.equal(result.candidate.skipReason, 'candidate-local-domain-mismatch')
    assert.deepEqual(result.blockers, [])
})

test('operating receipt cannot make a legacy v1 qualification eligible for v2 shadow admission', (t) => {
    const { result } = runWith(t, acceptedVerification(), expectation(), operatingReceipt())
    assert.equal(result.freshVerificationInCurrentExecutionEnvironment, 'passed')
    assert.equal(result.route.routeId, 'material-c0-global')
    assert.equal(result.candidate.qualificationCompatible, false)
    assert.equal(result.candidate.skipReason, 'candidate-local-domain-mismatch')
    assert.equal(result.operatingEnvironment.provisioned, null)
    assert.equal(result.operatingEnvironment.buildBoundaryVerification, 'not-required')
    assert.equal(result.route.safeToExecute, true)
    assert.deepEqual(result.blockers, [])
})

test('managed nested-spawn EPERM preserves historical v1 state without making it v2-eligible', (t) => {
    const { storeRoot } = fixture(t)
    const accepted = acceptedVerification()
    const derivationError = new Error('Fresh fixture derivation process failed')
    derivationError.code = 'INDEPENDENT_DERIVATION_FAILED'
    derivationError.details = { spawnError: 'spawnSync node EPERM' }
    const result = preflightOperatingCohortWithTestDependencies({
        storeRoot,
        expectation: expectation(),
        subjectRoot,
        checkedAt: '2026-08-15T11:00:01.000Z',
        dependencies: {
            verifyQualificationRegistry: () => { throw derivationError },
            inspectDurableAcceptedQualification: () => ({
                registryDescriptorSha256: accepted.registryDescriptorSha256,
                registryRootSha256: accepted.registryRootSha256,
                effectiveEntry: accepted.effectiveEntry,
                support: accepted.qualification.support,
                finalManifest: accepted.qualification.finalManifest,
            }),
        },
    })
    assert.equal(result.acceptedQualificationState, 'accepted')
    assert.equal(result.freshVerificationInCurrentExecutionEnvironment, 'environment-unavailable')
    assert.equal(result.route.routeId, 'material-c0-global')
    assert.equal(result.candidate.qualificationCompatible, false)
    assert.equal(result.candidate.skipReason, 'candidate-local-domain-mismatch')
    assert.equal(result.route.globalExecutionsExpected, 1)
    assert.equal(result.route.safeToExecute, true)
    assert.deepEqual(result.blockers, [])
})

test('real store-to-registry-to-independent-verifier-to-production-preflight chain passes', async (t) => {
    const fixture = await durableChain(t)
    const expectationFile = path.join(fixture.parent, 'expectation.json')
    const expected = expectationForFixture(fixture)
    fs.writeFileSync(expectationFile, canonicalJsonBytes(expected), { mode: 0o600 })
    const before = treeIdentity(fixture.storeRoot)
    const child = await runChild(process.execPath, [
        path.join(repositoryRoot, 'scripts/preflight-operating-cohort.cjs'),
        '--store', fixture.storeRoot,
        '--expectation', expectationFile,
        '--subject-root', subjectRoot,
    ], { cwd: repositoryRoot, maxOutputBytes: 16 * 1024 * 1024 })
    assert.equal(child.spawnError, null)
    assert.equal(child.exitCode, 0, child.stderr)
    assert.equal(child.signal, null)
    const result = parseJsonStrict(child.stdout, 'production preflight output')
    assert.equal(result.toolchainPilotClosurePassed, true, JSON.stringify(result))
    assert.equal(result.reason, 'accepted-durable-compatible-qualification')
    assert.equal(result.automaticallyAuthorizesC1, false)
    assert.equal(treeIdentity(fixture.storeRoot), before)
})

test('real registry revocation reaches production preflight and fails closed', async (t) => {
    const fixture = await durableChain(t)
    const revoked = appendRegistryEntry({
        baseRegistry: fixture.registry,
        baseRegistryDescriptorSha256: fixture.registryObject.descriptorSha256,
        storeIdentityHash: require('../src/qualification-object-store.cjs').loadStoreIdentity(fixture.storeRoot).storeIdentityHash,
        action: 'revoke', subject: fixture.subject,
        qualificationManifestDescriptorSha256: fixture.finalObject.descriptorSha256,
        reason: 'e2e revocation fixture', timestamp: '2026-08-15T14:01:00.000Z',
    })
    const registryObject = publishRegistrySnapshot({
        storeRoot: fixture.storeRoot, registry: revoked.registry,
        qualificationToolCommit: fixture.subject.qualificationToolCommit,
        createdAt: '2026-08-15T14:01:00.000Z',
    })
    updateCurrentRef(fixture.storeRoot, buildCurrentRef({
        storeIdentityHash: require('../src/qualification-object-store.cjs').loadStoreIdentity(fixture.storeRoot).storeIdentityHash,
        registryId: revoked.registry.registryId,
        registryDescriptorSha256: registryObject.descriptorSha256,
        snapshotSequence: revoked.registry.snapshotSequence,
        registryRootSha256: revoked.registry.registryRootSha256,
        updatedAt: '2026-08-15T14:01:01.000Z',
    }))
    const expected = expectationForFixture(fixture)
    const result = preflightOperatingCohort({
        storeRoot: fixture.storeRoot,
        expectation: expected,
        subjectRoot,
    })
    assert.equal(result.toolchainPilotClosurePassed, false)
    assert.equal(result.reason, 'revoked-qualification')
})

test('production preflight rejects a real accepted registry pointing to a diagnostic final manifest', async (t) => {
    const fixture = await durableChain(t, { finalDisposition: 'diagnostic' })
    const expected = expectationForFixture(fixture)
    const result = preflightOperatingCohort({ storeRoot: fixture.storeRoot, expectation: expected, subjectRoot })
    assert.equal(result.toolchainPilotClosurePassed, false)
    assert.match(result.reason, /ACCEPTED_QUALIFICATION_MISMATCH/)
})

test('production preflight ignores caller-supplied verifier success objects', (t) => {
    const { storeRoot } = fixture(t)
    const result = preflightOperatingCohort({
        storeRoot, expectation: expectation(), subjectRoot,
        dependencies: { verifyQualificationRegistry: () => acceptedVerification() },
    })
    assert.equal(result.toolchainPilotClosurePassed, false)
    assert.notEqual(result.reason, 'accepted-durable-compatible-qualification')
})

test('real preflight rejects corrupt and missing child payloads', async (t) => {
    for (const mode of ['corrupt', 'missing']) {
        const fixture = await durableChain(t)
        if (mode === 'corrupt') {
            fs.chmodSync(fixture.localObject.payloadPath, 0o600)
            const bytes = fs.readFileSync(fixture.localObject.payloadPath)
            bytes[0] ^= 1
            fs.writeFileSync(fixture.localObject.payloadPath, bytes)
        } else {
            fs.unlinkSync(fixture.localObject.payloadPath)
        }
        const result = preflightOperatingCohort({
            storeRoot: fixture.storeRoot,
            expectation: expectationForFixture(fixture),
            subjectRoot,
        })
        assert.equal(result.toolchainPilotClosurePassed, false)
        assert.match(result.reason, /invalid-durable-qualification/)
    }
})

test('recorded derivation success cannot override a tampered fresh subject recipe', async (t) => {
    const fixture = await durableChain(t)
    const copiedSubject = path.join(fixture.parent, 'tampered-subject')
    execFileSync('git', ['clone', '--quiet', '--no-hardlinks', subjectRoot, copiedSubject])
    execFileSync('git', ['--no-pager', '-C', copiedSubject, 'checkout', '--detach', SUBJECT_IMPLEMENTATION_COMMIT], { stdio: 'ignore' })
    fs.appendFileSync(path.join(copiedSubject, 'src/toolchain-shadow-known-answer.cjs'), '\n// tampered verification fixture\n')
    const result = preflightOperatingCohort({
        storeRoot: fixture.storeRoot,
        expectation: expectationForFixture(fixture),
        subjectRoot: copiedSubject,
    })
    assert.equal(result.toolchainPilotClosurePassed, false)
    assert.match(result.reason, /INDEPENDENT_DERIVATION_FAILED/)
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
        const result = preflightOperatingCohortWithTestDependencies({
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
    const result = preflightOperatingCohortWithTestDependencies({
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
