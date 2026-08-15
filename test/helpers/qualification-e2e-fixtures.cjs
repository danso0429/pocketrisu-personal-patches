'use strict'

const assert = require('node:assert/strict')
const childProcess = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const {
    OBJECT_DESCRIPTOR_SCHEMA,
    canonicalJsonBytes,
    contentAddressPath,
    durablePublishExact,
    loadPublishedObject,
    loadStoreIdentity,
    parseJsonStrict,
    publishEvidenceBatch,
    sha256,
} = require('../../src/qualification-object-store.cjs')
const {
    ACCEPTED_PURPOSE,
    CANONICAL_PROTECTION,
    CONTENT_MANIFEST_SCHEMA,
    OPERATING_COUNTS,
    QUALIFICATION_MANIFEST_SCHEMA,
    QUALIFICATION_REGISTRY_SCHEMA,
    SNAPSHOT_REF_SCHEMA,
    VALIDATION_RESULT_SCHEMA,
    appendRegistryEntry,
    buildContentManifest,
    buildCurrentRef,
    buildQualificationManifest,
    buildValidationResult,
    publishRegistrySnapshot,
    qualificationRegistryId,
    resolveVerifiedQualificationRegistryHead,
    updateCurrentRef,
} = require('../../src/qualification-registry.cjs')
const {
    fullSchemaRegistry,
    independentlyDeriveFixture,
} = require('../../src/qualification-verifier.cjs')
const {
    EXPECTATION_SCHEMA,
    treeIdentity,
} = require('../../src/operating-cohort-preflight.cjs')
const qualification = require('../../src/toolchain-shadow-qualification.cjs')
const { sealDocument } = require('../../src/verification-receipts.cjs')

const repositoryRoot = path.resolve(__dirname, '../..')
const subjectRoot = '/home/ubuntu/nai-studio-2/.worktrees/toolchain-hardening-shadow-pilot'
const targetRoot = '/tmp/pocketrisu-v190-audit'
const quarantineRoot = '/home/ubuntu/.local/share/pocketrisu-patcher/evidence-quarantine'
const closureQuarantineRoot = path.join(quarantineRoot, 'toolchain-shadow-closure-54c8307f87354ba1')
const disposableRootBase = '/home/ubuntu/.local/state/pocketrisu-patcher/qualification-e2e-tests'
const realStoreRoot = '/home/ubuntu/.local/share/pocketrisu-patcher/evidence'
const scripts = Object.freeze({
    initialize: path.join(repositoryRoot, 'scripts/init-qualification-evidence-store.cjs'),
    support: path.join(repositoryRoot, 'scripts/build-toolchain-shadow-closure-support.cjs'),
    register: path.join(repositoryRoot, 'scripts/register-toolchain-shadow-qualification.cjs'),
    verify: path.join(repositoryRoot, 'scripts/verify-qualification-evidence.cjs'),
    preflight: path.join(repositoryRoot, 'scripts/preflight-operating-cohort.cjs'),
})

