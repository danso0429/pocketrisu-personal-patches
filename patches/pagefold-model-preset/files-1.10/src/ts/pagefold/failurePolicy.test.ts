import { describe, expect, it } from 'vitest'
import type { ModelPreset } from 'src/ts/preset/types'
import type { PreparedPageFoldWire } from './prepare'
import { PAGEFOLD_QUALIFIED_ROUTE } from './qualifiedRoute'
import {
    completePageFoldRouteState,
    createPageFoldSourceRouteState,
    pageFoldContentRetryPolicy,
    pageFoldFailurePolicy,
    validatePageFoldRouteState,
} from './failurePolicy'

function preset(): ModelPreset {
    return {
        id: 'p', name: 'p', userValues: {}, createdAt: 1, updatedAt: 2,
        pageFold: { enabled: true, mode: 'maximum' },
        profileSnapshot: {
            profileId: PAGEFOLD_QUALIFIED_ROUTE.profileId, profileVersion: 1,
            providerBaseId: PAGEFOLD_QUALIFIED_ROUTE.providerBaseId, providerBaseVersion: 7,
            adapterKind: 'google-gemini', auth: { kind: 'google-service-account', fields: [] },
            endpoint: { kind: 'vertex-gemini' }, modelId: PAGEFOLD_QUALIFIED_ROUTE.requestedModel,
            schema: [], uiSchema: { groups: [], fields: [] }, defaults: {},
            limits: { known: true, contextWindowTokens: 1_048_576, maxOutputTokens: 65_536 },
        },
    }
}

const budget = {
    assemblyTotalBudget: 65_000, outputReserve: 8_192, sourceInputBudget: 56_808,
    sourceTokenizer: 'gemma' as const,
}

describe('PageFold retry/fallback separation', () => {
    it.each([
        ['network', true], ['timeout', true], ['server', true], ['parse', true], ['rate-limit', true],
        ['auth', false], ['invalid-request', false], ['not-found', false], ['unsupported', false], ['aborted', false],
    ] as const)('classifies %s without ever allowing classic fallback', (kind, retry) => {
        expect(pageFoldFailurePolicy({ kind, retryable: true, retryAfterMs: 5_000 })).toEqual({
            kind,
            retrySameRoute: retry,
            allowClassicFallback: false,
            ...(retry ? { retryAfterMs: 5_000 } : {}),
        })
    })

    it('keeps blank and charset retries on the same route only', () => {
        expect(pageFoldContentRetryPolicy('blank-response')).toEqual({
            kind: 'blank-response', retrySameRoute: true, allowClassicFallback: false,
        })
        expect(pageFoldContentRetryPolicy('banned-charset').allowClassicFallback).toBe(false)
    })

    it('reuses exact source/PDF bytes and rejects live preset mutation', () => {
        const source = createPageFoldSourceRouteState({
            preset: preset(), task: 'model', mode: 'maximum', bindingSource: 'chat',
            sourceMessages: [{ role: 'user', content: 'source' }], sourceBudget: budget,
            operationStartedAt: 1_000,
        }) as Extract<ReturnType<typeof createPageFoldSourceRouteState>, { stage: 'source' }>
        const pdf = Uint8Array.from([1, 2, 3])
        const prepared = {
            messages: [{
                role: 'user', content: 'continue', documents: [{
                    kind: 'document', mime: 'application/pdf', filename: 'pagefold-v1.pdf',
                    bytes: pdf, pageCount: 1, byteLength: 3, sha256: 'a'.repeat(64), mediaResolution: 'low',
                }],
            }],
            context: {
                routeProfileId: PAGEFOLD_QUALIFIED_ROUTE.id, mode: 'maximum', directiveVersion: 1,
                documentSha256: 'a'.repeat(64), pageCount: 1, pdfBytes: 3,
                outputReserve: 8_192, predictedWireInputTokens: 900, wireContextLimit: 1_048_576,
            },
            canonical: { bytes: Uint8Array.from([4, 5]) },
            render: { pdfBytes: pdf },
            budget: {},
        } as unknown as PreparedPageFoldWire
        const rendered = completePageFoldRouteState(source, prepared, {
            ...budget, canonicalSourceTokenEstimate: 10, predictedWireInputTokens: 900,
            wireInputBudget: 1_040_384, wireContextLimit: 1_048_576,
        })
        expect(JSON.stringify(rendered)).not.toMatch(/credential|authorization|accessToken|private_key/i)
        validatePageFoldRouteState({
            state: rendered, preset: preset(), task: 'model', mode: 'maximum', bindingSource: 'chat',
        })
        const changed = preset()
        changed.updatedAt = 3
        expect(() => validatePageFoldRouteState({
            state: rendered, preset: changed, task: 'model', mode: 'maximum', bindingSource: 'chat',
        })).toThrowError(expect.objectContaining({ code: 'PAGEFOLD_RETRY_STATE_INVALID' }))
    })
})
