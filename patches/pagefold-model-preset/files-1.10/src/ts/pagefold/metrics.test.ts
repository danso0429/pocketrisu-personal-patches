import { describe, expect, it } from 'vitest'
import type { ModelPreset } from 'src/ts/preset/types'
import type { PageFoldRouteState } from './failurePolicy'
import { PAGEFOLD_QUALIFIED_ROUTE } from './qualifiedRoute'
import { applyPageFoldActualUsage, createPageFoldGenerationInfo } from './metrics'
import { PAGEFOLD_VERTEX_PRICE_RECORDS, resolvePageFoldPrice } from './pricing'

function preset(): ModelPreset {
    return {
        id: 'p', name: 'p', createdAt: 1, updatedAt: 2, userValues: {},
        pageFold: { enabled: true, mode: 'maximum' },
        profileSnapshot: {
            profileId: PAGEFOLD_QUALIFIED_ROUTE.profileId, profileVersion: 1,
            providerBaseId: PAGEFOLD_QUALIFIED_ROUTE.providerBaseId, providerBaseVersion: 7,
            adapterKind: 'google-gemini', endpoint: { kind: 'vertex-gemini' },
            auth: { kind: 'google-service-account', fields: [] }, modelId: PAGEFOLD_QUALIFIED_ROUTE.requestedModel,
            schema: [], uiSchema: { groups: [], fields: [] }, defaults: {},
            limits: { known: true, contextWindowTokens: 1_048_576, maxOutputTokens: 65_536 },
        },
    }
}

function state(): Extract<PageFoldRouteState, { stage: 'rendered' }> {
    return {
        version: 1, stage: 'rendered', operationStartedAt: 1,
        identity: {
            presetId: 'p', presetUpdatedAt: 2, profileId: PAGEFOLD_QUALIFIED_ROUTE.profileId,
            profileVersion: 1, providerBaseVersion: 7, routeProfileId: PAGEFOLD_QUALIFIED_ROUTE.id,
            task: 'model', mode: 'maximum', bindingSource: 'chat',
        },
        sourceMessages: [], sourceBudget: {
            assemblyTotalBudget: 65_000, outputReserve: 8_192, sourceInputBudget: 56_808, sourceTokenizer: 'gemma',
        },
        wireMessages: [], wireContext: {
            routeProfileId: PAGEFOLD_QUALIFIED_ROUTE.id, mode: 'maximum', directiveVersion: 1,
            documentSha256: 'a'.repeat(64), pageCount: 8, pdfBytes: 1_000,
            outputReserve: 8_192, predictedWireInputTokens: 2_900, wireContextLimit: 1_048_576,
        },
        canonicalBytes: Uint8Array.from([1]), pdfBytes: Uint8Array.from([2]),
        budgetEvidence: {
            assemblyTotalBudget: 65_000, outputReserve: 8_192, sourceInputBudget: 56_808,
            sourceTokenizer: 'gemma', canonicalSourceTokenEstimate: 10_000,
            predictedWireInputTokens: 2_900, wireInputBudget: 1_040_384, wireContextLimit: 1_048_576,
        },
    }
}

describe('PageFold versioned pricing and signed metrics', () => {
    it('keeps support and current Standard price evidence separate', () => {
        const result = resolvePageFoldPrice(preset(), Date.parse('2026-08-25T00:00:00Z'))
        expect(result).toMatchObject({
            state: 'confirmed', source: 'versioned-google',
            record: { inputUsdPerMillion: 0.75, outputUsdPerMillion: 3.75, billingTier: 'standard' },
        })
        expect(PAGEFOLD_VERTEX_PRICE_RECORDS[0].effectiveUntil).toBe('2027-01-01T00:00:00.000Z')
        expect(resolvePageFoldPrice(preset(), Date.parse('2027-01-01T00:00:00Z')))
            .toMatchObject({ record: { inputUsdPerMillion: 1.5, outputUsdPerMillion: 7.5 } })
    })

    it('reports signed overhead/savings and replaces prediction only with actual usage', () => {
        const info = createPageFoldGenerationInfo(state(), preset())
        expect(info.signedTokenDelta).toBe(7_100)
        expect(info.predictedInputCostUsd).toBe(0.002175)
        expect(info).not.toHaveProperty('actualWireInputTokens')
        applyPageFoldActualUsage(info, { promptTokens: 3_100, completionTokens: 10 })
        expect(info.actualWireInputTokens).toBe(3_100)
        expect(info.signedTokenDelta).toBe(6_900)
        expect(info.actualInputCostUsd).toBe(0.002325)
        expect(info.signedInputCostDeltaUsd).toBe(0.005175)
    })

    it('allows a negative signed delta and never labels v8 qualification spend as reply cost', () => {
        const route = state()
        route.budgetEvidence.canonicalSourceTokenEstimate = 100
        route.budgetEvidence.predictedWireInputTokens = 900
        const info = createPageFoldGenerationInfo(route, preset())
        expect(info.signedTokenDelta).toBe(-800)
        expect(info.signedInputCostDeltaUsd).toBe(-0.0006)
        expect(JSON.stringify(info)).not.toContain('0.050253')
        expect(JSON.stringify(info)).not.toContain('qualification')
    })
})
