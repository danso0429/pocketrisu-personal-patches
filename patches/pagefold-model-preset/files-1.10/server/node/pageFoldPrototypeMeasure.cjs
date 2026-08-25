'use strict'

const {
    PAGEFOLD_FONT_VERSION,
    createPageFoldFontCache,
} = require('./pageFoldFontCache.cjs')
const {
    PAGEFOLD_LAYOUT_V1,
    createPageFoldPdfService,
} = require('./pageFoldPdfService.cjs')
const { extractPageFoldActualText } = require('./pageFoldPdfReader.cjs')

async function main() {
    const cacheRoot = process.env.PAGEFOLD_TEST_FONT_CACHE
    if (!cacheRoot) throw new Error('PAGEFOLD_TEST_FONT_CACHE is required')
    const fontCache = createPageFoldFontCache({
        cacheRoot,
        fetchImpl: async () => { throw new Error('measurement requires a preverified font cache') },
    })
    const linesPerColumn = Math.floor(
        (PAGEFOLD_LAYOUT_V1.pageHeight - (PAGEFOLD_LAYOUT_V1.margin * 2))
        / PAGEFOLD_LAYOUT_V1.lineHeight,
    )
    const linesPerPage = linesPerColumn * PAGEFOLD_LAYOUT_V1.columns
    const cases = [
        { expectedPages: 1, messageCount: linesPerPage - 1 },
        { expectedPages: 2, messageCount: linesPerPage },
        { expectedPages: 4, messageCount: linesPerPage * 3 },
        { expectedPages: 8, messageCount: linesPerPage * 7 },
    ]
    const results = []
    for (const item of cases) {
        if (typeof global.gc === 'function') global.gc()
        results.push(await measure(item, fontCache, linesPerColumn, linesPerPage))
    }
    process.stdout.write(JSON.stringify({
        fontVersion: PAGEFOLD_FONT_VERSION,
        layout: PAGEFOLD_LAYOUT_V1,
        linesPerColumn,
        linesPerPage,
        results,
    }, null, 2) + '\n')
}

async function measure({ expectedPages, messageCount }, fontCache, linesPerColumn, linesPerPage) {
    const canonicalText = createCanonical(messageCount)
    const canonicalBytes = new TextEncoder().encode(canonicalText)
    const mainBefore = process.memoryUsage()
    const phases = []
    const service = createPageFoldPdfService({
        fontCache,
        limits: {
            cacheTtlMs: 0,
            maxPages: 8,
            maxSpans: (linesPerPage * 8) + 1,
        },
        onWorkerPhase: ({ phase }) => phases.push(phase),
    })
    const result = await service.render({
        version: 1,
        serializerVersion: 1,
        layoutVersion: 1,
        fontVersion: PAGEFOLD_FONT_VERSION,
        canonicalBytes,
    })
    const warnings = []
    const originalWarn = console.warn
    console.warn = (...args) => warnings.push(args.map(String).join(' '))
    let extracted
    try {
        extracted = await extractPageFoldActualText(result.pdf)
    } finally {
        console.warn = originalWarn
    }
    const mainAfter = process.memoryUsage()

    assert(result.pageCount === expectedPages, `expected ${expectedPages} pages, got ${result.pageCount}`)
    assert(result.spanCount === messageCount + 1, 'a canonical record wrapped unexpectedly')
    assert(extracted.text === canonicalText, 'PDF.js ActualText extraction differs from canonical bytes')
    assert(extracted.pageCount === expectedPages, 'PDF.js page count differs from renderer metadata')
    assert(warnings.length === 0, `PDF.js emitted warnings: ${warnings.join(' | ')}`)
    assertVisibleOrder(extracted)
    if (expectedPages === 1) assertColumnBoundaries(extracted.pages[0].spans, linesPerColumn)

    return {
        expectedPages,
        messageCount,
        sourceBytes: canonicalBytes.byteLength,
        pdfBytes: result.pdfBytes,
        sha256: result.sha256,
        spanCount: result.spanCount,
        graphemeCount: result.graphemeCount,
        renderMs: result.renderMs,
        workerMemory: result.memory,
        mainMemoryDelta: {
            rss: mainAfter.rss - mainBefore.rss,
            heapUsed: mainAfter.heapUsed - mainBefore.heapUsed,
            external: mainAfter.external - mainBefore.external,
        },
        phases,
        extractionExact: true,
        pdfjsWarnings: warnings,
    }
}

function createCanonical(messageCount) {
    const header = {
        type: 'pagefold-transcript',
        version: 1,
        sourceMessageCount: messageCount,
        messageCount,
        task: 'model',
        mode: 'maximum',
    }
    const lines = [JSON.stringify(header)]
    for (let index = 0; index < messageCount; index++) {
        lines.push(JSON.stringify({
            type: 'message',
            index,
            sourceIndex: index,
            role: index % 2 === 0 ? 'user' : 'assistant',
            name: null,
            toolCallId: null,
            content: '',
            attachments: [],
        }))
    }
    return lines.join('\n') + '\n'
}

function assertVisibleOrder(extracted) {
    for (const page of extracted.pages) {
        for (const span of page.spans) {
            const visible = span.visibleText.replace(/\s/g, '')
            const logical = span.actualText.replace(/\s/g, '')
            assert(visible === logical, `visible glyph order differs at ${span.contentId}`)
        }
    }
}

function assertColumnBoundaries(spans, linesPerColumn) {
    for (let column = 0; column < PAGEFOLD_LAYOUT_V1.columns; column++) {
        const first = column * linesPerColumn
        const middle = first + Math.floor(linesPerColumn / 2)
        const last = first + linesPerColumn - 1
        for (const spanIndex of [first, middle, last]) {
            const record = JSON.parse(spans[spanIndex].actualText.trimEnd())
            if (spanIndex === 0) assert(record.type === 'pagefold-transcript', 'first header marker moved')
            else {
                assert(record.type === 'message', `column marker ${spanIndex} is not a message`)
                assert(record.index === spanIndex - 1, `column marker ${spanIndex} changed order`)
            }
        }
    }
}

function assert(value, message) {
    if (!value) throw new Error(message)
}

main().catch((error) => {
    console.error(error)
    process.exitCode = 1
})
