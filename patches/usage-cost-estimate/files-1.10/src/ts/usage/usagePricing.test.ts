import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { estimateCost, summarizeCosts, priceFor, formatUsd, cacheRatio, formatUsageTime, type CostBucket } from './usagePricing'
import { parseGeminiResponse, parseGeminiStreamDelta } from '../preset/adapter/googleGemini'
const require = createRequire(import.meta.url)
const { captureUsageCostContext } = require('../../../server/node/usageCostStore.cjs')
const vertex = 'https://aiplatform.googleapis.com/v1/projects/test/locations/global/publishers/google/models/gemini-4-argon:generateContent'
function row(overrides: Record<string, unknown> = {}, counts: Partial<CostBucket> = {}): CostBucket {
    return { model: 'gemini-4-argon', provider: 'google', requests: 1,
        inputTokens: 100000, cachedTokens: 80000, outputTokens: 2000, reasoningTokens: 100,
        context: captureUsageCostContext({ url: vertex, timestamp: Date.UTC(2026, 10, 30),
            success: true, trafficType: 'ON_DEMAND', usageAccountingVersion: 1,
            inputTokens: 100000, cachedTokens: 80000, outputTokens: 2000, reasoningTokens: 100, ...overrides }), ...counts }
}

describe('usage/rate accounting across actual server context and client pricing', () => {
    it('preserves valid legacy dates and does not throw on an unrenderable recorded timestamp', () => {
        expect(formatUsageTime(0).iso).toBe('1970-01-01T00:00:00.000Z')
        expect(formatUsageTime(new Date(2026, 9, 16, 0, 5).getTime()).short).toBe('261016 00:05')
        expect(formatUsageTime(new Date(2025, 11, 31, 23, 59).getTime()).short).toBe('251231 23:59')
        expect(formatUsageTime(new Date(2001, 0, 2, 3, 4).getTime()).short).toBe('010102 03:04')
        expect(formatUsageTime(1e99)).toEqual({ iso: undefined, full: '—', short: '—' })
        expect(estimateCost(row({ timestamp: 1e99 })).reason).toBe('usage')
    })
    // Independent literal oracle from the official product tables, not factors
    // recomputed from the implementation. USD / million tokens.
    it.each([
        ['gemini', 'global', 'standard', '2026-11-30', 2, 0.1, 10],
        ['gemini', 'global', 'standard', '2026-12-01', 4, 0.2, 20],
        ['gemini', 'global', 'priority', '2026-11-30', 3.6, 0.18, 18],
        ['gemini', 'global', 'priority', '2026-12-01', 7.2, 0.36, 36],
        ['gemini', 'global', 'flex', '2026-11-30', 1, 0.05, 5],
        ['gemini', 'global', 'flex', '2026-12-01', 2, 0.1, 10],
        ['vertex', 'global', 'standard', '2026-11-30', 2, 0.1, 10],
        ['vertex', 'global', 'standard', '2026-12-01', 4, 0.2, 20],
        ['vertex', 'regional', 'standard', '2026-11-30', 2.2, 0.11, 11],
        ['vertex', 'regional', 'standard', '2026-12-01', 4.4, 0.22, 22],
        ['vertex', 'global', 'priority', '2026-11-30', 3.6, 0.18, 18],
        ['vertex', 'global', 'priority', '2026-12-01', 7.2, 0.36, 36],
        ['vertex', 'regional', 'priority', '2026-11-30', 3.96, 0.198, 19.8],
        ['vertex', 'regional', 'priority', '2026-12-01', 7.92, 0.396, 39.6],
    ])('matches the published %s/%s/%s/%s rates', (product, region, tier, priceDay, input, cached, output) => {
        const context = { ...JSON.parse(row().context!), product, region, tier, priceDay }
        const value = priceFor('gemini-4-argon', context)!
        expect(value.input).toBeCloseTo(Number(input), 12)
        expect(value.cached).toBeCloseTo(Number(cached), 12)
        expect(value.output).toBeCloseTo(Number(output), 12)
    })
    it('counts thinking once through response and stream parsers, then context and cost', () => {
        const raw = { candidates: [{ content: { parts: [{ text: 'synthetic' }] } }],
            usageMetadata: { promptTokenCount: 100, cachedContentTokenCount: 80, candidatesTokenCount: 10,
                thoughtsTokenCount: 5, totalTokenCount: 115, serviceTier: 'flex' } }
        const usage = parseGeminiResponse(raw).usage!
        expect(usage).toMatchObject({ promptTokens: 100, completionTokens: 15, reasoningTokens: 5,
            totalTokens: 115, serviceTier: 'flex', usageAccountingVersion: 1 })
        expect(parseGeminiStreamDelta(raw)?.usage).toEqual(usage)
        const value = row({ url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-4-argon:generateContent',
            trafficType: undefined, serviceTier: usage.serviceTier, inputTokens: 100, outputTokens: 15,
            cachedTokens: 80, reasoningTokens: 5 }, { inputTokens: 100, outputTokens: 15, cachedTokens: 80, reasoningTokens: 5 })
        expect(estimateCost(value).cost).toBeCloseTo(0.000099, 12)
    })
    it('includes zero-thinking responses and rejects usage-less responses', () => {
        const response = { candidates: [{ content: { parts: [{ text: 'ok' }] } }] }
        expect(parseGeminiResponse({ ...response, usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 3 } }).usage)
            .toMatchObject({ completionTokens: 3, usageAccountingVersion: 1 })
        expect(parseGeminiResponse(response).usage).toBeUndefined()
    })
    it('does not silently price unmodelled tool tokens or inconsistent totals as complete usage', () => {
        const response = { candidates: [{ content: { parts: [{ text: 'ok' }] } }] }
        for (const usageMetadata of [
            { promptTokenCount: 10, candidatesTokenCount: 2, totalTokenCount: 17, toolUsePromptTokenCount: 5 },
            { promptTokenCount: 10, candidatesTokenCount: 2, totalTokenCount: 99 },
        ]) {
            expect(parseGeminiResponse({ ...response, usageMetadata }).usage?.usageAccountingVersion).toBe(0)
            expect(parseGeminiStreamDelta({ ...response, usageMetadata })?.usage?.usageAccountingVersion).toBe(0)
        }
    })
    it('satisfies cost plus savings equals the no-cache baseline', () => {
        const value = estimateCost(row())
        expect(value.cost).toBeCloseTo(0.068, 12)
        expect(value.saved).toBeCloseTo(0.152, 12)
        expect(value.cost! + value.saved!).toBeCloseTo(0.22, 12)
    })
    it.each([['ON_DEMAND', 1], ['ON_DEMAND_PRIORITY', 1.8]])('prices Vertex %s across date and region', (trafficType, tier) => {
        for (const regional of [false, true]) {
            for (const after of [false, true]) {
                const value = row({ trafficType, timestamp: Date.UTC(2026, after ? 11 : 10, after ? 1 : 30),
                    url: regional ? vertex.replace('/global/', '/us-central1/') : vertex })
                expect(estimateCost(value).cost).toBeCloseTo(0.068 * tier * (after ? 2 : 1) * (regional ? 1.1 : 1), 12)
            }
        }
    })
    it.each([['standard', 1], ['flex', 0.5], ['priority', 1.8]])('prices Developer API %s independently', (serviceTier, tier) => {
        const before = row({ trafficType: undefined, serviceTier,
            url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-4-argon:generateContent' })
        expect(estimateCost(before).cost).toBeCloseTo(0.068 * tier, 12)
        expect(estimateCost(before).promotional).toBe(false)
    })
    it('uses job start for pricing across a boundary, without changing recorded timestamp', () => {
        expect(estimateCost(row({ timestamp: Date.UTC(2026, 11, 2), pricingTimestamp: Date.UTC(2026, 10, 30) })).cost).toBeCloseTo(0.068, 12)
    })
    it('marks absent tier and refuses conflicts, unknown tiers and unqualified routes', () => {
        expect(estimateCost(row({ trafficType: undefined })).assumed).toBe(true)
        for (const override of [{ trafficType: 'PROVISIONED_THROUGHPUT' }, { trafficType: 'ON_DEMAND_FLEX' },
            { trafficType: 'ON_DEMAND', serviceTier: 'priority' }, { trafficType: undefined, serviceTier: 'constructor' },
            { url: 'https://custom.example/v1/models/gemini-4-argon:generateContent' },
            { url: vertex.replace('https://aiplatform.googleapis.com/', 'https://aiplatform.googleapis.com:8443/') },
            { url: vertex.replace('/global/', '/unknown/') }]) expect(estimateCost(row(override)).cost).toBeNull()
    })
    it('never equates legacy, aborted, missing or invalid accounting to confirmed zero', () => {
        expect(estimateCost({ ...row(), context: null }).cost).toBeNull()
        for (const override of [{ usageAccountingVersion: undefined }, { aborted: true }, { outputTokens: undefined },
            { inputTokens: 100, cachedTokens: 200 }, { inputTokens: -1 }, { reasoningTokens: 5000 }]) {
            expect(estimateCost(row(override)).cost).toBeNull()
        }
        expect(cacheRatio(100, 200)).toBeNull()
        expect(estimateCost(row({}, { model: 'unknown-model' })).cost).toBeNull()
        expect(estimateCost(row({ inputTokens: 0, outputTokens: 0, cachedTokens: 0, reasoningTokens: 0 },
            { inputTokens: 0, outputTokens: 0, cachedTokens: 0, reasoningTokens: 0 })).cost).toBe(0)
    })
    it('keeps partial totals, failed-unreported counts and token-weighted cache ratios distinct', () => {
        const value = summarizeCosts([row(), { ...row(), context: null }, row({ success: false, inputTokens: undefined, outputTokens: undefined })])
        expect(value).toMatchObject({ known: 1, unknown: 1, failedUnreported: 1 })
        expect(value.cost).toBeCloseTo(0.068, 12)
        expect(value.ratio).toBe(0.8)
        expect(cacheRatio(10000, 100)).toBe(0.01)
        expect(summarizeCosts([]).cost).toBe(0)
        expect(formatUsd(0.00002)).toBe('$0.0000200')
        expect(formatUsd(null)).toBe('—')
    })
    it('has no price without a qualified exact model and dated context', () => {
        expect(priceFor('gemini-4-argon-cyber-permissive', JSON.parse(row().context!))).toBeNull()
    })
})
