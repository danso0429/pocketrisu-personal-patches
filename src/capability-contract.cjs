'use strict'

const crypto = require('node:crypto')

const CAPABILITY_CONTRACT_SCHEMA = 'patch-capability-contract-v1'
const TYPED_BOUNDARY_SCHEMA = 'patch-typed-boundary-v1'

const CAPABILITY_KINDS = Object.freeze([
    'environment',
    'file-descriptor',
    'filesystem',
    'history',
    'metadata',
    'module',
    'native-binding',
    'network',
    'process',
    'promise',
    'randomness',
    'region',
    'state',
    'stream',
    'subprocess',
    'symbol',
    'target-identity',
    'time',
    'topology',
    'worker',
])
const CAPABILITY_ACCESSES = Object.freeze([
    'delete',
    'execute',
    'manage',
    'observe',
    'read',
    'write',
])
const CAPABILITY_SOURCES = Object.freeze([
    'legacy-observation',
    'manager-contract',
    'manifest-declaration',
    'runtime-policy',
    'unit-ir',
    'unknown',
])
const ENFORCEMENT_MODES = Object.freeze(['denied', 'observed', 'unsealed', 'wrapped'])
const BOUNDARY_SURFACES = Object.freeze([
    'environment',
    'file',
    'history',
    'region',
    'selection',
    'state',
    'symbol',
    'target',
])

class CapabilityContractError extends Error {
    constructor(code, message, details = {}) {
        super(message)
        this.name = 'CapabilityContractError'
        this.code = code
        this.details = details
    }
}

function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue)
    if (!value || typeof value !== 'object') return value
    return Object.fromEntries(
        Object.keys(value).sort().map((key) => [key, stableValue(value[key])]),
    )
}

function jsonSha256(value) {
    return crypto.createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex')
}

function assertObject(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new CapabilityContractError('INVALID_CONTRACT', `${label} must be an object`)
    }
}

function assertExactKeys(value, keys, label) {
    const expected = [...keys].sort()
    const actual = Object.keys(value).sort()
    if (
        expected.length !== actual.length
        || expected.some((key, index) => key !== actual[index])
    ) {
        throw new CapabilityContractError('UNKNOWN_CONTRACT_FIELD', `${label} has unknown or missing fields`, {
            expected,
            actual,
        })
    }
}

function assertString(value, label) {
    if (typeof value !== 'string' || value.length === 0) {
        throw new CapabilityContractError('INVALID_CONTRACT', `${label} must be a non-empty string`)
    }
}

function assertStringArray(value, label, { nonEmpty = false } = {}) {
    if (
        !Array.isArray(value)
        || (nonEmpty && value.length === 0)
        || value.some((entry) => typeof entry !== 'string' || entry.length === 0)
        || new Set(value).size !== value.length
    ) {
        throw new CapabilityContractError('INVALID_CONTRACT', `${label} must contain unique strings`)
    }
}

