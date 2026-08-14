'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { loadCatalog } = require('../src/catalog.cjs')
const {
    INVENTORY_SCHEMA,
    PROJECTION_SCHEMA,
    compileEffectInventory,
    discoverInventorySourceInputs,
    inspectGeneratedCatalogs,
    normalizeValue,
    projectS0P,
    renderInventoryMarkdown,
} = require('../src/effect-inventory.cjs')
const {
    RECEIPT_SCHEMA,
    compileTargetObservation,
    parseArgs,
} = require('../scripts/build-effect-inventory.cjs')

const repositoryRoot = path.resolve(__dirname, '..')
const catalog = loadCatalog(repositoryRoot)
const sourceInputs = discoverInventorySourceInputs(repositoryRoot, catalog)
const generatedArtifacts = inspectGeneratedCatalogs(repositoryRoot, catalog)
const inventory = compileEffectInventory(catalog, {
    sourceInputs,
    generatedArtifacts,
})

test('current catalog inventory is complete with first/middle/last and hash witnesses', () => {
    assert.equal(inventory.schema, INVENTORY_SCHEMA)
    assert.equal(inventory.catalog.packCount, 46)
    assert.equal(inventory.catalog.visiblePackCount, 12)
    assert.equal(inventory.catalog.internalPackCount, 34)
    assert.equal(inventory.catalog.unitCount, 1184)
    assert.equal(inventory.catalog.managedPathCount, 259)
    assert.equal(inventory.completeness.status, 'complete-observational')
    assert.deepEqual(inventory.completeness.issues, [])
    assert.equal(
        inventory.inventorySha256,
        '96f66b7c0bf60bf4cb6cbcf719884534e10f68964e3741fd6c5b9bcb96a6073e',
    )

    assert.equal(inventory.packs[0].id, 'bg-preserve')
    assert.equal(inventory.packs[Math.floor(inventory.packs.length / 2)].id, 'kei-stream-parser-bg-adapter')
    assert.equal(inventory.packs.at(-1).id, 'pocketrisu-kei')
    assert.equal(inventory.units[0].id, 'bg-preserve:hook:processzip-asset-save-aggregate-cause')
    assert.equal(
        inventory.units[Math.floor(inventory.units.length / 2)].id,
        'kei-chat-render-bg-adapter:default-chat-generation-state:1.9',
    )
    assert.equal(
        inventory.units.at(-1).id,
        'kei-backup-restore-safety-lazy-adapter:auto-server-option:1.9',
    )
    assert.equal(new Set(inventory.units.map((unit) => unit.id)).size, 1184)
    assert.equal(inventory.units.every((unit) => /^[0-9a-f]{64}$/.test(unit.definitionSha256)), true)
})

test('source and generated catalog inputs are mechanically cross-checked', () => {
    assert.equal(sourceInputs.rootManifestModules.length, 46)
    assert.equal(sourceInputs.manifestModules.length, 59)
    assert.equal(sourceInputs.patchFiles.length, 225)
    assert.equal(
        sourceInputs.sourceInputsSha256,
        '1e0d336dd1ad271213b22dac76ea64ebe3af29fc5ce5a2ee0ddefd6dce1ae16f',
    )
    assert.deepEqual(sourceInputs.patchFiles.slice(0, 3).map((entry) => entry.path), [
        'patches/bg-preserve/files/server/node/bgOrchestrationResultRetention.cjs',
        'patches/bg-preserve/files/server/node/bgOrchestrationResultRetention.test.ts',
        'patches/bg-preserve/files/server/node/bgRequestLogBridge.cjs',
    ])
    assert.deepEqual(sourceInputs.patchFiles.slice(-3).map((entry) => entry.path), [
        'patches/toolchain-hardening/files/pnpm-lock-snapshots.yaml',
        'patches/toolchain-hardening/files/vitest.setup.ts',
        'patches/toolchain-hardening/manifest.cjs',
    ])
    assert.deepEqual(
        sourceInputs.rootManifestModules.map((entry) => entry.packId),
        catalog.map((pack) => pack.id),
    )
    assert.deepEqual(generatedArtifacts.map((artifact) => artifact.file), [
        'dist/pocketrisu-all.cjs',
        'dist/pocketrisu-features.cjs',
        'dist/pocketrisu-hardening.cjs',
        'dist/pocketrisu-patcher.cjs',
    ])
    assert.equal(generatedArtifacts.every((artifact) => artifact.catalogMatches), true)
    assert.equal(generatedArtifacts.every((artifact) => artifact.packCount === 46), true)
    assert.equal(generatedArtifacts.every((artifact) => artifact.unitCount === 1184), true)
    assert.equal(generatedArtifacts.every((artifact) => artifact.managedPathCount === 259), true)
})

