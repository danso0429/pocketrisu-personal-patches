'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const {
    RUNTIME_FIELD_POLICY,
    RUNTIME_FIELD_POLICY_V1,
    RUNTIME_SCHEMA_V1,
    RUNTIME_SCHEMA_V2,
    compareRuntimeEnvelopes,
} = require('../src/verification-runtime.cjs')

function envelope(overrides = {}) {
    return {
        schema: RUNTIME_SCHEMA_V2,
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
            temporaryDirectory: '/tmp',
            temporaryFilesystemType: '0xef53',
            nodeOptions: null,
            ...overrides,
        },
    }
}

function historicalEnvelope(overrides = {}) {
    const current = envelope(overrides)
    const {
        temporaryDirectory,
        temporaryFilesystemType,
        nodeOptions,
        ...values
    } = current.values
    return {
        schema: RUNTIME_SCHEMA_V1,
        fieldPolicy: RUNTIME_FIELD_POLICY_V1,
        values,
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
    assert.equal(RUNTIME_FIELD_POLICY.temporaryDirectory.classification, 'compatibility-critical')
    assert.equal(
        RUNTIME_FIELD_POLICY.temporaryFilesystemType.classification,
        'compatibility-critical',
    )
    assert.equal(RUNTIME_FIELD_POLICY.nodeOptions.classification, 'compatibility-critical')
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
        ['temporaryDirectory', '/var/tmp'],
        ['temporaryFilesystemType', '0x1234'],
        ['nodeOptions', '--require=/tmp/observer.cjs'],
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

test('invalid field values fail closed while version-one receipts remain comparable', () => {
    for (const [field, value] of [
        ['nodeVersion', ''],
        ['filesystemType', null],
        ['umask', -1],
        ['cpuCount', 0],
        ['availableParallelism', 0],
        ['temporaryDirectory', 'relative/tmp'],
        ['temporaryFilesystemType', null],
    ]) {
        const comparison = compareRuntimeEnvelopes(
            envelope({ [field]: value }),
            envelope({ [field]: value }),
        )
        assert.equal(comparison.matched, false, field)
        assert.match(comparison.errors.join('\n'), new RegExp(field))
    }
    assert.deepEqual(compareRuntimeEnvelopes(historicalEnvelope(), historicalEnvelope()), {
        errors: [],
        differences: [],
        matched: true,
    })
})
