#!/usr/bin/env node
'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { performance } = require('node:perf_hooks')
const {
    Worker,
    isMainThread,
    parentPort,
    workerData,
} = require('node:worker_threads')
const { loadCatalog } = require('../src/catalog.cjs')
const {
    assertTargetReviewable,
    assertTargetVerified,
    evaluateTargetCompatibility,
} = require('../src/compatibility.cjs')
const {
    DEFAULT_STATE_PATH,
    applyTransition,
    createPackEtagCache,
    createStateEncodingCache,
    planTransition,
    status,
} = require('../src/manager.cjs')
const {
    createCompositionCache,
    createPairAnalysisCache,
} = require('../src/compose.cjs')

const WORKER_HISTORY_MODEL = Object.freeze({
    schema: 'patch-combination-worker-history-v1',
    schedule: 'stride-v1',
    assignment: 'mask = workerIndex + (step * workerCount)',
    targetCopies: 'one complete target copy per worker',
    workerLifetime: 'one worker thread, module graph, and cache set for all assigned masks',
    managedReset: 'catalog-managed bytes and POSIX modes restored and verified after every mask',
    persistentWithinWorker: Object.freeze([
        'process state',
        'module state',
        'calculation caches',
        'unmanaged filesystem history',
        'execution-order history',
    ]),
    freshPerMask: false,
    resume: 'unsupported',
})

function parseArgs(argv) {
    let root = null
    let json = false
    let allowReviewing = false
    const availableParallelism = typeof os.availableParallelism === 'function'
        ? os.availableParallelism()
        : os.cpus().length
    // Automatic fan-out is bounded because every worker owns a complete
    // source copy and in-process cache. An explicit --jobs remains available.
    let jobs = Math.max(1, Math.min(availableParallelism, 4))
    for (let index = 2; index < argv.length; index += 1) {
        if (argv[index] === '--root') root = argv[++index]
        else if (argv[index] === '--json') json = true
        else if (argv[index] === '--allow-reviewing') allowReviewing = true
        else if (argv[index] === '--jobs') {
            const value = argv[++index]
            if (!/^[1-9]\d*$/.test(value ?? '')) {
                throw new Error('--jobs requires a positive integer')
            }
            jobs = Number(value)
            if (!Number.isSafeInteger(jobs)) {
                throw new Error('--jobs requires a positive safe integer')
            }
        }
        else throw new Error(`Unknown argument: ${argv[index]}`)
    }
    if (!root) {
        throw new Error(
            'Usage: verify-all-combinations.cjs --root PRISTINE_POCKETRISU '
            + '[--allow-reviewing] [--jobs N] [--json]',
        )
    }
    return { root: path.resolve(root), json, allowReviewing, jobs }
}

function fingerprint(root, relative) {
    const absolute = path.join(root, relative)
    let stat
    try {
        stat = fs.lstatSync(absolute)
    } catch (error) {
        if (error.code === 'ENOENT') return null
        throw error
    }
    if (!stat.isFile()) {
        throw new Error(`Managed baseline path is not a regular file: ${relative}`)
    }
    return {
        sha256: crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex'),
        mode: stat.mode & 0o7777,
    }
}

function snapshot(root, paths) {
    return Object.fromEntries(paths.map((relative) => [
        relative,
        fingerprint(root, relative),
    ]))
}

function sameSnapshot(left, right) {
    return JSON.stringify(left) === JSON.stringify(right)
}

function timed(timings, key, operation) {
    const started = performance.now()
    try {
        return operation()
    } finally {
        timings[key] += performance.now() - started
    }
}

function roundedTimings(timings) {
    return Object.fromEntries(
        Object.entries(timings).map(([key, value]) => [key, Math.round(value * 100) / 100]),
    )
}

function deepFreeze(value, seen = new Set()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return value
    seen.add(value)
    for (const child of Object.values(value)) deepFreeze(child, seen)
    return Object.freeze(value)
}

