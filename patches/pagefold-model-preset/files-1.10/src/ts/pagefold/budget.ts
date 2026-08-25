import type { AdapterChatMessage } from 'src/ts/preset/adapter/types'
import type { ModelPreset, RegistryTokenizer } from 'src/ts/preset/types'
import { encodeWithTokenizer } from 'src/ts/tokenizer'
import {
    resolvePageFoldQualifiedRoute,
    type PageFoldQualifiedRouteProfile,
} from './qualifiedRoute'

export interface PageFoldSourceBudget {
    assemblyTotalBudget: number
    outputReserve: number
    sourceInputBudget: number
    sourceTokenizer: RegistryTokenizer
    routeProfileId: PageFoldQualifiedRouteProfile['id']
    wireModel: string
    wireContextLimit: number
    profileMaxOutputTokens: number
    lowMediaTokensPerPage: number
    fixedOverheadUpperTokens: number
}

export interface PageFoldBudgetEvidence extends PageFoldSourceBudget {
    canonicalSourceTokenEstimate: number
    predictedWireInputTokens: number
    wireInputBudget: number
}

export class PageFoldBudgetError extends Error {
    readonly code: string
    readonly retryable = false
    constructor(code: string, message: string) {
        super(message)
        this.name = 'PageFoldBudgetError'
        this.code = code
    }
}

export function resolvePageFoldSourceTokenizer(
    preset: ModelPreset,
    databaseTokenizer: unknown,
): RegistryTokenizer {
    if (isRegistryTokenizer(preset.tokenizerOverride)) return preset.tokenizerOverride
    if (isRegistryTokenizer(preset.profileSnapshot.recommendedTokenizer)) {
        return preset.profileSnapshot.recommendedTokenizer
    }
    if (isRegistryTokenizer(databaseTokenizer)) return databaseTokenizer
    return preset.profileSnapshot.adapterKind === 'google-gemini' ? 'gemma' : 'tik'
}

export function resolvePageFoldOutputReserve(
    preset: ModelPreset,
    normalResolvedOutput: number | undefined,
    databaseFallback: number,
): number {
    const route = requirePageFoldRoute(preset)
    let value = positiveInteger(normalResolvedOutput) ?? positiveInteger(databaseFallback)
    const custom = nestedValue(preset.customBody, 'generationConfig.maxOutputTokens')
        ?? preset.customBody?.maxOutputTokens
    if (custom !== undefined) value = positiveInteger(custom)

    const additional = resolveAdditionalOutputOverride(preset.additionalParamsText)
    if (additional.kind === 'value') value = positiveInteger(additional.value)
    if (additional.kind === 'deleted') value = undefined

    if (!value || value > route.profileMaxOutputTokens) {
        throw new PageFoldBudgetError(
            'PAGEFOLD_OUTPUT_RESERVE_INVALID',
            'PageFold requires a positive production output limit within the qualified profile maximum',
        )
    }
    return value
}

export function resolvePageFoldSourceBudget(input: {
    preset: ModelPreset
    outputReserve: number
    databaseTokenizer: unknown
}): PageFoldSourceBudget {
    const route = requirePageFoldRoute(input.preset)
    const assemblyTotalBudget = positiveInteger(input.preset.maxContext) ?? 65_000
    const outputReserve = positiveInteger(input.outputReserve)
    if (!outputReserve || outputReserve > route.profileMaxOutputTokens) {
        throw new PageFoldBudgetError('PAGEFOLD_OUTPUT_RESERVE_INVALID', 'PageFold output reserve is invalid')
    }
    const sourceInputBudget = assemblyTotalBudget - outputReserve
    if (sourceInputBudget < 0) {
        throw new PageFoldBudgetError(
            'PAGEFOLD_SOURCE_BUDGET_INVALID',
            'PageFold max context is smaller than its production output reserve',
        )
    }
    return {
        assemblyTotalBudget,
        outputReserve,
        sourceInputBudget,
        sourceTokenizer: resolvePageFoldSourceTokenizer(input.preset, input.databaseTokenizer),
        routeProfileId: route.id,
        wireModel: route.requestedModel,
        wireContextLimit: route.wireContextLimitTokens,
        profileMaxOutputTokens: route.profileMaxOutputTokens,
        lowMediaTokensPerPage: route.lowMediaTokensPerPage,
        fixedOverheadUpperTokens: route.fixedOverheadUpperTokens,
    }
}

export async function countPageFoldAdapterSourceTokens(
    messages: readonly AdapterChatMessage[],
    tokenizer: RegistryTokenizer,
): Promise<number> {
    let total = 0
    for (const message of messages) {
        total += (await encodeWithTokenizer(message.content, tokenizer)).length + 3
        if (message.name) total += (await encodeWithTokenizer(message.name, tokenizer)).length + 1
    }
    return total
}

