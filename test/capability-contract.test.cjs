'use strict'

const assert = require('node:assert/strict')
const childProcess = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const {
    compileActionHypergraph,
} = require('../src/action-hypergraph.cjs')
const {
    compileCapabilityContract,
} = require('../src/capability-compiler.cjs')
const {
    CAPABILITY_CONTRACT_SCHEMA,
    CapabilityContractError,
    sealCapabilityContract,
    validateCapabilityContract,
} = require('../src/capability-contract.cjs')
const {
    compileEffectInventory,
    discoverInventorySourceInputs,
    inspectGeneratedCatalogs,
} = require('../src/effect-inventory.cjs')
const {
    auditLegacyCatalogLoad,
    permissionPreflight,
    validateLegacyAccessReceipt,
} = require('../src/legacy-capability-audit.cjs')
const {
    auditTransitionCapabilities,
} = require('../src/transition-capability-audit.cjs')
const { loadCatalog } = require('../src/catalog.cjs')

const ROOT = path.resolve(__dirname, '..')
let currentInventory = null

function inventory() {
    if (currentInventory !== null) return currentInventory
    const catalog = loadCatalog(ROOT)
    currentInventory = compileEffectInventory(catalog, {
        sourceInputs: discoverInventorySourceInputs(ROOT, catalog),
        generatedArtifacts: inspectGeneratedCatalogs(ROOT, catalog),
    })
    return currentInventory
}

function capability({ id, packId, unitId, kind = 'filesystem', resource = 'shared.txt' }) {
    return {
        id,
        packId,
        unitId,
        kind,
        access: 'write',
        resource,
        source: 'unit-ir',
        enforcement: 'wrapped',
        componentSafe: true,
    }
}

