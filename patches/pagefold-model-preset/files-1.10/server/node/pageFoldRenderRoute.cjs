'use strict'

const {
    PAGEFOLD_FONT_VERSION,
} = require('./pageFoldFontCache.cjs')
const {
    PAGEFOLD_PROTOTYPE_LIMITS,
    createPageFoldPdfService,
} = require('./pageFoldPdfService.cjs')

const ROUTE = '/api/pagefold/render'
const ROUTE_PROFILE_ID = 'vertex-gemini-3.7-flash-low-v8'

function registerPageFoldRenderRoute(app, deps = {}) {
    if (!app || typeof app.post !== 'function') throw new Error('PageFold render route requires an Express app')
    const checkAuth = deps.checkAuth
    const checkActiveSession = deps.checkActiveSession
    const pdfService = deps.pdfService || createPageFoldPdfService()
    if (typeof checkAuth !== 'function' || typeof checkActiveSession !== 'function') {
        throw new Error('PageFold render route requires existing auth authorities')
    }

    app.post(ROUTE, async (req, res) => {
        if (!await checkAuth(req, res)) return
        if (!checkActiveSession(req, res)) return

        const controller = new AbortController()
        let finished = false
        const abort = () => { if (!finished) controller.abort() }
        req.once('aborted', abort)
        res.once('close', abort)
        try {
            validateHeaders(req)
            if (!Buffer.isBuffer(req.body)
                || req.body.byteLength < 1
                || req.body.byteLength > PAGEFOLD_PROTOTYPE_LIMITS.maxSourceBytes) {
                throw routeError('PAGEFOLD_RENDER_BODY_INVALID', 413, 'PageFold canonical body is outside the qualified byte limit')
            }
            const result = await pdfService.render({
                version: 1,
                routeProfileId: ROUTE_PROFILE_ID,
                serializerVersion: 1,
                layoutVersion: 1,
                fontVersion: PAGEFOLD_FONT_VERSION,
                canonicalBytes: new Uint8Array(req.body.buffer, req.body.byteOffset, req.body.byteLength),
            }, controller.signal)
            if (!result || !Buffer.isBuffer(result.pdf)
                || result.pdfBytes !== result.pdf.byteLength
                || result.sourceBytes !== req.body.byteLength
                || result.pageCount < 1
                || result.pageCount > PAGEFOLD_PROTOTYPE_LIMITS.maxPages
                || !/^[a-f0-9]{64}$/.test(result.sha256 || '')) {
                throw routeError('PAGEFOLD_RENDER_RESULT_INVALID', 500, 'PageFold renderer returned invalid bounded metadata')
            }
            res.status(200)
            res.setHeader('content-type', 'application/pdf')
            res.setHeader('cache-control', 'no-store')
            res.setHeader('x-pagefold-pdf-sha256', result.sha256)
            res.setHeader('x-pagefold-source-bytes', String(result.sourceBytes))
            res.setHeader('x-pagefold-pdf-bytes', String(result.pdfBytes))
            res.setHeader('x-pagefold-pages', String(result.pageCount))
            res.setHeader('x-pagefold-serializer', '1')
            res.setHeader('x-pagefold-layout', '1')
            res.setHeader('x-pagefold-font', PAGEFOLD_FONT_VERSION)
            res.setHeader('x-pagefold-cache-status', result.cacheStatus || (result.cacheHit ? 'memory' : 'miss'))
            finished = true
            res.end(result.pdf)
        } catch (error) {
            if (res.headersSent) return
            const status = statusFor(error)
            const code = safeCode(error?.code)
            const message = safeMessage(error, status)
            finished = true
            res.status(status).json({ code, message })
        } finally {
            finished = true
            req.removeListener('aborted', abort)
            res.removeListener('close', abort)
        }
    })
    return Object.freeze({ route: ROUTE, pdfService })
}

function validateHeaders(req) {
    if (String(req.headers['content-type'] || '').split(';', 1)[0].trim().toLowerCase() !== 'application/octet-stream') {
        throw routeError('PAGEFOLD_RENDER_CONTENT_TYPE', 415, 'PageFold render requires application/octet-stream')
    }
    requireUniqueHeader(req, 'x-pagefold-protocol', '1')
    requireUniqueHeader(req, 'x-pagefold-route-profile', ROUTE_PROFILE_ID)
    requireUniqueHeader(req, 'x-pagefold-serializer', '1')
    requireUniqueHeader(req, 'x-pagefold-layout', '1')
    requireUniqueHeader(req, 'x-pagefold-font', PAGEFOLD_FONT_VERSION)
}

function requireUniqueHeader(req, name, expected) {
    const count = Array.isArray(req.rawHeaders)
        ? req.rawHeaders.filter((value, index) => index % 2 === 0 && String(value).toLowerCase() === name).length
        : 1
    if (count !== 1 || req.headers[name] !== expected) {
        throw routeError('PAGEFOLD_RENDER_HEADER_INVALID', 400, `PageFold render header ${name} is invalid`)
    }
}

function statusFor(error) {
    if (error?.name === 'AbortError' || error?.code === 'PDF_RENDER_ABORTED') return 499
    if (Number.isInteger(error?.status)) return error.status
    if (error?.code === 'PDF_RENDER_BUSY') return 503
    if (error?.code === 'PDF_RENDER_TIMEOUT') return 504
    if (typeof error?.code === 'string' && (
        error.code.startsWith('PDF_CANONICAL')
        || error.code === 'PDF_REQUEST_INVALID'
        || error.code === 'PDF_SOURCE_LIMIT'
    )) return 400
    return 500
}

function safeCode(value) {
    return typeof value === 'string' && /^[A-Z0-9_]{1,80}$/.test(value)
        ? value
        : 'PAGEFOLD_RENDER_FAILED'
}

function safeMessage(error, status) {
    if (status >= 500) return 'PageFold rendering failed'
    const message = typeof error?.message === 'string' ? error.message : 'PageFold render request was rejected'
    return message.replace(/[\r\n]/g, ' ').slice(0, 500)
}

function routeError(code, status, message) {
    const error = new Error(message)
    error.code = code
    error.status = status
    return error
}

registerPageFoldRenderRoute.ROUTE = ROUTE
module.exports = registerPageFoldRenderRoute
