'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const vm = require('node:vm')
const manifest = require('../patches/toolchain-hardening/manifest.cjs')
const { loadCatalog, resolveProfile } = require('../src/catalog.cjs')
const { applyUnit, revertUnit } = require('../src/compose.cjs')
const { packEtag } = require('../src/manager.cjs')

function executeManagedSetup(localStorageDescriptor) {
    const setup = manifest.units.find((unit) =>
        unit.id === 'toolchain-hardening:vitest-storage')
    const stubbedGlobals = []
    class TestStorage {
        clear() {}
    }
    const sandbox = {
        Storage: TestStorage,
        vi: {
            mock() {},
            stubGlobal(name, value) {
                stubbedGlobals.push(name)
                Object.defineProperty(sandbox, name, {
                    configurable: true,
                    enumerable: true,
                    value,
                    writable: true,
                })
            },
        },
    }
    Object.defineProperty(sandbox, 'localStorage', localStorageDescriptor)

    const executable = setup.managed
        .replace(/^import .*$/gm, '')
        .replace(/^vi\.mock\(import\('katex'\), \(\) => \(\{\}\)\)\s*$/m, '')
        .replace('(v: unknown)', '(v)')
    vm.runInNewContext(executable, sandbox)

    return { sandbox, stubbedGlobals, TestStorage }
}

test('toolchain hardening is independently versioned and included in the complete set', () => {
    const catalog = loadCatalog()
    assert.equal(manifest.id, 'toolchain-hardening')
    assert.equal(manifest.version, '0.1.4')
    assert.equal(resolveProfile('all', catalog).defaults.includes(manifest.id), true)
})

test('toolchain hardening is qualified only for reviewed exact PocketRisu targets', () => {
    assert.deepEqual(manifest.targets, {
        pocketrisu: {
            verified: ['1.8.1', '1.9.0', '1.10.0'],
            reviewing: [],
        },
    })
    assert.equal(manifest.targets.pocketrisu.verified.includes('1.9.1'), false)
})

test('toolchain hardening ETag covers exact setup and dependency content', () => {
    const original = packEtag(manifest)
    const changed = {
        ...manifest,
        units: manifest.units.map((unit, index) => index === 0
            ? { ...unit, managed: `${unit.managed}\n` }
            : unit),
    }

    assert.match(original, /^[0-9a-f]{64}$/)
    assert.notEqual(packEtag(changed), original)
    assert.equal(packEtag(manifest), original)
})

test('toolchain hardening keeps runtime source out of scope', () => {
    assert.deepEqual(
        [...new Set(manifest.units.map((unit) => unit.file))].sort(),
        ['package.json', 'pnpm-lock.yaml', 'vitest.setup.ts'],
    )

    const setup = manifest.units.find((unit) =>
        unit.id === 'toolchain-hardening:vitest-storage')
    assert.match(setup.managed, /import \{ Storage \} from 'happy-dom'/)
    assert.match(setup.managed, /function hasUsableLocalStorage\(\)/)
    assert.match(setup.managed, /Object\.getOwnPropertyDescriptor\(globalThis, 'localStorage'\)/)
    assert.match(setup.managed, /typeof descriptor\.value\?\.clear === 'function'/)
    assert.doesNotMatch(setup.managed, /globalThis\.localStorage/)
    assert.doesNotMatch(setup.managed, /vi\.stubGlobal\('localStorage'/)
    assert.match(setup.managed, /Object\.defineProperty\(globalThis, 'localStorage'/)
    assert.match(setup.managed, /new Storage\(\)/)

    const managedLock = manifest.units
        .filter((unit) => unit.file === 'pnpm-lock.yaml')
        .map((unit) => unit.managed)
        .join('\n')
    assert.doesNotMatch(managedLock, /1\.32\.0/)
    assert.match(managedLock, /lightningcss(?:@|: )1\.33\.0/)
})

test('toolchain hardening replaces Node 25 incomplete web storage', () => {
    const { sandbox, stubbedGlobals, TestStorage } = executeManagedSetup({
        configurable: true,
        value: {},
        writable: true,
    })

    assert.equal(sandbox.localStorage instanceof TestStorage, true)
    assert.equal(stubbedGlobals.includes('localStorage'), false)
})

test('toolchain hardening replaces Node 26 throwing web storage access', () => {
    let getterCalls = 0
    const { sandbox, stubbedGlobals, TestStorage } = executeManagedSetup({
        configurable: true,
        get() {
            getterCalls += 1
            throw new Error('localStorage requires a file')
        },
    })

    assert.equal(sandbox.localStorage instanceof TestStorage, true)
    assert.equal(stubbedGlobals.includes('localStorage'), false)
    assert.equal(getterCalls, 0)
})

test('toolchain hardening preserves an already usable storage owner', () => {
    const existing = { clear() {} }
    const { sandbox, stubbedGlobals } = executeManagedSetup({
        configurable: true,
        value: existing,
        writable: true,
    })

    assert.equal(sandbox.localStorage, existing)
    assert.equal(stubbedGlobals.includes('localStorage'), false)
})

test('toolchain hardening storage replacement has an exact revert surface', () => {
    const setup = manifest.units.find((unit) =>
        unit.id === 'toolchain-hardening:vitest-storage')
    const applied = applyUnit(setup.anchor, setup)

    assert.equal(applied, setup.managed)
    assert.equal(revertUnit(applied, setup), setup.anchor)
})
