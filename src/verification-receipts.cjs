'use strict'

const fs = require('node:fs')
const path = require('node:path')
const {
    FREEZE_SCHEMA,
    TREE_SCHEMA,
    compareInputFreeze,
    jsonSha256,
    parseCanonicalOutput,
    sha256,
    validateVerificationResult,
} = require('./verification-evidence.cjs')
const {
    compareRuntimeEnvelopes,
} = require('./verification-runtime.cjs')
const {
    sameGlobalReferenceFromComparison,
    validateSameGlobalReference,
} = require('./toolchain-shadow-same-global.cjs')

const RECEIPT_DISPOSITIONS = Object.freeze([
    'current-active',
    'historical',
    'incomplete',
    'invalid',
    'superseded',
    'diagnostic-only',
    'defect-reproduction',
])
const INTEGRITY_SCHEMA = 'patch-verification-receipt-integrity-v1'

function canonicalValue(value, seen = new Set()) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') {
        return value
    }
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new Error('Receipt contains a non-finite number')
        return value
    }
    if (Array.isArray(value)) return value.map((entry) => canonicalValue(entry, seen))
    if (!value || typeof value !== 'object') {
        throw new Error(`Receipt contains unsupported value type: ${typeof value}`)
    }
    if (seen.has(value)) throw new Error('Receipt contains a cycle')
    seen.add(value)
    try {
        return Object.fromEntries(Object.keys(value).sort().map((key) => [
            key,
            canonicalValue(value[key], seen),
        ]))
    } finally {
        seen.delete(value)
    }
}

function canonicalJson(value) {
    return JSON.stringify(canonicalValue(value))
}

function withoutIntegrity(document) {
    const { integrity, ...payload } = document
    return payload
}

function sealDocument(document) {
    const payload = withoutIntegrity(document)
    return {
        ...payload,
        integrity: {
            schema: INTEGRITY_SCHEMA,
            algorithm: 'sha256-over-canonical-json-v1',
            payloadSha256: sha256(canonicalJson(payload)),
        },
    }
}

function verifyDocumentIntegrity(document) {
    const integrity = document?.integrity
    if (
        !integrity
        || integrity.schema !== INTEGRITY_SCHEMA
        || integrity.algorithm !== 'sha256-over-canonical-json-v1'
        || !/^[0-9a-f]{64}$/.test(integrity.payloadSha256 ?? '')
    ) return false
    return integrity.payloadSha256 === sha256(canonicalJson(withoutIntegrity(document)))
}

function validateDisposition(disposition) {
    return RECEIPT_DISPOSITIONS.includes(disposition)
}

function computeGlobalRunId(receipt) {
    const { integrity, ...payload } = receipt
    return sha256(canonicalJson({
        schema: 'patch-global-exhaustive-run-identity-v1',
        receipt: { ...payload, globalRunId: null },
    }))
}

function validateTreeDescriptor(tree, label) {
    const errors = []
    if (tree?.schema !== TREE_SCHEMA) return [`${label} tree schema is missing or incompatible`]
    if (!Array.isArray(tree.exclusions) || !Array.isArray(tree.entries)) {
        return [`${label} tree identity arrays are missing`]
    }
    if (
        new Set(tree.exclusions).size !== tree.exclusions.length
        || JSON.stringify(tree.exclusions) !== JSON.stringify([...tree.exclusions].sort())
    ) errors.push(`${label} tree exclusions are not sorted and unique`)
    if (tree.entryCount !== tree.entries.length) {
        errors.push(`${label} tree entry count mismatch`)
    }
    try {
        const expectedRoot = jsonSha256({
            schema: TREE_SCHEMA,
            exclusions: tree.exclusions,
            entries: tree.entries,
        })
        if (tree.rootSha256 !== expectedRoot) errors.push(`${label} tree root mismatch`)
    } catch (error) {
        errors.push(`${label} tree identity cannot be hashed: ${error.message}`)
    }
    return errors
}

function validateFreezeRecord(record, label) {
    const errors = []
    if (record?.schema !== FREEZE_SCHEMA) {
        errors.push(`${label} freeze schema is missing or incompatible`)
        return errors
    }
    for (const side of ['source', 'target']) {
        if (record[side]?.schema !== FREEZE_SCHEMA) {
            errors.push(`${label} ${side} freeze schema is missing or incompatible`)
            continue
        }
        errors.push(...validateTreeDescriptor(
            record[side].applicationTree,
            `${label} ${side} application`,
        ))
    }
    errors.push(...validateTreeDescriptor(record.source?.catalog, `${label} source catalog`))
    return errors
}

