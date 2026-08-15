#!/usr/bin/env node
'use strict'

const { execFileSync } = require('node:child_process')
const path = require('node:path')
const { canonicalJsonBytes } = require('../src/qualification-object-store.cjs')
const {
    SUBJECT_IMPLEMENTATION_COMMIT,
    deriveFixtureIdentity,
} = require('../src/toolchain-shadow-qualification.cjs')

function parseArgs(argv) {
    if (argv.length !== 4 || argv[2] !== '--subject-root') throw new Error('--subject-root is required')
    return path.resolve(argv[3])
}

function git(root, args) {
    return execFileSync('git', ['--no-pager', '-C', root, ...args], {
        encoding: 'utf8',
        env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
    }).trim()
}

function main(argv = process.argv) {
    const subjectRoot = parseArgs(argv)
    const subjectCommit = git(subjectRoot, ['rev-parse', 'HEAD'])
    const subjectClean = git(subjectRoot, ['status', '--porcelain=v1', '--untracked-files=all']) === ''
    if (subjectCommit !== SUBJECT_IMPLEMENTATION_COMMIT || !subjectClean) {
        throw new Error('Frozen qualification subject is stale or dirty')
    }
    const result = { processId: process.pid, subjectCommit, subjectClean, derivation: deriveFixtureIdentity(subjectRoot) }
    process.stdout.write(`${canonicalJsonBytes(result).toString()}\n`)
    return result
}

if (require.main === module) {
    try { main() } catch (error) {
        process.stderr.write(`${JSON.stringify({ message: error.message })}\n`)
        process.exitCode = 1
    }
}

module.exports = { main, parseArgs }
