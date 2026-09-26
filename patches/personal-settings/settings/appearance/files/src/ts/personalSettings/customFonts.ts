import type { Database } from '../storage/database.svelte'
import { isRecord, rawAppearance, utf8Bytes, validPersonalId, writeAppearanceGroup } from './cssToggles'
import { readFontStream } from './fontBytes'

export const FONT_LIMITS = Object.freeze({ count: 16, name: 256, filename: 512, file: 24_000_000, total: 64_000_000, warningCount: 8, warningFile: 12_000_000, warningTotal: 32_000_000 })
export type FontFormat = 'woff2' | 'woff' | 'truetype' | 'opentype'
export interface CustomFont { id: string; name: string; assetPath: string; originalFileName: string; format: FontFormat; byteLength: number; sha256: string; [key: string]: unknown }
export interface FontsV1 { version: 1; custom?: CustomFont[]; [key: string]: unknown }
export function detectFontFormat(bytes: Uint8Array): FontFormat {
    if (bytes.byteLength < 12 || bytes.byteLength > FONT_LIMITS.file) throw new Error('폰트 크기가 허용 범위를 벗어났습니다.')
    const magic = String.fromCharCode(...bytes.subarray(0, 4))
    if (magic === 'wOF2') return 'woff2'
    if (magic === 'wOFF') return 'woff'
    if (magic === 'OTTO') return 'opentype'
    if (magic === '\x00\x01\x00\x00' || magic === 'true') return 'truetype'
    throw new Error('WOFF2·WOFF·TTF·OTF 폰트 파일이 아닙니다. 웹페이지나 CSS 링크 대신 폰트 파일을 선택하세요.')
}
export const fontExtension: Record<FontFormat, string> = { woff2: 'woff2', woff: 'woff', truetype: 'ttf', opentype: 'otf' }
export async function fontDigest(bytes: Uint8Array): Promise<string> {
    if (!globalThis.crypto?.subtle) throw new Error('폰트 무결성을 확인할 수 없습니다. HTTPS 연결 또는 최신 브라우저를 사용하세요.')
    const exact = new Uint8Array(bytes).buffer
    const digest = await crypto.subtle.digest('SHA-256', exact)
    return Array.from(new Uint8Array(digest), v => v.toString(16).padStart(2, '0')).join('')
}
export function readCustomFonts(db: Database): { valid: boolean; value: FontsV1; error?: string } {
    const raw = rawAppearance(db).fonts
    const empty: FontsV1 = { version: 1 }
    if (raw === undefined) return { valid: true, value: empty }
    const invalid = () => ({ valid: false, value: empty, error: '사용자 폰트 설정을 읽을 수 없습니다. 원본과 자산은 보존됩니다.' })
    if (!isRecord(raw) || raw.version !== 1 || (raw.custom !== undefined && !Array.isArray(raw.custom))) return invalid()
    const items = raw.custom ?? []
    if (items.length > FONT_LIMITS.count) return invalid()
    const ids = new Set<string>()
    const assets = new Map<string, CustomFont>()
    for (const item of items) {
        if (!isRecord(item) || !validPersonalId(item.id) || ids.has(item.id)
            || typeof item.name !== 'string' || !item.name.trim() || utf8Bytes(item.name) > FONT_LIMITS.name
            || typeof item.originalFileName !== 'string' || utf8Bytes(item.originalFileName) > FONT_LIMITS.filename
            || typeof item.assetPath !== 'string' || !/^assets\/[a-zA-Z0-9_-]+\.(woff2|woff|ttf|otf)$/.test(item.assetPath)
            || !Object.hasOwn(fontExtension, item.format) || !item.assetPath.endsWith('.' + fontExtension[item.format as FontFormat])
            || !Number.isSafeInteger(item.byteLength) || item.byteLength < 12 || item.byteLength > FONT_LIMITS.file
            || typeof item.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(item.sha256)) return invalid()
        ids.add(item.id)
        const previous = assets.get(item.assetPath)
        if (previous && (previous.sha256 !== item.sha256 || previous.byteLength !== item.byteLength || previous.format !== item.format)) return invalid()
        assets.set(item.assetPath, item as CustomFont)
    }
    if ([...assets.values()].reduce((sum, f) => sum + f.byteLength, 0) > FONT_LIMITS.total) return invalid()
    return { valid: true, value: raw as FontsV1 }
}
export function sanitizeFontFilename(name: string): string {
    return name.split(/[\\/]/).pop()!.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 128)
}
export function fontSourceUrl(input: string): URL {
    let url: URL
    try { url = new URL(input) } catch { throw new Error('직접 HTTPS 폰트 파일 주소를 입력하세요.') }
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('인증 정보가 없는 HTTPS 폰트 파일 주소만 사용할 수 있습니다.')
    if (/\.(css|html?)$/i.test(url.pathname)) throw new Error('스타일시트나 웹페이지 대신 직접 폰트 파일 주소를 사용하세요.')
    return url
}
export async function acquireFont(source: File | string, signal: AbortSignal, progress: (bytes: number) => void): Promise<Uint8Array> {
    if (typeof source !== 'string') {
        if (source.size > FONT_LIMITS.file) throw new Error('폰트 파일이 크기 한도를 초과했습니다.')
        const bytes = new Uint8Array(await source.arrayBuffer())
        if (signal.aborted) throw new DOMException('취소됨', 'AbortError')
        detectFontFormat(bytes)
        progress(bytes.length)
        return bytes
    }
    const url = fontSourceUrl(source)
    const controller = new AbortController()
    const abort = () => controller.abort()
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) controller.abort()
    try {
        const response = await fetch(url.href, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error' })
        if (!response.ok || !response.body) throw new Error('font-fetch')
        const bytes = await readFontStream(response.body, FONT_LIMITS.file, progress)
        detectFontFormat(bytes)
        return bytes
    } catch (error) {
        controller.abort()
        if (signal.aborted) throw new DOMException('취소됨', 'AbortError')
        if (error instanceof Error && /한도|폰트 파일이 아닙니다/.test(error.message)) throw error
        // Never expose source URL/query text or browser request error details.
        throw new Error('폰트를 내려받을 수 없습니다. CORS·네트워크·리디렉션을 확인하거나 로컬 파일을 업로드하세요.')
    } finally { signal.removeEventListener('abort', abort) }
}
export async function verifyFontBytes(font: Pick<CustomFont, 'byteLength' | 'sha256' | 'format'>, bytes: Uint8Array): Promise<void> {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength !== font.byteLength || detectFontFormat(bytes) !== font.format || await fontDigest(bytes) !== font.sha256) throw new Error('저장된 폰트의 크기·서명·무결성이 일치하지 않습니다.')
}
export function writeFontEntry(db: Database, entry: CustomFont | undefined, id: string): void {
    const read = readCustomFonts(db)
    if (!read.valid) throw new Error(read.error)
    const custom = [...(read.value.custom ?? [])]
    const index = custom.findIndex(f => f.id === id)
    if (entry) {
        if (index < 0) custom.push(entry)
        else custom[index] = { ...custom[index], ...entry }
    } else if (index >= 0) custom.splice(index, 1)
    else throw new Error('폰트 항목을 찾을 수 없습니다.')
    writeAppearanceGroup(db, 'fonts', { ...read.value, custom })
    if (!readCustomFonts(db).valid) throw new Error('폰트 개수 또는 저장 한도를 초과했습니다.')
    if (!entry && rawAppearance(db).chat?.font === `custom:${id}`) writeAppearanceGroup(db, 'chat', { ...rawAppearance(db).chat, font: 'app' })
}
