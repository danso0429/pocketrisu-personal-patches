'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')

const GOOGLE_FONTS_REVISION = 'ec626514f79f831f1ab848a82114a0ce7e2d6372'
const PAGEFOLD_FONT_VERSION = `google-fonts-${GOOGLE_FONTS_REVISION}`

const PAGEFOLD_FONT_ASSETS = Object.freeze([
    Object.freeze({
        id: 'textFont',
        fileName: 'NotoSansKR-wght.ttf',
        url: `https://raw.githubusercontent.com/google/fonts/${GOOGLE_FONTS_REVISION}/ofl/notosanskr/NotoSansKR%5Bwght%5D.ttf`,
        byteLength: 10_414_588,
        sha256: '194018e6b2b293a7964f037b25c0249ce1418bc9ab3c971060a03aa57861e252',
        magic: Object.freeze([0x00, 0x01, 0x00, 0x00]),
    }),
    Object.freeze({
        id: 'textLicense',
        fileName: 'NotoSansKR-OFL.txt',
        url: `https://raw.githubusercontent.com/google/fonts/${GOOGLE_FONTS_REVISION}/ofl/notosanskr/OFL.txt`,
        byteLength: 4_388,
        sha256: '1c05c68c34f9708415aada51f17e1b0092d2cea709bf4a94cd38114f9e73d7d9',
    }),
    Object.freeze({
        id: 'emojiFont',
        fileName: 'NotoEmoji-wght.ttf',
        url: `https://raw.githubusercontent.com/google/fonts/${GOOGLE_FONTS_REVISION}/ofl/notoemoji/NotoEmoji%5Bwght%5D.ttf`,
        byteLength: 1_982_596,
        sha256: 'de6c18832938afc99caf132b39d6a30a19bac7f2e812e28db2535b4608d27551',
        magic: Object.freeze([0x00, 0x01, 0x00, 0x00]),
    }),
    Object.freeze({
        id: 'emojiLicense',
        fileName: 'NotoEmoji-OFL.txt',
        url: `https://raw.githubusercontent.com/google/fonts/${GOOGLE_FONTS_REVISION}/ofl/notoemoji/OFL.txt`,
        byteLength: 4_330,
        sha256: '500bb1ccf43df7bbb522112f9133a52b16e1c35e809632f5d8609b179152de5b',
    }),
])

class PageFoldFontCacheError extends Error {
    constructor(code, message, options = {}) {
        super(message, options.cause ? { cause: options.cause } : undefined)
        this.name = 'PageFoldFontCacheError'
        this.code = code
        this.transient = options.transient === true
    }
}

function defaultCacheRoot() {
    const base = process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache')
    return path.join(base, 'pocketrisu', 'pagefold-fonts-v1')
}

function createPageFoldFontCache(options = {}) {
    const cacheRoot = path.resolve(options.cacheRoot || defaultCacheRoot())
    const specs = Object.freeze([...(options.specs || PAGEFOLD_FONT_ASSETS)])
    const fetchImpl = options.fetchImpl || globalThis.fetch
    if (typeof fetchImpl !== 'function') {
        throw new PageFoldFontCacheError('FONT_FETCH_UNAVAILABLE', 'No font fetch implementation is available')
    }
    validateSpecs(specs)

    let memoryResult = null
    let active = null

    async function load(signal) {
        throwIfAborted(signal)
        if (memoryResult) return memoryResult
        if (!active) active = startSharedLoad()
        return subscribe(active, signal)
    }

    function startSharedLoad() {
        const controller = new AbortController()
        const entry = { controller, subscribers: 0, settled: false, promise: null }
        entry.promise = loadAllAssets({ cacheRoot, specs, fetchImpl, signal: controller.signal })
            .then((result) => {
                memoryResult = Object.freeze(result)
                return memoryResult
            })
            .catch((error) => {
                controller.abort()
                throw error
            })
            .finally(() => {
                entry.settled = true
                if (active === entry) active = null
            })
        return entry
    }

    return Object.freeze({
        version: PAGEFOLD_FONT_VERSION,
        cacheRoot,
        load,
        inspect: () => ({ loaded: memoryResult !== null, active: active !== null }),
    })
}

