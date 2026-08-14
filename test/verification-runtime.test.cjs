'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const {
    RUNTIME_FIELD_POLICY,
    compareRuntimeEnvelopes,
} = require('../src/verification-runtime.cjs')

function envelope(overrides = {}) {
    return {
        schema: 'patch-verification-runtime-envelope-v1',
        fieldPolicy: RUNTIME_FIELD_POLICY,
        values: {
            nodeVersion: 'v25.9.0',
            platform: 'linux',
            architecture: 'arm64',
            filesystemType: '0xef53',
            umask: 0o077,
            locale: 'C.UTF-8',
            timezone: 'UTC',
            kernel: '6.17.0',
            cpuCount: 2,
            availableParallelism: 2,
            mountNamespaceId: 'mnt:[1]',
            ...overrides,
        },
    }
}

test('runtime policy classifies every field explicitly', () => {
    assert.deepEqual(
        new Set(Object.values(RUNTIME_FIELD_POLICY).map((entry) => entry.classification)),
        new Set(['semantic', 'compatibility-critical', 'diagnostic', 'informational']),
    )
    assert.equal(RUNTIME_FIELD_POLICY.umask.classification, 'semantic')
    assert.equal(RUNTIME_FIELD_POLICY.availableParallelism.classification, 'semantic')
    assert.equal(RUNTIME_FIELD_POLICY.mountNamespaceId.classification, 'diagnostic')
})

test('semantic and compatibility-critical runtime changes fail closed', () => {
    for (const [field, value] of [
        ['umask', 0o022],
        ['availableParallelism', 3],
        ['nodeVersion', 'v26.0.0'],
        ['platform', 'darwin'],
        ['architecture', 'x64'],
        ['filesystemType', '0x1234'],
        ['locale', 'ko_KR.UTF-8'],
    ]) {
        const comparison = compareRuntimeEnvelopes(envelope(), envelope({ [field]: value }))
        assert.equal(comparison.matched, false, field)
        assert.match(comparison.errors.join('\n'), new RegExp(field))
    }
})

test('diagnostic and informational differences remain recorded but nonblocking', () => {
    const comparison = compareRuntimeEnvelopes(envelope(), envelope({
        timezone: 'Asia/Seoul',
        kernel: '6.18.0',
        cpuCount: 4,
        mountNamespaceId: 'mnt:[2]',
    }))
    assert.equal(comparison.matched, true)
    assert.deepEqual(
        comparison.differences.map((entry) => [
            entry.field,
            entry.classification,
            entry.blocking,
        ]),
        [
            ['timezone', 'diagnostic', false],
            ['kernel', 'diagnostic', false],
            ['cpuCount', 'informational', false],
            ['mountNamespaceId', 'diagnostic', false],
        ],
    )
})

test('unknown or missing runtime fields fail closed', () => {
    const unknown = envelope({ opaqueFutureField: 'value' })
    assert.match(
        compareRuntimeEnvelopes(envelope(), unknown).errors.join('\n'),
        /unknown runtime field/,
    )
    const missing = envelope()
    delete missing.values.umask
    assert.match(
        compareRuntimeEnvelopes(envelope(), missing).errors.join('\n'),
        /missing runtime field: umask/,
    )
    const alteredPolicy = envelope()
    alteredPolicy.fieldPolicy = {
        ...RUNTIME_FIELD_POLICY,
        mountNamespaceId: {
            ...RUNTIME_FIELD_POLICY.mountNamespaceId,
            classification: 'semantic',
        },
    }
    assert.match(
        compareRuntimeEnvelopes(envelope(), alteredPolicy).errors.join('\n'),
        /runtime field policy mismatch/,
    )
})
