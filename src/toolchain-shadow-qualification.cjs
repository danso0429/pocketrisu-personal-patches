'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
    canonicalJsonBytes,
    parseJsonStrict,
    sha256,
} = require('./qualification-object-store.cjs')
const {
    captureInputFreeze,
    compareInputFreeze,
    contentTreeDescriptor,
    jsonSha256,
    runChild,
} = require('./verification-evidence.cjs')
const {
    canonicalJson,
    sealDocument,
    verifyDocumentIntegrity,
} = require('./verification-receipts.cjs')
const {
    loadToolchainShadowDeclaration,
} = require('./toolchain-shadow-contract.cjs')
const {
    createToolchainKnownAnswerTarget,
} = require('./toolchain-shadow-known-answer.cjs')
const {
    BUILD_BOUNDARY_CLASS,
    validateBuildBoundary,
} = require('./toolchain-shadow-boundaries.cjs')
const {
    validateLocalShadowReceipt,
} = require('./toolchain-shadow-local.cjs')
const {
    validateGlobalProjectionReceipt,
} = require('./toolchain-shadow-global.cjs')

const SUPPORT_SCHEMA = 'patch-toolchain-shadow-pilot-closure-support-v1'
const CLOSURE_SCHEMA = 'toolchain-shadow-pilot-closure-receipt-v1'
const QUALIFICATION_TYPE = 'toolchain-hardening-shadow-pilot-closure'
const SUBJECT_IMPLEMENTATION_COMMIT = '54c8307f87354ba14f6f94b3344cc228cfdea1f7'
const POLICY_SHA256 = '356dccb9438853cdb3cd7a7847385dc0072da7eeccb10c6f3ba838590918b3a2'
const CONTRACT_SHA256 = '4ea28240b2bcaa846e718ea0d075cb30c6816a8e7d0c5e7e3364ff6fa7fa577f'
const COMPILED_DECLARATION_SHA256 = '55a0c3f60f170871a2d40135588c5945b8a3e2098aaab25747db30f4ad07db4a'
const FIXTURE_DECLARATION_SHA256 = '6fd01efbc4f46fd9176f4385c4656b465e1b63a9eb623e1273dbb0fe5e76db59'
const CANONICAL_TARGET_TREE_SHA256 = 'c7be2eab4313422d1ae0c199094fd53cce12d0aa73a8ce7a3b6a61d623d822c3'
const SYNTHETIC_TARGET_TREE_SHA256 = '575b83f54b46873b2d3c77b8354b5a39cb518c2a7a1d5cce203b7c8a7d255841'
const TARGET_COMMIT = '85a65f3137b45c8de4a8d21a9887be213b1ac3fc'
const LOCAL_RECEIPT_SHA256 = 'c9b801164f2641f53be7c968377cbf2ff46cd8f16770fca4c9bfac62d83befc2'
const GLOBAL_RECEIPT_SHA256 = 'e404735b50d44b3b4eb444d17b82dc74a7aa5015b2d2a56cee48aaeb32e54184'
const QUARANTINE_MANIFEST_SHA256 = '51bfd91b3ac80ffb9d3c997630ea801611c1ae550e29a85556d28fa4610377db'
const RECIPE_PATH = 'src/toolchain-shadow-known-answer.cjs'
const RECIPE_VERSION = 'synthetic-toolchain-shadow-known-target-v1'
const RECIPE_SHA256 = '506947855af39ebec2c61ffc69c8e66e9920d13fc4333a6da1f3a7c3ea2b94ed'
const LOCAL_ROUTE_FILES = Object.freeze([
    'contracts/toolchain-hardening-shadow-v1.json',
    'scripts/run-toolchain-shadow-mask.cjs',
    'src/toolchain-shadow-boundaries.cjs',
    'src/toolchain-shadow-contract.cjs',
    'src/toolchain-shadow-local.cjs',
    'src/toolchain-shadow-projection.cjs',
])
const GLOBAL_ROUTE_FILES = Object.freeze([
    'scripts/run-toolchain-global-projection.cjs',
    'scripts/verify-all-combinations.cjs',
    'src/toolchain-shadow-evidence.cjs',
    'src/toolchain-shadow-global.cjs',
])
const FOCUSED_TEST_FILES = Object.freeze([
    'test/toolchain-shadow-contract.test.cjs',
    'test/toolchain-shadow-boundaries.test.cjs',
])
const EXCLUDED_PURPOSES = Object.freeze([
    'canonical-mask-skipping',
    'c1-relaxation',
    'material-operating-cohort-count',
    'production-admission',
    'production-certificate',
    'production-defect-yield',
    'production-routing',
    'stable-release',
])
const REQUIRED_INTEGRITY_CHECK_KEYS = Object.freeze([
    'subjectCleanBefore',
    'subjectCleanAfter',
    'sourcePrePostMatched',
    'targetPrePostMatched',
    'repositoryFilesUnchanged',
    'lockfileUnchanged',
    'targetClean',
    'receiptIntegrityPassed',
])
const REQUIRED_RECEIPT_CHECK_KEYS = Object.freeze([
    'authorityCompatible',
    'environmentBoundarySatisfied',
    'fixtureDerivationMatched',
    'focusedAdversarialTestsPassed',
    'freshIsolationEvidencePassed',
    'localCoveragePassed',
    'localRoutePassed',
    'receiptIntegrityPassed',
    'sourceTargetIntegrityPassed',
    'syntheticLocalGlobalComparisonPassed',
])
const SHA256_PATTERN = /^[0-9a-f]{64}$/

