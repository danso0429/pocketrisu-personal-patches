'use strict'

const crypto = require('node:crypto')
const path = require('node:path')
const { Worker } = require('node:worker_threads')
const {
    PAGEFOLD_FONT_VERSION,
    createPageFoldFontCache,
} = require('./pageFoldFontCache.cjs')

const PAGEFOLD_RENDER_VERSION = 1
const PAGEFOLD_LAYOUT_VERSION = 1
const PAGEFOLD_SERIALIZER_VERSION = 1

const PAGEFOLD_LAYOUT_V1 = Object.freeze({
    pageWidth: 595.28,
    pageHeight: 841.89,
    margin: 10,
    columnGap: 5,
    columns: 4,
    fontSize: 2,
    lineHeight: 2.3,
})

// Exact-target prototype observations (1/2/4/8 pages) bound first admission.
// The 8-page case used 1,272,391 source bytes, produced 6,781,118 PDF bytes,
// had a highest phase-sampled worker RSS of 580,354,048 bytes, and completed
// inside this timeout.
const PAGEFOLD_PROTOTYPE_LIMITS = Object.freeze({
    maxSourceBytes: 2 * 1024 * 1024,
    maxPages: 8,
    maxPdfBytes: 16 * 1024 * 1024,
    maxSpans: 12_000,
    maxGlyphWidthCacheEntries: 8_192,
    yieldEveryGraphemes: 4_096,
    maxConcurrent: 1,
    maxQueued: 2,
    maxRenderMs: 180_000,
    workerOldGenerationMb: 512,
    maxCacheBytes: 16 * 1024 * 1024,
    maxCacheEntries: 2,
    cacheTtlMs: 5 * 60_000,
})

const TASKS = new Set(['model', 'submodel', 'memory', 'emotion', 'translate', 'otherAx'])
const MODES = new Set(['maximum', 'balanced'])
const ROLES = new Set(['system', 'user', 'assistant', 'tool'])
const HEADER_KEYS = ['type', 'version', 'sourceMessageCount', 'messageCount', 'task', 'mode']
const MESSAGE_KEYS = ['type', 'index', 'sourceIndex', 'role', 'name', 'toolCallId', 'content', 'attachments']

class PageFoldPdfError extends Error {
    constructor(code, message, options = {}) {
        super(message, options.cause ? { cause: options.cause } : undefined)
        this.name = 'PageFoldPdfError'
        this.code = code
        this.transient = options.transient === true
    }
}