function validateTypedBoundary(boundary, knownPacks) {
    assertObject(boundary, 'boundary')
    assertExactKeys(boundary, [
        'schema',
        'id',
        'version',
        'surface',
        'resource',
        'direction',
        'providers',
        'consumers',
        'inputClasses',
        'validation',
        'fallback',
    ], `boundary ${boundary.id ?? '<unknown>'}`)
    if (boundary.schema !== TYPED_BOUNDARY_SCHEMA) {
        throw new CapabilityContractError('UNKNOWN_BOUNDARY_SCHEMA', 'Unknown typed boundary schema')
    }
    assertString(boundary.id, 'boundary.id')
    assertString(boundary.version, `${boundary.id}.version`)
    if (!BOUNDARY_SURFACES.includes(boundary.surface)) {
        throw new CapabilityContractError('UNKNOWN_BOUNDARY_SURFACE', `${boundary.id} has an unknown surface`)
    }
    assertString(boundary.resource, `${boundary.id}.resource`)
    if (!['provider-to-consumer', 'bidirectional'].includes(boundary.direction)) {
        throw new CapabilityContractError('INVALID_BOUNDARY', `${boundary.id} has an invalid direction`)
    }
    assertStringArray(boundary.providers, `${boundary.id}.providers`, { nonEmpty: true })
    assertStringArray(boundary.consumers, `${boundary.id}.consumers`, { nonEmpty: true })
    assertStringArray(boundary.inputClasses, `${boundary.id}.inputClasses`, { nonEmpty: true })
    for (const packId of [...boundary.providers, ...boundary.consumers]) {
        if (!knownPacks.has(packId)) {
            throw new CapabilityContractError('UNKNOWN_BOUNDARY_PACK', `${boundary.id} references ${packId}`)
        }
    }
    assertObject(boundary.validation, `${boundary.id}.validation`)
    assertExactKeys(boundary.validation, ['completeness', 'validator'], `${boundary.id}.validation`)
    if (!['complete', 'incomplete', 'unknown'].includes(boundary.validation.completeness)) {
        throw new CapabilityContractError('INVALID_BOUNDARY', `${boundary.id} has invalid completeness`)
    }
    assertString(boundary.validation.validator, `${boundary.id}.validation.validator`)
    if (!['component-union', 'global-exhaustive', 'reject'].includes(boundary.fallback)) {
        throw new CapabilityContractError('INVALID_BOUNDARY', `${boundary.id} has invalid fallback`)
    }
    if (
        boundary.validation.completeness !== 'complete'
        && boundary.fallback === 'component-union'
    ) {
        throw new CapabilityContractError(
            'INCOMPLETE_BOUNDARY_MUST_FAIL_CLOSED',
            `${boundary.id} cannot retain a local boundary when validation is incomplete`,
        )
    }
    return boundary
}

function validateCapability(capability, knownPacks, knownUnits) {
    assertObject(capability, 'capability')
    assertExactKeys(capability, [
        'id',
        'packId',
        'unitId',
        'kind',
        'access',
        'resource',
        'source',
        'enforcement',
        'componentSafe',
    ], `capability ${capability.id ?? '<unknown>'}`)
    assertString(capability.id, 'capability.id')
    assertString(capability.packId, `${capability.id}.packId`)
    if (!knownPacks.has(capability.packId)) {
        throw new CapabilityContractError('UNKNOWN_CAPABILITY_PACK', `${capability.id} has an unknown pack`)
    }
    if (capability.unitId !== null) {
        assertString(capability.unitId, `${capability.id}.unitId`)
        if (!knownUnits.has(capability.unitId)) {
            throw new CapabilityContractError('UNKNOWN_CAPABILITY_UNIT', `${capability.id} has an unknown unit`)
        }
    }
    if (!CAPABILITY_KINDS.includes(capability.kind)) {
        throw new CapabilityContractError('UNKNOWN_CAPABILITY_KIND', `${capability.id} has an unknown kind`)
    }
    if (!CAPABILITY_ACCESSES.includes(capability.access)) {
        throw new CapabilityContractError('UNKNOWN_CAPABILITY_ACCESS', `${capability.id} has an unknown access`)
    }
    assertString(capability.resource, `${capability.id}.resource`)
    if (!CAPABILITY_SOURCES.includes(capability.source)) {
        throw new CapabilityContractError('UNKNOWN_CAPABILITY_SOURCE', `${capability.id} has an unknown source`)
    }
    if (!ENFORCEMENT_MODES.includes(capability.enforcement)) {
        throw new CapabilityContractError('UNKNOWN_ENFORCEMENT_MODE', `${capability.id} has an unknown enforcement`)
    }
    if (typeof capability.componentSafe !== 'boolean') {
        throw new CapabilityContractError('INVALID_CONTRACT', `${capability.id}.componentSafe must be boolean`)
    }
    if (capability.componentSafe && !['denied', 'wrapped'].includes(capability.enforcement)) {
        throw new CapabilityContractError(
            'UNSEALED_CAPABILITY_CANNOT_BE_COMPONENT_SAFE',
            `${capability.id} is not mechanically enforced`,
        )
    }
    return capability
}

