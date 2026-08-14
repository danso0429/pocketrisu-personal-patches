'use strict'

const {
    CapabilityContractError,
    jsonSha256,
    validateCapabilityContract,
} = require('./capability-contract.cjs')

const ACTION_HYPERGRAPH_SCHEMA = 'patch-action-hypergraph-v1'

class ActionHypergraphError extends Error {
    constructor(code, message, details = {}) {
        super(message)
        this.name = 'ActionHypergraphError'
        this.code = code
        this.details = details
    }
}

class DisjointSet {
    constructor(values) {
        this.parents = new Map(values.map((value) => [value, value]))
    }

    find(value) {
        if (!this.parents.has(value)) {
            throw new ActionHypergraphError('UNKNOWN_COMPONENT_MEMBER', `Unknown component member ${value}`)
        }
        const parent = this.parents.get(value)
        if (parent === value) return value
        const root = this.find(parent)
        this.parents.set(value, root)
        return root
    }

    union(left, right) {
        const leftRoot = this.find(left)
        const rightRoot = this.find(right)
        if (leftRoot === rightRoot) return
        const [first, second] = [leftRoot, rightRoot].sort()
        this.parents.set(second, first)
    }

    clone() {
        const result = new DisjointSet([])
        result.parents = new Map(this.parents)
        return result
    }

    groups() {
        const groups = new Map()
        for (const value of [...this.parents.keys()].sort()) {
            const root = this.find(value)
            if (!groups.has(root)) groups.set(root, [])
            groups.get(root).push(value)
        }
        return [...groups.values()].sort((left, right) =>
            right.length - left.length || left[0].localeCompare(right[0])
        )
    }
}

function assertInventory(inventory, contract) {
    if (!inventory || inventory.schema !== 'patch-effect-inventory-v1') {
        throw new ActionHypergraphError('INVALID_INVENTORY', 'Action graph requires a Phase 1 inventory')
    }
    if (inventory.inventorySha256 !== contract.inventorySha256) {
        throw new ActionHypergraphError('INVENTORY_CONTRACT_MISMATCH', 'Inventory and contract do not match')
    }
}

function nodeId(type, value) {
    return `${type}:${value}`
}

function componentRecord(packIds) {
    return {
        id: `component:${jsonSha256(packIds).slice(0, 20)}`,
        packIds,
    }
}

function completeBoundaryFor(contract, surface, resource, participants) {
    const participantSet = new Set(participants)
    return contract.boundaries.find((boundary) => {
        if (
            boundary.surface !== surface
            || boundary.resource !== resource
            || boundary.validation.completeness !== 'complete'
        ) return false
        const members = new Set([...boundary.providers, ...boundary.consumers])
        return members.size === participantSet.size
            && [...participantSet].every((packId) => members.has(packId))
    }) ?? null
}

function addUnion(disjointSet, participants) {
    for (const participant of participants.slice(1)) {
        disjointSet.union(participants[0], participant)
    }
}

