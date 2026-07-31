'use strict'

const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const core = require('../patches/kei-stream-parser-core/manifest.cjs')
const base = require('../patches/kei-stream-parser-base-adapter/manifest.cjs')
const bg = require('../patches/kei-stream-parser-bg-adapter/manifest.cjs')
const { loadCatalog } = require('../src/catalog.cjs')
const { packEtag } = require('../src/manager.cjs')
const { resolveSelection } = require('../src/resolver.cjs')

const patchRoot = path.join(__dirname, '../patches/kei-stream-parser-core')
const source = (relative) => fs.readFileSync(path.join(patchRoot, relative), 'utf8')
const unitText = (unit) => unit.managed ?? unit.content ?? ''

test('K13 keeps the pure core and graph-specific adapters internal', () => {
    assert.equal(core.id, 'kei-stream-parser-core')
    assert.equal(base.id, 'kei-stream-parser-base-adapter')
    assert.equal(bg.id, 'kei-stream-parser-bg-adapter')
    assert.equal(core.userSelectable, false)
    assert.equal(base.userSelectable, false)
    assert.equal(bg.userSelectable, false)
    assert.deepEqual(base.autoWhen, {
        all: ['kei-stream-parser-core'],
        none: ['bg-preserve'],
    })
    assert.deepEqual(bg.autoWhen, {
        all: ['kei-stream-parser-core', 'bg-preserve'],
    })
    assert.deepEqual(base.conflicts, [
        'bg-preserve',
        'kei-stream-parser-bg-adapter',
    ])
    assert.deepEqual(bg.conflicts, ['kei-stream-parser-base-adapter'])
})

test('K13 owns only its parser/tests and two focused request hosts', () => {
    assert.deepEqual(core.units.map((unit) => unit.file).sort(), [
        'src/ts/process/request/google.stream.test.ts',
        'src/ts/process/request/keiSseStream.test.ts',
        'src/ts/process/request/keiSseStream.ts',
        'src/ts/process/request/openAI/requests.stream.test.ts',
    ])
    for (const adapter of [base, bg]) {
        assert.deepEqual(
            [...new Set(adapter.units.map((unit) => unit.file))].sort(),
            [
                'src/ts/process/request/google.ts',
                'src/ts/process/request/openAI/requests.ts',
            ],
        )
        const managed = adapter.units.map(unitText).join('\n')
        assert.doesNotMatch(managed, /fetchNative|abortSignal|bgSubKey|pipeTo/)
        assert.doesNotMatch(managed, /googleGemini|proxyJobWs|request\.ts/)
    }
})

test('K13 core framing has no provider, database, storage, or side-effect imports', () => {
    const runtime = source('files/src/ts/process/request/keiSseStream.ts')
    assert.doesNotMatch(runtime, /^import /m)
    assert.doesNotMatch(
        runtime,
        /openai|gemini|database|storage|fetch|signature|tool.?call/i,
    )
    assert.match(runtime, /decode\(chunk, \{ stream: true \}\)/)
    assert.match(runtime, /Replaying the same byte chunks/)
})

test('K13 selects exactly one adapter and stays absent without its core', () => {
    const catalog = loadCatalog()
    const absent = resolveSelection(catalog, ['bg-preserve'])
    assert.equal(absent.resolvedIds.includes(core.id), false)
    assert.equal(absent.resolvedIds.includes(base.id), false)
    assert.equal(absent.resolvedIds.includes(bg.id), false)

    const standalone = resolveSelection(catalog, ['pocketrisu-kei'])
    assert.equal(standalone.resolvedIds.includes(base.id), true)
    assert.equal(standalone.resolvedIds.includes(bg.id), false)

    const composed = resolveSelection(catalog, ['pocketrisu-kei', 'bg-preserve'])
    assert.equal(composed.resolvedIds.includes(base.id), false)
    assert.equal(composed.resolvedIds.includes(bg.id), true)
})

test('K13 bg adapter orders Google parser changes after existing delivery hooks', () => {
    const googleUnits = bg.units.filter((unit) =>
        unit.file === 'src/ts/process/request/google.ts',
    )
    assert.equal(googleUnits.length, 2)
    for (const unit of googleUnits) {
        assert.deepEqual(unit.after, [
            'bg-preserve:hook:google-ts-bgsubkey-fwd-stream',
            'bg-preserve:hook:google-ts-bgsubkey-fwd-nonstream',
        ])
    }
})

test('K13 anchors and managed payloads participate in adapter ETags', () => {
    for (const adapter of [base, bg]) {
        const original = packEtag(adapter)
        const changed = {
            ...adapter,
            units: adapter.units.map((unit, index) => index === 1
                ? { ...unit, managed: `${unit.managed}\n// changed` }
                : unit),
        }
        assert.notEqual(packEtag(changed), original)
        assert.equal(packEtag(adapter), original)
    }
})

test('K13 attribution pins the audited source and excludes unrelated Kei surfaces', () => {
    const notices = fs.readFileSync(
        path.join(__dirname, '../THIRD_PARTY_NOTICES.md'),
        'utf8',
    )
    assert.match(notices, /cc1d1b195babd887577ebf943d5e82f01f58135c/)
    assert.match(notices, /OpenAI and Google SSE/)
    assert.doesNotMatch(notices, /models\.dev.*K13|request logs.*K13/i)
})
