export interface CostContext {
    v: number
    product: string
    region: string
    tier: string | null
    tierSource: string
    priceDay: string | null
    valid: boolean
    accounting: boolean
    inputReported: boolean
    outputReported: boolean
    aborted: boolean
    successful: boolean
}

export interface CostBucket {
    model: string | null
    provider: string | null
    context: string | null
    requests?: number
    failed?: number
    inputTokens: number
    outputTokens: number
    cachedTokens: number
    reasoningTokens: number
}

export interface UsageCostEntry extends CostBucket {
    id: number
    timestamp: number
    source: string
    success: number
}

export interface CostPage {
    costVersion: number
    entries: UsageCostEntry[]
    nextCursor: { timestamp: number, id: number } | null
}

export const PRICE_CHECKED_AT = '2026-10-15'
export const PRICE_SOURCES = {
    gemini: 'https://ai.google.dev/gemini-api/docs/pricing',
    vertex: 'https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing',
}

export function parseCostContext(value: string | null | undefined): CostContext | null {
    try {
        const result: unknown = JSON.parse(value ?? 'null')
        return result && typeof result === 'object' && !Array.isArray(result)
            && (result as CostContext).v === 1 ? result as CostContext : null
    } catch { return null }
}

export function cacheRatio(input: number, cached: number): number | null {
    return Number.isFinite(input) && Number.isFinite(cached) && input > 0 && cached >= 0 && cached <= input
        ? cached / input : null
}

export function priceFor(model: string | null, context: CostContext) {
    if (model !== 'gemini-4-argon' || !context.priceDay || !/^\d{4}-\d{2}-\d{2}$/.test(context.priceDay)) return null
    if (context.product !== 'gemini' && context.product !== 'vertex') return null
    if (context.region !== 'global' && !(context.product === 'vertex' && context.region === 'regional')) return null
    if (!['standard', 'priority', 'flex'].includes(context.tier ?? '')) return null
    // Developer API Flex is qualified; Vertex does not list Argon Flex.
    if (context.product === 'vertex' && context.tier === 'flex') return null
    const promotional = context.priceDay < '2026-12-01'
    const dateMultiplier = promotional ? 1 : 2
    const tierMultiplier = context.tier === 'priority' ? 1.8 : context.tier === 'flex' ? 0.5 : 1
    const regionMultiplier = context.region === 'regional' ? 1.1 : 1
    const multiplier = dateMultiplier * tierMultiplier * regionMultiplier
    return { input: 2 * multiplier, cached: 0.1 * multiplier, output: 10 * multiplier,
        promotional: promotional && context.product === 'vertex', source: PRICE_SOURCES[context.product] }
}

export function estimateCost(row: CostBucket) {
    const context = parseCostContext(row.context)
    const unknown = (reason: 'legacy' | 'usage' | 'price' | 'failed') => ({ cost: null, saved: null, assumed: false, promotional: false, reason })
    if (!context) return unknown('legacy')
    if (!context.successful && !context.aborted && !context.inputReported && !context.outputReported) return unknown('failed')
    if (!context.valid || !context.accounting || !context.priceDay || context.aborted || !context.successful
        || ![row.inputTokens, row.outputTokens, row.cachedTokens, row.reasoningTokens].every(n => Number.isSafeInteger(n) && n >= 0)
        || row.cachedTokens > row.inputTokens || row.reasoningTokens > row.outputTokens) return unknown('usage')
    const price = priceFor(row.model, context)
    if (!price) return unknown('price')
    return {
        cost: ((row.inputTokens - row.cachedTokens) * price.input + row.cachedTokens * price.cached + row.outputTokens * price.output) / 1e6,
        saved: row.cachedTokens * (price.input - price.cached) / 1e6,
        assumed: context.tierSource === 'assumed', promotional: price.promotional, reason: null,
    }
}

export function summarizeCosts(rows: CostBucket[]) {
    let cost = 0, saved = 0, known = 0, unknown = 0, failedUnreported = 0, assumed = 0
    let input = 0, cached = 0, promotional = false, unpriced = 0, legacy = 0, incomplete = 0
    for (const row of rows) {
        const value = estimateCost(row), count = row.requests ?? 1
        if (value.cost === null) {
            if (value.reason === 'failed') failedUnreported += count
            else {
                unknown += count
                if (value.reason === 'price') unpriced += count
                else if (value.reason === 'legacy') legacy += count
                else incomplete += count
            }
            continue
        }
        cost += value.cost; saved += value.saved!; known += count
        input += row.inputTokens; cached += row.cachedTokens
        if (value.assumed) assumed += count
        promotional ||= value.promotional
    }
    return { cost: known || rows.length === 0 ? cost : null, saved: known || rows.length === 0 ? saved : null, known, unknown, failedUnreported, assumed,
        promotional, input, cached, unpriced, legacy, incomplete, ratio: cacheRatio(input, cached) }
}

export function formatUsd(value: number | null): string {
    if (value === null) return '—'
    if (value > 0 && value < 0.0001) return `$${value.toPrecision(3)}`
    return `$${value.toFixed(value >= 1 ? 2 : 4)}`
}

export function formatCacheRatio(input: number, cached: number): string {
    const value = cacheRatio(input, cached)
    return value === null ? '—' : `${(100 * value).toFixed(1)}%`
}

export function formatUsageTime(timestamp: number) {
    const date = new Date(timestamp)
    if (!Number.isFinite(timestamp) || !Number.isFinite(date.getTime())) return { iso: undefined, full: '—', short: '—' }
    const pad = (value: number) => String(value).padStart(2, '0')
    const day = `${String(date.getFullYear()).slice(-2).padStart(2, '0')}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
    return { iso: date.toISOString(), full: date.toLocaleString(),
        short: `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}` }
}
