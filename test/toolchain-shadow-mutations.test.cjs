'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { createToolchainKnownAnswerTarget } = require('../src/toolchain-shadow-known-answer.cjs')
const { runFreshLocalShadow } = require('../src/toolchain-shadow-local.cjs')

const ROOT = path.resolve(__dirname, '..')

function cleanupFailureProjection(error) {
    const projectionRoot = error?.details?.projectionRoot
    if (typeof projectionRoot === 'string' && projectionRoot.includes('toolchain-shadow-')) {
        fs.rmSync(projectionRoot, { recursive: true, force: true })
    }
}

async function expectWorkerFault(syntheticFault, causeCode) {
    const target = createToolchainKnownAnswerTarget(ROOT)
    try {
        let observed = null
        await assert.rejects(
            () => runFreshLocalShadow({
                sourceRoot: ROOT,
                targetRoot: target.root,
                targetProvenance: target.provenance,
                disposition: 'synthetic-known-answer',
                compiledContract: target.compiled,
                syntheticFault,
            }),
            (error) => {
                observed = error
                return error.code === 'FRESH_LOCAL_FIRST_FAILURE'
                    && (causeCode === 'signal'
                        ? error.details.worker?.signal === 'SIGTERM'
                        : error.details.worker?.workerError?.code === causeCode)
            },
        )
        cleanupFailureProjection(observed)
    } finally {
        fs.rmSync(target.root, { recursive: true, force: true })
    }
}

test('apply failure is preserved as the first local failure', async () => {
    await expectWorkerFault('apply-failure', 'SYNTHETIC_APPLY_FAILURE')
})

test('same-selection repeated-plan failure is preserved', async () => {
    await expectWorkerFault('repeated-plan-failure', 'SYNTHETIC_REPEATED_PLAN_FAILURE')
})

test('revert corruption fails exact restoration', async () => {
    await expectWorkerFault('revert-corruption', 'RESTORATION_FAILED')
})

test('interrupted fresh worker cannot become an accepted observation', async () => {
    await expectWorkerFault('interrupted-worker', 'signal')
})

test('source target mutation is caught by pre/post target identity', async () => {
    const target = createToolchainKnownAnswerTarget(ROOT)
    try {
        await assert.rejects(
            () => runFreshLocalShadow({
                sourceRoot: ROOT,
                targetRoot: target.root,
                targetProvenance: target.provenance,
                disposition: 'synthetic-known-answer',
                compiledContract: target.compiled,
                syntheticFault: 'target-integrity-failure',
            }),
            (error) => error.code === 'TARGET_INTEGRITY_FAILURE',
        )
    } finally {
        fs.rmSync(target.root, { recursive: true, force: true })
    }
})

test('package and lock drift are rejected before a worker starts', async () => {
    for (const file of ['package.json', 'pnpm-lock.yaml']) {
        const target = createToolchainKnownAnswerTarget(ROOT)
        try {
            fs.appendFileSync(path.join(target.root, file), ' ')
            await assert.rejects(
                () => runFreshLocalShadow({
                    sourceRoot: ROOT,
                    targetRoot: target.root,
                    targetProvenance: target.provenance,
                    disposition: 'synthetic-known-answer',
                    compiledContract: target.compiled,
                }),
                (error) => ['TARGET_BASELINE_DRIFT', 'DECLARATION_INPUT_MISMATCH'].includes(error.code),
            )
        } finally {
            fs.rmSync(target.root, { recursive: true, force: true })
        }
    }
})

test('fault injection is unavailable to material shadow runs', async () => {
    const target = createToolchainKnownAnswerTarget(ROOT)
    try {
        await assert.rejects(
            () => runFreshLocalShadow({
                sourceRoot: ROOT,
                targetRoot: target.root,
                targetProvenance: target.provenance,
                disposition: 'material-shadow',
                compiledContract: target.compiled,
                syntheticFault: 'apply-failure',
            }),
            (error) => error.code === 'FAULT_INJECTION_FORBIDDEN',
        )
    } finally {
        fs.rmSync(target.root, { recursive: true, force: true })
    }
})
