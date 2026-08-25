import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { createPageFoldBgRenderPort } = require('./pageFoldBgRenderPort.cjs')
const { deliverBgRequestLog } = require('./bgRequestLogBridge.cjs')
const { createRequestLogs } = require('./request-logs.cjs')

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

describe('PageFold BG in-process adapter', () => {
  it('maps the same binary request/result contract and forwards cancellation', async () => {
    const canonical = new TextEncoder().encode('canonical')
    const pdf = Buffer.from('%PDF-bg')
    const sha = createHash('sha256').update(pdf).digest('hex')
    let observedSignal: AbortSignal | undefined
    const render = vi.fn(async (request: any, signal: AbortSignal) => {
      observedSignal = signal
      return {
        pdf, sha256: sha, sourceBytes: request.canonicalBytes.byteLength,
        pageCount: 1, cacheStatus: 'shared',
      }
    })
    const port = createPageFoldBgRenderPort({ pdfService: { render } })
    const controller = new AbortController()
    const result = await port.render({
      version: 1, routeProfileId: 'vertex-gemini-3.7-flash-low-v8',
      serializerVersion: 1, layoutVersion: 1,
      fontVersion: 'google-fonts-ec626514f79f831f1ab848a82114a0ce7e2d6372',
      canonicalUtf8: canonical,
    }, controller.signal)
    expect(observedSignal).toBe(controller.signal)
    expect(result.pdfBytes).toEqual(new Uint8Array(pdf))
    expect(result).toMatchObject({ pdfSha256: sha, sourceBytes: canonical.byteLength, pageCount: 1, cacheStatus: 'shared' })
  })

  it('delivers a content-free BG usage row through the native SQLite owner', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pagefold-bg-log-'))
    roots.push(root)
    const logs = createRequestLogs({ saveDir: root })
    const canonical = 'BG_PF_FIRST BG_PF_MIDDLE BG_PF_LAST'
    const pdfBase64 = Buffer.from(canonical).toString('base64')
    const response = await deliverBgRequestLog(logs, [{
      timestamp: Date.now(), category: 'llm', source: 'main', route: 'direct',
      generationId: 'bg-pagefold-test', model: 'gemini-3.7-flash', provider: 'vertex-gemini-native',
      url: 'https://aiplatform.googleapis.com/generate?key=BG_API_KEY', method: 'POST', status: 200, success: true,
      requestHeaders: JSON.stringify({ Authorization: 'Bearer BG_ACCESS_TOKEN' }),
      requestBody: JSON.stringify({ contents: [{ parts: [{ inlineData: { mimeType: 'application/pdf', data: pdfBase64 } }] }] }),
      responseBody: '{"ok":true}', inputTokens: 321, outputTokens: 12,
    }])
    expect(response.status).toBe(200)
    const rows = logs.queryRequestLogs({ withBodies: true })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ inputTokens: 321, outputTokens: 12, model: 'gemini-3.7-flash' })
    const persisted = JSON.stringify(rows)
    for (const marker of [pdfBase64, canonical, 'BG_PF_FIRST', 'BG_PF_MIDDLE', 'BG_PF_LAST', 'BG_API_KEY', 'BG_ACCESS_TOKEN']) {
      expect(persisted).not.toContain(marker)
    }
    logs.close()
  })
})
