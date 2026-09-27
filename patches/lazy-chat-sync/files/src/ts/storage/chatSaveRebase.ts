import { jsonValuesEqual } from './conflictRebase'

export function isChatMergeValue(value: any, seen = new Set<object>()): boolean {
    if (value === undefined || value === null || ['string', 'boolean'].includes(typeof value)) return true
    if (typeof value === 'number') return Number.isFinite(value)
    if (typeof value !== 'object' || seen.has(value)) return false
    if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return false
    seen.add(value)
    try { return Object.values(value).every(item => isChatMergeValue(item, seen)) }
    finally { seen.delete(value) }
}

const own = (value: any, key: string) => Object.hasOwn(value, key)
const clone = (value: any) => structuredClone(value)
const conflict = () => { throw new Error('Concurrent chat edits overlap') }

function mergeValue(base: any, local: any, remote: any): any {
    if (jsonValuesEqual(local, base)) return clone(remote)
    if (jsonValuesEqual(remote, base) || jsonValuesEqual(local, remote)) return clone(local)
    if (!base || !local || !remote || typeof base !== 'object' || typeof local !== 'object'
        || typeof remote !== 'object' || Array.isArray(base) || Array.isArray(local) || Array.isArray(remote)) return conflict()
    const result: Record<string, any> = {}
    for (const key of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])) {
        const b = own(base, key), l = own(local, key), r = own(remote, key)
        if (b && (!l || !r)) {
            if (l && !jsonValuesEqual(local[key], base[key])) conflict()
            if (r && !jsonValuesEqual(remote[key], base[key])) conflict()
            continue
        }
        let value
        if (l && r) {
            if (!b && !jsonValuesEqual(local[key], remote[key])) conflict()
            value = b ? mergeValue(base[key], local[key], remote[key]) : clone(local[key])
        }
        else if (l) value = clone(local[key])
        else if (r) value = clone(remote[key])
        else continue
        Object.defineProperty(result, key, { value, writable: true, configurable: true, enumerable: true })
    }
    return result
}

function mergeMessages(base: any[], local: any[], remote: any[]): any[] {
    if (jsonValuesEqual(local, base)) return clone(remote)
    if (jsonValuesEqual(remote, base) || jsonValuesEqual(local, remote)) return clone(local)
    for (const messages of [base, local, remote]) {
        const ids = messages.map(m => m?.chatId).filter(id => typeof id === 'string' && id.length > 0)
        if (new Set(ids).size !== ids.length) conflict()
    }
    const keyed = [base, local, remote].every(messages => {
        const ids = messages.map(m => m?.chatId)
        return ids.every(id => typeof id === 'string' && id.length > 0) && new Set(ids).size === ids.length
    })
    if (!keyed) {
        // Legacy messages without IDs can only be rebased when remote appended
        // to an otherwise exact base, and local retains length and available slot identities.
        if (local.length === base.length && remote.length > base.length
            && base.every((m, i) => jsonValuesEqual(m, remote[i]))
            && base.every((m, i) => m?.role === local[i]?.role && m?.chatId === local[i]?.chatId)) {
            return [...clone(local), ...clone(remote.slice(base.length))]
        }
        return conflict()
    }
    const baseIds = base.map(m => m.chatId)
    const baseSet = new Set(baseIds)
    const baseIndex = new Map(baseIds.map((id, index) => [id, index]))
    const maps = [base, local, remote].map(messages => new Map(messages.map(m => [m.chatId, m])))
    for (const messages of [local, remote]) {
        const ids = messages.filter(m => baseSet.has(m.chatId)).map(m => m.chatId)
        const present = new Set(ids)
        if (!jsonValuesEqual(ids, baseIds.filter(id => present.has(id)))) conflict()
    }
    const gaps = (messages: any[]) => {
        const result = new Map<number, string[]>()
        let gap = 0
        for (const message of messages) {
            if (baseSet.has(message.chatId)) gap = baseIndex.get(message.chatId)! + 1
            else {
                const ids = result.get(gap)
                if (ids) ids.push(message.chatId)
                else result.set(gap, [message.chatId])
            }
        }
        return result
    }
    const localGaps = gaps(local), remoteGaps = gaps(remote)
    const localPositions = new Map([...localGaps].flatMap(([gap, ids]) => ids.map(id => [id, gap] as const)))
    for (const [gap, ids] of remoteGaps) {
        for (const id of ids) if (localPositions.has(id) && localPositions.get(id) !== gap) conflict()
    }
    const result: any[] = [], added = new Set<string>()
    for (let gap = 0; gap <= base.length; gap++) {
        for (const id of [...(remoteGaps.get(gap) || []), ...(localGaps.get(gap) || [])]) {
            if (added.has(id)) continue
            added.add(id)
            const l = maps[1].get(id), r = maps[2].get(id)
            if (l && r && !jsonValuesEqual(l, r)) conflict()
            result.push(clone(l || r))
        }
        if (gap === base.length) break
        const original = base[gap], l = maps[1].get(original.chatId), r = maps[2].get(original.chatId)
        if (!l || !r) {
            if ((l && !jsonValuesEqual(l, original)) || (r && !jsonValuesEqual(r, original))) conflict()
        } else result.push(mergeValue(original, l, r))
    }
    return result
}

export function rebaseChatSave(base: any, local: any, remote: any): { ok: true, chat: any } | { ok: false } {
    try {
        if (![base, local, remote].every(c => c && isChatMergeValue(c) && Array.isArray(c.message))
            || typeof base.id !== 'string' || !base.id || local.id !== base.id || remote.id !== base.id) return { ok: false }
        const { message: baseMessages, ...baseFields } = base
        const { message: localMessages, ...localFields } = local
        const { message: remoteMessages, ...remoteFields } = remote
        return { ok: true, chat: { ...mergeValue(baseFields, localFields, remoteFields), message: mergeMessages(baseMessages, localMessages, remoteMessages) } }
    } catch { return { ok: false } }
}