async function loadAllAssets({ cacheRoot, specs, fetchImpl, signal }) {
    throwIfAborted(signal)
    await fs.mkdir(cacheRoot, { recursive: true, mode: 0o700 })
    await fs.chmod(cacheRoot, 0o700)
    const loaded = await Promise.all(specs.map((spec) => ensureAsset({
        cacheRoot,
        spec,
        fetchImpl,
        signal,
    })))
    const assets = Object.create(null)
    for (let index = 0; index < specs.length; index++) {
        assets[specs[index].id] = Object.freeze({
            path: loaded[index],
            byteLength: specs[index].byteLength,
            sha256: specs[index].sha256,
        })
    }
    return {
        version: PAGEFOLD_FONT_VERSION,
        cacheRoot,
        assets: Object.freeze(assets),
    }
}

async function ensureAsset({ cacheRoot, spec, fetchImpl, signal }) {
    const destination = path.join(cacheRoot, spec.fileName)
    const cached = await readVerified(destination, spec, signal)
    if (cached) return destination

    const bytes = await downloadBounded(fetchImpl, spec, signal)
    validateBytes(bytes, spec)
    throwIfAborted(signal)
    await installAtomic(destination, bytes, signal)

    const installed = await readVerified(destination, spec, signal)
    if (!installed) {
        throw new PageFoldFontCacheError(
            'FONT_CACHE_VERIFY_FAILED',
            `Installed PageFold font asset failed verification: ${spec.id}`,
        )
    }
    return destination
}

async function readVerified(filePath, spec, signal) {
    throwIfAborted(signal)
    let bytes
    try {
        bytes = await fs.readFile(filePath)
    } catch (error) {
        if (error?.code === 'ENOENT') return false
        throw new PageFoldFontCacheError(
            'FONT_CACHE_READ_FAILED',
            `Unable to read cached PageFold font asset: ${spec.id}`,
            { cause: error, transient: true },
        )
    }
    throwIfAborted(signal)
    try {
        validateBytes(bytes, spec)
        return true
    } catch (error) {
        if (error instanceof PageFoldFontCacheError) return false
        throw error
    }
}

async function downloadBounded(fetchImpl, spec, signal) {
    let response
    try {
        response = await fetchImpl(spec.url, { signal })
    } catch (error) {
        if (signal?.aborted || error?.name === 'AbortError') throw abortError()
        throw new PageFoldFontCacheError(
            'FONT_DOWNLOAD_FAILED',
            `Unable to download PageFold font asset: ${spec.id}`,
            { cause: error, transient: true },
        )
    }
    if (!response?.ok) {
        throw new PageFoldFontCacheError(
            'FONT_DOWNLOAD_HTTP',
            `PageFold font asset returned HTTP ${response?.status ?? 'unknown'}: ${spec.id}`,
            { transient: Number(response?.status) >= 500 || Number(response?.status) === 429 },
        )
    }
    const declaredHeader = response.headers?.get?.('content-length')
    const contentEncoding = response.headers?.get?.('content-encoding')
    const declared = declaredHeader === null || declaredHeader === undefined || declaredHeader === ''
        ? Number.NaN
        : Number(declaredHeader)
    // fetch transparently decodes gzip/br responses while retaining the wire
    // Content-Length. Only an identity response can be compared pre-read.
    if (Number.isFinite(declared)
        && (!contentEncoding || contentEncoding.toLowerCase() === 'identity')
        && declared !== spec.byteLength) {
        throw new PageFoldFontCacheError(
            'FONT_LENGTH_MISMATCH',
            `PageFold font asset length mismatch before download: ${spec.id}`,
        )
    }

    if (!response.body?.getReader) {
        const bytes = Buffer.from(await response.arrayBuffer())
        if (bytes.byteLength > spec.byteLength) throw lengthMismatch(spec)
        return bytes
    }

    const reader = response.body.getReader()
    const chunks = []
    let total = 0
    try {
        while (true) {
            throwIfAborted(signal)
            const { value, done } = await reader.read()
            if (done) break
            const chunk = Buffer.from(value)
            total += chunk.byteLength
            if (total > spec.byteLength) {
                await reader.cancel().catch(() => {})
                throw lengthMismatch(spec)
            }
            chunks.push(chunk)
        }
    } catch (error) {
        if (signal?.aborted || error?.name === 'AbortError') throw abortError()
        if (error instanceof PageFoldFontCacheError) throw error
        throw new PageFoldFontCacheError(
            'FONT_DOWNLOAD_INTERRUPTED',
            `PageFold font asset download was interrupted: ${spec.id}`,
            { cause: error, transient: true },
        )
    }
    return Buffer.concat(chunks, total)
}

