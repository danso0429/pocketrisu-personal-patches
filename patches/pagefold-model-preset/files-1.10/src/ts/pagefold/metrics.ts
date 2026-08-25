import type { AdapterUsage } from 'src/ts/preset/adapter/types'
import type { ModelPreset, PageFoldMode, RegistryTokenizer, ResolvedTask } from 'src/ts/preset/types'
import type { PageFoldRouteState } from './failurePolicy'
import { resolvePageFoldPrice } from './pricing'

export interface PageFoldGenerationInfo {
    task: ResolvedTask
    mode: PageFoldMode
    qualifiedRouteProfileId: 'vertex-gemini-3.7-flash-low-v8'
    wirePredictionVersion: 1
    assemblySourceTokenEstimate: number
    canonicalSourceTokenEstimate: number
    sourceTokenizer: RegistryTokenizer
    assemblyTotalBudget: number
    sourceInputBudget: number
    outputReserve: number
    pdfPages: number
    pdfBytes: number
    predictedWireInputTokens: number
    actualWireInputTokens?: number
    wireContextLimit: number
    signedTokenDelta?: number
    inputPriceUsdPerMillion?: number
    outputPriceUsdPerMillion?: number
    predictedInputCostUsd?: number
    actualInputCostUsd?: number
    signedInputCostDeltaUsd?: number
    pricingSource?: string
    pricingState: 'confirmed' | 'unconfirmed'
}

export function createPageFoldGenerationInfo(
    state: Extract<PageFoldRouteState, { stage: 'rendered' }>,
    preset: ModelPreset,
): PageFoldGenerationInfo {
    const evidence = state.budgetEvidence
    const price = resolvePageFoldPrice(preset)
    const info: PageFoldGenerationInfo = {
        task: state.identity.task,
        mode: state.identity.mode,
        qualifiedRouteProfileId: state.identity.routeProfileId,
        wirePredictionVersion: 1,
        assemblySourceTokenEstimate: evidence.canonicalSourceTokenEstimate,
        canonicalSourceTokenEstimate: evidence.canonicalSourceTokenEstimate,
        sourceTokenizer: evidence.sourceTokenizer,
        assemblyTotalBudget: evidence.assemblyTotalBudget,
        sourceInputBudget: evidence.sourceInputBudget,
        outputReserve: evidence.outputReserve,
        pdfPages: state.wireContext.pageCount,
        pdfBytes: state.wireContext.pdfBytes,
        predictedWireInputTokens: evidence.predictedWireInputTokens,
        wireContextLimit: evidence.wireContextLimit,
        signedTokenDelta: evidence.canonicalSourceTokenEstimate - evidence.predictedWireInputTokens,
        pricingState: price.state,
    }
    if (price.state === 'confirmed') {
        info.inputPriceUsdPerMillion = price.record.inputUsdPerMillion
        info.outputPriceUsdPerMillion = price.record.outputUsdPerMillion
        info.predictedInputCostUsd = cost(evidence.predictedWireInputTokens, price.record.inputUsdPerMillion)
        info.signedInputCostDeltaUsd = cost(
            evidence.canonicalSourceTokenEstimate - evidence.predictedWireInputTokens,
            price.record.inputUsdPerMillion,
        )
        info.pricingSource = `${price.source}:${price.record.id}`
    }
    return info
}

export function applyPageFoldActualUsage(
    info: PageFoldGenerationInfo | undefined,
    usage: AdapterUsage | undefined,
): void {
    if (!info || !usage || !Number.isFinite(usage.promptTokens) || (usage.promptTokens ?? -1) < 0) return
    info.actualWireInputTokens = Math.round(usage.promptTokens!)
    info.signedTokenDelta = info.canonicalSourceTokenEstimate - info.actualWireInputTokens
    if (info.inputPriceUsdPerMillion !== undefined) {
        info.actualInputCostUsd = cost(info.actualWireInputTokens, info.inputPriceUsdPerMillion)
        info.signedInputCostDeltaUsd = cost(info.signedTokenDelta, info.inputPriceUsdPerMillion)
    }
}

function cost(tokens: number, usdPerMillion: number): number {
    return Number((tokens * usdPerMillion / 1_000_000).toFixed(9))
}
