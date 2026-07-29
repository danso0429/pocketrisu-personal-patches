'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const CACHE_FORMAT = 1
const DEFAULT_CACHE_PATH = 'save/pocketrisu-patches/update-cache.json'
const PRIVATE_CACHE_MODE = 0o600

function parseVersion(value) {
    if (typeof value !== 'string') return null
    const match = value.trim().match(
        /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/,
    )
    if (!match) return null
    const prerelease = match[4]?.split('.') ?? []
    const build = match[5]?.split('.') ?? []
    if (
        prerelease.some((entry) =>
            !entry || (/^\d+$/.test(entry) && entry.length > 1 && entry.startsWith('0'))
        )
        || build.some((entry) => !entry)
    ) return null
    const parsed = {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3]),
        prerelease,
    }
    if (
        !Number.isSafeInteger(parsed.major)
        || !Number.isSafeInteger(parsed.minor)
        || !Number.isSafeInteger(parsed.patch)
    ) return null
    return parsed
}

function compareIdentifier(left, right) {
    const leftNumber = /^\d+$/.test(left)
    const rightNumber = /^\d+$/.test(right)
    if (leftNumber && rightNumber) {
        if (left.length !== right.length) return Math.sign(left.length - right.length)
        if (left === right) return 0
        return left < right ? -1 : 1
    }
    if (leftNumber) return -1
    if (rightNumber) return 1
    if (left === right) return 0
    return left < right ? -1 : 1
}

function compareVersions(leftValue, rightValue) {
    const left = parseVersion(leftValue)
    const right = parseVersion(rightValue)
    if (!left || !right) throw new Error(`Invalid semantic version: ${!left ? leftValue : rightValue}`)
    for (const key of ['major', 'minor', 'patch']) {
        if (left[key] !== right[key]) return Math.sign(left[key] - right[key])
    }
    if (left.prerelease.length === 0 && right.prerelease.length === 0) return 0
    if (left.prerelease.length === 0) return 1
    if (right.prerelease.length === 0) return -1
    const length = Math.max(left.prerelease.length, right.prerelease.length)
    for (let index = 0; index < length; index += 1) {
        if (left.prerelease[index] === undefined) return -1
        if (right.prerelease[index] === undefined) return 1
        const compared = compareIdentifier(left.prerelease[index], right.prerelease[index])
        if (compared !== 0) return compared
    }
    return 0
}

function validateHttpsUrl(value, allowedHosts, label) {
    let parsed
    try {
        parsed = new URL(value)
    } catch {
        throw new Error(`${label} is not a valid URL`)
    }
    if (parsed.protocol !== 'https:') throw new Error(`${label} must use HTTPS`)
    if (parsed.username || parsed.password) {
        throw new Error(`${label} must not contain URL credentials`)
    }
    if (parsed.port && parsed.port !== '443') {
        throw new Error(`${label} must use the default HTTPS port`)
    }
    if (!allowedHosts.includes(parsed.hostname)) {
        throw new Error(`${label} host is not allowlisted: ${parsed.hostname}`)
    }
    return parsed.toString()
}

function cleanMessage(value) {
    if (value === undefined || value === null) return null
    if (typeof value !== 'string') throw new Error('Update message must be a string')
    return value
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 500)
}

function validateFeed(value, channel) {
    if (!value || typeof value !== 'object' || value.schema !== 1) {
        throw new Error('Unsupported update feed schema')
    }
    if (!parseVersion(value.latest)) throw new Error('Update feed latest version is invalid')
    if (
        value.minimumSupported !== undefined
        && value.minimumSupported !== null
        && !parseVersion(value.minimumSupported)
    ) {
        throw new Error('Update feed minimumSupported version is invalid')
    }
    if (
        value.minimumSupported
        && compareVersions(value.minimumSupported, value.latest) > 0
    ) {
        throw new Error('Update feed minimumSupported exceeds latest')
    }
    return {
        schema: 1,
        channel: typeof value.channel === 'string' ? value.channel : 'stable',
        latest: value.latest,
        minimumSupported: value.minimumSupported ?? null,
        publishedAt: typeof value.publishedAt === 'string' ? value.publishedAt : null,
        message: cleanMessage(value.message),
        releasePage: validateHttpsUrl(
            value.releasePage,
            channel.allowedReleaseHosts,
            'releasePage',
        ),
    }
}

