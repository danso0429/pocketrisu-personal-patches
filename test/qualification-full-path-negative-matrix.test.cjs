'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const {
    canonicalJsonBytes,
    durablePublishExact,
    loadPublishedObject,
    loadStoreIdentity,
    publishEvidenceBatch,
    sha256,
} = require('../src/qualification-object-store.cjs')
const {
    CANONICAL_PROTECTION,
    CURRENT_REF_SCHEMA,
    OPERATING_COUNTS,
    QUALIFICATION_MANIFEST_SCHEMA,
    QUALIFICATION_REGISTRY_SCHEMA,
    SNAPSHOT_REF_SCHEMA,
    appendRegistryEntry,
    buildCurrentRef,
    publishRegistrySnapshot,
    qualificationRegistryId,
    resolveVerifiedQualificationRegistryHead,
    updateCurrentRef,
} = require('../src/qualification-registry.cjs')
const { fullSchemaRegistry } = require('../src/qualification-verifier.cjs')
const qualification = require('../src/toolchain-shadow-qualification.cjs')
const { sealDocument } = require('../src/verification-receipts.cjs')
const {
    cleanupWorkspace,
    closureQuarantineRoot,
    createWorkspace,
    currentRefBytes,
    currentToolCommit,
    disposableRootBase,
    expectationFor,
    invalidCaseRecord,
    mutateRegistry,
    publishAny,
    publishCompromisedAcceptedChain,
    realStoreRoot,
    registerValidChain,
    repositoryRoot,
    requireSuccessfulJson,
    reseal,
    runCli,
    runPreflight,
    runRegistration,
    runRegistryVerifier,
    scripts,
    snapshotCount,
    subjectFromSupport,
    subjectRoot,
    targetRoot,
    writeInputs,
    buildRealMachineSources,
} = require('./helpers/qualification-e2e-fixtures.cjs')

const QUALIFICATION_TYPE = 'toolchain-hardening-shadow-pilot-closure'
const OTHER_TYPE = 'other-supported-qualification'
const records = []

function completeRecord(caseId, fields = {}) {
    const preflight = fields.preflight ?? null
    const verifier = fields.verifier ?? null
    const metrics = fields.metrics ?? null
    return {
        caseId,
        storeRoot: fields.storeRoot ?? null,
        mutationLayer: fields.mutationLayer ?? null,
        publisherExitCode: fields.publisher?.exitCode ?? null,
        publisherSignal: fields.publisher?.signal ?? null,
        publisherStdoutSha256: fields.publisher?.stdoutSha256 ?? null,
        publisherStderrSha256: fields.publisher?.stderrSha256 ?? null,
        registryUpdated: fields.registryUpdated ?? null,
        snapshotCountBefore: fields.snapshotCountBefore ?? null,
        snapshotCountAfter: fields.snapshotCountAfter ?? null,
        currentRefBefore: fields.currentRefBefore ?? null,
        currentRefAfter: fields.currentRefAfter ?? null,
        snapshotsDiscovered: metrics?.snapshotsDiscovered ?? null,
        snapshotsValidated: metrics?.snapshotsValidated ?? null,
        genesisCount: metrics?.genesisCount ?? null,
        maximalHeadCount: metrics?.maximalHeadCount ?? null,
        verifiedMaximalHead: metrics?.verifiedMaximalHeadSha256 ?? null,
        rollbackDetected: metrics?.rollbackDetected ?? false,
        forkDetected: metrics?.forkDetected ?? false,
        invalidSnapshotCount: metrics?.invalidSnapshotCount ?? null,
        independentVerifierExitCode: verifier?.exitCode ?? null,
        independentVerifierResult: verifier?.parsed ?? null,
        preflightExitCode: preflight?.exitCode ?? null,
        preflightParsedResult: preflight?.parsed ?? null,
        toolchainPilotClosurePassed: preflight?.parsed?.toolchainPilotClosurePassed ?? false,
        failureReason: fields.failureReason ?? preflight?.parsed?.reason ?? null,
        cleanupResult: fields.cleanupResult ?? null,
    }
}

function assertCommandRecorded(result, label) {
    assert.equal(result.spawnError, null, `${label}: spawn error`)
    assert.equal(result.signal, null, `${label}: signal`)
    assert.notEqual(result.exitCode, null, `${label}: missing exit code`)
    assert.equal(typeof result.stdoutSha256, 'string')
    assert.equal(typeof result.stderrSha256, 'string')
}

function assertPreflightFalse(result, label) {
    assertCommandRecorded(result, label)
    assert.equal(result.exitCode, 0, `${label}: ${result.stderr}`)
    assert.notEqual(result.stdout.trim(), '', `${label}: empty stdout`)
    assert.notEqual(result.parsed, null, `${label}: unparseable stdout`)
    assert.equal(result.parsed.toolchainPilotClosurePassed, false, `${label}: ${result.stdout}`)
}

function assertVerifierRejected(result, label) {
    assertCommandRecorded(result, label)
    assert.notEqual(result.exitCode, 0, `${label}: verifier unexpectedly passed`)
}

function sealedMutation(document, mutation) {
    return reseal(document, mutation)
}

function persistentPrototypeMutation(closure) {
    return sealedMutation(closure, (value) => {
        const checks = { ...value.checks }
        delete checks.authorityCompatible
        Object.defineProperty(checks, '__proto__', {
            value: true, enumerable: true, configurable: true, writable: true,
        })
        checks.constructor = true
        checks.prototype = true
        value.checks = checks
    })
}

