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

describe('PageFold exact v8 route profile', () => {
    it('qualifies only the frozen PocketRisu profile/base/wire tuple', () => {
        expect(resolvePageFoldQualifiedRoute(preset())).toEqual({
            ok: true,
            route: PAGEFOLD_QUALIFIED_ROUTE,
        })
        expect(PAGEFOLD_QUALIFIED_ROUTE).toMatchObject({
            mediaResolutionWire: 'MEDIA_RESOLUTION_LOW',
            maxPdfPages: 8,
            wireContextLimitTokens: 1_048_576,
            profileMaxOutputTokens: 65_536,
            semanticOracleVersion: 8,
        })
    })

    it.each([
        ['profile', mutate((p) => { p.profileSnapshot.profileId = 'vertex-gemini-native:gemini-36-flash' }), 'unsupported-profile'],
        ['profile version', mutate((p) => { p.profileSnapshot.profileVersion = 2 }), 'unsupported-profile-version'],
        ['base version', mutate((p) => { p.profileSnapshot.providerBaseVersion = 8 }), 'unsupported-profile-version'],
        ['provider base', mutate((p) => { p.profileSnapshot.providerBaseId = 'google' }), 'unsupported-provider'],
        ['adapter', mutate((p) => { p.profileSnapshot.adapterKind = 'openai-compatible' }), 'unsupported-adapter'],
        ['endpoint kind', mutate((p) => { p.profileSnapshot.endpoint = { kind: 'static', url: 'https://example.invalid' } }), 'unsupported-endpoint'],
        ['auth kind', mutate((p) => { p.profileSnapshot.auth = { kind: 'x-goog-api-key', fields: ['apiKey'] } }), 'unsupported-auth'],
        ['location', mutate((p) => { p.userValues.location = 'us-central1' }), 'unsupported-location'],
        ['model override', mutate((p) => { p.userValues.modelId = 'gemini-3.5-flash' }), 'unsupported-model'],
        ['empty explicit model', mutate((p) => { p.userValues.modelId = '' }), 'unsupported-model'],
        ['custom endpoint', mutate((p) => { p.userValues.endpointUrl = 'https://example.invalid/models' }), 'unsupported-endpoint'],
        ['context limit', mutate((p) => { p.profileSnapshot.limits!.contextWindowTokens = 999 }), 'wire-limit-unknown'],
        ['output limit', mutate((p) => { p.profileSnapshot.limits!.maxOutputTokens = 999 }), 'wire-limit-unknown'],
    ])('blocks %s drift before rendering', (_label, value, reason) => {
        expect(resolvePageFoldQualifiedRoute(value)).toEqual({ ok: false, reason })
    })

    it('treats blank endpoint/location as the native global route', () => {
        const value = mutate((p) => {
            p.userValues.endpointUrl = ''
            p.userValues.location = ''
        })
        expect(resolvePageFoldQualifiedRoute(value).ok).toBe(true)
    })
})
