'use strict'

const { createPageFoldPdfService } = require('./pageFoldPdfService.cjs')

function createPageFoldBgRenderPort(options = {}) {
  const service = options.pdfService || createPageFoldPdfService()
  return Object.freeze({
    async render(request, signal) {
      if (!request || !(request.canonicalUtf8 instanceof Uint8Array)) {
        const error = new Error('PageFold BG render request is invalid')
        error.code = 'PAGEFOLD_RENDER_REQUEST_INVALID'
        error.retryable = false
        throw error
      }
      const result = await service.render({
        version: request.version,
        routeProfileId: request.routeProfileId,
        serializerVersion: request.serializerVersion,
        layoutVersion: request.layoutVersion,
        fontVersion: request.fontVersion,
        canonicalBytes: request.canonicalUtf8,
      }, signal)
      return {
        pdfBytes: new Uint8Array(result.pdf),
        pdfSha256: result.sha256,
        sourceBytes: result.sourceBytes,
        pageCount: result.pageCount,
        serializerVersion: request.serializerVersion,
        layoutVersion: request.layoutVersion,
        fontVersion: request.fontVersion,
        cacheStatus: result.cacheStatus || (result.cacheHit ? 'memory' : 'miss'),
      }
    },
  })
}

module.exports = { createPageFoldBgRenderPort }