test('target views preserve every version-scoped unit without changing the catalog', () => {
    assert.deepEqual(inventory.targetViews.map((view) => ({
        target: `${view.target.packageName}@${view.target.packageVersion}`,
        status: view.target.status,
        units: view.unitCount,
        paths: view.managedPathCount,
    })), [
        { target: 'pocketrisu@1.8.1', status: 'verified', units: 646, paths: 201 },
        { target: 'pocketrisu@1.9.0', status: 'verified', units: 869, paths: 254 },
    ])
    assert.equal(catalog.reduce((count, pack) => count + pack.units.length, 0), 1184)
})

test('relations retain higher-order conditions, ownership and declared order', () => {
    assert.equal(inventory.relations.packEdges.length, 78)
    assert.equal(inventory.relations.autoWhenHyperedges.length, 24)
    assert.equal(inventory.relations.unitEdges.length, 1516)
    assert.deepEqual(
        Object.fromEntries(['after', 'before', 'requires'].map((relation) => [
            relation,
            inventory.relations.unitEdges.filter((edge) => edge.relation === relation).length,
        ])),
        { after: 674, before: 0, requires: 842 },
    )
    assert.deepEqual(
        inventory.relations.autoWhenHyperedges.find(
            (edge) => edge.subject === 'client-build-fence-kei-lazy-storage-adapter',
        ),
        {
            subject: 'client-build-fence-kei-lazy-storage-adapter',
            all: ['client-build-fence', 'kei-backup-restore-safety-lazy-adapter'],
            any: [],
            none: [],
        },
    )
    assert.equal(inventory.ownership.wholeFileUnitIds.length, 172)
    assert.equal(inventory.ownership.managedRegionUnitIds.length, 1012)
    assert.equal(inventory.ownership.sharedManagedPaths.length, 44)
    assert.equal(inventory.ordering.targetStructuralOrdering, 'requires-exact-target-baseline-observation')
})

test('current unsealed packs remain G candidates and Phase 1 admits no L or B', () => {
    assert.deepEqual(
        Object.fromEntries(['L', 'B', 'G', 'U'].map((tier) => [
            tier,
            inventory.classifications.filter((entry) => entry.candidateTier === tier).length,
        ])),
        { L: 0, B: 0, G: 46, U: 0 },
    )
    assert.equal(inventory.classifications.every((entry) => entry.enforced === false), true)
    assert.equal(inventory.state.patcherGlobalSurfaces.length, 4)
    assert.equal(inventory.state.undeclaredPackStateEffects.length, 46)
    assert.equal(inventory.symbols.declaredSymbols.length, 0)
    assert.equal(inventory.symbols.undeclaredUnitSymbolEffects.length, 1184)
})

test('unknown fields and unsupported values are explicit U instead of omissions', () => {
    const unknown = compileEffectInventory([{
        id: 'unknown-pack',
        version: '1',
        units: [{
            id: 'unknown-pack:file',
            file: 'file.ts',
            type: 'owned',
            content: 'content',
            futureUnitEffect: 'opaque',
        }],
        futurePackEffect: 'opaque',
    }])
    assert.equal(unknown.classifications[0].candidateTier, 'U')
    assert.equal(unknown.completeness.status, 'incomplete-fail-closed')
    assert.equal(
        unknown.completeness.issues.some((issue) =>
            issue.kind === 'unknown-pack-field' && issue.field === 'futurePackEffect'
        ),
        true,
    )
    assert.equal(
        unknown.completeness.issues.some((issue) =>
            issue.kind === 'unknown-unit-field' && issue.field === 'futureUnitEffect'
        ),
        true,
    )

    const unsupported = compileEffectInventory([{
        id: 'function-pack',
        version: '1',
        source: () => 'dynamic',
        units: [],
    }])
    assert.equal(unsupported.classifications[0].candidateTier, 'U')
    assert.equal(
        unsupported.completeness.issues.some((issue) => issue.kind === 'unsupported-pack-value'),
        true,
    )

    const cyclic = {}
    cyclic.self = cyclic
    const unsupportedEntries = []
    assert.deepEqual(normalizeValue(cyclic, { unsupported: unsupportedEntries }), {
        self: { $unsupported: 'cycle' },
    })
    assert.deepEqual(unsupportedEntries, [{ location: '$.self', kind: 'cycle' }])
})

