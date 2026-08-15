'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const {
    declarationHash,
    loadToolchainShadowDeclaration,
    validateToolchainShadowDeclaration,
} = require('../src/toolchain-shadow-contract.cjs')
const {
    runFreshLocalShadow,
    validateLocalShadowReceipt,
} = require('../src/toolchain-shadow-local.cjs')
const { canonicalJson, sealDocument } = require('../src/verification-receipts.cjs')
const { contentTreeDescriptor, sha256 } = require('../src/verification-evidence.cjs')

const ROOT = path.resolve(__dirname, '..')

function syntheticTarget() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'toolchain-shadow-known-target-'))
    const current = loadToolchainShadowDeclaration(ROOT)
    const byId = new Map(current.pack.units.map((unit) => [unit.id, unit]))
    const packageText = '{\n  "name": "pocketrisu",\n  "version": "1.9.0",\n  "pnpm": {\n    "onlyBuiltDependencies": []\n  }\n}\n'
    const lockText = [
        "lockfileVersion: '9.0'\n\nsettings:\n  autoInstallPeers: true\n",
        byId.get('toolchain-hardening:lock-lightningcss-override').anchor,
        '\npackages:\n\n',
        byId.get('toolchain-hardening:lock-lightningcss-packages').anchor,
        '\nsnapshots:\n\n',
        byId.get('toolchain-hardening:lock-tailwind-lightningcss').anchor,
        '\n',
        byId.get('toolchain-hardening:lock-lightningcss-snapshots').anchor,
        '\n',
        byId.get('toolchain-hardening:lock-vite-lightningcss').anchor,
    ].join('')
    const files = {
        'package.json': packageText,
        'pnpm-lock.yaml': lockText,
        'vitest.setup.ts': byId.get('toolchain-hardening:vitest-storage').anchor,
    }
    for (const [relative, content] of Object.entries(files)) {
        fs.writeFileSync(path.join(root, relative), content, { mode: 0o600 })
        fs.chmodSync(path.join(root, relative), 0o600)
    }
    const declaration = structuredClone(current.declaration)
    declaration.target.files = Object.keys(files).sort().map((relative) => ({
        path: relative,
        sha256: sha256(files[relative]),
        mode: 0o600,
    }))
    declaration.target.applicationTreeSha256 = contentTreeDescriptor(root).rootSha256
    declaration.declarationSha256 = declarationHash(declaration)
    const compiled = validateToolchainShadowDeclaration(declaration, {
        repositoryRoot: ROOT,
        targetRoot: root,
    })
    return {
        root,
        compiled,
        provenance: `sha256:${sha256('synthetic-toolchain-shadow-known-target-v1')}`,
    }
}

function resealReceipt(receipt) {
    const { integrity: ignored, ...payload } = receipt
    return sealDocument(payload)
}

test('known-answer local route executes exact off/on masks across all boundaries', async () => {
    const target = syntheticTarget()
    try {
        const receipt = await runFreshLocalShadow({
            sourceRoot: ROOT,
            targetRoot: target.root,
            targetProvenance: target.provenance,
            disposition: 'synthetic-known-answer',
            compiledContract: target.compiled,
            recordedAt: '2026-08-15T00:00:00.000Z',
        })
        assert.equal(receipt.status, 'passed')
        assert.deepEqual(receipt.coverage, {
            localMasks: 2, boundaryClasses: 4, expectedExecutions: 8, processedExecutions: 8,
        })
        assert.equal(new Set(receipt.observations.map((entry) => entry.processInstanceId)).size, 8)
        assert.equal(new Set(receipt.observations.map((entry) => entry.projectionId)).size, 8)
        assert.ok(receipt.observations.every((entry) => entry.restoration.restored))
        assert.equal(receipt.candidate.productionClass, 'G')
        assert.equal(receipt.canonicalProtection.canonicalMasksSkipped, 0)
    } finally {
        fs.rmSync(target.root, { recursive: true, force: true })
    }
})

test('local receipt rejects missing, duplicate, and out-of-range masks', async () => {
    const target = syntheticTarget()
    try {
        const receipt = await runFreshLocalShadow({
            sourceRoot: ROOT, targetRoot: target.root, targetProvenance: target.provenance,
            disposition: 'synthetic-known-answer', compiledContract: target.compiled,
        })
        const missing = structuredClone(receipt)
        missing.observations.pop()
        missing.coverage.processedExecutions -= 1
        assert.throws(() => validateLocalShadowReceipt(resealReceipt(missing)), (error) => error.code === 'INCOMPLETE_LOCAL_COVERAGE')
        const duplicate = structuredClone(receipt)
        duplicate.observations[1] = structuredClone(duplicate.observations[0])
        assert.throws(() => validateLocalShadowReceipt(resealReceipt(duplicate)), (error) => error.code === 'DUPLICATE_LOCAL_COVERAGE')
        const range = structuredClone(receipt)
        range.observations[0].mask = 2
        assert.throws(() => validateLocalShadowReceipt(resealReceipt(range)), (error) => error.code === 'OUT_OF_RANGE_LOCAL_COVERAGE')
    } finally {
        fs.rmSync(target.root, { recursive: true, force: true })
    }
})

test('target baseline drift is rejected before a local process starts', async () => {
    const target = syntheticTarget()
    try {
        fs.appendFileSync(path.join(target.root, 'package.json'), ' ')
        await assert.rejects(
            () => runFreshLocalShadow({
                sourceRoot: ROOT, targetRoot: target.root, targetProvenance: target.provenance,
                disposition: 'synthetic-known-answer', compiledContract: target.compiled,
            }),
            (error) => ['TARGET_BASELINE_DRIFT', 'DECLARATION_INPUT_MISMATCH'].includes(error.code),
        )
    } finally {
        fs.rmSync(target.root, { recursive: true, force: true })
    }
})

test('corrupt receipt and weakened production classification are rejected', async () => {
    const target = syntheticTarget()
    try {
        const receipt = await runFreshLocalShadow({
            sourceRoot: ROOT, targetRoot: target.root, targetProvenance: target.provenance,
            disposition: 'synthetic-known-answer', compiledContract: target.compiled,
        })
        const corrupt = structuredClone(receipt)
        corrupt.observations[0].restoration.restored = false
        assert.throws(() => validateLocalShadowReceipt(corrupt), (error) => error.code === 'CORRUPT_LOCAL_RECEIPT')
        const promoted = structuredClone(receipt)
        promoted.candidate.productionClass = 'B'
        assert.throws(() => validateLocalShadowReceipt(resealReceipt(promoted)), (error) => error.code === 'PRODUCTION_CLASSIFICATION_CHANGED')
        assert.notEqual(canonicalJson(promoted), canonicalJson(receipt))
    } finally {
        fs.rmSync(target.root, { recursive: true, force: true })
    }
})

module.exports = { syntheticTarget }
