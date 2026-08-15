'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const {
    canonicalJsonBytes,
    loadPublishedObject,
    loadStoreIdentity,
} = require('./qualification-object-store.cjs')
const {
    validateLocalShadowReceipt,
} = require('./toolchain-shadow-local.cjs')
const {
    validateGlobalProjectionReceipt,
} = require('./toolchain-shadow-global.cjs')
const {
    CLOSURE_SCHEMA,
    COMPILED_DECLARATION_SHA256,
    FIXTURE_DECLARATION_SHA256,
    RECIPE_PATH,
    RECIPE_SHA256,
    SUBJECT_IMPLEMENTATION_COMMIT,
    SUPPORT_SCHEMA,
    SYNTHETIC_TARGET_TREE_SHA256,
    schemaRegistry: machineSchemaRegistry,
    validateMachineClosureReceipt,
    validateSupportRecord,
} = require('./toolchain-shadow-qualification.cjs')
const {
    CONTENT_MANIFEST_SCHEMA,
    QUALIFICATION_MANIFEST_SCHEMA,
    QUALIFICATION_REGISTRY_SCHEMA,
    VALIDATION_RESULT_SCHEMA,
    effectiveRegistryEntry,
    resolveVerifiedQualificationRegistryHead,
    registrySchemaRegistry,
    validateContentManifest,
    validateQualificationManifest,
    validateRegistry,
    validateValidationResult,
} = require('./qualification-registry.cjs')

const LOCAL_RECEIPT_SCHEMA = 'patch-toolchain-shadow-local-receipt-v1'
const GLOBAL_RECEIPT_SCHEMA = 'patch-toolchain-shadow-global-projection-v1'

class QualificationVerificationError extends Error {
    constructor(code, message, details = null) {
        super(message)
        this.name = 'QualificationVerificationError'
        this.code = code
        this.details = details
    }
}

function fail(code, message, details = null) {
    throw new QualificationVerificationError(code, message, details)
}

function fullSchemaRegistry() {
    return new Map([
        ...machineSchemaRegistry(),
        ...registrySchemaRegistry(),
        [LOCAL_RECEIPT_SCHEMA, validateLocalShadowReceipt],
        [GLOBAL_RECEIPT_SCHEMA, validateGlobalProjectionReceipt],
    ])
}

function loadObject(storeRoot, descriptorSha256) {
    return loadPublishedObject({ storeRoot, descriptorSha256, schemaRegistry: fullSchemaRegistry() })
}

function assertDescriptor(record, { role, payloadModel, mediaType, schema = undefined }) {
    if (record.descriptor.role !== role || record.descriptor.payloadModel !== payloadModel
        || record.descriptor.mediaType !== mediaType
        || (schema !== undefined && record.descriptor.referencedSchema !== schema)) {
        fail('OBJECT_DESCRIPTOR_ROLE_MISMATCH', `Evidence descriptor ${record.descriptorSha256} has an incompatible role or type`)
    }
}

