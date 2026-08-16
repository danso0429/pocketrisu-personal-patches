'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const {
    buildCohortIdentity,
    buildFrozenCohortDeclaration,
    buildMaterialInputIdentity,
    claimGlobalLaunch,
    classifyMaterialDistinctness,
    createExecutionAttempt,
    loadOperatingEnvironmentForAttempt,
    operatingCohortBinding,
    publishFrozenCohortDeclaration,
    publishOperatingEnvironmentForAttempt,
    validateFrozenCohortDeclaration,
    validateOperatingCohortBinding,
} = require('../src/operating-cohort-identity.cjs')
const {
    finalizeOperatingEvidenceBundle,
} = require('../src/c0-evidence.cjs')
const {
    buildCandidateOperatingSampleLedger,
    buildCohortLedger,
    buildDefectYieldSummary,
    finalizeIncidentRecord,
    validateIncidentChain,
    validateIncidentBundleBinding,
} = require('../src/c0-ledgers.cjs')
const { sealDocument } = require('../src/verification-receipts.cjs')
const {
    buildOperatingGateEvidence,
    validateOperatingGateEvidence,
} = require('../src/operating-cohort-gates.cjs')
const { loadEvidenceObject, objectSha256 } = require('../src/c0-retention.cjs')
const { sha256 } = require('../src/verification-evidence.cjs')
const {
    buildProvisioningReceipt,
    runtimeObservation,
} = require('../src/operating-build-environment.cjs')
const {
    declarationHash,
    decideOperatingCohortRoute,
} = require('../src/operating-cohort-route.cjs')
const { freezeOperatingCohort } = require('../scripts/freeze-operating-cohort.cjs')
const {
    publishLocalEvidenceBeforeGlobal,
    validateCurrentFrozenInputs,
} = require('../scripts/run-c0-evidence.cjs')

const root = path.resolve(__dirname, '..')
const HASH = (value) => String(value).repeat(64).slice(0, 64)
const TOOLING_COMMIT = '75dbae24a46c2218fb4b51c546782751faa8a659'

function reorder(value) {
    if (Array.isArray(value)) return value.map(reorder)
    if (!value || typeof value !== 'object') return value
    return Object.fromEntries(Object.keys(value).reverse().map((key) => [key, reorder(value[key])]))
}

function materialDeclaration() {
    return JSON.parse(fs.readFileSync(path.join(root,
        'contracts/first-material-c0-toolchain-hardening-v1.json'), 'utf8'))
}

function routeInputs(declaration) {
    return {
        declaration,
        qualificationState: {
            accepted: true,
            registryIntegrity: true,
            subject: structuredClone(declaration.qualification.subject),
            compatibility: structuredClone(declaration.qualification.compatibility),
            environment: structuredClone(declaration.environment),
        },
        freshVerification: 'passed',
        operatingEnvironmentProvisioned: true,
        operatingBuildBoundaryVerification: 'passed',
        candidateDomain: {
            candidateId: 'toolchain-hardening',
            localMasksExpected: 2,
            boundaryClassesExpected: 4,
            totalLocalCasesExpected: 8,
            compiledDeclarationSha256: declaration.qualification.subject.compiledDeclarationSha256,
        },
    }
}

