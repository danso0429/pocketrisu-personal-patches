#!/usr/bin/env node
'use strict'

const childProcess = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const {
    buildPilotIncident,
    buildPilotReceipt,
} = require('../src/toolchain-shadow-evidence.cjs')
const {
    syntheticGlobalProjection,
} = require('../src/toolchain-shadow-global.cjs')
const { createToolchainKnownAnswerTarget } = require('../src/toolchain-shadow-known-answer.cjs')
const { runFreshLocalShadow } = require('../src/toolchain-shadow-local.cjs')
const { BUILD_BOUNDARY_CLASS } = require('../src/toolchain-shadow-boundaries.cjs')
const {
    canonicalJson,
} = require('../src/verification-receipts.cjs')
const {
    contentTreeDescriptor,
    sha256,
    writeJsonAtomic,
} = require('../src/verification-evidence.cjs')
const {
    objectSha256,
    publishEvidenceObject,
} = require('../src/c0-retention.cjs')
const { loadCatalog } = require('../src/catalog.cjs')

const PILOT_SCHEMA_FILES = Object.freeze([
    'schemas/patch-toolchain-shadow-contract-v1.schema.json',
    'schemas/patch-toolchain-shadow-global-projection-v1.schema.json',
    'schemas/patch-toolchain-shadow-incident-v1.schema.json',
    'schemas/patch-toolchain-shadow-local-receipt-v1.schema.json',
    'schemas/patch-toolchain-shadow-pilot-receipt-v1.schema.json',
])
const LOCAL_ROUTE_FILES = Object.freeze([
    'contracts/toolchain-hardening-shadow-v1.json',
    'scripts/run-toolchain-shadow-mask.cjs',
    'src/toolchain-shadow-boundaries.cjs',
    'src/toolchain-shadow-contract.cjs',
    'src/toolchain-shadow-local.cjs',
    'src/toolchain-shadow-projection.cjs',
])
const GLOBAL_ROUTE_FILES = Object.freeze([
    'scripts/run-toolchain-global-projection.cjs',
    'scripts/verify-all-combinations.cjs',
    'src/toolchain-shadow-evidence.cjs',
    'src/toolchain-shadow-global.cjs',
])

function parseArgs(argv) {
    const options = { mode: null, materiallyDistinct: false, repeatedPerformanceTrial: false }
    const values = argv.slice(2)
    for (let index = 0; index < values.length; index += 1) {
        const value = values[index]
        if (value === '--synthetic-known-answer') options.mode = 'synthetic-dry-run'
        else if (value === '--material-shadow') options.mode = 'material-shadow'
        else if (value === '--materially-distinct') options.materiallyDistinct = true
        else if (value === '--repeated-performance-trial') options.repeatedPerformanceTrial = true
        else {
            const mapped = {
                '--root': 'root', '--store': 'store', '--receipt': 'receipt',
                '--governance-commit': 'governanceCommit', '--trial-id': 'trialId',
                '--local-receipt': 'localReceipt', '--global-projection': 'globalProjection',
                '--global-receipt': 'globalReceipt', '--c0-bundle': 'c0Bundle',
            }[value]
            if (!mapped || index + 1 >= values.length) throw new Error(`Unknown or incomplete option: ${value}`)
            options[mapped] = values[++index]
        }
    }
    for (const key of ['mode', 'root', 'store', 'receipt', 'governanceCommit', 'trialId']) {
        if (!options[key]) throw new Error(`Missing ${key}`)
    }
    if (!/^[0-9a-f]{40}$/.test(options.governanceCommit)) throw new Error('--governance-commit is invalid')
    if (options.mode === 'material-shadow') {
        const error = new Error('Legacy material pilot route is removed; use material-c0-global-plus-toolchain-shadow')
        error.code = 'LEGACY_MATERIAL_SHADOW_ROUTE_REMOVED'
        throw error
    }
    if (options.mode === 'synthetic-dry-run') {
        if (options.materiallyDistinct || options.repeatedPerformanceTrial
            || options.localReceipt || options.globalProjection || options.globalReceipt || options.c0Bundle) {
            throw new Error('Synthetic dry-run cannot bind material evidence or trial classification')
        }
    }
    return options
}

