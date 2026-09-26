'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { loadCatalog } = require('../src/catalog.cjs')

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
