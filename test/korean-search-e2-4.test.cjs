'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const baseline = require('./fixtures/target-baseline-1.10.0.json')
const unitBaseline = require('./fixtures/target-baseline-1.10.0-units.json')
const coverage = require('../patches/target-coverage.cjs')
const { loadCatalog, resolveProfile, validateProfileTransition } = require('../src/catalog.cjs')
const { stableStringify } = require('../src/manager.cjs')
const { validateTargetCoverage } = require('../scripts/lib/target-coverage.cjs')

const PACK_ID = 'haejeok-korean-search-adapter'
const ORGANIZER_ID = 'character-organizer'

function declarationHash(pack) {
    return crypto.createHash('sha256')
        .update(stableStringify({ targets: pack.targets, units: pack.units }))
        .digest('hex')
}

test.describe('[E2-4b] Rebuild Korean search on the native character manager and retire character-organizer', () => {
    test('[new] C0 declares the standalone search pack only for reviewing PocketRisu 1.16.1 with complete coverage', () => {
        const catalog = loadCatalog()
        const pack = catalog.find(({ id }) => id === PACK_ID)
        assert.ok(pack, 'Korean search pack remains in the catalog')
        assert.deepEqual(pack.targets.pocketrisu, { verified: [], reviewing: ['1.16.1'] })
        assert.equal(pack.userSelectable, true)
        assert.deepEqual(pack.requires ?? [], [])
        assert.deepEqual(pack.autoWhen ?? {}, {})
        assert.equal(pack.units.every((unit) => !Object.hasOwn(unit, 'targetVersions')), true)
        assert.ok(coverage[PACK_ID]?.['1.16.1'], 'Korean search has a 1.16.1 coverage entry')
        assert.deepEqual(validateTargetCoverage({
            catalog,
            coverage,
            baseline,
            unitBaseline,
            packIds: [PACK_ID],
        }), { ok: true, violations: [] })
    })

    test('[new] b1-b4 declarations add optional metadata and route both native manager lists through the unified matcher', () => {
        const catalog = loadCatalog()
        const pack = catalog.find(({ id }) => id === PACK_ID)
        assert.ok(pack, 'Korean search pack remains in the catalog')
        const skip = new Set(['id', 'file', 'type', 'where', 'anchor', 'from', 'find', 'before', 'after', 'requires'])
        const collect = (value, out) => {
            if (typeof value === 'string') out.push(value)
            else if (Array.isArray(value)) value.forEach((item) => collect(item, out))
            else if (value && typeof value === 'object') {
                for (const [key, item] of Object.entries(value)) if (!skip.has(key)) collect(item, out)
            }
            return out
        }
        const textFor = (file) => pack.units
            .filter((unit) => unit.file === file)
            .map((unit) => collect(unit, []).join('\n'))
            .join('\n')
        const manager = textFor('src/ts/characterManager.ts')
        const component = textFor('src/lib/CharacterManager/CharacterManager.svelte')
        assert.notEqual(manager, '', 'pack declares units on the native character-manager module')
        assert.notEqual(component, '', 'pack declares units on the native manager component')

        assert.match(manager, /creator\?\s*:\s*string/)
        assert.match(manager, /tags\?\s*:\s*string\[\]/)
        assert.match(manager, /export\s+function\s+matchesCharacterSearch\s*\(/)
        assert.match(component, /import\s*\{[^}]*matchesCharacterSearch[^}]*\}\s*from\s*["']src\/ts\/characterManager["']/)
        assert.equal(
            (component.match(/matchesCharacterSearch\s*\(\s*e\s*,\s*search\s*\)/g) ?? []).length,
            2,
            'live/grid visibility and trash filtering both use the entry-aware matcher',
        )
    })

    test('[new] b5 removes organizer from catalog and all while adopting its saved custom state', () => {
        const catalog = loadCatalog()
        assert.equal(catalog.some(({ id }) => id === ORGANIZER_ID), false)
        const all = resolveProfile('all', catalog)
        assert.equal(all.allowed.includes(ORGANIZER_ID), false)
        assert.equal(all.defaults.includes(ORGANIZER_ID), false)
        assert.doesNotThrow(() => validateProfileTransition(all, {
            profile: 'custom',
            packs: [{ id: ORGANIZER_ID }, { id: PACK_ID }],
        }, catalog))
    })

    test('[unchanged] b5 retains the organizer files required by the unchanged BG adapter manifest', () => {
        const organizerManifestPath = require.resolve('../patches/character-organizer/manifest.cjs')
        assert.equal(fs.existsSync(organizerManifestPath), true)
        assert.doesNotThrow(() => require(organizerManifestPath))
        assert.doesNotThrow(() => require('../patches/lazy-chat-bg-adapter/manifest.cjs'))
    })

    test('[unchanged] C2 keeps the unrebased organizer declaration at its frozen hash', () => {
        const organizer = require('../patches/character-organizer/manifest.cjs')
        assert.equal(organizer.version, baseline.packs[ORGANIZER_ID].version)
        assert.equal(declarationHash(organizer), baseline.packs[ORGANIZER_ID].declarationHash)
    })
})
