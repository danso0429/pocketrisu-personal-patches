'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')
const {
    checkForPatcherUpdate,
    compareVersions,
    readBoundedJson,
    validateFeed,
} = require('../src/update-feed.cjs')

const channel = {
    schema: 1,
    url: 'https://updates.example.test/latest.json',
    allowedFeedHosts: ['updates.example.test'],
    allowedReleaseHosts: ['releases.example.test'],
    cacheMaxAgeMs: 60_000,
    timeoutMs: 1000,
}

const feed = {
    schema: 1,
    channel: 'stable',
    latest: '0.2.1',
    minimumSupported: '0.2.0',
    publishedAt: '2026-07-29T00:00:00Z',
    message: 'Compatibility update',
    releasePage: 'https://releases.example.test/0.2.1/',
}

test('semantic version comparison handles stable and prerelease versions', () => {
    assert.equal(compareVersions('0.2.0', '0.2.0'), 0)
    assert.equal(compareVersions('0.2.1', '0.2.0') > 0, true)
    assert.equal(compareVersions('0.2.0-experimental.2', '0.2.0') < 0, true)
    assert.equal(compareVersions('0.2.0-experimental.10', '0.2.0-experimental.2') > 0, true)
    assert.equal(compareVersions('0.2.0+build.2', '0.2.0+build.1'), 0)
})

test('feed URLs and displayed release links are HTTPS allowlisted', () => {
    assert.equal(validateFeed(feed, channel).latest, '0.2.1')
    assert.equal(
        validateFeed({
            ...feed,
            minimumSupported: undefined,
            message: 'Compatibility\nupdate',
        }, channel).message,
        'Compatibility update',
    )
    assert.throws(
        () => validateFeed({ ...feed, releasePage: 'https://phishing.test/' }, channel),
        /not allowlisted/,
    )
    assert.throws(
        () => validateFeed({
            ...feed,
            releasePage: 'https://user@releases.example.test/',
        }, channel),
        /credentials/,
    )
    assert.throws(
        () => validateFeed({
            ...feed,
            latest: '0.2.0',
            minimumSupported: '0.3.0',
        }, channel),
        /exceeds latest/,
    )
})

test('update checks cache a notification without sending the installed version', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pocketrisu-update-feed-'))
    const requests = []
    const fetchImpl = async (url, options) => {
        requests.push({ url, options })
        return {
            ok: true,
            status: 200,
            json: async () => feed,
        }
    }
    try {
        const first = await checkForPatcherUpdate({
            root,
            currentVersion: '0.1.7',
            channel,
            fetchImpl,
            now: 1000,
        })
        const second = await checkForPatcherUpdate({
            root,
            currentVersion: '0.1.7',
            channel,
            fetchImpl,
            now: 2000,
        })
        assert.equal(first.status, 'unsupported')
        assert.equal(first.source, 'network')
        assert.equal(second.source, 'cache')
        assert.equal(requests.length, 1)
        assert.doesNotMatch(JSON.stringify(requests[0]), /0\.1\.7/)
    } finally {
        fs.rmSync(root, { recursive: true, force: true })
    }
})

test('network and validation failures never throw into a local command', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pocketrisu-update-feed-'))
    try {
        const result = await checkForPatcherUpdate({
            root,
            currentVersion: '0.1.7',
            channel,
            fetchImpl: async () => {
                throw new Error('offline')
            },
        })
        assert.equal(result.status, 'unavailable')
        assert.match(result.reason, /offline/)
    } finally {
        fs.rmSync(root, { recursive: true, force: true })
    }
})

test('an expired cache still provides a notice when refresh is offline', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pocketrisu-update-feed-'))
    try {
        await checkForPatcherUpdate({
            root,
            currentVersion: '0.1.7',
            channel,
            fetchImpl: async () => ({
                ok: true,
                status: 200,
                json: async () => feed,
            }),
            now: 1000,
        })
        const stale = await checkForPatcherUpdate({
            root,
            currentVersion: '0.1.7',
            channel,
            fetchImpl: async () => {
                throw new Error('offline')
            },
            now: 62_000,
        })

        assert.equal(stale.status, 'unsupported')
        assert.equal(stale.source, 'stale-cache')
        assert.equal(stale.stale, true)
        assert.match(stale.refreshError, /offline/)
    } finally {
        fs.rmSync(root, { recursive: true, force: true })
    }
})

test('update responses are rejected before an oversized body is accepted', async () => {
    await assert.rejects(
        () => readBoundedJson({
            headers: {
                get: () => null,
            },
            text: async () => 'x'.repeat(100),
        }, 32),
        /byte limit/,
    )
})

test('update cache refuses a symlinked metadata directory', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pocketrisu-update-feed-'))
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'pocketrisu-update-outside-'))
    try {
        fs.mkdirSync(path.join(root, 'save'), { recursive: true })
        fs.symlinkSync(outside, path.join(root, 'save/pocketrisu-patches'))
        const result = await checkForPatcherUpdate({
            root,
            currentVersion: '0.1.7',
            channel,
            fetchImpl: async () => ({
                ok: true,
                status: 200,
                json: async () => feed,
            }),
        })

        assert.equal(result.status, 'unsupported')
        assert.equal(result.source, 'network')
        assert.equal(result.cacheWarning, 'cache-unavailable')
        assert.deepEqual(fs.readdirSync(outside), [])
    } finally {
        fs.rmSync(root, { recursive: true, force: true })
        fs.rmSync(outside, { recursive: true, force: true })
    }
})
