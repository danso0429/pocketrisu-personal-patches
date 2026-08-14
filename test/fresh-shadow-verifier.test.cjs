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
    validateFreshShadowReceipt,
    verifyFreshIsolatedComponent,
} = require('../src/fresh-shadow-verifier.cjs')

const ROOT = path.resolve(__dirname, '..')

function fixture() {
    const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fresh-shadow-target-'))
    fs.writeFileSync(path.join(targetRoot, 'package.json'), JSON.stringify({ name: 'synthetic', version: '1.0.0' }))
    const catalog = ['a', 'b'].map((id) => ({
        id,
        title: id.toUpperCase(),
        version: '1',
        units: [{ id: `${id}:owned`, type: 'owned', file: `${id}.txt`, content: `${id}\n` }],
    }))
    const inventoryPayload = {
        schema: 'patch-effect-inventory-v1',
        packs: catalog.map((pack) => ({ id: pack.id })),
        units: catalog.flatMap((pack) => pack.units.map((unit) => ({ id: unit.id, packId: pack.id }))),
        files: catalog.map((pack) => ({ file: `${pack.id}.txt`, units: [`${pack.id}:owned`] })),
        relations: { packEdges: [], unitEdges: [], autoWhenHyperedges: [] },
    }
    const inventory = { ...inventoryPayload, inventorySha256: jsonSha256(inventoryPayload) }
    const capabilities = catalog.map((pack) => ({
        id: `${pack.id}:write`,
        packId: pack.id,
        unitId: `${pack.id}:owned`,
        kind: 'filesystem',
        access: 'write',
        resource: `${pack.id}.txt`,
        source: 'unit-ir',
        enforcement: 'wrapped',
        componentSafe: true,
    }))
    const contract = sealCapabilityContract({
        schema: CAPABILITY_CONTRACT_SCHEMA,
        mode: 'audit',
        inventorySha256: inventory.inventorySha256,
        target: {
            packageName: 'synthetic', packageVersion: '1.0.0', scope: 'target-catalog',
            packIds: ['a', 'b'], unitIds: ['a:owned', 'b:owned'],
        },
        packs: catalog.map((pack) => ({
            packId: pack.id,
            tier: 'L',
            admission: 'component-safe',
            capabilityIds: [`${pack.id}:write`],
            reasons: [],
        })),
        capabilities,
        boundaries: [],
        unknownSurfaces: [],
        canonicalProtection: {
            canonicalGate: 'Global Exhaustive', globalFallbackRequired: true,
            defaultChanged: false, stateChanged: false, certificatesIssued: 0, masksSkipped: 0,
        },
    })
    return { targetRoot, catalog, contract, inventory, graph: compileActionHypergraph(inventory, contract) }
}

function reseal(receipt) {
    const { receiptSha256: ignored, ...payload } = receipt
    return { ...payload, receiptSha256: jsonSha256(payload) }
}

test('fresh shadow executes every local mask and boundary in a fresh process and projection', () => {
    const current = fixture()
    try {
        const component = current.graph.components.find((entry) => entry.packIds.includes('a'))
        const receipt = verifyFreshIsolatedComponent({
            sourceRoot: ROOT,
            targetRoot: current.targetRoot,
            catalog: current.catalog,
            contract: current.contract,
            graph: current.graph,
            componentId: component.id,
            requiredBoundaryClassIds: ['boundary-empty', 'boundary-present'],
            boundaryClasses: [
                { id: 'boundary-empty', inputs: [] },
                { id: 'boundary-present', inputs: [{ path: 'boundary.txt', content: 'external\n', mode: 0o640 }] },
            ],
        })
        assert.equal(receipt.status, 'passed')
        assert.deepEqual(receipt.coverage, {
            localMasks: 2, boundaryClasses: 2, expectedExecutions: 4, processedExecutions: 4,
        })
        assert.deepEqual(receipt.observations.map((entry) => `${entry.boundaryClassId}:${entry.mask}`).sort(), [
            'boundary-empty:0', 'boundary-empty:1', 'boundary-present:0', 'boundary-present:1',
        ])
        assert.equal(new Set(receipt.observations.map((entry) => entry.processInstanceId)).size, 4)
        assert.equal(new Set(receipt.observations.map((entry) => entry.projectionId)).size, 4)
        assert.ok(receipt.observations.every((entry) => entry.restored))
        assert.equal(fs.existsSync(path.join(current.targetRoot, 'a.txt')), false)
        assert.equal(fs.existsSync(path.join(current.targetRoot, 'boundary.txt')), false)
    } finally {
        fs.rmSync(current.targetRoot, { recursive: true, force: true })
    }
})

