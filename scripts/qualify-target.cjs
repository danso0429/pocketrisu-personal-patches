#!/usr/bin/env node
'use strict'

const path = require('node:path')
const packageJson = require('../package.json')
const { runCli } = require('../src/cli.cjs')
const { assertTargetReviewable } = require('../src/compatibility.cjs')

if ((process.argv[2] ?? '') !== 'stage') {
    console.error(
        'Usage: npm run qualify -- stage --root CURRENT --candidate FRESH',
    )
    process.exitCode = 1
} else {
    runCli({
        repositoryRoot: path.resolve(__dirname, '..'),
        patcherVersion: `${packageJson.version}-maintainer`,
        targetGate: assertTargetReviewable,
    }).catch((error) => {
        console.error(`[pocketrisu-patches] ${error.message}`)
        if (error.code) console.error(`[${error.code}]`)
        if (error.report) {
            console.error(`[report] ${error.report.markdownPath}`)
            console.error(`[report-json] ${error.report.jsonPath}`)
        }
        process.exitCode = 1
    })
}
