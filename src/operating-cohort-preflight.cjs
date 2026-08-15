'use strict'

const fs = require('node:fs')
const path = require('node:path')
const {
    canonicalJsonBytes,
    loadStoreIdentity,
    sha256,
} = require('./qualification-object-store.cjs')
const {
    CANONICAL_PROTECTION,
    OPERATING_COUNTS,
} = require('./qualification-registry.cjs')
const { QUALIFICATION_TYPE } = require('./toolchain-shadow-qualification.cjs')
const {
    assertQuarantineIsNotAcceptedStore,
    verifyQualificationRegistry,
} = require('./qualification-verifier.cjs')

const PREFLIGHT_SCHEMA = 'qualification-operating-cohort-preflight-v1'
const EXPECTATION_SCHEMA = 'qualification-operating-preflight-expectation-v1'
const SHA256_PATTERN = /^[0-9a-f]{64}$/

class OperatingCohortPreflightError extends Error {
    constructor(code, message, details = null) {
        super(message)
        this.name = 'OperatingCohortPreflightError'
        this.code = code
        this.details = details
    }
}

function fail(code, message, details = null) {
    throw new OperatingCohortPreflightError(code, message, details)
}

function exactKeys(value, expected, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || !canonicalJsonBytes(Object.keys(value).sort()).equals(canonicalJsonBytes([...expected].sort()))) {
        fail('INVALID_PREFLIGHT_EXPECTATION', `${label} keys differ`)
    }
}

function validateExpectation(expectation) {
    exactKeys(expectation, ['schema', 'subject', 'compatibility'], 'preflight expectation')
    if (expectation.schema !== EXPECTATION_SCHEMA) fail('INVALID_PREFLIGHT_EXPECTATION', 'Preflight expectation schema is unsupported')
    exactKeys(expectation.subject, [
        'implementationCommit', 'qualificationToolCommit', 'policySha256', 'contractSha256',
        'compiledDeclarationSha256', 'targetCommit', 'targetApplicationTreeSha256',
    ], 'preflight subject')
    if (!/^[0-9a-f]{40}$/.test(expectation.subject.implementationCommit ?? '')
        || !/^[0-9a-f]{40}$/.test(expectation.subject.qualificationToolCommit ?? '')
        || !/^[0-9a-f]{40}$/.test(expectation.subject.targetCommit ?? '')) {
        fail('INVALID_PREFLIGHT_EXPECTATION', 'Preflight subject commit is invalid')
    }
    for (const key of ['policySha256', 'contractSha256', 'compiledDeclarationSha256', 'targetApplicationTreeSha256']) {
        if (!SHA256_PATTERN.test(expectation.subject[key] ?? '')) fail('INVALID_PREFLIGHT_EXPECTATION', `Preflight subject ${key} is invalid`)
    }
    exactKeys(expectation.compatibility, [
        'subjectSchemasSha256', 'qualificationSchemasSha256', 'localRouteSha256',
        'globalProjectionRouteSha256',
    ], 'preflight compatibility')
    for (const [key, value] of Object.entries(expectation.compatibility)) {
        if (!SHA256_PATTERN.test(value ?? '')) fail('INVALID_PREFLIGHT_EXPECTATION', `Preflight compatibility ${key} is invalid`)
    }
    return expectation
}

function treeIdentity(root) {
    if (!fs.existsSync(root)) return sha256(canonicalJsonBytes({ exists: false, entries: [] }))
    const entries = []
    function walk(directory, relative) {
        for (const name of fs.readdirSync(directory).sort()) {
            const absolute = path.join(directory, name)
            const child = relative === '' ? name : `${relative}/${name}`
            const stat = fs.lstatSync(absolute)
            if (stat.isDirectory()) {
                entries.push({ path: child, type: 'directory', mode: stat.mode & 0o7777 })
                walk(absolute, child)
            } else if (stat.isFile()) {
                entries.push({ path: child, type: 'file', mode: stat.mode & 0o7777, bytes: stat.size, sha256: sha256(fs.readFileSync(absolute)) })
            } else if (stat.isSymbolicLink()) {
                entries.push({ path: child, type: 'symlink', target: fs.readlinkSync(absolute) })
            } else fail('UNSUPPORTED_STORE_ENTRY', `Unsupported entry in preflight identity: ${absolute}`)
        }
    }
    walk(root, '')
    return sha256(canonicalJsonBytes({ exists: true, entries }))
}

