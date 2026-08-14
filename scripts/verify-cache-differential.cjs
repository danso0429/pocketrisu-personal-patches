#!/usr/bin/env node
'use strict'

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
const {
    copyVerificationRoot,
    inspectTarget,
    sameSnapshot,
    snapshot,
    workerMaskSequence,
} = require('./verify-all-combinations.cjs')
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

function parseArgs(argv) {
    const options = {
        root: null,
        jobs: 2,
        allowReviewing: false,
        json: false,
    }
    for (let index = 2; index < argv.length; index += 1) {
        const argument = argv[index]
        if (argument === '--root') options.root = path.resolve(argv[++index])
        else if (argument === '--jobs') {
            options.jobs = Number(argv[++index])
            if (!Number.isSafeInteger(options.jobs) || options.jobs < 1) {
                throw new Error('--jobs requires a positive safe integer')
            }
        }
        else if (argument === '--allow-reviewing') options.allowReviewing = true
        else if (argument === '--json') options.json = true
        else throw new Error(`Unknown argument: ${argument}`)
    }
    if (!options.root) {
        throw new Error(
            'Usage: verify-cache-differential.cjs --root TARGET '
            + '[--jobs N] [--allow-reviewing] [--json]',
        )
    }
    return options
}

function typedValue(value, stack = new Set()) {
    if (value === undefined) return ['undefined']
    if (value === null) return ['null']
    if (typeof value === 'string') return ['string', value]
    if (typeof value === 'boolean') return ['boolean', value]
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new TypeError('Differential rejects non-finite numbers')
        return ['number', Object.is(value, -0) ? '-0' : String(value)]
    }
    if (typeof value !== 'object') {
        throw new TypeError(`Differential rejects ${typeof value}`)
    }
    if (stack.has(value)) throw new TypeError('Differential rejects cycles')
    stack.add(value)
    try {
        if (Buffer.isBuffer(value)) return ['buffer', value.toString('base64')]
        if (Array.isArray(value)) {
            if (Object.getPrototypeOf(value) !== Array.prototype) {
                throw new TypeError('Differential arrays require Array.prototype')
            }
            const descriptors = Object.getOwnPropertyDescriptors(value)
            for (const key of Reflect.ownKeys(value)) {
                if (key === 'length') continue
                if (typeof key !== 'string') {
                    throw new TypeError('Differential arrays reject symbol keys')
                }
                const index = Number(key)
                const descriptor = descriptors[key]
                if (
                    !Number.isInteger(index)
                    || index < 0
                    || index >= value.length
                    || String(index) !== key
                    || !descriptor.enumerable
                    || !Object.hasOwn(descriptor, 'value')
                ) throw new TypeError('Differential arrays require plain numeric entries')
            }
            return ['array', Array.from({ length: value.length }, (_, index) =>
                Object.hasOwn(descriptors, index)
                    ? typedValue(descriptors[index].value, stack)
                    : ['hole'],
            )]
        }
        if (value instanceof Map) {
            return ['map', [...value].map(([key, entry]) => [
                typedValue(key, stack),
                typedValue(entry, stack),
            ])]
        }
        const prototype = Object.getPrototypeOf(value)
        if (prototype !== Object.prototype && prototype !== null) {
            throw new TypeError('Differential requires plain objects, arrays, buffers, or maps')
        }
        const keys = Reflect.ownKeys(value)
        if (keys.some((key) => typeof key !== 'string')) {
            throw new TypeError('Differential objects reject symbol keys')
        }
        return ['object', keys.sort().map((key) => {
            const descriptor = Object.getOwnPropertyDescriptor(value, key)
            if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
                throw new TypeError('Differential objects reject accessors and hidden properties')
            }
            return [key, typedValue(descriptor.value, stack)]
        })]
    } finally {
        stack.delete(value)
    }
}

function typedString(value) {
    return JSON.stringify(typedValue(value))
}

