'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { applyUnit, revertUnit } = require('../src/compose.cjs')
const { loadCatalog } = require('../src/catalog.cjs')
const { unitMatchesTarget } = require('../src/manager.cjs')

const patchRoot = path.join(__dirname, '../patches/character-import-ux')
const read = (relative) => fs.readFileSync(path.join(patchRoot, relative), 'utf8')
const state = read('files/src/ts/characterImportState.ts')
const toastComponent = read('files/src/lib/Others/CharacterImportToast.svelte')
const moduleImport = read('files-1.16/src/ts/process/moduleImport.ts')
const risumImport = read('files-1.10/src/ts/process/risumImport.ts')
const manifest = require('../patches/character-import-ux/manifest.cjs')
// PocketRisu 1.16.1 keeps the native characterCards.ts; the pack adds units on
// it. `source` is the text those units insert.
const characterCardsUnits = manifest.units.filter((unit) => unit.file === 'src/ts/characterCards.ts')
const unitText = (unit) => unit.content ?? unit.managed
const source = characterCardsUnits.map(unitText).join('\n')

test('character and module import share one lazy-chat-dependent feature pack', () => {
    assert.equal(manifest.id, 'character-import-ux')
    assert.equal(manifest.version, '0.2.2')
    assert.equal(manifest.title, 'Non-blocking character and module import')
    assert.deepEqual(manifest.targets, {
        pocketrisu: {
            verified: [],
            reviewing: ['1.16.1'],
        },
    })
    assert.equal(manifest.userSelectable, true)
    assert.equal(Object.hasOwn(manifest, 'presetDefaults'), false)
    assert.deepEqual(manifest.requires, ['lazy-chat-sync'])
    // The pack declares only PocketRisu 1.16.1, so no unit carries a target scope.
    assert.ok(manifest.units.every((unit) => !Object.hasOwn(unit, 'targetVersions')))
    assert.doesNotMatch(source, /setDatabaseLite\(\{ ?plugins|setDatabase\(\{ ?plugins/)
})

test('snapshot guard applies and reverts across PocketRisu 1.8 and 1.9 import lists', () => {
    const importUnit = manifest.units.find(
        (candidate) => candidate.id === 'character-import-ux:snapshot-guard-import',
    )
    const restoreUnit = manifest.units.find(
        (candidate) => candidate.id === 'character-import-ux:snapshot-restore-guard',
    )
    assert.ok(importUnit)
    assert.ok(restoreUnit)
    assert.equal(importUnit.anchor, "    import { language } from 'src/lang'\n")
    assert.match(importUnit.content, /allowDuringCharacterImport/)
    assert.doesNotMatch(importUnit.anchor, /SaveLocalBackup|SaveSettingsOnlyBackup/)

    const baselines = [
        `    import { language } from 'src/lang'
    import { LoadLocalBackup, SaveLocalBackup, SaveServerBackup } from 'src/ts/drive/backuplocal'

    async function restoreSnapshot(snap: Snapshot) {
`,
        `    import { language } from 'src/lang'
    import { LoadLocalBackup, SaveLocalBackup, SaveSettingsOnlyBackup, SaveServerBackup } from 'src/ts/drive/backuplocal'

    async function restoreSnapshot(snap: Snapshot) {
`,
    ]
    for (const baseline of baselines) {
        const withImport = applyUnit(baseline, importUnit)
        const applied = applyUnit(withImport, restoreUnit)
        assert.match(applied, /allowDuringCharacterImport\('Snapshot restore'\)/)
        assert.equal((applied.match(/allowDuringCharacterImport/g) ?? []).length, 2)
        assert.equal(
            revertUnit(revertUnit(applied, restoreUnit), importUnit),
            baseline,
        )
    }
})

test('ordinary imports use one reactive toast body and server-confirmed success', () => {
    assert.match(source, /beginCharacterImport/)
    assert.match(source, /runCharacterImportJob/)
    assert.match(source, /requestImportedCharacterSave\(character\.chaId\)/)
    assert.match(source, /job\.succeed\(language\.importedCharacter\)/)
    assert.match(
        source,
        /if \(imported\.length === 0\) \{\s*if \(outcome\.errorShown\) job\.fail\(outcome\.error\)\s*else job\.dismiss\(\)\s*return null/,
    )
    // Job-less calls keep the native per-step success notification.
    const notifications = source.match(/[^\n]*notifySuccess\(language\.importedCharacter\)/g) ?? []
    assert.equal(notifications.length, 3)
    for (const line of notifications) assert.match(line, /if\(!importJob\) notifySuccess/)
    assert.match(state, /toast\.custom\(CharacterImportToast/)
    assert.match(state, /reserveImport/)
    assert.match(state, /beginModuleImport/)
    assert.match(state, /active: \{ token: symbol; kind: ImportKind/)
    assert.match(state, /status\.set\(/)
    assert.doesNotMatch(state, /toast\.loading/)
    assert.match(state, /duration: Number\.POSITIVE_INFINITY/)
    assert.match(state, /beforeunload/)
    assert.match(toastComponent, /\$status\.message/)
    assert.match(toastComponent, /class:ci-loading=/)
    assert.ok(manifest.units.some(
        (unit) => unit.id === 'character-import-ux:toast'
            && unit.file === 'src/lib/Others/CharacterImportToast.svelte',
    ))
})

test('module imports have one staged parser, central commit, and confirmed persistence path', () => {
    assert.match(risumImport, /prepareRisuModule/)
    assert.match(risumImport, /materializeRisuModule/)
    assert.match(risumImport, /encodedAssets\.length !== \(module\.assets\?\.length \?\? 0\)/)
    assert.doesNotMatch(risumImport, /alertWait|alertClear|notifySuccess|db\.modules\.push/)
    assert.match(moduleImport, /createModuleImportOrchestrator/)
    assert.match(moduleImport, /modules\.push\(imported\)/)
    assert.match(moduleImport, /await deps\.persistModule\(imported\.id\)/)
    assert.match(moduleImport, /job\.succeed\(deps\.successMessage\)/)
    assert.match(moduleImport, /committed: boolean/)
    assert.match(moduleImport, /hydrateModule\?\(module: RisuModule\): Promise<RisuModule>/)
    assert.doesNotMatch(moduleImport, /input\.accept\s*=/)
    const terminal = manifest.units.find((unit) => unit.id === 'character-import-ux:modules-terminal-import')
    assert.ok(terminal)
    assert.match(terminal.anchor, /Object\.assign\(importData, await hydrateModuleAssets\(importData\)\)/)
    assert.match(terminal.managed, /hydrateModule: hydrateModuleAssets/)
    assert.match(terminal.managed, /await selectSingleFile\(\['json', 'lorebook', 'risum', 'charx'\]\)/)
})

test('share transport serves the cached module on GET and resolves relative cache URLs', () => {
    const getRoute = manifest.units.find((unit) => unit.id === 'character-import-ux:share-get-route')
    const cacheBase = manifest.units.find((unit) => unit.id === 'character-import-ux:share-cache-url-base')
    const cacheMiss = manifest.units.find((unit) => unit.id === 'character-import-ux:share-cache-miss')
    assert.match(getRoute.content, /event\.request\.method === 'GET'/)
    assert.match(getRoute.content, /getSource\(url\)/)
    assert.match(cacheBase.content, /self\.location\.origin/)
    assert.match(cacheMiss.content, /status: 404/)
})

test('asset progress stays in the same title with stable-width counters', () => {
    assert.match(source, /formatCharacterImportProgress/)
    assert.match(source, /'Saving character assets\.\.\.',\s*done,\s*total,/)
    assert.match(source, /'Saving character assets\.\.\.',\s*readedPngChunks \+ 1,/)
    assert.match(state, /String\(safeCurrent\)\.padStart\(width, '0'\)/)
    assert.ok(state.includes("'?'.repeat(width)"))
})

test('PNG import keeps the native pre-read and native first-chat ids', () => {
    // PocketRisu 1.16.1 counts asset chunks before reading and gives new
    // characters a first-chat id; no pack unit replaces either.
    for (const unit of characterCardsUnits) {
        assert.doesNotMatch(unit.anchor, /const prereader|pngChunks\+\+|id: v4\(\)/, unit.id)
        assert.doesNotMatch(unitText(unit), /id: uuidv4\(\)/, unit.id)
    }
})

test('package import retains its parent progress contract', () => {
    const unit = manifest.units.find(
        (candidate) => candidate.id === 'character-import-ux:package-keeps-parent-progress',
    )
    assert.ok(unit)
    assert.match(unit.content, /suppressImportJob: true/)
    assert.match(source, /if \(f\.returnCharacter \|\| f\.suppressImportJob\)/)
})

test('hub imports clear legacy modals and do not navigate after a refused import', () => {
    assert.match(
        source,
        /alertStore\.set\(\{ type: 'none', msg: '' \}\)\s*let failed = false\s*await importCharacterProcessWithError\(\{\s*name: 'charahub\.png'[\s\S]*?if \(failed\) return null/,
    )
    assert.match(
        source,
        /let imported: number \| null[\s\S]*if \(imported === null\) return\s*checkCharOrder\(\)/,
    )
})

test('only replacement, restart, and destructive storage actions are gated', () => {
    const guarded = manifest.units
        .filter((unit) => unit.id.endsWith('-guard') && typeof unit.content === 'string')
        .map((unit) => unit.content)
        .join('\n')
    assert.match(guarded, /Backup restore/)
    assert.match(guarded, /Save-folder import/)
    assert.match(guarded, /Snapshot restore/)
    assert.match(guarded, /Server backup restore/)
    assert.match(guarded, /Application update/)
    assert.doesNotMatch(guarded, /sendChat|settings|character edit/i)
})

test.describe('[E2-4e] Rebase character-import-ux onto PocketRisu 1.16.1', () => {
    const target = { packageName: 'pocketrisu', packageVersion: '1.16.1' }

    test('[new] e6 every unit id that other packs reference exists for 1.16.1', () => {
        // compose.cjs ignores before/after ids that are not in the plan, so a
        // successful assembly does not prove these references still resolve.
        const selected = new Set(
            manifest.units.filter((unit) => unitMatchesTarget(unit, target)).map((unit) => unit.id),
        )
        for (const id of [
            'character-import-ux:character-cards',
            'character-import-ux:charx-progress-callback',
            'character-import-ux:backup-guard-import',
            'character-import-ux:snapshot-guard-import',
            'character-import-ux:snapshot-restore-guard',
            'character-import-ux:server-backup-guard-import',
            'character-import-ux:server-backup-restore-guard',
        ]) {
            assert.ok(selected.has(id), id)
        }

        const references = []
        for (const pack of loadCatalog()) {
            if (pack.id === 'character-import-ux') continue
            for (const unit of pack.units) {
                for (const key of ['requires', 'before', 'after']) {
                    for (const id of unit[key] ?? []) {
                        if (id.startsWith('character-import-ux:')) references.push([pack.id, key, id])
                    }
                }
            }
        }
        assert.ok(references.length > 0)
        for (const [packId, key, id] of references) {
            assert.ok(selected.has(id), `${packId} ${key} ${id}`)
        }
    })

    test('[new] e6 character-cards follows the units it was split into', () => {
        const cardsUnit = manifest.units.find((unit) => unit.id === 'character-import-ux:character-cards')
        const split = characterCardsUnits
            .map((unit) => unit.id)
            .filter((id) => id.endsWith(':1.16'))
        assert.ok(split.length > 0)
        for (const id of split) assert.ok(cardsUnit.requires.includes(id), id)
        assert.deepEqual(cardsUnit.after, ['lazy-chat-sync:global-api-imported-save:1.16'])
    })

    test('[new] e1c the job outcome seam leaves the CharX receipt block and importer.assets untouched', () => {
        const charx = loadCatalog().find((pack) => pack.id === 'charx-archive-integrity')
        const receipt = charx.units.find((unit) => unit.id === 'charx-archive-integrity:character-terminal-receipt:1.10')
        assert.ok(receipt)
        for (const unit of characterCardsUnits.filter((candidate) => candidate.id.endsWith(':1.16'))) {
            assert.equal(receipt.anchor.includes(unit.anchor), false, unit.id)
            assert.equal(unit.anchor.includes('importer.assets'), false, unit.id)
            assert.equal(unitText(unit).includes('importer.assets'), false, unit.id)
        }
        // The seam is module-local: characterCards.ts renames the native import
        // and only its own alertError calls record the modal.
        assert.match(source, /alertError as showNativeAlertError/)
        assert.match(source, /function alertError\(msg: unknown\) \{[\s\S]*showNativeAlertError\(msg\)/)
    })
})