function validateCapabilityContract(contract, { verifyHash = true } = {}) {
    assertObject(contract, 'contract')
    assertExactKeys(contract, [
        'schema',
        'mode',
        'inventorySha256',
        'target',
        'packs',
        'capabilities',
        'boundaries',
        'unknownSurfaces',
        'canonicalProtection',
        'contractSha256',
    ], 'contract')
    if (contract.schema !== CAPABILITY_CONTRACT_SCHEMA || contract.mode !== 'audit') {
        throw new CapabilityContractError('UNKNOWN_CONTRACT_SCHEMA', 'Unknown capability contract schema or mode')
    }
    if (!/^[0-9a-f]{64}$/.test(contract.inventorySha256)) {
        throw new CapabilityContractError('INVALID_CONTRACT', 'inventorySha256 must be SHA-256')
    }
    assertObject(contract.target, 'target')
    assertExactKeys(contract.target, [
        'packageName',
        'packageVersion',
        'resolvedPackIds',
        'resolvedUnitIds',
    ], 'target')
    for (const key of ['packageName', 'packageVersion']) {
        if (contract.target[key] !== null) assertString(contract.target[key], `target.${key}`)
    }
    assertStringArray(contract.target.resolvedPackIds, 'target.resolvedPackIds')
    assertStringArray(contract.target.resolvedUnitIds, 'target.resolvedUnitIds')
    const knownPacks = new Set(contract.target.resolvedPackIds)
    const knownUnits = new Set(contract.target.resolvedUnitIds)

    if (!Array.isArray(contract.capabilities) || !Array.isArray(contract.packs)) {
        throw new CapabilityContractError('INVALID_CONTRACT', 'packs and capabilities must be arrays')
    }
    const capabilityIds = new Set()
    const capabilityById = new Map()
    for (const capability of contract.capabilities) {
        validateCapability(capability, knownPacks, knownUnits)
        if (capabilityIds.has(capability.id)) {
            throw new CapabilityContractError('DUPLICATE_CAPABILITY', `Duplicate capability ${capability.id}`)
        }
        capabilityIds.add(capability.id)
        capabilityById.set(capability.id, capability)
    }

    const seenPacks = new Set()
    const referencedCapabilities = new Set()
    for (const pack of contract.packs) {
        assertObject(pack, 'pack admission')
        assertExactKeys(pack, ['packId', 'tier', 'admission', 'capabilityIds', 'reasons'], 'pack admission')
        assertString(pack.packId, 'pack.packId')
        if (!knownPacks.has(pack.packId) || seenPacks.has(pack.packId)) {
            throw new CapabilityContractError('INVALID_PACK_ADMISSION', `Invalid pack admission ${pack.packId}`)
        }
        seenPacks.add(pack.packId)
        if (!['L', 'B', 'G', 'U'].includes(pack.tier)) {
            throw new CapabilityContractError('INVALID_PACK_ADMISSION', `${pack.packId} has invalid tier`)
        }
        const expectedAdmission = {
            L: 'component-safe',
            B: 'boundary-safe',
            G: 'global-fallback',
            U: 'rejected',
        }[pack.tier]
        if (pack.admission !== expectedAdmission) {
            throw new CapabilityContractError('INVALID_PACK_ADMISSION', `${pack.packId} has inconsistent admission`)
        }
        assertStringArray(pack.capabilityIds, `${pack.packId}.capabilityIds`)
        assertStringArray(pack.reasons, `${pack.packId}.reasons`)
        if (['G', 'U'].includes(pack.tier) && pack.reasons.length === 0) {
            throw new CapabilityContractError('INVALID_PACK_ADMISSION', `${pack.packId} requires a fail-closed reason`)
        }
        for (const id of pack.capabilityIds) {
            if (!capabilityIds.has(id)) {
                throw new CapabilityContractError('UNKNOWN_PACK_CAPABILITY', `${pack.packId} references ${id}`)
            }
            if (capabilityById.get(id).packId !== pack.packId) {
                throw new CapabilityContractError('CROSS_PACK_CAPABILITY', `${pack.packId} cannot claim ${id}`)
            }
            referencedCapabilities.add(id)
        }
        if (
            pack.tier === 'L'
            && pack.capabilityIds.some((id) => !capabilityById.get(id).componentSafe)
        ) {
            throw new CapabilityContractError(
                'UNSAFE_LOCAL_ADMISSION',
                `${pack.packId} has a capability that is not component-safe`,
            )
        }
    }
    if (seenPacks.size !== knownPacks.size) {
        throw new CapabilityContractError('MISSING_PACK_ADMISSION', 'Every resolved pack requires an admission')
    }
    if (referencedCapabilities.size !== capabilityIds.size) {
        throw new CapabilityContractError('ORPHAN_CAPABILITY', 'Every capability must belong to its pack admission')
    }

    if (!Array.isArray(contract.boundaries)) {
        throw new CapabilityContractError('INVALID_CONTRACT', 'boundaries must be an array')
    }
    const boundaryIds = new Set()
    for (const boundary of contract.boundaries) {
        validateTypedBoundary(boundary, knownPacks)
        if (boundaryIds.has(boundary.id)) {
            throw new CapabilityContractError('DUPLICATE_BOUNDARY', `Duplicate boundary ${boundary.id}`)
        }
        boundaryIds.add(boundary.id)
    }
    for (const pack of contract.packs.filter((entry) => entry.tier === 'B')) {
        const admittedBoundary = contract.boundaries.some((boundary) =>
            boundary.validation.completeness === 'complete'
            && boundary.fallback === 'component-union'
            && (
                boundary.providers.includes(pack.packId)
                || boundary.consumers.includes(pack.packId)
            )
        )
        if (!admittedBoundary) {
            throw new CapabilityContractError(
                'UNSAFE_BOUNDARY_ADMISSION',
                `${pack.packId} has no complete typed boundary`,
            )
        }
    }
    assertStringArray(contract.unknownSurfaces, 'unknownSurfaces')
    if (
        contract.unknownSurfaces.length > 0
        && contract.packs.some((pack) => pack.tier === 'L' || pack.tier === 'B')
    ) {
        throw new CapabilityContractError(
            'UNKNOWN_SURFACE_CANNOT_BE_LOCAL',
            'Unknown capability surfaces require global fallback or rejection',
        )
    }
    assertObject(contract.canonicalProtection, 'canonicalProtection')
    assertExactKeys(contract.canonicalProtection, [
        'canonicalGate',
        'globalFallbackRequired',
        'defaultChanged',
        'stateChanged',
        'certificatesIssued',
        'masksSkipped',
    ], 'canonicalProtection')
    if (
        contract.canonicalProtection.canonicalGate !== 'Global Exhaustive'
        || contract.canonicalProtection.globalFallbackRequired !== true
        || contract.canonicalProtection.defaultChanged !== false
        || contract.canonicalProtection.stateChanged !== false
        || contract.canonicalProtection.certificatesIssued !== 0
        || contract.canonicalProtection.masksSkipped !== 0
    ) {
        throw new CapabilityContractError('CANONICAL_PROTECTION_VIOLATION', 'Phase 2 must preserve the canonical gate')
    }
    const { contractSha256, ...payload } = contract
    const expectedHash = jsonSha256(payload)
    if (verifyHash && contractSha256 !== expectedHash) {
        throw new CapabilityContractError('CONTRACT_HASH_MISMATCH', 'Capability contract hash does not match')
    }
    return contract
}

function sealCapabilityContract(payload) {
    const contract = {
        ...payload,
        contractSha256: jsonSha256(payload),
    }
    return validateCapabilityContract(contract)
}

module.exports = {
    BOUNDARY_SURFACES,
    CAPABILITY_ACCESSES,
    CAPABILITY_CONTRACT_SCHEMA,
    CAPABILITY_KINDS,
    CAPABILITY_SOURCES,
    CapabilityContractError,
    ENFORCEMENT_MODES,
    TYPED_BOUNDARY_SCHEMA,
    jsonSha256,
    sealCapabilityContract,
    validateCapability,
    validateCapabilityContract,
    validateTypedBoundary,
}
