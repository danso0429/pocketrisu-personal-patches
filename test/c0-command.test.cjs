'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const { executeC0, parseArgs } = require('../scripts/verify-c0.cjs')

function canonicalResult() {
    return {
        visiblePacks: [],
        rawSelections: 1,
        verifiedSelections: 1,
        roundTrips: 'passed',
        workers: 1,
        workerHistory: {
            schema: 'patch-combination-worker-history-v1',
            schedule: 'stride-v1',
            workers: [{ workerIndex: 0, orderedMasks: [0] }],
        },
    }
}

function execution(overrides = {}) {
    return {
        spawnError: null,
        outputError: null,
        exitCode: 0,
        signal: null,
        stdout: JSON.stringify(canonicalResult()),
        stderr: '',
        ...overrides,
    }
}

test('C0 command parses only explicit lane and global options', () => {
    const parsed = parseArgs([
        'node', 'verify-c0.cjs', '--decision-only', '--lane', 'Core',
        '--change-category', 'manager', '--stable-release', '--json',
    ])
    assert.equal(parsed.requestedLane, 'Core')
    assert.deepEqual(parsed.changeCategories, ['manager'])
    assert.equal(parsed.stableRelease, true)
    assert.throws(() => parseArgs(['node', 'verify-c0.cjs', '--unknown']))
    assert.throws(() => parseArgs(['node', 'verify-c0.cjs']))
})

test('decision-only mode cannot launch a verifier', async () => {
    let launched = false
    const result = await executeC0({
        decisionOnly: true,
        requestedLane: 'Local',
        correctness: 'passed',
        budget: 'passed',
        changeCategories: [],
    }, { runner: async () => { launched = true } })
    assert.equal(launched, false)
    assert.equal(result.accepted, true)
    assert.equal(result.decision.gate, 'Global Exhaustive')
})

test('unsupported admission fails before launching a verifier', async () => {
    let launched = false
    const result = await executeC0({
        unsupported: true,
        decisionOnly: false,
        changeCategories: [],
    }, { runner: async () => { launched = true } })
    assert.equal(launched, false)
    assert.equal(result.accepted, false)
    assert.equal(result.decision.outcome, 'admission-rejected')
})

test('C0 execution accepts only a complete canonical Global result', async () => {
    const result = await executeC0({
        root: '/tmp/pristine',
        jobs: null,
        allowReviewing: false,
        decisionOnly: false,
        changeCategories: [],
    }, { runner: async () => execution() })
    assert.equal(result.accepted, true)
    assert.equal(result.decision.gate, 'Global Exhaustive')
    assert.equal(result.execution.verifierErrors.length, 0)
})

test('status zero with empty output or a spawn error cannot false-pass C0', async () => {
    const empty = await executeC0({
        root: '/tmp/pristine', decisionOnly: false, changeCategories: [],
    }, { runner: async () => execution({ stdout: '' }) })
    assert.equal(empty.accepted, false)
    assert(empty.execution.verifierErrors.includes('stdout is not one non-empty JSON object'))

    const spawn = await executeC0({
        root: '/tmp/pristine', decisionOnly: false, changeCategories: [],
    }, { runner: async () => execution({
        stdout: '',
        spawnError: { code: 'EPERM', message: 'operation not permitted' },
    }) })
    assert.equal(spawn.accepted, false)
    assert.equal(spawn.execution.spawnError.code, 'EPERM')
})
