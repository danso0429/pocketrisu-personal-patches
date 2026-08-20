'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { canonicalJsonBytes } = require('../src/qualification-object-store.cjs')
const {
    buildQualificationRunIdentity,
    createInitialExecutionState,
    persistQualificationExecutionState,
    preservePrimaryError,
    transitionExecutionState,
} = require('../src/toolchain-shadow-qualification-execution-state.cjs')
const { writeJsonAtomic } = require('../src/verification-evidence.cjs')

const HASH = (value) => value.repeat(64)
const COMMIT = (value) => value.repeat(40)

function runIdentity(seed = '1') {
    return buildQualificationRunIdentity({
        subject: {
            implementationCommit: COMMIT('1'),
            qualificationToolCommit: COMMIT(seed),
            policySha256: HASH('2'),
            contractSha256: HASH('3'),
            compiledDeclarationSha256: HASH('4'),
            targetCommit: COMMIT('5'),
            targetApplicationTreeSha256: HASH('6'),
        },
        sourceIdentity: { schema: 'test-source', value: seed },
        materialDeclaration: { schema: 'test-declaration', value: 'same-material' },
        createdAt: '2026-08-20T00:00:00.000Z',
        nonce: seed === '1'
            ? '11111111-1111-4111-8111-111111111111'
            : '22222222-2222-4222-8222-222222222222',
    })
}

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qualification-execution-state-'))
    t.after(() => fs.rmSync(root, { recursive: true, force: true }))
    const identity = runIdentity()
    const identityFile = path.join(root, 'qualification-run.json')
    const stateFile = path.join(root, 'execution-state.json')
    writeJsonAtomic(identityFile, identity)
    const initial = createInitialExecutionState({ runIdentity: identity })
    persistQualificationExecutionState(stateFile, { next: initial, runIdentity: identity })
    return { root, identity, identityFile, stateFile, initial }
}

function next(current, phase, identity, overrides = {}) {
    return transitionExecutionState(current, {
        phase,
        runIdentity: identity,
        ...overrides,
    })
}

function replace(stateFile, identity, previous, current) {
    persistQualificationExecutionState(stateFile, {
        previous,
        next: current,
        runIdentity: identity,
    })
    return current
}

function advanceThroughSuccess(stateFile, identity, initial) {
    let state = initial
    let candidate = next(state, 'provisioning-retained', identity, {
        provisioningReceiptSha256: HASH('7'),
    })
    state = replace(stateFile, identity, state, candidate)
    candidate = next(state, 'local-launch-recorded-before-execution', identity, {
        local: { launches: 1, casesCompleted: null, receiptRetained: false },
    })
    state = replace(stateFile, identity, state, candidate)
    candidate = next(state, 'local-receipt-retained', identity, {
        local: { launches: 1, casesCompleted: 8, receiptRetained: true },
    })
    state = replace(stateFile, identity, state, candidate)
    candidate = next(state, 'global-launch-recorded-before-execution', identity, {
        global: { launches: 1, masksCompleted: null, receiptRetained: false },
    })
    state = replace(stateFile, identity, state, candidate)
    candidate = next(state, 'global-receipt-retained', identity, {
        global: { launches: 1, masksCompleted: 4096, receiptRetained: true },
    })
    state = replace(stateFile, identity, state, candidate)
    for (const phase of [
        'comparison-passed',
        'verification-and-registration-started',
        'registration-complete',
        'operating-preflight-complete',
        'completed',
    ]) {
        candidate = next(state, phase, identity)
        state = replace(stateFile, identity, state, candidate)
    }
    return state
}

test('initial state and every valid forward transition persist without EEXIST', (t) => {
    const current = fixture(t)
    assert.equal(fs.statSync(current.stateFile).mode & 0o777, 0o600)
    assert.throws(() => persistQualificationExecutionState(current.stateFile, {
        next: current.initial,
        runIdentity: current.identity,
    }), (error) => error.code === 'QUALIFICATION_EXECUTION_STATE_EXISTS')
    const completed = advanceThroughSuccess(current.stateFile, current.identity, current.initial)
    assert.equal(completed.phase, 'completed')
    assert.equal(completed.sequence, 10)
    assert.deepEqual(JSON.parse(fs.readFileSync(current.stateFile, 'utf8')), completed)
})