test('S0-P projection is read-only, non-canonical and retains global connectors', () => {
    const syntheticInventory = compileEffectInventory([{
        id: 'pack-a',
        version: '1',
        units: [{
            id: 'pack-a:file',
            file: 'file.ts',
            type: 'owned',
            content: 'content',
        }],
    }])
    const state = {
        format: 2,
        profile: 'all',
        target: { packageName: 'pocketrisu', packageVersion: 'fixture' },
        selection: {
            effectiveRequested: ['pack-a'],
            resolvedIds: ['pack-a'],
            autoAdded: [],
            dependencyAdded: [],
        },
        packs: [{ id: 'pack-a', version: '1', etag: 'etag-a' }],
        order: ['pack-a:file'],
        collisions: [],
        units: [{
            id: 'pack-a:file',
            file: 'file.ts',
            type: 'owned',
            content: 'content',
            pack: 'pack-a',
            packVersion: '1',
        }],
        files: {
            'file.ts': {
                baselineHash: null,
                outputHash: 'output',
                outputMode: 0o644,
            },
        },
    }
    const before = JSON.stringify(state)
    const projection = projectS0P(state, syntheticInventory)
    assert.equal(JSON.stringify(state), before)
    assert.equal(projection.schema, PROJECTION_SCHEMA)
    assert.equal(projection.canonical, false)
    assert.equal(projection.readOnly, true)
    assert.equal(projection.packRecords.length, 1)
    assert.deepEqual(projection.packRecords[0].managedPaths, ['file.ts'])
    assert.match(projection.globalConnectors.reason, /global canonical/)
    assert.match(projection.projectionSha256, /^[0-9a-f]{64}$/)
})

test('target observation covers every managed path and rejects missing coverage', () => {
    const syntheticInventory = compileEffectInventory([{
        id: 'pack-a',
        version: '1',
        units: [{
            id: 'pack-a:file',
            file: 'file.ts',
            type: 'owned',
            content: 'content',
        }],
    }])
    const plan = {
        target: { packageName: 'pocketrisu', packageVersion: 'fixture' },
        profile: 'all',
        resolution: { requested: ['pack-a'], resolvedIds: ['pack-a'] },
        order: ['pack-a:file'],
        collisions: [],
        state: {
            format: 2,
            profile: 'all',
            target: { packageName: 'pocketrisu', packageVersion: 'fixture' },
            packs: [{ id: 'pack-a', version: '1', etag: 'etag-a' }],
            order: ['pack-a:file'],
            collisions: [],
            units: [{ id: 'pack-a:file', file: 'file.ts', pack: 'pack-a' }],
            files: { 'file.ts': { baselineHash: null, outputHash: 'output' } },
        },
        preconditions: [{ path: 'file.ts', before: null, beforeMode: null }],
    }
    const observation = compileTargetObservation(plan, syntheticInventory)
    assert.equal(observation.activeUnitCount, 1)
    assert.equal(observation.activeManagedPathCount, 1)
    assert.equal(observation.pathObservations[0].exists, false)
    assert.equal(observation.persistedStateWritten, false)

    assert.throws(
        () => compileTargetObservation({ ...plan, preconditions: [] }, syntheticInventory),
        /coverage mismatch/,
    )
})

test('human catalog is deterministic and names its proof limits', () => {
    const first = renderInventoryMarkdown(inventory)
    const second = renderInventoryMarkdown(inventory)
    assert.equal(first, second)
    assert.match(first, /Packs: 46 \(12 visible, 34 internal\)/)
    assert.match(first, /Candidate tiers: L 0, B 0, G 46, U 0/)
    assert.match(first, /CommonJS manifest execution is not deny-by-default/)
})

test('receipt CLI arguments fail closed and schemas remain parseable JSON', () => {
    assert.equal(RECEIPT_SCHEMA, 'patch-effect-inventory-receipt-v1')
    assert.throws(() => parseArgs([]), /governance-commit/)
    assert.throws(
        () => parseArgs([
            '--governance-commit', '0'.repeat(40),
            '--target-root', '/tmp/target',
            '--output', '/tmp/output',
            '--unknown', 'value',
        ]),
        /Unknown argument/,
    )
    for (const file of [
        'schemas/patch-effect-inventory-v1.schema.json',
        'schemas/patch-effect-inventory-receipt-v1.schema.json',
        'schemas/patch-s0p-projection-v1.schema.json',
    ]) {
        assert.doesNotThrow(() => JSON.parse(fs.readFileSync(path.join(repositoryRoot, file), 'utf8')))
    }
})
