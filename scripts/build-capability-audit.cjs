#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const {
    compileActionHypergraph,
} = require('../src/action-hypergraph.cjs')
const {
    compileCapabilityContract,
} = require('../src/capability-compiler.cjs')
const {
    auditLegacyCatalogLoad,
} = require('../src/legacy-capability-audit.cjs')
const {
    loadCatalog,
    resolveProfile,
} = require('../src/catalog.cjs')
const {
    planTransition,
} = require('../src/manager.cjs')
const {
    compileEffectInventory,
    discoverInventorySourceInputs,
    inspectGeneratedCatalogs,
    jsonSha256,
} = require('../src/effect-inventory.cjs')
const {
    assertOutputOutsideInputs,
    captureInputFreeze,
    compareInputFreeze,
    writeJsonAtomic,
} = require('../src/verification-evidence.cjs')
const {
    compileTargetObservation,
    freezeSummary,
    writeTextAtomic,
} = require('./build-effect-inventory.cjs')

const RECEIPT_SCHEMA = 'patch-capability-audit-receipt-v1'
const GOVERNANCE_COMMIT_PATTERN = /^[0-9a-f]{40}$/

function parseArgs(argv) {
    const options = {
        governanceCommit: null,
        markdownOutput: null,
        output: null,
        profile: 'all',
        targetProvenance: null,
        targetRoot: null,
    }
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index]
        const value = () => {
            const next = argv[index + 1]
            if (next === undefined || next.startsWith('--')) {
                throw new Error(`${argument} requires a value`)
            }
            index += 1
            return next
        }
        if (argument === '--governance-commit') options.governanceCommit = value()
        else if (argument === '--markdown-output') options.markdownOutput = value()
        else if (argument === '--output') options.output = value()
        else if (argument === '--profile') options.profile = value()
        else if (argument === '--target-provenance') options.targetProvenance = value()
        else if (argument === '--target-root') options.targetRoot = value()
        else throw new Error(`Unknown argument: ${argument}`)
    }
    if (!GOVERNANCE_COMMIT_PATTERN.test(options.governanceCommit ?? '')) {
        throw new Error('--governance-commit requires exactly 40 lowercase hexadecimal characters')
    }
    if (options.output === null) throw new Error('--output is required')
    if (options.targetRoot === null) throw new Error('--target-root is required')
    return options
}

function accessReadPaths(sourceInputs) {
    return [
        sourceInputs.catalogModule.path,
        ...sourceInputs.patchFiles.map((entry) => entry.path),
    ]
}

function renderMarkdown(receipt) {
    const targetGraph = receipt.targetCatalog.graph
    const selectionGraph = receipt.resolvedSelection.graph
    const tiers = Object.fromEntries(['L', 'B', 'G', 'U'].map((tier) => [
        tier,
        receipt.targetCatalog.contract.packs.filter((pack) => pack.tier === tier).length,
    ]))
    return [
        '# Patch Capability Audit',
        '',
        `- Status: ${receipt.status}`,
        `- Governance commit: ${receipt.governance.commit}`,
        `- Inventory: ${receipt.inventory.inventorySha256}`,
        `- Target catalog contract: ${receipt.targetCatalog.contract.contractSha256}`,
        `- Target catalog graph: ${targetGraph.graphSha256}`,
        `- Target catalog tiers: L=${tiers.L}, B=${tiers.B}, G=${tiers.G}, U=${tiers.U}`,
        `- Target catalog local components: ${targetGraph.localComponents.map((entry) => entry.packIds.length).join(', ')}`,
        `- Target catalog admitted components: ${targetGraph.components.map((entry) => entry.packIds.length).join(', ')}`,
        `- Resolved selection contract: ${receipt.resolvedSelection.contract.contractSha256}`,
        `- Resolved selection graph: ${selectionGraph.graphSha256}`,
        `- Resolved selection local components: ${selectionGraph.localComponents.map((entry) => entry.packIds.length).join(', ')}`,
        `- Resolved selection admitted components: ${selectionGraph.components.map((entry) => entry.packIds.length).join(', ')}`,
        `- Legacy access calls: ${receipt.legacyAccess.receipt.accesses.callCount}`,
        `- Legacy access records: ${receipt.legacyAccess.receipt.accesses.uniqueCount}`,
        `- Legacy access violations: ${receipt.legacyAccess.receipt.violations.length}`,
        '- Canonical gate: Global Exhaustive',
        '- Canonical masks skipped: 0',
        '- Certificates issued: 0',
        '',
        '## Limits',
        '',
        '- Every current pack remains Global or rejected; this audit does not admit Local or Boundary-safe execution.',
        '- Permission receipts observe the current legacy load and are not a proof about opaque application runtime behavior.',
        '- Global persisted state and worker history continue to union the selected catalog.',
        '',
    ].join('\n')
}

