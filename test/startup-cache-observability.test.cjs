'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const manifest = fs.readFileSync(path.join(
    __dirname,
    '../patches/startup-cache/manifest.cjs',
), 'utf8')

test('startup cache reports the actual warm path without exposing database data', () => {
    assert.match(manifest, /source: 'startup-cache'/)
    assert.match(manifest, /Startup database: \\?\$\{outcome\}/)
    assert.match(manifest, /'decoded-hit'/)
    assert.match(manifest, /'raw-hit'/)
    assert.match(manifest, /'miss-network'/)
    assert.match(manifest, /'304-missing-body-fallback'/)
    assert.match(manifest, /probeMs/)
    assert.match(manifest, /requestMs/)
    assert.match(manifest, /hydrateMs/)
    assert.doesNotMatch(manifest, /description:.*etag/i)
})
