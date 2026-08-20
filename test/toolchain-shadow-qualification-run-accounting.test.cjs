'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const {
    LEGACY_EXECUTION_STATE_SCHEMA,
    accountingFromOutputDirectory,
    buildQualificationRunAccounting,
} = require('../src/toolchain-shadow-qualification-run-accounting.cjs')
const {
    buildQualificationRunIdentity,
    createInitialExecutionState,
    transitionExecutionState,
} = require('../src/toolchain-shadow-qualification-execution-state.cjs')

const ROOT = path.resolve(__dirname, '..')
const HASH = (value) => value.repeat(64)
const COMMIT = (value) => value.repeat(40)
const LOCAL_RECEIPT = { coverage: { processedExecutions: 8 } }
const GLOBAL_RECEIPT = { verifierResult: { verifiedSelections: 4096 } }

function legacyState({ localLaunches = 1, localCases = 8, globalLaunches = 1, globalMasks = 4096 } = {}) {
    return {
        schema: LEGACY_EXECUTION_STATE_SCHEMA,
        status: 'failed',
        phase: 'failed:comparison',
        local: {
            launches: localLaunches,
            casesCompleted: localCases,
            receiptRetained: localCases !== null,
        },
        global: {
            launches: globalLaunches,
            masksCompleted: globalMasks,
            receiptRetained: globalMasks !== null,
        },
        failure: { code: 'COMPARISON_FAILED', message: 'comparison failed before success stdout' },
    }
}

function runIdentity() {
    return buildQualificationRunIdentity({
        subject: {
            implementationCommit: COMMIT('1'),
            qualificationToolCommit: COMMIT('2'),
            policySha256: HASH('3'),
            contractSha256: HASH('4'),
            compiledDeclarationSha256: HASH('5'),
            targetCommit: COMMIT('6'),
            targetApplicationTreeSha256: HASH('7'),
        },
        sourceIdentity: { schema: 'test-source', value: 'accounting' },
        materialDeclaration: { schema: 'test-material', value: 'unchanged' },
        createdAt: '2026-08-20T00:00:00.000Z',
        nonce: '11111111-1111-4111-8111-111111111111',
    })
}

function advance(current, identity, phase, overrides = {}) {
    return transitionExecutionState(current, { phase, runIdentity: identity, ...overrides })
}

function v2Stage(stage) {
    const identity = runIdentity()
    let current = createInitialExecutionState({ runIdentity: identity })
    const reach = (phase, overrides = {}) => {
        current = advance(current, identity, phase, overrides)
    }
    reach('provisioning-retained', { provisioningReceiptSha256: HASH('8') })
    if (stage === 'before-local') return { identity, current }
    reach('local-launch-recorded-before-execution', {
        local: { launches: 1, casesCompleted: null, receiptRetained: false },
    })
    if (stage === 'after-local-launch') return { identity, current }
    reach('local-receipt-retained', {
        local: { launches: 1, casesCompleted: 8, receiptRetained: true },
    })
    if (stage === 'after-local-receipt') return { identity, current }
    reach('global-launch-recorded-before-execution', {
        global: { launches: 1, masksCompleted: null, receiptRetained: false },
    })
    if (stage === 'after-global-launch') return { identity, current }
    reach('global-receipt-retained', {
        global: { launches: 1, masksCompleted: 4096, receiptRetained: true },
    })
    if (stage === 'after-global-receipt') return { identity, current }
    reach('comparison-passed')
    if (stage === 'after-comparison') return { identity, current }
    reach('verification-and-registration-started')
    if (stage === 'during-verifier-registration') return { identity, current }
    reach('registration-complete')
    return { identity, current }
}

function failedAt(stage) {
    const fixture = v2Stage(stage)
    return {
        identity: fixture.identity,
        state: advance(fixture.current, fixture.identity, 'failed', {
            failure: { code: 'INJECTED_FAILURE', message: `failed ${stage}` },
        }),
    }
}

function accountingFor(stage) {
    const fixture = failedAt(stage)
    const localReceipt = fixture.state.local.receiptRetained ? LOCAL_RECEIPT : null
    const globalReceipt = fixture.state.global.receiptRetained ? GLOBAL_RECEIPT : null
    return buildQualificationRunAccounting({
        status: 'failed',
        runIdentity: fixture.identity,
        executionState: fixture.state,
        localReceipt,
        globalReceipt,
    })
}

test('historical v1 failed accounting remains readable and derives nonzero truth without success stdout', (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qualification-accounting-'))
    t.after(() => fs.rmSync(root, { recursive: true, force: true }))
    fs.writeFileSync(path.join(root, 'execution-state.json'), JSON.stringify(legacyState()))
    fs.writeFileSync(path.join(root, 'local-receipt.json'), JSON.stringify(LOCAL_RECEIPT))
    fs.writeFileSync(path.join(root, 'global-receipt.json'), JSON.stringify(GLOBAL_RECEIPT))
    const accounting = accountingFromOutputDirectory(root, { status: 'failed' })
    assert.deepEqual(accounting.localLaunches, {
        knowledge: 'known', value: 1, source: 'retained-local-receipt',
    })
    assert.deepEqual(accounting.localCasesCompleted, {
        knowledge: 'known', value: 8, source: 'retained-local-receipt',
    })
    assert.deepEqual(accounting.globalLaunches, {
        knowledge: 'known', value: 1, source: 'retained-global-receipt',
    })
    assert.deepEqual(accounting.globalMasksCompleted, {
        knowledge: 'known', value: 4096, source: 'retained-global-receipt',
    })
    assert.equal(accounting.successReportPresent, false)
})