function compareCompleteValue({ candidate, mask, phase, reference, totals }) {
    const referenceJson = typedString(reference)
    const candidateJson = typedString(candidate)
    totals.comparisons += 1
    totals.referenceBytes += Buffer.byteLength(referenceJson)
    totals.candidateBytes += Buffer.byteLength(candidateJson)
    if (candidateJson !== referenceJson) {
        const error = new Error(`Cached ${phase} value differs for mask ${mask}`)
        error.code = 'CACHE_DIFFERENTIAL_MISMATCH'
        error.mask = mask
        error.phase = phase
        throw error
    }
}

function selectedForMask(visible, mask) {
    return visible.filter((_, bit) => Math.floor(mask / (2 ** bit)) % 2 === 1)
}

function createCaches() {
    return {
        compositionOptions: {
            compositionCache: createCompositionCache(),
            pairAnalysisCache: createPairAnalysisCache(),
        },
        packEtagCache: createPackEtagCache(),
        stateEncodingCache: createStateEncodingCache(),
    }
}

function plan({ root, catalog, packIds, caches = {} }) {
    return planTransition({
        root,
        catalog,
        packIds,
        profile: 'combination-test',
        ...caches,
    })
}

function cacheCounters(caches) {
    const composition = caches.compositionOptions.compositionCache
    const pair = caches.compositionOptions.pairAnalysisCache
    return {
        composition: {
            bypasses: composition.bypasses,
            hits: composition.hits,
            misses: composition.misses,
            stores: composition.stores,
        },
        pairAnalysis: {
            entries: pair.entries,
            hits: pair.hits,
            misses: pair.misses,
        },
        packEtag: {
            hits: caches.packEtagCache.hits,
            misses: caches.packEtagCache.misses,
        },
        stateEncoding: {
            hits: caches.stateEncodingCache.hits,
            misses: caches.stateEncodingCache.misses,
        },
    }
}