function assertCompatible(verified, expectation) {
    const support = verified.qualification.support
    const finalManifest = verified.qualification.finalManifest
    if (verified.effectiveEntry.action !== 'accept'
        || verified.effectiveEntry.disposition !== 'accepted-qualification'
        || verified.effectiveEntry.qualificationType !== QUALIFICATION_TYPE
        || finalManifest.disposition !== 'accepted-qualification'
        || finalManifest.qualificationType !== QUALIFICATION_TYPE) {
        fail('QUALIFICATION_NOT_ACCEPTED', 'Preflight requires a current accepted qualification of the exact candidate type')
    }
    if (!canonicalJsonBytes(finalManifest.subject).equals(canonicalJsonBytes(expectation.subject))) {
        fail('STALE_QUALIFICATION_SUBJECT', 'Qualification subject differs from preflight expectation')
    }
    const source = support.sourceIdentity
    for (const [key, expected] of Object.entries(expectation.compatibility)) {
        if (source[key] !== expected) fail('STALE_QUALIFICATION_COMPATIBILITY', `Qualification ${key} changed`)
    }
    if (support.targetIdentity.role !== 'canonical-audited-target') {
        fail('WRONG_QUALIFICATION_TARGET_ROLE', 'Qualification target role is not canonical-audited-target')
    }
    if (!canonicalJsonBytes(verified.effectiveEntry.operatingCounts).equals(canonicalJsonBytes(OPERATING_COUNTS))
        || !canonicalJsonBytes(finalManifest.operatingCounts).equals(canonicalJsonBytes(OPERATING_COUNTS))) {
        fail('OPERATING_COUNT_ISOLATION_FAILED', 'Qualification changes an operating count')
    }
    if (!canonicalJsonBytes(finalManifest.canonicalProtection).equals(canonicalJsonBytes(CANONICAL_PROTECTION))) {
        fail('CANONICAL_PROTECTION_WEAKENED', 'Qualification production protection differs')
    }
    return true
}

function reasonFor(error) {
    if (error?.code === 'QUARANTINE_ONLY_EVIDENCE') return 'quarantine-only-evidence'
    if (error?.code === 'QUALIFICATION_REVOKED') return 'revoked-qualification'
    if (['STALE_QUALIFICATION_CURRENT_REF', 'QUALIFICATION_SUPERSEDED'].includes(error?.code)) return 'superseded-qualification'
    if (['STALE_QUALIFICATION_SUBJECT', 'STALE_QUALIFICATION_COMPATIBILITY'].includes(error?.code)) return 'stale-qualification'
    if (error?.code === 'QUALIFICATION_NOT_ACCEPTED') return 'no-compatible-accepted-qualification'
    return `invalid-durable-qualification:${error?.code ?? 'unknown'}`
}

function preflightOperatingCohort({
    storeRoot,
    expectation,
    checkedAt = new Date().toISOString(),
    dependencies = {},
}) {
    const resolved = path.resolve(storeRoot)
    const expected = validateExpectation(expectation)
    const before = treeIdentity(resolved)
    const verify = dependencies.verifyQualificationRegistry ?? verifyQualificationRegistry
    const loadIdentity = dependencies.loadStoreIdentity ?? loadStoreIdentity
    let report
    try {
        assertQuarantineIsNotAcceptedStore(resolved)
        const identity = loadIdentity(resolved)
        const verified = verify({
            storeRoot: resolved,
            expectedSubject: expected.subject,
            requireCurrentRef: true,
        })
        assertCompatible(verified, expected)
        report = {
            schema: PREFLIGHT_SCHEMA,
            checkedAt,
            storeRoot: identity.rootRealpath,
            storeIdentityHash: identity.storeIdentityHash,
            toolchainPilotClosurePassed: true,
            reason: 'accepted-durable-compatible-qualification',
            registryDescriptorSha256: verified.registryDescriptorSha256,
            registryRootSha256: verified.registryRootSha256,
            subject: expected.subject,
            operatingCounts: { ...OPERATING_COUNTS },
            canonicalProtection: { ...CANONICAL_PROTECTION },
            readOnly: true,
            automaticallyAuthorizesC1: false,
            failures: [],
        }
    } catch (error) {
        report = {
            schema: PREFLIGHT_SCHEMA,
            checkedAt,
            storeRoot: resolved,
            storeIdentityHash: null,
            toolchainPilotClosurePassed: false,
            reason: reasonFor(error),
            registryDescriptorSha256: null,
            registryRootSha256: null,
            subject: expected.subject,
            operatingCounts: { ...OPERATING_COUNTS },
            canonicalProtection: { ...CANONICAL_PROTECTION },
            readOnly: true,
            automaticallyAuthorizesC1: false,
            failures: [{ code: error.code ?? 'UNKNOWN', message: error.message }],
        }
    }
    const after = treeIdentity(resolved)
    if (after !== before) fail('PREFLIGHT_MUTATED_STORE', 'Operating cohort preflight changed the evidence store')
    return report
}

module.exports = {
    EXPECTATION_SCHEMA,
    OperatingCohortPreflightError,
    PREFLIGHT_SCHEMA,
    assertCompatible,
    preflightOperatingCohort,
    treeIdentity,
    validateExpectation,
}
