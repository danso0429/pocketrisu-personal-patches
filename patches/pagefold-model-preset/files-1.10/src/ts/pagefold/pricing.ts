import type { ModelPreset } from 'src/ts/preset/types'
import {
    resolvePageFoldEffectiveMappedString,
    resolvePageFoldQualifiedRoute,
} from './qualifiedRoute'

export interface PageFoldPriceRecord {
    id: string
    provider: 'vertex'
    model: string
    location: 'global'
    billingTier: 'standard'
    currency: 'USD'
    inputUsdPerMillion: number
    outputUsdPerMillion: number
    effectiveFrom: string
    effectiveUntil?: string
    checkedAt: '2026-08-26'
    sourceUrl: string
    note: string
}

export type PageFoldResolvedPrice =
    | { state: 'confirmed', record: PageFoldPriceRecord, source: 'versioned-google' }
    | { state: 'unconfirmed', reason: string }

const SOURCE = 'https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing?hl=ko'

function record(
    model: string,
    input: number,
    output: number,
    options: { idSuffix?: string, from?: string, until?: string, note?: string } = {},
): PageFoldPriceRecord {
    return Object.freeze({
        id: `vertex-${model}-global-standard${options.idSuffix ? `-${options.idSuffix}` : ''}`,
        provider: 'vertex', model, location: 'global', billingTier: 'standard', currency: 'USD',
        inputUsdPerMillion: input, outputUsdPerMillion: output,
        effectiveFrom: options.from ?? '2026-08-26T00:00:00.000Z',
        ...(options.until ? { effectiveUntil: options.until } : {}),
        checkedAt: '2026-08-26', sourceUrl: SOURCE,
        note: options.note ?? 'Published Standard global price; cached input, Priority, Flex/Batch, and non-global pricing are separate.',
    })
}

const INTRO_UNTIL = '2027-01-01T00:00:00.000Z'
const INTRO_FROM = '2026-08-12T00:00:00.000Z'

export const PAGEFOLD_VERTEX_PRICE_RECORDS: readonly PageFoldPriceRecord[] = Object.freeze([
    record('gemini-3.7-flash', 0.75, 3.75, {
        idSuffix: 'intro-2026', from: INTRO_FROM, until: INTRO_UNTIL,
        note: 'Introductory Standard global price through 2026-12-31; Google states the promotion is delivered as credits back on eligible net spend.',
    }),
    record('gemini-3.7-flash', 1.50, 7.50, { idSuffix: '2027', from: INTRO_UNTIL }),
    record('gemini-3.6-flash', 0.75, 3.75, {
        idSuffix: 'intro-2026', from: INTRO_FROM, until: INTRO_UNTIL,
        note: 'Introductory Standard global price through 2026-12-31; Google states the promotion is delivered as credits back on eligible net spend.',
    }),
    record('gemini-3.6-flash', 1.50, 7.50, { idSuffix: '2027', from: INTRO_UNTIL }),
    record('gemini-3.5-flash', 1.50, 9.00),
    record('gemini-3.5-flash-lite', 0.30, 2.50),
    record('gemini-3.1-flash-lite', 0.25, 1.50),
    record('gemini-3-flash-preview', 0.50, 3.00),
    record('gemini-2.5-flash', 0.30, 2.50),
    record('gemini-2.5-flash-lite', 0.10, 0.40),
])

export function resolvePageFoldPrice(preset: ModelPreset, now = Date.now()): PageFoldResolvedPrice {
    const route = resolvePageFoldQualifiedRoute(preset)
    if (route.ok === false) return { state: 'unconfirmed', reason: route.reason }
    if (route.route.providerBaseId !== 'vertex-gemini-native') {
        return { state: 'unconfirmed', reason: 'pricing-provider-unavailable' }
    }
    if (route.route.endpointLocation !== 'global') {
        return { state: 'unconfirmed', reason: 'pricing-region-unavailable' }
    }
    const sharedTier = resolvePageFoldEffectiveMappedString(
        preset,
        'header',
        'X-Vertex-AI-LLM-Shared-Request-Type',
    )?.trim()
    if (sharedTier) return { state: 'unconfirmed', reason: 'pricing-tier-unavailable' }

    const record = PAGEFOLD_VERTEX_PRICE_RECORDS.find((candidate) => {
        const start = Date.parse(candidate.effectiveFrom)
        const end = candidate.effectiveUntil ? Date.parse(candidate.effectiveUntil) : Infinity
        return candidate.model === route.route.requestedModel && now >= start && now < end
    })
    return record
        ? { state: 'confirmed', source: 'versioned-google', record }
        : { state: 'unconfirmed', reason: 'no-effective-price-record' }
}
