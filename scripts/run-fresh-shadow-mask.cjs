#!/usr/bin/env node
'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const {
    DEFAULT_STATE_PATH,
    applyTransition,
    planTransition,
    status,
} = require('../src/manager.cjs')

function fingerprint(root, relative) {
    const absolute = path.join(root, relative)
    let stat
    try {
        stat = fs.lstatSync(absolute)
    } catch (error) {
        if (error.code === 'ENOENT') return null
        throw error
    }
    if (!stat.isFile()) throw new Error(`Shadow surface is not a regular file: ${relative}`)
    return {
        sha256: crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex'),
        mode: stat.mode & 0o7777,
    }
}

function snapshot(root, paths) {
    return Object.fromEntries(paths.map((relative) => [relative, fingerprint(root, relative)]))
}

function main() {
    const input = JSON.parse(fs.readFileSync(0, 'utf8'))
    const paths = [...new Set([...input.managedPaths, DEFAULT_STATE_PATH])].sort()
    const baseline = snapshot(input.targetRoot, paths)
    let phase = 'initial-plan'
    try {
        const transition = planTransition({
            root: input.targetRoot,
            catalog: input.catalog,
            packIds: input.selectedPackIds,
            profile: input.profile,
        })
        phase = 'apply'
        applyTransition({ root: input.targetRoot, transition })
        phase = 'status'
        const observedStatus = status({ root: input.targetRoot }).status
        const expectedStatus = transition.state === null ? 'clean' : 'current'
        if (observedStatus !== expectedStatus) {
            throw new Error(`Expected ${expectedStatus} status, observed ${observedStatus}`)
        }
        phase = 'repeated-plan'
        const repeated = planTransition({
            root: input.targetRoot,
            catalog: input.catalog,
            packIds: input.selectedPackIds,
            profile: input.profile,
        })
        if (repeated.changes.length !== 0) throw new Error('Same-selection re-plan was not zero-change')
        phase = 'revert-plan'
        const reverted = planTransition({
            root: input.targetRoot,
            catalog: input.catalog,
            packIds: [],
            profile: input.profile,
        })
        phase = 'revert-apply'
        applyTransition({ root: input.targetRoot, transition: reverted })
        phase = 'restoration'
        const restored = JSON.stringify(snapshot(input.targetRoot, paths)) === JSON.stringify(baseline)
        if (!restored) throw new Error('Projected target did not restore exactly')
        process.stdout.write(`${JSON.stringify({
            processInstanceId: crypto.randomUUID(),
            workerPid: process.pid,
            initialChangeCount: transition.changes.length,
            status: observedStatus,
            repeatedChangeCount: repeated.changes.length,
            revertChangeCount: reverted.changes.length,
            restored,
        })}\n`)
    } catch (error) {
        error.phase = phase
        throw error
    }
}

try {
    main()
} catch (error) {
    process.stderr.write(`${JSON.stringify({
        code: error.code ?? null,
        phase: error.phase ?? null,
        message: error.message,
        stack: error.stack ?? null,
    })}\n`)
    process.exitCode = 1
}