function inspectTarget(root, allowReviewing) {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
    if (pkg.name !== 'pocketrisu') {
        throw new Error('Combination target is not a PocketRisu source root')
    }
    if (fs.existsSync(path.join(root, DEFAULT_STATE_PATH))) {
        throw new Error('Combination target already has applied patch state')
    }

    const repositoryRoot = path.resolve(__dirname, '..')
    const catalog = deepFreeze(loadCatalog(repositoryRoot))
    const compatibility = evaluateTargetCompatibility(root, catalog)
    if (allowReviewing) assertTargetReviewable(compatibility)
    else assertTargetVerified(compatibility)
    const visible = catalog
        .filter((pack) => pack.userSelectable !== false)
        .map((pack) => pack.id)
        .sort()
    const managedPaths = [...new Set(
        catalog.flatMap((pack) => pack.units.map((unit) => unit.file)),
    )].sort()
    return {
        pkg,
        catalog,
        compatibility,
        visible,
        managedPaths,
    }
}

function* shardMasks(totalSelections, shardIndex, shardCount) {
    if (
        !Number.isInteger(totalSelections)
        || totalSelections < 0
        || !Number.isInteger(shardIndex)
        || !Number.isInteger(shardCount)
        || shardCount < 1
        || shardIndex < 0
        || shardIndex >= shardCount
    ) {
        throw new Error('Invalid combination shard')
    }
    for (let mask = shardIndex; mask < totalSelections; mask += shardCount) {
        yield mask
    }
}

function workerMaskSequence(totalSelections, shardIndex, shardCount) {
    return [...shardMasks(totalSelections, shardIndex, shardCount)]
}