function validateCommandContract(receipt) {
    const errors = []
    const options = receipt?.options
    const optionKeys = options && typeof options === 'object'
        ? Object.keys(options).sort()
        : []
    const baseOptionKeys = [
        'allowReviewing',
        'jobs',
        'targetProvenance',
    ]
    const operatingOptionKeys = [...baseOptionKeys, 'operatingRoute'].sort()
    const qualificationOptionKeys = [...baseOptionKeys, 'qualificationRoute'].sort()
    if (JSON.stringify(optionKeys) !== JSON.stringify(baseOptionKeys)
        && JSON.stringify(optionKeys) !== JSON.stringify(operatingOptionKeys)
        && JSON.stringify(optionKeys) !== JSON.stringify(qualificationOptionKeys)) {
        return ['verification options are missing or contain unknown fields']
    }
    const jobsValid = options.jobs === null
        || (Number.isSafeInteger(options.jobs) && options.jobs > 0)
    if (!jobsValid) errors.push('verification jobs option is invalid')
    if (typeof options.allowReviewing !== 'boolean') {
        errors.push('verification allowReviewing option is invalid')
    }
    if (
        options.targetProvenance !== null
        && !/^sha256:[0-9a-f]{64}$/.test(options.targetProvenance ?? '')
    ) errors.push('verification targetProvenance option is invalid')
    for (const phase of ['before', 'after']) {
        const provenance = receipt?.[phase]?.target?.provenance
        if (options.targetProvenance === null) {
            if (provenance?.kind !== 'git') {
                errors.push(`${phase} target provenance is not Git as declared`)
            }
        } else if (
            provenance?.kind !== 'declared-archive'
            || `sha256:${provenance.sha256}` !== options.targetProvenance
        ) errors.push(`${phase} target archive provenance differs from receipt options`)
    }
    if (options.operatingRoute !== undefined) {
        const route = options.operatingRoute
        const routeKeys = Object.keys(route ?? {}).sort()
        const legacyRouteKeys = [
            'candidateComparisonStatus', 'decisionSha256', 'globalExecutionsExpected',
            'materialDeclarationSha256', 'routeId',
        ].sort()
        const frozenRouteKeys = [...legacyRouteKeys, 'operatingCohort'].sort()
        if (!route || (JSON.stringify(routeKeys) !== JSON.stringify(legacyRouteKeys)
            && JSON.stringify(routeKeys) !== JSON.stringify(frozenRouteKeys))
            || !['material-c0-global', 'material-c0-global-plus-toolchain-shadow'].includes(route.routeId)
            || !/^[0-9a-f]{64}$/.test(route.materialDeclarationSha256 ?? '')
            || !/^[0-9a-f]{64}$/.test(route.decisionSha256 ?? '')
            || route.globalExecutionsExpected !== 1
            || !['required', 'skipped-local-failure', 'not-applicable'].includes(route.candidateComparisonStatus)
            || (route.routeId === 'material-c0-global' && route.candidateComparisonStatus !== 'not-applicable')
            || (route.routeId === 'material-c0-global-plus-toolchain-shadow'
                && route.candidateComparisonStatus === 'not-applicable')) {
            errors.push('verification operating route option is invalid')
        }
        if (route?.operatingCohort !== undefined) {
            const binding = route.operatingCohort
            if (JSON.stringify(Object.keys(binding ?? {}).sort()) !== JSON.stringify([
                'cohortId', 'executionAttemptId', 'frozenDeclarationSha256', 'materialInputKey',
            ]) || Object.values(binding ?? {}).some((value) => !/^[0-9a-f]{64}$/.test(value ?? ''))
                || !/^[0-9a-f]{64}$/.test(receipt.globalRunId ?? '')
                || receipt.globalRunId !== computeGlobalRunId(receipt)) {
                errors.push('verification receipt frozen cohort binding is invalid')
            }
        } else if (receipt.globalRunId !== undefined) {
            errors.push('unbound verification receipt contains a Global run ID')
        }
    }
    if (options.qualificationRoute !== undefined) {
        const route = options.qualificationRoute
        if (JSON.stringify(Object.keys(route ?? {}).sort()) !== JSON.stringify([
            'qualificationType', 'referencePayloadSha256',
        ]) || route.qualificationType !== 'patch-toolchain-shadow-real-global-qualification-v2'
            || !/^[0-9a-f]{64}$/.test(route.referencePayloadSha256 ?? '')
            || !/^[0-9a-f]{64}$/.test(receipt.globalRunId ?? '')
            || receipt.globalRunId !== computeGlobalRunId(receipt)) {
            errors.push('verification qualification route option is invalid')
        }
    }

    const command = receipt?.command
    const scriptNames = {
        'global-exhaustive': 'verify-all-combinations.cjs',
        'cache-differential': 'verify-cache-differential.cjs',
    }
    const scriptName = scriptNames[receipt?.verificationKind]
    const isPortableAbsolute = (value) =>
        path.posix.isAbsolute(value) || path.win32.isAbsolute(value)
    const portableBasename = (value) => value.includes('\\')
        ? path.win32.basename(value)
        : path.posix.basename(value)
    const portableParentBasename = (value) => value.includes('\\')
        ? path.win32.basename(path.win32.dirname(value))
        : path.posix.basename(path.posix.dirname(value))
    if (
        !Array.isArray(command)
        || command.some((value) => typeof value !== 'string')
        || command.length < 5
        || !isPortableAbsolute(command[0])
        || !isPortableAbsolute(command[1])
        || portableParentBasename(command[1]) !== 'scripts'
        || portableBasename(command[1]) !== scriptName
        || command[2] !== '--root'
        || !isPortableAbsolute(command[3] ?? '')
        || command[4] !== '--json'
    ) return [...errors, 'verification command does not match its declared kind']
    let cursor = 5
    if (options.jobs !== null) {
        if (command[cursor] !== '--jobs' || command[cursor + 1] !== String(options.jobs)) {
            errors.push('verification command jobs differ from receipt options')
        }
        cursor += 2
    }
    if (options.allowReviewing) {
        if (command[cursor] !== '--allow-reviewing') {
            errors.push('verification command review flag differs from receipt options')
        }
        cursor += 1
    }
    if (options.operatingRoute?.candidateComparisonStatus === 'required'
        || options.qualificationRoute !== undefined) {
        if (command[cursor] !== '--toolchain-shadow-reference-base64'
            || typeof command[cursor + 1] !== 'string' || command[cursor + 1].length === 0) {
            errors.push('combined operating route is missing its same-Global reference')
        } else {
            try {
                const reference = JSON.parse(Buffer.from(command[cursor + 1], 'base64url').toString('utf8'))
                validateSameGlobalReference(reference)
                const comparison = receipt?.verifierResult?.toolchainShadowComparison
                const comparisonReference = comparison === undefined
                    ? null : sameGlobalReferenceFromComparison(comparison)
                const operatingMismatch = options.operatingRoute === undefined ? false
                    : (reference.materialDeclarationSha256 !== options.operatingRoute.materialDeclarationSha256
                    || (options.operatingRoute.operatingCohort !== undefined
                        && ['materialInputKey', 'cohortId', 'executionAttemptId', 'frozenDeclarationSha256']
                            .some((key) => reference[key] !== options.operatingRoute.operatingCohort[key]))
                    )
                const qualificationMismatch = options.qualificationRoute === undefined ? false
                    : (reference.context !== 'real-global-qualification'
                        || options.qualificationRoute.referencePayloadSha256 !== sha256(canonicalJson(reference)))
                if (operatingMismatch || qualificationMismatch || comparisonReference === null
                    || canonicalJson(reference) !== canonicalJson(comparisonReference)) {
                    errors.push('same-Global reference differs from operating route options')
                }
            } catch {
                errors.push('same-Global reference is not valid encoded JSON')
            }
        }
        cursor += 2
    }
    if (cursor !== command.length) errors.push('verification command has unknown or reordered flags')
    return errors
}

