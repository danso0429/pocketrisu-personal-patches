#!/usr/bin/env node
'use strict'

const childProcess = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const {
    canonicalJsonBytes,
    sha256,
} = require('../src/qualification-object-store.cjs')
const {
    PROJECTION_SCHEMA,
} = require('../src/toolchain-shadow-canonical-projection.cjs')
const {
    REAL_GLOBAL_QUALIFICATION_TYPE,
} = require('../src/qualification-registry.cjs')
const {
    loadToolchainShadowDeclaration,
} = require('../src/toolchain-shadow-contract.cjs')
const {
    MATERIAL_DECLARATION_V2_SCHEMA,
    TOOLCHAIN_IMPACT_REASON,
    declarationHash,
    validateMaterialDeclaration,
} = require('../src/operating-cohort-route.cjs')
const { writeJsonAtomic } = require('../src/verification-evidence.cjs')

const SUBJECT_IMPLEMENTATION_COMMIT = '54c8307f87354ba14f6f94b3344cc228cfdea1f7'
const POLICY_SHA256 = '356dccb9438853cdb3cd7a7847385dc0072da7eeccb10c6f3ba838590918b3a2'
const TARGET_COMMIT = '85a65f3137b45c8de4a8d21a9887be213b1ac3fc'
const TARGET_TREE = 'c7be2eab4313422d1ae0c199094fd53cce12d0aa73a8ce7a3b6a61d623d822c3'

function parseArgs(argv) {
    const options = { toolRoot: path.resolve(__dirname, '..') }
    const mapping = {
        '--tool-root': 'toolRoot', '--subject-root': 'subjectRoot', '--target-root': 'targetRoot',
        '--subject-output': 'subjectOutput', '--source-identity-output': 'sourceIdentityOutput',
        '--material-declaration-output': 'materialDeclarationOutput',
    }
    for (let index = 2; index < argv.length; index += 2) {
        const key = mapping[argv[index]]
        if (!key || index + 1 >= argv.length) throw new Error(`Unknown or incomplete option: ${argv[index]}`)
        options[key] = path.resolve(argv[index + 1])
    }
    for (const key of [
        'subjectRoot', 'targetRoot', 'subjectOutput', 'sourceIdentityOutput',
        'materialDeclarationOutput',
    ]) if (!options[key]) throw new Error(`Missing required option: ${key}`)
    return options
}

function git(root, args) {
    return childProcess.execFileSync('git', ['--no-pager', '-C', root, ...args], {
        encoding: 'utf8', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    }).trim()
}

function fileSetIdentity(root, files, schema) {
    const entries = [...new Set(files)].sort().map((relative) => ({
        path: relative,
        sha256: sha256(fs.readFileSync(path.join(root, relative))),
    }))
    return { schema, files: entries, rootSha256: sha256(canonicalJsonBytes(entries)) }
}

function schemaFiles(root) {
    return fs.readdirSync(path.join(root, 'schemas'))
        .filter((name) => name.endsWith('.schema.json'))
        .map((name) => `schemas/${name}`)
        .sort()
}