function makeIdentity({
    declaration = materialDeclaration(),
    qualificationIdentity = null,
    toolingStatus = HASH('0'),
    boundaryClasses = ['empty', 'present', 'managed', 'unmanaged'],
} = {}) {
    const governance = {
        repository: 'https://github.com/danso0429/patch-verification-governance',
        commit: '49d891b12a51745b9da91bf23105d78869cf8664',
        statusVersion: 12,
    }
    const inputs = routeInputs(declaration)
    const routeDecision = decideOperatingCohortRoute(inputs)
    const materialInput = buildMaterialInputIdentity({ declaration, governance })
    const cohort = buildCohortIdentity({
        declaration,
        governance,
        routeDecision,
        routeDecisionInputs: inputs,
        preflight: { qualificationIdentity: qualificationIdentity ?? {
            storeIdentityHash: HASH('1'),
            registryDescriptorSha256: HASH('2'),
            registryRootSha256: HASH('3'),
            finalManifestDescriptorSha256: HASH('4'),
            finalManifestPayloadSha256: HASH('5'),
        } },
        materialInput,
        tooling: {
            repository: 'git@github.com:danso0429/pocketrisu-personal-patches.git',
            commit: TOOLING_COMMIT,
            statusSha256: toolingStatus,
        },
        verificationIdentities: {
            canonicalGlobalVerifier: { schema: 'test-global-v1', rootSha256: HASH('6'), files: [] },
            candidateLocalVerifier: { schema: 'test-local-v1', rootSha256: HASH('7'), files: [] },
        },
        jobs: 4,
        localDomain: {
            candidateId: 'toolchain-hardening',
            masks: [0, 1],
            boundaryClasses,
            totalLocalCases: 8,
        },
    })
    return { declaration, governance, inputs, routeDecision, materialInput, cohort }
}

function freeze(identity, {
    nonce = '00000000-0000-4000-8000-000000000001',
    createdAt = '2026-08-15T00:00:00.000Z',
    sameInputCohortFound = false,
} = {}) {
    const attempt = createExecutionAttempt({
        cohortId: identity.cohort.cohortId,
        toolingCommit: TOOLING_COMMIT,
        nonce,
        createdAt,
        creator: 'identity-lifecycle-test',
    })
    const frozen = buildFrozenCohortDeclaration({
        materialInput: identity.materialInput,
        cohort: identity.cohort,
        attempt,
        declaration: identity.declaration,
        routeDecision: identity.routeDecision,
        materialClassification: {
            sameInputCohortFound,
            materiallyDistinct: !sameInputCohortFound,
            repeatedPerformanceTrial: sameInputCohortFound,
        },
    })
    return { attempt, frozen, frozenSha256: objectSha256(frozen) }
}

function evidenceBundle(identity, frozenRecord, {
    globalAccepted = true,
    sameGlobalStatus = 'passed',
    mismatches = 0,
    recordedAt = '2026-08-15T01:00:00.000Z',
    resourceMarker = 1,
    focusedResult = 'passed',
} = {}) {
    const globalRunId = HASH(resourceMarker % 9 + 1)
    return finalizeOperatingEvidenceBundle({
        schema: 'patch-c0-evidence-bundle-v2',
        evidenceBundleId: null,
        disposition: globalAccepted ? 'current-active' : 'defect-reproduction',
        runKind: 'production-c0',
        recordedAt,
        frozenDeclarationObjectSha256: frozenRecord.frozenSha256,
        frozenDeclaration: structuredClone(frozenRecord.frozen),
        cohort: {
            identitySchema: 'patch-operating-cohort-identity-v2',
            materialInputKey: identity.materialInput.materialInputKey,
            cohortId: identity.cohort.cohortId,
            executionAttemptId: frozenRecord.attempt.executionAttemptId,
            trialId: `trial-${resourceMarker}`,
            cohortClass: 'patch',
            materiallyDistinct: frozenRecord.frozen.materialClassification.materiallyDistinct,
            repeatedPerformanceTrial: frozenRecord.frozen.materialClassification.repeatedPerformanceTrial,
            productionEligible: true,
            syntheticMutation: false,
            identity: structuredClone(identity.cohort.identity),
        },
        authority: { resourceMarker },
        c0Decision: {},
        globalReceipt: {
            objectSha256: HASH('a'), bytes: 1, payloadSha256: HASH('b'), globalRunId,
            accepted: globalAccepted, disposition: globalAccepted ? 'current-active' : 'defect-reproduction',
        },
        attemptEvidence: {
            localEvidenceKind: 'receipt',
            localEvidenceObjectSha256: HASH('c'),
            localEvidencePayloadSha256: HASH('d'),
            localRunId: HASH('e'),
            globalReceiptObjectSha256: HASH('a'),
            globalReceiptPayloadSha256: HASH('b'),
            globalRunId,
            globalLaunchClaimObjectSha256: HASH('f'),
            sameGlobalStatus,
            differentialUnexpectedMismatches: mismatches,
        },
        gates: {
            focused: [{ name: 'focused-contract', result: focusedResult }],
        },
        correctness: { status: globalAccepted ? 'passed' : 'failed' },
        resources: { marker: resourceMarker },
        canonicalProtection: {},
    })
}