test('shadow receipt rejects missing, duplicate, and out-of-range coverage', () => {
    const current = fixture()
    try {
        const component = current.graph.components[0]
        const receipt = verifyFreshIsolatedComponent({
            sourceRoot: ROOT, targetRoot: current.targetRoot, catalog: current.catalog,
            contract: current.contract, graph: current.graph, componentId: component.id,
            requiredBoundaryClassIds: ['only'],
            boundaryClasses: [{ id: 'only', inputs: [] }],
        })
        const missing = structuredClone(receipt)
        missing.observations.pop()
        missing.coverage.processedExecutions -= 1
        assert.throws(() => validateFreshShadowReceipt(reseal(missing)), /coverage is incomplete/)
        const duplicate = structuredClone(receipt)
        duplicate.observations[1] = structuredClone(duplicate.observations[0])
        assert.throws(() => validateFreshShadowReceipt(reseal(duplicate)), /Duplicate execution/)
        const outOfRange = structuredClone(receipt)
        outOfRange.observations[0].mask = 2
        assert.throws(() => validateFreshShadowReceipt(reseal(outOfRange)), /out of range/)
    } finally {
        fs.rmSync(current.targetRoot, { recursive: true, force: true })
    }
})

test('local verification rejects an incomplete declared boundary-class set', () => {
    const current = fixture()
    try {
        const component = current.graph.components[0]
        assert.throws(
            () => verifyFreshIsolatedComponent({
                sourceRoot: ROOT, targetRoot: current.targetRoot, catalog: current.catalog,
                contract: current.contract, graph: current.graph, componentId: component.id,
                requiredBoundaryClassIds: ['first', 'second'],
                boundaryClasses: [{ id: 'first', inputs: [] }],
            }),
            (error) => error.code === 'INCOMPLETE_BOUNDARY_CLASSES',
        )
    } finally {
        fs.rmSync(current.targetRoot, { recursive: true, force: true })
    }
})

test('global or unsupported graph falls back without executing a local mask', () => {
    const current = fixture()
    try {
        const globalContract = structuredClone(current.contract)
        globalContract.packs[0].tier = 'G'
        globalContract.packs[0].admission = 'global-fallback'
        globalContract.packs[0].reasons = ['fixture-global-surface']
        const { contractSha256: ignored, ...payload } = globalContract
        globalContract.contractSha256 = jsonSha256(payload)
        const graph = compileActionHypergraph(current.inventory, globalContract)
        const receipt = verifyFreshIsolatedComponent({
            sourceRoot: ROOT, targetRoot: current.targetRoot, catalog: current.catalog,
            contract: globalContract, graph, componentId: graph.components[0].id, boundaryClasses: [],
            requiredBoundaryClassIds: [],
        })
        assert.equal(receipt.status, 'fallback-required')
        assert.equal(receipt.coverage.processedExecutions, 0)
        assert.equal(receipt.canonicalProtection.canonicalExecutionSkipped, false)
    } finally {
        fs.rmSync(current.targetRoot, { recursive: true, force: true })
    }
})

test('first failure preserves its component, boundary, mask, phase, and projection', () => {
    const current = fixture()
    fs.writeFileSync(path.join(current.targetRoot, 'a.txt'), 'collision\n')
    let preserved = null
    try {
        const component = current.graph.components.find((entry) => entry.packIds.includes('a'))
        assert.throws(
            () => verifyFreshIsolatedComponent({
                sourceRoot: ROOT, targetRoot: current.targetRoot, catalog: current.catalog,
                contract: current.contract, graph: current.graph, componentId: component.id,
                requiredBoundaryClassIds: ['collision'],
                boundaryClasses: [{ id: 'collision', inputs: [] }],
            }),
            (error) => {
                assert.equal(error.code, 'FRESH_SHADOW_FIRST_FAILURE')
                assert.equal(error.details.componentId, component.id)
                assert.equal(error.details.boundaryClassId, 'collision')
                assert.equal(error.details.mask, 1)
                assert.equal(error.details.causeCode, 'SHADOW_WORKER_FAILED')
                assert.match(error.details.worker.stderr, /OWNED_COLLISION/)
                assert.equal(fs.existsSync(error.details.projectionRoot), true)
                preserved = error.details.projectionRoot
                return true
            },
        )
    } finally {
        if (preserved) fs.rmSync(preserved, { recursive: true, force: true })
        fs.rmSync(current.targetRoot, { recursive: true, force: true })
    }
})