class ToolchainQualificationError extends Error {
    constructor(code, message, details = null) {
        super(message)
        this.name = 'ToolchainQualificationError'
        this.code = code
        this.details = details
    }
}

function fail(code, message, details = null) {
    throw new ToolchainQualificationError(code, message, details)
}

function exactKeys(value, expected, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_MACHINE_RECORD', `${label} must be an object`)
    const actual = Object.keys(value).sort()
    const wanted = [...expected].sort()
    if (canonicalJson(actual) !== canonicalJson(wanted)) fail('INVALID_MACHINE_RECORD', `${label} keys differ`, { actual, expected: wanted })
}

function validateRequiredTrueChecks(value, requiredKeys, label, errorCode) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        fail(errorCode, `${label} must be a plain own-property object`)
    }
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
        fail(errorCode, `${label} must not inherit check values`)
    }
    const actualKeys = Object.keys(value).sort()
    const expectedKeys = [...requiredKeys].sort()
    if (canonicalJson(actualKeys) !== canonicalJson(expectedKeys)) {
        fail(errorCode, `${label} keys differ`, { actual: actualKeys, expected: expectedKeys })
    }
    for (const key of requiredKeys) {
        if (!Object.prototype.hasOwnProperty.call(value, key) || value[key] !== true) {
            fail(errorCode, `${label}.${key} must be the literal Boolean true`)
        }
    }
    return value
}

async function gitOutput(root, args, { trim = true } = {}) {
    const result = await runChild('git', ['--no-pager', '-C', root, ...args], {
        env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
        maxOutputBytes: 16 * 1024 * 1024,
    })
    if (result.spawnError !== null || result.outputError !== null || result.exitCode !== 0 || result.signal !== null) {
        fail('GIT_IDENTITY_FAILED', 'Git identity command failed', result)
    }
    return trim ? result.stdout.trim() : result.stdout
}

function filesIdentity(root, relativeFiles) {
    const files = [...relativeFiles].sort().map((relative) => {
        const absolute = path.join(root, relative)
        if (!fs.statSync(absolute).isFile()) fail('IDENTITY_FILE_MISSING', `Identity file is missing: ${relative}`)
        return { path: relative, bytes: fs.statSync(absolute).size, sha256: sha256(fs.readFileSync(absolute)) }
    })
    return { files, rootSha256: sha256(canonicalJsonBytes(files)) }
}