function auditShard({ allowReviewing, maskList, roots, workerIndex, workerCount }) {
    const inspected = inspectTarget(roots.uncached, allowReviewing)
    const baselines = {
        uncached: snapshot(roots.uncached, inspected.managedPaths),
        cached: snapshot(roots.cached, inspected.managedPaths),
    }
    if (!sameSnapshot(baselines.cached, baselines.uncached)) {
        throw new Error('Cached and uncached worker baselines differ')
    }
    const caches = createCaches()
    const totals = { comparisons: 0, referenceBytes: 0, candidateBytes: 0 }
    const completedMasks = []
    const started = performance.now()
    let maximumResolvedUnits = 0
    for (const mask of maskList) {
        const selected = selectedForMask(inspected.visible, mask)
        let phase = 'initial-plan'
        try {
            const initial = {
                uncached: plan({
                    root: roots.uncached,
                    catalog: inspected.catalog,
                    packIds: selected,
                }),
                cached: plan({
                    root: roots.cached,
                    catalog: inspected.catalog,
                    packIds: selected,
                    caches,
                }),
            }
            compareCompleteValue({
                candidate: initial.cached,
                mask,
                phase: 'initial-plan',
                reference: initial.uncached,
                totals,
            })
            maximumResolvedUnits = Math.max(
                maximumResolvedUnits,
                initial.uncached.order.length,
            )

            phase = 'apply'
            applyTransition({ root: roots.uncached, transition: initial.uncached })
            applyTransition({ root: roots.cached, transition: initial.cached })

            phase = 'status'
            compareCompleteValue({
                candidate: status({ root: roots.cached }),
                mask,
                phase: 'status',
                reference: status({ root: roots.uncached }),
                totals: { comparisons: 0, referenceBytes: 0, candidateBytes: 0 },
            })
            if (!sameSnapshot(
                snapshot(roots.cached, inspected.managedPaths),
                snapshot(roots.uncached, inspected.managedPaths),
            )) throw new Error(`Cached post-apply snapshot differs for mask ${mask}`)

            phase = 'repeated-plan'
            const repeated = {
                uncached: plan({
                    root: roots.uncached,
                    catalog: inspected.catalog,
                    packIds: selected,
                }),
                cached: plan({
                    root: roots.cached,
                    catalog: inspected.catalog,
                    packIds: selected,
                    caches,
                }),
            }
            compareCompleteValue({
                candidate: repeated.cached,
                mask,
                phase: 'repeated-plan',
                reference: repeated.uncached,
                totals,
            })
            if (repeated.uncached.changes.length !== 0 || repeated.cached.changes.length !== 0) {
                throw new Error(`Repeated plan changed for mask ${mask}`)
            }

            phase = 'revert-plan'
            const reverted = {
                uncached: plan({
                    root: roots.uncached,
                    catalog: inspected.catalog,
                    packIds: [],
                }),
                cached: plan({
                    root: roots.cached,
                    catalog: inspected.catalog,
                    packIds: [],
                    caches,
                }),
            }
            compareCompleteValue({
                candidate: reverted.cached,
                mask,
                phase: 'revert-plan',
                reference: reverted.uncached,
                totals,
            })

            phase = 'revert-apply'
            applyTransition({ root: roots.uncached, transition: reverted.uncached })
            applyTransition({ root: roots.cached, transition: reverted.cached })
            for (const mode of ['uncached', 'cached']) {
                if (!sameSnapshot(snapshot(roots[mode], inspected.managedPaths), baselines[mode])) {
                    throw new Error(`${mode} baseline restoration failed for mask ${mask}`)
                }
                if (fs.existsSync(path.join(roots[mode], DEFAULT_STATE_PATH))) {
                    throw new Error(`${mode} retained state after mask ${mask}`)
                }
            }
            completedMasks.push(mask)
        } catch (error) {
            error.mask = mask
            error.phase ??= phase
            error.selection = selected
            error.workerHistory = {
                workerIndex,
                workerCount,
                orderedMasks: maskList,
                completedMasks,
                schedule: 'stride-v1',
            }
            throw error
        }
    }
    return {
        workerIndex,
        orderedMasks: maskList,
        comparisons: totals,
        maximumResolvedUnits,
        caches: cacheCounters(caches),
        elapsedMs: Math.round((performance.now() - started) * 100) / 100,
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

function spawnShard(data) {
    const worker = new Worker(__filename, {
        workerData: { mode: 'cache-differential-shard', ...data },
    })
    const promise = new Promise((resolve, reject) => {
        let message = null
        worker.on('message', (value) => { message = value })
        worker.once('error', reject)
        worker.once('exit', (code) => {
            if (code !== 0) reject(new Error(`Cache differential worker exited ${code}`))
            else if (!message) reject(new Error('Cache differential worker returned no result'))
            else if (!message.ok) {
                const error = new Error(message.error.message)
                Object.assign(error, message.error)
                reject(error)
            } else resolve(message.result)
        })
    })
    return { worker, promise }
}

async function main(argv = process.argv) {
    const options = parseArgs(argv)
    const inspected = inspectTarget(options.root, options.allowReviewing)
    const totalSelections = 2 ** inspected.visible.length
    if (!Number.isSafeInteger(totalSelections)) {
        throw new Error('Visible pack count exceeds safe exhaustive selection indexing')
    }
    const workerCount = Math.min(options.jobs, totalSelections)
    const pristine = snapshot(options.root, inspected.managedPaths)
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pocketrisu-cache-diff-'))
    const workers = []
    let primaryError = null
    let result = null
    const started = performance.now()
    try {
        for (let workerIndex = 0; workerIndex < workerCount; workerIndex += 1) {
            const roots = {}
            for (const mode of ['uncached', 'cached']) {
                const root = path.join(temporaryRoot, `worker-${workerIndex}-${mode}`)
                copyVerificationRoot(options.root, root, inspected.managedPaths, pristine)
                roots[mode] = root
            }
            workers.push(spawnShard({
                allowReviewing: options.allowReviewing,
                maskList: workerMaskSequence(totalSelections, workerIndex, workerCount),
                roots,
                workerIndex,
                workerCount,
            }))
        }
        const shards = await Promise.all(workers.map(({ promise }) => promise))
        const observed = shards.flatMap((shard) => shard.orderedMasks)
        const expected = Array.from({ length: totalSelections }, (_, index) => index)
        if (JSON.stringify(observed.toSorted((a, b) => a - b)) !== JSON.stringify(expected)) {
            throw new Error('Cache differential mask coverage is incomplete or duplicated')
        }
        const comparisons = shards.reduce((sum, shard) =>
            sum + shard.comparisons.comparisons, 0)
        if (comparisons !== totalSelections * 3) {
            throw new Error(`Cache differential comparison coverage ${comparisons}/${totalSelections * 3}`)
        }
        result = {
            schema: 'patch-verification-cache-differential-v1',
            target: {
                packageName: inspected.pkg.name,
                packageVersion: inspected.pkg.version ?? null,
            },
            compatibility: inspected.compatibility.status,
            visiblePacks: inspected.visible,
            rawSelections: totalSelections,
            verifiedSelections: totalSelections,
            managedPaths: inspected.managedPaths.length,
            maximumResolvedUnits: Math.max(
                0,
                ...shards.map((shard) => shard.maximumResolvedUnits),
            ),
            workers: workerCount,
            workerHistory: {
                schema: 'patch-combination-worker-history-v1',
                schedule: 'stride-v1',
                workers: shards.toSorted((a, b) => a.workerIndex - b.workerIndex).map(
                    (shard) => ({
                        workerIndex: shard.workerIndex,
                        orderedMasks: shard.orderedMasks,
                    }),
                ),
            },
            phases: ['initial-plan', 'repeated-plan', 'revert-plan'],
            comparisons: {
                standardCaches: {
                    comparisons,
                    mismatches: 0,
                    referenceBytes: shards.reduce(
                        (sum, shard) => sum + shard.comparisons.referenceBytes,
                        0,
                    ),
                    candidateBytes: shards.reduce(
                        (sum, shard) => sum + shard.comparisons.candidateBytes,
                        0,
                    ),
                },
            },
            shards,
            roundTrips: 'differential-passed',
            result: 'passed',
            elapsedMs: Math.round((performance.now() - started) * 100) / 100,
        }
    } catch (error) {
        primaryError = error
        await Promise.allSettled(workers.map(({ worker }) => worker.terminate()))
    } finally {
        try {
            fs.rmSync(temporaryRoot, { recursive: true, force: true })
        } catch (cleanupError) {
            primaryError = primaryError === null
                ? cleanupError
                : new AggregateError([primaryError, cleanupError])
        }
    }
    if (primaryError !== null) throw primaryError
    if (options.json) console.log(JSON.stringify(result, null, 2))
    else console.log(
        `${result.rawSelections} masks / ${result.comparisons.standardCaches.comparisons} `
        + 'canonical-stride cache comparisons passed',
    )
    return result
}

function reportError(error) {
    console.error(`[cache-differential] ${error.message}`)
    if (error.code) console.error(`[${error.code}]`)
    if (error.mask !== undefined) console.error(`[mask] ${error.mask}`)
    if (error.phase) console.error(`[phase] ${error.phase}`)
    if (error.selection) console.error(`[selection] ${error.selection.join(',') || '(none)'}`)
    if (error.workerHistory) {
        console.error(`[worker-history] ${JSON.stringify(error.workerHistory)}`)
    }
}

if (!isMainThread && workerData?.mode === 'cache-differential-shard') {
    try {
        parentPort.postMessage({ ok: true, result: auditShard(workerData) })
    } catch (error) {
        parentPort.postMessage({ ok: false, error: serializeError(error) })
    }
} else if (require.main === module) {
    main().catch((error) => {
        reportError(error)
        process.exitCode = 1
    })
}

module.exports = {
    auditShard,
    compareCompleteValue,
    main,
    parseArgs,
    typedString,
}
