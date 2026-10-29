'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const {
    loadCatalog,
    resolveProfile,
    validateProfileTransition,
} = require('../src/catalog.cjs')

const retiredIds = [
    'toolchain-hardening',
    'fastimport-ios-picker',
]

test.describe('[E2-4a] Retire toolchain-hardening and fastimport-ios-picker', () => {
    test('[new] catalog and all profile omit both retired packs and shrink by two', () => {
        const catalog = loadCatalog()
        const all = resolveProfile('all', catalog)

        // E2-4b retires character-organizer as well (43 -> 42), and E2-5b
        // retires pagefold-model-preset and pagefold-bg-adapter (42 -> 40; the
        // user-selectable pagefold-model-preset leaves `all`, 14 -> 13).
        assert.equal(catalog.length, 40, 'catalog should contain two fewer packs')
        assert.equal(all.defaults.length, 13, 'all should contain two fewer packs')
        for (const id of retiredIds) {
            assert.equal(catalog.some((pack) => pack.id === id), false, `${id} catalog entry`)
            assert.equal(all.defaults.includes(id), false, `${id} all-profile entry`)
        }
    })

    test('[new] all adopts custom state owned by both retired packs', () => {
        const catalog = loadCatalog().filter((pack) => !retiredIds.includes(pack.id))
        const all = resolveProfile('all', catalog)
        const previousState = {
            profile: 'custom',
            packs: [
                { id: 'persona-organizer' },
                { id: 'toolchain-hardening' },
                { id: 'fastimport-ios-picker' },
            ],
        }

        assert.doesNotThrow(
            () => validateProfileTransition(all, previousState, catalog),
            'both retired owner IDs should be adoptable',
        )
    })

    test('[unchanged] an unknown owner still blocks adoption alongside a retired pack', () => {
        const catalog = loadCatalog()
        const all = resolveProfile('all', catalog)
        const previousState = {
            profile: 'custom',
            packs: [
                { id: 'toolchain-hardening' },
                { id: 'rogue-pack-99' },
            ],
        }

        assert.throws(
            () => validateProfileTransition(all, previousState, catalog),
            /cannot take ownership/,
        )
    })
})
