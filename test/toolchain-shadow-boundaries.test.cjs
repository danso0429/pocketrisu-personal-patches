'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const {
    BUILD_BOUNDARY_CLASS,
    enumerateBoundaryClasses,
    executeLocalStorageBoundary,
    validateBuildBoundary,
    validateCapabilityAccess,
} = require('../src/toolchain-shadow-boundaries.cjs')
const { loadToolchainShadowDeclaration } = require('../src/toolchain-shadow-contract.cjs')

const ROOT = require('node:path').resolve(__dirname, '..')
const compiled = loadToolchainShadowDeclaration(ROOT)
const storage = compiled.pack.units.find((unit) => unit.id === 'toolchain-hardening:vitest-storage')

test('all four typed local-storage classes execute for off and on masks', () => {
    const classes = enumerateBoundaryClasses(compiled.declaration)
    assert.equal(classes.length, 4)
    const observations = []
    for (const classId of classes) {
        for (const mask of [0, 1]) {
            observations.push(executeLocalStorageBoundary({
                source: mask === 0 ? storage.anchor : storage.managed,
                mask,
                classId,
                anchorSha256: compiled.declaration.operations.find((unit) => unit.id === storage.id).anchor.sha256,
                managedSha256: compiled.declaration.operations.find((unit) => unit.id === storage.id).managed.sha256,
            }))
        }
    }
    assert.equal(observations.length, 8)
    assert.ok(observations.every((entry) => entry.getterCalls === 0))
    assert.equal(new Set(observations.map((entry) => `${entry.classId}:${entry.mask}`)).size, 8)
})

test('boundary enumeration rejects missing and duplicate classes', () => {
    const missing = structuredClone(compiled.declaration)
    missing.boundaries.find((entry) => entry.id === 'boundary:local-storage-descriptor').inputClasses.pop()
    assert.throws(() => enumerateBoundaryClasses(missing), (error) => error.code === 'INCOMPLETE_BOUNDARY_CLASSES')
    const duplicate = structuredClone(compiled.declaration)
    const classes = duplicate.boundaries.find((entry) => entry.id === 'boundary:local-storage-descriptor').inputClasses
    classes.push(classes[0])
    assert.throws(() => enumerateBoundaryClasses(duplicate), (error) => error.code === 'INCOMPLETE_BOUNDARY_CLASSES')
})

test('build boundary is exact and rejects the current mismatched pnpm version', () => {
    assert.deepEqual(validateBuildBoundary({ ...BUILD_BOUNDARY_CLASS }), BUILD_BOUNDARY_CLASS)
    assert.throws(
        () => validateBuildBoundary({ ...BUILD_BOUNDARY_CLASS, pnpmVersion: '10.33.0' }),
        (error) => error.code === 'BUILD_BOUNDARY_MISMATCH',
    )
})

test('capability admission rejects undeclared surfaces and process-global effects', () => {
    assert.doesNotThrow(() => validateCapabilityAccess({
        kind: 'filesystem', mode: 'read', resource: 'package.json',
    }, compiled.declaration))
    const cases = [
        [{ kind: 'filesystem', mode: 'write', resource: 'unexpected.txt' }, 'UNDECLARED_FILESYSTEM_ACCESS'],
        [{ kind: 'state', mode: 'read', resource: 'save/other.json' }, 'UNDECLARED_STATE_ACCESS'],
        [{ kind: 'symbol', mode: 'read', resource: 'global:unknown' }, 'UNDECLARED_SYMBOL_ACCESS'],
        [{ kind: 'environment', mode: 'read', resource: 'HOME' }, 'UNDECLARED_ENVIRONMENT_ACCESS'],
        [{ kind: 'time', mode: 'read', resource: 'Date.now' }, 'UNDECLARED_TIME_ACCESS'],
        [{ kind: 'randomness', mode: 'read', resource: 'Math.random' }, 'UNDECLARED_RANDOMNESS_ACCESS'],
        [{ kind: 'module', mode: 'execute', resource: 'node:child_process' }, 'UNDECLARED_MODULE_ACCESS'],
        [{ kind: 'process-global', mode: 'write', resource: 'globalThis.other' }, 'UNDECLARED_PROCESS_GLOBAL_MUTATION'],
        [{ kind: 'worker', mode: 'reuse', resource: 'persistent-local-worker' }, 'PERSISTENT_WORKER_FORBIDDEN'],
    ]
    for (const [access, code] of cases) {
        assert.throws(
            () => validateCapabilityAccess(access, compiled.declaration),
            (error) => error.code === code,
        )
    }
})
