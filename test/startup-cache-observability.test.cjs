'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const startupManifest = require('../patches/startup-cache/manifest.cjs')

const manifest = fs.readFileSync(path.join(
    __dirname,
    '../patches/startup-cache/manifest.cjs',
), 'utf8')
const lazyNodeStorage = fs.readFileSync(path.join(
    __dirname,
    '../patches/lazy-chat-sync/files/src/ts/storage/nodeStorage.ts',
), 'utf8')

test('startup cache keeps cache behavior without permanent System Log telemetry', () => {
    assert.equal(startupManifest.version, '0.1.2')
    for (const source of [manifest, lazyNodeStorage]) {
        assert.doesNotMatch(source, /Startup database:/)
        assert.doesNotMatch(source, /reportStartupDatabaseCache/)
        assert.doesNotMatch(source, /source: 'startup-cache'/)
        assert.doesNotMatch(source, /\bprobeMs\b|\brequestMs\b|\bhydrateMs\b|\bfallbackMs\b/)
        assert.match(source, /resolveNotModified/)
        assert.match(source, /readDatabaseUnconditionally/)
        assert.match(source, /startupDatabaseCache\.invalidate\(\)/)
    }
})

test('startup cache is qualified only for reviewed exact PocketRisu targets', () => {
    assert.deepEqual(startupManifest.targets, {
        pocketrisu: {
            verified: ['1.8.1', '1.9.0'],
            reviewing: [],
        },
    })
    assert.equal(startupManifest.targets.pocketrisu.verified.includes('1.9.1'), false)
})