function runMachineNegative(caseId, source, mutations) {
    const publisherWorkspace = createWorkspace(`${caseId}-publisher`)
    const compromisedWorkspace = createWorkspace(`${caseId}-compromised`)
    try {
        const inputs = writeInputs(publisherWorkspace, source, mutations)
        const publisher = runRegistration(publisherWorkspace, inputs)
        assertCommandRecorded(publisher.process, `${caseId} publisher`)
        assert.notEqual(publisher.process.exitCode, 0, `${caseId}: invalid publisher input passed`)
        assert.equal(publisher.registryUpdated, false)
        assert.equal(publisher.currentRefBefore, null)
        assert.equal(publisher.currentRefAfter, null)

        const chain = publishCompromisedAcceptedChain(compromisedWorkspace, source, mutations)
        const verifier = runRegistryVerifier(compromisedWorkspace, chain.registryObject.descriptorSha256, chain.subject)
        assertVerifierRejected(verifier, `${caseId} independent verifier`)
        const preflight = runPreflight(compromisedWorkspace, expectationFor(source.support))
        assertPreflightFalse(preflight, `${caseId} production preflight`)
        const record = invalidCaseRecord({ caseId, workspace: compromisedWorkspace, publisher, chain, verifier, preflight })
        assert.equal(record.toolchainPilotClosurePassed, false)
        records.push(record)
    } finally {
        assert.equal(cleanupWorkspace(publisherWorkspace), true)
        assert.equal(cleanupWorkspace(compromisedWorkspace), true)
    }
}

function publisherRejectsDocument(workspace, entry) {
    const before = currentRefBytes(workspace.storeRoot)
    assert.throws(() => publishEvidenceBatch({
        storeRoot: workspace.storeRoot,
        entries: [entry],
        schemaRegistry: fullSchemaRegistry(),
        publisherToolIdentity: { qualificationToolCommit: currentToolCommit() },
        createdAt: '2026-08-15T22:00:00.000Z',
    }))
    assert.equal(currentRefBytes(workspace.storeRoot), before)
    assert.equal(snapshotCount(workspace.storeRoot), 0)
}

function runCompromisedSemanticCase(caseId, source, mutations, layerAEntry, { layerARejects = true } = {}) {
    const publisherWorkspace = createWorkspace(`${caseId}-publisher`)
    const compromisedWorkspace = createWorkspace(`${caseId}-compromised`)
    try {
        if (layerARejects) publisherRejectsDocument(publisherWorkspace, layerAEntry())
        else {
            publishEvidenceBatch({
                storeRoot: publisherWorkspace.storeRoot,
                entries: [layerAEntry()],
                schemaRegistry: fullSchemaRegistry(),
                publisherToolIdentity: { qualificationToolCommit: currentToolCommit() },
                createdAt: '2026-08-15T22:00:00.000Z',
            })
            assert.equal(currentRefBytes(publisherWorkspace.storeRoot), null)
            assert.equal(snapshotCount(publisherWorkspace.storeRoot), 0)
        }
        const chain = publishCompromisedAcceptedChain(compromisedWorkspace, source, mutations)
        const verifier = runRegistryVerifier(compromisedWorkspace, chain.registryObject.descriptorSha256, chain.subject)
        assertVerifierRejected(verifier, `${caseId} independent verifier`)
        const preflight = runPreflight(compromisedWorkspace, expectationFor(source.support))
        assertPreflightFalse(preflight, `${caseId} production preflight`)
        records.push(invalidCaseRecord({ caseId, workspace: compromisedWorkspace, publisher: null, chain, verifier, preflight }))
    } finally {
        assert.equal(cleanupWorkspace(publisherWorkspace), true)
        assert.equal(cleanupWorkspace(compromisedWorkspace), true)
    }
}

function locateRegisteredDocuments(workspace, registrationReport) {
    const finalLoaded = loadPublishedObject({
        storeRoot: workspace.storeRoot,
        descriptorSha256: registrationReport.qualificationManifestDescriptorSha256,
        schemaRegistry: fullSchemaRegistry(),
    })
    const contentLoaded = loadPublishedObject({
        storeRoot: workspace.storeRoot,
        descriptorSha256: finalLoaded.document.contentManifestDescriptorSha256,
        schemaRegistry: fullSchemaRegistry(),
    })
    return { finalLoaded, contentLoaded }
}

function appendSnapshot(workspace, base, {
    action = 'accept',
    subject = null,
    manifest = 'b'.repeat(64),
    reason = 'full-path registry-head descendant',
    timestamp = '2026-08-15T22:10:00.000Z',
} = {}) {
    const identity = loadStoreIdentity(workspace.storeRoot)
    const appended = appendRegistryEntry({
        baseRegistry: base.registry,
        baseRegistryDescriptorSha256: base.registryDescriptorSha256,
        storeIdentityHash: identity.storeIdentityHash,
        action,
        subject: subject ?? base.registry.entries[0].subject,
        qualificationManifestDescriptorSha256: manifest,
        reason,
        timestamp,
    })
    const object = publishRegistrySnapshot({
        storeRoot: workspace.storeRoot,
        registry: appended.registry,
        qualificationToolCommit: currentToolCommit(),
        createdAt: timestamp,
    })
    return { registry: appended.registry, registryDescriptorSha256: object.descriptorSha256, object, entry: appended.entry }
}

function pointCurrent(workspace, snapshot, overrides = {}) {
    const identity = loadStoreIdentity(workspace.storeRoot)
    const reference = buildCurrentRef({
        storeIdentityHash: identity.storeIdentityHash,
        registryId: snapshot.registry.registryId,
        registryDescriptorSha256: snapshot.registryDescriptorSha256,
        snapshotSequence: snapshot.registry.snapshotSequence,
        registryRootSha256: snapshot.registry.registryRootSha256,
        updatedAt: '2026-08-15T22:11:00.000Z',
        ...overrides,
    })
    updateCurrentRef(workspace.storeRoot, reference)
    return reference
}

