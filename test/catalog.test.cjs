'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const baseline = require('./fixtures/target-baseline-1.10.0.json')
const unitBaseline = require('./fixtures/target-baseline-1.10.0-units.json')
const coverage = require('../patches/target-coverage.cjs')
const {
    loadCatalog,
    resolveProfile,
    validateProfileMetadata,
    validateProfileSelection,
    validateProfileTransition,
} = require('../src/catalog.cjs')
const { stableStringify, unitMatchesTarget } = require('../src/manager.cjs')
const { validateTargetCoverage } = require('../scripts/lib/target-coverage.cjs')

const e21cPackIds = [
    'charx-archive-integrity',
    'parser-hardening',
    'log-load-performance',
    'kei-prompt-role-compat-core',
    'kei-text-theme-normalization-core',
    'kei-fullscreen-image-viewer-core',
]

function rebasedPackIds() {
    return Object.entries(coverage)
        .filter(([, targets]) => Object.hasOwn(targets, '1.16.1'))
        .map(([packId]) => packId)
}

function declarationHash(pack) {
    return crypto.createHash('sha256')
        .update(stableStringify({ targets: pack.targets, units: pack.units }))
        .digest('hex')
}

function unitHash(unit) {
    const { targetVersions: _targetVersions, ...unscoped } = unit
    return crypto.createHash('sha256').update(stableStringify(unscoped)).digest('hex')
}

test.describe('[E2-1c] Make the six E2-1b packs 1.16.1-only', () => {
    test('[new] coverage-listed packs are 1.16.1-only and the six E2-1c packs retain their baseline unit order', () => {
        const catalog = loadCatalog()
        const byId = new Map(catalog.map((pack) => [pack.id, pack]))
        const rebased = rebasedPackIds()
        for (const packId of e21cPackIds) assert.equal(rebased.includes(packId), true, packId)

        for (const packId of rebased) {
            const pack = byId.get(packId)
            assert.ok(pack, packId)
            assert.deepEqual(pack.targets.pocketrisu, {
                verified: [],
                reviewing: ['1.16.1'],
            }, pack.id)
            assert.equal(pack.units.every((unit) => !Object.hasOwn(unit, 'targetVersions')), true, pack.id)
            const oldVersion = baseline.packs[pack.id].version.match(/^(.*\.)(\d+)$/)
            const newVersion = pack.version.match(/^(.*\.)(\d+)$/)
            assert.ok(oldVersion && newVersion, pack.id)
            assert.equal(newVersion[1], oldVersion[1], pack.id)
            assert.ok(Number(newVersion[2]) > Number(oldVersion[2]), pack.id)
        }

        const target = { packageName: 'pocketrisu', packageVersion: '1.16.1' }
        for (const packId of e21cPackIds) {
            const pack = byId.get(packId)
            assert.deepEqual(
                pack.units.filter((unit) => unitMatchesTarget(unit, target)).map(({ id }) => id),
                baseline.packs[packId].units110,
                packId,
            )
            assert.deepEqual(coverage[packId]['1.16.1'], {
                from: '1.10.0',
                retained: 'all',
                replaced: {},
                added: {},
                retired: {},
            }, packId)
        }
        assert.equal(Object.hasOwn(coverage['fastimport-ios-picker'] ?? {}, '1.16.1'), false)
    })

    test('[unchanged] packs without coverage entries match every frozen 1.10.0 declaration and unit hash', () => {
        const catalog = loadCatalog()
        assert.equal(catalog.length, 45)
        assert.deepEqual(Object.keys(baseline.packs).sort(), catalog.map(({ id }) => id).sort())
        const target = { packageName: 'pocketrisu', packageVersion: '1.10.0' }
        for (const pack of catalog) {
            if (rebasedPackIds().includes(pack.id)) continue
            const selected = pack.units.filter((unit) => unitMatchesTarget(unit, target))
            assert.deepEqual(
                selected.map(({ id }) => id),
                baseline.packs[pack.id].units110,
                pack.id,
            )
            assert.equal(pack.version, baseline.packs[pack.id].version, pack.id)
            assert.equal(declarationHash(pack), baseline.packs[pack.id].declarationHash, pack.id)
            for (const unit of selected) {
                assert.equal(unitHash(unit), unitBaseline.packs[pack.id]?.[unit.id], unit.id)
            }
        }
    })

    test('[unchanged] all coverage-listed packs validate against the frozen unit baseline', () => {
        const result = validateTargetCoverage({
            catalog: loadCatalog(),
            coverage,
            baseline,
            packIds: rebasedPackIds(),
            unitBaseline,
        })
        assert.deepEqual(result, { ok: true, violations: [] })
    })
})