function schemaSetIdentity(root) {
    const relatives = fs.readdirSync(path.join(root, 'schemas'))
        .filter((name) => name.endsWith('.schema.json'))
        .map((name) => `schemas/${name}`)
        .sort()
    return filesIdentity(root, relatives)
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

function validateQuarantineManifest(bytes, localBytes, globalBytes) {
    if (sha256(bytes) !== QUARANTINE_MANIFEST_SHA256) fail('QUARANTINE_MANIFEST_HASH_MISMATCH', 'Quarantine manifest bytes changed')
    const manifest = parseJsonStrict(bytes, 'quarantine manifest')
    if (manifest.schema !== 'toolchain-shadow-closure-quarantine-v1'
        || manifest.authoritative !== false || manifest.acceptedQualification !== false
        || manifest.countsAsMaterialCohort !== false || manifest.countsAsStableRelease !== false
        || manifest.countsAsProductionDefectYield !== false || manifest.countsAsCandidateOperatingSample !== false) {
        fail('INVALID_QUARANTINE_MANIFEST', 'Quarantine manifest could promote preserved source evidence')
    }
    const objects = new Map(manifest.objects.map((entry) => [entry.id, entry]))
    if (objects.get('local-synthetic-known-answer')?.sha256 !== sha256(localBytes)
        || objects.get('local-synthetic-known-answer')?.bytes !== localBytes.length
        || objects.get('global-synthetic-known-answer')?.sha256 !== sha256(globalBytes)
        || objects.get('global-synthetic-known-answer')?.bytes !== globalBytes.length) {
        fail('QUARANTINE_OBJECT_MISMATCH', 'Quarantine manifest does not bind the supplied receipts')
    }
    return manifest
}

function validateReceiptPair(localBytes, globalBytes) {
    if (sha256(localBytes) !== LOCAL_RECEIPT_SHA256) fail('LOCAL_RECEIPT_HASH_MISMATCH', 'Local synthetic receipt exact bytes changed')
    if (sha256(globalBytes) !== GLOBAL_RECEIPT_SHA256) fail('GLOBAL_RECEIPT_HASH_MISMATCH', 'Global synthetic receipt exact bytes changed')
    const localReceipt = validateLocalShadowReceipt(parseJsonStrict(localBytes, 'local synthetic receipt'))
    const globalReceipt = validateGlobalProjectionReceipt(parseJsonStrict(globalBytes, 'Global synthetic receipt'))
    if (localReceipt.declarationSha256 !== FIXTURE_DECLARATION_SHA256
        || globalReceipt.declarationSha256 !== FIXTURE_DECLARATION_SHA256
        || localReceipt.target.applicationTreeSha256 !== SYNTHETIC_TARGET_TREE_SHA256
        || globalReceipt.target.applicationTreeSha256 !== SYNTHETIC_TARGET_TREE_SHA256) {
        fail('FIXTURE_RECEIPT_IDENTITY_MISMATCH', 'Synthetic receipts bind another fixture')
    }
    if (globalReceipt.localReceiptPayloadSha256 !== localReceipt.integrity.payloadSha256) {
        fail('LOCAL_GLOBAL_RECEIPT_LINK_MISMATCH', 'Global synthetic receipt does not bind the local receipt payload')
    }
    if (canonicalJson(localReceipt.coverage) !== canonicalJson({
        localMasks: 2, boundaryClasses: 4, expectedExecutions: 8, processedExecutions: 8,
    })) fail('INCOMPLETE_LOCAL_COVERAGE', 'Local synthetic receipt domain is not 2 × 4 = 8')
    if (canonicalJson(globalReceipt.coverage) !== canonicalJson({
        rawMasks: 4096,
        processedMasks: 4096,
        candidateOffMasks: 2048,
        candidateOnMasks: 2048,
        orderedMasksSha256: globalReceipt.coverage.orderedMasksSha256,
    }) || globalReceipt.comparison.mismatches !== 0) {
        fail('INCOMPLETE_GLOBAL_PROJECTION', 'Global synthetic projection is incomplete or mismatched')
    }
    return { localReceipt, globalReceipt }
}

function deriveFixtureIdentity(subjectRoot) {
    const recipeBytes = fs.readFileSync(path.join(subjectRoot, RECIPE_PATH))
    const fixture = createToolchainKnownAnswerTarget(subjectRoot)
    try {
        const outputDeclarationSha256 = fixture.compiled.declarationSha256
        const outputTargetTreeSha256 = fixture.compiled.declaration.target.applicationTreeSha256
        assertFixtureDerivation(outputDeclarationSha256, outputTargetTreeSha256)
        return {
            recipePath: RECIPE_PATH,
            recipeSha256: sha256(recipeBytes),
            recipeVersion: RECIPE_VERSION,
            inputDeclarationSha256: COMPILED_DECLARATION_SHA256,
            outputFixtureDeclarationSha256: outputDeclarationSha256,
            knownAnswerExpectedDeclarationSha256: FIXTURE_DECLARATION_SHA256,
            outputSyntheticTargetTreeSha256: outputTargetTreeSha256,
            knownAnswerExpectedTargetTreeSha256: SYNTHETIC_TARGET_TREE_SHA256,
            deterministicRederivationMatched: true,
            canonicalTargetRole: 'audited-pocketrisu-1.9.0-target',
            syntheticTargetRole: 'nonmaterial-known-answer-fixture',
            supportedConclusions: [
                'fresh-local-route-known-answer',
                'local-coverage-known-answer',
                'synthetic-local-global-projection-comparison',
            ],
            unsupportedConclusions: [
                'canonical-global-exhaustive-execution',
                'material-operating-cohort',
                'production-admission',
            ],
        }
    } finally {
        fs.rmSync(fixture.root, { recursive: true, force: true })
    }
}

function assertFixtureDerivation(observedDeclarationSha256, observedTargetTreeSha256) {
    if (!SHA256_PATTERN.test(observedDeclarationSha256 ?? '') || !SHA256_PATTERN.test(observedTargetTreeSha256 ?? '')
        || observedDeclarationSha256 !== FIXTURE_DECLARATION_SHA256
        || observedTargetTreeSha256 !== SYNTHETIC_TARGET_TREE_SHA256) {
        fail('CLOSURE_RERUN_REQUIRED', 'Deterministic fixture derivation no longer matches the closure receipts', {
            expectedDeclarationSha256: FIXTURE_DECLARATION_SHA256,
            observedDeclarationSha256,
            expectedTargetTreeSha256: SYNTHETIC_TARGET_TREE_SHA256,
            observedTargetTreeSha256,
        })
    }
    return true
}

function parseTapSummary(stdout) {
    const value = (name) => {
        const matches = [...stdout.matchAll(new RegExp(`^# ${name} (\\d+)$`, 'gm'))]
        return matches.length === 0 ? null : Number(matches.at(-1)[1])
    }
    return { tests: value('tests'), passed: value('pass'), failed: value('fail') }
}

function evaluateFocusedTestExecution(execution) {
    const parsed = execution.stdout ? parseTapSummary(execution.stdout) : { tests: null, passed: null, failed: null }
    const accepted = execution.spawnError === null
        && execution.outputError === null
        && execution.exitCode === 0
        && execution.signal === null
        && execution.stdout.length > 0
        && parsed.tests !== null && parsed.tests > 0
        && parsed.passed === parsed.tests && parsed.failed === 0
    if (!accepted) {
        fail('FOCUSED_TESTS_FAILED', 'Focused adversarial tests did not produce a complete passing result', {
            exitCode: execution.exitCode,
            signal: execution.signal,
            spawnError: execution.spawnError,
            outputError: execution.outputError,
            stdoutBytes: Buffer.byteLength(execution.stdout ?? ''),
            stderrBytes: Buffer.byteLength(execution.stderr ?? ''),
            parsed,
        })
    }
    return {
        executable: process.execPath,
        args: ['--test', '--test-reporter=tap', ...FOCUSED_TEST_FILES],
        exitCode: execution.exitCode,
        signal: execution.signal,
        spawnError: null,
        outputError: null,
        stdoutSha256: sha256(execution.stdout),
        stderrSha256: sha256(execution.stderr),
        stdoutBytes: Buffer.byteLength(execution.stdout),
        stderrBytes: Buffer.byteLength(execution.stderr),
        parsed,
        result: 'passed',
    }
}

async function runFocusedTests(subjectRoot, env) {
    const execution = await runChild(process.execPath, [
        '--test', '--test-reporter=tap', ...FOCUSED_TEST_FILES,
    ], { cwd: subjectRoot, env, maxOutputBytes: 32 * 1024 * 1024 })
    return evaluateFocusedTestExecution(execution)
}

async function observeExactPnpm(pnpmExecutable, provisioning) {
    const absolute = fs.realpathSync(path.resolve(pnpmExecutable))
    const result = await runChild(absolute, ['--version'], { maxOutputBytes: 1024 * 1024 })
    if (result.spawnError !== null || result.outputError !== null || result.exitCode !== 0
        || result.signal !== null || result.stdout.trim() === '' || result.stderr !== '') {
        fail('PNPM_OBSERVATION_FAILED', 'Exact pnpm version observation failed', result)
    }
    const header = process.report?.getReport()?.header ?? {}
    const observed = validateBuildBoundary({
        id: `toolchain:${process.platform}-${process.arch}-${header.glibcVersionRuntime ? 'glibc' : 'unknown-libc'}-node-${process.version.slice(1)}-pnpm-${result.stdout.trim()}`,
        nodeVersion: process.version,
        platform: process.platform,
        architecture: process.arch,
        libc: header.glibcVersionRuntime ? 'glibc' : 'unknown',
        pnpmVersion: result.stdout.trim(),
    })
    if (provisioning.method !== 'unique-task-scoped-temporary-installation'
        || provisioning.repositoryMutationAllowed !== false
        || provisioning.lockfileMutationAllowed !== false
        || provisioning.cleanupRequired !== true) {
        fail('INVALID_PNPM_PROVISIONING', 'pnpm provisioning contract is incomplete')
    }
    return {
        admittedBoundary: observed,
        libcVersionRuntime: header.glibcVersionRuntime ?? null,
        pnpmExecutable: absolute,
        pnpmExecutableSha256: sha256(fs.readFileSync(absolute)),
        provisioning,
    }
}

async function provisionExactPnpm({ temporaryParent = os.tmpdir() } = {}) {
    const root = fs.mkdtempSync(path.join(temporaryParent, 'qualification-pnpm-10.34.1-'))
    const args = [
        'install', '--prefix', root, '--no-package-lock', '--ignore-scripts',
        '--no-audit', '--no-fund', 'pnpm@10.34.1',
    ]
    const result = await runChild('npm', args, { maxOutputBytes: 32 * 1024 * 1024 })
    if (result.spawnError !== null || result.outputError !== null || result.exitCode !== 0 || result.signal !== null) {
        fail('PNPM_PROVISIONING_FAILED', 'Task-scoped pnpm provisioning failed; temporary root retained', {
            root, args, result,
        })
    }
    const executable = path.join(root, 'node_modules/.bin/pnpm')
    if (!fs.existsSync(executable)) fail('PNPM_PROVISIONING_FAILED', 'Task-scoped pnpm executable is missing', { root })
    return {
        root,
        executable,
        binDirectory: path.dirname(executable),
        receipt: {
            method: 'unique-task-scoped-temporary-installation',
            command: { executable: 'npm', args },
            installStdoutSha256: sha256(result.stdout),
            installStderrSha256: sha256(result.stderr),
            installExitCode: result.exitCode,
            repositoryMutationAllowed: false,
            lockfileMutationAllowed: false,
            cleanupRequired: true,
        },
    }
}

function validateCanonicalProtection(protection) {
    if (canonicalJson(protection) !== canonicalJson({
        canonicalGate: 'Global Exhaustive',
        productionClass: 'G',
        shadowClass: 'B',
        productionCertificatesIssued: 0,
        canonicalMasksSkipped: 0,
        productionStateMigrated: false,
        c1RelaxationAuthorized: false,
        materialCohortCounted: false,
        stableReleaseCounted: false,
        productionDefectYieldCounted: false,
        candidateOperatingSampleCounted: false,
    })) fail('CANONICAL_PROTECTION_WEAKENED', 'Qualification machine record weakens canonical protection')
    return protection
}

function validateSupportRecord(record) {
    if (!verifyDocumentIntegrity(record) || record.schema !== SUPPORT_SCHEMA) {
        fail('INVALID_SUPPORT_RECORD', 'Support record schema or integrity is invalid')
    }
    exactKeys(record, [
        'schema', 'recordedAt', 'authority', 'sourceIdentity', 'targetIdentity', 'environment',
        'fixtureDerivation', 'receiptValidation', 'focusedTests', 'integrityChecks',
        'canonicalProtection', 'integrity',
    ], 'support record')
    validateRequiredTrueChecks(
        record.integrityChecks,
        REQUIRED_INTEGRITY_CHECK_KEYS,
        'support integrity checks',
        'INVALID_SUPPORT_RECORD',
    )
    const sourceHashes = [
        record.sourceIdentity.sourcePreSha256, record.sourceIdentity.sourcePostSha256,
        record.sourceIdentity.catalogSha256, record.sourceIdentity.subjectSchemasSha256,
        record.sourceIdentity.qualificationSchemasSha256, record.sourceIdentity.localRouteSha256,
        record.sourceIdentity.globalProjectionRouteSha256,
    ]
    if (record.authority.governanceRepository !== 'danso0429/patch-verification-governance'
        || record.authority.governanceCommit !== '49d891b12a51745b9da91bf23105d78869cf8664'
        || record.authority.governanceStatusVersion !== 12
        || record.authority.subjectImplementationCommit !== SUBJECT_IMPLEMENTATION_COMMIT
        || record.authority.subjectBranch !== 'codex/toolchain-hardening-shadow-pilot'
        || !/^[0-9a-f]{40}$/.test(record.authority.qualificationToolCommit ?? '')
        || record.authority.qualificationToolClean !== true
        || record.authority.policySha256 !== POLICY_SHA256
        || !sourceHashes.every((value) => SHA256_PATTERN.test(value ?? ''))
        || record.sourceIdentity.sourcePreSha256 !== record.sourceIdentity.sourcePostSha256
        || record.sourceIdentity.contractSha256 !== CONTRACT_SHA256
        || record.sourceIdentity.compiledDeclarationSha256 !== COMPILED_DECLARATION_SHA256
        || record.targetIdentity.role !== 'canonical-audited-target'
        || record.targetIdentity.commit !== TARGET_COMMIT
        || record.targetIdentity.applicationTreeSha256 !== CANONICAL_TARGET_TREE_SHA256
        || !SHA256_PATTERN.test(record.targetIdentity.targetPreSha256 ?? '')
        || record.targetIdentity.targetPreSha256 !== record.targetIdentity.targetPostSha256
        || record.fixtureDerivation.recipePath !== RECIPE_PATH
        || record.fixtureDerivation.recipeSha256 !== RECIPE_SHA256
        || record.fixtureDerivation.recipeVersion !== RECIPE_VERSION
        || record.fixtureDerivation.inputDeclarationSha256 !== COMPILED_DECLARATION_SHA256
        || record.fixtureDerivation.knownAnswerExpectedDeclarationSha256 !== FIXTURE_DECLARATION_SHA256
        || record.fixtureDerivation.outputFixtureDeclarationSha256 !== FIXTURE_DECLARATION_SHA256
        || record.fixtureDerivation.knownAnswerExpectedTargetTreeSha256 !== SYNTHETIC_TARGET_TREE_SHA256
        || record.fixtureDerivation.outputSyntheticTargetTreeSha256 !== SYNTHETIC_TARGET_TREE_SHA256
        || record.fixtureDerivation.deterministicRederivationMatched !== true
        || record.fixtureDerivation.canonicalTargetRole !== 'audited-pocketrisu-1.9.0-target'
        || record.fixtureDerivation.syntheticTargetRole !== 'nonmaterial-known-answer-fixture'
        || record.receiptValidation.quarantineManifestRawSha256 !== QUARANTINE_MANIFEST_SHA256
        || record.receiptValidation.quarantineAuthoritative !== false
        || record.receiptValidation.local.rawSha256 !== LOCAL_RECEIPT_SHA256
        || record.receiptValidation.globalSynthetic.rawSha256 !== GLOBAL_RECEIPT_SHA256
        || !SHA256_PATTERN.test(record.receiptValidation.local.semanticSha256 ?? '')
        || !SHA256_PATTERN.test(record.receiptValidation.globalSynthetic.semanticSha256 ?? '')
        || record.receiptValidation.globalSynthetic.sourceKind !== 'synthetic-projection'
        || record.receiptValidation.globalSynthetic.canonicalGlobalExhaustiveExecuted !== false
        || record.receiptValidation.pairLinked !== true
        || record.receiptValidation.local.expectedExecutions !== 8
        || record.receiptValidation.local.processedExecutions !== 8
        || record.receiptValidation.local.freshIsolation !== true
        || record.receiptValidation.globalSynthetic.processedMasks !== 4096
        || record.receiptValidation.globalSynthetic.mismatches !== 0
        || canonicalJson(record.focusedTests.args) !== canonicalJson(['--test', '--test-reporter=tap', ...FOCUSED_TEST_FILES])
        || record.focusedTests.executable !== process.execPath
        || record.focusedTests.spawnError !== null || record.focusedTests.outputError !== null
        || record.focusedTests.exitCode !== 0 || record.focusedTests.signal !== null
        || !SHA256_PATTERN.test(record.focusedTests.stdoutSha256 ?? '')
        || !SHA256_PATTERN.test(record.focusedTests.stderrSha256 ?? '')
        || record.focusedTests.result !== 'passed'
        || record.focusedTests.parsed.tests <= 0
        || record.focusedTests.parsed.passed !== record.focusedTests.parsed.tests
        || record.focusedTests.parsed.failed !== 0
        || record.integrityChecks.subjectCleanBefore !== true
        || record.integrityChecks.subjectCleanAfter !== true
        || record.integrityChecks.sourcePrePostMatched !== true
        || record.integrityChecks.targetPrePostMatched !== true
        || record.integrityChecks.repositoryFilesUnchanged !== true
        || record.integrityChecks.lockfileUnchanged !== true
        || record.integrityChecks.targetClean !== true
        || record.integrityChecks.receiptIntegrityPassed !== true) {
        fail('INVALID_SUPPORT_RECORD', 'Support record has missing or incompatible machine facts')
    }
    validateBuildBoundary(record.environment.admittedBoundary)
    if (!SHA256_PATTERN.test(record.environment.pnpmExecutableSha256 ?? '')
        || record.environment.provisioning?.method !== 'unique-task-scoped-temporary-installation'
        || record.environment.provisioning?.repositoryMutationAllowed !== false
        || record.environment.provisioning?.lockfileMutationAllowed !== false
        || record.environment.provisioning?.cleanupRequired !== true) {
        fail('INVALID_SUPPORT_RECORD', 'Support record has invalid environment provenance')
    }
    validateCanonicalProtection(record.canonicalProtection)
    return record
}

function buildSupportRecord({
    recordedAt,
    authority,
    sourceIdentity,
    targetIdentity,
    environment,
    fixtureDerivation,
    receiptValidation,
    focusedTests,
    integrityChecks,
}) {
    const record = sealDocument({
        schema: SUPPORT_SCHEMA,
        recordedAt,
        authority,
        sourceIdentity,
        targetIdentity,
        environment,
        fixtureDerivation,
        receiptValidation,
        focusedTests,
        integrityChecks,
        canonicalProtection: {
            canonicalGate: 'Global Exhaustive',
            productionClass: 'G',
            shadowClass: 'B',
            productionCertificatesIssued: 0,
            canonicalMasksSkipped: 0,
            productionStateMigrated: false,
            c1RelaxationAuthorized: false,
            materialCohortCounted: false,
            stableReleaseCounted: false,
            productionDefectYieldCounted: false,
            candidateOperatingSampleCounted: false,
        },
    })
    return validateSupportRecord(record)
}

function validateMachineClosureReceipt(receipt, { supportRecord, localReceipt, globalReceipt }) {
    if (!verifyDocumentIntegrity(receipt) || receipt.schema !== CLOSURE_SCHEMA) {
        fail('INVALID_MACHINE_CLOSURE', 'Machine closure receipt schema or integrity is invalid')
    }
    validateSupportRecord(supportRecord)
    validateLocalShadowReceipt(localReceipt)
    validateGlobalProjectionReceipt(globalReceipt)
    exactKeys(receipt, [
        'schema', 'recordedAt', 'result', 'qualificationType', 'subject', 'candidate',
        'environmentBoundary', 'fixtureDerivation', 'observations', 'sourceObjects',
        'checks', 'acceptedPurpose', 'excludedPurposes', 'canonicalProtection', 'integrity',
    ], 'machine closure receipt')
    validateRequiredTrueChecks(
        receipt.checks,
        REQUIRED_RECEIPT_CHECK_KEYS,
        'machine closure checks',
        'INVALID_MACHINE_CLOSURE',
    )
    if (receipt.result !== 'passed'
        || receipt.qualificationType !== QUALIFICATION_TYPE
        || receipt.subject.implementationCommit !== SUBJECT_IMPLEMENTATION_COMMIT
        || receipt.subject.policySha256 !== POLICY_SHA256
        || receipt.candidate.contractSha256 !== CONTRACT_SHA256
        || receipt.candidate.compiledDeclarationSha256 !== COMPILED_DECLARATION_SHA256
        || receipt.candidate.productionClass !== 'G' || receipt.candidate.shadowClass !== 'B'
        || receipt.fixtureDerivation.fixtureDeclarationSha256 !== FIXTURE_DECLARATION_SHA256
        || receipt.observations.localExpectedExecutions !== 8
        || receipt.observations.localProcessedExecutions !== 8
        || receipt.observations.globalSyntheticProcessedMasks !== 4096
        || receipt.observations.syntheticMismatches !== 0
        || receipt.sourceObjects.supportPayloadSha256 !== supportRecord.integrity.payloadSha256
        || receipt.sourceObjects.localReceiptRawSha256 !== LOCAL_RECEIPT_SHA256
        || receipt.sourceObjects.globalSyntheticReceiptRawSha256 !== GLOBAL_RECEIPT_SHA256
        || receipt.acceptedPurpose !== 'prerequisite-for-material-shadow-cohort-collection'
        || canonicalJson(receipt.excludedPurposes) !== canonicalJson([...EXCLUDED_PURPOSES])) {
        fail('INVALID_MACHINE_CLOSURE', 'Machine closure receipt is incomplete or incompatible')
    }
    validateBuildBoundary(receipt.environmentBoundary)
    validateCanonicalProtection(receipt.canonicalProtection)
    return receipt
}

function buildMachineClosureReceipt({ supportRecord, localReceipt, globalReceipt, recordedAt }) {
    validateSupportRecord(supportRecord)
    validateLocalShadowReceipt(localReceipt)
    validateGlobalProjectionReceipt(globalReceipt)
    const receipt = sealDocument({
        schema: CLOSURE_SCHEMA,
        recordedAt,
        result: 'passed',
        qualificationType: QUALIFICATION_TYPE,
        subject: {
            implementationCommit: supportRecord.authority.subjectImplementationCommit,
            qualificationToolCommit: supportRecord.authority.qualificationToolCommit,
            policySha256: supportRecord.authority.policySha256,
            targetCommit: supportRecord.targetIdentity.commit,
            targetApplicationTreeSha256: supportRecord.targetIdentity.applicationTreeSha256,
        },
        candidate: {
            packId: 'toolchain-hardening',
            productionClass: 'G',
            shadowClass: 'B',
            contractSha256: supportRecord.sourceIdentity.contractSha256,
            compiledDeclarationSha256: supportRecord.sourceIdentity.compiledDeclarationSha256,
        },
        environmentBoundary: supportRecord.environment.admittedBoundary,
        fixtureDerivation: {
            fixtureDeclarationSha256: supportRecord.fixtureDerivation.outputFixtureDeclarationSha256,
            syntheticTargetTreeSha256: supportRecord.fixtureDerivation.outputSyntheticTargetTreeSha256,
            canonicalTargetTreeSha256: supportRecord.targetIdentity.applicationTreeSha256,
            deterministicRederivationMatched: true,
        },
        observations: {
            localMasks: 2,
            boundaryClasses: 4,
            localExpectedExecutions: 8,
            localProcessedExecutions: localReceipt.coverage.processedExecutions,
            globalSyntheticProcessedMasks: globalReceipt.coverage.processedMasks,
            globalEvidenceKind: 'synthetic-projection-not-canonical-global-exhaustive',
            syntheticMismatches: globalReceipt.comparison.mismatches,
        },
        sourceObjects: {
            supportPayloadSha256: supportRecord.integrity.payloadSha256,
            localReceiptRawSha256: supportRecord.receiptValidation.local.rawSha256,
            localReceiptSemanticSha256: supportRecord.receiptValidation.local.semanticSha256,
            globalSyntheticReceiptRawSha256: supportRecord.receiptValidation.globalSynthetic.rawSha256,
            globalSyntheticReceiptSemanticSha256: supportRecord.receiptValidation.globalSynthetic.semanticSha256,
            quarantineManifestRawSha256: supportRecord.receiptValidation.quarantineManifestRawSha256,
        },
        checks: {
            authorityCompatible: true,
            environmentBoundarySatisfied: true,
            fixtureDerivationMatched: true,
            focusedAdversarialTestsPassed: true,
            freshIsolationEvidencePassed: true,
            localCoveragePassed: true,
            localRoutePassed: true,
            receiptIntegrityPassed: true,
            sourceTargetIntegrityPassed: true,
            syntheticLocalGlobalComparisonPassed: true,
        },
        acceptedPurpose: 'prerequisite-for-material-shadow-cohort-collection',
        excludedPurposes: [...EXCLUDED_PURPOSES],
        canonicalProtection: supportRecord.canonicalProtection,
    })
    return validateMachineClosureReceipt(receipt, { supportRecord, localReceipt, globalReceipt })
}

async function collectMachineSupport({
    subjectRoot,
    qualificationToolRoot,
    targetRoot,
    quarantineManifestBytes,
    localReceiptBytes,
    globalReceiptBytes,
    governanceCommit,
    governanceStatusVersion,
    pnpmExecutable,
    pnpmProvisioning,
    focusedTestExecution = null,
    recordedAt = new Date().toISOString(),
}) {
    const before = await captureInputFreeze({ sourceRoot: subjectRoot, targetRoot })
    const subjectCommit = await gitOutput(subjectRoot, ['rev-parse', 'HEAD'])
    const subjectBranch = await gitOutput(subjectRoot, ['branch', '--show-current'])
    const subjectStatus = await gitOutput(subjectRoot, ['status', '--porcelain=v1', '--untracked-files=all'], { trim: false })
    const qualificationToolCommit = await gitOutput(qualificationToolRoot, ['rev-parse', 'HEAD'])
    const qualificationToolStatus = await gitOutput(qualificationToolRoot, ['status', '--porcelain=v1', '--untracked-files=all'], { trim: false })
    if (subjectCommit !== SUBJECT_IMPLEMENTATION_COMMIT || subjectStatus !== '') {
        fail(subjectCommit === SUBJECT_IMPLEMENTATION_COMMIT ? 'DIRTY_SUBJECT' : 'STALE_SUBJECT_COMMIT', 'Qualified subject identity changed')
    }
    if (qualificationToolStatus !== '') fail('DIRTY_QUALIFICATION_TOOL', 'Qualification tooling worktree must be clean')
    if (governanceCommit !== '49d891b12a51745b9da91bf23105d78869cf8664' || governanceStatusVersion !== 12) {
        fail('STALE_GOVERNANCE_AUTHORITY', 'Governance authority differs from the approved closure cohort')
    }
    const policyHash = sha256(fs.readFileSync(path.join(subjectRoot, 'docs/patch-combination-verification-instructions.md')))
    const contractHash = sha256(fs.readFileSync(path.join(subjectRoot, 'contracts/toolchain-hardening-shadow-v1.json')))
    if (policyHash !== POLICY_SHA256) fail('STALE_POLICY', 'Canonical policy hash changed')
    if (contractHash !== CONTRACT_SHA256) fail('STALE_CONTRACT', 'Candidate contract exact bytes changed')
    const compiled = loadToolchainShadowDeclaration(subjectRoot, { targetRoot })
    if (compiled.declarationSha256 !== COMPILED_DECLARATION_SHA256) fail('STALE_DECLARATION', 'Compiled candidate declaration changed')
    if (compiled.declaration.target.commit !== TARGET_COMMIT
        || compiled.declaration.target.applicationTreeSha256 !== CANONICAL_TARGET_TREE_SHA256) {
        fail('STALE_TARGET', 'Candidate contract target identity changed')
    }
    validateQuarantineManifest(quarantineManifestBytes, localReceiptBytes, globalReceiptBytes)
    const { localReceipt, globalReceipt } = validateReceiptPair(localReceiptBytes, globalReceiptBytes)
    const fixtureDerivation = deriveFixtureIdentity(subjectRoot)
    const environment = await observeExactPnpm(pnpmExecutable, pnpmProvisioning)
    const focusedTests = focusedTestExecution === null
        ? await runFocusedTests(subjectRoot, { ...process.env, PATH: `${path.dirname(pnpmExecutable)}:${process.env.PATH}` })
        : evaluateFocusedTestExecution(focusedTestExecution)
    const after = await captureInputFreeze({ sourceRoot: subjectRoot, targetRoot })
    const comparison = compareInputFreeze(before, after)
    const subjectStatusAfter = await gitOutput(subjectRoot, ['status', '--porcelain=v1', '--untracked-files=all'], { trim: false })
    const targetCommit = await gitOutput(targetRoot, ['rev-parse', 'HEAD'])
    const targetStatus = await gitOutput(targetRoot, ['status', '--porcelain=v1', '--untracked-files=all'], { trim: false })
    if (!comparison.sourceMatched || !comparison.targetMatched || targetStatus !== '') {
        fail('INPUT_MUTATION_DETECTED', 'Support collection changed source or target')
    }
    if (targetCommit !== TARGET_COMMIT || after.target.applicationTree.rootSha256 !== CANONICAL_TARGET_TREE_SHA256) {
        fail('STALE_TARGET', 'Canonical target identity differs from the approved cohort')
    }
    const subjectSchemas = schemaSetIdentity(subjectRoot)
    const qualificationSchemas = schemaSetIdentity(qualificationToolRoot)
    const localRoute = filesIdentity(subjectRoot, LOCAL_ROUTE_FILES)
    const globalRoute = filesIdentity(subjectRoot, GLOBAL_ROUTE_FILES)
    const supportRecord = buildSupportRecord({
        recordedAt,
        authority: {
            governanceRepository: 'danso0429/patch-verification-governance',
            governanceCommit,
            governanceStatusVersion,
            subjectImplementationCommit: subjectCommit,
            subjectBranch,
            qualificationToolCommit,
            qualificationToolClean: true,
            policySha256: policyHash,
        },
        sourceIdentity: {
            sourcePreSha256: jsonSha256(before.source),
            sourcePostSha256: jsonSha256(after.source),
            catalogSha256: contentTreeDescriptor(path.join(subjectRoot, 'patches'), { excludedRootEntries: [] }).rootSha256,
            subjectSchemasSha256: subjectSchemas.rootSha256,
            qualificationSchemasSha256: qualificationSchemas.rootSha256,
            localRouteSha256: localRoute.rootSha256,
            globalProjectionRouteSha256: globalRoute.rootSha256,
            contractSha256: contractHash,
            compiledDeclarationSha256: compiled.declarationSha256,
        },
        targetIdentity: {
            role: 'canonical-audited-target',
            commit: targetCommit,
            applicationTreeSha256: after.target.applicationTree.rootSha256,
            targetPreSha256: jsonSha256(before.target),
            targetPostSha256: jsonSha256(after.target),
        },
        environment,
        fixtureDerivation,
        receiptValidation: {
            quarantineManifestRawSha256: sha256(quarantineManifestBytes),
            quarantineAuthoritative: false,
            local: {
                ...receiptIdentity(localReceiptBytes, localReceipt, 'synthetic-known-answer'),
                localMasks: localReceipt.coverage.localMasks,
                boundaryClasses: localReceipt.coverage.boundaryClasses,
                expectedExecutions: localReceipt.coverage.expectedExecutions,
                processedExecutions: localReceipt.coverage.processedExecutions,
                freshIsolation: localReceipt.isolation.persistentLocalWorkers === false,
            },
            globalSynthetic: {
                ...receiptIdentity(globalReceiptBytes, globalReceipt, 'synthetic-projection'),
                sourceKind: 'synthetic-projection',
                processedMasks: globalReceipt.coverage.processedMasks,
                mismatches: globalReceipt.comparison.mismatches,
                canonicalGlobalExhaustiveExecuted: false,
            },
            pairLinked: true,
        },
        focusedTests,
        integrityChecks: {
            subjectCleanBefore: subjectStatus === '',
            subjectCleanAfter: subjectStatusAfter === '',
            sourcePrePostMatched: comparison.sourceMatched,
            targetPrePostMatched: comparison.targetMatched,
            repositoryFilesUnchanged: true,
            lockfileUnchanged: true,
            targetClean: targetStatus === '',
            receiptIntegrityPassed: true,
        },
    })
    const closureReceipt = buildMachineClosureReceipt({ supportRecord, localReceipt, globalReceipt, recordedAt })
    return { supportRecord, closureReceipt, localReceipt, globalReceipt }
}

function schemaRegistry() {
    return new Map([
        [SUPPORT_SCHEMA, validateSupportRecord],
        [CLOSURE_SCHEMA, (document) => {
            if (!verifyDocumentIntegrity(document) || document.schema !== CLOSURE_SCHEMA) {
                fail('INVALID_MACHINE_CLOSURE', 'Machine closure schema or integrity is invalid')
            }
            return document
        }],
    ])
}

module.exports = {
    BUILD_BOUNDARY_CLASS,
    CANONICAL_TARGET_TREE_SHA256,
    CLOSURE_SCHEMA,
    COMPILED_DECLARATION_SHA256,
    CONTRACT_SHA256,
    EXCLUDED_PURPOSES,
    FIXTURE_DECLARATION_SHA256,
    FOCUSED_TEST_FILES,
    GLOBAL_RECEIPT_SHA256,
    GLOBAL_ROUTE_FILES,
    LOCAL_RECEIPT_SHA256,
    LOCAL_ROUTE_FILES,
    POLICY_SHA256,
    QUALIFICATION_TYPE,
    QUARANTINE_MANIFEST_SHA256,
    RECIPE_SHA256,
    REQUIRED_INTEGRITY_CHECK_KEYS,
    REQUIRED_RECEIPT_CHECK_KEYS,
    SUBJECT_IMPLEMENTATION_COMMIT,
    SUPPORT_SCHEMA,
    SYNTHETIC_TARGET_TREE_SHA256,
    TARGET_COMMIT,
    ToolchainQualificationError,
    assertFixtureDerivation,
    buildMachineClosureReceipt,
    buildSupportRecord,
    collectMachineSupport,
    deriveFixtureIdentity,
    evaluateFocusedTestExecution,
    parseTapSummary,
    provisionExactPnpm,
    schemaRegistry,
    validateMachineClosureReceipt,
    validateQuarantineManifest,
    validateReceiptPair,
    validateRequiredTrueChecks,
    validateSupportRecord,
}
