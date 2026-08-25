import { describe, expect, it } from 'vitest'
import {
    redactPreparedRequestForDisplay,
    redactRequestLogBody,
    redactRequestLogHeaders,
    redactRequestLogUrl,
} from './redaction'

describe('PageFold structural media and credential redaction', () => {
    it('removes raw Gemini inline PDF and nested credential fields', () => {
        const body = JSON.stringify({
            contents: [{ parts: [{
                inlineData: { mimeType: 'application/pdf', data: 'QUJDREVGRw==' },
                mediaResolution: { level: 'MEDIA_RESOLUTION_LOW' },
            }] }],
            serviceAccountJson: '{"private_key":"SECRET"}',
            nested: { private_key: '-----BEGIN PRIVATE KEY-----' },
        })
        const redacted = redactRequestLogBody(body)!
        expect(redacted).toContain('[application/pdf: 9 bytes omitted]')
        expect(redacted).toContain('[redacted]')
        expect(redacted).not.toContain('QUJDREVGRw==')
        expect(redacted).not.toContain('BEGIN PRIVATE KEY')
        expect(redacted).not.toContain('SECRET')
    })

    it('redacts internal binary documents without mutating the source', () => {
        const bytes = Uint8Array.from([1, 2, 3, 4])
        const source = { kind: 'document', mime: 'application/pdf', bytes }
        const redacted = redactRequestLogBody(source)!
        expect(redacted).toContain('[application/pdf: 4 bytes omitted]')
        expect(bytes).toEqual(Uint8Array.from([1, 2, 3, 4]))
    })

    it('masks auth headers and credential query parameters', () => {
        const headers = redactRequestLogHeaders({
            Authorization: 'Bearer access-token',
            'X-Goog-Api-Key': 'api-key',
            'Content-Type': 'application/json',
        })!
        expect(headers).toContain('[redacted]')
        expect(headers).not.toContain('access-token')
        expect(headers).not.toContain('api-key')
        expect(headers).toContain('application/json')

        const url = redactRequestLogUrl('https://example.invalid/generate?key=secret&safe=1')
        expect(url).not.toContain('secret')
        expect(url).toContain('safe=1')
    })

    it('sanitizes preview copies while leaving ordinary generation fields', () => {
        const preview = redactPreparedRequestForDisplay({
            url: 'https://example.invalid/generate',
            headers: { Authorization: 'Bearer token', Accept: 'text/event-stream' },
            body: {
                generationConfig: { maxOutputTokens: 777, responseMimeType: 'application/json' },
                contents: [{ parts: [{ inlineData: { mimeType: 'application/pdf', data: 'AAAA' } }] }],
            },
        })
        expect(preview).toMatchObject({
            body: { generationConfig: { maxOutputTokens: 777, responseMimeType: 'application/json' } },
            headers: { Authorization: '[redacted]', Accept: 'text/event-stream' },
        })
        expect(JSON.stringify(preview)).not.toContain('AAAA')
        expect(JSON.stringify(preview)).not.toContain('Bearer token')
    })
})