function evaluateExecutionReceipt(receipt) {
    const structuralErrors = []
    const acceptanceErrors = []
    if (receipt?.schema !== 'patch-verification-execution-receipt-v2') {
        structuralErrors.push('unsupported execution receipt schema')
    }
    if (!validateDisposition(receipt?.disposition)) {
        structuralErrors.push('unknown receipt disposition')
    }
    if (!verifyDocumentIntegrity(receipt)) {
        structuralErrors.push('receipt integrity mismatch')
    }
    structuralErrors.push(...validateCommandContract(receipt))
    if (
        typeof receipt?.timestamp !== 'string'
        || Number.isNaN(Date.parse(receipt.timestamp))
        || new Date(receipt.timestamp).toISOString() !== receipt.timestamp
    ) structuralErrors.push('receipt timestamp is missing or noncanonical')
    structuralErrors.push(...validateFreezeRecord(receipt?.before, 'before'))
    structuralErrors.push(...validateFreezeRecord(receipt?.after, 'after'))
    const execution = receipt?.execution
    if (!execution || typeof execution !== 'object') {
        structuralErrors.push('execution record is missing')
        return {
            structuralErrors,
            acceptanceErrors: ['execution record is missing'],
            receiptValid: false,
            executionAccepted: false,
        }
    }
    const stdout = typeof execution.stdout === 'string' ? execution.stdout : ''
    const stderr = typeof execution.stderr === 'string' ? execution.stderr : ''
    if (execution.stdoutBytes !== Buffer.byteLength(stdout)) {
        structuralErrors.push('stdout byte count mismatch')
    }
    if (execution.stdoutSha256 !== sha256(stdout)) {
        structuralErrors.push('stdout hash mismatch')
    }
    if (execution.stderrBytes !== Buffer.byteLength(stderr)) {
        structuralErrors.push('stderr byte count mismatch')
    }
    if (execution.stderrSha256 !== sha256(stderr)) {
        structuralErrors.push('stderr hash mismatch')
    }
    const parsed = parseCanonicalOutput(stdout)
    const verifierErrors = validateVerificationResult(receipt?.verificationKind, parsed)
    const operatingRouteId = receipt?.options?.operatingRoute?.routeId ?? null
    const candidateComparisonStatus = receipt?.options?.operatingRoute?.candidateComparisonStatus ?? null
    const qualificationComparisonRequired = receipt?.options?.qualificationRoute !== undefined
    if ((candidateComparisonStatus === 'required' || qualificationComparisonRequired)
        && parsed?.toolchainShadowComparison === undefined) {
        structuralErrors.push('required same-Global comparison output is absent')
    }
    if ((operatingRouteId === 'material-c0-global' || candidateComparisonStatus === 'skipped-local-failure')
        && parsed?.toolchainShadowComparison !== undefined) {
        structuralErrors.push('operating route contains unexpected candidate shadow output')
    }
    try {
        if (canonicalJson(receipt.verifierResult) !== canonicalJson(parsed)) {
            structuralErrors.push('recorded verifier result differs from stdout')
        }
        if (canonicalJson(receipt.verifierErrors) !== canonicalJson(verifierErrors)) {
            structuralErrors.push('recorded verifier errors differ from recomputation')
        }
    } catch (error) {
        structuralErrors.push(`verifier evidence is not canonicalizable: ${error.message}`)
    }
    const stability = receipt?.stability
    let recomputedStability = {
        sourceMatched: false,
        targetMatched: false,
        matched: false,
    }
    try {
        recomputedStability = compareInputFreeze(receipt?.before, receipt?.after)
        if (canonicalJson(stability) !== canonicalJson(recomputedStability)) {
            structuralErrors.push('stability summary differs from pre/post evidence')
        }
    } catch (error) {
        structuralErrors.push(`stability evidence is not canonicalizable: ${error.message}`)
    }
    const recordedRuntime = receipt?.runtime
    const runtimeComparison = compareRuntimeEnvelopes(
        recordedRuntime?.before,
        recordedRuntime?.after,
    )
    try {
        if (canonicalJson(recordedRuntime?.comparison) !== canonicalJson(runtimeComparison)) {
            structuralErrors.push('runtime comparison differs from recomputation')
        }
    } catch (error) {
        structuralErrors.push(`runtime evidence is not canonicalizable: ${error.message}`)
    }

    if (execution.spawnError !== null) acceptanceErrors.push('spawn error is present')
    if (execution.outputError !== null) acceptanceErrors.push('output capture failed')
    if (execution.exitCode !== 0) acceptanceErrors.push('exit code is not zero')
    if (execution.signal !== null) acceptanceErrors.push('child terminated by signal')
    if (Buffer.byteLength(stdout) === 0) acceptanceErrors.push('stdout is empty')
    if (Buffer.byteLength(stderr) !== 0) acceptanceErrors.push('stderr is not empty')
    acceptanceErrors.push(...verifierErrors)
    if (!recomputedStability.sourceMatched) acceptanceErrors.push('source pre/post root mismatch')
    if (!recomputedStability.targetMatched) acceptanceErrors.push('target pre/post root mismatch')
    acceptanceErrors.push(...runtimeComparison.errors)
    const calculatedAccepted = structuralErrors.length === 0 && acceptanceErrors.length === 0
    if (receipt?.accepted !== calculatedAccepted) {
        structuralErrors.push('recorded accepted flag contradicts receipt evidence')
    }
    return {
        structuralErrors,
        acceptanceErrors,
        receiptValid: structuralErrors.length === 0,
        executionAccepted: calculatedAccepted && structuralErrors.length === 0,
    }
}