function allocatedBytes(root) {
    let total = 0
    function walk(absolute) {
        let stat
        try { stat = fs.lstatSync(absolute) } catch (error) {
            if (error.code === 'ENOENT') return
            throw error
        }
        total += Number(stat.blocks ?? 0) * 512
        if (stat.isDirectory()) for (const name of fs.readdirSync(absolute)) walk(path.join(absolute, name))
    }
    walk(root)
    return total
}

function filesIdentity(root, relatives) {
    const files = [...relatives].sort().map((relative) => ({
        path: relative,
        sha256: sha256(fs.readFileSync(path.join(root, relative))),
    }))
    return sha256(canonicalJson(files))
}

function gitOutput(root, args) {
    return childProcess.execFileSync('git', ['--no-pager', ...args], {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
    }).trim()
}

function buildAuthority({ root, governanceCommit, localReceipt, c0Bundle }) {
    const status = gitOutput(root, ['status', '--porcelain=v1'])
    if (status !== '') throw new Error('Pilot evidence requires a clean implementation worktree')
    const environment = {
        nodeVersion: process.version,
        platform: process.platform,
        architecture: process.arch,
        buildBoundary: BUILD_BOUNDARY_CLASS,
        locale: process.env.LC_ALL ?? process.env.LANG ?? null,
        timezone: process.env.TZ ?? null,
    }
    return {
        governanceCommit,
        implementationCommit: gitOutput(root, ['rev-parse', 'HEAD']),
        policySha256: sha256(fs.readFileSync(path.join(root, 'docs/patch-combination-verification-instructions.md'))),
        catalogSha256: contentTreeDescriptor(path.join(root, 'patches')).rootSha256,
        schemasSha256: filesIdentity(root, PILOT_SCHEMA_FILES),
        targetSha256: localReceipt.target.applicationTreeSha256,
        declarationSha256: localReceipt.declarationSha256,
        environmentSha256: sha256(canonicalJson(environment)),
        localRouteSha256: filesIdentity(root, LOCAL_ROUTE_FILES),
        globalRouteSha256: filesIdentity(root, GLOBAL_ROUTE_FILES),
        c0CohortId: c0Bundle?.cohort?.cohortId ?? null,
    }
}

function measuredPilotReceipt(argumentsObject) {
    let logicalBytes = 0
    for (let attempt = 0; attempt < 8; attempt += 1) {
        const receipt = buildPilotReceipt({
            ...argumentsObject,
            storageResources: { ...argumentsObject.storageResources, pilotLogicalBytes: logicalBytes },
        })
        const measured = Buffer.byteLength(JSON.stringify(receipt))
        if (measured === logicalBytes) return receipt
        logicalBytes = measured
    }
    throw new Error('Pilot receipt byte measurement did not stabilize')
}