function verifyShard({
    root,
    allowReviewing,
    shardIndex,
    shardCount,
}) {
    const {
        catalog,
        compatibility,
        visible,
        managedPaths,
    } = inspectTarget(root, allowReviewing)
    const totalSelections = 2 ** visible.length
    if (!Number.isSafeInteger(totalSelections)) {
        throw new Error('Visible pack count exceeds safe exhaustive selection indexing')
    }
    const baseline = snapshot(root, managedPaths)
    const graphs = new Set()
    let maximumResolvedUnits = 0
    const assignedMasks = workerMaskSequence(totalSelections, shardIndex, shardCount)
    const processedMasks = []
    const compositionCache = createCompositionCache()
    const packEtagCache = createPackEtagCache()
    const pairAnalysisCache = createPairAnalysisCache()
    const stateEncodingCache = createStateEncodingCache()
    const timings = {
        apply: 0,
        initialPlan: 0,
        repeatedPlan: 0,
        revertApply: 0,
        revertPlan: 0,
        snapshot: 0,
        status: 0,
        total: 0,
    }

    for (const mask of assignedMasks) {
        const selected = visible.filter((_, index) =>
            Math.floor(mask / (2 ** index)) % 2 === 1
        )
        const selectionStarted = performance.now()
        let phase = 'initial-plan'
        try {
            const transition = timed(timings, 'initialPlan', () => planTransition({
                root,
                catalog,
                packIds: selected,
                profile: 'combination-test',
                compositionOptions: { compositionCache, pairAnalysisCache },
                packEtagCache,
                stateEncodingCache,
            }))
            graphs.add(JSON.stringify(transition.resolution.resolvedIds))
            maximumResolvedUnits = Math.max(
                maximumResolvedUnits,
                transition.order.length,
            )
            phase = 'apply'
            timed(timings, 'apply', () => applyTransition({ root, transition }))

            phase = 'status'
            const current = timed(timings, 'status', () => status({ root }))
            const expectedStatus = transition.state === null ? 'clean' : 'current'
            if (current.status !== expectedStatus) {
                throw new Error(
                    `Expected ${expectedStatus} status, observed ${current.status}`,
                )
            }

            phase = 'repeated-plan'
            const repeated = timed(timings, 'repeatedPlan', () => planTransition({
                root,
                catalog,
                packIds: selected,
                profile: 'combination-test',
                compositionOptions: { compositionCache, pairAnalysisCache },
                packEtagCache,
                stateEncodingCache,
            }))
            if (repeated.changes.length > 0) {
                throw new Error(
                    `Repeated plan changed: ${repeated.changes
                        .map((change) => change.path)
                        .join(', ')}`,
                )
            }

            phase = 'revert-plan'
            const reverted = timed(timings, 'revertPlan', () => planTransition({
                root,
                catalog,
                packIds: [],
                profile: 'combination-test',
                compositionOptions: { compositionCache, pairAnalysisCache },
                packEtagCache,
                stateEncodingCache,
            }))
            phase = 'revert-apply'
            timed(
                timings,
                'revertApply',
                () => applyTransition({ root, transition: reverted }),
            )
            phase = 'restoration-snapshot'
            const restored = timed(
                timings,
                'snapshot',
                () => sameSnapshot(snapshot(root, managedPaths), baseline),
            )
            if (!restored) {
                throw new Error('Managed byte/mode snapshot differs after revert')
            }
            processedMasks.push(mask)
        } catch (error) {
            error.mask = mask
            error.phase = phase
            error.selection = selected
            error.workerHistory = {
                workerIndex: shardIndex,
                workerCount: shardCount,
                orderedMasks: assignedMasks,
                completedMasks: [...processedMasks],
                schedule: WORKER_HISTORY_MODEL.schedule,
            }
            throw error
        } finally {
            timings.total += performance.now() - selectionStarted
        }
    }

    return {
        shardIndex,
        shardCount,
        processedMasks,
        workerHistory: {
            workerIndex: shardIndex,
            workerCount: shardCount,
            orderedMasks: assignedMasks,
            schedule: WORKER_HISTORY_MODEL.schedule,
        },
        graphs: [...graphs],
        maximumResolvedUnits,
        compatibility: compatibility.status,
        managedPaths: managedPaths.length,
        compositionCache: {
            bypasses: compositionCache.bypasses,
            hits: compositionCache.hits,
            misses: compositionCache.misses,
            stores: compositionCache.stores,
        },
        pairAnalysisCache: {
            entries: pairAnalysisCache.entries,
            hits: pairAnalysisCache.hits,
            misses: pairAnalysisCache.misses,
        },
        packEtagCache: {
            hits: packEtagCache.hits,
            misses: packEtagCache.misses,
        },
        stateEncodingCache: {
            hits: stateEncodingCache.hits,
            misses: stateEncodingCache.misses,
        },
        timingsMs: roundedTimings(timings),
    }
}

function coverageError(message) {
    const error = new Error(message)
    error.code = 'INCOMPLETE_COMBINATION_COVERAGE'
    return error
}

