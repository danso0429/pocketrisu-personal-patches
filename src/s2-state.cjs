'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { jsonSha256 } = require('./capability-contract.cjs')

const S2_SNAPSHOT_SCHEMA = 'patch-s2-snapshot-v1'
const S2_REGISTRY_SCHEMA = 'patch-s2-registry-v1'
const S2_COMPONENT_SCHEMA = 'patch-s2-component-record-v1'

class S2StateError extends Error {
    constructor(code, message, details = {}) {
        super(message)
        this.name = 'S2StateError'
        this.code = code
        this.details = details
    }
}

function hashPair(left, right) {
    return crypto.createHash('sha256')
        .update(Buffer.concat([Buffer.from(left, 'hex'), Buffer.from(right, 'hex')]))
        .digest('hex')
}

function merkleTree(leaves) {
    if (leaves.length === 0) throw new S2StateError('EMPTY_S2_MERKLE_TREE', 'S2 registry requires at least one component')
    const levels = [leaves.map((entry) => entry.sha256)]
    while (levels.at(-1).length > 1) {
        const current = levels.at(-1)
        const next = []
        for (let index = 0; index < current.length; index += 2) {
            next.push(hashPair(current[index], current[index + 1] ?? current[index]))
        }
        levels.push(next)
    }
    return { levels, root: levels.at(-1)[0] }
}

function proofFor(tree, leafIndex) {
    const proof = []
    let index = leafIndex
    for (let level = 0; level < tree.levels.length - 1; level += 1) {
        const values = tree.levels[level]
        const siblingIndex = index % 2 === 0 ? index + 1 : index - 1
        proof.push({
            position: index % 2 === 0 ? 'right' : 'left',
            sha256: values[siblingIndex] ?? values[index],
        })
        index = Math.floor(index / 2)
    }
    return proof
}

function verifyMerkleProof(leafSha256, proof, root) {
    let current = leafSha256
    for (const step of proof) {
        if (!step || !['left', 'right'].includes(step.position) || !/^[0-9a-f]{64}$/.test(step.sha256 ?? '')) {
            throw new S2StateError('INVALID_S2_MERKLE_PROOF', 'S2 Merkle proof is malformed')
        }
        current = step.position === 'left' ? hashPair(step.sha256, current) : hashPair(current, step.sha256)
    }
    return current === root
}

function graphMembership(graph) {
    const result = new Map()
    for (const component of graph.components) {
        for (const packId of component.packIds) {
            if (result.has(packId)) throw new S2StateError('DUPLICATE_S2_MEMBERSHIP', `Pack ${packId} has two components`)
            result.set(packId, component.id)
        }
    }
    return result
}

function localGraphVersion(graph, component) {
    const packNodes = new Set(component.packIds.map((packId) => `pack:${packId}`))
    const unitNodes = new Set(graph.edges
        .filter((edge) => edge.kind === 'contains' && packNodes.has(edge.from))
        .map((edge) => edge.to))
    const localNodes = new Set([...packNodes, ...unitNodes])
    const localEdges = graph.edges.filter((edge) => localNodes.has(edge.from) || localNodes.has(edge.to))
    for (const edge of localEdges) {
        localNodes.add(edge.from)
        localNodes.add(edge.to)
    }
    const localHyperedges = graph.hyperedges.filter((edge) =>
        edge.participants.some((packId) => component.packIds.includes(packId))
    )
    return jsonSha256({
        packIds: component.packIds,
        nodes: graph.nodes.filter((node) => localNodes.has(node.id)),
        edges: localEdges,
        hyperedges: localHyperedges,
    })
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
            throw new S2StateError('CROSS_COMPONENT_S2_FILE', `${file} requires component union`, {
                components: [...owners],
            })
        }
        if (owners.has(component.id)) files.push({ path: file, value })
    }
    const localSelection = globalState.selection === null ? null : {
        effectiveRequested: globalState.selection.effectiveRequested.filter((id) => packSet.has(id)),
        resolvedIds: globalState.selection.resolvedIds.filter((id) => packSet.has(id)),
        autoAdded: globalState.selection.autoAdded.filter((id) => packSet.has(id)),
        dependencyAdded: globalState.selection.dependencyAdded.filter((id) => packSet.has(id)),
    }
    const payload = {
        schema: S2_COMPONENT_SCHEMA,
        componentId: component.id,
        componentVersion: localGraphVersion(graph, component),
        packIds: component.packIds.filter((packId) => globalState.packs.some((pack) => pack.id === packId)),
        localSelection,
        packs: positioned(globalState.packs, (pack) => packSet.has(pack.id)),
        order: positioned(globalState.order, (unitId) => unitIds.has(unitId)),
        units,
        files,
    }
    return { ...payload, localEtag: jsonSha256(payload) }
}