function passingLinkage(bundle) {
    return sealDocument({
        schema: 'patch-toolchain-shadow-operating-linkage-v2',
        status: 'passed',
        materialInputKey: bundle.cohort.materialInputKey,
        cohortId: bundle.cohort.cohortId,
        executionAttemptId: bundle.cohort.executionAttemptId,
        evidenceBundleId: bundle.evidenceBundleId,
        localRunId: bundle.attemptEvidence.localRunId,
        globalRunId: bundle.attemptEvidence.globalRunId,
    })
}

test('materialInputKey and cohortId are canonical and deterministic', () => {
    const first = makeIdentity()
    const second = makeIdentity({ declaration: reorder(materialDeclaration()) })
    assert.equal(first.materialInput.materialInputKey, second.materialInput.materialInputKey)
    assert.equal(first.cohort.cohortId, second.cohort.cohortId)
    assert.deepEqual(validateFrozenCohortDeclaration(freeze(first).frozen), freeze(first).frozen)
})

test('the material freeze path publishes every execution identity before doing work', async (t) => {
    const store = fs.mkdtempSync(path.join(os.tmpdir(), 'cohort-freeze-path-'))
    const output = path.join(store, 'frozen.json')
    t.after(() => fs.rmSync(store, { recursive: true, force: true }))
    const identity = makeIdentity()
    const declaration = identity.declaration
    const result = await freezeOperatingCohort({
        store,
        qualificationStore: path.join(store, 'qualification'),
        expectation: path.join(root, 'contracts/first-material-c0-toolchain-hardening-v1.json'),
        subjectRoot: path.join(store, 'subject'),
        targetRoot: path.join(store, 'target'),
        governanceRepository: identity.governance.repository,
        governanceCommit: identity.governance.commit,
        governanceStatusVersion: identity.governance.statusVersion,
        jobs: 4,
        output,
        attemptCreatedAt: '2026-08-15T00:00:00.000Z',
        attemptNonce: '00000000-0000-4000-8000-000000000099',
        materiallyDistinct: true,
        repeatedPerformanceTrial: false,
    }, {
        preflightOperatingCohort: () => ({
            machineRouteDecision: identity.routeDecision,
            routeDecisionInputs: identity.inputs,
            qualificationIdentity: structuredClone(identity.cohort.identity.qualification),
        }),
        captureInputFreeze: async () => ({
            source: { git: { commit: TOOLING_COMMIT, status: '' } },
            target: {
                provenance: {
                    kind: 'git', status: '',
                    commit: declaration.qualification.subject.targetCommit,
                },
                applicationTree: {
                    rootSha256: declaration.qualification.subject.targetApplicationTreeSha256,
                },
            },
        }),
        loadToolchainShadowDeclaration: () => ({
            pack: { id: 'toolchain-hardening' },
            boundaryClassIds: ['empty', 'present', 'managed', 'unmanaged'],
        }),
        buildVerificationIdentities: () => structuredClone(identity.cohort.identity.verification),
        toolingRepository: () => identity.cohort.identity.verification.tooling.repository,
        acceptedEntries: () => [],
        provisionOperatingBuildEnvironment: async () => ({
            root: path.join(store, 'synthetic-operating-environment'),
            receipt: {
                synthetic: true,
                pnpm: {
                    resolvedExecutable: '/synthetic/pnpm',
                    executableSha256: HASH('a'),
                },
            },
        }),
        publishOperatingEnvironmentForAttempt: () => ({
            receiptPublication: { objectSha256: HASH('8') },
            bindingPublication: { objectSha256: HASH('9') },
        }),
    })
    const document = JSON.parse(fs.readFileSync(output, 'utf8'))
    assert.equal(result.materialInputKey, document.materialInputKey)
    assert.equal(result.cohortId, document.cohortId)
    assert.equal(result.executionAttemptId, document.executionAttemptId)
    assert.equal(result.frozenDeclarationSha256, objectSha256(document))
    assert.equal(result.routeId, 'material-c0-global-plus-toolchain-shadow')
    assert.equal(result.localCasesExpected, 8)
    assert.equal(result.globalExecutionsExpected, 1)
    assert.equal(result.localExecutionsPerformed, 0)
    assert.equal(result.globalExecutionsPerformed, 0)
})

