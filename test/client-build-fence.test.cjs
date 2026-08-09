'use strict'

const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const core = require('../patches/client-build-fence/manifest.cjs')
const bg = require('../patches/client-build-fence-bg-adapter/manifest.cjs')
const standard = require('../patches/client-build-fence-standard-adapter/manifest.cjs')
const kei = require('../patches/client-build-fence-kei-adapter/manifest.cjs')
const keiStandard = require('../patches/client-build-fence-kei-standard-storage-adapter/manifest.cjs')
const keiLazy = require('../patches/client-build-fence-kei-lazy-storage-adapter/manifest.cjs')
const serverFence = require('../patches/client-build-fence/files/server/node/clientBuildFence.cjs')
const { loadCatalog } = require('../src/catalog.cjs')
const { packEtag, unitMatchesTarget } = require('../src/manager.cjs')
const { resolveSelection } = require('../src/resolver.cjs')

const target181 = { packageName: 'pocketrisu', packageVersion: '1.8.1' }
const target190 = { packageName: 'pocketrisu', packageVersion: '1.9.0' }
const unitText = (manifest) => manifest.units.map((unit) => unit.managed ?? unit.content ?? '').join('\n')

test('client build fence resolves exactly one storage adapter and the optional BG bridge', () => {
    const catalog = loadCatalog()
    const standalone = resolveSelection(catalog, [core.id])
    assert.equal(standalone.resolvedIds.includes(standard.id), true)
    assert.equal(standalone.resolvedIds.includes(bg.id), false)
    assert.equal(standalone.resolvedIds.includes(kei.id), false)

    const bgGraph = resolveSelection(catalog, [core.id, 'bg-preserve'])
    assert.equal(bgGraph.resolvedIds.includes(bg.id), true)
    assert.equal(bgGraph.resolvedIds.includes(standard.id), true)

    const keiGraph = resolveSelection(catalog, [core.id, 'pocketrisu-kei'])
    assert.equal(keiGraph.resolvedIds.includes(kei.id), true)
    assert.equal(keiGraph.resolvedIds.includes(keiStandard.id), true)
    assert.equal(keiGraph.resolvedIds.includes(keiLazy.id), false)
    assert.equal(keiGraph.resolvedIds.includes(standard.id), false)

    const allGraph = resolveSelection(catalog, [
        core.id,
        'bg-preserve',
        'lazy-chat-sync',
        'pocketrisu-kei',
    ])
    assert.equal(allGraph.resolvedIds.includes(bg.id), true)
    assert.equal(allGraph.resolvedIds.includes(kei.id), true)
    assert.equal(allGraph.resolvedIds.includes(keiStandard.id), false)
    assert.equal(allGraph.resolvedIds.includes(keiLazy.id), true)

    for (const hidden of [bg, standard, kei, keiStandard, keiLazy]) {
        assert.throws(
            () => resolveSelection(catalog, [hidden.id]),
            (error) => error.code === 'INTERNAL_PACK_REQUESTED',
        )
    }
})

test('client build fence is exact-1.9 and its adapters declare their owners', () => {
    for (const manifest of [core, bg, standard, kei, keiStandard, keiLazy]) {
        assert.deepEqual(
            manifest.units.filter((unit) => unitMatchesTarget(unit, target181)),
            [],
        )
        assert.ok(manifest.units.some((unit) => unitMatchesTarget(unit, target190)))
    }
    assert.deepEqual(bg.requires, [core.id, 'bg-preserve'])
    assert.deepEqual(standard.requires, [core.id])
    assert.deepEqual(kei.requires, [core.id, 'kei-backup-restore-safety-core'])
    assert.deepEqual(keiStandard.requires, [core.id, 'kei-backup-restore-safety-standard-adapter'])
    assert.deepEqual(keiLazy.requires, [core.id, 'kei-backup-restore-safety-lazy-adapter'])
})

test('server fence covers storage and destructive recovery transitions but not reads or job creation', () => {
    const writer = (method, requestPath) => serverFence.isWriterRoute({ method, path: requestPath })
    assert.equal(writer('POST', '/api/write'), true)
    assert.equal(writer('HEAD', '/API/REMOVE/'), true)
    assert.equal(writer('POST', '/api/chat-content/a/b/patch/'), true)
    assert.equal(writer('POST', '/api/model-jobs/job/claim'), true)
    assert.equal(writer('DELETE', '/api/pending-sends/chat'), true)
    assert.equal(writer('POST', '/api/bg-sub-result/job/ack'), true)
    assert.equal(writer('POST', '/api/bg-stream-draft/delete'), true)
    assert.equal(writer('DELETE', '/proxy-stream-jobs/job'), true)
    assert.equal(writer('DELETE', '/api/bg-orchestrate-result/op/result'), true)
    assert.equal(writer('GET', '/api/read'), false)
    assert.equal(writer('POST', '/api/db/flush'), false)
    assert.equal(writer('POST', '/api/model-jobs'), false)
    assert.equal(writer('POST', '/proxy2'), false)
})

