import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdapterChatMessage, AdapterPageFoldWireContext } from 'src/ts/preset/adapter/types'
import * as serviceAccountCache from 'src/ts/preset/adapter/googleServiceAccount/cache'
import { previewGoogleChatRequest } from 'src/ts/preset/adapter/googleGemini'
import type { ModelPreset } from 'src/ts/preset/types'
import { PAGEFOLD_MAXIMUM_CONTINUATION_V1, PAGEFOLD_SYSTEM_DECODER_V1 } from './directives'
import { PAGEFOLD_QUALIFIED_ROUTE } from './qualifiedRoute'

const SA_JSON = JSON.stringify({
    type: 'service_account',
    project_id: 'pagefold-test-project',
    private_key_id: 'kid-test',
    private_key: '-----BEGIN PRIVATE KEY-----\nTEST\n-----END PRIVATE KEY-----\n',
    client_email: 'pagefold-test@example.invalid',
    token_uri: 'https://oauth2.googleapis.com/token',
})
const pdf = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])
const pdfSha = 'a'.repeat(64)

function preset(customBody?: Record<string, unknown>): ModelPreset {
    return {
        id: 'preset-pagefold-wire',
        name: 'PageFold wire',
        pageFold: { enabled: true, mode: 'maximum' },
        profileSnapshot: {
            profileId: PAGEFOLD_QUALIFIED_ROUTE.profileId,
            profileVersion: PAGEFOLD_QUALIFIED_ROUTE.profileVersion,
            providerBaseId: PAGEFOLD_QUALIFIED_ROUTE.providerBaseId,
            providerBaseVersion: PAGEFOLD_QUALIFIED_ROUTE.providerBaseVersion,
            adapterKind: 'google-gemini',
            endpoint: { kind: 'vertex-gemini' },
            auth: { kind: 'google-service-account', fields: ['serviceAccountJson'] },
            modelId: PAGEFOLD_QUALIFIED_ROUTE.requestedModel,
            schema: [
                { key: 'serviceAccountJson', type: 'string', label: 'SA', mapsTo: { target: 'auth', path: 'apiKey' } },
                { key: 'location', type: 'string', label: 'Location', default: 'global', mapsTo: { target: 'custom', path: 'location' } },
                { key: 'projectId', type: 'string', label: 'Project', mapsTo: { target: 'custom', path: 'project' } },
                { key: 'modelId', type: 'string', label: 'Model', mapsTo: { target: 'body', path: 'model' } },
            ],
            uiSchema: { groups: [], fields: [] },
            defaults: {},
            limits: { known: true, contextWindowTokens: 1_048_576, maxOutputTokens: 65_536 },
        },
        userValues: { serviceAccountJson: SA_JSON },
        customBody,
        createdAt: 1,
        updatedAt: 2,
    }
}

function aiStudioPreset(): ModelPreset {
    const value = preset({ generationConfig: { maxOutputTokens: 777 } })
    value.profileSnapshot = {
        ...value.profileSnapshot,
        profileId: 'google:gemini-36-flash',
        providerBaseId: 'google',
        providerBaseVersion: 2,
        endpoint: { kind: 'static', url: 'https://generativelanguage.googleapis.com/v1beta/models' },
        auth: { kind: 'x-goog-api-key', fields: ['apiKey'] },
        modelId: 'gemini-3.6-flash',
        schema: [
            { key: 'apiKey', type: 'string', label: 'API key', mapsTo: { target: 'auth', path: 'apiKey' } },
            { key: 'modelId', type: 'string', label: 'Model', mapsTo: { target: 'body', path: 'model' } },
        ],
    }
    value.userValues = { apiKey: 'ai-studio-test-key', modelId: 'gemini-3.6-flash' }
    return value
}

function context(
    outputReserve = 8_192,
    wireModel = 'gemini-3.7-flash',
    mediaResolutionPlacement: 'part' | 'generation' = 'part',
): AdapterPageFoldWireContext {
    return {
        routeProfileId: PAGEFOLD_QUALIFIED_ROUTE.id,
        wireModel,
        mediaResolutionPlacement,
        mode: 'maximum',
        directiveVersion: 1,
        documentSha256: pdfSha,
        pageCount: 1,
        pdfBytes: pdf.byteLength,
        outputReserve,
        predictedWireInputTokens: 900,
        wireContextLimit: 1_048_576,
    }
}

function messages(): AdapterChatMessage[] {
    return [
        { role: 'system', content: PAGEFOLD_SYSTEM_DECODER_V1 },
        {
            role: 'user',
            content: PAGEFOLD_MAXIMUM_CONTINUATION_V1,
            documents: [{
                kind: 'document',
                mime: 'application/pdf',
                filename: 'pagefold-v1.pdf',
                bytes: pdf,
                pageCount: 1,
                byteLength: pdf.byteLength,
                sha256: pdfSha,
                mediaResolution: 'low',
            }],
        },
    ]
}

beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(serviceAccountCache, 'getDefaultServiceAccountTokenCache').mockReturnValue({
        getAccessToken: async () => ({ accessToken: 'test-access-token', tokenType: 'Bearer', expiresAtMs: Date.now() + 60_000 }),
        clear() {},
    })
})