function evaluateFeed(currentVersion, feed) {
    const unsupported = feed.minimumSupported
        && compareVersions(currentVersion, feed.minimumSupported) < 0
    const available = compareVersions(currentVersion, feed.latest) < 0
    return {
        status: unsupported ? 'unsupported' : (available ? 'available' : 'current'),
        currentVersion,
        ...feed,
    }
}

async function fetchFeed(channel, {
    fetchImpl = globalThis.fetch,
} = {}) {
    if (!channel?.url) return { status: 'disabled' }
    if (typeof fetchImpl !== 'function') return { status: 'unavailable', reason: 'fetch-unavailable' }
    const url = validateHttpsUrl(channel.url, channel.allowedFeedHosts, 'update feed')
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), channel.timeoutMs)
    try {
        const response = await fetchImpl(url, {
            method: 'GET',
            headers: {
                accept: 'application/json',
                'user-agent': 'PocketRisu-Patcher-Update-Check',
            },
            redirect: 'error',
            signal: controller.signal,
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return validateFeed(
            await readBoundedJson(response, channel.maxBytes ?? 16 * 1024),
            channel,
        )
    } finally {
        clearTimeout(timeout)
    }
}

async function readBoundedJson(response, maximumBytes) {
    if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0) {
        throw new Error('Update feed byte limit is invalid')
    }
    const contentLength = Number(response.headers?.get?.('content-length'))
    if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
        throw new Error('Update feed exceeds the byte limit')
    }
    let text
    if (response.body?.getReader) {
        const reader = response.body.getReader()
        const chunks = []
        let total = 0
        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            total += value.byteLength
            if (total > maximumBytes) {
                await reader.cancel()
                throw new Error('Update feed exceeds the byte limit')
            }
            chunks.push(Buffer.from(value))
        }
        text = Buffer.concat(chunks, total).toString('utf8')
    } else if (typeof response.text === 'function') {
        text = await response.text()
        if (Buffer.byteLength(text, 'utf8') > maximumBytes) {
            throw new Error('Update feed exceeds the byte limit')
        }
    } else {
        const value = await response.json()
        if (Buffer.byteLength(JSON.stringify(value), 'utf8') > maximumBytes) {
            throw new Error('Update feed exceeds the byte limit')
        }
        return value
    }
    try {
        return JSON.parse(text)
    } catch {
        throw new Error('Update feed is not valid JSON')
    }
}

function safeCachePath(root, relative) {
    const normalized = path.posix.normalize(relative.replaceAll('\\', '/'))
    if (
        path.isAbsolute(relative)
        || normalized === '..'
        || normalized.startsWith('../')
        || normalized !== relative.replaceAll('\\', '/')
    ) throw new Error(`Unsafe update cache path: ${relative}`)
    const resolvedRoot = path.resolve(root)
    const absolute = path.resolve(resolvedRoot, normalized)
    if (!absolute.startsWith(`${resolvedRoot}${path.sep}`)) {
        throw new Error(`Update cache escapes target root: ${relative}`)
    }
    return absolute
}

function assertNoSymlinkPath(root, relative) {
    const normalized = path.posix.normalize(relative.replaceAll('\\', '/'))
    let cursor = path.resolve(root)
    for (const part of normalized.split('/')) {
        cursor = path.join(cursor, part)
        try {
            if (fs.lstatSync(cursor).isSymbolicLink()) {
                throw new Error(`Refusing update cache through symlinked path: ${relative}`)
            }
        } catch (error) {
            if (error.code === 'ENOENT') return
            throw error
        }
    }
}

