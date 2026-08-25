'use strict'

class PageFoldPdfReaderError extends Error {
    constructor(code, message, options = {}) {
        super(message, options.cause ? { cause: options.cause } : undefined)
        this.name = 'PageFoldPdfReaderError'
        this.code = code
    }
}

async function extractPageFoldActualText(pdfBytes) {
    if (!(pdfBytes instanceof Uint8Array) || pdfBytes.byteLength === 0) {
        throw new PageFoldPdfReaderError('PDF_READER_INPUT_INVALID', 'PDF reader requires non-empty bytes')
    }
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const task = pdfjs.getDocument({
        data: Uint8Array.from(pdfBytes),
        disableWorker: true,
        disableFontFace: true,
        useSystemFonts: false,
        isEvalSupported: false,
        stopAtErrors: true,
    })
    let document
    try {
        document = await task.promise
        const pages = []
        let text = ''
        let spanCount = 0
        for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
            const page = await document.getPage(pageNumber)
            const [tree, textContent] = await Promise.all([
                page.getStructTree(),
                page.getTextContent({ disableNormalization: true, includeMarkedContent: true }),
            ])
            const structural = collectStructuralSpans(tree)
            const visible = collectVisibleSpans(textContent.items)
            if (structural.length === 0) {
                throw new PageFoldPdfReaderError(
                    'PDF_READER_STRUCTURE_MISSING',
                    `Page ${pageNumber} has no PageFold ActualText spans`,
                )
            }
            if (structural.length !== visible.length) {
                throw new PageFoldPdfReaderError(
                    'PDF_READER_STRUCTURE_MISMATCH',
                    `Page ${pageNumber} structure and marked-content span counts differ`,
                )
            }
            for (let index = 0; index < structural.length; index++) {
                if (structural[index].contentId !== visible[index].contentId) {
                    throw new PageFoldPdfReaderError(
                        'PDF_READER_ORDER_MISMATCH',
                        `Page ${pageNumber} structure and visible marked-content order differ`,
                    )
                }
                text += structural[index].actualText
            }
            spanCount += structural.length
            pages.push({
                pageNumber,
                spans: structural.map((span, index) => ({
                    ...span,
                    visibleText: visible[index].visibleText,
                })),
            })
            page.cleanup()
        }
        return {
            text,
            pageCount: document.numPages,
            spanCount,
            pages,
        }
    } catch (error) {
        if (error instanceof PageFoldPdfReaderError) throw error
        throw new PageFoldPdfReaderError(
            'PDF_READER_FAILED',
            'Independent PDF.js extraction failed',
            { cause: error },
        )
    } finally {
        await document?.destroy().catch(() => {})
        await task.destroy().catch(() => {})
    }
}

function collectStructuralSpans(tree) {
    if (!tree || tree.role !== 'Root' || !Array.isArray(tree.children)) {
        throw new PageFoldPdfReaderError('PDF_READER_STRUCTURE_INVALID', 'PDF structure tree root is invalid')
    }
    const spans = []
    const seenIds = new Set()
    const visit = (node) => {
        if (!node || typeof node !== 'object') {
            throw new PageFoldPdfReaderError('PDF_READER_STRUCTURE_INVALID', 'PDF structure tree node is invalid')
        }
        if (node.role === 'Span') {
            if (typeof node.alt !== 'string' || !Array.isArray(node.children) || node.children.length !== 1) {
                throw new PageFoldPdfReaderError('PDF_READER_STRUCTURE_INVALID', 'PageFold Span lacks exact ActualText/content')
            }
            const content = node.children[0]
            if (content?.type !== 'content' || typeof content.id !== 'string' || seenIds.has(content.id)) {
                throw new PageFoldPdfReaderError('PDF_READER_STRUCTURE_INVALID', 'PageFold Span content id is invalid')
            }
            seenIds.add(content.id)
            spans.push({ contentId: content.id, actualText: node.alt })
            return
        }
        if (!Array.isArray(node.children)) {
            throw new PageFoldPdfReaderError('PDF_READER_STRUCTURE_INVALID', 'PDF structure container lacks children')
        }
        for (const child of node.children) visit(child)
    }
    for (const child of tree.children) visit(child)
    return spans
}

function collectVisibleSpans(items) {
    const spans = []
    const stack = []
    for (const item of items) {
        if (item?.type === 'beginMarkedContentProps') {
            if (typeof item.id !== 'string') {
                throw new PageFoldPdfReaderError('PDF_READER_MARKED_INVALID', 'Marked-content span lacks an MCID')
            }
            stack.push({ contentId: item.id, visibleText: '' })
            continue
        }
        if (item?.type === 'endMarkedContent') {
            const span = stack.pop()
            if (!span) {
                throw new PageFoldPdfReaderError('PDF_READER_MARKED_INVALID', 'Unbalanced marked-content end')
            }
            spans.push(span)
            continue
        }
        if (typeof item?.str === 'string' && stack.length > 0) {
            stack[stack.length - 1].visibleText += item.str
        }
    }
    if (stack.length !== 0) {
        throw new PageFoldPdfReaderError('PDF_READER_MARKED_INVALID', 'Unbalanced marked-content start')
    }
    const seenIds = new Set()
    for (const span of spans) {
        if (seenIds.has(span.contentId)) {
            throw new PageFoldPdfReaderError('PDF_READER_MARKED_INVALID', 'Duplicate marked-content id')
        }
        seenIds.add(span.contentId)
    }
    return spans
}

module.exports = {
    PageFoldPdfReaderError,
    extractPageFoldActualText,
}
