'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { loadCatalog } = require('../src/catalog.cjs')
const { resolveSelection } = require('../src/resolver.cjs')

describe('[C-2] Fence the start route with the legacy start on the build handshake', () => {
    it('fences POST start and wires legacy start through the build handshake without lazy storage', () => {
        const catalog = loadCatalog()
        const fence = catalog.find((pack) => pack.id === 'client-build-fence')
        const adapter = catalog.find((pack) => pack.id === 'client-build-fence-bg-adapter')
        const graph = resolveSelection(catalog, ['client-build-fence', 'bg-preserve'])
        assert.equal(graph.resolvedIds.includes('lazy-chat-sync'), false)
        assert.equal(graph.resolvedIds.includes('lazy-chat-bg-adapter'), false)
        assert.equal(graph.resolvedIds.includes('client-build-fence-bg-adapter'), true)
        const fenceText = fence.units.map((unit) => unit.content || unit.managed || '').join('\n')
        const adapterText = adapter.units.map((unit) => unit.content || unit.managed || '').join('\n')
        assert.equal(/['"]POST \/api\/bg-orchestrate['"]/.test(fenceText), true,
            'POST /api/bg-orchestrate must be a fenced writer route')
        assert.equal(/clientBuildFetch\('\/api\/bg-orchestrate'/.test(adapterText), true,
            'legacy start must use clientBuildFetch')
        assert.equal(/CLIENT_UPGRADE_REQUIRED/.test(adapterText), true,
            'legacy start must inspect the coded 426 response')
        assert.equal(/client-upgrade-required/.test(adapterText), true,
            'legacy start must record the definitive rejection reason')
    })

    it('orders the legacy fetch replacement after the optional session unit without requiring it', () => {
        const adapter = loadCatalog().find((pack) => pack.id === 'client-build-fence-bg-adapter')
        const unit = adapter.units.find((candidate) =>
            candidate.file === 'src/ts/bgOrchestrate.ts'
            && /clientBuildFetch\('\/api\/bg-orchestrate'/.test(candidate.content || ''))
        assert.ok(unit)
        assert.ok(unit.after.includes('lazy-chat-bg-adapter:session-gate:legacy-start:1.10'))
        assert.equal(unit.requires.includes('lazy-chat-bg-adapter:session-gate:legacy-start:1.10'), false)
        assert.ok(unit.requires.includes('client-build-fence-bg-adapter:orchestration-import:1.9'))
    })
})

describe('[C-3] Writer session on settings writes', () => {
    const adapters = [
        ['personal-settings-lazy-session-adapter', 'personal-settings'],
        ['client-build-fence-lazy-session-adapter', 'client-build-fence'],
    ]

    it('registers both internal adapters with the exact two-prerequisite activation matrix', () => {
        const catalog = loadCatalog()
        for (const [id, host] of adapters) {
            const pack = catalog.find((candidate) => candidate.id === id)
            assert.ok(pack, `${id} must be registered`)
            assert.equal(pack.userSelectable, false)
            assert.deepEqual(pack.requires, [host, 'lazy-chat-sync'])
            assert.deepEqual(pack.autoWhen, { all: [host, 'lazy-chat-sync'] })
            for (const selected of [[], [host], ['lazy-chat-sync']]) {
                assert.equal(resolveSelection(catalog, selected).resolvedIds.includes(id), false)
            }
            assert.equal(resolveSelection(catalog, [host, 'lazy-chat-sync']).resolvedIds.includes(id), true)
            assert.throws(() => resolveSelection(catalog, [id]), (error) => error.code === 'INTERNAL_PACK_REQUESTED')
        }
    })

    it('adds session headers and handles 423 before parsing on all three UI writes', () => {
        const catalog = loadCatalog()
        for (const [id] of adapters) {
            const pack = catalog.find((candidate) => candidate.id === id)
            assert.ok(pack, `${id} must be registered`)
            const text = pack.units.map((unit) => unit.content || unit.managed || '').join('\n')
            assert.match(text, /writerSessionHeaders\(\)/)
            assert.match(text, /notifySessionDeactivated\(/)
        }
        const combined = adapters.map(([id]) => catalog.find((pack) => pack.id === id).units)
            .flat().map((unit) => unit.content || unit.managed || '').join('\n')
        for (const route of ['/api/external-request-headers', '/api/db/snapshots/limits', '/api/backup/server/path']) {
            assert.match(combined, new RegExp(route.replaceAll('/', '\\/')))
        }
        assert.match(combined, /notifySessionDeactivated\([^)]*\)[\s\S]{0,200}return[\s\S]{0,200}\.json\(/)
    })
})