test('the stopped-attempt initialization to provisioned to pre-local regression now replaces atomically', (t) => {
    const current = fixture(t)
    const provisioned = next(current.initial, 'provisioning-retained', current.identity, {
        provisioningReceiptSha256: HASH('7'),
    })
    replace(current.stateFile, current.identity, current.initial, provisioned)
    const preLocal = next(provisioned, 'local-launch-recorded-before-execution', current.identity, {
        local: { launches: 1, casesCompleted: null, receiptRetained: false },
    })
    assert.doesNotThrow(() => replace(current.stateFile, current.identity, provisioned, preLocal))
    assert.equal(JSON.parse(fs.readFileSync(current.stateFile, 'utf8')).local.launches, 1)
})

test('durable replacement fsyncs the file before rename and the directory after rename', (t) => {
    const current = fixture(t)
    const provisioned = next(current.initial, 'provisioning-retained', current.identity, {
        provisioningReceiptSha256: HASH('7'),
    })
    const events = []
    const descriptors = new Map()
    const io = Object.create(fs)
    io.openSync = (file, ...args) => {
        const descriptor = fs.openSync(file, ...args)
        descriptors.set(descriptor, path.resolve(file))
        events.push(`open:${path.basename(file)}`)
        return descriptor
    }
    io.closeSync = (descriptor) => {
        descriptors.delete(descriptor)
        return fs.closeSync(descriptor)
    }
    io.fsyncSync = (descriptor) => {
        events.push(`fsync:${path.basename(descriptors.get(descriptor))}`)
        return fs.fsyncSync(descriptor)
    }
    io.renameSync = (from, to) => {
        events.push(`rename:${path.basename(to)}`)
        return fs.renameSync(from, to)
    }
    persistQualificationExecutionState(current.stateFile, {
        previous: current.initial,
        next: provisioned,
        runIdentity: current.identity,
    }, { io })
    const fileFsync = events.findIndex((event) => event.startsWith('fsync:.execution-state.json.'))
    const rename = events.indexOf('rename:execution-state.json')
    const directoryFsync = events.lastIndexOf(`fsync:${path.basename(current.root)}`)
    assert.ok(fileFsync >= 0 && fileFsync < rename)
    assert.ok(rename >= 0 && rename < directoryFsync)
})

test('replacement failure preserves the old valid current state', (t) => {
    const current = fixture(t)
    const before = fs.readFileSync(current.stateFile)
    const provisioned = next(current.initial, 'provisioning-retained', current.identity, {
        provisioningReceiptSha256: HASH('7'),
    })
    const io = Object.create(fs)
    io.renameSync = () => {
        const error = new Error('simulated replacement failure')
        error.code = 'EIO'
        throw error
    }
    assert.throws(() => persistQualificationExecutionState(current.stateFile, {
        previous: current.initial,
        next: provisioned,
        runIdentity: current.identity,
    }, { io }), (error) => error.code === 'EIO')
    assert.equal(fs.readFileSync(current.stateFile).equals(before), true)
    assert.deepEqual(JSON.parse(before), current.initial)
    assert.deepEqual(fs.readdirSync(current.root).filter((name) => name.endsWith('.tmp')), [])
})