function independentlyDeriveFixture({ subjectRoot }) {
    if (typeof subjectRoot !== 'string' || subjectRoot.length === 0) {
        fail('SUBJECT_ROOT_REQUIRED', 'Independent fixture verification requires the frozen subject root')
    }
    const child = spawnSync(process.execPath, [
        path.join(__dirname, '..', 'scripts', 'derive-toolchain-shadow-fixture.cjs'),
        '--subject-root', path.resolve(subjectRoot),
    ], {
        cwd: path.join(__dirname, '..'),
        env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
    })
    if (child.error || child.status !== 0 || child.signal !== null || child.stdout.trim() === '') {
        fail('INDEPENDENT_DERIVATION_FAILED', 'Fresh fixture derivation process failed', {
            spawnError: child.error?.message ?? null,
            exitCode: child.status,
            signal: child.signal,
            stderr: child.stderr,
        })
    }
    let result
    try { result = JSON.parse(child.stdout) } catch (error) {
        fail('INDEPENDENT_DERIVATION_FAILED', 'Fresh fixture derivation output is not JSON', { message: error.message })
    }
    const derivation = result.derivation
    if (!Number.isInteger(result.processId) || result.processId <= 0 || result.processId === process.pid
        || result.subjectCommit !== SUBJECT_IMPLEMENTATION_COMMIT || result.subjectClean !== true
        || derivation?.inputDeclarationSha256 !== COMPILED_DECLARATION_SHA256
        || derivation?.recipePath !== RECIPE_PATH
        || derivation?.recipeSha256 !== RECIPE_SHA256
        || derivation?.outputFixtureDeclarationSha256 !== FIXTURE_DECLARATION_SHA256
        || derivation?.outputSyntheticTargetTreeSha256 !== SYNTHETIC_TARGET_TREE_SHA256
        || derivation?.deterministicRederivationMatched !== true) {
        fail('INDEPENDENT_DERIVATION_MISMATCH', 'Fresh fixture derivation differs from the frozen known answer', result)
    }
    return {
        freshProcess: true,
        processId: result.processId,
        subjectCommit: result.subjectCommit,
        subjectClean: true,
        inputDeclarationSha256: derivation.inputDeclarationSha256,
        recipePath: derivation.recipePath,
        recipeSha256: derivation.recipeSha256,
        outputFixtureDeclarationSha256: derivation.outputFixtureDeclarationSha256,
        outputSyntheticTargetTreeSha256: derivation.outputSyntheticTargetTreeSha256,
        publisherFlagTrusted: false,
    }
}

function derivationIdentity(derivation) {
    const { processId: ignored, ...identity } = derivation
    return identity
}

