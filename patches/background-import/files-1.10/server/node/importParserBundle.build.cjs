#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const args = process.argv.slice(2)
const root = args.includes('--root')
    ? path.resolve(args[args.indexOf('--root') + 1])
    : path.resolve(__dirname, '../..')
const entry = path.join(root, 'server/node/importParserEntry.ts')
const outfile = path.join(root, 'server/node/importParserBundle.mjs')

function resolveEsbuild() {
    try { return require(require.resolve('esbuild', { paths: [root] })) } catch {}
    const pnpmDir = path.join(root, 'node_modules/.pnpm')
    const candidates = fs.existsSync(pnpmDir)
        ? fs.readdirSync(pnpmDir).filter(name => /^esbuild@/.test(name)).sort().reverse()
        : []
    if (candidates.length === 0) throw new Error(`esbuild not found under ${pnpmDir}`)
    return require(path.join(pnpmDir, candidates[0], 'node_modules/esbuild'))
}

async function main() {
    if (!fs.existsSync(entry)) throw new Error(`background import parser entry missing: ${entry}`)
    const esbuild = resolveEsbuild()
    await esbuild.build({
        entryPoints: [entry],
        outfile,
        bundle: true,
        platform: 'node',
        format: 'esm',
        target: ['node25'],
        sourcemap: false,
        logLevel: 'silent',
        loader: { '.bin': 'dataurl' },
    })
    const moduleUrl = `${pathToFileURL(outfile).href}?build=${Date.now()}`
    const loaded = await import(moduleUrl)
    if (typeof loaded.inspectImport !== 'function' || typeof loaded.prepareImport !== 'function') {
        throw new Error('background import parser bundle exports are missing')
    }
    const bytes = fs.statSync(outfile).size
    console.log(`[importParserBundle] built ${path.relative(root, outfile)} (${bytes} bytes)`)
    console.log('[importParserBundle] load check: inspectImport=function prepareImport=function')
}

main().catch(error => {
    console.error('[importParserBundle] BUILD FAIL:', error?.stack || error)
    process.exit(1)
})
