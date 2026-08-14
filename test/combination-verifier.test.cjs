'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
    WORKER_HISTORY_MODEL,
    mergeShardResults,
    parseArgs,
    shardMasks,
    workerMaskSequence,
} = require('../scripts/verify-all-combinations.cjs')

function history(total, workerIndex, workerCount) {
    return {
        workerIndex,
        workerCount,
        orderedMasks: workerMaskSequence(total, workerIndex, workerCount),
        schedule: WORKER_HISTORY_MODEL.schedule,
    }
}

test('combination shards cover every mask exactly once', () => {
    for (let total = 1; total <= 41; total += 1) {
        for (let jobs = 1; jobs <= Math.min(total + 3, 10); jobs += 1) {
            const effectiveJobs = Math.min(total, jobs)
            const masks = Array.from(
                { length: effectiveJobs },
                (_, shardIndex) => [
                    ...shardMasks(total, shardIndex, effectiveJobs),
                ],
            ).flat()
            assert.equal(masks.length, total)
            assert.equal(new Set(masks).size, total)
            assert.deepEqual(
                masks.toSorted((left, right) => left - right),
                Array.from({ length: total }, (_, index) => index),
            )
            for (let workerIndex = 0; workerIndex < effectiveJobs; workerIndex += 1) {
                assert.deepEqual(
                    workerMaskSequence(total, workerIndex, effectiveJobs),
                    Array.from(
                        { length: Math.ceil((total - workerIndex) / effectiveJobs) },
                        (_, step) => workerIndex + (step * effectiveJobs),
                    ),
                )
            }
        }
    }
})

test('coverage merge preserves graph and maximum-unit aggregation', () => {
    assert.deepEqual(
        mergeShardResults(4, [
            {
                workerHistory: history(4, 0, 2),
                processedMasks: [0, 2],
                graphs: ['a', 'a,b'],
                maximumResolvedUnits: 7,
                compositionCache: { bypasses: 2, hits: 5, misses: 3, stores: 3 },
                pairAnalysisCache: { entries: 3, hits: 5, misses: 3 },
                packEtagCache: { hits: 8, misses: 2 },
                stateEncodingCache: { hits: 4, misses: 2 },
                timingsMs: {
                    apply: 1,
                    initialPlan: 2,
                    repeatedPlan: 3,
                    revertApply: 4,
                    revertPlan: 5,
                    snapshot: 6,
                    status: 7,
                    total: 28,
                },
            },
            {
                workerHistory: history(4, 1, 2),
                processedMasks: [1, 3],
                graphs: ['a', 'b'],
                maximumResolvedUnits: 11,
                compositionCache: { bypasses: 2, hits: 7, misses: 4, stores: 4 },
                pairAnalysisCache: { entries: 4, hits: 7, misses: 4 },
                packEtagCache: { hits: 9, misses: 3 },
                stateEncodingCache: { hits: 5, misses: 3 },
                timingsMs: {
                    apply: 10,
                    initialPlan: 20,
                    repeatedPlan: 30,
                    revertApply: 40,
                    revertPlan: 50,
                    snapshot: 60,
                    status: 70,
                    total: 280,
                },
            },
        ]),
        {
            verifiedSelections: 4,
            normalizedGraphs: 3,
            maximumResolvedUnits: 11,
            compositionCache: { bypasses: 4, hits: 12, misses: 7, stores: 7 },
            pairAnalysisCache: { entries: 7, hits: 12, misses: 7 },
            packEtagCache: { hits: 17, misses: 5 },
            stateEncodingCache: { hits: 9, misses: 5 },
            timingsMs: {
                apply: 11,
                initialPlan: 22,
                repeatedPlan: 33,
                revertApply: 44,
                revertPlan: 55,
                snapshot: 66,
                status: 77,
                total: 308,
            },
            workerHistories: [
                { workerIndex: 0, orderedMasks: [0, 2] },
                { workerIndex: 1, orderedMasks: [1, 3] },
            ],
        },
    )
})

test('coverage merge fails closed on missing, duplicate, or invalid masks', () => {
    const graph = {
        graphs: [],
        maximumResolvedUnits: 0,
        compositionCache: { bypasses: 0, hits: 0, misses: 0, stores: 0 },
        pairAnalysisCache: { entries: 0, hits: 0, misses: 0 },
        packEtagCache: { hits: 0, misses: 0 },
        stateEncodingCache: { hits: 0, misses: 0 },
        timingsMs: {
            apply: 0,
            initialPlan: 0,
            repeatedPlan: 0,
            revertApply: 0,
            revertPlan: 0,
            snapshot: 0,
            status: 0,
            total: 0,
        },
    }
    for (const results of [
        [{ ...graph, workerHistory: history(4, 0, 1), processedMasks: [0, 1, 2] }],
        [
            { ...graph, workerHistory: history(4, 0, 2), processedMasks: [0, 1] },
            { ...graph, workerHistory: history(4, 1, 2), processedMasks: [1, 2, 3] },
        ],
        [{ ...graph, workerHistory: history(4, 0, 1), processedMasks: [0, 1, 2, 4] }],
    ]) {
        assert.throws(
            () => mergeShardResults(4, results),
            (error) => error.code === 'INCOMPLETE_COMBINATION_COVERAGE',
        )
    }
})

test('coverage merge fails closed on altered worker history', () => {
    const graph = {
        processedMasks: [0, 2],
        graphs: [],
        maximumResolvedUnits: 0,
        compositionCache: { bypasses: 0, hits: 0, misses: 0, stores: 0 },
        pairAnalysisCache: { entries: 0, hits: 0, misses: 0 },
        packEtagCache: { hits: 0, misses: 0 },
        stateEncodingCache: { hits: 0, misses: 0 },
        timingsMs: {
            apply: 0,
            initialPlan: 0,
            repeatedPlan: 0,
            revertApply: 0,
            revertPlan: 0,
            snapshot: 0,
            status: 0,
            total: 0,
        },
    }
    assert.throws(
        () => mergeShardResults(4, [
            {
                ...graph,
                workerHistory: {
                    ...history(4, 0, 2),
                    orderedMasks: [2, 0],
                },
            },
            {
                ...graph,
                processedMasks: [1, 3],
                workerHistory: history(4, 1, 2),
            },
        ]),
        (error) => error.code === 'INCOMPLETE_COMBINATION_COVERAGE',
    )
})

test('jobs accepts only positive integers', () => {
    const parsed = parseArgs([
        'node',
        'verify-all-combinations.cjs',
        '--root',
        '/tmp/source',
        '--jobs',
        '3',
    ])
    assert.equal(parsed.jobs, 3)
    for (const value of ['0', '-1', '1.5', 'two', '9007199254740992']) {
        assert.throws(
            () => parseArgs([
                'node',
                'verify-all-combinations.cjs',
                '--root',
                '/tmp/source',
                '--jobs',
                value,
            ]),
            /positive(?: safe)? integer/,
        )
    }
})
