import { describe, expect, it } from 'vitest'

const { redactPageFoldRequestLogText } = require('./pageFoldRequestLogRedaction.cjs')

describe('PageFold server request-log defense in depth', () => {
    it('removes raw inline PDF, service account, access token, and private key', () => {
        const source = JSON.stringify({
            contents: [{ parts: [{ inlineData: { mimeType: 'application/pdf', data: 'QUJDREVGR0hJSg==' } }] }],
            serviceAccountJson: '{"private_key":"PRIVATE_MARKER"}',
            access_token: 'ACCESS_MARKER',
            nested: { private_key: '-----BEGIN PRIVATE KEY-----' },
        })
        const redacted = redactPageFoldRequestLogText(source)
        expect(redacted).toContain('application/pdf')
        expect(redacted).toContain('bytes omitted')
        expect(redacted).not.toContain('QUJDREVGR0hJSg==')
        expect(redacted).not.toContain('PRIVATE_MARKER')
        expect(redacted).not.toContain('ACCESS_MARKER')
        expect(redacted).not.toContain('BEGIN PRIVATE KEY')
    })
})
