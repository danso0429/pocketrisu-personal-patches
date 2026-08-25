import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AdapterChatMessage } from '../../src/ts/preset/adapter'
import {
    serializePageFoldCanonicalTranscript,
    type PageFoldTransformInput,
} from '../../src/ts/pagefold/canonicalTranscript'

const {
    PAGEFOLD_FONT_VERSION,
    createPageFoldFontCache,
} = require('./pageFoldFontCache.cjs')
const {
    createPageFoldPdfService,
    validateCanonicalBytes,
} = require('./pageFoldPdfService.cjs')
const { extractPageFoldActualText } = require('./pageFoldPdfReader.cjs')

function transform(messages: readonly AdapterChatMessage[]): PageFoldTransformInput {
    return {
        version: 1,
        task: 'model',
        binding: { source: 'chat' },
        preset: {
            id: 'pagefold-render-test',
            updatedAt: 1,
            profileId: 'gemini-3-test',
            profileVersion: 1,
            providerBaseVersion: 1,
            wireModel: 'gemini-3-test',
        },
        config: {
            mode: 'maximum',
            serializerVersion: 1,
            layoutVersion: 1,
            fontVersion: PAGEFOLD_FONT_VERSION,
        },
        messages,
    }
}

function canonical(messages: readonly AdapterChatMessage[]) {
    return serializePageFoldCanonicalTranscript(transform(messages))
}

function request(bytes: Uint8Array) {
    return {
        version: 1,
        serializerVersion: 1,
        layoutVersion: 1,
        fontVersion: PAGEFOLD_FONT_VERSION,
        canonicalBytes: bytes,
    }
}

function productionFontCache() {
    const cacheRoot = process.env.PAGEFOLD_TEST_FONT_CACHE
    if (!cacheRoot) throw new Error('PAGEFOLD_TEST_FONT_CACHE is required')
    return createPageFoldFontCache({
        cacheRoot,
        fetchImpl: async () => { throw new Error('qualified font cache must already be populated') },
    })
}

function complexMessages(): AdapterChatMessage[] {
    const tag = String.fromCodePoint(0xE0067)
    return [
        { role: 'system', content: '  system edge whitespace  ' },
        { role: 'user', content: '한국어 漢字 ひらがな カタカナ Latin e\u0301' },
        { role: 'assistant', content: `emoji 👨‍👩‍👧‍👦 ✈️ tag ${tag}` },
        { role: 'tool', name: 'lookup', toolCallId: 'call-1', content: 'literal \\n / \\\\n and {"type":"message"}' },
    ]
}

describe('PageFold server canonical boundary', () => {
    it('accepts browser bytes and independently rejects non-canonical escape changes', () => {
        const source = canonical(complexMessages())
        expect(validateCanonicalBytes(source.bytes).text).toBe(source.text)

        const lowercase = source.text.replace('\\u200D', '\\u200d')
        expect(() => validateCanonicalBytes(new TextEncoder().encode(lowercase))).toThrowError(
            expect.objectContaining({ code: 'PDF_CANONICAL_NON_CANONICAL' }),
        )
        const bom = Uint8Array.from([0xEF, 0xBB, 0xBF, ...source.bytes])
        expect(() => validateCanonicalBytes(bom)).toThrowError(
            expect.objectContaining({ code: 'PDF_CANONICAL_INVALID' }),
        )
    })

    it('rejects a pre-aborted request before font or worker work', async () => {
        const load = vi.fn()
        const service = createPageFoldPdfService({
            fontCache: { version: PAGEFOLD_FONT_VERSION, load },
        })
        const controller = new AbortController()
        controller.abort()
        await expect(service.render(request(canonical([]).bytes), controller.signal)).rejects.toMatchObject({
            name: 'AbortError',
            code: 'PDF_RENDER_ABORTED',
        })
        expect(load).not.toHaveBeenCalled()
    })

    it('accepts balanced source-index gaps produced only by removed system rows', () => {
        const input = transform([
            { role: 'system', content: 'one' },
            { role: 'user', content: 'two' },
            { role: 'system', content: 'three' },
            { role: 'assistant', content: 'four' },
        ])
        input.config.mode = 'balanced'
        const source = serializePageFoldCanonicalTranscript(input)
        expect(source.messages.map((message) => message.sourceIndex)).toEqual([1, 3])
        expect(validateCanonicalBytes(source.bytes).text).toBe(source.text)
    })

    it('rejects source bytes above the observed ceiling before font work', async () => {
        const load = vi.fn()
        const service = createPageFoldPdfService({
            fontCache: { version: PAGEFOLD_FONT_VERSION, load },
        })
        await expect(service.render(request(new Uint8Array((2 * 1024 * 1024) + 1)))).rejects.toMatchObject({
            code: 'PDF_SOURCE_LIMIT',
        })
        expect(load).not.toHaveBeenCalled()
    })
})

