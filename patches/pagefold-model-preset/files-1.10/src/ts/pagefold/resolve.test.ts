import { describe, expect, it } from 'vitest'
import type { ModelBindingSet, ModelPreset, PageFoldRoleOverrides } from 'src/ts/preset/types'
import {
    normalizePageFoldConfig,
    normalizePageFoldRoleOverrides,
    resolvePageFoldState,
} from './resolve'

function preset(enabled: boolean, mode: 'maximum' | 'balanced' | undefined = 'maximum'): ModelPreset {
    return {
        id: 'preset-pf',
        name: 'PageFold',
        profileSnapshot: {
            profileId: 'vertex-gemini-native:gemini-37-flash',
            profileVersion: 1,
            providerBaseId: 'vertex-gemini-native',
            providerBaseVersion: 7,
            adapterKind: 'google-gemini',
            endpoint: { kind: 'vertex-gemini' },
            auth: { kind: 'google-service-account', fields: ['serviceAccountJson'] },
            modelId: 'gemini-3.7-flash',
            schema: [
                { key: 'location', type: 'string', label: 'Location', default: 'global', mapsTo: { target: 'custom', path: 'location' } },
            ],
            uiSchema: { groups: [], fields: [] },
            defaults: {},
            limits: { known: true, contextWindowTokens: 1_048_576, maxOutputTokens: 65_536 },
        },
        userValues: {},
        pageFold: { enabled, ...(mode ? { mode } : {}) },
        createdAt: 1,
        updatedAt: 2,
    }
}

function binding(pageFold?: PageFoldRoleOverrides): Pick<ModelBindingSet, 'pageFold'> {
    return { pageFold }
}

describe('PageFold preset and role state resolver', () => {
    it.each([
        [false, 'inherit', 'off', 'preset-disabled'],
        [false, 'on', 'on', 'qualified'],
        [false, 'off', 'off', 'role-disabled'],
        [true, 'inherit', 'on', 'qualified'],
        [true, 'on', 'on', 'qualified'],
        [true, 'off', 'off', 'role-disabled'],
    ] as const)('resolves preset=%s override=%s', (enabled, override, kind, reason) => {
        const state = resolvePageFoldState({
            preset: preset(enabled),
            task: 'model',
            binding: binding(override === 'inherit' ? undefined : { model: override }),
        })
        expect(state.kind).toBe(kind)
        expect(state.reason).toBe(reason)
    })

    it('uses the logical task override even when a sub preset serves memory', () => {
        const state = resolvePageFoldState({
            preset: preset(false, 'balanced'),
            task: 'memory',
            binding: binding({ submodel: 'off', memory: 'on' }),
        })
        expect(state).toMatchObject({ kind: 'on', mode: 'balanced', logicalTask: 'memory' })
    })

    it('module-bound calls inherit the selected preset and ignore chat overrides', () => {
        const state = resolvePageFoldState({
            preset: preset(true),
            task: 'otherAx',
            binding: binding({ otherAx: 'off' }),
            moduleBound: true,
        })
        expect(state.kind).toBe('on')
    })

    it('blocks role-on without a config and enabled config without a mode', () => {
        const missing = preset(false)
        delete missing.pageFold
        expect(resolvePageFoldState({
            preset: missing,
            task: 'model',
            binding: binding({ model: 'on' }),
        })).toMatchObject({ kind: 'blocked', reason: 'missing-config' })

        const malformed = preset(true)
        delete malformed.pageFold!.mode
        expect(resolvePageFoldState({ preset: malformed, task: 'model' }))
            .toMatchObject({ kind: 'blocked', reason: 'invalid-mode' })
    })

    it('retains enabled malformed intent while dropping invalid price data', () => {
        expect(normalizePageFoldConfig({
            enabled: true,
            mode: 'automatic',
            inputPriceOverride: { usdPerMillion: 0, updatedAt: -1 },
        })).toEqual({ enabled: true })
        expect(normalizePageFoldConfig(null)).toBeUndefined()
    })

    it('normalizes only the six known role overrides and treats junk as inherit', () => {
        expect(normalizePageFoldRoleOverrides({
            model: 'on',
            submodel: 'invalid',
            memory: 'off',
            translate: null,
            emotion: 'inherit',
            otherAx: 'on',
            unknown: 'on',
        })).toEqual({ model: 'on', memory: 'off', otherAx: 'on' })
    })

    it('keeps unsupported route intent but blocks it', () => {
        const value = preset(true)
        value.userValues.location = 'us-central1'
        expect(resolvePageFoldState({ preset: value, task: 'model' }))
            .toMatchObject({ kind: 'blocked', reason: 'unsupported-location' })
        expect(value.pageFold).toEqual({ enabled: true, mode: 'maximum' })
    })
})
