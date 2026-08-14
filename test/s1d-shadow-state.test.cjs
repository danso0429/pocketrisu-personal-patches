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
const {
    applyTransition,
    planTransition,
    status,
} = require('../src/manager.cjs')
const {
    compileS1DShadowState,
    reconstructGlobalState,
    validateS1DShadowState,
} = require('../src/s1d-shadow-state.cjs')

function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 's1d-target-'))
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
        relations: { packEdges: [], unitEdges: [], autoWhenHyperedges: [] },
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
    return { root, catalog, graph: compileActionHypergraph(inventory, contract) }
}

test('S1-D reconstructs global format-2 state while the global manager remains sole authority', () => {
    const current = fixture()
    try {
        const transition = planTransition({
            root: current.root, catalog: current.catalog, packIds: ['a', 'b'], profile: 'fixture',
        })
        const shadow = compileS1DShadowState({ globalState: transition.state, graph: current.graph })
        assert.equal(shadow.components.length, 2)
        assert.deepEqual(reconstructGlobalState(shadow), transition.state)
        assert.equal(shadow.canonicalProtection.globalStateSoleAuthority, true)
        assert.equal(shadow.canonicalProtection.productionStateWritten, false)

        applyTransition({ root: current.root, transition })
        assert.equal(status({ root: current.root }).status, 'current')
        const repeated = planTransition({
            root: current.root, catalog: current.catalog, packIds: ['a', 'b'], profile: 'fixture',
        })
        assert.equal(repeated.changes.length, 0)
        const reverted = planTransition({
            root: current.root, catalog: current.catalog, packIds: [], profile: 'fixture',
        })
        applyTransition({ root: current.root, transition: reverted })
        assert.equal(status({ root: current.root }).status, 'clean')
        assert.equal(fs.existsSync(path.join(current.root, 'a.txt')), false)
        assert.equal(fs.existsSync(path.join(current.root, 'b.txt')), false)
    } finally {
        fs.rmSync(current.root, { recursive: true, force: true })
    }
})

test('missing, corrupt, duplicate, and stale shadow records fail without changing canonical behavior', () => {
    const current = fixture()
    try {
        const transition = planTransition({
            root: current.root, catalog: current.catalog, packIds: ['a', 'b'], profile: 'fixture',
        })
        applyTransition({ root: current.root, transition })
        const shadow = compileS1DShadowState({ globalState: transition.state, graph: current.graph })

        const cases = []
        const missing = structuredClone(shadow)
        missing.components.pop()
        cases.push(missing)
        const corrupt = structuredClone(shadow)
        corrupt.components[0].etag = '0'.repeat(64)
        cases.push(corrupt)
        const duplicate = structuredClone(shadow)
        duplicate.components[1] = structuredClone(duplicate.components[0])
        cases.push(duplicate)
        const stale = structuredClone(shadow)
        stale.graphSha256 = '0'.repeat(64)
        cases.push(stale)

        for (const candidate of cases) {
            assert.throws(() => validateS1DShadowState(candidate, {
                globalState: transition.state, graph: current.graph,
            }))
            assert.equal(status({ root: current.root }).status, 'current')
            assert.equal(planTransition({
                root: current.root, catalog: current.catalog, packIds: ['a', 'b'], profile: 'fixture',
            }).changes.length, 0)
        }
    } finally {
        fs.rmSync(current.root, { recursive: true, force: true })
    }
})

test('canonical transaction interruption restores exactly before any shadow projection', () => {
    const current = fixture()
    try {
        const transition = planTransition({
            root: current.root, catalog: current.catalog, packIds: ['a', 'b'], profile: 'fixture',
        })
        assert.throws(
            () => applyTransition({ root: current.root, transition, injectFailureAfter: 1 }),
            /Injected transaction failure/,
        )
        assert.equal(status({ root: current.root }).status, 'clean')
        assert.equal(fs.existsSync(path.join(current.root, 'a.txt')), false)
        assert.equal(fs.existsSync(path.join(current.root, 'b.txt')), false)
        const retry = planTransition({
            root: current.root, catalog: current.catalog, packIds: ['a', 'b'], profile: 'fixture',
        })
        assert.deepEqual(retry.changes.map((change) => change.path).sort(), transition.changes.map((change) => change.path).sort())
    } finally {
        fs.rmSync(current.root, { recursive: true, force: true })
    }
})