function verifyContentQualification({ storeRoot, contentManifestDescriptorSha256, expectedSubject = null, subjectRoot }) {
    const identity = loadStoreIdentity(storeRoot)
    const contentRecord = loadObject(storeRoot, contentManifestDescriptorSha256)
    assertDescriptor(contentRecord, {
        role: 'qualification-content-manifest',
        payloadModel: 'canonical-json',
        mediaType: 'application/vnd.pocketrisu.qualification-manifest+json',
        schema: CONTENT_MANIFEST_SCHEMA,
    })
    const content = validateContentManifest(contentRecord.document)
    if (expectedSubject !== null && !canonicalJsonBytes(content.subject).equals(canonicalJsonBytes(expectedSubject))) {
        fail('STALE_QUALIFICATION_SUBJECT', 'Content manifest subject differs from the expected frozen subject')
    }
    const supportRecord = loadObject(storeRoot, content.objects.machineSupportDescriptorSha256)
    assertDescriptor(supportRecord, {
        role: 'machine-support-authority-environment',
        payloadModel: 'canonical-json', mediaType: 'application/json', schema: SUPPORT_SCHEMA,
    })
    const support = validateSupportRecord(supportRecord.document)
    const closureRecord = loadObject(storeRoot, content.objects.machineClosureDescriptorSha256)
    assertDescriptor(closureRecord, {
        role: 'machine-closure-receipt',
        payloadModel: 'canonical-json',
        mediaType: 'application/vnd.pocketrisu.toolchain-shadow-pilot-closure+json',
        schema: CLOSURE_SCHEMA,
    })
    const localRecord = loadObject(storeRoot, content.objects.localReceiptDescriptorSha256)
    assertDescriptor(localRecord, {
        role: 'local-synthetic-exact-receipt',
        payloadModel: 'raw-blob', mediaType: 'application/json', schema: LOCAL_RECEIPT_SCHEMA,
    })
    const globalRecord = loadObject(storeRoot, content.objects.globalSyntheticReceiptDescriptorSha256)
    assertDescriptor(globalRecord, {
        role: 'global-synthetic-exact-receipt',
        payloadModel: 'raw-blob', mediaType: 'application/json', schema: GLOBAL_RECEIPT_SCHEMA,
    })
    const localReceipt = validateLocalShadowReceipt(localRecord.document)
    const globalReceipt = validateGlobalProjectionReceipt(globalRecord.document)
    const derivation = independentlyDeriveFixture({ subjectRoot })
    const closure = validateMachineClosureReceipt(closureRecord.document, {
        supportRecord: support,
        localReceipt,
        globalReceipt,
    })
    if (content.objects.authorityEnvironmentDescriptorSha256 !== supportRecord.descriptorSha256
        || closure.qualificationType !== content.qualificationType
        || closure.subject.implementationCommit !== content.subject.implementationCommit
        || closure.subject.qualificationToolCommit !== content.subject.qualificationToolCommit
        || closure.subject.policySha256 !== content.subject.policySha256
        || closure.candidate.contractSha256 !== content.subject.contractSha256
        || closure.candidate.compiledDeclarationSha256 !== content.subject.compiledDeclarationSha256
        || closure.subject.targetCommit !== content.subject.targetCommit
        || closure.subject.targetApplicationTreeSha256 !== content.subject.targetApplicationTreeSha256
        || closure.sourceObjects.localReceiptRawSha256 !== localRecord.descriptor.payloadSha256
        || closure.sourceObjects.localReceiptSemanticSha256 !== localRecord.descriptor.canonicalSemanticSha256
        || closure.sourceObjects.globalSyntheticReceiptRawSha256 !== globalRecord.descriptor.payloadSha256
        || closure.sourceObjects.globalSyntheticReceiptSemanticSha256 !== globalRecord.descriptor.canonicalSemanticSha256
        || support.fixtureDerivation.inputDeclarationSha256 !== derivation.inputDeclarationSha256
        || support.fixtureDerivation.recipePath !== derivation.recipePath
        || support.fixtureDerivation.recipeSha256 !== derivation.recipeSha256
        || support.fixtureDerivation.outputFixtureDeclarationSha256 !== derivation.outputFixtureDeclarationSha256
        || support.fixtureDerivation.outputSyntheticTargetTreeSha256 !== derivation.outputSyntheticTargetTreeSha256
        || localReceipt.declarationSha256 !== derivation.outputFixtureDeclarationSha256
        || globalReceipt.declarationSha256 !== derivation.outputFixtureDeclarationSha256
        || localReceipt.target.applicationTreeSha256 !== derivation.outputSyntheticTargetTreeSha256
        || globalReceipt.target.applicationTreeSha256 !== derivation.outputSyntheticTargetTreeSha256) {
        fail('QUALIFICATION_REFERENCE_MISMATCH', 'Qualification content references incompatible machine evidence')
    }
    const checked = new Set([
        contentManifestDescriptorSha256,
        supportRecord.descriptorSha256,
        closureRecord.descriptorSha256,
        localRecord.descriptorSha256,
        globalRecord.descriptorSha256,
    ])
    const optional = [
        ['closureNarrativeDescriptorSha256', 'closure-narrative', 'text/markdown; charset=utf-8'],
        ['sourceEventDescriptorSha256', 'closure-source-event', 'application/x-ndjson'],
        ['environmentNarrativeDescriptorSha256', 'environment-setup-narrative', 'text/markdown; charset=utf-8'],
    ]
    for (const [key, role, mediaType] of optional) {
        const descriptorSha256 = content.objects[key]
        if (descriptorSha256 === null) continue
        const record = loadObject(storeRoot, descriptorSha256)
        assertDescriptor(record, { role, payloadModel: 'raw-blob', mediaType })
        checked.add(descriptorSha256)
    }
    return {
        identity,
        content,
        support,
        closure,
        localReceipt,
        globalReceipt,
        derivation,
        checkedDescriptors: [...checked].sort(),
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
    }
}