function baseSnapshot(workspace) {
    const current = resolveVerifiedQualificationRegistryHead(workspace.storeRoot)
    return {
        registry: current.registry,
        registryDescriptorSha256: current.registryDescriptorSha256,
    }
}

function assertHeadFailure(workspace, source, descriptor, expectedReason, label) {
    const verifier = runRegistryVerifier(workspace, descriptor, subjectFromSupport(source.support))
    assertVerifierRejected(verifier, `${label} verifier`)
    const preflight = runPreflight(workspace, expectationFor(source.support))
    assertPreflightFalse(preflight, `${label} preflight`)
    if (expectedReason) assert.equal(preflight.parsed.reason, expectedReason, `${label}: ${preflight.stdout}`)
    let metrics = null
    try { metrics = resolveVerifiedQualificationRegistryHead(workspace.storeRoot).metrics } catch (error) { metrics = error.details ?? null }
    records.push(completeRecord(label, {
        storeRoot: workspace.storeRoot,
        mutationLayer: 'compromised-store',
        verifier,
        preflight,
        metrics,
        snapshotCountAfter: snapshotCount(workspace.storeRoot),
    }))
    return { verifier, preflight }
}

function publishAdversarialRegistry(workspace, registry, markerMutation = null) {
    const identity = loadStoreIdentity(workspace.storeRoot)
    const [object] = publishAny(workspace.storeRoot, [{
        payloadModel: 'canonical-json',
        mediaType: 'application/vnd.pocketrisu.qualification-registry+json',
        role: 'qualification-registry-snapshot',
        referencedSchema: QUALIFICATION_REGISTRY_SCHEMA,
        sizeLimitClass: 'registry-snapshot',
        value: registry,
    }])
    let marker = {
        schema: SNAPSHOT_REF_SCHEMA,
        storeIdentityHash: identity.storeIdentityHash,
        registryId: qualificationRegistryId(identity.storeIdentityHash),
        registrySchema: QUALIFICATION_REGISTRY_SCHEMA,
        registryDescriptorSha256: object.descriptorSha256,
        snapshotSequence: registry.snapshotSequence,
        previousSnapshotSha256: registry.baseRegistryDescriptorSha256,
    }
    if (markerMutation) markerMutation(marker)
    marker = sealDocument(marker)
    const file = path.join(workspace.storeRoot, identity.registryNamespace, marker.registryId, 'snapshots', `${object.descriptorSha256}.json`)
    durablePublishExact(file, canonicalJsonBytes(marker), path.join(workspace.storeRoot, 'v2/tmp'))
    return { registry, registryDescriptorSha256: object.descriptorSha256, object, markerPath: file }
}

function validRegisteredWorkspace(label, source, reordered = false) {
    const workspace = createWorkspace(label)
    const valid = registerValidChain(workspace, source, { reordered })
    assert.equal(valid.preflightReport.toolchainPilotClosurePassed, true)
    return { workspace, valid, snapshot: baseSnapshot(workspace) }
}

