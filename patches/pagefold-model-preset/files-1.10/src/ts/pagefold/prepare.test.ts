import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AdapterChatMessage } from 'src/ts/preset/adapter'
import type { ModelPreset } from 'src/ts/preset/types'
import {
    PAGEFOLD_BALANCED_CONTINUATION_V1,
    PAGEFOLD_MAXIMUM_CONTINUATION_V1,
    PAGEFOLD_SYSTEM_DECODER_V1,
} from './directives'
import { PAGEFOLD_QUALIFIED_ROUTE } from './qualifiedRoute'
import { resolvePageFoldSourceBudget } from './budget'
import { preparePageFoldWire } from './prepare'
import { getPageFoldRuntimeRenderPort, setPageFoldRuntimeRenderPortForTest } from './runtimePort'

vi.mock('src/ts/tokenizer', () => ({
    encodeWithTokenizer: async (text: string) => Array.from({ length: Math.ceil(text.length / 4) }, (_, index) => index),
}))

const pdf = new TextEncoder().encode('%PDF-1.7\nwire\n%%EOF')
const pdfSha = createHash('sha256').update(pdf).digest('hex')

function preset(mode: 'maximum' | 'balanced'): ModelPreset {
    return {
        id: 'preset-pagefold',
        name: 'PageFold',
        pageFold: { enabled: true, mode },
        profileSnapshot: {
            profileId: PAGEFOLD_QUALIFIED_ROUTE.profileId,
            profileVersion: PAGEFOLD_QUALIFIED_ROUTE.profileVersion,
            providerBaseId: PAGEFOLD_QUALIFIED_ROUTE.providerBaseId,
            providerBaseVersion: PAGEFOLD_QUALIFIED_ROUTE.providerBaseVersion,
            adapterKind: PAGEFOLD_QUALIFIED_ROUTE.adapterKind,
            endpoint: { kind: 'vertex-gemini' },
            auth: { kind: 'google-service-account', fields: ['serviceAccountJson'] },
            modelId: PAGEFOLD_QUALIFIED_ROUTE.requestedModel,
            schema: [],
            uiSchema: { groups: [], fields: [] },
            defaults: {},
            limits: {
                known: true,
                contextWindowTokens: PAGEFOLD_QUALIFIED_ROUTE.wireContextLimitTokens,
                maxOutputTokens: PAGEFOLD_QUALIFIED_ROUTE.profileMaxOutputTokens,
            },
        },
        userValues: {},
        createdAt: 1,
        updatedAt: 2,
    }
}

function state(mode: 'maximum' | 'balanced') {
    return {
        kind: 'on' as const,
        reason: 'qualified' as const,
        route: PAGEFOLD_QUALIFIED_ROUTE,
        mode,
        logicalTask: 'model' as const,
    }
}

function port() {
    return {
        render: vi.fn(async (request: any) => ({
            pdfBytes: pdf,
            pdfSha256: pdfSha,
            sourceBytes: request.canonicalUtf8.byteLength,
            pageCount: 1,
            serializerVersion: 1 as const,
            layoutVersion: 1 as const,
            fontVersion: PAGEFOLD_QUALIFIED_ROUTE.fontVersion,
            cacheStatus: 'miss' as const,
        })),
    }
}

function prepare(mode: 'maximum' | 'balanced', messages: AdapterChatMessage[]) {
    const renderPort = port()
    return {
        renderPort,
        output: preparePageFoldWire({
            state: state(mode),
            preset: preset(mode),
            task: 'model',
            binding: { source: 'chat' },
            messages,
            renderPort,
            sourceBudget: resolvePageFoldSourceBudget({
                preset: preset(mode), outputReserve: 8_192, databaseTokenizer: 'gemma',
            }),
            canonicalSourceTokenEstimate: 10,
        }),
    }
}

afterEach(() => {
    delete globalThis.__pageFoldRenderPort
    delete globalThis.__bgOrch
    setPageFoldRuntimeRenderPortForTest(undefined)
})

describe('PageFold production wire preparation', () => {
    it('freezes exact directive bytes without feasibility prompts', () => {
        const hash = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex')
        expect(hash(PAGEFOLD_SYSTEM_DECODER_V1)).toBe('b0772c5ad5f0e0cac82f43cff59dcc699ad06c38702c85a4daaebe98333ff4f6')
        expect(hash(PAGEFOLD_MAXIMUM_CONTINUATION_V1)).toBe('25958441a975d84cc5cbf76d7a94191aeee12dfad424ff1f954ed2decc3d4e77')
        expect(hash(PAGEFOLD_BALANCED_CONTINUATION_V1)).toBe('7f249ffa18dfe7802e507fb4eaeea8c9aedeae68d6dddcd5268b496e9bc63d76')
        for (const value of [PAGEFOLD_SYSTEM_DECODER_V1, PAGEFOLD_MAXIMUM_CONTINUATION_V1, PAGEFOLD_BALANCED_CONTINUATION_V1]) {
            expect(value).not.toMatch(/PAGEFOLD_RESPONSE_ORACLE|responseSchema|2048|B_START|L000000/)
        }
    })

    it('maximum mode sends decoder plus one PDF-first synthetic user turn', async () => {
        const { output, renderPort } = prepare('maximum', [
            { role: 'system', content: 'system rule' },
            { role: 'user', content: 'question' },
        ])
        const result = await output
        expect(result.messages).toHaveLength(2)
        expect(result.messages[0]).toEqual({ role: 'system', content: PAGEFOLD_SYSTEM_DECODER_V1 })
        expect(result.messages[1]).toMatchObject({
            role: 'user',
            content: PAGEFOLD_MAXIMUM_CONTINUATION_V1,
            documents: [{
                kind: 'document',
                mime: 'application/pdf',
                filename: 'pagefold-v1.pdf',
                pageCount: 1,
                byteLength: pdf.byteLength,
                sha256: pdfSha,
                mediaResolution: 'low',
            }],
        })
        expect(result.messages[1].documents?.[0].bytes).toEqual(pdf)
        expect(result.canonical.messages.map((message) => message.role)).toEqual(['system', 'user'])
        expect(renderPort.render).toHaveBeenCalledOnce()
    })

    it('balanced mode keeps native system order and removes those rows from the PDF', async () => {
        const { output } = prepare('balanced', [
            { role: 'system', content: 'system one' },
            { role: 'user', content: 'question' },
            { role: 'system', content: 'system two' },
        ])
        const result = await output
        expect(result.messages.map(({ role, content }) => [role, content])).toEqual([
            ['system', PAGEFOLD_SYSTEM_DECODER_V1],
            ['system', 'system one'],
            ['system', 'system two'],
            ['user', PAGEFOLD_BALANCED_CONTINUATION_V1],
        ])
        expect(result.canonical.messages.map((message) => message.sourceIndex)).toEqual([1])
        expect(result.context).toMatchObject({
            routeProfileId: PAGEFOLD_QUALIFIED_ROUTE.id,
            wireModel: 'gemini-3.7-flash',
            mediaResolutionPlacement: 'part',
            mode: 'balanced',
            directiveVersion: 1,
            documentSha256: pdfSha,
            outputReserve: 8_192,
        })
    })

    it('requires an injected in-process port in BG and never silently uses HTTP', () => {
        globalThis.__bgOrch = {}
        expect(() => getPageFoldRuntimeRenderPort()).toThrowError(expect.objectContaining({
            code: 'PAGEFOLD_RENDER_PORT_MISSING',
        }))
        const injected = port()
        globalThis.__pageFoldRenderPort = injected
        expect(getPageFoldRuntimeRenderPort()).toBe(injected)
    })
})