test('the material runner rejects verification-contract drift before execution', async () => {
    const identity = makeIdentity({ toolingStatus: sha256('') })
    const frozen = freeze(identity)
    const current = {
        source: { git: { commit: TOOLING_COMMIT, status: '' } },
        target: {
            provenance: {
                kind: 'git', status: '',
                commit: identity.declaration.qualification.subject.targetCommit,
            },
            applicationTree: {
                rootSha256: identity.declaration.qualification.subject.targetApplicationTreeSha256,
            },
        },
    }
    const dependencies = {
        captureInputFreeze: async () => structuredClone(current),
        loadToolchainShadowDeclaration: () => ({
            pack: { id: 'toolchain-hardening' },
            boundaryClassIds: ['empty', 'present', 'managed', 'unmanaged'],
        }),
        buildVerificationIdentities: () => structuredClone(identity.cohort.identity.verification),
        implementationRepository: async () => identity.cohort.identity.verification.tooling.repository,
    }
    const args = {
        sourceRoot: root,
        targetRoot: '/synthetic/target',
        subjectRoot: '/synthetic/subject',
        declaration: identity.declaration,
        routeDecision: identity.routeDecision,
        preflight: {
            routeDecisionInputs: identity.inputs,
            qualificationIdentity: structuredClone(identity.cohort.identity.qualification),
        },
        frozenDeclaration: frozen.frozen,
        governance: identity.governance,
        jobs: 4,
        dependencies,
    }
    const verified = await validateCurrentFrozenInputs(args)
    assert.equal(verified.cohort.cohortId, frozen.frozen.cohortId)
    await assert.rejects(() => validateCurrentFrozenInputs({
        ...args,
        dependencies: {
            ...dependencies,
            buildVerificationIdentities: () => ({
                ...structuredClone(identity.cohort.identity.verification),
                canonicalGlobalVerifier: {
                    ...identity.cohort.identity.verification.canonicalGlobalVerifier,
                    rootSha256: HASH('9'),
                },
            }),
        },
    }), /verification inputs differ from the frozen cohort identity/)
})

test('post-execution observations cannot alter an already frozen cohortId', () => {
    const identity = makeIdentity()
    const before = identity.cohort.cohortId
    const observations = {
        localReceiptSha256: HASH('1'), globalReceiptSha256: HASH('2'),
        actualWorkerHistory: [9, 3, 8], wallMs: 1234, runId: HASH('3'), timestamp: Date.now(),
    }
    observations.localReceiptSha256 = HASH('9')
    observations.actualWorkerHistory.reverse()
    observations.wallMs += 99
    assert.equal(identity.cohort.cohortId, before)
    const frozen = freeze(identity)
    const firstBundle = evidenceBundle(identity, frozen, { resourceMarker: 1 })
    const changedObservationBundle = evidenceBundle(identity, frozen, { resourceMarker: 2 })
    assert.equal(firstBundle.cohort.cohortId, changedObservationBundle.cohort.cohortId)
    assert.notEqual(firstBundle.evidenceBundleId, changedObservationBundle.evidenceBundleId)
})

