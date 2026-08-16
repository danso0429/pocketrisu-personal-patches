#!/usr/bin/env node
'use strict'

const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
    cleanupProvisionedEnvironment,
    provisionOperatingBuildEnvironment,
    verifyCurrentOperatingBuildEnvironment,
} = require('../src/operating-build-environment.cjs')
const {
    sha256,
    targetFreezeDescriptor,
    writeJsonAtomic,
} = require('../src/verification-evidence.cjs')

function parseArgs(argv) {
    const options = { temporaryParent: os.tmpdir() }
    for (let index = 2; index < argv.length; index += 1) {
        const flag = argv[index]
        const next = () => {
            if (index + 1 >= argv.length) throw new Error(`${flag} requires a value`)
            return argv[++index]
        }
        if (flag === '--subject-root') options.subjectRoot = path.resolve(next())
        else if (flag === '--target-root') options.targetRoot = path.resolve(next())
        else if (flag === '--temporary-parent') options.temporaryParent = path.resolve(next())
        else if (flag === '--tooling-commit') options.toolingCommit = next()
        else if (flag === '--expected-subject-commit') options.expectedSubjectCommit = next()
        else if (flag === '--expected-target-commit') options.expectedTargetCommit = next()
        else if (flag === '--expected-target-tree-sha256') options.expectedTargetTreeSha256 = next()
        else if (flag === '--output') options.output = path.resolve(next())
        else throw new Error(`Unknown option: ${flag}`)
    }
    for (const key of [
        'subjectRoot', 'targetRoot', 'toolingCommit', 'expectedSubjectCommit',
        'expectedTargetCommit', 'expectedTargetTreeSha256', 'output',
    ]) if (!options[key]) throw new Error(`Missing required option: ${key}`)
    for (const [key, pattern] of [
        ['toolingCommit', /^[0-9a-f]{40}$/],
        ['expectedSubjectCommit', /^[0-9a-f]{40}$/],
        ['expectedTargetCommit', /^[0-9a-f]{40}$/],
        ['expectedTargetTreeSha256', /^[0-9a-f]{64}$/],
    ]) if (!pattern.test(options[key])) throw new Error(`${key} is invalid`)
    if (!fs.statSync(options.temporaryParent).isDirectory()) {
        throw new Error('--temporary-parent must name an existing directory')
    }
    if (!fs.existsSync(path.dirname(options.output)) || fs.existsSync(options.output)) {
        throw new Error('Dry-run output parent must exist and output must be new')
    }
    return options
}

function git(root, args) {
    return execFileSync('git', ['--no-pager', '-C', root, ...args], {
        encoding: 'utf8',
        env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
    }).trim()
}

async function main(argv = process.argv) {
    const options = parseArgs(argv)
    const sourceRoot = path.resolve(__dirname, '..')
    const subjectCommit = git(options.subjectRoot, ['rev-parse', 'HEAD'])
    const subjectStatus = git(options.subjectRoot, ['status', '--porcelain=v1'])
    const toolingHead = git(sourceRoot, ['rev-parse', 'HEAD'])
    const targetBefore = await targetFreezeDescriptor(options.targetRoot)
    if (subjectCommit !== options.expectedSubjectCommit || subjectStatus !== '') {
        throw new Error('Qualified subject identity is not exact and clean')
    }
    if (toolingHead !== options.toolingCommit) {
        throw new Error('Tooling base identity differs from the dry-run authority')
    }
    if (targetBefore.provenance.kind !== 'git'
        || targetBefore.provenance.commit !== options.expectedTargetCommit
        || targetBefore.provenance.status !== ''
        || targetBefore.applicationTree.rootSha256 !== options.expectedTargetTreeSha256) {
        throw new Error('Target identity is not exact and clean')
    }
    const toolingStatusBefore = git(sourceRoot, ['status', '--porcelain=v1'])
    const provisioned = await provisionOperatingBuildEnvironment({
        temporaryParent: options.temporaryParent,
        context: {
            subjectCommit,
            toolingCommit: options.toolingCommit,
            toolingStatusSha256: sha256(toolingStatusBefore),
            targetCommit: options.expectedTargetCommit,
            targetApplicationTreeSha256: options.expectedTargetTreeSha256,
        },
    })
    let result
    try {
        const current = verifyCurrentOperatingBuildEnvironment(provisioned.receipt)
        const targetAfter = await targetFreezeDescriptor(options.targetRoot)
        const toolingStatusAfter = git(sourceRoot, ['status', '--porcelain=v1'])
        const subjectStatusAfter = git(options.subjectRoot, ['status', '--porcelain=v1'])
        if (JSON.stringify(targetBefore) !== JSON.stringify(targetAfter)
            || toolingStatusBefore !== toolingStatusAfter
            || subjectStatus !== subjectStatusAfter) {
            throw new Error('Operating environment dry run mutated a repository input')
        }
        result = {
            schema: 'patch-operating-build-environment-dry-run-v1',
            status: 'passed',
            requestedPnpmVersion: provisioned.receipt.requested.pnpmVersion,
            observedPnpmVersion: current.pnpm.observedVersion,
            resolvedPnpmExecutable: current.pnpm.resolvedExecutable,
            pnpmExecutableSha256: current.pnpm.executableSha256,
            nodeVersion: current.node.version,
            nodeExecutable: current.node.executable,
            nodeExecutableSha256: current.node.executableSha256,
            platform: current.observedBoundary.platform,
            architecture: current.observedBoundary.architecture,
            libc: current.observedBoundary.libc,
            expectedBoundary: provisioned.receipt.expectedBoundary,
            observedBoundary: current.observedBoundary,
            boundaryComparison: current.comparison,
            boundaryPassed: true,
            provisioningReceipt: provisioned.receipt,
            repositoryMutation: false,
            localExecutions: 0,
            globalLaunchClaims: 0,
            globalExecutions: 0,
            materialCohortsAccepted: 0,
            candidateOperatingSamplesAccepted: 0,
            provisioningRootCleaned: null,
        }
        result.provisioningRootCleaned = cleanupProvisionedEnvironment(provisioned.root)
        writeJsonAtomic(options.output, result)
        process.stdout.write(`${JSON.stringify(result)}\n`)
        return result
    } catch (error) {
        error.details = {
            ...(error.details ?? {}),
            provisioningRoot: provisioned.root,
            localExecutions: 0,
            globalLaunchClaims: 0,
            globalExecutions: 0,
        }
        throw error
    }
}

if (require.main === module) {
    main().catch((error) => {
        process.stderr.write(`${JSON.stringify({
            code: error.code ?? null,
            message: error.message,
            details: error.details ?? null,
        })}\n`)
        process.exitCode = 1
    })
}

module.exports = { main, parseArgs }