test('complete durable registry-to-verifier-to-preflight negative matrix', { timeout: 900_000 }, async (t) => {
    assert.equal(fs.existsSync(realStoreRoot), false, 'real accepted qualification store must remain absent')
    const sourceWorkspace = createWorkspace('matrix-positive-control')
    let source
    try {
        source = buildRealMachineSources(sourceWorkspace)
        const positive = registerValidChain(sourceWorkspace, source, { reordered: true })
        assert.equal(positive.preflightReport.toolchainPilotClosurePassed, true)
        assert.equal(positive.report.registered, true)
        assert.equal(positive.report.verifiedRegistryHead.maximalHeadCount, 1)
        assert.equal(positive.report.verifiedRegistryHead.rollbackDetected, false)
        assert.equal(positive.report.verifiedRegistryHead.forkDetected, false)
        assert.equal(positive.report.verifiedRegistryHead.verifiedMaximalHeadSha256, positive.report.registryDescriptorSha256)
        assert.equal(fs.existsSync(realStoreRoot), false)
        t.diagnostic(`positive-control registry=${positive.report.registryDescriptorSha256}`)

        await t.test('machine closure required-check and derivation cases reject at publisher and compromised-store layers', () => {
            const machineCases = [
                ['empty-checks', { closure: (doc) => sealedMutation(doc, (v) => { v.checks = {} }) }],
                ['partial-one-missing', { closure: (doc) => sealedMutation(doc, (v) => { delete v.checks.authorityCompatible }) }],
                ['partial-multiple-missing', { closure: (doc) => sealedMutation(doc, (v) => { delete v.checks.authorityCompatible; delete v.checks.receiptIntegrityPassed; delete v.checks.localRoutePassed }) }],
                ['partial-unknown-substitute', { closure: (doc) => sealedMutation(doc, (v) => { delete v.checks.authorityCompatible; v.checks.unknownReplacement = true }) }],
                ['persistent-prototype-substitution', { closure: persistentPrototypeMutation }],
                ['target-clean-missing', { support: (doc) => sealedMutation(doc, (v) => { delete v.integrityChecks.targetClean }) }],
                ['target-clean-false', { support: (doc) => sealedMutation(doc, (v) => { v.integrityChecks.targetClean = false }) }],
                ['support-receipt-integrity-missing', { support: (doc) => sealedMutation(doc, (v) => { delete v.integrityChecks.receiptIntegrityPassed }) }],
                ['support-receipt-integrity-false', { support: (doc) => sealedMutation(doc, (v) => { v.integrityChecks.receiptIntegrityPassed = false }) }],
                ['closure-receipt-integrity-missing', { closure: (doc) => sealedMutation(doc, (v) => { delete v.checks.receiptIntegrityPassed }) }],
                ['closure-receipt-integrity-false', { closure: (doc) => sealedMutation(doc, (v) => { v.checks.receiptIntegrityPassed = false }) }],
                ['source-target-integrity-missing', { closure: (doc) => sealedMutation(doc, (v) => { delete v.checks.sourceTargetIntegrityPassed }) }],
                ['source-target-integrity-false', { closure: (doc) => sealedMutation(doc, (v) => { v.checks.sourceTargetIntegrityPassed = false }) }],
                ['wrong-closure-type', { closure: (doc) => sealedMutation(doc, (v) => { v.qualificationType = OTHER_TYPE }) }],
                ['wrong-recipe-hash', { support: (doc) => sealedMutation(doc, (v) => { v.fixtureDerivation.recipeSha256 = 'e'.repeat(64); v.fixtureDerivation.deterministicRederivationMatched = true }) }],
                ['wrong-full-fixture-hash', { support: (doc) => sealedMutation(doc, (v) => { v.fixtureDerivation.outputFixtureDeclarationSha256 = 'd'.repeat(64); v.fixtureDerivation.deterministicRederivationMatched = true }) }],
            ]
            for (const [caseId, mutations] of machineCases) runMachineNegative(caseId, source, mutations)
        })

        await t.test('qualification type mismatches at content, final, and registry layers reject full path', () => {
            const dummySubject = subjectFromSupport(source.support)
            const content = sealedMutation({
                schema: 'patch-qualification-content-manifest-v1', createdAt: '2026-08-15T22:20:00.000Z',
                qualificationType: QUALIFICATION_TYPE, subject: dummySubject,
                objects: {
                    machineClosureDescriptorSha256: '1'.repeat(64), machineSupportDescriptorSha256: '2'.repeat(64),
                    authorityEnvironmentDescriptorSha256: '2'.repeat(64), localReceiptDescriptorSha256: '3'.repeat(64),
                    globalSyntheticReceiptDescriptorSha256: '4'.repeat(64), closureNarrativeDescriptorSha256: null,
                    sourceEventDescriptorSha256: null, environmentNarrativeDescriptorSha256: null,
                },
                acceptedPurpose: 'prerequisite-for-material-shadow-cohort-collection',
                excludedPurposes: [...qualification.EXCLUDED_PURPOSES], operatingCounts: { ...OPERATING_COUNTS },
                integrity: {},
            }, (v) => { v.qualificationType = OTHER_TYPE })
            const finalManifest = sealedMutation({
                schema: QUALIFICATION_MANIFEST_SCHEMA, createdAt: '2026-08-15T22:20:01.000Z', qualificationType: QUALIFICATION_TYPE,
                subject: dummySubject, contentManifestDescriptorSha256: '1'.repeat(64), validationResultDescriptorSha256: '2'.repeat(64),
                disposition: 'accepted-qualification', acceptedPurpose: 'prerequisite-for-material-shadow-cohort-collection',
                excludedPurposes: [...qualification.EXCLUDED_PURPOSES], operatingCounts: { ...OPERATING_COUNTS },
                canonicalProtection: { ...CANONICAL_PROTECTION }, integrity: {},
            }, (v) => { v.qualificationType = OTHER_TYPE })
            const identityWorkspace = createWorkspace('wrong-registry-type-template')
            let wrongRegistry
            try {
                const identity = loadStoreIdentity(identityWorkspace.storeRoot)
                const validRegistry = appendRegistryEntry({
                    storeIdentityHash: identity.storeIdentityHash, action: 'accept', subject: dummySubject,
                    qualificationManifestDescriptorSha256: 'f'.repeat(64), reason: 'type template', timestamp: '2026-08-15T22:20:02.000Z',
                }).registry
                wrongRegistry = mutateRegistry(validRegistry, (registry, entry) => { entry.qualificationType = OTHER_TYPE })
            } finally { assert.equal(cleanupWorkspace(identityWorkspace), true) }
            runCompromisedSemanticCase('wrong-content-type', source, {
                content: (doc) => sealedMutation(doc, (v) => { v.qualificationType = OTHER_TYPE }),
            }, () => ({ payloadModel: 'canonical-json', mediaType: 'application/vnd.pocketrisu.qualification-manifest+json', role: 'qualification-content-manifest', referencedSchema: content.schema, value: content }))
            runCompromisedSemanticCase('wrong-final-type', source, {
                finalManifest: (doc) => sealedMutation(doc, (v) => { v.qualificationType = OTHER_TYPE }),
            }, () => ({ payloadModel: 'canonical-json', mediaType: 'application/vnd.pocketrisu.qualification-manifest+json', role: 'final-qualification-manifest', referencedSchema: finalManifest.schema, value: finalManifest }))
            runCompromisedSemanticCase('wrong-registry-type', source, {
                registry: (doc) => mutateRegistry(doc, (registry, entry) => { entry.qualificationType = OTHER_TYPE }),
            }, () => ({ payloadModel: 'canonical-json', mediaType: 'application/vnd.pocketrisu.qualification-registry+json', role: 'qualification-registry-snapshot', referencedSchema: wrongRegistry.schema, sizeLimitClass: 'registry-snapshot', value: wrongRegistry }))
        })

        await t.test('stale compatibility and production-protection values reject through production preflight', () => {
            const staleCases = [
                ['stale-subject', (expected) => { expected.subject.implementationCommit = '0'.repeat(40) }],
                ['stale-contract', (expected) => { expected.subject.contractSha256 = '0'.repeat(64) }],
                ['stale-declaration', (expected) => { expected.subject.compiledDeclarationSha256 = '0'.repeat(64) }],
                ['stale-policy', (expected) => { expected.subject.policySha256 = '0'.repeat(64) }],
                ['stale-target-commit', (expected) => { expected.subject.targetCommit = '0'.repeat(40) }],
                ['stale-target-tree', (expected) => { expected.subject.targetApplicationTreeSha256 = '0'.repeat(64) }],
                ['stale-route', (expected) => { expected.compatibility.localRouteSha256 = '0'.repeat(64) }],
            ]
            for (const [caseId, mutate] of staleCases) {
                const { workspace, valid } = validRegisteredWorkspace(caseId, source)
                try {
                    const expected = structuredClone(valid.expectation)
                    mutate(expected)
                    const preflight = runPreflight(workspace, expected)
                    assertPreflightFalse(preflight, caseId)
                    records.push(completeRecord(caseId, {
                        storeRoot: workspace.storeRoot,
                        mutationLayer: 'preflight-expectation',
                        preflight,
                        snapshotCountAfter: snapshotCount(workspace.storeRoot),
                    }))
                } finally { assert.equal(cleanupWorkspace(workspace), true) }
            }

            const protectionCases = [
                ['material-count-nonzero', (final) => { final.operatingCounts.materialOperatingCohort = true }],
                ['stable-release-count-nonzero', (final) => { final.operatingCounts.stableRelease = true }],
                ['defect-yield-count-nonzero', (final) => { final.operatingCounts.productionDefectYield = true }],
                ['candidate-sample-count-nonzero', (final) => { final.operatingCounts.candidateOperatingSample = true }],
                ['production-certificate-nonzero', (final) => { final.canonicalProtection.productionCertificatesIssued = 1 }],
                ['skipped-masks-nonzero', (final) => { final.canonicalProtection.canonicalMasksSkipped = 1 }],
                ['production-migration-true', (final) => { final.canonicalProtection.productionStateMigrated = true }],
                ['c1-authorization-true', (final) => { final.canonicalProtection.c1RelaxationAuthorized = true }],
            ]
            for (const [caseId, mutate] of protectionCases) {
                const template = sealedMutation({
                    schema: QUALIFICATION_MANIFEST_SCHEMA, createdAt: '2026-08-15T22:21:00.000Z', qualificationType: QUALIFICATION_TYPE,
                    subject: subjectFromSupport(source.support), contentManifestDescriptorSha256: '1'.repeat(64), validationResultDescriptorSha256: '2'.repeat(64),
                    disposition: 'accepted-qualification', acceptedPurpose: 'prerequisite-for-material-shadow-cohort-collection',
                    excludedPurposes: [...qualification.EXCLUDED_PURPOSES], operatingCounts: { ...OPERATING_COUNTS },
                    canonicalProtection: { ...CANONICAL_PROTECTION }, integrity: {},
                }, mutate)
                runCompromisedSemanticCase(caseId, source, {
                    finalManifest: (doc) => sealedMutation(doc, mutate),
                }, () => ({ payloadModel: 'canonical-json', mediaType: 'application/vnd.pocketrisu.qualification-manifest+json', role: 'final-qualification-manifest', referencedSchema: template.schema, value: template }))
            }
        })

        await t.test('registry rollback, descendant, crash-window, and fork states fail through actual CLIs', () => {
            const rollbackCases = [
                ['exact-supersession-rollback', 'supersede', false, 1],
                ['accepted-descendant-rollback', 'accept', true, 1],
                ['revocation-rollback', 'revoke', false, 1],
                ['multi-step-rollback', 'accept', true, 2],
                ['published-descendant-window', 'accept', true, 1],
            ]
            for (const [caseId, action, otherSubject, steps] of rollbackCases) {
                const { workspace, valid, snapshot: a } = validRegisteredWorkspace(caseId, source)
                try {
                    let parent = a
                    const snapshots = [a]
                    for (let index = 0; index < steps; index += 1) {
                        const nextSubject = otherSubject
                            ? { ...subjectFromSupport(source.support), qualificationToolCommit: String(index + 4).repeat(40) }
                            : null
                        parent = appendSnapshot(workspace, parent, {
                            action: index === 0 ? action : 'accept', subject: nextSubject,
                            manifest: String.fromCharCode(98 + index).repeat(64),
                            timestamp: `2026-08-15T22:3${index}:00.000Z`,
                        })
                        snapshots.push(parent)
                    }
                    if (caseId !== 'published-descendant-window') pointCurrent(workspace, steps === 1 ? a : snapshots.at(-2))
                    const retry = runRegistration(workspace, valid.inputs)
                    assert.notEqual(retry.process.exitCode, 0)
                    assert.match(retry.process.stderr, /QUALIFICATION_REGISTRY_HEAD_ROLLBACK/)
                    const result = assertHeadFailure(workspace, source, a.registryDescriptorSha256, 'registry-head-rollback', caseId)
                    assert.match(result.verifier.stderr, /QUALIFICATION_REGISTRY_HEAD_ROLLBACK/)
                } finally { assert.equal(cleanupWorkspace(workspace), true) }
            }

            for (const refBranch of ['B', 'C']) {
                const caseId = `fork-with-ref-${refBranch.toLowerCase()}`
                const { workspace, snapshot: a } = validRegisteredWorkspace(caseId, source)
                try {
                    const b = appendSnapshot(workspace, a, { subject: { ...subjectFromSupport(source.support), qualificationToolCommit: '4'.repeat(40) }, manifest: 'b'.repeat(64), timestamp: '2026-08-15T22:40:00.000Z' })
                    const c = appendSnapshot(workspace, a, { subject: { ...subjectFromSupport(source.support), qualificationToolCommit: '5'.repeat(40) }, manifest: 'c'.repeat(64), timestamp: '2026-08-15T22:40:01.000Z' })
                    pointCurrent(workspace, refBranch === 'B' ? b : c)
                    const result = assertHeadFailure(workspace, source, (refBranch === 'B' ? b : c).registryDescriptorSha256, 'registry-fork', caseId)
                    assert.match(result.verifier.stderr, /QUALIFICATION_REGISTRY_FORK/)
                } finally { assert.equal(cleanupWorkspace(workspace), true) }
            }
        })

        await t.test('registry graph, sequence, current-ref, and trailing-integrity states fail through production preflight', () => {
            const graphCases = [
                ['orphan-snapshot', (registry) => mutateRegistry(registry, (value) => { value.baseRegistryDescriptorSha256 = 'e'.repeat(64) })],
                ['sequence-jump', (registry) => mutateRegistry(registry, (value) => { value.snapshotSequence = 2 })],
                ['sequence-repeat', (registry) => mutateRegistry(registry, (value) => { value.snapshotSequence = 0 })],
                ['negative-sequence', (registry) => mutateRegistry(registry, (value) => { value.snapshotSequence = -1 })],
                ['unsafe-sequence', (registry) => mutateRegistry(registry, (value) => { value.snapshotSequence = Number.MAX_SAFE_INTEGER + 1 })],
            ]
            for (const [caseId, mutate] of graphCases) {
                const { workspace, snapshot: a } = validRegisteredWorkspace(caseId, source)
                try {
                    const candidate = appendRegistryEntry({
                        baseRegistry: a.registry, baseRegistryDescriptorSha256: a.registryDescriptorSha256,
                        storeIdentityHash: loadStoreIdentity(workspace.storeRoot).storeIdentityHash, action: 'accept',
                        subject: { ...subjectFromSupport(source.support), qualificationToolCommit: '4'.repeat(40) },
                        qualificationManifestDescriptorSha256: 'b'.repeat(64), reason: caseId, timestamp: '2026-08-15T22:50:00.000Z',
                    }).registry
                    const invalid = mutate(candidate)
                    const bad = publishAdversarialRegistry(workspace, invalid)
                    assertHeadFailure(workspace, source, a.registryDescriptorSha256, null, caseId)
                } finally { assert.equal(cleanupWorkspace(workspace), true) }
            }

            {
                const caseId = 'genesis-sequence-nonzero'
                const { workspace, snapshot: a } = validRegisteredWorkspace(caseId, source)
                try {
                    const invalidGenesis = mutateRegistry(a.registry, (value) => { value.snapshotSequence = 1 })
                    publishAdversarialRegistry(workspace, invalidGenesis)
                    assertHeadFailure(workspace, source, a.registryDescriptorSha256, null, caseId)
                } finally { assert.equal(cleanupWorkspace(workspace), true) }
            }

            const refModes = ['sequence', 'registry-id', 'store-id', 'missing-snapshot', 'non-snapshot-object', 'wrong-schema', 'wrong-registry-root']
            for (const mode of refModes) {
                const caseId = `current-ref-${mode}`
                const { workspace, snapshot: a } = validRegisteredWorkspace(caseId, source)
                try {
                    const file = path.join(workspace.storeRoot, 'v2/refs/qualification/current.json')
                    const valid = JSON.parse(fs.readFileSync(file, 'utf8'))
                    const invalid = reseal(valid, (ref) => {
                        if (mode === 'sequence') ref.snapshotSequence += 1
                        if (mode === 'registry-id') ref.registryId = 'e'.repeat(64)
                        if (mode === 'store-id') ref.storeIdentityHash = 'd'.repeat(64)
                        if (mode === 'missing-snapshot') ref.registryDescriptorSha256 = 'c'.repeat(64)
                        if (mode === 'non-snapshot-object') {
                            const [object] = publishAny(workspace.storeRoot, [{
                                payloadModel: 'canonical-json', mediaType: 'application/json', role: 'machine-support-authority-environment',
                                referencedSchema: source.support.schema, value: source.support,
                            }])
                            ref.registryDescriptorSha256 = object.descriptorSha256
                        }
                        if (mode === 'wrong-schema') ref.registrySchema = 'wrong-registry-schema'
                        if (mode === 'wrong-registry-root') ref.registryRootSha256 = 'b'.repeat(64)
                    })
                    fs.writeFileSync(file, canonicalJsonBytes(invalid), { mode: 0o600 })
                    assertHeadFailure(workspace, source, a.registryDescriptorSha256, null, caseId)
                } finally { assert.equal(cleanupWorkspace(workspace), true) }
            }

            for (const mode of ['truncated-marker', 'corrupt-payload', 'descriptor-invalid', 'unknown-schema', 'wrong-predecessor', 'wrong-sequence']) {
                const caseId = `invalid-trailing-${mode}`
                const { workspace, snapshot: a } = validRegisteredWorkspace(caseId, source)
                try {
                    const identity = loadStoreIdentity(workspace.storeRoot)
                    if (mode === 'truncated-marker') {
                        const file = path.join(workspace.storeRoot, identity.registryNamespace, qualificationRegistryId(identity.storeIdentityHash), 'snapshots', `${'f'.repeat(64)}.json`)
                        durablePublishExact(file, Buffer.from('{"truncated":'), path.join(workspace.storeRoot, 'v2/tmp'))
                    } else {
                        const candidate = appendRegistryEntry({
                            baseRegistry: a.registry, baseRegistryDescriptorSha256: a.registryDescriptorSha256,
                            storeIdentityHash: identity.storeIdentityHash, action: 'accept',
                            subject: { ...subjectFromSupport(source.support), qualificationToolCommit: '4'.repeat(40) },
                            qualificationManifestDescriptorSha256: 'b'.repeat(64), reason: mode, timestamp: '2026-08-15T22:51:00.000Z',
                        }).registry
                        if (mode === 'wrong-predecessor') publishAdversarialRegistry(workspace, mutateRegistry(candidate, (v) => { v.baseRegistryDescriptorSha256 = 'e'.repeat(64) }))
                        else if (mode === 'wrong-sequence') publishAdversarialRegistry(workspace, mutateRegistry(candidate, (v) => { v.snapshotSequence = 2 }))
                        else {
                            const bad = publishAdversarialRegistry(workspace, candidate)
                            const descriptorPath = bad.object.descriptorPath
                            const payloadPath = bad.object.payloadPath
                            if (mode === 'corrupt-payload') { fs.chmodSync(payloadPath, 0o600); fs.writeFileSync(payloadPath, 'corrupt'); fs.chmodSync(payloadPath, 0o444) }
                            if (mode === 'descriptor-invalid') { fs.chmodSync(descriptorPath, 0o600); fs.writeFileSync(descriptorPath, '{}'); fs.chmodSync(descriptorPath, 0o444) }
                            if (mode === 'unknown-schema') {
                                const descriptor = JSON.parse(fs.readFileSync(descriptorPath, 'utf8'))
                                descriptor.referencedSchema = 'unknown-registry-schema'
                                delete descriptor.integrity
                                const invalidDescriptor = sealDocument(descriptor)
                                fs.chmodSync(descriptorPath, 0o600); fs.writeFileSync(descriptorPath, canonicalJsonBytes(invalidDescriptor)); fs.chmodSync(descriptorPath, 0o444)
                            }
                        }
                    }
                    assertHeadFailure(workspace, source, a.registryDescriptorSha256, null, caseId)
                } finally { assert.equal(cleanupWorkspace(workspace), true) }
            }
        })

        await t.test('self-parent, cycle-shaped, multiple-genesis, and cross-registry states are handled fail closed', () => {
            for (const mode of ['self-parent', 'cycle-shaped']) {
                const { workspace, snapshot: a } = validRegisteredWorkspace(mode, source)
                try {
                    const identity = loadStoreIdentity(workspace.storeRoot)
                    const entries = mode === 'self-parent'
                        ? [['e'.repeat(64), 'e'.repeat(64)]]
                        : [['c'.repeat(64), 'd'.repeat(64)], ['d'.repeat(64), 'c'.repeat(64)]]
                    for (const [digest, predecessor] of entries) {
                        const marker = sealDocument({
                            schema: SNAPSHOT_REF_SCHEMA, storeIdentityHash: identity.storeIdentityHash,
                            registryId: qualificationRegistryId(identity.storeIdentityHash), registrySchema: QUALIFICATION_REGISTRY_SCHEMA,
                            registryDescriptorSha256: digest, snapshotSequence: 1, previousSnapshotSha256: predecessor,
                        })
                        const file = path.join(workspace.storeRoot, identity.registryNamespace, marker.registryId, 'snapshots', `${digest}.json`)
                        durablePublishExact(file, canonicalJsonBytes(marker), path.join(workspace.storeRoot, 'v2/tmp'))
                    }
                    assertHeadFailure(workspace, source, a.registryDescriptorSha256, null, mode)
                } finally { assert.equal(cleanupWorkspace(workspace), true) }
            }

            const { workspace, snapshot: a } = validRegisteredWorkspace('multiple-genesis', source)
            try {
                const identity = loadStoreIdentity(workspace.storeRoot)
                const second = appendRegistryEntry({
                    storeIdentityHash: identity.storeIdentityHash, action: 'accept',
                    subject: { ...subjectFromSupport(source.support), qualificationToolCommit: '4'.repeat(40) },
                    qualificationManifestDescriptorSha256: 'b'.repeat(64), reason: 'second genesis', timestamp: '2026-08-15T22:55:00.000Z',
                }).registry
                publishRegistrySnapshot({ storeRoot: workspace.storeRoot, registry: second, qualificationToolCommit: currentToolCommit(), createdAt: '2026-08-15T22:55:00.000Z' })
                assertHeadFailure(workspace, source, a.registryDescriptorSha256, null, 'multiple-genesis')
            } finally { assert.equal(cleanupWorkspace(workspace), true) }

            const cross = validRegisteredWorkspace('cross-registry-isolation', source)
            try {
                const identity = loadStoreIdentity(cross.workspace.storeRoot)
                const other = path.join(cross.workspace.storeRoot, identity.registryNamespace, 'f'.repeat(64), 'snapshots')
                fs.mkdirSync(other, { recursive: true, mode: 0o700 })
                fs.writeFileSync(path.join(other, 'foreign'), 'foreign registry state', { mode: 0o600 })
                const passing = runPreflight(cross.workspace, expectationFor(source.support))
                assert.equal(requireSuccessfulJson(passing, 'cross-registry isolation preflight').toolchainPilotClosurePassed, true)
                const subjectDirectory = path.join(cross.workspace.storeRoot, identity.registryNamespace, qualificationRegistryId(identity.storeIdentityHash), 'snapshots')
                fs.writeFileSync(path.join(subjectDirectory, 'malformed'), 'malformed subject registry state', { mode: 0o600 })
                assertHeadFailure(cross.workspace, source, cross.snapshot.registryDescriptorSha256, null, 'cross-registry-malformed-subject')
            } finally { assert.equal(cleanupWorkspace(cross.workspace), true) }
            t.diagnostic('full deletion of later snapshots plus rollback without an external witness is outside this local-store-only guarantee')
        })

        await t.test('revocation, diagnostic final, corrupt/missing child, tampered derivation, and quarantine-only cases reject actual preflight', () => {
            const revoked = validRegisteredWorkspace('existing-revoked-entry', source)
            try {
                const b = appendSnapshot(revoked.workspace, revoked.snapshot, { action: 'revoke', manifest: revoked.snapshot.registry.entries[0].qualificationManifestDescriptorSha256 })
                pointCurrent(revoked.workspace, b)
                assertHeadFailure(revoked.workspace, source, b.registryDescriptorSha256, 'revoked-qualification', 'existing-revoked-entry')
            } finally { assert.equal(cleanupWorkspace(revoked.workspace), true) }

            const diagnosticTemplate = sealedMutation({
                schema: QUALIFICATION_MANIFEST_SCHEMA, createdAt: '2026-08-15T23:00:00.000Z', qualificationType: QUALIFICATION_TYPE,
                subject: subjectFromSupport(source.support), contentManifestDescriptorSha256: '1'.repeat(64), validationResultDescriptorSha256: '2'.repeat(64),
                disposition: 'accepted-qualification', acceptedPurpose: 'prerequisite-for-material-shadow-cohort-collection',
                excludedPurposes: [...qualification.EXCLUDED_PURPOSES], operatingCounts: { ...OPERATING_COUNTS },
                canonicalProtection: { ...CANONICAL_PROTECTION }, integrity: {},
            }, (v) => { v.disposition = 'diagnostic' })
            runCompromisedSemanticCase('existing-diagnostic-final', source, {
                finalManifest: (doc) => sealedMutation(doc, (v) => { v.disposition = 'diagnostic' }),
            }, () => ({ payloadModel: 'canonical-json', mediaType: 'application/vnd.pocketrisu.qualification-manifest+json', role: 'final-qualification-manifest', referencedSchema: diagnosticTemplate.schema, value: diagnosticTemplate }), { layerARejects: false })

            for (const mode of ['corrupt', 'missing']) {
                const current = validRegisteredWorkspace(`existing-${mode}-child`, source)
                try {
                    const docs = locateRegisteredDocuments(current.workspace, current.valid.report)
                    const childDescriptor = docs.contentLoaded.document.objects.localReceiptDescriptorSha256
                    const child = loadPublishedObject({ storeRoot: current.workspace.storeRoot, descriptorSha256: childDescriptor, schemaRegistry: fullSchemaRegistry() })
                    if (mode === 'corrupt') { fs.chmodSync(child.payloadPath, 0o600); fs.writeFileSync(child.payloadPath, 'corrupt'); fs.chmodSync(child.payloadPath, 0o444) }
                    else fs.unlinkSync(child.payloadPath)
                    assertHeadFailure(current.workspace, source, current.snapshot.registryDescriptorSha256, null, `existing-${mode}-child`)
                } finally { assert.equal(cleanupWorkspace(current.workspace), true) }
            }

            const quarantineExpectation = expectationFor(source.support)
            const expectationFile = path.join(sourceWorkspace.parent, 'quarantine-expectation.json')
            fs.writeFileSync(expectationFile, canonicalJsonBytes(quarantineExpectation), { mode: 0o600 })
            const quarantinePreflight = runCli(scripts.preflight, ['--store', closureQuarantineRoot, '--expectation', expectationFile, '--subject-root', subjectRoot])
            assertPreflightFalse(quarantinePreflight, 'quarantine-only')
            assert.equal(quarantinePreflight.parsed.reason, 'quarantine-only-evidence')
            records.push(completeRecord('quarantine-only', {
                storeRoot: closureQuarantineRoot,
                mutationLayer: 'quarantine-path',
                preflight: quarantinePreflight,
            }))
        })

        for (const record of records) {
            if (record.cleanupResult === null) record.cleanupResult = 'passed'
            assert.notEqual(record.caseId, undefined)
            assert.equal(record.toolchainPilotClosurePassed, false, record.caseId)
            for (const key of [
                'storeRoot', 'mutationLayer', 'publisherExitCode', 'publisherSignal',
                'publisherStdoutSha256', 'publisherStderrSha256', 'registryUpdated',
                'snapshotCountBefore', 'snapshotCountAfter', 'currentRefBefore', 'currentRefAfter',
                'snapshotsDiscovered', 'snapshotsValidated', 'genesisCount', 'maximalHeadCount',
                'verifiedMaximalHead', 'rollbackDetected', 'forkDetected', 'invalidSnapshotCount',
                'independentVerifierExitCode', 'independentVerifierResult', 'preflightExitCode',
                'preflightParsedResult', 'failureReason', 'cleanupResult',
            ]) assert.equal(Object.prototype.hasOwnProperty.call(record, key), true, `${record.caseId}: missing record ${key}`)
        }
        assert.equal(fs.existsSync(realStoreRoot), false)
        assert.equal(fs.existsSync(disposableRootBase), true)
        t.diagnostic(`negative-case-records=${records.length} recordsSha256=${sha256(canonicalJsonBytes(records.map((record) => ({ caseId: record.caseId, passed: record.toolchainPilotClosurePassed }))))}`)
    } finally {
        assert.equal(cleanupWorkspace(sourceWorkspace), true)
    }
})