test('semantic material inputs and verification-contract inputs invalidate the intended layers', () => {
    const base = makeIdentity()
    for (const mutate of [
        (value) => { value.qualification.subject.implementationCommit = '1'.repeat(40) },
        (value) => { value.qualification.subject.policySha256 = HASH('8') },
        (value) => { value.qualification.subject.targetCommit = '2'.repeat(40) },
        (value) => { value.qualification.subject.contractSha256 = HASH('8') },
        (value) => { value.qualification.subject.compiledDeclarationSha256 = HASH('8') },
        (value) => { value.environment.id = 'toolchain:test-changed' },
    ]) {
        const changedDeclaration = materialDeclaration()
        mutate(changedDeclaration)
        changedDeclaration.declarationSha256 = declarationHash(changedDeclaration)
        const changed = makeIdentity({ declaration: changedDeclaration })
        assert.notEqual(changed.materialInput.materialInputKey, base.materialInput.materialInputKey)
        assert.notEqual(changed.cohort.cohortId, base.cohort.cohortId)
    }
    const qualificationChanged = makeIdentity({ qualificationIdentity: {
        ...base.cohort.identity.qualification,
        registryRootSha256: HASH('9'),
    } })
    assert.equal(qualificationChanged.materialInput.materialInputKey, base.materialInput.materialInputKey)
    assert.notEqual(qualificationChanged.cohort.cohortId, base.cohort.cohortId)
    const domainChanged = makeIdentity({ boundaryClasses: ['a', 'b', 'c', 'd'] })
    assert.equal(domainChanged.materialInput.materialInputKey, base.materialInput.materialInputKey)
    assert.notEqual(domainChanged.cohort.cohortId, base.cohort.cohortId)
})

test('tooling-only observation-contract change keeps material input and changes cohort', () => {
    const base = makeIdentity()
    const toolingChanged = makeIdentity({ toolingStatus: HASH('9') })
    assert.equal(toolingChanged.materialInput.materialInputKey, base.materialInput.materialInputKey)
    assert.notEqual(toolingChanged.cohort.cohortId, base.cohort.cohortId)
})

test('retry keeps material and cohort identities and creates a new attempt identity', () => {
    const identity = makeIdentity()
    const first = freeze(identity)
    const retry = freeze(identity, {
        nonce: '00000000-0000-4000-8000-000000000002',
        createdAt: '2026-08-15T00:00:01.000Z',
    })
    assert.equal(first.frozen.materialInputKey, retry.frozen.materialInputKey)
    assert.equal(first.frozen.cohortId, retry.frozen.cohortId)
    assert.notEqual(first.attempt.executionAttemptId, retry.attempt.executionAttemptId)
})