function readCache(root, cachePath, channel, now) {
    let parsed
    try {
        assertNoSymlinkPath(root, cachePath)
        parsed = JSON.parse(fs.readFileSync(safeCachePath(root, cachePath), 'utf8'))
    } catch (error) {
        if (error.code === 'ENOENT' || error instanceof SyntaxError) return null
        throw error
    }
    if (
        parsed.format !== CACHE_FORMAT
        || parsed.feedUrl !== channel.url
        || !Number.isFinite(parsed.checkedAt)
        || now - parsed.checkedAt < 0
    ) return null
    try {
        return {
            feed: validateFeed(parsed.feed, channel),
            fresh: now - parsed.checkedAt <= channel.cacheMaxAgeMs,
        }
    } catch {
        return null
    }
}

function writeCache(root, cachePath, channel, feed, now) {
    const absolute = safeCachePath(root, cachePath)
    assertNoSymlinkPath(root, cachePath)
    fs.mkdirSync(path.dirname(absolute), { recursive: true })
    assertNoSymlinkPath(root, cachePath)
    const temporary = `${absolute}.tmp-${process.pid}-${crypto.randomUUID()}`
    const content = `${JSON.stringify({
        format: CACHE_FORMAT,
        feedUrl: channel.url,
        checkedAt: now,
        feed,
    }, null, 2)}\n`
    try {
        fs.writeFileSync(temporary, content, { flag: 'wx', mode: PRIVATE_CACHE_MODE })
        fs.chmodSync(temporary, PRIVATE_CACHE_MODE)
        fs.renameSync(temporary, absolute)
    } catch (error) {
        try {
            fs.unlinkSync(temporary)
        } catch (cleanupError) {
            if (cleanupError.code !== 'ENOENT') error.cleanupError = cleanupError
        }
        throw error
    }
}

async function checkForPatcherUpdate({
    root,
    currentVersion,
    channel,
    cachePath = DEFAULT_CACHE_PATH,
    fetchImpl = globalThis.fetch,
    now = Date.now(),
}) {
    if (!channel?.url) return { status: 'disabled', currentVersion }
    if (!parseVersion(currentVersion)) {
        return {
            status: 'unavailable',
            currentVersion,
            reason: 'invalid-current-version',
        }
    }
    let cached = null
    let cacheWarning = null
    try {
        cached = readCache(root, cachePath, channel, now)
    } catch (error) {
        cacheWarning = error.code ?? 'cache-unavailable'
    }
    if (cached?.fresh) {
        return { ...evaluateFeed(currentVersion, cached.feed), source: 'cache' }
    }
    try {
        const feed = await fetchFeed(channel, { fetchImpl })
        if (feed.status === 'disabled' || feed.status === 'unavailable') {
            if (cached) {
                return {
                    ...evaluateFeed(currentVersion, cached.feed),
                    source: 'stale-cache',
                    stale: true,
                    refreshError: feed.reason ?? feed.status,
                    cacheWarning,
                }
            }
            return { ...feed, currentVersion, cacheWarning }
        }
        try {
            writeCache(root, cachePath, channel, feed, now)
        } catch (error) {
            cacheWarning = error.code ?? 'cache-unavailable'
        }
        return {
            ...evaluateFeed(currentVersion, feed),
            source: 'network',
            cacheWarning,
        }
    } catch (error) {
        if (cached) {
            return {
                ...evaluateFeed(currentVersion, cached.feed),
                source: 'stale-cache',
                stale: true,
                refreshError: String(error.message ?? error),
                cacheWarning,
            }
        }
        return {
            status: 'unavailable',
            currentVersion,
            reason: String(error.message ?? error),
            cacheWarning,
        }
    }
}

module.exports = {
    DEFAULT_CACHE_PATH,
    checkForPatcherUpdate,
    compareVersions,
    evaluateFeed,
    fetchFeed,
    parseVersion,
    readBoundedJson,
    validateFeed,
}