test('backward, duplicate, stale, cross-run, and terminal transitions fail closed', (t) => {
    const current = fixture(t)
    assert.throws(() => next(
        current.initial, 'local-launch-recorded-before-execution', current.identity,
    ), (error) => error.code === 'QUALIFICATION_EXECUTION_STATE_TRANSITION')
    const provisioned = next(current.initial, 'provisioning-retained', current.identity, {
        provisioningReceiptSha256: HASH('7'),
    })
    replace(current.stateFile, current.identity, current.initial, provisioned)
    assert.throws(() => next(
        provisioned, 'provisioning-retained', current.identity,
    ), (error) => error.code === 'QUALIFICATION_EXECUTION_STATE_DUPLICATE')
    assert.throws(() => next(
        provisioned, 'local-launch-recorded-before-execution', current.identity,
        { local: { launches: 0, casesCompleted: null, receiptRetained: false } },
    ), (error) => error.code === 'INVALID_QUALIFICATION_EXECUTION_STATE')
    assert.throws(() => persistQualificationExecutionState(current.stateFile, {
        previous: current.initial,
        next: provisioned,
        runIdentity: current.identity,
    }), (error) => error.code === 'QUALIFICATION_EXECUTION_STATE_STALE')
    assert.throws(() => persistQualificationExecutionState(current.stateFile, {
        previous: provisioned,
        next: { ...next(provisioned, 'local-launch-recorded-before-execution', current.identity, {
            local: { launches: 1, casesCompleted: null, receiptRetained: false },
        }), qualificationRunId: HASH('9') },
        runIdentity: runIdentity('2'),
    }), /qualification run/i)

    const terminalFixture = fixture(t)
    const completed = advanceThroughSuccess(
        terminalFixture.stateFile, terminalFixture.identity, terminalFixture.initial,
    )
    assert.throws(() => next(
        completed, 'failed', terminalFixture.identity,
        { failure: { code: 'LATE_FAILURE', message: 'too late' } },
    ), (error) => error.code === 'QUALIFICATION_EXECUTION_STATE_TERMINAL')
})

test('failure transition retains every known execution fact without rollback', (t) => {
    const current = fixture(t)
    const provisioned = next(current.initial, 'provisioning-retained', current.identity, {
        provisioningReceiptSha256: HASH('7'),
    })
    const preLocal = next(provisioned, 'local-launch-recorded-before-execution', current.identity, {
        local: { launches: 1, casesCompleted: null, receiptRetained: false },
    })
    assert.throws(() => next(preLocal, 'failed', current.identity, {
        local: { launches: 0, casesCompleted: null, receiptRetained: false },
        failure: { code: 'LOCAL_FAILED', message: 'local failed' },
    }), (error) => error.code === 'QUALIFICATION_EXECUTION_STATE_FACT_REGRESSION')
    const failed = next(preLocal, 'failed', current.identity, {
        failure: { code: 'LOCAL_FAILED', message: 'local failed' },
    })
    assert.deepEqual(failed.local, preLocal.local)
    assert.deepEqual(failed.global, preLocal.global)
    assert.equal(failed.failure.phase, 'local-launch-recorded-before-execution')
})

test('primary qualification failure survives a secondary state-persistence failure', () => {
    const primary = Object.assign(new Error('comparison failed'), { code: 'COMPARISON_FAILED' })
    const secondary = Object.assign(new Error('state fsync failed'), { code: 'EIO' })
    assert.equal(preservePrimaryError(primary, secondary), primary)
    assert.equal(primary.code, 'COMPARISON_FAILED')
    assert.deepEqual(primary.details.executionStatePersistenceFailure, {
        code: 'EIO', message: 'state fsync failed', details: null,
    })
})

test('mutable state API cannot replace immutable evidence and writeJsonAtomic stays create-once', (t) => {
    const current = fixture(t)
    const immutable = path.join(current.root, 'local-receipt.json')
    writeJsonAtomic(immutable, { value: 'first' })
    assert.throws(
        () => writeJsonAtomic(immutable, { value: 'second' }),
        (error) => error.code === 'EEXIST',
    )
    assert.throws(() => persistQualificationExecutionState(immutable, {
        previous: current.initial,
        next: next(current.initial, 'provisioning-retained', current.identity, {
            provisioningReceiptSha256: HASH('7'),
        }),
        runIdentity: current.identity,
    }), (error) => error.code === 'INVALID_QUALIFICATION_EXECUTION_STATE_PATH')
    assert.deepEqual(JSON.parse(fs.readFileSync(immutable, 'utf8')), { value: 'first' })
    assert.equal(canonicalJsonBytes(current.identity).length > 0, true)
})