async function installAtomic(destination, bytes, signal) {
    throwIfAborted(signal)
    const temp = `${destination}.${process.pid}.${nextTempId()}.tmp`
    let handle
    try {
        handle = await fs.open(temp, 'wx', 0o600)
        await handle.writeFile(bytes)
        await handle.sync()
        await handle.close()
        handle = null
        throwIfAborted(signal)
        await fs.rename(temp, destination)
        await fs.chmod(destination, 0o600)
    } catch (error) {
        await handle?.close().catch(() => {})
        await fs.unlink(temp).catch(() => {})
        if (signal?.aborted || error?.name === 'AbortError') throw abortError()
        throw new PageFoldFontCacheError(
            'FONT_CACHE_WRITE_FAILED',
            'Unable to atomically install a PageFold font asset',
            { cause: error, transient: true },
        )
    }
}

function validateSpecs(specs) {
    const ids = new Set()
    const fileNames = new Set()
    for (const spec of specs) {
        if (!spec || typeof spec.id !== 'string' || ids.has(spec.id)
            || typeof spec.fileName !== 'string' || fileNames.has(spec.fileName)
            || path.basename(spec.fileName) !== spec.fileName
            || typeof spec.url !== 'string' || !spec.url.startsWith('https://')
            || !Number.isSafeInteger(spec.byteLength) || spec.byteLength <= 0
            || !/^[a-f0-9]{64}$/.test(spec.sha256)) {
            throw new PageFoldFontCacheError('FONT_SPEC_INVALID', 'Invalid PageFold font asset specification')
        }
        ids.add(spec.id)
        fileNames.add(spec.fileName)
    }
}

function validateBytes(bytes, spec) {
    if (bytes.byteLength !== spec.byteLength) throw lengthMismatch(spec)
    if (spec.magic && !spec.magic.every((value, index) => bytes[index] === value)) {
        throw new PageFoldFontCacheError(
            'FONT_FORMAT_MISMATCH',
            `PageFold font asset has an invalid font signature: ${spec.id}`,
        )
    }
    const digest = crypto.createHash('sha256').update(bytes).digest('hex')
    if (!crypto.timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(spec.sha256, 'hex'))) {
        throw new PageFoldFontCacheError(
            'FONT_HASH_MISMATCH',
            `PageFold font asset failed SHA-256 verification: ${spec.id}`,
        )
    }
}

function subscribe(entry, signal) {
    throwIfAborted(signal)
    entry.subscribers++
    if (!signal) return entry.promise.finally(() => release(entry, false))

    return new Promise((resolve, reject) => {
        let finished = false
        const onAbort = () => {
            if (finished) return
            finished = true
            release(entry, true)
            reject(abortError())
        }
        signal.addEventListener('abort', onAbort, { once: true })
        entry.promise.then(
            (value) => {
                if (finished) return
                finished = true
                signal.removeEventListener('abort', onAbort)
                release(entry, false)
                resolve(value)
            },
            (error) => {
                if (finished) return
                finished = true
                signal.removeEventListener('abort', onAbort)
                release(entry, false)
                reject(error)
            },
        )
    })
}

function release(entry, aborted) {
    entry.subscribers = Math.max(0, entry.subscribers - 1)
    if (aborted && entry.subscribers === 0 && !entry.settled) entry.controller.abort()
}

function lengthMismatch(spec) {
    return new PageFoldFontCacheError(
        'FONT_LENGTH_MISMATCH',
        `PageFold font asset length mismatch: ${spec.id}`,
    )
}

function throwIfAborted(signal) {
    if (signal?.aborted) throw abortError()
}

function abortError() {
    const error = new Error('PageFold font loading was aborted')
    error.name = 'AbortError'
    error.code = 'ABORT_ERR'
    return error
}

let tempId = 0
function nextTempId() {
    tempId = (tempId + 1) % Number.MAX_SAFE_INTEGER
    return tempId
}

module.exports = {
    GOOGLE_FONTS_REVISION,
    PAGEFOLD_FONT_VERSION,
    PAGEFOLD_FONT_ASSETS,
    PageFoldFontCacheError,
    createPageFoldFontCache,
}