function main(argv = process.argv) {
    const options = parseArgs(argv)
    const toolCommit = git(options.toolRoot, ['rev-parse', 'HEAD'])
    if (git(options.toolRoot, ['status', '--porcelain=v1', '--untracked-files=all']) !== '') {
        throw new Error('V2 qualification tooling worktree must be clean')
    }
    if (git(options.subjectRoot, ['rev-parse', 'HEAD']) !== SUBJECT_IMPLEMENTATION_COMMIT
        || git(options.subjectRoot, ['status', '--porcelain=v1', '--untracked-files=all']) !== '') {
        throw new Error('Frozen subject identity or cleanliness differs')
    }
    if (git(options.targetRoot, ['rev-parse', 'HEAD']) !== TARGET_COMMIT
        || git(options.targetRoot, ['status', '--porcelain=v1', '--untracked-files=all']) !== '') {
        throw new Error('Canonical target identity or cleanliness differs')
    }
    const compiled = loadToolchainShadowDeclaration(options.toolRoot, { targetRoot: options.targetRoot })
    if (compiled.declaration.target.applicationTreeSha256 !== TARGET_TREE) {
        throw new Error('Canonical target application tree differs')
    }
    const contractFile = 'contracts/toolchain-hardening-shadow-v2.json'
    const contractSha256 = sha256(fs.readFileSync(path.join(options.toolRoot, contractFile)))
    const localRoute = fileSetIdentity(options.toolRoot, [
        contractFile,
        'scripts/run-toolchain-shadow-local.cjs',
        'scripts/run-toolchain-shadow-mask.cjs',
        'src/toolchain-shadow-boundaries.cjs',
        'src/toolchain-shadow-canonical-projection.cjs',
        'src/toolchain-shadow-contract.cjs',
        'src/toolchain-shadow-local.cjs',
        'src/toolchain-shadow-same-global.cjs',
    ], 'patch-toolchain-shadow-local-route-identity-v2')
    const globalRoute = fileSetIdentity(options.toolRoot, [
        'scripts/run-verification-evidence.cjs',
        'scripts/verify-all-combinations.cjs',
        'src/manager.cjs',
        'src/toolchain-shadow-canonical-projection.cjs',
        'src/toolchain-shadow-same-global.cjs',
        'src/verification-evidence.cjs',
        'src/verification-receipts.cjs',
    ], 'patch-toolchain-shadow-real-global-route-identity-v2')
    const subjectSchemas = fileSetIdentity(options.toolRoot, [
        contractFile,
        ...compiled.pack.units.flatMap((unit) => [
            unit.anchorSource?.path,
            unit.managedSource?.path,
        ].filter(Boolean)),
    ], 'patch-toolchain-shadow-subject-semantics-identity-v2')
    const qualificationSchemas = fileSetIdentity(options.toolRoot, [
        ...schemaFiles(options.toolRoot),
        'src/qualification-registry.cjs',
        'src/qualification-verifier.cjs',
        'src/toolchain-shadow-real-global-qualification.cjs',
        'scripts/register-toolchain-shadow-real-global-qualification-v2.cjs',
    ], 'patch-toolchain-shadow-qualification-schemas-identity-v2')
    const subject = {
        implementationCommit: SUBJECT_IMPLEMENTATION_COMMIT,
        qualificationToolCommit: toolCommit,
        policySha256: POLICY_SHA256,
        contractSha256,
        compiledDeclarationSha256: compiled.declarationSha256,
        targetCommit: TARGET_COMMIT,
        targetApplicationTreeSha256: TARGET_TREE,
    }
    const sourceIdentity = {
        subjectSchemasSha256: subjectSchemas.rootSha256,
        qualificationSchemasSha256: qualificationSchemas.rootSha256,
        localRouteSha256: localRoute.rootSha256,
        globalProjectionRouteSha256: globalRoute.rootSha256,
        contractSha256,
        compiledDeclarationSha256: compiled.declarationSha256,
        projectionSchema: PROJECTION_SCHEMA,
    }
    const declaration = {
        schema: MATERIAL_DECLARATION_V2_SCHEMA,
        version: 2,
        declarationId: 'first-material-c0-toolchain-hardening-v2',
        changeClass: 'patch',
        materiallyDistinct: true,
        stableRelease: false,
        releaseCandidate: 'not-applicable',
        materialReason: 'first-material-cohort-for-exact-subject-and-authority',
        candidateImpact: {
            affected: true,
            candidateId: 'toolchain-hardening',
            reason: TOOLCHAIN_IMPACT_REASON,
        },
        qualification: {
            type: REAL_GLOBAL_QUALIFICATION_TYPE,
            projectionSchema: PROJECTION_SCHEMA,
            subject,
            compatibility: {
                subjectSchemasSha256: sourceIdentity.subjectSchemasSha256,
                qualificationSchemasSha256: sourceIdentity.qualificationSchemasSha256,
                localRouteSha256: sourceIdentity.localRouteSha256,
                globalProjectionRouteSha256: sourceIdentity.globalProjectionRouteSha256,
            },
        },
        environment: {
            id: 'toolchain:linux-arm64-glibc-node-25.9.0-pnpm-10.34.1',
            nodeVersion: 'v25.9.0', platform: 'linux', architecture: 'arm64',
            libc: 'glibc', pnpmVersion: '10.34.1',
        },
        globalContract: {
            canonicalGate: 'Global Exhaustive', workerSchedule: 'stride-v1',
            workerHistory: 'persistent-per-worker-v1', globalExecutionsExpected: 1,
        },
        declarationSha256: null,
    }
    declaration.declarationSha256 = declarationHash(declaration)
    validateMaterialDeclaration(declaration)
    writeJsonAtomic(options.subjectOutput, subject)
    writeJsonAtomic(options.sourceIdentityOutput, sourceIdentity)
    writeJsonAtomic(options.materialDeclarationOutput, declaration)
    const report = {
        qualificationToolCommit: toolCommit,
        subject,
        sourceIdentity,
        materialDeclarationSha256: declaration.declarationSha256,
        projectionSchema: PROJECTION_SCHEMA,
    }
    process.stdout.write(`${JSON.stringify(report)}\n`)
    return report
}

if (require.main === module) {
    try { main() } catch (error) {
        process.stderr.write(`${JSON.stringify({ code: error.code ?? null, message: error.message })}\n`)
        process.exitCode = 1
    }
}

module.exports = { fileSetIdentity, main, parseArgs }
