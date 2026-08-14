'use strict'

const {
    CAPABILITY_CONTRACT_SCHEMA,
    CapabilityContractError,
    jsonSha256,
    sealCapabilityContract,
} = require('./capability-contract.cjs')

const UNSEALED_LEGACY_SURFACES = Object.freeze([
    Object.freeze({ kind: 'environment', access: 'read', resource: 'application-environment' }),
    Object.freeze({ kind: 'file-descriptor', access: 'manage', resource: 'pre-opened-file-descriptors' }),
    Object.freeze({ kind: 'history', access: 'observe', resource: 'unmanaged-worker-history' }),
    Object.freeze({ kind: 'native-binding', access: 'execute', resource: 'application-native-bindings' }),
    Object.freeze({ kind: 'network', access: 'execute', resource: 'application-network' }),
    Object.freeze({ kind: 'process', access: 'manage', resource: 'application-process-global-state' }),
    Object.freeze({ kind: 'promise', access: 'manage', resource: 'application-promises' }),
    Object.freeze({ kind: 'randomness', access: 'read', resource: 'application-randomness' }),
    Object.freeze({ kind: 'stream', access: 'manage', resource: 'application-streams' }),
    Object.freeze({ kind: 'subprocess', access: 'execute', resource: 'application-subprocesses' }),
    Object.freeze({ kind: 'symbol', access: 'manage', resource: 'application-symbol-registry' }),
    Object.freeze({ kind: 'time', access: 'read', resource: 'application-time' }),
    Object.freeze({ kind: 'worker', access: 'execute', resource: 'application-workers' }),
])

function assertInventory(inventory) {
    if (!inventory || inventory.schema !== 'patch-effect-inventory-v1') {
        throw new CapabilityContractError('INVALID_INVENTORY', 'Phase 2 requires a Phase 1 inventory')
    }
    const { inventorySha256, ...payload } = inventory
    if (inventorySha256 !== jsonSha256(payload)) {
        throw new CapabilityContractError('INVENTORY_HASH_MISMATCH', 'Phase 1 inventory hash does not match')
    }
    if (inventory.completeness?.status !== 'complete-observational') {
        throw new CapabilityContractError('INCOMPLETE_INVENTORY', 'Phase 1 inventory is incomplete')
    }
}

function sortedUnique(values) {
    return [...new Set(values)].sort()
}

function capabilityId({ packId, unitId, kind, access, resource }) {
    const resourceHash = jsonSha256(resource).slice(0, 16)
    return `cap:${packId}:${unitId ?? '-'}:${kind}:${access}:${resourceHash}`
}

function capability(value) {
    return {
        id: capabilityId(value),
        packId: value.packId,
        unitId: value.unitId ?? null,
        kind: value.kind,
        access: value.access,
        resource: value.resource,
        source: value.source,
        enforcement: value.enforcement,
        componentSafe: value.componentSafe,
    }
}

function unitCapabilities(unit) {
    const values = [
        {
            kind: 'filesystem',
            access: 'read',
            resource: unit.file,
        },
        {
            kind: 'filesystem',
            access: 'write',
            resource: unit.file,
        },
        {
            kind: 'metadata',
            access: 'read',
            resource: unit.file,
        },
        {
            kind: 'metadata',
            access: 'write',
            resource: unit.file,
        },
        {
            kind: 'topology',
            access: 'read',
            resource: unit.file,
        },
    ]
    if (unit.type === 'owned') {
        values.push({ kind: 'filesystem', access: 'delete', resource: unit.file })
    } else {
        values.push(
            { kind: 'region', access: 'read', resource: `${unit.file}#${unit.id}` },
            { kind: 'region', access: 'write', resource: `${unit.file}#${unit.id}` },
        )
    }
    return values.map((value) => capability({
        ...value,
        packId: unit.packId,
        unitId: unit.id,
        source: 'unit-ir',
        enforcement: 'wrapped',
        componentSafe: true,
    }))
}

function packCapabilities(packId, globalStateSurfaces) {
    const values = [
        capability({
            packId,
            kind: 'module',
            access: 'execute',
            resource: `commonjs-manifest:${packId}`,
            source: 'legacy-observation',
            enforcement: 'observed',
            componentSafe: false,
        }),
        ...globalStateSurfaces.flatMap((surface) => [
            capability({
                packId,
                kind: 'state',
                access: 'read',
                resource: surface.path,
                source: 'manager-contract',
                enforcement: 'wrapped',
                componentSafe: false,
            }),
            capability({
                packId,
                kind: 'state',
                access: 'write',
                resource: surface.path,
                source: 'manager-contract',
                enforcement: 'wrapped',
                componentSafe: false,
            }),
        ]),
        ...UNSEALED_LEGACY_SURFACES.map((surface) => capability({
            ...surface,
            packId,
            source: 'unknown',
            enforcement: 'unsealed',
            componentSafe: false,
        })),
    ]
    return values
}

