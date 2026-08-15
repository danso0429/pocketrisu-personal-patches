'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
    declarationHash,
    loadToolchainShadowDeclaration,
    validateToolchainShadowDeclaration,
} = require('./toolchain-shadow-contract.cjs')
const { contentTreeDescriptor, sha256 } = require('./verification-evidence.cjs')

function createToolchainKnownAnswerTarget(repositoryRoot) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'toolchain-shadow-known-target-'))
    const current = loadToolchainShadowDeclaration(repositoryRoot)
    const byId = new Map(current.pack.units.map((unit) => [unit.id, unit]))
    const files = {
        'package.json': '{\n  "name": "pocketrisu",\n  "version": "1.9.0",\n  "pnpm": {\n    "onlyBuiltDependencies": []\n  }\n}\n',
        'pnpm-lock.yaml': [
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
        ].join(''),
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
        repositoryRoot,
        targetRoot: root,
    })
    return {
        root,
        compiled,
        provenance: `sha256:${sha256('synthetic-toolchain-shadow-known-target-v1')}`,
    }
}

module.exports = { createToolchainKnownAnswerTarget }
