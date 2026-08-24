'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { loadCatalog, resolveProfile } = require('../src/catalog.cjs')
const { resolveSelection } = require('../src/resolver.cjs')

const root = path.join(__dirname, '..')
const manifest = require('../patches/background-import/manifest.cjs')

test('background import is admitted to the complete exact-1.10 set', () => {
    assert.equal(manifest.id, 'background-import')
    assert.equal(manifest.version, '0.3.3')
    assert.equal(manifest.userSelectable, true)
    assert.equal(Object.hasOwn(manifest, 'allDefault'), false)
    assert.equal(Object.hasOwn(manifest, 'presetDefaults'), false)
    assert.deepEqual(manifest.targets.pocketrisu, { verified: [], reviewing: ['1.10.0'] })
    assert.deepEqual(manifest.requires, [
        'character-import-ux',
        'charx-archive-integrity',
        'lazy-chat-sync',
        'client-build-fence',
    ])
    assert.equal(resolveProfile('all', loadCatalog()).defaults.includes(manifest.id), true)
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
    assert.match(register.content, /terminalRetentionMs: 7 \* 24 \* 60 \* 60 \* 1000/)
    assert.match(
        manifest.units.find((unit) => unit.id === 'background-import:http-error-status:1.10').content,
        /err\.status >= 400 && err\.status < 500/,
    )
})

test('client hooks retain auth, token-scoped handoff, canonical rebase, and boot ordering', () => {
    const byId = new Map(manifest.units.map((unit) => [unit.id, unit]))
    assert.match(byId.get('background-import:node-fetch-bridge:1.10').content, /this\.authFetch/)
    assert.match(byId.get('background-import:auto-fetch-bridge:1.10').content, /await this\.Init\(\)/)
    const safe = byId.get('background-import:reporter-safe-runtime:1.10').content
    assert.match(safe, /active\?\.token !== token/)
    assert.match(safe, /detachNavigationGuard\(\)/)
    const preserve = byId.get('background-import:global-rebase-preserve:1.10').content
    assert.match(preserve, /preserveCommittedImport/)
    const reconcile = byId.get('background-import:global-reconcile-runtime:1.10').content
    assert.match(reconcile, /rebaseTrackedLocalChangesOnLatestServerDb/)
    assert.match(reconcile, /ensureChatHydrated/)
    assert.match(reconcile, /rejectOnError: true/)
    assert.match(reconcile, /requireCommittedImport\(lastConfirmedServerDb/)
    const boot = byId.get('background-import:bootstrap-recovery:1.10')
    assert.equal(boot.where, 'after')
    assert.equal(boot.anchor, '            saveDb()\n')
})

test('module and character entry hooks preserve child/package foreground paths and exact origins', () => {
    const byId = new Map(manifest.units.map((unit) => [unit.id, unit]))
    assert.match(byId.get('background-import:modules-runtime-owner:1.10').content, /runBackgroundImport/)
    assert.match(byId.get('background-import:modules-runtime-owner:1.10').content, /foreground-required/)
    const character = byId.get('background-import:character-dispatch:1.10').content
    assert.match(character, /!f\.progressReporter && !f\.returnCharacter && !f\.suppressImportJob/)
    assert.match(character, /f\.data instanceof Uint8Array \|\| f\.data instanceof Blob/)
    assert.match(byId.get('background-import:character-job-reuse:1.10').content, /existingJob/)
    assert.match(byId.get('background-import:app-character-drop-origin:1.10').content, /origin: 'drop'/)
    assert.match(byId.get('background-import:character-url-origin:1.10').content, /origin: 'url'/)
    assert.match(byId.get('background-import:character-share-origin:1.10').content, /origin: 'share'/)
    assert.match(byId.get('background-import:realm-charx-origin:1.10').content, /origin: 'realm'/)
    assert.match(byId.get('background-import:module-hash-consumer:1.10').content, /location\.hash = ''/)
    assert.match(byId.get('background-import:module-share-consumer:1.10').content, /location\.hash = ''/)
})

test('WebKit suspend transport failures are retryable without weakening protocol errors', () => {
    const client = fs.readFileSync(path.join(
        root,
        'patches/background-import/files-1.10/src/ts/storage/backgroundImportClient.ts',
    ), 'utf8')
    const runtime = fs.readFileSync(path.join(
        root,
        'patches/background-import/files-1.10/src/ts/storage/backgroundImportRuntime.ts',
    ), 'utf8')
    assert.match(client, /aborterror.*networkerror.*timeouterror/)
    assert.match(client, /load failed\|failed to fetch/)
    assert.match(client, /statusAfterTransport/)
    assert.match(runtime, /listWithRetry/)
    assert.match(runtime, /Waiting to resume import upload/)
})