describe('PageFold final Gemini prepared wire', () => {
    it('keeps the PageFold-off ordinary text/image request body byte-exact', async () => {
        const ordinaryPreset = preset()
        ordinaryPreset.pageFold = { enabled: false }
        const prepared = await previewGoogleChatRequest(ordinaryPreset, {
            messages: [
                { role: 'system', content: 'ordinary system' },
                {
                    role: 'user',
                    content: 'ordinary user',
                    images: [{ kind: 'image', mime: 'image/png', base64: 'AQID' }],
                },
            ],
        }, { apiKey: SA_JSON })

        expect(JSON.stringify(prepared.body)).toBe(
            '{"contents":[{"role":"user","parts":[{"text":"ordinary user"},'
            + '{"inlineData":{"mimeType":"image/png","data":"AQID"}}]}],'
            + '"systemInstruction":{"parts":[{"text":"ordinary system"}]}}',
        )
        expect(JSON.stringify(prepared.body)).not.toContain('mediaResolution')
        expect(JSON.stringify(prepared.body)).not.toContain('application/pdf')
    })

    it('puts one native low-resolution PDF first and preserves production generation fields', async () => {
        const prepared = await previewGoogleChatRequest(preset({
            generationConfig: {
                maxOutputTokens: 777,
                responseMimeType: 'application/json',
                responseSchema: { type: 'OBJECT', properties: { answer: { type: 'STRING' } } },
            },
        }), { messages: messages(), pageFold: context(777) }, { apiKey: SA_JSON })

        expect(prepared.url).toBe(
            'https://aiplatform.googleapis.com/v1/projects/pagefold-test-project/locations/global'
            + '/publishers/google/models/gemini-3.7-flash:generateContent',
        )
        expect(prepared.headers.Authorization).toBe('Bearer test-access-token')
        expect(prepared.body.systemInstruction).toEqual({ parts: [{ text: PAGEFOLD_SYSTEM_DECODER_V1 }] })
        expect(prepared.body.contents).toEqual([{ role: 'user', parts: [
            {
                inlineData: { mimeType: 'application/pdf', data: 'JVBERi0x' },
                mediaResolution: { level: 'MEDIA_RESOLUTION_LOW' },
            },
            { text: PAGEFOLD_MAXIMUM_CONTINUATION_V1 },
        ] }])
        expect(prepared.body.generationConfig).toEqual({
            maxOutputTokens: 777,
            responseMimeType: 'application/json',
            responseSchema: { type: 'OBJECT', properties: { answer: { type: 'STRING' } } },
        })
        expect(JSON.stringify(prepared.body)).not.toContain('filename')
        expect(JSON.stringify(prepared.body)).not.toMatch(/PAGEFOLD_RESPONSE_ORACLE|B_START|L000000/)
    })

    it('keeps a different selected Gemini 3 model instead of substituting 3.7', async () => {
        const selected = preset({ generationConfig: { maxOutputTokens: 777 } })
        selected.userValues.modelId = 'gemini-3.5-flash'
        const prepared = await previewGoogleChatRequest(
            selected,
            { messages: messages(), pageFold: context(777, 'gemini-3.5-flash', 'part') },
            { apiKey: SA_JSON },
        )
        expect(prepared.url).toContain('/models/gemini-3.5-flash:generateContent')
        expect(prepared.url).not.toContain('gemini-3.7-flash')
        expect((prepared.body.contents as any)[0].parts[0].mediaResolution)
            .toEqual({ level: 'MEDIA_RESOLUTION_LOW' })
    })

    it('uses global low media resolution for a selected Gemini 2.5 model', async () => {
        const selected = preset({ generationConfig: { maxOutputTokens: 777 } })
        selected.userValues.modelId = 'gemini-2.5-flash'
        const prepared = await previewGoogleChatRequest(
            selected,
            { messages: messages(), pageFold: context(777, 'gemini-2.5-flash', 'generation') },
            { apiKey: SA_JSON },
        )
        expect(prepared.url).toContain('/models/gemini-2.5-flash:generateContent')
        expect((prepared.body.contents as any)[0].parts[0]).not.toHaveProperty('mediaResolution')
        expect(prepared.body.generationConfig).toMatchObject({
            maxOutputTokens: 777,
            mediaResolution: 'MEDIA_RESOLUTION_LOW',
        })
    })

    it('uses the selected AI Studio Gemini model with the same PDF-first wire', async () => {
        const prepared = await previewGoogleChatRequest(
            aiStudioPreset(),
            { messages: messages(), pageFold: context(777, 'gemini-3.6-flash', 'part') },
            { apiKey: 'ai-studio-test-key' },
        )
        expect(prepared.url).toContain('/models/gemini-3.6-flash:generateContent')
        expect(prepared.headers['x-goog-api-key']).toBe('ai-studio-test-key')
        expect((prepared.body.contents as any)[0].parts[0]).toMatchObject({
            inlineData: { mimeType: 'application/pdf' },
            mediaResolution: { level: 'MEDIA_RESOLUTION_LOW' },
        })
    })

    it('blocks custom cachedContent and document input without explicit PageFold context', async () => {
        await expect(previewGoogleChatRequest(
            preset({ cachedContent: 'projects/p/locations/global/cachedContents/hostile' }),
            { messages: messages(), pageFold: context() },
            { apiKey: SA_JSON },
        )).rejects.toMatchObject({ kind: 'invalid-request', fallbackEligible: false })

        await expect(previewGoogleChatRequest(
            preset({ generationConfig: { mediaResolution: { level: 'MEDIA_RESOLUTION_MEDIUM' } } }),
            { messages: messages(), pageFold: context() },
            { apiKey: SA_JSON },
        )).rejects.toMatchObject({ kind: 'invalid-request', fallbackEligible: false })

        await expect(previewGoogleChatRequest(
            preset(),
            { messages: messages() },
            { apiKey: SA_JSON },
        )).rejects.toMatchObject({ kind: 'invalid-request', fallbackEligible: false })
    })
})
