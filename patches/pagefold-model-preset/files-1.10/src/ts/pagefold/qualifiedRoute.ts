import type { ModelPreset } from 'src/ts/preset/types'

/** Renderer/layout identity. It does not select or replace the provider model. */
export const PAGEFOLD_RENDER_PROFILE_ID = 'vertex-gemini-3.7-flash-low-v8' as const
/** Backward-compatible name used by the binary render-port protocol. */
export const PAGEFOLD_ROUTE_PROFILE_ID = PAGEFOLD_RENDER_PROFILE_ID
export const PAGEFOLD_FONT_VERSION = 'google-fonts-ec626514f79f831f1ab848a82114a0ce7e2d6372' as const

export type PageFoldMediaResolutionPlacement = 'part' | 'generation'
export type PageFoldSupportEvidence = 'v8-qualified' | 'google-pdf-transport'

export interface PageFoldQualifiedRouteProfile {
    readonly id: typeof PAGEFOLD_RENDER_PROFILE_ID
    readonly profileId: string
    readonly profileVersion: number
    readonly providerBaseId: 'vertex-gemini-native' | 'google'
    readonly providerBaseVersion: number
    readonly adapterKind: 'google-gemini'
    readonly endpointKind: 'vertex-gemini' | 'static'
    readonly authKind: 'google-service-account' | 'x-goog-api-key'
    readonly endpointLocation: string
    readonly requestedModel: string
    readonly mediaResolution: 'low'
    readonly mediaResolutionWire: 'MEDIA_RESOLUTION_LOW'
    readonly mediaResolutionPlacement: PageFoldMediaResolutionPlacement
    readonly supportedModes: readonly ['maximum', 'balanced']
    readonly maxPdfPages: 8
    readonly maxCanonicalBytes: number
    readonly maxPdfBytes: number
    readonly wireContextLimitTokens: number
    readonly profileMaxOutputTokens: number
    readonly serializerVersion: 1
    readonly layoutVersion: 1
    readonly fontVersion: typeof PAGEFOLD_FONT_VERSION
    readonly directiveVersion: 1
    readonly wirePredictionVersion: 1
    readonly semanticOracleVersion: 8 | null
    readonly supportEvidence: PageFoldSupportEvidence
    readonly lowMediaTokensPerPage: 266
    readonly fixedOverheadUpperTokens: 600
}

const COMMON_ROUTE = Object.freeze({
    id: PAGEFOLD_RENDER_PROFILE_ID,
    adapterKind: 'google-gemini',
    mediaResolution: 'low',
    mediaResolutionWire: 'MEDIA_RESOLUTION_LOW',
    supportedModes: Object.freeze(['maximum', 'balanced'] as const),
    maxPdfPages: 8,
    maxCanonicalBytes: 2 * 1024 * 1024,
    maxPdfBytes: 16 * 1024 * 1024,
    serializerVersion: 1,
    layoutVersion: 1,
    fontVersion: PAGEFOLD_FONT_VERSION,
    directiveVersion: 1,
    wirePredictionVersion: 1,
    lowMediaTokensPerPage: 266,
    fixedOverheadUpperTokens: 600,
} as const)

/** Frozen v8 evidence cell. Runtime may resolve other selected Gemini models. */
export const PAGEFOLD_QUALIFIED_ROUTE: PageFoldQualifiedRouteProfile = Object.freeze({
    ...COMMON_ROUTE,
    profileId: 'vertex-gemini-native:gemini-37-flash',
    profileVersion: 1,
    providerBaseId: 'vertex-gemini-native',
    providerBaseVersion: 7,
    endpointKind: 'vertex-gemini',
    authKind: 'google-service-account',
    endpointLocation: 'global',
    requestedModel: 'gemini-3.7-flash',
    mediaResolutionPlacement: 'part',
    wireContextLimitTokens: 1_048_576,
    profileMaxOutputTokens: 65_536,
    semanticOracleVersion: 8,
    supportEvidence: 'v8-qualified',
})

export type PageFoldRouteMismatchReason =
    | 'unsupported-provider'
    | 'unsupported-adapter'
    | 'unsupported-endpoint'
    | 'unsupported-auth'
    | 'wire-model-missing'
    | 'wire-limit-unknown'

export type PageFoldRouteResolution =
    | { ok: true, route: PageFoldQualifiedRouteProfile }
    | { ok: false, reason: PageFoldRouteMismatchReason }

/**
 * Resolve PageFold transport from the live ModelPreset. The preset remains the
 * sole model authority: this function records its effective wire model and
 * never substitutes the v8 evidence model.
 */
