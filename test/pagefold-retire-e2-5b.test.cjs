'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
    loadCatalog,
    resolveProfile,
    validateProfileTransition,
} = require('../src/catalog.cjs')

const ROOT = path.resolve(__dirname, '..')
const RETIRED = ['pagefold-model-preset', 'pagefold-bg-adapter']

test.describe('[E2-5b] Retire the PageFold packs', () => {
    test('[new] b1/B1 catalog and all omit both PageFold packs and the BG pack artifacts are gone', () => {
        const catalog = loadCatalog()
        const profile = resolveProfile('all', catalog)
        for (const id of RETIRED) {
            assert.equal(catalog.some((pack) => pack.id === id), false, `${id} remains in catalog`)
            assert.equal(profile.defaults.includes(id), false, `${id} remains in all defaults`)
            assert.equal(profile.allowed.includes(id), false, `${id} remains in all allowed`)
        }
        assert.equal(fs.existsSync(path.join(ROOT, 'patches/pagefold-bg-adapter')), false)
        assert.equal(fs.existsSync(path.join(ROOT, 'test/pagefold-bg-adapter.test.cjs')), false)
    })

    test('[new] b2/B2 all adopts a custom state whose missing owners are the two retired PageFold ids', () => {
        const catalog = loadCatalog().filter((pack) => !RETIRED.includes(pack.id))
        const profile = resolveProfile('all', catalog)
        assert.doesNotThrow(() => validateProfileTransition(profile, {
            profile: 'custom',
            packs: [
                { id: 'usage-cost-estimate' },
                { id: 'pagefold-model-preset' },
                { id: 'pagefold-bg-adapter' },
            ],
        }, catalog))
    })

    test('[unchanged] B3 all still refuses a custom state with an unknown unretired owner', () => {
        const catalog = loadCatalog().filter((pack) => !RETIRED.includes(pack.id))
        const profile = resolveProfile('all', catalog)
        assert.throws(() => validateProfileTransition(profile, {
            profile: 'custom',
            packs: [
                { id: 'pagefold-model-preset' },
                { id: 'non-existent-pack-xyz' },
            ],
        }, catalog), /cannot take ownership/)
    })

    test('[new] b3/B4 the catalog loads usage-cost-estimate without retired PageFold packs', () => {
        const catalog = loadCatalog()
        assert.ok(catalog.find((pack) => pack.id === 'usage-cost-estimate'))
        assert.equal(catalog.some((pack) => RETIRED.includes(pack.id)), false,
            'E2-5b catalog still exposes a retired PageFold pack')
    })
})
