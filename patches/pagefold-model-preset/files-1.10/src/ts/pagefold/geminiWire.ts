import type {
    AdapterChatMessage,
    AdapterDocumentPart,
    AdapterPageFoldWireContext,
} from 'src/ts/preset/adapter/types'
import { ModelPresetAdapterError } from 'src/ts/preset/adapter/error'
import type { ModelPreset } from 'src/ts/preset/types'
import {
    PAGEFOLD_BALANCED_CONTINUATION_V1,
    PAGEFOLD_MAXIMUM_CONTINUATION_V1,
    PAGEFOLD_SYSTEM_DECODER_V1,
} from './directives'
import { resolvePageFoldQualifiedRoute } from './qualifiedRoute'

export interface PageFoldGeminiPart {
    text?: string
    inlineData?: { mimeType: string, data: string }
    mediaResolution?: { level: 'MEDIA_RESOLUTION_LOW' }
}

export function assertPageFoldGeminiInput(
    preset: ModelPreset,
    messages: readonly AdapterChatMessage[],
    context: AdapterPageFoldWireContext,
    options: { toolsPresent: boolean, cachePresent: boolean },
): AdapterDocumentPart {
    const route = resolvePageFoldQualifiedRoute(preset)
    if (route.ok === false
        || route.route.id !== context.routeProfileId
        || route.route.requestedModel !== context.wireModel
        || route.route.mediaResolutionPlacement !== context.mediaResolutionPlacement) {
        invalid('PageFold route changed before Gemini preparation')
    }
    const resolvedRoute = route.route
    if (options.toolsPresent) invalid('PageFold does not admit tool-enabled requests')
    if (options.cachePresent) invalid('PageFold does not admit PocketRisu explicit caching')
    if (context.directiveVersion !== resolvedRoute.directiveVersion
        || context.pageCount < 1 || context.pageCount > resolvedRoute.maxPdfPages
        || context.pdfBytes < 1 || context.pdfBytes > resolvedRoute.maxPdfBytes
        || !Number.isSafeInteger(context.outputReserve) || context.outputReserve < 1
        || context.outputReserve > resolvedRoute.profileMaxOutputTokens
        || !Number.isSafeInteger(context.predictedWireInputTokens) || context.predictedWireInputTokens < 1
        || context.wireContextLimit !== resolvedRoute.wireContextLimitTokens
        || context.predictedWireInputTokens + context.outputReserve > context.wireContextLimit
        || !/^[a-f0-9]{64}$/.test(context.documentSha256)) invalid('PageFold wire context is invalid')

    if (messages.length < 2
        || messages[0].role !== 'system'
        || messages[0].content !== PAGEFOLD_SYSTEM_DECODER_V1) invalid('PageFold decoder system message is missing')
    const synthetic = messages[messages.length - 1]
    const expectedContinuation = context.mode === 'maximum'
        ? PAGEFOLD_MAXIMUM_CONTINUATION_V1
        : PAGEFOLD_BALANCED_CONTINUATION_V1
    if (synthetic.role !== 'user'
        || synthetic.content !== expectedContinuation
        || (synthetic.documents?.length ?? 0) !== 1
        || (synthetic.images?.length ?? 0) !== 0
        || synthetic.toolCalls !== undefined
        || synthetic.reasoning !== undefined
        || synthetic.providerEcho !== undefined
        || messages.slice(0, -1).some((message) => message.role !== 'system' || (message.documents?.length ?? 0) > 0)) {
        invalid('PageFold synthetic message shape is invalid')
    }
    const document = synthetic.documents![0]
    if (document.kind !== 'document'
        || document.mime !== 'application/pdf'
        || document.filename !== 'pagefold-v1.pdf'
        || !(document.bytes instanceof Uint8Array)
        || document.bytes.byteLength !== document.byteLength
        || document.byteLength !== context.pdfBytes
        || document.pageCount !== context.pageCount
        || document.sha256 !== context.documentSha256
        || document.mediaResolution !== 'low') invalid('PageFold PDF document metadata is invalid')
    return document
}

export function toPageFoldGeminiUserParts(
    message: AdapterChatMessage,
    context: AdapterPageFoldWireContext,
): PageFoldGeminiPart[] {
    const document = message.documents?.[0]
    if (!document || message.documents?.length !== 1) invalid('PageFold PDF document is missing')
    if (document.byteLength !== context.pdfBytes
        || document.pageCount !== context.pageCount
        || document.sha256 !== context.documentSha256) invalid('PageFold PDF document changed before wire conversion')
    const pdfPart: PageFoldGeminiPart = {
        inlineData: {
            mimeType: 'application/pdf',
            data: bytesToBase64(document.bytes),
        },
    }
    if (context.mediaResolutionPlacement === 'part') {
        pdfPart.mediaResolution = { level: 'MEDIA_RESOLUTION_LOW' }
    }
    return [
        pdfPart,
        { text: message.content },
    ]
}

