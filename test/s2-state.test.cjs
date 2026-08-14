'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { compileActionHypergraph } = require('../src/action-hypergraph.cjs')
const {
    CAPABILITY_CONTRACT_SCHEMA,
    jsonSha256,
    sealCapabilityContract,
} = require('../src/capability-contract.cjs')
const { planTransition } = require('../src/manager.cjs')
const {
    createS2Snapshot,
    loadS2Snapshot,
    publishS2Snapshot,
    reconstructGlobalState,
    validateS2Snapshot,
} = require('../src/s2-state.cjs')

function fixture({ merge = false } = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 's2-target-'))
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'synthetic', version: '1.0.0' }))
    const catalog = ['a', 'b'].map((id) => ({
        id, title: id, version: '1',
        units: [{ id: `${id}:owned`, type: 'owned', file: `${id}.txt`, content: `${id}\n` }],
    }))
    const inventoryPayload = {
        schema: 'patch-effect-inventory-v1',
        packs: catalog.map(({ id }) => ({ id })),
        units: catalog.flatMap((pack) => pack.units.map((unit) => ({ id: unit.id, packId: pack.id }))),
        files: catalog.map((pack) => ({ file: `${pack.id}.txt`, units: [`${pack.id}:owned`] })),
        relations: {
            packEdges: merge ? [{ from: 'a', to: 'b', relation: 'fixture-merge' }] : [],
            unitEdges: [], autoWhenHyperedges: [],
        },
    }
    const inventory = { ...inventoryPayload, inventorySha256: jsonSha256(inventoryPayload) }
    const capabilities = catalog.map((pack) => ({
        id: `${pack.id}:write`, packId: pack.id, unitId: `${pack.id}:owned`,
        kind: 'filesystem', access: 'write', resource: `${pack.id}.txt`,
        source: 'unit-ir', enforcement: 'wrapped', componentSafe: true,
    }))
    const contract = sealCapabilityContract({
        schema: CAPABILITY_CONTRACT_SCHEMA, mode: 'audit', inventorySha256: inventory.inventorySha256,
        target: {
            packageName: 'synthetic', packageVersion: '1.0.0', scope: 'resolved-selection',
            packIds: ['a', 'b'], unitIds: ['a:owned', 'b:owned'],
        },
        packs: catalog.map(({ id }) => ({
            packId: id, tier: 'L', admission: 'component-safe',
            capabilityIds: [`${id}:write`], reasons: [],
        })),
        capabilities, boundaries: [], unknownSurfaces: [],
        canonicalProtection: {
            canonicalGate: 'Global Exhaustive', globalFallbackRequired: true,
            defaultChanged: false, stateChanged: false, certificatesIssued: 0, masksSkipped: 0,
        },
    })
    const graph = compileActionHypergraph(inventory, contract)
    const transition = planTransition({ root, catalog, packIds: ['a', 'b'], profile: 'fixture' })
    return { root, catalog, graph, state: transition.state }
}

test('isolated S2 snapshot has exact rollback and independently verified Merkle proofs', () => {
    const current = fixture()
    try {
        const snapshot = createS2Snapshot({ globalState: current.state, graph: current.graph })
        assert.equal(snapshot.records.length, 2)
        assert.deepEqual(reconstructGlobalState(snapshot), current.state)
        assert.ok(snapshot.registry.components.every((entry) => Array.isArray(entry.proof)))
        assert.equal(snapshot.canonicalProtection.productionMigrationActivated, false)
        validateS2Snapshot(snapshot, { globalState: current.state, graph: current.graph })
    } finally {
        fs.rmSync(current.root, { recursive: true, force: true })
    }
})

test('an unrelated component state change preserves the other local ETag', () => {
    const current = fixture()
    try {
        const before = createS2Snapshot({ globalState: current.state, graph: current.graph })
        const changed = structuredClone(current.state)
        changed.packs.find((pack) => pack.id === 'b').etag = 'b'.repeat(64)
        const after = createS2Snapshot({ globalState: changed, graph: current.graph })
        const etag = (snapshot, packId) => snapshot.records.find((record) => record.packIds.includes(packId)).localEtag
        assert.equal(etag(before, 'a'), etag(after, 'a'))
        assert.notEqual(etag(before, 'b'), etag(after, 'b'))
        assert.deepEqual(reconstructGlobalState(after), changed)
    } finally {
        fs.rmSync(current.root, { recursive: true, force: true })
    }
})

test('multi-component publication is atomic and corruption fails closed', () => {
    const current = fixture()
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 's2-publication-'))
    const output = path.join(parent, 'snapshot')
    try {
        const snapshot = createS2Snapshot({ globalState: current.state, graph: current.graph })
        assert.throws(
            () => publishS2Snapshot(output, snapshot, { injectFailureAfter: 1 }),
            /Injected S2 publication failure/,
        )
        assert.equal(fs.existsSync(output), false)
        publishS2Snapshot(output, snapshot)
        loadS2Snapshot(output, { globalState: current.state, graph: current.graph })
        assert.throws(() => publishS2Snapshot(output, snapshot), (error) => error.code === 'S2_OUTPUT_EXISTS')

        fs.writeFileSync(path.join(output, 'registry.json'), '{}\n')
        assert.throws(
            () => loadS2Snapshot(output, { globalState: current.state, graph: current.graph }),
            (error) => error.code === 'S2_PUBLISHED_REGISTRY_MISMATCH',
        )
        fs.writeFileSync(path.join(output, 'registry.json'), `${JSON.stringify(snapshot.registry, null, 2)}\n`)

        const manifest = snapshot.registry.components[0]
        const recordPath = path.join(output, 'components', manifest.file)
        const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'))
        record.localEtag = '0'.repeat(64)
        fs.writeFileSync(recordPath, `${JSON.stringify(record)}\n`)
        assert.throws(
            () => loadS2Snapshot(output, { globalState: current.state, graph: current.graph }),
            (error) => error.code === 'S2_PUBLISHED_RECORD_MISMATCH',
        )
        assert.deepEqual(current.state, reconstructGlobalState(snapshot))
    } finally {
        fs.rmSync(parent, { recursive: true, force: true })
        fs.rmSync(current.root, { recursive: true, force: true })
    }
})

test('component merge produces a separately versioned canonical record', () => {
    const split = fixture()
    const merged = fixture({ merge: true })
    try {
        const splitSnapshot = createS2Snapshot({ globalState: split.state, graph: split.graph })
        const mergedSnapshot = createS2Snapshot({ globalState: merged.state, graph: merged.graph })
        assert.equal(splitSnapshot.records.length, 2)
        assert.equal(mergedSnapshot.records.length, 1)
        assert.notEqual(splitSnapshot.records[0].componentVersion, mergedSnapshot.records[0].componentVersion)
        assert.deepEqual(reconstructGlobalState(mergedSnapshot), merged.state)
    } finally {
        fs.rmSync(split.root, { recursive: true, force: true })
        fs.rmSync(merged.root, { recursive: true, force: true })
    }
})
