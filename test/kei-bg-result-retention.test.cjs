'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const manifest = require('../patches/bg-preserve/manifest.cjs')
const { unitMatchesTarget } = require('../src/manager.cjs')

const target181 = { packageName: 'pocketrisu', packageVersion: '1.8.1' }
const target190 = { packageName: 'pocketrisu', packageVersion: '1.9.0' }

function unit(id) {
    const value = manifest.units.find((candidate) => candidate.id === id)
    assert.ok(value, `missing unit ${id}`)
    return value
}

function activeOwned(target, file) {
    const value = manifest.units.find((candidate) =>
        candidate.type === 'owned' && candidate.file === file
        && unitMatchesTarget(candidate, target)
    )
    assert.ok(value, `missing active owned unit ${file}`)
    return value
}

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex')
}

test('K29-F05 is exact-1.9 owner-local and leaves the imported 1.8 payload unchanged', () => {
    assert.equal(manifest.version, 'v1.0.1-patcher.5')
    const imported = fs.readFileSync(path.join(__dirname, '..', 'patches', 'bg-preserve.json'))
    assert.equal(sha256(imported), '06c482b32e3d3a7e045ce7b3e18b173e9af63205ac68a3dd34fef055cb29efa4')

    const expected181 = new Map([
        ['server/node/bgOrchestrator.cjs', 'e51d91b18251534cab4dc077cc8b99feaf7060f5e3ff0b79d3380cef30100a2c'],
        ['server/node/bgOrchestrationRunRegistry.cjs', '083abb6a2da02cabd6ddb563b9dc30754871aa0c14db86d13b43cfa73c0b286a'],
        ['src/ts/bgOrchestrationRunRegistry.test.ts', '3d3e5131b5cbb642fb40cd2a61d4edfe451bffeb8543893c4baa6b180a922676'],
        ['src/ts/bgOrchestrate.ts', 'ad6510253497051d5de78f38cad2965bf2f3cfc0ccecd575612ae0b7bb2526d4'],
        ['src/ts/bgOrchestrationPending.ts', 'd7723ac90f19befb1d7de4a9123ac4a49a2ec8be0094fbc0dd95e5fcf9933fa9'],
        ['src/ts/bgOrchestrationPending.test.ts', '295b7cb363fa505b66dd9db13fd22ec58c2d779571462f0e0b69d5333b35d775'],
    ])
    for (const [file, expected] of expected181) {
        assert.equal(sha256(activeOwned(target181, file).content), expected, file)
    }
    assert.equal(manifest.units.filter((candidate) =>
        candidate.id.includes('ResultRetention') && unitMatchesTarget(candidate, target181)
    ).length, 0)
})

test('server retention uses one existing KV/state owner with bounded TTL rows and bytes', () => {
    const orchestrator = activeOwned(target190, 'server/node/bgOrchestrator.cjs')
    const helper = unit('bg-preserve:owned:server/node/bgOrchestrationResultRetention.cjs:1.9')
    const targetTest = unit('bg-preserve:owned:server/node/bgOrchestrationResultRetention.test.ts:1.9')

    assert.match(helper.content, /48 \* 60 \* 60 \* 1000/)
    assert.match(helper.content, /ORCH_RESULT_RETENTION_MAX_ROWS = 128/)
    assert.match(helper.content, /ORCH_RESULT_RETENTION_MAX_BYTES = 256 \* 1024 \* 1024/)
    assert.match(helper.content, /seenKeys = new Set/)
    assert.match(helper.content, /operationIdFromResultKey/)
    assert.match(helper.content, /state = action\.reason === 'expired' \? 'result-expired' : 'result-evicted'/)
    assert.ok(helper.content.indexOf('writeOperationState(kvSet') < helper.content.indexOf('kvDel(action.key)'))
    assert.doesNotMatch(helper.content, /new Database|CREATE TABLE|ALTER TABLE|CREATE TABLE/)

    assert.match(orchestrator.content, /sweepOrchestrationResultRetention/)
    assert.match(orchestrator.content, /resultPrefixes: \[ORCH_RESULT_PREFIX, OPERATION_RESULT_PREFIX\]/)
    assert.match(orchestrator.content, /readOperationState, writeOperationState/)
    assert.match(orchestrator.content, /orchestrationRuns\.status\(operationId\) === 'running'/)
    assert.match(orchestrator.content, /hasLiveDeliveryClaim/)
    assert.match(orchestrator.content, /retentionTimer\.unref/)
    assert.doesNotMatch(orchestrator.content, /ORCH_RESULT_TTL_MS = 30/)

    for (const needle of [
        'deduplicates repeated physical keys',
        'derives active identity from a malformed operation-keyed row',
        'bounds future clock skew',
        'writes an existing-owner tombstone before deletion',
        'keeps a paid payload when its durable tombstone cannot be written',
    ]) assert.match(targetTest.content, new RegExp(needle))
})