function compileActionHypergraph(inventory, contract) {
    try {
        validateCapabilityContract(contract)
    } catch (error) {
        if (error instanceof CapabilityContractError) {
            throw new ActionHypergraphError('INVALID_CAPABILITY_CONTRACT', error.message, {
                causeCode: error.code,
            })
        }
        throw error
    }
    assertInventory(inventory, contract)
    const packIds = [...contract.target.packIds].sort()
    const unitIds = new Set(contract.target.unitIds)
    const packSet = new Set(packIds)
    const inventoryUnits = new Map(inventory.units.map((unit) => [unit.id, unit]))
    const local = new DisjointSet(packIds)
    const nodes = []
    const edges = []
    const hyperedges = []

    for (const packId of packIds) {
        nodes.push({ id: nodeId('pack', packId), type: 'pack', value: packId })
    }
    for (const unitId of [...unitIds].sort()) {
        const unit = inventoryUnits.get(unitId)
        if (!unit || !packSet.has(unit.packId)) {
            throw new ActionHypergraphError('UNKNOWN_GRAPH_UNIT', `Unknown graph unit ${unitId}`)
        }
        nodes.push({ id: nodeId('unit', unitId), type: 'unit', value: unitId })
        edges.push({
            kind: 'contains',
            from: nodeId('pack', unit.packId),
            to: nodeId('unit', unitId),
            resource: null,
        })
    }

    const resources = new Set()
    for (const capability of contract.capabilities) {
        const resourceId = nodeId('resource', `${capability.kind}:${capability.resource}`)
        resources.add(resourceId)
        edges.push({
            kind: `capability-${capability.access}`,
            from: capability.unitId === null
                ? nodeId('pack', capability.packId)
                : nodeId('unit', capability.unitId),
            to: resourceId,
            resource: capability.id,
        })
    }
    for (const resourceId of [...resources].sort()) {
        nodes.push({ id: resourceId, type: 'resource', value: resourceId.slice('resource:'.length) })
    }

    for (const relation of inventory.relations.packEdges) {
        if (!packSet.has(relation.from) || !packSet.has(relation.to)) continue
        edges.push({
            kind: `pack-${relation.relation}`,
            from: nodeId('pack', relation.from),
            to: nodeId('pack', relation.to),
            resource: null,
        })
        local.union(relation.from, relation.to)
    }

    for (const relation of inventory.relations.unitEdges) {
        if (!unitIds.has(relation.from) || !unitIds.has(relation.to)) continue
        const fromPack = inventoryUnits.get(relation.from).packId
        const toPack = inventoryUnits.get(relation.to).packId
        edges.push({
            kind: `unit-${relation.relation}`,
            from: nodeId('unit', relation.from),
            to: nodeId('unit', relation.to),
            resource: null,
        })
        if (fromPack !== toPack) local.union(fromPack, toPack)
    }

    for (const file of inventory.files) {
        const participants = [...new Set(file.units
            .filter((unitId) => unitIds.has(unitId))
            .map((unitId) => inventoryUnits.get(unitId).packId))]
            .sort()
        if (participants.length < 2) continue
        const boundary = completeBoundaryFor(contract, 'file', file.file, participants)
        hyperedges.push({
            id: `shared-file:${jsonSha256([file.file, participants]).slice(0, 20)}`,
            kind: 'shared-file',
            participants,
            resource: file.file,
            condition: null,
            admittedBoundary: boundary?.id ?? null,
        })
        if (boundary === null) addUnion(local, participants)
    }

    for (const relation of inventory.relations.autoWhenHyperedges) {
        const completeParticipants = [
            relation.subject,
            ...relation.all,
            ...relation.any,
            ...relation.none,
        ]
        const participants = [...new Set(completeParticipants.filter((packId) => packSet.has(packId)))]
            .sort()
        if (participants.length === 0) continue
        hyperedges.push({
            id: `auto-when:${relation.subject}`,
            kind: 'auto-when',
            participants,
            resource: null,
            condition: {
                subject: relation.subject,
                all: [...relation.all],
                any: [...relation.any],
                none: [...relation.none],
            },
            admittedBoundary: null,
        })
        if (participants.length > 1) addUnion(local, participants)
    }

    for (const boundary of contract.boundaries) {
        const participants = [...new Set([...boundary.providers, ...boundary.consumers])].sort()
        hyperedges.push({
            id: `typed-boundary:${boundary.id}`,
            kind: 'typed-boundary',
            participants,
            resource: `${boundary.surface}:${boundary.resource}`,
            condition: {
                inputClasses: [...boundary.inputClasses],
                validator: boundary.validation.validator,
            },
            admittedBoundary: boundary.id,
        })
    }

    const global = local.clone()
    const fallbackPacks = contract.packs
        .filter((pack) => pack.tier === 'G' || pack.tier === 'U')
        .map((pack) => pack.packId)
        .sort()
    if (fallbackPacks.length > 1) addUnion(global, fallbackPacks)
    if (fallbackPacks.length > 0) {
        hyperedges.push({
            id: 'global-fallback',
            kind: 'global-fallback',
            participants: fallbackPacks,
            resource: 'Global Exhaustive',
            condition: null,
            admittedBoundary: null,
        })
    }

    const payload = {
        schema: ACTION_HYPERGRAPH_SCHEMA,
        contractSha256: contract.contractSha256,
        target: { ...contract.target },
        nodes: nodes.sort((left, right) => left.id.localeCompare(right.id)),
        edges: edges.sort((left, right) =>
            left.kind.localeCompare(right.kind)
            || left.from.localeCompare(right.from)
            || left.to.localeCompare(right.to)
            || String(left.resource).localeCompare(String(right.resource))
        ),
        hyperedges: hyperedges.sort((left, right) => left.id.localeCompare(right.id)),
        localComponents: local.groups().map(componentRecord),
        components: global.groups().map(componentRecord),
        fallback: {
            required: fallbackPacks.length > 0,
            reasons: fallbackPacks.length > 0
                ? [
                    'global-or-unsupported-pack-present',
                    'global-persisted-selection-state',
                    'unsealed-legacy-runtime-surface',
                ]
                : [],
        },
    }
    return {
        ...payload,
        graphSha256: jsonSha256(payload),
    }
}

module.exports = {
    ACTION_HYPERGRAPH_SCHEMA,
    ActionHypergraphError,
    compileActionHypergraph,
}