function syntheticContract({ packIds, unitIds, capabilities, packs, boundaries = [] }) {
    return sealCapabilityContract({
        schema: CAPABILITY_CONTRACT_SCHEMA,
        mode: 'audit',
        inventorySha256: 'a'.repeat(64),
        target: {
            packageName: 'synthetic',
            packageVersion: '1.0.0',
            scope: 'target-catalog',
            packIds,
            unitIds,
        },
        packs,
        capabilities,
        boundaries,
        unknownSurfaces: [],
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

function syntheticInventory({ packs, units, files = [], packEdges = [], unitEdges = [], hyperedges = [] }) {
    return {
        schema: 'patch-effect-inventory-v1',
        inventorySha256: 'a'.repeat(64),
        packs: packs.map((id) => ({ id })),
        units,
        files,
        relations: {
            packEdges,
            unitEdges,
            autoWhenHyperedges: hyperedges,
        },
    }
}

function localAdmission(packId, capabilityIds, tier = 'L') {
    return {
        packId,
        tier,
        admission: tier === 'L' ? 'component-safe' : 'boundary-safe',
        capabilityIds,
        reasons: [],
    }
}

function writeFixture(root, manifestSource) {
    fs.mkdirSync(path.join(root, 'src'), { recursive: true })
    fs.mkdirSync(path.join(root, 'scripts'), { recursive: true })
    fs.mkdirSync(path.join(root, 'patches/example'), { recursive: true })
    fs.copyFileSync(
        path.join(ROOT, 'scripts/run-capability-audit-worker.cjs'),
        path.join(root, 'scripts/run-capability-audit-worker.cjs'),
    )
    fs.writeFileSync(
        path.join(root, 'src/catalog.cjs'),
        "'use strict'\nconst manifest = require('../patches/example/manifest.cjs')\nmodule.exports = { loadCatalog() { return [manifest] } }\n",
    )
    fs.writeFileSync(path.join(root, 'patches/example/manifest.cjs'), manifestSource)
}

test('current target catalog compiles to fail-closed G components', () => {
    const compiled = inventory()
    assert.equal(compiled.inventorySha256, 'ba4b6698b75cd8f385a3b55d9b0cf0977f3fdaba3f3a6cfdde71fe048e07a733')
    const contract = compileCapabilityContract(compiled, {
        scope: 'target-catalog',
        packageName: 'pocketrisu',
        packageVersion: '1.9.0',
    })
    const graph = compileActionHypergraph(compiled, contract)
    assert.deepEqual(
        Object.fromEntries(['L', 'B', 'G', 'U'].map((tier) => [
            tier,
            contract.packs.filter((pack) => pack.tier === tier).length,
        ])),
        { L: 0, B: 0, G: 46, U: 0 },
    )
    assert.equal(contract.target.unitIds.length, 869)
    assert.equal(contract.capabilities.length, 7301)
    assert.deepEqual(graph.localComponents.map((entry) => entry.packIds.length), [45, 1])
    assert.deepEqual(graph.components.map((entry) => entry.packIds.length), [46])
    assert.equal(graph.fallback.required, true)
    assert.deepEqual(contract.unknownSurfaces, [
        'environment:application-environment',
        'file-descriptor:pre-opened-file-descriptors',
        'history:unmanaged-worker-history',
        'native-binding:application-native-bindings',
        'network:application-network',
        'process:application-process-global-state',
        'promise:application-promises',
        'randomness:application-randomness',
        'stream:application-streams',
        'subprocess:application-subprocesses',
        'symbol:application-symbol-registry',
        'time:application-time',
        'worker:application-workers',
    ])
    assert.equal(contract.contractSha256, 'aa5d832e8dd0beeeda8da7771afb5ad9552221e571d7b1763f6df304e1595f88')
    assert.equal(graph.graphSha256, '8c484064a34becf6109a4b957a993a51e81de7188ac4553f2f927d0bb72e63f0')
})

test('prospective transition actions are admitted before mutation and unknown paths fail closed', () => {
    const compiled = inventory()
    const contract = compileCapabilityContract(compiled, {
        scope: 'target-catalog',
        packageName: 'pocketrisu',
        packageVersion: '1.9.0',
    })
    const unit = compiled.units.find((candidate) => contract.target.unitIds.includes(candidate.id))
    const statePath = 'save/pocketrisu-patches/state.json'
    const transition = {
        target: { packageName: 'pocketrisu', packageVersion: '1.9.0' },
        resolution: { resolvedIds: contract.target.packIds },
        preconditions: [
            { path: unit.file, before: null, beforeMode: null },
            { path: statePath, before: null, beforeMode: null },
        ],
        changes: [
            { path: unit.file, before: null, beforeMode: null, after: 'managed', afterMode: 0o644 },
            { path: statePath, before: null, beforeMode: null, after: '{}\n', afterMode: 0o600 },
        ],
    }
    const audit = auditTransitionCapabilities(transition, contract)
    assert.equal(audit.status, 'pass')
    assert.equal(audit.mutationPerformed, false)
    assert.equal(audit.violations.length, 0)
    assert.ok(audit.actions.every((action) => action.capabilityIds.length > 0))

    const undeclared = structuredClone(transition)
    undeclared.changes.push({
        path: 'undeclared.txt',
        before: null,
        beforeMode: null,
        after: 'x',
        afterMode: 0o644,
    })
    assert.throws(
        () => auditTransitionCapabilities(undeclared, contract),
        (error) =>
            error.code === 'UNDECLARED_TRANSITION_ACTION'
            && error.details.violations.some((violation) => violation.resource === 'undeclared.txt'),
    )
})

test('high-order autoWhen remains a hyperedge and unions every participant', () => {
    const packIds = ['a', 'b', 'c', 'd']
    const contract = syntheticContract({
        packIds,
        unitIds: [],
        capabilities: [],
        packs: packIds.map((packId) => localAdmission(packId, [])),
    })
    const graph = compileActionHypergraph(syntheticInventory({
        packs: packIds,
        units: [],
        hyperedges: [{ subject: 'a', all: ['b', 'c'], any: [], none: ['d'] }],
    }), contract)
    const relation = graph.hyperedges.find((entry) => entry.id === 'auto-when:a')
    assert.deepEqual(relation.condition, {
        subject: 'a',
        all: ['b', 'c'],
        any: [],
        none: ['d'],
    })
    assert.deepEqual(graph.components.map((entry) => entry.packIds.length), [4])
})

test('shared action bridges components unless a complete typed boundary is admitted', () => {
    const units = [
        { id: 'a:u', packId: 'a' },
        { id: 'b:u', packId: 'b' },
    ]
    const capabilities = [
        capability({ id: 'a-cap', packId: 'a', unitId: 'a:u' }),
        capability({ id: 'b-cap', packId: 'b', unitId: 'b:u' }),
    ]
    const baseInventory = syntheticInventory({
        packs: ['a', 'b'],
        units,
        files: [{ file: 'shared.txt', units: ['a:u', 'b:u'] }],
    })
    const unioned = compileActionHypergraph(baseInventory, syntheticContract({
        packIds: ['a', 'b'],
        unitIds: ['a:u', 'b:u'],
        capabilities,
        packs: [localAdmission('a', ['a-cap']), localAdmission('b', ['b-cap'])],
    }))
    assert.deepEqual(unioned.components.map((entry) => entry.packIds.length), [2])

    const boundary = {
        schema: 'patch-typed-boundary-v1',
        id: 'shared-file-contract',
        version: '1',
        surface: 'file',
        resource: 'shared.txt',
        direction: 'provider-to-consumer',
        providers: ['a'],
        consumers: ['b'],
        inputClasses: ['exact-content'],
        validation: { completeness: 'complete', validator: 'fixture-validator-v1' },
        fallback: 'component-union',
    }
    const separated = compileActionHypergraph(baseInventory, syntheticContract({
        packIds: ['a', 'b'],
        unitIds: ['a:u', 'b:u'],
        capabilities,
        packs: [
            localAdmission('a', ['a-cap'], 'B'),
            localAdmission('b', ['b-cap'], 'B'),
        ],
        boundaries: [boundary],
    }))
    assert.deepEqual(separated.components.map((entry) => entry.packIds.length), [1, 1])
    assert.equal(
        separated.hyperedges.find((entry) => entry.kind === 'shared-file').admittedBoundary,
        'shared-file-contract',
    )
})

test('contract validation rejects unknown, forged, and unsealed local admissions', () => {
    const base = syntheticContract({
        packIds: ['a'],
        unitIds: ['a:u'],
        capabilities: [capability({ id: 'a-cap', packId: 'a', unitId: 'a:u' })],
        packs: [localAdmission('a', ['a-cap'])],
    })
    const forged = structuredClone(base)
    forged.componentHint = ['a']
    assert.throws(
        () => validateCapabilityContract(forged, { verifyHash: false }),
        (error) => error.code === 'UNKNOWN_CONTRACT_FIELD',
    )
    const unknown = structuredClone(base)
    unknown.capabilities[0].kind = 'telepathy'
    assert.throws(
        () => validateCapabilityContract(unknown, { verifyHash: false }),
        (error) => error.code === 'UNKNOWN_CAPABILITY_KIND',
    )
    const unsealed = structuredClone(base)
    unsealed.capabilities[0].enforcement = 'observed'
    unsealed.capabilities[0].componentSafe = true
    assert.throws(
        () => validateCapabilityContract(unsealed, { verifyHash: false }),
        (error) => error.code === 'UNSEALED_CAPABILITY_CANNOT_BE_COMPONENT_SAFE',
    )
    const hidden = structuredClone(base)
    hidden.unknownSurfaces = ['environment:hidden-key']
    assert.throws(
        () => validateCapabilityContract(hidden, { verifyHash: false }),
        (error) => error.code === 'UNKNOWN_SURFACE_CANNOT_BE_LOCAL',
    )
})

test('legacy catalog wrapper admits the exact current source read-set', () => {
    const preflight = permissionPreflight()
    const sourceInputs = inventory().catalog.sourceInputs
    const allowedReadPaths = [
        sourceInputs.catalogModule.path,
        ...sourceInputs.patchFiles.map((entry) => entry.path),
    ]
    if (!preflight.available) {
        assert.throws(
            () => auditLegacyCatalogLoad({
                sourceRoot: ROOT,
                allowedReadPaths,
                expectedPackCount: 46,
                expectedUnitCount: 1184,
            }),
            (error) => error.code === 'CAPABILITY_PERMISSION_UNAVAILABLE',
        )
        return
    }
    const result = auditLegacyCatalogLoad({
        sourceRoot: ROOT,
        allowedReadPaths,
        expectedPackCount: 46,
        expectedUnitCount: 1184,
    })
    assert.equal(result.receipt.status, 'pass')
    assert.equal(result.receipt.permissions.declaredReadCount, 226)
    assert.equal(result.receipt.permissions.sourceReadRoot, false)
    assert.equal(result.receipt.permissions.sourceWrite, false)
    assert.equal(result.receipt.permissions.childProcess, false)
    assert.equal(result.receipt.permissions.worker, false)
    assert.equal(result.receipt.violations.length, 0)
    assert.ok(result.receipt.accesses.callCount > 0)
    assert.ok(result.receipt.accesses.uniqueCount > 0)
    if (process.version === 'v25.9.0') {
        assert.equal(result.receipt.accesses.callCount, 431)
        assert.equal(result.receipt.accesses.uniqueCount, 408)
    }
    assert.throws(
        () => validateLegacyAccessReceipt(result.receipt, {
            sourceRoot: ROOT,
            allowedReadPaths: allowedReadPaths.map((file) => path.resolve(ROOT, file)).sort(),
            expectedPackCount: 45,
            expectedUnitCount: 1184,
        }),
        (error) => error.code === 'ACCESS_RECEIPT_COVERAGE_MISMATCH',
    )
    const corrupt = structuredClone(result.receipt)
    corrupt.catalog.packCount = 45
    assert.throws(
        () => validateLegacyAccessReceipt(corrupt, {
            sourceRoot: ROOT,
            allowedReadPaths: allowedReadPaths.map((file) => path.resolve(ROOT, file)).sort(),
            expectedPackCount: 46,
            expectedUnitCount: 1184,
        }),
        (error) => error.code === 'ACCESS_RECEIPT_HASH_MISMATCH',
    )
})

test('legacy catalog wrapper rejects undeclared reads, writes, modules, workers, and native code', () => {
    if (!permissionPreflight().available) return
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'patch-capability-fixture-'))
    try {
        writeFixture(root, "'use strict'\nconst fs = require('node:fs')\nfs.readFileSync(__dirname + '/secret.txt')\nmodule.exports = { id: 'example', version: '1', units: [] }\n")
        fs.writeFileSync(path.join(root, 'patches/example/secret.txt'), 'secret')
        assert.throws(
            () => auditLegacyCatalogLoad({
                sourceRoot: root,
                allowedReadPaths: ['src/catalog.cjs', 'patches/example/manifest.cjs'],
                expectedPackCount: 1,
                expectedUnitCount: 0,
            }),
            (error) =>
                error.code === 'ACCESS_WORKER_FAILED'
                && error.details.stderr.includes('UNDECLARED_CATALOG_READ'),
        )

        const builtinCases = ['node:child_process', 'node:http', 'node:worker_threads']
        for (const builtin of builtinCases) {
            writeFixture(root, `'use strict'\nrequire('${builtin}')\nmodule.exports = { id: 'example', version: '1', units: [] }\n`)
            assert.throws(
                () => auditLegacyCatalogLoad({
                    sourceRoot: root,
                    allowedReadPaths: ['src/catalog.cjs', 'patches/example/manifest.cjs'],
                    expectedPackCount: 1,
                    expectedUnitCount: 0,
                }),
                (error) =>
                    error.code === 'ACCESS_WORKER_FAILED'
                    && error.details.stderr.includes('UNDECLARED_CATALOG_MODULE'),
            )
        }

        writeFixture(root, "'use strict'\nconst fs = require('node:fs')\nfs.writeFileSync(__dirname + '/output.txt', 'x')\nmodule.exports = { id: 'example', version: '1', units: [] }\n")
        assert.throws(
            () => auditLegacyCatalogLoad({
                sourceRoot: root,
                allowedReadPaths: ['src/catalog.cjs', 'patches/example/manifest.cjs'],
                expectedPackCount: 1,
                expectedUnitCount: 0,
            }),
            (error) =>
                error.code === 'ACCESS_WORKER_FAILED'
                && error.details.stderr.includes('UNDECLARED_CATALOG_WRITE'),
        )

        writeFixture(root, "'use strict'\nrequire('./addon.node')\nmodule.exports = { id: 'example', version: '1', units: [] }\n")
        fs.writeFileSync(path.join(root, 'patches/example/addon.node'), '')
        assert.throws(
            () => auditLegacyCatalogLoad({
                sourceRoot: root,
                allowedReadPaths: [
                    'src/catalog.cjs',
                    'patches/example/manifest.cjs',
                    'patches/example/addon.node',
                ],
                expectedPackCount: 1,
                expectedUnitCount: 0,
            }),
            (error) =>
                error.code === 'ACCESS_WORKER_FAILED'
                && error.details.stderr.includes('UNDECLARED_CATALOG_NATIVE_MODULE'),
        )
    } finally {
        fs.rmSync(root, { recursive: true, force: true })
    }
})

test('legacy command wrapper rejects spawn errors and false-pass output', () => {
    if (!permissionPreflight().available) return
    const originalSpawnSync = childProcess.spawnSync
    try {
        childProcess.spawnSync = () => ({
            error: Object.assign(new Error('blocked'), { code: 'EPERM' }),
            signal: null,
            status: 0,
            stdout: '',
            stderr: '',
        })
        assert.throws(
            () => auditLegacyCatalogLoad({
                sourceRoot: ROOT,
                allowedReadPaths: ['src/catalog.cjs'],
                expectedPackCount: 46,
                expectedUnitCount: 1184,
            }),
            (error) => error.code === 'ACCESS_WORKER_SPAWN_ERROR',
        )
        childProcess.spawnSync = () => ({
            error: null,
            signal: null,
            status: 0,
            stdout: '',
            stderr: '',
        })
        assert.throws(
            () => auditLegacyCatalogLoad({
                sourceRoot: ROOT,
                allowedReadPaths: ['src/catalog.cjs'],
                expectedPackCount: 46,
                expectedUnitCount: 1184,
            }),
            (error) => error.code === 'ACCESS_WORKER_EMPTY_OUTPUT',
        )
        childProcess.spawnSync = () => ({
            error: null,
            signal: 'SIGTERM',
            status: null,
            stdout: JSON.stringify({}),
            stderr: '',
        })
        assert.throws(
            () => auditLegacyCatalogLoad({
                sourceRoot: ROOT,
                allowedReadPaths: ['src/catalog.cjs'],
                expectedPackCount: 46,
                expectedUnitCount: 1184,
            }),
            (error) => error.code === 'ACCESS_WORKER_FAILED',
        )
        childProcess.spawnSync = () => ({
            error: null,
            signal: null,
            status: 0,
            stdout: 'not-json',
            stderr: '',
        })
        assert.throws(
            () => auditLegacyCatalogLoad({
                sourceRoot: ROOT,
                allowedReadPaths: ['src/catalog.cjs'],
                expectedPackCount: 46,
                expectedUnitCount: 1184,
            }),
            (error) => error.code === 'ACCESS_WORKER_INVALID_OUTPUT',
        )
    } finally {
        childProcess.spawnSync = originalSpawnSync
    }
})
