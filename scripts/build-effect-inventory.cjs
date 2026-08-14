#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const {
    loadCatalog,
    resolveProfile,
} = require('../src/catalog.cjs')
const {
    DEFAULT_STATE_PATH,
    planTransition,
} = require('../src/manager.cjs')
const {
    compileEffectInventory,
    discoverInventorySourceInputs,
    inspectGeneratedCatalogs,
    jsonSha256,
    projectS0P,
    renderInventoryMarkdown,
    sha256,
} = require('../src/effect-inventory.cjs')
const {
    assertOutputOutsideInputs,
    captureInputFreeze,
    compareInputFreeze,
    writeJsonAtomic,
} = require('../src/verification-evidence.cjs')

const RECEIPT_SCHEMA = 'patch-effect-inventory-receipt-v1'
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

function observedPath(precondition, unitsByFile) {
    return {
        path: precondition.path,
        exists: precondition.before !== null,
        mode: precondition.beforeMode ?? null,
        contentSha256: precondition.before === null ? null : sha256(precondition.before),
        unitIds: unitsByFile.get(precondition.path) ?? [],
    }
}

function compileTargetObservation(plan, inventory) {
    if (plan.state === null) throw new Error('Inventory target observation requires a non-empty prospective state')
    const unitIds = new Set(plan.state.units.map((unit) => unit.id))
    const inventoryUnits = new Map(inventory.units.map((unit) => [unit.id, unit]))
    const unitsByFile = new Map()
    for (const id of unitIds) {
        const unit = inventoryUnits.get(id)
        if (!unit) throw new Error(`Prospective state contains an uninventoried unit: ${id}`)
        if (!unitsByFile.has(unit.file)) unitsByFile.set(unit.file, [])
        unitsByFile.get(unit.file).push(id)
    }
    for (const ids of unitsByFile.values()) ids.sort()
    const managedPaths = [...unitsByFile.keys()].sort()
    const pathObservations = plan.preconditions
        .filter((entry) => entry.path !== DEFAULT_STATE_PATH && unitsByFile.has(entry.path))
        .map((entry) => observedPath(entry, unitsByFile))
        .sort((left, right) => left.path.localeCompare(right.path))
    if (pathObservations.length !== managedPaths.length) {
        throw new Error(
            `Target observation coverage mismatch: ${pathObservations.length}/${managedPaths.length}`,
        )
    }
    const observation = {
        schema: 'patch-effect-target-observation-v1',
        target: plan.target,
        profile: plan.profile,
        requestedPackCount: plan.resolution.requested.length,
        resolvedPackCount: plan.resolution.resolvedIds.length,
        resolvedPackIds: plan.resolution.resolvedIds,
        activeUnitCount: unitIds.size,
        activeUnitIds: [...unitIds].sort(),
        activeManagedPathCount: managedPaths.length,
        activeManagedPaths: managedPaths,
        pathObservations,
        order: plan.order,
        orderSha256: jsonSha256(plan.order),
        collisionCount: plan.collisions.length,
        collisions: plan.collisions,
        collisionsSha256: jsonSha256(plan.collisions),
        prospectiveStateSha256: jsonSha256(plan.state),
        persistedStateWritten: false,
    }
    return {
        ...observation,
        observationSha256: jsonSha256(observation),
    }
}

function freezeSummary(freeze) {
    return {
        source: {
            commit: freeze.source.git.commit,
            branch: freeze.source.git.branch,
            status: freeze.source.git.status,
            unstagedDiffSha256: freeze.source.git.unstagedDiffSha256,
            stagedDiffSha256: freeze.source.git.stagedDiffSha256,
            applicationRootSha256: freeze.source.applicationTree.rootSha256,
            catalogRootSha256: freeze.source.catalog.rootSha256,
            policySha256: freeze.source.policy.sha256,
        },
        target: {
            provenance: freeze.target.provenance,
            applicationRootSha256: freeze.target.applicationTree.rootSha256,
        },
    }
}

function writeTextAtomic(file, content) {
    const absolute = path.resolve(file)
    const temporary = path.join(
        path.dirname(absolute),
        `.${path.basename(absolute)}.${process.pid}.tmp`,
    )
    try {
        fs.writeFileSync(temporary, content, { flag: 'wx', mode: 0o600 })
        fs.linkSync(temporary, absolute)
    } finally {
        try {
            fs.unlinkSync(temporary)
        } catch (error) {
            if (error.code !== 'ENOENT') throw error
        }
    }
}

async function buildReceipt(options, {
    sourceRoot = path.resolve(__dirname, '..'),
} = {}) {
    const targetRoot = fs.realpathSync(path.resolve(options.targetRoot))
    const output = assertOutputOutsideInputs(options.output, [sourceRoot, targetRoot])
    const markdownOutput = options.markdownOutput === null
        ? null
        : assertOutputOutsideInputs(options.markdownOutput, [sourceRoot, targetRoot])
    if (markdownOutput !== null && markdownOutput === output) {
        throw new Error('JSON and Markdown outputs must be different paths')
    }
    for (const candidate of [output, markdownOutput].filter(Boolean)) {
        if (fs.existsSync(candidate)) throw new Error(`Refusing to overwrite evidence output: ${candidate}`)
    }

    const before = await captureInputFreeze({
        sourceRoot,
        targetRoot,
        targetProvenance: options.targetProvenance,
    })
    const catalog = loadCatalog(sourceRoot)
    const sourceInputs = discoverInventorySourceInputs(sourceRoot, catalog)
    const generatedArtifacts = inspectGeneratedCatalogs(sourceRoot, catalog)
    const inventory = compileEffectInventory(catalog, { sourceInputs, generatedArtifacts })
    const profile = resolveProfile(options.profile, catalog)
    const plan = planTransition({
        root: targetRoot,
        catalog,
        packIds: profile.defaults,
        profile: profile.id,
    })
    const targetObservation = compileTargetObservation(plan, inventory)
    const projection = projectS0P(plan.state, inventory)
    const after = await captureInputFreeze({
        sourceRoot,
        targetRoot,
        targetProvenance: options.targetProvenance,
    })
    const comparison = compareInputFreeze(before, after)
    const status = comparison.matched
        && inventory.completeness.status === 'complete-observational'
        && generatedArtifacts.every((artifact) => artifact.catalogMatches === true)
        ? 'passed'
        : 'failed'
    const receipt = {
        schema: RECEIPT_SCHEMA,
        status,
        createdAt: new Date().toISOString(),
        governance: {
            commit: options.governanceCommit,
            authorization: 'phase-1-observational-inventory-only',
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
        targetObservation,
        S0PProjection: projection,
        canonicalProtection: {
            canonicalGate: 'Global Exhaustive',
            fallbackRetained: true,
            defaultVerificationCommandChanged: false,
            targetWritten: false,
            productionStateWritten: false,
            certificatesIssued: false,
            canonicalMasksSkipped: 0,
            phase2Started: false,
        },
    }
    const sealedReceipt = {
        ...receipt,
        payloadSha256: jsonSha256(receipt),
    }
    const markdown = renderInventoryMarkdown(inventory, { targetObservation })
    if (markdownOutput !== null) writeTextAtomic(markdownOutput, markdown)
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
        observationSha256: result.receipt.targetObservation.observationSha256,
        projectionSha256: result.receipt.S0PProjection.projectionSha256,
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
    buildReceipt,
    compileTargetObservation,
    freezeSummary,
    parseArgs,
    writeTextAtomic,
}