function verifyFinalQualification({ storeRoot, qualificationManifestDescriptorSha256, expectedSubject = null, subjectRoot }) {
    const finalRecord = loadObject(storeRoot, qualificationManifestDescriptorSha256)
    assertDescriptor(finalRecord, {
        role: 'final-qualification-manifest',
        payloadModel: 'canonical-json',
        mediaType: 'application/vnd.pocketrisu.qualification-manifest+json',
        schema: QUALIFICATION_MANIFEST_SCHEMA,
    })
    const finalManifest = validateQualificationManifest(finalRecord.document)
    if (expectedSubject !== null && !canonicalJsonBytes(finalManifest.subject).equals(canonicalJsonBytes(expectedSubject))) {
        fail('STALE_QUALIFICATION_SUBJECT', 'Final manifest subject differs from the expected frozen subject')
    }
    const contentResult = verifyContentQualification({
        storeRoot,
        contentManifestDescriptorSha256: finalManifest.contentManifestDescriptorSha256,
        expectedSubject: finalManifest.subject,
        subjectRoot,
    })
    if (finalManifest.qualificationType !== contentResult.content.qualificationType) {
        fail('QUALIFICATION_TYPE_MISMATCH', 'Final and content manifest qualification types differ')
    }
    const validationRecord = loadObject(storeRoot, finalManifest.validationResultDescriptorSha256)
    assertDescriptor(validationRecord, {
        role: 'independent-qualification-validation',
        payloadModel: 'canonical-json',
        mediaType: 'application/vnd.pocketrisu.qualification-validation+json',
        schema: VALIDATION_RESULT_SCHEMA,
    })
    const validation = validateValidationResult(validationRecord.document)
    if (validation.result !== 'passed'
        || validation.independentVerifier.qualificationToolCommit !== finalManifest.subject.qualificationToolCommit
        || validation.storeIdentityHash !== contentResult.identity.storeIdentityHash
        || validation.contentManifestDescriptorSha256 !== finalManifest.contentManifestDescriptorSha256
        || !canonicalJsonBytes(derivationIdentity(validation.derivation)).equals(canonicalJsonBytes(derivationIdentity(contentResult.derivation)))
        || !contentResult.checkedDescriptors.every((hash) => validation.checkedDescriptors.includes(hash))) {
        fail('INDEPENDENT_VALIDATION_MISMATCH', 'Stored independent validation does not cover the content manifest')
    }
    return {
        ...contentResult,
        finalManifest,
        finalManifestDescriptorSha256: qualificationManifestDescriptorSha256,
        validation,
        validationDescriptorSha256: validationRecord.descriptorSha256,
        checkedDescriptors: [...new Set([
            ...contentResult.checkedDescriptors,
            qualificationManifestDescriptorSha256,
            validationRecord.descriptorSha256,
        ])].sort(),
    }
}

function verifyRegistryAncestry(storeRoot, registryRecord, seen = new Set()) {
    const descriptorSha256 = registryRecord.descriptorSha256
    if (seen.has(descriptorSha256)) fail('CYCLIC_QUALIFICATION_REGISTRY', 'Qualification registry ancestry contains a cycle')
    seen.add(descriptorSha256)
    const registry = validateRegistry(registryRecord.document)
    if (registry.baseRegistryDescriptorSha256 === null) {
        if (registry.entries.length > 1) fail('MISSING_QUALIFICATION_REGISTRY_BASE', 'Multi-entry registry has no durable base snapshot')
        return [descriptorSha256]
    }
    const baseRecord = loadObject(storeRoot, registry.baseRegistryDescriptorSha256)
    assertDescriptor(baseRecord, {
        role: 'qualification-registry-snapshot',
        payloadModel: 'canonical-json',
        mediaType: 'application/vnd.pocketrisu.qualification-registry+json',
        schema: QUALIFICATION_REGISTRY_SCHEMA,
    })
    const base = validateRegistry(baseRecord.document)
    if (base.storeIdentityHash !== registry.storeIdentityHash
        || base.registryId !== registry.registryId
        || registry.snapshotSequence !== base.snapshotSequence + 1
        || base.entries.length + 1 !== registry.entries.length
        || !canonicalJsonBytes(base.entries).equals(canonicalJsonBytes(registry.entries.slice(0, -1)))) {
        fail('BROKEN_QUALIFICATION_REGISTRY_ANCESTRY', 'Qualification registry base is not the exact prior snapshot')
    }
    return [...verifyRegistryAncestry(storeRoot, baseRecord, seen), descriptorSha256]
}

