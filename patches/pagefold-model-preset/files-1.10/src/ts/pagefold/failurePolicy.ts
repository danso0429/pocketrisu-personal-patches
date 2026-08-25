import type { AdapterChatMessage, AdapterPageFoldWireContext } from 'src/ts/preset/adapter/types'
import type { ModelPreset, PageFoldMode, ResolvedTask } from 'src/ts/preset/types'
import type { PageFoldBudgetEvidence, PageFoldSourceBudget } from './budget'
import { PAGEFOLD_QUALIFIED_ROUTE } from './qualifiedRoute'
import type { PreparedPageFoldWire } from './prepare'

export type PageFoldFailureKind =
    | 'network' | 'timeout' | 'server' | 'parse' | 'rate-limit'
    | 'auth' | 'invalid-request' | 'not-found' | 'unsupported'
    | 'renderer' | 'support-evidence' | 'prepared-invariant'
    | 'blank-response' | 'banned-charset' | 'aborted' | 'unknown'

export interface RequestFailurePolicy {
    kind: PageFoldFailureKind
    retrySameRoute: boolean
    allowClassicFallback: false
    retryAfterMs?: number
}

interface PageFoldRouteIdentity {
    presetId: string
    presetUpdatedAt: number
    profileId: string
    profileVersion: number
    providerBaseVersion: number
    routeProfileId: typeof PAGEFOLD_QUALIFIED_ROUTE.id
    task: ResolvedTask
    mode: PageFoldMode
    bindingSource: 'chat' | 'global-lock-default' | 'module'
    moduleId?: string
}

interface PageFoldRouteStateBase {
    version: 1
    operationStartedAt: number
    identity: PageFoldRouteIdentity
    sourceMessages: readonly AdapterChatMessage[]
    sourceBudget: PageFoldSourceBudget
}

export type PageFoldRouteState =
    | (PageFoldRouteStateBase & { stage: 'source' })
    | (PageFoldRouteStateBase & {
        stage: 'rendered'
        wireMessages: readonly AdapterChatMessage[]
        wireContext: AdapterPageFoldWireContext
        canonicalBytes: Uint8Array
        pdfBytes: Uint8Array
        budgetEvidence: PageFoldBudgetEvidence
    })

export function createPageFoldSourceRouteState(input: {
    preset: ModelPreset
    task: ResolvedTask
    mode: PageFoldMode
    bindingSource: PageFoldRouteIdentity['bindingSource']
    moduleId?: string
    sourceMessages: readonly AdapterChatMessage[]
    sourceBudget: PageFoldSourceBudget
    operationStartedAt: number
}): PageFoldRouteState {
    if (!Number.isFinite(input.operationStartedAt) || input.operationStartedAt <= 0) {
        throw new PageFoldRetryStateError('PageFold operation start time is invalid')
    }
    return {
        version: 1,
        operationStartedAt: input.operationStartedAt,
        stage: 'source',
        identity: {
            presetId: input.preset.id,
            presetUpdatedAt: input.preset.updatedAt,
            profileId: input.preset.profileSnapshot.profileId,
            profileVersion: input.preset.profileSnapshot.profileVersion,
            providerBaseVersion: input.preset.profileSnapshot.providerBaseVersion,
            routeProfileId: PAGEFOLD_QUALIFIED_ROUTE.id,
            task: input.task,
            mode: input.mode,
            bindingSource: input.bindingSource,
            ...(input.moduleId ? { moduleId: input.moduleId } : {}),
        },
        sourceMessages: cloneMessages(input.sourceMessages),
        sourceBudget: { ...input.sourceBudget },
    }
}

export function completePageFoldRouteState(
    source: Extract<PageFoldRouteState, { stage: 'source' }>,
    prepared: PreparedPageFoldWire,
    budgetEvidence: PageFoldBudgetEvidence,
): PageFoldRouteState {
    return {
        ...source,
        stage: 'rendered',
        wireMessages: cloneMessages(prepared.messages),
        wireContext: { ...prepared.context },
        canonicalBytes: new Uint8Array(prepared.canonical.bytes),
        pdfBytes: new Uint8Array(prepared.render.pdfBytes),
        budgetEvidence: { ...budgetEvidence },
    }
}

