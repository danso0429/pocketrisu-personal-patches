export interface BrowserMessageEffect {
    id: string
    delta: number
    createdAt: number
}

type StatisticRoot = { statics?: {
    messages?: unknown
    browserMessageEffects?: unknown
    browserMessageEffectCutoff?: unknown
} }

const MAX_EFFECT_AGE_MS = 14 * 24 * 60 * 60 * 1000
const MAX_FUTURE_SKEW_MS = 24 * 60 * 60 * 1000

function cutoff(value: unknown): number {
    if (value === undefined) return 0
    if (!Number.isSafeInteger(value) || Number(value) < 0) {
        throw new Error('browser statistic effect cutoff is invalid')
    }
    return Number(value)
}

function effects(value: unknown): BrowserMessageEffect[] {
    if (value === undefined) return []
    if (!Array.isArray(value)) throw new Error('browser statistic effect ledger is invalid')
    const seen = new Set<string>()
    return value.map((entry: unknown) => {
        if (!entry || typeof entry !== 'object') {
            throw new Error('browser statistic effect ledger is invalid')
        }
        const effect = entry as Record<string, unknown>
        if (typeof effect.id !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(effect.id)
            || !Number.isSafeInteger(effect.delta) || Number(effect.delta) <= 0
            || !Number.isSafeInteger(effect.createdAt) || Number(effect.createdAt) <= 0
            || seen.has(effect.id)) {
            throw new Error('browser statistic effect ledger is invalid')
        }
        seen.add(effect.id)
        return {
            id: effect.id,
            delta: Number(effect.delta),
            createdAt: Number(effect.createdAt),
        }
    })
}

function count(value: unknown): number {
    if (!Number.isSafeInteger(value) || Number(value) < 0) {
        throw new Error('browser statistic count is invalid')
    }
    return Number(value)
}

export function recordBrowserMessageEffect(
    statics: {
        messages: number
        browserMessageEffects?: BrowserMessageEffect[]
        browserMessageEffectCutoff?: number
    },
    id: string,
    createdAt = Date.now(),
    delta = 1,
): void {
    const current = effects(statics.browserMessageEffects)
    const prior = current.find(entry => entry.id === id)
    if (prior) {
        if (prior.delta !== delta) throw new Error('browser statistic effect identity conflict')
        return
    }
    if (createdAt <= cutoff(statics.browserMessageEffectCutoff)
        || createdAt < Date.now() - MAX_EFFECT_AGE_MS
        || createdAt > Date.now() + MAX_FUTURE_SKEW_MS) {
        throw new Error('browser statistic effect identity is outside the recovery window')
    }
    const effect = effects([{ id, delta, createdAt }])[0]
    const next = count(statics.messages) + effect.delta
    if (!Number.isSafeInteger(next)) throw new Error('browser statistic count overflow')
    statics.messages = next
    statics.browserMessageEffects = [...current, effect]
}

export function mergeBrowserMessageEffects(
    base: StatisticRoot,
    local: StatisticRoot,
    remote: StatisticRoot,
    merged: StatisticRoot,
): void {
    if (!base.statics && !local.statics && !remote.statics) return
    const baseCount = count(base.statics?.messages)
    const localCount = count(local.statics?.messages)
    const remoteCount = count(remote.statics?.messages)
    const baseEffects = effects(base.statics?.browserMessageEffects)
    const localEffects = effects(local.statics?.browserMessageEffects)
    const remoteEffects = effects(remote.statics?.browserMessageEffects)
    const remoteCutoff = cutoff(remote.statics?.browserMessageEffectCutoff)
    const baseIds = new Set(baseEffects.map(entry => entry.id))
    const remoteById = new Map(remoteEffects.map(entry => [entry.id, entry]))
    if (baseEffects.some(entry => !remoteById.has(entry.id)
        && entry.createdAt > remoteCutoff)) {
        throw new Error('browser statistic effect history unavailable')
    }
    const localNew = localEffects.filter(entry => !baseIds.has(entry.id))
    if (localNew.some(entry => entry.createdAt <= remoteCutoff)) {
        throw new Error('browser statistic effect identity is outside the recovery window')
    }
    const localNewDelta = localNew.reduce((sum, entry) => sum + entry.delta, 0)
    if (localCount - baseCount !== localNewDelta) {
        throw new Error('browser statistic effect identity unavailable')
    }
    const pending = localEffects.filter(entry => !remoteById.has(entry.id)
        && entry.createdAt > remoteCutoff)
    for (const entry of localEffects) {
        const accepted = remoteById.get(entry.id)
        if (accepted && (accepted.delta !== entry.delta
            || accepted.createdAt !== entry.createdAt)) {
            throw new Error('browser statistic effect identity conflict')
        }
    }
    const target = remoteCount + pending.reduce((sum, entry) => sum + entry.delta, 0)
    if (!Number.isSafeInteger(target)) throw new Error('browser statistic count overflow')
    if (!merged.statics) merged.statics = {}
    merged.statics.messages = target
    merged.statics.browserMessageEffects = [...remoteEffects, ...pending]
    if (remoteCutoff > 0) merged.statics.browserMessageEffectCutoff = remoteCutoff
    else delete merged.statics.browserMessageEffectCutoff
}