function verifyQualificationRegistry({
    storeRoot,
    registryDescriptorSha256 = null,
    expectedSubject,
    requireCurrentRef = false,
    subjectRoot,
}) {
    const verifiedHead = resolveVerifiedQualificationRegistryHead(storeRoot)
    if (registryDescriptorSha256 !== null
        && registryDescriptorSha256 !== verifiedHead.registryDescriptorSha256) {
        fail('STALE_QUALIFICATION_CURRENT_REF', 'Registry descriptor is not the verified maximal registry head', verifiedHead.metrics)
    }
    registryDescriptorSha256 = verifiedHead.registryDescriptorSha256
    const registryRecord = verifiedHead.snapshotRecords.find((record) => record.descriptorSha256 === registryDescriptorSha256).loaded
    assertDescriptor(registryRecord, {
        role: 'qualification-registry-snapshot',
        payloadModel: 'canonical-json',
        mediaType: 'application/vnd.pocketrisu.qualification-registry+json',
        schema: QUALIFICATION_REGISTRY_SCHEMA,
    })
    const registry = validateRegistry(registryRecord.document)
    const ancestryDescriptors = verifyRegistryAncestry(storeRoot, registryRecord)
    const effective = effectiveRegistryEntry(registry, expectedSubject)
    if (effective.state !== 'accepted' || effective.entry.action === 'revoke') {
        fail(effective.state === 'revoked' ? 'QUALIFICATION_REVOKED' : 'QUALIFICATION_NOT_ACCEPTED', 'No effective accepted qualification exists')
    }
    if (effective.entry.action !== 'accept') {
        fail('QUALIFICATION_SUPERSEDED', 'The latest effective qualification is not a current accepted entry')
    }
    const qualification = verifyFinalQualification({
        storeRoot,
        qualificationManifestDescriptorSha256: effective.entry.qualificationManifestDescriptorSha256,
        expectedSubject,
        subjectRoot,
    })
    const finalManifest = qualification.finalManifest
    if (finalManifest.disposition !== 'accepted-qualification'
        || finalManifest.qualificationType !== effective.entry.qualificationType
        || finalManifest.acceptedPurpose !== effective.entry.acceptedPurpose
        || !canonicalJsonBytes(finalManifest.excludedPurposes).equals(canonicalJsonBytes(effective.entry.excludedPurposes))
        || !canonicalJsonBytes(finalManifest.operatingCounts).equals(canonicalJsonBytes(effective.entry.operatingCounts))) {
        fail('ACCEPTED_QUALIFICATION_MISMATCH', 'Accepted registry entry and final manifest are incompatible')
    }
    return {
        registry,
        registryDescriptorSha256,
        registryRootSha256: registry.registryRootSha256,
        effectiveEntry: effective.entry,
        qualification,
        ancestryDescriptors,
        currentRefVerified: true,
        registryHead: verifiedHead.metrics,
    }
}

function assertQuarantineIsNotAcceptedStore(storeRoot) {
    const resolved = fs.realpathSync(storeRoot)
    if (resolved.includes(`${require('node:path').sep}evidence-quarantine${require('node:path').sep}`)
        || resolved.endsWith(`${require('node:path').sep}evidence-quarantine`)) {
        fail('QUARANTINE_ONLY_EVIDENCE', 'Quarantine cannot be used as an accepted qualification store')
    }
    return true
}

module.exports = {
    GLOBAL_RECEIPT_SCHEMA,
    LOCAL_RECEIPT_SCHEMA,
    QualificationVerificationError,
    assertQuarantineIsNotAcceptedStore,
    fullSchemaRegistry,
    independentlyDeriveFixture,
    verifyContentQualification,
    verifyFinalQualification,
    verifyRegistryAncestry,
    verifyQualificationRegistry,
}
