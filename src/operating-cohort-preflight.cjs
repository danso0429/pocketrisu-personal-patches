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
    inspectDurableAcceptedQualification,
    verifyQualificationRegistry,
} = require('./qualification-verifier.cjs')
const { loadToolchainShadowDeclaration } = require('./toolchain-shadow-contract.cjs')
const {
    MATERIAL_DECLARATION_SCHEMA,
    decideOperatingCohortRoute,
    validateMaterialDeclaration,
} = require('./operating-cohort-route.cjs')

const PREFLIGHT_SCHEMA = 'qualification-operating-cohort-preflight-v1'
const EXPECTATION_SCHEMA = MATERIAL_DECLARATION_SCHEMA

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

function validateExpectation(expectation) {
    try { return validateMaterialDeclaration(expectation) } catch (error) {
        fail('INVALID_PREFLIGHT_EXPECTATION', error.message, { causeCode: error.code ?? null })
    }
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
    const expectedSubject = expectation.qualification.subject
    const expectedCompatibility = expectation.qualification.compatibility
    const support = verified.qualification.support
    const finalManifest = verified.qualification.finalManifest
    if (verified.effectiveEntry.action !== 'accept'
        || verified.effectiveEntry.disposition !== 'accepted-qualification'
        || verified.effectiveEntry.qualificationType !== QUALIFICATION_TYPE
        || finalManifest.disposition !== 'accepted-qualification'
        || finalManifest.qualificationType !== QUALIFICATION_TYPE) {
        fail('QUALIFICATION_NOT_ACCEPTED', 'Preflight requires a current accepted qualification of the exact candidate type')
    }
    if (!canonicalJsonBytes(finalManifest.subject).equals(canonicalJsonBytes(expectedSubject))) {
        fail('STALE_QUALIFICATION_SUBJECT', 'Qualification subject differs from preflight expectation')
    }
    const source = support.sourceIdentity
    for (const [key, expected] of Object.entries(expectedCompatibility)) {
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

function candidateDomain(subjectRoot, expectation) {
    if (expectation.candidateImpact.affected !== true) return null
    const compiled = loadToolchainShadowDeclaration(subjectRoot)
    return {
        candidateId: compiled.pack.id,
        localMasksExpected: 2,
        boundaryClassesExpected: compiled.boundaryClassIds.length,
        totalLocalCasesExpected: 2 * compiled.boundaryClassIds.length,
        compiledDeclarationSha256: compiled.declarationSha256,
    }
}

function qualificationStateFrom(verified, expectation) {
    const support = verified.qualification?.support ?? verified.support
    const finalManifest = verified.qualification?.finalManifest ?? verified.finalManifest
    return {
        accepted: true,
        registryIntegrity: true,
        reason: 'accepted-durable-compatible-qualification',
        subject: finalManifest.subject,
        compatibility: Object.fromEntries(Object.keys(expectation.qualification.compatibility)
            .map((key) => [key, support.sourceIdentity[key]])),
        environment: support.environment.admittedBoundary,
    }
}

function acceptedQualificationIdentity(verified, identity) {
    const finalManifest = verified.qualification?.finalManifest ?? verified.finalManifest
    const effectiveEntry = verified.effectiveEntry
    const result = {
        storeIdentityHash: identity.storeIdentityHash,
        registryDescriptorSha256: verified.registryDescriptorSha256,
        registryRootSha256: verified.registryRootSha256,
        finalManifestDescriptorSha256: effectiveEntry?.qualificationManifestDescriptorSha256,
        finalManifestPayloadSha256: sha256(canonicalJsonBytes(finalManifest)),
    }
    if (Object.values(result).some((value) => !/^[0-9a-f]{64}$/.test(value ?? ''))) {
        fail('QUALIFICATION_IDENTITY_INCOMPLETE', 'Accepted qualification identity is incomplete')
    }
    return result
}

function nestedSpawnUnavailable(error) {
    if (error?.code !== 'INDEPENDENT_DERIVATION_FAILED') return false
    const detail = JSON.stringify(error.details ?? {})
    return /\bEPERM\b/.test(detail) && /spawn/i.test(detail)
}

function reasonFor(error) {
    if (error?.code === 'QUARANTINE_ONLY_EVIDENCE') return 'quarantine-only-evidence'
    if (error?.code === 'QUALIFICATION_REGISTRY_HEAD_ROLLBACK') return 'registry-head-rollback'
    if (error?.code === 'QUALIFICATION_REGISTRY_FORK') return 'registry-fork'
    if (error?.code === 'QUALIFICATION_REVOKED') return 'revoked-qualification'
    if (['STALE_QUALIFICATION_CURRENT_REF', 'QUALIFICATION_SUPERSEDED'].includes(error?.code)) return 'superseded-qualification'
    if (['STALE_QUALIFICATION_SUBJECT', 'STALE_QUALIFICATION_COMPATIBILITY'].includes(error?.code)) return 'stale-qualification'
    if (error?.code === 'QUALIFICATION_NOT_ACCEPTED') return 'no-compatible-accepted-qualification'
    return `invalid-durable-qualification:${error?.code ?? 'unknown'}`
}

function runPreflight({ storeRoot, expectation, checkedAt, subjectRoot, dependencies }) {
    const resolved = path.resolve(storeRoot)
    const expected = validateExpectation(expectation)
    const before = treeIdentity(resolved)
    const verify = dependencies.verifyQualificationRegistry ?? verifyQualificationRegistry
    const loadIdentity = dependencies.loadStoreIdentity ?? loadStoreIdentity
    let report
    let durable = null
    let qualificationState = null
    let freshVerification = 'failed'
    let verificationFailure = null
    try {
        assertQuarantineIsNotAcceptedStore(resolved)
        const identity = loadIdentity(resolved)
        const verified = verify({
            storeRoot: resolved,
            expectedSubject: expected.qualification.subject,
            requireCurrentRef: true,
            subjectRoot,
        })
        assertCompatible(verified, expected)
        durable = verified
        qualificationState = qualificationStateFrom(verified, expected)
        freshVerification = 'passed'
        report = { identity }
    } catch (error) {
        verificationFailure = error
        freshVerification = nestedSpawnUnavailable(error) ? 'environment-unavailable' : 'failed'
        try {
            const customVerifier = verify !== verifyQualificationRegistry
            const inspect = error.code === 'QUARANTINE_ONLY_EVIDENCE'
                || (customVerifier && dependencies.inspectDurableAcceptedQualification === undefined)
                ? () => { throw error }
                : (dependencies.inspectDurableAcceptedQualification ?? inspectDurableAcceptedQualification)
            durable = inspect({ storeRoot: resolved, expectedSubject: expected.qualification.subject })
            assertCompatible({ qualification: {
                support: durable.support,
                finalManifest: durable.finalManifest,
            }, effectiveEntry: durable.effectiveEntry }, expected)
            qualificationState = qualificationStateFrom(durable, expected)
            report = { identity: loadIdentity(resolved) }
        } catch (durableError) {
            qualificationState = {
                accepted: false,
                registryIntegrity: ![
                    'QUALIFICATION_REGISTRY_HEAD_ROLLBACK', 'QUALIFICATION_REGISTRY_FORK',
                    'INVALID_QUALIFICATION_CURRENT_REF', 'QUALIFICATION_REGISTRY_CURRENT_REF_MISMATCH',
                ].includes(durableError.code),
                reason: reasonFor(durableError),
                subject: expected.qualification.subject,
                compatibility: expected.qualification.compatibility,
                environment: expected.environment,
            }
            report = { identity: null, durableError }
        }
    }
    let domain = null
    try { domain = candidateDomain(subjectRoot, expected) } catch (error) {
        domain = { derivationError: error.code ?? error.message }
    }
    const decision = decideOperatingCohortRoute({
        declaration: expected,
        qualificationState,
        freshVerification,
        candidateDomain: domain,
    })
    const identity = report.identity
    const reason = qualificationState.accepted
        ? (freshVerification === 'passed'
            ? 'accepted-durable-compatible-qualification'
            : (freshVerification === 'environment-unavailable'
                ? 'accepted-qualification-fresh-verification-environment-unavailable'
                : reasonFor(verificationFailure)))
        : qualificationState.reason
    const failures = []
    if (verificationFailure !== null) failures.push({
        code: verificationFailure.code ?? 'UNKNOWN',
        message: verificationFailure.message,
        classification: freshVerification,
    })
    if (report.durableError) failures.push({
        code: report.durableError.code ?? 'UNKNOWN', message: report.durableError.message,
        classification: 'accepted-qualification-state',
    })
    const acceptedIdentity = qualificationState.accepted && identity !== null
        ? acceptedQualificationIdentity(durable, identity)
        : null
    report = {
        schema: PREFLIGHT_SCHEMA,
        checkedAt,
        storeRoot: identity?.rootRealpath ?? resolved,
        storeIdentityHash: identity?.storeIdentityHash ?? null,
        acceptedQualificationState: qualificationState.accepted ? 'accepted' : 'unavailable',
        freshVerificationInCurrentExecutionEnvironment: freshVerification,
        toolchainPilotClosurePassed: freshVerification === 'passed' && qualificationState.accepted,
        reason,
        registryDescriptorSha256: durable?.registryDescriptorSha256 ?? null,
        registryRootSha256: durable?.registryRootSha256 ?? null,
        qualificationIdentity: acceptedIdentity,
        subject: expected.qualification.subject,
        route: {
            routeId: decision.routeId,
            safeToExecute: decision.safeToExecute,
            globalExecutionsExpected: decision.globalExecutionsExpected,
            decisionSha256: decision.decisionSha256,
        },
        machineRouteDecision: decision,
        routeDecisionInputs: {
            qualificationState,
            freshVerification,
            candidateDomain: domain,
        },
        cohort: {
            materiallyDistinct: decision.materiallyDistinct,
            changeClass: decision.changeClass,
            stableRelease: decision.stableRelease,
            materialDeclarationSha256: decision.materialDeclarationSha256,
        },
        candidate: {
            affected: decision.candidateAffected,
            candidateId: decision.candidateId,
            qualificationCompatible: decision.candidateQualificationCompatible,
            executionReason: decision.candidateExecutionReason,
            executionSkipped: decision.candidateExecutionSkipped,
            skipReason: decision.candidateSkipReason,
            localMasksExpected: decision.localMasksExpected,
            boundaryClassesExpected: decision.boundaryClassesExpected,
            totalLocalCasesExpected: decision.totalLocalCasesExpected,
            operatingSampleEligible: decision.candidateOperatingSampleEligible,
        },
        blockers: decision.blockers,
        operatingCounts: { ...OPERATING_COUNTS },
        canonicalProtection: { ...CANONICAL_PROTECTION },
        readOnly: true,
        automaticallyAuthorizesC1: false,
        failures,
    }
    const after = treeIdentity(resolved)
    if (after !== before) fail('PREFLIGHT_MUTATED_STORE', 'Operating cohort preflight changed the evidence store')
    return report
}

function preflightOperatingCohort({ storeRoot, expectation, subjectRoot, checkedAt = new Date().toISOString() }) {
    return runPreflight({
        storeRoot,
        expectation,
        subjectRoot,
        checkedAt,
        dependencies: { verifyQualificationRegistry, loadStoreIdentity },
    })
}

function preflightOperatingCohortWithTestDependencies({
    storeRoot, expectation, subjectRoot = null, checkedAt = new Date().toISOString(), dependencies,
}) {
    return runPreflight({ storeRoot, expectation, subjectRoot, checkedAt, dependencies })
}

module.exports = {
    EXPECTATION_SCHEMA,
    OperatingCohortPreflightError,
    PREFLIGHT_SCHEMA,
    assertCompatible,
    preflightOperatingCohort,
    preflightOperatingCohortWithTestDependencies,
    treeIdentity,
    validateExpectation,
}
