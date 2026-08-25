import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const requestLogPackage = require('./request-logs.cjs')
const tempRoots: string[] = []

afterEach(() => {
    for (const root of tempRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

describe('PageFold actual request-logs.db redaction', () => {
    it('keeps usage rows while direct/job/preview/error bodies contain zero PDF/canonical/credential hits', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pagefold-request-logs-'))
        tempRoots.push(root)
        const logs = requestLogPackage.createRequestLogs({ saveDir: root, minRows: 1 })
        const canonical = 'PF_CANONICAL_FIRST PF_CANONICAL_MIDDLE PF_CANONICAL_LAST'
        const pdfBase64 = Buffer.from(canonical).toString('base64')
        const body = JSON.stringify({
            contents: [{ role: 'user', parts: [{
                inlineData: { mimeType: 'application/pdf', data: pdfBase64 },
                mediaResolution: { level: 'MEDIA_RESOLUTION_LOW' },
            }] }],
            serviceAccountJson: '{"private_key":"PRIVATE_KEY_MARKER"}',
            access_token: 'ACCESS_TOKEN_MARKER',
        })
        const entries = [
            ['main', 'direct', true],
            ['main', 'job', true],
            ['preview', 'direct', true],
            ['main', 'direct', false],
        ].map(([source, route, success], index) => ({
            timestamp: Date.now() + index,
            category: 'llm', source, route,
            generationId: `pagefold-log-${index}`,
            model: 'gemini-3.7-flash', provider: 'vertex-gemini-native',
            url: 'https://aiplatform.googleapis.com/generate?key=API_KEY_MARKER',
            method: 'POST', status: success ? 200 : 500, success,
            requestHeaders: JSON.stringify({ Authorization: 'Bearer ACCESS_TOKEN_MARKER' }),
            requestBody: body,
            responseBody: success ? '{"ok":true}' : '{"error":"safe"}',
            errorMessage: success ? undefined : 'Bearer ACCESS_TOKEN_MARKER',
            inputTokens: 1_234, outputTokens: 56,
        }))
        logs.addRequestLogBatch(entries)
        const rows = logs.queryRequestLogs({ withBodies: true, limit: 10 })
        expect(rows).toHaveLength(4)
        expect(rows.every((row: any) => row.inputTokens === 1_234 && row.model === 'gemini-3.7-flash')).toBe(true)
        const persisted = JSON.stringify(rows)
        for (const marker of [
            pdfBase64, canonical, 'PF_CANONICAL_FIRST', 'PF_CANONICAL_MIDDLE', 'PF_CANONICAL_LAST',
            'API_KEY_MARKER', 'ACCESS_TOKEN_MARKER', 'PRIVATE_KEY_MARKER', 'BEGIN PRIVATE KEY',
        ]) expect(persisted).not.toContain(marker)
        expect(persisted).toContain('application/pdf')
        expect(persisted).toContain('bytes omitted')
        logs.close()
    })
})
