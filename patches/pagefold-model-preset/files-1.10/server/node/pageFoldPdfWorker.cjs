'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs/promises')
const { parentPort, workerData } = require('node:worker_threads')
const fontkit = require('@pdf-lib/fontkit')
const {
    PDFDocument,
    PDFHexString,
    PDFName,
    PDFNumber,
    PDFOperator,
    PDFOperatorNames,
    beginText,
    endMarkedContent,
    endText,
    setFillingRgbColor,
    setFontAndSize,
    setTextMatrix,
    showText,
} = require('pdf-lib')

const FIXED_DATE = new Date('2000-01-01T00:00:00.000Z')

main().catch((error) => {
    parentPort.postMessage({
        type: 'error',
        error: {
            name: error?.name || 'Error',
            code: error?.code,
            message: error?.message || String(error),
            stack: error?.stack,
        },
    })
})

async function main() {
    const startedAt = performance.now()
    const memory = createMemorySampler()
    postPhase('font-read')
    const [textFontBytes, emojiFontBytes] = await Promise.all([
        readVerifiedAsset(workerData.fonts.textFont),
        readVerifiedAsset(workerData.fonts.emojiFont),
    ])
    memory.sample()

    postPhase('font-embed')
    const pdfDoc = await PDFDocument.create()
    pdfDoc.registerFontkit(fontkit)
    setDeterministicMetadata(pdfDoc)
    const [textFont, emojiFont] = await Promise.all([
        pdfDoc.embedFont(textFontBytes, {
            subset: true,
            customName: 'PageFoldNotoSansKRV1',
        }),
        pdfDoc.embedFont(emojiFontBytes, {
            subset: true,
            customName: 'PageFoldNotoEmojiV1',
        }),
    ])
    memory.sample()

    const canonicalText = Buffer.from(workerData.canonicalBytes).toString('utf8')
    const layout = workerData.layout
    const limits = workerData.limits
    const fonts = createFontSelector(textFont, emojiFont, limits.maxGlyphWidthCacheEntries)
    const segmenter = new Intl.Segmenter('und', { granularity: 'grapheme' })
    const tagging = createTagging(pdfDoc)
    const cursor = createLayoutCursor({ pdfDoc, textFont, emojiFont, layout, limits, tagging })

    postPhase('layout')
    let offset = 0
    let graphemeCount = 0
    while (offset < canonicalText.length) {
        const lineEnd = canonicalText.indexOf('\n', offset)
        if (lineEnd === -1) throw workerError('PDF_CANONICAL_INVALID', 'Canonical transcript lost its final LF')
        const record = canonicalText.slice(offset, lineEnd)
        await layoutRecord(record, cursor, fonts, segmenter, async () => {
            graphemeCount++
            if (graphemeCount % limits.yieldEveryGraphemes === 0) {
                memory.sample()
                await new Promise((resolve) => setImmediate(resolve))
            }
        })
        offset = lineEnd + 1
    }
    tagging.finish()
    memory.sample()

    postPhase('save')
    const pdfBytes = await pdfDoc.save({
        addDefaultPage: false,
        useObjectStreams: false,
        objectsPerTick: 25,
        updateFieldAppearances: false,
    })
    memory.sample()
    if (pdfBytes.byteLength > limits.maxPdfBytes) {
        throw workerError('PDF_BYTES_LIMIT', 'Rendered PageFold PDF exceeds the configured byte limit')
    }

    const exact = pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength)
    parentPort.postMessage({
        type: 'result',
        result: {
            pdf: exact,
            pageCount: cursor.pageCount(),
            spanCount: cursor.spanCount(),
            graphemeCount,
            renderMs: Math.round((performance.now() - startedAt) * 1000) / 1000,
            memory: memory.result(),
        },
    }, [exact])
}

async function layoutRecord(record, cursor, fonts, segmenter, onGrapheme) {
    let runs = []
    let lineText = ''
    let lineWidth = 0

    const flush = (recordEnd) => {
        if (lineText.length === 0 && !recordEnd) return
        cursor.drawLine(runs, lineText + (recordEnd ? '\n' : ''))
        runs = []
        lineText = ''
        lineWidth = 0
    }

    for (const { segment } of segmenter.segment(record)) {
        await onGrapheme()
        const selected = fonts.select(segment)
        if (lineText.length > 0 && lineWidth + selected.width > cursor.columnWidth) flush(false)
        const previous = runs[runs.length - 1]
        if (previous?.fontId === selected.fontId) {
            previous.text += segment
            previous.width += selected.width
        } else {
            runs.push({
                fontId: selected.fontId,
                font: selected.font,
                key: selected.key,
                text: segment,
                width: selected.width,
            })
        }
        lineText += segment
        lineWidth += selected.width
    }
    flush(true)
}

