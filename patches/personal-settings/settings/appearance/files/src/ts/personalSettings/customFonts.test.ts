import { afterEach, expect, test, vi } from 'vitest'
import { acquireFont, detectFontFormat, FONT_LIMITS, fontDigest, fontSourceUrl, readCustomFonts, verifyFontBytes, writeFontEntry } from './customFonts'
import type { Database } from '../storage/database.svelte'
const bytes = (magic = 'wOF2') => new Uint8Array([...magic].map(c => c.charCodeAt(0)).concat(Array(12).fill(0)))
const entry = { id: 'font-a', name: 'Font', originalFileName: '', format: 'woff2' as const, byteLength: 16, sha256: 'a'.repeat(64), assetPath: 'assets/font-a.woff2' }
const db = (fonts?: unknown) => ({ pocketRisuPersonalSettings: { appearance: { version: 1, fonts, chat: { font: 'custom:font-a', keepKoreanWords: true } } } } as unknown as Database)
afterEach(() => vi.unstubAllGlobals())
test.each([['wOF2', 'woff2'], ['wOFF', 'woff'], ['OTTO', 'opentype'], ['\x00\x01\x00\x00', 'truetype']])('detects binary signature %s without MIME/extension trust', (magic, format) => expect(detectFontFormat(bytes(magic))).toBe(format))
test.each(['http://example.com/a.woff', 'data:font/woff;base64,a', 'https://name:password@example.com/font.woff2', 'https://example.com/fonts.css', 'not-a-url'])('rejects non-direct or credentialed URL %s', url => expect(() => fontSourceUrl(url)).toThrow())
test('deduplicates unique asset budgets and selected removal changes only metadata and font selection', () => {
    const source = db({ version: 1, future: 9, custom: [entry, { ...entry, id: 'font-b' }] })
    expect(readCustomFonts(source).valid).toBe(true)
    writeFontEntry(source, undefined, entry.id)
    expect(source.pocketRisuPersonalSettings).toMatchObject({ appearance: { fonts: { future: 9, custom: [{ id: 'font-b' }] }, chat: { font: 'app', keepKoreanWords: true } } })
})
test.each([{ version: 2, custom: [entry] }, { version: 1, custom: [entry, entry] }, { version: 1, custom: [{ ...entry, assetPath: '../font.ttf' }] }])('preserves malformed/future font metadata %j', raw => {
    const source = db(raw); const before = JSON.stringify(source)
    expect(readCustomFonts(source).valid).toBe(false)
    expect(() => writeFontEntry(source, undefined, entry.id)).toThrow()
    expect(JSON.stringify(source)).toBe(before)
})
test('verifies exact byte range, signature, size, and digest', async () => {
    const data = bytes(); const metadata = { ...entry, sha256: await fontDigest(data) }
    await expect(verifyFontBytes(metadata, data)).resolves.toBeUndefined()
    await expect(verifyFontBytes({ ...metadata, byteLength: 17 }, data)).rejects.toThrow()
    const corrupt = data.slice(); corrupt[12] = 1
    await expect(verifyFontBytes(metadata, corrupt)).rejects.toThrow()
})
test('URL streaming is credential-free, bounded without Content-Length, and hides source URL on errors', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(FONT_LIMITS.file + 1)); controller.close() } })))
    vi.stubGlobal('fetch', fetcher)
    await expect(acquireFont('https://example.com/font?private=hidden', new AbortController().signal, () => {})).rejects.toThrow('한도')
    expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error' })
    vi.stubGlobal('fetch', () => Promise.reject(new Error('https://example.com/?secret')))
    await expect(acquireFont('https://example.com/font', new AbortController().signal, () => {})).rejects.toThrow('CORS')
})
