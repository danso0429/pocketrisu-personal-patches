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
    decideExperimentalExactHit,
    loadExactCertificate,
    replayCertificate,
    validateExactCertificate,
} = require('../src/certificate-verifier.cjs')
const {
    REQUIRED_PREMISES,
    verifyCompositionalAdmission,
} = require('../src/compositional-theorem.cjs')
const {
    EXACT_KEY_SCHEMA,
    dryRunCertificateGc,
    generateExactCertificate,
    publishExactCertificate,
} = require('../src/exact-certificate.cjs')
const { verifyFreshIsolatedComponent } = require('../src/fresh-shadow-verifier.cjs')

const ROOT = path.resolve(__dirname, '..')

function fixture() {
    const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'certificate-target-'))
    fs.writeFileSync(path.join(targetRoot, 'package.json'), JSON.stringify({ name: 'synthetic', version: '1.0.0' }))
    const catalog = [{
        id: 'a', title: 'a', version: '1',
        units: [{ id: 'a:owned', type: 'owned', file: 'a.txt', content: 'a\n' }],
    }]
    const inventoryPayload = {
        schema: 'patch-effect-inventory-v1',
        packs: [{ id: 'a' }],
        units: [{ id: 'a:owned', packId: 'a' }],
        files: [{ file: 'a.txt', units: ['a:owned'] }],
        relations: { packEdges: [], unitEdges: [], autoWhenHyperedges: [] },
    }
    const inventory = { ...inventoryPayload, inventorySha256: jsonSha256(inventoryPayload) }
    const contract = sealCapabilityContract({
        schema: CAPABILITY_CONTRACT_SCHEMA, mode: 'audit', inventorySha256: inventory.inventorySha256,
        target: {
            packageName: 'synthetic', packageVersion: '1.0.0', scope: 'resolved-selection',
            packIds: ['a'], unitIds: ['a:owned'],
        },
        packs: [{ packId: 'a', tier: 'L', admission: 'component-safe', capabilityIds: ['a:write'], reasons: [] }],
        capabilities: [{
            id: 'a:write', packId: 'a', unitId: 'a:owned', kind: 'filesystem', access: 'write',
            resource: 'a.txt', source: 'unit-ir', enforcement: 'wrapped', componentSafe: true,
        }],
        boundaries: [], unknownSurfaces: [],
        canonicalProtection: {
            canonicalGate: 'Global Exhaustive', globalFallbackRequired: true,
            defaultChanged: false, stateChanged: false, certificatesIssued: 0, masksSkipped: 0,
        },
    })
    const graph = compileActionHypergraph(inventory, contract)
    const component = graph.components[0]
    const shadow = verifyFreshIsolatedComponent({
        sourceRoot: ROOT, targetRoot, catalog, contract, graph, componentId: component.id,
        requiredBoundaryClassIds: ['default'], boundaryClasses: [{ id: 'default', inputs: [] }],
    })
    const premises = REQUIRED_PREMISES.map((id) => ({
        id, status: 'verified', sourceRepresentation: `fixture:${id}`,
        runtimeEnforcement: `fixture:${id}`, evidenceSha256: jsonSha256({ id }),
        independentValidator: `fixture:${id}`, failureAction: 'global-fallback',
    }))
    const theorem = verifyCompositionalAdmission({
        contract, graph, premises, boundaryCoverage: [], shadowReceipts: [shadow],
    })
    const fields = [
        'componentVersionSha256', 'componentSourceReadSetSha256', 'targetProjectionSha256',
        'canonicalPolicySha256', 'engineSha256', 'effectManifestSha256', 'actionSubgraphSha256',
        'boundaryClassesSha256', 'localStateSha256', 'runtimeEnvelopeSha256',
        'filesystemSemanticsSha256', 'historyModelSha256',
    ]
    const key = { schema: EXACT_KEY_SCHEMA, componentId: component.id }
    for (const [index, field] of fields.entries()) key[field] = jsonSha256({ field, index })
    return { targetRoot, key, shadowReceipt: shadow, theoremReceipt: theorem }
}

