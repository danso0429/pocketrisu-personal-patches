'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const {
    BOUNDARY_CLASS_IDS,
    DECLARATION_PATH,
    declarationHash,
    loadToolchainShadowDeclaration,
    validateToolchainShadowDeclaration,
} = require('../src/toolchain-shadow-contract.cjs')

const ROOT = path.resolve(__dirname, '..')

function declaration() {
    return JSON.parse(fs.readFileSync(path.join(ROOT, DECLARATION_PATH), 'utf8'))
}

function reseal(value) {
    return { ...value, declarationSha256: declarationHash(value) }
}

test('current toolchain shadow declaration is sealed, exact, and production G', () => {
    const compiled = loadToolchainShadowDeclaration(ROOT)
    assert.equal(compiled.declaration.candidate.productionClass, 'G')
    assert.equal(compiled.declaration.candidate.shadowClass, 'B')
    assert.equal(compiled.declaration.candidate.label, 'shadow B candidate')
    assert.equal(compiled.pack.units.length, 7)
    assert.deepEqual(compiled.managedPaths, ['package.json', 'pnpm-lock.yaml', 'vitest.setup.ts'])
    assert.deepEqual(compiled.boundaryClassIds, BOUNDARY_CLASS_IDS)
    assert.equal(compiled.declaration.canonicalProtection.canonicalMasksSkipped, 0)
})

test('declaration rejects unknown fields, classification escalation, and corrupt integrity', () => {
    const unknown = declaration()
    unknown.unknown = true
    assert.throws(
        () => validateToolchainShadowDeclaration(unknown, { repositoryRoot: ROOT }),
        (error) => error.code === 'UNKNOWN_DECLARATION_FIELD',
    )
    const escalated = declaration()
    escalated.candidate.productionClass = 'B'
    assert.throws(
        () => validateToolchainShadowDeclaration(reseal(escalated), { repositoryRoot: ROOT }),
        (error) => error.code === 'CLASSIFICATION_ESCALATION',
    )
    const corrupt = declaration()
    corrupt.operations[0].managed.sha256 = 'f'.repeat(64)
    assert.throws(
        () => validateToolchainShadowDeclaration(corrupt, { repositoryRoot: ROOT }),
        (error) => error.code === 'DECLARATION_HASH_MISMATCH',
    )
})

test('declaration rejects undeclared filesystem, state, symbol, and boundary changes', () => {
    const filesystem = declaration()
    filesystem.operations[0].file = 'undeclared.txt'
    assert.throws(
        () => validateToolchainShadowDeclaration(reseal(filesystem), { repositoryRoot: ROOT }),
        (error) => error.code === 'UNDECLARED_FILESYSTEM_ACCESS',
    )
    const state = declaration()
    state.state.patcherSurfaces.pop()
    assert.throws(
        () => validateToolchainShadowDeclaration(reseal(state), { repositoryRoot: ROOT }),
        (error) => error.code === 'UNDECLARED_STATE_ACCESS',
    )
    const symbol = declaration()
    symbol.symbols.pop()
    assert.throws(
        () => validateToolchainShadowDeclaration(reseal(symbol), { repositoryRoot: ROOT }),
        (error) => error.code === 'UNDECLARED_SYMBOL_ACCESS',
    )
    const boundary = declaration()
    boundary.boundaries[1].inputClasses.pop()
    assert.throws(
        () => validateToolchainShadowDeclaration(reseal(boundary), { repositoryRoot: ROOT }),
        (error) => error.code === 'INCOMPLETE_BOUNDARY_SET',
    )
})