export function applyPageFoldGeminiMediaResolution(
    body: Record<string, unknown>,
    context: AdapterPageFoldWireContext,
): void {
    const existing = body.generationConfig
    if (existing !== undefined && (!existing || typeof existing !== 'object' || Array.isArray(existing))) {
        invalid('PageFold generationConfig is invalid')
    }
    const generationConfig = existing as Record<string, unknown> | undefined
    const configured = generationConfig?.mediaResolution
    if (context.mediaResolutionPlacement === 'part') {
        if (configured !== undefined) invalid('PageFold contains another media-resolution authority')
        return
    }
    if (configured !== undefined && configured !== 'MEDIA_RESOLUTION_LOW') {
        invalid('PageFold contains another media-resolution authority')
    }
    body.generationConfig = {
        ...(generationConfig ?? {}),
        mediaResolution: 'MEDIA_RESOLUTION_LOW',
    }
}

export function assertPreparedPageFoldGeminiBody(
    body: Record<string, unknown>,
    context: AdapterPageFoldWireContext,
): void {
    if ('tools' in body || 'toolConfig' in body || 'cachedContent' in body) {
        invalid('PageFold prepared body contains a blocked tool/cache field')
    }
    const contents = body.contents
    if (!Array.isArray(contents) || contents.length !== 1) invalid('PageFold prepared body must contain one user turn')
    const content = contents[0] as Record<string, unknown>
    const parts = content?.parts
    if (content?.role !== 'user' || !Array.isArray(parts) || parts.length !== 2) {
        invalid('PageFold prepared user turn is invalid')
    }
    const pdf = parts[0] as Record<string, any>
    const text = parts[1] as Record<string, unknown>
    if (pdf?.inlineData?.mimeType !== 'application/pdf'
        || typeof pdf?.inlineData?.data !== 'string'
        || pdf.inlineData.data.length < 1
        || 'filename' in pdf.inlineData
        || typeof text?.text !== 'string') invalid('PageFold prepared PDF-first parts are invalid')
    const generationConfig = body.generationConfig
    const globalResolution = generationConfig && typeof generationConfig === 'object'
        ? (generationConfig as Record<string, unknown>).mediaResolution
        : undefined
    if (context.mediaResolutionPlacement === 'part') {
        if (pdf?.mediaResolution?.level !== 'MEDIA_RESOLUTION_LOW' || globalResolution !== undefined) {
            invalid('PageFold per-part media resolution is invalid')
        }
    } else if (pdf?.mediaResolution !== undefined || globalResolution !== 'MEDIA_RESOLUTION_LOW') {
        invalid('PageFold global media resolution is invalid')
    }
    const mediaResolutionValues = collectPropertyValues(body, 'mediaResolution')
    if (mediaResolutionValues.length !== 1) {
        invalid('PageFold prepared body contains another media-resolution authority')
    }
    const expected = context.mode === 'maximum'
        ? PAGEFOLD_MAXIMUM_CONTINUATION_V1
        : PAGEFOLD_BALANCED_CONTINUATION_V1
    if (text.text !== expected) invalid('PageFold continuation directive changed during preparation')
    const finalOutput = generationConfig && typeof generationConfig === 'object'
        ? (generationConfig as Record<string, unknown>).maxOutputTokens
        : undefined
    if (finalOutput !== context.outputReserve) {
        invalid('PageFold final output limit differs from the source-budget authority')
    }
}

function collectPropertyValues(value: unknown, key: string, out: unknown[] = []): unknown[] {
    if (Array.isArray(value)) {
        for (const item of value) collectPropertyValues(item, key, out)
        return out
    }
    if (!value || typeof value !== 'object') return out
    for (const [childKey, child] of Object.entries(value as Record<string, unknown>)) {
        if (childKey === key) out.push(child)
        collectPropertyValues(child, key, out)
    }
    return out
}

function bytesToBase64(bytes: Uint8Array): string {
    let binary = ''
    const chunkSize = 0x8000
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
    }
    return btoa(binary)
}

function invalid(message: string): never {
    throw new ModelPresetAdapterError('invalid-request', message, {
        retryable: false,
        fallbackEligible: false,
    })
}