export function resolvePageFoldQualifiedRoute(preset: ModelPreset): PageFoldRouteResolution {
    const snapshot = preset?.profileSnapshot
    if (!snapshot || snapshot.adapterKind !== 'google-gemini') {
        return mismatch('unsupported-adapter')
    }

    let provider: Pick<PageFoldQualifiedRouteProfile,
        'providerBaseId' | 'endpointKind' | 'authKind' | 'endpointLocation'>
    if (snapshot.providerBaseId === 'vertex-gemini-native') {
        if (snapshot.endpoint?.kind !== 'vertex-gemini') return mismatch('unsupported-endpoint')
        if (snapshot.auth?.kind !== 'google-service-account') return mismatch('unsupported-auth')
        const endpointOverride = effectiveMappedString(preset, 'custom', 'endpointUrl')
        if (endpointOverride !== undefined && endpointOverride.trim().length > 0) {
            return mismatch('unsupported-endpoint')
        }
        provider = {
            providerBaseId: 'vertex-gemini-native',
            endpointKind: 'vertex-gemini',
            authKind: 'google-service-account',
            endpointLocation: effectiveMappedString(preset, 'custom', 'location')?.trim() || 'global',
        }
    } else if (snapshot.providerBaseId === 'google') {
        if (snapshot.endpoint?.kind !== 'static'
            || !snapshot.endpoint.url.startsWith('https://generativelanguage.googleapis.com/')) {
            return mismatch('unsupported-endpoint')
        }
        if (snapshot.auth?.kind !== 'x-goog-api-key') return mismatch('unsupported-auth')
        provider = {
            providerBaseId: 'google',
            endpointKind: 'static',
            authKind: 'x-goog-api-key',
            endpointLocation: 'global',
        }
    } else {
        return mismatch('unsupported-provider')
    }

    const requestedModel = resolvePageFoldRequestedModel(preset)?.trim()
    if (!requestedModel) return mismatch('wire-model-missing')
    const limits = resolveLimits(preset, requestedModel)
    if (!limits) return mismatch('wire-limit-unknown')
    const v8Qualified = isV8EvidenceCell(preset, requestedModel, provider.endpointLocation)

    return {
        ok: true,
        route: Object.freeze({
            ...COMMON_ROUTE,
            profileId: snapshot.profileId,
            profileVersion: snapshot.profileVersion,
            providerBaseVersion: snapshot.providerBaseVersion,
            ...provider,
            requestedModel,
            mediaResolutionPlacement: isGemini3(requestedModel) ? 'part' : 'generation',
            wireContextLimitTokens: limits.contextWindowTokens,
            profileMaxOutputTokens: limits.maxOutputTokens,
            semanticOracleVersion: v8Qualified ? 8 : null,
            supportEvidence: v8Qualified ? 'v8-qualified' : 'google-pdf-transport',
        }),
    }
}

export function resolvePageFoldRequestedModel(preset: ModelPreset): string | undefined {
    const modelField = preset.profileSnapshot.schema.find((field) => field.key === 'modelId')
    if (modelField) {
        if (Object.prototype.hasOwnProperty.call(preset.userValues, modelField.key)) {
            const value = preset.userValues[modelField.key]
            if (typeof value === 'string' && value.length > 0) return value
            if (value !== undefined && value !== '') return undefined
        }
        if (typeof modelField.default === 'string' && modelField.default.length > 0) {
            return modelField.default
        }
    }
    return preset.profileSnapshot.modelId || undefined
}

export function resolvePageFoldEffectiveMappedString(
    preset: ModelPreset,
    target: 'body' | 'header' | 'query' | 'auth' | 'custom',
    path: string,
): string | undefined {
    return effectiveMappedString(preset, target, path)
}

function resolveLimits(preset: ModelPreset, model: string): {
    contextWindowTokens: number
    maxOutputTokens: number
} | undefined {
    const limits = preset.profileSnapshot.limits
    if (limits?.known === true
        && positiveInteger(limits.contextWindowTokens)
        && positiveInteger(limits.maxOutputTokens)) {
        return {
            contextWindowTokens: Math.floor(limits.contextWindowTokens!),
            maxOutputTokens: Math.floor(limits.maxOutputTokens!),
        }
    }
    return KNOWN_GEMINI_LIMITS[model]
}

const KNOWN_GEMINI_LIMITS: Readonly<Record<string, {
    contextWindowTokens: number
    maxOutputTokens: number
}>> = Object.freeze(Object.fromEntries([
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-3-flash-preview',
    'gemini-3.1-pro-preview',
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.6-flash',
    'gemini-3.7-flash',
].map((model) => [model, { contextWindowTokens: 1_048_576, maxOutputTokens: 65_536 }])))

function isV8EvidenceCell(preset: ModelPreset, model: string, location: string): boolean {
    const snapshot = preset.profileSnapshot
    return snapshot.profileId === PAGEFOLD_QUALIFIED_ROUTE.profileId
        && snapshot.profileVersion === PAGEFOLD_QUALIFIED_ROUTE.profileVersion
        && snapshot.providerBaseId === PAGEFOLD_QUALIFIED_ROUTE.providerBaseId
        && snapshot.providerBaseVersion === PAGEFOLD_QUALIFIED_ROUTE.providerBaseVersion
        && model === PAGEFOLD_QUALIFIED_ROUTE.requestedModel
        && location === PAGEFOLD_QUALIFIED_ROUTE.endpointLocation
}

function isGemini3(model: string): boolean {
    return /^gemini-3(?:[.-]|$)/.test(model)
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

function positiveInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function mismatch(reason: PageFoldRouteMismatchReason): PageFoldRouteResolution {
    return { ok: false, reason }
}
