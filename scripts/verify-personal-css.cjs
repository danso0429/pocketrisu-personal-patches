'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { loadCatalog, resolveProfile } = require('../src/catalog.cjs')
const { planTransition, applyTransition, status } = require('../src/manager.cjs')
const { compatibilityCatalog } = require('./rollback-personal-css-ui.cjs')

const [source, artifacts, dependencies] = process.argv.slice(2).map(value => path.resolve(value))
if (!source || !artifacts || !dependencies) throw new Error('Usage: node scripts/verify-personal-css.cjs PRISTINE_SOURCE ARTIFACT_DIRECTORY NODE_MODULES')
assert.equal(JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8')).version, '1.10.0')
assert.equal(fs.existsSync(path.join(source, 'save')), false, 'Use a pristine source without user data or patch state')
fs.mkdirSync(artifacts, { recursive: true })
const all = loadCatalog()
const specs = [
    ['standalone', ['personal-settings'], ['personal-settings']],
    ['startup', ['personal-settings', 'startup-cache'], ['personal-settings', 'startup-cache']],
    ['lazy', ['personal-settings', 'lazy-chat-sync'], ['personal-settings', 'startup-cache', 'lazy-chat-sync']],
    ['bg-lazy', ['personal-settings', 'lazy-chat-sync', 'bg-preserve'], ['personal-settings', 'startup-cache', 'lazy-chat-sync', 'bg-preserve', 'bg-preserve-storage-base', 'lazy-chat-bg-adapter']],
    ['complete', resolveProfile('all', all).defaults, null],
]
const snapshot = (root, relative) => {
    const file = path.join(root, relative)
    if (!fs.existsSync(file)) return null
    return { hash: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), mode: fs.statSync(file).mode & 0o777 }
}
const receipts = []
for (const [name, packIds, ids] of specs) {
    const root = fs.mkdtempSync(path.join(artifacts, `${name}-`))
    fs.cpSync(source, root, { recursive: true })
    const catalog = ids ? all.filter(pack => ids.includes(pack.id)) : all
    const plan = () => planTransition({ root, catalog, packIds, profile: 'focused-validation' })
    const first = plan()
    const paths = Object.keys(first.state.files)
    const before = new Map(paths.map(file => [file, snapshot(root, file)]))
    applyTransition({ root, transition: first })
    assert.equal(status({ root }).status, 'current')
    assert.equal(plan().changes.length, 0)
    fs.symlinkSync(dependencies, path.join(root, 'node_modules'), 'dir')
    const log = path.join(artifacts, `${name}-tests.log`)
    const fd = fs.openSync(log, 'w')
    try {
        execFileSync(path.join(dependencies, '.bin/vitest'), ['run', 'src/ts/personalSettings'], {
            cwd: root, env: { ...process.env, NODE_OPTIONS: '--no-experimental-webstorage' }, stdio: ['ignore', fd, fd],
        })
    } finally { fs.closeSync(fd) }
    const compatibility = compatibilityCatalog(catalog)
    const uiRollback = planTransition({ root, catalog: compatibility, packIds, profile: 'focused-validation' })
    applyTransition({ root, transition: uiRollback })
    assert.equal(status({ root }).status, 'current')
    const globalSource = fs.readFileSync(path.join(root, 'src/ts/globalApi.svelte.ts'), 'utf8')
    const serverSource = fs.readFileSync(path.join(root, 'server/node/server.cjs'), 'utf8')
    assert.ok(globalSource.includes('personal-settings:editor-asset-references-client:START'))
    assert.ok(globalSource.includes('personal-settings:editor-asset-remap:START'))
    assert.ok(serverSource.includes('personal-settings:editor-asset-references-server:START'))
    assert.equal(fs.existsSync(path.join(root, 'src/ts/personalSettings/customFonts.ts')), false)
    const ts = require(path.join(dependencies, 'typescript'))
    const legacy = {}
    const legacyCode = ts.transpileModule(fs.readFileSync(path.join(root, 'src/ts/personalSettings/appearance.ts'), 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText
    new Function('exports', legacyCode)(legacy)
    const fixture = { theme: '', pocketRisuPersonalSettings: { appearance: { version: 1, enabled: true, chat: { font: 'custom:retained' }, cssToggles: { version: 99 }, fonts: { version: 1, custom: [{ assetPath: 'assets/retained.woff2' }] } } } }
    const groups = JSON.stringify({ css: fixture.pocketRisuPersonalSettings.appearance.cssToggles, fonts: fixture.pocketRisuPersonalSettings.appearance.fonts })
    assert.equal(legacy.readPersonalAppearance(fixture).chat.font, 'app')
    legacy.setPersonalAppearanceValue(fixture, 'sidebar.compact', true)
    assert.equal(fixture.pocketRisuPersonalSettings.appearance.chat.font, 'custom:retained')
    assert.equal(JSON.stringify({ css: fixture.pocketRisuPersonalSettings.appearance.cssToggles, fonts: fixture.pocketRisuPersonalSettings.appearance.fonts }), groups)
    applyTransition({ root, transition: plan() })
    assert.equal(status({ root }).status, 'current')
    assert.equal(plan().changes.length, 0)
    const reverted = planTransition({ root, catalog, packIds: [], profile: 'focused-validation' })
    applyTransition({ root, transition: reverted })
    assert.equal(status({ root }).status, 'clean')
    for (const file of paths) assert.deepEqual(snapshot(root, file), before.get(file), `${name}: ${file}`)
    const receipt = { name, packs: first.packs.length, units: first.order.length, managedPaths: paths.length, collisions: first.collisions.length, reapplyChanges: 0, runtimeTests: 'passed', compatibilityUiRollback: 'passed', rollbackReaderPreservation: 'passed', exactByteModeRevert: 'passed' }
    receipts.push(receipt)
    console.log(JSON.stringify(receipt))
}
fs.writeFileSync(path.join(artifacts, 'receipts.json'), JSON.stringify(receipts, null, 2) + '\n')
