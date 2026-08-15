'use strict'

const crypto = require('node:crypto')
const vm = require('node:vm')
const { canonicalJson } = require('./verification-receipts.cjs')
const { sha256 } = require('./verification-evidence.cjs')
const {
    BOUNDARY_CLASS_IDS,
    MANAGED_PATHS,
    STATE_PATHS,
    ToolchainShadowContractError,
} = require('./toolchain-shadow-contract.cjs')

const BUILD_BOUNDARY_CLASS = Object.freeze({
    id: 'toolchain:linux-arm64-glibc-node-25.9.0-pnpm-10.34.1',
    nodeVersion: 'v25.9.0',
    platform: 'linux',
    architecture: 'arm64',
    libc: 'glibc',
    pnpmVersion: '10.34.1',
})
const RUNTIME_MODULES = Object.freeze([
    'happy-dom/Storage',
    'katex',
    'node:fs',
    'node:path',
    'vitest/vi',
])
const CAPABILITY_KINDS = Object.freeze([
    'environment',
    'filesystem',
    'module',
    'network',
    'process-global',
    'randomness',
    'state',
    'subprocess',
    'symbol',
    'time',
    'worker',
])

class ToolchainShadowBoundaryError extends Error {
    constructor(code, message, details = {}) {
        super(message)
        this.name = 'ToolchainShadowBoundaryError'
        this.code = code
        this.details = details
    }
}

function exactKeys(value, expected, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new ToolchainShadowBoundaryError('INVALID_BOUNDARY', `${label} must be an object`)
    }
    const actual = Object.keys(value).sort()
    const wanted = [...expected].sort()
    if (canonicalJson(actual) !== canonicalJson(wanted)) {
        throw new ToolchainShadowBoundaryError('UNKNOWN_BOUNDARY_FIELD', `${label} fields differ`, {
            actual,
            expected: wanted,
        })
    }
}

function enumerateBoundaryClasses(declaration) {
    const localStorage = declaration.boundaries.find((entry) =>
        entry.id === 'boundary:local-storage-descriptor')
    if (!localStorage) {
        throw new ToolchainShadowBoundaryError('MISSING_BOUNDARY_CLASS', 'Local-storage boundary is absent')
    }
    const actual = [...localStorage.inputClasses].sort()
    const expected = [...BOUNDARY_CLASS_IDS].sort()
    if (new Set(actual).size !== actual.length || canonicalJson(actual) !== canonicalJson(expected)) {
        throw new ToolchainShadowBoundaryError('INCOMPLETE_BOUNDARY_CLASSES', 'Boundary class set is not exact', {
            actual,
            expected,
        })
    }
    return expected
}

function boundaryFixture(classId, sandbox, metrics) {
    switch (classId) {
    case 'local-storage:no-own-descriptor':
        return { inputKind: 'no-own-descriptor', inputIdentity: null }
    case 'local-storage:usable-effect-free-data-value': {
        const value = Object.freeze({ clear() {} })
        Object.defineProperty(sandbox, 'localStorage', {
            configurable: false,
            enumerable: true,
            value,
            writable: false,
        })
        return { inputKind: 'usable-data-value', inputIdentity: value }
    }
    case 'local-storage:configurable-unusable-data-value': {
        const value = Object.freeze({})
        Object.defineProperty(sandbox, 'localStorage', {
            configurable: true,
            enumerable: false,
            value,
            writable: true,
        })
        return { inputKind: 'unusable-data-value', inputIdentity: value }
    }
    case 'local-storage:configurable-accessor-not-invoked':
        Object.defineProperty(sandbox, 'localStorage', {
            configurable: true,
            enumerable: false,
            get() {
                metrics.getterCalls += 1
                throw new Error('boundary getter must not be invoked')
            },
        })
        return { inputKind: 'throwing-accessor', inputIdentity: null }
    default:
        throw new ToolchainShadowBoundaryError('OUT_OF_RANGE_BOUNDARY_CLASS', `Unknown boundary class ${classId}`)
    }
}

function executableSetup(source, expectedSha256s) {
    const sourceSha256 = sha256(source)
    if (!expectedSha256s.includes(sourceSha256)) {
        throw new ToolchainShadowBoundaryError('UNSEALED_EXECUTABLE_INPUT', 'Vitest setup input is not declared')
    }
    const requiredFragments = [
        "import { vi } from 'vitest'",
        "vi.mock(import('katex'), () => ({}))",
        "vi.stubGlobal('safeStructuredClone'",
    ]
    for (const fragment of requiredFragments) {
        if (!source.includes(fragment)) {
            throw new ToolchainShadowBoundaryError('UNDECLARED_SYMBOL_ACCESS', `Missing sealed fragment: ${fragment}`)
        }
    }
    const transformed = source
        .replace(/^import .*$/gm, '')
        .replace(/^vi\.mock\(import\('katex'\), \(\) => \(\{\}\)\)\s*$/m, '')
        .replace('(v: unknown)', '(v)')
    for (const forbidden of ['require(', 'process.', 'Date.', 'Math.random', 'fetch(', 'Worker(']) {
        if (transformed.includes(forbidden)) {
            throw new ToolchainShadowBoundaryError('UNDECLARED_RUNTIME_CAPABILITY', `Setup contains ${forbidden}`)
        }
    }
    return { sourceSha256, transformed }
}

