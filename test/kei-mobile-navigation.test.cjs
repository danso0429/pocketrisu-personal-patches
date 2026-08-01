'use strict'

const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const core = require('../patches/kei-mobile-navigation-core/manifest.cjs')
const base = require('../patches/kei-mobile-navigation-base-adapter/manifest.cjs')
const lazy = require('../patches/kei-mobile-navigation-lazy-adapter/manifest.cjs')
const { loadCatalog } = require('../src/catalog.cjs')
const { packEtag } = require('../src/manager.cjs')
const { resolveSelection } = require('../src/resolver.cjs')

const patchRoot = path.join(
    __dirname,
    '../patches/kei-mobile-navigation-core',
)
const source = (relative) =>
    fs.readFileSync(path.join(patchRoot, relative), 'utf8')
const unitText = (unit) => unit.managed ?? unit.content ?? ''

test('K16 keeps its core and base/lazy adapters internal', () => {
    assert.equal(core.id, 'kei-mobile-navigation-core')
    assert.equal(base.id, 'kei-mobile-navigation-base-adapter')
    assert.equal(lazy.id, 'kei-mobile-navigation-lazy-adapter')
    assert.equal(core.userSelectable, false)
    assert.equal(base.userSelectable, false)
    assert.equal(lazy.userSelectable, false)
    assert.deepEqual(base.autoWhen, {
        all: ['kei-mobile-navigation-core'],
        none: ['lazy-chat-sync'],
    })
    assert.deepEqual(lazy.autoWhen, {
        all: ['kei-mobile-navigation-core', 'lazy-chat-sync'],
    })
    assert.deepEqual(base.conflicts, [
        'lazy-chat-sync',
        'kei-mobile-navigation-lazy-adapter',
    ])
    assert.deepEqual(lazy.conflicts, [
        'kei-mobile-navigation-base-adapter',
    ])
})

test('K16 selects exactly one bootstrap adapter for each storage graph', () => {
    const catalog = loadCatalog()
    const absent = resolveSelection(catalog, ['lazy-chat-sync'])
    assert.equal(absent.resolvedIds.includes(core.id), false)
    assert.equal(absent.resolvedIds.includes(base.id), false)
    assert.equal(absent.resolvedIds.includes(lazy.id), false)

    const standalone = resolveSelection(catalog, ['pocketrisu-kei'])
    assert.equal(standalone.resolvedIds.includes(base.id), true)
    assert.equal(standalone.resolvedIds.includes(lazy.id), false)

    const startup = resolveSelection(
        catalog,
        ['pocketrisu-kei', 'startup-cache'],
    )
    assert.equal(startup.resolvedIds.includes(base.id), true)
    assert.equal(startup.resolvedIds.includes(lazy.id), false)

    const composed = resolveSelection(
        catalog,
        ['pocketrisu-kei', 'lazy-chat-sync'],
    )
    assert.equal(composed.resolvedIds.includes(base.id), false)
    assert.equal(composed.resolvedIds.includes(lazy.id), true)
})

