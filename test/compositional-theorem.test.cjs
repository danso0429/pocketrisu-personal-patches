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
    REQUIRED_PREMISES,
    validateCompositionalTheoremReceipt,
    verifyCompositionalAdmission,
} = require('../src/compositional-theorem.cjs')
const { verifyFreshIsolatedComponent } = require('../src/fresh-shadow-verifier.cjs')

const ROOT = path.resolve(__dirname, '..')

function fixture({ boundary = false, packEdge = false } = {}) {
    const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'theorem-target-'))
    fs.writeFileSync(path.join(targetRoot, 'package.json'), JSON.stringify({ name: 'synthetic', version: '1.0.0' }))
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
            packEdges: packEdge ? [{ from: 'a', to: 'b', relation: 'fixture-hidden' }] : [],
            unitEdges: [], autoWhenHyperedges: [],
        },
    }
    const inventory = { ...inventoryPayload, inventorySha256: jsonSha256(inventoryPayload) }
    const capabilities = catalog.map((pack) => ({
        id: `${pack.id}:write`, packId: pack.id, unitId: `${pack.id}:owned`,
        kind: 'filesystem', access: 'write', resource: `${pack.id}.txt`,
        source: 'unit-ir', enforcement: 'wrapped', componentSafe: true,
    }))
    const boundaries = boundary ? [{
        schema: 'patch-typed-boundary-v1', id: 'fixture-boundary', version: '1',
        surface: 'state', resource: 'external-mode', direction: 'bidirectional',
        providers: ['a'], consumers: ['b'], inputClasses: ['zero', 'one'],
        validation: { completeness: 'complete', validator: 'fixture-boundary-v1' },
        fallback: 'component-union',
    }] : []
    const contract = sealCapabilityContract({
        schema: CAPABILITY_CONTRACT_SCHEMA, mode: 'audit', inventorySha256: inventory.inventorySha256,
        target: {
            packageName: 'synthetic', packageVersion: '1.0.0', scope: 'target-catalog',
            packIds: ['a', 'b'], unitIds: ['a:owned', 'b:owned'],
        },
        packs: catalog.map((pack) => ({
            packId: pack.id, tier: boundary ? 'B' : 'L',
            admission: boundary ? 'boundary-safe' : 'component-safe',
            capabilityIds: [`${pack.id}:write`], reasons: [],
        })),
        capabilities, boundaries, unknownSurfaces: [],
        canonicalProtection: {
            canonicalGate: 'Global Exhaustive', globalFallbackRequired: true,
            defaultChanged: false, stateChanged: false, certificatesIssued: 0, masksSkipped: 0,
        },
    })
    return { targetRoot, catalog, inventory, contract, graph: compileActionHypergraph(inventory, contract) }
}

function premises(status = 'verified') {
    return REQUIRED_PREMISES.map((id) => ({
        id,
        status,
        sourceRepresentation: `fixture:${id}`,
        runtimeEnforcement: `fixture-enforcement:${id}`,
        evidenceSha256: status === 'verified' ? jsonSha256({ id }) : null,
        independentValidator: `fixture-validator:${id}`,
        failureAction: id === 'component-join-split-rules' ? 'broader-component' : 'global-fallback',
    }))
}

function shadowReceipts(current, boundaryClasses = [{ id: 'default', inputs: [] }]) {
    const requiredBoundaryClassIds = boundaryClasses.map((entry) => entry.id)
    return current.graph.components.map((component) => verifyFreshIsolatedComponent({
        sourceRoot: ROOT, targetRoot: current.targetRoot, catalog: current.catalog,
        contract: current.contract, graph: current.graph, componentId: component.id,
        requiredBoundaryClassIds, boundaryClasses,
    }))
}

test('all theorem premises and fresh component receipts admit synthetic composition', () => {
    const current = fixture()
    try {
        const receipt = verifyCompositionalAdmission({
            contract: current.contract, graph: current.graph, premises: premises(),
            boundaryCoverage: [], shadowReceipts: shadowReceipts(current),
        })
        assert.equal(receipt.status, 'passed')
        assert.equal(receipt.outcome, 'component-admitted')
        assert.equal(receipt.shadowReceiptHashes.length, 2)
        validateCompositionalTheoremReceipt(receipt)
    } finally {
        fs.rmSync(current.targetRoot, { recursive: true, force: true })
    }
})

test('missing or unverified premises never produce theorem success', () => {
    const current = fixture()
    try {
        const shadows = shadowReceipts(current)
        assert.throws(
            () => verifyCompositionalAdmission({
                contract: current.contract, graph: current.graph,
                premises: premises().slice(1), boundaryCoverage: [], shadowReceipts: shadows,
            }),
            (error) => error.code === 'INCOMPLETE_THEOREM_PREMISES',
        )
        const incomplete = premises()
        incomplete[0] = { ...incomplete[0], status: 'unverified', evidenceSha256: null }
        const rejected = verifyCompositionalAdmission({
            contract: current.contract, graph: current.graph,
            premises: incomplete, boundaryCoverage: [], shadowReceipts: shadows,
        })
        assert.equal(rejected.status, 'rejected')
        assert.equal(rejected.outcome, 'admission-rejected')
    } finally {
        fs.rmSync(current.targetRoot, { recursive: true, force: true })
    }
})

test('a hidden interaction merge invalidates receipts for the old split', () => {
    const split = fixture()
    const merged = fixture({ packEdge: true })
    try {
        const oldShadows = shadowReceipts(split)
        const rejected = verifyCompositionalAdmission({
            contract: merged.contract, graph: merged.graph, premises: premises(),
            boundaryCoverage: [], shadowReceipts: oldShadows,
        })
        assert.equal(merged.graph.components.length, 1)
        assert.equal(rejected.outcome, 'admission-rejected')
    } finally {
        fs.rmSync(split.targetRoot, { recursive: true, force: true })
        fs.rmSync(merged.targetRoot, { recursive: true, force: true })
    }
})

test('typed boundary theorem requires every input class on every participant component', () => {
    const current = fixture({ boundary: true })
    try {
        const boundaryClasses = [
            { id: 'zero', inputs: [{ path: 'external.txt', content: '0\n' }] },
            { id: 'one', inputs: [{ path: 'external.txt', content: '1\n' }] },
        ]
        const shadows = shadowReceipts(current, boundaryClasses)
        const coverage = [
            { boundaryId: 'fixture-boundary', inputClass: 'zero', classIds: ['zero'] },
            { boundaryId: 'fixture-boundary', inputClass: 'one', classIds: ['one'] },
        ]
        const passed = verifyCompositionalAdmission({
            contract: current.contract, graph: current.graph, premises: premises(),
            boundaryCoverage: coverage, shadowReceipts: shadows,
        })
        assert.equal(passed.outcome, 'component-admitted')
        assert.throws(
            () => verifyCompositionalAdmission({
                contract: current.contract, graph: current.graph, premises: premises(),
                boundaryCoverage: coverage.slice(0, 1), shadowReceipts: shadows,
            }),
            (error) => error.code === 'INCOMPLETE_TYPED_BOUNDARY_COVERAGE',
        )
    } finally {
        fs.rmSync(current.targetRoot, { recursive: true, force: true })
    }
})