function createLayoutCursor({ pdfDoc, textFont, emojiFont, layout, limits, tagging }) {
    const columnWidth = (layout.pageWidth - (layout.margin * 2) - (layout.columnGap * (layout.columns - 1))) / layout.columns
    const linesPerColumn = Math.floor((layout.pageHeight - (layout.margin * 2)) / layout.lineHeight)
    if (!(columnWidth > 0) || linesPerColumn < 1) {
        throw workerError('PDF_LAYOUT_INVALID', 'PageFold layout has no drawable column area')
    }

    let page = null
    let pageContext = null
    let pageCount = 0
    let column = 0
    let line = 0
    let spans = 0

    function addPage() {
        if (pageCount >= limits.maxPages) {
            throw workerError('PDF_PAGE_LIMIT', 'Rendered PageFold PDF exceeds the configured page limit')
        }
        page = pdfDoc.addPage([layout.pageWidth, layout.pageHeight])
        page.node.setFontDictionary(PDFName.of('PFText'), textFont.ref)
        page.node.setFontDictionary(PDFName.of('PFEmoji'), emojiFont.ref)
        pageContext = tagging.addPage(page, pageCount)
        pageCount++
        column = 0
        line = 0
    }

    function drawLine(runs, actualText) {
        if (!page) addPage()
        if (spans >= limits.maxSpans) {
            throw workerError('PDF_SPAN_LIMIT', 'Rendered PageFold PDF exceeds the configured span limit')
        }
        const x = layout.margin + (column * (columnWidth + layout.columnGap))
        const y = layout.pageHeight - layout.margin - layout.fontSize - (line * layout.lineHeight)
        const mcid = pageContext.spanRefs.length
        const spanRef = tagging.addSpan(pageContext, mcid, actualText)
        const props = pdfDoc.context.obj({
            MCID: PDFNumber.of(mcid),
            ActualText: PDFHexString.fromText(actualText),
        })
        page.pushOperators(PDFOperator.of(
            PDFOperatorNames.BeginMarkedContentSequence,
            [PDFName.of('Span'), props],
        ))
        let runX = x
        for (const run of runs) {
            page.pushOperators(
                beginText(),
                setFillingRgbColor(0, 0, 0),
                setFontAndSize(run.key, layout.fontSize),
                setTextMatrix(1, 0, 0, 1, runX, y),
                showText(run.font.encodeText(run.text)),
                endText(),
            )
            runX += run.width
        }
        page.pushOperators(endMarkedContent())
        pageContext.spanRefs.push(spanRef)
        spans++

        line++
        if (line >= linesPerColumn) {
            line = 0
            column++
            if (column >= layout.columns) {
                page = null
                pageContext = null
            }
        }
    }

    return {
        columnWidth,
        drawLine,
        pageCount: () => pageCount,
        spanCount: () => spans,
    }
}

function createFontSelector(textFont, emojiFont, maxCacheEntries) {
    const textCharacters = new Set(textFont.getCharacterSet())
    const emojiCharacters = new Set(emojiFont.getCharacterSet())
    const widthCache = new Map()
    const textKey = PDFName.of('PFText')
    const emojiKey = PDFName.of('PFEmoji')

    function select(segment) {
        let textSupported = true
        let emojiSupported = true
        for (const character of segment) {
            const codePoint = character.codePointAt(0)
            if (!textCharacters.has(codePoint)) textSupported = false
            if (!emojiCharacters.has(codePoint)) emojiSupported = false
        }
        const fontId = textSupported ? 'text' : emojiSupported ? 'emoji' : null
        if (!fontId) {
            const display = Array.from(segment, (character) =>
                `U+${character.codePointAt(0).toString(16).toUpperCase()}`
            ).join(' ')
            throw workerError('PDF_GLYPH_UNSUPPORTED', `No qualified PageFold font covers grapheme ${display}`)
        }
        const font = fontId === 'text' ? textFont : emojiFont
        const key = fontId === 'text' ? textKey : emojiKey
        const cacheKey = `${fontId}\0${segment}`
        let width = widthCache.get(cacheKey)
        if (width === undefined) {
            width = font.widthOfTextAtSize(segment, workerData.layout.fontSize)
            if (widthCache.size < maxCacheEntries) widthCache.set(cacheKey, width)
        }
        return { fontId, font, key, width }
    }

    return { select }
}