function reseal(certificate) {
    const { certificateSha256: ignored, ...payload } = certificate
    return { ...payload, certificateSha256: jsonSha256(payload) }
}

test('write-only certificate is immutable, Merkle-complete, and replay-verifiable', () => {
    const current = fixture()
    const store = fs.mkdtempSync(path.join(os.tmpdir(), 'certificate-store-'))
    try {
        const certificate = generateExactCertificate(current)
        validateExactCertificate(certificate, { expectedKey: current.key })
        assert.equal(certificate.leaves.length, 2)
        assert.deepEqual(replayCertificate(certificate, current.shadowReceipt), {
            status: 'passed', comparedLeaves: 2, mismatches: [],
        })
        const file = publishExactCertificate(store, certificate)
        assert.equal(loadExactCertificate(file, { expectedKey: current.key }).certificateSha256, certificate.certificateSha256)
        assert.throws(() => publishExactCertificate(store, certificate), (error) => error.code === 'EEXIST')
        const extraHash = 'f'.repeat(64)
        fs.writeFileSync(path.join(store, `${extraHash}.json`), '{}\n')
        assert.deepEqual(dryRunCertificateGc(store, [certificate.certificateSha256]), [{
            certificateSha256: extraHash, file: `${extraHash}.json`, action: 'would-delete',
        }])
    } finally {
        fs.rmSync(store, { recursive: true, force: true })
        fs.rmSync(current.targetRoot, { recursive: true, force: true })
    }
})

test('corrupt, truncated, stale, mixed-version, and non-exact evidence is rejected', () => {
    const current = fixture()
    const store = fs.mkdtempSync(path.join(os.tmpdir(), 'certificate-corrupt-'))
    try {
        const certificate = generateExactCertificate(current)
        const corrupt = structuredClone(certificate)
        corrupt.leaves[0].observationSha256 = '0'.repeat(64)
        assert.throws(() => validateExactCertificate(reseal(corrupt)), (error) => error.code === 'CERTIFICATE_LEAF_INVALID')
        const stale = structuredClone(certificate)
        stale.componentManifest.expectedLeaves += 1
        assert.throws(() => validateExactCertificate(reseal(stale)), (error) => error.code === 'CERTIFICATE_COVERAGE_MISMATCH')
        const mixed = structuredClone(certificate)
        mixed.schema = 'patch-exact-component-certificate-v2'
        assert.throws(() => validateExactCertificate(mixed), (error) => error.code === 'UNKNOWN_CERTIFICATE_SCHEMA')
        const changedKey = { ...current.key, localStateSha256: '0'.repeat(64) }
        assert.throws(
            () => validateExactCertificate(certificate, { expectedKey: changedKey }),
            (error) => error.code === 'CERTIFICATE_EXACT_KEY_MISS',
        )
        const truncated = path.join(store, `${'e'.repeat(64)}.json`)
        fs.writeFileSync(truncated, '{')
        assert.throws(() => loadExactCertificate(truncated), (error) => error.code === 'CERTIFICATE_PARSE_FAILED')
    } finally {
        fs.rmSync(store, { recursive: true, force: true })
        fs.rmSync(current.targetRoot, { recursive: true, force: true })
    }
})

test('experimental exact hit distinguishes accepted records from masks skipped', () => {
    const current = fixture()
    try {
        const certificate = generateExactCertificate(current)
        assert.deepEqual(decideExperimentalExactHit({
            certificate, candidateKey: current.key, mode: 'frozen-audit-experimental', independentlyVerified: true,
        }), {
            recordsLoaded: 1, recordsAccepted: 1, recordsRejected: 0, masksSkipped: 2, reason: null,
        })
        const changed = { ...current.key, historyModelSha256: '0'.repeat(64) }
        const miss = decideExperimentalExactHit({
            certificate, candidateKey: changed, mode: 'frozen-audit-experimental', independentlyVerified: true,
        })
        assert.equal(miss.recordsAccepted, 0)
        assert.equal(miss.masksSkipped, 0)
        assert.equal(miss.reason, 'CERTIFICATE_EXACT_KEY_MISS')
    } finally {
        fs.rmSync(current.targetRoot, { recursive: true, force: true })
    }
})
