import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'

const registerPageFoldRenderRoute = require('./pageFoldRenderRoute.cjs')
const FONT_VERSION = 'google-fonts-ec626514f79f831f1ab848a82114a0ce7e2d6372'
const PROFILE_ID = 'vertex-gemini-3.7-flash-low-v8'
const canonical = Buffer.from(
    '{"type":"pagefold-transcript","version":1,"sourceMessageCount":0,"messageCount":0,"task":"model","mode":"maximum"}\n',
)
const pdf = Buffer.from('%PDF-1.7\nroute-unit\n%%EOF')
const sha = createHash('sha256').update(pdf).digest('hex')

function setup(render = vi.fn(async (request: any) => ({
    pdf: Buffer.from(pdf),
    pdfBytes: pdf.byteLength,
    sourceBytes: request.canonicalBytes.byteLength,
    pageCount: 1,
    sha256: sha,
    cacheStatus: 'miss',
}))) {
    let handler: (req: any, res: any) => Promise<void>
    const app = {
        post(path: string, candidate: typeof handler) {
            expect(path).toBe('/api/pagefold/render')
            handler = candidate
        },
    }
    registerPageFoldRenderRoute(app, {
        checkAuth: async (req: any, res: any) => {
            if (req.headers['risu-auth'] === 'valid-auth') return true
            res.status(401).end()
            return false
        },
        checkActiveSession: () => true,
        pdfService: { render },
    })
    return { handler: handler!, render }
}

function request(overrides: Record<string, string> = {}) {
    const headers = {
        'content-type': 'application/octet-stream',
        'risu-auth': 'valid-auth',
        'x-pagefold-protocol': '1',
        'x-pagefold-route-profile': PROFILE_ID,
        'x-pagefold-serializer': '1',
        'x-pagefold-layout': '1',
        'x-pagefold-font': FONT_VERSION,
        ...overrides,
    }
    const req: any = new EventEmitter()
    req.headers = headers
    req.rawHeaders = Object.entries(headers).flatMap(([key, value]) => [key, value])
    req.body = Buffer.from(canonical)
    return req
}

function response() {
    const res: any = new EventEmitter()
    res.statusCode = 200
    res.headers = new Map<string, string>()
    res.headersSent = false
    res.body = null
    res.status = vi.fn((status: number) => { res.statusCode = status; return res })
    res.setHeader = vi.fn((key: string, value: string) => { res.headers.set(key.toLowerCase(), value) })
    res.json = vi.fn((value: unknown) => { res.body = value; res.headersSent = true; return res })
    res.end = vi.fn((value?: unknown) => { res.body = value ?? null; res.headersSent = true; return res })
    return res
}

describe('PageFold authenticated binary render route', () => {
    it('returns the exact renderer bytes and bounded metadata', async () => {
        const { handler, render } = setup()
        const req = request()
        const res = response()
        await handler(req, res)
        expect(res.statusCode).toBe(200)
        expect(res.body).toEqual(pdf)
        expect(Object.fromEntries(res.headers)).toMatchObject({
            'content-type': 'application/pdf',
            'cache-control': 'no-store',
            'x-pagefold-pdf-sha256': sha,
            'x-pagefold-source-bytes': String(canonical.byteLength),
            'x-pagefold-pdf-bytes': String(pdf.byteLength),
            'x-pagefold-pages': '1',
            'x-pagefold-cache-status': 'miss',
        })
        expect(render).toHaveBeenCalledOnce()
        expect(render.mock.calls[0][0]).toMatchObject({
            routeProfileId: PROFILE_ID,
            serializerVersion: 1,
            layoutVersion: 1,
            fontVersion: FONT_VERSION,
        })
        expect(Buffer.from(render.mock.calls[0][0].canonicalBytes)).toEqual(canonical)
    })

    it('rejects auth and wrong route metadata before renderer work', async () => {
        const { handler, render } = setup()
        const authReq = request({ 'risu-auth': 'invalid' })
        const authRes = response()
        await handler(authReq, authRes)
        expect(authRes.statusCode).toBe(401)

        const headerReq = request({ 'x-pagefold-route-profile': 'other' })
        const headerRes = response()
        await handler(headerReq, headerRes)
        expect(headerRes.statusCode).toBe(400)
        expect(headerRes.body).toEqual({
            code: 'PAGEFOLD_RENDER_HEADER_INVALID',
            message: 'PageFold render header x-pagefold-route-profile is invalid',
        })
        expect(render).not.toHaveBeenCalled()
    })

    it('does not reflect renderer secrets through a 500 error', async () => {
        const render = vi.fn(async () => {
            const error: any = new Error('private transcript marker and access token')
            error.code = 'PDF_WORKER_FAILED'
            throw error
        })
        const { handler } = setup(render)
        const res = response()
        await handler(request(), res)
        expect(res.statusCode).toBe(500)
        expect(res.body).toEqual({ code: 'PDF_WORKER_FAILED', message: 'PageFold rendering failed' })
        expect(JSON.stringify(res.body)).not.toContain('private transcript')
        expect(JSON.stringify(res.body)).not.toContain('access token')
    })

    it('aborts the renderer when the response closes before completion', async () => {
        let observedSignal: AbortSignal | undefined
        const render = vi.fn((_request: unknown, signal: AbortSignal) => {
            observedSignal = signal
            return new Promise((_resolve, reject) => signal.addEventListener('abort', () => {
                const error: any = new Error('aborted')
                error.name = 'AbortError'
                error.code = 'PDF_RENDER_ABORTED'
                reject(error)
            }, { once: true }))
        })
        const { handler } = setup(render)
        const req = request()
        const res = response()
        const pending = handler(req, res)
        await Promise.resolve()
        res.emit('close')
        await pending
        expect(observedSignal?.aborted).toBe(true)
        expect(res.statusCode).toBe(499)
    })
})