test('one delivery profile contains every admitted root pack', () => {
    const catalog = loadCatalog()
    assert.deepEqual(catalog.map((pack) => pack.id), [
        'bg-preserve',
        'client-build-fence',
        'client-build-fence-bg-adapter',
        'client-build-fence-kei-adapter',
        'client-build-fence-kei-lazy-storage-adapter',
        'client-build-fence-lazy-session-adapter',
        'server-backup-snapshot-core',
        'server-backup-snapshot-lazy-adapter',
        'lazy-chat-sync',
        'lazy-chat-bg-adapter',
        'haejeok-persistence-safety-adapter',
        'persona-organizer',
        'character-organizer',
        'haejeok-korean-search-adapter',
        'character-import-ux',
        'personal-settings',
        'personal-settings-lazy-session-adapter',
        'haejeok-chat-width-adapter',
        'preset-integrity',
        'parser-hardening',
        'toolchain-hardening',
        'charx-archive-integrity',
        'log-load-performance',
        'usage-cost-estimate',
        'fastimport-ios-picker',
        'kei-stream-parser-core',
        'kei-stream-parser-bg-adapter',
        'kei-chat-render-core',
        'kei-chat-render-bg-adapter',
        'kei-mobile-navigation-core',
        'kei-mobile-navigation-lazy-adapter',
        'kei-hypa-tools-core',
        'kei-hypa-tools-bg-adapter',
        'kei-partial-edit-core',
        'kei-partial-edit-bg-adapter',
        'kei-translation-tools-core',
        'kei-translation-tools-bg-adapter',
        'kei-fullscreen-image-viewer-core',
        'kei-prompt-role-compat-core',
        'kei-text-theme-normalization-core',
        'kei-backup-restore-safety-core',
        'kei-backup-restore-safety-lazy-adapter',
        'pocketrisu-kei',
        'pagefold-model-preset',
        'pagefold-bg-adapter',
    ])
    assert.deepEqual(
        resolveProfile('all', catalog).defaults,
        [
            'bg-preserve',
            'client-build-fence',
            'lazy-chat-sync',
            'persona-organizer',
            'character-organizer',
            'character-import-ux',
            'personal-settings',
            'preset-integrity',
            'parser-hardening',
            'toolchain-hardening',
            'charx-archive-integrity',
            'log-load-performance',
            'usage-cost-estimate',
            'fastimport-ios-picker',
            'pocketrisu-kei',
            'pagefold-model-preset',
        ],
    )
    assert.doesNotThrow(
        () => validateProfileSelection(resolveProfile('all', catalog), [
            'bg-preserve',
            'lazy-chat-sync',
            'parser-hardening',
            'toolchain-hardening',
        ]),
    )
    assert.throws(
        () => validateProfileSelection(resolveProfile('all', catalog), ['lazy-chat-bg-adapter']),
        /cannot manage/,
    )
    assert.throws(() => resolveProfile('features', catalog), /Unknown profile/)
    assert.throws(() => resolveProfile('hardening', catalog), /Unknown profile/)
    const bgPack = catalog.find((pack) => pack.id === 'bg-preserve')
    assert.equal(
        bgPack.units.some((unit) => unit.file === 'src/ts/bgPreserveInstaller.test.ts'),
        false,
    )
})

test('all adopts retired and known custom states but refuses unknown owners', () => {
    const catalog = loadCatalog()
    assert.doesNotThrow(
        () => validateProfileTransition(resolveProfile('all', catalog), { profile: 'features' }),
    )
    assert.doesNotThrow(
        () => validateProfileTransition(resolveProfile('all', catalog), { profile: 'hardening' }),
    )
    assert.doesNotThrow(
        () => validateProfileTransition(resolveProfile('all', catalog), {
            profile: 'custom',
            packs: [
                { id: 'persona-organizer' },
                { id: 'lazy-chat-bg-adapter' },
            ],
        }, catalog),
    )
    assert.doesNotThrow(
        () => validateProfileTransition(resolveProfile('all', catalog), {
            profile: 'custom',
            packs: [
                { id: 'background-import' },
                { id: 'persona-organizer' },
            ],
        }, catalog),
    )
    assert.throws(
        () => validateProfileTransition(resolveProfile('all', catalog), {
            profile: 'custom',
            packs: [{ id: 'unknown-future-pack' }],
        }, catalog),
        /cannot take ownership/,
    )
})

test('all derives every admitted visible pack from the active catalog', () => {
    const catalog = [
        { id: 'existing', version: '1', units: [] },
        { id: 'future-pack', version: '1', units: [] },
        { id: 'reviewing-pack', version: '1', units: [] },
        { id: 'internal-adapter', version: '1', userSelectable: false, units: [] },
    ]
    assert.deepEqual(resolveProfile('all', catalog).defaults, [
        'existing',
        'future-pack',
        'reviewing-pack',
    ])
})

test('PocketRisu Kei remains admitted while background import is retired', () => {
    const catalog = loadCatalog()
    assert.equal(resolveProfile('all', catalog).defaults.includes('pocketrisu-kei'), true)
    const pack = catalog.find((entry) => entry.id === 'background-import')
    assert.equal(pack, undefined)
    assert.equal(resolveProfile('all', catalog).defaults.includes('background-import'), false)
})

test('retired preset metadata fails at the catalog boundary', () => {
    assert.throws(
        () => validateProfileMetadata([{
            id: 'retired-default',
            presetDefaults: ['features'],
        }]),
        /obsolete in all-or-nothing delivery/,
    )
})
