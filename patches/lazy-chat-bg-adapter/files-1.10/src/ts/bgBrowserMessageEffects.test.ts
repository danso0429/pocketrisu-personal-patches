import { describe, expect, it, vi } from 'vitest'
import {
    mergeBrowserMessageEffects,
    recordBrowserMessageEffect,
    type BrowserMessageEffect,
} from './bgBrowserMessageEffects'
vi.mock('./storage/database.svelte', () => ({}))
vi.mock('./storage/chatStorage', () => ({ chatToStub: (chat: unknown) => chat }))
vi.mock('./globalApi.svelte', () => ({ forageStorage: { realStorage: null } }))

const { RisuSavePatcher } = await import('./storage/risuSave')

const n = { operationId: 'operation-n-1', cumulative: 1 }
const now = Date.now()
const a = { id: 'browser-a-1', delta: 1, createdAt: now }
const b = { id: 'browser-b-1', delta: 1, createdAt: now + 1 }

describe('browser message statistic effects', () => {
    it('records one direct generation attempt only once by identity', () => {
        const statics = { messages: 10, browserMessageEffects: [] as typeof a[] }
        recordBrowserMessageEffect(statics, a.id, a.createdAt)
        recordBrowserMessageEffect(statics, a.id, a.createdAt)
        expect(statics).toEqual({ messages: 11, browserMessageEffects: [a] })
    })

    it('records only one cumulative legacy result suffix by its result revision', () => {
        const statics = { messages: 10, browserMessageEffects: [] as typeof a[] }
        recordBrowserMessageEffect(statics, a.id, a.createdAt, 2)
        recordBrowserMessageEffect(statics, a.id, a.createdAt, 2)
        expect(statics).toEqual({
            messages: 12,
            browserMessageEffects: [{ ...a, delta: 2 }],
        })
    })

    it('preserves an unsaved browser +1 after N commits first', () => {
        const base = { statics: { messages: 10, browserMessageEffects: [] } }
        const local = { statics: { messages: 11, browserMessageEffects: [a] } }
        const remote = { statics: { messages: 11, browserMessageEffects: [], bgOrchestrationApplied: [n] } }
        const merged = { statics: { ...remote.statics, messages: 11, browserMessageEffects: [a] } }
        mergeBrowserMessageEffects(base, local, remote, merged)
        expect(merged.statics.messages).toBe(12)
        expect(merged.statics.browserMessageEffects).toEqual([a])
    })

    it('does not replay a browser +1 that was already saved before N', () => {
        const base = { statics: { messages: 10, browserMessageEffects: [] } }
        const local = { statics: { messages: 11, browserMessageEffects: [a] } }
        const remote = { statics: { messages: 12, browserMessageEffects: [a], bgOrchestrationApplied: [n] } }
        const merged = { statics: { ...remote.statics, messages: 11 } }
        mergeBrowserMessageEffects(base, local, remote, merged)
        expect(merged.statics.messages).toBe(12)
        expect(merged.statics.browserMessageEffects).toEqual([a])
    })

    it('adds two independent browser sessions by distinct effect IDs', () => {
        const base = { statics: { messages: 10, browserMessageEffects: [] } }
        const local = { statics: { messages: 11, browserMessageEffects: [a] } }
        const remote = { statics: { messages: 11, browserMessageEffects: [b] } }
        const merged = { statics: { messages: 11, browserMessageEffects: [a, b] } }
        mergeBrowserMessageEffects(base, local, remote, merged)
        expect(merged.statics).toEqual({ messages: 12, browserMessageEffects: [b, a] })
    })

    it('fails closed on an unowned scalar edit or missing history', () => {
        const base = { statics: { messages: 10, browserMessageEffects: [a] } }
        const local = { statics: { messages: 11, browserMessageEffects: [a] } }
        const remote = { statics: { messages: 11, browserMessageEffects: [a] } }
        expect(() => mergeBrowserMessageEffects(base, local, remote, {
            statics: { messages: 11 },
        })).toThrow('browser statistic effect identity unavailable')
        expect(() => mergeBrowserMessageEffects(base, base, {
            statics: { messages: 11, browserMessageEffects: [] },
        }, { statics: { messages: 11 } })).toThrow('browser statistic effect history unavailable')
    })

    it('accepts a compacted base history but refuses an expired unsaved effect', () => {
        const base = { statics: { messages: 10, browserMessageEffects: [a] } }
        const remote = {
            statics: {
                messages: 10,
                browserMessageEffects: [] as typeof a[],
                browserMessageEffectCutoff: a.createdAt,
            },
        }
        const merged = structuredClone(remote)
        mergeBrowserMessageEffects(base, base, remote, merged)
        expect(merged.statics).toEqual(remote.statics)

        const pendingBase = { statics: { messages: 10, browserMessageEffects: [] } }
        const local = { statics: { messages: 11, browserMessageEffects: [a] } }
        expect(() => mergeBrowserMessageEffects(pendingBase, local, remote, {
            statics: { messages: 11 },
        })).toThrow('outside the recovery window')
    })

    it('rejects a new effect older than the recovery window', () => {
        const statics = { messages: 10, browserMessageEffects: [] as typeof a[] }
        expect(() => recordBrowserMessageEffect(
            statics, 'expired-browser-1', now - 15 * 24 * 60 * 60 * 1000,
        )).toThrow('outside the recovery window')
        expect(statics.messages).toBe(10)
    })

    it('keeps the browser effect identity in the ordinary root patch payload', async () => {
        const baseline = {
            characters: [], botPresets: [], modules: [],
            statics: { messages: 10 },
        }
        const patcher = new RisuSavePatcher()
        await patcher.init(baseline)
        const local = structuredClone(baseline) as typeof baseline & {
            statics: { messages: number, browserMessageEffects?: BrowserMessageEffect[] }
        }
        recordBrowserMessageEffect(local.statics, a.id, a.createdAt)
        const { patch } = await patcher.set(local, {
            character: [], chat: [], root: true, botPreset: false,
            modules: false, plugins: false, pluginCustomStorage: false,
        })
        expect(JSON.stringify(patch)).toContain(a.id)
        expect(JSON.stringify(patch)).toContain('browserMessageEffects')
        expect(JSON.stringify(patch)).toContain('11')
    })
})
