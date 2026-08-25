import type {
    AdapterChatMessage,
    AdapterDocumentPart,
    AdapterPageFoldWireContext,
} from 'src/ts/preset/adapter'
import type { ModelPreset, ResolvedTask } from 'src/ts/preset/types'
import {
    serializePageFoldCanonicalTranscript,
    type PageFoldBindingSource,
    type PageFoldCanonicalTranscript,
} from './canonicalTranscript'
import {
    PAGEFOLD_BALANCED_CONTINUATION_V1,
    PAGEFOLD_DIRECTIVE_VERSION,
    PAGEFOLD_MAXIMUM_CONTINUATION_V1,
    PAGEFOLD_SYSTEM_DECODER_V1,
    pageFoldContinuationDirective,
} from './directives'
import { PAGEFOLD_QUALIFIED_ROUTE } from './qualifiedRoute'
import type { ResolvedPageFoldState } from './resolve'
import type { PageFoldRenderPort, PageFoldRenderResult } from './renderPort'

export interface PreparePageFoldInput {
    state: Extract<ResolvedPageFoldState, { kind: 'on' }>
    preset: ModelPreset
    task: ResolvedTask
    binding: { source: PageFoldBindingSource, moduleId?: string }
    messages: readonly AdapterChatMessage[]
    renderPort: PageFoldRenderPort
    signal?: AbortSignal
}

export interface PreparedPageFoldWire {
    messages: AdapterChatMessage[]
    context: AdapterPageFoldWireContext
    canonical: PageFoldCanonicalTranscript
    render: PageFoldRenderResult
}

export async function preparePageFoldWire(input: PreparePageFoldInput): Promise<PreparedPageFoldWire> {
    const route = input.state.route
    if (route !== PAGEFOLD_QUALIFIED_ROUTE || input.state.logicalTask !== input.task) {
        throw new Error('PageFold state does not match the immutable request context')
    }
    const canonical = serializePageFoldCanonicalTranscript({
        version: 1,
        task: input.task,
        binding: input.binding,
        preset: {
            id: input.preset.id,
            updatedAt: input.preset.updatedAt,
            profileId: input.preset.profileSnapshot.profileId,
            profileVersion: input.preset.profileSnapshot.profileVersion,
            providerBaseVersion: input.preset.profileSnapshot.providerBaseVersion,
            wireModel: route.requestedModel,
        },
        config: {
            mode: input.state.mode,
            routeProfileId: route.id,
            serializerVersion: route.serializerVersion,
            layoutVersion: route.layoutVersion,
            fontVersion: route.fontVersion,
            directiveVersion: route.directiveVersion,
            wirePredictionVersion: route.wirePredictionVersion,
        },
        messages: input.messages,
    })
    const render = await input.renderPort.render({
        version: 1,
        routeProfileId: route.id,
        serializerVersion: route.serializerVersion,
        layoutVersion: route.layoutVersion,
        fontVersion: route.fontVersion,
        canonicalUtf8: canonical.bytes,
    }, input.signal)
    if (render.sourceBytes !== canonical.bytes.byteLength
        || render.pageCount < 1
        || render.pageCount > route.maxPdfPages
        || render.pdfBytes.byteLength < 1
        || render.pdfBytes.byteLength > route.maxPdfBytes
        || !/^[a-f0-9]{64}$/.test(render.pdfSha256)) {
        throw new Error('PageFold renderer result does not match the qualified route')
    }

    const document: AdapterDocumentPart = {
        kind: 'document',
        mime: 'application/pdf',
        filename: 'pagefold-v1.pdf',
        bytes: new Uint8Array(render.pdfBytes),
        pageCount: render.pageCount,
        byteLength: render.pdfBytes.byteLength,
        sha256: render.pdfSha256,
        mediaResolution: 'low',
    }
    const messages: AdapterChatMessage[] = [
        { role: 'system', content: PAGEFOLD_SYSTEM_DECODER_V1 },
        ...canonical.retainedSystemMessages.map(({ message }) => ({
            role: 'system' as const,
            content: message.content,
        })),
        {
            role: 'user',
            content: pageFoldContinuationDirective(input.state.mode),
            documents: [document],
        },
    ]
    const context: AdapterPageFoldWireContext = {
        routeProfileId: route.id,
        mode: input.state.mode,
        directiveVersion: PAGEFOLD_DIRECTIVE_VERSION,
        documentSha256: render.pdfSha256,
        pageCount: render.pageCount,
        pdfBytes: render.pdfBytes.byteLength,
    }
    return { messages, context, canonical, render }
}

export const PAGEFOLD_PRODUCTION_DIRECTIVES = Object.freeze({
    system: PAGEFOLD_SYSTEM_DECODER_V1,
    maximum: PAGEFOLD_MAXIMUM_CONTINUATION_V1,
    balanced: PAGEFOLD_BALANCED_CONTINUATION_V1,
})
