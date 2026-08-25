import type { ModelPreset } from 'src/ts/preset/types'

export const PAGEFOLD_ROUTE_PROFILE_ID = 'vertex-gemini-3.7-flash-low-v8' as const
export const PAGEFOLD_FONT_VERSION = 'google-fonts-ec626514f79f831f1ab848a82114a0ce7e2d6372' as const

export const PAGEFOLD_QUALIFIED_ROUTE = Object.freeze({
    id: PAGEFOLD_ROUTE_PROFILE_ID,
    profileId: 'vertex-gemini-native:gemini-37-flash',
    profileVersion: 1,
    providerBaseId: 'vertex-gemini-native',
    providerBaseVersion: 7,
    adapterKind: 'google-gemini',
    endpointKind: 'vertex-gemini',
    authKind: 'google-service-account',
    endpointLocation: 'global',
    requestedModel: 'gemini-3.7-flash',
    mediaResolution: 'low',
    mediaResolutionWire: 'MEDIA_RESOLUTION_LOW',
    supportedModes: Object.freeze(['maximum', 'balanced'] as const),
    maxPdfPages: 8,
    maxCanonicalBytes: 2 * 1024 * 1024,
    maxPdfBytes: 16 * 1024 * 1024,
    wireContextLimitTokens: 1_048_576,
    profileMaxOutputTokens: 65_536,
    serializerVersion: 1,
    layoutVersion: 1,
    fontVersion: PAGEFOLD_FONT_VERSION,
    directiveVersion: 1,
    wirePredictionVersion: 1,
    semanticOracleVersion: 8,
    lowMediaTokensPerPage: 266,
    fixedOverheadUpperTokens: 600,
} as const)

export type PageFoldQualifiedRouteProfile = typeof PAGEFOLD_QUALIFIED_ROUTE

export type PageFoldRouteMismatchReason =
    | 'unsupported-profile'
    | 'unsupported-profile-version'
    | 'unsupported-provider'
    | 'unsupported-adapter'
    | 'unsupported-endpoint'
    | 'unsupported-auth'
    | 'unsupported-location'
    | 'unsupported-model'
    | 'wire-limit-unknown'

export type PageFoldRouteResolution =
    | { ok: true, route: PageFoldQualifiedRouteProfile }
    | { ok: false, reason: PageFoldRouteMismatchReason }

/**
 * Resolve the exact paid-qualified Vertex wire from a persisted ModelPreset.
 * This is deliberately fail-closed: provider-family similarity, display name,
 * price metadata, or a matching model id alone never qualifies a route.
 */
export function resolvePageFoldQualifiedRoute(preset: ModelPreset): PageFoldRouteResolution {
    const snapshot = preset?.profileSnapshot
    if (!snapshot || snapshot.profileId !== PAGEFOLD_QUALIFIED_ROUTE.profileId) {
        return mismatch('unsupported-profile')
    }
    if (snapshot.profileVersion !== PAGEFOLD_QUALIFIED_ROUTE.profileVersion
        || snapshot.providerBaseVersion !== PAGEFOLD_QUALIFIED_ROUTE.providerBaseVersion) {
        return mismatch('unsupported-profile-version')
    }
    if (snapshot.providerBaseId !== PAGEFOLD_QUALIFIED_ROUTE.providerBaseId) {
        return mismatch('unsupported-provider')
    }
    if (snapshot.adapterKind !== PAGEFOLD_QUALIFIED_ROUTE.adapterKind) {
        return mismatch('unsupported-adapter')
    }
    if (snapshot.endpoint?.kind !== PAGEFOLD_QUALIFIED_ROUTE.endpointKind) {
        return mismatch('unsupported-endpoint')
    }
    if (snapshot.auth?.kind !== PAGEFOLD_QUALIFIED_ROUTE.authKind) {
        return mismatch('unsupported-auth')
    }

    const endpointOverride = effectiveMappedString(preset, 'custom', 'endpointUrl')
    if (endpointOverride !== undefined && endpointOverride.trim().length > 0) {
        return mismatch('unsupported-endpoint')
    }
    const location = effectiveMappedString(preset, 'custom', 'location')?.trim() || 'global'
    if (location !== PAGEFOLD_QUALIFIED_ROUTE.endpointLocation) {
        return mismatch('unsupported-location')
    }
    if (resolveRequestedModel(preset) !== PAGEFOLD_QUALIFIED_ROUTE.requestedModel) {
        return mismatch('unsupported-model')
    }

    const limits = snapshot.limits
    if (limits?.known !== true
        || limits.contextWindowTokens !== PAGEFOLD_QUALIFIED_ROUTE.wireContextLimitTokens
        || limits.maxOutputTokens !== PAGEFOLD_QUALIFIED_ROUTE.profileMaxOutputTokens) {
        return mismatch('wire-limit-unknown')
    }
    return { ok: true, route: PAGEFOLD_QUALIFIED_ROUTE }
}

export function resolvePageFoldEffectiveMappedString(
    preset: ModelPreset,
    target: 'body' | 'header' | 'query' | 'auth' | 'custom',
    path: string,
): string | undefined {
    return effectiveMappedString(preset, target, path)
}

function resolveRequestedModel(preset: ModelPreset): string | undefined {
    const modelField = preset.profileSnapshot.schema.find((field) => field.key === 'modelId')
    if (modelField) {
        if (Object.prototype.hasOwnProperty.call(preset.userValues, modelField.key)) {
            const value = preset.userValues[modelField.key]
            if (typeof value === 'string' && value.length > 0) return value
            if (value !== undefined) return undefined
        }
        if (typeof modelField.default === 'string' && modelField.default.length > 0) {
            return modelField.default
        }
    }
    return preset.profileSnapshot.modelId || undefined
}

function effectiveMappedString(
    preset: ModelPreset,
    target: 'body' | 'header' | 'query' | 'auth' | 'custom',
    path: string,
): string | undefined {
    for (const field of preset.profileSnapshot.schema) {
        if (field.mapsTo?.target !== target || field.mapsTo.path !== path) continue
        const value = Object.prototype.hasOwnProperty.call(preset.userValues, field.key)
            && preset.userValues[field.key] !== undefined
            ? preset.userValues[field.key]
            : field.default
        return typeof value === 'string' ? value : undefined
    }
    return undefined
}

function mismatch(reason: PageFoldRouteMismatchReason): PageFoldRouteResolution {
    return { ok: false, reason }
}