function descriptorObservation(descriptor, TestStorage, inputIdentity) {
    if (descriptor === undefined) {
        return { kind: 'absent', configurable: null, enumerable: null, writable: null, usable: false, identity: 'absent' }
    }
    const isData = Object.hasOwn(descriptor, 'value')
    let usable = false
    let identity = 'accessor'
    if (isData) {
        usable = typeof descriptor.value?.clear === 'function'
        if (descriptor.value === inputIdentity) identity = 'input-preserved'
        else if (descriptor.value instanceof TestStorage) identity = 'new-test-storage'
        else identity = 'other-data-value'
    }
    return {
        kind: isData ? 'data' : 'accessor',
        configurable: descriptor.configurable,
        enumerable: descriptor.enumerable,
        writable: isData ? descriptor.writable : null,
        usable,
        identity,
    }
}

function expectedBoundaryOutcome(mask, classId) {
    if (mask === 0) {
        return {
            'local-storage:no-own-descriptor': { kind: 'absent', identity: 'absent' },
            'local-storage:usable-effect-free-data-value': { kind: 'data', identity: 'input-preserved' },
            'local-storage:configurable-unusable-data-value': { kind: 'data', identity: 'input-preserved' },
            'local-storage:configurable-accessor-not-invoked': { kind: 'accessor', identity: 'accessor' },
        }[classId]
    }
    return {
        'local-storage:no-own-descriptor': { kind: 'data', identity: 'new-test-storage' },
        'local-storage:usable-effect-free-data-value': { kind: 'data', identity: 'input-preserved' },
        'local-storage:configurable-unusable-data-value': { kind: 'data', identity: 'new-test-storage' },
        'local-storage:configurable-accessor-not-invoked': { kind: 'data', identity: 'new-test-storage' },
    }[classId]
}

function executeLocalStorageBoundary({ source, mask, classId, anchorSha256, managedSha256 }) {
    if (![0, 1].includes(mask)) {
        throw new ToolchainShadowBoundaryError('OUT_OF_RANGE_LOCAL_MASK', `Invalid local mask ${mask}`)
    }
    if (!BOUNDARY_CLASS_IDS.includes(classId)) {
        throw new ToolchainShadowBoundaryError('OUT_OF_RANGE_BOUNDARY_CLASS', `Unknown boundary ${classId}`)
    }
    const executable = executableSetup(source, [anchorSha256, managedSha256])
    const metrics = { getterCalls: 0, mockCalls: 0, stubbedGlobals: [] }
    class TestStorage {
        clear() {}
    }
    const sandbox = {
        Storage: TestStorage,
        vi: {
            mock() { metrics.mockCalls += 1 },
            stubGlobal(name, value) {
                metrics.stubbedGlobals.push(name)
                Object.defineProperty(sandbox, name, {
                    configurable: true,
                    enumerable: true,
                    value,
                    writable: true,
                })
            },
        },
    }
    const fixture = boundaryFixture(classId, sandbox, metrics)
    const context = vm.createContext(sandbox, {
        codeGeneration: { strings: false, wasm: false },
        name: `toolchain-shadow-${classId}-${mask}`,
    })
    new vm.Script(executable.transformed, {
        filename: 'sealed-vitest.setup.ts',
    }).runInContext(context, { timeout: 1_000 })
    const descriptor = Object.getOwnPropertyDescriptor(sandbox, 'localStorage')
    const observed = descriptorObservation(descriptor, TestStorage, fixture.inputIdentity)
    const expected = expectedBoundaryOutcome(mask, classId)
    if (metrics.getterCalls !== 0 || observed.kind !== expected.kind || observed.identity !== expected.identity) {
        throw new ToolchainShadowBoundaryError('BOUNDARY_OBSERVATION_MISMATCH', 'Local-storage boundary changed unexpectedly', {
            classId,
            mask,
            expected,
            observed,
            getterCalls: metrics.getterCalls,
        })
    }
    if (!metrics.stubbedGlobals.includes('safeStructuredClone')) {
        throw new ToolchainShadowBoundaryError('UNDECLARED_SYMBOL_ACCESS', 'safeStructuredClone was not provided')
    }
    return {
        schema: 'patch-toolchain-symbol-observation-v1',
        classId,
        mask,
        sourceSha256: executable.sourceSha256,
        inputKind: fixture.inputKind,
        output: observed,
        getterCalls: metrics.getterCalls,
        safeStructuredCloneProvided: true,
        katexMockDeclarationPreserved: source.includes("vi.mock(import('katex')"),
        observationSha256: sha256(canonicalJson({ classId, mask, sourceSha256: executable.sourceSha256, observed })),
    }
}