test('missing report and missing retained evidence remain unknown rather than zero', () => {
    const accounting = buildQualificationRunAccounting({
        status: 'failed',
        successReport: { localLaunches: 0, globalLaunches: 0 },
    })
    assert.equal(accounting.localLaunches.knowledge, 'unknown')
    assert.equal(accounting.localLaunches.value, null)
    assert.equal(accounting.globalLaunches.knowledge, 'unknown')
    assert.equal(accounting.globalLaunches.value, null)
    assert.equal(accounting.successReportPresent, true)
    assert.equal(accounting.successReportUsedAsSoleCountSource, false)
})

test('durable historical pre-launch state can independently prove exact zero', () => {
    const executionState = legacyState({
        localLaunches: 0, localCases: null, globalLaunches: 0, globalMasks: null,
    })
    const accounting = buildQualificationRunAccounting({ status: 'failed', executionState })
    assert.deepEqual(accounting.localLaunches, {
        knowledge: 'known', value: 0, source: 'retained-execution-state',
    })
    assert.deepEqual(accounting.globalLaunches, {
        knowledge: 'known', value: 0, source: 'retained-execution-state',
    })
    assert.equal(accounting.localCasesCompleted.knowledge, 'unknown')
    assert.equal(accounting.globalMasksCompleted.knowledge, 'unknown')
})

test('v2 failure stages preserve known launches/completions and keep unknown completion honest', () => {
    const stages = [
        ['before-local', 0, null, 0, null],
        ['after-local-launch', 1, null, 0, null],
        ['after-local-receipt', 1, 8, 0, null],
        ['after-global-launch', 1, 8, 1, null],
        ['after-global-receipt', 1, 8, 1, 4096],
        ['after-comparison', 1, 8, 1, 4096],
        ['during-verifier-registration', 1, 8, 1, 4096],
        ['after-registration', 1, 8, 1, 4096],
    ]
    for (const [stage, localLaunches, localCases, globalLaunches, globalMasks] of stages) {
        const accounting = accountingFor(stage)
        assert.equal(accounting.localLaunches.value, localLaunches, stage)
        assert.equal(accounting.globalLaunches.value, globalLaunches, stage)
        assert.equal(accounting.localCasesCompleted.value, localCases, stage)
        assert.equal(accounting.localCasesCompleted.knowledge,
            localCases === null ? 'unknown' : 'known', stage)
        assert.equal(accounting.globalMasksCompleted.value, globalMasks, stage)
        assert.equal(accounting.globalMasksCompleted.knowledge,
            globalMasks === null ? 'unknown' : 'known', stage)
    }
})

test('retained receipt and execution-state contradictions fail closed', () => {
    const fixture = failedAt('after-local-receipt')
    assert.throws(() => buildQualificationRunAccounting({
        status: 'failed',
        runIdentity: fixture.identity,
        executionState: fixture.state,
        localReceipt: LOCAL_RECEIPT,
        globalReceipt: GLOBAL_RECEIPT,
    }), (error) => error.code === 'QUALIFICATION_ACCOUNTING_CONTRADICTION')
    assert.throws(() => buildQualificationRunAccounting({
        status: 'failed',
        runIdentity: fixture.identity,
        executionState: fixture.state,
    }), (error) => error.code === 'QUALIFICATION_ACCOUNTING_CONTRADICTION')
})

test('malformed retained execution evidence fails closed instead of becoming zero', () => {
    assert.throws(() => buildQualificationRunAccounting({
        status: 'failed',
        executionState: {
            ...legacyState({
                localLaunches: 0, localCases: null, globalLaunches: 0, globalMasks: null,
            }),
            local: { launches: 2, casesCompleted: null, receiptRetained: false },
        },
    }), (error) => error.code === 'INVALID_QUALIFICATION_EXECUTION_STATE')
})

test('qualification runner persists launch checkpoints before execution and preserves failure accounting', () => {
    const source = fs.readFileSync(path.join(
        ROOT, 'scripts/run-toolchain-shadow-real-global-qualification-v2.cjs',
    ), 'utf8')
    const localState = source.indexOf("phase: 'local-launch-recorded-before-execution'")
    const localRun = source.indexOf('localReceipt = await runFreshLocalShadow({')
    const globalState = source.indexOf("phase: 'global-launch-recorded-before-execution'")
    const globalRun = source.indexOf('requireSuccessfulChild(await runChild(process.execPath, globalArgs')
    assert.ok(localState >= 0 && localState < localRun)
    assert.ok(globalState >= 0 && globalState < globalRun)
    assert.match(source, /persistQualificationExecutionState\(files\.executionState/)
    assert.doesNotMatch(source, /writeJsonAtomic\(files\.executionState/)
    assert.equal((source.match(/runFreshLocalShadow\(\{/g) ?? []).length, 1)
    assert.equal((source.match(/runChild\(process\.execPath, globalArgs/g) ?? []).length, 1)
    assert.match(source, /preservePrimaryError\(primaryError, persistenceError\)/)
    assert.match(source, /accountingFromOutputDirectory\(options\.outputDirectory, \{ status: 'failed' \}\)/)
    assert.doesNotMatch(source, /report\?\.localLaunches \?\? 0/)
    assert.doesNotMatch(source, /report\?\.globalLaunches \?\? 0/)
})
