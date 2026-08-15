'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const {
    canonicalJsonBytes,
    initializeQualificationStore,
    publishEvidenceBatch,
    sha256,
} = require('../src/qualification-object-store.cjs')
const {
    appendRegistryEntry,
    buildContentManifest,
    buildCurrentRef,
    buildQualificationManifest,
    buildValidationResult,
    publishRegistrySnapshot,
    updateCurrentRef,
} = require('../src/qualification-registry.cjs')
const {
    assertQuarantineIsNotAcceptedStore,
    fullSchemaRegistry,
    independentlyDeriveFixture,
    verifyContentQualification: verifyContentQualificationActual,
    verifyFinalQualification: verifyFinalQualificationActual,
    verifyQualificationRegistry: verifyQualificationRegistryActual,
} = require('../src/qualification-verifier.cjs')
const {
    BUILD_BOUNDARY_CLASS,
    CANONICAL_TARGET_TREE_SHA256,
    COMPILED_DECLARATION_SHA256,
    CONTRACT_SHA256,
    POLICY_SHA256,
    QUARANTINE_MANIFEST_SHA256,
    SUBJECT_IMPLEMENTATION_COMMIT,
    TARGET_COMMIT,
    buildMachineClosureReceipt,
    buildSupportRecord,
    deriveFixtureIdentity,
    evaluateFocusedTestExecution,
    validateReceiptPair,
} = require('../src/toolchain-shadow-qualification.cjs')
const { runChild } = require('../src/verification-evidence.cjs')
const { sealDocument } = require('../src/verification-receipts.cjs')

const repositoryRoot = path.resolve(__dirname, '..')
const subjectRoot = '/home/ubuntu/nai-studio-2/.worktrees/toolchain-hardening-shadow-pilot'
const targetRoot = '/tmp/pocketrisu-v190-audit'
const quarantineRoot = '/home/ubuntu/.local/share/pocketrisu-patcher/evidence-quarantine/toolchain-shadow-closure-54c8307f87354ba1'
const localBytes = fs.readFileSync(path.join(quarantineRoot, 'local-synthetic-known-answer.json'))
const globalBytes = fs.readFileSync(path.join(quarantineRoot, 'global-synthetic-known-answer.json'))
const receipts = validateReceiptPair(localBytes, globalBytes)
const TOOL_COMMIT = '3'.repeat(40)
const CREATED_AT = '2026-08-15T10:00:00.000Z'
const fixtureParent = path.resolve(repositoryRoot, '../..')

function verifyContentQualification(options) {
    return verifyContentQualificationActual({ ...options, subjectRoot })
}

function verifyFinalQualification(options) {
    return verifyFinalQualificationActual({ ...options, subjectRoot })
}

function verifyQualificationRegistry(options) {
    return verifyQualificationRegistryActual({ ...options, subjectRoot })
}

function expectCode(action, codes) {
    const accepted = Array.isArray(codes) ? codes : [codes]
    assert.throws(action, (error) => accepted.includes(error?.code), `expected one of ${accepted.join(', ')}`)
}

function storeFixture(t) {
    const parent = fs.mkdtempSync(path.join(fixtureParent, '.qualification-verifier-test-'))
    t.after(() => fs.rmSync(parent, { recursive: true, force: true }))
    const storeRoot = path.join(parent, 'store')
    const identity = initializeQualificationStore({
        storeRoot,
        forbiddenRoots: [repositoryRoot, subjectRoot, targetRoot, path.dirname(quarantineRoot)],
        createdAt: CREATED_AT,
    })
    return { parent, storeRoot, identity }
}