function createPageFoldPdfService(options = {}) {
    const fontCache = options.fontCache || createPageFoldFontCache()
    const layout = validateLayout({ ...PAGEFOLD_LAYOUT_V1, ...(options.layout || {}) })
    const limits = validateLimits({ ...PAGEFOLD_PROTOTYPE_LIMITS, ...(options.limits || {}) })
    const workerPath = path.resolve(options.workerPath || path.join(__dirname, 'pageFoldPdfWorker.cjs'))
    const now = options.now || Date.now
    const onWorkerPhase = options.onWorkerPhase
    const permits = createPermitPool(limits.maxConcurrent, limits.maxQueued)
    const cache = new Map()
    const inflight = new Map()
    let cacheBytes = 0

    async function render(request, signal) {
        throwIfAborted(signal)
        const canonical = validateRenderRequest(request, limits, fontCache.version)
        const key = createRenderKey(request, canonical.bytes)
        const cached = getCached(key)
        if (cached) return cloneResult(cached, true)

        let entry = inflight.get(key)
        if (!entry) {
            entry = startRender(key, canonical.bytes)
            inflight.set(key, entry)
        }
        const result = await subscribe(entry, signal)
        return cloneResult(result, false)
    }

    function startRender(key, canonicalBytes) {
        const controller = new AbortController()
        const entry = { controller, subscribers: 0, settled: false, promise: null }
        entry.promise = (async () => {
            const fonts = await fontCache.load(controller.signal)
            const release = await permits.acquire(controller.signal)
            try {
                const workerResult = await runWorker({
                    workerPath,
                    workerData: {
                        canonicalBytes,
                        fonts: fonts.assets,
                        layout,
                        limits,
                    },
                    signal: controller.signal,
                    timeoutMs: limits.maxRenderMs,
                    oldGenerationMb: limits.workerOldGenerationMb,
                    onPhase: (phase) => onWorkerPhase?.({ key, phase }),
                })
                const pdf = Buffer.from(workerResult.pdf)
                const result = Object.freeze({
                    pdf,
                    pageCount: workerResult.pageCount,
                    spanCount: workerResult.spanCount,
                    graphemeCount: workerResult.graphemeCount,
                    sourceBytes: canonicalBytes.byteLength,
                    pdfBytes: pdf.byteLength,
                    sha256: crypto.createHash('sha256').update(pdf).digest('hex'),
                    cacheIdentity: key,
                    renderMs: workerResult.renderMs,
                    memory: Object.freeze({ ...workerResult.memory }),
                })
                putCached(key, result)
                return result
            } finally {
                release()
            }
        })().finally(() => {
            entry.settled = true
            if (inflight.get(key) === entry) inflight.delete(key)
        })
        return entry
    }

    function getCached(key) {
        pruneExpired()
        const entry = cache.get(key)
        if (!entry) return null
        cache.delete(key)
        cache.set(key, entry)
        return entry.result
    }

    function putCached(key, result) {
        if (limits.cacheTtlMs <= 0 || limits.maxCacheEntries <= 0
            || limits.maxCacheBytes <= 0 || result.pdfBytes > limits.maxCacheBytes) return
        const previous = cache.get(key)
        if (previous) {
            cacheBytes -= previous.result.pdfBytes
            cache.delete(key)
        }
        cache.set(key, { expiresAt: now() + limits.cacheTtlMs, result })
        cacheBytes += result.pdfBytes
        while (cache.size > limits.maxCacheEntries || cacheBytes > limits.maxCacheBytes) {
            const oldestKey = cache.keys().next().value
            const oldest = cache.get(oldestKey)
            cache.delete(oldestKey)
            cacheBytes -= oldest.result.pdfBytes
        }
    }

    function pruneExpired() {
        const timestamp = now()
        for (const [key, entry] of cache) {
            if (entry.expiresAt > timestamp) continue
            cache.delete(key)
            cacheBytes -= entry.result.pdfBytes
        }
    }

    return Object.freeze({
        render,
        inspect: () => ({
            cacheEntries: cache.size,
            cacheBytes,
            inflight: inflight.size,
            permits: permits.inspect(),
        }),
    })
}

function validateRenderRequest(request, limits, fontVersion) {
    if (!request || typeof request !== 'object'
        || request.version !== PAGEFOLD_RENDER_VERSION
        || request.serializerVersion !== PAGEFOLD_SERIALIZER_VERSION
        || request.layoutVersion !== PAGEFOLD_LAYOUT_VERSION
        || request.fontVersion !== fontVersion
        || !(request.canonicalBytes instanceof Uint8Array)) {
        throw new PageFoldPdfError('PDF_REQUEST_INVALID', 'Unsupported PageFold render request')
    }
    if (request.canonicalBytes.byteLength <= 0 || request.canonicalBytes.byteLength > limits.maxSourceBytes) {
        throw new PageFoldPdfError('PDF_SOURCE_LIMIT', 'PageFold canonical source exceeds the configured byte limit')
    }
    return validateCanonicalBytes(request.canonicalBytes)
}

function validateCanonicalBytes(input) {
    const bytes = Buffer.from(input.buffer, input.byteOffset, input.byteLength)
    let text
    try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
        throw new PageFoldPdfError('PDF_CANONICAL_UTF8', 'PageFold canonical source is not valid UTF-8')
    }
    if (!text.endsWith('\n') || text.endsWith('\n\n') || text.includes('\r')) {
        throw new PageFoldPdfError('PDF_CANONICAL_INVALID', 'PageFold canonical source has invalid record delimiters')
    }
    const encoded = Buffer.from(text, 'utf8')
    if (!encoded.equals(bytes)) {
        throw new PageFoldPdfError('PDF_CANONICAL_INVALID', 'PageFold canonical source is not unique UTF-8')
    }

    const records = text.slice(0, -1).split('\n')
    const header = parseRecord(records[0], HEADER_KEYS, 'header')
    if (header.type !== 'pagefold-transcript' || header.version !== 1
        || !isCount(header.sourceMessageCount) || !isCount(header.messageCount)
        || header.messageCount > header.sourceMessageCount
        || !TASKS.has(header.task) || !MODES.has(header.mode)
        || records.length !== header.messageCount + 1) {
        throw new PageFoldPdfError('PDF_CANONICAL_INVALID', 'PageFold canonical header is invalid')
    }
    if (encodeHeader(header) !== records[0]) nonCanonical()

    let previousSourceIndex = -1
    for (let index = 0; index < header.messageCount; index++) {
        const message = parseRecord(records[index + 1], MESSAGE_KEYS, 'message')
        if (message.type !== 'message' || message.index !== index
            || !isCount(message.sourceIndex) || message.sourceIndex <= previousSourceIndex
            || message.sourceIndex >= header.sourceMessageCount
            || (header.mode === 'maximum' && message.sourceIndex !== index)
            || !ROLES.has(message.role)
            || !(message.name === null || typeof message.name === 'string')
            || !(message.toolCallId === null || typeof message.toolCallId === 'string')
            || typeof message.content !== 'string'
            || !Array.isArray(message.attachments) || message.attachments.length !== 0) {
            throw new PageFoldPdfError('PDF_CANONICAL_INVALID', `PageFold canonical message ${index} is invalid`)
        }
        if (encodeMessage(message) !== records[index + 1]) nonCanonical()
        previousSourceIndex = message.sourceIndex
    }
    if (header.mode === 'maximum' && header.sourceMessageCount !== header.messageCount) {
        throw new PageFoldPdfError('PDF_CANONICAL_INVALID', 'Maximum PageFold transcript omitted a source message')
    }
    return { bytes: Buffer.from(bytes), text, header }
}