async function main(argv = process.argv) {
    const options = parseArgs(argv)
    const root = fs.realpathSync(path.resolve(options.root))
    const store = path.resolve(options.store)
    const receiptPath = path.resolve(options.receipt)
    if (store === root || store.startsWith(`${root}${path.sep}`)
        || receiptPath === root || receiptPath.startsWith(`${root}${path.sep}`)) {
        throw new Error('Pilot evidence outputs must be outside the implementation repository')
    }
    const started = process.hrtime.bigint()
    const cpuStarted = process.cpuUsage()
    const storeBaselineBytes = allocatedBytes(store)
    let syntheticTarget = null
    let succeeded = false
    try {
        let localReceipt
        let globalProjection
        let globalReceipt = null
        let c0Bundle = null
        if (options.mode === 'synthetic-dry-run') {
            syntheticTarget = createToolchainKnownAnswerTarget(root)
            localReceipt = await runFreshLocalShadow({
                sourceRoot: root,
                targetRoot: syntheticTarget.root,
                targetProvenance: syntheticTarget.provenance,
                disposition: 'synthetic-known-answer',
                compiledContract: syntheticTarget.compiled,
            })
            const visiblePacks = loadCatalog(root).filter((pack) => pack.userSelectable !== false)
                .map((pack) => pack.id).sort()
            globalProjection = syntheticGlobalProjection({ localReceipt, visiblePacks })
        } else {
            localReceipt = JSON.parse(fs.readFileSync(path.resolve(options.localReceipt), 'utf8'))
            globalProjection = JSON.parse(fs.readFileSync(path.resolve(options.globalProjection), 'utf8'))
            globalReceipt = JSON.parse(fs.readFileSync(path.resolve(options.globalReceipt), 'utf8'))
            c0Bundle = JSON.parse(fs.readFileSync(path.resolve(options.c0Bundle), 'utf8'))
        }
        const localPublication = publishEvidenceObject(store, localReceipt)
        const projectionPublication = publishEvidenceObject(store, globalProjection)
        const externalPublications = []
        if (globalReceipt !== null) externalPublications.push(publishEvidenceObject(store, globalReceipt))
        if (c0Bundle !== null) externalPublications.push(publishEvidenceObject(store, c0Bundle))
        const cpu = process.cpuUsage(cpuStarted)
        const wrapperResources = {
            wallMs: Number(process.hrtime.bigint() - started) / 1e6,
            cpuUserMs: cpu.user / 1_000,
            cpuSystemMs: cpu.system / 1_000,
            maximumRssKiB: process.resourceUsage().maxRSS,
            evidenceStoreBaselineBytes: storeBaselineBytes,
            evidenceStoreSampledBytes: allocatedBytes(store),
        }
        const referenced = [localPublication, projectionPublication, ...externalPublications]
        const storageResources = {
            referencedReceiptBytes: referenced.reduce((total, entry) => total + entry.bytes, 0),
            referencedNewPhysicalBytes: referenced.reduce((total, entry) => total + entry.newPhysicalBytes, 0),
        }
        const authority = buildAuthority({
            root,
            governanceCommit: options.governanceCommit,
            localReceipt,
            c0Bundle,
        })
        const pilotReceipt = measuredPilotReceipt({
            mode: options.mode,
            localReceipt,
            globalProjection,
            globalReceipt,
            c0Bundle,
            authority,
            trialId: options.trialId,
            materiallyDistinct: options.materiallyDistinct,
            repeatedPerformanceTrial: options.repeatedPerformanceTrial,
            wrapperResources,
            storageResources,
        })
        const pilotPublication = publishEvidenceObject(store, pilotReceipt)
        let incidentPublication = null
        if (pilotReceipt.incidentRequired) {
            const incident = buildPilotIncident({
                pilotReceipt,
                pilotReceiptObjectSha256: pilotPublication.objectSha256,
            })
            incidentPublication = publishEvidenceObject(store, incident)
        }
        writeJsonAtomic(receiptPath, pilotReceipt)
        const postRunStoreBytes = allocatedBytes(store)
        const completeCpu = process.cpuUsage(cpuStarted)
        const output = {
            mode: options.mode,
            materialPilotEvidence: options.mode === 'material-shadow',
            productionAdmissionEvidence: false,
            receipt: receiptPath,
            cohortId: pilotReceipt.cohort.cohortId,
            runId: pilotReceipt.cohort.runId,
            result: pilotReceipt.result,
            publications: {
                local: localPublication,
                globalProjection: projectionPublication,
                pilot: pilotPublication,
                incident: incidentPublication,
            },
            evidenceStore: {
                baselineBytes: storeBaselineBytes,
                sampledBytes: wrapperResources.evidenceStoreSampledBytes,
                postRunBytes: postRunStoreBytes,
                newAllocatedBytes: Math.max(0, postRunStoreBytes - storeBaselineBytes),
            },
            completeWrapper: {
                wallMs: Number(process.hrtime.bigint() - started) / 1e6,
                cpuUserMs: completeCpu.user / 1_000,
                cpuSystemMs: completeCpu.system / 1_000,
                maximumRssKiB: process.resourceUsage().maxRSS,
            },
        }
        process.stdout.write(`${JSON.stringify(output)}\n`)
        succeeded = true
        return output
    } finally {
        if (succeeded && syntheticTarget !== null) {
            fs.rmSync(syntheticTarget.root, { recursive: true, force: true })
        }
    }
}

if (require.main === module) main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ code: error.code ?? null, message: error.message, details: error.details ?? null })}\n`)
    process.exitCode = 1
})

module.exports = {
    buildAuthority,
    filesIdentity,
    main,
    measuredPilotReceipt,
    parseArgs,
}
