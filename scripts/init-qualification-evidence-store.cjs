#!/usr/bin/env node
'use strict'

const path = require('node:path')
const {
    initializeQualificationStore,
} = require('../src/qualification-object-store.cjs')

function parseArgs(argv) {
    const options = { implementationRoot: path.resolve(__dirname, '..') }
    const values = argv.slice(2)
    for (let index = 0; index < values.length; index += 2) {
        const flag = values[index]
        const key = {
            '--store': 'storeRoot',
            '--implementation-root': 'implementationRoot',
            '--subject-root': 'subjectRoot',
            '--target-root': 'targetRoot',
            '--quarantine-root': 'quarantineRoot',
        }[flag]
        if (!key || index + 1 >= values.length) {
            throw new Error('Usage: init-qualification-evidence-store.cjs --store ABSOLUTE --subject-root ABSOLUTE --target-root ABSOLUTE --quarantine-root ABSOLUTE [--implementation-root ABSOLUTE]')
        }
        options[key] = path.resolve(values[index + 1])
    }
    for (const key of ['storeRoot', 'implementationRoot', 'subjectRoot', 'targetRoot', 'quarantineRoot']) {
        if (!options[key]) throw new Error(`Missing required option: ${key}`)
    }
    return options
}

function main(argv = process.argv) {
    const options = parseArgs(argv)
    const identity = initializeQualificationStore({
        storeRoot: options.storeRoot,
        forbiddenRoots: [
            options.implementationRoot,
            options.subjectRoot,
            options.targetRoot,
            options.quarantineRoot,
        ],
    })
    process.stdout.write(`${JSON.stringify({
        initialized: true,
        store: identity.rootRealpath,
        storeIdentityHash: identity.storeIdentityHash,
        durabilityClass: identity.durabilityClass,
    })}\n`)
    return identity
}

if (require.main === module) {
    try { main() } catch (error) {
        process.stderr.write(`${JSON.stringify({ code: error.code ?? null, message: error.message })}\n`)
        process.exitCode = 1
    }
}

module.exports = { main, parseArgs }