function parseRecord(line, keys, label) {
    let value
    try {
        value = JSON.parse(line)
    } catch {
        throw new PageFoldPdfError('PDF_CANONICAL_INVALID', `PageFold canonical ${label} is not JSON`)
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new PageFoldPdfError('PDF_CANONICAL_INVALID', `PageFold canonical ${label} is not an object`)
    }
    const actualKeys = Object.keys(value)
    if (actualKeys.length !== keys.length || actualKeys.some((key, index) => key !== keys[index])) {
        throw new PageFoldPdfError('PDF_CANONICAL_INVALID', `PageFold canonical ${label} property order is invalid`)
    }
    return value
}

function createRenderKey(request, canonicalBytes) {
    const hash = crypto.createHash('sha256')
    hash.update('pocketrisu-pagefold-pdf\0')
    hash.update(String(request.version))
    hash.update('\0')
    hash.update(String(request.serializerVersion))
    hash.update('\0')
    hash.update(String(request.layoutVersion))
    hash.update('\0')
    hash.update(request.fontVersion)
    hash.update('\0')
    hash.update(canonicalBytes)
    return hash.digest('hex')
}

function runWorker({ workerPath, workerData, signal, timeoutMs, oldGenerationMb, onPhase }) {
    throwIfAborted(signal)
    return new Promise((resolve, reject) => {
        const worker = new Worker(workerPath, {
            workerData,
            resourceLimits: { maxOldGenerationSizeMb: oldGenerationMb },
        })
        let finished = false
        const timeout = setTimeout(() => finishError(new PageFoldPdfError(
            'PDF_RENDER_TIMEOUT',
            'PageFold PDF rendering exceeded its time limit',
            { transient: true },
        ), true), timeoutMs)

        const onAbort = () => finishError(abortError(), true)
        signal?.addEventListener('abort', onAbort, { once: true })

        worker.on('message', (message) => {
            if (message?.type === 'phase') {
                try { onPhase?.(message.phase) } catch {}
                return
            }
            if (message?.type === 'result') {
                finishSuccess(message.result)
                return
            }
            if (message?.type === 'error') {
                const error = new PageFoldPdfError(
                    message.error?.code || 'PDF_RENDER_FAILED',
                    message.error?.message || 'PageFold PDF worker failed',
                )
                error.stack = message.error?.stack || error.stack
                finishError(error, true)
            }
        })
        worker.on('error', (error) => finishError(new PageFoldPdfError(
            'PDF_WORKER_FAILED',
            'PageFold PDF worker crashed',
            { cause: error, transient: true },
        ), false))
        worker.on('exit', (code) => {
            if (!finished) finishError(new PageFoldPdfError(
                'PDF_WORKER_EXIT',
                `PageFold PDF worker exited before returning a result (${code})`,
                { transient: code !== 0 },
            ), false)
        })

        function cleanup() {
            clearTimeout(timeout)
            signal?.removeEventListener('abort', onAbort)
        }
        function finishSuccess(value) {
            if (finished) return
            finished = true
            cleanup()
            resolve(value)
        }
        function finishError(error, terminate) {
            if (finished) return
            finished = true
            cleanup()
            if (terminate) {
                // Keep the concurrency permit occupied until the worker has
                // actually stopped; otherwise an abort could overlap two
                // high-memory font/PDF workers despite maxConcurrent=1.
                void worker.terminate().then(
                    () => reject(error),
                    () => reject(error),
                )
                return
            }
            reject(error)
        }
    })
}