export function assertPageFoldCanonicalSourceBudget(
    estimate: number,
    source: PageFoldSourceBudget,
): void {
    if (!Number.isSafeInteger(estimate) || estimate < 0) {
        throw new PageFoldBudgetError('PAGEFOLD_CANONICAL_SOURCE_ESTIMATE_INVALID', 'PageFold source estimate is invalid')
    }
    if (estimate > source.sourceInputBudget) {
        throw new PageFoldBudgetError(
            'PAGEFOLD_CANONICAL_SOURCE_BUDGET_EXCEEDED',
            `PageFold final source estimate ${estimate} exceeds budget ${source.sourceInputBudget}`,
        )
    }
}

export async function evaluatePageFoldBudgets(input: {
    sourceMessages: readonly AdapterChatMessage[]
    wireMessages: readonly AdapterChatMessage[]
    pageCount: number
    source: PageFoldSourceBudget
    canonicalSourceTokenEstimate?: number
}): Promise<PageFoldBudgetEvidence> {
    const canonicalSourceTokenEstimate = input.canonicalSourceTokenEstimate
        ?? await countPageFoldAdapterSourceTokens(input.sourceMessages, input.source.sourceTokenizer)
    assertPageFoldCanonicalSourceBudget(canonicalSourceTokenEstimate, input.source)
    if (!Number.isSafeInteger(input.pageCount)
        || input.pageCount < 1
        || input.pageCount > 8) {
        throw new PageFoldBudgetError('PAGEFOLD_PAGE_LIMIT', 'PageFold PDF page count is outside the qualified limit')
    }
    const textTokens = await countPageFoldAdapterSourceTokens(
        input.wireMessages.map((message) => ({ ...message, documents: undefined })),
        input.source.sourceTokenizer,
    )
    const predictedWireInputTokens =
        (input.source.lowMediaTokensPerPage * input.pageCount)
        + textTokens
        + input.source.fixedOverheadUpperTokens
    const wireContextLimit = input.source.wireContextLimit
    const wireInputBudget = wireContextLimit - input.source.outputReserve
    if (predictedWireInputTokens > wireInputBudget) {
        throw new PageFoldBudgetError(
            'PAGEFOLD_WIRE_BUDGET_EXCEEDED',
            `PageFold predicted wire input ${predictedWireInputTokens} exceeds budget ${wireInputBudget}`,
        )
    }
    return {
        ...input.source,
        canonicalSourceTokenEstimate,
        predictedWireInputTokens,
        wireInputBudget,
        wireContextLimit,
    }
}

function requirePageFoldRoute(preset: ModelPreset): PageFoldQualifiedRouteProfile {
    const resolved = resolvePageFoldQualifiedRoute(preset)
    if (resolved.ok === false) {
        throw new PageFoldBudgetError(
            'PAGEFOLD_ROUTE_UNSUPPORTED',
            `PageFold route is unavailable: ${resolved.reason}`,
        )
    }
    return resolved.route
}

function resolveAdditionalOutputOverride(text: string | undefined):
    | { kind: 'none' }
    | { kind: 'deleted' }
    | { kind: 'value', value: unknown } {
    if (!text) return { kind: 'none' }
    let result: ReturnType<typeof resolveAdditionalOutputOverride> = { kind: 'none' }
    for (const raw of text.split('\n')) {
        const line = raw.trim()
        if (!line || line.startsWith('#')) continue
        const separator = line.indexOf('=')
        if (separator <= 0) continue
        const key = line.slice(0, separator).trim()
        if (key !== 'generationConfig.maxOutputTokens' && key !== 'maxOutputTokens') continue
        const value = line.slice(separator + 1).trim()
        if (value === '{{none}}') result = { kind: 'deleted' }
        else if (/^[0-9]+$/.test(value)) result = { kind: 'value', value: Number(value) }
        else result = { kind: 'value', value: undefined }
    }
    return result
}

function nestedValue(value: unknown, path: string): unknown {
    let current = value
    for (const key of path.split('.')) {
        if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined
        current = (current as Record<string, unknown>)[key]
    }
    return current
}

function positiveInteger(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
        ? Math.floor(value)
        : undefined
}

function isRegistryTokenizer(value: unknown): value is RegistryTokenizer {
    return value === 'tik' || value === 'mistral' || value === 'novelai'
        || value === 'claude' || value === 'llama' || value === 'llama3'
        || value === 'novellist' || value === 'gemma' || value === 'cohere'
        || value === 'deepseek'
}