function currentToolCommit() {
    return childProcess.execFileSync('git', ['--no-pager', '-C', repositoryRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
}

function runProcess(executable, args, options = {}) {
    const childEnvironment = { ...process.env }
    delete childEnvironment.NODE_TEST_CONTEXT
    const result = childProcess.spawnSync(executable, args, {
        cwd: repositoryRoot,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        env: childEnvironment,
        ...options,
    })
    const stdout = result.stdout ?? ''
    const stderr = result.stderr ?? ''
    return {
        command: [executable, ...args],
        spawnError: result.error?.message ?? null,
        signal: result.signal ?? null,
        exitCode: result.status,
        stdout,
        stderr,
        stdoutSha256: sha256(Buffer.from(stdout)),
        stderrSha256: sha256(Buffer.from(stderr)),
        parsed: stdout.trim() === '' ? null : (() => {
            try { return parseJsonStrict(stdout, 'spawned production command output') } catch { return null }
        })(),
    }
}

function runCli(script, args) {
    return runProcess(process.execPath, [script, ...args])
}

function requireSuccessfulJson(result, label) {
    assert.equal(result.spawnError, null, `${label}: spawn error`)
    assert.equal(result.signal, null, `${label}: signal`)
    assert.equal(result.exitCode, 0, `${label}: ${result.stderr}`)
    assert.notEqual(result.stdout.trim(), '', `${label}: empty stdout`)
    assert.notEqual(result.parsed, null, `${label}: unparseable stdout`)
    return result.parsed
}

function ensureBase() {
    fs.mkdirSync(disposableRootBase, { recursive: true, mode: 0o700 })
    fs.chmodSync(disposableRootBase, 0o700)
}

function createWorkspace(label) {
    ensureBase()
    const parent = fs.mkdtempSync(path.join(disposableRootBase, `${label}-`))
    const storeRoot = path.join(parent, 'store')
    const initialized = runCli(scripts.initialize, [
        '--store', storeRoot,
        '--subject-root', subjectRoot,
        '--target-root', targetRoot,
        '--quarantine-root', quarantineRoot,
        '--implementation-root', repositoryRoot,
    ])
    requireSuccessfulJson(initialized, `${label} store initializer`)
    return { label, parent, storeRoot, initialized, cleaned: false }
}

function cleanupWorkspace(workspace) {
    if (!workspace || workspace.cleaned) return true
    fs.rmSync(workspace.parent, { recursive: true, force: true })
    workspace.cleaned = !fs.existsSync(workspace.parent)
    return workspace.cleaned
}

function cloneCleanTool(workspace) {
    const cleanToolRoot = path.join(workspace.parent, 'clean-tool')
    const cloned = runProcess('git', ['clone', '--quiet', repositoryRoot, cleanToolRoot])
    assert.equal(cloned.spawnError, null)
    assert.equal(cloned.signal, null)
    assert.equal(cloned.exitCode, 0, cloned.stderr)
    assert.equal(currentToolCommit(), childProcess.execFileSync('git', ['--no-pager', '-C', cleanToolRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim())
    return cleanToolRoot
}

function buildRealMachineSources(workspace) {
    const cleanToolRoot = cloneCleanTool(workspace)
    const supportFile = path.join(workspace.parent, 'support.json')
    const closureFile = path.join(workspace.parent, 'closure.json')
    const result = runCli(path.join(cleanToolRoot, 'scripts/build-toolchain-shadow-closure-support.cjs'), [
        '--subject-root', subjectRoot,
        '--target-root', targetRoot,
        '--quarantine-root', closureQuarantineRoot,
        '--support-output', supportFile,
        '--closure-output', closureFile,
        '--governance-commit', '49d891b12a51745b9da91bf23105d78869cf8664',
        '--governance-status-version', '12',
        '--temporary-parent', workspace.parent,
    ])
    const report = requireSuccessfulJson(result, 'real support/closure builder')
    assert.equal(report.result, 'passed')
    assert.equal(report.localRouteRerunPerformed, false)
    assert.equal(report.globalProjectionRerunPerformed, false)
    return {
        result,
        report,
        supportFile,
        closureFile,
        supportBytes: fs.readFileSync(supportFile),
        closureBytes: fs.readFileSync(closureFile),
        support: parseJsonStrict(fs.readFileSync(supportFile), 'real support record'),
        closure: parseJsonStrict(fs.readFileSync(closureFile), 'real closure receipt'),
        localBytes: fs.readFileSync(path.join(closureQuarantineRoot, 'local-synthetic-known-answer.json')),
        globalBytes: fs.readFileSync(path.join(closureQuarantineRoot, 'global-synthetic-known-answer.json')),
        cleanToolRoot,
    }
}

function writeInputs(workspace, source, mutations = {}) {
    const support = mutations.support ? mutations.support(structuredClone(source.support)) : structuredClone(source.support)
    const closure = mutations.closure ? mutations.closure(structuredClone(source.closure)) : structuredClone(source.closure)
    const files = {
        support: path.join(workspace.parent, `support-${crypto.randomUUID()}.json`),
        closure: path.join(workspace.parent, `closure-${crypto.randomUUID()}.json`),
        local: path.join(workspace.parent, `local-${crypto.randomUUID()}.json`),
        global: path.join(workspace.parent, `global-${crypto.randomUUID()}.json`),
    }
    fs.writeFileSync(files.support, canonicalJsonBytes(support), { mode: 0o600 })
    fs.writeFileSync(files.closure, canonicalJsonBytes(closure), { mode: 0o600 })
    fs.writeFileSync(files.local, source.localBytes, { mode: 0o600 })
    fs.writeFileSync(files.global, source.globalBytes, { mode: 0o600 })
    return { files, support, closure }
}

function registrationArguments(workspace, inputs, reordered = false) {
    const pairs = reordered
        ? [
            ['--reason', `full-path ${workspace.label}`],
            ['--subject-root', subjectRoot],
            ['--global-synthetic-receipt', inputs.files.global],
            ['--store', workspace.storeRoot],
            ['--local-receipt', inputs.files.local],
            ['--closure', inputs.files.closure],
            ['--support', inputs.files.support],
            ['--tool-root', repositoryRoot],
        ]
        : [
            ['--store', workspace.storeRoot],
            ['--support', inputs.files.support],
            ['--closure', inputs.files.closure],
            ['--local-receipt', inputs.files.local],
            ['--global-synthetic-receipt', inputs.files.global],
            ['--reason', `full-path ${workspace.label}`],
            ['--tool-root', repositoryRoot],
            ['--subject-root', subjectRoot],
        ]
    return pairs.flat()
}

function snapshotCount(storeRoot) {
    const identity = loadStoreIdentity(storeRoot)
    const registryId = qualificationRegistryId(identity.storeIdentityHash)
    const directory = path.join(storeRoot, identity.registryNamespace, registryId, 'snapshots')
    return fs.existsSync(directory) ? fs.readdirSync(directory).length : 0
}

function currentRefBytes(storeRoot) {
    const file = path.join(storeRoot, 'v2/refs/qualification/current.json')
    return fs.existsSync(file) ? fs.readFileSync(file) : null
}

function runRegistration(workspace, inputs, { reordered = false } = {}) {
    const before = currentRefBytes(workspace.storeRoot)
    const snapshotsBefore = snapshotCount(workspace.storeRoot)
    const process = runCli(scripts.register, registrationArguments(workspace, inputs, reordered))
    const after = currentRefBytes(workspace.storeRoot)
    return {
        process,
        registryUpdated: snapshotsBefore !== snapshotCount(workspace.storeRoot),
        snapshotCountBefore: snapshotsBefore,
        snapshotCountAfter: snapshotCount(workspace.storeRoot),
        currentRefBefore: before === null ? null : sha256(before),
        currentRefAfter: after === null ? null : sha256(after),
    }
}

function subjectFromSupport(support) {
    return {
        implementationCommit: qualification.SUBJECT_IMPLEMENTATION_COMMIT,
        qualificationToolCommit: currentToolCommit(),
        policySha256: qualification.POLICY_SHA256,
        contractSha256: qualification.CONTRACT_SHA256,
        compiledDeclarationSha256: qualification.COMPILED_DECLARATION_SHA256,
        targetCommit: qualification.TARGET_COMMIT,
        targetApplicationTreeSha256: qualification.CANONICAL_TARGET_TREE_SHA256,
    }
}

function expectationFor(support, subject = subjectFromSupport(support)) {
    return {
        schema: EXPECTATION_SCHEMA,
        subject,
        compatibility: {
            subjectSchemasSha256: support.sourceIdentity.subjectSchemasSha256,
            qualificationSchemasSha256: support.sourceIdentity.qualificationSchemasSha256,
            localRouteSha256: support.sourceIdentity.localRouteSha256,
            globalProjectionRouteSha256: support.sourceIdentity.globalProjectionRouteSha256,
        },
    }
}

function runPreflight(workspace, expectation) {
    const file = path.join(workspace.parent, `expectation-${crypto.randomUUID()}.json`)
    fs.writeFileSync(file, canonicalJsonBytes(expectation), { mode: 0o600 })
    const before = treeIdentity(workspace.storeRoot)
    const process = runCli(scripts.preflight, [
        '--store', workspace.storeRoot,
        '--expectation', file,
        '--subject-root', subjectRoot,
    ])
    assert.equal(treeIdentity(workspace.storeRoot), before, 'production preflight mutated its store')
    return process
}

function runRegistryVerifier(workspace, descriptorSha256, expectedSubject) {
    const subjectFile = path.join(workspace.parent, `subject-${crypto.randomUUID()}.json`)
    fs.writeFileSync(subjectFile, canonicalJsonBytes(expectedSubject), { mode: 0o600 })
    return runCli(scripts.verify, [
        '--store', workspace.storeRoot,
        '--registry', descriptorSha256,
        '--subject', subjectFile,
        '--require-current-ref',
        '--tool-root', repositoryRoot,
        '--subject-root', subjectRoot,
    ])
}

function reseal(document, mutate) {
    const copy = structuredClone(document)
    delete copy.integrity
    mutate(copy)
    return sealDocument(copy)
}

function permissiveSchemaRegistry() {
    const registry = fullSchemaRegistry()
    for (const schema of [CONTENT_MANIFEST_SCHEMA, VALIDATION_RESULT_SCHEMA, QUALIFICATION_MANIFEST_SCHEMA, QUALIFICATION_REGISTRY_SCHEMA]) {
        registry.set(schema, (document) => document)
    }
    registry.set(qualification.SUPPORT_SCHEMA, (document) => document)
    registry.set(qualification.CLOSURE_SCHEMA, (document) => document)
    return registry
}

function publishAny(storeRoot, entries) {
    return publishEvidenceBatch({
        storeRoot,
        entries,
        schemaRegistry: permissiveSchemaRegistry(),
        publisherToolIdentity: { qualificationToolCommit: currentToolCommit() },
        createdAt: '2026-08-15T21:00:00.000Z',
    }).objects
}

function entryIdentity(entry) {
    const { entryId: ignored, entrySha256: ignoredSha, ...payload } = entry
    return sha256(canonicalJsonBytes(payload))
}

function entryHash(entry) {
    const { entrySha256: ignored, ...payload } = entry
    return sha256(canonicalJsonBytes(payload))
}

function mutateRegistry(registry, mutate) {
    const copy = structuredClone(registry)
    delete copy.integrity
    mutate(copy, copy.entries.at(-1))
    for (const entry of copy.entries) {
        entry.entryId = entryIdentity(entry)
        entry.entrySha256 = entryHash(entry)
    }
    copy.registryRootSha256 = copy.entries.at(-1).entrySha256
    return sealDocument(copy)
}

function fakeValidation({ identity, contentDescriptorSha256, checkedDescriptors }) {
    return buildValidationResult({
        validatedAt: '2026-08-15T21:00:01.000Z',
        qualificationToolCommit: currentToolCommit(),
        storeIdentityHash: identity.storeIdentityHash,
        contentManifestDescriptorSha256: contentDescriptorSha256,
        checkedDescriptors,
        derivation: independentlyDeriveFixture({ subjectRoot }),
        checks: {
            storeIdentityValid: true,
            objectHashesValid: true,
            objectTypesValid: true,
            schemasValid: true,
            manifestReferencesComplete: true,
            receiptsValid: true,
            fixtureDerivationValid: true,
            authorityCompatible: true,
            operatingCountsIsolated: true,
            productionProtectionValid: true,
            quarantineNotAuthority: true,
        },
        failures: [],
    })
}

function publishCompromisedAcceptedChain(workspace, source, mutations = {}) {
    const identity = loadStoreIdentity(workspace.storeRoot)
    let support = structuredClone(source.support)
    let closure = structuredClone(source.closure)
    if (mutations.support) support = mutations.support(support)
    if (mutations.closure) closure = mutations.closure(closure)
    const [supportObject, closureObject, localObject, globalObject] = publishAny(workspace.storeRoot, [
        { payloadModel: 'canonical-json', mediaType: 'application/json', role: 'machine-support-authority-environment', referencedSchema: support.schema, value: support },
        { payloadModel: 'canonical-json', mediaType: 'application/vnd.pocketrisu.toolchain-shadow-pilot-closure+json', role: 'machine-closure-receipt', referencedSchema: closure.schema, value: closure },
        { payloadModel: 'raw-blob', mediaType: 'application/json', role: 'local-synthetic-exact-receipt', referencedSchema: qualification.LOCAL_RECEIPT_SCHEMA ?? 'patch-toolchain-shadow-local-receipt-v1', value: source.localBytes },
        { payloadModel: 'raw-blob', mediaType: 'application/json', role: 'global-synthetic-exact-receipt', referencedSchema: qualification.GLOBAL_RECEIPT_SCHEMA ?? 'patch-toolchain-shadow-global-projection-v1', value: source.globalBytes },
    ])
    const subject = subjectFromSupport(source.support)
    let content = buildContentManifest({
        createdAt: '2026-08-15T21:00:02.000Z',
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
    if (mutations.content) content = mutations.content(content)
    const [contentObject] = publishAny(workspace.storeRoot, [{
        payloadModel: 'canonical-json', mediaType: 'application/vnd.pocketrisu.qualification-manifest+json',
        role: 'qualification-content-manifest', referencedSchema: CONTENT_MANIFEST_SCHEMA, value: content,
    }])
    const validation = fakeValidation({
        identity,
        contentDescriptorSha256: contentObject.descriptorSha256,
        checkedDescriptors: [supportObject, closureObject, localObject, globalObject, contentObject].map((item) => item.descriptorSha256),
    })
    const [validationObject] = publishAny(workspace.storeRoot, [{
        payloadModel: 'canonical-json', mediaType: 'application/vnd.pocketrisu.qualification-validation+json',
        role: 'independent-qualification-validation', referencedSchema: VALIDATION_RESULT_SCHEMA, value: validation,
    }])
    let finalManifest = buildQualificationManifest({
        createdAt: '2026-08-15T21:00:03.000Z',
        subject,
        contentManifestDescriptorSha256: contentObject.descriptorSha256,
        validationResultDescriptorSha256: validationObject.descriptorSha256,
    })
    if (mutations.finalManifest) finalManifest = mutations.finalManifest(finalManifest)
    const [finalObject] = publishAny(workspace.storeRoot, [{
        payloadModel: 'canonical-json', mediaType: 'application/vnd.pocketrisu.qualification-manifest+json',
        role: 'final-qualification-manifest', referencedSchema: QUALIFICATION_MANIFEST_SCHEMA, value: finalManifest,
    }])
    let registry = appendRegistryEntry({
        storeIdentityHash: identity.storeIdentityHash,
        action: 'accept',
        subject,
        qualificationManifestDescriptorSha256: finalObject.descriptorSha256,
        reason: `compromised-store ${workspace.label}`,
        timestamp: '2026-08-15T21:00:04.000Z',
    }).registry
    if (mutations.registry) registry = mutations.registry(registry)
    let registryObject
    if (mutations.registry) {
        ;[registryObject] = publishAny(workspace.storeRoot, [{
            payloadModel: 'canonical-json', mediaType: 'application/vnd.pocketrisu.qualification-registry+json',
            role: 'qualification-registry-snapshot', referencedSchema: QUALIFICATION_REGISTRY_SCHEMA,
            sizeLimitClass: 'registry-snapshot', value: registry,
        }])
        const marker = sealDocument({
            schema: SNAPSHOT_REF_SCHEMA,
            storeIdentityHash: identity.storeIdentityHash,
            registryId: qualificationRegistryId(identity.storeIdentityHash),
            registrySchema: QUALIFICATION_REGISTRY_SCHEMA,
            registryDescriptorSha256: registryObject.descriptorSha256,
            snapshotSequence: registry.snapshotSequence,
            previousSnapshotSha256: registry.baseRegistryDescriptorSha256,
        })
        const markerPath = path.join(workspace.storeRoot, identity.registryNamespace, marker.registryId, 'snapshots', `${registryObject.descriptorSha256}.json`)
        fs.mkdirSync(path.dirname(markerPath), { recursive: true, mode: 0o700 })
        durablePublishExact(markerPath, canonicalJsonBytes(marker), path.join(workspace.storeRoot, 'v2/tmp'))
    } else {
        registryObject = publishRegistrySnapshot({
            storeRoot: workspace.storeRoot,
            registry,
            qualificationToolCommit: currentToolCommit(),
            createdAt: '2026-08-15T21:00:04.000Z',
        })
    }
    updateCurrentRef(workspace.storeRoot, buildCurrentRef({
        storeIdentityHash: identity.storeIdentityHash,
        registryId: qualificationRegistryId(identity.storeIdentityHash),
        registryDescriptorSha256: registryObject.descriptorSha256,
        snapshotSequence: registry.snapshotSequence,
        registryRootSha256: registry.registryRootSha256,
        updatedAt: '2026-08-15T21:00:05.000Z',
    }))
    return {
        identity, support, closure, subject, content, contentObject, validation,
        finalManifest, finalObject, registry, registryObject,
    }
}

function registerValidChain(workspace, source, { reordered = false } = {}) {
    const inputs = writeInputs(workspace, source)
    const registration = runRegistration(workspace, inputs, { reordered })
    const report = requireSuccessfulJson(registration.process, `${workspace.label} registration`)
    const expectation = expectationFor(source.support)
    const preflight = runPreflight(workspace, expectation)
    const preflightReport = requireSuccessfulJson(preflight, `${workspace.label} preflight`)
    return { inputs, registration, report, expectation, preflight, preflightReport }
}

function invalidCaseRecord({ caseId, workspace, publisher, chain, verifier, preflight, failureReason }) {
    let metrics = null
    try { metrics = resolveVerifiedQualificationRegistryHead(workspace.storeRoot).metrics } catch (error) { metrics = error.details ?? null }
    return {
        caseId,
        storeRoot: workspace.storeRoot,
        mutationLayer: 'publisher-and-compromised-store',
        publisherExitCode: publisher?.process.exitCode ?? null,
        publisherSignal: publisher?.process.signal ?? null,
        publisherStdoutSha256: publisher?.process.stdoutSha256 ?? null,
        publisherStderrSha256: publisher?.process.stderrSha256 ?? null,
        registryUpdated: publisher?.registryUpdated ?? false,
        snapshotCountBefore: publisher?.snapshotCountBefore ?? 0,
        snapshotCountAfter: publisher?.snapshotCountAfter ?? 0,
        currentRefBefore: publisher?.currentRefBefore ?? null,
        currentRefAfter: publisher?.currentRefAfter ?? null,
        snapshotsDiscovered: metrics?.snapshotsDiscovered ?? null,
        snapshotsValidated: metrics?.snapshotsValidated ?? null,
        genesisCount: metrics?.genesisCount ?? null,
        maximalHeadCount: metrics?.maximalHeadCount ?? null,
        verifiedMaximalHead: metrics?.verifiedMaximalHeadSha256 ?? null,
        rollbackDetected: metrics?.rollbackDetected ?? false,
        forkDetected: metrics?.forkDetected ?? false,
        invalidSnapshotCount: metrics?.invalidSnapshotCount ?? null,
        independentVerifierExitCode: verifier.exitCode,
        independentVerifierResult: verifier.parsed,
        preflightExitCode: preflight.exitCode,
        preflightParsedResult: preflight.parsed,
        toolchainPilotClosurePassed: preflight.parsed?.toolchainPilotClosurePassed ?? null,
        failureReason: failureReason ?? preflight.parsed?.reason ?? verifier.stderr,
        cleanupResult: null,
        chain,
    }
}

module.exports = {
    ACCEPTED_PURPOSE,
    CANONICAL_PROTECTION,
    OPERATING_COUNTS,
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
    treeIdentity,
    writeInputs,
    buildRealMachineSources,
}