function focusedExecution() {
    return {
        exitCode: 0,
        signal: null,
        spawnError: null,
        outputError: null,
        stdout: 'TAP version 13\n1..7\n# tests 7\n# pass 7\n# fail 0\n',
        stderr: '',
    }
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

function supportRecord() {
    return buildSupportRecord({
        recordedAt: CREATED_AT,
        authority: {
            governanceRepository: 'danso0429/patch-verification-governance',
            governanceCommit: '49d891b12a51745b9da91bf23105d78869cf8664',
            governanceStatusVersion: 12,
            subjectImplementationCommit: SUBJECT_IMPLEMENTATION_COMMIT,
            subjectBranch: 'codex/toolchain-hardening-shadow-pilot',
            qualificationToolCommit: TOOL_COMMIT,
            qualificationToolClean: true,
            policySha256: POLICY_SHA256,
        },
        sourceIdentity: {
            sourcePreSha256: '1'.repeat(64), sourcePostSha256: '1'.repeat(64),
            catalogSha256: '2'.repeat(64), subjectSchemasSha256: '3'.repeat(64),
            qualificationSchemasSha256: '4'.repeat(64), localRouteSha256: '5'.repeat(64),
            globalProjectionRouteSha256: '6'.repeat(64), contractSha256: CONTRACT_SHA256,
            compiledDeclarationSha256: COMPILED_DECLARATION_SHA256,
        },
        targetIdentity: {
            role: 'canonical-audited-target', commit: TARGET_COMMIT,
            applicationTreeSha256: CANONICAL_TARGET_TREE_SHA256,
            targetPreSha256: '7'.repeat(64), targetPostSha256: '7'.repeat(64),
        },
        environment: {
            admittedBoundary: { ...BUILD_BOUNDARY_CLASS }, libcVersionRuntime: '2.39',
            pnpmExecutable: '/isolated/task/node_modules/pnpm/bin/pnpm.cjs',
            pnpmExecutableSha256: '8'.repeat(64),
            provisioning: {
                method: 'unique-task-scoped-temporary-installation',
                command: { executable: 'npm', args: ['install', 'pnpm@10.34.1'] },
                installStdoutSha256: '9'.repeat(64), installStderrSha256: 'a'.repeat(64),
                installExitCode: 0, repositoryMutationAllowed: false,
                lockfileMutationAllowed: false, cleanupRequired: true,
            },
        },
        fixtureDerivation: deriveFixtureIdentity(subjectRoot),
        receiptValidation: {
            quarantineManifestRawSha256: QUARANTINE_MANIFEST_SHA256,
            quarantineAuthoritative: false,
            local: {
                ...receiptIdentity(localBytes, receipts.localReceipt, 'synthetic-known-answer'),
                localMasks: 2, boundaryClasses: 4, expectedExecutions: 8,
                processedExecutions: 8, freshIsolation: true,
            },
            globalSynthetic: {
                ...receiptIdentity(globalBytes, receipts.globalReceipt, 'synthetic-projection'),
                sourceKind: 'synthetic-projection', processedMasks: 4096, mismatches: 0,
                canonicalGlobalExhaustiveExecuted: false,
            },
            pairLinked: true,
        },
        focusedTests: evaluateFocusedTestExecution(focusedExecution()),
        integrityChecks: {
            subjectCleanBefore: true, subjectCleanAfter: true, sourcePrePostMatched: true,
            targetPrePostMatched: true, repositoryFilesUnchanged: true, lockfileUnchanged: true,
            targetClean: true, receiptIntegrityPassed: true,
        },
    })
}

function publish(storeRoot, identity, entries) {
    return publishEvidenceBatch({
        storeRoot,
        entries,
        schemaRegistry: fullSchemaRegistry(),
        publisherToolIdentity: { qualificationToolCommit: TOOL_COMMIT },
        createdAt: CREATED_AT,
    }).objects
}

function createAcceptedQualification(t, { finalDisposition = 'accepted-qualification' } = {}) {
    const { parent, storeRoot, identity } = storeFixture(t)
    const support = supportRecord()
    const closure = buildMachineClosureReceipt({
        supportRecord: support,
        localReceipt: receipts.localReceipt,
        globalReceipt: receipts.globalReceipt,
        recordedAt: '2026-08-15T10:00:01.000Z',
    })
    const [supportObject, closureObject, localObject, globalObject] = publish(storeRoot, identity, [
        { payloadModel: 'canonical-json', mediaType: 'application/json', role: 'machine-support-authority-environment', referencedSchema: support.schema, value: support },
        { payloadModel: 'canonical-json', mediaType: 'application/vnd.pocketrisu.toolchain-shadow-pilot-closure+json', role: 'machine-closure-receipt', referencedSchema: closure.schema, value: closure },
        { payloadModel: 'raw-blob', mediaType: 'application/json', role: 'local-synthetic-exact-receipt', referencedSchema: receipts.localReceipt.schema, value: localBytes },
        { payloadModel: 'raw-blob', mediaType: 'application/json', role: 'global-synthetic-exact-receipt', referencedSchema: receipts.globalReceipt.schema, value: globalBytes },
    ])
    const subject = {
        implementationCommit: SUBJECT_IMPLEMENTATION_COMMIT,
        qualificationToolCommit: TOOL_COMMIT,
        policySha256: POLICY_SHA256,
        contractSha256: CONTRACT_SHA256,
        compiledDeclarationSha256: COMPILED_DECLARATION_SHA256,
        targetCommit: TARGET_COMMIT,
        targetApplicationTreeSha256: CANONICAL_TARGET_TREE_SHA256,
    }
    const content = buildContentManifest({
        createdAt: CREATED_AT,
        subject,
        objects: {
            machineClosureDescriptorSha256: closureObject.descriptorSha256,
            machineSupportDescriptorSha256: supportObject.descriptorSha256,
            authorityEnvironmentDescriptorSha256: supportObject.descriptorSha256,
            localReceiptDescriptorSha256: localObject.descriptorSha256,
            globalSyntheticReceiptDescriptorSha256: globalObject.descriptorSha256,
            closureNarrativeDescriptorSha256: null,
            sourceEventDescriptorSha256: null,
            environmentNarrativeDescriptorSha256: null,
        },
    })
    const [contentObject] = publish(storeRoot, identity, [{
        payloadModel: 'canonical-json', mediaType: 'application/vnd.pocketrisu.qualification-manifest+json',
        role: 'qualification-content-manifest', referencedSchema: content.schema, value: content,
    }])
    const contentVerification = verifyContentQualification({
        storeRoot, contentManifestDescriptorSha256: contentObject.descriptorSha256, expectedSubject: subject,
    })
    const validation = buildValidationResult({
        validatedAt: '2026-08-15T10:00:02.000Z', qualificationToolCommit: TOOL_COMMIT,
        storeIdentityHash: identity.storeIdentityHash,
        contentManifestDescriptorSha256: contentObject.descriptorSha256,
        checkedDescriptors: contentVerification.checkedDescriptors,
        checks: contentVerification.checks,
        derivation: contentVerification.derivation,
    })
    const [validationObject] = publish(storeRoot, identity, [{
        payloadModel: 'canonical-json', mediaType: 'application/vnd.pocketrisu.qualification-validation+json',
        role: 'independent-qualification-validation', referencedSchema: validation.schema, value: validation,
    }])
    const final = buildQualificationManifest({
        createdAt: '2026-08-15T10:00:03.000Z', subject,
        contentManifestDescriptorSha256: contentObject.descriptorSha256,
        validationResultDescriptorSha256: validationObject.descriptorSha256,
        disposition: finalDisposition,
    })
    const [finalObject] = publish(storeRoot, identity, [{
        payloadModel: 'canonical-json', mediaType: 'application/vnd.pocketrisu.qualification-manifest+json',
        role: 'final-qualification-manifest', referencedSchema: final.schema, value: final,
    }])
    const appended = appendRegistryEntry({
        storeIdentityHash: identity.storeIdentityHash, action: 'accept', subject,
        qualificationManifestDescriptorSha256: finalObject.descriptorSha256,
        reason: 'accepted qualification fixture', timestamp: '2026-08-15T10:00:04.000Z',
    })
    const registryObject = publishRegistrySnapshot({
        storeRoot, registry: appended.registry, qualificationToolCommit: TOOL_COMMIT,
        createdAt: '2026-08-15T10:00:04.000Z',
    })
    updateCurrentRef(storeRoot, buildCurrentRef({
        storeIdentityHash: identity.storeIdentityHash,
        registryId: appended.registry.registryId,
        registryDescriptorSha256: registryObject.descriptorSha256,
        snapshotSequence: appended.registry.snapshotSequence,
        registryRootSha256: appended.registry.registryRootSha256,
        updatedAt: '2026-08-15T10:00:05.000Z',
    }))
    return {
        parent, storeRoot, identity, subject, content, contentObject, supportObject, closureObject,
        localObject, globalObject, validation, validationObject, finalObject, registry: appended.registry, registryObject,
    }
}

test('valid three-stage qualification and current registry verify without optional narrative', (t) => {
    const fixture = createAcceptedQualification(t)
    const final = verifyFinalQualification({
        storeRoot: fixture.storeRoot,
        qualificationManifestDescriptorSha256: fixture.finalObject.descriptorSha256,
        expectedSubject: fixture.subject,
    })
    assert.equal(final.content.objects.closureNarrativeDescriptorSha256, null)
    const verified = verifyQualificationRegistry({
        storeRoot: fixture.storeRoot, expectedSubject: fixture.subject, requireCurrentRef: true,
    })
    assert.equal(verified.effectiveEntry.action, 'accept')
    assert.equal(verified.registryHead.currentRefSnapshotSha256, fixture.registryObject.descriptorSha256)
    assert.equal(verified.registryHead.verifiedMaximalHeadSha256, fixture.registryObject.descriptorSha256)
    assert.equal(verified.registryHead.currentRefSequence, 0)
    assert.equal(verified.registryHead.verifiedMaximalHeadSequence, 0)
    assert.equal(verified.registryHead.snapshotsDiscovered, 1)
    assert.equal(verified.registryHead.snapshotsValidated, 1)
    assert.equal(verified.registryHead.genesisCount, 1)
    assert.equal(verified.registryHead.maximalHeadCount, 1)
    assert.equal(verified.registryHead.rollbackDetected, false)
    assert.equal(verified.registryHead.forkDetected, false)
    assert.equal(verified.registryHead.invalidSnapshotCount, 0)
    assert.deepEqual(verified.effectiveEntry.operatingCounts, {
        materialOperatingCohort: false, stableRelease: false,
        productionDefectYield: false, candidateOperatingSample: false,
    })
})

test('accepted registry rejects every non-accepted final manifest disposition', (t) => {
    for (const disposition of ['diagnostic', 'incomplete', 'invalid', 'negative', 'superseded']) {
        const fixture = createAcceptedQualification(t, { finalDisposition: disposition })
        expectCode(() => verifyQualificationRegistry({
            storeRoot: fixture.storeRoot,
            expectedSubject: fixture.subject,
            requireCurrentRef: true,
        }), 'ACCEPTED_QUALIFICATION_MISMATCH')
    }
})

test('a latest supersession is not a current accepted qualification', (t) => {
    const fixture = createAcceptedQualification(t)
    const superseded = appendRegistryEntry({
        baseRegistry: fixture.registry,
        baseRegistryDescriptorSha256: fixture.registryObject.descriptorSha256,
        storeIdentityHash: fixture.identity.storeIdentityHash,
        action: 'supersede',
        subject: fixture.subject,
        qualificationManifestDescriptorSha256: fixture.finalObject.descriptorSha256,
        reason: 'superseded current fixture',
        timestamp: '2026-08-15T10:12:00.000Z',
    })
    const registryObject = publishRegistrySnapshot({
        storeRoot: fixture.storeRoot,
        registry: superseded.registry,
        qualificationToolCommit: TOOL_COMMIT,
        createdAt: '2026-08-15T10:12:00.000Z',
    })
    updateCurrentRef(fixture.storeRoot, buildCurrentRef({
        storeIdentityHash: fixture.identity.storeIdentityHash,
        registryId: superseded.registry.registryId,
        registryDescriptorSha256: registryObject.descriptorSha256,
        snapshotSequence: superseded.registry.snapshotSequence,
        registryRootSha256: superseded.registry.registryRootSha256,
        updatedAt: '2026-08-15T10:12:01.000Z',
    }))
    expectCode(() => verifyQualificationRegistry({
        storeRoot: fixture.storeRoot,
        expectedSubject: fixture.subject,
        requireCurrentRef: true,
    }), 'QUALIFICATION_SUPERSEDED')
})

test('missing machine closure is rejected even when a narrative object exists', (t) => {
    const fixture = createAcceptedQualification(t)
    const [narrative] = publish(fixture.storeRoot, fixture.identity, [{
        payloadModel: 'raw-blob', mediaType: 'text/markdown; charset=utf-8',
        role: 'closure-narrative', referencedSchema: null, value: Buffer.from('# supporting only\n'),
    }])
    const content = buildContentManifest({
        createdAt: CREATED_AT, subject: fixture.subject,
        objects: {
            ...fixture.content.objects,
            machineClosureDescriptorSha256: 'f'.repeat(64),
            closureNarrativeDescriptorSha256: narrative.descriptorSha256,
        },
    })
    const [record] = publish(fixture.storeRoot, fixture.identity, [{
        payloadModel: 'canonical-json', mediaType: 'application/vnd.pocketrisu.qualification-manifest+json',
        role: 'qualification-content-manifest', referencedSchema: content.schema, value: content,
    }])
    expectCode(() => verifyContentQualification({
        storeRoot: fixture.storeRoot, contentManifestDescriptorSha256: record.descriptorSha256,
        expectedSubject: fixture.subject,
    }), 'ENOENT')
})

test('corrupt child and publisher-success claims cannot override independent verification', (t) => {
    const fixture = createAcceptedQualification(t)
    const payload = fixture.localObject.payloadPath
    fs.chmodSync(payload, 0o600)
    fs.writeFileSync(payload, Buffer.from('corrupt'))
    fs.chmodSync(payload, 0o444)
    expectCode(() => verifyQualificationRegistry({
        storeRoot: fixture.storeRoot, expectedSubject: fixture.subject, requireCurrentRef: true,
        publisherReportedSuccess: true,
    }), 'PAYLOAD_HASH_MISMATCH')
})

test('stored validation must come from the exact qualification tool commit', (t) => {
    const fixture = createAcceptedQualification(t)
    const changed = structuredClone(fixture.validation)
    delete changed.integrity
    changed.independentVerifier.qualificationToolCommit = 'e'.repeat(40)
    const [changedValidation] = publish(fixture.storeRoot, fixture.identity, [{
        payloadModel: 'canonical-json', mediaType: 'application/vnd.pocketrisu.qualification-validation+json',
        role: 'independent-qualification-validation', referencedSchema: changed.schema, value: sealDocument(changed),
    }])
    const changedFinal = buildQualificationManifest({
        createdAt: '2026-08-15T10:00:06.000Z', subject: fixture.subject,
        contentManifestDescriptorSha256: fixture.contentObject.descriptorSha256,
        validationResultDescriptorSha256: changedValidation.descriptorSha256,
    })
    const [changedFinalObject] = publish(fixture.storeRoot, fixture.identity, [{
        payloadModel: 'canonical-json', mediaType: 'application/vnd.pocketrisu.qualification-manifest+json',
        role: 'final-qualification-manifest', referencedSchema: changedFinal.schema, value: changedFinal,
    }])
    expectCode(() => verifyFinalQualification({
        storeRoot: fixture.storeRoot,
        qualificationManifestDescriptorSha256: changedFinalObject.descriptorSha256,
        expectedSubject: fixture.subject,
    }), 'INDEPENDENT_VALIDATION_MISMATCH')
})

test('stale implementation, policy, contract, declaration, and target subjects fail closed', (t) => {
    const fixture = createAcceptedQualification(t)
    for (const [key, value] of [
        ['implementationCommit', 'f'.repeat(40)],
        ['policySha256', 'f'.repeat(64)],
        ['contractSha256', 'f'.repeat(64)],
        ['compiledDeclarationSha256', 'f'.repeat(64)],
        ['targetCommit', 'f'.repeat(40)],
        ['targetApplicationTreeSha256', 'f'.repeat(64)],
    ]) {
        expectCode(() => verifyQualificationRegistry({
            storeRoot: fixture.storeRoot,
            expectedSubject: { ...fixture.subject, [key]: value },
            requireCurrentRef: true,
        }), 'QUALIFICATION_NOT_ACCEPTED')
    }
})

test('revoked current evidence is rejected while immutable accepted history remains', (t) => {
    const fixture = createAcceptedQualification(t)
    const revoked = appendRegistryEntry({
        baseRegistry: fixture.registry,
        baseRegistryDescriptorSha256: fixture.registryObject.descriptorSha256,
        storeIdentityHash: fixture.identity.storeIdentityHash,
        action: 'revoke', subject: fixture.subject,
        qualificationManifestDescriptorSha256: fixture.finalObject.descriptorSha256,
        reason: 'revoked fixture', timestamp: '2026-08-15T10:01:00.000Z',
    })
    const revokedObject = publishRegistrySnapshot({
        storeRoot: fixture.storeRoot, registry: revoked.registry,
        qualificationToolCommit: TOOL_COMMIT, createdAt: '2026-08-15T10:01:00.000Z',
    })
    updateCurrentRef(fixture.storeRoot, buildCurrentRef({
        storeIdentityHash: fixture.identity.storeIdentityHash,
        registryId: revoked.registry.registryId,
        registryDescriptorSha256: revokedObject.descriptorSha256,
        snapshotSequence: revoked.registry.snapshotSequence,
        registryRootSha256: revoked.registry.registryRootSha256,
        updatedAt: '2026-08-15T10:01:01.000Z',
    }))
    expectCode(() => verifyQualificationRegistry({
        storeRoot: fixture.storeRoot, expectedSubject: fixture.subject, requireCurrentRef: true,
    }), 'QUALIFICATION_REVOKED')
    assert.equal(fs.existsSync(fixture.registryObject.payloadPath), true)
})

test('registry ancestry rejects a snapshot whose base is not its exact prefix', (t) => {
    const fixture = createAcceptedQualification(t)
    const otherSubject = { ...fixture.subject, policySha256: 'e'.repeat(64) }
    const otherBase = appendRegistryEntry({
        storeIdentityHash: fixture.identity.storeIdentityHash,
        action: 'accept', subject: otherSubject,
        qualificationManifestDescriptorSha256: fixture.finalObject.descriptorSha256,
        reason: 'unrelated base', timestamp: '2026-08-15T10:01:50.000Z',
    })
    const otherBaseObject = publishRegistrySnapshot({
        storeRoot: fixture.storeRoot, registry: otherBase.registry,
        qualificationToolCommit: TOOL_COMMIT, createdAt: '2026-08-15T10:01:50.000Z',
    })
    const divergent = appendRegistryEntry({
        baseRegistry: fixture.registry,
        baseRegistryDescriptorSha256: fixture.registryObject.descriptorSha256,
        storeIdentityHash: fixture.identity.storeIdentityHash,
        action: 'accept', subject: otherSubject,
        qualificationManifestDescriptorSha256: fixture.finalObject.descriptorSha256,
        reason: 'divergent subject', timestamp: '2026-08-15T10:02:00.000Z',
    })
    const brokenRegistry = structuredClone(divergent.registry)
    delete brokenRegistry.integrity
    brokenRegistry.baseRegistryDescriptorSha256 = otherBaseObject.descriptorSha256
    const divergentObject = publishRegistrySnapshot({
        storeRoot: fixture.storeRoot, registry: sealDocument(brokenRegistry),
        qualificationToolCommit: TOOL_COMMIT, createdAt: '2026-08-15T10:02:00.000Z',
    })
    expectCode(() => verifyQualificationRegistry({
        storeRoot: fixture.storeRoot, registryDescriptorSha256: divergentObject.descriptorSha256,
        expectedSubject: fixture.subject,
    }), 'BROKEN_QUALIFICATION_REGISTRY_ANCESTRY')
})

test('quarantine paths cannot become accepted merely because they contain expected bytes', () => {
    expectCode(() => assertQuarantineIsNotAcceptedStore(quarantineRoot), 'QUARANTINE_ONLY_EVIDENCE')
})

test('independent fixture derivation runs in a distinct process and binds full hashes', () => {
    const result = independentlyDeriveFixture({ subjectRoot })
    assert.equal(result.freshProcess, true)
    assert.notEqual(result.processId, process.pid)
    assert.equal(result.publisherFlagTrusted, false)
    assert.equal(result.inputDeclarationSha256, COMPILED_DECLARATION_SHA256)
    assert.equal(result.outputFixtureDeclarationSha256, '6fd01efbc4f46fd9176f4385c4656b465e1b63a9eb623e1273dbb0fe5e76db59')
    assert.equal(result.recipeSha256, '506947855af39ebec2c61ffc69c8e66e9920d13fc4333a6da1f3a7c3ea2b94ed')
})

test('fresh-process verifier independently rejects a stale expected subject', async (t) => {
    const fixture = createAcceptedQualification(t)
    const subjectFile = path.join(fixture.parent, 'stale-subject.json')
    fs.writeFileSync(subjectFile, canonicalJsonBytes({ ...fixture.subject, policySha256: 'f'.repeat(64) }))
    const freshVerifier = [
        "const fs=require('node:fs')",
        `const verifier=require(${JSON.stringify(path.join(repositoryRoot, 'src/qualification-verifier.cjs'))})`,
        'const subject=JSON.parse(fs.readFileSync(process.argv[3]))',
        "try { verifier.verifyQualificationRegistry({storeRoot:process.argv[1],registryDescriptorSha256:process.argv[2],expectedSubject:subject,requireCurrentRef:true,subjectRoot:process.argv[4]}); process.exit(0) } catch(error) { process.stderr.write(String(error.code)); process.exit(7) }",
    ].join(';')
    const result = await runChild(process.execPath, [
        '-e', freshVerifier,
        fixture.storeRoot,
        fixture.registryObject.descriptorSha256,
        subjectFile,
        subjectRoot,
    ], { cwd: repositoryRoot, maxOutputBytes: 4 * 1024 * 1024 })
    assert.equal(result.spawnError, null)
    assert.equal(result.outputError, null)
    assert.equal(result.signal, null)
    assert.equal(typeof result.exitCode, 'number')
    assert.equal(result.exitCode, 7)
})

test('qualification publication leaves the legacy operating object namespace unchanged', (t) => {
    const { storeRoot } = createAcceptedQualification(t)
    assert.equal(fs.existsSync(path.join(storeRoot, 'objects')), false)
})
