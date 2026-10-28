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

        assert.equal(catalog.length, 43, 'catalog should contain two fewer packs')
        assert.equal(all.defaults.length, 14, 'all should contain two fewer packs')
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
