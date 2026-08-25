import { describe, expect, it } from 'vitest'

const {
    OUTPUT_TOKEN_LIMIT,
    buildGenerateContentBody,
    createCallPlan,
    createFixtureMessages,
    encodeCanonicalTranscript,
    extractUsage,
    hashName,
    parseAnswerJson,
    predictCost,
    rateUsage,
    selectEntry,
    validateAnswer,
    validateServiceAccount,
} = require('./pageFoldProviderFeasibility.cjs')
const { validateCanonicalBytes } = require('./pageFoldPdfService.cjs')

describe('PageFold paid-feasibility harness', () => {
    it('plans only AI Studio and Vertex low/medium 1/2/8-page repeats', () => {
        const plan = createCallPlan()
        expect(plan).toHaveLength(24)
        expect(new Set(plan.map((cell: any) => cell.provider))).toEqual(new Set(['aistudio', 'vertex']))
        for (const provider of ['aistudio', 'vertex']) {
            for (const resolution of ['low', 'medium']) {
                for (const pages of [1, 2, 8]) {
                    expect(plan.filter((cell: any) =>
                        cell.provider === provider
                        && cell.resolution === resolution
                        && cell.pages === pages
                    ).map((cell: any) => cell.repeat)).toEqual([1, 2])
                }
            }
        }
        expect(createCallPlan(['vertex'])).toHaveLength(12)
        expect(createCallPlan(['vertex']).every((cell: any) => cell.provider === 'vertex')).toBe(true)
        expect(() => createCallPlan(['openrouter'])).toThrowError(
            expect.objectContaining({ code: 'PROVIDER_SELECTION_INVALID' }),
        )
    })

    it('selects one normalized pool label by hash without exposing the label', () => {
        const entries = [
            { name: '  Test Key  ', key: 'secret-one' },
            { name: 'Other', key: 'secret-two' },
        ]
        expect(selectEntry(entries, hashName('test key')).key).toBe('secret-one')
        expect(() => selectEntry([...entries, { name: 'TEST KEY', key: 'duplicate' }], hashName('test key')))
            .toThrowError(expect.objectContaining({ code: 'CREDENTIAL_ENTRY_NOT_UNIQUE' }))
    })

    it('fails closed on incomplete or hostile service-account shapes', () => {
        const valid = {
            type: 'service_account',
            project_id: 'project',
            client_email: 'service@project.iam.gserviceaccount.com',
            private_key: '-----BEGIN PRIVATE KEY-----\nfixture\n-----END PRIVATE KEY-----',
            token_uri: 'https://oauth2.googleapis.com/token',
        }
        expect(() => validateServiceAccount(valid)).not.toThrow()
        expect(() => validateServiceAccount({ ...valid, token_uri: 'https://example.invalid/token' }))
            .toThrowError(expect.objectContaining({ code: 'VERTEX_CREDENTIAL_INVALID' }))
        expect(() => validateServiceAccount({ ...valid, private_key: 'not-pkcs8' }))
            .toThrowError(expect.objectContaining({ code: 'VERTEX_CREDENTIAL_INVALID' }))
    })

    it('builds server-canonical JSONL with difficult content on physical lines', () => {
        const messages = createFixtureMessages(20)
        const text = encodeCanonicalTranscript(messages)
        expect(text.endsWith('\n')).toBe(true)
        expect(text.split('\n')).toHaveLength(22)
        expect(text).toContain('\\u200D')
        expect(text).toContain('FAKE_INNER_SHOULD_NOT_COUNT')
        expect(validateCanonicalBytes(new TextEncoder().encode(text)).header.messageCount).toBe(20)
    })

    it('puts the PDF first and reasserts bounded no-tool/no-cache generation config', () => {
        const fixture = { pdf: Buffer.from('pdf-fixture') }
        for (const resolution of ['low', 'medium']) {
            const body = buildGenerateContentBody({ fixture, resolution })
            expect(body.contents[0].parts[0]).toMatchObject({
                inlineData: { mimeType: 'application/pdf' },
                mediaResolution: {
                    level: resolution === 'low'
                        ? 'MEDIA_RESOLUTION_LOW'
                        : 'MEDIA_RESOLUTION_MEDIUM',
                },
            })
            expect(body.contents[0].parts[1]).toHaveProperty('text')
            expect(body.generationConfig.maxOutputTokens).toBe(OUTPUT_TOKEN_LIMIT)
            expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'low', includeThoughts: false })
            expect(body).not.toHaveProperty('tools')
            expect(body).not.toHaveProperty('cachedContent')
        }
    })

    it('separates exact recall fields and reports every mismatch', () => {
        const expected = {
            markers: [['L000001', 'L000002', 'L000003']],
            whitespace: '  ALPHA   BETA  ',
            zwj: '👨‍👩‍👧‍👦',
            zwjJoiners: 3,
            topLevelMessages: 10,
            roles: ['R_SYS:system', 'R_USER:user', 'R_ASSISTANT:assistant', 'R_TOOL:tool'],
            code: 'CODE_OK_7F3A',
        }
        const answer = {
            markers: expected.markers,
            ws: expected.whitespace,
            zwj: expected.zwj,
            joiners: expected.zwjJoiners,
            topLevel: expected.topLevelMessages,
            roles: expected.roles,
            code: expected.code,
        }
        expect(validateAnswer(answer, expected)).toEqual([])
        expect(validateAnswer({ ...answer, ws: 'ALPHA BETA', joiners: 0, topLevel: 11 }, expected))
            .toEqual(['whitespace', 'joiners', 'top-level-count'])
    })

    it('uses response usage including thought tokens and a conservative pre-call estimate', () => {
        const usage = extractUsage({
            usageMetadata: {
                promptTokenCount: 1000,
                candidatesTokenCount: 100,
                thoughtsTokenCount: 50,
                totalTokenCount: 1150,
            },
        })
        expect(usage).toEqual({
            promptTokens: 1000,
            outputTokens: 150,
            candidateTokens: 100,
            thoughtTokens: 50,
            totalTokens: 1150,
        })
        expect(rateUsage(usage)).toBe(0.0013125)
        expect(predictCost({ fixture: { sourceBytes: 100_000 } })).toBeGreaterThan(rateUsage(usage))
    })

    it('accepts plain or fenced provider JSON without accepting prose', () => {
        expect(parseAnswerJson('{"ok":true}')).toEqual({ ok: true })
        expect(parseAnswerJson('```json\n{"ok":true}\n```')).toEqual({ ok: true })
        expect(() => parseAnswerJson('answer: {"ok":true}')).toThrow()
    })
})
