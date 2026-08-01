'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { loadCatalog } = require('../src/catalog.cjs')
const { compose, revertUnit } = require('../src/compose.cjs')

const manifest = require('../patches/bg-preserve-storage-base/manifest.cjs')

function unit(id) {
    const candidate = manifest.units.find((entry) => entry.id === id)
    assert.ok(candidate, `missing unit ${id}`)
    return candidate
}

function count(text, needle) {
    return text.split(needle).length - 1
}

test('standard BG storage adapter is qualified only for reviewed exact targets', () => {
    assert.deepEqual(manifest.targets, {
        pocketrisu: {
            verified: ['1.8.1', '1.9.0'],
            reviewing: [],
        },
    })
    assert.equal(manifest.targets.pocketrisu.verified.includes('1.9.1'), false)
    assert.equal(manifest.userSelectable, false)
    assert.deepEqual(manifest.requires, ['bg-preserve'])
    assert.deepEqual(manifest.conflicts, ['lazy-chat-sync'])
    assert.deepEqual(manifest.autoWhen, {
        all: ['bg-preserve'],
        none: ['lazy-chat-sync'],
    })
})

test('adapter owns only failed single-asset retries on standard node storage', () => {
    assert.deepEqual(manifest.units.map((candidate) => candidate.id), [
        'bg-preserve-storage-base:asset-upload-retry-import',
        'bg-preserve-storage-base:adaptive-asset-upload-retry',
        'bg-preserve-storage-base:asset-upload-error-detail',
    ])
    assert.ok(manifest.units.every((candidate) =>
        candidate.file === 'src/ts/storage/nodeStorage.ts'
    ))

    const retry = unit('bg-preserve-storage-base:adaptive-asset-upload-retry')
    assert.match(retry.managed, /const da = key\.startsWith\('assets\/'\)/)
    assert.match(retry.managed, /\? await retryAssetUpload\(upload\)/)
    assert.match(retry.managed, /: await upload\(\)/)
    assert.deepEqual(retry.after, [
        'bg-preserve-storage-base:asset-upload-retry-import',
    ])

    const error = unit('bg-preserve-storage-base:asset-upload-error-detail')
    assert.match(error.managed, /if \(key\.startsWith\('assets\/'\)\)/)
    assert.match(error.managed, /Asset upload failed \(HTTP \$\{da\.status\}\)/)
    assert.deepEqual(error.after, [
        'bg-preserve-storage-base:adaptive-asset-upload-retry',
    ])

    const managed = manifest.units
        .flatMap((candidate) => [candidate.managed ?? '', candidate.content ?? ''])
        .join('\n')
    assert.doesNotMatch(managed, /model-jobs|saveChatContent|database\/database\.bin/)
    assert.doesNotMatch(managed, /setDatabase(?:Lite)?\(|\bplugins\b/)
})

test('parent BG pack supplies the bounded retry helper and its contract tests', () => {
    const parent = loadCatalog().find((candidate) => candidate.id === 'bg-preserve')
    const helper = parent.units.find((candidate) =>
        candidate.id === 'bg-preserve:owned:src/ts/storage/assetUploadRetry.ts'
    )
    const helperTest = parent.units.find((candidate) =>
        candidate.id === 'bg-preserve:owned:src/ts/storage/assetUploadRetry.test.ts'
    )

    assert.ok(helper)
    assert.ok(helperTest)
    assert.match(helper.content, /MAX_ASSET_UPLOAD_ATTEMPTS = 3/)
    assert.match(helper.content, /ASSET_UPLOAD_RETRY_DELAYS_MS = \[300, 900\]/)
    assert.match(helper.content, /new RetryLane\(3\)/)
    assert.match(helper.content, /status === 408 \|\| status === 425 \|\| status === 429 \|\| status >= 500/)
    assert.match(helperTest.content, /not a deactivated session/)
    assert.match(helperTest.content, /status: 423/)
    assert.match(helperTest.content, /keeps all first attempts concurrent but caps only the retry lane at three/)
})

test('adapter applies once and reverts exactly around the PocketRisu setItem contract', () => {
    const base = `import { normalizeChat } from "./database.svelte"

export class NodeStorage {
    async setItem(key:string, value:Uint8Array, etag?:string) {
        const headers: Record<string, string> = {
            'content-type': 'application/octet-stream',
            'file-path': Buffer.from(key, 'utf-8').toString('hex')
        }
        if (etag) {
            headers['x-if-match'] = etag
        }
        const da = await this.authFetch('/api/write', {
            method: "POST",
            body: value as any,
            headers
        })
        if(da.status === 409){
            const data = await da.json()
            throw new ConflictError(data.error, data.currentEtag)
        }
        if(da.status < 200 || da.status >= 300){
            throw "setItem Error"
        }
    }
}
`
    const path = 'src/ts/storage/nodeStorage.ts'
    const first = compose(manifest.units, new Map([[path, base]]))
    const output = first.outputs.get(path)

    assert.deepEqual(first.collisions, [])
    assert.deepEqual(first.order, manifest.units.map((candidate) => candidate.id))
    for (const candidate of manifest.units) {
        assert.equal(count(output, candidate.markerNeedle), 1)
    }
    assert.match(output, /const da = key\.startsWith\('assets\/'\)[\s\S]*: await upload\(\)/)
    assert.match(output, /if\(da\.status === 409\)[\s\S]*throw new ConflictError/)

    const repeated = compose(manifest.units, new Map([[path, output]]))
    assert.equal(repeated.outputs.get(path), output)

    let reverted = output
    for (const id of [...first.order].reverse()) {
        reverted = revertUnit(reverted, unit(id))
    }
    assert.equal(reverted, base)
})