test('failed local, Global, and differential attempts retain identity without acceptance', () => {
    const identity = makeIdentity()
    const frozen = freeze(identity)
    for (const bundle of [
        evidenceBundle(identity, frozen, { sameGlobalStatus: 'failed', mismatches: 1 }),
        evidenceBundle(identity, frozen, { globalAccepted: false }),
        evidenceBundle(identity, frozen, { sameGlobalStatus: 'failed', mismatches: 2 }),
        evidenceBundle(identity, frozen, { focusedResult: 'failed' }),
    ]) {
        const ledger = buildCohortLedger([bundle], { generatedAt: '2026-08-15T02:00:00.000Z' })
        assert.equal(ledger.entries[0].accepted, false)
        assert.equal(ledger.entries[0].cohortId, identity.cohort.cohortId)
        assert.equal(ledger.entries[0].executionAttemptId, frozen.attempt.executionAttemptId)
        assert.equal(buildDefectYieldSummary(ledger, [], {
            generatedAt: '2026-08-15T02:00:01.000Z',
        }).productionCohorts, 0)
    }
    const failedBundle = evidenceBundle(identity, frozen, { globalAccepted: false })
    const incident = finalizeIncidentRecord({
        schema: 'patch-c0-incident-record-v2',
        recordedAt: '2026-08-15T02:00:02.000Z',
        materialInputKey: failedBundle.cohort.materialInputKey,
        cohortId: failedBundle.cohort.cohortId,
        executionAttemptId: failedBundle.cohort.executionAttemptId,
        evidenceBundleId: failedBundle.evidenceBundleId,
        globalRunId: failedBundle.attemptEvidence.globalRunId,
        localRunId: failedBundle.attemptEvidence.localRunId,
        bundleObjectSha256: objectSha256(failedBundle),
        cohortClass: 'patch',
        syntheticMutation: false,
        productionDefectEligible: false,
        firstFailure: {
            phase: 'global-exhaustive', mask: null, worker: null,
            message: 'synthetic Global failure',
            stdoutObjectSha256: null, stderrObjectSha256: null,
        },
        detectors: { focused: 'not-applicable', global: 'caught', product: 'not-run' },
        attribution: 'harness-defect',
        rootCause: null,
        fix: null,
        negativeEvidenceObjectSha256s: [objectSha256(failedBundle)],
        disposition: 'defect-reproduction',
    })
    assert.deepEqual(validateIncidentChain([incident]), { valid: true, errors: [] })
    assert.equal(validateIncidentBundleBinding(incident, failedBundle), true)
    assert.equal(incident.executionAttemptId, frozen.attempt.executionAttemptId)
    assert.equal(incident.evidenceBundleId, failedBundle.evidenceBundleId)
    const wrongAttemptBundle = evidenceBundle(identity, freeze(identity, {
        nonce: '00000000-0000-4000-8000-000000000088',
        createdAt: '2026-08-15T00:00:08.000Z',
    }), { globalAccepted: false })
    assert.throws(() => validateIncidentBundleBinding(incident, wrongAttemptBundle),
        /does not bind its exact evidence bundle identities/)
    assert.equal(validateFrozenCohortDeclaration(frozen.frozen).disposition, 'declared-pending')
})

test('Global launch claim closes the unknown-outcome crash window', (t) => {
    const store = fs.mkdtempSync(path.join(os.tmpdir(), 'cohort-launch-claim-'))
    t.after(() => fs.rmSync(store, { recursive: true, force: true }))
    const frozen = freeze(makeIdentity())
    const publication = publishFrozenCohortDeclaration(store, frozen.frozen)
    const first = claimGlobalLaunch({
        storeRoot: store,
        frozenDeclaration: frozen.frozen,
        frozenDeclarationObjectSha256: publication.publication.objectSha256,
        claimedAt: '2026-08-15T03:00:00.000Z',
    })
    assert.equal(first.claim.state, 'claimed-before-spawn')
    assert.throws(() => claimGlobalLaunch({
        storeRoot: store,
        frozenDeclaration: frozen.frozen,
        frozenDeclarationObjectSha256: publication.publication.objectSha256,
        claimedAt: '2026-08-15T03:00:01.000Z',
    }), (error) => error.code === 'SECOND_GLOBAL_LAUNCH_FORBIDDEN')
})

