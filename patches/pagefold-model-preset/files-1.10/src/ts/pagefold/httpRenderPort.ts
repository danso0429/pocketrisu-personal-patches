import { Sha256 } from '@aws-crypto/sha256-js'
import {
    PAGEFOLD_QUALIFIED_ROUTE,
    PAGEFOLD_ROUTE_PROFILE_ID,
} from './qualifiedRoute'
import {
    PageFoldRenderPortError,
    type PageFoldRenderPort,
    type PageFoldRenderRequest,
    type PageFoldRenderResult,
} from './renderPort'

const RENDER_URL = '/api/pagefold/render'

export interface PageFoldHttpRenderPortOptions {
    fetchImpl?: typeof fetch
    createAuth?: () => Promise<string>
}

export function createPageFoldHttpRenderPort(
    options: PageFoldHttpRenderPortOptions = {},
): PageFoldRenderPort {
    const fetchImpl = options.fetchImpl ?? globalThis.fetch
    const createAuth = options.createAuth ?? defaultCreateAuth
    if (typeof fetchImpl !== 'function') {
        throw new PageFoldRenderPortError(
            'PAGEFOLD_RENDER_PORT_MISSING',
            'PageFold HTTP render fetch is unavailable',
        )
    }

    return Object.freeze({
        async render(request: PageFoldRenderRequest, signal?: AbortSignal): Promise<PageFoldRenderResult> {
            validateRequest(request)
            let auth: string
            try {
                auth = await createAuth()
            } catch (error) {
                throw new PageFoldRenderPortError(
                    'PAGEFOLD_RENDER_AUTH_FAILED',
                    'PageFold render authentication could not be prepared',
                    { cause: error },
                )
            }
            if (!auth) {
                throw new PageFoldRenderPortError(
                    'PAGEFOLD_RENDER_AUTH_FAILED',
                    'PageFold render authentication is empty',
                )
            }

            let response: Response
            try {
                response = await fetchImpl(RENDER_URL, {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/octet-stream',
                        'risu-auth': auth,
                        'x-pagefold-protocol': '1',
                        'x-pagefold-route-profile': request.routeProfileId,
                        'x-pagefold-serializer': String(request.serializerVersion),
                        'x-pagefold-layout': String(request.layoutVersion),
                        'x-pagefold-font': request.fontVersion,
                    },
                    body: request.canonicalUtf8,
                    signal,
                })
            } catch (error) {
                if (signal?.aborted) throw error
                throw new PageFoldRenderPortError(
                    'PAGEFOLD_RENDER_HTTP_FAILED',
                    'PageFold render request failed before a response',
                    { retryable: true, cause: error },
                )
            }

            if (!response.ok) {
                const code = response.status === 401 || response.status === 403
                    ? 'PAGEFOLD_RENDER_AUTH_FAILED'
                    : 'PAGEFOLD_RENDER_HTTP_FAILED'
                throw new PageFoldRenderPortError(
                    code,
                    await boundedErrorMessage(response),
                    {
                        status: response.status,
                        retryable: response.status === 429 || response.status >= 500,
                    },
                )
            }
            const contentType = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase()
            if (contentType !== 'application/pdf') invalidResponse('PageFold render response is not a PDF')

            const sourceBytes = exactIntegerHeader(response.headers, 'x-pagefold-source-bytes', 1, PAGEFOLD_QUALIFIED_ROUTE.maxCanonicalBytes)
            const pdfBytesHeader = exactIntegerHeader(response.headers, 'x-pagefold-pdf-bytes', 1, PAGEFOLD_QUALIFIED_ROUTE.maxPdfBytes)
            const pageCount = exactIntegerHeader(response.headers, 'x-pagefold-pages', 1, PAGEFOLD_QUALIFIED_ROUTE.maxPdfPages)
            const serializerVersion = exactLiteralHeader(response.headers, 'x-pagefold-serializer', '1')
            const layoutVersion = exactLiteralHeader(response.headers, 'x-pagefold-layout', '1')
            const fontVersion = exactLiteralHeader(response.headers, 'x-pagefold-font', PAGEFOLD_QUALIFIED_ROUTE.fontVersion)
            const cacheStatus = exactEnumHeader(response.headers, 'x-pagefold-cache-status', ['miss', 'shared', 'memory'] as const)
            const claimedSha = exactShaHeader(response.headers, 'x-pagefold-pdf-sha256')

            if (sourceBytes !== request.canonicalUtf8.byteLength) {
                invalidResponse('PageFold render source-byte metadata does not match the request')
            }
            const contentLength = response.headers.get('content-length')
            if (contentLength !== null && parseExactInteger(contentLength, 1, PAGEFOLD_QUALIFIED_ROUTE.maxPdfBytes) !== pdfBytesHeader) {
                invalidResponse('PageFold render Content-Length does not match PDF metadata')
            }

            const buffer = await response.arrayBuffer()
            const pdfBytes = new Uint8Array(buffer)
            if (pdfBytes.byteLength !== pdfBytesHeader) {
                invalidResponse('PageFold render PDF byte count does not match metadata')
            }
            const actualSha = await sha256Hex(pdfBytes)
            if (actualSha !== claimedSha) {
                throw new PageFoldRenderPortError(
                    'PAGEFOLD_RENDER_HASH_MISMATCH',
                    'PageFold render PDF hash does not match the response bytes',
                )
            }
            return {
                pdfBytes,
                pdfSha256: actualSha,
                sourceBytes,
                pageCount,
                serializerVersion: Number(serializerVersion) as 1,
                layoutVersion: Number(layoutVersion) as 1,
                fontVersion,
                cacheStatus,
            }
        },
    })
}

