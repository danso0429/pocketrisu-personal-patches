import { afterEach, expect, test, vi } from 'vitest'
import { CustomFontRuntime, customFontFamily } from './customFontRuntime'
import { fontDigest } from './customFonts'
const bytes = new Uint8Array([119, 79, 70, 50, ...Array(12).fill(0)])
let owner: CustomFontRuntime | undefined
afterEach(() => { owner?.clear(); vi.restoreAllMocks() })
test('waits for load, uses only code-owned family, and deletes only owned faces', async () => {
    const add = vi.fn(); const remove = vi.fn()
    let finish!: () => void
    class Face { constructor(readonly family: string) {} async load() { await new Promise<void>(r => finish = r); return this } }
    Object.defineProperty(document, 'fonts', { configurable: true, get: () => ({ add, delete: remove }) })
    const original = window.FontFace
    Object.defineProperty(window, 'FontFace', { configurable: true, value: Face })
    try {
        owner = new CustomFontRuntime(document)
        const font = { id: 'safe-id', name: '";bad{}', originalFileName: 'bad.woff2', assetPath: 'assets/font.woff2', format: 'woff2' as const, byteLength: bytes.length, sha256: await fontDigest(bytes) }
        const pending = owner.prepare(font, bytes)
        await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
        expect(add).not.toHaveBeenCalled()
        finish(); const face = await pending
        owner.activate(font, face)
        expect(face.family).toBe(customFontFamily(font))
        expect(face.family).not.toContain('bad')
        owner.clear(); expect(remove).toHaveBeenCalledWith(face)
        expect(document.documentElement.hasAttribute('data-personal-custom-font-ready')).toBe(false)
    } finally { Object.defineProperty(window, 'FontFace', { configurable: true, value: original }) }
})
test('unsupported browsers reject custom fonts without injecting CSS font faces', async () => {
    const original = window.FontFace
    Object.defineProperty(window, 'FontFace', { configurable: true, value: undefined })
    try { owner = new CustomFontRuntime(document); await expect(owner.prepare({} as any, bytes)).rejects.toThrow('지원') }
    finally { Object.defineProperty(window, 'FontFace', { configurable: true, value: original }) }
})
test('a delayed asset read cannot register a face after teardown or Safe Mode', async () => {
    owner = new CustomFontRuntime(document)
    let release!: (bytes: Uint8Array) => void
    const read = new Promise<Uint8Array>(resolve => release = resolve)
    const prepare = vi.spyOn(owner, 'prepare')
    const load = owner.load({} as any, () => read)
    owner.clear()
    release(bytes)
    await expect(load).rejects.toThrow('취소')
    expect(prepare).not.toHaveBeenCalled()
})
test('preview teardown preserves the active font owned by another runtime', async () => {
    const faces = new Set<FontFace>()
    Object.defineProperty(document, 'fonts', { configurable: true, get: () => ({ add: (face: FontFace) => faces.add(face), delete: (face: FontFace) => faces.delete(face) }) })
    const original = window.FontFace
    class Face { constructor(readonly family: string) {} async load() { return this } }
    Object.defineProperty(window, 'FontFace', { configurable: true, value: Face })
    const preview = new CustomFontRuntime(document)
    try {
        owner = new CustomFontRuntime(document)
        const font = { id: 'active', name: 'Active', originalFileName: '', assetPath: 'assets/font.woff2', format: 'woff2' as const, byteLength: bytes.length, sha256: await fontDigest(bytes) }
        const active = await owner.prepare(font, bytes)
        owner.activate(font, active)
        const candidate = await preview.prepare({ ...font, id: 'preview' }, bytes)
        preview.clear()
        expect(faces.has(active)).toBe(true)
        expect(faces.has(candidate)).toBe(false)
        expect(document.documentElement.getAttribute('data-personal-custom-font-ready')).toBe('active')
    } finally { preview.clear(); Object.defineProperty(window, 'FontFace', { configurable: true, value: original }) }
})