test('operating provisioning receipt is append-only bound to one exact attempt', (t) => {
    const store = fs.mkdtempSync(path.join(os.tmpdir(), 'cohort-operating-environment-'))
    t.after(() => fs.rmSync(store, { recursive: true, force: true }))
    const identity = makeIdentity()
    const record = freeze(identity)
    const frozenPublication = publishFrozenCohortDeclaration(store, record.frozen)
    const provisionRoot = path.join(store, 'operating-pnpm-10.34.1-test')
    const bin = path.join(provisionRoot, 'node_modules', '.bin')
    fs.mkdirSync(bin, { recursive: true })
    const pnpm = path.join(bin, 'pnpm')
    fs.writeFileSync(pnpm, '#!/usr/bin/env node\n', { mode: 0o700 })
    const observation = runtimeObservation({
        pnpmExecutable: pnpm,
        spawnSync: () => ({
            error: undefined, signal: null, status: 0, stdout: '10.34.1\n', stderr: '',
        }),
        nodeVersion: 'v25.9.0',
        platform: 'linux',
        architecture: 'arm64',
        reportHeader: { glibcVersionRuntime: '2.39' },
    })
    const receipt = buildProvisioningReceipt({
        provisioned: {
            root: provisionRoot,
            executable: pnpm,
            binDirectory: bin,
            receipt: {
                method: 'unique-task-scoped-temporary-installation',
                methodVersion: 'exact-task-scoped-pnpm-v1',
                command: { executable: 'npm', args: [
                    'install', '--prefix', provisionRoot, '--no-package-lock', '--ignore-scripts',
                    '--no-audit', '--no-fund', 'pnpm@10.34.1',
                ] },
                installStdoutSha256: HASH('1'), installStderrSha256: HASH('2'),
                installExitCode: 0, repositoryMutationAllowed: false,
                lockfileMutationAllowed: false, cleanupRequired: true,
            },
        },
        observation,
        context: {
            subjectCommit: record.frozen.subject.implementationCommit,
            toolingCommit: record.frozen.executionAttempt.provenance.toolingCommit,
            toolingStatusSha256:
                record.frozen.cohortIdentity.verification.tooling.statusSha256,
            targetCommit: record.frozen.target.commit,
            targetApplicationTreeSha256: record.frozen.target.applicationTreeSha256,
        },
        ambientPath: '/ambient',
        effectivePath: `${bin}${path.delimiter}/ambient`,
        createdAt: '2026-08-15T03:00:00.000Z',
    })
    const published = publishOperatingEnvironmentForAttempt({
        storeRoot: store,
        frozenDeclaration: record.frozen,
        frozenDeclarationObjectSha256: frozenPublication.publication.objectSha256,
        provisioningReceipt: receipt,
    })
    const loaded = loadOperatingEnvironmentForAttempt({
        storeRoot: store,
        frozenDeclaration: record.frozen,
        frozenDeclarationObjectSha256: frozenPublication.publication.objectSha256,
        requireExecutable: true,
    })
    assert.equal(loaded.receiptObjectSha256, published.receiptPublication.objectSha256)
    const retry = freeze(identity, {
        nonce: '00000000-0000-4000-8000-000000000007',
        createdAt: '2026-08-15T03:00:01.000Z',
    })
    assert.throws(() => loadOperatingEnvironmentForAttempt({
        storeRoot: store,
        frozenDeclaration: retry.frozen,
        frozenDeclarationObjectSha256: objectSha256(retry.frozen),
        requireExecutable: true,
    }), (error) => error.code === 'OPERATING_ENVIRONMENT_BINDING_MISSING')
})

test('focused gate evidence is frozen to the attempt before execution', () => {
    const first = freeze(makeIdentity())
    const gateEvidence = buildOperatingGateEvidence({
        gateKind: 'focused',
        gates: [{ name: 'focused-contract', result: 'passed', receiptObjectSha256: null, detailsSha256: null }],
        frozenDeclaration: first.frozen,
        frozenDeclarationObjectSha256: first.frozenSha256,
        recordedAt: '2026-08-15T03:00:00.000Z',
    })
    assert.equal(validateOperatingGateEvidence(gateEvidence, {
        gateKind: 'focused',
        frozenDeclaration: first.frozen,
        frozenDeclarationObjectSha256: first.frozenSha256,
    }), gateEvidence)
    const retry = freeze(makeIdentity(), {
        nonce: '00000000-0000-4000-8000-000000000005',
        createdAt: '2026-08-15T00:00:04.000Z',
    })
    assert.throws(() => validateOperatingGateEvidence(gateEvidence, {
        gateKind: 'focused',
        frozenDeclaration: retry.frozen,
        frozenDeclarationObjectSha256: retry.frozenSha256,
    }), /differs from the exact frozen attempt/)
})

