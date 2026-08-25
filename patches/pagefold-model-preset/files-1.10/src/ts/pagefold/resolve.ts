import type {
    ModelBindingSet,
    ModelPreset,
    ModelPresetPageFoldConfig,
    PageFoldMode,
    PageFoldRoleOverride,
    PageFoldRoleOverrides,
    ResolvedTask,
} from 'src/ts/preset/types'
import {
    resolvePageFoldQualifiedRoute,
    type PageFoldQualifiedRouteProfile,
    type PageFoldRouteMismatchReason,
} from './qualifiedRoute'

export type PageFoldSupportReason =
    | 'qualified'
    | 'preset-disabled'
    | 'role-disabled'
    | 'missing-config'
    | 'invalid-mode'
    | PageFoldRouteMismatchReason

export type PageFoldBlockedReason = Exclude<
    PageFoldSupportReason,
    'qualified' | 'preset-disabled' | 'role-disabled'
>

export type ResolvedPageFoldState =
    | { kind: 'off', reason: 'preset-disabled' | 'role-disabled' | 'missing-config' }
    | { kind: 'blocked', reason: PageFoldBlockedReason, messageKey: string }
    | {
        kind: 'on'
        reason: 'qualified'
        route: PageFoldQualifiedRouteProfile
        mode: PageFoldMode
        logicalTask: ResolvedTask
    }

export interface ResolvePageFoldStateInput {
    preset: ModelPreset
    task: ResolvedTask
    binding?: Pick<ModelBindingSet, 'pageFold'> | null
    /** Module-bound calls inherit the selected preset and intentionally ignore chat overrides. */
    moduleBound?: boolean
}

export function resolvePageFoldState(input: ResolvePageFoldStateInput): ResolvedPageFoldState {
    const config = input.preset.pageFold
    const override = input.moduleBound
        ? 'inherit'
        : normalizePageFoldRoleOverride(input.binding?.pageFold?.[input.task])

    if (override === 'off') return { kind: 'off', reason: 'role-disabled' }
    if (!config || typeof config !== 'object') {
        return override === 'on'
            ? blocked('missing-config')
            : { kind: 'off', reason: 'missing-config' }
    }
    if (!isPageFoldMode(config.mode)) {
        return config.enabled === true || override === 'on'
            ? blocked('invalid-mode')
            : { kind: 'off', reason: 'preset-disabled' }
    }
    if (override !== 'on' && config.enabled !== true) {
        return { kind: 'off', reason: 'preset-disabled' }
    }

    const route = resolvePageFoldQualifiedRoute(input.preset)
    if (route.ok === false) return blocked(route.reason)
    return {
        kind: 'on',
        reason: 'qualified',
        route: route.route,
        mode: config.mode,
        logicalTask: input.task,
    }
}

export function normalizePageFoldConfig(value: unknown): ModelPresetPageFoldConfig | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    const raw = value as Record<string, unknown>
    const enabled = raw.enabled === true
    const mode = isPageFoldMode(raw.mode) ? raw.mode : undefined
    const inputPriceOverride = normalizePriceOverride(raw.inputPriceOverride)
    return {
        enabled,
        ...(mode ? { mode } : {}),
        ...(inputPriceOverride ? { inputPriceOverride } : {}),
    }
}

export function normalizePageFoldRoleOverrides(value: unknown): PageFoldRoleOverrides | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    const raw = value as Record<string, unknown>
    const result: PageFoldRoleOverrides = {}
    for (const task of PAGEFOLD_TASKS) {
        const normalized = normalizePageFoldRoleOverride(raw[task])
        if (normalized !== 'inherit') result[task] = normalized
    }
    return Object.keys(result).length > 0 ? result : undefined
}

export function normalizePageFoldRoleOverride(value: unknown): PageFoldRoleOverride {
    return value === 'on' || value === 'off' ? value : 'inherit'
}

export function isPageFoldMode(value: unknown): value is PageFoldMode {
    return value === 'maximum' || value === 'balanced'
}

const PAGEFOLD_TASKS = Object.freeze<ResolvedTask[]>([
    'model', 'submodel', 'memory', 'translate', 'emotion', 'otherAx',
])

function normalizePriceOverride(value: unknown): ModelPresetPageFoldConfig['inputPriceOverride'] {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    const raw = value as Record<string, unknown>
    if (typeof raw.usdPerMillion !== 'number'
        || !Number.isFinite(raw.usdPerMillion)
        || raw.usdPerMillion <= 0
        || typeof raw.updatedAt !== 'number'
        || !Number.isFinite(raw.updatedAt)
        || raw.updatedAt <= 0) return undefined
    return {
        usdPerMillion: raw.usdPerMillion,
        ...(typeof raw.note === 'string' && raw.note.trim().length > 0
            ? { note: raw.note.trim().slice(0, 200) }
            : {}),
        updatedAt: Math.floor(raw.updatedAt),
    }
}

function blocked(reason: PageFoldBlockedReason): ResolvedPageFoldState {
    return { kind: 'blocked', reason, messageKey: `pageFoldSupport.${reason}` }
}
