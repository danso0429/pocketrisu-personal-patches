'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { loadCatalog, resolveProfile } = require('../src/catalog.cjs')
const { resolveSelection } = require('../src/resolver.cjs')

const root = path.join(__dirname, '..')
const manifest = require('../patches/background-import/manifest.cjs')

test('background import is visible exact-1.10 review scope without rolling-all admission', () => {
    assert.equal(manifest.id, 'background-import')
    assert.equal(manifest.version, '0.1.1')
    assert.equal(manifest.userSelectable, true)
    assert.equal(manifest.allDefault, false)
    assert.deepEqual(manifest.presetDefaults, [])
    assert.deepEqual(manifest.targets.pocketrisu, { verified: [], reviewing: ['1.10.0'] })
    assert.deepEqual(manifest.requires, [
        'character-import-ux',
        'charx-archive-integrity',
        'lazy-chat-sync',
        'client-build-fence',
    ])
    assert.equal(resolveProfile('all', loadCatalog()).defaults.includes(manifest.id), false)
})

test('every production, test, and builder payload has one exact owned unit', () => {
    const payloadRoot = path.join(root, 'patches/background-import/files-1.10')
    const walk = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const absolute = path.join(directory, entry.name)
        return entry.isDirectory() ? walk(absolute) : [path.relative(payloadRoot, absolute).replaceAll('\\', '/')]
    })
    const payloads = walk(payloadRoot).sort()
    const owned = manifest.units
        .filter((unit) => unit.type === 'owned')
        .map((unit) => unit.file)
        .sort()
    assert.deepEqual(owned, payloads)
    assert.equal(new Set(owned).size, owned.length)
})

test('focused graphs select lazy owners and never the standard storage adapter', () => {
    const catalog = loadCatalog()
    for (const requested of [
        [manifest.id],
        [manifest.id, 'bg-preserve'],
        [manifest.id, 'pocketrisu-kei'],
        [manifest.id, 'bg-preserve', 'pocketrisu-kei'],
    ]) {
        const resolution = resolveSelection(catalog, requested)
        for (const dependency of manifest.requires) {
            assert.equal(resolution.resolvedIds.includes(dependency), true, `${requested}: ${dependency}`)
        }
        assert.equal(resolution.resolvedIds.includes('server-backup-snapshot-lazy-adapter'), true)
        assert.equal(resolution.resolvedIds.includes('client-build-fence-standard-adapter'), false)
    }
})

test('server hooks authenticate and bound upload bodies before durable routes guard remove', () => {
    const early = manifest.units.find((unit) => unit.id === 'background-import:early-upload-auth:1.10')
    const bounded = manifest.units.find((unit) => unit.id === 'background-import:bounded-upload-body:1.10')
    const register = manifest.units.find((unit) => unit.id === 'background-import:server-register:1.10')
    assert.ok(early)
    assert.ok(bounded)
    assert.ok(register)
    assert.match(early.content, /await checkAuth/)
    assert.match(early.content, /checkActiveSession/)
    assert.match(bounded.content, /limit: isImportChunk \? '1mb' : '2gb'/)
    assert.equal(register.where, 'before')
    assert.equal(register.anchor, "app.get('/api/remove', async (req, res, next) => {\n")
    assert.match(register.content, /app\.use\(backgroundImportManager\.replacementGuard\)/)
    assert.match(register.content, /maxChunkBytes: 1024 \* 1024/)
    assert.match(register.content, /stagedBytes: 1024 \* 1024 \* 1024/)
})