function validateRequest(request: PageFoldRenderRequest): void {
    if (!request || request.version !== 1
        || request.routeProfileId !== PAGEFOLD_ROUTE_PROFILE_ID
        || request.serializerVersion !== 1
        || request.layoutVersion !== 1
        || request.fontVersion !== PAGEFOLD_QUALIFIED_ROUTE.fontVersion
        || !(request.canonicalUtf8 instanceof Uint8Array)
        || request.canonicalUtf8.byteLength < 1
        || request.canonicalUtf8.byteLength > PAGEFOLD_QUALIFIED_ROUTE.maxCanonicalBytes) {
        throw new PageFoldRenderPortError(
            'PAGEFOLD_RENDER_REQUEST_INVALID',
            'PageFold render request does not match the qualified profile',
        )
    }
}

async function defaultCreateAuth(): Promise<string> {
    const { forageStorage } = await import('src/ts/globalApi.svelte')
    return forageStorage.createAuth()
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
    const hasher = new Sha256()
    hasher.update(bytes)
    const digest = await hasher.digest()
    return Array.from(digest, (value) => value.toString(16).padStart(2, '0')).join('')
}

async function boundedErrorMessage(response: Response): Promise<string> {
    try {
        const text = (await response.text()).slice(0, 1_000)
        const parsed = JSON.parse(text) as { code?: unknown, message?: unknown }
        const code = typeof parsed.code === 'string' ? parsed.code.slice(0, 80) : 'PAGEFOLD_RENDER_HTTP_FAILED'
        const message = typeof parsed.message === 'string' ? parsed.message.slice(0, 500) : 'PageFold render request was rejected'
        return `${code}: ${message}`
    } catch {
        return `PageFold render request was rejected (${response.status})`
    }
}

function exactLiteralHeader<const T extends string>(headers: Headers, name: string, expected: T): T {
    const value = headers.get(name)
    if (value !== expected) invalidResponse(`PageFold render header ${name} is invalid`)
    return expected
}

function exactEnumHeader<const T extends readonly string[]>(headers: Headers, name: string, allowed: T): T[number] {
    const value = headers.get(name)
    if (!value || value.includes(',') || !allowed.includes(value)) {
        invalidResponse(`PageFold render header ${name} is invalid`)
    }
    return value as T[number]
}

function exactIntegerHeader(headers: Headers, name: string, min: number, max: number): number {
    const value = headers.get(name)
    if (value === null) invalidResponse(`PageFold render header ${name} is missing`)
    return parseExactInteger(value, min, max)
}

function parseExactInteger(value: string, min: number, max: number): number {
    if (!/^(0|[1-9][0-9]*)$/.test(value)) invalidResponse('PageFold render integer metadata is malformed')
    const parsed = Number(value)
    if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
        invalidResponse('PageFold render integer metadata is out of range')
    }
    return parsed
}

function exactShaHeader(headers: Headers, name: string): string {
    const value = headers.get(name)
    if (!value || !/^[a-f0-9]{64}$/.test(value)) invalidResponse(`PageFold render header ${name} is invalid`)
    return value
}

function invalidResponse(message: string): never {
    throw new PageFoldRenderPortError('PAGEFOLD_RENDER_RESPONSE_INVALID', message)
}