function reconstructGlobalState(snapshot) {
    const positionedValues = (key) => snapshot.records
        .flatMap((record) => record[key])
        .sort((left, right) => left.position - right.position)
        .map((entry) => entry.value)
    return {
        ...snapshot.registry.compatibilityProjection,
        packs: positionedValues('packs'),
        order: positionedValues('order'),
        units: positionedValues('units'),
        files: Object.fromEntries(snapshot.records
            .flatMap((record) => record.files)
            .sort((left, right) => left.path.localeCompare(right.path))
            .map((entry) => [entry.path, entry.value])),
    }
}

function validateS2Snapshot(snapshot, { globalState, graph }) {
    if (!snapshot || snapshot.schema !== S2_SNAPSHOT_SCHEMA) throw new S2StateError('INVALID_S2_SNAPSHOT', 'S2 snapshot schema is invalid')
    const { snapshotSha256, ...snapshotPayload } = snapshot
    if (snapshotSha256 !== jsonSha256(snapshotPayload)) throw new S2StateError('S2_SNAPSHOT_HASH_MISMATCH', 'S2 snapshot hash does not match')
    const registry = snapshot.registry
    const { registrySha256, ...registryPayload } = registry
    if (registry.schema !== S2_REGISTRY_SCHEMA || registrySha256 !== jsonSha256(registryPayload)) {
        throw new S2StateError('S2_REGISTRY_HASH_MISMATCH', 'S2 registry is corrupt')
    }
    if (registry.globalStateSha256 !== jsonSha256(globalState) || registry.graphSha256 !== graph.graphSha256) {
        throw new S2StateError('S2_COHORT_MISMATCH', 'S2 snapshot belongs to another state or graph')
    }
    if (
        snapshot.canonicalProtection.mode !== 'isolated-audit'
        || snapshot.canonicalProtection.productionMigrationActivated !== false
        || snapshot.canonicalProtection.defaultSerializerChanged !== false
        || snapshot.canonicalProtection.S0FallbackRetained !== true
        || snapshot.canonicalProtection.certificatesIssued !== 0
    ) throw new S2StateError('S2_CANONICAL_PROTECTION_MISMATCH', 'S2 snapshot claims an unauthorized production state')
    const expectedIds = graph.components.map((entry) => entry.id).sort()
    const actualIds = snapshot.records.map((entry) => entry.componentId).sort()
    if (new Set(actualIds).size !== actualIds.length || JSON.stringify(expectedIds) !== JSON.stringify(actualIds)) {
        throw new S2StateError('S2_COMPONENT_COVERAGE_MISMATCH', 'S2 component coverage is incomplete')
    }
    const manifest = new Map(registry.components.map((entry) => [entry.componentId, entry]))
    const manifestIds = registry.components.map((entry) => entry.componentId).sort()
    if (new Set(manifestIds).size !== manifestIds.length || JSON.stringify(manifestIds) !== JSON.stringify(actualIds)) {
        throw new S2StateError('S2_MANIFEST_COVERAGE_MISMATCH', 'S2 registry manifest coverage is incomplete')
    }
    for (const record of snapshot.records) {
        const { localEtag, ...payload } = record
        const entry = manifest.get(record.componentId)
        if (
            record.schema !== S2_COMPONENT_SCHEMA
            || localEtag !== jsonSha256(payload)
            || !entry
            || entry.componentVersion !== record.componentVersion
            || entry.localEtag !== localEtag
            || entry.leafSha256 !== jsonSha256({
                componentId: record.componentId,
                componentVersion: record.componentVersion,
                localEtag,
            })
            || !verifyMerkleProof(entry.leafSha256, entry.proof, registry.merkleRoot)
        ) throw new S2StateError('S2_COMPONENT_VALIDATION_FAILED', `S2 component ${record.componentId} is corrupt or stale`)
    }
    if (jsonSha256(reconstructGlobalState(snapshot)) !== jsonSha256(globalState)) {
        throw new S2StateError('S2_ROLLBACK_MISMATCH', 'S2 exact rollback differs from global state')
    }
    return snapshot
}