function createTagging(pdfDoc) {
    const root = pdfDoc.context.obj({ Type: 'StructTreeRoot' })
    const rootRef = pdfDoc.context.register(root)
    const documentElement = pdfDoc.context.obj({ Type: 'StructElem', S: 'Document', P: rootRef })
    const documentRef = pdfDoc.context.register(documentElement)
    const pageSections = []
    const parentTreeNums = []

    pdfDoc.catalog.set(PDFName.of('StructTreeRoot'), rootRef)
    pdfDoc.catalog.set(PDFName.of('MarkInfo'), pdfDoc.context.obj({ Marked: true }))

    function addPage(page, pageIndex) {
        const section = pdfDoc.context.obj({
            Type: 'StructElem',
            S: 'Sect',
            P: documentRef,
            Pg: page.ref,
        })
        const sectionRef = pdfDoc.context.register(section)
        const context = { page, pageIndex, section, sectionRef, spanRefs: [] }
        page.node.set(PDFName.of('StructParents'), PDFNumber.of(pageIndex))
        pageSections.push(context)
        return context
    }

    function addSpan(pageContext, mcid, actualText) {
        const span = pdfDoc.context.obj({
            Type: 'StructElem',
            S: 'Span',
            P: pageContext.sectionRef,
            Pg: pageContext.page.ref,
            K: PDFNumber.of(mcid),
            ActualText: PDFHexString.fromText(actualText),
        })
        return pdfDoc.context.register(span)
    }

    function finish() {
        for (const pageContext of pageSections) {
            pageContext.section.set(PDFName.of('K'), pdfDoc.context.obj(pageContext.spanRefs))
            parentTreeNums.push(
                PDFNumber.of(pageContext.pageIndex),
                pdfDoc.context.obj(pageContext.spanRefs),
            )
        }
        documentElement.set(
            PDFName.of('K'),
            pdfDoc.context.obj(pageSections.map((context) => context.sectionRef)),
        )
        root.set(PDFName.of('K'), documentRef)
        root.set(PDFName.of('ParentTree'), pdfDoc.context.obj({
            Nums: pdfDoc.context.obj(parentTreeNums),
        }))
        root.set(PDFName.of('ParentTreeNextKey'), PDFNumber.of(pageSections.length))
    }

    return { addPage, addSpan, finish }
}

async function readVerifiedAsset(asset) {
    const bytes = await fs.readFile(asset.path)
    if (bytes.byteLength !== asset.byteLength) {
        throw workerError('PDF_FONT_LENGTH_MISMATCH', 'Verified PageFold font changed before worker read')
    }
    const digest = crypto.createHash('sha256').update(bytes).digest('hex')
    if (digest !== asset.sha256) {
        throw workerError('PDF_FONT_HASH_MISMATCH', 'Verified PageFold font changed before worker read')
    }
    return bytes
}

function setDeterministicMetadata(pdfDoc) {
    pdfDoc.setTitle('PageFold Canonical Transcript')
    pdfDoc.setAuthor('PocketRisu PageFold independent implementation')
    pdfDoc.setSubject('Versioned canonical JSONL transcript')
    pdfDoc.setKeywords(['PocketRisu', 'PageFold', 'canonical-jsonl-v1'])
    pdfDoc.setProducer('PocketRisu PageFold renderer v1')
    pdfDoc.setCreator('PocketRisu PageFold renderer v1')
    pdfDoc.setCreationDate(FIXED_DATE)
    pdfDoc.setModificationDate(FIXED_DATE)
}

function createMemorySampler() {
    let peakRss = 0
    let peakHeapUsed = 0
    let peakExternal = 0
    const sample = () => {
        const current = process.memoryUsage()
        peakRss = Math.max(peakRss, current.rss)
        peakHeapUsed = Math.max(peakHeapUsed, current.heapUsed)
        peakExternal = Math.max(peakExternal, current.external)
    }
    sample()
    return {
        sample,
        result: () => ({ peakRss, peakHeapUsed, peakExternal }),
    }
}

function postPhase(phase) {
    parentPort.postMessage({ type: 'phase', phase })
}

function workerError(code, message) {
    const error = new Error(message)
    error.name = 'PageFoldPdfWorkerError'
    error.code = code
    return error
}