export function validatePageFoldRouteState(input: {
    state: PageFoldRouteState
    preset: ModelPreset
    task: ResolvedTask
    mode: PageFoldMode
    bindingSource: PageFoldRouteIdentity['bindingSource']
    moduleId?: string
}): void {
    const state = input.state
    const identity = state?.identity
    if (!state || state.version !== 1
        || (state.stage !== 'source' && state.stage !== 'rendered')
        || !Number.isFinite(state.operationStartedAt) || state.operationStartedAt <= 0
        || identity?.presetId !== input.preset.id
        || identity.presetUpdatedAt !== input.preset.updatedAt
        || identity.profileId !== input.preset.profileSnapshot.profileId
        || identity.profileVersion !== input.preset.profileSnapshot.profileVersion
        || identity.providerBaseVersion !== input.preset.profileSnapshot.providerBaseVersion
        || identity.routeProfileId !== PAGEFOLD_QUALIFIED_ROUTE.id
        || identity.task !== input.task
        || identity.mode !== input.mode
        || identity.bindingSource !== input.bindingSource
        || identity.moduleId !== input.moduleId) {
        throw new PageFoldRetryStateError('PageFold retry state no longer matches the live preset/binding')
    }
    if (state.stage === 'rendered') {
        const document = state.wireMessages.at(-1)?.documents?.[0]
        if (!document
            || document.sha256 !== state.wireContext.documentSha256
            || document.byteLength !== state.pdfBytes.byteLength
            || document.bytes.byteLength !== state.pdfBytes.byteLength
            || !equalBytes(document.bytes, state.pdfBytes)
            || state.canonicalBytes.byteLength < 1) {
            throw new PageFoldRetryStateError('PageFold rendered retry state is internally inconsistent')
        }
    }
}

export function pageFoldFailurePolicy(error: unknown, fallbackKind: PageFoldFailureKind = 'unknown'): RequestFailurePolicy {
    const value = error && typeof error === 'object' ? error as Record<string, unknown> : {}
    const rawKind = typeof value.kind === 'string' ? value.kind : fallbackKind
    const kind = normalizeKind(rawKind, fallbackKind)
    const retryable = value.retryable === true || value.transient === true
    const retrySameRoute = kind !== 'aborted'
        && kind !== 'auth'
        && kind !== 'invalid-request'
        && kind !== 'not-found'
        && kind !== 'unsupported'
        && kind !== 'support-evidence'
        && kind !== 'prepared-invariant'
        && retryable
    const retryAfter = typeof value.retryAfterMs === 'number' && Number.isFinite(value.retryAfterMs)
        ? Math.max(0, Math.min(60_000, Math.floor(value.retryAfterMs)))
        : undefined
    return {
        kind,
        retrySameRoute,
        allowClassicFallback: false,
        ...(retrySameRoute && retryAfter !== undefined ? { retryAfterMs: retryAfter } : {}),
    }
}

export function pageFoldContentRetryPolicy(kind: 'blank-response' | 'banned-charset'): RequestFailurePolicy {
    return { kind, retrySameRoute: true, allowClassicFallback: false }
}

export class PageFoldRetryStateError extends Error {
    readonly code = 'PAGEFOLD_RETRY_STATE_INVALID'
    readonly retryable = false
    constructor(message: string) {
        super(message)
        this.name = 'PageFoldRetryStateError'
    }
}

function cloneMessages(messages: readonly AdapterChatMessage[]): AdapterChatMessage[] {
    return messages.map((message) => ({
        ...message,
        images: message.images?.map((image) => ({ ...image })),
        documents: message.documents?.map((document) => ({
            ...document,
            bytes: new Uint8Array(document.bytes),
        })),
        toolCalls: message.toolCalls?.map((call) => ({ ...call })),
        reasoning: message.reasoning?.map((part) => ({ ...part })),
    }))
}

function normalizeKind(value: string, fallback: PageFoldFailureKind): PageFoldFailureKind {
    if (value === 'network' || value === 'timeout' || value === 'server' || value === 'parse'
        || value === 'rate-limit' || value === 'auth' || value === 'invalid-request'
        || value === 'not-found' || value === 'unsupported' || value === 'renderer'
        || value === 'support-evidence' || value === 'prepared-invariant'
        || value === 'blank-response' || value === 'banned-charset' || value === 'aborted') return value
    return fallback
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
    if (left.byteLength !== right.byteLength) return false
    for (let index = 0; index < left.byteLength; index++) if (left[index] !== right[index]) return false
    return true
}
