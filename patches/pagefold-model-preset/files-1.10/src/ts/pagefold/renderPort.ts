import type { PageFoldQualifiedRouteProfile } from './qualifiedRoute'

export interface PageFoldRenderRequest {
    version: 1
    routeProfileId: PageFoldQualifiedRouteProfile['id']
    serializerVersion: 1
    layoutVersion: 1
    fontVersion: PageFoldQualifiedRouteProfile['fontVersion']
    canonicalUtf8: Uint8Array
}

export interface PageFoldRenderResult {
    pdfBytes: Uint8Array
    pdfSha256: string
    sourceBytes: number
    pageCount: number
    serializerVersion: 1
    layoutVersion: 1
    fontVersion: PageFoldQualifiedRouteProfile['fontVersion']
    cacheStatus: 'miss' | 'shared' | 'memory'
}

export interface PageFoldRenderPort {
    render(request: PageFoldRenderRequest, signal?: AbortSignal): Promise<PageFoldRenderResult>
}

export type PageFoldRenderPortErrorCode =
    | 'PAGEFOLD_RENDER_PORT_MISSING'
    | 'PAGEFOLD_RENDER_REQUEST_INVALID'
    | 'PAGEFOLD_RENDER_AUTH_FAILED'
    | 'PAGEFOLD_RENDER_HTTP_FAILED'
    | 'PAGEFOLD_RENDER_RESPONSE_INVALID'
    | 'PAGEFOLD_RENDER_HASH_MISMATCH'

export class PageFoldRenderPortError extends Error {
    readonly code: PageFoldRenderPortErrorCode
    readonly status?: number
    readonly retryable: boolean

    constructor(
        code: PageFoldRenderPortErrorCode,
        message: string,
        options: { status?: number, retryable?: boolean, cause?: unknown } = {},
    ) {
        super(message, options.cause !== undefined ? { cause: options.cause } : undefined)
        this.name = 'PageFoldRenderPortError'
        this.code = code
        this.status = options.status
        this.retryable = options.retryable === true
    }
}