const realFonts = Boolean(process.env.PAGEFOLD_TEST_FONT_CACHE)
describe.runIf(realFonts)('PageFold tagged PDF renderer with qualified fonts', () => {
    afterEach(() => vi.restoreAllMocks())

    it.sequential('extracts exact canonical JSONL through independent PDF.js structure reading', async () => {
        const source = canonical([
            ...complexMessages(),
            { role: 'user', content: `  wrap ${'word  '.repeat(200)}tail  ` },
        ])
        const phases: string[] = []
        const service = createPageFoldPdfService({
            fontCache: productionFontCache(),
            onWorkerPhase: ({ phase }: { phase: string }) => phases.push(phase),
        })
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const result = await service.render(request(source.bytes))
        const extracted = await extractPageFoldActualText(result.pdf)

        expect(extracted.text).toBe(source.text)
        expect(extracted.pageCount).toBe(result.pageCount)
        expect(extracted.spanCount).toBe(result.spanCount)
        expect(phases).toEqual(['font-read', 'font-embed', 'layout', 'save'])
        expect(warn).not.toHaveBeenCalled()
        for (const page of extracted.pages) {
            for (const span of page.spans) {
                const visible = span.visibleText.replace(/\s/g, '')
                const logical = span.actualText.replace(/\s/g, '')
                expect(visible).toBe(logical)
            }
        }
    })

    it.sequential('renders the header-only empty transcript as one exact page', async () => {
        const source = canonical([])
        const service = createPageFoldPdfService({ fontCache: productionFontCache() })
        const result = await service.render(request(source.bytes))
        const extracted = await extractPageFoldActualText(result.pdf)
        expect(result.pageCount).toBe(1)
        expect(result.spanCount).toBe(1)
        expect(extracted.text).toBe(source.text)
    })

    it.sequential('is byte-deterministic across separate worker renders', async () => {
        const source = canonical(complexMessages())
        const service = createPageFoldPdfService({
            fontCache: productionFontCache(),
            limits: { cacheTtlMs: 0 },
        })
        const first = await service.render(request(source.bytes))
        const second = await service.render(request(source.bytes))
        expect(first.cacheHit).toBe(false)
        expect(second.cacheHit).toBe(false)
        expect(second.pdf).toEqual(first.pdf)
        expect(second.sha256).toBe(first.sha256)
    })

    it.sequential('preserves exact order in single-column and four-column multi-page layouts', async () => {
        const messages = Array.from({ length: 80 }, (_, index): AdapterChatMessage => ({
            role: index % 2 === 0 ? 'user' : 'assistant',
            content: `marker-${String(index).padStart(3, '0')}  한국`,
        }))
        const source = canonical(messages)
        const common = {
            fontCache: productionFontCache(),
            layout: { pageHeight: 40, margin: 10 },
            limits: { cacheTtlMs: 0, maxPages: 16 },
        }
        const single = await createPageFoldPdfService({ ...common, layout: { ...common.layout, columns: 1 } })
            .render(request(source.bytes))
        const four = await createPageFoldPdfService({ ...common, layout: { ...common.layout, columns: 4 } })
            .render(request(source.bytes))
        const [singleExtracted, fourExtracted] = await Promise.all([
            extractPageFoldActualText(single.pdf),
            extractPageFoldActualText(four.pdf),
        ])
        expect(single.pageCount).toBeGreaterThan(four.pageCount)
        expect(four.pageCount).toBeGreaterThan(1)
        expect(singleExtracted.text).toBe(source.text)
        expect(fourExtracted.text).toBe(source.text)
    })

    it.sequential('singleflights identical work, applies TTL, and bounds cache metadata', async () => {
        const source = canonical(complexMessages())
        let now = 1_000
        const phases: string[] = []
        const service = createPageFoldPdfService({
            fontCache: productionFontCache(),
            now: () => now,
            limits: { cacheTtlMs: 10, maxCacheEntries: 1 },
            onWorkerPhase: ({ phase }: { phase: string }) => phases.push(phase),
        })
        const [first, joined] = await Promise.all([
            service.render(request(source.bytes)),
            service.render(request(source.bytes)),
        ])
        expect(first.pdf).toEqual(joined.pdf)
        expect(phases).toHaveLength(4)
        const hit = await service.render(request(source.bytes))
        expect(hit.cacheHit).toBe(true)
        now += 11
        const expired = await service.render(request(source.bytes))
        expect(expired.cacheHit).toBe(false)
        expect(phases).toHaveLength(8)
        expect(service.inspect()).toMatchObject({ cacheEntries: 1, inflight: 0 })

        const byteBound = createPageFoldPdfService({
            fontCache: productionFontCache(),
            limits: { maxCacheBytes: 1 },
        })
        await byteBound.render(request(source.bytes))
        expect(byteBound.inspect().cacheEntries).toBe(0)
    })

    it.sequential('admits one distinct worker and fails closed when its queue is disabled', async () => {
        const firstSource = canonical([{ role: 'user', content: `first ${'a'.repeat(50_000)}` }])
        const secondSource = canonical([{ role: 'user', content: `second ${'b'.repeat(50_000)}` }])
        const service = createPageFoldPdfService({
            fontCache: productionFontCache(),
            limits: { maxQueued: 0, cacheTtlMs: 0 },
        })
        const settled = await Promise.allSettled([
            service.render(request(firstSource.bytes)),
            service.render(request(secondSource.bytes)),
        ])
        expect(settled.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
        const rejection = settled.find((result) => result.status === 'rejected') as PromiseRejectedResult
        expect(rejection.reason).toMatchObject({ code: 'PDF_RENDER_BUSY', transient: true })
    })

    it.sequential.each(['layout', 'save'])('terminates the worker when aborted during %s', async (phaseToAbort) => {
        const source = canonical(Array.from({ length: 100 }, (_, index) => ({
            role: 'user' as const,
            content: `abort-marker-${index} ${'x'.repeat(200)}`,
        })))
        const controller = new AbortController()
        const service = createPageFoldPdfService({
            fontCache: productionFontCache(),
            onWorkerPhase: ({ phase }: { phase: string }) => {
                if (phase === phaseToAbort) controller.abort()
            },
        })
        await expect(service.render(request(source.bytes), controller.signal)).rejects.toMatchObject({
            name: 'AbortError',
            code: 'PDF_RENDER_ABORTED',
        })
        await vi.waitFor(() => expect(service.inspect().inflight).toBe(0))
        expect(service.inspect().cacheEntries).toBe(0)
    })

    it.sequential('fails explicitly when neither qualified font covers a grapheme', async () => {
        const source = canonical([{ role: 'user', content: 'unsupported musical symbol 𝄞' }])
        const service = createPageFoldPdfService({ fontCache: productionFontCache() })
        await expect(service.render(request(source.bytes))).rejects.toMatchObject({
            code: 'PDF_GLYPH_UNSUPPORTED',
        })
    })

    it.sequential.each([
        {
            label: 'page',
            code: 'PDF_PAGE_LIMIT',
            service: { layout: { pageHeight: 40, margin: 10 }, limits: { maxPages: 1 } },
            messages: Array.from({ length: 40 }, (_, index) => ({ role: 'user' as const, content: `page-${index}` })),
        },
        {
            label: 'span',
            code: 'PDF_SPAN_LIMIT',
            service: { limits: { maxSpans: 1 } },
            messages: [{ role: 'user' as const, content: 'second span' }],
        },
        {
            label: 'PDF byte',
            code: 'PDF_BYTES_LIMIT',
            service: { limits: { maxPdfBytes: 1 } },
            messages: [{ role: 'user' as const, content: 'non-empty PDF' }],
        },
    ])('enforces the observed $label ceiling in the worker', async ({ code, service: options, messages }) => {
        const source = canonical(messages)
        const service = createPageFoldPdfService({
            fontCache: productionFontCache(),
            ...options,
        })
        await expect(service.render(request(source.bytes))).rejects.toMatchObject({ code })
    })
})