function createPermitPool(maxConcurrent, maxQueued) {
    let active = 0
    const queue = []

    function acquire(signal) {
        throwIfAborted(signal)
        if (active < maxConcurrent) {
            active++
            return Promise.resolve(releaseOnce())
        }
        if (queue.length >= maxQueued) {
            return Promise.reject(new PageFoldPdfError(
                'PDF_RENDER_BUSY',
                'PageFold renderer queue is full',
                { transient: true },
            ))
        }
        return new Promise((resolve, reject) => {
            const entry = { resolve, reject, signal, onAbort: null }
            entry.onAbort = () => {
                const index = queue.indexOf(entry)
                if (index >= 0) queue.splice(index, 1)
                reject(abortError())
            }
            signal?.addEventListener('abort', entry.onAbort, { once: true })
            queue.push(entry)
        })
    }

    function releaseOnce() {
        let released = false
        return () => {
            if (released) return
            released = true
            active = Math.max(0, active - 1)
            dispatch()
        }
    }

    function dispatch() {
        while (active < maxConcurrent && queue.length > 0) {
            const entry = queue.shift()
            entry.signal?.removeEventListener('abort', entry.onAbort)
            if (entry.signal?.aborted) {
                entry.reject(abortError())
                continue
            }
            active++
            entry.resolve(releaseOnce())
        }
    }

    return { acquire, inspect: () => ({ active, queued: queue.length }) }
}

function subscribe(entry, signal) {
    throwIfAborted(signal)
    entry.subscribers++
    if (!signal) return entry.promise.finally(() => releaseSubscriber(entry, false))

    return new Promise((resolve, reject) => {
        let finished = false
        const onAbort = () => {
            if (finished) return
            finished = true
            releaseSubscriber(entry, true)
            reject(abortError())
        }
        signal.addEventListener('abort', onAbort, { once: true })
        entry.promise.then(
            (value) => {
                if (finished) return
                finished = true
                signal.removeEventListener('abort', onAbort)
                releaseSubscriber(entry, false)
                resolve(value)
            },
            (error) => {
                if (finished) return
                finished = true
                signal.removeEventListener('abort', onAbort)
                releaseSubscriber(entry, false)
                reject(error)
            },
        )
    })
}

function releaseSubscriber(entry, aborted) {
    entry.subscribers = Math.max(0, entry.subscribers - 1)
    if (aborted && entry.subscribers === 0 && !entry.settled) entry.controller.abort()
}

function cloneResult(result, cacheHit) {
    return {
        ...result,
        pdf: Buffer.from(result.pdf),
        memory: { ...result.memory },
        cacheHit,
    }
}

function validateLayout(layout) {
    const numeric = ['pageWidth', 'pageHeight', 'margin', 'columnGap', 'columns', 'fontSize', 'lineHeight']
    if (numeric.some((key) => typeof layout[key] !== 'number' || !Number.isFinite(layout[key]))
        || layout.pageWidth <= 0 || layout.pageHeight <= 0 || layout.margin < 0
        || layout.columnGap < 0 || !Number.isSafeInteger(layout.columns) || layout.columns < 1
        || layout.fontSize <= 0 || layout.lineHeight < layout.fontSize) {
        throw new PageFoldPdfError('PDF_LAYOUT_INVALID', 'Invalid PageFold layout')
    }
    return Object.freeze(layout)
}

function validateLimits(limits) {
    const positiveIntegers = [
        'maxSourceBytes', 'maxPages', 'maxPdfBytes', 'maxSpans',
        'maxGlyphWidthCacheEntries', 'yieldEveryGraphemes', 'maxConcurrent',
        'maxQueued', 'maxRenderMs', 'workerOldGenerationMb', 'maxCacheBytes',
        'maxCacheEntries', 'cacheTtlMs',
    ]
    if (positiveIntegers.some((key) => !Number.isSafeInteger(limits[key]) || limits[key] < 0)
        || limits.maxSourceBytes < 1 || limits.maxPages < 1 || limits.maxPdfBytes < 1
        || limits.maxSpans < 1 || limits.maxGlyphWidthCacheEntries < 1
        || limits.yieldEveryGraphemes < 1 || limits.maxConcurrent < 1
        || limits.maxRenderMs < 1 || limits.workerOldGenerationMb < 64) {
        throw new PageFoldPdfError('PDF_LIMITS_INVALID', 'Invalid PageFold renderer limits')
    }
    return Object.freeze(limits)
}

