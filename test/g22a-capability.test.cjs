'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { randomUUID } = require('node:crypto')

const ROOT = path.resolve(__dirname, '..')
const ADAPTER_ROOT = path.join(ROOT, 'patches/lazy-chat-bg-adapter')
const NODE_ROOT = path.join(ADAPTER_ROOT, 'files-1.10/server/node')
const adapter = require('../patches/lazy-chat-bg-adapter/manifest.cjs')
const packageJson = require('../package.json')
const { createTransportCounter, createBgPluginDiagnostics, normalizeSummary } =
    require('../patches/lazy-chat-bg-adapter/files-1.10/server/node/bgPluginDiagnostics.cjs')

const row = (extra = {}) => ({
    version: 1,
    id: randomUUID(),
    createdAt: Date.now(),
    pluginName: 'synthetic',
    pluginVersion: '3.0',
    ...createTransportCounter().snapshot(),
    ...extra,
})

const memoryDiagnostics = () => {
    const values = new Map()
    return createBgPluginDiagnostics({
        kvGet: key => values.get(key) ?? null,
        kvSet: (key, value) => { values.set(key, value) },
        kvDel: key => { values.delete(key) },
        kvList: prefix => [...values.keys()].filter(key => key.startsWith(prefix)),
        transaction: task => task(),
    })
}

test('G2.2a versions and foreground install scope are pinned', () => {
    assert.equal(adapter.version, '0.7.69', 'behavior missing: lazy-chat-bg-adapter version was not advanced')
    const packageExperimental = /^0\.2\.4-experimental\.(\d+)$/.exec(packageJson.version)
    assert.ok(packageExperimental && Number(packageExperimental[1]) >= 56, 'behavior missing: package version was not advanced')
    assert.deepEqual(adapter.requires, ['bg-preserve', 'lazy-chat-sync'])
    assert.deepEqual(adapter.autoWhen, { all: ['bg-preserve', 'lazy-chat-sync'] })
    assert.ok(adapter.units.some(unit => unit.file === 'src/ts/plugins/apiV3/factory.ts'),
        'behavior missing: the foreground capability fix is not owned by lazy-chat-bg-adapter')
})

test('capability exposure contains no plugin-identity branches', () => {
    const factoryUnits = adapter.units.filter(unit => unit.file === 'src/ts/plugins/apiV3/factory.ts')
    assert.ok(factoryUnits.length > 0, 'behavior missing: no foreground capability unit exists')
    const capabilitySources = [
        ...factoryUnits.flatMap(unit => [unit.anchor, unit.content]),
        fs.readFileSync(path.join(NODE_ROOT, 'bgPluginWorker.cjs'), 'utf8'),
    ].join('\n')
    assert.doesNotMatch(capabilitySources, /\b(?:RCM|MARP|PageFold)\b|plugin\.(?:name|version)/i,
        'capability exposure must not branch on plugin identity')
})

test('diagnostics accept legacy rows and preserve valid bounded absent APIs', () => {
    const legacy = row()
    assert.deepEqual(normalizeSummary(legacy), legacy)
    const absentApis = [
        { api: 'foo', phase: 'load' },
        { api: 'bar', phase: 'before_request' },
        { api: 'futureApi', phase: 'future-phase.v2' },
    ]
    assert.deepEqual(normalizeSummary({ ...legacy, absentApis }).absentApis, absentApis)

    const store = memoryDiagnostics()
    store.publish({ ...legacy, absentApis })
    assert.deepEqual(store.list()[0].absentApis, absentApis)
})

test('diagnostics reject malformed or over-bound absentApis', () => {
    const store = memoryDiagnostics()
    const invalid = [
        null,
        'foo',
        {},
        123,
        [null],
        ['foo'],
        [{ api: 'foo' }],
        [{ phase: 'load' }],
        [{ api: '', phase: 'load' }],
        [{ api: 123, phase: 'load' }],
        [{ api: 'foo', phase: '' }],
        [{ api: 'x'.repeat(81), phase: 'load' }],
        [{ api: 'foo', phase: 'x'.repeat(81) }],
        Array.from({ length: 33 }, (_, index) => ({ api: `missing_${index}`, phase: 'load' })),
    ]
    for (const absentApis of invalid) {
        assert.throws(() => normalizeSummary({ ...row(), absentApis }), /plugin_diagnostic_invalid/,
            `malformed absentApis must be rejected: ${JSON.stringify(absentApis)?.slice(0, 120)}`)
        assert.throws(() => store.publish({ ...row(), absentApis }), /plugin_diagnostic_invalid/,
            `malformed absentApis must not be published: ${JSON.stringify(absentApis)?.slice(0, 120)}`)
    }
})

test('initOldApiGlobal pre-existing unawaited-Promise defect remains explicitly out of scope', {
    skip: 'R2-4 known limit: safeGlobalThis, getSafeGlobalThis, safeIdbFactory, safeDocument, alertStore, SafeFunction remain uncached',
}, () => {})

test('real RCM optional-API fallback remains assigned to A5', {
    skip: 'B8 adjustment: this is intentionally covered by the real-browser A5 run, not a blind Node test',
}, () => {})

test('unchanged plugin regressions remain assigned to existing probes', {
    skip: 'R1/R2 adjustment: MARP, PageFold, permissions, callbacks, streams, aborts, and instance methods retain their dedicated probes',
}, () => {})