function validateBuildBoundary(observed) {
    exactKeys(observed, ['id', 'nodeVersion', 'platform', 'architecture', 'libc', 'pnpmVersion'], 'build boundary')
    if (canonicalJson(observed) !== canonicalJson(BUILD_BOUNDARY_CLASS)) {
        throw new ToolchainShadowBoundaryError('BUILD_BOUNDARY_MISMATCH', 'Build environment is not admitted', {
            expected: BUILD_BOUNDARY_CLASS,
            observed,
        })
    }
    return observed
}

function validateCapabilityAccess(access, declaration) {
    exactKeys(access, ['kind', 'mode', 'resource'], 'capability access')
    if (!CAPABILITY_KINDS.includes(access.kind) || typeof access.mode !== 'string' || typeof access.resource !== 'string') {
        throw new ToolchainShadowBoundaryError('INVALID_CAPABILITY_ACCESS', 'Capability access is malformed')
    }
    const assetPaths = new Set(declaration.manifestExecution.declaredReads)
    const symbolIds = new Set(declaration.symbols.map((symbol) => symbol.id))
    if (access.kind === 'filesystem') {
        const allowed = new Set([...assetPaths, ...MANAGED_PATHS, ...STATE_PATHS])
        if (!allowed.has(access.resource)) {
            throw new ToolchainShadowBoundaryError('UNDECLARED_FILESYSTEM_ACCESS', `Undeclared path ${access.resource}`)
        }
        if (!['delete', 'read', 'write'].includes(access.mode)) {
            throw new ToolchainShadowBoundaryError('UNDECLARED_FILESYSTEM_ACCESS', `Undeclared filesystem mode ${access.mode}`)
        }
        return access
    }
    if (access.kind === 'state') {
        if (!STATE_PATHS.includes(access.resource) || !['delete', 'read', 'write'].includes(access.mode)) {
            throw new ToolchainShadowBoundaryError('UNDECLARED_STATE_ACCESS', `Undeclared state ${access.resource}`)
        }
        return access
    }
    if (access.kind === 'symbol') {
        if (!symbolIds.has(access.resource)) {
            throw new ToolchainShadowBoundaryError('UNDECLARED_SYMBOL_ACCESS', `Undeclared symbol ${access.resource}`)
        }
        return access
    }
    if (access.kind === 'module') {
        if (!RUNTIME_MODULES.includes(access.resource) || access.mode !== 'execute') {
            throw new ToolchainShadowBoundaryError('UNDECLARED_MODULE_ACCESS', `Undeclared module ${access.resource}`)
        }
        return access
    }
    if (access.kind === 'process-global'
        && access.mode === 'read' && access.resource === 'manager-pid') return access
    if (access.kind === 'randomness'
        && access.mode === 'read' && access.resource === 'manager-transaction-token') return access
    if (access.kind === 'time'
        && access.mode === 'read' && access.resource === 'manager-transaction-timestamp') return access
    const code = {
        environment: 'UNDECLARED_ENVIRONMENT_ACCESS',
        network: 'UNDECLARED_NETWORK_ACCESS',
        'process-global': 'UNDECLARED_PROCESS_GLOBAL_MUTATION',
        randomness: 'UNDECLARED_RANDOMNESS_ACCESS',
        subprocess: 'UNDECLARED_SUBPROCESS_ACCESS',
        time: 'UNDECLARED_TIME_ACCESS',
        worker: 'PERSISTENT_WORKER_FORBIDDEN',
    }[access.kind]
    throw new ToolchainShadowBoundaryError(code ?? 'UNDECLARED_RUNTIME_CAPABILITY', `Denied ${access.kind} access`)
}

function validateCapabilityReceipt(accesses, declaration) {
    if (!Array.isArray(accesses) || accesses.length === 0) {
        throw new ToolchainShadowBoundaryError('MISSING_CAPABILITY_RECEIPT', 'Capability receipt is empty')
    }
    const keys = new Set()
    for (const access of accesses) {
        validateCapabilityAccess(access, declaration)
        keys.add(`${access.kind}:${access.mode}:${access.resource}`)
    }
    return {
        schema: 'patch-toolchain-capability-receipt-v1',
        accesses: [...keys].sort(),
        receiptSha256: sha256(canonicalJson([...keys].sort())),
    }
}

function newProcessInstanceId() {
    return crypto.randomUUID()
}

module.exports = {
    BUILD_BOUNDARY_CLASS,
    CAPABILITY_KINDS,
    RUNTIME_MODULES,
    ToolchainShadowBoundaryError,
    enumerateBoundaryClasses,
    executeLocalStorageBoundary,
    newProcessInstanceId,
    validateBuildBoundary,
    validateCapabilityAccess,
    validateCapabilityReceipt,
}
