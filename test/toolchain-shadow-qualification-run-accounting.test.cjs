'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const {
    EXECUTION_STATE_SCHEMA,
    accountingFromOutputDirectory,
    buildQualificationRunAccounting,
} = require('../src/toolchain-shadow-qualification-run-accounting.cjs')

const ROOT = path.resolve(__dirname, '..')

function state({ localLaunches = 1, localCases = 8, globalLaunches = 1, globalMasks = 4096 } = {}) {
    return {
        schema: EXECUTION_STATE_SCHEMA,
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

test('failed qualification accounting derives nonzero truth from retained receipts without success stdout', (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qualification-accounting-'))
    t.after(() => fs.rmSync(root, { recursive: true, force: true }))
    fs.writeFileSync(path.join(root, 'execution-state.json'), JSON.stringify(state()))
    fs.writeFileSync(path.join(root, 'local-receipt.json'), JSON.stringify({
        coverage: { processedExecutions: 8 },
    }))
    fs.writeFileSync(path.join(root, 'global-receipt.json'), JSON.stringify({
        verifierResult: { verifiedSelections: 4096 },
    }))
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

test('missing success report and missing retained evidence remain unknown rather than zero', () => {
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

test('durable pre-launch execution state can independently prove exact zero', () => {
    const executionState = state({
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

test('retained receipt and execution-state contradictions fail closed', () => {
    assert.throws(() => buildQualificationRunAccounting({
        status: 'failed',
        executionState: state({ globalLaunches: 0, globalMasks: null }),
        globalReceipt: { verifierResult: { verifiedSelections: 4096 } },
    }), (error) => error.code === 'QUALIFICATION_ACCOUNTING_CONTRADICTION')
})

test('qualification runner records launches before execution and emits failure accounting', () => {
    const source = fs.readFileSync(path.join(
        ROOT, 'scripts/run-toolchain-shadow-real-global-qualification-v2.cjs',
    ), 'utf8')
    const localState = source.indexOf("persistExecutionState('local-launch-recorded-before-execution')")
    const localRun = source.indexOf('localReceipt = await runFreshLocalShadow({')
    const globalState = source.indexOf("persistExecutionState('global-launch-recorded-before-execution')")
    const globalRun = source.indexOf('requireSuccessfulChild(await runChild(process.execPath, globalArgs')
    assert.ok(localState >= 0 && localState < localRun)
    assert.ok(globalState >= 0 && globalState < globalRun)
    assert.match(source, /accountingFromOutputDirectory\(options\.outputDirectory, \{ status: 'failed' \}\)/)
    assert.doesNotMatch(source, /report\?\.localLaunches \?\? 0/)
    assert.doesNotMatch(source, /report\?\.globalLaunches \?\? 0/)
})
