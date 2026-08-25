import { describe, expect, it } from 'vitest'
import type { ModelPreset } from 'src/ts/preset/types'
import {
    PAGEFOLD_QUALIFIED_ROUTE,
    resolvePageFoldQualifiedRoute,
} from './qualifiedRoute'

function preset(): ModelPreset {
    return {
        id: 'preset-vertex-37',
        name: 'Vertex 3.7',
        profileSnapshot: {
            profileId: 'vertex-gemini-native:gemini-37-flash',
            profileVersion: 1,
            providerBaseId: 'vertex-gemini-native',
            providerBaseVersion: 7,
            adapterKind: 'google-gemini',
            endpoint: { kind: 'vertex-gemini' },
            auth: { kind: 'google-service-account', fields: ['serviceAccountJson'] },
            modelId: 'gemini-3.7-flash',
            schema: [
                { key: 'location', type: 'string', label: 'Location', default: 'global', mapsTo: { target: 'custom', path: 'location' } },
                { key: 'endpointUrl', type: 'string', label: 'Endpoint', mapsTo: { target: 'custom', path: 'endpointUrl' } },
                { key: 'modelId', type: 'string', label: 'Model', mapsTo: { target: 'body', path: 'model' } },
            ],
            uiSchema: { groups: [], fields: [] },
            defaults: {},
            limits: { known: true, contextWindowTokens: 1_048_576, maxOutputTokens: 65_536 },
        },
        userValues: {},
        createdAt: 1,
        updatedAt: 2,
    }
}

function mutate(change: (value: ModelPreset) => void): ModelPreset {
    const value = structuredClone(preset())
    change(value)
    return value
}

describe('PageFold preset-authoritative Google Gemini route', () => {
    it('retains the frozen 3.7 v8 evidence cell without making it the model selector', () => {
        expect(resolvePageFoldQualifiedRoute(preset())).toEqual({
            ok: true,
            route: PAGEFOLD_QUALIFIED_ROUTE,
        })
        expect(PAGEFOLD_QUALIFIED_ROUTE).toMatchObject({
            requestedModel: 'gemini-3.7-flash',
            mediaResolutionPlacement: 'part',
            semanticOracleVersion: 8,
            supportEvidence: 'v8-qualified',
        })
    })

    it('uses the selected preset model and current snapshot limits verbatim', () => {
        const value = mutate((p) => {
            p.userValues.modelId = 'gemini-3.5-flash'
            p.profileSnapshot.profileId = 'vertex-gemini-native:gemini-35-flash'
            p.profileSnapshot.profileVersion = 3
            p.profileSnapshot.providerBaseVersion = 9
            p.profileSnapshot.limits = { known: true, contextWindowTokens: 777_777, maxOutputTokens: 12_345 }
        })
        expect(resolvePageFoldQualifiedRoute(value)).toMatchObject({
            ok: true,
            route: {
                profileId: 'vertex-gemini-native:gemini-35-flash',
                profileVersion: 3,
                providerBaseVersion: 9,
                requestedModel: 'gemini-3.5-flash',
                wireContextLimitTokens: 777_777,
                profileMaxOutputTokens: 12_345,
                mediaResolutionPlacement: 'part',
                semanticOracleVersion: null,
                supportEvidence: 'google-pdf-transport',
            },
        })
    })

    it('uses global low media resolution for Gemini 2.5', () => {
        const value = mutate((p) => { p.userValues.modelId = 'gemini-2.5-flash' })
        expect(resolvePageFoldQualifiedRoute(value)).toMatchObject({
            ok: true,
            route: { requestedModel: 'gemini-2.5-flash', mediaResolutionPlacement: 'generation' },
        })
    })

    it('supports the Google AI Studio adapter without changing its selected model', () => {
        const value = mutate((p) => {
            p.profileSnapshot.profileId = 'google:gemini-36-flash'
            p.profileSnapshot.providerBaseId = 'google'
            p.profileSnapshot.providerBaseVersion = 2
            p.profileSnapshot.endpoint = { kind: 'static', url: 'https://generativelanguage.googleapis.com/v1beta/models' }
            p.profileSnapshot.auth = { kind: 'x-goog-api-key', fields: ['apiKey'] }
            p.profileSnapshot.modelId = 'gemini-3.6-flash'
            p.userValues.modelId = 'gemini-3.6-flash'
        })
        expect(resolvePageFoldQualifiedRoute(value)).toMatchObject({
            ok: true,
            route: {
                providerBaseId: 'google',
                endpointKind: 'static',
                authKind: 'x-goog-api-key',
                requestedModel: 'gemini-3.6-flash',
            },
        })
    })

    it.each([
        ['adapter', mutate((p) => { p.profileSnapshot.adapterKind = 'openai-compatible' }), 'unsupported-adapter'],
        ['provider base', mutate((p) => { p.profileSnapshot.providerBaseId = 'other' }), 'unsupported-provider'],
        ['endpoint kind', mutate((p) => { p.profileSnapshot.endpoint = { kind: 'static', url: 'https://example.invalid' } }), 'unsupported-endpoint'],
        ['auth kind', mutate((p) => { p.profileSnapshot.auth = { kind: 'x-goog-api-key', fields: ['apiKey'] } }), 'unsupported-auth'],
        ['custom endpoint', mutate((p) => { p.userValues.endpointUrl = 'https://example.invalid/models' }), 'unsupported-endpoint'],
        ['unknown limits', mutate((p) => {
            p.profileSnapshot.limits = { known: false }
            p.userValues.modelId = 'future-model-without-limits'
        }), 'wire-limit-unknown'],
    ])('blocks only %s capability drift before rendering', (_label, value, reason) => {
        expect(resolvePageFoldQualifiedRoute(value)).toEqual({ ok: false, reason })
    })

    it('treats blank model/endpoint/location values as profile defaults', () => {
        const value = mutate((p) => {
            p.userValues.modelId = ''
            p.userValues.endpointUrl = ''
            p.userValues.location = ''
        })
        expect(resolvePageFoldQualifiedRoute(value)).toMatchObject({
            ok: true,
            route: { requestedModel: 'gemini-3.7-flash', endpointLocation: 'global' },
        })
    })
})