function dispositionOverrideMap(document) {
    if (document === null) return new Map()
    if (
        document?.schema !== 'patch-verification-receipt-dispositions-v1'
        || !Array.isArray(document.entries)
    ) throw new Error('Receipt disposition override document is missing or incompatible')
    const overrides = new Map()
    for (const entry of document.entries) {
        if (
            !entry
            || typeof entry !== 'object'
            || JSON.stringify(Object.keys(entry).sort()) !== JSON.stringify([
                'disposition',
                'reason',
                'receiptSha256',
            ])
            || !/^[0-9a-f]{64}$/.test(entry.receiptSha256 ?? '')
            || !validateDisposition(entry.disposition)
            || typeof entry.reason !== 'string'
            || entry.reason.trim() === ''
        ) throw new Error('Receipt disposition override entry is invalid')
        if (overrides.has(entry.receiptSha256)) {
            throw new Error(`Duplicate disposition override: ${entry.receiptSha256}`)
        }
        overrides.set(entry.receiptSha256, entry)
    }
    return overrides
}

function buildReceiptRegistry(receiptFiles, { dispositionOverrides = null } = {}) {
    const overrides = dispositionOverrideMap(dispositionOverrides)
    const observedHashes = new Set()
    const entries = receiptFiles.map((file) => {
        const absolute = path.resolve(file)
        const encoded = fs.readFileSync(absolute)
        const receiptSha256 = sha256(encoded)
        if (observedHashes.has(receiptSha256)) {
            throw new Error(`Duplicate receipt content: ${receiptSha256}`)
        }
        observedHashes.add(receiptSha256)
        const receipt = JSON.parse(encoded)
        const evaluation = evaluateExecutionReceipt(receipt)
        if (!evaluation.receiptValid) {
            throw new Error(
                `Cannot register invalid receipt ${absolute}: `
                + evaluation.structuralErrors.join('; '),
            )
        }
        const override = overrides.get(receiptSha256) ?? null
        return {
            file: absolute,
            bytes: encoded.length,
            sha256: receiptSha256,
            schema: receipt.schema,
            recordedDisposition: receipt.disposition,
            disposition: override?.disposition ?? receipt.disposition,
            dispositionSource: override === null ? 'execution-receipt' : 'registry-override',
            dispositionReason: override?.reason ?? null,
            executionAccepted: evaluation.executionAccepted,
            receiptPayloadSha256: receipt.integrity.payloadSha256,
        }
    }).sort((left, right) => left.file < right.file ? -1 : left.file > right.file ? 1 : 0)
    for (const receiptSha256 of overrides.keys()) {
        if (!observedHashes.has(receiptSha256)) {
            throw new Error(`Disposition override does not match a registered receipt: ${receiptSha256}`)
        }
    }
    const counts = Object.fromEntries(RECEIPT_DISPOSITIONS.map((value) => [value, 0]))
    for (const entry of entries) counts[entry.disposition] += 1
    return sealDocument({
        schema: 'patch-verification-receipt-registry-v2',
        generatedAt: new Date().toISOString(),
        counts,
        dispositionOverrides,
        entries,
    })
}

module.exports = {
    INTEGRITY_SCHEMA,
    RECEIPT_DISPOSITIONS,
    buildReceiptRegistry,
    computeGlobalRunId,
    canonicalJson,
    dispositionOverrideMap,
    evaluateExecutionReceipt,
    sealDocument,
    validateDisposition,
    verifyDocumentIntegrity,
}