function mergeShardResults(totalSelections, results) {
    const processed = new Set()
    const graphs = new Set()
    let maximumResolvedUnits = 0
    const pairAnalysisCache = {
        entries: 0,
        hits: 0,
        misses: 0,
    }
    const compositionCache = {
        bypasses: 0,
        hits: 0,
        misses: 0,
        stores: 0,
    }
    const timingsMs = {
        apply: 0,
        initialPlan: 0,
        repeatedPlan: 0,
        revertApply: 0,
        revertPlan: 0,
        snapshot: 0,
        status: 0,
        total: 0,
    }
    const packEtagCache = {
        hits: 0,
        misses: 0,
    }
    const stateEncodingCache = {
        hits: 0,
        misses: 0,
    }
    const workerHistories = []
    const workerIndexes = new Set()
    for (const result of results) {
        const history = result.workerHistory
        if (
            !history
            || history.schedule !== WORKER_HISTORY_MODEL.schedule
            || !Number.isInteger(history.workerIndex)
            || history.workerIndex < 0
            || history.workerIndex >= results.length
            || history.workerCount !== results.length
            || workerIndexes.has(history.workerIndex)
        ) {
            throw coverageError('Worker reported invalid or duplicate history metadata')
        }
        const expectedMasks = workerMaskSequence(
            totalSelections,
            history.workerIndex,
            history.workerCount,
        )
        if (
            JSON.stringify(history.orderedMasks) !== JSON.stringify(expectedMasks)
            || JSON.stringify(result.processedMasks) !== JSON.stringify(expectedMasks)
        ) {
            throw coverageError(
                `Worker ${history.workerIndex} mask history differs from canonical stride`,
            )
        }
        workerIndexes.add(history.workerIndex)
        workerHistories.push({
            workerIndex: history.workerIndex,
            orderedMasks: [...history.orderedMasks],
        })
        for (const mask of result.processedMasks) {
            if (!Number.isInteger(mask) || mask < 0 || mask >= totalSelections) {
                throw coverageError(`Worker reported out-of-range selection mask ${mask}`)
            }
            if (processed.has(mask)) {
                throw coverageError(`Selection mask ${mask} was verified more than once`)
            }
            processed.add(mask)
        }
        for (const graph of result.graphs) graphs.add(graph)
        maximumResolvedUnits = Math.max(
            maximumResolvedUnits,
            result.maximumResolvedUnits,
        )
        for (const key of ['entries', 'hits', 'misses']) {
            pairAnalysisCache[key] += result.pairAnalysisCache[key]
        }
        for (const key of ['bypasses', 'hits', 'misses', 'stores']) {
            compositionCache[key] += result.compositionCache[key]
        }
        for (const key of Object.keys(timingsMs)) {
            timingsMs[key] += result.timingsMs[key]
        }
        for (const key of ['hits', 'misses']) {
            packEtagCache[key] += result.packEtagCache[key]
            stateEncodingCache[key] += result.stateEncodingCache[key]
        }
    }
    if (processed.size !== totalSelections) {
        const missing = []
        for (let mask = 0; mask < totalSelections && missing.length < 10; mask += 1) {
            if (!processed.has(mask)) missing.push(mask)
        }
        throw coverageError(
            `Verified ${processed.size}/${totalSelections} selections; `
            + `missing mask(s): ${missing.join(', ')}`,
        )
    }
    return {
        verifiedSelections: processed.size,
        normalizedGraphs: graphs.size,
        maximumResolvedUnits,
        compositionCache,
        pairAnalysisCache,
        packEtagCache,
        stateEncodingCache,
        timingsMs: roundedTimings(timingsMs),
        workerHistories: workerHistories.toSorted(
            (left, right) => left.workerIndex - right.workerIndex,
        ),
    }
}

function serializeError(error) {
    return {
        message: error.message,
        code: error.code ?? null,
        mask: error.mask ?? null,
        phase: error.phase ?? null,
        selection: error.selection ?? null,
        workerHistory: error.workerHistory ?? null,
        stack: error.stack ?? null,
    }
}

function deserializeError(value) {
    const error = new Error(value.message)
    if (value.code) error.code = value.code
    if (value.mask !== null) error.mask = value.mask
    if (value.phase) error.phase = value.phase
    if (value.selection) error.selection = value.selection
    if (value.workerHistory) error.workerHistory = value.workerHistory
    if (value.stack) error.stack = value.stack
    return error
}

function spawnShard(data) {
    const worker = new Worker(__filename, {
        workerData: {
            mode: 'verify-combination-shard',
            ...data,
        },
    })
    const promise = new Promise((resolve, reject) => {
        let message = null
        worker.on('message', (value) => {
            message = value
        })
        worker.once('error', reject)
        worker.once('exit', (code) => {
            if (code !== 0) {
                reject(new Error(`Combination worker exited with code ${code}`))
            } else if (!message) {
                reject(new Error('Combination worker exited without a result'))
            } else if (!message.ok) {
                reject(deserializeError(message.error))
            } else {
                resolve(message.result)
            }
        })
    })
    return { worker, promise }
}