function createS2Snapshot({ globalState, graph }) {
    if (!globalState || globalState.format !== 2) throw new S2StateError('UNSUPPORTED_S2_SOURCE_STATE', 'S2 requires global format-2 state')
    const { graphSha256, ...graphPayload } = graph
    if (graphSha256 !== jsonSha256(graphPayload)) throw new S2StateError('S2_GRAPH_HASH_MISMATCH', 'S2 graph hash does not match')
    const membership = graphMembership(graph)
    for (const pack of globalState.packs) {
        if (!membership.has(pack.id)) throw new S2StateError('MISSING_S2_COMPONENT', `State pack ${pack.id} has no component`)
    }
    const records = graph.components.map((component) => componentRecord(globalState, graph, component, membership))
    const leaves = records.map((record) => ({
        componentId: record.componentId,
        sha256: jsonSha256({
            componentId: record.componentId,
            componentVersion: record.componentVersion,
            localEtag: record.localEtag,
        }),
    })).sort((left, right) => left.componentId.localeCompare(right.componentId))
    const tree = merkleTree(leaves)
    const compatibilityProjection = Object.fromEntries(Object.entries(globalState).filter(([key]) =>
        !['packs', 'order', 'units', 'files'].includes(key)
    ))
    const registryPayload = {
        schema: S2_REGISTRY_SCHEMA,
        version: 1,
        graphSha256: graph.graphSha256,
        globalStateSha256: jsonSha256(globalState),
        compatibilityProjection,
        components: leaves.map((leaf, index) => {
            const record = records.find((entry) => entry.componentId === leaf.componentId)
            return {
                componentId: record.componentId,
                componentVersion: record.componentVersion,
                localEtag: record.localEtag,
                leafSha256: leaf.sha256,
                proof: proofFor(tree, index),
                file: `${jsonSha256(record.componentId)}.json`,
            }
        }),
        merkleRoot: tree.root,
    }
    const registry = { ...registryPayload, registrySha256: jsonSha256(registryPayload) }
    const snapshotPayload = {
        schema: S2_SNAPSHOT_SCHEMA,
        registry,
        records,
        canonicalProtection: {
            mode: 'isolated-audit',
            productionMigrationActivated: false,
            defaultSerializerChanged: false,
            S0FallbackRetained: true,
            certificatesIssued: 0,
        },
    }
    const snapshot = { ...snapshotPayload, snapshotSha256: jsonSha256(snapshotPayload) }
    return validateS2Snapshot(snapshot, { globalState, graph })
}

function publishS2Snapshot(outputRoot, snapshot, { injectFailureAfter = null } = {}) {
    const output = path.resolve(outputRoot)
    if (fs.existsSync(output)) throw new S2StateError('S2_OUTPUT_EXISTS', `S2 output already exists: ${output}`)
    fs.mkdirSync(path.dirname(output), { recursive: true })
    const temporary = path.join(path.dirname(output), `.${path.basename(output)}.${process.pid}.${crypto.randomUUID()}.tmp`)
    fs.mkdirSync(path.join(temporary, 'components'), { recursive: true, mode: 0o700 })
    try {
        let writes = 0
        for (const manifest of snapshot.registry.components) {
            const record = snapshot.records.find((entry) => entry.componentId === manifest.componentId)
            fs.writeFileSync(path.join(temporary, 'components', manifest.file), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
            writes += 1
            if (injectFailureAfter === writes) throw new Error('Injected S2 publication failure')
        }
        fs.writeFileSync(path.join(temporary, 'registry.json'), `${JSON.stringify(snapshot.registry, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
        fs.writeFileSync(path.join(temporary, 'snapshot.json'), `${JSON.stringify(snapshot, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
        fs.renameSync(temporary, output)
    } catch (error) {
        fs.rmSync(temporary, { recursive: true, force: true })
        throw error
    }
    return output
}

function loadS2Snapshot(outputRoot, { globalState, graph }) {
    const output = fs.realpathSync(path.resolve(outputRoot))
    const readRegularJson = (file) => {
        const stat = fs.lstatSync(file)
        if (!stat.isFile()) throw new S2StateError('S2_PUBLISHED_TOPOLOGY_MISMATCH', `Published S2 path is not a regular file: ${file}`)
        return JSON.parse(fs.readFileSync(file, 'utf8'))
    }
    const snapshot = readRegularJson(path.join(output, 'snapshot.json'))
    const diskRegistry = readRegularJson(path.join(output, 'registry.json'))
    if (jsonSha256(diskRegistry) !== jsonSha256(snapshot.registry)) {
        throw new S2StateError('S2_PUBLISHED_REGISTRY_MISMATCH', 'Published registry differs from embedded registry')
    }
    const expectedFiles = new Set(snapshot.registry.components.map((entry) => entry.file))
    const actualFiles = fs.readdirSync(path.join(output, 'components')).sort()
    if (actualFiles.length !== expectedFiles.size || !actualFiles.every((file) => expectedFiles.has(file))) {
        throw new S2StateError('S2_PUBLISHED_COMPONENT_MISMATCH', 'Published S2 component files are incomplete')
    }
    for (const manifest of snapshot.registry.components) {
        const disk = readRegularJson(path.join(output, 'components', manifest.file))
        const embedded = snapshot.records.find((entry) => entry.componentId === manifest.componentId)
        if (jsonSha256(disk) !== jsonSha256(embedded)) {
            throw new S2StateError('S2_PUBLISHED_RECORD_MISMATCH', `Published record ${manifest.componentId} differs`)
        }
    }
    return validateS2Snapshot(snapshot, { globalState, graph })
}

module.exports = {
    S2_COMPONENT_SCHEMA,
    S2_REGISTRY_SCHEMA,
    S2_SNAPSHOT_SCHEMA,
    S2StateError,
    createS2Snapshot,
    loadS2Snapshot,
    localGraphVersion,
    publishS2Snapshot,
    reconstructGlobalState,
    validateS2Snapshot,
    verifyMerkleProof,
}