test('operation and rolling delivery claims protect exact ACK persistence', () => {
    const orchestrator = activeOwned(target190, 'server/node/bgOrchestrator.cjs').content
    const client = activeOwned(target190, 'src/ts/bgOrchestrate.ts').content

    assert.match(orchestrator, /const claimIsLive = hasLiveDeliveryClaim\(parsed, now, ORCH_RESULT_CLAIM_TTL_MS\)/)
    assert.match(orchestrator, /persistDeliveryLease/)
    assert.match(orchestrator, /delivery\.record\.deliveryClaim\.consumerId !== consumerId/)
    assert.match(orchestrator, /heartbeat === '1'/)
    assert.match(client, /delivery=ack-v1&consumerId=/)
    assert.match(client, /if \(!operationId\) return \(\) => \{\}/)
    assert.match(client, /orchestrationResultUrl\(charId, chatId, operationId, resultKeyVersion\)/)
    assert.doesNotMatch(client, /orchestrationResultUrl\(charId, chatId, operationId, 1\)/)
    assert.match(client, /resultId\)}\?consumerId=/)
})

test('live and cold recovery terminate expired or evicted results without fallback', () => {
    const client = activeOwned(target190, 'src/ts/bgOrchestrate.ts').content
    const state = unit('bg-preserve:owned:src/ts/bgOrchestrationRetentionState.ts:1.9').content
    const stateTest = unit('bg-preserve:owned:src/ts/bgOrchestrationRetentionState.test.ts:1.9').content

    assert.match(state, /state === 'result-expired'/)
    assert.match(state, /state === 'result-evicted'/)
    assert.equal((client.match(/orchestrationRetentionFailureMessage\(/g) || []).length, 2)
    assert.match(client, /if \(retentionFailure\) \{\s*stopWatch\(\)/)
    assert.match(client, /if \(retentionFailure\) \{\s*finishBootRecovery\(operationId\)/)
    assert.doesNotMatch(state, /sendChat|triggerClientFallback|runClientFallbackLifecycle/)
    assert.match(stateTest, /does not claim ownership of existing lifecycle states/)
})

test('browser and run tombstones share the bounded overnight recovery horizon', () => {
    const registry = activeOwned(target190, 'server/node/bgOrchestrationRunRegistry.cjs').content
    const registryTest = activeOwned(target190, 'src/ts/bgOrchestrationRunRegistry.test.ts').content
    const pending = activeOwned(target190, 'src/ts/bgOrchestrationPending.ts').content
    const pendingTest = activeOwned(target190, 'src/ts/bgOrchestrationPending.test.ts').content

    assert.match(registry, /ORCH_RESULT_RETENTION_TTL_MS/)
    assert.match(registry, /run\.finishedAt < cutoff/)
    assert.match(registry, /retainMs \+ 1/)
    assert.match(registryTest, /exact 48-hour boundary/)
    assert.match(pending, /49 \* 60 \* 60 \* 1000/)
    assert.match(pending, /protectedOperationId/)
    assert.match(pending, /marker\.ts > now/)
    assert.match(pendingTest, /clock rollback cannot evict a newly admitted marker/)
})
