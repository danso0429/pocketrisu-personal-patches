import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { PAGEFOLD_QUALIFIED_ROUTE } from './qualifiedRoute'
import { createPageFoldHttpRenderPort } from './httpRenderPort'

const canonical = new TextEncoder().encode(
    '{"type":"pagefold-transcript","version":1,"sourceMessageCount":0,"messageCount":0,"task":"model","mode":"maximum"}\n',
)
const pdf = new TextEncoder().encode('%PDF-1.7\nqualified\n%%EOF')
const sha = createHash('sha256').update(pdf).digest('hex')

function request() {
    return {
        version: 1 as const,
        routeProfileId: PAGEFOLD_QUALIFIED_ROUTE.id,
        serializerVersion: 1 as const,
        layoutVersion: 1 as const,
        fontVersion: PAGEFOLD_QUALIFIED_ROUTE.fontVersion,
        canonicalUtf8: canonical,
    }
}

function response(overrides: Record<string, string> = {}) {
    return new Response(pdf, {
        status: 200,
        headers: {
            'content-type': 'application/pdf',
            'content-length': String(pdf.byteLength),
            'x-pagefold-pdf-sha256': sha,
            'x-pagefold-source-bytes': String(canonical.byteLength),
            'x-pagefold-pdf-bytes': String(pdf.byteLength),
            'x-pagefold-pages': '1',
            'x-pagefold-serializer': '1',
            'x-pagefold-layout': '1',
            'x-pagefold-font': PAGEFOLD_QUALIFIED_ROUTE.fontVersion,
            'x-pagefold-cache-status': 'miss',
            ...overrides,
        },
    })
}

describe('PageFold browser HTTP render port', () => {
    it('sends exact binary protocol and independently verifies PDF metadata/hash', async () => {
        const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => response())
        const port = createPageFoldHttpRenderPort({
            fetchImpl: fetchImpl as typeof fetch,
            createAuth: async () => 'session-auth',
        })
        const result = await port.render(request())
        expect(result).toMatchObject({
            pdfSha256: sha,
            sourceBytes: canonical.byteLength,
            pageCount: 1,
            cacheStatus: 'miss',
        })
        expect(result.pdfBytes).toEqual(pdf)
        expect(fetchImpl).toHaveBeenCalledOnce()
        const [url, init] = fetchImpl.mock.calls[0]
        expect(url).toBe('/api/pagefold/render')
        expect(init?.method).toBe('POST')
        expect(init?.body).toBe(canonical)
        expect(init?.headers).toMatchObject({
            'risu-auth': 'session-auth',
            'x-pagefold-route-profile': PAGEFOLD_QUALIFIED_ROUTE.id,
            'x-pagefold-font': PAGEFOLD_QUALIFIED_ROUTE.fontVersion,
        })
    })

    it.each([
        ['hash', { 'x-pagefold-pdf-sha256': '0'.repeat(64) }, 'PAGEFOLD_RENDER_HASH_MISMATCH'],
        ['page range', { 'x-pagefold-pages': '9' }, 'PAGEFOLD_RENDER_RESPONSE_INVALID'],
        ['source mismatch', { 'x-pagefold-source-bytes': '1' }, 'PAGEFOLD_RENDER_RESPONSE_INVALID'],
        ['cache enum', { 'x-pagefold-cache-status': 'disk' }, 'PAGEFOLD_RENDER_RESPONSE_INVALID'],
        ['font', { 'x-pagefold-font': 'other' }, 'PAGEFOLD_RENDER_RESPONSE_INVALID'],
    ])('rejects invalid %s metadata', async (_label, headers, code) => {
        const port = createPageFoldHttpRenderPort({
            fetchImpl: async () => response(headers),
            createAuth: async () => 'session-auth',
        })
        await expect(port.render(request())).rejects.toMatchObject({ code })
    })

    it('keeps bounded server errors free of unparsed body data', async () => {
        const port = createPageFoldHttpRenderPort({
            fetchImpl: async () => new Response(JSON.stringify({
                code: 'PDF_RENDER_BUSY',
                message: 'PageFold renderer queue is full',
                ignored: 'secret transcript',
            }), { status: 503, headers: { 'content-type': 'application/json' } }),
            createAuth: async () => 'session-auth',
        })
        await expect(port.render(request())).rejects.toMatchObject({
            code: 'PAGEFOLD_RENDER_HTTP_FAILED',
            status: 503,
            retryable: true,
            message: 'PDF_RENDER_BUSY: PageFold renderer queue is full',
        })
    })
})
