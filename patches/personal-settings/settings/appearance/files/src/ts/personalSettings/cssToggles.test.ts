import { describe, expect, test } from 'vitest'
import type { Database } from '../storage/database.svelte'
import { CSS_LIMITS, appearanceDraft, applyCssEdit, cssEditBase, cssSnapshot, effectiveCssToggles, rawAppearance, readCssToggles, sameValue, utf8Bytes } from './cssToggles'

const db = (cssToggles?: unknown) => ({ theme: '', pocketRisuPersonalSettings: { futureRoot: 2, appearance: { version: 1, enabled: true, futureAppearance: 3, cssToggles } } } as unknown as Database)
const item = (id = 'a', css = 'body { color: red; }') => ({ id, name: id, description: '', css, enabled: true })
describe('CSS editor storage and snapshot contract', () => {
    test('drafts preserve the root, plugins, and unrelated personal fields', () => {
        const source = db(); (source as any).plugins = [{ name: 'untouched' }]
        const before = JSON.stringify(source)
        const draft = appearanceDraft(source)
        applyCssEdit(draft, { kind: 'put', item: item(), shipped: false }, false)
        expect(JSON.stringify(source)).toBe(before)
        expect(draft.pocketRisuPersonalSettings).toMatchObject({ futureRoot: 2, appearance: { futureAppearance: 3 } })
        expect((draft as any).plugins).toBeUndefined()
    })
    test('first enable changes activation tokens and exact style sequence', () => {
        const source = db()
        const shipped = effectiveCssToggles(source)[0]
        applyCssEdit(source, { kind: 'put', item: { ...shipped, enabled: true }, shipped: true }, false)
        const snapshot = cssSnapshot(source, false)
        expect(snapshot.tokens).toContain('chat-align-center')
        expect(snapshot.nodes[0].key).toBe('shipped:chat.alignment')
        expect(snapshot.nodes[0].css).toBe(shipped.css)
    })
    test('overrides contain only changed fields and reset adopts current defaults', () => {
        const source = db(); const shipped = effectiveCssToggles(source)[0]
        applyCssEdit(source, { kind: 'put', item: { ...shipped, name: 'renamed', enabled: true }, shipped: true }, false)
        expect(rawAppearance(source).cssToggles.overrides[shipped.id]).toEqual({ baseRevision: 1, name: 'renamed' })
        applyCssEdit(source, { kind: 'reset', id: shipped.id }, false)
        expect(rawAppearance(source).cssToggles.overrides).toEqual({})
        expect(effectiveCssToggles(source)[0]).toMatchObject({ name: shipped.name, enabled: true })
    })
    test('custom CRUD and reordering retain stable identity and unknown fields', () => {
        const source = db({ version: 1, future: 1, custom: [{ ...item('a'), futureItem: 7 }, item('b')] })
        const edit = { kind: 'put', item: { ...item('a'), name: 'changed' }, shipped: false } as const
        const base = cssEditBase(source, edit)
        applyCssEdit(source, { kind: 'move', id: 'a', direction: 1 }, false)
        expect(sameValue(base, cssEditBase(source, edit))).toBe(false)
        applyCssEdit(source, edit, false)
        expect(readCssToggles(source).value.custom?.[1]).toMatchObject({ id: 'a', name: 'changed', futureItem: 7 })
        applyCssEdit(source, { kind: 'delete', id: 'b' }, false)
        expect(readCssToggles(source).value.custom?.map(i => i.id)).toEqual(['a'])
        expect(readCssToggles(source).value.future).toBe(1)
    })
    test.each([null, { version: 2, custom: [item()] }, { version: 1, custom: [item(), item()] }, { version: 1, overrides: { unknown: { baseRevision: 1 } } }, { version: 1, custom: [{ ...item(), enabled: 'yes' }] }])('preserves malformed/future subsection %j', raw => {
        const source = db(raw); const before = JSON.stringify(source)
        expect(readCssToggles(source).valid).toBe(false)
        expect(() => applyCssEdit(source, { kind: 'put', item: item(), shipped: false }, false)).toThrow()
        expect(JSON.stringify(source)).toBe(before)
        applyCssEdit(source, { kind: 'reset-group' }, true)
        expect(rawAppearance(source).cssToggles).toBeUndefined()
        expect(rawAppearance(source).futureAppearance).toBe(3)
    })
    test('UTF-8 limits count inactive stored rules and metadata', () => {
        expect(utf8Bytes('한')).toBe(3)
        expect(readCssToggles(db({ version: 1, custom: [{ ...item(), name: '한'.repeat(CSS_LIMITS.name), enabled: false }] })).valid).toBe(false)
        expect(readCssToggles(db({ version: 1, custom: [item('a', 'x'.repeat(CSS_LIMITS.item + 1))] })).valid).toBe(false)
        expect(readCssToggles(db({ version: 1, custom: Array.from({ length: 11 }, (_, i) => ({ ...item(String(i), 'x'.repeat(100_000)), enabled: false })) })).valid).toBe(false)
    })
    test('draft bases do not alias an override mutated in place by another writer', () => {
        const source = db({ version: 1, overrides: { 'chat.alignment': { baseRevision: 1, css: 'p{}' } } })
        const edit = { kind: 'reset', id: 'chat.alignment' } as const
        const base = cssEditBase(source, edit)
        rawAppearance(source).cssToggles.overrides['chat.alignment'].baseRevision = 2
        expect(sameValue(base, cssEditBase(source, edit))).toBe(false)
    })
    test('suppressed repairs must remain disabled and require revalidation', () => {
        const source = db({ version: 1, custom: [item()] })
        expect(() => applyCssEdit(appearanceDraft(source), { kind: 'put', item: item('a', 'body{display:none}'), shipped: false }, true)).toThrow()
        applyCssEdit(source, { kind: 'put', item: { ...item(), enabled: false }, shipped: false }, true)
        expect(readCssToggles(source).value.needsValidation).toBe(true)
        expect(() => applyCssEdit(source, { kind: 'move', id: 'a', direction: 1 }, true)).toThrow()
    })
    test.each([{ safe: true }, { theme: 'other' }, { master: false }])('global gates suppress styles %j', gates => {
        const source = db({ version: 1, custom: [item()] })
        if ('theme' in gates) source.theme = gates.theme as any
        if ('master' in gates) rawAppearance(source).enabled = gates.master
        expect(cssSnapshot(source, !!gates.safe).nodes).toEqual([])
    })
})
