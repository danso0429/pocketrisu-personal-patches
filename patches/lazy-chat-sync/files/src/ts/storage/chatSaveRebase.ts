import { jsonValuesEqual } from './conflictRebase'
import { Sha256 } from '@aws-crypto/sha256-js'

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

/** Snapshot plain chat data synchronously, including reactive proxies and undefined. */
export function snapshotChatView(value: any): any {
    if (!isChatMergeValue(value)) throw new Error('Unsupported chat view')
    const copy = (item: any): any => {
        if (item === null || typeof item !== 'object') return item
        if (Array.isArray(item)) return item.map(copy)
        return Object.fromEntries(Object.entries(item).map(([key, child]) => [key, copy(child)]))
    }
    return copy(value)
}

/** Apply an already validated merge without replacing retained message references. */
export function publishChatView(target: any, next: any): void {
    // Reject immutable/plugin accessor objects before changing any part of the
    // view. Ordinary objects and Svelte state proxies expose writable data.
    const mutable = (value: any, incoming: any, seen = new Set<object>()): void => {
        if (jsonValuesEqual(value, incoming) || !value || !incoming || typeof value !== 'object'
            || typeof incoming !== 'object' || Array.isArray(value) !== Array.isArray(incoming) || seen.has(value)) return
        seen.add(value)
        if (!Object.isExtensible(value)) throw new Error('Chat view is not mutable')
        if (Array.isArray(value) && !Object.getOwnPropertyDescriptor(value, 'length')?.writable) throw new Error('Chat view is not mutable')
        for (const key of Object.keys(value)) {
            if (own(incoming, key) && jsonValuesEqual(value[key], incoming[key])) continue
            const descriptor = Object.getOwnPropertyDescriptor(value, key)
            if (!descriptor || !('value' in descriptor) || !descriptor.writable || !descriptor.configurable) {
                throw new Error('Chat view is not mutable')
            }
            mutable(value[key], incoming[key], seen)
        }
    }
    if (jsonValuesEqual(target, next)) return
    mutable(target, next)
    const apply = (current: any, incoming: any): any => {
        if (jsonValuesEqual(current, incoming)) return current
        if (!current || !incoming || typeof current !== 'object' || typeof incoming !== 'object'
            || Array.isArray(current) !== Array.isArray(incoming)) return clone(incoming)
        if (Array.isArray(current)) {
            const uniqueIds = (items: any[]) => items.every(item => typeof item?.chatId === 'string' && item.chatId.length > 0)
                && new Set(items.map(item => item.chatId)).size === items.length
            const keyed = uniqueIds(current) && uniqueIds(incoming)
            const byId = keyed ? new Map(current.map(item => [item.chatId, item])) : null
            const values = incoming.map((item: any, index: number) => apply(byId ? byId.get(item.chatId) : current[index], item))
            // Avoid spreading a potentially large message array into a call.
            for (let index = 0; index < values.length; index++) {
                if (!Object.is(current[index], values[index])) current[index] = values[index]
            }
            if (current.length !== values.length) current.length = values.length
            return current
        }
        for (const key of Object.keys(current)) if (!own(incoming, key)) delete current[key]
        for (const key of Object.keys(incoming)) {
            if (own(current, key) && jsonValuesEqual(current[key], incoming[key])) continue
            const value = apply(own(current, key) ? current[key] : undefined, incoming[key])
            if (key === '__proto__') Object.defineProperty(current, key, { value, writable: true, configurable: true, enumerable: true })
            else current[key] = value
        }
        return current
    }
    apply(target, next)
}

// Only derived, short-lived trigger objects own these bases. The live chat is
// never registered, and WeakMap does not keep completed trigger drafts alive.
const derivedChatBases = new WeakMap<object, any>()

export class ChatViewConflictError extends Error {
    notified = false
    constructor() {
        super('Chat changed while the trigger was running; its result was not applied')
        this.name = 'ChatViewConflictError'
    }
}

export function pickChatFields(chat: any, fields: readonly string[]): any {
    const selected: any = { id: chat.id, message: [] }
    for (const field of fields) {
        if (own(chat, field)) Object.defineProperty(selected, field, { value: chat[field], enumerable: true, writable: true, configurable: true })
    }
    return selected
}

export function trackDerivedChat(chat: any, source: any): void {
    const base = derivedChatBases.get(source) ?? source
    if (chat && typeof chat === 'object' && chat !== source) {
        if (isChatMergeValue(base)) derivedChatBases.set(chat, snapshotChatView(base))
    }
}

export function mergeDerivedChat(chat: any, live: any, fields?: readonly string[]): any {
    const base = derivedChatBases.get(chat)
    if (!base || chat === live) return chat
    try {
        const select = (value: any) => fields ? pickChatFields(value, fields) : value
        const result = rebaseChatSave(select(base), snapshotChatView(select(chat)), snapshotChatView(select(live)))
        if (!result.ok) throw new ChatViewConflictError()
        if (!fields) return result.chat
        const merged = { ...chat }
        for (const field of fields) {
            if (own(result.chat, field)) Object.defineProperty(merged, field, { value: result.chat[field], enumerable: true, writable: true, configurable: true })
            else delete merged[field]
        }
        return merged
    } catch { throw new ChatViewConflictError() }
}

export function acknowledgeDerivedFields(chat: any, fields = ['message']): void {
    const base = derivedChatBases.get(chat)
    if (!base) return
    const next = { ...base }
    for (const field of fields) {
        if (own(chat, field)) Object.defineProperty(next, field, { value: snapshotChatView(chat[field]), enumerable: true, writable: true, configurable: true })
        else delete next[field]
    }
    derivedChatBases.set(chat, next)
}

/** Input scripts can already have published an intermediate message version. */
export function rebaseChatInput(base: any, messages: any[], live: any, triggerChat?: any, draftId?: string): ReturnType<typeof rebaseChatSave> {
    try {
        const applied = triggerChat ? derivedChatBases.get(triggerChat) : undefined
        // A new character can receive its persistent chat ID during the
        // existing durable-save step. The caller verifies object identity for
        // that case; use the input draft ID only inside this pure comparison.
        const hasId = typeof base.id === 'string' && base.id.trim().length > 0
        const identify = (chat: any) => hasId ? chat : { ...chat, id: draftId }
        const result = rebaseChatSave(
            identify(pickChatFields(applied ?? base, ['message'])),
            { id: hasId ? base.id : draftId, message: messages },
            identify(snapshotChatView(pickChatFields(live, ['message']))),
        )
        if (result.ok) result.chat.id = live.id ?? base.id
        return result
    } catch { return { ok: false } }
}

/** A bounded receipt for an acknowledged view, independent of object key order. */
export function chatViewFingerprint(chat: any): string {
    if (!isChatMergeValue(chat)) throw new Error('Unsupported chat view')
    const hash = new Sha256()
    const visit = (value: any): void => {
        if (value === undefined) { hash.update('u;'); return }
        if (value === null) { hash.update('n;'); return }
        if (Object.is(value, -0)) { hash.update('number:-0;'); return }
        if (typeof value !== 'object') { hash.update(`${typeof value}:${JSON.stringify(value)};`); return }
        if (Array.isArray(value)) {
            hash.update(`a${value.length}:[`)
            for (const item of value) visit(item)
        } else {
            hash.update('o{')
            for (const key of Object.keys(value).sort()) {
                hash.update(JSON.stringify(key) + ':')
                visit(value[key])
            }
        }
        hash.update('};')
    }
    visit(chat)
    return Array.from(hash.digestSync(), byte => byte.toString(16).padStart(2, '0')).join('')
}

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