async function buildReceipt(options, {
    sourceRoot = path.resolve(__dirname, '..'),
} = {}) {
    const source = fs.realpathSync(path.resolve(sourceRoot))
    const targetRoot = fs.realpathSync(path.resolve(options.targetRoot))
    const output = assertOutputOutsideInputs(options.output, [source, targetRoot])
    const markdownOutput = options.markdownOutput === null
        ? null
        : assertOutputOutsideInputs(options.markdownOutput, [source, targetRoot])
    if (markdownOutput !== null && markdownOutput === output) {
        throw new Error('JSON and Markdown outputs must be different paths')
    }
    for (const candidate of [output, markdownOutput].filter(Boolean)) {
        if (fs.existsSync(candidate)) throw new Error(`Refusing to overwrite evidence output: ${candidate}`)
    }

    const before = await captureInputFreeze({
        sourceRoot: source,
        targetRoot,
        targetProvenance: options.targetProvenance,
    })
    const catalog = loadCatalog(source)
    const sourceInputs = discoverInventorySourceInputs(source, catalog)
    const generatedArtifacts = inspectGeneratedCatalogs(source, catalog)
    const inventory = compileEffectInventory(catalog, { sourceInputs, generatedArtifacts })
    const legacyAccess = auditLegacyCatalogLoad({
        sourceRoot: source,
        allowedReadPaths: accessReadPaths(sourceInputs),
        expectedPackCount: inventory.catalog.packCount,
        expectedUnitCount: inventory.catalog.unitCount,
    })
    const profile = resolveProfile(options.profile, catalog)
    const plan = planTransition({
        root: targetRoot,
        catalog,
        packIds: profile.defaults,
        profile: profile.id,
    })
    const observation = compileTargetObservation(plan, inventory)
    const targetCatalogContract = compileCapabilityContract(inventory, {
        scope: 'target-catalog',
        packageName: observation.target.packageName,
        packageVersion: observation.target.packageVersion,
    })
    const targetCatalogGraph = compileActionHypergraph(inventory, targetCatalogContract)
    const selectionContract = compileCapabilityContract(inventory, {
        scope: 'resolved-selection',
        packageName: observation.target.packageName,
        packageVersion: observation.target.packageVersion,
        packIds: observation.resolvedPackIds,
        unitIds: observation.activeUnitIds,
    })
    const selectionGraph = compileActionHypergraph(inventory, selectionContract)
    const after = await captureInputFreeze({
        sourceRoot: source,
        targetRoot,
        targetProvenance: options.targetProvenance,
    })
    const comparison = compareInputFreeze(before, after)
    const passed = comparison.matched
        && inventory.completeness.status === 'complete-observational'
        && legacyAccess.receipt.status === 'pass'
        && legacyAccess.receipt.violations.length === 0
        && targetCatalogContract.canonicalProtection.masksSkipped === 0
        && selectionContract.canonicalProtection.masksSkipped === 0
    const receipt = {
        schema: RECEIPT_SCHEMA,
        status: passed ? 'passed' : 'failed',
        createdAt: new Date().toISOString(),
        governance: {
            commit: options.governanceCommit,
            authorization: 'phase-2-audit-mode-only',
        },
        command: {
            profile: options.profile,
            output: path.basename(output),
            markdownOutput: markdownOutput === null ? null : path.basename(markdownOutput),
            targetProvenance: options.targetProvenance,
        },
        cohort: {
            before: freezeSummary(before),
            after: freezeSummary(after),
            inputsMatched: comparison.matched,
            sourceMatched: comparison.sourceMatched,
            targetMatched: comparison.targetMatched,
        },
        inventory,
        legacyAccess,
        targetCatalog: {
            contract: targetCatalogContract,
            graph: targetCatalogGraph,
        },
        resolvedSelection: {
            observation,
            contract: selectionContract,
            graph: selectionGraph,
        },
        canonicalProtection: {
            canonicalGate: 'Global Exhaustive',
            fallbackRetained: true,
            defaultVerificationCommandChanged: false,
            targetWritten: false,
            productionStateWritten: false,
            certificatesIssued: 0,
            canonicalMasksSkipped: 0,
            phase3AStarted: false,
        },
    }
    const sealedReceipt = {
        ...receipt,
        payloadSha256: jsonSha256(receipt),
    }
    if (markdownOutput !== null) writeTextAtomic(markdownOutput, renderMarkdown(sealedReceipt))
    writeJsonAtomic(output, sealedReceipt)
    return { receipt: sealedReceipt, output, markdownOutput }
}

async function main() {
    const options = parseArgs(process.argv.slice(2))
    const result = await buildReceipt(options)
    process.stdout.write(`${JSON.stringify({
        schema: result.receipt.schema,
        status: result.receipt.status,
        output: result.output,
        markdownOutput: result.markdownOutput,
        inventorySha256: result.receipt.inventory.inventorySha256,
        targetCatalogContractSha256: result.receipt.targetCatalog.contract.contractSha256,
        targetCatalogGraphSha256: result.receipt.targetCatalog.graph.graphSha256,
        selectionContractSha256: result.receipt.resolvedSelection.contract.contractSha256,
        selectionGraphSha256: result.receipt.resolvedSelection.graph.graphSha256,
        legacyAccessSha256: result.receipt.legacyAccess.receipt.payloadSha256,
        payloadSha256: result.receipt.payloadSha256,
    })}\n`)
    if (result.receipt.status !== 'passed') process.exitCode = 1
}

if (require.main === module) {
    main().catch((error) => {
        process.stderr.write(`${error.stack ?? error.message ?? error}\n`)
        process.exitCode = 1
    })
}

module.exports = {
    RECEIPT_SCHEMA,
    accessReadPaths,
    buildReceipt,
    parseArgs,
    renderMarkdown,
}
