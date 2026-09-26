'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const lazyNodeStorage = fs.readFileSync(path.join(
    __dirname,
    '../patches/lazy-chat-sync/files-1.10/src/ts/storage/nodeStorage.ts',
), 'utf8')

test('startup cache keeps cache behavior without permanent System Log telemetry', () => {
    assert.doesNotMatch(lazyNodeStorage, /Startup database:/)
    assert.doesNotMatch(lazyNodeStorage, /reportStartupDatabaseCache/)
    assert.doesNotMatch(lazyNodeStorage, /source: 'startup-cache'/)
    assert.doesNotMatch(lazyNodeStorage, /\bprobeMs\b|\brequestMs\b|\bhydrateMs\b|\bfallbackMs\b/)
    assert.match(lazyNodeStorage, /resolveNotModified/)
    assert.match(lazyNodeStorage, /readDatabaseUnconditionally/)
    assert.match(lazyNodeStorage, /startupDatabaseCache\.invalidate\(\)/)
})