test('the first local failure is durable before a Global launch can be claimed', (t) => {
    const store = fs.mkdtempSync(path.join(os.tmpdir(), 'cohort-local-failure-'))
    t.after(() => fs.rmSync(store, { recursive: true, force: true }))
    const record = freeze(makeIdentity())
    const localFailure = sealDocument({
        schema: 'patch-toolchain-shadow-local-failure-v1',
        status: 'failed',
        code: 'SYNTHETIC_LOCAL_FAILURE',
        message: 'synthetic local failure',
        materialDeclarationSha256: record.frozen.materialDeclarationSha256,
        operatingCohort: operatingCohortBinding(record.frozen, record.frozenSha256),
        recordedAt: '2026-08-15T03:00:00.000Z',
    })
    const publication = publishLocalEvidenceBeforeGlobal({
        store,
        localReceipt: null,
        localFailure,
    })
    assert.deepEqual(loadEvidenceObject(store, publication.objectSha256).document, localFailure)
    assert.throws(() => publishLocalEvidenceBeforeGlobal({
        store,
        localReceipt: localFailure,
        localFailure,
    }), /cannot both be preserved/)
})

test('successful combined fixture counts one material input and a repeat does not add maturity', () => {
    const identity = makeIdentity()
    const firstFrozen = freeze(identity)
    const first = evidenceBundle(identity, firstFrozen)
    const repeatFrozen = freeze(identity, {
        nonce: '00000000-0000-4000-8000-000000000003',
        createdAt: '2026-08-15T00:00:02.000Z',
        sameInputCohortFound: true,
    })
    const repeat = evidenceBundle(identity, repeatFrozen, {
        recordedAt: '2026-08-15T01:00:01.000Z', resourceMarker: 2,
    })
    const ledger = buildCohortLedger([first, repeat], { generatedAt: '2026-08-15T02:00:00.000Z' })
    assert.equal(ledger.entries.length, 2)
    assert.equal(ledger.entries.filter((entry) => entry.materiallyDistinct).length, 1)
    const summary = buildDefectYieldSummary(ledger, [], { generatedAt: '2026-08-15T03:00:00.000Z' })
    assert.equal(summary.productionCohorts, 1)
    const linkage = passingLinkage(first)
    const samples = buildCandidateOperatingSampleLedger([{ linkage }], ledger, {
        generatedAt: '2026-08-15T03:00:01.000Z',
    })
    assert.equal(samples.entries.length, 1)
    assert.equal(samples.entries[0].materialInputKey, first.cohort.materialInputKey)
    assert.equal(classifyMaterialDistinctness({
        materialInputKey: identity.materialInput.materialInputKey,
        acceptedEntries: ledger.entries,
        requestedMateriallyDistinct: false,
        requestedRepeatedPerformanceTrial: true,
    }).repeatedPerformanceTrial, true)
})

test('same material input cannot be appended as a second materially-distinct success', () => {
    const identity = makeIdentity()
    const first = evidenceBundle(identity, freeze(identity))
    const second = evidenceBundle(identity, freeze(identity, {
        nonce: '00000000-0000-4000-8000-000000000004',
        createdAt: '2026-08-15T00:00:03.000Z',
    }), { recordedAt: '2026-08-15T01:00:03.000Z', resourceMarker: 3 })
    assert.throws(() => buildCohortLedger([first, second]), /duplicate materially-distinct material input/)
})

test('cross-cohort and cross-attempt receipt mixing are rejected separately', () => {
    const first = freeze(makeIdentity())
    const expected = operatingCohortBinding(first.frozen, first.frozenSha256)
    const crossCohort = { ...expected, cohortId: HASH('8') }
    assert.throws(() => validateOperatingCohortBinding(crossCohort, expected),
        (error) => error.code === 'CROSS_COHORT_RECEIPT')
    const crossAttempt = { ...expected, executionAttemptId: HASH('9') }
    assert.throws(() => validateOperatingCohortBinding(crossAttempt, expected),
        (error) => error.code === 'CROSS_ATTEMPT_RECEIPT')
})