test('server fence validates header-safe artifacts, warns when disabled, and advertises the build', () => {
    const serverText = fs.readFileSync(path.join(
        __dirname,
        '../patches/client-build-fence/files/server/node/clientBuildFence.cjs',
    ), 'utf8')
    const combined = unitText(core)
    assert.match(serverText, /SAFE_BUILD_TOKEN = \/\^\[A-Za-z0-9\._-\]\{1,128\}\$\//)
    assert.match(serverText, /logger\?\.warn\?\./)
    assert.match(combined, /build: clientBuildFence\.expectedBuild \?\? undefined/)
})

test('client recovery tracks every unsafe owner and freezes document-level mutation surfaces', () => {
    const handshake = fs.readFileSync(path.join(
        __dirname,
        '../patches/client-build-fence/files/src/ts/storage/clientBuildHandshake.ts',
    ), 'utf8')
    const combined = unitText(core)
    assert.match(handshake, /databaseDirtyProbe\(\)/)
    assert.match(handshake, /composerDirty \|\| draftUnsafe \|\| generationActive/)
    assert.match(handshake, /handleAdvertisedClientBuild[\s\S]*handleClientUpgradeRequired\(expectedBuild\)/)
    assert.match(combined, /handleAdvertisedClientBuild\(body\?\.build\)/)
    assert.match(handshake, /pointerdown.*pointerup.*mousedown.*mouseup.*touchstart.*touchend.*click/s)
    assert.match(handshake, /compositionstart.*compositionupdate.*compositionend/s)
    assert.match(handshake, /addEventListener\('keydown'.*addEventListener\('keypress'.*addEventListener\('keyup'/s)
    assert.match(handshake, /freezeEditableTree\(document\.body\)/)
    assert.match(handshake, /getAttribute\('contenteditable'\) !== 'false'/)
    assert.match(handshake, /composerRecoveryText/)
    assert.doesNotMatch(handshake, /querySelectorAll\([\s\S]*input\[type="email"\]/)
    assert.match(combined, /failedDraftRecovery\.set\(key, recoveryText\)/)
    assert.match(combined, /failedDraftRecovery\.delete\(key\)/)
    assert.match(combined, /enqueue\(key, \(\) => persistSave[\s\S]*formatDraftRecovery\(draft\)/)
    assert.match(combined, /setClientBuildGenerationActive\(states\.size > 0\)/)
})

test('destructive native and BG recovery calls carry the same build stamp as storage writes', () => {
    const coreText = unitText(core)
    const bgText = unitText(bg)
    assert.match(coreText, /clientBuildFetch\(`\/api\/model-jobs\/\$\{jobId\}\/claim`/)
    assert.match(coreText, /clientBuildFetch\(`\/api\/pending-sends\/\$\{encodeURIComponent\(chatId\)\}\/claim`/)
    assert.equal((coreText.match(/clientBuildFetch\(`\/proxy-stream-jobs\//g) ?? []).length, 2)
    assert.match(bgText, /clientBuildFetch\(`\/api\/bg-sub-result\/\$\{encodeURIComponent\(jobId\)\}\/ack`/)
    assert.match(bgText, /clientBuildFetch\(`\/proxy-stream-jobs\/\$\{encodeURIComponent\(jobId\)\}`/)
    assert.match(bgText, /clientBuildFetch\(SERVER_PATH \+ '\/delete'/)
    assert.match(bgText, /return await clientBuildFetch\(url/)
})

test('build artifact, middleware order, and every manifest payload affect the pack ETags', () => {
    const combined = unitText(core)
    assert.match(combined, /randomBytes\(32\)\.toString\('hex'\)/)
    assert.match(combined, /fileName: 'build-stamp\.json'/)
    const middleware = core.units.find((unit) => unit.id === 'client-build-fence:server-middleware:1.9')
    assert.equal(middleware.where, 'after')
    assert.match(middleware.anchor, /express\.static/)
    assert.match(middleware.content, /app\.use\(clientBuildFence\.middleware\)/)

    for (const manifest of [core, bg, standard, kei, keiStandard, keiLazy]) {
        const original = packEtag(manifest)
        const mutated = {
            ...manifest,
            units: manifest.units.map((unit, index) => index === 0
                ? { ...unit, content: `${unit.content ?? unit.managed ?? ''}\n` }
                : unit),
        }
        assert.notEqual(packEtag(mutated), original)
        assert.equal(packEtag(manifest), original)
    }
})
