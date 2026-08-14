'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const {
    compareCompleteValue,
    parseArgs,
    typedString,
} = require('../scripts/verify-cache-differential.cjs')
const {
    CACHE_DIFFERENTIAL_SCOPE,
    validateCacheDifferentialResult,
} = require('../src/verification-evidence.cjs')

test('typed cache comparison preserves literal state bytes and map order', () => {
    assert.notEqual(
        typedString({ state: '{"a":1,"b":2}' }),
        typedString({ state: '{"b":2,"a":1}' }),
    )
    assert.notEqual(
        typedString(new Map([['a', 1], ['b', 2]])),
        typedString(new Map([['b', 2], ['a', 1]])),
    )
    const totals = { comparisons: 0, referenceBytes: 0, candidateBytes: 0 }
    compareCompleteValue({
        candidate: { value: ['same'] },
        mask: 0,
        phase: 'initial-plan',
        reference: { value: ['same'] },
        totals,
    })
    assert.equal(totals.comparisons, 1)
    assert.equal(totals.candidateBytes, totals.referenceBytes)
})

test('cache comparison reports the exact mask and phase on mismatch', () => {
    assert.throws(
        () => compareCompleteValue({
            candidate: { state: 'cached' },
            mask: 3055,
            phase: 'initial-plan',
            reference: { state: 'uncached' },
            totals: { comparisons: 0, referenceBytes: 0, candidateBytes: 0 },
        }),
        (error) => error.code === 'CACHE_DIFFERENTIAL_MISMATCH'
            && error.mask === 3055
            && error.phase === 'initial-plan',
    )
})

test('cache differential result requires canonical stride and all three phases', () => {
    const result = {
        schema: 'patch-verification-cache-differential-v2',
        visiblePacks: ['a', 'b'],
        rawSelections: 4,
        verifiedSelections: 4,
        workers: 2,
        workerHistory: {
            schema: 'patch-combination-worker-history-v1',
            schedule: 'stride-v1',
            workers: [
                { workerIndex: 0, orderedMasks: [0, 2] },
                { workerIndex: 1, orderedMasks: [1, 3] },
            ],
        },
        phases: ['initial-plan', 'repeated-plan', 'revert-plan'],
        scope: CACHE_DIFFERENTIAL_SCOPE,
        comparisons: {
            standardCaches: {
                comparisons: 12,
                mismatches: 0,
                referenceBytes: 100,
                candidateBytes: 100,
            },
        },
        roundTrips: 'differential-passed',
        result: 'passed',
    }
    assert.deepEqual(validateCacheDifferentialResult(result), [])
    assert.notDeepEqual(
        validateCacheDifferentialResult({ ...result, phases: ['initial-plan'] }),
        [],
    )
    assert.notDeepEqual(
        validateCacheDifferentialResult({
            ...result,
            scope: { ...CACHE_DIFFERENTIAL_SCOPE, freshIsolated: true },
        }),
        [],
    )
    const { scope, ...historical } = result
    historical.schema = 'patch-verification-cache-differential-v1'
    assert.deepEqual(validateCacheDifferentialResult(historical), [])
})

test('cache differential accepts only root, jobs, review, and json options', () => {
    assert.equal(parseArgs([
        'node',
        'verify-cache-differential.cjs',
        '--root',
        '/tmp/target',
        '--jobs',
        '3',
    ]).jobs, 3)
    assert.throws(
        () => parseArgs([
            'node',
            'verify-cache-differential.cjs',
            '--root',
            '/tmp/target',
            '--schedule',
            'balanced-units',
        ]),
        /Unknown argument/,
    )
})
