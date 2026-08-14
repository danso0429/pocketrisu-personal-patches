'use strict'

const { jsonSha256 } = require('./capability-contract.cjs')

const S1D_SHADOW_STATE_SCHEMA = 'patch-s1d-shadow-state-v1'
const S1D_COMPONENT_RECORD_SCHEMA = 'patch-s1d-component-record-v1'

class S1DShadowStateError extends Error {
    constructor(code, message, details = {}) {
        super(message)
        this.name = 'S1DShadowStateError'
        this.code = code
        this.details = details
    }
}

function componentMap(graph) {
    if (!graph || graph.schema !== 'patch-action-hypergraph-v1') {
        throw new S1DShadowStateError('INVALID_S1D_GRAPH', 'S1-D requires an action hypergraph')
    }
    const { graphSha256, ...payload } = graph
    if (graphSha256 !== jsonSha256(payload)) {
        throw new S1DShadowStateError('S1D_GRAPH_HASH_MISMATCH', 'S1-D graph hash does not match')
    }
    const result = new Map()
    for (const component of graph.components) {
        for (const packId of component.packIds) {
            if (result.has(packId)) throw new S1DShadowStateError('DUPLICATE_S1D_MEMBERSHIP', `Pack ${packId} has two components`)
            result.set(packId, component.id)
        }
    }
    return result
}

function positioned(values, predicate) {
    return values.flatMap((value, position) => predicate(value) ? [{ position, value }] : [])
}

function componentRecord(globalState, graph, component, membership) {
    const packSet = new Set(component.packIds)
    const units = positioned(globalState.units, (unit) => packSet.has(unit.pack))
    const unitIds = new Set(units.map((entry) => entry.value.id))
    const files = []
    for (const [file, value] of Object.entries(globalState.files)) {
        const owners = new Set(globalState.units
            .filter((unit) => unit.file === file)
            .map((unit) => membership.get(unit.pack)))
        if (owners.size !== 1) {
            throw new S1DShadowStateError('CROSS_COMPONENT_STATE_FILE', `${file} crosses component state records`, {
                components: [...owners],
            })
        }
        if (owners.has(component.id)) files.push({ path: file, value })
    }
    const payload = {
        schema: S1D_COMPONENT_RECORD_SCHEMA,
        componentId: component.id,
        componentVersion: graph.graphSha256,
        packIds: component.packIds.filter((packId) => globalState.packs.some((pack) => pack.id === packId)),
        packs: positioned(globalState.packs, (pack) => packSet.has(pack.id)),
        order: positioned(globalState.order, (unitId) => unitIds.has(unitId)),
        units,
        files,
    }
    return { ...payload, etag: jsonSha256(payload) }
}

function reconstructGlobalState(receipt) {
    const packs = receipt.components.flatMap((record) => record.packs)
    const order = receipt.components.flatMap((record) => record.order)
    const units = receipt.components.flatMap((record) => record.units)
    const files = Object.fromEntries(receipt.components
        .flatMap((record) => record.files)
        .sort((left, right) => left.path.localeCompare(right.path))
        .map((entry) => [entry.path, entry.value]))
    const restore = (entries) => entries
        .sort((left, right) => left.position - right.position)
        .map((entry) => entry.value)
    return {
        ...receipt.compatibilityProjection,
        packs: restore(packs),
        order: restore(order),
        units: restore(units),
        files,
    }
}

function validateS1DShadowState(receipt, { globalState, graph }) {
    if (!receipt || receipt.schema !== S1D_SHADOW_STATE_SCHEMA || receipt.status !== 'passed') {
        throw new S1DShadowStateError('INVALID_S1D_RECEIPT', 'S1-D receipt schema or status is invalid')
    }
    const { receiptSha256, ...payload } = receipt
    if (receiptSha256 !== jsonSha256(payload)) throw new S1DShadowStateError('S1D_RECEIPT_HASH_MISMATCH', 'S1-D receipt hash does not match')
    if (receipt.globalStateSha256 !== jsonSha256(globalState) || receipt.graphSha256 !== graph.graphSha256) {
        throw new S1DShadowStateError('S1D_COHORT_MISMATCH', 'S1-D state or graph cohort changed')
    }
    const expected = graph.components.map((component) => component.id).sort()
    const actual = receipt.components.map((record) => record.componentId).sort()
    if (new Set(actual).size !== actual.length || JSON.stringify(expected) !== JSON.stringify(actual)) {
        throw new S1DShadowStateError('S1D_COMPONENT_COVERAGE_MISMATCH', 'S1-D component coverage is incomplete')
    }
    for (const record of receipt.components) {
        const { etag, ...recordPayload } = record
        if (etag !== jsonSha256(recordPayload) || record.componentVersion !== graph.graphSha256) {
            throw new S1DShadowStateError('S1D_COMPONENT_ETAG_MISMATCH', `S1-D record ${record.componentId} is corrupt or stale`)
        }
    }
    if (jsonSha256(reconstructGlobalState(receipt)) !== jsonSha256(globalState)) {
        throw new S1DShadowStateError('S1D_SEMANTIC_MISMATCH', 'S1-D reconstruction differs from global state')
    }
    return receipt
}

function compileS1DShadowState({ globalState, graph }) {
    if (!globalState || globalState.format !== 2 || !Array.isArray(globalState.packs) || !Array.isArray(globalState.units)) {
        throw new S1DShadowStateError('UNSUPPORTED_GLOBAL_STATE', 'S1-D requires current global state format 2')
    }
    const membership = componentMap(graph)
    for (const pack of globalState.packs) {
        if (!membership.has(pack.id)) throw new S1DShadowStateError('MISSING_S1D_COMPONENT', `State pack ${pack.id} has no component`)
    }
    const components = graph.components.map((component) =>
        componentRecord(globalState, graph, component, membership)
    )
    const compatibilityProjection = Object.fromEntries(Object.entries(globalState).filter(([key]) =>
        !['packs', 'order', 'units', 'files'].includes(key)
    ))
    const payload = {
        schema: S1D_SHADOW_STATE_SCHEMA,
        status: 'passed',
        globalStateSha256: jsonSha256(globalState),
        graphSha256: graph.graphSha256,
        compatibilityProjection,
        components,
        comparison: {
            semanticMatch: true,
            componentCount: components.length,
            missingComponents: [],
            duplicateComponents: [],
        },
        canonicalProtection: {
            globalStateSoleAuthority: true,
            productionStateWritten: false,
            shadowUsedToSkip: false,
            certificatesIssued: 0,
            defaultChanged: false,
        },
    }
    const receipt = { ...payload, receiptSha256: jsonSha256(payload) }
    return validateS1DShadowState(receipt, { globalState, graph })
}

module.exports = {
    S1D_COMPONENT_RECORD_SCHEMA,
    S1D_SHADOW_STATE_SCHEMA,
    S1DShadowStateError,
    compileS1DShadowState,
    reconstructGlobalState,
    validateS1DShadowState,
}