function copyVerificationRoot(source, destination, managedPaths, baseline) {
    fs.cpSync(source, destination, {
        recursive: true,
        force: false,
        errorOnExist: true,
        preserveTimestamps: true,
        verbatimSymlinks: true,
    })
    if (!sameSnapshot(snapshot(destination, managedPaths), baseline)) {
        throw new Error('Worker copy differs from the pristine managed byte/mode snapshot')
    }
}

async function main(argv = process.argv) {
    const options = parseArgs(argv)
    const {
        pkg,
        compatibility,
        visible,
        managedPaths,
    } = inspectTarget(options.root, options.allowReviewing)
    const totalSelections = 2 ** visible.length
    if (!Number.isSafeInteger(totalSelections)) {
        throw new Error('Visible pack count exceeds safe exhaustive selection indexing')
    }
    const workerCount = Math.min(options.jobs, totalSelections)
    const baseline = snapshot(options.root, managedPaths)
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pocketrisu-combinations-'))
    const workers = []

    try {
        for (let shardIndex = 0; shardIndex < workerCount; shardIndex += 1) {
            const root = path.join(temporaryRoot, `worker-${shardIndex}`)
            copyVerificationRoot(options.root, root, managedPaths, baseline)
            workers.push(spawnShard({
                root,
                allowReviewing: options.allowReviewing,
                shardIndex,
                shardCount: workerCount,
            }))
        }
        const shardResults = await Promise.all(workers.map(({ promise }) => promise))
        const coverage = mergeShardResults(totalSelections, shardResults)
        const result = {
            target: {
                packageName: pkg.name,
                packageVersion: pkg.version ?? null,
            },
            compatibility: compatibility.status,
            visiblePacks: visible,
            rawSelections: totalSelections,
            verifiedSelections: coverage.verifiedSelections,
            normalizedGraphs: coverage.normalizedGraphs,
            managedPaths: managedPaths.length,
            maximumResolvedUnits: coverage.maximumResolvedUnits,
            roundTrips: 'passed',
            workers: workerCount,
            workerHistory: {
                ...WORKER_HISTORY_MODEL,
                workers: coverage.workerHistories,
            },
            compositionCache: coverage.compositionCache,
            pairAnalysisCache: coverage.pairAnalysisCache,
            packEtagCache: coverage.packEtagCache,
            stateEncodingCache: coverage.stateEncodingCache,
            timingsMs: coverage.timingsMs,
        }
        if (options.json) console.log(JSON.stringify(result, null, 2))
        else console.log(
            `${result.rawSelections} selections / ${result.normalizedGraphs} graphs `
            + `passed with ${result.workers} worker(s)`,
        )
        return result
    } catch (error) {
        await Promise.all(workers.map(({ worker }) => worker.terminate()))
        throw error
    } finally {
        fs.rmSync(temporaryRoot, { recursive: true, force: true })
    }
}

function reportError(error) {
    console.error(`[combination-check] ${error.message}`)
    if (error.code) console.error(`[${error.code}]`)
    if (error.mask !== undefined) console.error(`[mask] ${error.mask}`)
    if (error.phase) console.error(`[phase] ${error.phase}`)
    if (error.selection) console.error(`[selection] ${error.selection.join(',') || '(none)'}`)
    if (error.workerHistory) {
        console.error(`[worker-history] ${JSON.stringify(error.workerHistory)}`)
    }
}

if (!isMainThread && workerData?.mode === 'verify-combination-shard') {
    try {
        parentPort.postMessage({
            ok: true,
            result: verifyShard(workerData),
        })
    } catch (error) {
        parentPort.postMessage({
            ok: false,
            error: serializeError(error),
        })
    }
} else if (require.main === module) {
    main().catch((error) => {
        reportError(error)
        process.exitCode = 1
    })
}

module.exports = {
    WORKER_HISTORY_MODEL,
    copyVerificationRoot,
    inspectTarget,
    main,
    mergeShardResults,
    parseArgs,
    sameSnapshot,
    shardMasks,
    snapshot,
    verifyShard,
    workerMaskSequence,
}