function encodeHeader(header) {
    return '{'
        + '"type":"pagefold-transcript"'
        + ',"version":1'
        + ',"sourceMessageCount":' + header.sourceMessageCount
        + ',"messageCount":' + header.messageCount
        + ',"task":' + encodeJsonString(header.task)
        + ',"mode":' + encodeJsonString(header.mode)
        + '}'
}

function encodeMessage(message) {
    return '{'
        + '"type":"message"'
        + ',"index":' + message.index
        + ',"sourceIndex":' + message.sourceIndex
        + ',"role":' + encodeJsonString(message.role)
        + ',"name":' + (message.name === null ? 'null' : encodeJsonString(message.name))
        + ',"toolCallId":' + (message.toolCallId === null ? 'null' : encodeJsonString(message.toolCallId))
        + ',"content":' + encodeJsonString(message.content)
        + ',"attachments":[]'
        + '}'
}

function encodeJsonString(value) {
    let out = '"'
    for (let index = 0; index < value.length; index++) {
        const unit = value.charCodeAt(index)
        if (unit === 0x22) { out += '\\"'; continue }
        if (unit === 0x5C) { out += '\\\\'; continue }
        if (unit === 0x08) { out += '\\b'; continue }
        if (unit === 0x09) { out += '\\t'; continue }
        if (unit === 0x0A) { out += '\\n'; continue }
        if (unit === 0x0C) { out += '\\f'; continue }
        if (unit === 0x0D) { out += '\\r'; continue }
        if (unit <= 0x1F || (unit >= 0x7F && unit <= 0x9F)) {
            out += escapeUnit(unit)
            continue
        }
        if (unit >= 0xD800 && unit <= 0xDBFF) {
            const next = value.charCodeAt(index + 1)
            if (next >= 0xDC00 && next <= 0xDFFF) {
                const codePoint = ((unit - 0xD800) * 0x400) + (next - 0xDC00) + 0x10000
                if (mustEscape(codePoint)) out += escapeUnit(unit) + escapeUnit(next)
                else out += value[index] + value[index + 1]
                index++
                continue
            }
            out += escapeUnit(unit)
            continue
        }
        if (unit >= 0xDC00 && unit <= 0xDFFF) {
            out += escapeUnit(unit)
            continue
        }
        if (mustEscape(unit)) out += escapeUnit(unit)
        else out += value[index]
    }
    return out + '"'
}

function mustEscape(codePoint) {
    return codePoint === 0x061C || codePoint === 0x180E
        || (codePoint >= 0x200B && codePoint <= 0x200F)
        || (codePoint >= 0x2028 && codePoint <= 0x202E)
        || (codePoint >= 0x2060 && codePoint <= 0x206F)
        || (codePoint >= 0xFE00 && codePoint <= 0xFE0F)
        || codePoint === 0xFEFF
        || (codePoint >= 0xFFF9 && codePoint <= 0xFFFB)
        || (codePoint >= 0xE0000 && codePoint <= 0xE007F)
        || (codePoint >= 0xE0100 && codePoint <= 0xE01EF)
}

function escapeUnit(unit) {
    return '\\u' + unit.toString(16).toUpperCase().padStart(4, '0')
}

function isCount(value) {
    return Number.isSafeInteger(value) && value >= 0
}

function nonCanonical() {
    throw new PageFoldPdfError('PDF_CANONICAL_NON_CANONICAL', 'PageFold JSONL does not use the canonical escape form')
}

function throwIfAborted(signal) {
    if (signal?.aborted) throw abortError()
}

function abortError() {
    const error = new PageFoldPdfError('PDF_RENDER_ABORTED', 'PageFold PDF rendering was aborted')
    error.name = 'AbortError'
    return error
}

module.exports = {
    PAGEFOLD_RENDER_VERSION,
    PAGEFOLD_LAYOUT_VERSION,
    PAGEFOLD_SERIALIZER_VERSION,
    PAGEFOLD_LAYOUT_V1,
    PAGEFOLD_PROTOTYPE_LIMITS,
    PageFoldPdfError,
    createPageFoldPdfService,
    validateCanonicalBytes,
}
