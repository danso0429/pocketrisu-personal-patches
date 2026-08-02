'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const manifest = require('../patches/bg-preserve/manifest.cjs')
const { unitMatchesTarget } = require('../src/manager.cjs')

const target181 = { packageName: 'pocketrisu', packageVersion: '1.8.1' }
const target190 = { packageName: 'pocketrisu', packageVersion: '1.9.0' }

function unit(id) {
    const found = manifest.units.find((candidate) => candidate.id === id)
    assert.ok(found, `missing unit ${id}`)
    return found
}

function sha(value) {
    return crypto.createHash('sha256').update(value).digest('hex')
}

test('K27-F01 keeps the 1.8 BG payload and scopes native logging to exact 1.9', () => {
    assert.equal(manifest.version, 'v1.0.1-patcher.7')
    const orchestrator181 = unit('bg-preserve:owned:server/node/bgOrchestrator.cjs')
    const orchestrator190 = unit('bg-preserve:owned:server/node/bgOrchestrator.cjs:1.9')
    const register181 = unit('bg-preserve:hook:server-cjs-register-routes')
    const register190 = unit('bg-preserve:hook:server-cjs-register-routes:1.9')

    assert.equal(sha(orchestrator181.content), 'e51d91b18251534cab4dc077cc8b99feaf7060f5e3ff0b79d3380cef30100a2c')
    assert.equal(sha(register181.managed), '2f6888a998a332a65681d8f7be8d66344fbc8e4d66917e6d2f2c602dc79fcc7d')
    assert.equal(unitMatchesTarget(orchestrator181, target181), true)
    assert.equal(unitMatchesTarget(orchestrator181, target190), false)
    assert.equal(unitMatchesTarget(orchestrator190, target181), false)
    assert.equal(unitMatchesTarget(orchestrator190, target190), true)
    assert.equal(unitMatchesTarget(register181, target181), true)
    assert.equal(unitMatchesTarget(register190, target190), true)
})

test('K27-F01 routes only the bundle logging POST through the native owner', () => {
    const orchestrator = unit('bg-preserve:owned:server/node/bgOrchestrator.cjs:1.9')
    const register = unit('bg-preserve:hook:server-cjs-register-routes:1.9')

    assert.match(orchestrator.content, /deliverBgRequestLog/)
    assert.match(orchestrator.content, /if \(u === '\/api\/request-logs'\)/)
    assert.match(orchestrator.content, /parseBgRequestLogBatch\(a\[0\]\)/)
    assert.match(orchestrator.content, /deliverBgRequestLog\(requestLogs, requestLogBatch\)/)
    assert.match(orchestrator.content, /loadBundle\(deps\.requestLogs\)/)
    assert.match(register.managed, /DB_HEX_KEY, requestLogs/)
    const previewCalls = [...orchestrator.content.matchAll(
        /runServerPreview\(\s*\{([^}]*)\}/g,
    )]
    assert.equal(previewCalls.length, 4)
    for (const call of previewCalls) {
        assert.match(call[1], /requestLogs: deps\.requestLogs/)
    }
    assert.doesNotMatch(orchestrator.content, /CREATE TABLE|new Database|request-logs\.db/)
    assert.doesNotMatch(register.managed, /createRequestLogs/)
})

test('K27-F01 owns a bridge and target test without a second schema', () => {
    const bridge = unit('bg-preserve:owned:server/node/bgRequestLogBridge.cjs:1.9')
    const targetTest = unit('bg-preserve:owned:server/node/bgRequestLogBridge.test.ts:1.9')
    const bridgePath = path.join(
        __dirname,
        '../patches/bg-preserve/files/server/node/bgRequestLogBridge.cjs',
    )

    assert.equal(bridge.content, fs.readFileSync(bridgePath, 'utf8'))
    assert.match(bridge.content, /requestLogs\.addRequestLogBatch\(entries\)/)
    assert.match(bridge.content, /MAX_BG_REQUEST_LOG_BODY_BYTES = 100 \* 1024 \* 1024/)
    assert.match(bridge.content, /risu-auth/)
    assert.match(bridge.content, /Array\.isArray\(payload\) && payload\.length > 0/)
    assert.match(bridge.content, /success: false, written: 0/)
    assert.doesNotMatch(bridge.content, /CREATE TABLE|new Database|requestBody\s*:/)
    assert.deepEqual(targetTest.requires, [bridge.id, 'bg-preserve:owned:server/node/bgOrchestrator.cjs:1.9'])
    assert.match(targetTest.content, /masking, body caps, and content-free usage/)
    assert.match(targetTest.content, /whole-database byte rotation policy/)
    assert.match(targetTest.content, /native logger request shape/)
    assert.match(targetTest.content, /instead of throwing into generation/)
})
