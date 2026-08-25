import type { ModelPreset } from 'src/ts/preset/types'
import { PAGEFOLD_QUALIFIED_ROUTE, resolvePageFoldQualifiedRoute } from './qualifiedRoute'

export interface PageFoldPriceRecord {
    id: string
    provider: 'vertex'
    model: 'gemini-3.7-flash'
    location: 'global'
    billingTier: 'standard'
    currency: 'USD'
    inputUsdPerMillion: number
    outputUsdPerMillion: number
    effectiveFrom: string
    effectiveUntil?: string
    checkedAt: '2026-08-25'
    sourceUrl: string
    note: string
}

export type PageFoldResolvedPrice =
    | { state: 'confirmed', record: PageFoldPriceRecord, source: 'manual' | 'versioned-google' }
    | { state: 'unconfirmed', reason: string }

const SOURCE = 'https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing?hl=ko'

export const PAGEFOLD_VERTEX_PRICE_RECORDS: readonly PageFoldPriceRecord[] = Object.freeze([
    Object.freeze({
        id: 'vertex-gemini-3.7-flash-global-standard-intro-2026',
        provider: 'vertex', model: 'gemini-3.7-flash', location: 'global',
        billingTier: 'standard', currency: 'USD',
        inputUsdPerMillion: 0.75, outputUsdPerMillion: 3.75,
        effectiveFrom: '2026-08-12T00:00:00.000Z',
        effectiveUntil: '2027-01-01T00:00:00.000Z',
        checkedAt: '2026-08-25', sourceUrl: SOURCE,
        note: 'Introductory price through 2026-12-31; Google states the promotion is delivered as a 50% credit-back on eligible net spend.',
    }),
    Object.freeze({
        id: 'vertex-gemini-3.7-flash-global-standard-2027',
        provider: 'vertex', model: 'gemini-3.7-flash', location: 'global',
        billingTier: 'standard', currency: 'USD',
        inputUsdPerMillion: 1.50, outputUsdPerMillion: 7.50,
        effectiveFrom: '2027-01-01T00:00:00.000Z',
        checkedAt: '2026-08-25', sourceUrl: SOURCE,
        note: 'Published Standard global price starting 2027-01-01; not Priority, Flex/Batch, cached-input, or non-global pricing.',
    }),
])

export function resolvePageFoldPrice(preset: ModelPreset, now = Date.now()): PageFoldResolvedPrice {
    const route = resolvePageFoldQualifiedRoute(preset)
    if (route.ok === false) {
        return { state: 'unconfirmed', reason: route.reason }
    }
    if (route.route !== PAGEFOLD_QUALIFIED_ROUTE) {
        return { state: 'unconfirmed', reason: 'route-profile-mismatch' }
    }
    const manual = preset.pageFold?.inputPriceOverride
    if (manual && Number.isFinite(manual.usdPerMillion) && manual.usdPerMillion > 0) {
        return {
            state: 'confirmed',
            source: 'manual',
            record: {
                ...PAGEFOLD_VERTEX_PRICE_RECORDS[0],
                id: 'manual-pagefold-input-price',
                inputUsdPerMillion: manual.usdPerMillion,
                effectiveFrom: new Date(manual.updatedAt).toISOString(),
                effectiveUntil: undefined,
                sourceUrl: 'manual:preset-pagefold-input-price',
                note: manual.note?.slice(0, 200) || 'User-supplied PageFold input price; output price remains the current versioned Vertex record.',
            },
        }
    }
    const record = PAGEFOLD_VERTEX_PRICE_RECORDS.find((candidate) => {
        const start = Date.parse(candidate.effectiveFrom)
        const end = candidate.effectiveUntil ? Date.parse(candidate.effectiveUntil) : Infinity
        return now >= start && now < end
    })
    return record
        ? { state: 'confirmed', source: 'versioned-google', record }
        : { state: 'unconfirmed', reason: 'no-effective-price-record' }
}