test('K16 owns four isolated files and hooks only focused navigation hosts', () => {
    assert.deepEqual(core.units.map((unit) => unit.file), [
        'src/ts/keiMobileNavigation.ts',
        'src/ts/keiMobileNavigation.test.ts',
        'src/ts/mobileBackNavigation.ts',
        'src/ts/mobileBackNavigation.test.ts',
    ])
    const expectedHosts = [
        'src/lang/en.ts',
        'src/lang/help.en.ts',
        'src/lang/help.ko.ts',
        'src/lang/ko.ts',
        'src/lib/Setting/Pages/HotkeySettings.svelte',
        'src/lib/UI/GUI/TextAreaInput.svelte',
        'src/main.ts',
        'src/ts/bootstrap.ts',
        'src/ts/hotkey.ts',
        'src/ts/setting/accessibilitySettingsData.ts',
        'src/ts/storage/database.svelte.ts',
    ]
    for (const adapter of [base, lazy]) {
        assert.deepEqual(
            [...new Set(adapter.units.map((unit) => unit.file))].sort(),
            expectedHosts,
        )
        const managed = adapter.units.map(unitText).join('\n')
        assert.doesNotMatch(
            managed,
            /setDatabase|saveDb|forageStorage|localStorage|WebSocket|fetch\(/,
        )
        assert.doesNotMatch(
            managed,
            /routing\.ts|DefaultChatScreen|result.?claim|acknowledge/i,
        )
    }
})

test('K16 core keeps matching, boundaries, and gestures deterministic', () => {
    const navigation = source('files/src/ts/keiMobileNavigation.ts')
    const tests = source('files/src/ts/keiMobileNavigation.test.ts')
    assert.doesNotMatch(navigation, /^import /m)
    assert.doesNotMatch(navigation, /database|storage|selectedCharID|window\./i)
    assert.match(navigation, /const ctrl = hotkey\.ctrl \?\? false/)
    assert.match(navigation, /if \(event\.metaKey\) return false/)
    assert.doesNotMatch(navigation, /hotkey\.(ctrl|alt|shift)\s*=/)
    assert.match(navigation, /currentIndex < 0/)
    assert.match(navigation, /nextIndex >= sorted\.length/)
    assert.match(navigation, /!character\.trashTime/)
    assert.match(navigation, /character\.chaId !== '§temp'/)
    assert.match(navigation, /character\.chaId !== '§playground'/)
    assert.match(navigation, /legacyAlertType !== 'none'/)
    assert.match(navigation, /hasOpenDialog/)
    assert.match(navigation, /Math\.abs\(moveX\) <= threshold/)
    assert.match(navigation, /export function getBoundedNavigationIndex/)
    assert.match(tests, /without mutating the saved hotkey/)
    assert.match(tests, /stops at both boundaries/)
    assert.match(tests, /skips trashed and reserved characters/)
    assert.match(tests, /ignores native, editable, link, role, and draggable/)
    assert.match(tests, /legacy alerts or document dialogs are open/)
    assert.match(tests, /steps only through declared mobile navigation ranges/)
    assert.match(tests, /rejects short, vertical, and exactly diagonal/)
})

test('K16 guard waits for activation and removes only its history entry', () => {
    const mobileBack = source('files/src/ts/mobileBackNavigation.ts')
    const mobileBackTests = source(
        'files/src/ts/mobileBackNavigation.test.ts',
    )
    assert.match(mobileBack, /navigator\.userActivation\?\.hasBeenActive/)
    assert.match(mobileBack, /browserHistory\.pushState/)
    assert.match(mobileBack, /cleanupPending = true/)
    assert.match(mobileBack, /if \(!armFailureReported\)/)
    assert.match(mobileBack, /browserHistory\.back\(\)/)
    assert.match(mobileBack, /beforeunload/)
    assert.match(
        mobileBack,
        /if \(!mobileBackNavigationGuard && !shouldEnable\) return/,
    )
    assert.match(mobileBackTests, /waits for user activation/)
    assert.match(mobileBackTests, /removes its guard when disabled/)
    assert.match(mobileBackTests, /one attempt per enable cycle/)
    assert.doesNotMatch(mobileBack, /location\.(assign|replace)|history\.go/)
})

test('K16 adapters preserve existing hotkeys and harden pointer cleanup', () => {
    for (const adapter of [base, lazy]) {
        const managed = adapter.units.map(unitText).join('\n')
        assert.match(managed, /data\.enableHotkeys \?\?= true/)
        assert.match(
            managed,
            /data\.disableMobileBackNavigation \?\?= false/,
        )
        assert.match(managed, /openModelPresetList/)
        assert.equal(
            (
                managed.match(
                    /DBState\.db\.enableHotkeys !== false/g,
                ) ?? []
            ).length,
            2,
        )
        assert.match(managed, /shouldIgnoreNavigationPointer\(/)
        assert.match(managed, /get\(alertStore\)\.type/)
        assert.match(managed, /pressingPointers\.clear\(\)/)
        assert.match(managed, /let mobileGestureInitialized = false/)
        assert.match(managed, /if\(mobileGestureInitialized\) return/)
        assert.match(managed, /pointercancel/)
        assert.match(managed, /if\(!start\) return/)
        assert.match(managed, /export \{ hotkeyMatches \}/)
        assert.doesNotMatch(managed, /toggleVoice.*remove|webcam.*remove/)
    }
})

test('K16 bootstrap ordering follows startup-cache or lazy replacement', () => {
    const baseBootstrap = base.units.filter((unit) =>
        unit.file === 'src/ts/bootstrap.ts',
    )
    const lazyBootstrap = lazy.units.filter((unit) =>
        unit.file === 'src/ts/bootstrap.ts',
    )
    assert.equal(baseBootstrap.length, 2)
    assert.equal(lazyBootstrap.length, 2)
    for (const unit of baseBootstrap) {
        assert.deepEqual(unit.after, ['startup-cache:bootstrap'])
    }
    for (const unit of lazyBootstrap) {
        assert.deepEqual(unit.after, [
            'lazy-chat-sync:replace:src:ts:bootstrap-ts',
            'lazy-chat-sync:replace:src:ts:bootstrap-ts:1.9',
        ])
    }
})

test('K16 adapter payloads participate in ETags and retain attribution', () => {
    for (const adapter of [base, lazy]) {
        const original = packEtag(adapter)
        const changed = {
            ...adapter,
            units: adapter.units.map((unit, index) => index === 5
                ? { ...unit, managed: `${unit.managed}\n// changed` }
                : unit),
        }
        assert.notEqual(packEtag(changed), original)
        assert.equal(packEtag(adapter), original)
    }

    const notices = fs.readFileSync(
        path.join(__dirname, '../THIRD_PARTY_NOTICES.md'),
        'utf8',
    )
    assert.match(notices, /cc1d1b195babd887577ebf943d5e82f01f58135c/)
    assert.match(notices, /navigation\/hotkey behavior/)
    assert.match(notices, /pending local writes/)
})