function targetScope(inventory, {
    packageName,
    packageVersion,
    scope,
    packIds,
    unitIds,
}) {
    if (!['target-catalog', 'resolved-selection'].includes(scope)) {
        throw new CapabilityContractError('INVALID_TARGET_SCOPE', `Unknown target scope ${scope}`)
    }
    if (scope === 'target-catalog') {
        const view = inventory.targetViews.find((candidate) =>
            candidate.target.packageName === packageName
            && candidate.target.packageVersion === packageVersion
        )
        if (!view) {
            throw new CapabilityContractError('UNKNOWN_TARGET', `${packageName}@${packageVersion} is not inventoried`)
        }
        return {
            packageName,
            packageVersion,
            scope,
            packIds: inventory.packs.map((pack) => pack.id).sort(),
            unitIds: [...view.unitIds].sort(),
        }
    }
    return {
        packageName,
        packageVersion,
        scope,
        packIds: sortedUnique(packIds ?? []),
        unitIds: sortedUnique(unitIds ?? []),
    }
}

function compileCapabilityContract(inventory, options) {
    assertInventory(inventory)
    const target = targetScope(inventory, options)
    const inventoryPacks = new Map(inventory.packs.map((pack) => [pack.id, pack]))
    const inventoryUnits = new Map(inventory.units.map((unit) => [unit.id, unit]))
    for (const packId of target.packIds) {
        if (!inventoryPacks.has(packId)) {
            throw new CapabilityContractError('UNKNOWN_TARGET_PACK', `Unknown target pack ${packId}`)
        }
    }
    for (const unitId of target.unitIds) {
        const unit = inventoryUnits.get(unitId)
        if (!unit || !target.packIds.includes(unit.packId)) {
            throw new CapabilityContractError('UNKNOWN_TARGET_UNIT', `Unknown target unit ${unitId}`)
        }
    }

    const capabilities = [
        ...target.unitIds.flatMap((unitId) => unitCapabilities(inventoryUnits.get(unitId))),
        ...target.packIds.flatMap((packId) =>
            packCapabilities(packId, inventory.state.patcherGlobalSurfaces)
        ),
    ].sort((left, right) => left.id.localeCompare(right.id))
    if (new Set(capabilities.map((entry) => entry.id)).size !== capabilities.length) {
        throw new CapabilityContractError('DUPLICATE_CAPABILITY', 'Compiled capability ids are not unique')
    }
    const capabilitiesByPack = new Map(target.packIds.map((packId) => [packId, []]))
    for (const entry of capabilities) capabilitiesByPack.get(entry.packId).push(entry.id)

    const packs = target.packIds.map((packId) => {
        const inventoryPack = inventoryPacks.get(packId)
        const rejected = inventoryPack.candidateTier === 'U'
        return {
            packId,
            tier: rejected ? 'U' : 'G',
            admission: rejected ? 'rejected' : 'global-fallback',
            capabilityIds: capabilitiesByPack.get(packId).sort(),
            reasons: rejected
                ? ['unsupported-or-invalid-inventory-surface']
                : [
                    'global-persisted-selection-state',
                    'unsealed-commonjs-manifest-execution',
                    'opaque-application-runtime-effects',
                ],
        }
    })
    return sealCapabilityContract({
        schema: CAPABILITY_CONTRACT_SCHEMA,
        mode: 'audit',
        inventorySha256: inventory.inventorySha256,
        target,
        packs,
        capabilities,
        boundaries: [],
        unknownSurfaces: UNSEALED_LEGACY_SURFACES
            .map((surface) => `${surface.kind}:${surface.resource}`)
            .sort(),
        canonicalProtection: {
            canonicalGate: 'Global Exhaustive',
            globalFallbackRequired: true,
            defaultChanged: false,
            stateChanged: false,
            certificatesIssued: 0,
            masksSkipped: 0,
        },
    })
}

module.exports = {
    UNSEALED_LEGACY_SURFACES,
    compileCapabilityContract,
}
